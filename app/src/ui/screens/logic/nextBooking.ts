/**
 * Ninerdeck - NAJBLIŻSZA REZERWACJA PILOTA na Pulpicie (20, #162 F12).
 *
 * ══ NAJBLIŻSZA ZNACZY „NAJBLIŻSZA, KTÓRA SIĘ JESZCZE NIE SKOŃCZYŁA" ══
 * Nie „pierwsza jutro" i nie „ta, która trwa": termin rozpoczęty kwadrans temu jest
 * dokładnie tym, po co pilot patrzy na Pulpit - stoi przy samolocie i sprawdza, czy to
 * ta maszyna i te godziny. Rezerwacja, która minęła, przestaje być planem.
 *
 * ══ CUDZE I WYŁĄCZENIA Z UŻYTKU NIE SĄ PLANEM TEGO PILOTA ══
 * Pulpit odpowiada na pytanie „co mam przed sobą", więc bierze wyłącznie własne
 * rezerwacje lotów. Przegląd maszyny jest stanem FLOTY i mieszka w kalendarzu.
 */

import type { NextBooking } from './dashboard';
import type { CalendarBooking, CalendarData } from './calendarData';
import { clubHhmm, clubDayAt } from './clubClock';
import { operationLabelOf } from './operations';

export interface NextBookingInput {
  data: CalendarData | null;
  pilotId: string;
  now: number;
  /** Znak maszyny z cache floty; bez niego zostaje surowy identyfikator z panelu. */
  regOf: (aircraftId: string) => string | null;
  /** Kod drugiego pilota; `null` = poza cache'em albo lot bez Duala. */
  codeOf: (pilotId: string) => string | null;
}

/**
 * Sam WIERSZ najbliższej rezerwacji - osobno od karty, bo wejście w lot potrzebuje
 * surowych pól (rodzaj operacji jako wartość, nie napis), a karta gotowych napisów.
 */
export function nextBookingRow(input: NextBookingInput): CalendarBooking | null {
  if (input.data == null) return null;

  const mine = input.data.bookings
    .filter(
      (b) =>
        b.kind === 'flight' &&
        b.pilotId === input.pilotId &&
        (b.status === 'confirmed' || b.status === 'pending') &&
        b.endsAt > input.now,
    )
    .sort((a, b) => a.startsAt - b.startsAt);

  return mine[0] ?? null;
}

export function nextBooking(input: NextBookingInput): NextBooking | null {
  const first = nextBookingRow(input);
  if (first == null || input.data == null) return null;

  // Godziny liczą się od granic DOBY, w której stoi rezerwacja - ta sama arytmetyka,
  // co na osi kalendarza, bez ani jednej konwersji stref na telefonie (§6.1).
  const day = clubDayAt(input.data.days, first.startsAt);
  if (day == null) return null;

  return {
    id: first.id,
    startsAt: first.startsAt,
    endsAt: first.endsAt,
    clock: `${clubHhmm(first.startsAt, day)} → ${clubHhmm(first.endsAt, day)}`,
    aircraft: input.regOf(first.aircraftId) ?? first.aircraftId,
    operation: operationLabelOf(first.operation),
    route: route(first),
    dualCode: first.dualId == null ? null : input.codeOf(first.dualId),
    pending: first.status === 'pending',
  };
}

function route(b: CalendarBooking): string | null {
  if (b.fromIcao == null && b.toIcao == null) return null;
  // Skoki startują i lądują na tym samym placu (issue #13), więc strzałka między dwoma
  // identycznymi kodami niczego by nie opisała.
  if (b.toIcao == null || b.fromIcao === b.toIcao) return b.fromIcao ?? b.toIcao;
  if (b.fromIcao == null) return b.toIcao;
  return `${b.fromIcao} → ${b.toIcao}`;
}
