/**
 * UZ Aero — złożenie katalogu z dwóch źródeł.
 *
 * KOLEJNOŚĆ ŹRÓDEŁ jest decyzją, nie przypadkiem. Najpierw OurAirports (domena publiczna,
 * zero zobowiązań licencyjnych), a OSM tylko tam, gdzie OurAirports milczy — dzięki temu
 * ślad ODbL w katalogu jest tak mały, jak się da, przy pełnym pokryciu danych.
 *
 * Rekord z kursem, ale bez wiarygodnej długości, ODPADA do następnego źródła: pas
 * dwudziestometrowy albo dziesięciokilometrowy to nie „dane słabej jakości", tylko
 * pomyłka w źródle, a na mapie wygląda jak fakt.
 */

import type { CsvRecord } from './csv';
import type { OverpassWay } from './osmRunways';
import { ourAirportsRunway, type AirfieldSeed, type RunwayFacts } from './ourAirports';
import { runwaysFromWays } from './osmRunways';

/** Skąd pochodzi pas — potrzebne do atrybucji ODbL i do przeglądu zmian po regeneracji. */
export type RunwaySource = 'ourairports' | 'osm';

export interface CatalogueRunway extends RunwayFacts {
  readonly source: RunwaySource;
}

export interface AirfieldRecord extends AirfieldSeed {
  readonly runway: CatalogueRunway | null;
}

/**
 * Granice zdrowego rozsądku dla pasa. Najkrótsze polskie lądowiska mają ~300 m,
 * najdłuższy pas ~3,2 km; zapas w obie strony zostawia miejsce na błąd pomiaru,
 * ale odcina fragmenty dróg kołowania i geometrię sklejoną z dwóch lotnisk.
 */
export const MIN_RUNWAY_M = 150;
export const MAX_RUNWAY_M = 4500;

const isSane = (runway: RunwayFacts): boolean =>
  runway.lengthM >= MIN_RUNWAY_M &&
  runway.lengthM <= MAX_RUNWAY_M &&
  Number.isFinite(runway.headingDeg) &&
  runway.headingDeg >= 0 &&
  runway.headingDeg < 360;

/** Pas lotniska z pierwszego źródła, które podaje komplet sensownych danych. */
export function pickRunway(
  ourAirportsRows: readonly CsvRecord[] | undefined,
  osmWays: readonly OverpassWay[] | undefined,
): CatalogueRunway | null {
  const fromCsv = ourAirportsRunway(ourAirportsRows);
  if (fromCsv != null && isSane(fromCsv)) return { ...fromCsv, source: 'ourairports' };

  const fromOsm = runwaysFromWays(osmWays ?? []).find((r) => isSane(r));
  if (fromOsm != null) {
    return { headingDeg: fromOsm.headingDeg, lengthM: fromOsm.lengthM, source: 'osm' };
  }

  return null;
}

/** Katalog: szkielet z OurAirports plus pas z najlepszego dostępnego źródła. */
export function buildCatalogue(
  seeds: readonly AirfieldSeed[],
  ourAirportsRunways: ReadonlyMap<string, CsvRecord[]>,
  osmWays: ReadonlyMap<string, OverpassWay[]>,
): AirfieldRecord[] {
  return seeds.map((seed) => ({
    ...seed,
    runway: pickRunway(ourAirportsRunways.get(seed.icao), osmWays.get(seed.icao)),
  }));
}
