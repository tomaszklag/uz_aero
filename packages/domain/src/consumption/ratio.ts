/**
 * UZ Aero — rozrzut obserwacji wokół przewidywania (issue #38).
 *
 * ══ PO CO OSOBNA LICZBA, SKORO MODEL MA PRZEDZIAŁY ══
 * Bo odpowiadają na różne pytania — to ta sama uwaga, którą niesie `summary.ts`, tylko
 * przeniesiona z „L/h okna" na „litry tej sesji". Przedział ufności mówi, jak dokładnie
 * znamy stawkę; rozrzut mówi, jak bardzo REALNE sesje odbiegają od tego, co model dla
 * nich przewiduje. Werdykt „powyżej normy" na ekranie pilota musi stać na tym drugim.
 *
 * ══ PASMO MUSI PASOWAĆ DO ESTYMATORA ══
 * Ilorazy liczymy dokładnie tą formułą, którą policzy TELEFON — dwie stawki (ziemia,
 * powietrze), bez faz pionowych. Gdyby pasmo powstało z modelu czterofazowego, opisywałoby
 * dokładność przewidywania, którego na telefonie nikt nie wykonuje: byłoby za wąskie
 * i zapalałoby werdykt na własnym uproszczeniu.
 */

import type { FuelInterval } from './interval';
import { isUsableInterval } from './interval';
import type { MhFit } from './mhModel';
import { percentile } from './percentile';
import { HOUR_MS } from './policy';

/** Pasmo ilorazu fakt / przewidywanie: 10. i 90. centyl. */
export interface RatioBand {
  low: number;
  high: number;
  /** Ile obserwacji stoi za pasmem — poniżej dwóch pasmo jest punktem. */
  samples: number;
}

/**
 * Rozrzut zużycia paliwa wokół przewidywania z dwóch stawek.
 *
 * Wchodzą wyłącznie interwały PRZYJĘTE — a że model oznacza odstające przez ustawienie
 * `rejected`, wywołanie po dopasowaniu wyklucza je tym samym predykatem. Interwał,
 * którego model nie tłumaczy, nie ma prawa rozpychać pasma dla wszystkich pozostałych.
 */
export function fuelRatioBand(
  intervals: readonly FuelInterval[],
  groundLPerH: number,
  airLPerH: number,
): RatioBand | null {
  const ratios: number[] = [];

  for (const interval of intervals) {
    if (!isUsableInterval(interval)) continue;
    const predicted =
      airLPerH * (interval.flightMs / HOUR_MS) + groundLPerH * (interval.groundMs / HOUR_MS);
    if (predicted <= 0) continue;
    ratios.push(interval.consumedL / predicted);
  }

  return bandOf(ratios);
}

/**
 * Rozrzut przyrostu licznika wokół przewidywania.
 *
 * Model MH liczy przewidywanie sam (`MhFit.modelledMh`) i robi to z tych samych dwóch
 * przeliczników, które trafiają do telefonu — więc tutaj wystarczy przepisać ilorazy.
 */
export function mhRatioBand(rows: readonly MhFit[]): RatioBand | null {
  const ratios: number[] = [];

  for (const row of rows) {
    if (row.modelledMh <= 0) continue;
    ratios.push(row.actualMh / row.modelledMh);
  }

  return bandOf(ratios);
}

/** Centyle 10/90 albo `null`, gdy nie ma z czego liczyć. */
function bandOf(ratios: readonly number[]): RatioBand | null {
  const low = percentile(ratios, 0.1);
  const high = percentile(ratios, 0.9);
  if (low == null || high == null) return null;
  return { low, high, samples: ratios.length };
}
