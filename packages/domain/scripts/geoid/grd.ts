/**
 * UZ Aero - parser światowej siatki undulacji EGM96 („WW15MGH.GRD", NGA).
 *
 * Format (readme.txt pakietu interpolacyjnego NGA): pierwsza linia to nagłówek
 * `-90 90 0 360 .25 .25` (południe, północ, zachód, wschód, krok N-S, krok E-W
 * w stopniach), dalej 721×1441 wartości w METRACH - pasma od 90°N ku południowi,
 * w paśmie od 0°E ku wschodowi. Kolumny 0° i 360° są OBIE w pliku (szew powtórzony)
 * i ta redundancja jest tu sprawdzana: rozjazd szwu znaczy, że plik jest ucięty
 * albo przesunięty, a wtedy KAŻDA wartość ląduje na złych współrzędnych.
 */

import type { GeoidGrid } from '../../src/geoid/grid';

export const WORLD_ROWS = 721;
export const WORLD_COLS = 1441;
export const WORLD_STEP_DEG = 0.25;

/** Nagłówek, którego wymagamy co do wartości - inny plik to inne dane, nie „prawie te". */
const EXPECTED_HEADER = [-90, 90, 0, 360, WORLD_STEP_DEG, WORLD_STEP_DEG] as const;

/**
 * Fizyczny sufit undulacji z zapasem: rzeczywisty zakres EGM96 to około −107…+85 m.
 * Wartość poza tym przedziałem nie jest „dziwną geoidą", tylko błędem parsowania.
 */
const MAX_PLAUSIBLE_M = 110;

/** Tekst WW15MGH.GRD → siatka światowa w centymetrach (kontrakt `GeoidGrid`). */
export function parseWorldGrd(text: string): GeoidGrid {
  const tokens = text.trim().split(/\s+/);
  const expected = EXPECTED_HEADER.length + WORLD_ROWS * WORLD_COLS;
  if (tokens.length !== expected) {
    throw new Error(`WW15MGH.GRD: ${tokens.length} tokenów zamiast ${expected} - plik ucięty albo to nie ta siatka`);
  }

  EXPECTED_HEADER.forEach((want, i) => {
    const got = Number(tokens[i]);
    if (got !== want) {
      throw new Error(`WW15MGH.GRD: nagłówek[${i}] = ${tokens[i]}, oczekiwano ${want}`);
    }
  });

  const valuesCm = new Array<number>(WORLD_ROWS * WORLD_COLS);
  for (let k = 0; k < valuesCm.length; k++) {
    const meters = Number(tokens[EXPECTED_HEADER.length + k]);
    if (!Number.isFinite(meters) || Math.abs(meters) > MAX_PLAUSIBLE_M) {
      throw new Error(`WW15MGH.GRD: wartość #${k} = ${tokens[EXPECTED_HEADER.length + k]} poza fizycznym zakresem`);
    }
    valuesCm[k] = Math.round(meters * 100);
  }

  for (let row = 0; row < WORLD_ROWS; row++) {
    const west = valuesCm[row * WORLD_COLS]!;
    const east = valuesCm[row * WORLD_COLS + WORLD_COLS - 1]!;
    if (west !== east) {
      throw new Error(`WW15MGH.GRD: szew 0°/360° rozjechany w paśmie ${row} (${west} ≠ ${east} cm)`);
    }
  }

  return {
    northLatDeg: 90,
    westLonDeg: 0,
    stepDeg: WORLD_STEP_DEG,
    rows: WORLD_ROWS,
    cols: WORLD_COLS,
    valuesCm,
  };
}
