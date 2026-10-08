/**
 * Ninerdeck (serwer) - KTO PROWADZI ZLECENIE i jak rekordy stają się widokiem reguł
 * (4.0.0, issue #245; `docs/zlecenia.md` §9, §13.1).
 *
 * Domena zleceń nie zna zdolności ani SQL-a (`domain/orders.ts`): „kto jest prowadzącym"
 * dostaje jako fakt. Ten plik jest miejscem, w którym fakt powstaje - jedna definicja dla
 * komend i zapytań obu powierzchni, bo telefon i panel prowadzą te same zlecenia.
 *
 * ══ PROWADZI AUTOR ZE ZDOLNOŚCIĄ ALBO „CUDZE REZERWACJE" ══
 * `orders.create` to tworzenie zleceń i prowadzenie WŁASNYCH (§9); `reservations.manage`
 * prowadzi wszystkie zlecenia klubu naraz (pkt 20). Autor, któremu odebrano „Zlecanie
 * lotów", przestaje prowadzić - zlecenie nie osierocieje, bo prowadzą je dalej osoby
 * z `reservations.manage`. Prawo sprawdza się przy KAŻDYM żądaniu, jak przy obserwowaniu
 * samolotu: odebranie zdolności działa od razu, a nie od następnego zlecenia.
 */

import type { AudienceState } from '../../domain/orderAudiences.ts';
import type { OrderView, OrderCrew, RecipientView } from '../../domain/orders.ts';
import { can, type Capability } from '../../domain/roles.ts';
import type { NoticeOrder, OfferedRecipient } from './notify/orderNotices.ts';
import type { BookingRecord, FlightOrderRecord, OrderRecipientRecord } from './ports.ts';

/** Kto działa przy zleceniu - osoba i dwie zdolności, które mają tu znaczenie. */
export interface OrderActor {
  pilotId: string;
  /** `orders.create` - tworzy zlecenia i prowadzi własne. */
  creates: boolean;
  /** `reservations.manage` - prowadzi wszystkie zlecenia klubu i czyta ich rozmowy. */
  manages: boolean;
}

export function orderActorOf(pilotId: string, capabilities: readonly Capability[]): OrderActor {
  return {
    pilotId,
    creates: can(capabilities, 'orders.create'),
    manages: can(capabilities, 'reservations.manage'),
  };
}

/** Czy osoba PROWADZI to zlecenie: autor z „Zlecaniem lotów" albo „Cudze rezerwacje". */
export function leads(order: Pick<FlightOrderRecord, 'createdBy'>, actor: OrderActor): boolean {
  return actor.manages || (actor.creates && order.createdBy === actor.pilotId);
}

/**
 * Czy zlecenie w ogóle ISTNIEJE dla tej osoby: prowadzi je albo jest jego adresatem
 * (także odebranym - karta mówi mu wtedy „cofnięte", 28B). Każdy inny dostaje 404:
 * cudze zlecenie jest dla niego nieistniejące, jak cudza rezerwacja (epik C).
 */
export function visibleTo(
  loaded: { order: Pick<FlightOrderRecord, 'createdBy'>; recipients: readonly Pick<OrderRecipientRecord, 'pilotId'>[] },
  actor: OrderActor,
): boolean {
  return leads(loaded.order, actor) || loaded.recipients.some((r) => r.pilotId === actor.pilotId);
}

/** Stan zlecenia dla reguł „kogo obudzić" (`domain/orderAudiences.ts`). */
export function audienceStateOf(loaded: {
  order: FlightOrderRecord;
  booking: BookingRecord;
  recipients: readonly OrderRecipientRecord[];
}): AudienceState {
  return {
    authorId: loaded.order.createdBy,
    view: orderView(loaded.order, loaded.booking),
    recipients: loaded.recipients.map((row) => recipientView(row, loaded.order.revision)),
  };
}

/**
 * Nazwy do etykiety adresowania (§6.2). Brak osoby albo grupy na liście (skasowana,
 * odeszła) nie wywraca zapisu: etykieta mówi wtedy „?" - lepsze niż identyfikator.
 */
export function personNames(
  members: readonly { pilotId: string; name: string }[],
  groups: readonly { id: string; name: string }[],
): { person: (pilotId: string) => string; group: (groupId: string) => string } {
  const people = new Map(members.map((m) => [m.pilotId, m.name]));
  const named = new Map(groups.map((g) => [g.id, g.name]));
  return {
    person: (pilotId) => people.get(pilotId) ?? '?',
    group: (groupId) => named.get(groupId) ?? '?',
  };
}

/** Załoga z rezerwacji - zlecenie jej nie powiela (§10.4). */
export function crewOf(booking: Pick<BookingRecord, 'pilotId' | 'dualId'>): OrderCrew {
  return { pic: booking.pilotId, dual: booking.dualId };
}

export function orderView(order: FlightOrderRecord, booking: BookingRecord): OrderView {
  return { status: order.status, addressing: order.addressing, seats: order.seats, crew: crewOf(booking) };
}

/**
 * Adresat dla reguł. Odpowiedź liczy się WYŁĄCZNIE w bieżącej wersji (§5.1): „nie mogę
 * w sobotę" nie mówi nic o niedzieli, więc starsza odpowiedź jest dla reguł brakiem
 * odpowiedzi - a w zapisie zostaje z dopiskiem „poprzedni termin".
 */
export function recipientView(row: OrderRecipientRecord, revision: number): RecipientView {
  return {
    pilotId: row.pilotId,
    seat: row.seat,
    namedSeat: row.namedSeat,
    direct: row.direct,
    removed: row.removedAt != null,
    answer: row.answeredRevision === revision ? row.answer : null,
  };
}

/** Zlecenie w postaci, w jakiej opisuje je wiadomość. */
export function noticeOrderOf(order: FlightOrderRecord, booking: BookingRecord): NoticeOrder {
  return {
    id: order.id,
    bookingId: booking.id,
    aircraftId: booking.aircraftId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    operation: booking.operation,
    fromIcao: booking.fromIcao,
    toIcao: booking.toIcao,
    createdBy: order.createdBy,
  };
}

/**
 * Adresaci „Zlecenia lotu" z fotelem, o który pytamy - z wierszy adresatów tego zlecenia.
 * Osoba bez wiersza (nie powinna się zdarzyć) dostaje termin do potwierdzenia, a nie fotel
 * wzięty znikąd.
 */
export function offeredTo(rows: readonly OrderRecipientRecord[], pilotIds: readonly string[]): OfferedRecipient[] {
  return pilotIds.map((pilotId) => ({ pilotId, seat: rows.find((r) => r.pilotId === pilotId)?.seat ?? null }));
}
