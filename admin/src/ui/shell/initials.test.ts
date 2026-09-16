import { describe, expect, it } from 'vitest';

import { initials } from './initials';

describe('initials', () => {
  it('bierze pierwsze litery imienia i nazwiska, wersalikami', () => {
    expect(initials('Tomasz Małkiewicz')).toBe('TM');
    expect(initials('anna kowal')).toBe('AK');
  });

  it('przy jednym słowie daje jedną literę, przy trzech - dwie pierwsze', () => {
    expect(initials('Anna')).toBe('A');
    expect(initials('Jan Maria Rokita')).toBe('JM');
  });

  it('polskie znaki zostają polskimi znakami', () => {
    expect(initials('Łukasz Żak')).toBe('ŁŻ');
  });

  it('nadmiarowe spacje i pusty napis nie wywracają rachunku', () => {
    expect(initials('  Ewa   Dąbek ')).toBe('ED');
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });
});
