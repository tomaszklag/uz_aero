/**
 * UZ Aero - panel: FILTRY FLOTY ↔ query string (moduł CZYSTY, testowany w Node).
 *
 * Filtry mieszkają w URL-u, nie w stanie komponentu
 * (`docs/architektura-panelu-frontend.md` §4.4): „wklej mi link do wyłączonych
 * jednostek" jest tym samym scenariuszem, co przy dniach i kontach, a filtr trzymany
 * w `useState` to filtr, którego nie da się wkleić.
 *
 * ══ DLACZEGO STAN JEST JEDNYM CHIPEM, A NA SERWERZE DWOMA PARAMETRAMI ══
 * Pasek z `A07-flota.html` miesza dwa niezależne warunki bazy: `service_status`
 * (`active`/`disabled`) i „czy ktoś trzyma jednostkę" (`claimed`). Dla człowieka to
 * jednak JEDNO pytanie - „co jest z tym samolotem" - a chipy wykluczają się wzajemnie
 * także w mockupie. Tłumaczenie jednego wyboru na właściwy parametr trasy jest więc
 * treścią tego pliku, a nie pominiętym uogólnieniem. Ta sama konstrukcja, co
 * `daysFilters.ts`.
 */

import type { FleetListQuery } from '../../api/fleet';

/**
 * Zakres listy jako JEDEN wybór. `all` to brak zawężenia, a nie czwarty stan - dlatego
 * nie jest wartością żadnego pola serwera.
 */
export type FleetScope = 'all' | 'active' | 'disabled' | 'claimed';

export interface FleetFilter {
  scope: FleetScope;
  /** Fragment rejestracji albo typu; `null` = bez wyszukiwania. */
  search: string | null;
}

export const DEFAULT_FLEET_FILTER: FleetFilter = { scope: 'all', search: null };

/** Segment adresu otwierający szufladę z PUSTYM formularzem (`#/flota/nowy`). */
export const NEW_AIRCRAFT_SEGMENT = 'nowy';

const isScope = (value: string | null): value is FleetScope =>
  value === 'all' || value === 'active' || value === 'disabled' || value === 'claimed';

const trimmed = (value: string | null): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

/**
 * Query string → filtr. Wartości nieznane są POMIJANE, nie odrzucane: adres
 * z literówką ma pokazać listę domyślną, a nie stronę błędu.
 */
export function filterFromParams(params: URLSearchParams): FleetFilter {
  const scope = params.get('zakres');
  return {
    scope: isScope(scope) ? scope : DEFAULT_FLEET_FILTER.scope,
    search: trimmed(params.get('szukaj')),
  };
}

/**
 * Filtr → query string. Wartości domyślne POMIJAMY, żeby adres pełnej listy był po
 * prostu `#/flota` - link, który da się przeczytać i przepisać.
 */
export function paramsFromFilter(filter: FleetFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.scope !== DEFAULT_FLEET_FILTER.scope) params.zakres = filter.scope;
  if (filter.search != null) params.szukaj = filter.search;
  return params;
}

/**
 * Jeden wybór zakresu → parametry trasy. `claimed` jedzie jako `'true'`, nigdy jako
 * `'false'`: chip pyta o jednostki zajęte, a nie o zaprzeczenie - stronę negatywną
 * filtra serwer umie, ale w mockupie nie ma na nią chipa i nie wymyślamy go.
 */
function scopeQuery(scope: FleetScope): Partial<FleetListQuery> {
  switch (scope) {
    case 'active':
      return { status: 'active' };
    case 'disabled':
      return { status: 'disabled' };
    case 'claimed':
      return { claimed: 'true' };
    case 'all':
      return {};
  }
}

export function fleetListQuery(filter: FleetFilter): FleetListQuery {
  return {
    ...scopeQuery(filter.scope),
    ...(filter.search == null ? {} : { q: filter.search }),
  };
}

/** Czy filtr zawęża cokolwiek - pusta lista mówi wtedy co innego (patrz `fleetEmpty`). */
export function isNarrowed(filter: FleetFilter): boolean {
  return filter.scope !== 'all' || filter.search != null;
}

/** Adres szuflady jednostki z ZACHOWANYM zawężeniem listy pod spodem. */
export function aircraftHref(filter: FleetFilter, id: string): string {
  const query = new URLSearchParams(paramsFromFilter(filter)).toString();
  return `/flota/${encodeURIComponent(id)}${query === '' ? '' : `?${query}`}`;
}

/** Adres szuflady „Dodaj samolot" - ten sam ekran z pustym formularzem. */
export function newAircraftHref(filter: FleetFilter): string {
  return aircraftHref(filter, NEW_AIRCRAFT_SEGMENT);
}

/** Adres listy dni ZAWĘŻONEJ do tej jednostki. */
export function daysHref(aircraftId: string): string {
  return `/dni?samolot=${encodeURIComponent(aircraftId)}`;
}

/** Adres KARTY DNIA (`A02a`) - pełna strona, nie szuflada. */
export function dayHref(sessionUuid: string): string {
  return `/dni/${encodeURIComponent(sessionUuid)}`;
}

export interface DayLink {
  to: string;
  label: string;
}

/**
 * Przejście z wiersza floty do dni - dla KAŻDEJ jednostki, nie tylko zajętej.
 *
 * Do 2026-08-01 przycisk pojawiał się wyłącznie przy `claim != null`, czyli w przypadku
 * NAJRZADSZYM, a prowadził i tak na listę dni zawężoną do samolotu - więc warunek nie
 * miał uzasadnienia i odbierał dostęp do historii jednostki wolnej, czyli tej, o którą
 * pyta się najczęściej („co się działo na SP-KWA przed remontem").
 *
 * Cel zależy od tego, co o wierszu WIADOMO: przy otwartym dniu serwer podaje jego
 * `sessionUuid` (`AdminAircraftClaim`), więc link celuje wprost w kartę tego dnia -
 * i to jest jedyny konsument tego pola. Bez claimu nie ma jednego dnia, o który chodzi,
 * więc link zawęża listę do jednostki.
 */
export function dayLink(aircraftId: string, sessionUuid: string | null): DayLink {
  if (sessionUuid != null) return { to: dayHref(sessionUuid), label: 'Otwarty dzień' };
  return { to: daysHref(aircraftId), label: 'Dni lotne' };
}
