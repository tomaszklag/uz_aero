/**
 * UZ Aero (serwer) - kod klubu (`domain/clubCode.ts`): zapis kontra treść.
 */

import { describe, expect, it } from 'vitest';

import {
  CLUB_CODE_ALPHABET,
  CLUB_CODE_LENGTH,
  formatClubCode,
  normalizeClubCode,
} from '../src/domain/clubCode.ts';

describe('kod klubu', () => {
  it('alfabet ma 32 symbole bez O, I, 0 i 1 - par, które myli się w druku i w mowie', () => {
    expect(CLUB_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CLUB_CODE_ALPHABET).size).toBe(32);
    for (const confusable of ['O', 'I', '0', '1']) {
      expect(CLUB_CODE_ALPHABET).not.toContain(confusable);
    }
    expect(CLUB_CODE_LENGTH).toBe(7);
  });

  it.each([
    ['AZG-7K4M', 'AZG7K4M'],
    ['azg7k4m', 'AZG7K4M'],
    ['  azg - 7k4m ', 'AZG7K4M'],
    ['AZG7K4M', 'AZG7K4M'],
  ])('„%s" → %s: myślnik, spacje i wielkość liter są zapisem', (typed, normalized) => {
    expect(normalizeClubCode(typed)).toBe(normalized);
  });

  it.each(['', 'AZG7K4', 'AZG7K4MM', 'AZG-7K0M', 'AZG-7KIM', 'AZG-7K4Ó', 'AZG_7K4M'])(
    '„%s" nie jest kodem klubu',
    (typed) => {
      expect(normalizeClubCode(typed)).toBeNull();
    },
  );

  it('zapis kanoniczny to XXX-XXXX', () => {
    expect(formatClubCode('AZG7K4M')).toBe('AZG-7K4M');
    expect(normalizeClubCode(formatClubCode('AZG7K4M'))).toBe('AZG7K4M');
  });
});
