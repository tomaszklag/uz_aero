/**
 * UZ Aero — model widoku ekranu 09 „Zamknij lot".
 *
 * Moduł odpowiada na trzy pytania, których widok nie ma prawa rozstrzygać sam, i to
 * właśnie one są tu przybite: KTÓRY wzlot zamykamy, CZY jest sekcja zrzutów i CZY
 * ostrzegamy o pominiętych odczytach.
 */

import { buildLegClose, SKIPPED_READINGS_WARNING } from '../ui/screens/logic/legClose';
import { emptySessionState } from '../domain';
import type { Event, EventPayloadMap, EventType, Leg, SessionState } from '../domain';

const DAY0 = Date.UTC(2026, 7, 6, 0, 0, 0);

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return DAY0 + (h! * 60 + m!) * 60_000;
};

let seq = 0;

function ev<K extends EventType>(type: K, time: string, payload: EventPayloadMap[K]): Event {
  return {
    uuid: `e-${++seq}-${type}`,
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    picId: 'tmk',
    dualId: null,
    type,
    payload,
    deviceTime: at(time),
    gpsTime: at(time),
    schemaVersion: 2,
    syncedAt: null,
  } as Event;
}

let legSeq = 0;

function leg(
  from: string,
  to: string,
  over: Partial<Leg> = {},
): Leg {
  return {
    index: ++legSeq,
    startedAt: at(from),
    stoppedAt: at(to),
    durationMs: at(to) - at(from),
    confirmed: false,
    confirmedAt: null,
    reading: null,
    notes: null,
    ...over,
  };
}

function session(over: Partial<SessionState>): SessionState {
  return {
    ...emptySessionState(),
    sessionUuid: 's-klm',
    aircraftId: 'SP-KLM',
    sessionPicId: 'tmk',
    operation: 'ferry',
    mhFormat: 'hhmm',
    mh: { start: 1239.65, end: null, deltaH: null },
    fuel: { startL: 96, addedL: 0, endL: null, consumedL: null, lastReadingL: 96 },
    ...over,
  };
}

beforeEach(() => {
  seq = 0;
  legSeq = 0;
});

describe('buildLegClose — który wzlot zamykamy', () => {
  it('bierze NAJSTARSZY niepotwierdzony, nie ostatni', () => {
    // Pilot pominął potwierdzenie pierwszego wzlotu i poleciał drugi raz.
    // Kolejka zaległości rozładowuje się od najstarszego — inaczej nigdy by się nie
    // rozładowała, a pilot dopisywałby odczyty do niewłaściwego wzlotu.
    const state = session({ legs: [leg('08:12', '09:05'), leg('10:20', '11:02')] });

    expect(buildLegClose(state, [])!.legIndex).toBe(1);
  });

  it('pomija wzloty już potwierdzone', () => {
    const state = session({
      legs: [
        leg('08:12', '09:05', { confirmed: true, confirmedAt: at('09:10') }),
        leg('10:20', '11:02'),
      ],
    });

    expect(buildLegClose(state, [])!.legIndex).toBe(2);
  });

  it('zwraca null, gdy nie ma czego zamykać — ekran nie ma prawa się otworzyć', () => {
    const closed = session({
      legs: [leg('08:12', '09:05', { confirmed: true, confirmedAt: at('09:10') })],
    });

    expect(buildLegClose(closed, [])).toBeNull();
    expect(buildLegClose(session({ legs: [] }), [])).toBeNull();
  });

  it('otwarty wzlot nie jest kandydatem — silnik jeszcze pracuje', () => {
    const running = session({
      legs: [{ ...leg('08:12', '09:05'), stoppedAt: null, durationMs: 0 }],
    });

    expect(buildLegClose(running, [])).toBeNull();
  });
});

describe('buildLegClose — czasy i wynik wzlotu', () => {
  const stream = (): Event[] => [
    ev('engine_start', '13:40', {}),
    ev('takeoff', '13:47', { method: 'auto' }),
    ev('landing', '15:08', { method: 'auto' }),
    ev('engine_stop', '15:10', {}),
  ];

  const state = (): SessionState =>
    session({
      legs: [leg('13:40', '15:10')],
      flights: [
        {
          index: 1,
          method: 'auto',
          takeoffAt: at('13:47'),
          landingAt: at('15:08'),
          durationMs: at('15:08') - at('13:47'),
          takeoffUuid: 't1',
          landingUuid: 'l1',
        },
      ],
    });

  it('czasy niosą źródło i adres korekty', () => {
    const vm = buildLegClose(state(), stream())!;

    expect(vm.times.map((t) => [t.key, t.value])).toEqual([
      ['Off block', '13:40'],
      ['Takeoff', '13:47'],
      ['Landing', '15:08'],
      ['On block', '15:10'],
    ]);
    // STOP ENGINE jest zawsze ręczny (§3.2) — plakietka ma to mówić.
    expect(vm.times[3]!.source).toBe('manual');
    expect(vm.times[1]!.source).toBe('auto');
    expect(vm.times.every((t) => t.targetUuid != null)).toBe(true);
  });

  it('wzlot bez startu pokazuje „—", a nie zmyśloną godzinę', () => {
    // Kołowanie techniczne: silnik chodził, samolot nie wzbił się w powietrze.
    const taxiOnly = session({ legs: [leg('13:40', '13:55')] });
    const vm = buildLegClose(taxiOnly, [ev('engine_start', '13:40', {})])!;

    expect(vm.times[1]!.value).toBe('—');
    expect(vm.times[1]!.source).toBeNull();
    expect(vm.summary.takeoffs).toBe(0);
  });

  it('pasek wyniku liczy blok i lot ze zdarzeń, nie z wpisu pilota', () => {
    const vm = buildLegClose(state(), stream())!;

    expect(vm.summary.blockLabel).toBe('1:30');
    expect(vm.summary.flightLabel).toBe('1:21');
    expect(vm.summary.landings).toBe(1);
  });

  it('czwartą komórkę wybiera MODEL, nie ekran: poza serią jest nią lotnisko', () => {
    const ferry = buildLegClose({ ...state(), arrivalIcao: 'EPZG' }, stream())!;

    expect(ferry.summary.trailing).toEqual({ value: 'EPZG', label: 'Lądowanie' });
  });

  it('w serii skokowej czwarta komórka liczy wzloty SESJI, nie doby', () => {
    // Doba pilota może objąć kilka maszyn (§3.6a), a ten ekran zna tylko jedną sesję —
    // podpis mówi więc o sesji zamiast obiecywać liczbę, której nie ma skąd wziąć.
    const jump = session({
      operation: 'skoki',
      legs: [
        leg('13:02', '13:24', { confirmed: true, confirmedAt: at('13:30') }),
        leg('13:40', '14:02'),
      ],
    });
    const drop = ev('drop', '13:50', {
      dropNumber: 7,
      altitudeFt: 2700,
      jumpers: { tandem: 4, aff: 2, solo: 0 },
    });

    expect(buildLegClose(jump, [drop])!.summary.trailing).toEqual({
      value: '2 / 2',
      label: 'Wzlot sesji',
    });
  });
});

describe('buildLegClose — sekcja zrzutów istnieje tylko w dniu skokowym', () => {
  const dropEvent = () =>
    ev('drop', '13:14', {
      dropNumber: 7,
      altitudeFt: 2700,
      jumpers: { tandem: 4, aff: 2, solo: 0 },
    });

  it('operacja skoki: zrzut podsumowany do przejrzenia', () => {
    const state = session({ operation: 'skoki', client: 'SKY CAMP', legs: [leg('13:02', '13:24')] });
    const drop = dropEvent();
    const vm = buildLegClose(state, [drop])!;

    expect(vm.drop).not.toBeNull();
    expect(vm.drop!.jumperCount).toBe(6);
    expect(vm.drop!.breakdown).toBe('4 TANDEM · 2 AFF · 0 SOLO');
    // Klient dziedziczony z preflightu — strona przychodowa dnia skokowego (§5.1).
    expect(vm.drop!.meta).toBe('2 700 ft · 13:14 UTC · SKY CAMP');
    // Bez adresu zdarzenia ołówek „Popraw zrzut" nie miałby celu.
    expect(vm.drop!.targetUuid).toBe(drop.uuid);
  });

  it('zrzut bez fixa GPS mówi o braku wysokości, zamiast pisać „0 ft"', () => {
    const state = session({ operation: 'skoki', legs: [leg('13:02', '13:24')] });
    const noFix = ev('drop', '13:14', {
      dropNumber: 7,
      altitudeFt: null,
      jumpers: { tandem: 4, aff: 2, solo: 0 },
    });

    expect(buildLegClose(state, [noFix])!.drop!.meta).toBe('13:14 UTC · bez fixa GPS');
  });

  it('operacja przelot: sekcji NIE MA, choćby zdarzenie zrzutu istniało', () => {
    // To brak sekcji, nie sekcja pusta (issue #19): zrzut przy przelocie nie mógł
    // się wydarzyć, więc ekran nie ma o co pytać.
    const state = session({ operation: 'ferry', legs: [leg('13:02', '13:24')] });

    expect(buildLegClose(state, [dropEvent()])!.drop).toBeNull();
  });

  it('operacja nieznana też nie dostaje sekcji — brak wiedzy nie jest zgodą', () => {
    const state = session({ operation: null, legs: [leg('13:02', '13:24')] });

    expect(buildLegClose(state, [dropEvent()])!.drop).toBeNull();
  });
});

describe('buildLegClose — pominięte odczyty liczników', () => {
  /** Godzina dwucyfrowa — bez tego szósty wzlot dostaje „013:00" i cicho psuje test. */
  const hh = (i: number): string => String(8 + i).padStart(2, '0');

  const withLegs = (count: number, readingOn: number[] = []) =>
    session({
      operation: 'skoki',
      legs: Array.from({ length: count }, (_, i) =>
        leg(`${hh(i)}:00`, `${hh(i)}:30`, {
          confirmed: i < count - 1,
          confirmedAt: i < count - 1 ? at(`${hh(i)}:35`) : null,
          reading: readingOn.includes(i + 1) ? { fuelL: 120, mh: 1240 } : null,
        }),
      ),
    });

  it('liczy wstecz i przerywa na pierwszym wzlocie Z odczytem', () => {
    // Odczyt przy wzlocie 2 → wstecz od wzlotu 5 są dokładnie dwa bez odczytu (3 i 4).
    const vm = buildLegClose(withLegs(5, [2]), [])!;

    expect(vm.legIndex).toBe(5);
    expect(vm.skippedReadings).toBe(2);
    expect(vm.warnSkippedReadings).toBe(false);
  });

  it(`ostrzeżenie warunkowe zapala się dopiero po ${SKIPPED_READINGS_WARNING} z rzędu`, () => {
    expect(buildLegClose(withLegs(5), [])!.warnSkippedReadings).toBe(false);
    expect(buildLegClose(withLegs(6), [])!.warnSkippedReadings).toBe(true);
  });

  it('podpowiedź MH bierze ostatni odczyt z wzlotu, nie z przejęcia', () => {
    const vm = buildLegClose(withLegs(3, [2]), [])!;

    // Odczyt wzlotu 2 (1240) wygrywa nad odczytem startowym sesji (1239.65).
    expect(vm.mhHint).toContain('1240:00');
  });

  it('bez żadnego odczytu podpowiedź mówi wprost, że trzeba wpisać z licznika', () => {
    const state = session({ mh: { start: null, end: null, deltaH: null }, legs: [leg('08:12', '09:05')] });

    expect(buildLegClose(state, [])!.mhHint).toBe('brak odczytu startowego — wpisz z licznika');
  });
});
