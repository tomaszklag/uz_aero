/**
 * UZ Aero — źródło kafelków mapy dla ekranu śladu (14).
 *
 * Kafelki są JEDYNĄ rzeczą na tym ekranie wymagającą sieci — ślad, profil i log liczą
 * się z zapisu na telefonie. Dlatego brak kafelków nigdy nie jest błędem, tylko
 * wariantem 14A: trasa rysuje się na siatce współrzędnych.
 *
 * DOSTAWCA JEST DO USTAWIENIA PRZED WDROŻENIEM. Domyślny adres wskazuje na publiczny
 * serwer OpenStreetMap, którego regulamin (`operations.osmfoundation.org/policies/tiles/`)
 * **wyklucza aplikacje produkcyjne** — to serwer utrzymywany z darowizn na potrzeby mapy
 * na osm.org, nie darmowy CDN. Do developmentu wystarczy, do sklepu nie: wtedy trzeba
 * podać `EXPO_PUBLIC_TILE_URL` dostawcy z darmowym progiem (MapTiler, Stadia, Geoapify)
 * albo własny serwer kafelków. Dane pozostają te same — OpenStreetMap — zmienia się
 * wyłącznie to, czyj serwer je podaje.
 *
 * Format: szablon XYZ z `{z}`, `{x}`, `{y}`. Klucz API, jeśli dostawca go wymaga,
 * wchodzi w ten sam adres jako parametr zapytania.
 */

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Wymagana atrybucja — widoczna na mapie, bo licencja ODbL tego wymaga. */
export const TILE_ATTRIBUTION = '© OpenStreetMap';

export function tileUrlTemplate(): string {
  const explicit = process.env.EXPO_PUBLIC_TILE_URL;
  return explicit != null && explicit.length > 0 ? explicit : DEFAULT_TILE_URL;
}

/** Podstawia współrzędne kafelka w szablon. */
export function tileUrl(template: string, x: number, y: number, z: number): string {
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}
