/**
 * Ninerdeck (serwer) - ODPOWIEDZI ADRESATA: odczyt, „tak/nie" i rezygnacja (4.0.0,
 * issue #245; `docs/zlecenia.md` §4.3, §5.3, §8, §12).
 *
 * Adresat nie potrzebuje żadnej zdolności (§9): trasa sprawdza, czy zlecenie do niego
 * TRAFIŁO, a nie, co może w klubie. Stąd każda metoda pyta najpierw o wiersz adresata -
 * kto go nie ma, dla tego zlecenie nie istnieje (404), chyba że je prowadzi (403).
 *
 * ══ „FOTEL JUŻ ZAJĘTY" TO ODPOWIEDŹ, NIE BŁĄD (§20 Z3) ══
 * Odpowiedź idzie pod blokadą wiersza zlecenia - dwie osoby wskazane na ten sam fotel
 * albo odpowiedź obok przydziału ustawiają się w kolejce, a przegrany dostaje wynik
 * `seat_filled` ze zwykłym kodem 200. Ekran nazywa go zdaniem.
 *
 * ══ ODPOWIEDZI BUDZĄ WYŁĄCZNIE AUTORA (pkt 28) ══
 * Pozostali prowadzący widzą je na karcie i liście na żywo (kanał klubu) - inaczej każde
 * „mogę lecieć" budziłoby wszystkich koordynatorów klubu.
 */

import { holdsSlot } from '../../../domain/bookings.ts';
import { answerOutcome, refuseAnswer, refuseWithdraw, type AnswerOutcome } from '../../../domain/orderAnswers.ts';
import { filledAudience } from '../../../domain/orderAudiences.ts';
import { crewSeatOf, type OrderAnswer, type OrderCrew } from '../../../domain/orders.ts';
import type { NotificationDraft } from '../notify/bookingNotices.ts';
import type { Notifier, RecordedNotice } from '../notify/notifier.ts';
import { orderAnswered, orderFilled, orderWithdrawn } from '../notify/orderNotices.ts';
import type { OrderSignals } from '../notify/orderSignals.ts';
import {
  audienceStateOf,
  noticeOrderOf,
  orderView,
  recipientView,
  visibleTo,
  type OrderActor,
} from '../orderAccess.ts';
import type { LoadedOrder, OrderRecords } from '../orderRecords.ts';
import type {
  Clock,
  Database,
  OrderChangesPort,
  OrderRecipientsPort,
  Queryable,
} from '../ports.ts';
import { OrderDenied, orderOutcome, type OrderCommandRefusal, type OrderResult } from '../orderOutcome.ts';
import type { OrderSeating } from '../orderSeating.ts';

export type AnswerResult =
  | { ok: true; outcome: AnswerOutcome; loaded: LoadedOrder }
  | { ok: false; refusal: OrderCommandRefusal };

export type SeenResult = { ok: true } | { ok: false; refusal: 'not_recipient' };

export class OrderResponseCommands {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly seating: OrderSeating,
    private readonly recipients: OrderRecipientsPort,
    private readonly changes: OrderChangesPort,
    private readonly notifier: Notifier,
    private readonly signals: OrderSignals,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  /**
   * „Odczytane" = adresat OTWORZYŁ kartę zlecenia w bieżącej wersji (§8). Adresat odebrany
   * dostaje zwykłe „w porządku" bez skutku: jego karta mówi „cofnięte" i odczyt niczego
   * nie znaczy, a ekran nie ma powodu dostawać o tym osobnej odmowy.
   */
  async seen(orgId: string, actor: OrderActor, id: string): Promise<SeenResult | null> {
    const loaded = await this.records.read(this.db, orgId, id);
    if (loaded == null || !visibleTo(loaded, actor)) return null;
    const row = loaded.recipients.find((r) => r.pilotId === actor.pilotId);
    if (row == null) return { ok: false, refusal: 'not_recipient' };
    if (row.removedAt != null) return { ok: true };

    const now = this.clock.now();
    await this.recipients.seen(this.db, orgId, id, actor.pilotId, loaded.order.revision, now);

    // Sygnał wyłącznie przy zmianie widocznej prowadzącym: pierwsze otwarcie w tej wersji
    // („Odczytane 14:02") albo pierwsze po edycji („zmiana z 15:10 nieodczytana" gaśnie).
    // Każde kolejne otwarcie karty budziłoby kartę prowadzącego bez żadnej treści.
    const firstInRevision = row.seenRevision !== loaded.order.revision;
    const editedAt = loaded.order.editedAt;
    const firstAfterEdit = editedAt != null && (row.lastSeenAt == null || row.lastSeenAt < editedAt);
    if (firstInRevision || firstAfterEdit) this.signals.changed(orgId, loaded);
    return { ok: true };
  }

  /** Odpowiedź w bieżącej wersji. Powód tylko przy „nie" - wtedy jest treścią wiadomości (§5.6). */
  async answer(
    orgId: string,
    actor: OrderActor,
    id: string,
    input: { answer: OrderAnswer; reason: string | null },
  ): Promise<AnswerResult | null> {
    const now = this.clock.now();
    const reason = input.answer === 'no' ? input.reason : null;

    const written = await orderOutcome(async () =>
      this.db.transaction(async (tx) => {
        const loaded = await this.records.lock(tx, orgId, id);
        if (loaded == null || !visibleTo(loaded, actor)) return null;
        const row = loaded.recipients.find((r) => r.pilotId === actor.pilotId);
        if (row == null) throw new OrderDenied('not_recipient');

        const revision = loaded.order.revision;
        const view = orderView(loaded.order, loaded.booking);
        const me = recipientView(row, revision);
        const refusal = refuseAnswer(view, me, input.answer);
        if (refusal != null) throw new OrderDenied(refusal);

        const outcome = answerOutcome(view, me, input.answer);
        // Zlecenie zamknięte albo odebrane - nie ma czego zapisać, jest tylko odpowiedź.
        if (outcome.kind === 'closed') return { outcome, loaded, notices: [] as RecordedNotice[], changed: false };

        // Powtórzona ta sama odpowiedź (słabe łącze, drugie tapnięcie) - bez zapisu i bez
        // drugiej wiadomości do autora.
        const repeated = row.answeredRevision === revision && row.answer === input.answer && row.answerReason === reason;
        const seatedAlready = crewSeatOf(view.crew, actor.pilotId) != null;
        if (repeated && (outcome.kind !== 'assigned' || seatedAlready)) {
          return { outcome, loaded, notices: [] as RecordedNotice[], changed: false };
        }

        await this.recipients.answer(tx, orgId, id, actor.pilotId, { answer: input.answer, reason, revision }, now);
        const notices: NotificationDraft[] = [];
        let fresh = loaded;
        if (outcome.kind === 'assigned' && !seatedAlready) {
          const crew: OrderCrew = { ...view.crew, [outcome.seat]: actor.pilotId };
          fresh = await this.seating.seat(tx, orgId, loaded, crew, now);
          await this.log(tx, orgId, id, actor.pilotId, 'assigned', { seat: outcome.seat, pilotId: actor.pilotId, via: 'answer' }, now);
          const notice = noticeOrderOf(fresh.order, fresh.booking);
          notices.push(
            ...orderFilled(
              notice,
              filledAudience(audienceStateOf(fresh), outcome.seat).filter((p) => p !== actor.pilotId),
            ),
          );
        } else {
          fresh = (await this.records.read(tx, orgId, id)) ?? loaded;
        }
        // „Tak" na fotel już zajęty zapisuje się jako gotowość (wróci, gdy fotel się
        // zwolni - §5.3), ale autora nie budzi: nic się dla niego nie zmieniło.
        if (outcome.kind !== 'seat_filled') {
          notices.unshift(
            orderAnswered(noticeOrderOf(fresh.order, fresh.booking), fresh.order.createdBy, {
              pilotId: actor.pilotId,
              answer: input.answer,
              reason,
              assignedSeat: outcome.kind === 'assigned' ? outcome.seat : null,
            }),
          );
        }
        return { outcome, loaded: fresh, notices: await this.notifier.record(tx, orgId, notices, now), changed: true };
      }),
    );

    if (written == null) return null;
    if ('refusal' in written) return { ok: false, refusal: written.refusal };
    if (written.changed) {
      await this.notifier.wake(orgId, written.notices);
      this.signals.changed(orgId, written.loaded);
    }
    return { ok: true, outcome: written.outcome, loaded: written.loaded };
  }

  /**
   * „REZYGNUJĘ" przydzielonego (§5.3): jego fotel wraca do szukania, drugi obsadzony
   * zostaje, termin zostaje zajęty. Rezygnacja zapisuje się też jako odpowiedź „nie" -
   * kto zrezygnował, nie jest już chętnym do tego fotela.
   */
  async withdraw(orgId: string, actor: OrderActor, id: string, reason: string | null): Promise<OrderResult | null> {
    const now = this.clock.now();
    return orderOutcome(async () => {
      const written = await this.db.transaction(async (tx) => {
        const loaded = await this.records.lock(tx, orgId, id);
        if (loaded == null || !visibleTo(loaded, actor)) return null;
        const view = orderView(loaded.order, loaded.booking);
        const refusal = refuseWithdraw(view, actor.pilotId);
        if (refusal != null) throw new OrderDenied(refusal);
        if (!holdsSlot(loaded.booking.status)) throw new OrderDenied('booking_closed');

        const seat = crewSeatOf(view.crew, actor.pilotId)!;
        const fresh = await this.seating.seat(tx, orgId, loaded, { ...view.crew, [seat]: null }, now);
        await this.recipients.answer(
          tx,
          orgId,
          id,
          actor.pilotId,
          { answer: 'no', reason, revision: loaded.order.revision },
          now,
        );
        await this.log(tx, orgId, id, actor.pilotId, 'withdrawn', { seat, pilotId: actor.pilotId, reason }, now);

        const notices =
          fresh.order.createdBy === actor.pilotId
            ? []
            : [orderWithdrawn(noticeOrderOf(fresh.order, fresh.booking), fresh.order.createdBy, { pilotId: actor.pilotId, seat, reason })];
        const recorded = await this.notifier.record(tx, orgId, notices, now);
        const reread = (await this.records.read(tx, orgId, id)) ?? fresh;
        return { loaded: reread, notices: recorded };
      });
      if (written == null) return null;
      await this.notifier.wake(orgId, written.notices);
      this.signals.changed(orgId, written.loaded);
      return { ok: true as const, loaded: written.loaded, created: false };
    });
  }

  /** Załoga rezerwacji i stan zlecenia wynikający z niej - razem, w transakcji zmiany. */
  private async log(
    tx: Queryable,
    orgId: string,
    orderId: string,
    actorId: string,
    kind: 'assigned' | 'withdrawn',
    payload: Record<string, unknown>,
    at: Date,
  ): Promise<void> {
    await this.changes.insert(tx, orgId, orderId, [{ id: this.newId(), actorId, kind, payload }], at);
  }
}
