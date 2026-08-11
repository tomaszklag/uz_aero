/**
 * UZ Aero — wycinek siatki światowej pod pokrycie aplikacji.
 *
 * Cała siatka światowa to ~1 mln węzłów — do bundla aplikacji idzie wycinek.
 * Pokrycie dobrane pod realny zasięg klubowych maszyn: cała Polska z sąsiadami
 * oraz margines na przeloty — na północy południowa Skandynawia (Oslo, Helsinki),
 * na południu Alpy z Rzymem, na zachodzie Londyn i prawie cała Francja, na
 * wschodzie Ukraina po Charków. Poza pokryciem korekta uczciwie znika
 * (`geoidUndulationM` → null), więc margines jest szeroki z rozmysłem.
 *
 * Zachodnia krawędź leży na ujemnej długości, a siatka światowa zaczyna się od 0°E —
 * kolumny źródłowe liczymy modulo 360 (Londyn czyta pasmo 355–360°).
 */

import type { GeoidGrid } from '../../src/geoid/grid';

export interface GeoidBbox {
  northLatDeg: number;
  southLatDeg: number;
  westLonDeg: number;
  eastLonDeg: number;
}

/** Pokrycie wkompilowane w aplikację: 41–62°N, 5°W–35°E (85×161 = 13 685 węzłów). */
export const APP_COVERAGE: GeoidBbox = {
  northLatDeg: 62,
  southLatDeg: 41,
  westLonDeg: -5,
  eastLonDeg: 35,
};

const isOnNode = (deg: number, stepDeg: number): boolean =>
  Number.isInteger(deg / stepDeg);

/** Wycinek `bbox` z siatki światowej; bbox MUSI leżeć na węzłach siatki. */
export function subsetGrid(world: GeoidGrid, bbox: GeoidBbox): GeoidGrid {
  for (const [label, deg] of [
    ['northLatDeg', bbox.northLatDeg],
    ['southLatDeg', bbox.southLatDeg],
    ['westLonDeg', bbox.westLonDeg],
    ['eastLonDeg', bbox.eastLonDeg],
  ] as const) {
    if (!isOnNode(deg, world.stepDeg)) {
      throw new Error(`bbox.${label} = ${deg} nie leży na węźle siatki (krok ${world.stepDeg}°)`);
    }
  }
  if (bbox.northLatDeg <= bbox.southLatDeg || bbox.eastLonDeg <= bbox.westLonDeg) {
    throw new Error('bbox pusty albo odwrócony');
  }
  if (bbox.northLatDeg > world.northLatDeg || bbox.southLatDeg < world.northLatDeg - (world.rows - 1) * world.stepDeg) {
    throw new Error('bbox wystaje poza siatkę światową w szerokości');
  }

  const rows = Math.round((bbox.northLatDeg - bbox.southLatDeg) / world.stepDeg) + 1;
  const cols = Math.round((bbox.eastLonDeg - bbox.westLonDeg) / world.stepDeg) + 1;
  const valuesCm = new Array<number>(rows * cols);

  for (let r = 0; r < rows; r++) {
    const worldRow = Math.round((world.northLatDeg - bbox.northLatDeg) / world.stepDeg) + r;
    for (let c = 0; c < cols; c++) {
      const lon = bbox.westLonDeg + c * world.stepDeg;
      const normalized = ((lon % 360) + 360) % 360;
      const worldCol = Math.round((normalized - world.westLonDeg) / world.stepDeg);
      valuesCm[r * cols + c] = world.valuesCm[worldRow * world.cols + worldCol]!;
    }
  }

  return {
    northLatDeg: bbox.northLatDeg,
    westLonDeg: bbox.westLonDeg,
    stepDeg: world.stepDeg,
    rows,
    cols,
    valuesCm,
  };
}
