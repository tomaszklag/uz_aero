/**
 * Ninerdeck - panel: walidacja formularzy kalendarza (issue #160, D4/D5).
 *
 * Granica jest jedna i przechodzi między dwoma pytaniami: **brakujące pole** widać
 * z formularza, więc przycisk gaśnie BEZ ZDANIA; **zła wartość** (koniec przed
 * początkiem, termin miniony) zdanie dostaje, bo z kontrolki tego nie widać.
 */

import { describe, expect, it } from 'vitest';

import {
  blockBlocker,
  bookingBlocker,
  emptyBlockDraft,
  emptyBookingDraft,
  toInstant,
  toLocalInput,
} from './blockForm';

const NOW = Date.parse('2026-09-15T10:00:00Z');
const local = (instant: number): string => toLocalInput(instant);
const H = 3_600_000;

describe('wyłączenie maszyny z użytku', () => {
  it('pusty formularz gaśnie BEZ ZDANIA - braki widać z kontrolek', () => {
    expect(blockBlocker(emptyBlockDraft(), NOW)).toBe('incomplete');
  });

  it('sama maszyna bez zakresu to nadal brak, nie błąd', () => {
    const draft = { ...emptyBlockDraft(), aircraftId: 'a1' };
    expect(blockBlocker(draft, NOW)).toBe('incomplete');
  });

  it('KONIEC PRZED POCZĄTKIEM dostaje zdanie - tego z kontrolki nie widać', () => {
    const draft = {
      ...emptyBlockDraft(),
      aircraftId: 'a1',
      from: local(NOW + 4 * H),
      to: local(NOW + 2 * H),
    };
    expect(blockBlocker(draft, NOW)).toEqual({ reason: 'Koniec musi być po początku.' });
  });

  it('TERMIN, KTÓRY MINĄŁ, dostaje zdanie - serwer odmówiłby tak samo', () => {
    const draft = {
      ...emptyBlockDraft(),
      aircraftId: 'a1',
      from: local(NOW - 6 * H),
      to: local(NOW - 2 * H),
    };
    expect(blockBlocker(draft, NOW)).toEqual({ reason: 'Ten termin już minął.' });
  });

  it('TERMIN, KTÓRY JUŻ SIĘ ZACZĄŁ, przechodzi - reguła stoi na jego KOŃCU', () => {
    const draft = {
      ...emptyBlockDraft(),
      aircraftId: 'a1',
      from: local(NOW - 2 * H),
      to: local(NOW + 2 * H),
    };
    expect(blockBlocker(draft, NOW)).toBeNull();
  });

  it('powód ma wartość domyślną, bo katalog jest zamknięty i trzyelementowy', () => {
    expect(emptyBlockDraft().reason).toBe('maintenance');
  });
});

describe('rezerwacja za pilota', () => {
  const pelny = () => ({
    ...emptyBookingDraft(),
    aircraftId: 'a1',
    pilotId: 'p1',
    operation: 'przelot',
    from: local(NOW + 2 * H),
    to: local(NOW + 4 * H),
  });

  it('komplet przechodzi', () => {
    expect(bookingBlocker(pelny(), NOW)).toBeNull();
  });

  it('BRAK PILOTA albo ZADANIA gaśnie bez zdania', () => {
    expect(bookingBlocker({ ...pelny(), pilotId: '' }, NOW)).toBe('incomplete');
    expect(bookingBlocker({ ...pelny(), operation: '' }, NOW)).toBe('incomplete');
  });

  it('zła wartość zakresu dostaje to samo zdanie, co przy wyłączeniu z użytku', () => {
    const wstecz = { ...pelny(), from: local(NOW + 4 * H), to: local(NOW + 2 * H) };
    expect(bookingBlocker(wstecz, NOW)).toEqual({ reason: 'Koniec musi być po początku.' });
  });
});

describe('pole `datetime-local`', () => {
  it('pusta wartość to `null`, nie `NaN`', () => {
    expect(toInstant('')).toBeNull();
    expect(toInstant('cokolwiek')).toBeNull();
  });

  it('zapis i odczyt są odwrotne co do minuty', () => {
    // Minuta, nie sekunda: pole `datetime-local` bez `step` nie ma sekund, więc
    // porównanie do sekundy pilnowałoby precyzji, której kontrolka nie ma.
    const instant = Date.parse('2026-09-15T14:37:00Z');
    const wracajaca = toInstant(toLocalInput(instant));
    expect(wracajaca).not.toBeNull();
    expect(Math.abs(wracajaca! - instant)).toBeLessThan(60_000);
  });
});
