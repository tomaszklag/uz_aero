/**
 * UZ Aero — panel: „blok vs czas lotu" i „wykorzystanie floty" — geometria pasków.
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { duoRows, meterRows } from './statsCompare';

describe('duoRows', () => {
  it('największy blok wypełnia 100 %, reszta skaluje się do NIEGO (jedna skala)', () => {
    const rows = duoRows(statsFixture().aircraft);
    expect(rows[0]).toMatchObject({
      name: 'SP-KLM',
      blockWidth: '100.0%',
      blockLabel: '112:38',
      flightLabel: '71:24',
    });
    // 71:24 / 112:38 — lot na TEJ SAMEJ skali co blok, nie na własnej.
    expect(rows[0]!.flightWidth).toBe('63.4%');
    expect(rows[1]!.blockWidth).toBe('41.0%');
  });

  it('pusta flota = puste wiersze, bez dzielenia przez zero', () => {
    expect(duoRows([])).toEqual([]);
  });
});

describe('meterRows', () => {
  it('wykorzystanie z serwera: etykieta `dni · procent`, bursztyn poniżej połowy', () => {
    const rows = meterRows(statsFixture().aircraft);
    expect(rows[0]).toMatchObject({ name: 'SP-KLM', label: '21 · 70 %', amber: false });
    // 46.7 % — jednostka stoi częściej, niż lata; mockup barwi ten wiersz bursztynem.
    expect(rows[2]).toMatchObject({ name: 'SP-XYZ', label: '14 · 47 %', amber: true });
  });

  it('`null` z serwera zostaje kreską — nie zerem procent', () => {
    const aircraft = statsFixture().aircraft;
    aircraft[0]!.utilizationPct = null;
    const rows = meterRows(aircraft);
    expect(rows[0]).toMatchObject({ label: '—', width: '0%', amber: false });
  });
});
