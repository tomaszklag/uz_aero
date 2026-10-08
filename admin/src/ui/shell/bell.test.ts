import { describe, expect, it } from 'vitest';

import { bellLabel } from './bell';

describe('etykieta dzwonka', () => {
  it('bez nowych - sama nazwa; z nowymi - liczba z odmianą', () => {
    expect(bellLabel(null)).toBe('Powiadomienia');
    expect(bellLabel(0)).toBe('Powiadomienia');
    expect(bellLabel(1)).toBe('Powiadomienia - 1 nowa');
    expect(bellLabel(3)).toBe('Powiadomienia - 3 nowe');
    expect(bellLabel(5)).toBe('Powiadomienia - 5 nowych');
  });
});
