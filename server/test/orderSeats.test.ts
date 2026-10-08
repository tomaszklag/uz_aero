/**
 * Ninerdeck (serwer) - fotele zlecenia: układ, komplet załogi, przestawienie
 * (#245, `docs/zlecenia.md` §4.1, §5.2).
 */

import { describe, expect, it } from 'vitest';

import { crewComplete, crewForSeats, openSeats, refuseSeats, statusFor } from '../src/domain/orderSeats.ts';
import { soughtSeats } from '../src/domain/orders.ts';

const PLAIN = { dualRequired: false };
const TWO_CREW = { dualRequired: true };

describe('układ foteli', () => {
  it('co najmniej jeden fotel szukany - inaczej to zwykła rezerwacja', () => {
    expect(refuseSeats({ pic: 'self', dual: 'none' }, PLAIN)).toBe('no_seat_sought');
    expect(refuseSeats({ pic: 'sought', dual: 'none' }, PLAIN)).toBeNull();
  });

  it('„ja" w obu fotelach to ten sam przypadek - żaden fotel nie szuka', () => {
    expect(refuseSeats({ pic: 'self', dual: 'self' }, PLAIN)).toBe('no_seat_sought');
    expect(refuseSeats({ pic: 'self', dual: 'sought' }, PLAIN)).toBeNull();
  });

  it('„brak" drugiego pilota odbija na maszynie z wymogiem załogi 2-os.', () => {
    expect(refuseSeats({ pic: 'sought', dual: 'none' }, TWO_CREW)).toBe('dual_required');
    expect(refuseSeats({ pic: 'sought', dual: 'sought' }, TWO_CREW)).toBeNull();
    // Instruktor → uczeń na An-2: dowódca „ja", uczeń w prawym fotelu - przechodzi.
    expect(refuseSeats({ pic: 'self', dual: 'sought' }, TWO_CREW)).toBeNull();
  });

  it('fotele szukane w stałej kolejności: dowódca, drugi pilot', () => {
    expect(soughtSeats({ pic: 'sought', dual: 'sought' })).toEqual(['pic', 'dual']);
    expect(soughtSeats({ pic: 'self', dual: 'sought' })).toEqual(['dual']);
  });
});

describe('komplet załogi', () => {
  it('komplet = każdy SZUKANY fotel ma osobę; „ja" i „brak" się nie liczą', () => {
    const seats = { pic: 'self', dual: 'sought' } as const;
    expect(crewComplete(seats, { pic: 'AKO', dual: null })).toBe(false);
    expect(crewComplete(seats, { pic: 'AKO', dual: 'BNO' })).toBe(true);
    expect(openSeats(seats, { pic: 'AKO', dual: null })).toEqual(['dual']);
  });

  it('stan żywego zlecenia idzie za załogą, końcowy zostaje końcowym', () => {
    const seats = { pic: 'sought', dual: 'none' } as const;
    expect(statusFor('open', seats, { pic: 'BNO', dual: null })).toBe('filled');
    expect(statusFor('filled', seats, { pic: null, dual: null })).toBe('open');
    expect(statusFor('cancelled', seats, { pic: 'BNO', dual: null })).toBe('cancelled');
    expect(statusFor('expired', seats, { pic: null, dual: null })).toBe('expired');
  });
});

describe('przestawienie fotela (§5.2)', () => {
  it('fotel na „brak" zdejmuje osobę, która go zajmowała', () => {
    const { crew, lost } = crewForSeats(
      { seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'JWR', dual: 'BNO' } },
      { pic: 'sought', dual: 'none' },
      'AKO',
    );
    expect(crew).toEqual({ pic: 'JWR', dual: null });
    expect(lost).toEqual([{ seat: 'dual', pilotId: 'BNO' }]);
  });

  it('fotel na „ja" sadza zlecającego i zdejmuje przydzielonego', () => {
    const { crew, lost } = crewForSeats(
      { seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'JWR', dual: null } },
      { pic: 'self', dual: 'sought' },
      'AKO',
    );
    expect(crew).toEqual({ pic: 'AKO', dual: null });
    expect(lost).toEqual([{ seat: 'pic', pilotId: 'JWR' }]);
  });

  it('fotel z „ja" na szukany: zlecający wstaje, fotel wraca do szukania - bez wiadomości do niego', () => {
    const { crew, lost } = crewForSeats(
      { seats: { pic: 'self', dual: 'sought' }, crew: { pic: 'AKO', dual: 'BNO' } },
      { pic: 'sought', dual: 'sought' },
      'AKO',
    );
    expect(crew).toEqual({ pic: null, dual: 'BNO' });
    expect(lost).toEqual([]);
  });

  it('fotel bez zmiany stanu zostaje z tą samą osobą', () => {
    const { crew, lost } = crewForSeats(
      { seats: { pic: 'sought', dual: 'sought' }, crew: { pic: 'JWR', dual: 'BNO' } },
      { pic: 'sought', dual: 'sought' },
      'AKO',
    );
    expect(crew).toEqual({ pic: 'JWR', dual: 'BNO' });
    expect(lost).toEqual([]);
  });
});
