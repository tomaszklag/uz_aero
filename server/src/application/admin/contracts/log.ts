/**
 * UZ Aero (serwer) - LOG DNIA: kontrakt poziomu pierwszego (2026-08-30).
 *
 * Moduł ma trzy poziomy: zbiorcza lista SAMOLOTÓW w zakresie dat (ten plik), grid
 * sesji jednej maszyny (`AdminSessionListItem`, trasa `/sessions?aircraftId=…`)
 * i szczegóły jednej sesji (`AdminSessionDetail` + ślad).
 *
 * ══ DLACZEGO OSOBNA TRASA, A NIE `/stats` ══
 * `/stats` ma gotowy agregat per samolot, więc kusiło, żeby go tu użyć. Dwie różnice
 * przesądziły przeciw:
 *  1. **oś czasu** - `/stats` filtruje po `close_time` (ZDANIE samolotu), a lista sesji
 *     po `claim_time` (przejęcie). Dwa poziomy jednego modułu liczące po dwóch różnych
 *     osiach potrafią pokazać cztery sesje na poziomie 1 i pięć wierszy na poziomie 2 -
 *     a narzędzie nadzoru, którego dwa ekrany nie zgadzają się co do liczby lotów,
 *     przestaje być narzędziem;
 *  2. **sesje otwarte** - `/stats` liczy WYŁĄCZNIE zamknięte, więc dzisiejszy dzień
 *     byłby pusty do wieczora. W logu dnia „co lata teraz" jest pytaniem częstszym niż
 *     „co latało w zeszłym miesiącu".
 *
 * Ten agregat czyta więc te same wiersze i tę samą oś (`claim_time`), co grid pod nim,
 * i pokazuje maszyny z sesjami otwartymi razem z resztą.
 *
 * ══ WSZYSTKO TU JEST SUMĄ KOLUMN PROJEKCJI ══
 * Ani jednej wartości liczonej z payloadów zdarzeń (§7.1). `SUM(block_ms)` jest
 * dozwolone, bo sumuje WARTOŚĆ POLICZONĄ przez `projectSession`; wyciąganie tego
 * samego z `events` byłoby drugą, równoległą projekcją.
 */

import type { MhFormat } from '@uzaero/domain';

/** Jedna maszyna w zakresie dat - wiersz poziomu 1. */
export interface AdminLogAircraftItem {
  aircraftId: string;
  /** `null` = jednostki nie ma już w rejestrze floty; sesje historyczne zostają. */
  reg: string | null;
  aircraftType: string | null;
  /** Format licznika - panel formatuje nim motogodziny w gridzie poziomu 2. */
  mhFormat: MhFormat | null;

  /** Ile sesji (biegów silnika) w zakresie - razem z otwartymi. */
  sessions: number;
  /** Ile z nich jeszcze trwa. Wyróżnia maszynę, która lata w tej chwili. */
  openSessions: number;
  /**
   * Ile DNI maszyna pracowała - liczone po dobie UTC chwili przejęcia, nie po liczbie
   * sesji: dwie zmiany jednego dnia to jeden dzień pracy.
   */
  activeDays: number;

  /**
   * Loty i zdarzenia to DWIE różne liczby i obie są potrzebne: lot z czterema kręgami
   * to jeden `flight`, ale pięć startów i pięć lądowań (issue #62).
   */
  flights: number;
  takeoffs: number | null;
  landings: number | null;

  /** Suma czasu blokowego i czasu w powietrzu (ms). */
  blockMs: number;
  flightMs: number;

  /**
   * Paliwo: ile dolano i ile zużyto w zakresie (litry).
   *
   * `fuelConsumedL` jest `null`, gdy choć jedna sesja zakresu nie ma bilansu (sesja
   * otwarta, wpis bez odczytu końcowego) - suma z dziurą byłaby liczbą mniejszą od
   * prawdy podaną jako prawda. `fuelUnknownSessions` mówi, ilu wierszy dotyczy.
   */
  fuelAddedL: number | null;
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;

  /**
   * Olej: WYŁĄCZNIE suma dolewek. Zużycia nie ma i nie będzie - po locie oleju się
   * nie mierzy (issue #60), więc bilansu per sesja nie da się policzyć.
   * Sumowanie poziomów nie miałoby sensu: to stan, nie przepływ.
   */
  oilAddedL: number | null;

  /**
   * Przyrost licznika motogodzin w zakresie.
   *
   * Sumuje się BEZ zastrzeżenia paliwowego: motogodziny mają własny bilans (`null`
   * do zdania samolotu), więc sesja bez odczytu paliwa nie unieważnia przyrostu
   * policzonego z pozostałych.
   */
  mhDeltaH: number | null;

  /** Ostatnia chwila pracy śmigła w zakresie - `null`, gdy żadna sesja nie ruszyła. */
  lastEngineStopAt: number | null;
}

/** Zakres, w którym policzono wiersze - panel wypisuje go nad tabelą. */
export interface AdminLogRange {
  from: string;
  to: string;
  /** `true` = zakresu nie podano i serwer wybrał domyślny (ostatnie 30 dni). */
  defaulted: boolean;
}

/**
 * Odpowiedź poziomu 1.
 *
 * `at` to chwila ODPOWIEDZI z zegara SERWERA - panel kotwiczy nią szybkie filtry
 * („dziś", „7 dni"), zamiast pytać `new Date()` w przeglądarce. Zegar przeglądarki
 * jest trzecim, niesprawdzonym zegarem w systemie, a od tego, co znaczy „dziś",
 * zależy, które wiersze człowiek zobaczy.
 */
export interface AdminLogReport {
  at: string;
  range: AdminLogRange;
  aircraft: AdminLogAircraftItem[];
}
