/**
 * UZ Aero (serwer) - ślad sesji w panelu (`GET /admin/api/sessions/:uuid/track`).
 *
 * Ta trasa zastąpiła `/track/:flight` z panelu 1.0. Różnica nie jest kosmetyczna:
 * ślad należy do SESJI, nie do lotu (issue #38), więc administrator ogląda cały bieg
 * silnika razem z kołowaniem, a nie dzień pocięty na odcinki między startem
 * a lądowaniem.
 *
 * Czego pilnuje najmocniej:
 *  1. **zakres to CAŁY bieg silnika** - fix z kołowania jest w trasie, fix sprzed
 *     uruchomienia już nie,
 *  2. **panel widzi CUDZĄ sesję** - to jedyna rzecz, którą ta trasa robi inaczej niż
 *     trasa telefonu, i cały powód jej istnienia,
 *  3. **rysunek jest TEN SAM po obu stronach** - obie trasy oddają identyczną kopertę,
 *     bo liczy ją jedno zapytanie. Test porównuje odpowiedzi wprost: rozjazd map
 *     administratora i pilota byłby cichy, a psuje dokładnie tę rozmowę, dla której
 *     ten ekran powstał.
 *
 * Ślad wysyłamy PRAWDZIWYM `POST /traces` i czytamy z tego samego katalogu NDJSON, do
 * którego zapisał go adapter - test, który wstawiałby wiersze obok tej drogi,
 * potwierdzałby wyłącznie własne wyobrażenie o formacie zapisu.
 */

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number, s = 0): number => DAY + (h * 3600 + m * 60 + s) * 1000;

/** Okolice EPZG; +1/60 stopnia szerokości to ~1 NM na północ. */
const BASE = { lat: 52.1387, lon: 15.7986 };
const NM = 1 / 60;

/** Sesję lata PILOT, ogląda ją ADMINISTRATOR - o to w tej trasie chodzi. */
const PILOT = 'PWI';
const SESSION = 'sess-adm-trk';

let seq = 0;
function event(type: string, time: number, payload: Record<string, unknown>) {
  seq += 1;
  return {
    uuid: `atrk-${seq}-${type}`,
    sessionUuid: SESSION,
    picId: PILOT,
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
function flownSession() {
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
    event('engine_stop', at(9, 34), {}),
  ];
}

/** Sesja bez pracy silnika (09C: pogoda, usterka) - jest, ale nie ma czego rysować. */
function groundedSession() {
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
    event('day_close', at(9, 0), {
      finalReading: { fuelL: 150, mh: 1200 },
      noFlightReason: 'weather',
    }),
  ];
}

function fix(time: number, over: Record<string, unknown> = {}) {
  return {
    sessionUuid: SESSION,
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

async function login(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
  return res.json().token as string;
}

function getTrack(app: Harness['app'], token: string, uuid = SESSION) {
  return app.inject({
    method: 'GET',
    url: `/admin/api/sessions/${uuid}/track`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Sesja pilota + jego ślad, obie wysłane tą samą drogą, co z telefonu. */
async function flownWithTrace(
  entries: Record<string, unknown>[],
  events = flownSession(),
): Promise<{ harness: Harness; app: Harness['app']; admin: string; pilot: string }> {
  const harness = await testHarness();
  const { app } = harness;
  const pilot = await login(app, PILOT);

  await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${pilot}` },
    payload: { events },
  });

  if (entries.length > 0) {
    await app.inject({
      method: 'POST',
      url: '/traces',
      headers: { authorization: `Bearer ${pilot}` },
      payload: { entries },
    });
  }

  return { harness, app, admin: await login(app, 'TMK'), pilot };
}

describe('GET /admin/api/sessions/:uuid/track', () => {
  it('oddaje CAŁY bieg silnika - kołowanie należy do śladu sesji', async () => {
    const { app, admin, harness } = await flownWithTrace([
      fix(at(8, 5)), // przed uruchomieniem: poza biegiem
      fix(at(8, 15)), // kołowanie do startu
      fix(at(8, 30), { lat: BASE.lat + NM }),
      fix(at(9, 25), { lat: BASE.lat + NM }), // kołowanie po lądowaniu
      fix(at(9, 40)), // po wyłączeniu silnika: poza biegiem
    ]);

    const res = await getTrack(app, admin);
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.totalCount).toBe(3);
    expect(body.usableCount).toBe(3);
    expect(body.startedAt).toBe(at(8, 15));
    expect(body.endedAt).toBe(at(9, 25));

    await harness.app.close();
  });

  it('pokazuje sesję CUDZĄ - tego telefon zrobić nie może', async () => {
    const { app, admin, pilot, harness } = await flownWithTrace([
      fix(at(8, 30)),
      fix(at(9, 0), { lat: BASE.lat + NM }),
    ]);

    // Administrator nie jest PIC-em tej sesji, a mimo to ją widzi.
    expect((await getTrack(app, admin)).statusCode).toBe(200);

    // Ta sama sesja pytana trasą telefonu z konta administratora: „nie twoja".
    const mine = await app.inject({
      method: 'GET',
      url: `/me/sessions/${SESSION}/track`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(mine.statusCode).toBe(404);

    // ...a pilotowi ta sama trasa oddaje jego lot.
    const his = await app.inject({
      method: 'GET',
      url: `/me/sessions/${SESSION}/track`,
      headers: { authorization: `Bearer ${pilot}` },
    });
    expect(his.statusCode).toBe(200);

    await harness.app.close();
  });

  it('rysunek jest IDENTYCZNY z tym, który dostaje telefon', async () => {
    const { app, admin, pilot, harness } = await flownWithTrace([
      fix(at(8, 15), { alt: 500 }),
      fix(at(8, 45), { lat: BASE.lat + NM, alt: 6000 }),
      fix(at(9, 0), { lat: BASE.lat + 2 * NM, alt: 12000 }),
      fix(at(9, 15), { lat: BASE.lat + 3 * NM, alt: 600 }),
    ]);

    const forPanel = (await getTrack(app, admin)).json();
    const forPhone = (
      await app.inject({
        method: 'GET',
        url: `/me/sessions/${SESSION}/track`,
        headers: { authorization: `Bearer ${pilot}` },
      })
    ).json();

    expect(forPanel).toEqual(forPhone);

    await harness.app.close();
  });

  it('liczy dystans, wysokość szczytową i statystyki', async () => {
    const { app, admin, harness } = await flownWithTrace([
      fix(at(8, 30), { alt: 500 }),
      fix(at(8, 45), { lat: BASE.lat + NM, alt: 6000 }),
      fix(at(9, 0), { lat: BASE.lat + 2 * NM, alt: 12000 }),
      fix(at(9, 15), { lat: BASE.lat + 3 * NM, alt: 600 }),
    ]);

    const body = (await getTrack(app, admin)).json();

    expect(body.distanceNm).toBeCloseTo(3, 1);
    expect(body.maxAltitudeFt).toBe(12000);
    expect(body.profile.peakAltitudeFt).toBe(12000);
    // Statystyki obejmują CZAS NA ZIEMI - kołowanie i postój sumują się do różnicy
    // między biegiem silnika (08:12 → 09:34) a lotem (08:25 → 09:18). W ujęciu per lot,
    // które stało tu przed panelem 2.0, tych 29 minut nie było w ogóle.
    const phases = body.stats.phases;
    expect(phases.taxiMs + phases.standingMs).toBe(at(9, 34) - at(8, 12) - (at(9, 18) - at(8, 25)));

    await harness.app.close();
  });

  it('odrzucony fix nie wchodzi do geometrii, ale zostaje w liczniku', async () => {
    const { app, admin, harness } = await flownWithTrace([
      fix(at(8, 30)),
      fix(at(8, 40), { lat: BASE.lat + NM, accuracyM: 180 }),
      fix(at(8, 50), { lat: BASE.lat + 2 * NM }),
    ]);

    const body = (await getTrack(app, admin)).json();

    expect(body.totalCount).toBe(3);
    expect(body.usableCount).toBe(2);
    // Logu surowych punktów w kopercie NIE MA (issue #47): to materiał do strojenia
    // progów, nie odpowiedź na pytanie administratora o przebieg lotu.
    expect(body.log).toBeUndefined();

    await harness.app.close();
  });

  it('sesja bez nagrania oddaje PUSTĄ kopertę, nie błąd', async () => {
    const { app, admin, harness } = await flownWithTrace([]);

    const res = await getTrack(app, admin);
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.line).toHaveLength(0);
    expect(body.totalCount).toBe(0);
    expect(body.sessionUuid).toBe(SESSION);

    await harness.app.close();
  });

  it('sesja bez pracy silnika (09C) też oddaje pustą kopertę', async () => {
    const { app, admin, harness } = await flownWithTrace([], groundedSession());

    const res = await getTrack(app, admin);
    expect(res.statusCode).toBe(200);
    expect(res.json().line).toHaveLength(0);

    await harness.app.close();
  });

  it('nieistniejąca sesja to 404 no_session', async () => {
    const { app, admin, harness } = await flownWithTrace([fix(at(8, 30))]);

    const res = await getTrack(app, admin, 'sess-nie-ma');
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('no_session');

    await harness.app.close();
  });

  it('konto bez wejścia do panelu dostaje 403 z podaną zdolnością', async () => {
    const { app, pilot, harness } = await flownWithTrace([fix(at(8, 30))]);

    const res = await getTrack(app, pilot);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ required: 'panel.access' });

    await harness.app.close();
  });

  it('żądanie bez tokenu jest odrzucone', async () => {
    const { app, harness } = await flownWithTrace([fix(at(8, 30))]);

    const res = await app.inject({ method: 'GET', url: `/admin/api/sessions/${SESSION}/track` });
    expect(res.statusCode).toBe(401);

    await harness.app.close();
  });
});
