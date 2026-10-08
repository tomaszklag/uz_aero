/**
 * Ninerdeck (serwer) - ZLECENIE NA LOT: utworzenie i odwołanie (4.0.0, issue #245;
 * `docs/zlecenia.md` §2, §4, §5, §5.6, §6.2).
 *
 * ══ W `common/`, BO ZLECA SIĘ Z TELEFONU I Z PANELU ══
 * Ta sama czynność z obu powierzchni (§13) - dwie bramy, jedna komenda. Zmiana zlecenia
 * mieszka obok (`orderEdit.ts`), odpowiedzi adresatów w `orderResponses.ts`, przydziały
 * w `orderAssignments.ts`, rozmowy w `threads.ts`: każdy plik ma jedno pytanie.
 *
 * ══ ZLECENIE I REZERWACJA WCHODZĄ JEDNĄ TRANSAKCJĄ ══
 * Zlecenie to rezerwacja, która szuka załogi (§2.1): termin trzyma wiersz `bookings`
 * od chwili utworzenia, więc nakładanie odbija ta sama baza, co przy każdej rezerwacji -
 * a `409 slot_taken` niesie kolizję. Rezerwacja powstaje od razu `confirmed`, BEZ ścieżki
 * akceptacji (§5.4): `ApprovalFlow` o zleceniach nie wie nic, a przegląd ścieżki
 * (`reconcile`) patrzy wyłącznie na `pending`.
 *
 * ══ HISTORIA ZMIAN ZAMIAST DZIENNIKA AKCJI (§10.3) ══
 * Każde przejście zlecenia zostawia wpis w `order_changes` - tam prowadzący widzą, KTO
 * co zrobił, także gdy zlecenie prowadzi kilka osób naraz (pkt 20). `admin_audit` zleceń
 * nie dostaje, tak jak decyzje ścieżki mają własne `booking_approvals`.
 */

import { refuseCreate, holdsSlot } from '../../../domain/bookings.ts';
import { audienceLabel, expandRecipients, type OrderAudience } from '../../../domain/orderAddressing.ts';
import { cancelAudience } from '../../../domain/orderAudiences.ts';
import { refuseSeats } from '../../../domain/orderSeats.ts';
import { isLive, type OrderSeats } from '../../../domain/orders.ts';
import { aircraftFlightCancelled } from '../notify/aircraftNotices.ts';
import type { AircraftWatching } from '../notify/aircraftWatching.ts';
import type { Notifier, RecordedNotice } from '../notify/notifier.ts';
import { orderCancelled, orderOffered } from '../notify/orderNotices.ts';
import type { OrderSignals } from '../notify/orderSignals.ts';
import {
  audienceStateOf,
  leads,
  noticeOrderOf,
  offeredTo,
  personNames,
  visibleTo,
  type OrderActor,
} from '../orderAccess.ts';
import { OrderDenied, orderOutcome, type OrderResult } from '../orderOutcome.ts';
import type { OrderRecords } from '../orderRecords.ts';
import type {
  AircraftConfigPort,
  BookingsPort,
  ClubMembersPort,
  Clock,
  Database,
  FlightOrdersPort,
  MemberGroupsPort,
  OrderChangesPort,
  OrderRecipientsPort,
} from '../ports.ts';

/** Zamówienie zlecającego. Klub i autora dokłada komenda - nie przychodzą z drutu. */
export interface OrderDraft {
  id: string;
  aircraftId: string;
  startsAt: number;
  endsAt: number;
  operation: string;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  note: string | null;
  seats: OrderSeats;
  audience: OrderAudience;
}

export class OrderCommands {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly orders: FlightOrdersPort,
    private readonly bookings: BookingsPort,
    private readonly recipients: OrderRecipientsPort,
    private readonly changes: OrderChangesPort,
    private readonly groups: MemberGroupsPort,
    private readonly members: ClubMembersPort,
    private readonly aircraft: AircraftConfigPort,
    private readonly notifier: Notifier,
    private readonly signals: OrderSignals,
    private readonly clock: Clock,
    private readonly newId: () => string,
    /**
     * Obserwowanie samolotu (3.2.0) - odwołanie terminu, o którym JUŻ przypomniano
     * obserwującym, rodzi „odwołany lot" (§5.2 obserwowania: „co ogłosiłeś, to odwołaj").
     */
    private readonly watching: AircraftWatching | null = null,
  ) {}

  /**
   * Nowe zlecenie. Powtórzony zapis tym samym uuidem (słabe łącze) oddaje TO SAMO
   * zlecenie i nie budzi nikogo drugi raz - ale wyłącznie jego autorowi: cudzy uuid
   * w tym samym klubie jest dla wołającego zajętym terminem bez wskazania czym, jak
   * przy rezerwacji z uuidem z innego klubu.
   */
  async create(orgId: string, actor: OrderActor, draft: OrderDraft): Promise<OrderResult> {
    if (!actor.creates) return { ok: false, refusal: 'not_leader' };

    const now = this.clock.now();
    const status = await this.aircraft.serviceStatusOf(this.db, orgId, draft.aircraftId);
    const termRefusal = refuseCreate({ ...draft, kind: 'flight' }, now.getTime(), { serviceStatus: status });
    if (termRefusal != null) return { ok: false, refusal: termRefusal };

    const dualRequired = (await this.aircraft.dualRequired(this.db, orgId, draft.aircraftId)) ?? false;
    const seatRefusal = refuseSeats(draft.seats, { dualRequired });
    if (seatRefusal != null) return { ok: false, refusal: seatRefusal };

    // Rozwinięcie grup w osoby PRZED transakcją, jak plan ścieżki przy rezerwacji: jego
    // wynik decyduje o odmowie, a odmowa nie ma czego wycofywać (§6.2).
    const groups = await this.groups.list(this.db, orgId);
    const members = await this.members.list(this.db, orgId);
    const active = new Set(members.filter((m) => m.active).map((m) => m.pilotId));
    const plan = expandRecipients(draft.seats, draft.audience, {
      authorId: actor.pilotId,
      groupMembers: new Map(groups.map((g) => [g.id, g.memberIds])),
      isActiveMember: (pilotId) => active.has(pilotId),
    });
    if (typeof plan === 'string') return { ok: false, refusal: plan };
    const label = audienceLabel(draft.seats, draft.audience, personNames(members, groups));

    return orderOutcome(async () => {
      const written = await this.db.transaction(async (tx) => {
        const inserted = await this.orders.insert(
          tx,
          orgId,
          {
            id: draft.id,
            createdBy: actor.pilotId,
            seats: draft.seats,
            addressing: draft.audience.kind,
            status: 'open',
            audience: draft.audience,
            audienceLabel: label,
          },
          now,
        );
        if (!inserted) {
          const existing = await this.records.read(tx, orgId, draft.id);
          if (existing == null || existing.order.createdBy !== actor.pilotId) throw new OrderDenied('slot_taken');
          return { loaded: existing, created: false, notices: [] as RecordedNotice[] };
        }

        // Fotel „ja" to zlecający - siedzi w rezerwacji od początku; szukany jest pusty.
        const booking = await this.bookings.insert(tx, orgId, {
          id: this.newId(),
          aircraftId: draft.aircraftId,
          kind: 'flight',
          status: 'confirmed',
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
          pilotId: draft.seats.pic === 'self' ? actor.pilotId : null,
          dualId: draft.seats.dual === 'self' ? actor.pilotId : null,
          operation: draft.operation,
          fromIcao: draft.fromIcao,
          toIcao: draft.toIcao,
          plannedAirMin: draft.plannedAirMin,
          plannedFuelL: draft.plannedFuelL,
          blockReason: null,
          note: draft.note,
          createdBy: actor.pilotId,
          orderId: draft.id,
        });
        // Wyjątek, nie zwrot: zlecenie wstawione wyżej ma zniknąć razem z rezerwacją.
        if (!booking.ok) throw new OrderDenied('slot_taken', booking.taken);

        const added = await this.recipients.insertMany(tx, orgId, draft.id, plan);
        await this.changes.insert(
          tx,
          orgId,
          draft.id,
          [
            {
              id: this.newId(),
              actorId: actor.pilotId,
              kind: 'created',
              payload: {
                aircraftId: draft.aircraftId,
                startsAt: new Date(draft.startsAt).toISOString(),
                endsAt: new Date(draft.endsAt).toISOString(),
                seats: draft.seats,
                addressing: draft.audience.kind,
                audience: label,
                recipients: added.length,
              },
            },
          ],
          now,
        );

        const loaded = await this.records.read(tx, orgId, draft.id);
        if (loaded == null) throw new Error('zlecenie zniknęło w transakcji, która je zapisała');
        const drafts = orderOffered(noticeOrderOf(loaded.order, loaded.booking), offeredTo(loaded.recipients, added), false);
        return { loaded, created: true, notices: await this.notifier.record(tx, orgId, drafts, now) };
      });

      // Budzik i sygnał PO commicie: push jest budzikiem, a nie treścią (§12).
      if (written.created) {
        await this.notifier.wake(orgId, written.notices);
        await this.signals.changed(orgId, written.loaded);
      }
      return { ok: true as const, loaded: written.loaded, created: written.created };
    });
  }

  /**
   * Odwołanie przez prowadzącego - powód opcjonalny, a gdy jest, jest treścią wiadomości
   * (§5.6). Termin wraca do puli: rezerwacja `cancelled`, zlecenie `cancelled`, wiersze
   * zostają jako zapis. `null` = zlecenia nie ma albo wołający go nie widzi → 404.
   */
  async cancel(orgId: string, actor: OrderActor, id: string, reason: string | null): Promise<OrderResult | null> {
    const now = this.clock.now();
    const watching = this.watching;
    return orderOutcome(async () => {
      const written = await this.db.transaction(async (tx) => {
        const loaded = await this.records.lock(tx, orgId, id);
        if (loaded == null || !visibleTo(loaded, actor)) return null;
        if (!leads(loaded.order, actor)) throw new OrderDenied('not_leader');
        if (!isLive(loaded.order.status)) throw new OrderDenied('order_closed');
        if (!holdsSlot(loaded.booking.status)) throw new OrderDenied('booking_closed');

        // Odbiorców liczy się na stanie SPRZED zamknięcia - pytanie brzmi „kto czekał".
        const before = audienceStateOf(loaded);
        const order = await this.orders.close(tx, orgId, id, { status: 'cancelled', at: now, by: actor.pilotId, reason });
        if (order == null) throw new OrderDenied('order_closed');
        const booking =
          (await this.bookings.close(tx, orgId, loaded.booking.id, { status: 'cancelled', at: now, reason, by: actor.pilotId })) ??
          loaded.booking;
        await this.changes.insert(
          tx,
          orgId,
          id,
          [{ id: this.newId(), actorId: actor.pilotId, kind: 'cancelled', payload: { reason } }],
          now,
        );

        const drafts = orderCancelled(noticeOrderOf(order, loaded.booking), cancelAudience(before, actor.pilotId), {
          reason,
          cancelledBy: actor.pilotId,
        });
        const notices = await this.notifier.record(tx, orgId, drafts, now);

        let watchNotices: RecordedNotice[] = [];
        if (watching != null && loaded.booking.remindedAt != null) {
          const audience = await watching.audience(tx, orgId, loaded.booking.aircraftId, [actor.pilotId]);
          if (audience != null) {
            const cancelled = aircraftFlightCancelled(audience, loaded.booking, null);
            watchNotices = await watching.record(tx, orgId, cancelled, now);
          }
        }
        return { loaded: { order, booking, recipients: loaded.recipients }, notices, watchNotices };
      });
      if (written == null) return null;

      await this.notifier.wake(orgId, written.notices);
      if (written.watchNotices.length > 0) await watching?.wake(orgId, written.watchNotices);
      await this.signals.changed(orgId, written.loaded);
      return { ok: true as const, loaded: written.loaded, created: false };
    });
  }
}
