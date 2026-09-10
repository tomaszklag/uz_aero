/**
 * Ninerdeck (serwer) - kod klubu (`domain/clubCode.ts`): zapis kontra treść.
 */

import { describe, expect, it } from 'vitest';

import {
  CLUB_CODE_ALPHABET,
  CLUB_CODE_LENGTH,
  clubCodeFrom,
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

describe('losowanie kodu (issue #100, D2)', () => {
  it('bierze SIEDEM pierwszych bajtów i mapuje je resztą z dzielenia przez 32', () => {
    // Wynik jest policzalny ręką i taki ma być: generator losowości jest na zewnątrz,
    // więc ta funkcja jest czysta i daje się przybić co do znaku.
    expect(clubCodeFrom(Uint8Array.from([0, 1, 2, 31, 32, 33, 255, 7]))).toBe('ABC9AB9');
    expect(normalizeClubCode(clubCodeFrom(Uint8Array.from([0, 0, 0, 0, 0, 0, 0])))).toBe('AAAAAAA');
  });

  it('KAŻDY bajt daje znak z alfabetu - 256 / 32 = 8, więc nie ma obciążenia', () => {
    // Gdyby alfabet miał inną liczność, reszta z dzielenia faworyzowałaby początek
    // alfabetu - a wtedy kod trzeba by losować w pętli z odrzucaniem.
    const counts = new Map<string, number>();
    for (let byte = 0; byte < 256; byte += 1) {
      const code = clubCodeFrom(Uint8Array.from(Array(CLUB_CODE_LENGTH).fill(byte)));
      expect(new Set(code).size).toBe(1);
      const char = code[0]!;
      expect(CLUB_CODE_ALPHABET).toContain(char);
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    expect([...counts.values()]).toEqual(Array(32).fill(8));
  });

  it('za mało bajtów to awaria, nie kod krótszy o znak', () => {
    expect(() => clubCodeFrom(Uint8Array.from([1, 2, 3]))).toThrow(/7 bajtów/);
  });
});
