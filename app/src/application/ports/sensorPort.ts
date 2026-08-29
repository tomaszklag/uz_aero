/**
 * UZ Aero - PORT czujników pokładowych telefonu (barometr, akcelerometr, żyroskop).
 *
 * Osobny port obok `GpsPort`, bo to inne źródło o innych właściwościach: nie ma własnego
 * zegara (stempluje zegar urządzenia, nie GPS), bywa fizycznie NIEOBECNY (barometru nie
 * mają tańsze Androidy) i próbkuje dziesiątki razy na sekundę, a nie raz.
 *
 * KONTRAKT: port oddaje AGREGATY SEKUNDOWE, nie surowe próbki. Surowy strumień 50 Hz to
 * około miliona próbek na dzień lotny - nie do zapisania obok śladu GPS (~30 tys. wierszy)
 * i niepotrzebny: do strojenia progów wystarczają średnia, maksimum i miara wibracji
 * w oknie. Uśrednianie robi adapter, bo tylko on widzi surowy strumień; matematyka
 * (usunięcie grawitacji, moduły, wariancja) mieszka w domenie - `detection/imu.ts`.
 *
 * ZAKRES OBECNY: te dane trafiają WYŁĄCZNIE do śladu kalibracyjnego. Detekcja ich nie
 * czyta. Wpięcie do automatu nastąpi po fazie 5, na progach wyliczonych z nagrań -
 * dokładanie zgadywanych progów do algorytmu, który właśnie przestał zgadywać, byłoby
 * krokiem w tył.
 */

import type { EpochMillis, ImuAggregate } from '../../domain';

/** Co telefon fizycznie ma. Brak czujnika to normalny stan, nie awaria. */
export interface SensorAvailability {
  barometer: boolean;
  accelerometer: boolean;
  gyroscope: boolean;
}

/** Jedna próbka wyjściowa portu = jedno okno agregacji. */
export interface SensorSample {
  /**
   * Zegar URZĄDZENIA (czujniki nie mają własnego). Świadomie nie udajemy, że to czas
   * GPS - przy analizie śladu para zegarów pozwala policzyć dryf, a udawanie jednego
   * zegara zamazałoby informację, której nie da się odzyskać.
   */
  time: EpochMillis;
  /** Ciśnienie statyczne (hPa); null gdy telefon nie ma barometru. */
  pressureHpa: number | null;
  /** Agregat inercyjny; null gdy w oknie nie było ani jednej próbki. */
  imu: ImuAggregate | null;
}

export type SensorListener = (sample: SensorSample) => void;

export interface SensorPort {
  /** Czy poszczególne czujniki są dostępne (do wiersza diagnostyki na ekranie 13). */
  available(): Promise<SensorAvailability>;

  /**
   * Rozpoczyna nasłuch. Zwraca funkcję zatrzymującą - wołający odpowiada za sprzątanie.
   * Kontrakt jak w `GpsPort`: każde wywołanie to osobna subskrypcja tego odbiorcy.
   */
  start(listener: SensorListener): Promise<() => void>;
}
