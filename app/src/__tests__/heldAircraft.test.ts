/**
 * UZ Aero — karta „samolot w ręce" z ekranu 01 (`buildHeldAircraft`).
 *
 * Pilnujemy dwóch rzeczy, których nie widać po samych typach:
 *  1. chwila przejęcia pochodzi z `session_claim`, a NIE z pierwszego wzlotu — to dwa
 *     różne momenty i podstawienie jednego pod drugi byłoby cichym przekłamaniem;
 *  2. zdany samolot znika z ekranu domowego, bo `day_close` kończy pracę z maszyną —
 *     ale NIE kończy dnia pilota (§3.6a: zdanie samolotu ≠ zamknięcie służby).
 */

import { buildHeldAircraft } from '../ui/screens/logic/heldAircraft';
import { emptySessionState } from '../domain';
import type { Event, SessionState } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
};

const claim = (time: string): Event => ({
  uuid: 'e-claim',
  sessionUuid: 's-klm',
  aircraftId: 'SP-KLM',
  picId: 'TMK',
  dualId: null,
  type: 'session_claim',
  payload: { mode: 'free' },
  deviceTime: at(time),
  gpsTime: null,
  schemaVersion: 2,
  syncedAt: null,
});

const session = (over: Partial<SessionState> = {}): SessionState => ({
  ...emptySessionState(),
  sessionUuid: 's-klm',
  aircraftId: 'SP-KLM',
  picId: 'TMK',
  sessionPicId: 'TMK',
  operation: 'ferry',
  ...over,
});

describe('buildHeldAircraft', () => {
  it('składa drugą linię z chwili przejęcia i nazwy operacji', () => {
    const vm = buildHeldAircraft(session(), [claim('13:35')]);

    expect(vm).not.toBeNull();
    expect(vm!.aircraftId).toBe('SP-KLM');
    expect(vm!.since).toBe('Twój od 13:35 UTC · Przelot');
    expect(vm!.engineLabel).toBe('Silnik wyłączony');
  });

  it('pracujący silnik zmienia plakietkę stanu', () => {
    const vm = buildHeldAircraft(session({ engineRunning: true }), [claim('13:35')]);

    expect(vm!.engineRunning).toBe(true);
    expect(vm!.engineLabel).toBe('Silnik pracuje');
  });

  it('bez zdarzenia claimu mówi mniej, zamiast zmyślać godzinę', () => {
    const vm = buildHeldAircraft(session(), []);

    expect(vm!.since).toBe('Twój samolot · Przelot');
  });

  it('zdany samolot znika z ekranu domowego', () => {
    expect(buildHeldAircraft(session({ closed: true }), [claim('13:35')])).toBeNull();
  });

  it('brak sesji to brak karty, nie karta pusta', () => {
    expect(buildHeldAircraft(emptySessionState(), [])).toBeNull();
  });
});
