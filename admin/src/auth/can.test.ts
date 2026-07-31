/**
 * UZ Aero — panel: brama widoczności pozycji nawigacji (moduł czysty).
 *
 * Testujemy DECYZJĘ, nie wygląd: czy pozycja jest klikalna i czy odmowa niesie powód.
 * Renderowania drzew nie ruszamy — specyfikacją wyglądu jest mockup.
 */

import { describe, expect, it } from 'vitest';

import type { Capability } from '../api/dto';
import { can, denialReason } from './can';

const TRAINING_LEAD: Capability[] = ['panel.access', 'flags.resolve'];
const ADMIN: Capability[] = [
  'panel.access',
  'flags.resolve',
  'events.correct',
  'accounts.manage',
  'fleet.manage',
  'thresholds.manage',
  'audit.read',
];

describe('can', () => {
  it('szef wyszkolenia rozstrzyga flagi, ale nie wchodzi w konta ani progi', () => {
    expect(can(TRAINING_LEAD, 'flags.resolve')).toBe(true);
    expect(can(TRAINING_LEAD, 'accounts.manage')).toBe(false);
    expect(can(TRAINING_LEAD, 'thresholds.manage')).toBe(false);
    expect(can(TRAINING_LEAD, 'audit.read')).toBe(false);
  });

  it('administrator przechodzi wszędzie', () => {
    for (const capability of ADMIN) expect(can(ADMIN, capability)).toBe(true);
  });

  it('BRAK listy zdolności zamyka wszystko — niewiedza nie otwiera', () => {
    // Stan przejściowy (sesja jeszcze się ładuje) nie może na ułamek sekundy
    // pokazać pełnej nawigacji, bo migotanie uprawnień wygląda jak awaria.
    expect(can(undefined, 'panel.access')).toBe(false);
    expect(can([], 'flags.resolve')).toBe(false);
  });
});

describe('denialReason', () => {
  it('mówi, KOGO prosić — a nie tylko, że się nie da', () => {
    expect(denialReason('thresholds.manage')).toBe('Wymaga roli: administrator');
    expect(denialReason('flags.resolve')).toBe('Wymaga roli: administrator lub szef wyszkolenia');
  });

  it('każda zdolność ma powód (kontrola kompletności mapy)', () => {
    // Bez tego dopisanie zdolności dałoby `Wymaga roli: undefined` na ekranie,
    // i to dopiero u kogoś, kto akurat tej roli nie ma.
    for (const capability of ADMIN) {
      expect(denialReason(capability)).toMatch(/^Wymaga roli: \S/);
    }
  });
});
