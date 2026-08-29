/**
 * UZ Aero - panel: formaty liczb statystyk.
 *
 * Najważniejsza własność jest jedna i powtarza się w każdym przypadku: `null`
 * ZAWSZE staje się kreską, nigdy zerem - zaokrąglenie nie ma prawa zamienić
 * niewiedzy w liczbę.
 */

import { describe, expect, it } from 'vitest';

import {
  comma1,
  DASH,
  dayShort,
  dayShortYear,
  dot1,
  dot2,
  feetThousands,
  litresThousands,
  pct0,
  pct1,
  thousands,
} from './statsFormat';

describe('thousands', () => {
  it('grupuje po trzy cyfry odstępem - zapis mockupu „21 436"', () => {
    expect(thousands(21436)).toBe('21 436');
    expect(thousands(962)).toBe('962');
    expect(thousands(1_234_567)).toBe('1 234 567');
    expect(thousands(1000)).toBe('1 000');
  });

  it('zaokrągla do całości i szanuje znak', () => {
    expect(thousands(12840.4)).toBe('12 840');
    expect(thousands(-1500)).toBe('-1 500');
  });

  it('`null` to kreska, nie „0"', () => {
    expect(thousands(null)).toBe(DASH);
  });
});

describe('ułamki i procenty', () => {
  it('kropka do tabel, przecinek do prozy - dokładnie jak w mockupie', () => {
    expect(dot1(170.83)).toBe('170.8');
    expect(dot2(186.65)).toBe('186.65');
    expect(comma1(71.66)).toBe('71,7');
    expect(pct0(70.2)).toBe('70 %');
    expect(pct1(60.34)).toBe('60.3 %');
  });

  it('każdy format oddaje kreskę dla `null`', () => {
    for (const format of [dot1, dot2, comma1, pct0, pct1, litresThousands, feetThousands]) {
      expect(format(null)).toBe(DASH);
    }
  });

  it('jednostki: litry i stopy z tysiącami', () => {
    expect(litresThousands(21436)).toBe('21 436 L');
    expect(feetThousands(12840)).toBe('12 840 ft');
  });
});

describe('dni', () => {
  it('podpis osi bez roku, chip zakresu z rokiem', () => {
    expect(dayShort('2026-07-01')).toBe('01 JUL');
    expect(dayShortYear('2026-07-30')).toBe('30 JUL 2026');
  });
});
