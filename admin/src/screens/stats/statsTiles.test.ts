/**
 * UZ Aero - panel: kafle statystyk.
 *
 * Dwie własności konstytucji ekranu: liczby są PRZEPISANE z odpowiedzi (nie liczone
 * tutaj), a `null` z serwera - z każdego powodu - zostaje kreską z wyjaśnieniem.
 */

import { describe, expect, it } from 'vitest';

import type { StatsReportDto } from '../../api/dto';
import { statsFixture } from '../../../test/fixtures/stats';
import { statsTiles } from './statsTiles';

const tile = (data: StatsReportDto | null, key: string) => {
  const found = statsTiles(data).find((t) => t.key === key);
  if (found == null) throw new Error(`brak kafla ${key}`);
  return found;
};

describe('statsTiles - dane kompletne (scenariusz mockupu)', () => {
  const data = statsFixture();

  it('sześć kafli mockupu w jego kolejności i z jego liczbami', () => {
    expect(statsTiles(data).map((t) => t.key)).toEqual([
      'block',
      'flight',
      'takeoffs',
      'fuel',
      'mh',
      'days',
    ]);
    expect(tile(data, 'block')).toMatchObject({ value: '186:39', tone: 'green' });
    expect(tile(data, 'flight').value).toBe('133:45');
    expect(tile(data, 'takeoffs')).toMatchObject({ value: '356', unit: '/ 356' });
    expect(tile(data, 'fuel')).toMatchObject({ value: '21 436', unit: 'L', tone: 'amber' });
    expect(tile(data, 'mh')).toMatchObject({ value: '186.3', unit: 'h' });
    expect(tile(data, 'days')).toMatchObject({ value: '53', tone: 'blue' });
  });

  it('przypisy niosą ilorazy SERWERA: procent bloku i rozjazd Δ MH', () => {
    expect(tile(data, 'flight').note).toContain('71,7 % nalotu blokowego');
    expect(tile(data, 'mh').note).toBe(
      'Δ liczników fizycznych · blok 186.65 h - rozjazd 0.35 h.',
    );
    expect(tile(data, 'days').note).toBe('3 samoloty · 5 pilotów · 30 dni kalendarzowych.');
  });

  it('niedomknięty bilans startów świeci bursztynem i mówi obie liczby', () => {
    const data = statsFixture();
    data.totals.takeoffs = 356;
    data.totals.landings = 355;
    expect(tile(data, 'takeoffs')).toMatchObject({ tone: 'amber' });
    expect(tile(data, 'takeoffs').note).toContain('NIEDOMKNIĘTY');
    expect(tile(data, 'takeoffs').note).toContain('355');
  });

  it('dni bez bilansu paliwa są POLICZONE w przypisie, a nie przemilczane', () => {
    const data = statsFixture();
    data.totals.fuelUnknownSessions = 2;
    expect(tile(data, 'fuel').note).toContain('2 dni bez bilansu');
  });

  it('kafel MH: blok z dni Z PARĄ ODCZYTÓW i adnotacja o dniach poza porównaniem', () => {
    const data = statsFixture();
    // Dwa dni bez pary odczytów: mianownik rozjazdu pochodzi z TEGO SAMEGO zbioru
    // dni co suma Δ - pełny blok pisałby „rozjazd 20 h", gdy naprawdę brakuje odczytów.
    data.totals.mhUnknownSessions = 2;
    data.totals.mhBlockHours = 120.5;
    data.totals.mhVsBlockH = 0.4;
    const note = tile(data, 'mh').note;
    expect(note).toContain('blok 120.50 h');
    expect(note).toContain('2 dni bez pary odczytów');
  });
});

describe('statsTiles - `null` to „nie wiemy", nigdy zero', () => {
  it('bez odpowiedzi wszystkie kafle mówią „-" bez tonu', () => {
    for (const t of statsTiles(null)) {
      expect(t.value).toBe('-');
      expect(t.tone).toBeUndefined();
      expect(t.note).toBe('Nie wiadomo - raport się nie pobrał.');
    }
  });

  it('wiersze sprzed kolumn statystyk: kreski + przypis kierujący na przebudowę', () => {
    const data = statsFixture();
    data.totals.staleRows = 3;
    data.totals.takeoffs = null;
    data.totals.landings = null;
    data.totals.fuelConsumedL = null;
    data.totals.mhDeltaH = null;
    data.totals.mhVsBlockH = null;

    expect(tile(data, 'takeoffs').value).toBe('-');
    expect(tile(data, 'takeoffs').note).toContain('kolumn statystyk');
    expect(tile(data, 'fuel').value).toBe('-');
    expect(tile(data, 'fuel').unit).toBeUndefined();
    expect(tile(data, 'mh').value).toBe('-');
    // Stare kolumny projekcji (blok, lot, dni) zostają liczbami - migracja ich nie ruszała.
    expect(tile(data, 'block').value).toBe('186:39');
  });
});
