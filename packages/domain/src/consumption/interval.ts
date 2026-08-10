/**
 * UZ Aero — typy analityki zużycia: interwał paliwowy i równanie motogodzin.
 *
 * PO CO TO ISTNIEJE: przepływomierza w samolocie nie ma, więc zużycia „w locie"
 * ani „na ziemi" nikt nigdy nie zmierzył. Zmierzone są wyłącznie **odczyty
 * paliwomierza** — na preflightcie, przed i po każdym tankowaniu, na koniec dnia.
 * Między dwoma kolejnymi odczytami zużycie jest znane DOKŁADNIE (z dokładnością
 * przyrządu), a czas pracy silnika w tym samym oknie znamy co do sekundy z rejestru
 * zdarzeń. To jest cała podstawa: każdy taki odcinek daje jedno RÓWNANIE, a stawki
 * per faza wyznacza dopiero regresja po wielu odcinkach (`model.ts`).
 *
 * DLACZEGO INTERWAŁ, A NIE DZIEŃ: dzień z tankowaniem w środku niesie dwa różne
 * profile lotu rozdzielone dolewką, a zsumowany do jednej liczby traci tę informację.
 * Interwał jest najmniejszą jednostką, dla której zużycie jest FAKTEM, a nie wnioskiem.
 *
 * ZAWSZE W OBRĘBIE JEDNEJ SESJI. Paliwo zużyte między dniami — przez kogoś innego,
 * bez aplikacji — nie należy do żadnego interwału i nie ma prawa wejść do regresji.
 * Ciągłości między dniami pilnują flagi `fuel_mismatch` i `mh_gap` (§4.5), i to jest
 * ich zadanie, nie nasze. Ktoś, kto zechce tu „domknąć dziurę", zamieni fakt w domysł.
 */

import type { EpochMillis } from '../time';

/**
 * Skąd pochodzi odczyt na granicy interwału.
 *
 * Trzy rodzaje, bo trzy różne zdarzenia niosą odczyt paliwomierza: `preflight_confirm`
 * (start dnia), `refuel` (para `beforeL`/`afterL` — jeden odczyt zamyka interwał,
 * drugi otwiera następny) i `day_close` (przekazanie).
 */
/**
 * Rodzaj granicy interwału paliwowego.
 *
 *  doszedł 2026-08-07 (etap B4): odczyt przy zamknięciu wzlotu jest
 * OPCJONALNY (§3.6), ale gdy pilot go zrobi, jest pełnoprawnym odczytem paliwomierza
 * — §4.1 pkt 5 stawia licznik fizyczny nad rachubą. Dzieli więc sesję na krótsze
 * interwały dokładnie tak samo jak tankowanie, z tą różnicą, że nic nie dolewa.
 */
export type FuelBoundKind = 'preflight' | 'refuel' | 'day_close';

/**
 * Powód, dla którego interwał nie wchodzi do regresji. `null` = interwał policzony.
 *
 * Wzorzec `TrackPoint.rejected`: odrzucony wiersz ZOSTAJE w wyniku i jest widoczny
 * na ekranie z powodem (mockup A10a — kolumna „Stan"). Interwał, który nie zgadza się
 * z modelem, jest materiałem do wyjaśnienia przy dniu, a nie szumem do ukrycia.
 */
export type IntervalRejection =
  /** Paliwa PRZYBYŁO bez tankowania — błąd odczytu albo dolewka poza aplikacją. */
  | 'negative-consumption'
  /** Silnik pracował krócej niż `MIN_INTERVAL_ENGINE_MS` — błąd przyrządu przeważa nad sygnałem. */
  | 'engine-too-short'
  /**
   * Silnik „pracował" dłużej niż `MAX_INTERVAL_ENGINE_MS` — czyli dłużej niż jakikolwiek
   * realny dzień lotny. Znaczy to zapomniane `engine_stop`, a nie lot; mianownik jest
   * wtedy fikcją i stawka z niego też.
   */
  | 'engine-too-long'
  /** Silnik nie pracował wcale: dwa odczyty przy wyłączonym silniku nie mierzą zużycia. */
  | 'no-engine'
  /** Reszta ponad `OUTLIER_SIGMA` — wykluczony PO dopasowaniu modelu (`model.ts`). */
  | 'outlier';

/**
 * Odcinek między dwoma odczytami paliwomierza — jedno równanie regresji.
 *
 * Czasy faz są ROZŁĄCZNE i sumują się do `engineMs`: `groundMs` to czas z pracującym
 * silnikiem poza lotem (kołowanie, załadunek, oczekiwanie), `flightMs` to czas między
 * startem a lądowaniem. Rozbicie lotu na wznoszenie/przelot/zniżanie wymaga śladu GPS
 * i dlatego jest `| null` — brak śladu to niewiedza, nie zero (ten sam kontrakt, co
 * w całej domenie). Interwał bez śladu wchodzi do modelu dwufazowego; NIE dopisujemy
 * mu podziału „średnimi proporcjami", bo to byłoby fabrykowanie danych.
 */
export interface FuelInterval {
  sessionUuid: string;
  aircraftId: string;
  /** Duty start sesji — oś grupowania miesięcznego w trendzie. `null` = dzień bez preflightu. */
  dayStart: EpochMillis | null;

  startAt: EpochMillis;
  endAt: EpochMillis;
  startKind: FuelBoundKind;
  endKind: FuelBoundKind;
  /**
   * Uuid zdarzeń wyznaczających granice — adres celu korekty (ten sam powód, co
   * `Flight.takeoffUuid`): wiersz tabeli ma prowadzić do zdarzenia, które go zrodziło,
   * a nie tylko mówić, o której to było.
   */
  startUuid: string;
  endUuid: string;

  startReadingL: number;
  endReadingL: number;
  /**
   * Zużycie = odczyt początkowy − końcowy. Bez składnika dolewki, bo dolewka JEST
   * granicą: `refuel.beforeL` zamyka interwał, `refuel.afterL` otwiera następny.
   */
  consumedL: number;

  /** Czas pracy silnika w oknie (ms) — mianownik wszystkich stawek. */
  engineMs: number;
  /** Czas między startem a lądowaniem w oknie (ms). */
  flightMs: number;
  /** `engineMs − flightMs`, nigdy ujemny — silnik pracujący poza lotem. */
  groundMs: number;

  /** Rozbicie lotu ze śladu GPS; `null` = ślad niedostępny dla tego interwału. */
  climbMs: number | null;
  cruiseMs: number | null;
  descentMs: number | null;

  /** Liczba wzlotów zamkniętych w oknie — mianownik metryki „paliwo na lot". */
  flightCount: number;

  /** `null` = interwał wchodzi do regresji; wartość = powód pominięcia. */
  rejected: IntervalRejection | null;
}

/**
 * Równanie motogodzin dla JEDNEGO zamkniętego dnia: `ΔMH = k_lot·t_lot + k_ziemia·t_ziemia`.
 *
 * DLACZEGO JEDNO NA DZIEŃ, A NIE NA INTERWAŁ: licznik motogodzin odczytujemy dokładnie
 * dwa razy — na preflightcie i przy zamknięciu dnia. Gęstszych odczytów nie ma i nie
 * potrzeba: `k` są stałymi maszyny, więc identyfikuje je zmienność proporcji faz MIĘDZY
 * dniami, a nie wewnątrz dnia.
 *
 * `k` to przelicznik motogodzin na godzinę ZEGARA. Licznik obrotomierzowy zlicza obroty
 * przeliczone na godziny przy obrotach znamionowych, więc na ziemi przyrasta wolniej niż
 * zegar (k ≈ 0,4); licznik godzinowy (Hobbs) chodzi 1:1 w obu fazach. Którym jest dany
 * samolot, rozstrzyga model z danych — patrz `mhModel.ts`.
 */
export interface MhEquation {
  sessionUuid: string;
  dayStart: EpochMillis | null;
  /** Przyrost licznika w dniu (godziny dziesiętne) — z projekcji, odczyt fizyczny. */
  deltaMh: number;
  flightMs: number;
  groundMs: number;
  /**
   * Czy `groundMs` przycięto do zera. Czas lotu większy niż czas pracy silnika jest
   * niemożliwy fizycznie i znaczy rozjazd w rejestrze (ręczny wpis nachodzący na cykl).
   * Równanie zostaje — ale wiadomo, że jego mianownik jest podejrzany.
   */
  clamped: boolean;
}

/** Wynik ekstrakcji z jednej sesji: interwały paliwowe i równanie MH (o ile dzień zamknięty). */
export interface SessionIntervals {
  intervals: FuelInterval[];
  mh: MhEquation | null;
}

/** Pusty wynik — sesja bez odczytów albo bez pracy silnika. */
export function emptySessionIntervals(): SessionIntervals {
  return { intervals: [], mh: null };
}

/** Czy interwał wchodzi do regresji. */
export function isUsableInterval(interval: FuelInterval): boolean {
  return interval.rejected == null;
}
