/**
 * UZ Aero (serwer) — ślad lotu w panelu (`GET /admin/api/sessions/:uuid/track/:flight`,
 * mockup `A02c-slad.html`).
 *
 * Ten sam wzorzec co reszta: PGlite w procesie, prawdziwe klasy, `app.inject`, zero atrap.
 * Ślad wysyłamy PRAWDZIWYM `POST /traces` i czytamy z tego samego katalogu NDJSON, do
 * którego zapisał go adapter — czyli przechodzimy dokładnie tę drogę, którą przechodzą
 * dane w produkcji. Test, który wstawiałby wiersze śladu obok tej drogi, potwierdzałby
 * wyłącznie własne wyobrażenie o formacie zapisu.
 *
 * Sedno: okno lotu bierze się z REJESTRU, a geometria ze ŚLADU. Fixy sprzed startu
 * (kołowanie) i po lądowaniu leżą w tym samym pliku i nie mogą wejść do trasy.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number, s = 0): number => DAY + (h * 3600 + m * 60 + s) * 1000;

/** Okolice EPZG; +1/60 stopnia szerokości to ~1 NM na północ. */
const BASE = { lat: 52.1387, lon: 15.7986 };
const NM = 1 / 60;

let seq = 0;
function event(type: string, time: number, payload: Record<string, unknown>) {
  seq += 1;
  return {
    uuid: `trk-${seq}-${type}`,
    sessionUuid: 'sess-trk',
    picId: 'TMK',
    aircraftId: 'SP-AXA',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

/** Dzień z JEDNYM lotem automatycznym: 08:25 → 09:18. */
function dayWithOneFlight() {
  return [
    event('session_claim', at(7, 50), { mode: 'free' }),
    event('preflight_confirm', at(8, 0), {
      operation: 'skoki',
      departureIcao: 'EPZG',
      arrivalIcao: null,
      reading: { fuelL: 150, mh: 1200 },
      client: null,
      mhFormat: 'hhmm',
    }),
    event('engine_start', at(8, 12), {}),
    event('takeoff', at(8, 25), { method: 'auto' }),
    event('landing', at(9, 18), { method: 'auto' }),
    event('engine_stop', at(10, 34), {}),
  ];
}

/** Wpis śladu; wartości domyślne są „dobre", test nadpisuje tylko to, co bada. */
function fix(time: number, over: Record<string, unknown> = {}) {
  return {
    sessionUuid: 'sess-trk',
    kind: 'fix',
    time,
    deviceTime: time,
    lat: BASE.lat,
    lon: BASE.lon,
    alt: 1200,
    gs: 80,
    trackDeg: 240,
    accuracyM: 5,
    detail: null,
    ...over,
  };
}

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], who = 'TMK'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

function getTrack(app: Harness['app'], token: string, flight: number, uuid = 'sess-trk') {
  return app.inject({
    method: 'GET',
    url: `/admin/api/sessions/${uuid}/track/${flight}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Dzień + ślad wysłany tą samą drogą co z telefonu. */
async function flownDayWithTrace(entries: Record<string, unknown>[]) {
  const harness = await testHarness();
  const { app } = harness;
  const token = await login(app);

  await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events: dayWithOneFlight() },
  });

  await app.inject({
    method: 'POST',
    url: '/traces',
    headers: { authorization: `Bearer ${token}` },
    payload: { entries },
  });

  return { harness, app, token };
}

describe('GET /admin/api/sessions/:uuid/track/:flight', () => {
  it('bierze wyłącznie fixy z okna lotu — kołowanie zostaje poza trasą', async () => {
    const { app, token, harness } = await flownDayWithTrace([
      fix(at(8, 15)), // kołowanie przed startem
      fix(at(8, 30), { lat: BASE.lat + NM }),
      fix(at(9, 0), { lat: BASE.lat + 2 * NM }),
      fix(at(9, 30)), // kołowanie po lądowaniu
    ]);

    const res = await getTrack(app, token, 1);
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.totalCount).toBe(2);
    expect(body.usableCount).toBe(2);
    expect(body.takeoffAt).toBe(at(8, 25));
    expect(body.landingAt).toBe(at(9, 18));
    expect(body.line).toHaveLength(2);

    await harness.app.close();
  });

  it('odrzucony fix zostaje w logu z powodem, ale nie wchodzi do geometrii', async () => {
    const { app, token, harness } = await flownDayWithTrace([
      fix(at(8, 30)),
      fix(at(8, 40), { lat: BASE.lat + NM, accuracyM: 180 }),
      fix(at(8, 50), { lat: BASE.lat + 2 * NM }),
    ]);

    const body = (await getTrack(app, token, 1)).json();

    expect(body.totalCount).toBe(3);
    expect(body.usableCount).toBe(2);

    const rejected = body.log.filter((p: { rejected: string | null }) => p.rejected != null);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].rejected).toBe('accuracy');

    await harness.app.close();
  });

  it('liczy dystans, wysokość szczytową i profil pionowy', async () => {
    const { app, token, harness } = await flownDayWithTrace([
      fix(at(8, 30), { alt: 500 }),
      fix(at(8, 45), { lat: BASE.lat + NM, alt: 6000 }),
      fix(at(9, 0), { lat: BASE.lat + 2 * NM, alt: 12000 }),
      fix(at(9, 15), { lat: BASE.lat + 3 * NM, alt: 600 }),
    ]);

    const body = (await getTrack(app, token, 1)).json();

    expect(body.distanceNm).toBeCloseTo(3, 1);
    expect(body.maxAltitudeFt).toBe(12000);
    expect(body.profile.peakAltitudeFt).toBe(12000);
    expect(body.profile.peakAt).toBe(at(9, 0));
    // Wznoszenie 11 500 ft w 30 min ≈ 383 ft/min.
    expect(body.profile.averageClimbFtPerMin).toBeCloseTo(383, 0);
    expect(body.profile.averageDescentFtPerMin).toBeLessThan(0);

    await harness.app.close();
  });

  it('sesja bez zapisu GPS daje pusty ślad, a nie błąd (wariant 14B)', async () => {
    const { app, token, harness } = await flownDayWithTrace([]);

    const res = await getTrack(app, token, 1);
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.line).toHaveLength(0);
    expect(body.log).toHaveLength(0);
    expect(body.totalCount).toBe(0);
    // Okno lotu ZOSTAJE — czasy są prawdziwe, brakuje wyłącznie geometrii.
    expect(body.takeoffAt).toBe(at(8, 25));

    await harness.app.close();
  });

  it('nieistniejący numer lotu to 404 no_flight', async () => {
    const { app, token, harness } = await flownDayWithTrace([fix(at(8, 30))]);

    const res = await getTrack(app, token, 7);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('no_flight');

    await harness.app.close();
  });

  it('nieistniejąca sesja to 404 no_session', async () => {
    const { app, token, harness } = await flownDayWithTrace([fix(at(8, 30))]);

    const res = await getTrack(app, token, 1, 'sess-nie-ma');
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('no_session');

    await harness.app.close();
  });

  it('żądanie bez tokenu jest odrzucone', async () => {
    const { app, harness } = await flownDayWithTrace([fix(at(8, 30))]);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions/sess-trk/track/1',
    });
    expect(res.statusCode).toBe(401);

    await harness.app.close();
  });

  it('numer lotu spoza zakresu to 400, nie 500', async () => {
    const { app, token, harness } = await flownDayWithTrace([fix(at(8, 30))]);

    const res = await getTrack(app, token, 0);
    expect(res.statusCode).toBe(400);

    await harness.app.close();
  });
});
