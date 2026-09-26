/**
 * Ninerdeck - panel: SŁOWNIK KLUBU → funkcje podpisujące zajętości (issue #216).
 *
 * Kalendarz, szuflada zajętości i kolejka decyzji podpisują identyfikatory nazwiskiem
 * i znakiem. Do issue #216 każdy z tych ekranów składał sobie tę mapę z list modułów
 * Piloci i Samoloty - a te stoją na „Podglądzie klubu". Słownik jest jeden dla każdego
 * członka, więc i mapa jest jedna: trzy ekrany nie mogą pamiętać trzech różnych
 * definicji „kto to" (ta sama reguła, przez którą oś kalendarza pisze skrócone
 * nazwisko z JEDNEGO miejsca - `bookingLabels.ts`).
 *
 * Moduł czysty: to są decyzje o treści, nie o układzie - i dlatego ma test obok.
 */

import type { DirectoryDto } from '../../api/dto';
import type { Person, PersonLookup } from './bookingLabels';
import type { CalendarAircraft } from './calendarGrid';

/** Członek z identyfikatora; `null` = nie ma go w słowniku (osoba spoza klubu). */
export function personLookup(directory: DirectoryDto | undefined): PersonLookup {
  const byId = new Map<string, Person>(
    (directory?.members ?? []).map((m) => [m.id, { name: m.name, code: m.code }]),
  );
  return (pilotId) => byId.get(pilotId) ?? null;
}

/** Znak maszyny z identyfikatora; bez wpisu wraca identyfikator - lepszy niż pusta komórka. */
export function regLookup(directory: DirectoryDto | undefined): (aircraftId: string) => string {
  const byId = new Map((directory?.aircraft ?? []).map((a) => [a.id, a.reg]));
  return (aircraftId) => byId.get(aircraftId) ?? aircraftId;
}

/** Wiersze osi floty - w kolejności słownika (maszyny wyłączone z użytku ZOSTAJĄ). */
export function calendarAircraft(directory: DirectoryDto | undefined): CalendarAircraft[] {
  return (directory?.aircraft ?? []).map((a) => ({
    id: a.id,
    reg: a.reg,
    type: a.type,
    inService: a.serviceStatus === 'active',
  }));
}
