/**
 * UZ Aero - test szlaku odczytu przy zdaniu samolotu (issue #84, ekran 09B).
 *
 * Zgłoszenie prosiło o popup pokazujący, „ile było przy przejęciu, ile dolano i ile
 * latano". Kluczowe jest tu jedno: te trzy rzeczy to FAKTY z rejestru, więc muszą
 * stanąć w arkuszu także wtedy, gdy maszyna nie ma jeszcze policzonej normy - a właśnie
 * na normie wisiał dotąd cały szlak tego ekranu i przy jej braku znikał w całości.
 */

import { fuelReleaseTrail, mhReleaseTrail } from '../ui/screens/logic/releaseTrail';
import { emptySessionState } from '../domain';
import type { ConsumptionNorm, Event, SessionState } from '../domain';

const HOUR = 3_600_000;
const AT = Date.UTC(2026, 8, 3, 8, 0);

function session(over: Partial<SessionState> = {}): SessionState {
  return {
    ...emptySessionState(),
    sessionUuid: 's-1',
    aircraftId: 'SP-AXA',
    claimedAt: AT,
    mhFormat: 'hhmm',
    blockTimeMs: 103 * 60_000,
    flightTimeMs: 76 * 60_000,
    fuel: { startL: 150, addedL: 48, endL: null, consumedL: null, lastReadingL: 198 },
    mh: { start: 1234.5, end: null, deltaH: null },
    ...over,
  };
}

function refuel(uuid: string, at: number, addedL: number, afterL: number): Event {
  return {
    uuid,
    type: 'refuel',
    deviceTime: at,
    gpsTime: null,
    payload: { beforeL: afterL - addedL, addedL, afterL, consumptionLPerH: null },
  } as unknown as Event;
}

function norm(over: Partial<ConsumptionNorm> = {}): ConsumptionNorm {
  return {
    windowDays: 90,
    blockLPerHLow: 12,
    blockLPerHHigh: 18,
    blockLPerH: 15,
    airLPerH: 20,
    groundLPerH: 8,
    litersPerFlight: 22,
    fuelRatioLow: 0.9,
    fuelRatioHigh: 1.1,
    mh: {
      kind: 'tach',
      perFlightHour: 1,
      perGroundHour: 0.4,
      ratioLow: 0.95,
      ratioHigh: 1.05,
      sessions: 12,
    },
    intervals: 96,
    engineMs: 118 * HOUR,
    computedAt: AT,
    ...over,
  };
}

describe('szlak paliwa przy zdaniu', () => {
  /** To jest sedno zgłoszenia: trzy fakty stoją także bez normy. */
  it('bez normy pokazuje przejęcie, tankowania i czas pracy silnika', () => {
    const rows = fuelReleaseTrail(
      session(),
      [refuel('r-1', AT + 30 * 60_000, 48, 198)],
      null,
    );

    expect(rows.map((r) => r.id)).toEqual(['claim', 'refuel-r-1', 'flown']);
    expect(rows[0]!.meta).toContain('150');
    expect(rows[1]!.meta).toContain('48');
    expect(rows[2]!.title).toContain('Latano');
  });

  it('z normą dokłada ZIELONE ogniwo oczekiwania i liczy zużycie', () => {
    const rows = fuelReleaseTrail(session(), [], norm());
    const expect_ = rows.find((r) => r.id === 'expect');

    expect(expect_?.tone).toBe('green');
    expect(rows.find((r) => r.id === 'flown')?.meta).toContain('z normy');
  });

  it('tankowania idą w porządku CZASU, nie zapisu', () => {
    const rows = fuelReleaseTrail(
      session(),
      [refuel('pozne', AT + 60 * 60_000, 20, 218), refuel('wczesne', AT + 10 * 60_000, 48, 198)],
      null,
    );

    expect(rows.map((r) => r.id)).toEqual(['claim', 'refuel-wczesne', 'refuel-pozne', 'flown']);
  });

  it('operacja bez biegu silnika nie opowiada o lataniu', () => {
    const rows = fuelReleaseTrail(session({ blockTimeMs: 0, flightTimeMs: 0 }), [], null);

    expect(rows.map((r) => r.id)).toEqual(['claim']);
  });
});

describe('szlak motogodzin przy zdaniu', () => {
  it('mówi, skąd licznik startował i ile maszyna pracowała', () => {
    const rows = mhReleaseTrail(session(), null, 'hhmm');

    expect(rows.map((r) => r.id)).toEqual(['claim', 'flown']);
    expect(rows[0]!.meta).toContain('MH');
  });

  it('z przelicznikami dokłada oczekiwany stan licznika', () => {
    const rows = mhReleaseTrail(session(), norm(), 'hhmm');

    expect(rows.at(-1)?.id).toBe('expect');
    expect(rows.at(-1)?.tone).toBe('green');
  });

  /** Przeliczniki MH maszyna dorabia się później niż normę paliwa - i to jest normalne. */
  it('bez przeliczników MH ogniwa oczekiwania po prostu nie ma', () => {
    const rows = mhReleaseTrail(session(), norm({ mh: null }), 'hhmm');

    expect(rows.some((r) => r.id === 'expect')).toBe(false);
  });
});
