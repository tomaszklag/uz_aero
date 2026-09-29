/**
 * Ninerdeck (serwer) - odpowiedź, przydział, cofnięcie, rezygnacja i odebranie zlecenia
 * (#245, `docs/zlecenia.md` §4.3, §5.2, §5.3).
 *
 * Najważniejsza własność: innego pilota NIE DA SIĘ wpisać do fotela bez jego „tak"
 * (pkt 12). Fotel obsadza albo odpowiedź osoby wskazanej imiennie, albo prowadzący -
 * wyłącznie spośród zgłoszonych w bieżącej wersji.
 */

import { describe, expect, it } from 'vitest';

import {
  answerOutcome,
  awaitsSeat,
  eligibleSeats,
  inPlay,
  staleReason,
  refuseAnswer,
  refuseAssign,
  refuseRemoveRecipient,
  refuseUnassign,
  refuseWithdraw,
} from '../src/domain/orderAnswers.ts';
import type { OrderView, RecipientView } from '../src/domain/orders.ts';

const order = (patch: Partial<OrderView> = {}): OrderView => ({
  status: 'open',
  addressing: 'per_seat',
  seats: { pic: 'sought', dual: 'sought' },
  crew: { pic: null, dual: null },
  ...patch,
});

const recipient = (pilotId: string, patch: Partial<RecipientView> = {}): RecipientView => ({
  pilotId,
  seat: 'pic',
  namedSeat: null,
  direct: false,
  removed: false,
  answer: null,
  ...patch,
});

describe('odpowiedź adresata', () => {
  it('„PRZYJMUJĘ" jedynej osoby wskazanej imiennie obsadza fotel od razu', () => {
    const jan = recipient('JWR', { direct: true });
    expect(answerOutcome(order(), jan, 'yes')).toEqual({ kind: 'assigned', seat: 'pic' });
  });

  it('„MOGĘ LECIEĆ" z grupy jest zgłoszeniem - fotel wybiera prowadzący', () => {
    expect(answerOutcome(order(), recipient('PIE'), 'yes')).toEqual({ kind: 'volunteered' });
  });

  it('termin do potwierdzenia: „tak" niczego nie obsadza, także przy wskazaniu imiennym (pkt 37)', () => {
    const jan = recipient('JWR', { seat: null, namedSeat: 'pic' });
    expect(answerOutcome(order(), jan, 'yes')).toEqual({ kind: 'volunteered' });
  });

  it('„tak" na fotel, który zajął ktoś inny, to odpowiedź „fotel obsadzony" - nie błąd', () => {
    const taken = order({ crew: { pic: 'BNO', dual: null } });
    expect(answerOutcome(taken, recipient('PIE'), 'yes')).toEqual({ kind: 'seat_filled' });
    expect(answerOutcome(taken, recipient('JWR', { direct: true }), 'yes')).toEqual({ kind: 'seat_filled' });
    // Termin do potwierdzenia ma jeszcze drugi fotel - zgłoszenie dalej ma sens.
    expect(answerOutcome(taken, recipient('ANN', { seat: null }), 'yes')).toEqual({ kind: 'volunteered' });
  });

  it('„tak" na fotel przestawiony na „ja" albo „brak" - fotela już nie ma do obsadzenia', () => {
    const noDual = order({ seats: { pic: 'self', dual: 'none' }, crew: { pic: 'AKO', dual: null } });
    expect(answerOutcome(noDual, recipient('ANN', { seat: 'dual' }), 'yes')).toEqual({ kind: 'seat_filled' });
    expect(eligibleSeats(noDual, { seat: 'dual' })).toEqual([]);
  });

  it('„NIE MOGĘ" wycofuje zgłoszenie - zmiana zdania przed przydziałem jest dozwolona', () => {
    expect(answerOutcome(order(), recipient('PIE', { answer: 'yes' }), 'no')).toEqual({ kind: 'declined' });
    expect(answerOutcome(order(), recipient('PIE', { answer: 'no' }), 'yes')).toEqual({ kind: 'volunteered' });
  });

  it('„NIE MOGĘ" osoby przydzielonej to odmowa - od tego jest rezygnacja', () => {
    const seated = order({ crew: { pic: 'JWR', dual: null } });
    expect(refuseAnswer(seated, recipient('JWR', { answer: 'yes' }), 'no')).toBe('already_assigned');
    expect(refuseAnswer(seated, recipient('PIE'), 'no')).toBeNull();
    // Powtórzone „tak" osoby w fotelu to ta sama odpowiedź, bez skutku.
    expect(answerOutcome(seated, recipient('JWR', { answer: 'yes' }), 'yes')).toEqual({ kind: 'assigned', seat: 'pic' });
  });

  it('zlecenie odwołane, wygasłe albo odebrane - odpowiedź „zamknięte"', () => {
    expect(answerOutcome(order({ status: 'cancelled' }), recipient('PIE'), 'yes')).toEqual({ kind: 'closed' });
    expect(answerOutcome(order({ status: 'expired' }), recipient('PIE'), 'no')).toEqual({ kind: 'closed' });
    expect(answerOutcome(order(), recipient('PIE', { removed: true }), 'yes')).toEqual({ kind: 'closed' });
  });
});

describe('przydział przez prowadzącego', () => {
  it('wybór spośród zgłoszonych przechodzi', () => {
    expect(refuseAssign(order(), recipient('PIE', { answer: 'yes' }), 'pic')).toBeNull();
  });

  it('bez „tak" w bieżącej wersji nie da się nikogo wpisać (pkt 12)', () => {
    expect(refuseAssign(order(), recipient('PIE'), 'pic')).toBe('not_volunteered');
    expect(refuseAssign(order(), recipient('PIE', { answer: 'no' }), 'pic')).toBe('not_volunteered');
  });

  it('drugi przydział naraz przegrywa z pierwszym: „fotel obsadzony"', () => {
    const taken = order({ crew: { pic: 'BNO', dual: null } });
    expect(refuseAssign(taken, recipient('PIE', { answer: 'yes' }), 'pic')).toBe('seat_filled');
    // Ta sama osoba w tym samym fotelu to nie odmowa - komenda rozpozna brak zmiany.
    expect(refuseAssign(taken, recipient('BNO', { answer: 'yes' }), 'pic')).toBeNull();
  });

  it('osoba zaadresowana na drugi fotel nie trafi na ten', () => {
    expect(refuseAssign(order(), recipient('PIE', { seat: 'dual', answer: 'yes' }), 'pic')).toBe('wrong_seat');
  });

  it('wspólna lista i termin do potwierdzenia: każdy szukany fotel; wybór na jeden zdejmuje z drugiego', () => {
    const shared = order({ addressing: 'shared' });
    const ann = recipient('ANN', { seat: null, answer: 'yes' });
    expect(refuseAssign(shared, ann, 'pic')).toBeNull();
    expect(refuseAssign(shared, ann, 'dual')).toBeNull();
    const annOnPic = order({ addressing: 'shared', crew: { pic: 'ANN', dual: null } });
    expect(refuseAssign(annOnPic, ann, 'dual')).toBe('same_person_both_seats');
  });

  it('fotel nieszukany, zlecenie zamknięte, osoba spoza adresatów', () => {
    expect(refuseAssign(order({ seats: { pic: 'self', dual: 'sought' } }), recipient('PIE', { answer: 'yes' }), 'pic')).toBe(
      'seat_not_sought',
    );
    expect(refuseAssign(order({ status: 'expired' }), recipient('PIE', { answer: 'yes' }), 'pic')).toBe('order_closed');
    expect(refuseAssign(order(), null, 'pic')).toBe('not_recipient');
    expect(refuseAssign(order(), recipient('PIE', { removed: true, answer: 'yes' }), 'pic')).toBe('not_recipient');
  });
});

describe('cofnięcie przydziału, rezygnacja, odebranie zlecenia', () => {
  const seated = order({ status: 'filled', seats: { pic: 'sought', dual: 'none' }, crew: { pic: 'JWR', dual: null } });

  it('cofnięcie działa na obsadzonym szukanym fotelu - także przy komplecie załogi', () => {
    expect(refuseUnassign(seated, 'pic')).toBeNull();
    expect(refuseUnassign(order(), 'pic')).toBe('seat_empty');
    expect(refuseUnassign(order({ seats: { pic: 'self', dual: 'sought' }, crew: { pic: 'AKO', dual: null } }), 'pic')).toBe(
      'seat_not_sought',
    );
  });

  it('rezygnuje wyłącznie przydzielony; zlecający w fotelu „ja" nie jest przydziałem', () => {
    expect(refuseWithdraw(seated, 'JWR')).toBeNull();
    expect(refuseWithdraw(seated, 'PIE')).toBe('not_assigned');
    const selfPic = order({ seats: { pic: 'self', dual: 'sought' }, crew: { pic: 'AKO', dual: null } });
    expect(refuseWithdraw(selfPic, 'AKO')).toBe('not_assigned');
    expect(refuseWithdraw(order({ status: 'cancelled', crew: { pic: 'JWR', dual: null } }), 'JWR')).toBe('order_closed');
  });

  it('osoby przydzielonej nie da się usunąć wprost - najpierw cofnięcie (pkt 29)', () => {
    expect(refuseRemoveRecipient(seated, recipient('JWR', { answer: 'yes' }))).toBe('recipient_assigned');
    expect(refuseRemoveRecipient(seated, recipient('PIE'))).toBeNull();
    expect(refuseRemoveRecipient(seated, recipient('PIE', { removed: true }))).toBe('not_recipient');
  });
});

describe('adresat w grze - „nieaktualne" i rozmowa do odczytu (28B)', () => {
  it('czeka ten, przed kim stoi wolny fotel; obsadzony przez kogoś innego - już nie', () => {
    expect(awaitsSeat(order(), recipient('PIE'))).toBe(true);
    const taken = order({ crew: { pic: 'BNO', dual: null } });
    expect(awaitsSeat(taken, recipient('PIE'))).toBe(false);
    // Termin do potwierdzenia ma jeszcze drugi fotel.
    expect(awaitsSeat(taken, recipient('ANN', { seat: null }))).toBe(true);
    expect(awaitsSeat(order(), recipient('PIE', { removed: true }))).toBe(false);
  });

  it('w grze jest przydzielony i czekający, ale nikt w zleceniu zamkniętym ani po odebraniu', () => {
    const seated = order({ status: 'filled', seats: { pic: 'sought', dual: 'none' }, crew: { pic: 'JWR', dual: null } });
    expect(inPlay(seated, recipient('JWR'))).toBe(true);
    expect(inPlay(seated, recipient('PIE'))).toBe(false);
    expect(inPlay(order(), recipient('PIE'))).toBe(true);
    expect(inPlay(order({ status: 'cancelled' }), recipient('PIE'))).toBe(false);
    expect(inPlay(order(), recipient('PIE', { removed: true }))).toBe(false);
  });

  it('odmowa nie wyjmuje z gry - adresat może jeszcze zmienić zdanie (28A)', () => {
    expect(inPlay(order(), recipient('PIE', { answer: 'no' }))).toBe(true);
  });

  it('powód „nieaktualne": odwołane, odebrane, fotel niepotrzebny albo obsadzony (28B)', () => {
    expect(staleReason(order(), recipient('PIE'))).toBeNull();
    expect(staleReason(order({ status: 'expired' }), recipient('PIE'))).toBe('closed');
    expect(staleReason(order(), recipient('PIE', { removed: true }))).toBe('removed');
    // Fotel przestawiony na „brak" - adresat śpi, ale wraca, gdy fotel znów będzie szukany.
    const noDual = order({ seats: { pic: 'sought', dual: 'none' } });
    expect(staleReason(noDual, recipient('ANN', { seat: 'dual' }))).toBe('seat_dropped');
    expect(staleReason(order(), recipient('ANN', { seat: 'dual' }))).toBeNull();
    const taken = order({ crew: { pic: 'BNO', dual: null } });
    expect(staleReason(taken, recipient('PIE'))).toBe('seat_filled');
  });
});
