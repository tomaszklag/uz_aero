/**
 * Ninerdeck (serwer) - kogo obudzić przy zmianie zlecenia (#245, `docs/zlecenia.md` §12).
 *
 * Dwie reguły wspólne: sprawca nie budzi sam siebie, a odmowa w bieżącej wersji
 * wycisza zmiany i odwołanie. Przydzielony nigdy nie dostaje „Zlecenie nieaktualne".
 */

import { describe, expect, it } from 'vitest';

import {
  assignedPilots,
  cancelAudience,
  changeAudience,
  expireAudience,
  filledAudience,
  openRecipients,
  remindAudience,
  staleAudience,
  type AudienceState,
} from '../src/domain/orderAudiences.ts';
import type { OrderView, RecipientView } from '../src/domain/orders.ts';

const recipient = (pilotId: string, patch: Partial<RecipientView> = {}): RecipientView => ({
  pilotId,
  seat: 'dual',
  namedSeat: null,
  direct: false,
  removed: false,
  answer: null,
  ...patch,
});

const state = (view: Partial<OrderView>, recipients: RecipientView[]): AudienceState => ({
  authorId: 'AKO',
  view: {
    status: 'open',
    addressing: 'per_seat',
    seats: { pic: 'self', dual: 'sought' },
    crew: { pic: 'AKO', dual: null },
    ...view,
  },
  recipients,
});

describe('zmiana i odwołanie', () => {
  const s = state({}, [
    recipient('BNO', { answer: 'yes' }),
    recipient('JWR', { answer: 'no' }),
    recipient('PIE'),
    recipient('OFF', { removed: true }),
  ]);

  it('dostają adresaci bez odmowy i niewykreśleni; odmowa wycisza', () => {
    expect(openRecipients(s)).toEqual(['BNO', 'PIE']);
  });

  it('zmianę zlecającego widzą adresaci, a on sam nie dostaje wiadomości o własnej zmianie', () => {
    expect(changeAudience(s, 'AKO')).toEqual(['BNO', 'PIE']);
  });

  it('zmianę koordynatora dostaje też zlecający (§12: „gdy zmienił ktoś inny")', () => {
    expect(changeAudience(s, 'KRZ')).toEqual(['BNO', 'PIE', 'AKO']);
    expect(cancelAudience(s, 'KRZ')).toEqual(['BNO', 'PIE', 'AKO']);
  });

  it('przydzielony dostaje zmianę zawsze - z przodu listy, bez podwójnego wpisu', () => {
    const filled = state({ status: 'filled', crew: { pic: 'AKO', dual: 'BNO' } }, [
      recipient('BNO', { answer: 'yes' }),
      recipient('PIE'),
    ]);
    expect(assignedPilots(filled.view.seats, filled.view.crew)).toEqual(['BNO']);
    // PIE czekał na TEN fotel i dostał już „Zlecenie nieaktualne" - dalszych zmian
    // zlecenia, w którym nie ma już dla niego miejsca, nie potrzebuje (28B).
    expect(changeAudience(filled, 'AKO')).toEqual(['BNO']);
  });

  it('adresat obsadzonego fotela wypada ze zmian; termin do potwierdzenia ma jeszcze drugi fotel', () => {
    const s = state({ seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'BNO', dual: null } }, [
      recipient('PIE', { seat: 'pic' }),
      recipient('ANN', { seat: null, namedSeat: 'pic' }),
      recipient('JWR', { seat: 'dual' }),
    ]);
    expect(openRecipients(s)).toEqual(['ANN', 'JWR']);
  });

  it('wygaśnięcie nie ma sprawcy - zlecający też dostaje wiadomość', () => {
    expect(expireAudience(s)).toEqual(['BNO', 'PIE', 'AKO']);
  });
});

describe('„Zlecenie nieaktualne" po obsadzeniu fotela', () => {
  it('adresaci obsadzonego fotela bez odmowy - poza przydzielonym', () => {
    const s = state({ status: 'filled', crew: { pic: 'AKO', dual: 'BNO' } }, [
      recipient('BNO', { answer: 'yes' }),
      recipient('PIE'),
      recipient('JWR', { answer: 'no' }),
    ]);
    expect(filledAudience(s, 'dual')).toEqual(['PIE']);
  });

  it('termin do potwierdzenia dostaje wiadomość dopiero przy KOMPLECIE - do tego czasu ma drugi fotel', () => {
    const recipients = [recipient('JWR', { seat: null, namedSeat: 'pic' }), recipient('PIE', { seat: 'pic' })];
    const oneSeat = state({ seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'PIE', dual: null } }, recipients);
    expect(filledAudience(oneSeat, 'pic')).toEqual([]);
    const complete = state(
      { status: 'filled', seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'PIE', dual: 'BNO' } },
      recipients,
    );
    expect(filledAudience(complete, 'dual')).toEqual(['JWR']);
  });

  it('wspólna lista - „nieaktualne" dopiero przy komplecie załogi', () => {
    const recipients = [recipient('ANN', { seat: null }), recipient('JWR', { seat: null })];
    const half = state(
      { addressing: 'shared', seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'ANN', dual: null } },
      recipients,
    );
    expect(filledAudience(half, 'pic')).toEqual([]);
    const full = state(
      { addressing: 'shared', status: 'filled', seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'ANN', dual: 'BNO' } },
      recipients,
    );
    expect(filledAudience(full, 'dual')).toEqual(['JWR']);
  });
});

describe('„Zlecenie nieaktualne" po edycji i przypomnienie przy „Wyślij ponownie"', () => {
  it('drugi fotel na „brak" domyka komplet - lista wspólna nie ma już na co czekać', () => {
    const recipients = [
      recipient('ANN', { seat: null }),
      recipient('JWR', { seat: null, answer: 'no' }),
      recipient('OFF', { seat: null, removed: true }),
    ];
    const before = state(
      { addressing: 'shared', seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'BNO', dual: null } },
      [...recipients, recipient('BNO', { seat: null, answer: 'yes' })],
    );
    const after = state(
      { addressing: 'shared', status: 'filled', seats: { pic: 'sought', dual: 'none' }, crew: { pic: 'BNO', dual: null } },
      [...recipients, recipient('BNO', { seat: null, answer: 'yes' })],
    );
    // JWR odmówił, OFF-owi odebrano zlecenie, BNO siedzi w fotelu - wiadomość idzie do ANN.
    expect(staleAudience(before, after)).toEqual(['ANN']);
  });

  it('kto przestał czekać JUŻ WCZEŚNIEJ, nie dostaje drugiego „nieaktualne"', () => {
    const taken = state({ seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'BNO', dual: null } }, [
      recipient('PIE', { seat: 'pic' }),
    ]);
    expect(staleAudience(taken, taken)).toEqual([]);
  });

  it('odebrany w tej zmianie dostaje „odebrane", nie „nieaktualne"', () => {
    const before = state({}, [recipient('PIE')]);
    const after = state({}, [recipient('PIE', { removed: true })]);
    expect(staleAudience(before, after)).toEqual([]);
  });

  it('przypomnienie dostają wyłącznie niezdecydowani, którzy jeszcze czekają na fotel', () => {
    const s = state({ seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'BNO', dual: null } }, [
      recipient('BNO', { seat: 'pic', answer: 'yes' }),
      recipient('PIE', { seat: 'pic' }),
      recipient('ANN', { seat: 'dual' }),
      recipient('JWR', { seat: 'dual', answer: 'no' }),
      recipient('KRZ', { seat: 'dual', answer: 'yes' }),
      recipient('OFF', { seat: 'dual', removed: true }),
    ]);
    expect(remindAudience(s)).toEqual(['ANN']);
  });
});
