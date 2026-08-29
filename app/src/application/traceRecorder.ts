/**
 * UZ Aero - rejestrator śladu kalibracyjnego (faza 5).
 *
 * ZAWSZE WŁĄCZONY przy pracującym silniku (decyzja 2026-07-29): anomalia z definicji
 * jest nieplanowana - przełącznik gwarantowałby, że najciekawszy lot będzie
 * niezapisany. Koszt: ~30 tys. wierszy/dzień ≈ 3 MB, bateria zero (subskrypcja GPS
 * i tak działa dla detekcji).
 *
 * Zapis jest fire-and-forget i NIE MOŻE przeszkodzić lotowi: każdy błąd magazynu
 * jest połykany - ślad to materiał badawczy, nie rejestr. Retencję (`purge`) woła
 * composition root przy starcie.
 *
 * ══ ŚLAD NIE MIESZKA JUŻ NA TELEFONIE (issue #47) ══
 * Nagranie jest odtąd PRZESYŁKĄ, nie zbiorem: `TraceSync` wysyła je paczkami i zaraz
 * po potwierdzeniu kasuje (`purgeUploadedTrace`). Ekran śladu pobiera geometrię
 * z serwera, więc telefon nie ma powodu trzymać drugiej kopii dziesiątek tysięcy
 * wierszy. Rejestrator się przez to NIE ZMIENIA - nagrywa tak samo - zmienia się
 * tylko to, jak długo zapis leży, zanim odjedzie.
 */

import type { GpsFix } from '../domain';
import type { ClockPort, SensorSample, TracePort } from './ports';

/**
 * SUFIT dla wpisów, których nie udało się wysłać (dni).
 *
 * Do issue #47 była to główna reguła życia śladu: „ślad znika po 14 dniach" mówił też
 * ekran 14, bo po tylu dniach nie miał już czego rysować. Dziś nagranie znika zaraz po
 * wysyłce, a ten próg dotyczy WYŁĄCZNIE tego, co nie odjechało - telefon całymi
 * tygodniami bez zasięgu. Bez sufitu taka pamięć rosłaby bez końca.
 */
export const TRACE_RETENTION_DAYS = 14;

export class TraceRecorder {
  constructor(
    private readonly store: TracePort,
    private readonly clock: ClockPort,
  ) {}

  /** Surowy fix - SPRZED kwarantanny jakości (śmieci to najcenniejszy materiał). */
  fix(fix: GpsFix, sessionUuid: string | null): void {
    void this.store
      .appendTrace({
        sessionUuid,
        kind: 'fix',
        time: fix.time,
        deviceTime: this.clock.now(),
        gs: fix.groundSpeedKt,
        alt: fix.altitudeFt,
        // Kurs jest wejściem weta zakrętu przy lądowaniu, więc replay MUSI go widzieć -
        // bez niego nagranie nie odtworzyłoby decyzji, którą podjął telefon.
        trackDeg: fix.trackDeg ?? null,
        lat: fix.lat ?? null,
        lon: fix.lon ?? null,
        accuracyM: fix.accuracyM ?? null,
        detail: null,
      })
      .catch(() => {});
  }

  /**
   * Agregat czujników pokładowych (barometr + inercja) - JEDEN wiersz na okno sekundowe.
   *
   * Ten kanał NIE bierze udziału w detekcji i to jest decyzja, nie zapomnienie: progi
   * dla barometru i akcelerometru mają wyjść z realnych nagrań w fazie 5, a nie z liczb
   * wymyślonych przy biurku. Dokładanie zgadywanych progów do algorytmu, który właśnie
   * przestał zgadywać, byłoby krokiem w tył. Najpierw materiał, potem decyzje.
   *
   * Surowy strumień (50 Hz ≈ milion próbek na dzień lotny) NIE jest zapisywany nigdzie -
   * agregat sekundowy jest tego samego rzędu wielkości co ślad GPS i do strojenia progów
   * wystarcza (średnia, maksimum, miara wibracji).
   */
  sensor(sample: SensorSample, sessionUuid: string | null): void {
    void this.store
      .appendTrace({
        sessionUuid,
        kind: 'sensor',
        // Czujniki nie mają własnego zegara - `time` i `deviceTime` są tu tym samym
        // odczytem i tak ma być. Udawanie czasu GPS zamazałoby informację o dryfie,
        // którą para zegarów przy fixach właśnie pozwala policzyć.
        time: sample.time,
        deviceTime: this.clock.now(),
        gs: null,
        alt: null,
        lat: null,
        lon: null,
        accuracyM: null,
        detail: null,
        pressureHpa: sample.pressureHpa,
        accelMean: sample.imu?.accelMeanMps2 ?? null,
        accelMax: sample.imu?.accelMaxMps2 ?? null,
        vibrationRms: sample.imu?.vibrationRmsMps2 ?? null,
        gyroMean: sample.imu?.gyroMeanDps ?? null,
        gyroMax: sample.imu?.gyroMaxDps ?? null,
        imuSamples: sample.imu?.samples ?? null,
      })
      .catch(() => {});
  }

  /**
   * Marker pracy detektora: `detection` (toast pokazany) i `undo` (COFNIJ).
   * Para „detection bez commitu w rejestrze" + `undo` = fałszywa detekcja
   * oznaczona przez pilota - sedno materiału kalibracyjnego.
   */
  marker(kind: 'detection' | 'undo', detail: string, at: number, sessionUuid: string | null): void {
    void this.store
      .appendTrace({
        sessionUuid,
        kind,
        time: at,
        deviceTime: this.clock.now(),
        gs: null,
        alt: null,
        lat: null,
        lon: null,
        accuracyM: null,
        detail,
      })
      .catch(() => {});
  }

  /** Retencja przy starcie aplikacji. */
  purgeExpired(): Promise<number> {
    return this.store.purgeTraceOlderThan(this.clock.now() - TRACE_RETENTION_DAYS * 86_400_000);
  }

  stats() {
    return this.store.traceStats();
  }
}
