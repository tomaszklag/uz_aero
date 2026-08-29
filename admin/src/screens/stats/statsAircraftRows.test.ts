/**
 * UZ Aero - panel: wiersze ujęcia „per samolot".
 *
 * Wiersz RAZEM bierze liczby z `totals` SERWERA (nie sumuje tutaj), a trzy kolumny
 * dostają w nim kreskę ŚWIADOMIE: średnia ze średnich nie jest średnią.
 */

import { describe, expect, it } from 'vitest';

import { statsFixture } from '../../../test/fixtures/stats';
import { aircraftRows } from './statsAircraftRows';

describe('aircraftRows', () => {
  const data = statsFixture();
  const rows = aircraftRows(data.aircraft, data.totals);

  it('wiersz jednostki: liczby mockupu w formatach mockupu', () => {
    expect(rows[0]).toMatchObject({
      name: 'SP-KLM',
      sub: 'Cessna 208 Caravan · 1 250 L',
      days: '21',
      block: '112:38',
      flight: '71:24',
      takeoffsLandings: '186 / 186',
      fuel: '19 240 L',
      avgLph: '170.8',
      mhRange: '3795.4 → 3907.8',
      mhRangeSub: 'licznik dziesiętny',
      mhDelta: '112.4',
      utilization: '70 %',
    });
  });

  it('licznik hh:mm formatuje odczyty i deltę PO SWOJEMU (645:06, 27:42)', () => {
    const xyz = rows.find((row) => row.name === 'SP-XYZ')!;
    expect(xyz.mhRange).toBe('617:24 → 645:06');
    expect(xyz.mhRangeSub).toBe('licznik hh:mm');
    expect(xyz.mhDelta).toBe('27:42');
  });

  it('RAZEM: sumy z serwera; Śr. L/h, odczyty i wykorzystanie to KRESKI', () => {
    const total = rows[rows.length - 1]!;
    expect(total).toMatchObject({
      total: true,
      name: 'RAZEM',
      days: '53',
      block: '186:39',
      flight: '133:45',
      takeoffsLandings: '356 / 356',
      fuel: '21 436 L',
      avgLph: '-',
      mhRange: '-',
      // Formaty liczników bywają różne per jednostka - suma w godzinach dziesiętnych.
      mhDelta: '186.3 h',
      utilization: '-',
      blockClass: 'cell-green',
      flightClass: 'cell-blue',
      fuelClass: 'cell-amber',
    });
  });

  it('wiersz sprzed kolumn statystyk: starty/paliwo/ΔMH to kreski, nie zera', () => {
    const data = statsFixture();
    const klm = data.aircraft[0]!;
    klm.staleRows = klm.sessions;
    klm.takeoffs = null;
    klm.landings = null;
    klm.fuelConsumedL = null;
    klm.avgLitresPerBlockHour = null;
    klm.mhDeltaH = null;

    const row = aircraftRows(data.aircraft, data.totals)[0]!;
    expect(row.takeoffsLandings).toBe('-');
    expect(row.fuel).toBe('-');
    expect(row.avgLph).toBe('-');
    expect(row.mhDelta).toBe('-');
    // Stare kolumny projekcji zostają liczbami.
    expect(row.block).toBe('112:38');
  });
});
