/**
 * UZ Aero — test NIESPÓJNOŚCI LOGU (issue #43, baner trybu edycji `design/10d`).
 *
 * Reguła nadrzędna: ten moduł niczego nie odrzuca. Sesja z lotem bez lądowania jest
 * faktem, który się WYDARZYŁ — GPS zgubił lądowanie — i aplikacja ma o nim powiedzieć,
 * a nie schować go ani odmówić wyświetlenia. Stąd wyłącznie miękkie naruszenia.
 *
 * Drugi wątek testów: niespójności liczą się ze strumienia PO KOREKTACH. Pilot, który
 * właśnie poprawił czas, musi natychmiast widzieć, czy poprawka pomogła — i tak samo
 * musi zobaczyć problem, który dopiero co sam wprowadził.
 */

import {
  projectSession,
  sessionInconsistencies,
  type AircraftLimits,
  type Event,
  type EventOf,
  type RuleViolation,
} from '../domain';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
const LIMITS: AircraftLimits = { capacityL: 212 };

let seq = 0;
function event(type: Event['type'], time: number, payload: unknown = {}): Event {
  seq += 1;
  return {
    uuid: `e-${seq}-${type}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

function correction(
  target: Event,
  recordedAt: number,
  action: { action: 'retime'; newTime: number } | { action: 'void' },
): EventOf<'event_correction'> {
  seq += 1;
  return {
    uuid: `c-${seq}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type: 'event_correction',
    deviceTime: recordedAt,
    gpsTime: recordedAt,
    payload: { targetUuid: target.uuid, ...action },
    schemaVersion: 1,
    syncedAt: null,
  } as EventOf<'event_correction'>;
}

const claim = (): Event => event('session_claim', at(8, 4), { mode: 'free' });
const preflight = (fuelL = 150, mh = 1234.5): Event =>
  event('preflight_confirm', at(8, 4), {
    operation: 'skoki',
    departureIcao: 'EPZG',
    arrivalIcao: 'EPZG',
    reading: { fuelL, mh },
    mhFormat: 'decimal',
  });
const dayClose = (fuelL = 123, mh = 1236.1): Event =>
  event('day_close', at(11, 20), { finalReading: { fuelL, mh } });

/** Sesja poprawna: bieg 08:12–09:55, jeden lot 08:20–09:01, zrzut w locie. */
function healthy(): Event[] {
  return [
    claim(),
    preflight(),
    event('engine_start', at(8, 12)),
    event('takeoff', at(8, 20), { method: 'auto' }),
    event('drop', at(8, 52), { dropNumber: 1, altitudeFt: 12800, jumpers: null }),
    event('landing', at(9, 1), { method: 'auto' }),
    event('engine_stop', at(9, 55)),
    dayClose(),
  ];
}

function issues(events: Event[], limits: AircraftLimits = LIMITS): RuleViolation[] {
  return sessionInconsistencies(projectSession(events), events, limits);
}

const codes = (v: RuleViolation[]): string[] => v.map((x) => x.code);

describe('sesja spójna', () => {
  it('nie ma nic do powiedzenia', () => {
    expect(issues(healthy())).toEqual([]);
  });

  it('a każde naruszenie jest MIĘKKIE — log opisuje fakty, nie zapisy do odrzucenia', () => {
    const events = healthy().filter((e) => e.type !== 'landing');
    const found = issues(events);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((v) => v.severity === 'warning')).toBe(true);
  });
});

describe('loty', () => {
  it('lot bez lądowania po zatrzymaniu silnika', () => {
    const events = healthy().filter((e) => e.type !== 'landing');
    const found = issues(events);
    expect(codes(found)).toContain('FLIGHT_WITHOUT_LANDING');
    // Wskazuje KTÓRE zdarzenie — oś sesji oznacza po tym konkretny wiersz.
    const flight = found.find((v) => v.code === 'FLIGHT_WITHOUT_LANDING')!;
    expect(flight.details?.uuid).toBe(events.find((e) => e.type === 'takeoff')!.uuid);
  });

  it('ale w POWIETRZU milczy — to nie jest brak danych, tylko trwający lot', () => {
    const events = [
      claim(),
      preflight(),
      event('engine_start', at(8, 12)),
      event('takeoff', at(8, 20), { method: 'auto' }),
    ];
    expect(codes(issues(events))).not.toContain('FLIGHT_WITHOUT_LANDING');
  });

  it('lądowanie w tej samej minucie co start', () => {
    const events = [
      claim(),
      preflight(),
      event('engine_start', at(8, 12)),
      event('takeoff', at(8, 20), { method: 'auto' }),
      event('landing', at(8, 20), { method: 'auto' }),
      event('engine_stop', at(9, 55)),
      dayClose(),
    ];
    expect(codes(issues(events))).toContain('ZERO_LENGTH_FLIGHT');
  });
});

describe('klamra biegu silnika', () => {
  it('kołowanie zapisane po wyłączeniu silnika', () => {
    const events = [...healthy(), event('taxi', at(10, 30), { method: 'manual' })];
    const found = issues(events);
    expect(codes(found)).toContain('EVENT_OUTSIDE_RUN');
    expect(found.find((v) => v.code === 'EVENT_OUTSIDE_RUN')?.message).toContain('10:30');
  });

  it('sesja bez pracy silnika (09C) nie ma czego naruszyć', () => {
    const events = [claim(), preflight(), dayClose(150, 1234.5)];
    expect(codes(issues(events))).not.toContain('EVENT_OUTSIDE_RUN');
  });
});

describe('zrzuty', () => {
  it('zrzut zapisany na ziemi', () => {
    const events = healthy().map((e) =>
      e.type === 'drop' ? { ...e, gpsTime: at(9, 5), deviceTime: at(9, 5) } : e,
    );
    expect(codes(issues(events))).toContain('DROP_ON_GROUND');
  });

  it('zrzut, który wypadł z lotu DOPIERO po korekcie czasu lądowania', () => {
    const events = healthy();
    const landing = events.find((e) => e.type === 'landing')!;
    expect(codes(issues(events))).not.toContain('DROP_ON_GROUND');

    // Lądowanie przesunięte na 08:40 — zrzut z 08:52 zostaje poza lotem.
    const stream = [...events, correction(landing, at(11, 40), { action: 'retime', newTime: at(8, 40) })];
    expect(codes(issues(stream))).toContain('DROP_ON_GROUND');
  });

  it('unieważniony zrzut znika razem ze swoją niespójnością', () => {
    const events = healthy().map((e) =>
      e.type === 'drop' ? { ...e, gpsTime: at(9, 5), deviceTime: at(9, 5) } : e,
    );
    const drop = events.find((e) => e.type === 'drop')!;
    const stream = [...events, correction(drop, at(11, 40), { action: 'void' })];
    expect(codes(issues(stream))).not.toContain('DROP_ON_GROUND');
  });
});

describe('odczyty', () => {
  it('cofnięty licznik motogodzin', () => {
    const events = [...healthy().filter((e) => e.type !== 'day_close'), dayClose(123, 1234.0)];
    expect(codes(issues(events))).toContain('MH_REGRESSION');
  });

  it('przyrost licznika większy niż praca silnika', () => {
    // Bieg 08:12–09:55 = 1:43 (1.72 h), a licznik przyrósł o 3 h.
    const events = [...healthy().filter((e) => e.type !== 'day_close'), dayClose(123, 1237.5)];
    expect(codes(issues(events))).toContain('MH_DELTA_MISMATCH');
  });

  it('paliwo ponad pojemność zbiorników', () => {
    const events = [...healthy().filter((e) => e.type !== 'day_close'), dayClose(300, 1236.1)];
    expect(codes(issues(events))).toContain('FUEL_OVER_CAPACITY');
  });

  it('paliwa przy zdaniu więcej niż mogło zostać — brakuje tankowania', () => {
    const events = [...healthy().filter((e) => e.type !== 'day_close'), dayClose(180, 1236.1)];
    expect(codes(issues(events))).toContain('FUEL_INCREASE_WITHOUT_REFUEL');
  });

  it('to samo paliwo z zapisanym tankowaniem jest już w porządku', () => {
    const events = [
      ...healthy().filter((e) => e.type !== 'day_close'),
      event('refuel', at(10, 10), { beforeL: 120, addedL: 60, afterL: 180 }),
      dayClose(180, 1236.1),
    ];
    expect(codes(issues(events))).not.toContain('FUEL_INCREASE_WITHOUT_REFUEL');
  });

  it('bez limitów z cache (offline, §4.8) reguła pojemności śpi', () => {
    const events = [...healthy().filter((e) => e.type !== 'day_close'), dayClose(300, 1236.1)];
    expect(codes(issues(events, { capacityL: null }))).not.toContain('FUEL_OVER_CAPACITY');
  });
});
