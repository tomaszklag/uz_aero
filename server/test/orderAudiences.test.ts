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
    expect(changeAudience(filled, 'AKO')).toEqual(['BNO', 'PIE']);
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
