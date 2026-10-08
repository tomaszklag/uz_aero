/**
 * Powód wyłączenia z użytku - serwer zna trzy kody, a ekran ma mówić po polsku.
 * Do 4.0.0 pasek kalendarza i odmowa rezerwacji pisały kod wprost („maintenance").
 */

import { blockReasonLabel, blockReasonSuffix, blockReasonTitle } from '../ui/screens/logic/blockReason';

describe('powód wyłączenia z użytku', () => {
  it('w środku zdania - małą literą', () => {
    expect(blockReasonLabel('maintenance')).toBe('przegląd');
    expect(blockReasonLabel('defect')).toBe('usterka');
    expect(blockReasonLabel(null)).toBe('wyłączona');
  });

  it('jako napis samodzielny - z wielkiej, bez powodu nazwa stanu', () => {
    expect(blockReasonTitle('maintenance')).toBe('Przegląd');
    expect(blockReasonTitle('defect')).toBe('Usterka');
    expect(blockReasonTitle('other')).toBe('Wyłączony z użytku');
    expect(blockReasonTitle(null)).toBe('Wyłączony z użytku');
  });

  it('dopisek po zdaniu o wyłączeniu - bez powtarzania „wyłączona"', () => {
    expect(blockReasonSuffix('maintenance')).toBe(' · przegląd');
    expect(blockReasonSuffix('other')).toBe('');
    expect(blockReasonSuffix(null)).toBe('');
  });

  it('kod nieznany (nowszy serwer) zostaje, jak przyszedł', () => {
    expect(blockReasonTitle('inspection')).toBe('Inspection');
    expect(blockReasonLabel('inspection')).toBe('inspection');
  });
});
