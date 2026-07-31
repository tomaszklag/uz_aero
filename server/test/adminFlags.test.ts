/**
 * UZ Aero (serwer) — cykl życia flagi i re-eksport (`POST /admin/api/flags/:id/resolve`).
 *
 * Ten sam wzorzec co reszta: PGlite w procesie, prawdziwe klasy, `app.inject`, zero
 * atrap. Flagi powstają tak, jak powstają w produkcji — z PRAWDZIWEGO `POST /events`,
 * bo test, który wstawia flagę `INSERT`-em, przybija własne wyobrażenie o niej,
 * a nie zachowanie systemu.
 *
 * Najważniejszy przypadek to ten drugi: rozwiązanie flagi ODBLOKOWUJE kartę dnia.
 * To jest test, dla którego panel powstaje — do przekroju 1 otwarta `session_overlap`
 * blokowała eksport bezterminowo, a jedynym odblokowaniem był ręczny `UPDATE`.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (h: number, m: number, dayOffset = 0): number =>
  DAY + dayOffset * DAY_MS + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  seq += 1;
  return {
    uuid: `f-${seq}-${type}`,
    aircraftId: 'SP-AXA',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    ...base,
  };
}

interface DayOptions {
  sessionUuid: string;
  picId: string;
  reading: { fuelL: number; mh: number };
  dayOffset?: number;
}

/** Dzień lotny BEZ zamknięcia — sesja zostaje otwarta (materiał na nakładkę). */
function openDay(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  const base = { sessionUuid: o.sessionUuid, picId: o.picId };
  return [
    event('session_claim', at(8, 0, d), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0, d),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        dutyStart: at(8, 0, d),
        reading: o.reading,
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', at(8, 12, d), {}, base),
    event('takeoff', at(8, 25, d), { method: 'auto' }, base),
    event('landing', at(9, 18, d), { method: 'auto' }, base),
    event('engine_stop', at(10, 34, d), {}, base),
  ];
}

function closeDay(o: { sessionUuid: string; picId: string; mh: number; dayOffset?: number }) {
  const d = o.dayOffset ?? 0;
  return [
    event(
      'day_close',
      at(16, 45, d),
      { finalReading: { fuelL: 88, mh: o.mh }, dutyEnd: at(16, 45, d) },
      { sessionUuid: o.sessionUuid, picId: o.picId },
    ),
  ];
}

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

function post(app: Harness['app'], token: string, events: unknown[]) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events },
  });
}

function resolve(
  app: Harness['app'],
  id: number | string,
  options: { token?: string; note?: unknown } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/flags/${id}/resolve`,
    headers: options.token == null ? {} : { authorization: `Bearer ${options.token}` },
    payload: options.note === undefined ? {} : { note: options.note },
  });
}

async function flagRows(db: Harness['db']) {
  const { rows } = await db.query<{
    id: number;
    type: string;
    status: string;
    resolved_by: string | null;
    resolution_note: string | null;
    resolved_at: Date | string | null;
  }>(
    `SELECT id, type, status, resolved_by, resolution_note, resolved_at
     FROM flags ORDER BY id`,
  );
  return rows;
}

async function exportRevisions(db: Harness['db']) {
  const { rows } = await db.query<{ session_uuid: string; revision: number }>(
    'SELECT session_uuid, revision FROM export_log ORDER BY id',
  );
  return rows;
}

/**
 * Nakładka sesji jak w `export.test.ts`: TMK nie zamyka dnia, KRZ przejmuje samolot
 * offline. Obie sesje bez `day_close` → `session_overlap`. Potem KRZ zamyka SWÓJ
 * dzień — sesja jest domknięta, ale sporna, więc karta NIE powstaje.
 */
async function overlapping() {
  const harness = await testHarness();
  const { app, db } = harness;
  const tmk = await login(app, 'TMK');
  const krz = await login(app, 'KRZ');

  await post(app, tmk, openDay({ sessionUuid: 'sess-1', picId: 'TMK', reading: { fuelL: 150, mh: 1234.5 } }));
  await post(app, krz, openDay({ sessionUuid: 'sess-2', picId: 'KRZ', reading: { fuelL: 112, mh: 1236.87 } }));
  await post(app, krz, closeDay({ sessionUuid: 'sess-2', picId: 'KRZ', mh: 1237.4 }));

  const flags = await flagRows(db);
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({ type: 'session_overlap', status: 'open' });
  // Bramka DZIAŁA przed rozwiązaniem — bez tego test niżej nie dowodziłby niczego.
  expect(await exportRevisions(db)).toEqual([]);

  return { ...harness, flagId: flags[0]!.id };
}

describe('rozwiązanie flagi (A03a)', () => {
  it('zmienia status, zapisuje komentarz i ODBLOKOWUJE kartę dnia', async () => {
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId, {
      token: admin,
      note: 'Rozmowa z TMK: dzień zamknięty telefonicznie, nakładka pozorna.',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ flagId, type: 'session_overlap' });

    // Flaga zamknięta z tożsamością rozstrzygającego i jego komentarzem.
    expect(await flagRows(db)).toMatchObject([
      {
        status: 'resolved',
        resolved_by: 'TMK',
        resolution_note: 'Rozmowa z TMK: dzień zamknięty telefonicznie, nakładka pozorna.',
      },
    ]);
    expect((await flagRows(db))[0]!.resolved_at).not.toBeNull();

    // Re-eksport obu sesji flagi: zamknięta dostaje kartę, otwarta wraca z powodem
    // odmowy — nie milczeniem. Kolejność jak `session_uuids` w bazie (posortowane).
    expect(res.json().exports).toEqual([
      { sessionUuid: 'sess-1', outcome: { exported: false, reason: 'session_open' } },
      {
        sessionUuid: 'sess-2',
        outcome: {
          exported: true,
          tab: '2026-06-22_SP-AXA',
          revision: 1,
          url: 'http://uzaero.test/sheets/2026-06-22_SP-AXA',
        },
      },
    ]);

    // …i karta FAKTYCZNIE powstała: dziennik, treść w bazie i link do odczytu.
    expect(await exportRevisions(db)).toEqual([{ session_uuid: 'sess-2', revision: 1 }]);
    const sheet = await app.inject({
      method: 'GET',
      url: '/sheets/2026-06-22_SP-AXA',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().rows).toContainEqual(['Samolot', 'SP-AXA']);
  });

  it('szef wyszkolenia MOŻE rozstrzygnąć flagę — to jego główne narzędzie', async () => {
    const { app, db, flagId } = await overlapping();
    const trainingLead = await login(app, 'AKO');

    const res = await resolve(app, flagId, { token: trainingLead, note: 'Wyjaśnione z załogą.' });

    expect(res.statusCode).toBe(200);
    expect((await flagRows(db))[0]).toMatchObject({ status: 'resolved', resolved_by: 'AKO' });
  });

  it('pilot NIE MOŻE — 403 z podaną wymaganą zdolnością, flaga zostaje otwarta', async () => {
    const { app, db, flagId } = await overlapping();
    const pilot = await login(app, 'PWI');

    const res = await resolve(app, flagId, { token: pilot, note: 'Wygląda w porządku.' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'flags.resolve' });
    expect((await flagRows(db))[0]).toMatchObject({ status: 'open' });
  });

  it('bez tokenu → 401, nie 403 — to dwie różne wiadomości', async () => {
    const { app, db, flagId } = await overlapping();

    const res = await resolve(app, flagId, { note: 'Bez logowania.' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    expect((await flagRows(db))[0]).toMatchObject({ status: 'open' });
  });

  it.each([
    ['brak pola', undefined],
    ['pusty napis', ''],
    ['same spacje', '   '],
  ])('komentarz wymagany — %s daje 400 i nie rusza flagi', async (_case, note) => {
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId, { token: admin, note });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request' });
    expect((await flagRows(db))[0]).toMatchObject({ status: 'open' });
  });

  it('nieistniejąca flaga → 404', async () => {
    const { app, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId + 999, { token: admin, note: 'Nie ma czego zamykać.' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('ponowne rozwiązanie → 409 z AKTUALNYM stanem flagi, komentarz pierwszego zostaje', async () => {
    // Zachowanie wybrane świadomie: nie 200 („i tak jest rozwiązana") i nie 404.
    // Drugi klikający ma zobaczyć, że sprawę zamknął ktoś inny i CZYIM komentarzem —
    // inaczej dopisałby własne uzasadnienie do decyzji, której nie podjął. Warunek
    // `status='open'` siedzi w SQL-u, więc to samo chroni przed wyścigiem dwóch osób.
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');
    const trainingLead = await login(app, 'AKO');

    await resolve(app, flagId, { token: admin, note: 'Pierwsze rozstrzygnięcie.' });
    const second = await resolve(app, flagId, {
      token: trainingLead,
      note: 'Drugie rozstrzygnięcie.',
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: 'already_resolved',
      flag: { id: flagId, status: 'resolved', resolvedBy: 'TMK', resolutionNote: 'Pierwsze rozstrzygnięcie.' },
    });
    expect((await flagRows(db))[0]).toMatchObject({
      resolved_by: 'TMK',
      resolution_note: 'Pierwsze rozstrzygnięcie.',
    });

    // Karta powstała RAZ — przegrany wyścig nie podbija rewizji.
    expect(await exportRevisions(db)).toEqual([{ session_uuid: 'sess-2', revision: 1 }]);
  });

  it('flaga, która eksportu nie blokowała (mh_gap) → `exports: []`, żadnej nowej rewizji', async () => {
    // Rozwiązanie `mh_gap` niczego nie odblokowuje, bo `DayExporter` nie ma na niego
    // bramki. Odpowiedź z fałszywą rewizją uczyłaby nieufności do narzędzia.
    const { app, db } = await testHarness();
    const tmk = await login(app, 'TMK');

    await post(app, tmk, openDay({ sessionUuid: 'sess-1', picId: 'TMK', reading: { fuelL: 150, mh: 1234.5 } }));
    await post(app, tmk, closeDay({ sessionUuid: 'sess-1', picId: 'TMK', mh: 1241.15 }));
    // Następny dzień zaczyna się od licznika wyższego o ~9 h — ktoś latał bez aplikacji.
    await post(app, tmk, openDay({ sessionUuid: 'sess-3', picId: 'TMK', reading: { fuelL: 200, mh: 1250 }, dayOffset: 1 }));
    await post(app, tmk, closeDay({ sessionUuid: 'sess-3', picId: 'TMK', mh: 1252, dayOffset: 1 }));

    const flags = await flagRows(db);
    expect(flags).toMatchObject([{ type: 'mh_gap', status: 'open' }]);
    const before = await exportRevisions(db);
    expect(before).toHaveLength(2); // obie sesje zamknięte → obie już wyeksportowane

    const res = await resolve(app, flags[0]!.id, {
      token: tmk,
      note: 'Lot techniczny bez aplikacji, potwierdzony w książce samolotu.',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ type: 'mh_gap', exports: [] });
    expect(await exportRevisions(db)).toEqual(before);
  });
});
