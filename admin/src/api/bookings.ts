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

import type {
  BlockReasonDto,
  BookingDetailDto,
  BookingDto,
  CalendarDto,
  SuggestionsDto,
} from './dto';
import { apiDelete, apiGet, apiPatch, apiPost } from './httpClient';

/**
 * JEDNA zajętość razem ze stanem jej ścieżki akceptacji (3.1.0, issue #165).
 *
 * Osobne pytanie od okna kalendarza, bo stan ścieżki jedzie WYŁĄCZNIE tutaj: siatka
 * rysuje pasek i o kroki nie pyta, a odczyt per wiersz zamieniłby jedno zapytanie
 * o tydzień w tyle zapytań, ile rezerwacji stoi na ekranie.
 */
export function getBooking(id: string): Promise<BookingDetailDto> {
  return apiGet<BookingDetailDto>(`/bookings/${encodeURIComponent(id)}`);
}

export interface CalendarRange {
  /** ISO - dowolna chwila; serwer i tak sprowadzi ją do granic dób w strefie klubu. */
  from: string;
  to: string;
  /** Jedna maszyna - pasek zajętości doby w szufladzie własnej rezerwacji (#233). */
  aircraftId?: string;
}

export function getCalendar(range: CalendarRange): Promise<CalendarDto> {
  const query = new URLSearchParams({ from: range.from, to: range.to });
  if (range.aircraftId != null) query.set('aircraftId', range.aircraftId);
  return apiGet<CalendarDto>(`/bookings?${query.toString()}`);
}

/** Pytanie o sugestie: maszyna, dowolna chwila doby, długość terminu. */
export interface SuggestionsQuery {
  aircraftId: string;
  /** ISO - dowolna chwila doby; serwer sprowadzi ją do granic doby klubu. */
  day: string;
  minutes: number;
  /** Pora wskazana kliknięciem w komórkę - premia w rachunku upakowania dnia. */
  preferredAt?: string;
}

export function getSuggestions(q: SuggestionsQuery): Promise<SuggestionsDto> {
  const query = new URLSearchParams({ aircraftId: q.aircraftId, day: q.day, minutes: String(q.minutes) });
  if (q.preferredAt != null) query.set('preferredAt', q.preferredAt);
  return apiGet<SuggestionsDto>(`/bookings/suggestions?${query.toString()}`);
}

/**
 * WŁASNA rezerwacja z panelu (issue #233) - to samo zamówienie, co z telefonu. Właściciela
 * w ciele NIE MA: bierze się z sesji, więc tą drogą nie da się zarezerwować za kogoś.
 */
export interface NewOwnBooking {
  id: string;
  aircraftId: string;
  startsAt: string;
  endsAt: string;
  operation: string;
  dualId: string | null;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  note: string | null;
}

/** Poprawka niesie SAMĄ RÓŻNICĘ - pola pominięte zostają z wiersza. */
export type OwnBookingPatch = Partial<Omit<NewOwnBooking, 'id' | 'aircraftId'>>;

export function createOwnBooking(body: NewOwnBooking): Promise<BookingDto> {
  return apiPost<BookingDto>('/me/bookings', body);
}

export function patchOwnBooking(id: string, patch: OwnBookingPatch): Promise<BookingDto> {
  return apiPatch<BookingDto>(`/me/bookings/${encodeURIComponent(id)}`, patch);
}

/**
 * Kroki ścieżki akceptacji, przez które przejdzie rezerwacja ZALOGOWANEGO - stopka
 * szuflady nazywa je przed kliknięciem. Pusta lista = potwierdza się od razu.
 */
export function getMyApprovalPath(): Promise<{ steps: string[] }> {
  return apiGet<{ steps: string[] }>('/me/approval-path');
}

/**
 * Odwołanie WŁASNEJ rezerwacji - `DELETE` bez ciała, bo powodu tu nie ma: czyta go pilot,
 * którego plan zdjęto, a przy własnym nie ma komu tłumaczyć.
 */
export function cancelOwnBooking(id: string): Promise<void> {
  return apiDelete(`/me/bookings/${encodeURIComponent(id)}`);
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
