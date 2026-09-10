/**
 * UZ Aero (serwer) - IZOLACJA KLUBÓW: każda trasa z tokenem klubu A nie widzi danych klubu B
 * (wielofirmowość, epik C - issue #99 C3; `docs/wielofirmowosc.md` §12: „test izolacji jest
 * warunkiem wydania, nie dodatkiem").
 *
 * ══ LISTA TRAS POCHODZI Z FASTIFY, NIE Z TEGO PLIKU ══
 * Serwer prowadzi rejestr zarejestrowanych tras (`app.routeCatalog`, hook `onRoute`
 * w `buildServer`). Test bierze go w całości i wymaga, żeby KAŻDA trasa miała tu albo
 * przypadek izolacji, albo imienny wpis w wyjątkach z powodem. Nowa trasa bez jednego
 * z dwóch wywala ten test - to jest cała gwarancja, jaką da się dać regule „nic nie
 * wycieka między klubami": dokument może się zdezaktualizować, rejestr tras nie.
 *
 * ══ ŚWIAT: DWA KLUBY Z KOMPLETEM DANYCH ══
 * Klub A (Alfa) i klub B (Beta) dostają po jednej ZAMKNIĘTEJ operacji, flagę, odczyt
 * administratora (a z nim wpis audytu), normę zużycia, zgłoszenie błędu i kartę arkusza;
 * PWI - osoba w OBU klubach - ma operację w B. Dane klubu B niosą ZNACZNIKI (`SP-BBB`,
 * `sess-b`, `Barbara`, `beta-flag`…), których w żadnej odpowiedzi klubu A nie ma prawa
 * być. Sondy są dwojakie: LISTY muszą być czyste ze znaczników, ADRESY BEZPOŚREDNIE do
 * danych B muszą odpowiadać tak, jakby tych danych nie było (404, „nieznana", puste).
 *
 * Kody i nazwiska pilotów z B nie są znacznikami: `BAD` i `BPI` to trzyliterowe napisy,
 * które mogłyby paść w kursorze base64. Znacznikami są nazwiska (`Barbara Adamska`,
 * `Bartosz Pilecki`) i identyfikatory, których A nie ma z czego zbudować.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_BASE_URL, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_A_SHEETS_KEY, ORG_B, ORG_B_SHEETS_KEY, seedBetaFleet } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  seq += 1;
  return {
    uuid: `iso-${seq}-${type}`,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    ...base,
  };
}

/**
 * Jedna ZAMKNIĘTA operacja: przejęcie → zadanie z KLIENTEM → lot → zdanie. `dayOffset`
 * i odczyty startowe pozwalają położyć DRUGĄ operację tej samej maszyny bez nakładki
 * i bez cofnięcia licznika - flagi klubu B mają być te, które test wstawił sam, a nie
 * skutek uboczny nieuważnego seeda.
 */
function day(
  sessionUuid: string,
  aircraftId: string,
  picId: string,
  client: string,
  opts: { dayOffset?: number; fuelL?: number; mh?: number } = {},
) {
  const base = { sessionUuid, aircraftId, picId, dualId: null };
  const shift = (opts.dayOffset ?? 0) * 86_400_000;
  const fuelL = opts.fuelL ?? 150;
  const mh = opts.mh ?? 1234.5;
  return [
    event('session_claim', at(8, 0) + shift, { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0) + shift,
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        reading: { fuelL, mh },
        client,
        notes: `notatka ${client}`,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', at(8, 12) + shift, {}, base),
    event('takeoff', at(8, 25) + shift, { method: 'auto' }, base),
    event('landing', at(9, 18) + shift, { method: 'auto' }, base),
    event('engine_stop', at(10, 34) + shift, {}, base),
    event(
      'day_close',
      at(16, 45) + shift,
      { finalReading: { fuelL: fuelL - 62, mh: Math.round((mh + 6.65) * 100) / 100 } },
      base,
    ),
  ];
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const writer = (t: string) => ({ ...bearer(t), ...ADMIN_CSRF_HEADERS });

async function tokenOf(app: App, who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, `logowanie ${who}: ${res.body}`).toBe(200);
  return res.json().token as string;
}

/** Znaczniki klubu B - żaden nie ma prawa pojawić się w odpowiedzi dla klubu A. */
const B_MARKERS = [
  'SP-BBB',
  'sess-b',
  'sess-pwi-b',
  'Barbara',
  'Bartosz',
  'beta-flag',
  'bug-b',
  'BETA-CLIENT',
  'notatka BETA',
  'odczyt beta',
  'aeroklub-beta',
  'Aeroklub Beta',
  ORG_B_SHEETS_KEY,
  // Kolejka zgłoszeń i kod klubu (issue #100): adres kandydata do Bety i kod Bety nie mają
  // prawa pokazać się w żadnej odpowiedzi dla Alfy.
  'kandydat@beta.pl',
  'BETAKDE',
] as const;

interface World {
  app: App;
  db: Harness['db'];
  /** Administrator klubu A (TMK) - token telefonu, który otwiera też trasy panelu. */
  a: string;
  /** Administrator klubu B (BAD). */
  b: string;
  /** PWI w klubie A - osoba, która ma operację także w B. */
  pwiA: string;
  /** Flaga klubu B - identyfikator do sond „po adresie". */
  flagB: number;
  /** Flaga klubu A - kontrola pozytywna (własne dane widać). */
  flagA: number;
  /** Osoba ze zgłoszeniem `pending` do klubu B - cel sond „po adresie" dla decyzji. */
  pendingB: string;
}

/**
 * Świat dwóch klubów. Dane B wchodzą TYMI SAMYMI trasami, co dane A (ingest, odczyt
 * administratora, zgłoszenie), a tam, gdzie trasa nie istnieje (flaga, norma) - wprost
 * do bazy, z klubem w wierszu, tak jak zapisałby je serwer.
 */
async function twoClubs(): Promise<World> {
  const harness = await testHarness();
  const { app, db } = harness;
  await seedBetaFleet(db);

  const a = await tokenOf(app, 'TMK');
  const b = await tokenOf(app, 'BAD');
  const bpi = await tokenOf(app, 'BPI');

  // PWI: token klubu B (świeższy refresh w B przestawia klub aktywny), potem klubu A.
  await db.query(
    `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
     VALUES ('pwi-b', 'PWI', $1, $2, $3)`,
    [ORG_B, new Date(harness.clock.now().getTime() + 86_400_000), harness.clock.now()],
  );
  const pwiB = await tokenOf(app, 'PWI');
  harness.clock.advance(60_000);
  await db.query(
    `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
     VALUES ('pwi-a', 'PWI', $1, $2, $3)`,
    [ORG_A, new Date(harness.clock.now().getTime() + 86_400_000), harness.clock.now()],
  );
  const pwiA = await tokenOf(app, 'PWI');

  const post = (token: string, events: unknown[]) =>
    app.inject({ method: 'POST', url: '/events', headers: bearer(token), payload: { events } });
  expect((await post(a, day('sess-a', 'SP-AXA', 'TMK', 'ALFA-CLIENT'))).statusCode).toBe(200);
  expect((await post(b, day('sess-b', 'SP-BBB', 'BAD', 'BETA-CLIENT'))).statusCode).toBe(200);
  // Operacja PWI w Becie: dobę PÓŹNIEJ, odczytami ciągłymi z `sess-b` - bez nakładki
  // i bez cofnięcia licznika, więc ingest nie dokłada Becie flag spoza zamiaru testu.
  expect(
    (
      await post(
        pwiB,
        day('sess-pwi-b', 'SP-BBB', 'PWI', 'BETA-CLIENT', { dayOffset: 1, fuelL: 88, mh: 1241.15 }),
      )
    ).statusCode,
  ).toBe(200);

  // Odczyty administratora (→ `aircraft_readings` + wpis `admin_audit` w każdym klubie).
  const reading = (token: string, aircraftId: string, note: string) =>
    app.inject({
      method: 'POST',
      url: `/admin/api/fleet/${aircraftId}/readings`,
      headers: writer(token),
      payload: { mh: 1300, fuelL: 100, oilL: null, note },
    });
  expect((await reading(a, 'SP-AXA', 'odczyt alfa')).statusCode).toBe(201);
  expect((await reading(b, 'SP-BBB', 'odczyt beta')).statusCode).toBe(201);

  // Zgłoszenia błędów z telefonów obu klubów.
  const bug = (token: string, uuid: string) =>
    app.inject({
      method: 'POST',
      url: '/me/bug-reports',
      headers: bearer(token),
      payload: {
        reports: [
          {
            uuid,
            createdAt: '2026-06-22T09:00:00.000Z',
            description: `zgłoszenie ${uuid}`,
            screen: 'KOKPIT',
            context: {},
          },
        ],
      },
    });
  expect((await bug(a, 'bug-a')).statusCode).toBe(200);
  expect((await bug(bpi, 'bug-b')).statusCode).toBe(200);

  // Flagi i normy - wprost, z klubem w wierszu (tak zapisałby je ingest / analityka).
  const flag = async (orgId: string, aircraftId: string, sessionUuid: string, marker: string) => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO flags (type, aircraft_id, session_uuids, details, org_id)
       VALUES ('mh_gap', $1, ARRAY[$2]::text[], $3, $4) RETURNING id`,
      [aircraftId, sessionUuid, JSON.stringify({ marker }), orgId],
    );
    return rows[0]!.id;
  };
  const flagA = await flag(ORG_A, 'SP-AXA', 'sess-a', 'alfa-flag');
  const flagB = await flag(ORG_B, 'SP-BBB', 'sess-b', 'beta-flag');

  for (const [orgId, aircraftId] of [
    [ORG_A, 'SP-AXA'],
    [ORG_B, 'SP-BBB'],
  ] as const) {
    await db.query(
      `INSERT INTO aircraft_consumption (aircraft_id, window_days, model, computed_at, org_id)
       VALUES ($1, 90, '{"blockLPerH": 40}'::jsonb, now(), $2)`,
      [aircraftId, orgId],
    );
  }

  // Zgłoszenie kodem klubu do BETY + kod klubu Bety (issue #100, D2). Wprost do bazy,
  // bo drogę pilota ma `joinClub.test.ts` - tu liczy się wyłącznie to, że klub A tego
  // wiersza nie widzi i nie rozstrzygnie.
  await db.query(
    `INSERT INTO pilots (id, name, email, active) VALUES ('kandydat-b', 'Kandydat Beta', 'kandydat@beta.pl', TRUE)`,
  );
  await db.query(
    `INSERT INTO memberships (org_id, pilot_id, status, joined_via) VALUES ($1, 'kandydat-b', 'pending', 'code')`,
    [ORG_B],
  );
  await db.query(`UPDATE organizations SET join_code = 'BETAKDE', join_code_since = now() WHERE id = $1`, [ORG_B]);

  return { app, db, a, b, pwiA, flagA, flagB, pendingB: 'kandydat-b' };
}

/** Odpowiedź bez ani jednego znacznika klubu B. */
function expectClean(res: { statusCode: number; body: string }, label: string): void {
  expect(res.statusCode, `${label}: ${res.body}`).toBe(200);
  for (const marker of B_MARKERS) {
    expect(res.body, `${label} zdradza „${marker}"`).not.toContain(marker);
  }
}

// ══ PRZYPADKI IZOLACJI - jeden na trasę z rejestru ═════════════════════════════════

type Probe = (w: World) => Promise<void>;

/**
 * Klucz = `METHOD url` dokładnie tak, jak trasa stoi w rejestrze Fastify. Każdy przypadek
 * pyta jako klub A o dane klubu B - i sprawdza, że ich nie dostaje. Tam, gdzie trasa
 * ma sens także jako pozytywna kontrola (własne dane WIDAĆ), sonda sprawdza i to:
 * test, który przechodzi na pustej bazie, niczego nie dowodzi.
 */
const CASES: Record<string, Probe> = {
  // ── telefon ──────────────────────────────────────────────────────────────────
  'GET /reference': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/reference', headers: bearer(a) });
    expectClean(res, '/reference');
    expect(res.json().aircraft.map((x: { reg: string }) => x.reg)).toContain('SP-AXA');
  },

  'POST /events': async ({ app, db, a }) => {
    // Zapis do maszyny B i do sesji B z tokenu A - wstrzymany w całości, zero wierszy.
    const foreign = [
      ...day('sess-x', 'SP-BBB', 'TMK', 'X'),
      event('refuel', at(11, 0), { beforeL: 80, addedL: 10, afterL: 90 }, {
        sessionUuid: 'sess-b',
        aircraftId: 'SP-BBB',
        picId: 'TMK',
        dualId: null,
      }),
    ];
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: bearer(a),
      payload: { events: foreign },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(0);
    expect([...res.json().withheld].sort()).toEqual(foreign.map((e) => e.uuid).sort());
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM events WHERE org_id = $1`,
      [ORG_B],
    );
    expect(Number(rows[0]!.n)).toBe(14);
  },

  'GET /me/events': async ({ app, pwiA }) => {
    // PWI ma operację w B (`sess-pwi-b`) - pod tokenem A jej nie odtworzy.
    const res = await app.inject({ method: 'GET', url: '/me/events', headers: bearer(pwiA) });
    expectClean(res, '/me/events');
    expect(res.json().events).toEqual([]);
  },

  'GET /aircraft/:id/state': async ({ app, a }) => {
    const foreign = await app.inject({ method: 'GET', url: '/aircraft/SP-BBB/state', headers: bearer(a) });
    expect(foreign.statusCode).toBe(404);
    const own = await app.inject({ method: 'GET', url: '/aircraft/SP-AXA/state', headers: bearer(a) });
    expect(own.statusCode).toBe(200);
  },

  'GET /aircraft/:id/readings-chain': async ({ app, a }) => {
    const foreign = await app.inject({
      method: 'GET',
      url: `/aircraft/SP-BBB/readings-chain?at=${at(12, 0)}`,
      headers: bearer(a),
    });
    expect(foreign.statusCode).toBe(404);
    const own = await app.inject({
      method: 'GET',
      url: `/aircraft/SP-AXA/readings-chain?at=${at(12, 0)}`,
      headers: bearer(a),
    });
    expectClean(own, 'readings-chain');
  },

  'GET /sessions/:uuid/sync-status': async ({ app, a }) => {
    // Cudza sesja wygląda jak NIEZNANA serwerowi - dokładnie jak uuid, którego nie ma.
    const res = await app.inject({ method: 'GET', url: '/sessions/sess-b/sync-status', headers: bearer(a) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sessionUuid: 'sess-b',
      received: 0,
      status: 'unknown',
      flags: [],
      exportUrl: null,
    });
  },

  'GET /sheets/:tab': async ({ app, a }) => {
    const foreign = await app.inject({ method: 'GET', url: '/sheets/2026-06-22_SP-BBB', headers: bearer(a) });
    expect(foreign.statusCode).toBe(404);
    const own = await app.inject({ method: 'GET', url: '/sheets/2026-06-22_SP-AXA', headers: bearer(a) });
    expectClean(own, '/sheets/:tab');
  },

  'GET /sheets/:slug/:tab': async ({ app }) => {
    // Sekret klubu A nie otwiera karty klubu B - ani pod slugiem B, ani pod slugiem A.
    const wrongClub = await app.inject({
      method: 'GET',
      url: `/sheets/aeroklub-beta/2026-06-22_SP-BBB?k=${ORG_A_SHEETS_KEY}`,
    });
    expect(wrongClub.statusCode).toBe(404);
    const wrongTab = await app.inject({
      method: 'GET',
      url: `/sheets/aeroklub-alfa/2026-06-22_SP-BBB?k=${ORG_A_SHEETS_KEY}`,
    });
    expect(wrongTab.statusCode).toBe(404);
    // Kontrola pozytywna: właściwy sekret otwiera właściwą kartę bez logowania.
    const own = await app.inject({
      method: 'GET',
      url: `/sheets/aeroklub-alfa/2026-06-22_SP-AXA?k=${ORG_A_SHEETS_KEY}`,
    });
    expectClean(own, '/sheets/:slug/:tab');
  },

  'GET /me/sessions/:uuid/track': async ({ app, pwiA }) => {
    // Własna operacja PWI, ale w klubie B - pod tokenem A nie istnieje.
    const res = await app.inject({ method: 'GET', url: '/me/sessions/sess-pwi-b/track', headers: bearer(pwiA) });
    expect(res.statusCode).toBe(404);
  },

  'POST /traces': async ({ app, a, b }) => {
    const entry = (sessionUuid: string) => ({
      sessionUuid,
      kind: 'fix',
      time: at(8, 30),
      deviceTime: at(8, 30),
      gs: 60,
      alt: 900,
      lat: 50.078,
      lon: 19.785,
      accuracyM: 5,
      detail: null,
    });
    const foreign = await app.inject({
      method: 'POST',
      url: '/traces',
      headers: bearer(a),
      payload: { entries: [entry('sess-b')] },
    });
    expect(foreign.statusCode).toBe(403);
    // Ślad klubu B nie dostał ani jednego cudzego fixa.
    const track = await app.inject({ method: 'GET', url: '/me/sessions/sess-b/track', headers: bearer(b) });
    expect(track.statusCode).toBe(200);
    expect(track.json().line ?? []).toHaveLength(0);
  },

  'GET /me/prefs': async ({ app, a }) => {
    // Preferencje OSOBY (motyw) - bez danych klubu; brama członkostwa działa jak wszędzie.
    expect((await app.inject({ method: 'GET', url: '/me/prefs', headers: bearer(a) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/me/prefs' })).statusCode).toBe(401);
  },

  'PUT /me/prefs': async ({ app, a }) => {
    const res = await app.inject({
      method: 'PUT',
      url: '/me/prefs',
      headers: bearer(a),
      payload: { theme: 'solar', themeUpdatedAt: '2026-06-22T10:00:00.000Z' },
    });
    expect(res.statusCode).toBe(200);
  },

  'POST /me/bug-reports': async ({ app, db, a }) => {
    // Zgłoszenie ląduje w klubie Z TOKENU - nie da się zgłosić „do" innego klubu.
    const res = await app.inject({
      method: 'POST',
      url: '/me/bug-reports',
      headers: bearer(a),
      payload: {
        reports: [
          { uuid: 'bug-a2', createdAt: '2026-06-22T09:00:00.000Z', description: 'x', screen: 'S', context: {} },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const { rows } = await db.query<{ org_id: string }>(`SELECT org_id FROM bug_reports WHERE uuid = 'bug-a2'`);
    expect(rows[0]!.org_id).toBe(ORG_A);
  },

  'GET /me/task-suggestions': async ({ app, pwiA }) => {
    // Klient i notatka z operacji PWI w B nie podpowiadają się pod tokenem A.
    const res = await app.inject({ method: 'GET', url: '/me/task-suggestions', headers: bearer(pwiA) });
    expectClean(res, '/me/task-suggestions');
  },

  /**
   * PRZEŁĄCZENIE KLUBU W TELEFONIE (issue #102) - jedyna trasa telefonu, która przyjmuje
   * CUDZY identyfikator klubu w ciele, więc jest naturalnym miejscem na próbę wejścia
   * bokiem. Ta sama para sprawdzeń, co przy `POST /admin/api/auth/switch`.
   *
   * TMK lata wyłącznie w Alfie: klub Bety jest dla niego NIEISTNIEJĄCY (404, nie 403 -
   * 403 potwierdzałoby, że taki klub jest), a odmowa nie może wydać ani jednego tokenu.
   */
  'POST /auth/switch': async ({ app, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/switch',
      headers: bearer(a),
      payload: { orgId: ORG_B },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('refreshToken');

    // Kontrola pozytywna: własny klub przełącza się normalnie, więc 404 wyżej opisuje
    // brak członkostwa, a nie zepsutą trasę.
    const own = await app.inject({
      method: 'POST',
      url: '/auth/switch',
      headers: bearer(a),
      payload: { orgId: ORG_A },
    });
    expect(own.json().org.id).toBe(ORG_A);
    expectClean(own, '/auth/switch');
  },

  // ── panel klubu ──────────────────────────────────────────────────────────────
  'GET /admin/api/me': async ({ app, a }) => {
    expectClean(await app.inject({ method: 'GET', url: '/admin/api/me', headers: bearer(a) }), '/me');
  },

  'GET /admin/api/audit': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/audit', headers: bearer(a) });
    expectClean(res, '/audit');
    // Kontrola pozytywna: wpis o własnym odczycie jest.
    expect(res.body).toContain('odczyt alfa');
  },

  'GET /admin/api/fleet/:id/consumption': async ({ app, a }) => {
    const foreign = await app.inject({ method: 'GET', url: '/admin/api/fleet/SP-BBB/consumption', headers: bearer(a) });
    expect(foreign.statusCode).toBe(404);
    expectClean(
      await app.inject({ method: 'GET', url: '/admin/api/fleet/SP-AXA/consumption', headers: bearer(a) }),
      '/consumption',
    );
  },

  'POST /admin/api/sessions/:uuid/corrections/preview': async ({ app, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-b/corrections/preview',
      headers: writer(a),
      payload: { targetUuid: 'x', action: 'void' },
    });
    expect(res.statusCode).toBe(404);
  },

  'POST /admin/api/sessions/:uuid/corrections': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-b/corrections',
      headers: writer(a),
      payload: { targetUuid: 'x', action: 'void', reason: 'próba' },
    });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM events WHERE session_uuid = 'sess-b' AND type = 'event_correction'`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  },

  'GET /admin/api/dashboard': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/dashboard', headers: bearer(a) });
    expectClean(res, '/dashboard');
    expect(res.json().counts.aircraftTotal).toBe(4);
  },

  'GET /admin/api/events': async ({ app, a }) => {
    expectClean(await app.inject({ method: 'GET', url: '/admin/api/events', headers: bearer(a) }), '/events');
    const bySession = await app.inject({
      method: 'GET',
      url: '/admin/api/events?sessionUuid=sess-b',
      headers: bearer(a),
    });
    expect(bySession.json().items).toEqual([]);
  },

  'GET /admin/api/exports': async ({ app, a }) => {
    expectClean(await app.inject({ method: 'GET', url: '/admin/api/exports', headers: bearer(a) }), '/exports');
  },

  'GET /admin/api/exports/:sessionUuid': async ({ app, a }) => {
    expect(
      (await app.inject({ method: 'GET', url: '/admin/api/exports/sess-b', headers: bearer(a) })).statusCode,
    ).toBe(404);
  },

  'GET /admin/api/exports/:sessionUuid/sheet': async ({ app, a }) => {
    expect(
      (await app.inject({ method: 'GET', url: '/admin/api/exports/sess-b/sheet', headers: bearer(a) })).statusCode,
    ).toBe(404);
  },

  'POST /admin/api/exports/:sessionUuid/retry': async ({ app, db, a }) => {
    const res = await app.inject({ method: 'POST', url: '/admin/api/exports/sess-b/retry', headers: writer(a) });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM export_log WHERE session_uuid = 'sess-b'`);
    expect(Number(rows[0]!.n)).toBe(1);
  },

  'GET /admin/api/flags': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/flags', headers: bearer(a) });
    expectClean(res, '/flags');
    expect(res.body).toContain('alfa-flag');
  },

  'POST /admin/api/flags/:id/resolve': async ({ app, db, a, flagB }) => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/api/flags/${flagB}/resolve`,
      headers: writer(a),
      payload: { note: 'próba' },
    });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM flags WHERE id = $1`, [flagB]);
    expect(rows[0]!.status).toBe('open');
  },

  'GET /admin/api/fleet': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/fleet', headers: bearer(a) });
    expectClean(res, '/fleet');
    expect(res.json().counts.total).toBe(4);
  },

  'GET /admin/api/fleet/tolerance': async ({ app, a }) => {
    expect(
      (await app.inject({ method: 'GET', url: '/admin/api/fleet/tolerance?aircraftId=SP-BBB', headers: bearer(a) }))
        .statusCode,
    ).toBe(404);
  },

  'POST /admin/api/fleet': async ({ app, db, a }) => {
    // Nowa maszyna ląduje w klubie aktora; rejestracja zajęta w B nie jest kolizją w A.
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/fleet',
      headers: writer(a),
      payload: { reg: 'SP-BBB', type: 'Cessna 152', capacityL: 100, mhFormat: 'decimal' },
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().aircraft.id as string;
    const { rows } = await db.query<{ org_id: string }>(`SELECT org_id FROM aircraft WHERE id = $1`, [id]);
    expect(rows[0]!.org_id).toBe(ORG_A);
    // …i ZARAZ znika: `SP-BBB` jest znacznikiem klubu B dla pozostałych sond, a maszyna
    // klubu A o tej rejestracji zapaliłaby je wszystkie jako wyciek. Sondy dzielą jeden
    // świat, więc ta, która go zmienia, po sobie sprząta.
    await db.query(`DELETE FROM aircraft WHERE id = $1`, [id]);
  },

  'PATCH /admin/api/fleet/:id': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/api/fleet/SP-BBB',
      headers: writer(a),
      payload: { type: 'Przemalowana' },
    });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ type: string }>(`SELECT type FROM aircraft WHERE id = 'SP-BBB'`);
    expect(rows[0]!.type).toBe('Cessna 152');
  },

  'DELETE /admin/api/fleet/:id': async ({ app, db, a }) => {
    expect((await app.inject({ method: 'DELETE', url: '/admin/api/fleet/SP-BBB', headers: writer(a) })).statusCode).toBe(404);
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM aircraft WHERE id = 'SP-BBB'`);
    expect(Number(rows[0]!.n)).toBe(1);
  },

  'POST /admin/api/fleet/:id/readings': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/fleet/SP-BBB/readings',
      headers: writer(a),
      payload: { mh: 1400, fuelL: 50, oilL: null, note: 'wpis alfy do bety' },
    });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM aircraft_readings WHERE aircraft_id = 'SP-BBB'`);
    expect(Number(rows[0]!.n)).toBe(1);
  },

  'GET /admin/api/log': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/log', headers: bearer(a) });
    expectClean(res, '/log');
    expect(res.json().aircraft.map((x: { reg: string }) => x.reg)).toContain('SP-AXA');
  },

  'GET /admin/api/maintenance/projections/compare': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/maintenance/projections/compare', headers: bearer(a) });
    expectClean(res, '/projections/compare');
    // Porównanie obejmuje sesje KLUBU: jedna w A, nie trzy w całej bazie.
    expect(res.json().sessions).toBe(1);
  },

  'POST /admin/api/maintenance/projections/rebuild': async ({ app, db, a }) => {
    // Rozjazd W OBU klubach - przebudowa z panelu A naprawia wyłącznie wiersz A.
    await db.query(`UPDATE sessions SET flights_count = 9 WHERE session_uuid IN ('sess-a', 'sess-b')`);
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/maintenance/projections/rebuild',
      headers: writer(a),
      payload: { reason: 'test izolacji' },
    });
    expectClean(res, '/projections/rebuild');
    expect(res.json().written).toBe(1);
    const { rows } = await db.query<{ session_uuid: string; flights_count: number }>(
      `SELECT session_uuid, flights_count FROM sessions WHERE session_uuid IN ('sess-a', 'sess-b') ORDER BY session_uuid`,
    );
    expect(rows).toEqual([
      { session_uuid: 'sess-a', flights_count: 1 },
      { session_uuid: 'sess-b', flights_count: 9 },
    ]);
  },

  'GET /admin/api/maintenance/refresh-tokens': async ({ app, db, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/maintenance/refresh-tokens', headers: bearer(a) });
    expect(res.statusCode).toBe(200);
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM refresh_tokens WHERE org_id = $1`, [ORG_A]);
    expect(res.json().total).toBe(Number(rows[0]!.n));
  },

  'POST /admin/api/maintenance/refresh-tokens/purge': async ({ app, db, a }) => {
    // Wygasły token klubu B PRZEŻYWA sprzątanie zlecone z panelu klubu A.
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ('stale-b', 'BAD', $1, '2020-01-01T00:00:00Z', '2019-01-01T00:00:00Z')`,
      [ORG_B],
    );
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/maintenance/refresh-tokens/purge',
      headers: writer(a),
      payload: { confirm: 'prune_expired_tokens' },
    });
    expect(res.statusCode).toBe(200);
    const { rows } = await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM refresh_tokens WHERE token_hash = 'stale-b'`);
    expect(Number(rows[0]!.n)).toBe(1);
  },

  'GET /admin/api/pilots': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/pilots', headers: bearer(a) });
    expectClean(res, '/pilots');
    expect(res.json().items.map((i: { code: string }) => i.code)).not.toContain('PWB');
  },

  'PATCH /admin/api/pilots/:id': async ({ app, a }) => {
    expect(
      (await app.inject({ method: 'PATCH', url: '/admin/api/pilots/BPI', headers: writer(a), payload: { name: 'X Y' } }))
        .statusCode,
    ).toBe(404);
  },

  'POST /admin/api/pilots/:id/active': async ({ app, db, a }) => {
    expect(
      (await app.inject({ method: 'POST', url: '/admin/api/pilots/BAD/active', headers: writer(a), payload: { active: false } }))
        .statusCode,
    ).toBe(404);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM memberships WHERE pilot_id = 'BAD'`);
    expect(rows[0]!.status).toBe('active');
  },

  'DELETE /admin/api/pilots/:id': async ({ app, a }) => {
    expect((await app.inject({ method: 'DELETE', url: '/admin/api/pilots/BPI', headers: writer(a) })).statusCode).toBe(404);
  },

  'POST /admin/api/sessions/:uuid/close': async ({ app, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-b/close',
      headers: writer(a),
      payload: { reason: 'próba' },
    });
    expect(res.statusCode).toBe(404);
  },

  'POST /admin/api/sessions/:uuid/void': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-b/void',
      headers: writer(a),
      payload: { reason: 'próba' },
    });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM sessions WHERE session_uuid = 'sess-b'`);
    expect(rows[0]!.status).toBe('closed');
  },

  'GET /admin/api/sessions': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/sessions', headers: bearer(a) });
    expectClean(res, '/sessions');
    expect(res.json().total).toBe(1);
  },

  'GET /admin/api/sessions/:uuid': async ({ app, a }) => {
    expect((await app.inject({ method: 'GET', url: '/admin/api/sessions/sess-b', headers: bearer(a) })).statusCode).toBe(404);
    expectClean(await app.inject({ method: 'GET', url: '/admin/api/sessions/sess-a', headers: bearer(a) }), '/sessions/:uuid');
  },

  'GET /admin/api/sessions/:uuid/track': async ({ app, a }) => {
    expect(
      (await app.inject({ method: 'GET', url: '/admin/api/sessions/sess-b/track', headers: bearer(a) })).statusCode,
    ).toBe(404);
  },

  'GET /admin/api/stats': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/stats', headers: bearer(a) });
    expectClean(res, '/stats');
    expect(res.json().totals.sessions).toBe(1);
  },

  // ── kolejka zgłoszeń i kod klubu (issue #100, D2) ────────────────────────────
  'GET /admin/api/memberships/pending': async ({ app, a }) => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/memberships/pending',
      headers: bearer(a),
    });
    expectClean(res, '/memberships/pending');
    // Kolejka Alfy jest PUSTA, choć w Becie ktoś czeka - zgłoszenie należy do klubu.
    expect(res.json().items).toEqual([]);
  },

  'POST /admin/api/memberships/:id/approve': async ({ app, db, a, pendingB }) => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/api/memberships/${pendingB}/approve`,
      headers: writer(a),
      payload: { code: 'KAN', role: 'pilot' },
    });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ status: string; code: string | null }>(
      'SELECT status, code FROM memberships WHERE pilot_id = $1',
      [pendingB],
    );
    expect(rows[0]).toEqual({ status: 'pending', code: null });
  },

  'POST /admin/api/memberships/:id/reject': async ({ app, db, a, pendingB }) => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/api/memberships/${pendingB}/reject`,
      headers: writer(a),
      payload: { reason: 'nie nasz klub' },
    });
    expect(res.statusCode).toBe(404);
    const { rows } = await db.query<{ status: string }>(
      'SELECT status FROM memberships WHERE pilot_id = $1',
      [pendingB],
    );
    expect(rows[0]?.status).toBe('pending');
  },

  'POST /admin/api/memberships/:id/reopen': async ({ app, a, pendingB }) => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/api/memberships/${pendingB}/reopen`,
      headers: writer(a),
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  },

  // STOI PRZED dwoma mutacjami niżej i musi tak zostać: sondy jadą w kolejności wpisów
  // po jednym świecie, a rotacja i wyłączenie zmieniają kod KLUBU A. Przeniesiony za nie
  // sprawdzałby kod, którego żaden administrator nigdy nie widział.
  'GET /admin/api/club-code': async ({ app, a }) => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/club-code', headers: bearer(a) });
    expectClean(res, '/club-code');
    // Kod WŁASNEGO klubu widać - skopowanie nie znaczy „nikt nic nie widzi".
    expect(res.json().code).toBe('AZG7K4M');
  },

  'POST /admin/api/club-code/rotate': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/club-code/rotate',
      headers: writer(a),
    });
    expect(res.statusCode).toBe(200);
    // Rotacja w Alfie nie rusza kolumny Bety ani jej stempla.
    const { rows } = await db.query<{ join_code: string }>(
      'SELECT join_code FROM organizations WHERE id = $1',
      [ORG_B],
    );
    expect(rows[0]?.join_code).toBe('BETAKDE');
  },

  'POST /admin/api/club-code/disable': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/club-code/disable',
      headers: writer(a),
    });
    expect(res.statusCode).toBe(200);
    const { rows } = await db.query<{ id: string; join_code: string | null }>(
      'SELECT id, join_code FROM organizations ORDER BY id',
    );
    expect(rows).toEqual([
      { id: ORG_A, join_code: null },
      { id: ORG_B, join_code: 'BETAKDE' },
    ]);
  },

  // ── platforma (superadministrator) ───────────────────────────────────────────
  'GET /admin/api/organizations': async ({ app, a }) => {
    // Trasa PLATFORMY: sesja klubu jej nie otwiera, więc lista klubów nie jest drogą
    // do zobaczenia, kto jeszcze jest na tym serwerze.
    expect(
      (await app.inject({ method: 'GET', url: '/admin/api/organizations', headers: bearer(a) }))
        .statusCode,
    ).toBe(401);
  },

  'POST /admin/api/organizations': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/organizations',
      headers: writer(a),
      payload: {
        name: 'Klub z Alfy',
        slug: 'klub-z-alfy',
        admin: { name: 'Ktoś Nowy', email: 'ktos@alfa.pl', code: 'KTO' },
      },
    });
    expect(res.statusCode).toBe(401);
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM organizations');
    expect(Number(rows[0]!.n)).toBe(2);
  },

  'GET /admin/api/organizations/:id': async ({ app, a }) => {
    // Także o WŁASNY klub: administrator klubu czyta go przez `GET /admin/api/me`,
    // a nie przez moduł platformy.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/admin/api/organizations/${ORG_B}`,
          headers: bearer(a),
        })
      ).statusCode,
    ).toBe(401);
  },

  'PATCH /admin/api/organizations/:id': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/api/organizations/${ORG_B}`,
      headers: writer(a),
      payload: { name: 'Przejęte przez Alfę' },
    });
    expect(res.statusCode).toBe(401);
    const { rows } = await db.query<{ name: string }>(
      'SELECT name FROM organizations WHERE id = $1',
      [ORG_B],
    );
    expect(rows[0]?.name).toBe('Aeroklub Beta');
  },

  'POST /admin/api/organizations/:id/active': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/api/organizations/${ORG_B}/active`,
      headers: writer(a),
      payload: { active: false },
    });
    expect(res.statusCode).toBe(401);
    const { rows } = await db.query<{ active: boolean }>(
      'SELECT active FROM organizations WHERE id = $1',
      [ORG_B],
    );
    expect(rows[0]?.active).toBe(true);
  },

  /**
   * PRZEŁĄCZENIE ZAKRESU (issue #101, E2) - jedyna trasa panelu, która przyjmuje CUDZY
   * identyfikator klubu w ciele, więc jest naturalnym miejscem na próbę wejścia bokiem.
   *
   * TMK jest administratorem wyłącznie w Alfie: klub Bety jest dla niego NIEISTNIEJĄCY
   * (404, nie 403 - 403 potwierdzałoby, że taki klub jest), a odmowa nie może zostawić
   * ciasteczka. To ostatnie sprawdzamy wprost: sesja wydana mimo odmowy byłaby wejściem
   * do cudzego dziennika przez każdą kolejną trasę panelu.
   */
  'POST /admin/api/auth/switch': async ({ app, a }) => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/switch',
      headers: writer(a),
      payload: { orgId: ORG_B },
    });
    expect(res.statusCode).toBe(404);
    expect(res.cookies.find((c) => c.name === 'uzaero_admin')).toBeUndefined();

    // Kontrola pozytywna: własny klub przełącza się normalnie, więc 404 wyżej opisuje
    // brak członkostwa, a nie zepsutą trasę.
    const own = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/switch',
      headers: writer(a),
      payload: { orgId: ORG_A },
    });
    expect(own.statusCode).toBe(200);
    expect(own.json().org.id).toBe(ORG_A);
    expectClean(own, '/admin/api/auth/switch');
  },

  'GET /admin/api/bug-reports': async ({ app, a }) => {
    // Trasa PLATFORMY: sesja klubu jej nie otwiera - dla klubu zgłoszeń nie ma wcale.
    expect((await app.inject({ method: 'GET', url: '/admin/api/bug-reports', headers: bearer(a) })).statusCode).toBe(401);
  },

  'PATCH /admin/api/bug-reports/:uuid': async ({ app, db, a }) => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/api/bug-reports/bug-b',
      headers: writer(a),
      payload: { status: 'resolved' },
    });
    expect(res.statusCode).toBe(401);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM bug_reports WHERE uuid = 'bug-b'`);
    expect(rows[0]!.status).toBe('new');
  },
};

/**
 * Trasy, które NIE SĄ trasami klubu - każda z powodem. Wpis tutaj jest decyzją
 * widoczną w diffie, nie skutkiem ubocznym nazwania trasy „jakoś tak".
 */
const NOT_CLUB_ROUTES: Record<string, string> = {
  'GET /health': 'sonda życia procesu, bez danych',
  'POST /auth/google': 'logowanie - poświadczenia dostawcy, jeszcze bez klubu',
  'GET /auth/memberships': 'lista klubów OSOBY z tokenu - to jej własne członkostwa',
  'POST /auth/refresh': 'rotacja refresha w klubie, dla którego go wydano',
  'POST /auth/join': 'zgłoszenie do klubu kodem - token osoby, bez danych klubu',
  'GET /admin/api/auth/google-client': 'identyfikator klienta Google - publiczny z definicji',
  'GET /admin/api/maintenance/schema': 'numer wersji schematu bazy - jeden na serwer, bez danych klubu',
  'POST /admin/api/auth/login': 'logowanie panelu - poświadczenia dostawcy',
  'POST /admin/api/auth/logout': 'kasowanie ciasteczka, bez danych',
  'GET /admin': 'przekierowanie na statyczny build panelu',
  'GET /admin/*': 'statyczny build panelu - pliki, bez danych',
  'GET /*': 'strona publiczna - pliki, bez danych',
};

describe('izolacja klubów - każda trasa z rejestru Fastify', () => {
  it('KAŻDA zarejestrowana trasa ma przypadek izolacji albo imienny wyjątek', async () => {
    const { app } = await testHarness();
    const routes = [...new Set(app.routeCatalog.map((r) => `${r.method} ${r.url}`))]
      // `HEAD` dokłada Fastify do każdego `GET` - to ta sama trasa i ten sam handler.
      .filter((key) => !key.startsWith('HEAD '))
      .sort();

    // Kontrola samego testu: rejestr faktycznie coś widzi (tras klubu i tras statycznych).
    expect(routes.length).toBeGreaterThan(40);
    expect(routes).toContain('GET /reference');
    expect(routes).toContain('GET /admin/*');

    const uncovered = routes.filter((key) => !(key in CASES) && !(key in NOT_CLUB_ROUTES));
    expect(uncovered, 'trasy bez przypadku izolacji').toEqual([]);

    // I w drugą stronę: przypadek bez trasy to martwy kod, który obiecuje ochronę
    // nieistniejącego adresu (trasa przemianowana albo skasowana).
    const stale = [...Object.keys(CASES), ...Object.keys(NOT_CLUB_ROUTES)].filter(
      (key) => !routes.includes(key),
    );
    expect(stale, 'przypadki bez trasy').toEqual([]);
  });

  it('dane klubu B nie wyciekają do klubu A przez żadną trasę', async () => {
    const world = await twoClubs();

    // Kontrola samego świata: znaczniki B NAPRAWDĘ są w bazie - inaczej „czysta"
    // odpowiedź niczego by nie dowodziła.
    const probe = async (sql: string): Promise<number> =>
      Number((await world.db.query<{ n: string }>(sql)).rows[0]!.n);
    expect(await probe(`SELECT COUNT(*) AS n FROM sessions WHERE org_id = '${ORG_B}'`)).toBe(2);
    expect(
      await probe(`SELECT COUNT(*) AS n FROM flags WHERE org_id = '${ORG_B}' AND details->>'marker' = 'beta-flag'`),
    ).toBe(1);
    expect(await probe(`SELECT COUNT(*) AS n FROM bug_reports WHERE org_id = '${ORG_B}'`)).toBe(1);
    // Dwie karty, bo dwie doby maszyny SP-BBB (karta = doba SAMOLOTU).
    expect(await probe(`SELECT COUNT(*) AS n FROM exported_sheets WHERE org_id = '${ORG_B}'`)).toBe(2);
    expect(await probe(`SELECT COUNT(*) AS n FROM admin_audit WHERE org_id = '${ORG_B}'`)).toBe(1);

    // Kontrola pozytywna: klub B widzi SWOJE dane (skopowanie nie znaczy „nikt nic nie widzi").
    const ownB = await world.app.inject({ method: 'GET', url: '/admin/api/sessions', headers: bearer(world.b) });
    expect(ownB.json().total).toBe(2);
    expect(ownB.body).toContain('sess-b');

    const failures: string[] = [];
    for (const [route, probeRoute] of Object.entries(CASES)) {
      try {
        await probeRoute(world);
      } catch (err) {
        failures.push(`${route}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    expect(failures, 'trasy z wyciekiem między klubami').toEqual([]);
  });

  it('adres karty arkusza w dzienniku eksportu niesie slug i sekret klubu KARTY', async () => {
    const { app, db, b } = await twoClubs();
    const { rows } = await db.query<{ sheet_url: string }>(
      `SELECT sheet_url FROM export_log WHERE session_uuid = 'sess-b'`,
    );
    expect(rows[0]!.sheet_url).toBe(
      `${TEST_BASE_URL}/sheets/aeroklub-beta/2026-06-22_SP-BBB?k=${ORG_B_SHEETS_KEY}`,
    );
    // …i ten adres otwiera kartę BEZ logowania, a `sync-status` klubu B podaje ten sam.
    const sheet = await app.inject({ method: 'GET', url: rows[0]!.sheet_url.slice(TEST_BASE_URL.length) });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().tab).toBe('2026-06-22_SP-BBB');
    const status = await app.inject({ method: 'GET', url: '/sessions/sess-b/sync-status', headers: bearer(b) });
    expect(status.json().exportUrl).toBe(rows[0]!.sheet_url);
  });

  it('członkostwo WYŁĄCZONE zamyka trasy telefonu od razu, nie po wygaśnięciu tokenu', async () => {
    // Brama telefonu czyta członkostwo przy każdym żądaniu (issue #99, `authorizeMember`).
    const { app, db } = await twoClubs();
    const bpi = await tokenOf(app, 'BPI');
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(bpi) })).statusCode).toBe(200);

    await db.query(
      `UPDATE memberships SET status = 'disabled', credentials_valid_from = now() + interval '1 second'
        WHERE org_id = $1 AND pilot_id = 'BPI'`,
      [ORG_B],
    );
    expect((await app.inject({ method: 'GET', url: '/reference', headers: bearer(bpi) })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/events', headers: bearer(bpi), payload: { events: day('sess-late', 'SP-BBB', 'BPI', 'X') } }))
        .statusCode,
    ).toBe(401);
  });
});
