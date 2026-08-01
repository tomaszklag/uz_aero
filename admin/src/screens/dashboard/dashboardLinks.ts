/**
 * UZ Aero — panel: PRZEJŚCIA Z PULPITU (moduł CZYSTY).
 *
 * Pulpit niczego nie rozstrzyga — kieruje ruch. Dlatego każdy kafel i każdy wiersz
 * ma dokąd prowadzić, a adres celu jest zbudowany TU, z zawężeniem w query stringu
 * (§4.4), i ma test. Wzorce: `targetHref` w `screens/audit/auditFilters.ts`
 * i `dayLink` w `screens/fleet/fleetFilters.ts`.
 *
 * ══ EKRAN, KTÓREGO NIE MA, NIE DOSTAJE LINKU ══
 * Mockup `A01` prowadzi z karty „Ostatnio przyjęte" do REJESTRU ZDARZEŃ (`A04`).
 * Tego ekranu nie ma — `#/zdarzenia` renderuje dziś stronę „w budowie". Link do niej
 * byłby czwartym ślepym zaułkiem w panelu, więc zamiast niego stoi przycisk
 * ZABLOKOWANY Z POWODEM (`MISSING_SCREENS.zdarzenia`), a same wiersze prowadzą
 * w miejsce, które istnieje i jest merytorycznie właściwe: na kartę DNIA, do którego
 * zdarzenie należy. Sprostowanie mockupu opisane na ekranie, nie po cichu.
 */

import { DEFAULT_EXPORTS_FILTER, exportsHref } from '../exports/exportsFilters';
import { DEFAULT_FLEET_FILTER, dayHref, aircraftHref } from '../fleet/fleetFilters';

/**
 * Powody blokad przejść do ekranów, które jeszcze nie powstały.
 *
 * Trzymane jako DANE, a nie jako napis w JSX-ie: powód jest treścią, a treść ma mieć
 * jedno miejsce i test. Gdy `A04` powstanie, znika stąd jeden wpis i jeden warunek —
 * a nie trzeba szukać po ekranach, gdzie ktoś wpisał to samo zdanie.
 */
export const MISSING_SCREENS = {
  zdarzenia: 'rejestr zdarzeń (A04) jeszcze nie powstał',
} as const;

/** Skrzynka flag w stanie domyślnym — czyli sprawy OTWARTE (`#/flagi`). */
export function flagsHref(): string {
  return '/flagi';
}

/** Pojedyncza sprawa otwarta w szufladzie NAD skrzynką (`#/flagi/1046`). */
export function flagHref(id: number): string {
  return `/flagi/${id}`;
}

/** Lista dni zawężona do dni BEZ `day_close` — to samo, co chip „Otwarte" na `A02`. */
export function openDaysHref(): string {
  return '/dni?stan=open';
}

/**
 * Lista dni zawężona do JEDNEJ doby UTC.
 *
 * Kafel „Dziś w liczbach" i karta „Ostatni dzień lotny" muszą prowadzić do TYCH
 * SAMYCH dni, które policzyły — a filtr listy dni przyjmuje zakres `od`/`do`
 * w dniach UTC, obustronnie domknięty.
 */
export function daysForDayHref(day: string): string {
  return `/dni?od=${day}&do=${day}`;
}

/** Karta konkretnego dnia (`A02a`) — pełna strona, nie szuflada. */
export function dayCardLink(sessionUuid: string): string {
  return dayHref(sessionUuid);
}

/** Flota zawężona do jednostek z otwartym claimem (`#/flota?zakres=claimed`). */
export function busyFleetHref(): string {
  return `/flota?${new URLSearchParams({ zakres: 'claimed' }).toString()}`;
}

/** Szuflada jednostki na ekranie floty — cel wiersza samolotu WOLNEGO. */
export function aircraftLink(aircraftId: string): string {
  return aircraftHref(DEFAULT_FLEET_FILTER, aircraftId);
}

/**
 * Monitor eksportu zawężony do kart, których NIE MA (`#/eksporty?stan=missing`).
 *
 * Kafel „Eksport arkuszy" mówi o awariach, więc prowadzi tam, gdzie awarie widać —
 * a nie do pełnej listy, w której trzeba ich dopiero szukać.
 */
export function missingExportsHref(sessionUuid?: string): string {
  return exportsHref(
    { ...DEFAULT_EXPORTS_FILTER, scope: 'missing' },
    sessionUuid ?? null,
  );
}

/** Pełny monitor eksportu — gdy nie ma czego zawężać. */
export function allExportsHref(): string {
  return exportsHref(DEFAULT_EXPORTS_FILTER);
}
