import { describe, expect, it } from 'vitest';

import { defaultView, orderPath, ordersPath, periodOf, threadPath, viewOf } from './orderPaths';

describe('adresy listy zleceń', () => {
  it('połowa z adresu - wyłącznie znane napisy', () => {
    expect(viewOf('do-mnie')).toBe('do-mnie');
    expect(viewOf('zlecone')).toBe('zlecone');
    expect(viewOf(null)).toBeNull();
    expect(viewOf('inne')).toBeNull();
  });

  it('okres - domyślnie nadchodzące, „minione" tylko jawnie', () => {
    expect(periodOf(null)).toBe('upcoming');
    expect(periodOf('minione')).toBe('past');
    expect(periodOf('cokolwiek')).toBe('upcoming');
  });

  it('adres niesie połowę zawsze, a okres tylko gdy nie jest domyślny', () => {
    expect(ordersPath('zlecone')).toBe('/zlecenia?widok=zlecone');
    expect(ordersPath('do-mnie', 'past')).toBe('/zlecenia?widok=do-mnie&okres=minione');
  });

  it('szuflada zlecenia nad listą zachowuje połowę i okres', () => {
    expect(orderPath('o 1', 'zlecone')).toBe('/zlecenia/o%201?widok=zlecone');
    expect(orderPath('o1', 'zlecone', 'past')).toBe('/zlecenia/o1?widok=zlecone&okres=minione');
  });

  it('rozmowa z adresatem to szuflada nad tą samą listą', () => {
    expect(threadPath('o1', 'p 2', 'do-mnie')).toBe('/zlecenia/o1/rozmowa/p%202?widok=do-mnie');
    expect(threadPath('o1', 'p2', 'zlecone', 'past')).toBe('/zlecenia/o1/rozmowa/p2?widok=zlecone&okres=minione');
  });
});

describe('pierwsza połowa przy wejściu z kolumny (pkt 36)', () => {
  it('„Do mnie", gdy coś tam czeka na odpowiedź', () => {
    expect(defaultView({ awaitingAnswer: 2, seesManaged: true })).toBe('do-mnie');
  });

  it('„Zlecone", gdy nic nie czeka, a osoba tę połowę widzi', () => {
    expect(defaultView({ awaitingAnswer: 0, seesManaged: true })).toBe('zlecone');
  });

  it('członek bez uprawnień zostaje przy „Do mnie" - drugiej połowy dla niego nie ma', () => {
    expect(defaultView({ awaitingAnswer: 0, seesManaged: false })).toBe('do-mnie');
  });
});
