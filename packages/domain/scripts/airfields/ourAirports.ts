/**
 * UZ Aero - odczyt lotnisk i pasów z plików OurAirports.
 *
 * Zbiór jest w DOMENIE PUBLICZNEJ (bez klucza, bez limitów, bez wymogu atrybucji, choć
 * ją podajemy) i to on daje szkielet katalogu: kod ICAO, nazwę, pozycję i elewację.
 * Pasy bywają w nim niekompletne - uzupełnia je `osmRunways.ts`.
 *
 * PUŁAPKA, KTÓRA JUŻ RAZ KOSZTOWAŁA POPRAWNOŚĆ DANYCH (issue #3): w CSV brak wartości
 * to PUSTA KOMÓRKA, a `Number('')` daje `0` - i `Number.isFinite(0)` przechodzi. Katalog
 * dostał w ten sposób dwadzieścia lotnisk z kursem 0°, czyli pas narysowany na północ
 * tam, gdzie w rzeczywistości leży 06/24. Dlatego każda liczba z CSV przechodzi tu przez
 * `numberOrNull`, a nie przez gołe `Number`.
 */

import type { CsvRecord } from './csv';

/** Lotnisko bez pasa - szkielet rekordu katalogu. */
export interface AirfieldSeed {
  readonly icao: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly elevationFt: number | null;
}

/** Pas: to, co trafia na mapę śladu. */
export interface RunwayFacts {
  readonly headingDeg: number;
  readonly lengthM: number;
}

const FEET_TO_M = 0.3048;

/**
 * Typy lotnisk, które bierzemy. Mapa śladu rysuje miejsca, gdzie samolot LĄDUJE -
 * heliporty i lotniska zamknięte tylko zaśmieciłyby kadr.
 */
const KEEP_TYPES = new Set(['small_airport', 'medium_airport', 'large_airport']);

/**
 * Liczba z komórki CSV albo `null`.
 *
 * Pusta komórka, spacje i `NaN` znaczą TO SAMO - „źródło tego nie podaje" - i muszą
 * dać `null`, żeby wywołujący miał szansę sięgnąć po dane z innego źródła zamiast
 * dostać cichą zerową wartość.
 */
export function numberOrNull(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Polskie lotniska z prawdziwym kodem ICAO (`EP**`), posortowane po kodzie. */
export function polishAirfields(rows: readonly CsvRecord[]): AirfieldSeed[] {
  const round = (v: number, digits: number): number => Number(v.toFixed(digits));

  return rows
    .filter(
      (a) =>
        a.iso_country === 'PL' &&
        a.type != null &&
        KEEP_TYPES.has(a.type) &&
        a.ident != null &&
        /^EP[A-Z]{2}$/.test(a.ident),
    )
    .flatMap((a) => {
      const lat = numberOrNull(a.latitude_deg);
      const lon = numberOrNull(a.longitude_deg);
      // Lotnisko bez pozycji nie da się narysować, a wpisane z zerami wylądowałoby
      // u wybrzeży Afryki - takiego rekordu po prostu nie ma.
      if (lat == null || lon == null) return [];
      const elevation = numberOrNull(a.elevation_ft);
      return [
        {
          icao: a.ident!,
          name: (a.name ?? '').replace(/\s+/g, ' ').trim(),
          lat: round(lat, 5),
          lon: round(lon, 5),
          elevationFt: elevation == null ? null : Math.round(elevation),
        },
      ];
    })
    .sort((a, b) => a.icao.localeCompare(b.icao));
}

/** Wiersze pasów pogrupowane po kodzie lotniska. */
export function runwaysByAirfield(rows: readonly CsvRecord[]): Map<string, CsvRecord[]> {
  const out = new Map<string, CsvRecord[]>();
  for (const r of rows) {
    const ident = r.airport_ident;
    if (ident == null) continue;
    const list = out.get(ident);
    if (list == null) out.set(ident, [r]);
    else list.push(r);
  }
  return out;
}

/**
 * Najdłuższy CZYNNY pas lotniska - ten, który widać z powietrza.
 *
 * Wymagamy KOMPLETU: długości i kursu geograficznego. Rekord bez kursu nie jest „pasem
 * z kursem zero", tylko brakiem danych, i ma prawo zostać zastąpiony przez OSM.
 */
export function ourAirportsRunway(rows: readonly CsvRecord[] | undefined): RunwayFacts | null {
  if (rows == null) return null;

  let best: RunwayFacts | null = null;
  for (const r of rows) {
    if (r.closed === '1') continue;
    const lengthFt = numberOrNull(r.length_ft);
    const headingDeg = numberOrNull(r.le_heading_degT);
    if (lengthFt == null || lengthFt <= 0 || headingDeg == null) continue;

    const candidate: RunwayFacts = {
      headingDeg: Math.round(headingDeg) % 360,
      lengthM: Math.round(lengthFt * FEET_TO_M),
    };
    if (best == null || candidate.lengthM > best.lengthM) best = candidate;
  }
  return best;
}
