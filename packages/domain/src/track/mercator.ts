/**
 * UZ Aero — odwzorowanie Web Mercator i dobór kafelków mapy.
 *
 * DLACZEGO WŁASNE, A NIE BIBLIOTEKA MAPOWA: aplikacja pilota unika modułów natywnych
 * z premedytacją (`ui/components/foundation/CheckIcon.tsx` — ptaszek rysowany layoutem,
 * żeby nie wciągać `react-native-svg`). Biblioteka mapowa to najcięższy możliwy moduł
 * natywny i wymusiłaby przebudowę dev clienta u każdego, kto klonuje repo. Ekran śladu
 * jest RETROSPEKTYWNY — pokazuje zamknięty lot, nie prowadzi nawigacji — więc potrzebuje
 * odwzorowania i siatki obrazków, a nie silnika mapowego z pełnym GL.
 *
 * Ta sama matematyka obsługuje obie powierzchnie: telefon układa z niej `<Image>`,
 * panel `<img>` i `<svg>`. Kafelki są standardowe (schemat XYZ, 256 px), więc źródło
 * da się wymienić na dowolnego dostawcę OSM bez ruszania tego pliku — a gdyby kiedyś
 * wróciła decyzja o pełnym MapLibre, to jest jedyne miejsce do wyrzucenia.
 */

import type { LatLon } from '../detection/geo';

/** Bok kafelka w pikselach — standard schematu XYZ. */
export const TILE_SIZE = 256;

/** Granica szerokości w Web Mercator: bieguny są w nieskończoności. */
const MAX_LATITUDE = 85.05112878;

/** Pozycja w pikselach globalnego płótna dla danego zoomu. */
export interface PixelPoint {
  x: number;
  y: number;
}

/** Prostokąt obejmujący zbiór punktów. */
export interface LatLonBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Kafelek do pobrania: adres w schemacie XYZ plus miejsce, w które go włożyć. */
export interface TileRef {
  x: number;
  y: number;
  z: number;
  /** Lewy górny róg kafelka we współrzędnych ekranu (px). */
  left: number;
  top: number;
}

/** Widok mapy: zoom plus lewy górny róg wycinka w pikselach globalnego płótna. */
export interface MapView {
  zoom: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const clampLat = (lat: number): number => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));

/** Pozycja → piksel globalnego płótna dla zoomu `z`. */
export function project(position: LatLon, zoom: number): PixelPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = clampLat(position.lat);
  const sin = Math.sin((lat * Math.PI) / 180);

  return {
    x: ((position.lon + 180) / 360) * scale,
    // Standardowe odwzorowanie Merkatora: oś Y rośnie na południe, stąd minus.
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Piksel globalnego płótna → pozycja. Odwrotność `project`. */
export function unproject(point: PixelPoint, zoom: number): LatLon {
  const scale = TILE_SIZE * 2 ** zoom;
  const n = Math.PI * (1 - (2 * point.y) / scale);

  return {
    lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI,
    lon: (point.x / scale) * 360 - 180,
  };
}

/** Prostokąt obejmujący zbiór pozycji; `null` dla pustego zbioru. */
export function boundsOf(points: readonly LatLon[]): LatLonBounds | null {
  if (points.length === 0) return null;

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const p of points) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lon > east) east = p.lon;
    if (p.lon < west) west = p.lon;
  }
  return { north, south, east, west };
}

/**
 * Widok, w którym cały ślad mieści się w oknie `width`×`height` z marginesem.
 *
 * Zoom schodzi do liczby CAŁKOWITEJ, bo kafelki istnieją tylko dla całkowitych poziomów;
 * skalowanie obrazków między poziomami dałoby rozmycie, którego nie da się niczym
 * nadrobić. Lepiej pokazać nieco więcej terenu niż nieostrą mapę.
 */
export function fitBounds(
  bounds: LatLonBounds,
  width: number,
  height: number,
  paddingPx = 24,
  maxZoom = 16,
): MapView {
  const usableW = Math.max(1, width - paddingPx * 2);
  const usableH = Math.max(1, height - paddingPx * 2);

  let zoom = maxZoom;
  for (let z = maxZoom; z >= 0; z--) {
    const nw = project({ lat: bounds.north, lon: bounds.west }, z);
    const se = project({ lat: bounds.south, lon: bounds.east }, z);
    if (se.x - nw.x <= usableW && se.y - nw.y <= usableH) {
      zoom = z;
      break;
    }
    zoom = z;
  }

  // Środek śladu w środku okna.
  const center = project(
    { lat: (bounds.north + bounds.south) / 2, lon: (bounds.east + bounds.west) / 2 },
    zoom,
  );

  return {
    zoom,
    originX: center.x - width / 2,
    originY: center.y - height / 2,
    width,
    height,
  };
}

/** Pozycja → piksel WEWNĄTRZ okna widoku. */
export function toScreen(position: LatLon, view: MapView): PixelPoint {
  const p = project(position, view.zoom);
  return { x: p.x - view.originX, y: p.y - view.originY };
}

/**
 * Kafelki potrzebne do pokrycia widoku, z gotowymi pozycjami na ekranie.
 *
 * Kafelki spoza zakresu osi X zawijamy modulo (mapa jest cylindrem), a spoza osi Y
 * pomijamy — nad biegunem nie ma czego rysować.
 */
export function tilesFor(view: MapView): TileRef[] {
  const count = 2 ** view.zoom;
  const firstX = Math.floor(view.originX / TILE_SIZE);
  const firstY = Math.floor(view.originY / TILE_SIZE);
  const lastX = Math.floor((view.originX + view.width) / TILE_SIZE);
  const lastY = Math.floor((view.originY + view.height) / TILE_SIZE);

  const tiles: TileRef[] = [];
  for (let y = firstY; y <= lastY; y++) {
    if (y < 0 || y >= count) continue;
    for (let x = firstX; x <= lastX; x++) {
      tiles.push({
        x: ((x % count) + count) % count,
        y,
        z: view.zoom,
        left: x * TILE_SIZE - view.originX,
        top: y * TILE_SIZE - view.originY,
      });
    }
  }
  return tiles;
}

/**
 * Długość podziałki skali: ile pikseli odpowiada „ładnej" liczbie metrów.
 *
 * Szukamy największej wartości z ciągu 1-2-5, która mieści się w `maxPx` — tak działają
 * podziałki na wszystkich mapach i dzięki temu pod kreską stoi „2 km", a nie „1,87 km".
 */
export function scaleBar(
  view: MapView,
  latitude: number,
  maxPx = 90,
): { meters: number; pixels: number } {
  const metersPerPixel =
    (156543.03392 * Math.cos((clampLat(latitude) * Math.PI) / 180)) / 2 ** view.zoom;
  const maxMeters = metersPerPixel * maxPx;

  const pow = 10 ** Math.floor(Math.log10(maxMeters));
  const candidates = [pow, pow * 2, pow * 5];
  let meters = pow;
  for (const c of candidates) {
    if (c <= maxMeters) meters = c;
  }

  return { meters, pixels: meters / metersPerPixel };
}
