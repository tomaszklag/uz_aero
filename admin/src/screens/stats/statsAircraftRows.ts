/**
 * UZ Aero — panel: UJĘCIE „PER SAMOLOT" → wiersze tabeli (moduł CZYSTY).
 *
 * Wiersz RAZEM jest częścią widoku, nie sumą liczoną tutaj: wszystkie jego liczby
 * przychodzą z `totals` serwera. Kolumny „Śr. L/h", „MH start → koniec"
 * i „Wykorzystanie" dostają w RAZEM kreskę ŚWIADOMIE — średnia ze średnich nie jest
 * średnią (hint mockupu), a odczyty skrajne floty nie istnieją jako jedna liczba.
 */

import { duration, motoHours } from '@uzaero/format';

import type { StatsAircraftItemDto, StatsTotalsDto } from '../../api/dto';
import { DASH, dot1, litresThousands, pct0, thousands } from './statsFormat';

export interface AircraftRowView {
  key: string;
  total: boolean;
  /**
   * Identyfikator jednostki — cel przejścia do analityki zużycia (`A10a`).
   * `null` w wierszu RAZEM: analityka opisuje SAMOLOT, a nie flotę, bo stawka L/h
   * Caravana i AT-3 nie składa się w jedną liczbę (ten sam powód, dla którego
   * kolumna „Śr. L/h" ma tam kreskę).
   */
  aircraftId: string | null;
  name: string;
  /** `Cessna 208 Caravan · 1250 L`; `null` przy RAZEM i jednostce spoza floty. */
  sub: string | null;
  days: string;
  block: string;
  flight: string;
  /** `186 / 186` — z kolumn projekcji; kreska przy wierszach sprzed migracji 18. */
  takeoffsLandings: string;
  fuel: string;
  avgLph: string;
  mhRange: string;
  /** `licznik dziesiętny` / `licznik hh:mm` — podpis formatu pod odczytem. */
  mhRangeSub: string | null;
  mhDelta: string;
  utilization: string;
  /** Klasy tonów komórek RAZEM (`cell-green` itd.); `undefined` w wierszach zwykłych. */
  blockClass?: string;
  flightClass?: string;
  fuelClass?: string;
}

const pair = (takeoffs: number | null, landings: number | null): string =>
  takeoffs == null || landings == null ? DASH : `${takeoffs} / ${landings}`;

export function aircraftRows(
  aircraft: StatsAircraftItemDto[],
  totals: StatsTotalsDto,
): AircraftRowView[] {
  const rows = aircraft.map(
    (row): AircraftRowView => ({
      key: row.aircraftId,
      total: false,
      aircraftId: row.aircraftId,
      name: row.reg ?? row.aircraftId,
      sub:
        row.aircraftType == null
          ? null
          : row.capacityL == null
            ? row.aircraftType
            : `${row.aircraftType} · ${thousands(row.capacityL)} L`,
      days: String(row.sessions),
      block: duration(row.blockMs),
      flight: duration(row.flightMs),
      takeoffsLandings: pair(row.takeoffs, row.landings),
      fuel: litresThousands(row.fuelConsumedL),
      avgLph: dot1(row.avgLitresPerBlockHour),
      mhRange:
        row.mhFirstStart == null || row.mhLastEnd == null
          ? DASH
          : `${motoHours(row.mhFirstStart, row.mhFormat)} → ${motoHours(row.mhLastEnd, row.mhFormat)}`,
      mhRangeSub:
        row.mhFormat === 'decimal'
          ? 'licznik dziesiętny'
          : row.mhFormat === 'hhmm'
            ? 'licznik hh:mm'
            : null,
      mhDelta: row.mhDeltaH == null ? DASH : motoHours(row.mhDeltaH, row.mhFormat),
      utilization: pct0(row.utilizationPct),
    }),
  );

  rows.push({
    key: 'total',
    total: true,
    aircraftId: null,
    name: 'RAZEM',
    sub: null,
    days: String(totals.sessions),
    block: duration(totals.blockMs),
    flight: duration(totals.flightMs),
    takeoffsLandings: pair(totals.takeoffs, totals.landings),
    fuel: litresThousands(totals.fuelConsumedL),
    // Średnia ze średnich nie jest średnią — kreska zamiast liczby, która wygląda
    // na sensowną (hint mockupu przytacza dokładnie ten rachunek).
    avgLph: DASH,
    mhRange: DASH,
    mhRangeSub: null,
    // Formaty liczników bywają różne per jednostka — suma idzie w godzinach dziesiętnych.
    mhDelta: totals.mhDeltaH == null ? DASH : `${dot1(totals.mhDeltaH)} h`,
    utilization: DASH,
    blockClass: 'cell-green',
    flightClass: 'cell-blue',
    fuelClass: 'cell-amber',
  });

  return rows;
}
