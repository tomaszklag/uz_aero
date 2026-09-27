/**
 * Ninerdeck - panel 3.2: ADRESY dziennika w jednym miejscu.
 *
 * Trzy poziomy i dwie osie dają pięć kształtów adresu, a każdy niesie zakres dat,
 * z którego się przyszło. Do 3.2.0 każdy ekran sklejał `?od=…&do=…` sam - z drugą
 * osią (`?os=piloci`) kopii byłoby osiem i pierwsza literówka prowadziłaby w pustą
 * tabelę, która wygląda jak „nic nie latało". Moduł CZYSTY, bez Reacta.
 */

import type { DayRange } from './dateRanges';

/** Oś poziomu 1: maszyny są domyślne i NIE stoją w adresie; piloci to `?os=piloci`. */
export type LogAxis = 'samoloty' | 'piloci';

/** Zakres jako query string; puste pola nie wchodzą - `?od=&do=` niczego nie mówi. */
function withRange(params: URLSearchParams, range: DayRange): string {
  if (range.from !== '') params.set('od', range.from);
  if (range.to !== '') params.set('do', range.to);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** Poziom 1 z osią: `/dziennik?od=…` albo `/dziennik?os=piloci&od=…`. */
export function logbookPath(axis: LogAxis, range: DayRange): string {
  const params = new URLSearchParams();
  if (axis === 'piloci') params.set('os', 'piloci');
  return `/dziennik${withRange(params, range)}`;
}

/** Poziom 2, oś maszyny - w adresie REJESTRACJA, do wklejenia z pamięci. */
export function aircraftLogPath(reg: string, range: DayRange): string {
  return `/dziennik/${encodeURIComponent(reg)}${withRange(new URLSearchParams(), range)}`;
}

/** Poziom 2, oś pilota - segment statyczny `pilot/` i KOD pilota (§4.2). */
export function pilotLogPath(code: string, range: DayRange): string {
  return `/dziennik/pilot/${encodeURIComponent(code)}${withRange(new URLSearchParams(), range)}`;
}

/** Poziom 3 - operacja ma dokładnie jedną maszynę, więc adres idzie przez jej oś. */
export function sessionPath(reg: string, uuid: string, range: DayRange): string {
  return `/dziennik/${encodeURIComponent(reg)}/${encodeURIComponent(uuid)}${withRange(new URLSearchParams(), range)}`;
}

/**
 * TRYB EDYCJI operacji (3.2.0, §5.3) - stan tego samego ekranu pod WŁASNYM adresem,
 * żeby dało się go wkleić w rozmowie („popraw to"). Segment `edycja` za uuid-em:
 * router nie pomyli go z operacją, bo operacja ma dokładnie jeden segment więcej.
 */
export function sessionEditPath(reg: string, uuid: string, range: DayRange): string {
  return `/dziennik/${encodeURIComponent(reg)}/${encodeURIComponent(uuid)}/edycja${withRange(new URLSearchParams(), range)}`;
}
