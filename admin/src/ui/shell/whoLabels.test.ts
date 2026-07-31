/**
 * UZ Aero — panel: napisy stopki sidebara (moduł czysty).
 */

import { describe, expect, it } from 'vitest';

import { initials, roleLabel } from './whoLabels';

describe('initials', () => {
  it('dwa pierwsze człony, wielkimi — „TM" jak w mockupie', () => {
    expect(initials('Tomasz Małkiewicz')).toBe('TM');
    expect(initials('anna kowalska')).toBe('AK');
  });

  it('trzeci człon nie wchodzi — awatar ma 30 px, nie trzy litery', () => {
    expect(initials('Jan Maria Rokita')).toBe('JM');
  });

  it('jednoczłonowa nazwa daje JEDNĄ literę, nie zmyślone nazwisko', () => {
    expect(initials('Serafin')).toBe('S');
  });

  it('nadmiarowe spacje i pusta nazwa nie wywracają awatara', () => {
    expect(initials('  Tomasz   Małkiewicz  ')).toBe('TM');
    expect(initials('   ')).toBe('');
  });
});

describe('roleLabel', () => {
  it('nazwy po polsku, jak w `SZABLON.html`', () => {
    expect(roleLabel('admin')).toBe('Administrator');
    expect(roleLabel('training_lead')).toBe('Szef wyszkolenia');
    expect(roleLabel('pilot')).toBe('Pilot');
  });
});
