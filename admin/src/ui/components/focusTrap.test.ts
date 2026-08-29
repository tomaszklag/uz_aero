/**
 * UZ Aero - panel: reguła pułapki fokusu w szufladzie.
 *
 * Jedna własność: **fokus nie wychodzi z warstwy modalnej klawiszem `Tab`.** Przed
 * 2026-08-01 `Tab` z ostatniego pola szuflady schodził do tabeli pod przesłoną -
 * czyli `aria-modal="true"` mówiło nieprawdę.
 */

import { describe, expect, it } from 'vitest';

import { trapTarget } from './focusTrap';

describe('pułapka fokusu', () => {
  it('w środku pułapki NIE ingerujemy - przeglądarka radzi sobie lepiej', () => {
    // Kolejność `tabindex`, elementy ukryte, shadow DOM: własna arytmetyka pomyliłaby
    // się tam, gdzie natywne zachowanie jest poprawne. Reguła dotyczy krawędzi.
    expect(trapTarget(5, 1, false)).toBeNull();
    expect(trapTarget(5, 3, true)).toBeNull();
  });

  it('`Tab` z OSTATNIEGO elementu zawija na pierwszy, zamiast wyjść do tabeli', () => {
    expect(trapTarget(5, 4, false)).toBe(0);
  });

  it('`Shift+Tab` z PIERWSZEGO zawija na ostatni, zamiast wyjść na przesłonę', () => {
    expect(trapTarget(5, 0, true)).toBe(4);
  });

  it('fokus na samym panelu (stan po otwarciu) wchodzi w pułapkę w obie strony', () => {
    expect(trapTarget(5, -1, false)).toBe(0);
    expect(trapTarget(5, -1, true)).toBe(4);
  });

  it('jeden element skupialny zawija sam na siebie', () => {
    expect(trapTarget(1, 0, false)).toBe(0);
    expect(trapTarget(1, 0, true)).toBe(0);
  });

  it('pusta pułapka nie oddaje indeksu, pod którym nic nie stoi', () => {
    expect(trapTarget(0, -1, false)).toBeNull();
    expect(trapTarget(0, 0, true)).toBeNull();
  });
});
