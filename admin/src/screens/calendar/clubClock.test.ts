/**
 * Ninerdeck - panel: czas klubu ↔ chwila (issue #233).
 *
 * Pod obserwacją: godzina wpisana „w czasie klubu" ląduje w tej samej godzinie klubu,
 * gdziekolwiek siedzi przeglądarka - także w dobie zmiany czasu, która ma dwa offsety.
 */

import { describe, expect, it } from 'vitest';

import { clubInstant, clubNoon, clubParts, clubToday } from './clubClock';

const WAW = 'Europe/Warsaw';

describe('czas klubu', () => {
  it('lato (UTC+2) i zima (UTC+1) - ta sama godzina klubu, inna chwila', () => {
    expect(clubInstant('2026-07-15', '11:00', WAW)).toBe(Date.UTC(2026, 6, 15, 9, 0));
    expect(clubInstant('2026-12-15', '11:00', WAW)).toBe(Date.UTC(2026, 11, 15, 10, 0));
  });

  it('doba ZMIANY CZASU: rano jeszcze zima, po południu już lato', () => {
    // 29 marca 2026 o 02:00 zegary skaczą na 03:00.
    expect(clubInstant('2026-03-29', '01:30', WAW)).toBe(Date.UTC(2026, 2, 29, 0, 30));
    expect(clubInstant('2026-03-29', '15:00', WAW)).toBe(Date.UTC(2026, 2, 29, 13, 0));
    // 02:30 tej nocy nie istnieje - odmowa, nie cicha godzina obok.
    expect(clubInstant('2026-03-29', '02:30', WAW)).toBeNull();
  });

  it('zapis nieczytelny to `null`, nie `NaN`', () => {
    expect(clubInstant('', '11:00', WAW)).toBeNull();
    expect(clubInstant('2026-07-15', '', WAW)).toBeNull();
    expect(clubInstant('2026-07-15', '25:00', WAW)).toBeNull();
  });

  it('w drugą stronę: doba i godzina klubu z chwili, także tuż przed północą UTC', () => {
    expect(clubParts(Date.UTC(2026, 6, 15, 22, 30), WAW)).toEqual({ date: '2026-07-16', hhmm: '00:30' });
    expect(clubToday(Date.UTC(2026, 6, 15, 21, 59), WAW)).toBe('2026-07-15');
    expect(clubNoon('2026-07-15', WAW)).toBe(Date.UTC(2026, 6, 15, 10, 0));
  });
});
