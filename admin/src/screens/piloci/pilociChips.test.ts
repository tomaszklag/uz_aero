/**
 * UZ Aero — panel: chipy filtra listy kont (`A06`).
 *
 * Jedna własność, dla której ten moduł istnieje: **liczba na chipie jest liczbą
 * wierszy, które zobaczysz po kliknięciu** — a nie liczbą z kafla. Chip biorący
 * liczbę „po całym klubie" kłamie przy każdym wyszukiwaniu.
 */

import { describe, expect, it } from 'vitest';

import type { PilotScopeCountsDto } from '../../api/dto';
import { pilotChips } from './pilociChips';

const scopes: PilotScopeCountsDto = { total: 10, active: 8, inactive: 2, panel: 2 };

describe('chipy filtra kont', () => {
  it('cztery chipy z mockupu, w kolejności od najszerszego zawężenia', () => {
    expect(pilotChips(scopes).map((c) => [c.scope, c.label, c.count])).toEqual([
      ['all', 'Wszyscy', 10],
      ['active', 'Aktywni', 8],
      ['inactive', 'Nieaktywni', 2],
      ['panel', 'Z rolą panelu', 2],
    ]);
  });

  it('liczby idą z `scopes` (zawężonych wyszukiwaniem), nie z liczników klubu', () => {
    // Scenariusz z przeglądu: administrator wpisał frazę, tabela ma jeden wiersz.
    // Chip „Nieaktywni" musi wtedy pokazać zero, a nie dwa konta z całego klubu —
    // bo po kliknięciu w niego zobaczy dokładnie zero wierszy.
    const narrowed: PilotScopeCountsDto = { total: 1, active: 1, inactive: 0, panel: 1 };
    expect(pilotChips(narrowed).map((c) => c.count)).toEqual([1, 1, 0, 1]);
  });

  it('bez odpowiedzi serwera chip NIE MA liczby — zero byłoby twierdzeniem', () => {
    for (const chip of pilotChips(null)) {
      expect(chip.count).toBeUndefined();
      expect(chip.label.length).toBeGreaterThan(0);
    }
  });
});
