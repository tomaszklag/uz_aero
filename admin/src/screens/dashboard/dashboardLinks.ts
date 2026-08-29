/**
 * UZ Aero - panel: PRZEJŚCIA Z PULPITU (moduł CZYSTY).
 *
 * Pulpit niczego nie rozstrzyga - kieruje ruch. Dlatego każdy kafel i każdy wiersz
 * ma dokąd prowadzić, a adres celu jest zbudowany TU, z zawężeniem w query stringu
 * (§4.4), i ma test. Wzorce: `targetHref` w `screens/audit/auditFilters.ts`
 * i `dayLink` w `screens/fleet/fleetFilters.ts`.
 *
 * ══ REJESTR ZDARZEŃ JUŻ ISTNIEJE (2026-08-02) ══
 * Do przekroju `A04` karta „Ostatnio przyjęte" miała przycisk ZABLOKOWANY z powodem
 * „rejestr zdarzeń (A04) jeszcze nie powstał", bo `#/zdarzenia` renderowało stronę
 * „w budowie", a link do niej byłby ślepym zaułkiem. Ekran powstał, więc przycisk
 * prowadzi tam, gdzie obiecuje mockup - i to **zawężony do tego, co pulpit właśnie
 * pokazywał**: karta wypisuje ostatnio PRZYJĘTE zdarzenia, więc rejestr ma otworzyć
 * się w tym samym porządku i po tej samej osi czasu (`received_at`, malejąco), czyli
 * w stanie domyślnym. Wiersze nadal prowadzą na kartę DNIA - to jest pełny kontekst
 * jednego zdarzenia, a nie jego surowy zapis.
 *
 * Lista `MISSING_SCREENS` zniknęła razem z jedynym wpisem. Gdy któryś ekran znowu
 * będzie prowadził donikąd, wraca tu jako DANE, a nie jako napis w JSX-ie.
 */

import { DEFAULT_EVENTS_FILTER, eventsHref } from '../events/eventsFilters';
import { DEFAULT_EXPORTS_FILTER, exportsHref } from '../exports/exportsFilters';
import { DEFAULT_FLEET_FILTER, dayHref, aircraftHref } from '../fleet/fleetFilters';

/**
 * Rejestr zdarzeń w stanie DOMYŚLNYM (`#/zdarzenia`) - czyli po czasie przyjęcia,
 * najnowsze na górze.
 *
 * To nie jest „byle jaki link do A04": karta pulpitu pokazuje sześć ostatnio
 * PRZYJĘTYCH zdarzeń, a domyślny porządek rejestru jest dokładnie ten sam. Człowiek
 * klikający „REJESTR →" ma zobaczyć te same wiersze, tylko w pełnej postaci - każde
 * inne zawężenie kazałoby mu szukać, gdzie się podziały.
 */
export function eventsRegisterHref(): string {
  return eventsHref(DEFAULT_EVENTS_FILTER);
}

/** Skrzynka flag w stanie domyślnym - czyli sprawy OTWARTE (`#/flagi`). */
export function flagsHref(): string {
  return '/flagi';
}

/** Pojedyncza sprawa otwarta w szufladzie NAD skrzynką (`#/flagi/1046`). */
export function flagHref(id: number): string {
  return `/flagi/${id}`;
}

/** Lista dni zawężona do dni BEZ `day_close` - to samo, co chip „Otwarte" na `A02`. */
export function openDaysHref(): string {
  return '/dni?stan=open';
}

/**
 * Lista dni zawężona do JEDNEJ doby UTC.
 *
 * Kafel „Dziś w liczbach" i karta „Ostatni dzień lotny" muszą prowadzić do TYCH
 * SAMYCH dni, które policzyły - a filtr listy dni przyjmuje zakres `od`/`do`
 * w dniach UTC, obustronnie domknięty.
 */
export function daysForDayHref(day: string): string {
  return `/dni?od=${day}&do=${day}`;
}

/** Karta konkretnego dnia (`A02a`) - pełna strona, nie szuflada. */
export function dayCardLink(sessionUuid: string): string {
  return dayHref(sessionUuid);
}

/** Flota zawężona do jednostek z otwartym claimem (`#/flota?zakres=claimed`). */
export function busyFleetHref(): string {
  return `/flota?${new URLSearchParams({ zakres: 'claimed' }).toString()}`;
}

/** Szuflada jednostki na ekranie floty - cel wiersza samolotu WOLNEGO. */
export function aircraftLink(aircraftId: string): string {
  return aircraftHref(DEFAULT_FLEET_FILTER, aircraftId);
}

/**
 * Monitor eksportu zawężony do kart, których NIE MA (`#/eksporty?stan=missing`).
 *
 * Kafel „Eksport arkuszy" mówi o awariach, więc prowadzi tam, gdzie awarie widać -
 * a nie do pełnej listy, w której trzeba ich dopiero szukać.
 */
export function missingExportsHref(sessionUuid?: string): string {
  return exportsHref(
    { ...DEFAULT_EXPORTS_FILTER, scope: 'missing' },
    sessionUuid ?? null,
  );
}

/** Pełny monitor eksportu - gdy nie ma czego zawężać. */
export function allExportsHref(): string {
  return exportsHref(DEFAULT_EXPORTS_FILTER);
}
