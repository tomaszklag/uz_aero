/**
 * Ninerdeck - testy CICHEGO ODŚWIEŻENIA po sygnale kanału klubu
 * (`ui/screens/logic/liveRefresh.ts`, `aircraftOperationsPage.ts`; 4.0.0, epik KK-C #246).
 *
 * Pod obserwacją dwie reguły, które odróżniają sygnał z kanału od wejścia na ekran:
 *  - odpowiedź, której nie było, nie zamienia wiedzy w niewiedzę;
 *  - świeża pierwsza strona historii samolotu nie zwija listy, którą pilot doładował -
 *    nowe operacje wchodzą na górę, starsze strony i kursor zostają.
 */

import type { RemoteAircraftOperation, RemoteAircraftOperations } from '../application/ports';
import { mergeFirstPage, operationsPage } from '../ui/screens/logic/aircraftOperationsPage';
import { quietResult } from '../ui/screens/logic/liveRefresh';

describe('ciche odświeżenie', () => {
  it('odpowiedź zastępuje to, co ekran pokazywał', () => {
    expect(quietResult({ v: 1 }, { v: 2 })).toEqual({ v: 2 });
    expect(quietResult(null, { v: 2 })).toEqual({ v: 2 });
    expect(quietResult(undefined, { v: 2 })).toEqual({ v: 2 });
  });

  it('brak odpowiedzi nie zamienia wiedzy w niewiedzę - ekran zostaje przy tym, co pokazywał', () => {
    expect(quietResult({ v: 1 }, null)).toEqual({ v: 1 });
  });

  it('ekran, który nie wiedział, dalej nie wie', () => {
    expect(quietResult(null, null)).toBeNull();
    expect(quietResult(undefined, null)).toBeNull();
  });
});

const op = (uuid: string): RemoteAircraftOperation => ({
  sessionUuid: uuid,
  at: '2026-10-05T08:00:00.000Z',
  pilotId: 'p1',
  dualId: null,
  operation: 'skoki',
  status: 'closed',
  manualEntry: false,
  flights: 1,
  blockMs: 3_600_000,
  flightMs: 3_000_000,
  mhStart: null,
  mhEnd: null,
  fuelStartL: null,
  fuelEndL: null,
  fuelAddedL: null,
} as RemoteAircraftOperation);

const ops = (...uuids: string[]) => uuids.map(op);
const range = (from: number, to: number, prefix = 'o') =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const cursor = (uuid: string) => ({ beforeAt: '2026-10-05T08:00:00.000Z', beforeUuid: uuid });

/** Strona z serwera: `items`, łączna liczba i kursor za ostatnim wierszem (albo koniec). */
const wire = (uuids: string[], total: number, more: boolean): RemoteAircraftOperations => ({
  total,
  items: ops(...uuids),
  next: more ? cursor(uuids[uuids.length - 1]!) : null,
});

const uuidsOf = (items: RemoteAircraftOperation[]) => items.map((i) => i.sessionUuid);

describe('pierwsza strona historii po sygnale', () => {
  it('nowa operacja wchodzi na górę; doładowany ogon i jego kursor zostają', () => {
    // Pilot widział o1…o60 (dwie strony); przyszła nowa operacja n1.
    const loaded = operationsPage(wire(range(31, 60), 100, true), ops(...range(1, 30)));
    const merged = mergeFirstPage(wire(['n1', ...range(1, 29)], 101, true), loaded);

    expect(uuidsOf(merged.items)).toEqual(['n1', ...range(1, 60)]);
    expect(merged.next).toEqual(cursor('o60'));
    expect(merged.total).toBe(101);
    expect(merged.remaining).toBe(101 - 61);
  });

  it('operacja, która zniknęła z historii (unieważniona), znika też z listy', () => {
    const loaded = operationsPage(wire(range(1, 30), 40, true), []);
    // o5 wycofana - świeża strona sięga o jedną operację głębiej.
    const fresh = wire([...range(1, 4), ...range(6, 31)], 39, true);
    const merged = mergeFirstPage(fresh, loaded);

    expect(uuidsOf(merged.items)).toEqual([...range(1, 4), ...range(6, 31)]);
    expect(merged.next).toEqual(cursor('o31'));
    expect(merged.remaining).toBe(39 - 30);
  });

  it('pierwsza strona bez kursora to CAŁA historia - nic z doładowanego nie zostaje', () => {
    const loaded = operationsPage(wire(range(1, 3), 3, false), []);
    const merged = mergeFirstPage(wire(['n1', ...range(1, 3)], 4, false), loaded);
    expect(uuidsOf(merged.items)).toEqual(['n1', 'o1', 'o2', 'o3']);
    expect(merged.next).toBeNull();
    expect(merged.remaining).toBe(0);
  });

  it('świeża strona bez punktu styku z doładowaną zastępuje listę', () => {
    const loaded = operationsPage(wire(range(1, 30), 60, true), []);
    const fresh = wire(range(1, 30, 'n'), 90, true);
    const merged = mergeFirstPage(fresh, loaded);
    expect(uuidsOf(merged.items)).toEqual(range(1, 30, 'n'));
    expect(merged.next).toEqual(cursor('n30'));
  });

  it('bez wczytanej listy świeża strona jest po prostu pierwszą stroną', () => {
    expect(mergeFirstPage(wire(range(1, 2), 2, false), null)).toEqual(operationsPage(wire(range(1, 2), 2, false), []));
    expect(mergeFirstPage(wire(range(1, 2), 2, false), undefined)).toEqual(
      operationsPage(wire(range(1, 2), 2, false), []),
    );
  });
});
