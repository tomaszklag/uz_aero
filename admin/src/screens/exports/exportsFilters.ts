/**
 * UZ Aero - panel: FILTRY MONITORA EKSPORTU ↔ query string (moduł CZYSTY, Node).
 *
 * Filtry mieszkają w URL-u, nie w stanie komponentu
 * (`docs/architektura-panelu-frontend.md` §4.4): „wklej mi link do tego dnia" jest
 * podstawowym scenariuszem współpracy, a filtr trzymany w `useState` to filtr, którego
 * nie da się wkleić, i lista, która gubi się po `F5`.
 *
 * ══ CHIP „STAN" JEST TU JEDNYM PARAMETREM, INACZEJ NIŻ NA LIŚCIE DNI ══
 * Na `A02` pasek stanu miesza trzy niezależne warunki bazy (`status`, `flagged`,
 * `exported`). Tutaj stan karty jest JEDNĄ wielkością, wnioskowaną przez serwer, więc
 * chip przekłada się wprost na `?state=`. Chip „Rewizje" jest jedynym wyjątkiem i jest
 * opisany niżej - regeneracja nie jest stanem, tylko WYMIAREM przecinającym stany.
 */

import type { ExportListQuery } from '../../api/exports';
import type { ExportStateDto } from '../../api/dto';

/**
 * Zawężenie listy. `all` to brak zawężenia, a nie siódmy stan; `revised` nie jest
 * stanem serwera, tylko pytaniem „które karty wracały do arkusza" - obsługuje je
 * `exportsRows.ts`, bo serwer takiego parametru nie ma, a wymyślanie go tylko po to,
 * żeby chip wyglądał jak pozostałe, dołożyłoby trasie wymiar bez odbiorcy.
 *
 * `revised` przecina stany: zawęża WYŁĄCZNIE po numerze rewizji (`> 1`), a nie wśród
 * kart istniejących. Dzień z rewizją 3, na którym otwarto później flagę, jest więc
 * „regeneracją" tak samo jak dzień z rewizją 3 leżący w arkuszu - i tak samo liczy go
 * serwer (`counts.revised`), więc liczba na chipie zgadza się z tym, co widać.
 */
export type ExportScope = 'all' | ExportStateDto | 'revised';

export interface ExportsFilter {
  /** Dzień UTC `YYYY-MM-DD` włącznie; `null` = bez ograniczenia zakresu. */
  from: string | null;
  to: string | null;
  /** Identyfikator samolotu z rejestru floty - dopasowanie DOKŁADNE. */
  aircraftId: string | null;
  /** Fragment rejestracji, identyfikatora samolotu albo uuid-a sesji. */
  search: string | null;
  scope: ExportScope;
}

/**
 * Domyślnie BEZ zawężenia. Mockup pokazuje w pasku adresu `?dni=7`, ale panel NIE
 * ustawia ukrytego zakresu: zawężenie, którego nie widać w adresie, sprawia, że pusta
 * lista i liczniki mówią o czymś innym niż to, co człowiek sądzi, że widzi. Zakres
 * ustawia się jawnie i jest wtedy w linku.
 */
export const DEFAULT_EXPORTS_FILTER: ExportsFilter = {
  from: null,
  to: null,
  aircraftId: null,
  search: null,
  scope: 'all',
};

/**
 * Ile dni pobieramy jednym żądaniem. Bez kursora - monitor jest zawężony do zakresu
 * dat, a nie do strony (uzasadnienie w `queries/useExports.ts`).
 *
 * Ta liczba jest BEZPIECZNIKIEM, nie stronicowaniem, i jedzie w `?limit=`. Liczniki
 * i tak opisują CAŁY zakres (liczy je serwer poza `LIMIT`-em), a gdy zakres tę liczbę
 * przekroczy, odpowiedź niesie `truncated` i ekran mówi o tym banerem
 * (`exportsTiles.truncationNotice`). Do 2026-08-01 stała nie była używana NIGDZIE:
 * `exportListQuery` nie wysyłało limitu, a docblock obiecywał komunikat, którego na
 * ekranie nie było.
 */
export const EXPORTS_PAGE_LIMIT = 200;

const SCOPES: readonly ExportScope[] = [
  'all',
  'current',
  'revised',
  'blocked',
  'missing',
  'waiting',
  'impossible',
];

const isScope = (value: string | null): value is ExportScope =>
  value != null && (SCOPES as readonly string[]).includes(value);

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
export function filterFromParams(params: URLSearchParams): ExportsFilter {
  const scope = params.get('stan');
  return {
    from: isDay(params.get('od')) ? params.get('od') : null,
    to: isDay(params.get('do')) ? params.get('do') : null,
    aircraftId: trimmed(params.get('samolot')),
    search: trimmed(params.get('szukaj')),
    scope: isScope(scope) ? scope : DEFAULT_EXPORTS_FILTER.scope,
  };
}

/**
 * Filtr → query string. Wartości domyślne POMIJAMY, żeby adres pełnej listy był po
 * prostu `#/eksporty` - link, który da się przeczytać i przepisać.
 */
export function paramsFromFilter(filter: ExportsFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.from != null) params.od = filter.from;
  if (filter.to != null) params.do = filter.to;
  if (filter.aircraftId != null) params.samolot = filter.aircraftId;
  if (filter.search != null) params.szukaj = filter.search;
  if (filter.scope !== DEFAULT_EXPORTS_FILTER.scope) params.stan = filter.scope;
  return params;
}

/**
 * Filtr ekranu → parametry trasy.
 *
 * `revised` NIE jedzie do serwera: trasa nie zna takiego stanu, a wysłanie go jako
 * `?state=revised` skończyłoby się czterysetką. Zawężenie „tylko regeneracje" pyta więc
 * o CAŁY zakres (bez `state`) i odsiewa rewizję 1 na wierszach (`exportsRows.ts`) -
 * dokładnie tak, jak serwer liczy `counts.revised`, czyli po samym numerze rewizji,
 * bez oglądania się na stan karty. Dzięki tej zgodności liczba na chipie jest obietnicą
 * „tyle wierszy zobaczysz", a nie sumą z innego pytania.
 *
 * `limit` jedzie ZAWSZE - jest bezpiecznikiem, a odpowiedź niesie `truncated`, więc
 * ekran ma czym powiedzieć, że lista jest przycięta.
 */
export function exportListQuery(filter: ExportsFilter): ExportListQuery {
  return {
    ...(filter.from == null ? {} : { from: filter.from }),
    ...(filter.to == null ? {} : { to: filter.to }),
    ...(filter.aircraftId == null ? {} : { aircraftId: filter.aircraftId }),
    ...(filter.search == null ? {} : { q: filter.search }),
    ...(filter.scope === 'all' || filter.scope === 'revised'
      ? {}
      : { state: filter.scope }),
    limit: EXPORTS_PAGE_LIMIT,
  };
}

/** Czy filtr cokolwiek zawęża - pusta lista mówi wtedy co innego (patrz `exportsEmpty`). */
export function isNarrowed(filter: ExportsFilter): boolean {
  return (
    filter.from != null ||
    filter.to != null ||
    filter.aircraftId != null ||
    filter.search != null ||
    filter.scope !== 'all'
  );
}

/** Adres monitora z danym zawężeniem - do linków „pokaż zablokowane" i wzorem `A09`. */
export function exportsHref(filter: ExportsFilter, sessionUuid?: string | null): string {
  const query = new URLSearchParams(paramsFromFilter(filter)).toString();
  const path = sessionUuid == null ? '/eksporty' : `/eksporty/${sessionUuid}`;
  return query === '' ? path : `${path}?${query}`;
}
