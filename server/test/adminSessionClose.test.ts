/**
 * UZ Aero (serwer) - ZAKOŃCZENIE ADMINISTRACYJNE operacji osieroconej
 * (`POST /admin/api/sessions/:uuid/close`, issue #81).
 *
 * Ten sam wzorzec, co `adminSessionVoid.test.ts`: PGlite, prawdziwe klasy, `app.inject`.
 * Operacja powstaje z PRAWDZIWEGO `POST /events` telefonu PIC-a, a potem TELEFON MILKNIE:
 * silnik pracuje w rejestrze serwera od godzin, samolot jest zajęty, nikt go nie zdał.
 *
 * Pod obserwacją:
 *  1. zdarzenie `session_close` ląduje w rejestrze PIC-em sesji, z autorem w audycie;
 *     projekcja dostaje `closed` BEZ odczytów końcowych, maszyna przestaje być zajęta;
 *  2. „od razu unieważnij" dopisuje DWA fakty i kończy statusem `voided`;
 *  3. ingest WSTRZYMUJE zdanie dosłane z telefonu po decyzji panelu - i mówi to
 *     telefonowi (`withheld`), zamiast po cichu przyjąć;
 *  4. decyzja wraca na telefon przez `GET /me/events`, a telefon nie ma jak przysłać
 *     `session_close` sam (`403 admin_only_event`);
 *  5. drugie zakończenie → 422 z nazwanym powodem; sesja nieznana → 404.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 8, 3);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

const SESSION = 'orphan-1';

type Harness = Awaited<ReturnType<typeof testHarness>>;

function login(app: Harness['app'], who: string): Promise<string> {
  return app
    .inject({ method: 'POST', url: '/auth/login', payload: { login: who, password: TEST_PASSWORD } })
    .then((res) => res.json().token as string);
}

function event(uuid: string, type: string, time: number, payload: Record<string, unknown>) {
  return {
    uuid,
    sessionUuid: SESSION,
    aircraftId: 'SP-AXA',
    picId: 'KRZ',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

/** Co serwer zdążył dostać, zanim telefon KRZ zamilkł: przejęcie, preflight, silnik, start. */
const ORPHANED = [
  event('orphan-claim', 'session_claim', at(8, 0), { mode: 'free' }),
  event('orphan-preflight', 'preflight_confirm', at(8, 2), {
    operation: 'skoki',
    departureIcao: 'EPKK',
    arrivalIcao: null,
    reading: { fuelL: 150, mh: 1234.5 },
    client: null,
    mhFormat: 'hhmm',
  }),
  event('orphan-start', 'engine_start', at(8, 12), {}),
  event('orphan-takeoff', 'takeoff', at(8, 25), { method: 'auto' }),
];

/** To, co telefon zapisał offline i dośle DOPIERO po decyzji panelu. */
const LATE = [
  event('orphan-landing', 'landing', at(9, 18), { method: 'auto' }),
  event('orphan-stop', 'engine_stop', at(9, 30), {}),
  event('orphan-close', 'day_close', at(9, 40), { finalReading: { fuelL: 88, mh: 1236.9 } }),
];

async function push(app: Harness['app'], who: string, events: unknown[]) {
  const token = await login(app, who);
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events, sourceDevice: `Pixel 7a · ${who}` },
  });
}

function closeSession(app: Harness['app'], token: string, uuid: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/sessions/${uuid}/close`,
    headers: { ...ADMIN_CSRF_HEADERS, authorization: `Bearer ${token}` },
    payload: body,
  });
}

async function sessionRow(db: Harness['db'], uuid: string) {
  const { rows } = await db.query<{ status: string; mh_end: number | null; fuel_end_l: number | null }>(
    'SELECT status, mh_end, fuel_end_l FROM sessions WHERE session_uuid = $1',
    [uuid],
  );
  return rows[0] ?? null;
}

async function eventTypes(db: Harness['db'], uuid: string): Promise<string[]> {
  const { rows } = await db.query<{ type: string }>(
    'SELECT type FROM events WHERE session_uuid = $1 ORDER BY received_at, uuid',
    [uuid],
  );
  return rows.map((r) => r.type);
}

async function orphanedDay() {
  const harness = await testHarness();
  const pushed = await push(harness.app, 'KRZ', ORPHANED);
  expect(pushed.statusCode).toBe(200);
  // Trzy godziny ciszy z telefonu - administrator patrzy na maszynę „w toku".
  harness.clock.advance(3 * 3_600_000);
  return harness;
}

describe('zakończenie administracyjne operacji (issue #81)', () => {
  it('zamyka operację osieroconą: PIC sesji w rejestrze, autor w audycie, maszyna wolna, odczytów brak', async () => {
    const { app, db } = await orphanedDay();
    const admin = await login(app, 'TMK');

    const res = await closeSession(app, admin, SESSION, { reason: 'Telefon pilota padł w locie.' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sessionUuid: SESSION,
      voidUuid: null,
      state: { closed: true, closedByAdmin: true, adminCloseReason: 'Telefon pilota padł w locie.' },
      // Operacja W TOKU jest tu NORMĄ, nie kolizją - ostrzeżenia `ADMIN_EDIT_*` należą
      // do korekt (i do opcjonalnego unieważnienia), zakończenie samo ich nie produkuje.
      warnings: [],
    });

    const { rows } = await db.query<{ pic_id: string; source_device: string | null; payload: Record<string, unknown> }>(
      "SELECT pic_id, source_device, payload FROM events WHERE session_uuid = $1 AND type = 'session_close'",
      [SESSION],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pic_id).toBe('KRZ');
    expect(rows[0]!.source_device).toBe('admin:TMK');
    expect(rows[0]!.payload).toEqual({ reason: 'Telefon pilota padł w locie.' });

    // Projekcja: zamknięta, ale BEZ odczytów końcowych - nie jest ogniwem łańcucha.
    expect(await sessionRow(db, SESSION)).toEqual({ status: 'closed', mh_end: null, fuel_end_l: null });

    // Flota: samolot przestał być zajęty. Operacja zamknięta BEZ odczytów końcowych nie
    // jest ogniwem przekazania (`pickHandover` ją pomija) - stan maszyny wpisze
    // administrator osobną akcją (`adminAircraftReadings.test.ts`).
    const fleet = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet',
      headers: { authorization: `Bearer ${admin}` },
    });
    const axa = fleet.json().items.find((a: { reg: string }) => a.reg === 'SP-AXA');
    expect(axa.claim).toBeNull();
    expect(axa.openSessions).toBe(0);

    const { rows: audit } = await db.query<{ action: string; details: Record<string, unknown> }>(
      "SELECT action, details FROM admin_audit WHERE action = 'session.close'",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.details).toMatchObject({
      aircraftId: 'SP-AXA',
      picId: 'KRZ',
      voided: false,
      engineRunning: true,
      reason: 'Telefon pilota padł w locie.',
    });
  });

  it('„od razu unieważnij" dopisuje DWA fakty: zakończenie i unieważnienie z podpisem admina', async () => {
    const { app, db } = await orphanedDay();
    const admin = await login(app, 'TMK');

    const res = await closeSession(app, admin, SESSION, { reason: 'Pomyłka maszyny.', void: true });

    expect(res.statusCode).toBe(200);
    expect(res.json().voidUuid).toEqual(expect.any(String));
    expect(res.json().state).toMatchObject({ closed: true, closedByAdmin: true, voided: true, voidedByAdmin: true });
    // Oba fakty wchodzą JEDNĄ transakcją, więc `received_at` mają równe i o kolejności
    // w rejestrze rozstrzyga uuid - pytamy o zbiór, nie o porządek.
    const types = await eventTypes(db, SESSION);
    expect(types.slice(0, 4)).toEqual(['session_claim', 'preflight_confirm', 'engine_start', 'takeoff']);
    expect(types.slice(4).sort()).toEqual(['session_close', 'session_void']);
    expect((await sessionRow(db, SESSION))?.status).toBe('voided');

    const { rows } = await db.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM events WHERE session_uuid = $1 AND type = 'session_void'",
      [SESSION],
    );
    expect(rows[0]!.payload).toEqual({ reason: 'Pomyłka maszyny.', source: 'admin' });
  });

  it('zdanie dosłane z telefonu PO decyzji panelu jest WSTRZYMANE - nie wchodzi do rejestru, telefon dostaje listę', async () => {
    const { app, db } = await orphanedDay();
    const admin = await login(app, 'TMK');
    await closeSession(app, admin, SESSION, { reason: 'Telefon padł.' });

    // Telefon KRZ odzyskał zasięg i wysyła to, co zapisał offline - razem ze zdaniem.
    const late = await push(app, 'KRZ', LATE);

    expect(late.statusCode).toBe(200);
    expect(late.json()).toMatchObject({
      accepted: 0,
      duplicates: 0,
      withheld: ['orphan-landing', 'orphan-stop', 'orphan-close'],
    });
    // Rejestr NIE dostał zdania: decyzja administratora jest ostatnim słowem.
    expect(await eventTypes(db, SESSION)).not.toContain('day_close');
    expect(await sessionRow(db, SESSION)).toEqual({ status: 'closed', mh_end: null, fuel_end_l: null });
  });

  it('paczka do operacji OTWARTEJ nie płaci za tę bramkę - `withheld` jest puste', async () => {
    const { app } = await orphanedDay();
    const res = await push(app, 'KRZ', LATE);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accepted: 3, withheld: [] });
  });

  it('decyzja wraca na telefon pilota, a telefon nie ma jak przysłać `session_close` sam', async () => {
    const { app } = await orphanedDay();
    const admin = await login(app, 'TMK');
    await closeSession(app, admin, SESSION, { reason: 'Telefon padł.' });

    const krz = await login(app, 'KRZ');
    const mine = await app.inject({
      method: 'GET',
      url: '/me/events',
      headers: { authorization: `Bearer ${krz}` },
    });
    const closeEvent = (mine.json().events as { type: string; payload: { reason: string } }[]).find(
      (e) => e.type === 'session_close',
    );
    expect(closeEvent?.payload.reason).toBe('Telefon padł.');

    // Typ panelu w kopercie telefonu: 403 w całości, zero wierszy.
    const forged = await push(app, 'KRZ', [event('forged-close-1', 'session_close', at(12, 0), { reason: 'x' })]);
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toEqual({ error: 'admin_only_event' });
  });

  it('drugie zakończenie → 422 z nazwanym powodem; nieznana operacja → 404; pusty powód → 400', async () => {
    const { app } = await orphanedDay();
    const admin = await login(app, 'TMK');

    expect((await closeSession(app, admin, SESSION, { reason: 'x' })).statusCode).toBe(200);

    const again = await closeSession(app, admin, SESSION, { reason: 'y' });
    expect(again.statusCode).toBe(422);
    expect(again.json().violations).toMatchObject([{ code: 'DAY_ALREADY_CLOSED' }]);

    expect((await closeSession(app, admin, 'nie-ma', { reason: 'x' })).statusCode).toBe(404);
    expect((await closeSession(app, admin, SESSION, { reason: '   ' })).statusCode).toBe(400);
  });

  it('operacja ZDANA przez pilota nie ma czego kończyć - ten sam kod, co drugie zdanie', async () => {
    const { app } = await testHarness();
    await push(app, 'KRZ', [...ORPHANED, ...LATE]);
    const admin = await login(app, 'TMK');

    const res = await closeSession(app, admin, SESSION, { reason: 'x' });
    expect(res.statusCode).toBe(422);
    expect(res.json().violations).toMatchObject([{ code: 'DAY_ALREADY_CLOSED' }]);
  });

  it('pilot bez zdolności `events.correct` nie zakończy cudzej operacji', async () => {
    const { app } = await orphanedDay();
    const pilot = await login(app, 'PWI');
    expect((await closeSession(app, pilot, SESSION, { reason: 'x' })).statusCode).toBe(403);
  });
});
