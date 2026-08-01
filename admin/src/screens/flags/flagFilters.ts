/**
 * UZ Aero — panel: FILTRY SKRZYNKI ↔ query string (moduł CZYSTY, testowany w Node).
 *
 * Filtry mieszkają w URL-u, nie w stanie komponentu
 * (`docs/architektura-panelu-frontend.md` §4.4): „wklej mi link do tych flag" jest
 * podstawowym scenariuszem współpracy, a filtr trzymany w `useState` to filtr,
 * którego nie da się wkleić, i lista, która gubi się po `F5`.
 *
 * Domyślny status to `open` i ustawia go PANEL, jawnie. Serwer celowo nie zawęża nic
 * sam — domyślne zawężenie w API byłoby niewidoczną regułą, przez którą liczniki
 * przestałyby się zgadzać z tym, co widać na ekranie.
 */

import type { FlagStatus, FlagType } from '@uzaero/domain';

import type { FlagListQuery } from '../../api/flags';
import { FLAG_TYPE_META } from './flagTypes';

/** `all` to brak filtra statusu, a nie trzeci status — dlatego nie jest `FlagStatus`. */
export type StatusFilter = FlagStatus | 'all';

export interface FlagFilter {
  status: StatusFilter;
  /** `null` = wszystkie typy. */
  type: FlagType | null;
  /** Dokładny UUID sesji — jedyne wyszukiwanie, jakie umie dziś trasa listy. */
  sessionUuid: string | null;
  /** Dzień UTC `YYYY-MM-DD` włącznie; `null` = bez ograniczenia. */
  from: string | null;
  to: string | null;
}

export const DEFAULT_FLAG_FILTER: FlagFilter = {
  status: 'open',
  type: null,
  sessionUuid: null,
  from: null,
  to: null,
};

/**
 * Ile spraw pobieramy naraz. Skrzynka jest zbiorem SPRAW DO ZAMKNIĘCIA, więc jej
 * naturalny rozmiar to kilkanaście pozycji; `total` z odpowiedzi mówi, ile ich jest
 * naprawdę, więc obcięcie nigdy nie jest ciche.
 */
export const FLAG_PAGE_LIMIT = 100;

const isStatus = (value: string | null): value is StatusFilter =>
  value === 'open' || value === 'resolved' || value === 'all';

const isType = (value: string | null): value is FlagType =>
  value != null && Object.hasOwn(FLAG_TYPE_META, value);

/** `YYYY-MM-DD` i nic innego — wpis nieczytelny traktujemy jak brak filtra. */
const isDay = (value: string | null): value is string =>
  value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Query string → filtr. Wartości nieznane są POMIJANE, nie odrzucane: adres
 * z literówką ma pokazać skrzynkę domyślną, a nie pustą stronę błędu.
 */
export function filterFromParams(params: URLSearchParams): FlagFilter {
  const status = params.get('status');
  const type = params.get('type');
  const sessionUuid = params.get('sesja');
  const from = params.get('od');
  const to = params.get('do');

  return {
    status: isStatus(status) ? status : DEFAULT_FLAG_FILTER.status,
    type: isType(type) ? type : null,
    sessionUuid: sessionUuid != null && sessionUuid.trim() !== '' ? sessionUuid.trim() : null,
    from: isDay(from) ? from : null,
    to: isDay(to) ? to : null,
  };
}

/**
 * Filtr → query string. Wartości domyślne POMIJAMY, żeby adres skrzynki otwartej
 * spraw był po prostu `#/flagi` — link, który da się przeczytać i przepisać.
 */
export function paramsFromFilter(filter: FlagFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.status !== DEFAULT_FLAG_FILTER.status) params.status = filter.status;
  if (filter.type != null) params.type = filter.type;
  if (filter.sessionUuid != null) params.sesja = filter.sessionUuid;
  if (filter.from != null) params.od = filter.from;
  if (filter.to != null) params.do = filter.to;
  return params;
}

/** Początek dnia UTC w epoch ms; `null` dla braku filtra. */
const startOfDayMs = (day: string | null): number | undefined =>
  day == null ? undefined : Date.parse(`${day}T00:00:00.000Z`);

/** Koniec dnia UTC — zakres z mockupu jest obustronnie DOMKNIĘTY. */
const endOfDayMs = (day: string | null): number | undefined =>
  day == null ? undefined : Date.parse(`${day}T23:59:59.999Z`);

/**
 * Filtr ekranu → parametry trasy. Tu, i tylko tu, dni UTC zamieniają się na epoch ms:
 * kontrakt panelu ma jedną jednostkę czasu, a adres ma być czytelny dla człowieka.
 */
export function flagListQuery(filter: FlagFilter): FlagListQuery {
  return {
    ...(filter.status === 'all' ? {} : { status: filter.status }),
    ...(filter.type == null ? {} : { type: filter.type }),
    ...(filter.sessionUuid == null ? {} : { sessionUuid: filter.sessionUuid }),
    ...(filter.from == null ? {} : { from: startOfDayMs(filter.from) }),
    ...(filter.to == null ? {} : { to: endOfDayMs(filter.to) }),
    limit: FLAG_PAGE_LIMIT,
  };
}

/** Czy filtr zawęża cokolwiek ponad domyślny status — stan pusty mówi wtedy co innego. */
export function isNarrowed(filter: FlagFilter): boolean {
  return filter.type != null || filter.sessionUuid != null || filter.from != null || filter.to != null;
}
