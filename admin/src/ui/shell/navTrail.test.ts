/**
 * UZ Aero - panel: okruszki wyprowadzone z kanonicznej nawigacji (moduł czysty).
 */

import { describe, expect, it } from 'vitest';

import { NAV_GROUPS } from './navItems';
import { trailFor } from './navTrail';

describe('trailFor', () => {
  it('trafia w pozycję nawigacji i używa JEJ etykiety', () => {
    expect(trailFor('/dni')).toEqual(['Panel', 'Dni lotne']);
    expect(trailFor('/progi')).toEqual(['Panel', 'Progi i ustawienia']);
  });

  it('ścieżka w głąb należy do swojej sekcji (deep link do dnia)', () => {
    expect(trailFor('/dni/2f6c-…')).toEqual(['Panel', 'Dni lotne']);
  });

  it('adres spoza nawigacji nie dostaje zmyślonego tytułu', () => {
    expect(trailFor('/nie-ma-takiej')).toEqual(['Panel']);
    expect(trailFor('/')).toEqual(['Panel']);
  });

  it('prefiks nie połyka dłuższej nazwy - granicą jest `/`', () => {
    expect(trailFor('/dniowka')).toEqual(['Panel']);
  });

  it('KAŻDA pozycja nawigacji ma okruszek (kontrola kompletności)', () => {
    // Bez tego test przechodziłby przy nawigacji obciętej do jednej pozycji.
    const items = NAV_GROUPS.flatMap((group) => group.items);
    expect(items).toHaveLength(11);
    for (const item of items) {
      expect(trailFor(item.to)).toEqual(['Panel', item.label]);
    }
  });
});
