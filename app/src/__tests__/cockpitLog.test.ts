/**
 * UZ Aero - test LOGU KOKPITU (mockupy 04, 04B, 05).
 *
 * Log jest jedynym potwierdzeniem zapisu, jakie widzi pilot - jeśli pokaże złe czasy,
 * błąd nie objawi się niczym innym niż niepoprawnym wpisem w arkuszu na koniec miesiąca.
 *
 * Od issue #44 kokpit rysuje TĘ SAMĄ oś, co rozliczenie (10): kształt wierszy pilnuje
 * `sessionAxis.test.ts`, a ten plik sprawdza wyłącznie to, co kokpit dokłada od siebie -
 * wiersz „na żywo", znaczniki outboxa, stopkę sum i bramkę karty logu.
 */

import { buildCockpitAxis, buildPeekAxis } from '../ui/screens/logic/cockpitLog';
import { projectSession } from '../domain';
import type { Event, EventOf, EventType } from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event<T extends EventType>(
  type: T,
  time: number,
  payload: EventOf<T>['payload'],
  options: { uuid?: string; synced?: boolean } = {},
): Event {
  seq += 1;
  return {
    uuid: options.uuid ?? `e-${seq}`,
    sessionUuid: 's1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    syncedAt: options.synced === false ? null : time,
  } as Event;
}

/** Sesja z mockupu 04: tankowanie, bieg silnika z dwoma lotami, dolewka po zatrzymaniu. */
function sessionEvents(): Event[] {
  seq = 0;
  return [
    event('session_claim', at(10, 58), { mode: 'free' }),
    event('preflight_confirm', at(10, 58), {
      operation: 'skoki',
      departureIcao: 'EPKK',
      reading: { fuelL: 112, mh: 1236.5 },
      mhFormat: 'hhmm',
    }),
    event('refuel', at(11, 10), { beforeL: 112, addedL: 48, afterL: 160 }, { uuid: 'refuel-1' }),
    event('engine_start', at(11, 15), {}, { uuid: 'engine-on' }),
    event('taxi', at(11, 26), { method: 'auto' }, { uuid: 'taxi-1' }),
    event('takeoff', at(11, 28), { method: 'auto' }, { uuid: 'to-1' }),
    event('landing', at(11, 50), { method: 'auto' }, { uuid: 'ldg-1' }),
    event('takeoff', at(11, 58), { method: 'auto' }, { uuid: 'to-2' }),
    event('landing', at(12, 15), { method: 'auto' }, { uuid: 'ldg-2' }),
    event('engine_stop', at(12, 28), {}, { uuid: 'engine-off' }),
  ];
}

function axis(events: Event[], now = at(12, 40)) {
  return buildCockpitAxis(events, projectSession(events), now);
}

describe('log kokpitu = oś operacji (issue #44)', () => {
  it('zaczyna się PRZEJĘCIEM z odczytem, a nie chipami przy uruchomieniu silnika', () => {
    // Do issue #44 kokpit pomijał przejęcie, a odczyt startowy wisiał jako chipy „MH …"
    // i „112 L" przy „Start engine" - przy zdarzeniu, które go nie wykonało.
    const { rows } = axis(sessionEvents());

    expect(rows[0]!.kind).toBe('claim');
    expect(rows[0]!.time).toBe('10:58');
    expect(rows[0]!.sub).toBe('paliwo 112 L · 1236:30');
    expect(rows.find((r) => r.kind === 'engineStart')!.sub).toBeNull();
  });

  it('tankowanie jest zwykłym wierszem osi, przed uruchomieniem i po zatrzymaniu', () => {
    const zDolewka = [
      ...sessionEvents(),
      event('refuel', at(12, 35), { beforeL: 130, addedL: 60, afterL: 190 }, { uuid: 'refuel-2' }),
    ];
    const { rows } = axis(zDolewka);

    expect(rows.map((r) => `${r.time} ${r.kind}`)).toEqual([
      '10:58 claim',
      '11:10 refuel',
      '11:15 engineStart',
      '11:26 taxi',
      '11:28 takeoff',
      '11:50 landing',
      '11:58 takeoff',
      '12:15 landing',
      '12:28 engineStop',
      '12:35 refuel',
    ]);
    expect(rows.find((r) => r.id === 'refuel-2')!.sub).toBe('+60 L → 190 L');
  });

  it('kołowanie nie dostaje czasu trwania, a wyłączenie podpisu „blok"', () => {
    // Czas kołowania materializował się dopiero przy starcie, więc nigdy nie pomógł
    // temu, kto właśnie kołuje. Czas blokowy jest sumą SESJI i mieszka w stopce.
    const { rows } = axis(sessionEvents());

    expect(rows.find((r) => r.kind === 'taxi')!.duration).toBeNull();
    expect(rows.find((r) => r.kind === 'engineStop')!.sub).toBeNull();
  });

  it('czas lotu stoi przy lądowaniu, numer lotu przy starcie', () => {
    const { rows } = axis(sessionEvents());

    expect(rows.filter((r) => r.kind === 'landing').map((r) => r.duration)).toEqual([
      '00:22',
      '00:17',
    ]);
    expect(rows.filter((r) => r.kind === 'takeoff').map((r) => r.flight)).toEqual([
      'lot 1',
      'lot 2',
    ]);
  });
});

describe('wiersz „na żywo"', () => {
  it('w powietrzu liczy OD STARTU i nazywa stan po polsku', () => {
    const wPowietrzu = sessionEvents().filter(
      (e) => e.uuid !== 'ldg-2' && e.uuid !== 'engine-off',
    );
    const { rows } = axis(wPowietrzu, at(12, 30));
    const live = rows[rows.length - 1]!;

    expect(live.kind).toBe('live');
    expect(live.name).toBe('W locie…');
    // Bez godziny w lewej kolumnie: to nie jest zdarzenie rejestru, tylko czas trwania,
    // a te w tej osi stoją PO PRAWEJ.
    expect(live.time).toBe('');
    expect(live.duration).toBe('00:32:00');
    expect(live.targetUuid).toBeNull();
  });

  it('na ziemi z pracującym silnikiem liczy OD URUCHOMIENIA', () => {
    const naZiemi = sessionEvents().filter((e) => e.uuid !== 'engine-off');
    const { rows } = axis(naZiemi, at(12, 20));
    const live = rows[rows.length - 1]!;

    expect(live.name).toBe('Silnik pracuje…');
    expect(live.duration).toBe('01:05:00');
  });

  it('po zatrzymaniu silnika wiersza nie ma', () => {
    expect(axis(sessionEvents()).rows.some((r) => r.kind === 'live')).toBe(false);
  });
});

describe('znacznik outboxa', () => {
  it('oznacza wiersze zdarzeń, które czekają na wysyłkę', () => {
    const zKolejka = sessionEvents().map((e) =>
      e.uuid === 'to-2' ? ({ ...e, syncedAt: null } as Event) : e,
    );
    const { rows } = axis(zKolejka);

    expect(rows.filter((r) => r.pending === true).map((r) => r.id)).toEqual(['to-2']);
  });

  it('sięga też końców osi, bo one też są zdarzeniami rejestru', () => {
    // Przejęcie ma własne `id` (pochodzi z projekcji), ale niesie je `preflight_confirm`
    // - i to jego stan wysyłki opisujemy, przez `targetUuid`.
    const zKolejka = sessionEvents().map((e) =>
      e.type === 'preflight_confirm' ? ({ ...e, syncedAt: null } as Event) : e,
    );
    const claim = axis(zKolejka).rows.find((r) => r.kind === 'claim')!;

    expect(claim.pending).toBe(true);
  });
});

describe('stopka i bramka karty', () => {
  it('sumy pojawiają się dopiero po zatrzymaniu silnika', () => {
    const wLocie = sessionEvents().filter((e) => e.uuid !== 'engine-off');

    expect(axis(wLocie, at(12, 20)).foot).toEqual([]);
    expect(axis(sessionEvents()).foot.map((i) => `${i.key} ${i.value}`)).toEqual([
      'Blok 01:13',
      'Czas lotu 00:39',
      'Starty 2',
    ]);
  });

  it('stopka NIE powtarza trasy - ta stoi w pasku górnym kokpitu', () => {
    expect(axis(sessionEvents()).foot.some((i) => i.id === 'route')).toBe(false);
  });

  it('karta logu zapala się dopiero przy zdarzeniu operacyjnym (issue #19)', () => {
    const poUruchomieniu = sessionEvents().filter(
      (e) => e.type === 'session_claim' || e.type === 'preflight_confirm' || e.uuid === 'engine-on',
    );
    // Przejęcie + uruchomienie + „na żywo" to jeszcze nie przebieg sesji.
    expect(axis(poUruchomieniu, at(11, 20)).hasEvents).toBe(false);

    const zKolowaniem = [...poUruchomieniu, event('taxi', at(11, 26), { method: 'auto' })];
    expect(axis(zKolowaniem, at(11, 30)).hasEvents).toBe(true);
  });

  it('samo tankowanie przed startem też zapala kartę', () => {
    const przedStartem = sessionEvents().filter(
      (e) =>
        e.type === 'session_claim' || e.type === 'preflight_confirm' || e.uuid === 'refuel-1',
    );

    expect(axis(przedStartem, at(11, 12)).hasEvents).toBe(true);
  });
});

describe('podgląd cudzej operacji (04B)', () => {
  it('nie ma wiersza „na żywo" ani znaczników outboxa', () => {
    // Outbox opisuje TEN telefon; cudze zdarzenia przyszły z serwera, więc strzałka
    // mówiłaby o kolejce, której nie znamy. Migawka nie jest też podglądem na żywo.
    const cudza = sessionEvents()
      .filter((e) => e.uuid !== 'engine-off')
      .map((e) => ({ ...e, syncedAt: null }) as Event);
    const rows = buildPeekAxis(cudza, projectSession(cudza), at(12, 30));

    expect(rows.some((r) => r.kind === 'live')).toBe(false);
    expect(rows.every((r) => r.pending == null)).toBe(true);
  });
});
