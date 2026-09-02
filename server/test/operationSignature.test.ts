/**
 * UZ Aero (serwer) - SYGNATURA OPERACJI LOTNICZEJ w panelu (issue #68).
 *
 * ══ CO TU JEST NAPRAWDĘ SPRAWDZANE ══
 * Numer operacji w dobie liczą DWA kody: `operationIndexes` w domenie (telefon, offline)
 * i ranga SQL w `PgAdminSessionsRepo` (panel). Ta para nie ma jak nie istnieć - telefon
 * nie ma bazy, a panel nie wczytuje strumieni do listy (§7.1) - więc jedyną obroną przed
 * jej rozjazdem jest test, który puszcza TE SAME zdarzenia przez oba tory i porównuje
 * wynik. Rozjazd znaczyłby, że administrator i pilot mówią o jednym locie dwoma
 * napisami, czyli dokładnie tę wadę, którą sygnatura miała usunąć.
 *
 * Reszta przypadków to granice reguły: unieważniona operacja nie zajmuje numeru,
 * operacja bez uruchomienia silnika nie dostaje go wcale, a doba numeruje się od nowa.
 */

import { operationIndexes, projectSession, type Event } from '@uzaero/domain';
import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const DAY = Date.UTC(2026, 8, 1); // 01 WRZ 2026
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (h: number, m: number, dayOffset = 0): number =>
  DAY + dayOffset * DAY_MS + h * 3600_000 + m * 60_000;

let seq = 0;

function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  seq += 1;
  return {
    uuid: `sig-${seq}-${type}`,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    ...base,
  };
}

interface OperationOptions {
  sessionUuid: string;
  aircraftId?: string;
  picId?: string;
  dayOffset?: number;
  /** Godzina uruchomienia silnika - ona wyznacza dobę i kolejność operacji. */
  engineStartH: number;
  /** Bieg silnika w ogóle nie następuje (09C: pogoda, usterka). */
  noEngineRun?: boolean;
  voided?: boolean;
}

/** Jedna operacja: przejęcie → zadanie → bieg silnika z lotem → zdanie. */
function operation(o: OperationOptions) {
  const d = o.dayOffset ?? 0;
  const base = {
    sessionUuid: o.sessionUuid,
    picId: o.picId ?? 'TMK',
    aircraftId: o.aircraftId ?? 'SP-AXA',
    dualId: null,
  };
  const h = o.engineStartH;

  const events = [
    event('session_claim', at(h - 1, 50, d), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(h - 1, 55, d),
      {
        operation: 'ferry',
        departureIcao: 'EPKK',
        arrivalIcao: 'EPBA',
        reading: { fuelL: 150, mh: 1200 },
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
  ];

  if (o.noEngineRun !== true) {
    events.push(
      event('engine_start', at(h, 12, d), {}, base),
      event('takeoff', at(h, 25, d), { method: 'auto' }, base),
      event('landing', at(h, 50, d), { method: 'auto' }, base),
      event('engine_stop', at(h + 1, 4, d), {}, base),
    );
  }

  events.push(
    event(
      'day_close',
      at(h + 1, 30, d),
      o.noEngineRun === true
        ? { finalReading: { fuelL: 150, mh: 1200 }, noFlightReason: 'weather' }
        : { finalReading: { fuelL: 120, mh: 1201 } },
      base,
    ),
  );

  if (o.voided === true) {
    events.push(event('session_void', at(h + 2, 0, d), { reason: 'pomyłka' }, base));
  }

  return events;
}

async function token(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

const post = (app: Harness['app'], t: string, events: unknown[]) =>
  app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${t}`, ...ADMIN_CSRF_HEADERS },
    payload: { events },
  });

const sessions = (app: Harness['app'], t: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/admin/api/sessions${query}`,
    headers: { authorization: `Bearer ${t}` },
  });

/** `sessionUuid` → sygnatura, prosto z odpowiedzi panelu. */
async function signatures(app: Harness['app'], t: string): Promise<Map<string, string | null>> {
  const items = (await sessions(app, t, '?limit=50')).json().items as {
    sessionUuid: string;
    signature: string | null;
  }[];
  return new Map(items.map((i) => [i.sessionUuid, i.signature]));
}

describe('sygnatura operacji w panelu', () => {
  it('składa się ze znaku, doby uruchomienia, kodu PIC i numeru w dobie', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    const ingest = await post(app, tmk, [
      ...operation({ sessionUuid: 's-1', engineStartH: 8 }),
      ...operation({ sessionUuid: 's-2', aircraftId: 'SP-FGK', engineStartH: 13 }),
    ]);
    expect(ingest.statusCode, JSON.stringify(ingest.json())).toBe(200);

    const found = await signatures(app, tmk);
    // Numer biegnie CIĄGIEM PRZEZ MASZYNY - to doba PILOTA, nie doba samolotu.
    expect(found.get('s-1')).toBe('SP-AXA/2026-09-01/TMK/1');
    expect(found.get('s-2')).toBe('SP-FGK/2026-09-01/TMK/2');
  });

  it('numeruje każdą dobę od nowa', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    await post(app, tmk, [
      ...operation({ sessionUuid: 's-d0', engineStartH: 8 }),
      ...operation({ sessionUuid: 's-d1', engineStartH: 8, dayOffset: 1 }),
    ]);

    const found = await signatures(app, tmk);
    expect(found.get('s-d0')).toBe('SP-AXA/2026-09-01/TMK/1');
    expect(found.get('s-d1')).toBe('SP-AXA/2026-09-02/TMK/1');
  });

  it('operacja bez uruchomienia silnika nie dostaje sygnatury ani nie zajmuje numeru', async () => {
    // 09C: samolot zajęty, pogoda nie pozwoliła. Zapis istnieje i ma być widoczny,
    // ale operacji lotniczej nie było - więc nie ma czego numerować.
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    await post(app, tmk, [
      ...operation({ sessionUuid: 's-09c', engineStartH: 7, noEngineRun: true }),
      ...operation({ sessionUuid: 's-lot', engineStartH: 10 }),
    ]);

    const found = await signatures(app, tmk);
    expect(found.get('s-09c')).toBeNull();
    expect(found.get('s-lot')).toBe('SP-AXA/2026-09-01/TMK/1');
  });

  it('operacja unieważniona nie zajmuje numeru następnym', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    await post(app, tmk, [
      ...operation({ sessionUuid: 's-void', engineStartH: 8, voided: true }),
      ...operation({ sessionUuid: 's-real', engineStartH: 12 }),
    ]);

    const found = await signatures(app, tmk);
    expect(found.get('s-real')).toBe('SP-AXA/2026-09-01/TMK/1');
  });

  it('cudze operacje nie wchodzą do numeracji - doba należy do PILOTA', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    const krz = await token(app, 'KRZ');

    await post(app, krz, [
      ...operation({ sessionUuid: 's-krz', picId: 'KRZ', aircraftId: 'SP-FGK', engineStartH: 8 }),
    ]);
    await post(app, tmk, [...operation({ sessionUuid: 's-tmk', engineStartH: 12 })]);

    const found = await signatures(app, tmk);
    expect(found.get('s-krz')).toBe('SP-FGK/2026-09-01/KRZ/1');
    expect(found.get('s-tmk')).toBe('SP-AXA/2026-09-01/TMK/1');
  });

  /**
   * TEN TEST JEST POWODEM ISTNIENIA PLIKU: ranga SQL i `operationIndexes` muszą dać ten
   * sam ciąg numerów na tych samych zdarzeniach. Domena liczy z projekcji (tak jak
   * telefon), panel z kolumn (tak jak przeglądarka) - i porównujemy WYNIKI, a nie
   * przepisy, bo rozjazd bierze się z niuansu, którego nikt nie przepisał świadomie.
   */
  it('numer z SQL zgadza się z numerem, który policzy telefon', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    const streams: Record<string, Event[]> = {
      's-a': operation({ sessionUuid: 's-a', engineStartH: 6 }) as unknown as Event[],
      's-b': operation({
        sessionUuid: 's-b',
        aircraftId: 'SP-FGK',
        engineStartH: 9,
      }) as unknown as Event[],
      's-c': operation({ sessionUuid: 's-c', engineStartH: 14, voided: true }) as unknown as Event[],
      's-d': operation({
        sessionUuid: 's-d',
        aircraftId: 'SP-FGK',
        engineStartH: 17,
      }) as unknown as Event[],
    };

    await post(app, tmk, Object.values(streams).flat());

    // Tor telefonu: projekcje ze strumienia → numery z domeny.
    const fromDomain = operationIndexes(
      Object.values(streams).map((stream) => projectSession(stream)),
      'TMK',
    );

    // Tor panelu: kolumny projekcji → ranga w SQL → ostatni człon sygnatury.
    const fromPanel = new Map<string, number | null>(
      [...(await signatures(app, tmk))].map(([uuid, signature]) => [
        uuid,
        signature == null ? null : Number(signature.split('/')[3]),
      ]),
    );

    for (const uuid of Object.keys(streams)) {
      expect(fromPanel.get(uuid) ?? null).toBe(fromDomain.get(uuid) ?? null);
    }
    // Asercja o WARTOŚCIACH, nie tylko o zgodności: dwa tory zgodnie milczące
    // przeszłyby pętlę wyżej bez mrugnięcia.
    expect([...fromDomain.entries()].sort()).toEqual([
      ['s-a', 1],
      ['s-b', 2],
      ['s-d', 3],
    ]);
  });
});
