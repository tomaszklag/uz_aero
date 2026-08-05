/**
 * UZ Aero — geometria na potrzeby generatora katalogu lotnisk.
 *
 * Skala jest tu lokalna (pojedyncze lotnisko, kilka kilometrów), więc płaskie
 * przybliżenie wystarcza z zapasem: błąd rzutowania na tym dystansie jest mniejszy
 * niż rozdzielczość, z jaką rysujemy pas na mapie śladu.
 *
 * To NIE jest duplikat `packages/domain/src/detection/geo.ts` — tamten liczy dystanse
 * w milach morskich dla detekcji lotu i jest częścią runtime'u. Ten moduł żyje wyłącznie
 * w narzędziu budującym dane i mówi w metrach, bo w metrach podaje się pasy.
 */

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Odległość w metrach (haversine). */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Kurs geograficzny z `a` do `b` (stopnie 0–360, od północy zgodnie z ruchem wskazówek). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const dLon = rad(b.lon - a.lon);
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Oś pasa: kurs sprowadzony do 0–180.
 *
 * Pas 09/27 to jedna i ta sama płyta — 90° i 270° opisują ją tak samo dobrze. Do
 * grupowania odcinków interesuje nas OŚ, a nie kierunek, w którym ktoś narysował linię.
 */
export function axisDeg(headingDeg: number): number {
  return ((headingDeg % 180) + 180) % 180;
}

/** Różnica dwóch osi (0–90) — z zawinięciem przez 180°, więc 179° i 1° dzieli 2°. */
export function axisDifference(a: number, b: number): number {
  const d = Math.abs(axisDeg(a) - axisDeg(b)) % 180;
  return d > 90 ? 180 - d : d;
}

/**
 * Punkt w metrach względem początku układu: `x` na wschód, `y` na północ.
 * Południki zbiegają się z szerokością, stąd `cos(lat)` przy długości geograficznej.
 */
export function toMeters(point: LatLon, origin: LatLon): { x: number; y: number } {
  const latM = 111_132;
  const lonM = 111_320 * Math.cos(rad(origin.lat));
  return {
    x: (point.lon - origin.lon) * lonM,
    y: (point.lat - origin.lat) * latM,
  };
}

/**
 * Rzut punktu na oś o zadanym kursie — współrzędna WZDŁUŻ pasa.
 *
 * Dzięki temu długość liczy się z rozrzutu na osi, a nie z odległości między skrajnymi
 * punktami: dwa równoległe pasy obok siebie dają ten sam rozrzut wzdłużny co jeden,
 * zamiast sztucznie wydłużonej przekątnej.
 */
export function projectOnAxis(point: LatLon, origin: LatLon, headingDeg: number): number {
  const { x, y } = toMeters(point, origin);
  const theta = rad(headingDeg);
  return x * Math.sin(theta) + y * Math.cos(theta);
}
