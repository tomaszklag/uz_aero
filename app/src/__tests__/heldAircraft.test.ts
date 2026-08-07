/**
 * UZ Aero — karta „samolot w ręce" z ekranu 01 (`buildHeldAircraft`).
 *
 * Pilnujemy dwóch rzeczy, których nie widać po samych typach:
 *  1. chwila przejęcia pochodzi z `session_claim`, a NIE z pierwszego wzlotu — to dwa
 *     różne momenty i podstawienie jednego pod drugi byłoby cichym przekłamaniem;
 *  2. zdany samolot znika z ekranu domowego, bo `day_close` kończy pracę z maszyną —
 *     ale NIE kończy dnia pilota (§3.6a: zdanie samolotu ≠ zamknięcie służby).
 *
 * Punkt 1 sprawdzamy na PRAWDZIWYM strumieniu przepuszczonym przez `projectSession`,
 * a nie na ręcznie ustawionym `claimedAt` — inaczej test potwierdzałby własne założenie
 * zamiast tego, że projekcja bierze godzinę z właściwego zdarzenia.
 */

import { buildHeldAircraft } from '../ui/screens/logic/heldAircraft';
import { emptySessionState, projectSession } from '../domain';
import type { Event, EventPayloadMap, EventType, SessionState } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
};

let seq = 0;

function ev<K extends EventType>(type: K, time: string, payload: EventPayloadMap[K]): Event {
  return {
    uuid: `e-${++seq}`,
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    picId: 'TMK',
    dualId: null,
    type,
    payload,
    deviceTime: at(time),
    gpsTime: null,
    schemaVersion: 2,
    syncedAt: null,
  } as Event;
}

/** Przejęcie 13:35, preflight 13:38, silnik 13:40 — trzy różne momenty. */
const claimed = (): Event[] => [
  ev('session_claim', '13:35', { mode: 'free' }),
  ev('preflight_confirm', '13:38', {
    operation: 'ferry',
    departureIcao: 'EPZG',
    arrivalIcao: 'EPPO',
    reading: { fuelL: 96, mh: 1239.65 },
    mhFormat: 'hhmm',
  }),
  ev('engine_start', '13:40', {}),
];

const session = (over: Partial<SessionState> = {}): SessionState => ({
  ...projectSession(claimed()),
  ...over,
});

beforeEach(() => {
  seq = 0;
});

describe('buildHeldAircraft', () => {
  it('składa drugą linię z chwili PRZEJĘCIA, nie z pierwszego wzlotu', () => {
    const vm = buildHeldAircraft(session());

    expect(vm).not.toBeNull();
    expect(vm!.aircraftId).toBe('SP-KLM');
    // 13:35 = claim. Gdyby model sięgnął po pierwszy wzlot, zobaczylibyśmy 13:40.
    expect(vm!.since).toBe('Twój od 13:35 UTC · Przelot');
    expect(vm!.engineRunning).toBe(true);
  });

  it('wyłączony silnik zmienia plakietkę stanu', () => {
    const vm = buildHeldAircraft(projectSession([...claimed(), ev('engine_stop', '15:10', {})]));

    expect(vm!.engineRunning).toBe(false);
    expect(vm!.engineLabel).toBe('Silnik wyłączony');
  });

  it('bez zdarzenia claimu mówi mniej, zamiast zmyślać godzinę', () => {
    // Sesja wczytana bez strumienia (np. z samego nagłówka) — `claimedAt` jest `null`.
    const vm = buildHeldAircraft(session({ claimedAt: null }));

    expect(vm!.since).toBe('Twój samolot · Przelot');
  });

  it('zdany samolot znika z ekranu domowego', () => {
    expect(buildHeldAircraft(session({ closed: true }))).toBeNull();
  });

  it('brak sesji to brak karty, nie karta pusta', () => {
    expect(buildHeldAircraft(emptySessionState())).toBeNull();
  });
});
