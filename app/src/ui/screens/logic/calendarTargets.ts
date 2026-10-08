/**
 * Ninerdeck - DOKĄD PROWADZI TAPNIĘCIE NA OSI KALENDARZA (21, 21E; zlecenia 4.0.0,
 * `docs/zlecenia.md` §14.1).
 *
 * ══ PASEK ══
 * Zwykła rezerwacja i wyłączenie z użytku prowadzą do karty rezerwacji (23). Pasek
 * zlecenia prowadzi do KARTY ZLECENIA - prowadzącego do 32, adresata do 28 - ale tylko
 * temu, kto zlecenie widzi (serwer przysyła `order.id` wyłącznie prowadzącemu
 * i adresatowi, §13.1). Kto siedzi w fotelu, ma lot jako SWOJĄ rezerwację - dla niego
 * pasek prowadzi do karty rezerwacji ze zlecenia (23F). Pozostali członkowie widzą
 * cudzą zajętość, jak dotąd.
 *
 * ══ WOLNE PASMO ══
 * Tapnięcie wskazuje GODZINĘ, a arkusz „dla siebie / zleć" (21E) pokazuje całe wolne
 * pasmo wokół niej - liczy je domena (`freeSpans`), ta sama odpowiedź, z której powstają
 * sugestie slotów i napis „wolne:" na karcie maszyny.
 */

import { freeSpans } from '@ninerdeck/domain';

import type { CalendarBooking } from './calendarData';

export type BarTarget =
  | { screen: 'BookingDetails'; params: { bookingId: string } }
  | { screen: 'Order'; params: { orderId: string; as?: 'leader' } };

export function barTarget(bookingId: string, booking: CalendarBooking | null, pilotId: string): BarTarget {
  const order = booking?.order;
  const seated = booking != null && (booking.pilotId === pilotId || booking.dualId === pilotId);
  if (order?.id != null && !seated) {
    // Autor otwiera kartę prowadzącego wprost; reszcie rozstrzyga sama karta (koordynator
    // jest prowadzącym, adresat - adresatem).
    return { screen: 'Order', params: { orderId: order.id, ...(order.createdBy === pilotId ? { as: 'leader' as const } : {}) } };
  }
  return { screen: 'BookingDetails', params: { bookingId } };
}

/**
 * Wolne pasmo maszyny, w które trafiło tapnięcie; `null` = tapnięcie w zajętość albo
 * poza okno (wtedy arkusza nie ma i tapnięcie prowadzi wprost do rezerwacji).
 */
export function freeBandAt(input: {
  bookings: readonly CalendarBooking[];
  aircraftId: string;
  window: { from: number; to: number };
  at: number;
}): { startsAt: number; endsAt: number } | null {
  const busy = input.bookings.filter((b) => b.aircraftId === input.aircraftId);
  return freeSpans(input.window, busy).find((span) => input.at >= span.startsAt && input.at < span.endsAt) ?? null;
}
