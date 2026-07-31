/**
 * UZ Aero (serwer) — dziennik audytu jako CZĘŚĆ komendy, nie dodatek do niej.
 *
 * Te testy nie sprawdzają, że coś się loguje. Sprawdzają WŁASNOŚĆ, na której stoi
 * cały mechanizm `AuditedWrite`: skutek i jego ślad są tą samą transakcją, więc
 * zmiana bez śladu nie ma prawa się zapisać, a ślad bez zmiany nie ma prawa powstać.
 *
 * Jedyna podmiana w całym pliku to port audytu, który RZUCA — bo awarii zapisu śladu
 * nie da się wywołać inaczej niż awarią zapisu śladu.
 */

import { describe, expect, it } from 'vitest';

import type { AdminAuditPort } from '../src/application/admin/ports.ts';
import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

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
    uuid: `a-${seq}-${type}`,
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

function openDay(sessionUuid: string, picId: string, mh: number) {
  const base = { sessionUuid, picId };
  return [
    event('session_claim', at(8, 0), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        dutyStart: at(8, 0),
        reading: { fuelL: 150, mh },
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', at(8, 12), {}, base),
    event('takeoff', at(8, 25), { method: 'auto' }, base),
    event('landing', at(9, 18), { method: 'auto' }, base),
    event('engine_stop', at(10, 34), {}, base),
  ];
}

/** Port audytu, który zawsze rzuca — jedyny sposób na wymuszenie awarii ŚLADU. */
const failingAudit: AdminAuditPort = {
  append: () => Promise.reject(new Error('zapis do admin_audit nie powiódł się')),
};

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

function resolve(app: Harness['app'], id: number, token: string, note: string) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/flags/${id}/resolve`,
    headers: { authorization: `Bearer ${token}`, ...ADMIN_CSRF_HEADERS },
    payload: { note },
  });
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    actor_pilot_id: string;
    actor_role: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
    ip: string | null;
    created_at: Date | string;
  }>(
    `SELECT actor_pilot_id, actor_role, action, target_type, target_id, details, ip, created_at
     FROM admin_audit ORDER BY id`,
  );
  return rows;
}

/** Nakładka sesji jak w `adminFlags.test.ts` — flaga blokująca kartę dnia. */
async function overlapping(options: Parameters<typeof testHarness>[0] = {}) {
  const harness = await testHarness(options);
  const { app, db } = harness;
  const tmk = await login(app, 'TMK');
  const krz = await login(app, 'KRZ');

  await post(app, tmk, openDay('sess-1', 'TMK', 1234.5));
  await post(app, krz, openDay('sess-2', 'KRZ', 1236.87));
  await post(app, krz, [
    event(
      'day_close',
      at(16, 45),
      { finalReading: { fuelL: 95, mh: 1237.4 }, dutyEnd: at(16, 45) },
      { sessionUuid: 'sess-2', picId: 'KRZ' },
    ),
  ]);

  const { rows } = await db.query<{ id: number }>("SELECT id FROM flags WHERE status = 'open'");
  return { ...harness, flagId: rows[0]!.id };
}

async function flagStatus(db: Harness['db'], id: number): Promise<string> {
  const { rows } = await db.query<{ status: string }>('SELECT status FROM flags WHERE id = $1', [id]);
  return rows[0]!.status;
}

describe('audyt wymuszony typem, nie dyscypliną', () => {
  it('AWARIA AUDYTU cofa skutek — flaga zostaje `open`, karta dnia nie powstaje', async () => {
    // To jest test, który dowodzi zdania „zmiana bez śladu nie ma prawa się zapisać".
    // Bez niego `AuditedWrite` byłby wyłącznie obietnicą złożoną w docblocku.
    const { app, db, flagId } = await overlapping({ audit: failingAudit });
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId, admin, 'Wyjaśnione, odblokowuję kartę.');

    expect(res.statusCode).toBe(500);
    expect(await flagStatus(db, flagId)).toBe('open');

    // Skutek uboczny też nie zaszedł: eksport rusza dopiero PO commicie, którego
    // nie było. Karta ze stanu, który się nie zapisał, byłaby najgorszym wynikiem.
    const { rows: exports } = await db.query('SELECT 1 FROM export_log');
    expect(exports).toHaveLength(0);
  });

  it('NIEUDANY SKUTEK nie zostawia śladu — odbita próba nie dopisuje wiersza', async () => {
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');
    const trainingLead = await login(app, 'AKO');

    await resolve(app, flagId, admin, 'Pierwsze rozstrzygnięcie.');
    const second = await resolve(app, flagId, trainingLead, 'Drugie rozstrzygnięcie.');
    expect(second.statusCode).toBe(409);

    // Dokładnie JEDEN wiersz: druga próba przerwała transakcję przed wpisem, więc
    // dziennik nie zna akcji, która się nie odbyła.
    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_pilot_id: 'TMK' });
  });

  it('wpis niesie aktora, jego rolę, akcję i identyfikator flagi', async () => {
    const { app, db, flagId } = await overlapping();
    const trainingLead = await login(app, 'AKO');

    await resolve(app, flagId, trainingLead, 'Nakładka pozorna — dane dosłane z kopii.');

    expect(await auditRows(db)).toMatchObject([
      {
        actor_pilot_id: 'AKO',
        actor_role: 'training_lead',
        action: 'flag.resolve',
        target_type: 'flag',
        target_id: String(flagId),
        details: {
          note: 'Nakładka pozorna — dane dosłane z kopii.',
          type: 'session_overlap',
          sessionUuids: ['sess-1', 'sess-2'],
        },
      },
    ]);
  });

  it('`actor_role` to rola Z CHWILI AKCJI — późniejsza zmiana konta jej nie przepisuje', async () => {
    // Dziennik jest zapisem historycznym, nie złączeniem z `pilots`. Gdyby rola szła
    // z konta przy odczycie, odebranie uprawnień zafałszowałoby odpowiedź na pytanie
    // „kto miał wtedy prawo to zrobić" — czyli jedyne, po co ten dziennik istnieje.
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    await resolve(app, flagId, admin, 'Rozstrzygnięte przez administratora.');
    await db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'TMK'");

    expect((await auditRows(db))[0]).toMatchObject({ actor_pilot_id: 'TMK', actor_role: 'admin' });
  });
});
