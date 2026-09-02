/**
 * UZ Aero - test PRZESUNIĘCIA GODZINY PRZEJĘCIA (issue #43, uwaga z urządzenia).
 *
 * Najbardziej ryzykowna operacja całego trybu edycji: jedno pole potrafi przestawić
 * czasy wszystkich zdarzeń sesji. Dlatego plan liczy się OSOBNO od zapisu i ma testy
 * na każdą gałąź - pomyłka tutaj nie objawia się błędem, tylko cicho przepisaną historią.
 */

import { projectSession, type Event, type EventOf, type EventType } from '../domain';
import { claimRetimePlan } from '../ui/screens/logic/claimRetime';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event<T extends EventType>(
  type: T,
  time: number,
  payload: EventOf<T>['payload'],
  uuid?: string,
): Event {
  seq += 1;
  return {
    uuid: uuid ?? `e-${seq}`,
    type,
    sessionUuid: 's-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    deviceTime: time,
    gpsTime: time,
    schemaVersion: 1,
    syncedAt: null,
    payload,
  } as Event;
}

/** Sesja z mockupu: przejęcie 08:04, bieg 08:12–09:55, lot 08:20–09:01, zdanie 11:20. */
function sessionEvents(): Event[] {
  seq = 0;
  return [
    event('session_claim', at(8, 4), { mode: 'free' }, 'claim'),
    event(
      'preflight_confirm',
      at(8, 4),
      { operation: 'skoki', reading: { fuelL: 150, mh: 1234.5 }, mhFormat: 'decimal' },
      'preflight',
    ),
    event('engine_start', at(8, 12), {}, 'engine-on'),
    event('takeoff', at(8, 20), { method: 'auto' }, 'to-1'),
    event('landing', at(9, 1), { method: 'auto' }, 'ldg-1'),
    event('engine_stop', at(9, 55), {}, 'engine-off'),
    event('day_close', at(11, 20), { finalReading: { fuelL: 123, mh: 1236.1 } }, 'close'),
  ];
}

const plan = (events: Event[], newTime: number) =>
  claimRetimePlan(projectSession(events), events, 'claim', newTime);

describe('godzina przejęcia - bez kaskady', () => {
  it('ta sama godzina nie jest zmianą', () => {
    expect(plan(sessionEvents(), at(8, 4)).kind).toBe('unchanged');
  });

  it('cofnięcie przejęcia rusza WYŁĄCZNIE jego samego', () => {
    const result = plan(sessionEvents(), at(7, 30));
    expect(result).toEqual({ kind: 'simple', steps: [{ uuid: 'claim', newTime: at(7, 30) }] });
  });

  it('przesunięcie DO uruchomienia silnika też jest bezpieczne', () => {
    // Przejęcie i uruchomienie o tej samej minucie: pilot wsiadł i od razu odpalił.
    const result = plan(sessionEvents(), at(8, 12));
    expect(result.kind).toBe('simple');
  });

  it('operacja bez pracy silnika (09C) nie ma czego ciągnąć', () => {
    const events = sessionEvents().filter(
      (e) => e.type !== 'engine_start' && e.type !== 'engine_stop' && e.type !== 'takeoff' && e.type !== 'landing',
    );
    expect(plan(events, at(10, 0)).kind).toBe('simple');
  });
});

describe('godzina przejęcia - kaskada', () => {
  it('przejęcie ZA uruchomieniem przesuwa cały bieg tak, by uruchomienie było w tej godzinie', () => {
    const result = plan(sessionEvents(), at(9, 0));
    expect(result.kind).toBe('cascade');
    if (result.kind !== 'cascade') return;

    // 09:00 − 08:12 = 48 min.
    expect(result.deltaMs).toBe(48 * 60_000);
    const byUuid = new Map(result.steps.map((s) => [s.uuid, s.newTime]));
    expect(byUuid.get('claim')).toBe(at(9, 0));
    // Uruchomienie ląduje DOKŁADNIE w nowej godzinie przejęcia - o to prosił użytkownik.
    expect(byUuid.get('engine-on')).toBe(at(9, 0));
    // Reszta jedzie za nim, zachowując odstępy.
    expect(byUuid.get('to-1')).toBe(at(9, 8));
    expect(byUuid.get('ldg-1')).toBe(at(9, 49));
    expect(byUuid.get('engine-off')).toBe(at(10, 43));
  });

  it('dolewka oleju (oil_add) jedzie w kaskadzie jak tankowanie (issue #60)', () => {
    const withOil = [
      ...sessionEvents(),
      event('oil_add', at(8, 6), { addedL: 1.0 }, 'oil-1'),
    ];
    const result = plan(withOil, at(9, 0));
    if (result.kind !== 'cascade') throw new Error('spodziewano się kaskady');

    const step = result.steps.find((s) => s.uuid === 'oil-1');
    // 08:06 + 48 min = 08:54 - dolewka zostaje PRZED uruchomieniem, w swoim odstępie.
    expect(step?.newTime).toBe(at(8, 54));
  });

  it('ZDANIA samolotu kaskada nie rusza - to ono zamyka okno korekty', () => {
    const result = plan(sessionEvents(), at(9, 0));
    if (result.kind !== 'cascade') throw new Error('spodziewano się kaskady');
    expect(result.steps.some((s) => s.uuid === 'close')).toBe(false);
  });

  it('zapowiada skutek liczbą minut i nową godziną uruchomienia', () => {
    const result = plan(sessionEvents(), at(9, 0));
    if (result.kind !== 'cascade') throw new Error('spodziewano się kaskady');
    expect(result.note).toContain('48 min');
    expect(result.note).toContain('09:00');
  });

  it('czas trwania lotu i bloku zostaje bez zmian - przesuwamy, nie skracamy', () => {
    const before = projectSession(sessionEvents());
    const result = plan(sessionEvents(), at(9, 0));
    if (result.kind !== 'cascade') throw new Error('spodziewano się kaskady');

    const shifted = sessionEvents().map((e) => {
      const step = result.steps.find((s) => s.uuid === e.uuid);
      return step == null ? e : ({ ...e, gpsTime: step.newTime } as Event);
    });
    const after = projectSession(shifted);

    expect(after.flightTimeMs).toBe(before.flightTimeMs);
    expect(after.blockTimeMs).toBe(before.blockTimeMs);
  });
});

describe('godzina przejęcia - odmowa', () => {
  it('bieg nie może wyjść poza zdanie samolotu', () => {
    // Silnik stanął 09:55, zdanie 11:20 - zapas to 1 h 25 min. Przesunięcie o 2 h
    // wypchnęłoby wyłączenie silnika za oddanie maszyny.
    const result = plan(sessionEvents(), at(10, 12));
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') return;
    expect(result.note).toContain('11:20');
  });

  it('odmowa nie produkuje ANI JEDNEGO kroku - nie ma częściowego przesunięcia', () => {
    const result = plan(sessionEvents(), at(10, 12));
    expect(result).not.toHaveProperty('steps');
  });

  it('cel spoza strumienia jest odmową, nie cichym niczym', () => {
    const events = sessionEvents();
    const result = claimRetimePlan(projectSession(events), events, 'nie-ma-takiego', at(9, 0));
    expect(result.kind).toBe('refused');
  });
});
