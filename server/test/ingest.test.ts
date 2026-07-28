/**
 * UZ Aero (serwer) — testy przyjmowania zdarzeń i łańcucha MH (M2, §4.3–4.5).
 *
 * Scenariusze jadą przez PRAWDZIWY endpoint na PRAWDZIWYM Postgresie (PGlite),
 * a projekcję liczy ten sam `projectSession`, co telefon — więc liczby kanonicznego
 * dnia (150→88 L, 1234:30→1241:09 MH) muszą wyjść IDENTYCZNE jak na ekranie 10.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
) {
  seq += 1;
  return {
    uuid: `e-${seq}-${type}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    ...over,
  };
}

/** Uproszczony dzień: preflight → cykl z lotem → day_close. Liczby spójne z §4.5. */
function day(sessionUuid = 'sess-1', overrides: Record<string, unknown> = {}) {
  const base = { sessionUuid, ...overrides };
  return [
    event('session_claim', at(8, 0), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        dutyStart: at(8, 0),
        reading: { fuelL: 150, mh: 1234.5 },
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', at(8, 12), {}, base),
    event('takeoff', at(8, 25), { method: 'auto' }, base),
    event('landing', at(9, 18), { method: 'auto' }, base),
    event('engine_stop', at(10, 34), {}, base),
    event(
      'day_close',
      at(16, 45),
      { finalReading: { fuelL: 88, mh: 1241.15 }, dutyEnd: at(16, 45) },
      base,
    ),
  ];
}

async function login(app: Awaited<ReturnType<typeof testHarness>>['app'], who = 'TMK') {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

async function post(
  app: Awaited<ReturnType<typeof testHarness>>['app'],
  token: string,
  events: unknown[],
) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events },
  });
}

describe('POST /events', () => {
  it('przyjmuje paczkę i liczy projekcję sesji tym samym kodem co telefon', async () => {
    const { app, db } = await testHarness();
    const token = await login(app);

    const res = await post(app, token, day());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accepted: 7, duplicates: 0, flags: [] });

    const { rows } = await db.query<Record<string, unknown>>(
      "SELECT * FROM sessions WHERE session_uuid = 'sess-1'",
    );
    expect(rows[0]).toMatchObject({
      aircraft_id: 'SP-AXA',
      pic_id: 'TMK',
      status: 'closed',
      mh_start: 1234.5,
      mh_end: 1241.15,
      fuel_start_l: 150,
      fuel_end_l: 88,
      flights_count: 1,
    });
    // Block 8:12 → 10:34 = 2:22.
    expect(Number(rows[0]!.block_ms)).toBe((2 * 60 + 22) * 60_000);
  });

  it('retry tej samej paczki = same duplikaty, zero nowych wierszy (§4.3)', async () => {
    const { app, db } = await testHarness();
    const token = await login(app);
    const batch = day();

    await post(app, token, batch);
    const second = await post(app, token, batch);

    expect(second.json()).toMatchObject({ accepted: 0, duplicates: 7 });
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    expect(Number(rows[0]!.n)).toBe(7);
  });

  it('cudzą sesję odrzuca w całości — single-writer (§4.4)', async () => {
    const { app, db } = await testHarness();
    // KRZ próbuje wysłać zdarzenia podpisane PIC-em TMK.
    const tokenKrz = await login(app, 'KRZ');
    const res = await post(app, tokenKrz, day());

    expect(res.statusCode).toBe(403);
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    expect(Number(rows[0]!.n)).toBe(0); // częściowe przyjęcie rozjechałoby outbox
  });

  it('koperta spoza kontraktu → 400, bez śladu w bazie', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    const res = await post(app, token, [{ nonsense: true }]);
    expect(res.statusCode).toBe(400);
  });

  it('przejęcie CUDZEJ sesji własnym podpisem → 403 (audyt: krytyczne)', async () => {
    // KRZ zna sessionUuid TMK i wysyła zdarzenia z WŁASNYM picId — antydatowany
    // `session_claim` przejąłby sesję, a `day_close` zamknąłby cudzy dzień.
    const { app, db } = await testHarness();
    const tokenTmk = await login(app, 'TMK');
    const tokenKrz = await login(app, 'KRZ');
    await post(app, tokenTmk, day('sess-1').slice(0, 6)); // sesja TMK, otwarta

    const hijack = day('sess-1', { picId: 'KRZ' }).map((e, i) => ({
      ...e,
      uuid: `hijack-${i}`,
      deviceTime: at(6, 0), // wcześniejsze niż wszystko — próba przejęcia sortowaniem
      gpsTime: at(6, 0),
    }));
    const res = await post(app, tokenKrz, hijack);

    expect(res.statusCode).toBe(403);
    const { rows } = await db.query<{ pic_id: string }>(
      "SELECT pic_id FROM sessions WHERE session_uuid = 'sess-1'",
    );
    expect(rows[0]!.pic_id).toBe('TMK'); // sesja nietknięta
  });

  it('poprawna koperta ze zepsutym payloadem → 400, nie 500 i wieczny retry', async () => {
    const { app, db } = await testHarness();
    const token = await login(app);

    // `drop` bez `jumpers` wywaliłby projekcję TypeErrorem w transakcji.
    const broken = [...day('sess-1').slice(0, 4), event('drop', at(8, 48), {})];
    const res = await post(app, token, broken);

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_payload');
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    expect(Number(rows[0]!.n)).toBe(0); // cała paczka odrzucona przed zapisem
  });

  it('NaN w liczbach payloadu nie przechodzi — Postgres by je przyjął', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    const nan = day('sess-1').map((e) =>
      e.type === 'preflight_confirm'
        ? { ...e, payload: { ...(e.payload as object), reading: { fuelL: NaN, mh: 1234.5 } } }
        : e,
    );
    // NaN nie jest legalnym JSON-em — koperta odrzuca na serializacji/walidacji.
    const res = await post(app, token, nan);
    expect(res.statusCode).toBe(400);
  });
});

describe('flagi łańcucha MH (§4.5)', () => {
  it('ciągły łańcuch dwóch dni — zero flag', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    await post(app, token, day('sess-1'));

    // Następny dzień zaczyna od odczytu równego końcowi poprzednika.
    const next = day('sess-2').map((e) =>
      e.type === 'preflight_confirm'
        ? {
            ...e,
            payload: { ...(e.payload as object), reading: { fuelL: 88, mh: 1241.15 } },
          }
        : e,
    );
    const res = await post(app, token, next);
    expect(res.json().flags).toEqual([]);
  });

  it('dziura w łańcuchu → flaga mh_gap z wielkością dziury', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    await post(app, token, day('sess-1')); // koniec: 1241.15

    const next = day('sess-2').map((e) =>
      e.type === 'preflight_confirm'
        ? { ...e, payload: { ...(e.payload as object), reading: { fuelL: 88, mh: 1243.0 } } }
        : e,
    );
    const res = await post(app, token, next);

    const flags = res.json().flags;
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: 'mh_gap', status: 'open' });
    expect(flags[0].sessionUuids.sort()).toEqual(['sess-1', 'sess-2']);
    expect(flags[0].details.gapH).toBeCloseTo(1.85, 2);
  });

  it('cofnięty licznik między dniami → mh_regression', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    await post(app, token, day('sess-1'));

    const next = day('sess-2').map((e) =>
      e.type === 'preflight_confirm'
        ? { ...e, payload: { ...(e.payload as object), reading: { fuelL: 88, mh: 1240.0 } } }
        : e,
    );
    const res = await post(app, token, next);
    expect(res.json().flags[0]).toMatchObject({ type: 'mh_regression' });
  });

  it('dwie niezamknięte sesje jednego samolotu → session_overlap (przejęcie offline)', async () => {
    const { app } = await testHarness();
    const tokenTmk = await login(app, 'TMK');
    const tokenKrz = await login(app, 'KRZ');

    // TMK zaczyna dzień i NIE zamyka…
    await post(app, tokenTmk, day('sess-1').slice(0, 6));
    // …a KRZ przejmuje offline i wysyła własną, też otwartą sesję.
    const takeover = day('sess-2', { picId: 'KRZ' })
      .slice(0, 6)
      .map((e) =>
        e.type === 'preflight_confirm'
          ? { ...e, payload: { ...(e.payload as object), reading: { fuelL: 112, mh: 1236.87 } } }
          : e,
      );
    const res = await post(app, tokenKrz, takeover);

    const overlap = res.json().flags.find((f: { type: string }) => f.type === 'session_overlap');
    expect(overlap).toBeDefined();
    expect(overlap.sessionUuids.sort()).toEqual(['sess-1', 'sess-2']);
  });

  it('ponowny sync nie mnoży flag — dedupe po typie i zestawie sesji', async () => {
    const { app, db } = await testHarness();
    const token = await login(app);
    await post(app, token, day('sess-1'));
    const gap = day('sess-2').map((e) =>
      e.type === 'preflight_confirm'
        ? { ...e, payload: { ...(e.payload as object), reading: { fuelL: 88, mh: 1243.0 } } }
        : e,
    );

    await post(app, token, gap);
    await post(app, token, gap); // retry

    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM flags');
    expect(Number(rows[0]!.n)).toBe(1);
  });
});

describe('GET /aircraft/:id/state i sync-status', () => {
  it('po zamkniętym dniu stan niesie przekazanie, bez aktywnego claimu', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    await post(app, token, day());

    const res = await app.inject({
      method: 'GET',
      url: '/aircraft/SP-AXA/state',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();

    expect(body.claimPicId).toBeNull();
    expect(body.handover).toMatchObject({
      reading: { fuelL: 88, mh: 1241.15 },
      byPilotId: 'TMK',
    });
    expect(body.lastSyncAt).not.toBeNull();
  });

  it('otwarty dzień = aktywny claim widoczny dla preflightu innych pilotów', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    await post(app, token, day().slice(0, 6)); // bez day_close

    const res = await app.inject({
      method: 'GET',
      url: '/aircraft/SP-AXA/state',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json()).toMatchObject({ claimPicId: 'TMK', claimSince: at(8, 0) });
  });

  it('sync-status: licznik przyjętych + flagi sesji', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    await post(app, token, day('sess-1'));
    const gap = day('sess-2').map((e) =>
      e.type === 'preflight_confirm'
        ? { ...e, payload: { ...(e.payload as object), reading: { fuelL: 88, mh: 1243.0 } } }
        : e,
    );
    await post(app, token, gap);

    const res = await app.inject({
      method: 'GET',
      url: '/sessions/sess-2/sync-status',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();

    expect(body).toMatchObject({ sessionUuid: 'sess-2', received: 7, status: 'closed' });
    expect(body.flags.map((f: { type: string }) => f.type)).toEqual(['mh_gap']);
    expect(body.exportUrl).toBeNull();
  });
});
