/**
 * Ninerdeck (serwer) - TREŚCI POWIADOMIEŃ o zleceniu (4.0.0, issue #245;
 * `docs/zlecenia.md` §12).
 *
 * Czyste funkcje, jak `bookingNotices.ts` i `aircraftNotices.ts`: biorą fakty, oddają
 * wiersz skrzynki razem z budzikiem. KOGO obudzić, rozstrzyga domena
 * (`domain/orderAudiences.ts`) - tutaj pada wyłącznie „co powiedzieć".
 *
 * ══ TYTUŁ RZECZOWNIKIEM, PUSH BEZ NAZWISK I GODZIN ══
 * Push ląduje na ekranie blokady, który widzi każdy, kto akurat patrzy na telefon, więc
 * nazywa RZECZ („Zlecenie lotu", „Lot przydzielony"), a treść stoi w skrzynce. `payload`
 * wozi identyfikatory i czasy - nazwisko i znak maszyny rozwiązuje aplikacja z cache'u
 * klubu, jak wszędzie. `order_filled` i `order_removed` mają ten sam tytuł, bo adresat
 * pyta o to samo - czy zlecenie jest dla niego aktualne; różni je treść skrzynki.
 */

import type { Seat } from '../../../domain/orders.ts';
import type { NotificationDraft } from './bookingNotices.ts';

/** Zlecenie w postaci, w jakiej opisuje je wiadomość. */
export interface NoticeOrder {
  id: string;
  bookingId: string;
  aircraftId: string;
  startsAt: number;
  endsAt: number;
  operation: string | null;
  createdBy: string;
}

const about = (order: NoticeOrder): Record<string, unknown> => ({
  orderId: order.id,
  bookingId: order.bookingId,
  aircraftId: order.aircraftId,
  startsAt: new Date(order.startsAt).toISOString(),
  endsAt: new Date(order.endsAt).toISOString(),
  operation: order.operation,
  createdBy: order.createdBy,
});

/**
 * „Zlecenie lotu" - wysłanie, dopisanie adresatów albo „Wyślij ponownie" (pkt 41).
 * `reminder` odróżnia przypomnienie niezdecydowanemu od pierwszego wysłania: to ta sama
 * prośba, ale adresat ma wiedzieć, że nie jest nowa.
 */
export function orderOffered(order: NoticeOrder, pilotIds: readonly string[], reminder: boolean): NotificationDraft[] {
  return pilotIds.map((pilotId) => ({
    pilotId,
    kind: 'order_offered' as const,
    payload: { ...about(order), reminder },
    push: {
      title: 'Zlecenie lotu',
      body: reminder ? 'Zlecenie czeka na Twoją odpowiedź.' : 'Masz nowe zlecenie lotu.',
    },
  }));
}

/** Co zmieniła edycja - pola z wartością przed i po, jak w historii zmian (§10.3). */
export type OrderEdit = Record<string, { from: unknown; to: unknown }>;

/**
 * „Zlecenie zmienione" (zmiana TERMINU - prośba o ponowną odpowiedź, §5.1) albo
 * „Zlecenie edytowane" (każda inna zmiana, bez potwierdzeń, §5.2). Nazwiska zmieniającego
 * wiadomość nie niesie (pkt 31) - widzą je prowadzący w historii zmian.
 */
export function orderChanged(order: NoticeOrder, pilotIds: readonly string[], edit: OrderEdit): NotificationDraft[] {
  const term = 'term' in edit;
  return pilotIds.map((pilotId) => ({
    pilotId,
    kind: 'order_changed' as const,
    payload: { ...about(order), term, changes: edit },
    push: term
      ? { title: 'Zlecenie zmienione', body: 'Zmienił się termin - odpowiedz ponownie.' }
      : { title: 'Zlecenie edytowane', body: 'Sprawdź, co się zmieniło.' },
  }));
}

/** „Odpowiedź na zlecenie" - WYŁĄCZNIE do autora (pkt 28). */
export function orderAnswered(
  order: NoticeOrder,
  authorId: string,
  answer: { pilotId: string; answer: 'yes' | 'no'; reason: string | null; assignedSeat: Seat | null },
): NotificationDraft {
  return {
    pilotId: authorId,
    kind: 'order_answered',
    payload: { ...about(order), ...answer },
    push: { title: 'Odpowiedź na zlecenie', body: 'Adresat odpowiedział na Twoje zlecenie.' },
  };
}

/** „Lot przydzielony" - do osoby wybranej z grupy albo listy (§4.3). */
export function orderAssigned(order: NoticeOrder, pilotId: string, seat: Seat): NotificationDraft {
  return {
    pilotId,
    kind: 'order_assigned',
    payload: { ...about(order), seat },
    push: { title: 'Lot przydzielony', body: 'Lot jest Twój - sprawdź szczegóły.' },
  };
}

/**
 * „Zlecenie nieaktualne" dla adresata, który czekał na fotel:
 *  - `seat_filled` - fotel obsadził ktoś inny (przy wspólnej liście: komplet załogi);
 *  - `seat_dropped` - fotel przestawiono na „ja" albo „brak". Adresat zostaje adresatem
 *    i wraca do gry, gdy fotel znów będzie szukany (decyzja właściciela 2026-09-29).
 * Ten sam rodzaj, co przy obsadzeniu, bo adresat pyta o to samo - czy zlecenie jest dla
 * niego aktualne; powód niesie treść.
 */
export function orderFilled(
  order: NoticeOrder,
  pilotIds: readonly string[],
  reason: 'seat_filled' | 'seat_dropped' = 'seat_filled',
): NotificationDraft[] {
  return pilotIds.map((pilotId) => ({
    pilotId,
    kind: 'order_filled' as const,
    payload: { ...about(order), reason },
    push: {
      title: 'Zlecenie nieaktualne',
      body: reason === 'seat_filled' ? 'Fotel został obsadzony.' : 'Fotel nie jest już potrzebny.',
    },
  }));
}

/** „Zlecenie nieaktualne" - zlecenie odebrane adresatowi (pkt 29). */
export function orderRemoved(order: NoticeOrder, pilotId: string, reason: string | null): NotificationDraft {
  return {
    pilotId,
    kind: 'order_removed',
    payload: { ...about(order), reason },
    push: { title: 'Zlecenie nieaktualne', body: 'Zlecenie zostało cofnięte.' },
  };
}

/** „Rezygnacja z lotu" - do autora (§5.3). */
export function orderWithdrawn(
  order: NoticeOrder,
  authorId: string,
  withdrawal: { pilotId: string; seat: Seat; reason: string | null },
): NotificationDraft {
  return {
    pilotId: authorId,
    kind: 'order_withdrawn',
    payload: { ...about(order), ...withdrawal },
    push: { title: 'Rezygnacja z lotu', body: 'Fotel wrócił do szukania.' },
  };
}

/** „Przydział cofnięty" - cofnięcie przez prowadzącego albo fotel przestawiony na „ja"/„brak". */
export function orderUnassigned(
  order: NoticeOrder,
  pilotId: string,
  unassign: { seat: Seat; reason: string | null },
): NotificationDraft {
  return {
    pilotId,
    kind: 'order_unassigned',
    payload: { ...about(order), ...unassign },
    push: { title: 'Przydział cofnięty', body: 'Twój przydział do lotu został cofnięty.' },
  };
}

/** „Zlecenie odwołane" - powód opcjonalny, a gdy jest, jest treścią wiadomości (§5.6). */
export function orderCancelled(
  order: NoticeOrder,
  pilotIds: readonly string[],
  cancel: { reason: string | null; cancelledBy: string },
): NotificationDraft[] {
  return pilotIds.map((pilotId) => ({
    pilotId,
    kind: 'order_cancelled' as const,
    payload: { ...about(order), ...cancel },
    push: { title: 'Zlecenie odwołane', body: 'Zlecenie lotu zostało odwołane.' },
  }));
}

/** „Zlecenie bez kompletu załogi" - do autora, wieczorem w przeddzień (pkt 45). */
export function orderUnfilled(order: NoticeOrder, authorId: string, openSeats: readonly Seat[]): NotificationDraft {
  return {
    pilotId: authorId,
    kind: 'order_unfilled',
    payload: { ...about(order), openSeats: [...openSeats] },
    push: { title: 'Zlecenie bez kompletu załogi', body: 'Lot jutro, a załoga nie jest kompletna.' },
  };
}

/** „Zlecenie wygasło" - termin nadszedł bez kompletu, W CAŁOŚCI (§5.5). */
export function orderExpired(order: NoticeOrder, pilotIds: readonly string[]): NotificationDraft[] {
  return pilotIds.map((pilotId) => ({
    pilotId,
    kind: 'order_expired' as const,
    payload: about(order),
    push: { title: 'Zlecenie wygasło', body: 'Termin nadszedł bez kompletu załogi i wrócił do puli.' },
  }));
}

/**
 * „Wiadomość w zleceniu" - do drugiego uczestnika wątku. JEDEN nieprzeczytany wiersz na
 * wątek z licznikiem (§7.3): `threadId` jest kluczem odświeżenia, a `recipientId` mówi
 * aplikacji, czy push dotyczy otwartej rozmowy (pkt 43).
 */
export function orderMessage(
  order: NoticeOrder,
  pilotId: string,
  message: { threadId: string; recipientId: string; authorId: string; unread: number },
): NotificationDraft {
  return {
    pilotId,
    kind: 'order_message',
    payload: { ...about(order), ...message },
    push: { title: 'Wiadomość w zleceniu', body: 'Masz nową wiadomość.' },
  };
}
