/**
 * UZ Aero — generator katalogu polskich lotnisk (`packages/domain/src/airfields.ts`).
 *
 * URUCHOMIENIE (z korzenia repo, pliki CSV pobrane wcześniej z ourairports.com):
 *
 *   npx tsx packages/domain/scripts/generateAirfields.ts \
 *     --airports=./airports.csv --runways=./runways.csv --osm-cache=./osm-runways.json
 *
 * \`--osm-cache\` jest opcjonalny i działa w obie strony: gdy plik istnieje, generator
 * czyta z niego odpowiedź Overpassa, a gdy nie — pobiera ją i zapisuje. Dzięki temu
 * powtórna generacja daje ten sam wynik i nie obciąża publicznego serwera.
 *
 * Cała logika siedzi w \`airfields/\` i jest pokryta testami (\`app/src/__tests__/
 * airfieldsGenerator.test.ts\`); tutaj zostaje wyłącznie wejście/wyjście.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildCatalogue } from './airfields/catalogue';
import { parseCsv, toObjects } from './airfields/csv';
import { assignWaysToAirfields } from './airfields/osmAssignment';
import type { OverpassWay } from './airfields/osmRunways';
import { fetchPolishRunwayWays } from './airfields/overpass';
import { polishAirfields, runwaysByAirfield } from './airfields/ourAirports';
import { renderAirfieldsModule } from './airfields/render';

/** Argument `--nazwa=wartość` z linii poleceń. */
function arg(name: string, fallback: string | null = null): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found == null ? fallback : found.slice(prefix.length);
}

const airportsPath = arg('airports', './airports.csv')!;
const runwaysPath = arg('runways', './runways.csv')!;
const outPath = arg('out', fileURLToPath(new URL('../src/airfields.ts', import.meta.url)))!;
const cachePath = arg('osm-cache');

for (const [label, path] of [
  ['airports.csv', airportsPath],
  ['runways.csv', runwaysPath],
] as const) {
  if (!existsSync(path)) {
    console.error(
      `Brak pliku ${label} (${path}).\n` +
        'Pobierz zbiór OurAirports:\n' +
        '  https://davidmegginson.github.io/ourairports-data/airports.csv\n' +
        '  https://davidmegginson.github.io/ourairports-data/runways.csv',
    );
    process.exit(1);
  }
}

const seeds = polishAirfields(toObjects(parseCsv(readFileSync(airportsPath, 'utf8'))));
const csvRunways = runwaysByAirfield(toObjects(parseCsv(readFileSync(runwaysPath, 'utf8'))));

let ways: OverpassWay[];
if (cachePath != null && existsSync(cachePath)) {
  ways = JSON.parse(readFileSync(cachePath, 'utf8')) as OverpassWay[];
  console.log(`OSM: ${ways.length} wayów z pliku ${cachePath}`);
} else {
  console.log('OSM: pytam Overpass o pasy w granicach Polski…');
  ways = await fetchPolishRunwayWays();
  console.log(`OSM: ${ways.length} wayów`);
  if (cachePath != null) {
    writeFileSync(cachePath, JSON.stringify(ways), 'utf8');
    console.log(`OSM: zapisano podręczną kopię do ${cachePath}`);
  }
}

const records = buildCatalogue(seeds, csvRunways, assignWaysToAirfields(ways, seeds));
writeFileSync(outPath, renderAirfieldsModule(records), 'utf8');

const withRunway = records.filter((r) => r.runway != null);
const fromOsm = withRunway.filter((r) => r.runway?.source === 'osm');
const withoutRunway = records.filter((r) => r.runway == null);

console.log('');
console.log(`zapisano:   ${outPath}`);
console.log(`lotnisk:    ${records.length}`);
console.log(`z pasem:    ${withRunway.length} (OurAirports: ${withRunway.length - fromOsm.length}, OSM: ${fromOsm.length})`);
console.log(`bez pasa:   ${withoutRunway.length}${withoutRunway.length === 0 ? '' : ` — ${withoutRunway.map((r) => r.icao).join(', ')}`}`);
