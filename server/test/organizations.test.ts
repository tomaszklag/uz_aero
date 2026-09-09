/**
 * UZ Aero (serwer) - MODEL KLUBÓW i członkostw (wielofirmowość, epik B, issue #98;
 * `docs/wielofirmowosc.md` §3–§6, §10).
 *
 * Trzy rzeczy, których ten plik pilnuje i których złamanie jest luką, a nie usterką:
 *
 *  1. **Backfill migracji 8 nie gubi ani wiersza i nie wymyśla klubu.** Baza z danymi
 *     1.x dostaje JEDEN klub o nazwie podanej runnerowi; każdy wiersz każdej tabeli
 *     dostaje jego `org_id`, każde konto staje się członkostwem z tym samym kodem
 *     i rolą, a bez nazwy klubu runner ODMAWIA startu.
 *  2. **Klub jest w tokenie, a token bez klubu nic nie otwiera.** Logowanie wybiera
 *     klub aktywny, refresh zostaje w tym samym klubie, osoba bez członkostwa nie ma
 *     tokenów pilota, a paczka zdarzeń do maszyny cudzego klubu jest odrzucana w całości.
 *  3. **To, co było jedyne na serwerze, jest odtąd jedyne W KLUBIE**: kod pilota,
 *     rejestracja, nazwa karty - ta sama wartość w dwóch klubach to dwa byty.
 *
 * Pełny test izolacji KAŻDEJ trasy (klub B nie widzi wiersza klubu A) jest treścią
 * epiku C - tu stoją własności MODELU, na których tamten test się oprze.
 */

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import type { Database, Queryable } from '../src/application/common/ports.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { MIGRATIONS } from '../src/infrastructure/pg/schema.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A, ORG_B, seedBetaFleet } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], code: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(code) },
  });
  return res;
}

async function tokenOf(app: Harness['app'], code: string): Promise<string> {
  const res = await login(app, code);
  expect(res.statusCode).toBe(200);
  return res.json().token as string;
}

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  sessionUuid: string,
  aircraftId: string,
  picId: string,
  type: string,
  time: number,
  payload: Record<string, unknown> = {},
) {
  seq += 1;
  return {
    uuid: `org-${seq}-${type}`,
    sessionUuid,
    aircraftId,
    picId,
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

/** Kanoniczny dzień jednej maszyny - te same liczby, co w `ingest.test.ts`. */
function day(sessionUuid: string, aircraftId: string, picId: string) {
  return [
    event(sessionUuid, aircraftId, picId, 'session_claim', at(8, 0), { mode: 'free' }),
    event(sessionUuid, aircraftId, picId, 'preflight_confirm', at(8, 0), {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: null,
      reading: { fuelL: 90, mh: 1234.5 },
      client: null,
      mhFormat: 'hhmm',
    }),
    event(sessionUuid, aircraftId, picId, 'engine_start', at(8, 12), {}),
    event(sessionUuid, aircraftId, picId, 'takeoff', at(8, 25), { method: 'auto' }),
    event(sessionUuid, aircraftId, picId, 'landing', at(9, 18), { method: 'auto' }),
    event(sessionUuid, aircraftId, picId, 'engine_stop', at(10, 34), {}),
    event(sessionUuid, aircraftId, picId, 'day_close', at(16, 45), {
      finalReading: { fuelL: 60, mh: 1241.15 },
    }),
  ];
}

const post = (app: Harness['app'], token: string, events: unknown[]) =>
  app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events },
  });

// ══ 1. MIGRACJA 8: BACKFILL JEDNEGO KLUBU Z DANYCH 1.x ═══════════════════════════════

function freshDb(): Database & { exec: (sql: string) => Promise<unknown> } {
  const pglite = new PGlite();
  return {
    query: (text, params) => pglite.query(text, params as never) as never,
    exec: (sql) => pglite.exec(sql),
    transaction: (fn) => pglite.transaction((tx) => fn(tx as unknown as Queryable)) as never,
  };
}

const count = async (db: Queryable, table: string, where = ''): Promise<number> => {
  const { rows } = await db.query<{ n: unknown }>(`SELECT count(*) AS n FROM ${table} ${where}`);
  return Number(rows[0]?.n);
};

/**
 * Baza w kształcie 1.x (schemat do migracji 7) z danymi JEDNEGO klubu: dwa konta (jedno
 * wyłączone), samolot, sesja ze zdarzeniem, karta arkusza, wpis audytu i refresh token.
 * Dokładnie to, co migracja 8 zastanie na produkcji.
 */
async function legacyClubDb() {
  const db = freshDb();
  await migrate(db, MIGRATIONS.slice(0, 7));
  await db.query(
    `INSERT INTO pilots (id, code, name, email, active, role, credentials_valid_from)
     VALUES ('admin', 'admin', 'Administrator', 'szef@klub.pl', TRUE, 'admin', NULL),
            ('PWI', 'PWI', 'Piotr W.', 'piotr@klub.pl', FALSE, 'pilot', '2026-09-01T10:00:00Z')`,
  );
  await db.query(
    `INSERT INTO aircraft (id, reg, type, capacity_l, mh_format) VALUES ('SP-AXA', 'SP-AXA', 'C182', 330, 'hhmm')`,
  );
  await db.query(
    `INSERT INTO events (uuid, session_uuid, aircraft_id, pic_id, type, device_time, payload, schema_version)
     VALUES ('e1', 's1', 'SP-AXA', 'admin', 'session_claim', 1, '{}', 1)`,
  );
  await db.query(`INSERT INTO sessions (session_uuid, aircraft_id, pic_id) VALUES ('s1', 'SP-AXA', 'admin')`);
  await db.query(
    `INSERT INTO flags (type, aircraft_id, session_uuids) VALUES ('mh_gap', 'SP-AXA', ARRAY['s1'])`,
  );
  await db.query(
    `INSERT INTO export_log (session_uuid, day, aircraft_id, sheet_url, revision, exported_at)
     VALUES ('s1', '2026-06-22', 'SP-AXA', 'http://x/sheets/2026-06-22_SP-AXA', 1, now())`,
  );
  await db.query(`INSERT INTO exported_sheets (tab, rows, updated_at) VALUES ('2026-06-22_SP-AXA', '[]', now())`);
  await db.query(
    `INSERT INTO admin_audit (actor_pilot_id, actor_role, action) VALUES ('admin', 'admin', 'pilot.create')`,
  );
  await db.query(
    `INSERT INTO aircraft_readings (aircraft_id, mh, fuel_l, note, by_pilot_id) VALUES ('SP-AXA', 1, 2, 'n', 'admin')`,
  );
  await db.query(
    `INSERT INTO aircraft_consumption (aircraft_id, window_days, model) VALUES ('SP-AXA', 90, '{}')`,
  );
  await db.query(
    `INSERT INTO bug_reports (uuid, pilot_id, created_at, description, screen, context)
     VALUES ('b1', 'PWI', now(), 'opis', 'KOKPIT', '{}')`,
  );
  await db.query(`INSERT INTO refresh_tokens (token_hash, pilot_id, expires_at) VALUES ('h1', 'admin', now())`);
  return db;
}

const CLUB_TABLES = [
  'aircraft',
  'events',
  'sessions',
  'flags',
  'export_log',
  'exported_sheets',
  'admin_audit',
  'aircraft_readings',
  'aircraft_consumption',
  'bug_reports',
  'refresh_tokens',
];

describe('migracja 8 - backfill jednego klubu z danych 1.x', () => {
  it('bez nazwy klubu ODMAWIA - baza z danymi zostaje na wersji 7, nietknięta', async () => {
    // Slug wchodzi do adresów kart arkusza i nie zmienia się już nigdy, więc runner nie
    // wymyśla „Klub 1". Odmowa jest w tej samej transakcji, co migracja: nic z niej nie
    // zostaje, a ponowny start z zmiennymi przechodzi normalnie.
    const db = await legacyClubDb();
    await expect(migrate(db)).rejects.toThrow(/SEED_ORG_NAME/);

    const { rows } = await db.query<{ version: number }>(
      'SELECT MAX(version) AS version FROM schema_migrations',
    );
    expect(Number(rows[0]?.version)).toBe(7);
    // Kolumny 1.x nadal stoją - migracja się wycofała w całości.
    expect(await count(db, 'pilots', "WHERE code = 'admin'")).toBe(1);
  });

  it('z nazwą klubu: JEDEN klub, org_id na każdym wierszu, liczby wierszy per tabela bez zmian', async () => {
    const db = await legacyClubDb();
    const before = Object.fromEntries(
      await Promise.all(CLUB_TABLES.map(async (t) => [t, await count(db, t)] as const)),
    );

    await migrate(db, MIGRATIONS, { seedOrg: { name: "Aeroklub O'Neill", slug: 'aeroklub-oneill' } });

    const orgs = await db.query<{ id: string; name: string; slug: string; active: boolean }>(
      'SELECT id, name, slug, active FROM organizations',
    );
    expect(orgs.rows).toHaveLength(1);
    // Apostrof w nazwie przeszedł przez `set_config` bez szwanku - ucieczka literału działa.
    expect(orgs.rows[0]).toMatchObject({ name: "Aeroklub O'Neill", slug: 'aeroklub-oneill', active: true });
    const club = orgs.rows[0]!.id;

    for (const table of CLUB_TABLES) {
      // Tyle samo wierszy, co przed migracją - i KAŻDY wskazuje klub domyślny.
      expect(await count(db, table), table).toBe(before[table]);
      expect(await count(db, table, `WHERE org_id = '${club}'`), `${table}.org_id`).toBe(before[table]);
    }
  });

  it('każde konto 1.x → członkostwo z tym samym kodem, rolą i znacznikiem unieważnienia', async () => {
    const db = await legacyClubDb();
    await migrate(db, MIGRATIONS, { seedOrg: { name: 'Klub', slug: 'klub' } });

    const { rows } = await db.query<{
      pilot_id: string;
      code: string;
      role: string;
      status: string;
      joined_via: string;
      credentials_valid_from: string | Date | null;
    }>('SELECT pilot_id, code, role, status, joined_via, credentials_valid_from FROM memberships ORDER BY pilot_id');
    expect(rows.map((r) => ({ ...r, credentials_valid_from: r.credentials_valid_from == null ? null : 'set' }))).toEqual([
      { pilot_id: 'PWI', code: 'PWI', role: 'pilot', status: 'disabled', joined_via: 'backfill', credentials_valid_from: 'set' },
      { pilot_id: 'admin', code: 'admin', role: 'admin', status: 'active', joined_via: 'backfill', credentials_valid_from: null },
    ]);

    // Wyłączone konto stało się wyłączonym CZŁONKOSTWEM, a osoba jest odtąd aktywna
    // platformowo: blokadę na osobie nakłada wyłącznie superadministrator, a ponowne
    // włączenie w klubie ma człowieka naprawdę wpuścić.
    const pilots = await db.query<{ id: string; active: boolean }>('SELECT id, active FROM pilots ORDER BY id');
    expect(pilots.rows).toEqual([
      { id: 'PWI', active: true },
      { id: 'admin', active: true },
    ]);
  });

  it('po backfillu `pilots.code` i `pilots.role` nie istnieją, a globalny unikat rejestracji zniknął', async () => {
    const db = await legacyClubDb();
    await migrate(db, MIGRATIONS, { seedOrg: { name: 'Klub', slug: 'klub' } });

    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pilots' AND column_name IN ('code', 'role')`,
    );
    expect(rows).toEqual([]);

    // Ta sama rejestracja w DRUGIM klubie jest dopuszczalna (sprzedana, przerejestrowana)…
    await db.query(`INSERT INTO organizations (id, name, slug) VALUES ('org-2', 'Drugi', 'drugi')`);
    await expect(
      db.query(
        `INSERT INTO aircraft (id, org_id, reg, type, capacity_l, mh_format)
         VALUES ('SP-AXA-2', 'org-2', 'SP-AXA', 'C182', 330, 'hhmm')`,
      ),
    ).resolves.toBeDefined();
    // …a w TYM SAMYM klubie - nie.
    const club = (await db.query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['klub'])).rows[0]!.id;
    await expect(
      db.query(
        `INSERT INTO aircraft (id, org_id, reg, type, capacity_l, mh_format)
         VALUES ('SP-AXA-3', $1, 'SP-AXA', 'C182', 330, 'hhmm')`,
        [club],
      ),
    ).rejects.toThrow();
  });

  it('świeża baza przechodzi migrację 8 BEZ zmiennych klubu - nie ma czego przepisywać', async () => {
    const db = freshDb();
    await expect(migrate(db)).resolves.toBeUndefined();
    expect(await count(db, 'organizations')).toBe(0);
  });
});

// ══ 2. KLUB W TOKENIE ══════════════════════════════════════════════════════════════

describe('logowanie: klub aktywny w tokenie i w odpowiedzi', () => {
  it('osoba z JEDNYM członkostwem dostaje token tego klubu, `org` i komplet członkostw', async () => {
    const { app, tokens } = await testHarness();
    const res = await login(app, 'TMK');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.org).toEqual({ id: ORG_A, slug: 'aeroklub-alfa', name: 'Aeroklub Alfa' });
    expect(body.memberships).toEqual([
      { org: { id: ORG_A, slug: 'aeroklub-alfa', name: 'Aeroklub Alfa' }, code: 'TMK', role: 'admin' },
    ]);
    expect(tokens.verify(body.token)).toMatchObject({ pilotId: 'TMK', orgId: ORG_A, code: 'TMK', role: 'admin' });
  });

  it('osoba w DWU klubach: klub aktywny = pierwszy alfabetycznie, kod z TEGO klubu, dwa członkostwa', async () => {
    // PWI jest `PWI` w Alfie i `PWB` w Becie. Bez historii refreshów wybór jest
    // deterministyczny (§5) - i ten sam, do którego kierowały PWI testy sprzed
    // wielofirmowości.
    const { app, tokens } = await testHarness();
    const body = (await login(app, 'PWI')).json();

    expect(body.org.id).toBe(ORG_A);
    expect(body.pilot.code).toBe('PWI');
    expect(body.memberships.map((m: { org: { id: string }; code: string }) => [m.org.id, m.code])).toEqual([
      [ORG_A, 'PWI'],
      [ORG_B, 'PWB'],
    ]);
    expect(tokens.verify(body.token)?.orgId).toBe(ORG_A);
  });

  it('klub OSTATNIO UŻYWANY wygrywa z alfabetem - z najświeższego refresha (§5)', async () => {
    // Refresh dla klubu B wydany później niż para z logowania: kolejne logowanie PWI
    // ma trafić do B, bo tam człowiek ostatnio pracował.
    const { app, db, clock, tokens } = await testHarness();
    await login(app, 'PWI');
    clock.advance(60_000);
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ('recent-b', 'PWI', $1, $2, $3)`,
      [ORG_B, new Date(clock.now().getTime() + 86_400_000), clock.now()],
    );

    const body = (await login(app, 'PWI')).json();
    expect(body.org.id).toBe(ORG_B);
    expect(body.pilot.code).toBe('PWB');
    expect(tokens.verify(body.token)).toMatchObject({ orgId: ORG_B, code: 'PWB' });
  });

  it('refresh wydaje parę DLA TEGO SAMEGO klubu - przełączenie klubu to osobna trasa', async () => {
    const { app, db, tokens } = await testHarness();
    const first = (await login(app, 'PWI')).json();
    // Członkostwo w B jest świeższe w refreshach? Nie - to nie ma znaczenia: rotacja
    // zostaje w klubie, dla którego wydano ZUŻYWANY refresh.
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ('recent-b', 'PWI', $1, now() + interval '1 day', now() + interval '1 hour')`,
      [ORG_B],
    );

    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().org.id).toBe(ORG_A);
    expect(tokens.verify(rotated.json().token)?.orgId).toBe(ORG_A);
  });

  it('osoba BEZ aktywnego członkostwa nie ma tokenów pilota - `403 no_membership`', async () => {
    // Bramką jest brak członkostwa (§4), piętro nad brakiem konta: osoba istnieje,
    // tożsamość Google jest podpięta, a token do żadnego klubu nie powstaje.
    const { app, db } = await testHarness();
    await db.query("UPDATE memberships SET status = 'disabled' WHERE pilot_id = 'JSE'");

    const res = await login(app, 'JSE');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'no_membership' });
    expect(res.json().token).toBeUndefined();
  });

  it('członkostwo wyłączone w JEDNYM klubie nie zamyka drugiego', async () => {
    const { app, db, tokens } = await testHarness();
    await db.query("UPDATE memberships SET status = 'disabled' WHERE pilot_id = 'PWI' AND org_id = $1", [ORG_A]);

    const body = (await login(app, 'PWI')).json();
    expect(body.org.id).toBe(ORG_B);
    expect(tokens.verify(body.token)).toMatchObject({ orgId: ORG_B, code: 'PWB' });
    // A lista członkostw pokazuje wyłącznie te, które DAJĄ dostęp.
    expect(body.memberships).toHaveLength(1);
  });

  it('klub WYŁĄCZONY nie wydaje tokenów - jego członkowie dostają `no_membership`', async () => {
    const { app, db } = await testHarness();
    await db.query('UPDATE organizations SET active = FALSE WHERE id = $1', [ORG_B]);

    expect((await login(app, 'BAD')).statusCode).toBe(403);
    // PWI ma drugi klub, więc loguje się do Alfy jak zwykle.
    expect((await login(app, 'PWI')).json().org.id).toBe(ORG_A);
  });
});

describe('logowanie do panelu: sesja klubu albo sesja platformowa', () => {
  const panelLogin = (app: Harness['app'], idToken: string) =>
    app.inject({
      method: 'POST',
      url: '/admin/api/auth/login',
      headers: ADMIN_CSRF_HEADERS,
      payload: { idToken },
    });

  it('administrator klubu dostaje sesję Z KLUBEM - `GET /me` odpowiada tym samym kształtem', async () => {
    const { app } = await testHarness();
    const res = await panelLogin(app, googleTokenFor('BAD'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      pilot: { id: 'BAD', code: 'BAD', role: 'admin' },
      org: { id: ORG_B, slug: 'aeroklub-beta', name: 'Aeroklub Beta' },
    });

    const cookie = res.cookies.find((c) => c.name === 'uzaero_admin')!;
    const me = await app.inject({
      method: 'GET',
      url: '/admin/api/me',
      headers: { cookie: `uzaero_admin=${cookie.value}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().org).toEqual({ id: ORG_B, slug: 'aeroklub-beta', name: 'Aeroklub Beta' });
    expect(me.json().pilot.code).toBe('BAD');
  });

  it('pilot BEZ roli panelu w żadnym klubie → 403 `no_panel_access`', async () => {
    const { app } = await testHarness();
    const res = await panelLogin(app, googleTokenFor('PWI'));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'no_panel_access' });
  });

  it('SUPERADMINISTRATOR bez klubu dostaje sesję PLATFORMOWĄ: `org: null`, sama zdolność `platform.manage`', async () => {
    const { app, db, identityProvider } = await testHarness();
    await db.query(
      `INSERT INTO pilots (id, name, email, active, platform_role)
       VALUES ('admin', 'Operator', 'operator@ninerdeck.app', TRUE, 'superadmin')`,
    );
    identityProvider.register('google:operator', {
      provider: 'google',
      subject: 'sub-operator',
      email: 'operator@ninerdeck.app',
      emailVerified: true,
      name: 'Operator',
    });

    const res = await panelLogin(app, 'google:operator');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      pilot: { id: 'admin', code: null, name: 'Operator', role: 'superadmin' },
      org: null,
      capabilities: ['platform.manage'],
    });

    // Sesja platformowa NIE otwiera tras klubu - `GET /me` jest trasą klubu (401,
    // „zaloguj się"), a moduł Organizacje na tej sesji dochodzi w epiku E.
    const cookie = res.cookies.find((c) => c.name === 'uzaero_admin')!;
    const me = await app.inject({
      method: 'GET',
      url: '/admin/api/me',
      headers: { cookie: `uzaero_admin=${cookie.value}` },
    });
    expect(me.statusCode).toBe(401);
  });
});

// ══ 3. JEDYNE W KLUBIE, NIE NA SERWERZE ═══════════════════════════════════════════

describe('to samo w dwóch klubach to dwa byty', () => {
  it('ta sama REJESTRACJA w dwóch klubach: dwa samoloty, dwie karty, każda czytelna wyłącznie w swoim klubie', async () => {
    const { app, db } = await testHarness();
    // Klub B kupuje „drugą" SP-AXA - jak w §3.6: historia zostaje u starego właściciela.
    // Identyfikator maszyny jest globalny (klucz zdarzeń), więc nazwa karty - budowana
    // z identyfikatora - różni się; klucz `(org_id, tab)` chroni przypadek, w którym
    // ta sama nazwa padnie w dwóch klubach (schemat, `exported_sheets_pkey`).
    await db.query(
      `INSERT INTO aircraft (id, org_id, reg, type, capacity_l, mh_format)
       VALUES ('SP-AXA-B', $1, 'SP-AXA', 'Cessna 182', 330, 'hhmm')`,
      [ORG_B],
    );
    const a = await tokenOf(app, 'TMK');
    const b = await tokenOf(app, 'BAD');

    expect((await post(app, a, day('sess-a', 'SP-AXA', 'TMK'))).statusCode).toBe(200);
    expect((await post(app, b, day('sess-b', 'SP-AXA-B', 'BAD'))).statusCode).toBe(200);

    // Po jednej karcie na klub, każda w kluczu SWOJEGO klubu.
    const sheets = await db.query<{ org_id: string; tab: string }>(
      'SELECT org_id, tab FROM exported_sheets ORDER BY org_id',
    );
    expect(sheets.rows).toEqual([
      { org_id: ORG_A, tab: '2026-06-22_SP-AXA' },
      { org_id: ORG_B, tab: '2026-06-22_SP-AXA-B' },
    ]);

    const read = (token: string, tab: string) =>
      app.inject({ method: 'GET', url: `/sheets/${tab}`, headers: { authorization: `Bearer ${token}` } });

    // Własna karta - z własnym pilotem…
    const seenByA = await read(a, '2026-06-22_SP-AXA');
    expect(seenByA.statusCode).toBe(200);
    expect(JSON.stringify(seenByA.json().rows)).toContain('TMK');
    const seenByB = await read(b, '2026-06-22_SP-AXA-B');
    expect(seenByB.statusCode).toBe(200);
    expect(JSON.stringify(seenByB.json().rows)).toContain('BAD');

    // …a karta cudzego klubu jest dla czytającego NIEISTNIEJĄCA (§3.7): 404, nie 403.
    expect((await read(a, '2026-06-22_SP-AXA-B')).statusCode).toBe(404);
    expect((await read(b, '2026-06-22_SP-AXA')).statusCode).toBe(404);
  });

  it('ten sam KOD pilota w dwóch klubach jest dopuszczalny, w jednym - nie', async () => {
    const { db } = await testHarness();
    await db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('X', 'Ktoś', 'x@x.pl', TRUE)`);
    // TMK jest zajęty w Alfie…
    await expect(
      db.query(
        `INSERT INTO memberships (org_id, pilot_id, code, role, status, joined_via)
         VALUES ($1, 'X', 'TMK', 'pilot', 'active', 'panel')`,
        [ORG_A],
      ),
    ).rejects.toThrow();
    // …a w Becie wolny.
    await expect(
      db.query(
        `INSERT INTO memberships (org_id, pilot_id, code, role, status, joined_via)
         VALUES ($1, 'X', 'TMK', 'pilot', 'active', 'panel')`,
        [ORG_B],
      ),
    ).resolves.toBeDefined();
  });

  it('`/reference` oddaje flotę i CZŁONKÓW klubu z tokenu - z kodem z TEGO klubu', async () => {
    const { app, db } = await testHarness();
    await seedBetaFleet(db);
    const a = (await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${await tokenOf(app, 'TMK')}` },
    })).json();
    const b = (await app.inject({
      method: 'GET',
      url: '/reference',
      headers: { authorization: `Bearer ${await tokenOf(app, 'BAD')}` },
    })).json();

    expect(a.aircraft.map((x: { reg: string }) => x.reg).sort()).toEqual(['SP-ANK', 'SP-AXA', 'SP-FGK', 'SP-KWA']);
    expect(b.aircraft.map((x: { reg: string }) => x.reg)).toEqual(['SP-BBB']);

    expect(a.pilots.map((p: { code: string }) => p.code).sort()).toEqual(['AKO', 'JSE', 'KRZ', 'PWI', 'TMK']);
    // PWI w Becie nazywa się PWB - ta sama osoba, kod z członkostwa w klubie z tokenu.
    expect(b.pilots.map((p: { id: string; code: string }) => [p.id, p.code])).toEqual([
      ['BAD', 'BAD'],
      ['BPI', 'BPI'],
      ['PWI', 'PWB'],
    ]);
  });

  it('lista PILOCI w panelu to członkowie klubu sesji; PWI stoi na obu listach pod dwoma kodami', async () => {
    const { app } = await testHarness();
    const listFor = async (who: string) =>
      (
        await app.inject({
          method: 'GET',
          url: '/admin/api/pilots',
          headers: { authorization: `Bearer ${await tokenOf(app, who)}` },
        })
      ).json();

    const alfa = await listFor('TMK');
    const beta = await listFor('BAD');
    expect(alfa.items.map((i: { code: string }) => i.code).sort()).toEqual(['AKO', 'JSE', 'KRZ', 'PWI', 'TMK']);
    expect(beta.items.map((i: { id: string; code: string; orgId: string }) => [i.id, i.code, i.orgId])).toEqual([
      ['BAD', 'BAD', ORG_B],
      ['BPI', 'BPI', ORG_B],
      ['PWI', 'PWB', ORG_B],
    ]);
    expect(beta.counts).toMatchObject({ total: 3, admin: 1, pilot: 2 });
  });
});

// ══ 4. INGEST: MASZYNA MUSI NALEŻEĆ DO KLUBU Z TOKENU ═══════════════════════════════

describe('ingest odrzuca zapis do cudzego klubu', () => {
  it('paczka z tokenu klubu A do maszyny klubu B → 403 `aircraft_not_in_org`, zero wierszy', async () => {
    const { app, db } = await testHarness();
    await seedBetaFleet(db);
    const a = await tokenOf(app, 'TMK');

    const res = await post(app, a, day('sess-x', 'SP-BBB', 'TMK'));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'aircraft_not_in_org' });
    expect(await count(db, 'events')).toBe(0);
  });

  it('paczka do WŁASNEJ maszyny stempluje klub tokenu na zdarzeniach, projekcji i flagach', async () => {
    const { app, db } = await testHarness();
    await seedBetaFleet(db);
    const b = await tokenOf(app, 'BAD');
    expect((await post(app, b, day('sess-b', 'SP-BBB', 'BAD'))).statusCode).toBe(200);

    expect(await count(db, 'events', `WHERE org_id = '${ORG_B}'`)).toBe(7);
    expect(await count(db, 'sessions', `WHERE org_id = '${ORG_B}'`)).toBe(1);
    expect(await count(db, 'export_log', `WHERE org_id = '${ORG_B}'`)).toBe(1);
    expect(await count(db, 'events', `WHERE org_id = '${ORG_A}'`)).toBe(0);
  });

  it('PWI z tokenem Alfy nie dopisze zdarzeń do swojej operacji w Becie', async () => {
    // Ta sama osoba, dwa kluby: operacja należy do klubu, w którym ją zaczęto (§7.3).
    // Dosyłka spod tokenu drugiego klubu jest odrzucana - inaczej przełączenie klubu
    // przepisywałoby zdarzenia jednej operacji do drugiego dziennika.
    const { app, db, clock } = await testHarness();
    await seedBetaFleet(db);
    // Token PWI dla Bety: najświeższy refresh w B przestawia klub aktywny.
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ('recent-b', 'PWI', $1, $2, $3)`,
      [ORG_B, new Date(clock.now().getTime() + 86_400_000), clock.now()],
    );
    const inBeta = (await login(app, 'PWI')).json();
    expect(inBeta.org.id).toBe(ORG_B);
    const [claim, ...rest] = day('sess-pwi', 'SP-BBB', 'PWI');
    expect((await post(app, inBeta.token, [claim!])).statusCode).toBe(200);

    // Teraz PWI „przełącza się" do Alfy (świeższy refresh w A) i próbuje dosłać resztę.
    clock.advance(60_000);
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ('recent-a', 'PWI', $1, $2, $3)`,
      [ORG_A, new Date(clock.now().getTime() + 86_400_000), clock.now()],
    );
    const inAlfa = (await login(app, 'PWI')).json();
    expect(inAlfa.org.id).toBe(ORG_A);

    const res = await post(app, inAlfa.token, rest);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'aircraft_not_in_org' });
    expect(await count(db, 'events')).toBe(1);
  });
});
