/**
 * Ninerdeck (serwer) - WYNIK KOMENDY ZLECENIA i przerwanie transakcji z powodem
 * (4.0.0, issue #245; `docs/zlecenia.md` §13).
 *
 * Komendy zlecenia orzekają w środku transakcji, pod blokadą wiersza - i tam też odmawiają.
 * Zwrócona wartość nie umiałaby wycofać tego, co transakcja zdążyła zapisać (zlecenie bez
 * rezerwacji, adresaci bez zlecenia), więc odmowa jest WYJĄTKIEM, a zamienia się
 * z powrotem na odmowę dopiero poza transakcją - ta sama zasada, co `AuditedWrite`.
 */

import type { BookingRefusal } from '../../domain/bookings.ts';
import type { OrderRefusal } from '../../domain/orders.ts';
import type { LoadedOrder } from './orderRecords.ts';
import type { BookingRecord } from './ports.ts';

/**
 * Kody odmowy komend zlecenia: reguły zlecenia, reguły terminu i `not_leader` - osoba
 * widzi zlecenie (jest adresatem), ale go nie prowadzi. Kogo zlecenie w ogóle nie
 * dotyczy, dostaje `null` → 404: cudze zlecenie jest dla niego nieistniejące (epik C).
 */
export type OrderCommandRefusal = OrderRefusal | BookingRefusal | 'not_leader';

export type OrderFailure = { ok: false; refusal: OrderCommandRefusal; taken?: BookingRecord | null };

export type OrderResult = { ok: true; loaded: LoadedOrder; created: boolean } | OrderFailure;

/** Przerwanie transakcji z powodem; `taken` = kolizja przy `slot_taken`. */
export class OrderDenied extends Error {
  constructor(
    readonly refusal: OrderCommandRefusal,
    readonly taken: BookingRecord | null = null,
  ) {
    super(`odmowa zlecenia: ${refusal}`);
  }
}

/** Wynik komendy z przerwaniem zamienionym na odmowę. */
export async function orderOutcome<T>(run: () => Promise<T>): Promise<T | OrderFailure> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof OrderDenied) {
      return err.refusal === 'slot_taken'
        ? { ok: false, refusal: err.refusal, taken: err.taken }
        : { ok: false, refusal: err.refusal };
    }
    throw err;
  }
}
