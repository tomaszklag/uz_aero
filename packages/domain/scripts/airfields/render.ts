/**
 * UZ Aero - wypisanie katalogu lotnisk jako moduł TypeScript.
 *
 * Katalog jest STATYCZNY (wkompilowany), a nie pobierany z serwera, bo ekran śladu ma
 * działać bez sieci - pobieranie lotnisk dokładałoby zależność sieciową dokładnie tam,
 * gdzie jej świadomie nie ma. Odświeżenie danych to ponowne uruchomienie generatora
 * i jeden commit.
 */

import type { AirfieldRecord } from './catalogue';

const runwayLiteral = (record: AirfieldRecord): string => {
  const rwy = record.runway;
  if (rwy == null) return 'null';
  return `{ headingDeg: ${rwy.headingDeg}, lengthM: ${rwy.lengthM}, source: '${rwy.source}' }`;
};

const recordLiteral = (record: AirfieldRecord): string =>
  `  { icao: '${record.icao}', name: ${JSON.stringify(record.name)}, lat: ${record.lat}, ` +
  `lon: ${record.lon}, elevationFt: ${record.elevationFt}, runway: ${runwayLiteral(record)} },`;

/** Treść pliku `packages/domain/src/airfields.ts`. */
export function renderAirfieldsModule(records: readonly AirfieldRecord[]): string {
  const withRunway = records.filter((r) => r.runway != null);
  const fromOsm = withRunway.filter((r) => r.runway?.source === 'osm');

  return `/**
 * UZ Aero - katalog polskich lotnisk (dane statyczne).
 *
 * PO CO: mapa śladu rysuje trasę na siatce współrzędnych, bez kafelków (decyzja
 * 2026-08-04). Sama linia w pustce nie mówi jednak, GDZIE lot się odbył - dopiero
 * pas startowy z podpisem daje odniesienie, które pilot rozpoznaje bez zastanowienia.
 *
 * ŹRÓDŁA (dwa, w tej kolejności - uzasadnienie i odrzucone warianty: \`docs/dane-lotnisk.md\`):
 *
 *   1. OurAirports (\`ourairports.com\`) - DOMENA PUBLICZNA. Szkielet katalogu: kod ICAO,
 *      nazwa, pozycja, elewacja, a także pas wszędzie tam, gdzie źródło go podaje.
 *   2. OpenStreetMap (\`aeroway=runway\`) - licencja **ODbL**. Wyłącznie pasy lotnisk,
 *      których OurAirports nie ma; w praktyce lotniska aeroklubowe i lądowiska.
 *
 * ATRYBUCJA I ODbL: ten plik jest bazą pochodną od OSM, więc jest udostępniony na ODbL,
 * a ekran śladu podaje „© współtwórcy OpenStreetMap". Pole \`source\` przy każdym pasie
 * mówi, którego rekordu to dotyczy.
 *
 * DLACZEGO STATYCZNIE, A NIE Z BAZY: lotniska zmieniają się w skali lat, a ekran śladu
 * ma działać bez sieci - pobieranie katalogu z serwera dokładałoby zależność sieciową
 * dokładnie tam, gdzie jej świadomie nie ma. Odświeżenie to ponowne uruchomienie
 * generatora (\`packages/domain/scripts/generateAirfields.ts\`) i jeden commit.
 *
 * PLIK GENEROWANY - nie edytuj ręcznie.
 * Rekordów: ${records.length}, z pasem: ${withRunway.length} (z tego z OSM: ${fromOsm.length}).
 */

/** Skąd pochodzi pas - atrybucja ODbL dotyczy wyłącznie rekordów \`'osm'\`. */
export type RunwaySource = 'ourairports' | 'osm';

/** Pas startowy: kierunek geograficzny i długość. Null, gdy żadne źródło go nie podaje. */
export interface AirfieldRunway {
  /** Kurs geograficzny progu (stopnie 0–360). */
  headingDeg: number;
  lengthM: number;
  source: RunwaySource;
}

/** Lotnisko z katalogu. */
export interface Airfield {
  /** Kod ICAO - ten sam, który pilot wpisuje w preflighcie (\`departureIcao\`). */
  icao: string;
  name: string;
  lat: number;
  lon: number;
  /** Elewacja (stopy AMSL); null, gdy źródło jej nie podaje. */
  elevationFt: number | null;
  runway: AirfieldRunway | null;
}

export const POLISH_AIRFIELDS: readonly Airfield[] = [
${records.map(recordLiteral).join('\n')}
];

/** Wyszukanie po kodzie ICAO (bez rozróżniania wielkości liter). */
export function airfieldByIcao(icao: string | null | undefined): Airfield | null {
  if (icao == null) return null;
  const key = icao.trim().toUpperCase();
  return POLISH_AIRFIELDS.find((a) => a.icao === key) ?? null;
}
`;
}
