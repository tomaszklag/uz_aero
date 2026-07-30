/**
 * UZ Aero — adapter czujników na `expo-sensors`.
 *
 * Jedyne miejsce w kodzie, które wie o `expo-sensors`. Robi trzy rzeczy i ani jednej
 * więcej: przelicza jednostki platformy na jednostki domeny, spina trzy niezależne
 * strumienie w jedno okno czasu i oddaje AGREGAT. Cała matematyka (usunięcie grawitacji,
 * moduły, wariancja) mieszka w `domain/detection/imu.ts` i jest testowana w Node.
 *
 * JEDNOSTKI — źródło realnych pomyłek:
 *   • `Accelerometer` oddaje wielokrotności g, NIE m/s² (na obu platformach);
 *   • `Gyroscope` oddaje rad/s, a my myślimy w °/s;
 *   • `Barometer` oddaje hPa, czyli to, czego chcemy, bez przeliczania.
 *
 * UWAGA: modułu natywnego nie wolno wciągać do barrela infrastruktury — importuj wprost.
 */

import { Accelerometer, Barometer, Gyroscope } from 'expo-sensors';

import {
  IMU_AGGREGATE_SEC,
  IMU_SAMPLE_HZ,
  createImuAccumulator,
  drainImu,
  pushImuSample,
  type ImuAccumulator,
  type Vec3,
} from '../../domain';
import type {
  SensorAvailability,
  SensorListener,
  SensorPort,
  SensorSample,
} from '../../application/ports';

const G_TO_MPS2 = 9.806_65;
const RAD_TO_DEG = 180 / Math.PI;

/** Odstęp próbek inercyjnych (ms) — 50 Hz pokrywa pasmo dudnienia kół 1–20 Hz. */
const IMU_INTERVAL_MS = Math.round(1000 / IMU_SAMPLE_HZ);

/**
 * Odstęp odczytów barometru (ms). Rzadziej niż IMU z premedytacją: ciśnienie zmienia się
 * wolno, a czujnik jest dokładny — 5 Hz to już nadmiar wobec zjawiska, które mierzymy.
 */
const BARO_INTERVAL_MS = 200;

export class ExpoSensorsAdapter implements SensorPort {
  /**
   * Zwykły `Set`, a nie `GpsFanout`: ten strumień ma jednego odbiorcę (rejestrator
   * śladu), a uogólnianie rozgałęźnika na dwa typy zdarzeń dodałoby abstrakcję,
   * której nikt jeszcze nie potrzebuje. Kontrakt „każdy start to własna subskrypcja"
   * zachowany, bo tego wymaga port.
   */
  private readonly listeners = new Set<SensorListener>();

  private subscriptions: { remove(): void }[] = [];
  private accumulator: ImuAccumulator = createImuAccumulator();
  private lastGyroDps: Vec3 | null = null;
  private lastPressureHpa: number | null = null;
  private lastSampleMs: number | null = null;
  private windowTimer: ReturnType<typeof setInterval> | null = null;

  async available(): Promise<SensorAvailability> {
    // Każde zapytanie osobno w try/catch: brak jednego czujnika nie może przesłonić
    // informacji o pozostałych, a na części urządzeń zapytanie potrafi rzucić.
    const [barometer, accelerometer, gyroscope] = await Promise.all([
      this.isAvailable(Barometer),
      this.isAvailable(Accelerometer),
      this.isAvailable(Gyroscope),
    ]);
    return { barometer, accelerometer, gyroscope };
  }

  async start(listener: SensorListener): Promise<() => void> {
    this.listeners.add(listener);
    if (this.subscriptions.length === 0) await this.open();
    return () => this.release(listener);
  }

  private async isAvailable(sensor: { isAvailableAsync(): Promise<boolean> }): Promise<boolean> {
    try {
      return await sensor.isAvailableAsync();
    } catch {
      return false;
    }
  }

  private async open(): Promise<void> {
    const { barometer, accelerometer, gyroscope } = await this.available();

    if (accelerometer) {
      Accelerometer.setUpdateInterval(IMU_INTERVAL_MS);
      this.subscriptions.push(
        Accelerometer.addListener(({ x, y, z }) => {
          const now = Date.now();
          // Odstęp MIERZONY, nie nominalny: system dostarcza próbki nierównomiernie,
          // a filtr grawitacji o stałej czasowej 30 s jest na to wyczulony.
          const dtSec =
            this.lastSampleMs == null ? 1 / IMU_SAMPLE_HZ : (now - this.lastSampleMs) / 1000;
          this.lastSampleMs = now;

          const accelMps2: Vec3 = { x: x * G_TO_MPS2, y: y * G_TO_MPS2, z: z * G_TO_MPS2 };
          this.accumulator = pushImuSample(
            this.accumulator,
            accelMps2,
            this.lastGyroDps,
            dtSec,
          );
        }),
      );
    }

    if (gyroscope) {
      Gyroscope.setUpdateInterval(IMU_INTERVAL_MS);
      this.subscriptions.push(
        Gyroscope.addListener(({ x, y, z }) => {
          // Żyroskop tylko ODKŁADA ostatnią wartość; okno napędza akcelerometr. Dwa
          // niezależne strumienie o tej samej częstotliwości nie są zsynchronizowane,
          // a agregat sekundowy i tak nie odczuje przesunięcia o jedną próbkę.
          this.lastGyroDps = { x: x * RAD_TO_DEG, y: y * RAD_TO_DEG, z: z * RAD_TO_DEG };
        }),
      );
    }

    if (barometer) {
      Barometer.setUpdateInterval(BARO_INTERVAL_MS);
      this.subscriptions.push(
        Barometer.addListener(({ pressure }) => {
          this.lastPressureHpa = pressure;
        }),
      );
    }

    // Okno zamyka zegar, nie licznik próbek: gdy czujnik zamilknie, chcemy wiedzieć,
    // że okno było puste (`imu: null`), a nie czekać w nieskończoność na komplet.
    this.windowTimer = setInterval(() => this.closeWindow(), IMU_AGGREGATE_SEC * 1000);
  }

  private closeWindow(): void {
    const { aggregate, next } = drainImu(this.accumulator);
    this.accumulator = next;

    // Okno bez ANI JEDNEGO pomiaru pomijamy — puste wiersze w śladzie tylko rozcieńczają
    // materiał. Brak ciśnienia przy obecnym IMU (i odwrotnie) już warto zapisać.
    if (aggregate == null && this.lastPressureHpa == null) return;

    const sample: SensorSample = {
      time: Date.now(),
      pressureHpa: this.lastPressureHpa,
      imu: aggregate,
    };
    for (const listener of [...this.listeners]) listener(sample);
  }

  private release(listener: SensorListener): void {
    this.listeners.delete(listener);
    if (this.listeners.size > 0) return;

    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
    if (this.windowTimer != null) clearInterval(this.windowTimer);
    this.windowTimer = null;
    this.accumulator = createImuAccumulator();
    this.lastGyroDps = null;
    this.lastPressureHpa = null;
    this.lastSampleMs = null;
  }
}
