/**
 * UZ Aero (serwer) - ODCZYTY MASZYNY WPISANE RĘKĄ ADMINISTRATORA
 * (`POST /admin/api/fleet/:id/readings`, issue #81).
 *
 * Pod obserwacją:
 *  1. wpis wraca w karcie samolotu ze źródłem `admin`, podpisem i komentarzem, a audyt
 *     niesie liczby i powód;
 *  2. TELEFON dostaje z niego przekazanie (`/reference`) z `origin: 'admin'`
 *     i `byPilotId: null`, a ETag się zmienia - 304 nie zamraża poprawki;
 *  3. porządek ŁAŃCUCHA MH: wpis wypiera zdanie z niższym licznikiem, a zdanie
 *     z wyższym wypiera wpis - zegar rozstrzyga wyłącznie remis;
 *  4. reguły jak przy stanie początkowym: minus i sufit zbiornika odbijają z powodem;
 *     komentarz jest wymagany; zdolność `fleet.manage`.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const DAY = Date.UTC(2026, 8, 3);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

function login(app: Harness['app'], who: string): Promise<string> {
  return app
    .inject({ method: 'POST', url: '/auth/login', payload: { login: who, password: TEST_PASSWORD } })
    .then((res) => res.json().token as string);
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const writer = (t: string) => ({ ...bearer(t), ...ADMIN_CSRF_HEADERS });

const recordReading = (app: Harness['app'], t: string, id: string, body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/admin/api/fleet/${id}/readings`, headers: writer(t), payload: body });

const fleetRow = async (app: Harness['app'], t: string, reg: string) => {
  const res = await app.inject({ method: 'GET', url: '/admin/api/fleet', headers: bearer(t) });
  return res.json().items.find((a: { reg: string }) => a.reg === reg);
};

const referenceRow = async (app: Harness['app'], t: string, reg: string, etag?: string) => {
  const res = await app.inject({
    method: 'GET',
    url: '/reference',
    headers: etag == null ? bearer(t) : { ...bearer(t), 'if-none-match': etag },
  });
  return {
    status: res.statusCode,
    etag: res.headers.etag as string | undefined,
    row: res.statusCode === 200 ? res.json().aircraft.find((a: { reg: string }) => a.reg === reg) : null,
  };
};

/** Jedna zdana zmiana SP-AXA: 150 → 88 L, licznik do `mhEnd`. */
function shift(sessionUuid: string, close: number, mhEnd: number, fuelEndL = 88) {
  const ev = (uuid: string, type: string, time: number, payload: Record<string, unknown>) => ({
    uuid: `${sessionUuid}-${uuid}`,
    sessionUuid,
    aircraftId: 'SP-AXA',
    picId: 'KRZ',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  });
  return [
    ev('claim', 'session_claim', close - 3_600_000, { mode: 'free' }),
    ev('preflight', 'preflight_confirm', close - 3_600_000, {
      operation: 'skoki',
      reading: { fuelL: 150, mh: mhEnd - 1.2 },
      mhFormat: 'hhmm',
    }),
    ev('start', 'engine_start', close - 3_000_000, {}),
    ev('stop', 'engine_stop', close - 600_000, {}),
    ev('close', 'day_close', close, { finalReading: { fuelL: fuelEndL, mh: mhEnd } }),
  ];
}

async function push(app: Harness['app'], who: string, events: unknown[]) {
  const token = await login(app, who);
  const res = await app.inject({ method: 'POST', url: '/events', headers: bearer(token), payload: { events } });
  expect(res.statusCode).toBe(200);
}

describe('odczyty maszyny wpisane ręką administratora (issue #81)', () => {
  it('wpis wraca w karcie samolotu ze źródłem `admin`, podpisem i komentarzem - i w audycie', async () => {
    const { app, db } = await testHarness();
    await push(app, 'KRZ', shift('s-1', at(10, 0), 1236.5));
    const admin = await login(app, 'TMK');

    const res = await recordReading(app, admin, 'SP-AXA', {
      mh: 1240,
      fuelL: 120,
      oilL: 8.5,
      note: 'Odczyt z tarczy po zakończeniu operacji z 3 września.',
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().aircraft.reading).toMatchObject({
      mh: 1240,
      fuelL: 120,
      oilL: 8.5,
      oilAddedSinceL: 0,
      byPilotId: null,
      byPilotName: expect.any(String),
      source: 'admin',
      note: 'Odczyt z tarczy po zakończeniu operacji z 3 września.',
    });

    const { rows } = await db.query<{ action: string; target_id: string; details: Record<string, unknown> }>(
      "SELECT action, target_id, details FROM admin_audit WHERE action = 'aircraft.reading'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.target_id).toBe('SP-AXA');
    expect(rows[0]!.details).toMatchObject({ reg: 'SP-AXA', mh: 1240, fuelL: 120, oilL: 8.5 });
  });

  it('telefon dostaje z wpisu przekazanie z `origin: admin`, a ETag /reference się zmienia', async () => {
    const { app } = await testHarness();
    await push(app, 'KRZ', shift('s-1', at(10, 0), 1236.5));
    const admin = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    const before = await referenceRow(app, krz, 'SP-AXA');
    expect(before.row.handover).toMatchObject({ byPilotId: 'KRZ', reading: { fuelL: 88, mh: 1236.5 } });

    await recordReading(app, admin, 'SP-AXA', { mh: 1240, fuelL: 120, oilL: null, note: 'Po remoncie.' });

    // Poprawka nie może zostać za 304: cache telefonu dostaje nowy ETag.
    const after = await referenceRow(app, krz, 'SP-AXA', before.etag);
    expect(after.status).toBe(200);
    expect(after.row.handover).toMatchObject({
      byPilotId: null,
      origin: 'admin',
      reading: { fuelL: 120, mh: 1240 },
    });
    // Bez oleju we wpisie kotwica oleju zostaje przy dzienniku (tu: brak pomiaru).
    expect(after.row.handover.oil).toBeNull();
  });

  it('porządek łańcucha MH: wpis wypiera zdanie z niższym licznikiem, zdanie z wyższym wypiera wpis', async () => {
    const { app, clock } = await testHarness();
    await push(app, 'KRZ', shift('s-1', at(10, 0), 1236.5));
    const admin = await login(app, 'TMK');

    // Wpis PONIŻEJ ostatniego zdania w łańcuchu: zdanie zostaje bazą przekazania.
    await recordReading(app, admin, 'SP-AXA', { mh: 1230, fuelL: 200, oilL: null, note: 'Stary odczyt.' });
    expect((await fleetRow(app, admin, 'SP-AXA')).reading).toMatchObject({ source: 'handover', mh: 1236.5 });

    // Wpis POWYŻEJ: wygrywa.
    clock.advance(60_000);
    await recordReading(app, admin, 'SP-AXA', { mh: 1240, fuelL: 120, oilL: null, note: 'Po remoncie.' });
    expect((await fleetRow(app, admin, 'SP-AXA')).reading).toMatchObject({ source: 'admin', mh: 1240 });

    // Kolejne zdanie z wyższym licznikiem wypiera wpis samo - łańcuch prowadzą loty.
    await push(app, 'KRZ', shift('s-2', at(14, 0), 1241.7, 70));
    expect((await fleetRow(app, admin, 'SP-AXA')).reading).toMatchObject({ source: 'handover', mh: 1241.7, fuelL: 70 });
  });

  it('bez ani jednej zdanej operacji wpis wypiera stan początkowy z panelu', async () => {
    const { app, db } = await testHarness();
    await db.query("UPDATE aircraft SET initial_mh = 1000, initial_fuel_l = 50, updated_at = now() WHERE id = 'SP-AXA'");
    const admin = await login(app, 'TMK');
    expect((await fleetRow(app, admin, 'SP-AXA')).reading).toMatchObject({ source: 'initial', mh: 1000 });

    await recordReading(app, admin, 'SP-AXA', { mh: 1001, fuelL: 60, oilL: null, note: 'Po tankowaniu.' });
    expect((await fleetRow(app, admin, 'SP-AXA')).reading).toMatchObject({ source: 'admin', mh: 1001, fuelL: 60 });
  });

  it('odmawia jak stan początkowy: minus i sufit zbiornika z powodem; komentarz wymagany; nieznana maszyna → 404', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');

    const minus = await recordReading(app, admin, 'SP-AXA', { mh: -1, fuelL: 10, oilL: null, note: 'x' });
    expect(minus.statusCode).toBe(409);
    expect(minus.json()).toMatchObject({ error: 'refused', reason: 'initial_negative' });

    const over = await recordReading(app, admin, 'SP-AXA', { mh: 1, fuelL: 100_000, oilL: null, note: 'x' });
    expect(over.statusCode).toBe(409);
    expect(over.json()).toMatchObject({ error: 'refused', reason: 'initial_fuel_over_capacity' });

    expect((await recordReading(app, admin, 'SP-AXA', { mh: 1, fuelL: 10, oilL: null, note: '  ' })).statusCode).toBe(400);
    expect((await recordReading(app, admin, 'nie-ma', { mh: 1, fuelL: 10, oilL: null, note: 'x' })).statusCode).toBe(404);
  });

  it('zapis żąda `fleet.manage` - pilot dostaje 403 i niczego nie wpisuje', async () => {
    const { app, db } = await testHarness();
    const pilot = await login(app, 'KRZ');
    expect((await recordReading(app, pilot, 'SP-AXA', { mh: 1, fuelL: 10, oilL: null, note: 'x' })).statusCode).toBe(403);
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM aircraft_readings');
    expect((rows[0] as { n: number }).n).toBe(0);
  });
});
