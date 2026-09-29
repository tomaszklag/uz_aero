/**
 * Ninerdeck (serwer) - ZLECENIA do odczytu: licznik karty na Pulpicie, listy „Do mnie"
 * i „Zlecone" oraz karta zlecenia (4.0.0, issue #245; `docs/zlecenia.md` §8, §13, §13.1,
 * §14.1; makiety 20F, 28-28C, 30, 32).
 *
 * ══ KSZTAŁT ZALEŻY OD WIDZA (§13.1) ══
 *  - PROWADZĄCY (autor z „Zlecaniem lotów", każdy z `reservations.manage`) dostaje komplet:
 *    adresatów z odczytami, odpowiedziami, kolizjami i rozmowami oraz historię zmian;
 *  - ADRESAT dostaje zlecenie, swój fotel, swoją odpowiedź, swoją rozmowę i to, CO się
 *    zmieniło - bez nazwiska zmieniającego (pkt 31) i bez ani słowa o innych adresatach
 *    (pkt 18). Pola, których nie widzi, są tu `null` - trasa nie ma czego przepuścić.
 * Osoba bywa jednym i drugim naraz (koordynator, do którego trafiło cudze zlecenie):
 * wtedy dostaje oba kształty, a ekran wybiera, który pokazać.
 *
 * ══ DOBA KLUBU JEDZIE Z KAŻDYM TERMINEM ══
 * Godziny terminu to czas klubu (umowa między ludźmi, nie pomiar), a telefon liczy je
 * odejmowaniem od granic doby - ta sama zasada, co w kalendarzu (`docs/rezerwacje.md` §6.1).
 */

import { clubDays, safeZone, type ClubDay } from '../../../domain/clubTime.ts';
import { awaitsSeat, inPlay, staleReason, type StaleReason } from '../../../domain/orderAnswers.ts';
import { assignedPilots } from '../../../domain/orderAudiences.ts';
import { crewSeatOf, type OrderAnswer, type Seat } from '../../../domain/orders.ts';
import { crewOf, leads, orderView, recipientView, visibleTo, type OrderActor } from '../orderAccess.ts';
import type { LoadedOrder, OrderRecords } from '../orderRecords.ts';
import type {
  BookingRecord,
  BookingsPort,
  ClubSettingsPort,
  Clock,
  Database,
  FlightOrderQuery,
  FlightOrdersPort,
  OrderChangeRecord,
  OrderChangesPort,
  OrderRecipientRecord,
  OrderRecipientsPort,
  ThreadMessagesPort,
} from '../ports.ts';

/**
 * Jak daleko wstecz sięgają listy - sekcja „Zakończone" na makiecie 30: 14 dni (decyzja
 * właściciela 2026-09-29). To okno WYŚWIETLANIA, nie retencji: zlecenie, adresaci,
 * odpowiedzi, historia i rozmowy zostają w bazie na zawsze, a karta starszego zlecenia
 * dalej się otwiera (skrzynka, kalendarz). Liczy się po terminie, a nie po stanie, bo
 * komplet załogi jest `filled` na zawsze.
 */
export const ORDER_LIST_TAIL_MS = 14 * 24 * 3_600_000;

/** Ja jako adresat - karta 28, wiersz „Do mnie". */
export interface MyRecipientState {
  seat: Seat | null;
  namedSeat: Seat | null;
  direct: boolean;
  /** Odpowiedź w BIEŻĄCEJ wersji. */
  answer: OrderAnswer | null;
  answerReason: string | null;
  answeredAt: number | null;
  /** Odpowiedź z poprzedniego terminu - przekreślona na 28C. */
  previousAnswer: OrderAnswer | null;
  seen: boolean;
  removed: boolean;
  /** Czy zlecenie jest dla mnie jeszcze w grze - inaczej „Nieaktualne" (28B). */
  inPlay: boolean;
  /** Dlaczego nieaktualne - treść baneru 28B; `null` = w grze. */
  staleReason: StaleReason | null;
  /** Fotel, w którym siedzę - lot jest już moją rezerwacją. */
  assignedSeat: Seat | null;
  threadId: string | null;
  /** Nieprzeczytane wiadomości w mojej rozmowie. */
  unread: number;
}

/** Adresat widziany przez prowadzącego - karta 32. */
export interface LeaderRecipientEntry {
  record: OrderRecipientRecord;
  answer: OrderAnswer | null;
  previousAnswer: OrderAnswer | null;
  /** „Odczytane 14:02" w bieżącej wersji. */
  seen: boolean;
  /** Otworzył kartę PRZED ostatnią edycją inną niż termin - „zmiana z 15:10 nieodczytana" (§8). */
  editUnseen: boolean;
  inPlay: boolean;
  /** Dlaczego nieaktualne (fotel uśpiony wraca razem z fotelem); `null` = w grze. */
  staleReason: StaleReason | null;
  /** Fotel, w którym siedzi. */
  assignedSeat: Seat | null;
  /** Inna rezerwacja tej osoby w tym terminie - bursztyn przy wyborze (§4.3). */
  conflict: { bookingId: string; aircraftId: string; startsAt: number; endsAt: number } | null;
  /** Nieprzeczytane przez AUTORA wiadomości od tego adresata; u pozostałych prowadzących 0. */
  unread: number;
}

/** Zmiana terminu widziana przez adresata - 28C. */
export interface TermChange {
  at: number;
  from: unknown;
  to: unknown;
}

export interface OrderCardView {
  timezone: string;
  day: ClubDay;
  loaded: LoadedOrder;
  leads: boolean;
  me: MyRecipientState | null;
  /** Ostatnia edycja inna niż termin, bez nazwiska (pkt 31): klucze zmian i chwila. */
  lastEdit: { at: number; changes: Record<string, unknown> } | null;
  lastTermChange: TermChange | null;
  /** Moje inne rezerwacje w tym terminie - adresat widzi je przed odpowiedzią (§4.3). */
  myConflicts: BookingRecord[];
  /** Wyłącznie prowadzący. */
  recipients: LeaderRecipientEntry[] | null;
  history: OrderChangeRecord[] | null;
}

/** Postęp w wierszu „Zlecone" - „5 z 6 odczytało · 2 mogą lecieć" albo jedna osoba i jej stan. */
export interface OrderProgress {
  recipients: number;
  seen: number;
  volunteers: number;
  single: { pilotId: string; seen: boolean; answer: OrderAnswer | null; answeredAt: number | null } | null;
}

export interface OrderListItem {
  day: ClubDay;
  loaded: LoadedOrder;
  me: MyRecipientState | null;
  progress: OrderProgress | null;
  /** „Do mnie": nieprzeczytane w mojej rozmowie; „Zlecone": u autora suma z jego rozmów. */
  unread: number;
}

export interface OrderListView {
  timezone: string;
  items: OrderListItem[];
}

export interface OrderSummaryView {
  /** Zlecenia, w których czeka MOJA odpowiedź. */
  awaitingAnswer: number;
  /** Prowadzone zlecenia, które szukają załogi. */
  seekingCrew: number;
  canCreate: boolean;
  canManage: boolean;
}

export type OrderBox = 'inbox' | 'managed';

export class OrderQueries {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly orders: FlightOrdersPort,
    private readonly bookings: BookingsPort,
    private readonly recipients: OrderRecipientsPort,
    private readonly changes: OrderChangesPort,
    private readonly messages: ThreadMessagesPort,
    private readonly clubs: ClubSettingsPort,
    private readonly clock: Clock,
  ) {}

  /** Liczby karty „Zlecenia" na Pulpicie i przy segmentach listy (20F, 30). */
  async summary(orgId: string, actor: OrderActor): Promise<OrderSummaryView> {
    const now = this.clock.now();
    const inbox = await this.loadMany(orgId, { recipientId: actor.pilotId, endsAfter: now });
    const awaitingAnswer = inbox.filter((loaded) => {
      const me = this.meOf(loaded, actor.pilotId, 0);
      return me != null && me.inPlay && me.answer == null && me.assignedSeat == null;
    }).length;
    const managed = actor.manages || actor.creates ? await this.loadMany(orgId, managedQuery(actor, now)) : [];
    return {
      awaitingAnswer,
      seekingCrew: managed.filter((loaded) => loaded.order.status === 'open').length,
      canCreate: actor.creates,
      canManage: actor.manages,
    };
  }

  /**
   * „Do mnie" albo „Zlecone". `null` = klubu nie ma albo „Zlecone" pytane przez kogoś, kto
   * nie zleca i nie prowadzi (trasa robi z tego 403 - segmentu dla niego nie ma).
   */
  async list(orgId: string, actor: OrderActor, box: OrderBox): Promise<OrderListView | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;
    if (box === 'managed' && !actor.creates && !actor.manages) return null;
    const timezone = safeZone(settings.timezone);
    const since = new Date(this.clock.now().getTime() - ORDER_LIST_TAIL_MS);

    const query: FlightOrderQuery =
      box === 'inbox' ? { recipientId: actor.pilotId, endsAfter: since } : managedQuery(actor, since);
    const items: OrderListItem[] = [];
    for (const loaded of await this.loadMany(orgId, query)) {
      const day = dayOf(timezone, loaded.booking.startsAt);
      if (box === 'inbox') {
        const row = loaded.recipients.find((r) => r.pilotId === actor.pilotId);
        const unread = row?.threadId == null ? 0 : await this.messages.unreadFor(this.db, orgId, row.threadId, actor.pilotId);
        items.push({ day, loaded, me: this.meOf(loaded, actor.pilotId, unread), progress: null, unread });
      } else {
        const unread = loaded.order.createdBy === actor.pilotId ? await this.authorUnread(orgId, loaded, actor.pilotId) : 0;
        items.push({ day, loaded, me: null, progress: progressOf(loaded), unread });
      }
    }
    return { timezone, items };
  }

  /** Karta zlecenia. `null` = zlecenia nie ma albo pytający go nie widzi → 404. */
  async card(orgId: string, actor: OrderActor, id: string): Promise<OrderCardView | null> {
    const settings = await this.clubs.calendar(this.db, orgId);
    if (settings == null) return null;
    const loaded = await this.records.read(this.db, orgId, id);
    if (loaded == null || !visibleTo(loaded, actor)) return null;
    const timezone = safeZone(settings.timezone);
    const isLeader = leads(loaded.order, actor);

    const history = await this.changes.listFor(this.db, orgId, id);
    const overlapping = (
      await this.bookings.list(this.db, orgId, { from: loaded.booking.startsAt, to: loaded.booking.endsAt })
    ).filter((b) => b.id !== loaded.booking.id);

    const row = loaded.recipients.find((r) => r.pilotId === actor.pilotId);
    const myUnread =
      row?.threadId == null ? 0 : await this.messages.unreadFor(this.db, orgId, row.threadId, actor.pilotId);
    const me = this.meOf(loaded, actor.pilotId, myUnread);

    return {
      timezone,
      day: dayOf(timezone, loaded.booking.startsAt),
      loaded,
      leads: isLeader,
      me,
      lastEdit: lastEditOf(history),
      lastTermChange: lastTermChangeOf(history),
      myConflicts: me == null ? [] : overlapping.filter((b) => b.pilotId === actor.pilotId || b.dualId === actor.pilotId),
      recipients: isLeader ? await this.leaderEntries(orgId, loaded, actor, overlapping) : null,
      history: isLeader ? history : null,
    };
  }

  private async leaderEntries(
    orgId: string,
    loaded: LoadedOrder,
    actor: OrderActor,
    overlapping: readonly BookingRecord[],
  ): Promise<LeaderRecipientEntry[]> {
    const { order } = loaded;
    const view = orderView(order, loaded.booking);
    const author = order.createdBy === actor.pilotId;
    const out: LeaderRecipientEntry[] = [];
    for (const record of loaded.recipients) {
      const rv = recipientView(record, order.revision);
      const conflict = overlapping.find((b) => b.pilotId === record.pilotId || b.dualId === record.pilotId) ?? null;
      const unread =
        author && record.threadId != null ? await this.messages.unreadFor(this.db, orgId, record.threadId, actor.pilotId) : 0;
      out.push({
        record,
        answer: rv.answer,
        previousAnswer: previousAnswerOf(record, order.revision),
        seen: record.seenRevision === order.revision,
        editUnseen: order.editedAt != null && record.seenRevision === order.revision && (record.lastSeenAt ?? 0) < order.editedAt,
        inPlay: inPlay(view, rv),
        staleReason: staleReason(view, rv),
        assignedSeat: assignedSeatOf(loaded, record.pilotId),
        conflict:
          conflict == null
            ? null
            : { bookingId: conflict.id, aircraftId: conflict.aircraftId, startsAt: conflict.startsAt, endsAt: conflict.endsAt },
        unread,
      });
    }
    return out;
  }

  /** Suma nieprzeczytanych przez autora we wszystkich rozmowach zlecenia - kropka na liście. */
  private async authorUnread(orgId: string, loaded: LoadedOrder, authorId: string): Promise<number> {
    let total = 0;
    for (const record of loaded.recipients) {
      if (record.threadId != null) total += await this.messages.unreadFor(this.db, orgId, record.threadId, authorId);
    }
    return total;
  }

  private meOf(loaded: LoadedOrder, pilotId: string, unread: number): MyRecipientState | null {
    const row = loaded.recipients.find((r) => r.pilotId === pilotId);
    if (row == null) return null;
    const { order } = loaded;
    const rv = recipientView(row, order.revision);
    const view = orderView(order, loaded.booking);
    return {
      seat: row.seat,
      namedSeat: row.namedSeat,
      direct: row.direct,
      answer: rv.answer,
      answerReason: rv.answer == null ? null : row.answerReason,
      answeredAt: rv.answer == null ? null : row.answeredAt,
      previousAnswer: previousAnswerOf(row, order.revision),
      seen: row.seenRevision === order.revision,
      removed: rv.removed,
      inPlay: inPlay(view, rv),
      staleReason: staleReason(view, rv),
      assignedSeat: assignedSeatOf(loaded, pilotId),
      threadId: row.threadId,
      unread,
    };
  }

  private async loadMany(orgId: string, query: FlightOrderQuery): Promise<LoadedOrder[]> {
    const orders = await this.orders.list(this.db, orgId, query);
    const ids = orders.map((o) => o.id);
    const bookings = await this.bookings.byOrders(this.db, orgId, ids);
    const recipients = await this.recipients.listForOrders(this.db, orgId, ids);
    return orders.flatMap((order) => {
      const booking = bookings.get(order.id);
      return booking == null ? [] : [{ order, booking, recipients: recipients.get(order.id) ?? [] }];
    });
  }
}

/** „Zlecone": własne przy samym „Zlecaniu lotów", całego klubu przy `reservations.manage` (pkt 20). */
function managedQuery(actor: OrderActor, endsAfter: Date): FlightOrderQuery {
  return actor.manages ? { endsAfter } : { createdBy: actor.pilotId, endsAfter };
}

/** Doba klubu, w której zaczyna się termin - okno o szerokości milisekundy, jak w `BookingQueries.byId`. */
function dayOf(timezone: string, startsAt: number): ClubDay {
  const day = clubDays(timezone, startsAt, startsAt + 1, 1)[0];
  if (day == null) throw new Error('doba klubu nie wyszła z niezerowego okna');
  return day;
}

/** Szukany fotel, w którym siedzi osoba - fotel „ja" to zlecający, nie przydział. */
function assignedSeatOf(loaded: LoadedOrder, pilotId: string): Seat | null {
  const seat = crewSeatOf(crewOf(loaded.booking), pilotId);
  return seat != null && loaded.order.seats[seat] === 'sought' ? seat : null;
}

/** Odpowiedź z poprzedniego terminu - zapis „poprzedni termin" (§10.2). */
function previousAnswerOf(row: OrderRecipientRecord, revision: number): OrderAnswer | null {
  return row.answeredRevision != null && row.answeredRevision < revision ? row.answer : null;
}

function progressOf(loaded: LoadedOrder): OrderProgress {
  const { order } = loaded;
  const view = orderView(order, loaded.booking);
  const seated = new Set(assignedPilots(view.seats, view.crew));
  const live = loaded.recipients.filter((r) => r.removedAt == null);
  const views = live.map((r) => ({ row: r, rv: recipientView(r, order.revision) }));
  const single = live.length === 1 ? live[0]! : null;
  return {
    recipients: live.length,
    seen: live.filter((r) => r.seenRevision === order.revision).length,
    volunteers: views.filter(({ row, rv }) => rv.answer === 'yes' && !seated.has(row.pilotId) && awaitsSeat(view, rv)).length,
    single:
      single == null
        ? null
        : {
            pilotId: single.pilotId,
            seen: single.seenRevision === order.revision,
            answer: single.answeredRevision === order.revision ? single.answer : null,
            answeredAt: single.answeredRevision === order.revision ? single.answeredAt : null,
          },
  };
}

/** Ostatnia edycja inna niż termin - z historii, bez sprawcy (pkt 31). */
function lastEditOf(history: readonly OrderChangeRecord[]): { at: number; changes: Record<string, unknown> } | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]!;
    if (entry.kind !== 'edited') continue;
    const changes = { ...((entry.payload.changes as Record<string, unknown> | undefined) ?? {}) };
    delete changes.term;
    if (Object.keys(changes).length > 0) return { at: entry.createdAt, changes };
  }
  return null;
}

/** Ostatnia zmiana terminu - 28C pokazuje, z czego na co. */
function lastTermChangeOf(history: readonly OrderChangeRecord[]): TermChange | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]!;
    const term = (entry.payload.changes as Record<string, { from: unknown; to: unknown }> | undefined)?.term;
    if (entry.kind === 'edited' && term != null) return { at: entry.createdAt, from: term.from, to: term.to };
  }
  return null;
}
