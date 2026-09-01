/**
 * UZ Aero - panel 2.0: odmowa serwera na samolocie -> zdanie po polsku.
 *
 * `Record<FleetRefusalDto, …>` jest tu KLUCZOWY: powód odmowy dopisany na serwerze
 * (`server/src/domain/fleetGuards.ts`) wywala kompilację panelu, zamiast pokazać
 * klientowi klubu surowe `oil_min_above_capacity`. Rozjazdu samej unii pilnuje
 * `test/mirrors.test.ts` - i to nie jest ostrożność teoretyczna: do panelu 2.0 lustro
 * nie znało obu powodów oleju z issue #60.
 *
 * == TE SAME ZDANIA MOWI FORMULARZ, ZANIM WYSLE ZADANIE ==
 * Dwa z tych powodów (`capacity_not_positive`, `oil_min_above_capacity`) da się
 * zobaczyć w polach na długo przed zapisem, więc `aircraftForm.ts` blokuje przycisk
 * TĄ SAMĄ stałą. Jedno zdanie, dwie drogi - bo zdanie napisane drugi raz brzmi
 * inaczej i klient słyszy dwie różne reguły.
 */

import type { FleetRefusalDto, PilotRefusalDto } from '../../api/dto';

const REFUSALS: Record<FleetRefusalDto, string> = {
  capacity_not_positive: 'Podaj pojemność zbiorników większą od zera.',
  open_session: 'Ktoś ma teraz ten samolot. Wyłącz go, gdy pilot skończy lot.',
  oil_not_positive: 'Wartości oleju muszą być większe od zera. Puste pole znaczy „nie prowadzimy".',
  oil_min_above_capacity: 'Minimum oleju nie może być większe od zbiornika.',
  fuel_norm_not_positive:
    'Spalanie z dokumentacji musi być większe od zera. Puste pole znaczy „nie znamy".',
  // Zero jest tu WARTOŚCIĄ (nowy silnik, puste zbiorniki), więc zdanie mówi o minusie,
  // a nie o „większe od zera" jak przy normach.
  initial_negative: 'Stan początkowy nie może być ujemny.',
  initial_fuel_over_capacity: 'Startowe paliwo nie mieści się w zbiornikach.',
  initial_oil_over_capacity: 'Startowy olej nie mieści się w zbiorniku oleju.',
  aircraft_in_service: 'Najpierw wyłącz samolot ze służby.',
  has_history: 'Ten samolot ma zapisane loty - możesz go tylko wyłączyć.',
};

/**
 * `null` dla powodów, które na tym ekranie nie mają prawa się pojawić (odmowy kont).
 *
 * Unia odmów jest wspólna dla całego panelu, bo niesie ją jedno pole odpowiedzi - więc
 * zamiast rzutowania typu, które kłamie kompilatorowi, ekran dostaje uczciwe „nie znam
 * tego powodu" i pokazuje zdanie ogólne.
 */
export function fleetRefusalMessage(reason: FleetRefusalDto | PilotRefusalDto): string | null {
  return reason in REFUSALS ? REFUSALS[reason as FleetRefusalDto] : null;
}

/** Skróty do tych samych zdań dla formularza - patrz nagłówek pliku. */
export const CAPACITY_NOT_POSITIVE = REFUSALS.capacity_not_positive;
export const OIL_NOT_POSITIVE = REFUSALS.oil_not_positive;
export const OIL_MIN_ABOVE_CAPACITY = REFUSALS.oil_min_above_capacity;
export const FUEL_NORM_NOT_POSITIVE = REFUSALS.fuel_norm_not_positive;
// `initial_negative` NIE MA tu skrótu: formularz nie ma jak zobaczyć minusa (parsery
// przyjmują same cyfry), więc ta reguła wraca wyłącznie odmową serwera - a skrót do
// zdania, którego nikt nie woła, obiecywałby sprawdzenie, którego nie ma.
export const INITIAL_FUEL_OVER_CAPACITY = REFUSALS.initial_fuel_over_capacity;
export const INITIAL_OIL_OVER_CAPACITY = REFUSALS.initial_oil_over_capacity;
export const AIRCRAFT_IN_USE = REFUSALS.open_session;

/**
 * Powód blokujący USUNIĘCIE, który ekran zna sam - bez pytania serwera.
 *
 * Stan służby widać z listy, więc stoi w przycisku, zanim ktokolwiek go naciśnie.
 * `has_history` jest faktem o bazie i wraca dopiero odmową - panel nie ma jak go
 * przewidzieć, a lista nie niesie liczby lotów.
 */
export const AIRCRAFT_IN_SERVICE = REFUSALS.aircraft_in_service;

/** Zajęta rejestracja (`409 conflict`) -> zdanie przy TYM polu. */
export function aircraftConflictMessage(field: 'code' | 'email' | 'reg' | null): string | null {
  // `code`/`email` przychodzą z kont i na tym ekranie nie mają prawa się pojawić -
  // unia odmowy jest wspólna dla całego panelu, więc odpowiadamy milczeniem zamiast
  // rzucania wyjątku w formularzu, który klient właśnie wypełnia.
  if (field !== 'reg') return null;
  return 'Ten samolot już jest w rejestrze - sprawdź też wyłączone.';
}
