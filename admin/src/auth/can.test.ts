/**
 * UZ Aero - panel: brama widoczności pozycji nawigacji (moduł czysty).
 *
 * Testujemy DECYZJĘ, nie wygląd: czy pozycja jest klikalna i czy odmowa niesie powód.
 * Renderowania drzew nie ruszamy - specyfikacją wyglądu jest mockup.
 */

import { describe, expect, it } from 'vitest';

import type { Capability } from '../api/dto';
import { can, denialReason } from './can';

/**
 * Lista NIEPEŁNA - dziś żadna rola takiej nie dostaje, bo po wycofaniu
 * `training_lead` (2026-08-30) do panelu wchodzi wyłącznie administrator z kompletem.
 * Przypadek zostaje pod testem, bo `can` jest funkcją od LISTY, a nie od roli: to ona
 * przyjdzie z serwera, gdy wróci rola pośrednia, i to ona ma wtedy zamykać drzwi.
 */
const LIMITED: Capability[] = ['panel.access', 'flags.resolve'];
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
  it('lista niepełna otwiera to, co w niej jest, i zamyka resztę', () => {
    expect(can(LIMITED, 'flags.resolve')).toBe(true);
    expect(can(LIMITED, 'accounts.manage')).toBe(false);
    expect(can(LIMITED, 'thresholds.manage')).toBe(false);
    expect(can(LIMITED, 'audit.read')).toBe(false);
  });

  it('administrator przechodzi wszędzie', () => {
    for (const capability of ADMIN) expect(can(ADMIN, capability)).toBe(true);
  });

  it('BRAK listy zdolności zamyka wszystko - niewiedza nie otwiera', () => {
    // Stan przejściowy (sesja jeszcze się ładuje) nie może na ułamek sekundy
    // pokazać pełnej nawigacji, bo migotanie uprawnień wygląda jak awaria.
    expect(can(undefined, 'panel.access')).toBe(false);
    expect(can([], 'flags.resolve')).toBe(false);
  });
});

describe('denialReason', () => {
  it('mówi, KOGO prosić - a nie tylko, że się nie da', () => {
    expect(denialReason('thresholds.manage')).toBe('Wymaga roli: administrator');
    expect(denialReason('flags.resolve')).toBe('Wymaga roli: administrator');
  });

  it('każda zdolność ma powód (kontrola kompletności mapy)', () => {
    // Bez tego dopisanie zdolności dałoby `Wymaga roli: undefined` na ekranie,
    // i to dopiero u kogoś, kto akurat tej roli nie ma.
    for (const capability of ADMIN) {
      expect(denialReason(capability)).toMatch(/^Wymaga roli: \S/);
    }
  });
});
