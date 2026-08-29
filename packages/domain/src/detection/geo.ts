/**
 * UZ Aero - geometria na kuli: pozycja i odległość.
 *
 * Osobny moduł, bo z tych dwóch rzeczy korzystają teraz trzy niezależne tory detekcji
 * (geofence lądowania, test plauzybilności skoku, kotwica postoju przy kołowaniu).
 * Trzymanie ich w `flightDetector.ts` robiło z niego jednocześnie automat i bibliotekę
 * matematyczną, a `trends.ts` musiałby importować automat, żeby policzyć odległość.
 */

const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Metry na milę morską - progi bliskiego zasięgu (kotwica postoju) myśli się w metrach. */
export const METERS_PER_NM = 1852;

/** Pozycja geograficzna (stopnie dziesiętne). */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Odległość po ortodromie (haversine) w milach morskich. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(s));
}

/** Odległość w metrach - wygodne przy progach rzędu kilkunastu metrów. */
export function distanceM(a: LatLon, b: LatLon): number {
  return distanceNm(a, b) * METERS_PER_NM;
}

/**
 * Środek ciężkości zbioru pozycji.
 *
 * Uśrednianie stopni wprost jest tu poprawne: wszystkie punkty, dla których tego
 * używamy, leżą kilkanaście metrów od siebie (postój samolotu), więc ani zbieżność
 * południków, ani przejście przez 180° nie wchodzą w grę. Centroid, a nie pojedynczy
 * fix, bo chodzi o odsianie dryfu odbiornika stojącego w miejscu.
 */
export function centroid(points: readonly LatLon[]): LatLon | null {
  if (points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  return { lat, lon };
}

/**
 * Różnica kursów w zakresie −180…180 stopni (dodatnia = w prawo).
 * Bez tego suma zmian kursu przez północ dawałaby skok o 360°.
 */
export function headingDeltaDeg(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}
