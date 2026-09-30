/**
 * Ninerdeck (serwer) - OBSADZENIE FOTELA: załoga rezerwacji i stan zlecenia razem
 * (4.0.0, issue #245; `docs/zlecenia.md` §4.3, §5).
 *
 * Odpowiedź imienna, przydział, cofnięcie i rezygnacja zmieniają to samo: osobę w fotelu
 * (trzyma ją rezerwacja) i wynikający z niej stan zlecenia (komplet = `filled`). Dwa
 * zapisy, które nie mają prawa się rozjechać - więc jedna metoda, w transakcji zmiany.
 */

import { statusFor } from '../../domain/orderSeats.ts';
import type { OrderCrew } from '../../domain/orders.ts';
import { OrderDenied } from './orderOutcome.ts';
import type { LoadedOrder } from './orderRecords.ts';
import type { BookingsPort, FlightOrdersPort, Queryable } from './ports.ts';

export class OrderSeating {
  constructor(
    private readonly orders: FlightOrdersPort,
    private readonly bookings: BookingsPort,
  ) {}

  /** Nowa załoga i stan zlecenia; odmowa, gdy termin albo zlecenie zdążyły się zamknąć. */
  async seat(tx: Queryable, orgId: string, loaded: LoadedOrder, crew: OrderCrew, at: Date): Promise<LoadedOrder> {
    const booking = await this.bookings.setCrew(tx, orgId, loaded.booking.id, crew, at);
    if (booking == null) throw new OrderDenied('booking_closed');
    const status = statusFor(loaded.order.status, loaded.order.seats, crew);
    let order = loaded.order;
    if (status !== order.status && (status === 'open' || status === 'filled')) {
      const updated = await this.orders.update(tx, orgId, order.id, { status }, at);
      if (updated == null) throw new OrderDenied('order_closed');
      order = updated;
    }
    return { order, booking, recipients: loaded.recipients };
  }
}
