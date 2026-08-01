/**
 * UZ Aero — panel: FILTRY DZIENNIKA AUDYTU ↔ query string (moduł CZYSTY).
 *
 * Filtry mieszkają w URL-u, nie w stanie komponentu
 * (`docs/architektura-panelu-frontend.md` §4.4) — i akurat na tym ekranie to nie jest
 * wygoda, tylko WYMAGANIE. Ekran korekty obiecuje „ślad w audycie → A09", a karta dnia
 * odsyła do śladu konkretnej flagi; obie drogi prowadzą do dziennika ODFILTROWANEGO
 * po obiekcie. Filtr trzymany w `useState` uczyniłby z tych linków wejście na surową
 * listę wszystkiego, czyli odesłanie człowieka do szukania igły.
 *
 * ══ JEDEN PARAMETR NA PASEK AKCJI, DWA ZNACZENIA ══
 * `?akcje=konta` to GRUPA (cztery kody katalogu), `?akcje=flag.resolve` to POJEDYNCZY
 * kod. Jeden parametr, bo dla człowieka to jedno pytanie — „czego dotyczyła zmiana" —
 * a dwa parametry pozwalałyby zadać je dwa razy naraz i wymagałyby reguły rozstrzygania,
 * której nikt by nie pamiętał. Wartość nieznana jest POMIJANA: adres z literówką ma
 * pokazać pełny dziennik, a nie stronę błędu.
 */

import type { AdminAction } from '../../api/dto';
import type { AuditListQuery } from '../../api/audit';
import { actionsOfGroup, isAuditAction, isAuditGroup, type AuditGroupId } from './audytActions';

/** Wybór z paska akcji. `null` = bez zawężenia, a nie „ósma grupa". */
export type AuditScope =
  | { kind: 'group'; id: AuditGroupId }
  | { kind: 'action'; code: AdminAction };

export type SortDirection = 'asc' | 'desc';

export interface AudytFilter {
  scope: AuditScope | null;
  /** Identyfikator konta działającego — dopasowanie DOKŁADNE, nie po nazwisku. */
  actor: string | null;
  /** Typ obiektu (`flag`, `event`, `pilot`, `aircraft`, `sheet`). */
  targetType: string | null;
  /** Identyfikator obiektu — to jest wejście z kontekstem z `A02a` i `A02b`. */
  targetId: string | null;
  /** Dzień UTC `YYYY-MM-DD` włącznie; `null` = bez ograniczenia zakresu. */
  from: string | null;
  to: string | null;
  sort: SortDirection;
}

/**
 * Domyślnie BEZ zawężenia i najnowsze na górze — jak nagłówek „Czas · UTC ↓"
 * w mockupie. Panel nie ustawia domyślnego zakresu dat: ukryte zawężenie do ostatniego
 * tygodnia sprawiłoby, że kafel „wpisy w zawężeniu" i pusta lista mówiłyby o czymś,
 * czego nie widać w adresie.
 */
export const DEFAULT_AUDYT_FILTER: AudytFilter = {
  scope: null,
  actor: null,
  targetType: null,
  targetId: null,
  from: null,
  to: null,
  sort: 'desc',
};

/**
 * Ile wpisów pobieramy jedną stroną. Kolejne dokłada KURSOR, więc ta liczba nie
 * ogranicza tego, co da się zobaczyć; ogranicza wielkość jednego żądania.
 */
export const AUDYT_PAGE_LIMIT = 50;

const isSort = (value: string | null): value is SortDirection =>
  value === 'asc' || value === 'desc';

/** `YYYY-MM-DD` i nic innego — wpis nieczytelny traktujemy jak brak filtra. */
const isDay = (value: string | null): value is string =>
  value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);

const trimmed = (value: string | null): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

/** Napis z paska akcji → wybór. Najpierw grupa, potem pojedynczy kod, potem nic. */
export function scopeFrom(value: string | null): AuditScope | null {
  if (isAuditGroup(value)) return { kind: 'group', id: value };
  if (isAuditAction(value)) return { kind: 'action', code: value };
  return null;
}

/** Wybór → wartość parametru `akcje`. */
export function scopeValue(scope: AuditScope): string {
  return scope.kind === 'group' ? scope.id : scope.code;
}

export function filterFromParams(params: URLSearchParams): AudytFilter {
  const sort = params.get('sort');

  return {
    scope: scopeFrom(params.get('akcje')),
    actor: trimmed(params.get('kto')),
    targetType: trimmed(params.get('typ')),
    targetId: trimmed(params.get('obiekt')),
    from: isDay(params.get('od')) ? params.get('od') : null,
    to: isDay(params.get('do')) ? params.get('do') : null,
    sort: isSort(sort) ? sort : DEFAULT_AUDYT_FILTER.sort,
  };
}

/**
 * Filtr → query string. Wartości domyślne POMIJAMY, żeby adres pełnego dziennika był
 * po prostu `#/audyt` — link, który da się przeczytać i przepisać.
 */
export function paramsFromFilter(filter: AudytFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.scope != null) params.akcje = scopeValue(filter.scope);
  if (filter.actor != null) params.kto = filter.actor;
  if (filter.targetType != null) params.typ = filter.targetType;
  if (filter.targetId != null) params.obiekt = filter.targetId;
  if (filter.from != null) params.od = filter.from;
  if (filter.to != null) params.do = filter.to;
  if (filter.sort !== DEFAULT_AUDYT_FILTER.sort) params.sort = filter.sort;
  return params;
}

/**
 * Adres ekranu dla danego filtra — JEDNO miejsce, w którym powstaje link do audytu.
 *
 * Używają go: kolumna „Kto" (zawęź do tego konta), plakietka akcji, karta dnia
 * (`A02a`, ślad flagi) i szuflada korekty (`A02b`, ślad zdarzenia). Rozjazd między
 * nimi kończyłby się martwym linkiem w jednej z czterech dróg.
 */
export function audytHref(filter: AudytFilter): string {
  const query = new URLSearchParams(paramsFromFilter(filter)).toString();
  return query === '' ? '/audyt' : `/audyt?${query}`;
}

/** Skrót dla wejścia z kontekstem: „pokaż wszystko, co robiono NA TYM obiekcie". */
export function targetHref(targetType: string, targetId: string): string {
  return audytHref({ ...DEFAULT_AUDYT_FILTER, targetType, targetId });
}

/** Wybór z paska akcji → lista kodów dla trasy; `undefined` = bez zawężenia. */
export function actionsOf(scope: AuditScope | null): AdminAction[] | undefined {
  if (scope == null) return undefined;
  return scope.kind === 'group' ? actionsOfGroup(scope.id) : [scope.code];
}

/**
 * Filtr ekranu → parametry trasy. Zakres dat jedzie jako DZIEŃ (`YYYY-MM-DD`), bo tak
 * przyjmuje go trasa — a górną granicę domyka serwer do końca doby, żeby „od 25 do 31"
 * nie gubiło ostatniego dnia.
 */
export function auditListQuery(filter: AudytFilter): AuditListQuery {
  const actions = actionsOf(filter.scope);
  return {
    ...(actions === undefined ? {} : { action: actions }),
    ...(filter.actor == null ? {} : { actor: filter.actor }),
    ...(filter.targetType == null ? {} : { targetType: filter.targetType }),
    ...(filter.targetId == null ? {} : { targetId: filter.targetId }),
    ...(filter.from == null ? {} : { from: filter.from }),
    ...(filter.to == null ? {} : { to: filter.to }),
    sort: filter.sort,
    limit: AUDYT_PAGE_LIMIT,
  };
}

/** Czy filtr cokolwiek zawęża — pusta lista mówi wtedy co innego (`audytPages`). */
export function isNarrowed(filter: AudytFilter): boolean {
  return (
    filter.scope != null ||
    filter.actor != null ||
    filter.targetType != null ||
    filter.targetId != null ||
    filter.from != null ||
    filter.to != null
  );
}
