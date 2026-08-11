/**
 * UZ Aero — generator wycinka siatki undulacji geoidy EGM96
 * (`packages/domain/src/geoid/egm96Grid.ts`).
 *
 * URUCHOMIENIE (z korzenia repo, plik siatki pobrany wcześniej z NGA):
 *
 *   npx tsx packages/domain/scripts/generateGeoid.ts --grid=./WW15MGH.GRD
 *
 * Zanim cokolwiek wytnie, generator sprawdza pobrany plik na SZEŚCIU oficjalnych
 * punktach testowych NGA (para `INPUT.DAT`/`OUTINTPT.DAT` z tego samego pakietu) —
 * naszą interpolacją dwuliniową, czyli dokładnie tą, którą wykonuje aplikacja.
 * Po wycięciu porównuje jeszcze wynik interpolacji świat vs wycinek w punktach
 * kontrolnych pokrycia: każdy błąd kopiowania (przesunięcie wiersza, kolumny,
 * szew 0°) wychodzi tu jako rozjazd co do centymetra.
 *
 * Cała logika siedzi w `geoid/` i jest pokryta testami
 * (`app/src/__tests__/geoidGenerator.test.ts`); tutaj zostaje wejście/wyjście.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bilinearUndulationM } from '../src/geoid/grid';
import { parseWorldGrd } from './geoid/grd';
import { renderGeoidModule } from './geoid/render';
import { APP_COVERAGE, subsetGrid } from './geoid/subset';

/** Argument `--nazwa=wartość` z linii poleceń. */
function arg(name: string, fallback: string | null = null): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found == null ? fallback : found.slice(prefix.length);
}

const gridPath = arg('grid', './WW15MGH.GRD')!;
const outPath = arg('out', fileURLToPath(new URL('../src/geoid/egm96Grid.ts', import.meta.url)))!;

if (!existsSync(gridPath)) {
  console.error(
    `Brak pliku siatki (${gridPath}).\n` +
      'Pobierz pakiet interpolacyjny EGM96 (NGA, domena publiczna):\n' +
      '  https://earth-info.nga.mil/php/download.php?file=egm-96interpolation\n' +
      'i wypakuj z ZIP-a plik WW15MGH.GRD do korzenia repo.',
  );
  process.exit(1);
}

/**
 * Oficjalne wzorce NGA (`OUTINTPT.DAT`). Program INTPT.F potrafi liczyć też
 * splajnem, stąd tolerancja — dwuliniowa interpolacja na gładkiej geoidzie
 * schodzi się z nim do pojedynczych centymetrów.
 */
const OFFICIAL_TEST_POINTS = [
  { lat: 38.628155, lon: 269.779155, undulationM: -31.628 },
  { lat: -14.621217, lon: 305.021114, undulationM: -2.969 },
  { lat: 46.874319, lon: 102.448729, undulationM: -43.575 },
  { lat: -23.617446, lon: 133.874712, undulationM: 15.871 },
  { lat: 38.625473, lon: 359.9995, undulationM: 50.066 },
  { lat: -0.466744, lon: 0.0023, undulationM: 17.329 },
] as const;

const OFFICIAL_TOLERANCE_M = 0.25;

/**
 * Punkty kontrolne świat↔wycinek: EPNL (zgłoszenie, od którego cała korekta się
 * zaczęła), Warszawa i punkty przy narożnikach oraz w środku pokrycia.
 */
const COVERAGE_CHECKPOINTS = [
  { name: 'EPNL', lat: 49.74532, lon: 20.62347 },
  { name: 'EPBC (Warszawa)', lat: 52.2692, lon: 20.9072 },
  { name: 'NW', lat: 61.9, lon: -4.9 },
  { name: 'NE', lat: 61.9, lon: 34.9 },
  { name: 'SW', lat: 41.1, lon: -4.9 },
  { name: 'SE', lat: 41.1, lon: 34.9 },
  { name: 'centrum', lat: 51.5, lon: 15 },
] as const;

console.log(`czytam ${gridPath}…`);
const world = parseWorldGrd(readFileSync(gridPath, 'utf8'));

console.log('wzorce NGA (OUTINTPT.DAT):');
for (const point of OFFICIAL_TEST_POINTS) {
  const got = bilinearUndulationM(world, point);
  if (got == null) throw new Error(`punkt wzorcowy ${point.lat}/${point.lon} poza siatką światową`);
  const diff = got - point.undulationM;
  console.log(
    `  ${point.lat.toFixed(6).padStart(11)} ${point.lon.toFixed(6).padStart(11)}  ` +
      `oczekiwane ${point.undulationM.toFixed(3).padStart(8)}  otrzymane ${got.toFixed(3).padStart(8)}  Δ ${(diff >= 0 ? '+' : '') + diff.toFixed(3)} m`,
  );
  if (Math.abs(diff) > OFFICIAL_TOLERANCE_M) {
    throw new Error(`wzorzec NGA poza tolerancją ${OFFICIAL_TOLERANCE_M} m — siatka albo interpolacja są złe`);
  }
}

const subset = subsetGrid(world, APP_COVERAGE);

for (const point of COVERAGE_CHECKPOINTS) {
  const fromWorld = bilinearUndulationM(world, { lat: point.lat, lon: ((point.lon % 360) + 360) % 360 });
  const fromSubset = bilinearUndulationM(subset, point);
  if (fromWorld == null || fromSubset == null || Math.abs(fromWorld - fromSubset) > 1e-9) {
    throw new Error(`wycinek ≠ świat w punkcie ${point.name}: ${fromWorld} vs ${fromSubset}`);
  }
}

writeFileSync(outPath, renderGeoidModule(subset), 'utf8');

const epnl = bilinearUndulationM(subset, COVERAGE_CHECKPOINTS[0])!;
console.log('');
console.log(`zapisano:  ${outPath}`);
console.log(`pokrycie:  ${APP_COVERAGE.southLatDeg}–${APP_COVERAGE.northLatDeg}°N, ${APP_COVERAGE.westLonDeg}–${APP_COVERAGE.eastLonDeg}°E (${subset.rows}×${subset.cols} = ${subset.rows * subset.cols} węzłów)`);
console.log(`kontrola:  undulacja EPNL = ${epnl.toFixed(2)} m (${(epnl * 3.280839895).toFixed(0)} ft)`);
