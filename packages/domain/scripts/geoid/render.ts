/**
 * UZ Aero — wypisanie wycinka siatki undulacji jako moduł TypeScript.
 *
 * Siatka jest STATYCZNA (wkompilowana), z tych samych powodów co katalog lotnisk:
 * korekta wysokości ma działać bez sieci, w samolocie, od pierwszego fixa.
 * Odświeżenie danych to ponowne uruchomienie generatora i jeden commit.
 */

import type { GeoidGrid } from '../../src/geoid/grid';

/** Wartości po 16 na linię — plik ma być diffowalny, nie jednolinijkowy. */
const VALUES_PER_LINE = 16;

const formatValues = (valuesCm: readonly number[]): string => {
  const lines: string[] = [];
  for (let i = 0; i < valuesCm.length; i += VALUES_PER_LINE) {
    lines.push(`    ${valuesCm.slice(i, i + VALUES_PER_LINE).join(', ')},`);
  }
  return lines.join('\n');
};

/** Treść pliku `packages/domain/src/geoid/egm96Grid.ts`. */
export function renderGeoidModule(grid: GeoidGrid): string {
  const southLatDeg = grid.northLatDeg - (grid.rows - 1) * grid.stepDeg;
  const eastLonDeg = grid.westLonDeg + (grid.cols - 1) * grid.stepDeg;
  const minM = Math.min(...grid.valuesCm) / 100;
  const maxM = Math.max(...grid.valuesCm) / 100;

  return `/**
 * UZ Aero — undulacja geoidy EGM96: wycinek siatki światowej dla Europy (dane statyczne).
 *
 * PO CO: GPS na Androidzie podaje wysokość nad elipsoidą WGS84; wysokości lotnicze
 * są AMSL. Ta siatka niesie różnicę obu powierzchni — adapter GPS odejmuje ją od
 * wysokości elipsoidalnej (\`AMSL = elipsoidalna − undulacja\`), patrz
 * \`src/geoid/undulation.ts\` i \`app/src/infrastructure/gps/locationToFix.ts\`.
 *
 * ŹRÓDŁO: NGA, „WW15MGH.GRD" — oficjalna siatka undulacji EGM96 15′×15′ z pakietu
 * interpolacyjnego (\`https://earth-info.nga.mil/php/download.php?file=egm-96interpolation\`).
 * Dane rządu USA — DOMENA PUBLICZNA. Generator waliduje pobrany plik na sześciu
 * oficjalnych punktach testowych NGA (\`OUTINTPT.DAT\`), zanim wytnie ten wycinek.
 *
 * POKRYCIE: ${southLatDeg}–${grid.northLatDeg}°N, ${grid.westLonDeg}–${eastLonDeg}°E, krok ${grid.stepDeg}° —
 * cała Polska plus margines na przeloty (południowa Skandynawia, Alpy z Rzymem,
 * Londyn i Francja, Ukraina). Poza pokryciem \`geoidUndulationM\` zwraca null
 * i wysokość zostaje bez korekty.
 *
 * PLIK GENEROWANY — nie edytuj ręcznie. Regeneracja (z korzenia repo):
 *   npx tsx packages/domain/scripts/generateGeoid.ts --grid=./WW15MGH.GRD
 * Węzłów: ${grid.rows}×${grid.cols} = ${grid.rows * grid.cols}; zakres ${minM.toFixed(2)}…${maxM.toFixed(2)} m.
 */

import type { GeoidGrid } from './grid';

export const EGM96_GRID: GeoidGrid = {
  northLatDeg: ${grid.northLatDeg},
  westLonDeg: ${grid.westLonDeg},
  stepDeg: ${grid.stepDeg},
  rows: ${grid.rows},
  cols: ${grid.cols},
  // Undulacja w centymetrach, wiersz-major od ${grid.northLatDeg}°N, kolumny od ${grid.westLonDeg}°E ku wschodowi.
  valuesCm: [
${formatValues(grid.valuesCm)}
  ],
};
`;
}
