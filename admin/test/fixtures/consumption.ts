/**
 * UZ Aero - panel: fixture raportu analityki zużycia.
 *
 * Liczby odwzorowują scenariusz mockupu `A10a` (SP-ABC, okno 90 dni, model dwufazowy),
 * żeby testy modułów ekranu sprawdzały ZGODNOŚĆ Z DESIGNEM, a nie własne wymysły.
 * Rozjazd tych liczb z mockupem bez zmiany mockupu jest błędem, nie poprawką.
 */

import type { ConsumptionReportDto } from '../../src/api/dto';

const DAY = Date.UTC(2026, 6, 30);
const HOUR = 3_600_000;

export function consumptionFixture(
  over: Partial<ConsumptionReportDto> = {},
): ConsumptionReportDto {
  return {
    at: '2026-07-31T14:22:07.000Z',
    range: {
      fromDay: '2026-05-03',
      toDay: '2026-07-31',
      fromMs: Date.UTC(2026, 4, 3),
      toMs: Date.UTC(2026, 6, 31, 23, 59, 59, 999),
      calendarDays: 90,
      defaulted: true,
    },
    aircraft: {
      aircraftId: 'SP-ABC',
      reg: 'SP-ABC',
      aircraftType: 'Cessna 182',
      capacityL: 212,
      mhFormat: 'decimal',
      serviceStatus: 'active',
    },
    headline: {
      litersPerFlightHour: 43.6,
      litersPerBlockHour: 35.9,
      litersPerFlight: 22.8,
      mhPerBlockHour: 0.86,
    },
    basis: {
      sessions: 41,
      sessionsInRange: 41,
      openSessions: 0,
      staleRows: 0,
      firstDay: Date.UTC(2026, 4, 3),
      lastDay: DAY,
    },
    summary: {
      intervals: 96,
      litersTotal: 4246,
      engineMs: 118.4 * HOUR,
      flightMs: 97.3 * HOUR,
      flights: 186,
      litersPerFlightHour: 43.6,
      litersPerBlockHour: 35.9,
      litersPerFlight: 22.8,
      blockLPerHP10: 33.1,
      blockLPerHP90: 38.4,
      months: [
        { month: '2026-05', litersTotal: 1200, engineMs: 34 * HOUR, intervals: 28, litersPerBlockHour: 35.1 },
        { month: '2026-06', litersTotal: 1500, engineMs: 42 * HOUR, intervals: 34, litersPerBlockHour: 35.6 },
        { month: '2026-07', litersTotal: 1546, engineMs: 42.4 * HOUR, intervals: 34, litersPerBlockHour: 36.5 },
      ],
      firstDay: Date.UTC(2026, 4, 3),
      lastDay: DAY,
    },
    fuel: {
      published: true,
      gate: {
        published: true,
        intervals: 96,
        engineMs: 118.4 * HOUR,
        missingIntervals: 0,
        missingEngineMs: 0,
      },
      phaseSet: 'two',
      degradedBecause: 'no-trace',
      rates: [
        {
          phase: 'ground',
          lPerH: 11.9,
          ciHalfWidth: 1.6,
          pinned: false,
          varianceInflation: 1.4,
          hoursInWindowMs: 21.1 * HOUR,
        },
        {
          phase: 'air',
          lPerH: 44.2,
          ciHalfWidth: 2.1,
          pinned: false,
          varianceInflation: 1.2,
          hoursInWindowMs: 97.3 * HOUR,
        },
      ],
      equations: 93,
      degreesOfFreedom: 91,
      residualSigmaL: 2.6,
      rSquaredUncentered: 0.94,
      outliers: [],
      tracedIntervals: 0,
    },
    mh: {
      published: true,
      kind: 'tach',
      perFlightHour: 0.96,
      perFlightCi: 0.02,
      perGroundHour: 0.41,
      perGroundCi: 0.05,
      equations: 41,
      rejected: 0,
      residualSigmaH: 0.04,
      rows: [
        {
          sessionUuid: 's-1',
          dayStart: DAY,
          flightMs: 0.8 * HOUR,
          groundMs: 0.23 * HOUR,
          actualMh: 0.8,
          modelledMh: 0.86,
          residualMh: -0.06,
        },
      ],
    },
    intervals: [
      {
        sessionUuid: 's-1',
        aircraftId: 'SP-ABC',
        dayStart: DAY,
        startAt: DAY + 9 * HOUR + 58 * 60_000,
        endAt: DAY + 11 * HOUR + 31 * 60_000,
        startKind: 'preflight',
        endKind: 'day_close',
        startUuid: 'u-a',
        endUuid: 'u-b',
        startReadingL: 96,
        endReadingL: 74,
        consumedL: 22,
        engineMs: 1.03 * HOUR,
        flightMs: 0.8 * HOUR,
        groundMs: 0.23 * HOUR,
        climbMs: null,
        cruiseMs: null,
        descentMs: null,
        flightCount: 1,
        rejected: null,
      },
    ],
    ...over,
  };
}
