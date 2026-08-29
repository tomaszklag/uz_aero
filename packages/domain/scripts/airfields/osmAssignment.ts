/**
 * UZ Aero - który pas z OSM należy do którego lotniska.
 *
 * Overpass pytamy JEDNYM zapytaniem o wszystkie `aeroway=runway` w granicach Polski
 * (~830 wayów) zamiast o promień wokół każdego lotniska osobno: jedno zapytanie zamiast
 * stu jest uczciwsze wobec publicznego serwera i szybsze.
 *
 * Cena jest taka, że przypisanie trzeba zrobić u siebie. Robimy je przez NAJBLIŻSZE
 * lotnisko, a nie „każdy pas w promieniu": inaczej dwa lotniska leżące blisko siebie
 * dostałyby ten sam pas, a katalog pokazywałby pilotowi tę samą płytę w dwóch miejscach.
 */

import { distanceM, type LatLon } from './geo';
import type { OverpassWay } from './osmRunways';

/** Lotnisko z pozycją - tyle wystarczy, żeby przypisać pasy. */
export interface PlacedAirfield extends LatLon {
  readonly icao: string;
}

/**
 * Jak daleko od punktu odniesienia lotniska może leżeć jego pas.
 *
 * Punkt z OurAirports bywa wpisany na płycie, na wieży albo przy bramie, a najdłuższe
 * pasy w Polsce mają ~2,5 km - dwa i pół kilometra mieszczą oba te rozjazdy, a wciąż
 * są ciaśniejsze niż odstęp między jakąkolwiek parą polskich lotnisk.
 */
export const MAX_RUNWAY_DISTANCE_M = 2500;

/** Środek waya - do przypisania wystarczy punkt między jego końcami. */
function midpointOf(way: OverpassWay): LatLon | null {
  const geometry = way.geometry;
  if (geometry == null || geometry.length < 2) return null;
  const a = geometry[0]!;
  const b = geometry[geometry.length - 1]!;
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
}

/**
 * Waye pogrupowane po kodzie ICAO najbliższego lotniska.
 *
 * Waye dalsze niż `maxDistanceM` od każdego lotniska wypadają - to pasy lotnisk spoza
 * katalogu (wojskowych, heliportów, zagranicznych przy granicy).
 */
export function assignWaysToAirfields(
  ways: readonly OverpassWay[],
  airfields: readonly PlacedAirfield[],
  maxDistanceM: number = MAX_RUNWAY_DISTANCE_M,
): Map<string, OverpassWay[]> {
  const out = new Map<string, OverpassWay[]>();

  for (const way of ways) {
    const mid = midpointOf(way);
    if (mid == null) continue;

    let nearest: { icao: string; distance: number } | null = null;
    for (const airfield of airfields) {
      const distance = distanceM(mid, airfield);
      if (nearest == null || distance < nearest.distance) {
        nearest = { icao: airfield.icao, distance };
      }
    }
    if (nearest == null || nearest.distance > maxDistanceM) continue;

    const list = out.get(nearest.icao);
    if (list == null) out.set(nearest.icao, [way]);
    else list.push(way);
  }

  return out;
}
