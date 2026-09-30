/**
 * Ninerdeck (serwer) - ZLECENIE WIDZIANE Z REZERWACJI (4.0.0, issue #245; `docs/zlecenia.md`
 * §13.1, §16 pkt 2 i 3).
 *
 * Rezerwacja zlecenia to zwykły wiersz `bookings` z PUSTYMI fotelami - jedyny nowy stan
 * rezerwacji. Kalendarz, karta rezerwacji, karta samolotu i odmowa `slot_taken` rysują ją
 * inaczej niż zwykłą: „Zlecenie · szuka dowódcy" zamiast nazwiska. Do tego wystarczą dwie
 * rzeczy i obie liczy ten plik:
 *  - CZEGO SZUKA - fotele szukane i jeszcze puste (`openSeats` z domeny, ta sama reguła, co
 *    zegar zleceń); zamknięte zlecenie nie szuka już niczego;
 *  - CZY PYTAJĄCY MOŻE JE OTWORZYĆ - prowadzi je albo jest jego adresatem (§13.1, szuflada
 *    K2c panelu: „treść, kto zleca i «Otwórz zlecenie» - prowadzący i adresaci"). Każdy inny
 *    członek klubu widzi wyłącznie to, kogo brakuje - identyfikator zlecenia dałby mu adres,
 *    pod którym i tak dostałby 404, więc nie jedzie wcale.
 *
 * W `common/`, bo o to samo pyta telefon i panel - reguła „kto otwiera" rozjechałaby się
 * przy dwóch kopiach tak samo, jak kiedyś kształt cudzej rezerwacji.
 */

import { isLive, type Seat } from '../../../domain/orders.ts';
import { openSeats } from '../../../domain/orderSeats.ts';
import { crewOf, leads, type OrderActor } from '../orderAccess.ts';
import type { BookingRecord, Database, FlightOrdersPort, OrderBookingFacts } from '../ports.ts';

export interface BookingOrderView {
  id: string;
  createdBy: string;
  /** Fotele, których zlecenie szuka TERAZ; pusto po obsadzeniu i po zamknięciu zlecenia. */
  seeking: Seat[];
  /** Czy widz może otworzyć zlecenie: prowadzi je albo jest jego adresatem. */
  opens: boolean;
}

/** Zlecenia za rezerwacjami - klucz to identyfikator REZERWACJI. */
export type BookingOrders = ReadonlyMap<string, BookingOrderView>;

/**
 * Dla odpowiedzi, w których rezerwacji zlecenia być nie może: kolejka decyzji (zlecenie nie
 * przechodzi ścieżki akceptacji, decyzja 5) i wynik zapisu zwykłej rezerwacji.
 */
export const NO_ORDERS: BookingOrders = new Map();

/** Czysta reguła - rezerwacja, fakty jej zlecenia i widz. */
export function bookingOrderView(
  booking: Pick<BookingRecord, 'pilotId' | 'dualId'>,
  facts: OrderBookingFacts,
  actor: OrderActor,
): BookingOrderView {
  return {
    id: facts.id,
    createdBy: facts.createdBy,
    seeking: isLive(facts.status) ? openSeats(facts.seats, crewOf(booking)) : [],
    opens: leads(facts, actor) || facts.viewerIsRecipient,
  };
}

export class BookingOrderQueries {
  constructor(
    private readonly db: Database,
    private readonly orders: FlightOrdersPort,
  ) {}

  /**
   * Zlecenia za tymi rezerwacjami, widziane przez `actor`. Bez rezerwacji zlecenia nie ma
   * zapytania - kalendarz bez zleceń nie płaci za tę funkcję ani jednego odczytu.
   */
  async of(orgId: string, actor: OrderActor, rows: readonly BookingRecord[]): Promise<BookingOrders> {
    const orderIds = [...new Set(rows.flatMap((row) => (row.orderId == null ? [] : [row.orderId])))];
    if (orderIds.length === 0) return NO_ORDERS;
    const facts = await this.orders.bookingFacts(this.db, orgId, orderIds, actor.pilotId);
    const out = new Map<string, BookingOrderView>();
    for (const row of rows) {
      const order = row.orderId == null ? undefined : facts.get(row.orderId);
      if (order != null) out.set(row.id, bookingOrderView(row, order, actor));
    }
    return out;
  }
}
