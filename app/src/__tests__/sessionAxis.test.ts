/**
 * UZ Aero — test OSI CZASU sesji (ekran 10, issue #38 pkt 7 i 8).
 *
 * Oś zastąpiła tabelę lotów i przejęła jej najważniejszą rolę: prowadzi do KOREKTY.
 * Wiersz bez poprawnego uuid wygląda dobrze i nie robi nic — dlatego test sprawdza
 * adresy zdarzeń tak samo uważnie jak kolejność.
 *
 * Scenariusz jest ten sam, co w mockupie 10: przejęcie 08:04, silnik 08:12 → 09:55,
 * dwa loty (08:20–09:01 i 09:12–09:47), dwa zrzuty, zdanie 11:20.
 */

import { buildSessionAxis } from '../ui/screens/logic/sessionAxis';
import { projectSession } from '../domain';
import type { Event, EventOf, EventType, SessionState } from '../domain';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;

/** Zdarzenie w strumieniu sesji — nagłówek minimalny, tyle ile czyta projekcja. */
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
    dualId: 'AKO',
    deviceTime: time,
    gpsTime: time,
    schemaVersion: 1,
    syncedAt: null,
    payload,
  } as Event;
}

/** Kanoniczna sesja z mockupu 10 — dwa loty, dwa zrzuty, komplet odczytów. */
function sessionEvents(): Event[] {
  seq = 0;
  return [
    event('session_claim', at(8, 4), { mode: 'free' }),
    event('preflight_confirm', at(8, 4), {
      operation: 'skoki',
      departureIcao: 'EPZG',
      reading: { fuelL: 150, mh: 1234.5 },
      mhFormat: 'hhmm',
    }),
    event('engine_start', at(8, 12), {}, 'engine-on'),
    event('takeoff', at(8, 20), { method: 'auto' }, 'to-1'),
    event('drop', at(8, 52), {
      dropNumber: 1,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
      altitudeFt: 12_800,
    }, 'drop-1'),
    event('landing', at(9, 1), { method: 'auto' }, 'ldg-1'),
    event('takeoff', at(9, 12), { method: 'manual' }, 'to-2'),
    event('drop', at(9, 33), {
      dropNumber: 2,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
      altitudeFt: 12_600,
    }, 'drop-2'),
    event('landing', at(9, 47), { method: 'manual' }, 'ldg-2'),
    event('engine_stop', at(9, 55), {}, 'engine-off'),
    event('day_close', at(11, 20), { finalReading: { fuelL: 171, mh: 1234.5 + 95 / 60 } }),
  ];
}

function axis(events: Event[] = sessionEvents(), now = at(12, 0)) {
  return buildSessionAxis(projectSession(events), events, now);
}

describe('oś sesji', () => {
  it('idzie chronologicznie od przejęcia do zdania', () => {
    const { rows } = axis();

    expect(rows.map((row) => `${row.time} ${row.kind}`)).toEqual([
      '08:04 claim',
      '08:12 engineStart',
      '08:20 takeoff',
      '08:52 drop',
      '09:01 landing',
      '09:12 takeoff',
      '09:33 drop',
      '09:47 landing',
      '09:55 engineStop',
      '11:20 release',
    ]);
  });

  it('wiersz korekty celuje w uuid zdarzenia, a końce sesji ołówka nie mają', () => {
    const { rows } = axis();
    const byKind = (kind: string) => rows.filter((row) => row.kind === kind);

    expect(byKind('takeoff').map((row) => row.id)).toEqual(['to-1', 'to-2']);
    expect(byKind('landing').map((row) => row.id)).toEqual(['ldg-1', 'ldg-2']);
    expect(byKind('drop').map((row) => row.id)).toEqual(['drop-1', 'drop-2']);
    expect(byKind('engineStart')[0]!.id).toBe('engine-on');

    // Przejęcie i zdanie koryguje się ODCZYTAMI, nie czasem — ołówka przy nich nie ma.
    expect(rows.find((row) => row.kind === 'claim')!.correctable).toBe(false);
    expect(rows.find((row) => row.kind === 'release')!.correctable).toBe(false);
  });

  it('plakietkę dostaje WYŁĄCZNIE wpis ręczny (issue #38 pkt 10)', () => {
    const { rows } = axis();
    const manual = rows.filter((row) => row.manual);

    expect(manual.map((row) => row.id)).toEqual(['to-2', 'ldg-2']);
  });

  it('czas lotu stoi przy lądowaniu, nie przy starcie', () => {
    const { rows } = axis();

    expect(rows.filter((row) => row.kind === 'landing').map((row) => row.duration)).toEqual([
      '00:41',
      '00:35',
    ]);
    expect(rows.filter((row) => row.kind === 'takeoff').every((row) => row.duration == null)).toBe(
      true,
    );
  });

  it('końce osi niosą odczyty, do których odwołują się rachunki niżej', () => {
    const { rows } = axis();

    expect(rows.find((row) => row.kind === 'claim')!.sub).toBe('odczyt 150 L · 1234:30');
    expect(rows.find((row) => row.kind === 'release')!.sub).toBe('odczyt 171 L · 1236:05');
  });

  it('zrzut niesie skład i wysokość; brak obu nie robi pustego podpisu', () => {
    const { rows } = axis();
    expect(rows.find((row) => row.id === 'drop-1')!.sub).toBe('4 skoczków · 12 800 ft');

    const bezSkladu = sessionEvents().map((e) =>
      e.uuid === 'drop-1'
        ? ({ ...e, payload: { dropNumber: 1, jumpers: null, altitudeFt: null } } as Event)
        : e,
    );
    expect(axis(bezSkladu).rows.find((row) => row.id === 'drop-1')!.sub).toBeNull();
  });

  it('lot w powietrzu nie znika z osi — brakuje mu tylko lądowania', () => {
    const wPowietrzu = sessionEvents().filter(
      (e) => e.uuid !== 'ldg-2' && e.uuid !== 'engine-off' && e.type !== 'day_close',
    );
    const { rows } = axis(wPowietrzu);

    expect(rows.filter((row) => row.kind === 'takeoff')).toHaveLength(2);
    expect(rows.filter((row) => row.kind === 'landing')).toHaveLength(1);
    expect(rows.some((row) => row.kind === 'release')).toBe(false);
  });

  it('przy identycznym stemplu decyduje porządek przyczynowy', () => {
    // Wpis ręczny potrafi dać startowi tę samą minutę, co uruchomieniu silnika.
    // Oś czytana z góry na dół nie może wtedy sugerować startu przed uruchomieniem.
    const rowne = sessionEvents().map((e) =>
      e.uuid === 'to-1' ? ({ ...e, deviceTime: at(8, 12), gpsTime: at(8, 12) } as Event) : e,
    );
    const kinds = axis(rowne).rows.map((row) => row.kind);

    expect(kinds.indexOf('engineStart')).toBeLessThan(kinds.indexOf('takeoff'));
  });
});

describe('stopka osi', () => {
  it('czas blokowy pada raz, obok czasu w powietrzu i liczby startów', () => {
    const { foot } = axis();

    expect(foot.map((item) => `${item.key} ${item.value}`)).toEqual([
      'Blok 01:43',
      'W powietrzu 01:16',
      'Starty 2',
      'Lotnisko EPZG',
    ]);
  });

  it('sesja bez pracy silnika zamienia blok na czas TRZYMANIA maszyny', () => {
    // 09C: pilot wziął samolot, pogoda go zatrzymała, zdał bez uruchamiania silnika.
    // Zero w wielkiej cyfrze nie jest odpowiedzią na żadne pytanie — zajętość jest.
    const bezLotu: Event[] = [
      event('session_claim', at(9, 10), { mode: 'free' }),
      event('preflight_confirm', at(9, 10), {
        operation: 'skoki',
        departureIcao: 'EPZG',
        reading: { fuelL: 240, mh: 2815.2 },
        mhFormat: 'hhmm',
      }),
      event('day_close', at(10, 25), {
        finalReading: { fuelL: 240, mh: 2815.2 },
        noFlightReason: 'weather',
      }),
    ];
    const { foot, rows } = axis(bezLotu);

    expect(foot[0]).toEqual({ key: 'Trzymany', value: '01:15', accent: false });
    expect(foot[1]!.value).toBe('00:00');
    expect(rows.map((row) => row.kind)).toEqual(['claim', 'release']);
  });

  it('sesja jeszcze niezdana liczy trzymanie do teraz', () => {
    const trwa: Event[] = [
      event('session_claim', at(9, 10), { mode: 'free' }),
      event('preflight_confirm', at(9, 10), {
        operation: 'skoki',
        departureIcao: 'EPZG',
        reading: { fuelL: 240, mh: 2815.2 },
        mhFormat: 'hhmm',
      }),
    ];

    expect(axis(trwa, at(10, 40)).foot[0]!.value).toBe('01:30');
  });

  it('przelot pokazuje trasę zamiast jednego lotniska (issue #13)', () => {
    const przelot = sessionEvents().map((e) =>
      e.type === 'preflight_confirm'
        ? ({
            ...e,
            payload: {
              operation: 'ferry',
              departureIcao: 'EPZG',
              arrivalIcao: 'EPPO',
              reading: { fuelL: 150, mh: 1234.5 },
              mhFormat: 'hhmm',
            },
          } as Event)
        : e,
    );
    const { foot } = axis(przelot);

    expect(foot[foot.length - 1]).toEqual({ key: 'Trasa', value: 'EPZG→EPPO', accent: false });
  });
});

/** Strażnik typu: projekcja musi mieć wszystko, czego oś potrzebuje. */
export type _AxisNeeds = Pick<
  SessionState,
  'claimedAt' | 'closedAt' | 'flights' | 'blockTimeMs' | 'flightTimeMs' | 'takeoffCount'
>;
