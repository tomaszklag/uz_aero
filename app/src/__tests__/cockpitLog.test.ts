/**
 * UZ Aero — test budowania wierszy LOGU DNIA (mockup 04 `.day-log`).
 *
 * Log jest jedynym potwierdzeniem zapisu, jakie widzi pilot — jeśli pokaże złe czasy
 * albo zły stan licznika, błąd nie objawi się niczym innym niż niepoprawnym wpisem
 * w arkuszu na koniec miesiąca.
 *
 * Sprawdzamy zwłaszcza **łańcuch MH** (§4.5): licznik chodzi z silnikiem, więc chip przy
 * kolejnym `engine_start` musi pokazywać wartość podbitą o czas bloku poprzedniego cyklu.
 * To ta sama zależność, którą `projections.test.ts` sprawdza jako inwariant „Δ MH = block".
 */

import { buildDaySections, buildLogRows } from '../ui/screens/logic/cockpitLog';
import type { DayCycleSection, DayLooseSection } from '../ui/components';
import type { Event, SessionState } from '../domain';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event<T extends Event['type']>(
  type: T,
  time: number,
  payload: unknown = {},
  synced = true,
): Event {
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
    syncedAt: synced ? time : null,
  } as Event;
}

/** Minimalna projekcja — `buildLogRows` czyta z niej tylko początek łańcucha i paliwo. */
function projection(over: Partial<SessionState> = {}): SessionState {
  return {
    mh: { start: 1234.5, end: null, deltaH: null },
    fuel: { startL: 150, addedL: 0, endL: null, consumedL: null, lastReadingL: 150 },
    ...over,
  } as SessionState;
}

describe('log dnia', () => {
  it('pomija zdarzenia organizacyjne, pokazuje przebieg dnia', () => {
    const rows = buildLogRows(
      [
        event('session_claim', at(8, 0)),
        event('engine_start', at(8, 12)),
        event('engine_stop', at(10, 34)),
      ],
      projection(),
      'hhmm',
    );

    // `session_claim` nie jest przebiegiem dnia — to zapis o przejęciu samolotu.
    expect(rows.map((r) => r.label)).toEqual(['Start engine', 'Stop engine']);
    expect(rows.map((r) => r.kind)).toEqual(['start', 'stop']);
  });

  it('preflight nie wchodzi do logu — dzień zaczyna się pustą osią (mockup 04a)', () => {
    // Odczyty początkowe ustala się WYŁĄCZNIE stepperami 02a i potwierdzeniem 03 —
    // wiersz w logu dawałby preflightowi ołówek korekty 04c, czyli tylną furtkę
    // do zmiany tego, co pilot świadomie zatwierdził.
    const rows = buildLogRows(
      [event('preflight_confirm', at(8, 0), { reading: { mh: 1234.5, fuelL: 150 } })],
      projection(),
      'hhmm',
    );
    expect(rows).toEqual([]);
  });

  it('odczyt z preflightu niesie pierwszy start silnika, nie osobny wiersz', () => {
    // Mockup 04: pierwszy „Start engine" ma chipy „MH 1234:30" i „150 L".
    const rows = buildLogRows(
      [
        event('preflight_confirm', at(8, 0), { reading: { mh: 1234.5, fuelL: 150 } }),
        event('engine_start', at(8, 12)),
      ],
      projection(),
      'hhmm',
    );

    expect(rows.map((r) => r.label)).toEqual(['Start engine']);
    expect(rows[0]!.chips?.map((c) => c.label)).toEqual(['MH 1234:30', '150 L']);
  });

  it('porządkuje chronologicznie, nie w kolejności zapisu', () => {
    // Wpis ręczny (05f) zapisuje zdarzenie z COFNIĘTYM czasem — kolejność wstawienia
    // rozjechałaby oś czasu.
    const rows = buildLogRows(
      [event('engine_stop', at(10, 34)), event('engine_start', at(8, 12))],
      projection(),
      'hhmm',
    );
    expect(rows.map((r) => r.time)).toEqual(['08:12', '10:34']);
  });

  it('przesuwa łańcuch MH o czas bloku każdego cyklu (§4.5)', () => {
    const rows = buildLogRows(
      [
        event('engine_start', at(8, 12)),
        event('engine_stop', at(10, 34)), // blok 2:22
        event('engine_start', at(11, 15)),
        event('engine_stop', at(12, 28)), // blok 1:13
      ],
      projection({ mh: { start: 1234.5, end: null, deltaH: null } } as Partial<SessionState>),
      'hhmm',
    );

    const mh = rows.map((r) => r.chips?.find((c) => c.label.startsWith('MH '))?.label);
    // 1234:30 → +2:22 → 1236:52 → (drugi start z tej samej wartości) → +1:13 → 1238:05.
    // To dokładnie liczby z mockupu 04.
    expect(mh).toEqual(['MH 1234:30', 'MH 1236:52', 'MH 1236:52', 'MH 1238:05']);
  });

  it('dopisuje czas bloku przy stopie i długość lotu przy lądowaniu', () => {
    const rows = buildLogRows(
      [
        event('engine_start', at(8, 12)),
        event('takeoff', at(8, 25), { method: 'auto' }),
        event('landing', at(9, 18), { method: 'auto' }),
        event('engine_stop', at(10, 34)),
      ],
      projection(),
      'hhmm',
    );

    expect(rows.find((r) => r.kind === 'landing')?.meta).toBe('0:53');
    expect(rows.find((r) => r.kind === 'stop')?.meta).toBe('blok 2:22');
    // Start i lądowanie nie mają chipów — nie zmieniają ani licznika, ani paliwa.
    expect(rows.find((r) => r.kind === 'takeoff')?.chips).toBeUndefined();
  });

  it('kołowanie otwiera lot i dostaje czas trwania liczony DO startu', () => {
    // Mockup 05: „13:11 · Taxi · 0:13" i zaraz pod nim „13:24 · Takeoff".
    const rows = buildLogRows(
      [
        event('engine_start', at(13, 10)),
        event('taxi', at(13, 11), { method: 'auto' }),
        event('takeoff', at(13, 24), { method: 'auto' }),
      ],
      projection(),
      'hhmm',
    );

    const taxi = rows.find((r) => r.kind === 'taxi')!;
    expect(taxi.time).toBe('13:11');
    // Czasu nie da się podać w chwili kołowania — dopisuje go dopiero start.
    expect(taxi.meta).toBe('0:13');
  });

  it('kołowanie bez startu zostaje bez czasu, zamiast dostać zmyślony', () => {
    // Pilot ruszył i zawrócił — lot się nie odbył, więc nie ma czego liczyć.
    const rows = buildLogRows(
      [event('engine_start', at(13, 10)), event('taxi', at(13, 11), { method: 'auto' })],
      projection(),
      'hhmm',
    );

    expect(rows.find((r) => r.kind === 'taxi')?.meta).toBeUndefined();
  });

  it('drugie kołowanie w cyklu liczy się od siebie, nie od pierwszego', () => {
    const rows = buildLogRows(
      [
        event('engine_start', at(13, 10)),
        event('taxi', at(13, 11), { method: 'auto' }),
        event('takeoff', at(13, 24), { method: 'auto' }),
        event('landing', at(14, 8), { method: 'auto' }),
        event('taxi', at(14, 8), { method: 'auto' }),
        event('takeoff', at(14, 21), { method: 'auto' }),
      ],
      projection(),
      'hhmm',
    );

    const taxis = rows.filter((r) => r.kind === 'taxi');
    expect(taxis.map((r) => r.time)).toEqual(['13:11', '14:08']);
    expect(taxis.map((r) => r.meta)).toEqual(['0:13', '0:13']);
  });

  it('tankowanie jest wierszem naziemnym z ilością dolaną', () => {
    const rows = buildLogRows(
      [event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 })],
      projection(),
      'hhmm',
    );

    expect(rows[0]!.kind).toBe('ground');
    expect(rows[0]!.meta).toBe('+48 L');
    // Mockup 04 trzyma w etykiecie samo „Tankowanie" — liczby idą po prawej.
    expect(rows[0]!.label).toBe('Tankowanie');
  });

  it('pokazuje paliwo tylko tam, gdzie faktycznie się zmieniło', () => {
    const rows = buildLogRows(
      [
        event('engine_start', at(8, 12)),
        event('engine_stop', at(10, 34)),
        event('engine_start', at(11, 15)),
      ],
      projection(),
      'hhmm',
    );

    const withFuel = rows.filter((r) => r.chips?.some((c) => c.tone === 'amber'));
    // Odczyt początkowy — raz. Nie mamy pomiaru zużycia w locie, więc dopisywanie
    // paliwa przy każdym cyklu byłoby zmyślaniem danych.
    expect(withFuel).toHaveLength(1);
    expect(withFuel[0]!.time).toBe('08:12');
  });

  it('oznacza wiersze czekające na wysyłkę', () => {
    const rows = buildLogRows(
      [event('engine_start', at(8, 12), {}, false), event('engine_stop', at(10, 34))],
      projection(),
      'hhmm',
    );
    expect(rows.map((r) => r.pending)).toEqual([true, false]);
  });
});

describe('sekcje dnia (zwijanie cykli)', () => {
  /** Dzień z mockupu 04: dwa zamknięte cykle przedzielone tankowaniem. */
  const dayEvents = (): Event[] => [
    event('engine_start', at(8, 12)),
    event('takeoff', at(8, 25), { method: 'auto' }),
    event('landing', at(9, 18), { method: 'auto' }),
    event('takeoff', at(9, 35), { method: 'auto' }),
    event('landing', at(10, 22), { method: 'auto' }),
    event('engine_stop', at(10, 34)),
    event('refuel', at(10, 48), { beforeL: 112, addedL: 48, afterL: 160 }),
    event('engine_start', at(11, 15)),
    event('takeoff', at(11, 28), { method: 'auto' }),
    event('landing', at(12, 15), { method: 'auto' }),
    event('engine_stop', at(12, 28)),
  ];

  it('zamknięty cykl zwija się do nagłówka, którego liczby zgadzają się z wierszami', () => {
    const sections = buildDaySections(dayEvents(), projection(), 'hhmm');
    expect(sections.map((s) => s.kind)).toEqual(['cycle', 'loose', 'cycle']);

    const c1 = sections[0] as DayCycleSection;
    expect(c1.no).toBe(1);
    expect(c1.range).toBe('08:12–10:34');
    expect(c1.takeoffs).toBe(2);
    expect(c1.block).toBe('blok 2:22');
    expect(c1.closed).toBe(true);
    expect(c1.rows.map((r) => r.label)).toEqual([
      'Start engine',
      'Takeoff',
      'Landing',
      'Takeoff',
      'Landing',
      'Stop engine',
    ]);

    const c2 = sections[2] as DayCycleSection;
    expect(c2.no).toBe(2);
    expect(c2.takeoffs).toBe(1);
    expect(c2.block).toBe('blok 1:13');
  });

  it('zdarzenie naziemne między cyklami zostaje luzem — nigdy się nie zwija', () => {
    const sections = buildDaySections(dayEvents(), projection(), 'hhmm');
    const loose = sections[1] as DayLooseSection;
    expect(loose.kind).toBe('loose');
    expect(loose.row.label).toBe('Tankowanie');
  });

  it('cykl bez stopu jest otwarty: zakres z wielokropkiem, bez bloku', () => {
    const sections = buildDaySections(
      [event('engine_start', at(13, 10)), event('takeoff', at(13, 24), { method: 'auto' })],
      projection(),
      'hhmm',
    );
    const c = sections[0] as DayCycleSection;
    expect(c.closed).toBe(false);
    expect(c.range).toBe('13:10–…');
    expect(c.block).toBeNull();
    expect(c.takeoffs).toBe(1);
  });

  it('znacznik niewysłanych z wnętrza cyklu wypływa na nagłówek', () => {
    const sections = buildDaySections(
      [
        event('engine_start', at(8, 12)),
        event('takeoff', at(8, 25), { method: 'auto' }, false),
        event('engine_stop', at(10, 34)),
      ],
      projection(),
      'hhmm',
    );
    expect((sections[0] as DayCycleSection).pending).toBe(true);
  });
});
