/**
 * Ninerdeck (serwer) - ODPOWIEDŹ, PRZYDZIAŁ, COFNIĘCIE I REZYGNACJA
 * (4.0.0, issue #245; `docs/zlecenia.md` §4.3, §5.2, §5.3).
 *
 * ══ KTO OBSADZA FOTEL (§4.3) ══
 *  - osoba wskazana IMIENNIE jako jedyna na fotel: jej „PRZYJMUJĘ" obsadza go od razu;
 *  - adresat grupy, kilku osób, wspólnej listy albo z terminem do potwierdzenia: jego
 *    „MOGĘ LECIEĆ" jest ZGŁOSZENIEM, a fotel wybiera prowadzący spośród zgłoszonych.
 * Innego pilota nie da się wpisać do fotela bez jego potwierdzenia (pkt 12) - stąd
 * odmowa `not_volunteered` przy przydziale kogoś, kto nie powiedział „tak".
 *
 * ══ ODPOWIEDŹ „FOTEL JUŻ ZAJĘTY" TO WYNIK, NIE BŁĄD (§20 Z3) ══
 * Dwóch adresatów tapie „tak" w tej samej minucie, dwóch prowadzących wybiera naraz -
 * przegrany dostaje zwykłą odpowiedź, którą ekran nazywa zdaniem. Kolejność rozstrzyga
 * blokada wiersza zlecenia w komendzie; ta funkcja orzeka na stanie PO blokadzie.
 *
 * ══ ZMIANA ZDANIA JEST DOZWOLONA W OBIE STRONY ══
 * Makieta 28A daje po zgłoszeniu „NIE MOGĘ" do wycofania go, a odpowiedź jest zapisem
 * STANU w bieżącej wersji, nie jednorazową decyzją. Serwer przyjmuje więc zmianę tak
 * i nie, dopóki zlecenie żyje; co pokazać adresatowi, rozstrzyga ekran.
 */

import {
  crewSeatOf,
  isLive,
  otherSeat,
  soughtSeats,
  type OrderAnswer,
  type OrderRefusal,
  type OrderView,
  type RecipientView,
  type Seat,
} from './orders.ts';

/**
 * Wynik odpowiedzi. Zwracany ZAWSZE z kodem 200 - nawet „fotel zajęty" i „zamknięte"
 * są odpowiedzią o stanie zlecenia, a nie awarią zapisu.
 */
export type AnswerOutcome =
  /** Imiennie: fotel obsadzony tą odpowiedzią, lot jest odtąd rezerwacją tej osoby. */
  | { kind: 'assigned'; seat: Seat }
  /** Zgłoszenie - fotel wybierze prowadzący. */
  | { kind: 'volunteered' }
  | { kind: 'declined' }
  /** „Tak" na fotel, który zdążył zająć ktoś inny (albo przestał być szukany). */
  | { kind: 'seat_filled' }
  /** Zlecenie odwołane, wygasłe albo odebrane temu adresatowi. */
  | { kind: 'closed' };

/**
 * Fotele, na które adresat MOŻE trafić: jego fotel albo - przy wspólnej liście i terminie
 * do potwierdzenia - każdy szukany. Zawsze wyłącznie SZUKANE: fotel przestawiony na „ja"
 * albo „brak" nie przyjmuje już nikogo z adresatów.
 */
export function eligibleSeats(order: OrderView, recipient: Pick<RecipientView, 'seat'>): Seat[] {
  const sought = soughtSeats(order.seats);
  return recipient.seat == null ? sought : sought.filter((seat) => seat === recipient.seat);
}

/** Odmowa odpowiedzi - wyłącznie „NIE MOGĘ" od osoby już przydzielonej (§5.3). */
export function refuseAnswer(
  order: OrderView,
  recipient: RecipientView,
  answer: OrderAnswer,
): OrderRefusal | null {
  if (answer === 'no' && isLive(order.status) && !recipient.removed && assignedSeat(order, recipient.pilotId) != null) {
    return 'already_assigned';
  }
  return null;
}

/** Skutek odpowiedzi adresata na stanie zlecenia PO blokadzie wiersza. */
export function answerOutcome(
  order: OrderView,
  recipient: RecipientView,
  answer: OrderAnswer,
): AnswerOutcome {
  if (recipient.removed || !isLive(order.status)) return { kind: 'closed' };
  if (answer === 'no') return { kind: 'declined' };

  // Powtórzone „tak" osoby, która już siedzi w fotelu - ta sama odpowiedź, bez skutku.
  const seated = assignedSeat(order, recipient.pilotId);
  if (seated != null) return { kind: 'assigned', seat: seated };

  const free = eligibleSeats(order, recipient).filter((seat) => order.crew[seat] == null);
  if (free.length === 0) return { kind: 'seat_filled' };
  if (recipient.direct && recipient.seat != null) return { kind: 'assigned', seat: recipient.seat };
  return { kind: 'volunteered' };
}

/**
 * Przydział przez prowadzącego (`WYBIERZ`, `NA DOWÓDCĘ`, `NA DRUGIEGO PILOTA`) - odmowa
 * albo `null`. Wybór WYŁĄCZNIE spośród zgłoszonych w bieżącej wersji (pkt 12).
 *
 * Kolejność: najpierw stan zlecenia i fotela (to, co widać na karcie), potem osoba.
 * Ta sama osoba ponownie w tym samym fotelu nie jest odmową - komenda rozpoznaje ją
 * jako brak zmiany.
 */
export function refuseAssign(
  order: OrderView,
  recipient: RecipientView | null,
  seat: Seat,
): OrderRefusal | null {
  if (!isLive(order.status)) return 'order_closed';
  if (order.seats[seat] !== 'sought') return 'seat_not_sought';
  if (recipient == null || recipient.removed) return 'not_recipient';
  const sitting = order.crew[seat];
  if (sitting === recipient.pilotId) return null;
  if (sitting != null) return 'seat_filled';
  if (order.crew[otherSeat(seat)] === recipient.pilotId) return 'same_person_both_seats';
  if (!eligibleSeats(order, recipient).includes(seat)) return 'wrong_seat';
  if (recipient.answer !== 'yes') return 'not_volunteered';
  return null;
}

/**
 * Cofnięcie przydziału przez prowadzącego - odmowa albo `null`. Dotyczy wyłącznie
 * fotela SZUKANEGO: fotel „ja" zmienia się edycją układu foteli, nie cofnięciem.
 */
export function refuseUnassign(order: OrderView, seat: Seat): OrderRefusal | null {
  if (!isLive(order.status)) return 'order_closed';
  if (order.seats[seat] !== 'sought') return 'seat_not_sought';
  if (order.crew[seat] == null) return 'seat_empty';
  return null;
}

/**
 * Rezygnacja przydzielonego („REZYGNUJĘ") - odmowa albo `null`. Fotel wraca do
 * szukania, drugi obsadzony zostaje, termin zostaje zajęty (§5.3).
 */
export function refuseWithdraw(order: OrderView, pilotId: string): OrderRefusal | null {
  if (!isLive(order.status)) return 'order_closed';
  if (assignedSeat(order, pilotId) == null) return 'not_assigned';
  return null;
}

/**
 * Odebranie zlecenia adresatowi (pkt 29) - odmowa albo `null`. Osoby PRZYDZIELONEJ nie
 * da się usunąć wprost: najpierw cofnięcie przydziału, żeby nie zniknęła z lotu bez śladu.
 */
export function refuseRemoveRecipient(order: OrderView, recipient: RecipientView | null): OrderRefusal | null {
  if (!isLive(order.status)) return 'order_closed';
  if (recipient == null || recipient.removed) return 'not_recipient';
  if (assignedSeat(order, recipient.pilotId) != null) return 'recipient_assigned';
  return null;
}

/** Szukany fotel, w którym siedzi osoba - fotel „ja" to zlecający, nie przydział. */
function assignedSeat(order: OrderView, pilotId: string): Seat | null {
  const seat = crewSeatOf(order.crew, pilotId);
  return seat != null && order.seats[seat] === 'sought' ? seat : null;
}
