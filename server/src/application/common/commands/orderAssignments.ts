/**
 * Ninerdeck (serwer) - PRZYDZIAŁ I COFNIĘCIE PRZYDZIAŁU przez prowadzącego (4.0.0,
 * issue #245; `docs/zlecenia.md` §4.3, §5.3, §20 Z3).
 *
 * ══ WYŁĄCZNIE SPOŚRÓD ZGŁOSZONYCH (pkt 12) ══
 * Innego pilota nie wpisuje się do fotela bez jego „tak" - od tego jest rezerwacja za
 * pilota w module rezerwacji. Przydzielony z grupy albo listy nie potwierdza drugi raz:
 * zgłosił się, więc przydział jest ostateczny i przychodzi do niego jako „Lot przydzielony".
 *
 * ══ DWA PRZYDZIAŁY NARAZ (§20 Z3) ══
 * Zlecenie prowadzi kilka osób naraz (pkt 20), więc dwa „WYBIERZ" w tej samej minucie
 * ustawiają się w kolejce na blokadzie wiersza zlecenia - drugi dostaje odmowę
 * `seat_filled`, którą ekran nazywa „fotel już obsadzony".
 *
 * Przy obsadzaniu serwer sprawdza WYŁĄCZNIE to, co odbiłaby rezerwacja: aktywne
 * członkostwo i jedną osobę nie w dwóch fotelach. Kolizja z INNĄ rezerwacją tej osoby nie
 * blokuje - baza pilnuje egzemplarza, nie człowieka; karta mówi o niej bursztynem.
 */

import { holdsSlot } from '../../../domain/bookings.ts';
import { refuseAssign, refuseUnassign } from '../../../domain/orderAnswers.ts';
import { filledAudience } from '../../../domain/orderAudiences.ts';
import type { Seat } from '../../../domain/orders.ts';
import type { NotificationDraft } from '../notify/bookingNotices.ts';
import type { Notifier, RecordedNotice } from '../notify/notifier.ts';
import { orderAssigned, orderFilled, orderUnassigned } from '../notify/orderNotices.ts';
import type { OrderSignals } from '../notify/orderSignals.ts';
import {
  audienceStateOf,
  leads,
  noticeOrderOf,
  orderView,
  recipientView,
  visibleTo,
  type OrderActor,
} from '../orderAccess.ts';
import type { LoadedOrder, OrderRecords } from '../orderRecords.ts';
import type {
  ClubMembersPort,
  Clock,
  Database,
  OrderChangesPort,
  Queryable,
} from '../ports.ts';
import { OrderDenied, orderOutcome, type OrderResult } from '../orderOutcome.ts';
import type { OrderSeating } from '../orderSeating.ts';

export class OrderAssignmentCommands {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly seating: OrderSeating,
    private readonly changes: OrderChangesPort,
    private readonly members: ClubMembersPort,
    private readonly notifier: Notifier,
    private readonly signals: OrderSignals,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  /** „WYBIERZ" / „NA DOWÓDCĘ" / „NA DRUGIEGO PILOTA". `null` = zlecenia nie ma albo go nie widać → 404. */
  async assign(orgId: string, actor: OrderActor, id: string, input: { pilotId: string; seat: Seat }): Promise<OrderResult | null> {
    return this.change(orgId, actor, id, async (tx, loaded, now) => {
      const view = orderView(loaded.order, loaded.booking);
      const row = loaded.recipients.find((r) => r.pilotId === input.pilotId) ?? null;
      const refusal = refuseAssign(view, row == null ? null : recipientView(row, loaded.order.revision), input.seat);
      if (refusal != null) throw new OrderDenied(refusal);
      // Ta sama osoba w tym samym fotelu - brak zmiany, ta sama odpowiedź.
      if (view.crew[input.seat] === input.pilotId) return null;

      const member = (await this.members.list(tx, orgId)).find((m) => m.pilotId === input.pilotId);
      if (member == null || !member.active) throw new OrderDenied('not_member');

      const fresh = await this.seating.seat(tx, orgId, loaded, { ...view.crew, [input.seat]: input.pilotId }, now);
      await this.log(tx, orgId, id, actor.pilotId, 'assigned', { seat: input.seat, pilotId: input.pilotId, via: 'leader' }, now);

      const notice = noticeOrderOf(fresh.order, fresh.booking);
      const notices: NotificationDraft[] = [];
      if (input.pilotId !== actor.pilotId) notices.push(orderAssigned(notice, input.pilotId, input.seat));
      notices.push(
        ...orderFilled(notice, filledAudience(audienceStateOf(fresh), input.seat).filter((p) => p !== actor.pilotId)),
      );
      return { loaded: fresh, notices };
    });
  }

  /** Cofnięcie przydziału - fotel wraca do szukania; pozostali chętni dalej się liczą (§5.3). */
  async unassign(orgId: string, actor: OrderActor, id: string, input: { seat: Seat; reason: string | null }): Promise<OrderResult | null> {
    return this.change(orgId, actor, id, async (tx, loaded, now) => {
      const view = orderView(loaded.order, loaded.booking);
      const refusal = refuseUnassign(view, input.seat);
      if (refusal != null) throw new OrderDenied(refusal);

      const pilotId = view.crew[input.seat]!;
      const fresh = await this.seating.seat(tx, orgId, loaded, { ...view.crew, [input.seat]: null }, now);
      await this.log(
        tx,
        orgId,
        id,
        actor.pilotId,
        'unassigned',
        { seat: input.seat, pilotId, reason: input.reason, via: 'leader' },
        now,
      );
      const notices =
        pilotId === actor.pilotId
          ? []
          : [orderUnassigned(noticeOrderOf(fresh.order, fresh.booking), pilotId, { seat: input.seat, reason: input.reason })];
      return { loaded: fresh, notices };
    });
  }

  /**
   * Szkielet obu komend: blokada, prawo prowadzenia, żywe zlecenie i żywy termin, zapis
   * wiadomości w transakcji, budzik i sygnał po commicie. `step` oddaje `null`, gdy nie
   * ma czego zmieniać - wtedy nikt nie dostaje wiadomości.
   */
  private async change(
    orgId: string,
    actor: OrderActor,
    id: string,
    step: (tx: Queryable, loaded: LoadedOrder, now: Date) => Promise<{ loaded: LoadedOrder; notices: NotificationDraft[] } | null>,
  ): Promise<OrderResult | null> {
    const now = this.clock.now();
    return orderOutcome(async () => {
      const written = await this.db.transaction(async (tx) => {
        const loaded = await this.records.lock(tx, orgId, id);
        if (loaded == null || !visibleTo(loaded, actor)) return null;
        if (!leads(loaded.order, actor)) throw new OrderDenied('not_leader');
        if (!holdsSlot(loaded.booking.status)) throw new OrderDenied('booking_closed');
        const result = await step(tx, loaded, now);
        if (result == null) return { loaded, notices: [] as RecordedNotice[], changed: false };
        const notices = await this.notifier.record(tx, orgId, result.notices, now);
        const fresh = (await this.records.read(tx, orgId, id)) ?? result.loaded;
        return { loaded: fresh, notices, changed: true };
      });
      if (written == null) return null;
      if (written.changed) {
        await this.notifier.wake(orgId, written.notices);
        this.signals.changed(orgId, written.loaded);
      }
      return { ok: true as const, loaded: written.loaded, created: false };
    });
  }

  private async log(
    tx: Queryable,
    orgId: string,
    orderId: string,
    actorId: string,
    kind: 'assigned' | 'unassigned',
    payload: Record<string, unknown>,
    at: Date,
  ): Promise<void> {
    await this.changes.insert(tx, orgId, orderId, [{ id: this.newId(), actorId, kind, payload }], at);
  }
}
