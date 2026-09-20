/**
 * Ninerdeck - panel: kalendarz zajętości (`/admin/api/bookings*`).
 *
 * ══ KLUB BIERZE SIĘ Z SESJI, NIE Z ADRESU ══
 * Dlatego w adresie nie ma identyfikatora klubu - panel prowadzi kalendarz SWOJEJ floty.
 * Ta sama zasada, co przy kodzie klubu i dzienniku.
 *
 * ══ TRZY TRASY ZAPISU, BO TRZY RÓŻNE WŁADZE ══
 * Rezerwacja za pilota i odwołanie cudzej idą na `reservations.manage` (władza nad czyimś
 * planem), wyłączenie maszyny z użytku na `fleet.manage` (stan MASZYNY rozciągnięty
 * w czasie). Panel nie musi o tym wiedzieć - ale musi wiedzieć, że to trzy osobne
 * przyciski, i nie rysować ich razem tam, gdzie zdolność jest jedna.
 */

import type { BlockReasonDto, BookingDto, CalendarDto } from './dto';
import { apiGet, apiPost } from './httpClient';

export interface CalendarRange {
  /** ISO - dowolna chwila; serwer i tak sprowadzi ją do granic dób w strefie klubu. */
  from: string;
  to: string;
}

export function getCalendar(range: CalendarRange): Promise<CalendarDto> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  return apiGet<CalendarDto>(`/bookings?${query.toString()}`);
}

/** Rezerwacja wpisana ZA pilota - poza właścicielem to samo zamówienie, co z telefonu. */
export interface NewAdminBooking {
  id: string;
  aircraftId: string;
  pilotId: string;
  startsAt: string;
  endsAt: string;
  operation: string;
  dualId?: string | null;
  fromIcao?: string | null;
  toIcao?: string | null;
  note?: string | null;
}

export function createBooking(body: NewAdminBooking): Promise<BookingDto> {
  return apiPost<BookingDto>('/bookings', body);
}

/** Wyłączenie maszyny z użytku na konkretne dni. */
export interface NewBlock {
  id: string;
  aircraftId: string;
  startsAt: string;
  endsAt: string;
  blockReason: BlockReasonDto;
  note?: string | null;
}

export function createBlock(body: NewBlock): Promise<BookingDto> {
  return apiPost<BookingDto>('/bookings/blocks', body);
}

/**
 * Odwołanie rezerwacji albo zdjęcie wyłączenia z użytku - jedna trasa, bo to jedna
 * czynność na jednym wierszu.
 *
 * Powód jest OPCJONALNY na drucie, a wymaga go domena i tylko przy CUDZEJ rezerwacji:
 * wymuszenie go tutaj odbiłoby zdjęcie wyłączenia z użytku, które powodu nie potrzebuje,
 * bo nie ma komu tłumaczyć.
 *
 * `POST /:id/cancel`, a nie `DELETE /:id` - ciało żądania `DELETE` bywa wycinane przez
 * pośredniki, a powód jest tu treścią decyzji. Ta sama forma, co przy unieważnieniu
 * operacji w dzienniku.
 */
export function cancelBooking(id: string, reason: string | null): Promise<BookingDto> {
  return apiPost<BookingDto>(`/bookings/${encodeURIComponent(id)}/cancel`, { reason });
}
