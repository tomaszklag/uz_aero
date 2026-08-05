/**
 * Generator statycznego katalogu polskich lotnisk z danych OurAirports (domena publiczna).
 * Wejście: airports.csv, runways.csv. Wyjście: TypeScript do packages/domain.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Parser CSV z obsługą cudzysłowów i przecinków w polach. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const toObjects = (rows) => {
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length === head.length).map((r) =>
    Object.fromEntries(head.map((h, i) => [h, r[i]])),
  );
};

const airports = toObjects(parseCsv(readFileSync('airports.csv', 'utf8')));
const runways = toObjects(parseCsv(readFileSync('runways.csv', 'utf8')));

// Polska, z prawdziwym kodem ICAO (EP*), bez zamkniętych i bez heliportów:
// ekran śladu rysuje lotniska, na których ląduje samolot.
const KEEP_TYPES = new Set(['small_airport', 'medium_airport', 'large_airport']);
const pl = airports.filter(
  (a) =>
    a.iso_country === 'PL' &&
    KEEP_TYPES.has(a.type) &&
    /^EP[A-Z]{2}$/.test(a.ident),
);

// Najdłuższy CZYNNY pas każdego lotniska — ten, który widać z powietrza.
const runwayOf = new Map();
for (const r of runways) {
  if (r.closed === '1') continue;
  const len = Number(r.length_ft);
  const heading = Number(r.le_heading_degT);
  if (!Number.isFinite(len) || len <= 0 || !Number.isFinite(heading)) continue;
  const prev = runwayOf.get(r.airport_ident);
  if (prev == null || len > prev.lengthFt) {
    runwayOf.set(r.airport_ident, { lengthFt: len, headingDeg: heading, ident: r.le_ident });
  }
}

const round = (v, digits) => Number(Number(v).toFixed(digits));

const rows = pl
  .map((a) => {
    const rwy = runwayOf.get(a.ident);
    return {
      icao: a.ident,
      name: a.name.replace(/\s+/g, ' ').trim(),
      lat: round(a.latitude_deg, 5),
      lon: round(a.longitude_deg, 5),
      elevationFt: Number.isFinite(Number(a.elevation_ft)) && a.elevation_ft !== '' ? Math.round(Number(a.elevation_ft)) : null,
      runway: rwy == null ? null : { headingDeg: Math.round(rwy.headingDeg), lengthM: Math.round(rwy.lengthFt * 0.3048) },
    };
  })
  .sort((a, b) => a.icao.localeCompare(b.icao));

const literal = (a) => {
  const rwy = a.runway == null ? 'null' : `{ headingDeg: ${a.runway.headingDeg}, lengthM: ${a.runway.lengthM} }`;
  return `  { icao: '${a.icao}', name: ${JSON.stringify(a.name)}, lat: ${a.lat}, lon: ${a.lon}, elevationFt: ${a.elevationFt}, runway: ${rwy} },`;
};

const out = `/**
 * UZ Aero — katalog polskich lotnisk (dane statyczne).
 *
 * PO CO: mapa śladu rysuje trasę na siatce współrzędnych, bez kafelków (decyzja
 * 2026-08-04). Sama linia w pustce nie mówi jednak, GDZIE lot się odbył — dopiero
 * pas startowy z podpisem daje odniesienie, które pilot rozpoznaje bez zastanowienia.
 *
 * ŹRÓDŁO: OurAirports (\`ourairports.com\`), zbiór w DOMENIE PUBLICZNEJ — bez klucza,
 * bez limitów i bez wymogu atrybucji, choć ją podajemy. Wygenerowane z \`airports.csv\`
 * i \`runways.csv\`; filtr: Polska, kod ICAO \`EP**\`, lotniska czynne (bez heliportów
 * i zamkniętych), najdłuższy czynny pas każdego z nich.
 *
 * DLACZEGO STATYCZNIE, A NIE Z BAZY: lotniska zmieniają się w skali lat, a ekran śladu
 * ma działać bez sieci — pobieranie katalogu z serwera dokładałoby zależność sieciową
 * dokładnie tam, gdzie jej świadomie nie ma. Odświeżenie to ponowne uruchomienie
 * generatora i jeden commit.
 *
 * PLIK GENEROWANY — nie edytuj ręcznie.
 * Rekordów: ${rows.length}.
 */

/** Pas startowy: kierunek geograficzny i długość. Null, gdy dane go nie podają. */
export interface AirfieldRunway {
  /** Kurs geograficzny progu (stopnie 0–360). */
  headingDeg: number;
  lengthM: number;
}

/** Lotnisko z katalogu. */
export interface Airfield {
  /** Kod ICAO — ten sam, który pilot wpisuje w preflighcie (\`departureIcao\`). */
  icao: string;
  name: string;
  lat: number;
  lon: number;
  /** Elewacja (stopy AMSL); null, gdy źródło jej nie podaje. */
  elevationFt: number | null;
  runway: AirfieldRunway | null;
}

export const POLISH_AIRFIELDS: readonly Airfield[] = [
${rows.map(literal).join('\n')}
];

/** Wyszukanie po kodzie ICAO (bez rozróżniania wielkości liter). */
export function airfieldByIcao(icao: string | null | undefined): Airfield | null {
  if (icao == null) return null;
  const key = icao.trim().toUpperCase();
  return POLISH_AIRFIELDS.find((a) => a.icao === key) ?? null;
}
`;

writeFileSync('airfields.ts', out, 'utf8');
console.log('lotnisk:', rows.length);
console.log('z pasem:', rows.filter((r) => r.runway != null).length);
console.log('przyklady:', rows.slice(0, 3).map((r) => `${r.icao} ${r.name}`).join(' | '));
console.log('EPZG:', JSON.stringify(rows.find((r) => r.icao === 'EPZG')));
