/**
 * UZ Aero — test logiki ZMIANY ZAŁOGI (ekran 07).
 *
 * Kluczowa jest atrybucja block time per pilot: Dual wchodzący w połowie dnia dostaje
 * czas WYŁĄCZNIE z cykli po swoim wejściu. Do dokumentów każdy wpisuje własny czas —
 * przybliżenie „wszyscy mają tyle co dzień" byłoby fałszem rozliczeniowym, którego
 * nikt nie zauważy aż do kontroli.
 */

import { NO_DUAL, blockSince, crewRows, dualChangeBlocker, dualSince } from '../ui/screens/crewChange';
import type { EngineRun, Event, SessionState } from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

const run = (from: number, to: number | null): EngineRun => ({
  startedAt: from,
  stoppedAt: to,
  durationMs: to != null ? to - from : 0,
});

function crewEvent(time: number, pilotInId: string | null): Event {
  return {
    uuid: `c-${time}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: pilotInId,
    type: 'crew_change',
    deviceTime: time,
    gpsTime: time,
    payload: { role: 'dual', pilotOutId: 'AKO', pilotInId },
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

describe('block time od wejścia do załogi', () => {
  const runs = [run(at(8, 12), at(10, 34)), run(at(11, 15), at(12, 28))]; // 2:22 + 1:13

  it('pilot obecny od początku dostaje pełny czas dnia', () => {
    expect(blockSince(runs, at(8, 0), at(13, 0))).toBe((2 * 60 + 22 + 60 + 13) * 60_000);
  });

  it('cykl sprzed wejścia liczy się tylko od momentu wejścia', () => {
    // Dual wszedł 10:00 — z pierwszego cyklu (8:12–10:34) należy mu się tylko 0:34.
    expect(blockSince(runs, at(10, 0), at(13, 0))).toBe((34 + 60 + 13) * 60_000);
  });

  it('cykl otwarty liczy się do „teraz", jak licznik na kokpicie', () => {
    const open = [run(at(11, 15), null)];
    expect(blockSince(open, at(8, 0), at(11, 45))).toBe(30 * 60_000);
  });

  it('wejście po wszystkich cyklach = zero, nie wartość ujemna', () => {
    expect(blockSince(runs, at(12, 30), at(13, 0))).toBe(0);
  });
});

describe('od kiedy Dual jest w załodze', () => {
  it('bez zmian załogi — od początku dnia', () => {
    expect(dualSince([], at(8, 0))).toBe(at(8, 0));
  });

  it('po zmianie — od OSTATNIEGO crew_change, nie pierwszego', () => {
    const events = [crewEvent(at(10, 40), 'PWI'), crewEvent(at(12, 30), 'JSE')];
    expect(dualSince(events, at(8, 0))).toBe(at(12, 30));
  });
});

describe('wiersze aktualnej załogi', () => {
  it('puste miejsce Duala jest wierszem, nie brakiem wiersza', () => {
    // Mockup zawsze pokazuje dwa wiersze — pusty DUAL to informacja, nie cisza.
    const projection = {
      picId: 'TMK',
      dualId: null,
      dutyStart: at(8, 0),
      engineRuns: [],
    } as unknown as SessionState;

    const rows = crewRows(projection, [], at(9, 0));
    expect(rows.map((r) => r.role)).toEqual(['PIC', 'DUAL']);
    expect(rows[1]!.pilotId).toBeNull();
    expect(rows[1]!.blockMs).toBe(0);
  });
});

describe('blokada zapisu zmiany Duala', () => {
  it('wymóg załogi 2-osobowej nie pozwala zostawić pustego miejsca', () => {
    const reason = dualChangeBlocker(NO_DUAL, 'AKO', true, 'Antonov An-2');
    expect(reason).toContain('2-osobowej');
  });

  it('bez wymogu — rezygnacja z Duala jest legalna', () => {
    expect(dualChangeBlocker(NO_DUAL, 'AKO', false, 'Cessna 182')).toBeNull();
  });

  it('zmiana na tę samą osobę nie jest zmianą', () => {
    expect(dualChangeBlocker('AKO', 'AKO', false, 'Cessna 182')).not.toBeNull();
  });

  it('zwykła podmiana przechodzi', () => {
    expect(dualChangeBlocker('PWI', 'AKO', true, 'Antonov An-2')).toBeNull();
  });
});
