/**
 * UZ Aero (serwer) - testy `GET /reference` (§4.6, §4.8).
 *
 * Kontrakt z aplikacją: kształty `ReferenceAircraft`/`ReferencePilot` idą z pakietu
 * domeny, więc test sprawdza dokładnie to, co telefon włoży do cache. ETag/304 to
 * oszczędność łącza w terenie - flota zmienia się kilka razy w sezonie.
 */

import { describe, expect, it } from 'vitest';

import { testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

async function authed(app: Awaited<ReturnType<typeof testHarness>>['app']): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor('TMK') },
  });
  return login.json().token as string;
}

describe('GET /reference', () => {
  it('bez tokenu → 401 (dane floty nie są publiczne)', async () => {
    const { app } = await testHarness();
    const res = await app.inject({ method: 'GET', url: '/reference' });
    expect(res.statusCode).toBe(401);
  });

  it('zwraca flotę i pilotów w kształtach domeny - scenariusz zgodny z aplikacją', async () => {
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

    // Konfiguracja §5.4 - to z niej aplikacja bierze walidacje i formaty.
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

  it('otwarta sesja wypełnia claim w /reference - cache telefonu dostaje stan floty', async () => {
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
      // Stary ETag NIE może dać 304 - claim właśnie się zmienił.
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

  it('zmiana danych zmienia ETag - 304 nie zamraża floty na zawsze', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    const first = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });

    // Administrator wyłącza samolot ze służby - updated_at idzie do przodu.
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
      // Telefon musi dostać jawny brak, a nie normę „0 L/h" - na jej podstawie
      // ekran tankowania orzekłby, że każdy wynik jest „powyżej normy".
      expect(aircraft.consumption).toBeNull();
    }
  });

  it('policzona norma trafia do odpowiedzi i ZMIENIA ETag', async () => {
    // Bez trzeciego składnika ETagu przeliczenie modelu (które nie rusza ani floty,
    // ani sesji) byłoby dla telefonu niewidoczne - 304 zamroziłoby poprzednią odpowiedź.
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

    // Pozostałe jednostki nadal bez normy - wpis dotyczy jednego samolotu.
    const other = after.json().aircraft.find((a: { id: string }) => a.id === 'SP-FGK');
    expect(other.consumption).toBeNull();
  });
});

/**
 * SZLAK PRZEKAZANIA (uwaga z urządzenia, 2026-09-02): oś zdarzeń z mockupu 02A
 * istniała wyłącznie w typie (`Handover.trail`) - serwer nigdy jej nie wypełniał
 * i telefon nie miał czego narysować. Ogniwa opowiadają sesję-źródło przekazania:
 * przejęcie (co ZASTAŁ poprzednik - czyli wcześniejsze przekazanie), tankowania,
 * zdanie. Dzień bez tankowania opowiada się przejęciem i lotem - „mogłem lecieć
 * na paliwie, które zostało z poprzednika".
 */
describe('szlak przekazania w /reference (2026-09-02)', () => {
  const DAY = Date.UTC(2026, 5, 22);
  const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
  let seq = 0;
  // Prefiks ≥ 8 znaków: koperta `/events` wymaga uuid o długości min. 8.
  const mk = (sess: string, type: string, time: number, payload: object) => ({
    uuid: `trail-ref-${++seq}`,
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

  it('sesja z tankowaniem: przejęcie → tankowanie → zdanie, w porządku czasu', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    const sync = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          mk('sess-trail-1', 'session_claim', at(8, 0), { mode: 'free' }),
          mk('sess-trail-1', 'preflight_confirm', at(8, 0), {
            operation: 'skoki',
            reading: { fuelL: 150, mh: 1230.5 },
            mhFormat: 'hhmm',
          }),
          mk('sess-trail-1', 'refuel', at(8, 5), { beforeL: 150, addedL: 45, afterL: 195 }),
          mk('sess-trail-1', 'engine_start', at(8, 10), {}),
          mk('sess-trail-1', 'engine_stop', at(10, 30), {}),
          mk('sess-trail-1', 'day_close', at(10, 40), {
            finalReading: { fuelL: 120, mh: 1232.7 },
          }),
        ],
      },
    });
    expect(sync.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');

    expect(axa.handover.trail).toEqual([
      // Paliwo i licznik ZASTANE = poprzednie przekazanie; telefon rysuje z tego
      // wiersz „zastane 150 L z przekazania" i „przed włączeniem 1 230:30".
      {
        kind: 'claim',
        at: at(8, 0),
        pilotId: 'TMK',
        fuelDeltaL: null,
        fuelAfterL: 150,
        mhAfter: 1230.5,
        durationMs: null,
      },
      {
        kind: 'refuel',
        at: at(8, 5),
        pilotId: 'TMK',
        fuelDeltaL: 45,
        fuelAfterL: 195,
        mhAfter: null,
        durationMs: null,
      },
      // Czas trwania = czas BLOKOWY (bieg silnika 8:10→10:30), bo to jego
      // mianownikiem posługują się normy zużycia.
      {
        kind: 'flight',
        at: at(10, 40),
        pilotId: 'TMK',
        fuelDeltaL: null,
        fuelAfterL: 120,
        mhAfter: 1232.7,
        durationMs: 140 * 60_000,
      },
    ]);
  });

  it('sesja BEZ tankowania: przejęcie + zdanie wystarczą do opowieści', async () => {
    const { app } = await testHarness();
    const token = await authed(app);

    await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          mk('sess-trail-2', 'session_claim', at(8, 0), { mode: 'free' }),
          mk('sess-trail-2', 'preflight_confirm', at(8, 0), {
            operation: 'skoki',
            reading: { fuelL: 185, mh: 1230.5 },
            mhFormat: 'hhmm',
          }),
          mk('sess-trail-2', 'engine_start', at(8, 10), {}),
          mk('sess-trail-2', 'engine_stop', at(9, 40), {}),
          mk('sess-trail-2', 'day_close', at(9, 50), {
            finalReading: { fuelL: 150, mh: 1232.0 },
          }),
        ],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');

    expect(axa.handover.trail.map((e: { kind: string }) => e.kind)).toEqual(['claim', 'flight']);
    expect(axa.handover.trail[0]).toMatchObject({ fuelAfterL: 185, mhAfter: 1230.5 });
    expect(axa.handover.trail[1]).toMatchObject({ fuelAfterL: 150, mhAfter: 1232.0 });
  });

  it('przekazanie z sesji W TOKU kończy szlak przed zdaniem; stan początkowy szlaku nie ma', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    // Stan początkowy z panelu (issue #66): przekazanie jest, historii nie ma.
    await db.query(
      `UPDATE aircraft
          SET initial_mh = 1236.5, initial_fuel_l = 112, updated_at = now()
        WHERE id = 'SP-FGK'`,
    );

    // Zamknięta baza + NOWSZA sesja w toku ze świeżymi odczytami: przekazanie
    // przechodzi na sesję otwartą (`open_session`), a jej opowieść nie ma jeszcze
    // zdania - szlak kończy się na przejęciu.
    const sync = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          mk('sess-trail-3a', 'session_claim', at(8, 0), { mode: 'free' }),
          mk('sess-trail-3a', 'preflight_confirm', at(8, 0), {
            operation: 'skoki',
            reading: { fuelL: 185, mh: 1230.5 },
            mhFormat: 'hhmm',
          }),
          mk('sess-trail-3a', 'engine_start', at(8, 10), {}),
          mk('sess-trail-3a', 'engine_stop', at(9, 40), {}),
          mk('sess-trail-3a', 'day_close', at(9, 50), {
            finalReading: { fuelL: 150, mh: 1232.0 },
          }),
          mk('sess-trail-3b', 'session_claim', at(11, 0), { mode: 'free' }),
          mk('sess-trail-3b', 'preflight_confirm', at(11, 0), {
            operation: 'skoki',
            reading: { fuelL: 150, mh: 1232.0 },
            mhFormat: 'hhmm',
          }),
        ],
      },
    });
    expect(sync.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();

    const axa = body.aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');
    expect(axa.handover.byPilotId).toBe('TMK');
    expect(axa.handover.at).toBe(at(11, 0));
    expect(axa.handover.trail.map((e: { kind: string }) => e.kind)).toEqual(['claim']);
    expect(axa.handover.trail[0]).toMatchObject({ at: at(11, 0), fuelAfterL: 150 });

    const fgk = body.aircraft.find((a: { reg: string }) => a.reg === 'SP-FGK');
    expect(fgk.handover.byPilotId).toBeNull();
    expect(fgk.handover.trail).toBeUndefined();
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

    // Sesja 1: POMIAR 10,6 L przy liczniku 1230,5 - to ona zostanie kotwicą.
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

    // Sesja 2: BEZ pomiaru (bagnet gorący) - dolewka 0,7 przy przejęciu + 0,3 z kokpitu.
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

/**
 * STAN POCZĄTKOWY JEDNOSTKI (issue #66) - zerowe ogniwo łańcucha odczytów.
 *
 * Zgłoszenie: „dla pierwszych lotów gdzie nie ma jeszcze danych nie ma jak wyliczyć
 * normy i odchyleń". Pierwszy pilot maszyny nie miał od czego zacząć - `handover` był
 * `null`, więc krok liczników pokazywał „brak danych". Administrator wpisuje odtąd
 * odczyty przyrządów przy wprowadzeniu jednostki, a serwer składa z nich przekazanie
 * - ale WYŁĄCZNIE dopóki rejestr nie ma czym odpowiedzieć.
 */
describe('stan początkowy jednostki (issue #66)', () => {
  it('bez ani jednej sesji przekazanie powstaje z wpisu w panelu - `byPilotId` jest NULL', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    await db.query(
      `UPDATE aircraft
          SET initial_mh = 1236.5, initial_fuel_l = 112, initial_oil_l = 8.2,
              updated_at = now()
        WHERE id = 'SP-AXA'`,
    );

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');

    expect(axa.handover.reading).toEqual({ fuelL: 112, mh: 1236.5 });
    // Nikt tej maszyny nie przekazał - i ekran preflightu mówi o tym innym zdaniem.
    expect(axa.handover.byPilotId).toBeNull();
    // Olej kotwiczy się w LICZNIKU, bo tak liczy się oczekiwanie (`oilPreflight`).
    expect(axa.handover.oil).toMatchObject({ levelL: 8.2, atMh: 1236.5, addedSinceL: 0 });
  });

  it('POŁOWA wpisu nie jest przekazaniem - `reading` niesie parę albo nic', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    // Sam licznik, bez paliwa: zero udające odczyt paliwomierza byłoby gorsze
    // od milczenia (ta sama reguła, co przy filtrze sesji w `pickHandover`).
    await db.query(
      "UPDATE aircraft SET initial_mh = 1236.5, updated_at = now() WHERE id = 'SP-AXA'",
    );

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');
    expect(axa.handover).toBeNull();
  });

  it('pierwsza ZDANA sesja wypiera wpis z panelu - łańcuch prowadzą odczyty z lotów', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    await db.query(
      `UPDATE aircraft
          SET initial_mh = 1236.5, initial_fuel_l = 112, initial_oil_l = 8.2,
              updated_at = now()
        WHERE id = 'SP-AXA'`,
    );

    const DAY = Date.UTC(2026, 5, 22);
    const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
    const mk = (i: number, type: string, time: number, payload: object) => ({
      uuid: `initial-seed-${i}`,
      sessionUuid: 'sess-init',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type,
      deviceTime: time,
      gpsTime: time,
      payload,
      schemaVersion: 1,
    });

    const sync = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          mk(1, 'session_claim', at(8, 0), { mode: 'free' }),
          mk(2, 'preflight_confirm', at(8, 5), {
            operation: 'skoki',
            reading: { fuelL: 112, mh: 1236.5 },
            mhFormat: 'decimal',
          }),
          mk(3, 'engine_start', at(8, 10), {}),
          mk(4, 'engine_stop', at(9, 30), {}),
          mk(5, 'day_close', at(9, 40), { finalReading: { fuelL: 84, mh: 1237.9 } }),
        ],
      },
    });
    expect(sync.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');

    expect(axa.handover.reading).toEqual({ fuelL: 84, mh: 1237.9 });
    expect(axa.handover.byPilotId).toBe('TMK');
  });

  it('norma nominalna spalania jedzie na telefon obok konfiguracji oleju', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    await db.query(
      "UPDATE aircraft SET fuel_norm_l_per_h = 18.5, updated_at = now() WHERE id = 'SP-AXA'",
    );

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    const axa = body.aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');
    const ank = body.aircraft.find((a: { reg: string }) => a.reg === 'SP-ANK');

    expect(axa.fuelNormLPerH).toBe(18.5);
    // Nieskonfigurowana jednostka niesie jawny brak, nie zero - ekran ma MILCZEĆ
    // o normie, a nie orzekać, że każda sesja jest powyżej niej.
    expect(ank.fuelNormLPerH).toBeNull();
  });

  // Stan początkowy NIE jedzie na telefon jako osobne pole: serwer składa z niego
  // przekazanie i wysyła gotowe. Druga kopia tych liczb na drucie byłaby pierwszym
  // miejscem, w którym ktoś policzy je inaczej niż `pickHandover`.
  it('samych liczb stanu początkowego w odpowiedzi NIE MA', async () => {
    const { app, db } = await testHarness();
    const token = await authed(app);

    await db.query(
      "UPDATE aircraft SET initial_mh = 1236.5, initial_fuel_l = 112 WHERE id = 'SP-AXA'",
    );

    const res = await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${token}` },
    });
    const axa = res.json().aircraft.find((a: { reg: string }) => a.reg === 'SP-AXA');

    expect(axa.initialMh).toBeUndefined();
    expect(axa.initialFuelL).toBeUndefined();
  });
});
