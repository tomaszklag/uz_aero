/**
 * UZ Aero - adapter czujników, który nie ma czujników.
 *
 * Po co osobna klasa zamiast `null` w composition roocie: reszta kodu ma nie wiedzieć,
 * czy telefon ma barometr. Ścieżka „brak czujnika" jest normalna, nie awaryjna -
 * barometru nie mają tańsze Androidy i nigdy nie będą, a UZ Aero musi na nich działać
 * dokładnie tak samo. Obiekt, który milczy, jest uczciwszy niż `if` rozsiany po
 * wywołaniach.
 *
 * Używany też w testach i przy odtwarzaniu tras, gdzie czujników fizycznie nie ma.
 */

import type { SensorAvailability, SensorListener, SensorPort } from '../../application/ports';

export class NullSensorAdapter implements SensorPort {
  async available(): Promise<SensorAvailability> {
    return { barometer: false, accelerometer: false, gyroscope: false };
  }

  async start(_listener: SensorListener): Promise<() => void> {
    return () => {};
  }
}
