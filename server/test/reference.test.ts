/**
 * UZ Aero (serwer) — testy `GET /reference` (§4.6, §4.8).
 *
 * Kontrakt z aplikacją: kształty `ReferenceAircraft`/`ReferencePilot` idą z pakietu
 * domeny, więc test sprawdza dokładnie to, co telefon włoży do cache. ETag/304 to
 * oszczędność łącza w terenie — flota zmienia się kilka razy w sezonie.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

async function authed(app: Awaited<ReturnType<typeof testHarness>>['app']): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: 'TMK', password: TEST_PASSWORD },
  });
  return login.json().token as string;
}

describe('GET /reference', () => {
  it('bez tokenu → 401 (dane floty nie są publiczne)', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'GET', url: '/reference' });
    expect(res.statusCode).toBe(401);
  });

  it('zwraca flotę i pilotów w kształtach domeny — scenariusz zgodny z aplikacją', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.aircraft.map((a: { reg: string }) => a.reg)).toEqual([
      'SP-ANK',
      'SP-AXA',
      'SP-FGK',
      'SP-KWA',
    ]);
    expect(body.pilots).toHaveLength(5);

    // Konfiguracja §5.4 — to z niej aplikacja bierze walidacje i formaty.
    const an2 = body.aircraft.find((a: { reg: string }) => a.reg === 'SP-ANK');
    expect(an2.dualRequired).toBe(true);
    expect(an2.capacityL).toBe(1700);
    const kwa = body.aircraft.find((a: { reg: string }) => a.reg === 'SP-KWA');
    expect(kwa.serviceStatus).toBe('disabled');
    expect(kwa.mhFormat).toBe('decimal');

    // Bez sesji na serwerze pola stanu są jawnie puste, nie brakujące.
    expect(an2.claimPicId).toBeNull();
    expect(an2.handover).toBeNull();
  });

  it('otwarta sesja wypełnia claim w /reference — cache telefonu dostaje stan floty', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    // TMK otwiera dzień na SP-AXA (claim + preflight, bez zamknięcia).
    const DAY = Date.UTC(2026, 5, 22);
    const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
    const mk = (i: number, type: string, time: number, payload: object) => ({
      uuid: `ref-claim-${i}`,
      sessionUuid: 'sess-ref',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type,
      deviceTime: time,
      gpsTime: time,
      payload,
      schemaVersion: 1,
    });
    const first = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });

    await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          mk(1, 'session_claim', at(8, 0), { mode: 'free' }),
          mk(2, 'preflight_confirm', at(8, 0), {
            operation: 'skoki',
            reading: { fuelL: 150, mh: 1234.5 },
            mhFormat: 'hhmm',
          }),
        ],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      // Stary ETag NIE może dać 304 — claim właśnie się zmienił.
      headers: { authorization: `Bearer ${token}`, 'if-none-match': first.headers.etag as string },
    });

    expect(res.statusCode).toBe(200);
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');
    expect(axa.claimPicId).toBe('TMK');
    expect(axa.claimSince).toBe(at(8, 0));
  });

  it('If-None-Match z aktualnym ETagiem → 304 bez ciała', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    const first = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^W\//);

    const second = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}`, 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
  });

  it('zmiana danych zmienia ETag — 304 nie zamraża floty na zawsze', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    const first = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });

    // Administrator wyłącza samolot ze służby — updated_at idzie do przodu.
    await db.query(
      "UPDATE aircraft SET service_status = 'disabled', updated_at = now() + interval '1 second' WHERE id = 'SP-AXA'",
    );

    const second = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}`, 'if-none-match': first.headers.etag as string },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers.etag).not.toBe(first.headers.etag);
  });
});

describe('norma zużycia w kanale referencyjnym (etap 3, 2026-08-05)', () => {
  it('samolot bez policzonego modelu niesie `consumption: null`, nie zero', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    for (const aircraft of res.json().aircraft) {
      // Świeża baza nie ma jeszcze żadnego zamkniętego dnia, więc modelu też nie ma.
      // Telefon musi dostać jawny brak, a nie normę „0 L/h" — na jej podstawie
      // ekran tankowania orzekłby, że każdy wynik jest „powyżej normy".
      expect(aircraft.consumption).toBeNull();
    }
  });

  it('policzona norma trafia do odpowiedzi i ZMIENIA ETag', async () => {
    // Bez trzeciego składnika ETagu przeliczenie modelu (które nie rusza ani floty,
    // ani sesji) byłoby dla telefonu niewidoczne — 304 zamroziłoby poprzednią odpowiedź.
    const { app, db } = await testHarness();
    const token = await authed(app);

    const before = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });

    await db.query(
      `INSERT INTO aircraft_consumption (aircraft_id, window_days, model, computed_at)
       VALUES ('SP-AXA', 90, $1, now())`,
      [
        JSON.stringify({
          windowDays: 90,
          blockLPerHLow: 15,
          blockLPerHHigh: 17,
          blockLPerH: 16,
          airLPerH: 20,
          litersPerFlight: 22,
          intervals: 96,
          engineMs: 118 * 3_600_000,
          computedAt: Date.UTC(2026, 5, 21),
        }),
      ],
    );

    const after = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}`, 'if-none-match': before.headers.etag as string },
    });

    expect(after.statusCode).toBe(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);

    const axa = after.json().aircraft.find((a: { id: string }) => a.id === 'SP-AXA');
    expect(axa.consumption).toMatchObject({ blockLPerH: 16, windowDays: 90, airLPerH: 20 });

    // Pozostałe jednostki nadal bez normy — wpis dotyczy jednego samolotu.
    const other = after.json().aircraft.find((a: { id: string }) => a.id === 'SP-FGK');
    expect(other.consumption).toBeNull();
  });
});

// ── przekazanie oleju (issue #60, etap D) ───────────────────────────────────────

describe('przekazanie oleju w /reference (issue #60)', () => {
  it('kotwicą jest pomiar najdalszy w łańcuchu MH; dolewki po nim wchodzą sumą (także oil_add)', async () => {
    const { app } = await testHarness();
    const token = await authed(app);
    const DAY = Date.UTC(2026, 5, 22);
    const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
    let seq = 0;
    const mk = (sess: string, type: string, time: number, payload: object) => ({
      uuid: `oil-ref-${++seq}`,
      sessionUuid: sess,
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type,
      deviceTime: time,
      gpsTime: time,
      payload,
      schemaVersion: 1,
    });

    // Sesja 1: POMIAR 10,6 L przy liczniku 1230,5 — to ona zostanie kotwicą.
    const s1 = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          mk('sess-oil-1', 'session_claim', at(8, 0), { mode: 'free' }),
          mk('sess-oil-1', 'preflight_confirm', at(8, 0), {
            operation: 'skoki',
            reading: { fuelL: 150, mh: 1230.5 },
            oilL: 10.6,
            mhFormat: 'hhmm',
          }),
          mk('sess-oil-1', 'engine_start', at(8, 10), {}),
          mk('sess-oil-1', 'engine_stop', at(10, 30), {}),
          mk('sess-oil-1', 'day_close', at(10, 40), {
            finalReading: { fuelL: 120, mh: 1232.7 },
          }),
        ],
      },
    });
    expect(s1.statusCode).toBe(200);

    // Sesja 2: BEZ pomiaru (bagnet gorący) — dolewka 0,7 przy przejęciu + 0,3 z kokpitu.
    const s2 = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          mk('sess-oil-2', 'session_claim', at(11, 0), { mode: 'free' }),
          mk('sess-oil-2', 'preflight_confirm', at(11, 0), {
            operation: 'skoki',
            reading: { fuelL: 120, mh: 1232.7 },
            oilAddedL: 0.7,
            mhFormat: 'hhmm',
          }),
          mk('sess-oil-2', 'oil_add', at(11, 5), { addedL: 0.3 }),
          mk('sess-oil-2', 'engine_start', at(11, 10), {}),
          mk('sess-oil-2', 'engine_stop', at(12, 30), {}),
          mk('sess-oil-2', 'day_close', at(12, 40), {
            finalReading: { fuelL: 100, mh: 1234.1 },
          }),
        ],
      },
    });
    expect(s2.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');

    // Rachunek telefonu: oczekiwane = 10,6 + 1,0 − stawka × (licznik − 1230,5).
    expect(axa.handover.oil).toEqual({
      levelL: 10.6,
      atMh: 1230.5,
      at: at(8, 0),
      byPilotId: 'TMK',
      addedSinceL: 1.0,
    });
  });
});
