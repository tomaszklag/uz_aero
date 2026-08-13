/**
 * UZ Aero — metryki zbiorcze zużycia: ilorazy sum, rozrzut i trend miesięczny.
 *
 * ══ ILORAZ SUM, NIGDY ŚREDNIA ILORAZÓW ══
 * Reguła całego tego modułu mieści się w jednym zdaniu i jest ważniejsza niż wygląda:
 * średnią okna liczymy jako `Σ litrów / Σ godzin`, a nie jako średnią z dziennych L/h.
 * Powód jest arytmetyczny, nie stylistyczny — średnia ilorazów daje każdemu interwałowi
 * tę samą wagę, więc dwudziestominutowy odcinek z błędem odczytu ±3 L waży tyle samo,
 * co trzygodzinny przelot. Iloraz sum rozkłada błąd przyrządu na cały nalot okna.
 *
 * ══ CZYM TO SIĘ RÓŻNI OD MODELU (`model.ts`) ══
 * Tu nie ma żadnej regresji ani przypisania paliwa do faz — są sumy i dzielenie.
 * Dlatego te liczby są dostępne OD PIERWSZEGO DNIA, także wtedy, gdy stawek fazowych
 * jeszcze nie wolno pokazać (bramka publikacji). Ekran `A10b` stoi właśnie na nich.
 *
 * Uwaga o niespójności, która niespójnością nie jest: model liczy `L/h` ważąc interwały
 * KWADRATEM czasu (regresja minimalizuje błąd w litrach), a ten moduł — liniowo. Obie
 * liczby są poprawne i obie są potrzebne; nie należy ich „ujednolicać".
 */

import type { EpochMillis } from '../time';
import { isUsableInterval, type FuelInterval } from './interval';
import { percentile } from './percentile';
import { HOUR_MS } from './policy';

/** Punkt trendu — jeden miesiąc kalendarzowy UTC. */
export interface MonthlyPoint {
  /** Klucz `YYYY-MM` (UTC) — oś wykresu i klucz sortowania w jednym. */
  month: string;
  litersTotal: number;
  engineMs: number;
  intervals: number;
  /** `null`, gdy w miesiącu nie było pracy silnika. */
  litersPerBlockHour: number | null;
}

/** Metryki zbiorcze okna — kafle nagłówkowe `A10a` i norma dla aplikacji. */
export interface ConsumptionSummary {
  /** Liczba interwałów, które weszły do sum (po odrzuceniach). */
  intervals: number;
  litersTotal: number;
  engineMs: number;
  flightMs: number;
  flights: number;

  /** `Σ L / Σ h lotu` — do planowania misji; zawiera też paliwo spalone na ziemi. */
  litersPerFlightHour: number | null;
  /** `Σ L / Σ h pracy silnika` — ta sama definicja, co „Śr. L/h" w statystykach zakresu. */
  litersPerBlockHour: number | null;
  /** `Σ L / Σ lotów` — dla dni skokowych czyta się to jako „na wyniesienie". */
  litersPerFlight: number | null;

  /**
   * Pasmo typowego zużycia na godzinę pracy silnika: 10. i 90. centyl stawek liczonych
   * per interwał. To jest liczba dla APLIKACJI („norma tego samolotu 15–17 L/h"), i jest
   * czymś innym niż przedział ufności stawki z modelu — patrz uwaga niżej.
   */
  blockLPerHP10: number | null;
  blockLPerHP90: number | null;

  months: MonthlyPoint[];
  firstDay: EpochMillis | null;
  lastDay: EpochMillis | null;
}

/** Puste podsumowanie — brak interwałów w oknie. */
export function emptyConsumptionSummary(): ConsumptionSummary {
  return {
    intervals: 0,
    litersTotal: 0,
    engineMs: 0,
    flightMs: 0,
    flights: 0,
    litersPerFlightHour: null,
    litersPerBlockHour: null,
    litersPerFlight: null,
    blockLPerHP10: null,
    blockLPerHP90: null,
    months: [],
    firstDay: null,
    lastDay: null,
  };
}

/**
 * Liczy metryki zbiorcze z interwałów okna. Bierze wyłącznie interwały PRZYJĘTE —
 * odrzucone (ujemne zużycie, za krótkie) nie mają prawa wejść do żadnej sumy.
 *
 * ══ DLACZEGO PASMO CENTYLOWE, A NIE PRZEDZIAŁ UFNOŚCI ══
 * To są odpowiedzi na dwa różne pytania i pomylenie ich byłoby cichym błędem.
 * Panel pyta „jak dokładnie znamy stawkę fazy" — odpowiada przedział ufności z modelu.
 * Ekran tankowania pyta „czy dzisiejsze 16 L/h mieści się w tym, co ten samolot zwykle
 * pokazuje" — a na to odpowiada ROZRZUT zaobserwowanych interwałów. Przy stu równaniach
 * przedział ufności jest wąski (±1,6) i werdykt „poza normą" zapalałby się na zupełnie
 * normalnej zmienności między lotami.
 */
export function consumptionSummary(intervals: readonly FuelInterval[]): ConsumptionSummary {
  const accepted = intervals.filter(isUsableInterval);
  if (accepted.length === 0) return emptyConsumptionSummary();

  let litersTotal = 0;
  let engineMs = 0;
  let flightMs = 0;
  let flights = 0;
  let firstDay: EpochMillis | null = null;
  let lastDay: EpochMillis | null = null;

  const rates: number[] = [];
  const byMonth = new Map<string, { liters: number; engineMs: number; intervals: number }>();

  for (const interval of accepted) {
    litersTotal += interval.consumedL;
    engineMs += interval.engineMs;
    flightMs += interval.flightMs;
    flights += interval.flightCount;

    const day = interval.dayStart ?? interval.startAt;
    if (firstDay == null || day < firstDay) firstDay = day;
    if (lastDay == null || day > lastDay) lastDay = day;

    if (interval.engineMs > 0) {
      rates.push(interval.consumedL / (interval.engineMs / HOUR_MS));
    }

    const key = monthKey(day);
    const bucket = byMonth.get(key) ?? { liters: 0, engineMs: 0, intervals: 0 };
    bucket.liters += interval.consumedL;
    bucket.engineMs += interval.engineMs;
    bucket.intervals += 1;
    byMonth.set(key, bucket);
  }

  const months: MonthlyPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, bucket]) => ({
      month,
      litersTotal: bucket.liters,
      engineMs: bucket.engineMs,
      intervals: bucket.intervals,
      litersPerBlockHour: over(bucket.liters, bucket.engineMs / HOUR_MS),
    }));

  return {
    intervals: accepted.length,
    litersTotal,
    engineMs,
    flightMs,
    flights,
    litersPerFlightHour: over(litersTotal, flightMs / HOUR_MS),
    litersPerBlockHour: over(litersTotal, engineMs / HOUR_MS),
    litersPerFlight: over(litersTotal, flights),
    blockLPerHP10: percentile(rates, 0.1),
    blockLPerHP90: percentile(rates, 0.9),
    months,
    firstDay,
    lastDay,
  };
}

/** Dzielenie, które nie zmyśla: `null` zamiast nieskończoności przy pustym mianowniku. */
function over(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Klucz `YYYY-MM` w UTC — bez zależności od strefy, jak wszystko w tym projekcie. */
function monthKey(at: EpochMillis): string {
  const date = new Date(at);
  const month = date.getUTCMonth() + 1;
  return `${date.getUTCFullYear()}-${month < 10 ? '0' : ''}${month}`;
}
