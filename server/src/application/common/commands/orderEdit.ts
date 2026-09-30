/**
 * Ninerdeck (serwer) - ZMIANA ZLECENIA przez prowadzącego (4.0.0, issue #245;
 * `docs/zlecenia.md` §5.1, §5.2, §5.3, §6.2, pkt 29 i 41).
 *
 * Jedno żądanie (`PATCH /orders/:id`) niesie wszystko, co prowadzący zmienia naraz, bo
 * „zamień osobę" jest odebraniem i dopisaniem w jednym ruchu - rozbite na dwa żądania
 * zostawiałoby fotel bez adresata pomiędzy nimi.
 *
 * ══ TERMIN TO NOWA WERSJA, RESZTA TO „EDYTOWANE" ══
 *  - zmiana TERMINU podnosi wersję: odpowiedzi i odczyty poprzedniej przestają się liczyć,
 *    a adresaci dostają prośbę o ponowną odpowiedź. Obsadzone fotele ZOSTAJĄ (pkt 13);
 *  - każda inna zmiana (maszyna, zadanie, trasa, plan, opis, fotele) nie rusza odpowiedzi -
 *    adresaci dostają „Zlecenie edytowane", a karta mówi, CO się zmieniło, bez nazwiska;
 *  - fotel przestawiony na „ja" albo „brak" zdejmuje osobę, która go zajmowała („Przydział
 *    cofnięty"), a jego adresatów USYPIA: dostają „Zlecenie nieaktualne · fotel już
 *    niepotrzebny", ale zostają adresatami i wracają do gry, gdy fotel znów będzie szukany
 *    (decyzja właściciela 2026-09-29) - definicja adresowania trzyma ich listę, a plan
 *    liczy się z samych szukanych foteli;
 *  - dopisanie wysyła zlecenie WYŁĄCZNIE dopisanym; odebranie stempluje wiersz (pkt 29),
 *    a jawne, imienne dopisanie odebranej osoby przywraca jej zlecenie jak nowe (decyzja
 *    właściciela 2026-09-29) - bez poprzedniej odpowiedzi, z rozmową znów otwartą;
 *  - „Wyślij ponownie" rozwija grupy od nowa i przypomina niezdecydowanym (pkt 41).
 *
 * ══ GRUPY SĄ SKRÓTEM PRZY WYSYŁCE, A NIE ŻYWĄ LISTĄ ══
 * Poza „Wyślij ponownie" rozwinięcie widzi w grupie wyłącznie tych, do których zlecenie
 * JUŻ poszło (plus członków grup dopisanych właśnie teraz). Nowy członek grupy wysłanej
 * wczoraj czeka na ponowne wysłanie, a adresat, który z grupy odszedł, zostaje adresatem -
 * zlecenie do niego poszło i to jest zapis. Grupa skasowana nie blokuje zmiany: dla
 * rozwinięcia to ci sami ludzie, którzy przez nią trafili.
 */

import { holdsSlot, refuseCreate, refuseWindow } from '../../../domain/bookings.ts';
import { refuseRemoveRecipient, staleReason } from '../../../domain/orderAnswers.ts';
import {
  audienceLabel,
  expandRecipients,
  withAddedRecipients,
  type AddressList,
  type OrderAudience,
} from '../../../domain/orderAddressing.ts';
import {
  changeAudience,
  remindAudience,
  staleAudience,
  type AudienceState,
} from '../../../domain/orderAudiences.ts';
import {
  fieldChanges,
  reconcileRecipients,
  type OrderFieldChanges,
  type OrderFields,
  type RecipientReconcile,
} from '../../../domain/orderEdits.ts';
import { crewForSeats, refuseSeats, statusFor } from '../../../domain/orderSeats.ts';
import { isLive, SEATS, type OrderSeats, type RecipientView, type Seat } from '../../../domain/orders.ts';
import { aircraftFlightCancelled } from '../notify/aircraftNotices.ts';
import type { AircraftWatching } from '../notify/aircraftWatching.ts';
import type { NotificationDraft } from '../notify/bookingNotices.ts';
import type { Notifier, RecordedNotice } from '../notify/notifier.ts';
import {
  orderChanged,
  orderFilled,
  orderOffered,
  orderRemoved,
  orderUnassigned,
} from '../notify/orderNotices.ts';
import type { OrderSignals } from '../notify/orderSignals.ts';
import {
  audienceStateOf,
  crewOf,
  leads,
  noticeOrderOf,
  orderView,
  personNames,
  recipientView,
  visibleTo,
  type OrderActor,
} from '../orderAccess.ts';
import type { OrderRecords } from '../orderRecords.ts';
import type {
  AircraftConfigPort,
  BookingPatch,
  BookingRecord,
  BookingsPort,
  ClubMember,
  ClubMembersPort,
  Clock,
  Database,
  FlightOrderPatch,
  FlightOrderRecord,
  FlightOrdersPort,
  MemberGroupRecord,
  MemberGroupsPort,
  NewOrderChange,
  OrderChangesPort,
  OrderRecipientRecord,
  OrderRecipientsPort,
} from '../ports.ts';
import { OrderDenied, orderOutcome, type OrderResult } from '../orderOutcome.ts';

/** Zmiana od prowadzącego. Pominięte pola zostają bez zmian. */
export interface OrderPatch {
  aircraftId?: string;
  startsAt?: number;
  endsAt?: number;
  operation?: string;
  fromIcao?: string | null;
  toIcao?: string | null;
  plannedAirMin?: number | null;
  plannedFuelL?: number | null;
  note?: string | null;
  seats?: OrderSeats;
  /** Dopisanie adresatów: przy adresowaniu per fotel - do wskazanego fotela, przy wspólnej liście `seat: null`. */
  addRecipients?: ReadonlyArray<{ seat: Seat | null; list: AddressList }>;
  /** Odebranie zlecenia (pkt 29); razem z dopisaniem = „zamień osobę". */
  removeRecipients?: readonly string[];
  /** „Wyślij ponownie" (pkt 41). */
  resend?: boolean;
  /** Powód dla osób, których zmiana dotyka - odebranie, cofnięcie przez fotel. Opcjonalny (§5.6). */
  reason?: string | null;
}

export class OrderEditCommands {
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
    private readonly watching: AircraftWatching | null = null,
  ) {}

  /** `null` = zlecenia nie ma albo wołający go nie widzi → 404. */
  async edit(orgId: string, actor: OrderActor, id: string, patch: OrderPatch): Promise<OrderResult | null> {
    const now = this.clock.now();
    const reason = patch.reason ?? null;
    const watching = this.watching;

    return orderOutcome(async () => {
      const written = await this.db.transaction(async (tx) => {
        const loaded = await this.records.lock(tx, orgId, id);
        if (loaded == null || !visibleTo(loaded, actor)) return null;
        if (!leads(loaded.order, actor)) throw new OrderDenied('not_leader');
        const { order, booking, recipients } = loaded;
        if (!isLive(order.status)) throw new OrderDenied('order_closed');
        if (!holdsSlot(booking.status)) throw new OrderDenied('booking_closed');
        if (booking.endsAt <= now.getTime()) throw new OrderDenied('booking_in_past');

        // ── pola zlecenia: termin, maszyna, zadanie, trasa, plan, opis, fotele ──────
        const before = fieldsOf(order, booking);
        const after = applyPatch(before, patch);
        const changed = fieldChanges(before, after);
        if (changed.term != null) {
          const refusal = refuseWindow(after, now.getTime());
          if (refusal != null) throw new OrderDenied(refusal);
        }
        if (changed.aircraft != null) {
          const serviceStatus = await this.aircraft.serviceStatusOf(tx, orgId, after.aircraftId);
          const refusal = refuseCreate({ ...after, kind: 'flight' }, now.getTime(), { serviceStatus });
          if (refusal != null) throw new OrderDenied(refusal);
        }
        if (changed.seats != null || changed.aircraft != null) {
          const dualRequired = (await this.aircraft.dualRequired(tx, orgId, after.aircraftId)) ?? false;
          const refusal = refuseSeats(after.seats, { dualRequired });
          if (refusal != null) throw new OrderDenied(refusal);
        }

        // ── odebranie zlecenia: przydzielonego najpierw cofnąć (pkt 29) ─────────────
        const view = orderView(order, booking);
        const removals = [...new Set(patch.removeRecipients ?? [])];
        for (const pilotId of removals) {
          const row = recipients.find((r) => r.pilotId === pilotId);
          const refusal = refuseRemoveRecipient(view, row == null ? null : recipientView(row, order.revision));
          if (refusal != null) throw new OrderDenied(refusal);
        }

        // ── załoga po przestawieniu foteli i nowy plan adresatów ────────────────────
        const { crew, lost } = crewForSeats({ seats: order.seats, crew: crewOf(booking) }, after.seats, order.createdBy);
        const adds = patch.addRecipients ?? [];
        // Dopisanie do fotela, którego zlecenie (po tej zmianie) nie szuka, nie miałoby kogo
        // obsadzić - odmowa zamiast cichego zapisu na liście uśpionego fotela.
        const offSeat = (seat: Seat | null): boolean => seat == null || after.seats[seat] !== 'sought';
        if (order.addressing === 'per_seat' && adds.some((a) => offSeat(a.seat))) throw new OrderDenied('seat_not_sought');
        let audience = order.audience;
        for (const add of adds) audience = withAddedRecipients(audience, add);

        // Jawne, IMIENNE dopisanie odebranej osoby ją przywraca - chyba że ta sama zmiana ją
        // odbiera. Grupa, w której ta osoba jest, i „Wyślij ponownie" zlecenia nie przywracają.
        const namedAdds = new Set(adds.flatMap((a) => a.list.pilotIds));
        const previouslyRemoved = recipients.filter((r) => r.removedAt != null).map((r) => r.pilotId);
        const restoring = new Set(previouslyRemoved.filter((p) => namedAdds.has(p) && !removals.includes(p)));
        const removedIds = new Set([...previouslyRemoved.filter((p) => !restoring.has(p)), ...removals]);
        const groups = await this.groups.list(tx, orgId);
        const members = await this.members.list(tx, orgId);
        let reconcile: RecipientReconcile = { added: [], updated: [], restored: [] };
        if (changed.seats != null || adds.length > 0 || removals.length > 0 || patch.resend === true) {
          reconcile = planRecipients({
            order,
            audience: soughtOnly(audience, after.seats),
            seats: after.seats,
            recipients,
            groups,
            members,
            adds,
            removed: removedIds,
            restoring,
            resend: patch.resend === true,
          });
        }

        // Odebrani przez tę zmianę: WYŁĄCZNIE wskazani wprost (pkt 29). Fotel uśpiony nikomu
        // zlecenia nie odbiera - jego adresaci czekają na powrót fotela.
        const removedNow = removals;
        const lostIds = new Set(lost.map((l) => l.pilotId));

        const termChanged = changed.term != null;
        const status = statusFor(order.status, after.seats, crew);
        const beforeState = audienceStateOf(loaded);
        const afterState = stateAfter({
          order,
          recipients,
          seats: after.seats,
          crew,
          status,
          termChanged,
          reconcile,
          removed: removedIds,
          restoring,
        });

        // ── zapis ─────────────────────────────────────────────────────────────────
        const bookingPatch = bookingPatchOf(changed, after);
        if (Object.keys(bookingPatch).length > 0) {
          const write = await this.bookings.update(tx, orgId, booking.id, bookingPatch);
          if (write == null) throw new OrderDenied('booking_closed');
          if (!write.ok) throw new OrderDenied('slot_taken', write.taken);
        }
        if (crew.pic !== booking.pilotId || crew.dual !== booking.dualId) {
          if ((await this.bookings.setCrew(tx, orgId, booking.id, crew, now)) == null) {
            throw new OrderDenied('booking_closed');
          }
        }
        if (reconcile.updated.length > 0) await this.recipients.updatePlan(tx, orgId, id, reconcile.updated);
        for (const pilotId of removedNow) await this.recipients.remove(tx, orgId, id, pilotId, actor.pilotId, now);
        const added =
          reconcile.added.length > 0 ? await this.recipients.insertMany(tx, orgId, id, reconcile.added) : [];
        const restored =
          reconcile.restored.length > 0 ? await this.recipients.restore(tx, orgId, id, reconcile.restored) : [];
        const offered = [...added, ...restored];

        const label = audienceLabel(after.seats, withoutPeople(audience, removedIds), personNames(members, groups));
        const orderPatch: FlightOrderPatch = {};
        if (changed.seats != null) orderPatch.seats = after.seats;
        if (status !== order.status && (status === 'open' || status === 'filled')) orderPatch.status = status;
        if (termChanged) orderPatch.bumpRevision = true;
        if (JSON.stringify(audience) !== JSON.stringify(order.audience)) orderPatch.audience = audience;
        if (label !== order.audienceLabel) orderPatch.audienceLabel = label;
        if (Object.keys(changed).some((key) => key !== 'term')) orderPatch.edited = true;
        if (Object.keys(orderPatch).length > 0) {
          if ((await this.orders.update(tx, orgId, id, orderPatch, now)) == null) throw new OrderDenied('order_closed');
        }

        const fresh = await this.records.read(tx, orgId, id);
        if (fresh == null) throw new Error('zlecenie zniknęło w transakcji, która je zmieniała');

        // ── wiadomości ───────────────────────────────────────────────────────────
        const notice = noticeOrderOf(fresh.order, fresh.booking);
        const self = (pilotId: string): boolean => pilotId === actor.pilotId;
        const notices: NotificationDraft[] = [];
        notices.push(...orderOffered(notice, offered.filter((p) => !self(p)), false));
        // Przy zmianie terminu przypomnienie byłoby drugą wiadomością o tym samym -
        // „Zlecenie zmienione" i tak prosi wszystkich o odpowiedź od nowa.
        const reminded =
          patch.resend === true && !termChanged
            ? remindAudience(afterState).filter((p) => !offered.includes(p) && !self(p))
            : [];
        notices.push(...orderOffered(notice, reminded, true));
        for (const pilotId of removedNow) {
          if (!self(pilotId)) notices.push(orderRemoved(notice, pilotId, reason));
        }
        for (const loss of lost) {
          if (!self(loss.pilotId)) notices.push(orderUnassigned(notice, loss.pilotId, { seat: loss.seat, reason }));
        }
        // „Nieaktualne" z POWODEM: fotel obsadzony (komplet po zmianie) albo uśpiony.
        const stale = staleAudience(beforeState, afterState).filter((p) => !self(p));
        const dropped = stale.filter((p) => {
          const recipient = afterState.recipients.find((r) => r.pilotId === p);
          return recipient != null && staleReason(afterState.view, recipient) === 'seat_dropped';
        });
        notices.push(...orderFilled(notice, stale.filter((p) => !dropped.includes(p)), 'seat_filled'));
        notices.push(...orderFilled(notice, dropped, 'seat_dropped'));
        if (Object.keys(changed).length > 0) {
          const told = new Set([...offered, ...stale, ...removedNow, ...lostIds]);
          const audienceIds = changeAudience(afterState, actor.pilotId).filter((p) => !told.has(p));
          notices.push(...orderChanged(notice, audienceIds, changed));
        }
        const recorded = await this.notifier.record(tx, orgId, notices, now);

        // ── historia zmian (§10.3) ───────────────────────────────────────────────
        const entries: Array<Omit<NewOrderChange, 'id' | 'actorId'>> = [];
        if (Object.keys(changed).length > 0) entries.push({ kind: 'edited', payload: { changes: changed } });
        const restoredNote = restored.length > 0 ? { restored } : {};
        if (patch.resend === true) entries.push({ kind: 'resent', payload: { added, reminded, ...restoredNote } });
        else if (offered.length > 0) entries.push({ kind: 'recipients_added', payload: { pilotIds: offered, ...restoredNote } });
        if (removedNow.length > 0) entries.push({ kind: 'recipients_removed', payload: { pilotIds: removedNow, reason } });
        for (const loss of lost) {
          entries.push({ kind: 'unassigned', payload: { seat: loss.seat, pilotId: loss.pilotId, reason, via: 'seats' } });
        }
        if (entries.length > 0) {
          await this.changes.insert(
            tx,
            orgId,
            id,
            entries.map((entry) => ({ ...entry, id: this.newId(), actorId: actor.pilotId })),
            now,
          );
        }

        // „Co ogłosiłeś, to odwołaj" (obserwowanie §5.2): przesunięcie początku albo
        // zmiana maszyny terminu, o którym już przypomniano obserwującym STAREJ maszyny.
        let watchNotices: RecordedNotice[] = [];
        const moved = changed.term != null && after.startsAt !== before.startsAt;
        if (watching != null && booking.remindedAt != null && (moved || changed.aircraft != null)) {
          const watchers = await watching.audience(tx, orgId, booking.aircraftId, [actor.pilotId]);
          if (watchers != null) {
            const drafts = aircraftFlightCancelled(
              watchers,
              booking,
              changed.aircraft != null ? null : { startsAt: after.startsAt, endsAt: after.endsAt },
            );
            watchNotices = await watching.record(tx, orgId, drafts, now);
          }
        }

        // Termin i maszyna SPRZED edycji - stara doba kalendarza i stara karta samolotu
        // też mają się odświeżyć, gdy zlecenie się z nich wyprowadziło.
        const previous =
          changed.term != null || changed.aircraft != null
            ? { aircraftId: before.aircraftId, startsAt: before.startsAt, endsAt: before.endsAt }
            : null;
        return { loaded: fresh, notices: recorded, watchNotices, removedNow, previous };
      });
      if (written == null) return null;

      await this.notifier.wake(orgId, written.notices);
      if (written.watchNotices.length > 0) await watching?.wake(orgId, written.watchNotices);
      await this.signals.changed(orgId, written.loaded, written.removedNow, written.previous);
      return { ok: true as const, loaded: written.loaded, created: false };
    });
  }
}

function fieldsOf(order: FlightOrderRecord, booking: BookingRecord): OrderFields {
  return {
    aircraftId: booking.aircraftId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    operation: booking.operation,
    fromIcao: booking.fromIcao,
    toIcao: booking.toIcao,
    plannedAirMin: booking.plannedAirMin,
    plannedFuelL: booking.plannedFuelL,
    note: booking.note,
    seats: order.seats,
  };
}

function applyPatch(before: OrderFields, patch: OrderPatch): OrderFields {
  return {
    aircraftId: patch.aircraftId ?? before.aircraftId,
    startsAt: patch.startsAt ?? before.startsAt,
    endsAt: patch.endsAt ?? before.endsAt,
    operation: patch.operation ?? before.operation,
    fromIcao: patch.fromIcao !== undefined ? patch.fromIcao : before.fromIcao,
    toIcao: patch.toIcao !== undefined ? patch.toIcao : before.toIcao,
    plannedAirMin: patch.plannedAirMin !== undefined ? patch.plannedAirMin : before.plannedAirMin,
    plannedFuelL: patch.plannedFuelL !== undefined ? patch.plannedFuelL : before.plannedFuelL,
    note: patch.note !== undefined ? patch.note : before.note,
    seats: patch.seats ?? before.seats,
  };
}

/** Pola rezerwacji do zapisu - wyłącznie te, które naprawdę się zmieniły. */
function bookingPatchOf(changed: OrderFieldChanges, after: OrderFields): BookingPatch {
  const out: BookingPatch = {};
  if (changed.term != null) {
    out.startsAt = after.startsAt;
    out.endsAt = after.endsAt;
  }
  if (changed.aircraft != null) out.aircraftId = after.aircraftId;
  if (changed.operation != null) out.operation = after.operation;
  if (changed.route != null) {
    out.fromIcao = after.fromIcao;
    out.toIcao = after.toIcao;
  }
  if (changed.plannedAirMin != null) out.plannedAirMin = after.plannedAirMin;
  if (changed.plannedFuelL != null) out.plannedFuelL = after.plannedFuelL;
  if (changed.note != null) out.note = after.note;
  return out;
}

/**
 * Definicja zawężona do SZUKANYCH foteli - materiał planu. Lista fotela uśpionego zostaje
 * w zapisanej definicji (jego adresaci wrócą razem z nim), ale do planu nie wchodzi.
 */
function soughtOnly(audience: OrderAudience, seats: OrderSeats): OrderAudience {
  if (audience.kind === 'shared') return audience;
  let out = audience;
  for (const seat of SEATS) {
    if (seats[seat] !== 'sought' && out[seat] != null) out = { ...out, [seat]: null };
  }
  return out;
}

/** Definicja bez osób odebranych - do etykiety: mówi, do kogo zlecenie JEST wysłane. */
function withoutPeople(audience: OrderAudience, removed: ReadonlySet<string>): OrderAudience {
  const strip = (list: AddressList | null): AddressList | null =>
    list == null ? null : { ...list, pilotIds: list.pilotIds.filter((p) => !removed.has(p)) };
  return audience.kind === 'shared'
    ? { kind: 'shared', list: strip(audience.list) ?? { pilotIds: [], groupIds: [] } }
    : { kind: 'per_seat', pic: strip(audience.pic), dual: strip(audience.dual) };
}

/**
 * Plan adresatów po zmianie - z grupami „zamrożonymi" na tych, do których zlecenie już
 * poszło (poza „Wyślij ponownie" i grupami dopisanymi teraz).
 */
function planRecipients(input: {
  order: FlightOrderRecord;
  audience: OrderAudience;
  seats: OrderSeats;
  recipients: readonly OrderRecipientRecord[];
  groups: readonly MemberGroupRecord[];
  members: readonly ClubMember[];
  adds: ReadonlyArray<{ seat: Seat | null; list: AddressList }>;
  removed: ReadonlySet<string>;
  /** Odebrani, których ta zmiana jawnie dopisuje z powrotem. */
  restoring: ReadonlySet<string>;
  resend: boolean;
}): RecipientReconcile {
  const existing = new Set(input.recipients.map((r) => r.pilotId));
  const addedGroups = new Set(input.adds.flatMap((a) => a.list.groupIds));
  const addedPeople = new Set(input.adds.flatMap((a) => a.list.pilotIds));
  const known = new Map(input.groups.map((g) => [g.id, g.memberIds]));
  const viaGroup = (groupId: string): string[] =>
    input.recipients.filter((r) => r.viaGroupId === groupId).map((r) => r.pilotId);

  const groupMembers = new Map<string, readonly string[]>();
  for (const groupId of audienceGroups(input.audience)) {
    const current = known.get(groupId);
    // Grupa dopisana teraz, której nie ma w klubie - odmowa `unknown_group` z rozwinięcia.
    if (current == null && addedGroups.has(groupId)) continue;
    const live = current ?? [];
    const visible = input.resend || addedGroups.has(groupId) ? live : live.filter((p) => existing.has(p));
    groupMembers.set(groupId, [...new Set([...visible, ...viaGroup(groupId)])]);
  }

  const active = new Set(input.members.filter((m) => m.active).map((m) => m.pilotId));
  const plan = expandRecipients(input.seats, input.audience, {
    authorId: input.order.createdBy,
    groupMembers,
    // Adresat, który odszedł z klubu, zostaje w zapisie - zlecenie do niego poszło.
    // Nowych i PRZYWRACANYCH adresatów dopuszcza wyłącznie aktywne członkostwo.
    isActiveMember: (pilotId) => active.has(pilotId) || (existing.has(pilotId) && !input.restoring.has(pilotId)),
    removed: input.removed,
  });
  if (typeof plan === 'string') throw new OrderDenied(plan);

  const joinedGroup = (pilotId: string): boolean =>
    [...addedGroups].some((groupId) => known.get(groupId)?.includes(pilotId) ?? false);
  return reconcileRecipients(
    input.recipients.map((r) => ({
      pilotId: r.pilotId,
      seat: r.seat,
      namedSeat: r.namedSeat,
      direct: r.direct,
      viaGroupId: r.viaGroupId,
      removed: r.removedAt != null,
    })),
    plan,
    (pilotId) => input.resend || addedPeople.has(pilotId) || joinedGroup(pilotId),
    (pilotId) => input.restoring.has(pilotId),
  );
}

function audienceGroups(audience: OrderAudience): string[] {
  const lists = audience.kind === 'shared' ? [audience.list] : [audience.pic, audience.dual];
  return [...new Set(lists.flatMap((list) => list?.groupIds ?? []))];
}

/** Stan „kogo obudzić" PO zmianie - z nowym planem, odebranymi i wersją. */
function stateAfter(input: {
  order: FlightOrderRecord;
  recipients: readonly OrderRecipientRecord[];
  seats: OrderSeats;
  crew: { pic: string | null; dual: string | null };
  status: FlightOrderRecord['status'];
  termChanged: boolean;
  reconcile: RecipientReconcile;
  removed: ReadonlySet<string>;
  restoring: ReadonlySet<string>;
}): AudienceState {
  const updated = new Map([...input.reconcile.updated, ...input.reconcile.restored].map((p) => [p.pilotId, p]));
  const views: RecipientView[] = input.recipients.map((row) => {
    const base = recipientView(row, input.order.revision);
    const plan = updated.get(row.pilotId);
    return {
      ...base,
      ...(plan == null ? {} : { seat: plan.seat, namedSeat: plan.namedSeat, direct: plan.direct }),
      removed: input.removed.has(row.pilotId),
      // Nowa wersja zeruje odpowiedzi - „nie mogę w sobotę" nie mówi nic o niedzieli.
      // Przywrócony zaczyna od nowa: jego odpowiedź sprzed odebrania się nie liczy.
      answer: input.termChanged || input.restoring.has(row.pilotId) ? null : base.answer,
    };
  });
  for (const plan of input.reconcile.added) {
    views.push({ pilotId: plan.pilotId, seat: plan.seat, namedSeat: plan.namedSeat, direct: plan.direct, removed: false, answer: null });
  }
  return {
    authorId: input.order.createdBy,
    view: { status: input.status, addressing: input.order.addressing, seats: input.seats, crew: input.crew },
    recipients: views,
  };
}

