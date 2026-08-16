/**
 * UZ Aero (serwer) — ślad sesji dla telefonu (`GET /me/sessions/:uuid/track`, issue #47).
 *
 * Ta trasa jest drogą POWROTNĄ nagrania: telefon oddaje surowe fixy przez `POST /traces`,
 * kasuje swoją kopię i odtąd rysuje ekran 14 z tego, co odda serwer. Test przechodzi
 * dokładnie tę drogę — wysyła ślad prawdziwą trasą i czyta go prawdziwą trasą — bo test,
 * który wstawiałby wiersze obok niej, potwierdzałby wyłącznie własne wyobrażenie
 * o formacie zapisu.
 *
 * Trzy rzeczy, których pilnuje najmocniej:
 *  1. **zakres to CAŁY bieg silnika**, nie okno lotu — kołowanie należy do śladu sesji
 *     (issue #38), inaczej mapa zaczynałaby się w powietrzu,
 *  2. **cudza sesja to 404**, nie 403 — patrz komentarz w trasie,
 *  3. **koperta nie niesie danych rejestru** (rejestracji, lotów, czasów) — te telefon
 *     liczy lokalnie i druga ich wersja z sieci byłaby drugą prawdą o sesji.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number, s = 0): number => DAY + (h * 3600 + m * 60 + s) * 1000;

const BASE = { lat: 52.1387, lon: 15.7986 };
const NM = 1 / 60;

let seq = 0;
function event(type: string, time: number, payload: Record<string, unknown>, who = 'TMK') {
  seq += 1;
  return {
    uuid: `mtrk-${seq}-${type}`,
    sessionUuid: `sess-${who}`,
    picId: who,
    aircraftId: 'SP-AXA',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

/** Sesja: silnik 08:12 → 09:34, jeden lot 08:25 → 09:18. */
function flownSession(who = 'TMK') {
  return [
    event('session_claim', at(7, 50), { mode: 'free' }, who),
    event(
      'preflight_confirm',
      at(8, 0),
      {
        operation: 'skoki',
        departureIcao: 'EPZG',
        arrivalIcao: null,
        reading: { fuelL: 150, mh: 1200 },
        client: null,
        mhFormat: 'hhmm',
      },
      who,
    ),
    event('engine_start', at(8, 12), {}, who),
    event('takeoff', at(8, 25), { method: 'auto' }, who),
    event('landing', at(9, 18), { method: 'auto' }, who),
    event('engine_stop', at(9, 34), {}, who),
  ];
}

function fix(time: number, over: Record<string, unknown> = {}, who = 'TMK') {
  return {
    sessionUuid: `sess-${who}`,
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

function getTrack(app: Harness['app'], token: string, uuid = 'sess-TMK') {
  return app.inject({
    method: 'GET',
    url: `/me/sessions/${uuid}/track`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Sesja wysłana rejestrem + ślad wysłany tą samą drogą, co z telefonu. */
async function flownWithTrace(
  entries: Record<string, unknown>[],
  who = 'TMK',
): Promise<{ harness: Harness; app: Harness['app']; token: string }> {
  const harness = await testHarness();
  const { app } = harness;
  const token = await login(app, who);

  await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events: flownSession(who) },
  });

  await app.inject({
    method: 'POST',
    url: '/traces',
    headers: { authorization: `Bearer ${token}` },
    payload: { entries },
  });

  return { harness, app, token };
}

describe('GET /me/sessions/:uuid/track', () => {
  it('oddaje CAŁY bieg silnika — kołowanie należy do śladu sesji', async () => {
    const { app, token, harness } = await flownWithTrace([
      fix(at(8, 15), { gs: 12 }), // kołowanie przed startem
      fix(at(8, 30), { lat: BASE.lat + NM }),
      fix(at(9, 0), { lat: BASE.lat + 2 * NM }),
      fix(at(9, 25), { gs: 10 }), // kołowanie po lądowaniu
    ]);

    const res = await getTrack(app, token);
    expect(res.statusCode).toBe(200);

    const body = res.json();
    // Wszystkie cztery, nie dwa: do issue #38 ekran wycinał okno JEDNEGO lotu.
    expect(body.totalCount).toBe(4);
    expect(body.usableCount).toBe(4);
    expect(body.startedAt).toBe(at(8, 15));
    expect(body.endedAt).toBe(at(9, 25));

    await harness.app.close();
  });

  it('niesie statystyki policzone na serwerze, nie surowe fixy', async () => {
    // Wznoszenie 1 000 → 4 000 ft w 300 s = 600 ft/min.
    const entries = [];
    for (let i = 0; i <= 300; i += 5) {
      entries.push(fix(at(8, 25) + i * 1000, { alt: 1_000 + i * 10, gs: 90 }));
    }

    const { app, token, harness } = await flownWithTrace(entries);
    const body = (await getTrack(app, token)).json();

    expect(body.stats.speed.maxClimbFtPerMin).toBeCloseTo(600, 0);
    expect(body.stats.phases.climbMs).toBeGreaterThan(0);
    // Kompresja: prosta linia zwija się do garstki wierzchołków (issue #47 pkt 6).
    expect(body.line.length).toBeLessThan(entries.length);
    expect(body.profile.samples.length).toBeLessThan(entries.length);

    await harness.app.close();
  });

  it('koperta nie powtarza danych rejestru — telefon liczy je lokalnie', async () => {
    const { app, token, harness } = await flownWithTrace([fix(at(8, 30))]);
    const body = (await getTrack(app, token)).json();

    // Gdyby te pola tu weszły, powstałaby druga prawda o sesji — przysłana z sieci
    // i rozjeżdżająca się z lokalną po pierwszej korekcie administratora.
    expect(body).not.toHaveProperty('aircraftId');
    expect(body).not.toHaveProperty('flights');
    expect(body).not.toHaveProperty('flightTimeMs');

    await harness.app.close();
  });

  it('sesja bez nagrania oddaje PUSTĄ kopertę, nie błąd', async () => {
    const harness = await testHarness();
    const token = await login(harness.app);

    await harness.app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { events: flownSession() },
    });

    const res = await getTrack(harness.app, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().usableCount).toBe(0);
    expect(res.json().line).toEqual([]);

    await harness.app.close();
  });

  it('cudza sesja jest nie do odróżnienia od nieistniejącej', async () => {
    const { app, harness } = await flownWithTrace([fix(at(8, 30))]);

    const otherToken = await login(app, 'AKO');
    const mine = await getTrack(app, otherToken, 'sess-TMK');
    const nothing = await getTrack(app, otherToken, 'sess-nie-ma');

    expect(mine.statusCode).toBe(404);
    expect(nothing.statusCode).toBe(404);
    // Ta sama treść odmowy: inna zdradzałaby, że taka sesja istnieje.
    expect(mine.json()).toEqual(nothing.json());

    await harness.app.close();
  });

  it('bez tokenu nie ma śladu', async () => {
    const harness = await testHarness();
    const res = await harness.app.inject({ method: 'GET', url: '/me/sessions/sess-TMK/track' });

    expect(res.statusCode).toBe(401);
    await harness.app.close();
  });
});
