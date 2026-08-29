/**
 * UZ Aero - bufor historii fixów (okno obserwacji detektora).
 *
 * DLACZEGO ISTNIEJE: pierwsza wersja detektora decydowała z JEDNEGO fixa, a okno
 * dziesięciu sekund żyło w hooku UI wyłącznie na potrzeby prędkości pionowej. To
 * zamykało drogę do dwóch rzeczy, bez których consumer-grade GPS nie da się okiełznać:
 *
 *  1. **cech trendowych** - przyspieszenie, przemieszczenie, zmiana kursu istnieją
 *     tylko w oknie czasu; pojedynczy fix ich nie niesie (`trends.ts`);
 *  2. **retro-datowania** - pytanie „CZY wystartował" i „KIEDY oderwał się od ziemi"
 *     to dwa różne pytania. Na pierwsze wolno odpowiadać późno i pewnie; odpowiedź
 *     na drugie trzeba wtedy odnaleźć WSTECZ w zapisie (`onset.ts`).
 *
 * Bufor jest ograniczony czasem, nie liczbą wpisów: przy 1 Hz to ~120 pozycji, ale
 * strumień potrafi zwolnić (oszczędzanie energii) albo przyspieszyć, a algorytm myśli
 * w sekundach, nie w próbkach.
 *
 * CZYSTOŚĆ: struktura niemutowalna, jak `DetectorState` - `pushFix` zwraca nowy bufor.
 * Kopiowanie ~120 elementów raz na sekundę jest nieistotne, a niezmienniczość pozwala
 * trzymać bufor wewnątrz stanu detektora i odtwarzać każdy krok w teście.
 */

import type { EpochMillis } from '../time';
import type { GpsFix } from './fix';

/** Ile sekund wstecz pamiętamy. Musi pokryć najdłuższe szukanie onsetu (rozbieg + margines). */
export const HISTORY_SPAN_SEC = 120;

export interface FixHistory {
  /** Fixy w kolejności chronologicznej (najstarszy → najnowszy). */
  readonly fixes: readonly GpsFix[];
  /** Głębokość bufora w sekundach. */
  readonly spanSec: number;
}

export function createHistory(spanSec: number = HISTORY_SPAN_SEC): FixHistory {
  return { fixes: [], spanSec };
}

/**
 * Dokłada fix i przycina to, co wypadło poza okno.
 *
 * Fix starszy od najnowszego w buforze jest ODRZUCANY. Kolejność chronologiczna to
 * niepisane założenie każdej funkcji z `trends.ts` i `onset.ts` - regresja po
 * przemieszanych czasach zwraca liczbę, która wygląda sensownie i jest nieprawdziwa.
 * Zegar potrafi skoczyć wstecz (§4.5), więc to nie jest hipotetyczne.
 */
export function pushFix(history: FixHistory, fix: GpsFix): FixHistory {
  const newest = history.fixes[history.fixes.length - 1];
  if (newest != null && fix.time < newest.time) return history;

  const cutoff = fix.time - history.spanSec * 1000;
  const kept = history.fixes.filter((f) => f.time >= cutoff);
  return { ...history, fixes: [...kept, fix] };
}

/** Fixy z ostatnich `windowSec` sekund licząc od najnowszego (włącznie z nim). */
export function fixesInWindow(history: FixHistory, windowSec: number): readonly GpsFix[] {
  const newest = history.fixes[history.fixes.length - 1];
  if (newest == null) return [];
  const cutoff = newest.time - windowSec * 1000;
  return history.fixes.filter((f) => f.time >= cutoff);
}

/** Najnowszy fix albo null. */
export function newestFix(history: FixHistory): GpsFix | null {
  return history.fixes[history.fixes.length - 1] ?? null;
}
