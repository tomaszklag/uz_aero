/**
 * UZ Aero — panel: FILTRY LISTY KONT ↔ query string (moduł CZYSTY).
 *
 * Filtry mieszkają w URL-u, nie w stanie komponentu
 * (`docs/architektura-panelu-frontend.md` §4.4): lista kont jest miejscem, z którego
 * wysyła się linki („popatrz na te dwa nieaktywne konta"), a filtr trzymany
 * w `useState` gubi się po `F5` i nie da się go wkleić.
 *
 * ══ JEDEN PARAMETR NA CZTERY CHIPY ══
 * Mockup A06 ma chipy „Wszyscy · Aktywni · Nieaktywni · Z rolą panelu". To jest jedno
 * pytanie — „na które konta patrzę" — więc jeden parametr `?stan=`. Dwa parametry
 * (osobno status, osobno rola) pozwalałyby zadać je dwa razy naraz („nieaktywni
 * ORAZ z rolą panelu") i wymagałyby reguły rozstrzygania, której nikt by nie pamiętał.
 * Wartość nieznana jest POMIJANA: adres z literówką ma pokazać pełną listę, a nie
 * stronę błędu.
 */

import type { PilotListQuery } from '../../api/pilots';
import { DEFAULT_AUDIT_FILTER, auditHref } from '../audit/auditFilters';

/** `panel` = konta z rolą DAJĄCĄ wejście do panelu (administrator, szef wyszkolenia). */
export type PilotScope = 'all' | 'active' | 'inactive' | 'panel';

export type SortDirection = 'asc' | 'desc';

export interface PilotsFilter {
  scope: PilotScope;
  /** Fragment kodu, nazwiska albo e-maila; `null` = bez wyszukiwania. */
  search: string | null;
  /** Kierunek sortowania po NAZWISKU — konta nieaktywne i tak lądują na końcu. */
  sort: SortDirection;
}

/**
 * Domyślnie WSZYSTKIE konta i alfabetycznie. Ukryte zawężenie do aktywnych byłoby
 * pułapką dokładnie w scenariuszu, dla którego ten ekran powstał: administrator szuka
 * konta, którego nie może znaleźć, bo ktoś je wcześniej wyłączył.
 */
export const DEFAULT_PILOTS_FILTER: PilotsFilter = {
  scope: 'all',
  search: null,
  sort: 'asc',
};

/**
 * Ile kont pobieramy jednym żądaniem. Trasa nie ma kursora, bo klub ma kilkanaście
 * kont — a lista referencyjna, którą trzeba doładowywać, nie nadaje się na słownik
 * filtra innego ekranu. Limit jest zabezpieczeniem przed nieprzewidzianym rozrostem,
 * nie stronicowaniem; gdy zacznie ucinać, ekran mówi o tym wprost.
 */
export const PILOTS_PAGE_LIMIT = 200;

const SCOPES: readonly PilotScope[] = ['all', 'active', 'inactive', 'panel'];

const isScope = (value: string | null): value is PilotScope =>
  value != null && (SCOPES as readonly string[]).includes(value);

const isSort = (value: string | null): value is SortDirection =>
  value === 'asc' || value === 'desc';

const trimmed = (value: string | null): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

export function filterFromParams(params: URLSearchParams): PilotsFilter {
  const scope = params.get('stan');
  const sort = params.get('sort');

  return {
    scope: isScope(scope) ? scope : DEFAULT_PILOTS_FILTER.scope,
    search: trimmed(params.get('szukaj')),
    sort: isSort(sort) ? sort : DEFAULT_PILOTS_FILTER.sort,
  };
}

/**
 * Filtr → query string. Wartości domyślne POMIJAMY, żeby adres pełnej listy był po
 * prostu `#/piloci` — link, który da się przeczytać i przepisać.
 */
export function paramsFromFilter(filter: PilotsFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.scope !== DEFAULT_PILOTS_FILTER.scope) params.stan = filter.scope;
  if (filter.search != null) params.szukaj = filter.search;
  if (filter.sort !== DEFAULT_PILOTS_FILTER.sort) params.sort = filter.sort;
  return params;
}

/** Adres listy dla danego filtra — JEDNO miejsce, w którym powstaje link do A06. */
export function pilotsHref(filter: PilotsFilter): string {
  const query = new URLSearchParams(paramsFromFilter(filter)).toString();
  return query === '' ? '/piloci' : `/piloci?${query}`;
}

/**
 * Adres SZUFLADY konta z zachowanym zawężeniem listy pod spodem.
 *
 * `akcja=haslo` otwiera szufladę w wariancie „reset hasła" z mockupu A06a (tożsamość
 * zablokowana, aktywna sekcja hasła). To jest jedna szuflada z dwoma wejściami, a nie
 * dwa ekrany — bo to ta sama decyzja: kto ma dostęp i z jakim hasłem wchodzi.
 */
export function accountHref(filter: PilotsFilter, id: string, action?: 'haslo'): string {
  const params = new URLSearchParams(paramsFromFilter(filter));
  if (action != null) params.set('akcja', action);
  const query = params.toString();
  return query === '' ? `/piloci/${id}` : `/piloci/${id}?${query}`;
}

/** Adres szuflady NOWEGO konta — segment `nowe`, jak w pasku adresu mockupu A06a. */
export const NEW_ACCOUNT_SEGMENT = 'nowe';

export function newAccountHref(filter: PilotsFilter): string {
  return accountHref(filter, NEW_ACCOUNT_SEGMENT);
}

/**
 * Filtr ekranu → parametry trasy.
 *
 * Chip „Z rolą panelu" jedzie jako DWIE role (`?role=admin&role=training_lead`), bo
 * tak wygląda pytanie „kto w ogóle wejdzie do panelu". Sklejanie tego z dwóch żądań
 * po stronie panelu dałoby listę, której serwer nigdy nie wysłał — razem z licznikiem,
 * którego nie policzył.
 */
export function pilotListQuery(filter: PilotsFilter): PilotListQuery {
  return {
    ...(filter.scope === 'active' ? { active: 'true' as const } : {}),
    ...(filter.scope === 'inactive' ? { active: 'false' as const } : {}),
    ...(filter.scope === 'panel' ? { role: ['admin' as const, 'training_lead' as const] } : {}),
    ...(filter.search == null ? {} : { q: filter.search }),
    sort: filter.sort,
    limit: PILOTS_PAGE_LIMIT,
  };
}

/**
 * „Historia zmian" z nagłówka `A06` → dziennik audytu zawężony do obiektów typu
 * `pilot`, czyli do WSZYSTKICH zmian na kontach.
 *
 * Link składamy funkcją z ekranu audytu, a nie ręcznie: `targetHref`/`auditHref` są
 * jedynym miejscem, w którym powstaje adres `A09`, więc rozjazd między czterema
 * drogami wejścia kończyłby się martwym linkiem w jednej z nich.
 */
export function accountsAuditHref(): string {
  return auditHref({ ...DEFAULT_AUDIT_FILTER, targetType: 'pilot' });
}

/** Czy filtr cokolwiek zawęża — pusta lista mówi wtedy co innego (`pilotsRows`). */
export function isNarrowed(filter: PilotsFilter): boolean {
  return filter.scope !== 'all' || filter.search != null;
}
