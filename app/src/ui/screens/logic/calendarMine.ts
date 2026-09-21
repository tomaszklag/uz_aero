/**
 * Ninerdeck - „TWOJE REZERWACJE" w wybranej dobie (21, rezerwacje 3.0.0).
 *
 * Oś floty odpowiada „co jest zajęte", a ta lista „co mam zaplanowane" - to samo pytanie,
 * które na Pulpicie zadaje karta najbliższej rezerwacji. Bez własnej rezerwacji sekcji
 * NIE MA i nie ma stanu „nie masz rezerwacji": oś wyżej mówi to sama pustymi ścieżkami,
 * a zdanie o braku byłoby drugim komunikatem o tym samym.
 */

import type { ReferenceAircraft } from '../../../domain';

import { bookingsOnDay, type CalendarBooking } from './calendarData';
import { clubHhmm, type ClubDayBounds } from './clubClock';
import { operationLabelOf, operationTypeOf, routeLabel } from './operations';

export interface MyBookingVm {
  bookingId: string;
  /** „09:00 → 11:00" czasem klubu. */
  hours: string;
  reg: string;
  /**
   * Wiersz szczegółów - wyłącznie to, co WYPEŁNIONE. Kreska w miejscu pustej trasy
   * powtarzałaby brak, który widać po samym braku wiersza.
   */
  meta: string[];
}

export interface MyBookingsInput {
  day: ClubDayBounds;
  bookings: readonly CalendarBooking[];
  /** CAŁA flota klubu, nie zawężona filtrem: filtr zmienia OŚ, nie plan pilota. */
  aircraft: readonly ReferenceAircraft[];
  pilotId: string;
  /** Kod pilota z cache floty - `usePilotCode`. */
  codeOf: (id: string | null) => string | null;
}

export function buildMyBookings(input: MyBookingsInput): MyBookingVm[] {
  return bookingsOnDay(input.bookings, input.day)
    .filter((b) => b.kind === 'flight' && b.pilotId === input.pilotId)
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((b) => ({
      bookingId: b.id,
      // Godziny PRZYCIĘTE do doby: rezerwacja zaczęta wczoraj o 22:00 ma w tej dobie
      // początek o północy, a napis „22:00" pod nagłówkiem dzisiejszego dnia kłamałby
      // o tym, od kiedy maszyna jest zajęta W TYM dniu.
      hours: `${clubHhmm(Math.max(b.startsAt, input.day.startsAt), input.day)} → ${clubHhmm(
        Math.min(b.endsAt, input.day.endsAt),
        input.day,
      )}`,
      reg: input.aircraft.find((a) => a.id === b.aircraftId)?.reg ?? b.aircraftId,
      meta: meta(b, input.codeOf),
    }));
}

function meta(booking: CalendarBooking, codeOf: (id: string | null) => string | null): string[] {
  const rows: string[] = [];

  const operation = operationLabelOf(booking.operation);
  if (operation != null) rows.push(operation);

  // Trasa idzie przez WSPÓLNY `routeLabel`, ten sam, którym pisze ją pasek kokpitu
  // i podgląd operacji: skoki mają oba kody równe, więc własna kopia tej reguły
  // prędzej czy później napisałaby tu „EPKK → EPKK".
  const route = routeLabel(operationTypeOf(booking.operation), booking.fromIcao, booking.toIcao);
  if (route !== '') rows.push(route);

  const dual = codeOf(booking.dualId);
  if (dual != null) rows.push(`Dual: ${dual}`);

  return rows;
}