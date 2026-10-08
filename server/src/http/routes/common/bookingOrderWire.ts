/**
 * Ninerdeck (serwer) - pole `order` rezerwacji na drucie (4.0.0, issue #245;
 * `docs/zlecenia.md` §13.1, §16 pkt 2).
 *
 * Jedno pole w WĄSKIM kształcie rezerwacji, więc widzi je każdy członek klubu - na telefonie
 * i w panelu tak samo:
 *  - `null` - zwykła rezerwacja albo wyłączenie z użytku;
 *  - `{ seeking }` - rezerwacja zlecenia; pasek pisze „Zlecenie · szuka dowódcy / drugiego
 *    pilota / załogi", a pusta lista znaczy komplet (fotele niosą wtedy nazwiska);
 *  - `{ seeking, id, createdBy }` - ten sam wiersz dla prowadzącego i adresata: „Otwórz
 *    zlecenie" i „kto zleca" (szuflada K2c, karta 23F).
 */

import type { BookingOrders } from '../../../application/common/queries/bookingOrders.ts';
import type { BookingRecord } from '../../../application/common/ports.ts';

export function bookingOrderWire(row: BookingRecord, orders: BookingOrders): Record<string, unknown> | null {
  if (row.orderId == null) return null;
  const view = orders.get(row.id);
  // Odpowiedź, która nie dociągnęła zlecenia (`NO_ORDERS`), nie zgaduje foteli - mówi tylko,
  // że to zlecenie. Dociągają je wszystkie trasy, w których rezerwacja zlecenia może stanąć.
  if (view == null) return { seeking: [] };
  return view.opens
    ? { id: view.id, createdBy: view.createdBy, seeking: view.seeking }
    : { seeking: view.seeking };
}
