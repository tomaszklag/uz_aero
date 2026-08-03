/**
 * UZ Aero — panel: FILTRY REJESTRU ZDARZEŃ ↔ query string (moduł CZYSTY).
 *
 * Filtry mieszkają w URL-u, nie w stanie komponentu
 * (`docs/architektura-panelu-frontend.md` §4.4) — i na tym ekranie to nie jest wygoda,
 * tylko WYMAGANIE. `ANALIZA` §3 nazywa deep link do rejestru podstawowym scenariuszem
 * współpracy („gdzie jest zdarzenie `uuid=…`, które telefon uważa za wysłane"), a karta
 * dnia i pulpit prowadzą tu z GOTOWYM zawężeniem. Filtr trzymany w `useState` uczyniłby
 * z tych linków wejście na surową listę wszystkiego.
 *
 * ══ DWA ALFABETY I TO JEST ŚWIADOME ══
 * Klucze TEGO query stringa są po polsku (`?od=`, `?samolot=`, `?typ=`), bo to adres
 * produktu widoczny w pasku przeglądarki. Klucze żądania do serwera są po angielsku
 * (`?from=`, `?aircraftId=`, `?type=`), bo to kontrakt kodu. Tłumaczenie jednego na
 * drugie jest tutaj i nigdzie indziej — `eventsListQuery` niżej.
 *
 * Wartość NIEZNANA jest POMIJANA, nie odrzucana: adres z literówką ma pokazać rejestr,
 * a nie stronę błędu. Wyjątkiem jest serwer, który po nieznanym typie odmawia
 * czterysetką — dlatego `typ` przepuszczamy wyłącznie z katalogu.
 */

import type { EventListQuery } from '../../api/events';
import { isKnownEventType } from './eventCatalog';

export type SortDirection = 'asc' | 'desc';

export interface EventsFilter {
  /** DOKŁADNY uuid zdarzenia — główny scenariusz ekranu. */
  uuid: string | null;
  sessionUuid: string | null;
  aircraftId: string | null;
  pilotId: string | null;
  sourceDevice: string | null;
  /** Kod z KATALOGU domeny; `null` = wszystkie typy. */
  type: string | null;
  /** Dzień UTC `YYYY-MM-DD` włącznie, po CZASIE PRZYJĘCIA; `null` = bez ograniczenia. */
  from: string | null;
  to: string | null;
  sort: SortDirection;
}

/**
 * Domyślnie BEZ zawężenia i najnowsze na górze — jak nagłówek `received_at ↓`
 * w mockupie. Panel nie ustawia domyślnego zakresu dat: ukryte zawężenie do ostatniego
 * tygodnia sprawiłoby, że kafle i pusta lista mówiłyby o czymś, czego nie widać
 * w adresie — a ten ekran istnieje po to, żeby adres dało się wkleić w zgłoszeniu.
 */
export const DEFAULT_EVENTS_FILTER: EventsFilter = {
  uuid: null,
  sessionUuid: null,
  aircraftId: null,
  pilotId: null,
  sourceDevice: null,
  type: null,
  from: null,
  to: null,
  sort: 'desc',
};

/**
 * Ile zdarzeń pobieramy jedną stroną. Kolejne dokłada KURSOR, więc ta liczba nie
 * ogranicza tego, co da się zobaczyć; ogranicza wielkość jednego żądania.
 */
export const EVENTS_PAGE_LIMIT = 50;

const isSort = (value: string | null): value is SortDirection =>
  value === 'asc' || value === 'desc';

/**
 * `YYYY-MM-DD` i nic innego — wpis nieczytelny traktujemy jak brak filtra.
 *
 * Sprawdzamy KSZTAŁT **oraz** SENSOWNOŚĆ, a nie sam regex: `2026-13-45` przechodzi
 * wzorzec, ale nie jest datą, a `Date.UTC(2026, 12, 45)` po cichu przewija się na
 * luty 2027. Zakres cofnięty o pół roku bez ani jednego komunikatu to najgorszy
 * możliwy sposób na zgubienie danych w narzędziu śledczym — lepiej pokazać pełny
 * rejestr niż zawężenie, o które nikt nie prosił.
 */
const isDay = (value: string | null): value is string => {
  if (value == null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  // `Number.isNaN` PRZED `toISOString`, bo na dacie nieprawidłowej ta metoda RZUCA
  // (`RangeError`) — a filtr z adresu nie ma prawa wywrócić ekranu.
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip: data, która po sparsowaniu wypisuje się inaczej, nie istniała.
  return parsed.toISOString().startsWith(value);
};

const trimmed = (value: string | null): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

export function filterFromParams(params: URLSearchParams): EventsFilter {
  const sort = params.get('sort');
  const type = params.get('typ');

  return {
    uuid: trimmed(params.get('uuid')),
    sessionUuid: trimmed(params.get('sesja')),
    aircraftId: trimmed(params.get('samolot')),
    pilotId: trimmed(params.get('pilot')),
    sourceDevice: trimmed(params.get('urzadzenie')),
    // Typ spoza katalogu POMIJAMY zamiast wysyłać: serwer odmówiłby czterysetką,
    // a literówka w adresie ma pokazać rejestr, nie stronę błędu.
    type: isKnownEventType(type) ? type : null,
    from: isDay(params.get('od')) ? params.get('od') : null,
    to: isDay(params.get('do')) ? params.get('do') : null,
    sort: isSort(sort) ? sort : DEFAULT_EVENTS_FILTER.sort,
  };
}

/**
 * Filtr → query string EKRANU. Wartości domyślne POMIJAMY, żeby adres pełnego rejestru
 * był po prostu `#/zdarzenia` — link, który da się przeczytać i przepisać.
 */
export function paramsFromFilter(filter: EventsFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.uuid != null) params.uuid = filter.uuid;
  if (filter.sessionUuid != null) params.sesja = filter.sessionUuid;
  if (filter.aircraftId != null) params.samolot = filter.aircraftId;
  if (filter.pilotId != null) params.pilot = filter.pilotId;
  if (filter.sourceDevice != null) params.urzadzenie = filter.sourceDevice;
  if (filter.type != null) params.typ = filter.type;
  if (filter.from != null) params.od = filter.from;
  if (filter.to != null) params.do = filter.to;
  if (filter.sort !== DEFAULT_EVENTS_FILTER.sort) params.sort = filter.sort;
  return params;
}

/**
 * Adres ekranu dla danego filtra — JEDNO miejsce, w którym powstaje link do rejestru.
 *
 * Używają go: pulpit (karta „Ostatnio przyjęte"), karta dnia („Zobacz w rejestrze"),
 * kolumny tabeli (zawęź do samolotu / pilota / sesji) i plakietka typu. Rozjazd między
 * nimi kończyłby się martwym linkiem w jednej z kilku dróg.
 */
export function eventsHref(filter: EventsFilter): string {
  const query = new URLSearchParams(paramsFromFilter(filter)).toString();
  return query === '' ? '/zdarzenia' : `/zdarzenia?${query}`;
}

/** Skrót dla wejścia z kontekstem: „pokaż surowe zdarzenia TEGO dnia lotnego". */
export function sessionEventsHref(sessionUuid: string): string {
  return eventsHref({ ...DEFAULT_EVENTS_FILTER, sessionUuid });
}

/** Skrót dla wejścia z kontekstem: „pokaż DOKŁADNIE to zdarzenie". */
export function eventHref(uuid: string): string {
  return eventsHref({ ...DEFAULT_EVENTS_FILTER, uuid });
}

/**
 * Filtr ekranu → parametry trasy. Zakres dat jedzie jako DZIEŃ (`YYYY-MM-DD`), bo tak
 * przyjmuje go trasa — a górną granicę domyka serwer do końca doby, żeby „od 25 do 31"
 * nie gubiło ostatniego dnia.
 */
export function eventsListQuery(filter: EventsFilter): EventListQuery {
  return {
    ...(filter.type == null ? {} : { type: [filter.type] }),
    ...(filter.uuid == null ? {} : { uuid: filter.uuid }),
    ...(filter.sessionUuid == null ? {} : { sessionUuid: filter.sessionUuid }),
    ...(filter.aircraftId == null ? {} : { aircraftId: filter.aircraftId }),
    ...(filter.pilotId == null ? {} : { pilotId: filter.pilotId }),
    ...(filter.sourceDevice == null ? {} : { sourceDevice: filter.sourceDevice }),
    ...(filter.from == null ? {} : { from: filter.from }),
    ...(filter.to == null ? {} : { to: filter.to }),
    sort: filter.sort,
    limit: EVENTS_PAGE_LIMIT,
  };
}

/** Czy filtr cokolwiek zawęża — pusta lista mówi wtedy co innego (`eventsPages`). */
export function isNarrowed(filter: EventsFilter): boolean {
  return (
    filter.uuid != null ||
    filter.sessionUuid != null ||
    filter.aircraftId != null ||
    filter.pilotId != null ||
    filter.sourceDevice != null ||
    filter.type != null ||
    filter.from != null ||
    filter.to != null
  );
}

/**
 * Czy zawężenie sprowadza się DOKŁADNIE do jednego uuid-a zdarzenia.
 *
 * Rozstrzyga o stanie pustym, który `ANALIZA` §5 wymienia jako najczęstsze pytanie tego
 * ekranu: „zdarzenie `<uuid>` nie dotarło na serwer". Pustka odpowiada wtedy na inne
 * pytanie niż przy filtrze po dacie, więc nie wolno użyć jednego napisu na oba.
 */
export function isUuidLookup(filter: EventsFilter): boolean {
  return (
    filter.uuid != null &&
    filter.sessionUuid == null &&
    filter.aircraftId == null &&
    filter.pilotId == null &&
    filter.sourceDevice == null &&
    filter.type == null &&
    filter.from == null &&
    filter.to == null
  );
}
