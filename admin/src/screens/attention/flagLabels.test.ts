/**
 * Ninerdeck - panel 3.2: słownik rozjazdów - podpisy z liczb ingestu, zdania o czynności,
 * podpis przy wierszu poziomu 2.
 */

import { describe, expect, it } from 'vitest';

import type { FlagDto, FlagSessionDto } from '../../api/dto';
import {
  flagAdvice,
  flagFacts,
  flagIssue,
  flagLabel,
  flagSlug,
  flagSubtitle,
  flagTypeOfSlug,
  FLAG_TYPES_ORDER,
  rowFlagNote,
  secondsLabel,
} from './flagLabels';

const DAY = Date.UTC(2026, 8, 1);
const at = (h: number, m: number, day = 0): number => DAY + day * 86_400_000 + (h * 60 + m) * 60_000;

const session = (patch: Partial<FlagSessionDto>): FlagSessionDto => ({
  sessionUuid: 's',
  signature: 'SP-AXA/2026-09-01/AKO/1',
  aircraftId: 'SP-AXA',
  reg: 'SP-AXA',
  picId: 'AKO',
  picCode: 'AKO',
  picName: 'Adam Kowalski',
  status: 'closed',
  claimedAt: at(9, 14),
  closeTime: at(11, 12),
  tab: '2026-09-01_SP-AXA',
  ...patch,
});

const flag = (patch: Partial<FlagDto>): FlagDto => ({
  id: 1052,
  type: 'fuel_mismatch',
  status: 'open',
  aircraftId: 'SP-AXA',
  reg: 'SP-AXA',
  aircraftType: 'Cessna 182',
  mhFormat: 'hhmm',
  sessionUuids: ['a', 'b'],
  sessions: [
    session({ sessionUuid: 'a', closeTime: at(11, 12) }),
    session({ sessionUuid: 'b', signature: 'SP-AXA/2026-09-02/AKW/1', picName: 'Anna Kowal', claimedAt: at(9, 14, 1), closeTime: null, status: 'active' }),
  ],
  details: {},
  createdAt: '2026-09-02T10:41:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  blocksExport: false,
  ...patch,
});

describe('nazwy i slugi', () => {
  it('każdy rodzaj ma nazwę po polsku, slug w adresie i wraca ze sluga', () => {
    for (const type of FLAG_TYPES_ORDER) {
      expect(flagLabel(type)).not.toMatch(/_/);
      expect(flagTypeOfSlug(flagSlug(type))).toBe(type);
    }
    expect(flagTypeOfSlug(null)).toBeNull();
    expect(flagTypeOfSlug('mh_gap')).toBeNull();
  });

  it('kody serwera nie wychodzą w zdaniach o czynności', () => {
    for (const type of FLAG_TYPES_ORDER) {
      expect(flagAdvice(flag({ type }))).not.toMatch(/mh_gap|overlap|mismatch|drift/);
    }
  });
});

describe('podpis z liczbami', () => {
  it('rozjazd paliwa: odczyt, przekazanie, różnica ze znakiem i tolerancja', () => {
    const text = flagSubtitle(flag({ details: { diffL: 56, handoverL: 92, readingL: 148, toleranceL: 10 } }));
    expect(text).toBe('odczyt 148 L, przekazanie 92 L · +56 L przy tolerancji 10 L');
  });

  it('luka i cofnięty licznik formatują odczyty wg formatu licznika maszyny', () => {
    expect(flagSubtitle(flag({ type: 'mh_gap', details: { gapH: 0.8, prevEnd: 1238.87, nextStart: 1239.67 } }))).toBe(
      'zdanie 1238:52, przejęcie 1239:40 · +0,8 h',
    );
    expect(
      flagSubtitle(flag({ type: 'mh_regression', mhFormat: 'decimal', details: { regressionH: 0.4, prevEnd: 1238.9, nextStart: 1238.5 } })),
    ).toBe('przejęcie 1238.5 niższe niż zdanie 1238.9 · −0,4 h');
  });

  it('rozjazd zegara mówi sekundami i nazywa zapis po polsku', () => {
    const text = flagSubtitle(
      flag({ type: 'clock_drift', details: { maxDriftSec: 372, thresholdMs: 120_000, eventType: 'landing' } }),
    );
    expect(text).toBe('zegar telefonu 6 min 12 s od GPS przy zapisie „lądowanie" · próg 2 min');
    expect(secondsLabel(45)).toBe('45 s');
    expect(secondsLabel(120)).toBe('2 min');
  });

  it('pilot w dwóch maszynach liczy wspólny czas z chwil obu operacji', () => {
    const text = flagSubtitle(
      flag({
        type: 'pilot_overlap',
        sessions: [
          session({ reg: 'SP-AXA', claimedAt: at(9, 20), closeTime: at(10, 34) }),
          session({ reg: 'SP-TWG', aircraftId: 'SP-TWG', claimedAt: at(10, 0), closeTime: at(11, 30) }),
        ],
      }),
    );
    expect(text).toBe('operacje 09:20–10:34 (SP-AXA) i 10:00–11:30 (SP-TWG) nakładają się o 34 min');
  });

  it('brak liczby w szczegółach daje podpis bez niej, nie „undefined"', () => {
    expect(flagSubtitle(flag({ details: {} }))).toBe('odczyt —, przekazanie —');
    expect(flagSubtitle(flag({ type: 'clock_drift', details: {} }))).toBe('zegar telefonu rozjechany z GPS');
  });
});

describe('karta „Co się nie zgadza"', () => {
  it('rozjazd paliwa: przekazanie ze stemplem zdania, odczyt ze stemplem przejęcia, różnica bursztynem', () => {
    const facts = flagFacts(flag({ details: { diffL: 56, handoverL: 92, readingL: 148, toleranceL: 10 } }));
    expect(facts.map((f) => f.label)).toEqual([
      'Przekazanie · zdanie · 1 WRZ 11:12',
      'Odczyt przy przejęciu · 2 WRZ 09:14',
      'Różnica',
      'Tolerancja',
    ]);
    expect(facts[2]).toEqual({ label: 'Różnica', value: '+56 L', tone: 'amber' });
  });

  it('nakładka nazywa obie operacje pilotem i mówi, która trwa', () => {
    const facts = flagFacts(flag({ type: 'aircraft_overlap', details: { openSessions: 2 } }));
    expect(facts[0]!.label).toBe('SP-AXA/2026-09-01/AKO/1 · A. Kowalski');
    expect(facts[1]).toMatchObject({ label: 'SP-AXA/2026-09-02/AKW/1 · A. Kowal', tone: 'amber' });
    expect(facts[1]!.value).toMatch(/^trwa od /);
  });

  it('baner przy operacji: nagłówek nazywa rozjazd z liczbami, treść mówi co zrobić', () => {
    const issue = flagIssue(flag({ details: { diffL: 56, handoverL: 92, readingL: 148, toleranceL: 10 } }));
    expect(issue.headline).toBe('Rozjazd paliwa: odczyt 148 L, przekazanie 92 L · +56 L przy tolerancji 10 L.');
    expect(issue.body).toContain('dopisz tankowanie');
  });
});

describe('podpis przy wierszu poziomu 2', () => {
  const fuel = { id: 1, type: 'fuel_mismatch' as const, details: { handoverL: 92, readingL: 148 } };
  const gap = { id: 2, type: 'mh_gap' as const, details: { prevEnd: 1238.87, nextStart: 1239.67 } };

  it('operacja, która PRZEJĘŁA, dostaje „przekazano"; ta, która ODDAŁA - odczyt następnej', () => {
    expect(rowFlagNote(fuel, { fuelStartL: 148, mhStart: null, mhFormat: 'hhmm' })).toEqual({ column: 'fuel', text: 'przekazano 92 L' });
    expect(rowFlagNote(fuel, { fuelStartL: 60, mhStart: null, mhFormat: 'hhmm' })).toEqual({
      column: 'fuel',
      text: 'następna operacja odczytała 148 L',
    });
  });

  it('licznik podpisuje kolumnę motogodzin w formacie maszyny', () => {
    expect(rowFlagNote(gap, { fuelStartL: null, mhStart: 1239.67, mhFormat: 'hhmm' })).toEqual({ column: 'moto', text: 'zdanie 1238:52' });
    expect(rowFlagNote(gap, { fuelStartL: null, mhStart: 1236, mhFormat: 'hhmm' })).toEqual({
      column: 'moto',
      text: 'następne przejęcie 1239:40',
    });
  });

  it('nakładki i zegar nie podpisują żadnej pary odczytów', () => {
    expect(rowFlagNote({ id: 3, type: 'aircraft_overlap', details: {} }, { fuelStartL: 1, mhStart: 1, mhFormat: null })).toBeNull();
    expect(rowFlagNote({ id: 4, type: 'clock_drift', details: {} }, { fuelStartL: 1, mhStart: 1, mhFormat: null })).toBeNull();
  });
});
