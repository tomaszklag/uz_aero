/**
 * UZ Aero — wysokość zrzutu: średnia z okna czasu, nie pojedynczy fix (issue #21 pkt 2).
 *
 * Wysokość z GPS klasy konsumenckiej skacze z fixa na fix o kilkadziesiąt stóp —
 * arkusz zrzutu (05e) brał dotąd ostatni odczyt i wpisywał ten szum wprost do
 * rozliczenia. Średnia po oknie idzie tą samą drogą, którą prędkość pionowa
 * (`flightPhase.ts`): okno liczone wstecz od najnowszego fixa, fixy bez wysokości
 * pomijane, brak danych = `null`, nigdy zero.
 *
 * ŚREDNIA, nie regresja jak przy prędkości pionowej — bo pytanie jest inne. Prędkość
 * pionowa to NACHYLENIE (trend), które pojedynczy artefakt potrafi wywrócić; wysokość
 * zrzutu to POZIOM, a średnia arytmetyczna jest jego naturalnym estymatorem i rozkłada
 * ten sam artefakt na całe okno. Wyniesienie dzieje się w locie poziomym (bramka fazy
 * w `logic/cockpitActions.ts`), więc uśrednianie poziomu nie goni tu trendu.
 */

import type { GpsFix } from './fix';
import { DROP_ALT_WINDOW_SEC } from './thresholds';

/**
 * Średnia wysokość (ft) z fixów ostatnich `windowSec` sekund (licząc od najnowszego).
 *
 * Fixy przyjmuje w kolejności chronologicznej (jak `FixHistory.fixes`); starsze niż
 * okno i pozbawione wysokości pomija. `null`, gdy w oknie nie ma ani jednej wysokości —
 * „nie wiem" i „zero stóp" to dwie różne informacje.
 */
export function averageAltitudeFt(
  fixes: readonly GpsFix[],
  windowSec: number = DROP_ALT_WINDOW_SEC,
): number | null {
  const newest = fixes[fixes.length - 1];
  if (newest == null) return null;

  let sumFt = 0;
  let count = 0;
  for (const fix of fixes) {
    if (fix.altitudeFt == null) continue;
    const ageMs = newest.time - fix.time;
    // Ujemny wiek = fix z przyszłości (cofnięty zegar) — odrzucamy, jak w `verticalSpeedFpm`.
    if (ageMs < 0 || ageMs > windowSec * 1000) continue;
    sumFt += fix.altitudeFt;
    count += 1;
  }

  return count > 0 ? sumFt / count : null;
}
