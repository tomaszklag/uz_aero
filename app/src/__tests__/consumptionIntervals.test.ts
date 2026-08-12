/**
 * UZ Aero — test ekstrakcji interwałów paliwowych i równania motogodzin.
 *
 * Interwał jest jednostką, na której stoi cała analityka: jeśli granice wypadną w złym
 * miejscu albo czas pracy silnika policzy się nie z tego okna, model dostanie liczby
 * bez sensu — i wypluje stawkę, która będzie wyglądać zupełnie wiarygodnie. Dlatego
 * test odwzorowuje kanoniczny dzień 22 JUNE z `docs/design-notes.md` (te same liczby,
 * co mockupy 04/06/10) i sprawdza granice, a nie zapamiętane wyniki.
 */

import {
  buildFuelIntervals,
  MIN_INTERVAL_ENGINE_MS,
  publicationGate,
  type Event,
} from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event<T extends Event['type']>(type: T, time: number, payload: unknown = {}): Event {
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

// Payloady BEZ pól klamry służby (`dutyStart`/`dutyEnd` znikły z modelu — issue #23).
const preflight = (time: number, fuelL: number, mh = 1234.5): Event =>
  event('preflight_confirm', time, {
    operation: 'skoki',
    reading: { fuelL, mh },
  });

const dayClose = (time: number, fuelL: number, mh: number): Event =>
  event('day_close', time, { finalReading: { fuelL, mh } });

/**
 * Kanoniczny dzień: preflight 150 L, cykl 08:12–10:34 (blok 2:22), tankowanie 10:48
 * (112 → 160 L), drugi cykl 11:15–12:28 (blok 1:13), zamknięcie 13:00 przy 141 L.
 */
function canonicalDay(): Event[] {
  return [
    preflight(at(8, 0), 150),
    event('engine_start', at(8, 12)),
    event('takeoff', at(8, 25), { method: 'auto' }),
    event('landing', at(9, 18), { method: 'auto' }),
    event('engine_stop', at(10, 34)),
    event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 }),
    event('engine_start', at(11, 15)),
    event('takeoff', at(11, 28), { method: 'auto' }),
    event('landing', at(12, 15), { method: 'auto' }),
    event('engine_stop', at(12, 28)),
    dayClose(at(13, 0), 141, 1238.1),
  ];
}

describe('granice interwałów paliwowych', () => {
  it('tankowanie zamyka jeden interwał i otwiera następny', () => {
    const { intervals } = buildFuelIntervals(canonicalDay());

    expect(intervals).toHaveLength(2);
    expect(intervals[0]!.startKind).toBe('preflight');
    expect(intervals[0]!.endKind).toBe('refuel');
    expect(intervals[1]!.startKind).toBe('refuel');
    expect(intervals[1]!.endKind).toBe('day_close');
  });

  it('liczy zużycie jako różnicę odczytów, bez arytmetyki dolewki', () => {
    const [first, second] = buildFuelIntervals(canonicalDay()).intervals;

    expect(first!.consumedL).toBe(38); // 150 → 112
    expect(second!.consumedL).toBe(19); // 160 → 141
  });

  it('bierze czas pracy silnika z okna interwału, nie z całego dnia', () => {
    const [first, second] = buildFuelIntervals(canonicalDay()).intervals;

    expect(first!.engineMs).toBe((2 * 60 + 22) * 60_000);
    expect(second!.engineMs).toBe((60 + 13) * 60_000);
    expect(first!.flightMs).toBe(53 * 60_000);
    expect(first!.groundMs).toBe(first!.engineMs - first!.flightMs);
  });

  it('nie produkuje ostatniego interwału, dopóki dzień nie jest zamknięty', () => {
    // Bez odczytu końcowego nie wiadomo, ile paliwa ubyło — a nie zgadujemy.
    const open = canonicalDay().filter((e) => e.type !== 'day_close');
    const { intervals } = buildFuelIntervals(open);

    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.endKind).toBe('refuel');
  });

  it('liczy tylko loty zawarte w całości w oknie', () => {
    const [first, second] = buildFuelIntervals(canonicalDay()).intervals;
    expect(first!.flightCount).toBe(1);
    expect(second!.flightCount).toBe(1);
  });
});

describe('korekty zmieniają granice, bo strumień efektywny jest wejściem', () => {
  it('unieważnione tankowanie SCALA dwa interwały w jeden', () => {
    const events = canonicalDay();
    const refuel = events.find((e) => e.type === 'refuel')!;
    const withVoid = [
      ...events,
      event('event_correction', at(14, 0), { targetUuid: refuel.uuid, action: 'void' }),
    ];

    const { intervals } = buildFuelIntervals(withVoid);

    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.startKind).toBe('preflight');
    expect(intervals[0]!.endKind).toBe('day_close');
    // Zużycie liczy się teraz z dwóch skrajnych odczytów — dolewki nie było.
    expect(intervals[0]!.consumedL).toBe(150 - 141);
  });

  it('przesunięty czas zdarzenia przesuwa granicę i zmienia czasy obu sąsiadów', () => {
    const events = canonicalDay();
    const refuel = events.find((e) => e.type === 'refuel')!;
    const shifted = [
      ...events,
      event('event_correction', at(14, 0), {
        targetUuid: refuel.uuid,
        action: 'retime',
        newTime: at(11, 20), // tankowanie „przesunięte" w środek drugiego cyklu
      }),
    ];

    const [first, second] = buildFuelIntervals(shifted).intervals;

    // Pierwszy interwał obejmuje teraz także pierwsze 5 minut drugiego cyklu.
    expect(first!.engineMs).toBe((2 * 60 + 22 + 5) * 60_000);
    expect(second!.engineMs).toBe((60 + 13 - 5) * 60_000);
  });
});

describe('bramka wejścia — co nie ma prawa wejść do regresji', () => {
  it('odrzuca interwał, w którym paliwa PRZYBYŁO bez tankowania', () => {
    const events = [
      preflight(at(8, 0), 100),
      event('engine_start', at(8, 10)),
      event('engine_stop', at(9, 40)),
      dayClose(at(10, 0), 120, 1236.0), // odczyt wyższy niż startowy
    ];

    const [interval] = buildFuelIntervals(events).intervals;

    expect(interval!.rejected).toBe('negative-consumption');
    // Wiersz ZOSTAJE w wyniku — to materiał do wyjaśnienia przy dniu, nie szum.
    expect(interval!.consumedL).toBe(-20);
  });

  it('odrzuca interwał krótszy niż próg pracy silnika', () => {
    const events = [
      preflight(at(8, 0), 100),
      event('engine_start', at(8, 10)),
      event('engine_stop', at(8, 30)), // 20 min < 30 min
      dayClose(at(9, 0), 92, 1234.8),
    ];

    const [interval] = buildFuelIntervals(events).intervals;

    expect(interval!.engineMs).toBeLessThan(MIN_INTERVAL_ENGINE_MS);
    expect(interval!.rejected).toBe('engine-too-short');
  });

  it('odrzuca interwał bez pracy silnika', () => {
    const events = [
      preflight(at(8, 0), 100),
      dayClose(at(9, 0), 98, 1234.5),
    ];

    expect(buildFuelIntervals(events).intervals[0]!.rejected).toBe('no-engine');
  });

  it('bramka publikacji liczy tylko interwały przyjęte', () => {
    const gate = publicationGate(buildFuelIntervals(canonicalDay()).intervals);

    expect(gate.intervals).toBe(2);
    expect(gate.published).toBe(false);
    expect(gate.missingIntervals).toBe(3);
  });
});

describe('równanie motogodzin dnia', () => {
  it('powstaje dopiero z odczytem końcowym licznika', () => {
    const open = canonicalDay().filter((e) => e.type !== 'day_close');
    expect(buildFuelIntervals(open).mh).toBeNull();
  });

  it('rozdziela czas dnia na lot i ziemię', () => {
    const { mh } = buildFuelIntervals(canonicalDay());

    expect(mh).not.toBeNull();
    expect(mh!.deltaMh).toBeCloseTo(1238.1 - 1234.5, 6);
    expect(mh!.flightMs).toBe((53 + 47) * 60_000);
    expect(mh!.groundMs).toBe((2 * 60 + 22 + 60 + 13) * 60_000 - (53 + 47) * 60_000);
    expect(mh!.clamped).toBe(false);
  });
});

describe('bramka górna — znaleziona przebiegiem po realnej historii (2026-08-05)', () => {
  it('odrzuca interwał, w którym silnik „pracował" dłużej niż dzień lotny', () => {
    // Prawdziwy przypadek z bazy: `engine_start` 27 JUL 19:00, `engine_stop` 29 JUL
    // 11:33 — czterdzieści godzin przez dwie noce. To zapomniane wyłączenie, nie lot;
    // mianownik jest wtedy fikcją, a stawka z niego byłaby fikcją pomnożoną przez paliwo.
    const events = [
      preflight(at(8, 0), 300),
      event('engine_start', at(8, 10)),
      event('engine_stop', at(8, 10) + 40 * 3_600_000),
      dayClose(at(8, 10) + 41 * 3_600_000, 100, 1240.0),
    ];

    const [interval] = buildFuelIntervals(events).intervals;

    expect(interval!.rejected).toBe('engine-too-long');
    // Wiersz ZOSTAJE — to jest ślad rozjazdu w rejestrze, a nie szum do ukrycia.
    expect(interval!.consumedL).toBe(200);
  });

  it('długi, ale realny dzień lotny przechodzi', () => {
    // Antonow przy skokach robi 8–10 h silnika dziennie. Próg nie ma prawa go uciąć.
    const events = [
      preflight(at(6, 0), 300),
      event('engine_start', at(6, 10)),
      event('engine_stop', at(15, 40)), // 9,5 h
      dayClose(at(16, 0), 100, 1244.0),
    ];

    expect(buildFuelIntervals(events).intervals[0]!.rejected).toBeNull();
  });
});

/**
 * Zamknięcie wzlotu jako granica interwału (etap B4, §3.6b).
 *
 * Odczyt przy `leg_close` jest OPCJONALNY, więc ten sam dzień daje różną liczbę
 * interwałów w zależności od tego, czy pilot go zrobił. To nie jest niedoskonałość
 * implementacji — to bezpośrednia konsekwencja decyzji z §3.6 i dokładnie ten kompromis,
 * który §3.6b opisuje jako znane ryzyko.
 */
describe('interwały paliwowe — sesja domknięta odczytami z obu stron (2026-08-10)', () => {
  // Do 2026-08-10 stał tu blok `leg_close`: odczyt przy wzlocie dzielił sesję na dwa
  // interwały, a jego brak zostawiał jeden. Pivot skasował zdarzenie — granice stawia
  // wyłącznie przejęcie, tankowanie i zdanie, a KAŻDA sesja jest domknięta z obu stron.
  it('sesja bez tankowań to dokładnie JEDEN interwał: przejęcie → zdanie', () => {
    const { intervals } = buildFuelIntervals([
      preflight(at(8, 0), 150),
      event('engine_start', at(8, 12)),
      event('takeoff', at(8, 25), { method: 'auto' }),
      event('landing', at(9, 18), { method: 'auto' }),
      event('takeoff', at(9, 40), { method: 'auto' }),
      event('landing', at(10, 55), { method: 'auto' }),
      event('engine_stop', at(11, 10)),
      dayClose(at(11, 20), 108, 1236.9),
    ]);

    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.startKind).toBe('preflight');
    expect(intervals[0]!.endKind).toBe('day_close');
    expect(intervals[0]!.consumedL).toBeCloseTo(42, 6); // 150 → 108
  });
});
