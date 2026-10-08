/**
 * Ninerdeck (serwer) - ZLECENIE W CAŁOŚCI: wiersz zlecenia, jego rezerwacja i adresaci
 * (4.0.0, issue #245; `docs/zlecenia.md` §10).
 *
 * Każda komenda zlecenia zaczyna od tych samych trzech odczytów i każda musi je zrobić tym
 * samym uchwytem - w otwartej transakcji wyłącznie przez `tx` (odczyt cudzym uchwytem
 * zawiesza PGlite, `docs/architektura-panelu-serwer.md` §7.9). Jedno miejsce zamiast
 * sześciu kopii, w których prędzej czy później któraś przeczyta rezerwację bez blokady.
 *
 * ══ BLOKADA IDZIE NA WIERSZ ZLECENIA ══
 * Dwa przydziały naraz (dwóch prowadzących, pkt 20) i odpowiedź obok przydziału ustawiają
 * się w kolejce na `flight_orders ... FOR UPDATE`; drugi widzi stan pierwszego (§20 Z3).
 * Rezerwacji osobno nie blokujemy: zmienia ją wyłącznie komenda zlecenia, a ta stoi już
 * w tej kolejce.
 */

import type {
  BookingRecord,
  BookingsPort,
  FlightOrderRecord,
  FlightOrdersPort,
  OrderRecipientRecord,
  OrderRecipientsPort,
  Queryable,
} from './ports.ts';

export interface LoadedOrder {
  order: FlightOrderRecord;
  booking: BookingRecord;
  recipients: OrderRecipientRecord[];
}

export class OrderRecords {
  constructor(
    private readonly orders: FlightOrdersPort,
    private readonly bookings: BookingsPort,
    private readonly recipients: OrderRecipientsPort,
  ) {}

  /** Odczyt bez blokady - karta, listy, rozmowy. `null` = nie ma go w tym klubie. */
  async read(db: Queryable, orgId: string, id: string): Promise<LoadedOrder | null> {
    return this.load(db, orgId, await this.orders.byId(db, orgId, id));
  }

  /** Odczyt pod blokadą wiersza zlecenia - każda zmiana stanu. */
  async lock(tx: Queryable, orgId: string, id: string): Promise<LoadedOrder | null> {
    return this.load(tx, orgId, await this.orders.lock(tx, orgId, id));
  }

  private async load(
    db: Queryable,
    orgId: string,
    order: FlightOrderRecord | null,
  ): Promise<LoadedOrder | null> {
    if (order == null) return null;
    const booking = (await this.bookings.byOrders(db, orgId, [order.id])).get(order.id);
    // Zlecenie bez rezerwacji nie powstaje (obie wchodzą jedną transakcją), więc brak
    // wiersza znaczy tu tyle, co brak zlecenia - nie ma czego pokazać ani zmienić.
    if (booking == null) return null;
    const recipients = await this.recipients.listFor(db, orgId, order.id);
    return { order, booking, recipients };
  }
}
