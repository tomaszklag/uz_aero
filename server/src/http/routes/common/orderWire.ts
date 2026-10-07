/**
 * Ninerdeck (serwer) - ZLECENIE NA DRUCIE: karta, lista, licznik i rozmowa (4.0.0,
 * issue #245; `docs/zlecenia.md` §13, §13.1).
 *
 * ══ ADRESAT NIE DOSTAJE NIC O INNYCH ADRESATACH (pkt 18) ══
 * Zapytanie oddaje pola prowadzącego jako `null` dla kogoś, kto nie prowadzi - a ten plik
 * pilnuje reszty: etykieta adresowania („dowódca: Instruktorzy · drugi pilot: A. Nowak")
 * i definicja adresowania nie wychodzą do adresata nigdy, bo z nich dałoby się odczytać,
 * do kogo jeszcze zlecenie poszło. Załoga już obsadzona jest treścią zlecenia (§6.3)
 * i jedzie każdemu.
 *
 * Czasy jako napisy ISO, doba klubu przy każdym terminie - telefon liczy godziny
 * odejmowaniem od granic doby (`docs/rezerwacje.md` §6.1).
 */

import type { LeaderRecipientEntry, MyRecipientState, OrderCardView, OrderListItem, OrderListView, OrderSummaryView } from '../../../application/common/queries/orders.ts';
import type { ThreadPageView } from '../../../application/common/queries/threads.ts';
import type { BookingRecord, FlightOrderRecord, ThreadMessageRecord } from '../../../application/common/ports.ts';
import type { ClubDay } from '../../../domain/clubTime.ts';

const iso = (ms: number): string => new Date(ms).toISOString();
const isoOrNull = (ms: number | null): string | null => (ms == null ? null : iso(ms));

export const dayWire = (day: ClubDay): Record<string, unknown> => ({
  date: day.date,
  startsAt: iso(day.startsAt),
  endsAt: iso(day.endsAt),
});

/** Zlecenie. Etykieta adresowania WYŁĄCZNIE dla prowadzącego. */
export function orderWire(order: FlightOrderRecord, leads: boolean): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    revision: order.revision,
    createdBy: order.createdBy,
    seats: order.seats,
    addressing: order.addressing,
    editedAt: isoOrNull(order.editedAt),
    createdAt: iso(order.createdAt),
    closedAt: isoOrNull(order.closedAt),
    closedBy: order.closedBy,
    closeReason: order.closeReason,
    ...(leads ? { audienceLabel: order.audienceLabel } : {}),
  };
}

/** Termin zlecenia - treść zlecenia, więc w komplecie dla każdego, kto je widzi. */
export function orderBookingWire(booking: BookingRecord): Record<string, unknown> {
  return {
    id: booking.id,
    aircraftId: booking.aircraftId,
    status: booking.status,
    startsAt: iso(booking.startsAt),
    endsAt: iso(booking.endsAt),
    operation: booking.operation,
    fromIcao: booking.fromIcao,
    toIcao: booking.toIcao,
    plannedAirMin: booking.plannedAirMin,
    plannedFuelL: booking.plannedFuelL,
    note: booking.note,
    pilotId: booking.pilotId,
    dualId: booking.dualId,
  };
}

function meWire(me: MyRecipientState | null): Record<string, unknown> | null {
  if (me == null) return null;
  return {
    ...me,
    answeredAt: isoOrNull(me.answeredAt),
    previousAnswerAt: isoOrNull(me.previousAnswerAt),
    removedAt: isoOrNull(me.removedAt),
    lastUnreadAt: isoOrNull(me.lastUnreadAt),
  };
}

function leaderRecipientWire(entry: LeaderRecipientEntry): Record<string, unknown> {
  const r = entry.record;
  return {
    pilotId: r.pilotId,
    seat: r.seat,
    namedSeat: r.namedSeat,
    direct: r.direct,
    viaGroupId: r.viaGroupId,
    answer: entry.answer,
    previousAnswer: entry.previousAnswer,
    answerReason: entry.answer == null ? null : r.answerReason,
    answeredAt: entry.answer == null ? null : isoOrNull(r.answeredAt),
    seen: entry.seen,
    seenAt: entry.seen ? isoOrNull(r.seenAt) : null,
    lastSeenAt: isoOrNull(r.lastSeenAt),
    editUnseen: entry.editUnseen,
    inPlay: entry.inPlay,
    staleReason: entry.staleReason,
    assignedSeat: entry.assignedSeat,
    removed: r.removedAt != null,
    removedAt: isoOrNull(r.removedAt),
    conflict:
      entry.conflict == null
        ? null
        : { ...entry.conflict, startsAt: iso(entry.conflict.startsAt), endsAt: iso(entry.conflict.endsAt) },
    threadId: r.threadId,
    unread: entry.unread,
  };
}

/** Karta zlecenia (28, 32, ZL3) - kształt wynika z widza, patrz nagłówek pliku. */
export function orderCardWire(view: OrderCardView): Record<string, unknown> {
  return {
    timezone: view.timezone,
    day: dayWire(view.day),
    order: orderWire(view.loaded.order, view.leads),
    booking: orderBookingWire(view.loaded.booking),
    viewer: { leads: view.leads, recipient: meWire(view.me) },
    lastEdit: view.lastEdit == null ? null : { at: iso(view.lastEdit.at), changes: view.lastEdit.changes },
    lastTermChange:
      view.lastTermChange == null
        ? null
        : { at: iso(view.lastTermChange.at), from: view.lastTermChange.from, to: view.lastTermChange.to },
    myConflicts: view.myConflicts.map((b) => ({
      bookingId: b.id,
      aircraftId: b.aircraftId,
      startsAt: iso(b.startsAt),
      endsAt: iso(b.endsAt),
    })),
    recipients: view.recipients == null ? null : view.recipients.map(leaderRecipientWire),
    history:
      view.history == null
        ? null
        : view.history.map((h) => ({ id: h.id, actorId: h.actorId, kind: h.kind, payload: h.payload, at: iso(h.createdAt) })),
  };
}

function listItemWire(item: OrderListItem, leads: boolean): Record<string, unknown> {
  return {
    day: dayWire(item.day),
    order: orderWire(item.loaded.order, leads),
    booking: orderBookingWire(item.loaded.booking),
    me: meWire(item.me),
    progress:
      item.progress == null
        ? null
        : {
            ...item.progress,
            single:
              item.progress.single == null
                ? null
                : { ...item.progress.single, answeredAt: isoOrNull(item.progress.single.answeredAt) },
          },
    unread: item.unread,
  };
}

/** Lista „Do mnie" albo „Zlecone" (30, ZL1). W „Do mnie" etykiety adresowania nie ma. */
export function orderListWire(view: OrderListView, box: 'inbox' | 'managed'): Record<string, unknown> {
  return { timezone: view.timezone, items: view.items.map((item) => listItemWire(item, box === 'managed')) };
}

export function orderSummaryWire(view: OrderSummaryView): Record<string, unknown> {
  return { ...view };
}

export function messageWire(message: ThreadMessageRecord): Record<string, unknown> {
  return { id: message.id, authorId: message.authorId, body: message.body, createdAt: iso(message.createdAt) };
}

/** Strona rozmowy (29, 29B, wątek w panelu). */
export function threadPageWire(view: ThreadPageView): Record<string, unknown> {
  return {
    role: view.role,
    closed: view.closed,
    threadId: view.threadId,
    participants: view.participants.map((p) => ({ pilotId: p.pilotId, lastReadAt: isoOrNull(p.lastReadAt) })),
    messages: view.messages.map(messageWire),
    next: view.next == null ? null : { beforeAt: iso(view.next.createdAt), beforeId: view.next.id },
  };
}
