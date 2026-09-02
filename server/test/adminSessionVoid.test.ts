/**
 * UZ Aero (serwer) - unieważnienie CAŁEJ sesji z panelu
 * (`POST /admin/api/sessions/:uuid/void`, zamówienie właściciela produktu 2026-08-31:
 * „z poziomu admina powinienem mieć możliwość w dowolnym momencie usunięcia sesji").
 *
 * Ten sam wzorzec co reszta: PGlite w procesie, prawdziwe klasy, `app.inject`, zero
 * atrap poza arkuszem. Dzień powstaje z PRAWDZIWEGO `POST /events` przysłanego przez
 * telefon PIC-a - test, który wstawia zdarzenia `INSERT`-em, przybija własne wyobrażenie
 * o rejestrze, a nie zachowanie systemu.
 *
 * Scenariuszem jest doba z DWIEMA zmianami tej samej maszyny, bo dopiero ona pokazuje
 * to, o co w unieważnieniu chodzi: karta arkusza ma zostać przebudowana BEZ wycofanej
 * sesji, a nie tylko przestać się dla niej wyzwalać.
 *
 * Cztery rzeczy pod obserwacją:
 *  1. zdarzenie ląduje w rejestrze ostemplowane PIC-em SESJI, a autor żyje w audycie;
 *  2. projekcja dostaje status `voided`, więc sesja wypada z łańcucha MH i z eksportu;
 *  3. karta doby powstaje od nowa, bez wycofanej zmiany;
 *  4. „w dowolnym momencie" obejmuje sesję W TOKU - z ostrzeżeniem, nie odmową.
 */

import { describe, expect, it } from 'vitest';

import { FakeSheets } from './fakes/fakeSheets.ts';
import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
const HOUR_MS = 3_600_000;

/** Poranna zmiana: KRZ. Popołudniowa: PWI. Administratorem panelu jest TMK. */
const MORNING = 'sess-1';
const AFTERNOON = 'sess-2';

type Harness = Awaited<ReturnType<typeof testHarness>>;

function login(app: Harness['app'], who: string): Promise<string> {
  return app
    .inject({ method: 'POST', url: '/auth/login', payload: { login: who, password: TEST_PASSWORD } })
    .then((res) => res.json().token as string);
}

function event(
  sessionUuid: string,
  picId: string,
  uuid: string,
  type: string,
  time: number,
  payload: Record<string, unknown>,
) {
  return {
    uuid,
    sessionUuid,
    aircraftId: 'SP-AXA',
    picId,
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

/**
 * Jedna zmiana: przejęcie → bieg silnika z jednym lotem → zdanie z odczytami.
 *
 * Odczyty domykają się w ŁAŃCUCH (`fuelEnd` jednej = `fuelStart` następnej), bo maszyna
 * nie tankuje się sama między zmianami - rozjazd wystawiłby flagę i test opisywałby
 * dwie rzeczy naraz.
 */
function shift(options: {
  sessionUuid: string;
  picId: string;
  claim: number;
  start: number;
  takeoff: number;
  landing: number;
  stop: number;
  close: number;
  fuelStartL: number;
  fuelEndL: number;
  mhStart: number;
  mhEnd: number;
}) {
  const { sessionUuid: s, picId: p } = options;
  const ev = (uuid: string, type: string, time: number, payload: Record<string, unknown>) =>
    event(s, p, `${s}-${uuid}`, type, time, payload);

  return [
    ev('claim', 'session_claim', options.claim, { mode: 'free' }),
    ev('preflight', 'preflight_confirm', options.claim, {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: null,
      reading: { fuelL: options.fuelStartL, mh: options.mhStart },
      client: null,
      mhFormat: 'hhmm',
    }),
    ev('engine-start', 'engine_start', options.start, {}),
    ev('takeoff', 'takeoff', options.takeoff, { method: 'auto' }),
    ev('landing', 'landing', options.landing, { method: 'auto' }),
    ev('engine-stop', 'engine_stop', options.stop, {}),
    ev('day-close', 'day_close', options.close, {
      finalReading: { fuelL: options.fuelEndL, mh: options.mhEnd },
    }),
  ];
}

const MORNING_EVENTS = shift({
  sessionUuid: MORNING,
  picId: 'KRZ',
  claim: at(8, 0),
  start: at(8, 12),
  takeoff: at(8, 25),
  landing: at(9, 18),
  stop: at(10, 34),
  close: at(10, 40),
  fuelStartL: 150,
  fuelEndL: 88,
  mhStart: 1234.5,
  mhEnd: 1236.87,
});

const AFTERNOON_EVENTS = shift({
  sessionUuid: AFTERNOON,
  picId: 'PWI',
  claim: at(13, 0),
  start: at(13, 10),
  takeoff: at(13, 20),
  landing: at(14, 5),
  stop: at(14, 30),
  close: at(14, 40),
  fuelStartL: 88,
  fuelEndL: 40,
  mhStart: 1236.87,
  mhEnd: 1238.2,
});

function voidSession(
  app: Harness['app'],
  sessionUuid: string,
  options: { token?: string; body?: unknown },
) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/sessions/${sessionUuid}/void`,
    headers: {
      ...ADMIN_CSRF_HEADERS,
      ...(options.token == null ? {} : { authorization: `Bearer ${options.token}` }),
    },
    payload: options.body ?? {},
  });
}

async function push(app: Harness['app'], who: string, events: unknown[]) {
  const token = await login(app, who);
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events, sourceDevice: `Pixel 7a · ${who}` },
  });
  expect(res.statusCode).toBe(200);
}

async function eventRows(db: Harness['db'], sessionUuid: string) {
  const { rows } = await db.query<{
    uuid: string;
    type: string;
    pic_id: string;
    payload: Record<string, unknown>;
    source_device: string | null;
  }>(
    `SELECT uuid, type, pic_id, payload, source_device
       FROM events WHERE session_uuid = $1 ORDER BY received_at, uuid`,
    [sessionUuid],
  );
  return rows;
}

async function statusOf(db: Harness['db'], sessionUuid: string) {
  const { rows } = await db.query<{ status: string }>(
    'SELECT status FROM sessions WHERE session_uuid = $1',
    [sessionUuid],
  );
  return rows[0]?.status ?? null;
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    actor_pilot_id: string;
    actor_role: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
  }>(
    `SELECT actor_pilot_id, actor_role, action, target_type, target_id, details
       FROM admin_audit ORDER BY id`,
  );
  return rows;
}

/** Doba SP-AXA z dwiema zmianami, obie zdane i wyeksportowane; okno pilotów minęło. */
async function flownDay(options: { sheets?: FakeSheets } = {}) {
  const sheets = options.sheets ?? new FakeSheets();
  const harness = await testHarness({ sheets });

  await push(harness.app, 'KRZ', MORNING_EVENTS);
  await push(harness.app, 'PWI', AFTERNOON_EVENTS);

  // Doba i osiem godzin od zdania: okno 24 h obu pilotów minęło, więc sami nie
  // poprawią już nic. Zegar jest portem - test nie musi spać.
  harness.clock.advance(2 * 24 * HOUR_MS);
  return { ...harness, sheets };
}

describe('unieważnienie sesji z panelu (2026-08-31)', () => {
  it('dopisuje session_void PIC-em sesji, ustawia status voided i przebudowuje kartę bez niej', async () => {
    const { app, db, sheets } = await flownDay();
    const admin = await login(app, 'TMK');

    // Przed unieważnieniem: dwie karty (po jednym zdaniu każda) i obie zmiany w treści.
    expect(sheets.calls).toHaveLength(2);
    expect(sheets.calls[1]!.rows).toContainEqual(['Operacje', '2']);

    const res = await voidSession(app, MORNING, {
      token: admin,
      body: { reason: 'Wpis otwarty przez pomyłkę na SP-AXA - lot odbył się na SP-FGK.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sessionUuid: MORNING,
      state: { voided: true },
      // Sesja zdana, okno pilota minęło - nie ma o czym uprzedzać.
      warnings: [],
      reexport: { exported: true, tab: '2026-06-22_SP-AXA', revision: 3 },
    });

    // ── rejestr: DOPISANE zdarzenie, strumień nietknięty ──────────────────────
    const rows = await eventRows(db, MORNING);
    expect(rows).toHaveLength(8);

    const voided = rows.find((r) => r.type === 'session_void')!;
    expect(voided.uuid).toBe(res.json().voidUuid);
    expect(voided.payload).toEqual({
      reason: 'Wpis otwarty przez pomyłkę na SP-AXA - lot odbył się na SP-FGK.',
    });
    // Tożsamość w rejestrze to PIC SESJI - inaczej `WRITER_MISMATCH`, i słusznie.
    // Kto to zrobił, mówią `source_device` i dziennik audytu.
    expect(voided.pic_id).toBe('KRZ');
    expect(voided.source_device).toBe('admin:TMK');

    // ── projekcja: TRZECI status, obok active i closed ────────────────────────
    expect(await statusOf(db, MORNING)).toBe('voided');
    expect(await statusOf(db, AFTERNOON)).toBe('closed');

    // ── karta doby: przebudowana BEZ wycofanej zmiany ─────────────────────────
    expect(sheets.calls).toHaveLength(3);
    const card = sheets.calls[2]!;
    expect(card.tab).toBe('2026-06-22_SP-AXA');
    expect(card.rows).toContainEqual(['Operacje', '1']);
    // Kod pilota wycofanej zmiany nie ma prawa stać nigdzie w dokumencie klubu.
    expect(card.rows.flat()).not.toContain('KRZ');
    expect(card.rows.flat()).toContain('PWI');

    // ── audyt: kto, w jakiej roli, co wycofał i dlaczego ──────────────────────
    expect(await auditRows(db)).toMatchObject([
      {
        actor_pilot_id: 'TMK',
        actor_role: 'admin',
        action: 'session.void',
        target_type: 'session',
        target_id: MORNING,
        details: {
          aircraftId: 'SP-AXA',
          picId: 'KRZ',
          flights: 1,
          reason: 'Wpis otwarty przez pomyłkę na SP-AXA - lot odbył się na SP-FGK.',
        },
      },
    ]);
  });

  it('wycofana sesja wraca na telefon pilota - inaczej wisiałaby w jego dniu na zawsze', async () => {
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');
    await voidSession(app, MORNING, { token: admin, body: { reason: 'Pomyłkowy wpis.' } });

    // §4.9: rejestr telefonu odtwarza się z serwera, więc decyzja panelu musi tamtędy
    // dojechać. Bez tego pilot dalej liczyłby wycofaną sesję do swojego dnia.
    const krz = await login(app, 'KRZ');
    const res = await app.inject({
      method: 'GET',
      url: '/me/events',
      headers: { authorization: `Bearer ${krz}` },
    });

    expect(res.statusCode).toBe(200);
    const types = (res.json().events as { type: string }[]).map((e) => e.type);
    expect(types).toContain('session_void');
  });

  it('sesja W TOKU też się unieważnia - z ostrzeżeniem o pilocie, nie odmową', async () => {
    // „W dowolnym momencie" z zamówienia obejmuje maszynę, którą ktoś właśnie trzyma:
    // to jest dokładnie ta sytuacja, w której wpis otwarty przez pomyłkę trzeba wycofać.
    const { app, db } = await testHarness();
    await push(app, 'KRZ', MORNING_EVENTS.slice(0, 3)); // przejęcie + preflight + start
    const admin = await login(app, 'TMK');

    const res = await voidSession(app, MORNING, {
      token: admin,
      body: { reason: 'Pilot pomylił maszynę przy przejęciu.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toMatchObject([{ code: 'ADMIN_EDIT_SESSION_ACTIVE' }]);
    expect(await statusOf(db, MORNING)).toBe('voided');
  });

  it('drugie unieważnienie → 422 z nazwanym powodem (stan jest binarny)', async () => {
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const first = await voidSession(app, MORNING, {
      token: admin,
      body: { reason: 'Pomyłkowy wpis.' },
    });
    expect(first.statusCode).toBe(200);

    const second = await voidSession(app, MORNING, {
      token: admin,
      body: { reason: 'Jeszcze raz to samo.' },
    });
    expect(second.statusCode).toBe(422);
    expect(second.json()).toMatchObject({
      error: 'rule_violation',
      violations: [{ code: 'SESSION_ALREADY_VOIDED' }],
    });
  });

  it('sesja spoza rejestru → 404, powód pusty → 400, konto bez zdolności → 403', async () => {
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const missing = await voidSession(app, 'sess-nie-ma', {
      token: admin,
      body: { reason: 'Cokolwiek.' },
    });
    expect(missing.statusCode).toBe(404);

    // Spacje nie liczą się za uzasadnienie - dokładnie jak przy korekcie administratora.
    const blank = await voidSession(app, MORNING, { token: admin, body: { reason: '   ' } });
    expect(blank.statusCode).toBe(400);

    // Zwykły pilot nie pisze w cudzym rejestrze - to zdolność `events.correct`.
    const pilot = await login(app, 'JSE');
    const refused = await voidSession(app, MORNING, {
      token: pilot,
      body: { reason: 'Chcę wycofać cudzy lot.' },
    });
    expect(refused.statusCode).toBe(403);
  });
});
