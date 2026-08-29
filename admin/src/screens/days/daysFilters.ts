/**
 * UZ Aero - panel: FILTRY LISTY DNI ↔ query string (moduł CZYSTY, testowany w Node).
 *
 * Filtry mieszkają w URL-u, nie w stanie komponentu
 * (`docs/architektura-panelu-frontend.md` §4.4): „wklej mi link do tych dni" jest
 * podstawowym scenariuszem współpracy, a filtr trzymany w `useState` to filtr,
 * którego nie da się wkleić, i lista, która gubi się po `F5`.
 *
 * ══ DLACZEGO STAN JEST JEDNYM CHIPEM, A NA SERWERZE TRZEMA PARAMETRAMI ══
 * Pasek „Stan" z `A02-dni.html` miesza trzy niezależne warunki bazy: `status`
 * (`active`/`closed`), `flagged` i `exported`. Dla człowieka to jednak JEDNO pytanie
 * - „co jest z tym dniem" - i chipy są wzajemnie wykluczające się także w mockupie.
 * Tłumaczenie jednego wyboru na właściwy parametr trasy jest więc treścią tego pliku,
 * a nie pominiętym uogólnieniem.
 *
 * **Chipa „W locie" nie ma i nie będzie, dopóki nie zapadnie decyzja człowieka.**
 * Projekcja `sessions` niesie `status`, nie niesie „silnik pracuje" - a lista celowo
 * nie woła `projectSession` (§7.1 architektury serwera). Chip, który filtrowałby po
 * `status=active` pod nazwą „W locie", kłamałby o każdym dniu, w którym samolot stoi.
 */

import type { OperationType } from '@uzaero/domain';

import type { SessionListQuery } from '../../api/sessions';
import { isOperationType } from './operations';

/**
 * Stan dnia jako JEDEN wybór. `all` to brak zawężenia, a nie szósty stan - dlatego
 * nie jest wartością żadnego pola serwera.
 */
export type StateFilter = 'all' | 'open' | 'flagged' | 'closed' | 'exported';

export type SortDirection = 'asc' | 'desc';

export interface DaysFilter {
  /** Dzień UTC `YYYY-MM-DD` włącznie; `null` = bez ograniczenia zakresu. */
  from: string | null;
  to: string | null;
  /** Identyfikator samolotu z rejestru floty - dopasowanie DOKŁADNE, nie prefiks. */
  aircraftId: string | null;
  /** Identyfikator konta pilota; dopasowuje PIC-a ALBO Duala (reguła serwera). */
  pilotId: string | null;
  state: StateFilter;
  operation: OperationType | null;
  sort: SortDirection;
}

/**
 * Domyślnie BEZ zawężenia i najnowsze na górze. Panel nie ustawia tu domyślnego
 * zakresu dat, mimo że mockup pokazuje „25 JUL → 31 JUL": ukryte zawężenie do
 * ostatniego tygodnia sprawiłoby, że kafel „dni w zakresie" i pusta lista mówiłyby
 * o czymś, czego nie widać w adresie.
 */
export const DEFAULT_DAYS_FILTER: DaysFilter = {
  from: null,
  to: null,
  aircraftId: null,
  pilotId: null,
  state: 'all',
  operation: null,
  sort: 'desc',
};

/**
 * Ile dni pobieramy jedną stroną. Tyle samo, co domyślny `limit` trasy - kolejne
 * strony dokłada KURSOR (`useSessions`), więc ta liczba nie ogranicza tego, co da się
 * zobaczyć; ogranicza tylko wielkość jednego żądania.
 */
export const DAYS_PAGE_LIMIT = 50;

const isState = (value: string | null): value is StateFilter =>
  value === 'all' ||
  value === 'open' ||
  value === 'flagged' ||
  value === 'closed' ||
  value === 'exported';

const isSort = (value: string | null): value is SortDirection =>
  value === 'asc' || value === 'desc';

/** `YYYY-MM-DD` i nic innego - wpis nieczytelny traktujemy jak brak filtra. */
const isDay = (value: string | null): value is string =>
  value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);

const trimmed = (value: string | null): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

/**
 * Query string → filtr. Wartości nieznane są POMIJANE, nie odrzucane: adres
 * z literówką ma pokazać listę domyślną, a nie stronę błędu.
 */
export function filterFromParams(params: URLSearchParams): DaysFilter {
  const state = params.get('stan');
  const operation = params.get('operacja');
  const sort = params.get('sort');

  return {
    from: isDay(params.get('od')) ? params.get('od') : null,
    to: isDay(params.get('do')) ? params.get('do') : null,
    aircraftId: trimmed(params.get('samolot')),
    pilotId: trimmed(params.get('pilot')),
    state: isState(state) ? state : DEFAULT_DAYS_FILTER.state,
    operation: isOperationType(operation) ? operation : null,
    sort: isSort(sort) ? sort : DEFAULT_DAYS_FILTER.sort,
  };
}

/**
 * Filtr → query string. Wartości domyślne POMIJAMY, żeby adres pełnej listy był po
 * prostu `#/dni` - link, który da się przeczytać i przepisać.
 */
export function paramsFromFilter(filter: DaysFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.from != null) params.od = filter.from;
  if (filter.to != null) params.do = filter.to;
  if (filter.aircraftId != null) params.samolot = filter.aircraftId;
  if (filter.pilotId != null) params.pilot = filter.pilotId;
  if (filter.state !== DEFAULT_DAYS_FILTER.state) params.stan = filter.state;
  if (filter.operation != null) params.operacja = filter.operation;
  if (filter.sort !== DEFAULT_DAYS_FILTER.sort) params.sort = filter.sort;
  return params;
}

/**
 * Jeden wybór stanu → parametry trasy. `flagged`/`exported` jadą jako `true`, nigdy
 * jako `false`: chip „Z flagą" pyta o dni z flagą, a nie o zaprzeczenie - stronę
 * negatywną filtra serwer umie, ale w mockupie nie ma na nią chipa i nie wymyślamy go.
 */
function stateQuery(state: StateFilter): Partial<SessionListQuery> {
  switch (state) {
    case 'open':
      return { status: 'active' };
    case 'closed':
      return { status: 'closed' };
    case 'flagged':
      return { flagged: true };
    case 'exported':
      return { exported: true };
    case 'all':
      return {};
  }
}

/**
 * Filtr ekranu → parametry trasy. Zakres dat jedzie jako DZIEŃ (`YYYY-MM-DD`), bo tak
 * przyjmuje go trasa i tak wygląda kalendarz na A02 - a górną granicę domyka serwer
 * do końca doby, żeby „od 25 do 31" nie gubiło ostatniego dnia.
 */
export function sessionListQuery(filter: DaysFilter): SessionListQuery {
  return {
    ...(filter.from == null ? {} : { from: filter.from }),
    ...(filter.to == null ? {} : { to: filter.to }),
    ...(filter.aircraftId == null ? {} : { aircraftId: filter.aircraftId }),
    ...(filter.pilotId == null ? {} : { pilotId: filter.pilotId }),
    ...stateQuery(filter.state),
    ...(filter.operation == null ? {} : { operation: filter.operation }),
    sort: filter.sort,
    limit: DAYS_PAGE_LIMIT,
  };
}

/**
 * Zapytanie o SAM LICZNIK dni w danym stanie, przy zachowanym pozostałym zawężeniu.
 *
 * Kafle nad tabelą muszą mówić o tym samym wycinku, co lista pod nią - inaczej
 * „2 dni z flagą" obok listy jednego samolotu byłoby zdaniem o czymś innym niż to,
 * na co człowiek patrzy. Stan podmieniamy, reszty filtra nie ruszamy.
 */
export function sessionCountQuery(filter: DaysFilter, state: StateFilter): SessionListQuery {
  // `limit: 1`, bo trasa wymaga liczby dodatniej - liczy się wyłącznie `total`.
  return { ...sessionListQuery({ ...filter, state }), limit: 1 };
}

/** Czy filtr zawęża cokolwiek - pusta lista mówi wtedy co innego (patrz `daysEmpty`). */
export function isNarrowed(filter: DaysFilter): boolean {
  return (
    filter.from != null ||
    filter.to != null ||
    filter.aircraftId != null ||
    filter.pilotId != null ||
    filter.state !== 'all' ||
    filter.operation != null
  );
}
