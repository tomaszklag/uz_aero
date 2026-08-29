/**
 * UZ Aero - panel: wiersze ujęcia „per operacja".
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { operationRows } from './statsOperationRows';

describe('operationRows', () => {
  const data = statsFixture();
  const rows = operationRows(data.operations, data.totals);

  it('SKOKI dostają niebieską plakietkę i niebieski pasek - strona przychodowa', () => {
    expect(rows[0]).toMatchObject({
      pill: { label: 'SKOKI', tone: 'blue' },
      sub: 'SP-KLM · 3 klientów',
      days: '21',
      block: '112:38',
      share: { width: '60.3%', blue: true, label: '60.3 %' },
    });
  });

  it('pozostałe operacje są przygaszone, a podpis niesie dane PROJEKCJI (nie lotniska)', () => {
    expect(rows[1]).toMatchObject({
      // Wartość z serwera to nadal `ferry`; plakietka mówi po polsku (issue #13).
      pill: { label: 'PRZELOT', tone: 'dim' },
      sub: 'SP-ABC · SP-XYZ',
      share: { width: '11.4%', blue: false, label: '11.4 %' },
    });
  });

  it('dni bez preflightu mają WŁASNY wiersz z wyjaśnieniem, nie znikają', () => {
    const data = statsFixture();
    data.operations.push({
      operation: null,
      sessions: 1,
      blockMs: 0,
      flightMs: 0,
      takeoffs: 0,
      landings: 0,
      fuelConsumedL: null,
      fuelUnknownSessions: 1,
      avgLitresPerBlockHour: null,
      blockSharePct: 0,
      regs: [],
      clients: 0,
      staleRows: 0,
    });
    const row = operationRows(data.operations, data.totals).find(
      (r) => r.pill.label === 'BEZ PREFLIGHTU',
    )!;
    expect(row.sub).toBe('dni bez `preflight_confirm`');
    expect(row.fuel).toBe('-');
  });

  it('RAZEM: sumy z serwera, udział jako napis „100 %" bez paska', () => {
    const total = rows[rows.length - 1]!;
    expect(total).toMatchObject({
      total: true,
      days: '53',
      block: '186:39',
      fuel: '21 436 L',
      avgLph: '-',
      share: null,
      shareText: '100 %',
    });
  });
});
