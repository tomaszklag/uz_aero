/** * UZ Aero — test grupowania logu wokół BIEGU SILNIKA (ekran 08, lista ręczna). * * Ekran 08 jest fallbackiem po zawodnym GPS — pilot odtwarza sesję z pamięci, myśląc * klamrą „od uruchomienia do zgaszenia". Jeśli grupowanie przetnie strumień źle * (tankowanie wpadnie do biegu, aktywny bieg nie dostanie wierszy oczekiwanych), pilot * nie zobaczy, czego brakuje — a to jedyny powód istnienia tego ekranu. * * Fixture celowo niesie TRZY biegi: po pivocie 2026-08-10 poprawna sesja ma jeden, * więc test opisuje tu strumień ZŁAMANY — grupowanie musi go pokazać w całości, * zamiast po cichu gubić drugi i trzeci bieg. */

import { buildLogGroups, runCount } from '../ui/screens/logic/manualLog';
import type { Event, SessionState } from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

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
    syncedAt: time,
  } as Event;
}

function projection(over: Partial<SessionState> = {}): SessionState {
  return {
    mh: { start: 1234.5, end: null, deltaH: null },
    fuel: { startL: 150, addedL: 0, endL: null, consumedL: null, lastReadingL: 150 },
    engineRunning: false,
    inFlight: false,
    ...over,
  } as SessionState;
}

/** Strumień ZŁAMANY (fixture): dwa zamknięte biegi, tankowanie między nimi, trzeci w locie. */
function mockupDay(): Event[] {
  return [
    event('engine_start', at(8, 12)),
    event('takeoff', at(8, 25), { method: 'manual' }),
    event('landing', at(9, 18), { method: 'manual' }),
    event('takeoff', at(9, 35), { method: 'manual' }),
    event('landing', at(10, 22), { method: 'manual' }),
    event('engine_stop', at(10, 34)),
    event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 }),
    event('engine_start', at(11, 15)),
    event('takeoff', at(11, 28), { method: 'manual' }),
    event('landing', at(12, 15), { method: 'manual' }),
    event('engine_stop', at(12, 28)),
    event('engine_start', at(13, 10)),
    event('takeoff', at(13, 24), { method: 'manual' }),
  ];
}

describe('grupowanie wokół biegu silnika', () => {
  it('odtwarza układ mockupu: bieg · tankowanie · bieg · bieg aktywny', () => {
    const groups = buildLogGroups(
      mockupDay(),
      projection({ engineRunning: true, inFlight: true }),
      'hhmm',
    );

    expect(groups.map((g) => g.kind)).toEqual(['run', 'ground', 'run', 'run']);
    expect(runCount(groups)).toBe(3);
  });

  it('tankowanie NIE wpada do żadnego biegu', () => {
    const groups = buildLogGroups(mockupDay(), projection(), 'hhmm');
    const ground = groups.find((g) => g.kind === 'ground')!;
    expect(ground.kind).toBe('ground');

    for (const g of groups) {
      if (g.kind === 'run') {
        expect(g.rows.some((r) => r.kind === 'ground')).toBe(false);
      }
    }
  });

  it('aktywny bieg dostaje wiersze oczekiwane: Landing (w locie) i Stop engine', () => {
    const groups = buildLogGroups(
      mockupDay(),
      projection({ engineRunning: true, inFlight: true }),
      'hhmm',
    );

    const last = groups[groups.length - 1]!;
    expect(last.kind).toBe('run');
    if (last.kind !== 'run') return;

    expect(last.active).toBe(true);
    const awaited = last.rows.filter((r) => r.awaited === true);
    // To jest dosłownie lista tego, co pilot dopisze ręcznie, jeśli GPS nie wykryje.
    expect(awaited.map((r) => r.label)).toEqual(['Landing', 'Stop engine']);
    expect(awaited.every((r) => r.time === '—')).toBe(true);
  });

  it('po wylądowaniu (silnik dalej pracuje) oczekiwany jest już tylko Stop engine', () => {
    const events = [...mockupDay(), event('landing', at(14, 8), { method: 'manual' })];
    const groups = buildLogGroups(
      events,
      projection({ engineRunning: true, inFlight: false }),
      'hhmm',
    );

    const last = groups[groups.length - 1]!;
    if (last.kind !== 'run') return;
    expect(last.rows.filter((r) => r.awaited === true).map((r) => r.label)).toEqual([
      'Stop engine',
    ]);
  });

  it('zamknięta sesja nie ma biegu aktywnego ani wierszy oczekiwanych', () => {
    const events = [...mockupDay(), event('landing', at(14, 8), { method: 'manual' }), event('engine_stop', at(14, 20))];
    const groups = buildLogGroups(events, projection(), 'hhmm');

    for (const g of groups) {
      if (g.kind === 'run') {
        expect(g.active).toBe(false);
        expect(g.rows.some((r) => r.awaited === true)).toBe(false);
      }
    }
  });

  it('zdarzenia organizacyjne (preflight) nie zaśmiecają listy biegów', () => {
    const events = [
      event('preflight_confirm', at(8, 0), {
        operation: 'skoki',
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
      }),
      ...mockupDay(),
    ];
    const groups = buildLogGroups(events, projection({ engineRunning: true }), 'hhmm');

    expect(groups[0]!.kind).toBe('run'); // dzień na liście zaczyna się od silnika
  });
});
