/**
 * Ninerdeck (serwer) - ODWOŁANIE Z KARTY REZERWACJI, gdy za rezerwacją stoi ZLECENIE
 * (4.0.0, issue #245; `docs/zlecenia.md` §5.3, §14.3, §16 pkt 6 i 9).
 *
 * Termin rezerwacji zlecenia prowadzi zlecenie, więc „ODWOŁAJ" znaczy to, co znaczy dla
 * OSOBY, która je wciska:
 *  - przydzielony pilot (fotel SZUKANY, obsadzony nim) - REZYGNUJĘ: fotel wraca do szukania,
 *    termin zostaje zajęty, zlecający dostaje „Rezygnacja z lotu" (§5.3, karta 23F);
 *  - zlecający siedzący w swoim fotelu „ja" - odwołanie CAŁEGO zlecenia (decyzja właściciela
 *    2026-09-30: dla niego rezerwacja JEST zleceniem, osobno nie ma czego odwołać);
 *  - prowadzący z „Cudzymi rezerwacjami" odwołujący ją z kalendarza panelu - też odwołanie
 *    zlecenia, z powodem opcjonalnym (§5.6) i BEZ dziennika akcji (§10.3).
 *
 * Odmowy wracają jako odmowy REZERWACJI: karta rezerwacji zna wyłącznie te, a zlecenie
 * zamknięte w międzyczasie jest dla niej tym samym, co rezerwacja zamknięta.
 */

import type { BookingRefusal } from '../../../domain/bookings.ts';
import { crewSeatOf } from '../../../domain/orders.ts';
import { crewOf, type OrderActor } from '../orderAccess.ts';
import type { OrderResult } from '../orderOutcome.ts';
import type { OrderRecords } from '../orderRecords.ts';
import type { BookingRecord, Database } from '../ports.ts';
import type { OrderCommands } from './orders.ts';
import type { OrderResponseCommands } from './orderResponses.ts';

export type OrderBookingCancel =
  | { ok: true; booking: BookingRecord }
  | { ok: false; refusal: BookingRefusal };

export class OrderBookingCommands {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly orders: OrderCommands,
    private readonly responses: OrderResponseCommands,
  ) {}

  /**
   * „ODWOŁAJ" na karcie WŁASNEJ rezerwacji (telefon i panel). `null` = zlecenia nie ma
   * w tym klubie. Osoba spoza załogi dostaje „to nie twoje" - jak przy zwykłej rezerwacji.
   */
  async cancelOwn(
    orgId: string,
    actor: OrderActor,
    orderId: string,
    reason: string | null,
  ): Promise<OrderBookingCancel | null> {
    const loaded = await this.records.read(this.db, orgId, orderId);
    if (loaded == null) return null;
    const seat = crewSeatOf(crewOf(loaded.booking), actor.pilotId);
    if (seat == null) return { ok: false, refusal: 'not_your_booking' };
    return settle(
      loaded.order.seats[seat] === 'self'
        ? await this.orders.cancel(orgId, actor, orderId, reason)
        : await this.responses.withdraw(orgId, actor, orderId, reason),
    );
  }

  /** Odwołanie z kalendarza panelu przez prowadzącego - odwołanie zlecenia. */
  async cancelAsLeader(
    orgId: string,
    actor: OrderActor,
    orderId: string,
    reason: string | null,
  ): Promise<OrderBookingCancel | null> {
    return settle(await this.orders.cancel(orgId, actor, orderId, reason));
  }
}

function settle(result: OrderResult | null): OrderBookingCancel | null {
  if (result == null) return null;
  if (result.ok) return { ok: true, booking: result.loaded.booking };
  // Zlecenie zamknięte w międzyczasie to dla karty rezerwacji rezerwacja zamknięta; każda
  // inna odmowa znaczy, że ten fotel (albo to zlecenie) nie jest już sprawą pytającego.
  return { ok: false, refusal: result.refusal === 'order_closed' ? 'booking_closed' : 'not_your_booking' };
}
