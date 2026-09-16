import {
  litres as litresShared,
  motoHours as motoHoursShared,
  oilLitres as oilLitresShared,
  timeUtc as timeUtcShared,
} from '@ninerdeck/format';
import { describe, expect, it } from 'vitest';

import { litres, motoHours, NONE, oilLitres, timeUtc } from './values';

describe('kreska braku panelu', () => {
  it('brak odczytu to PÓŁPAUZA - kreska makiet panelu', () => {
    expect(litres(null)).toBe(NONE);
    expect(oilLitres(null)).toBe(NONE);
    expect(motoHours(null, 'hhmm')).toBe(NONE);
    expect(timeUtc(null)).toBe(NONE);
  });

  it('wspólne formatery nadal oddają dywiz - kreskę TELEFONU', () => {
    // Gdyby ktoś „naprawił" to w `@ninerdeck/format`, zmieniłby zapis w aplikacji pilota,
    // której makiety piszą brak dywizem. Ten test broni tamtej strony.
    expect(litresShared(null)).toBe('-');
    expect(oilLitresShared(null)).toBe('-');
    expect(motoHoursShared(null, 'hhmm')).toBe('-');
    expect(timeUtcShared(null)).toBe('-');
  });

  it('wartość przechodzi bez zmian - podmieniamy sam brak', () => {
    expect(litres(108)).toBe('108 L');
    expect(oilLitres(9.2)).toBe('9,2 L');
    expect(motoHours(1234.5, 'hhmm')).toBe('1234:30');
    expect(timeUtc(Date.UTC(2026, 8, 6, 8, 42))).toBe('08:42');
  });

  it('ZERO zostaje zerem - pusty zbiornik to odczyt, nie brak', () => {
    expect(litres(0)).toBe('0 L');
    expect(motoHours(0, 'decimal')).toBe('0.0');
  });
});
