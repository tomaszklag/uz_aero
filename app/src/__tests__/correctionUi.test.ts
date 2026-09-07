/**
 * UZ Aero - test logiki prezentacji korekty (04c).
 *
 * Wiersz „Wpływ na czas lotu" jest obietnicą: pokazuje pilotowi, co korekta zrobi,
 * ZANIM ją zapisze. Liczymy go tą samą projekcją, którą liczy cała aplikacja - ten test
 * pilnuje, żeby obietnica i skutek były jednym kodem, na liczbach z mockupu.
 */

import { correctionImpact, flightNumberOf, methodBadgeFor, voidLabelFor } from '../ui/screens/logic/correction';
import type { Event } from '../domain';

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
    syncedAt: null,
  } as Event;
}

function day() {
  const takeoff1 = event('takeoff', at(8, 25), { method: 'auto' });
  const landing1 = event('landing', at(9, 18), { method: 'auto' });
  const takeoff2 = event('takeoff', at(9, 35), { method: 'auto' });
  const landing2 = event('landing', at(10, 22), { method: 'manual' });
  const start = event('engine_start', at(8, 12));
  const stop = event('engine_stop', at(10, 34));
  const refuel = event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 });
  return {
    events: [start, takeoff1, landing1, takeoff2, landing2, stop, refuel],
    takeoff1,
    landing1,
    landing2,
    stop,
    refuel,
  };
}

describe('wpływ korekty na czasy', () => {
  it('odtwarza liczby z mockupu: lądowanie 09:18 → 09:21 zmienia lot 0:53 → 0:56', () => {
    const { events, landing1 } = day();
    const impact = correctionImpact(events, landing1, at(9, 21))!;

    expect(impact.label).toBe('Wpływ na czas lotu');
    // Dzień ma dwa loty (0:53 + 0:47); zmiana pierwszego rusza sumę o +3 min.
    expect(impact.afterMs - impact.beforeMs).toBe(3 * 60_000);
  });

  it('korekta stopu silnika rusza czas bloku, nie lotu', () => {
    const { events, stop } = day();
    const impact = correctionImpact(events, stop, at(10, 40))!;

    expect(impact.label).toBe('Wpływ na czas bloku');
    expect(impact.afterMs - impact.beforeMs).toBe(6 * 60_000);
  });

  it('tankowanie nie wyznacza czasu - brak wiersza wpływu zamiast „0:00 → 0:00"', () => {
    const { events, refuel } = day();
    expect(correctionImpact(events, refuel, at(11, 0))).toBeNull();
  });
});

describe('etykiety', () => {
  it('numeruje lot zdarzenia tak, jak log cyklu', () => {
    const { events, takeoff1, landing1, landing2 } = day();
    expect(flightNumberOf(events, takeoff1)).toBe(1);
    expect(flightNumberOf(events, landing1)).toBe(1);
    expect(flightNumberOf(events, landing2)).toBe(2);
  });

  it('zdarzenia spoza lotów nie dostają numeru lotu', () => {
    const { events, stop } = day();
    expect(flightNumberOf(events, stop)).toBeNull();
  });

  it('napis destrukcyjny odmienia się per typ zdarzenia', () => {
    expect(voidLabelFor('landing')).toBe('TEGO LĄDOWANIA NIE BYŁO');
    expect(voidLabelFor('refuel')).toBe('TEGO TANKOWANIA NIE BYŁO');
    expect(voidLabelFor('day_close')).toBe('TEGO ZDARZENIA NIE BYŁO');
  });

  it('badge pochodzenia rozróżnia GPS od pilota', () => {
    const { landing1, landing2, stop } = day();
    expect(methodBadgeFor(landing1)).toBe('auto · GPS');
    expect(methodBadgeFor(landing2)).toBe('ręcznie');
    expect(methodBadgeFor(stop)).toBeNull();
  });
});
