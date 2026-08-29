/**
 * UZ Aero - panel: ODPOWIEDŹ `GET /admin/api/stats` do testów renderu (`A10`).
 *
 * Liczby są przepisane ze scenariusza mockupu `A10-statystyki.html` (lipiec 2026,
 * trzy jednostki, pięciu pilotów, SKY CAMP jako główny klient) - dzięki temu asercje
 * renderu porównują się z tym samym obrazem, który zatwierdzono w designie.
 * Kształt: `StatsReportDto` - wszystkie ilorazy policzone „przez serwer".
 */

import type { StatsDailyPointDto, StatsReportDto } from '../../src/api/dto';

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const hm = (h: number, m: number): number => h * HOUR_MS + m * MIN_MS;

/**
 * Lipiec 2026 dzień po dniu; zera 05/11/18/26 JUL - dni bez sesji, jak w mockupie.
 * Szereg SUMUJE SIĘ do nalotu z kafli (186:39): 24 dni po 7:04, 3 lipca 6:51
 * i maksimum 10:12 27 lipca - plakietka „suma" i kafel muszą mówić jedną liczbę.
 */
function july(): StatsDailyPointDto[] {
  const zeroDays = new Set([5, 11, 18, 26]);
  const out: StatsDailyPointDto[] = [];
  for (let day = 1; day <= 30; day += 1) {
    out.push({
      day: `2026-07-${String(day).padStart(2, '0')}`,
      blockMs: zeroDays.has(day)
        ? 0
        : day === 27
          ? hm(10, 12)
          : day === 3
            ? hm(6, 51)
            : hm(7, 4),
    });
  }
  return out;
}

export function statsFixture(): StatsReportDto {
  return {
    at: '2026-07-31T14:22:07.000Z',
    range: {
      fromDay: '2026-07-01',
      toDay: '2026-07-30',
      fromMs: Date.UTC(2026, 6, 1),
      toMs: Date.UTC(2026, 6, 30, 23, 59, 59, 999),
      calendarDays: 30,
      defaulted: false,
    },
    totals: {
      sessions: 53,
      aircraft: 3,
      pilots: 5,
      blockMs: hm(186, 39),
      flightMs: hm(133, 45),
      flightVsBlockPct: 71.66,
      takeoffs: 356,
      landings: 356,
      fuelConsumedL: 21436,
      fuelUnknownSessions: 0,
      mhDeltaH: 186.3,
      mhUnknownSessions: 0,
      mhBlockHours: 186.65,
      mhVsBlockH: -0.35,
      staleRows: 0,
      openSessionsInRange: 2,
      openSessionsUndated: 0,
    },
    daily: july(),
    aircraft: [
      {
        aircraftId: 'SP-KLM',
        reg: 'SP-KLM',
        aircraftType: 'Cessna 208 Caravan',
        capacityL: 1250,
        mhFormat: 'decimal',
        sessions: 21,
        blockMs: hm(112, 38),
        flightMs: hm(71, 24),
        takeoffs: 186,
        landings: 186,
        fuelConsumedL: 19240,
        fuelUnknownSessions: 0,
        avgLitresPerBlockHour: 170.8,
        mhFirstStart: 3795.4,
        mhLastEnd: 3907.8,
        mhDeltaH: 112.4,
        mhUnknownSessions: 0,
        activeDays: 21,
        utilizationPct: 70,
        staleRows: 0,
      },
      {
        aircraftId: 'SP-ABC',
        reg: 'SP-ABC',
        aircraftType: 'Cessna 182',
        capacityL: 200,
        mhFormat: 'decimal',
        sessions: 18,
        blockMs: hm(46, 12),
        flightMs: hm(38, 5),
        takeoffs: 74,
        landings: 74,
        fuelConsumedL: 1684,
        fuelUnknownSessions: 0,
        avgLitresPerBlockHour: 36.5,
        mhFirstStart: 1238.4,
        mhLastEnd: 1284.6,
        mhDeltaH: 46.2,
        mhUnknownSessions: 0,
        activeDays: 18,
        utilizationPct: 60,
        staleRows: 0,
      },
      {
        aircraftId: 'SP-XYZ',
        reg: 'SP-XYZ',
        aircraftType: 'Aero AT-3',
        capacityL: 100,
        mhFormat: 'hhmm',
        sessions: 14,
        blockMs: hm(27, 49),
        flightMs: hm(24, 16),
        takeoffs: 96,
        landings: 96,
        fuelConsumedL: 512,
        fuelUnknownSessions: 0,
        avgLitresPerBlockHour: 18.4,
        mhFirstStart: 617.4,
        mhLastEnd: 645.1,
        mhDeltaH: 27.7,
        mhUnknownSessions: 0,
        activeDays: 14,
        utilizationPct: 46.7,
        staleRows: 0,
      },
    ],
    pilots: [
      {
        pilotId: 'AWR',
        code: 'AWR',
        name: 'Anna Wrzosek',
        sessions: 19,
        blockMs: hm(84, 22),
        flightMs: hm(54, 38),
        takeoffs: 131,
        landings: 131,
        regs: ['SP-ABC', 'SP-KLM'],
        staleRows: 0,
      },
      {
        pilotId: 'TML',
        code: 'TML',
        name: 'Tomasz Małkiewicz',
        sessions: 12,
        blockMs: hm(31, 48),
        flightMs: hm(26, 52),
        takeoffs: 58,
        landings: 58,
        regs: ['SP-ABC', 'SP-XYZ'],
        staleRows: 0,
      },
      {
        pilotId: 'MBK',
        code: 'MBK',
        name: 'Marek Bąk',
        sessions: 9,
        blockMs: hm(28, 16),
        flightMs: hm(19, 44),
        takeoffs: 48,
        landings: 48,
        regs: ['SP-KLM'],
        staleRows: 0,
      },
    ],
    operations: [
      {
        operation: 'skoki',
        sessions: 21,
        blockMs: hm(112, 38),
        flightMs: hm(71, 24),
        takeoffs: 186,
        landings: 186,
        fuelConsumedL: 19240,
        fuelUnknownSessions: 0,
        avgLitresPerBlockHour: 170.8,
        blockSharePct: 60.3,
        regs: ['SP-KLM'],
        clients: 3,
        staleRows: 0,
      },
      {
        operation: 'ferry',
        sessions: 6,
        blockMs: hm(21, 14),
        flightMs: hm(19, 48),
        takeoffs: 12,
        landings: 12,
        fuelConsumedL: 764,
        fuelUnknownSessions: 0,
        avgLitresPerBlockHour: 36,
        blockSharePct: 11.4,
        regs: ['SP-ABC', 'SP-XYZ'],
        clients: 0,
        staleRows: 0,
      },
    ],
    drops: {
      sessions: 21,
      flightMs: hm(71, 24),
      lifts: 178,
      jumpers: 962,
      tandem: 421,
      aff: 168,
      solo: 373,
      liftsPerSession: 8.476,
      jumpersPerLift: 5.4,
      avgAltitudeFt: 12840,
      dropsWithAltitude: 171,
      dropsWithoutAltitude: 7,
      jumpersPerFlightHour: 13.5,
      staleRows: 0,
      clients: [
        {
          client: 'SKY CAMP',
          lifts: 124,
          jumpers: 682,
          tandem: 301,
          aff: 118,
          solo: 263,
          avgAltitudeFt: 12900,
          jumpersPerLift: 5.5,
        },
        {
          client: 'STREFA RADOM',
          lifts: 39,
          jumpers: 201,
          tandem: 87,
          aff: 34,
          solo: 80,
          avgAltitudeFt: 12600,
          jumpersPerLift: 5.2,
        },
      ],
    },
  };
}
