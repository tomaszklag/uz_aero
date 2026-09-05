/**
 * UZ Aero (serwer) - testy bazodanowego adaptera arkuszy i `GET /sheets/:tab` (§4.7).
 *
 * Eksport działa tu END-TO-END bez żadnej atrapy: `POST /events` z `day_close`
 * → `PgSheets` zapisuje kartę do `exported_sheets` → `export_log` dostaje rewizję
 * → `sync-status` i `GET /sheets/:tab` serwują to, co zapisał eksporter. Dokładnie
 * ta ścieżka, którą przejdzie produkcja - adapter Google będzie tylko podmianą
 * miejsca zapisu.
 */

import { describe, expect, it } from 'vitest';

import { TEST_BASE_URL, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
const TAB_URL = `${TEST_BASE_URL}/sheets/2026-06-22_SP-AXA`;

let seq = 0;
function event(type: string, time: number, payload: Record<string, unknown> = {}) {
  seq += 1;
  return {
    uuid: `sh-${seq}-${type}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

/** Kanoniczny dzień - te same liczby co w `ingest.test.ts` (150→88 L, 1234:30→1241:09). */
function day() {
  return [
    event('session_claim', at(8, 0), { mode: 'free' }),
    event('preflight_confirm', at(8, 0), {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: null,
      reading: { fuelL: 150, mh: 1234.5 },
      client: null,
      mhFormat: 'hhmm',
    }),
    event('engine_start', at(8, 12), {}),
    event('takeoff', at(8, 25), { method: 'auto' }),
    event('landing', at(9, 18), { method: 'auto' }),
    event('engine_stop', at(10, 34), {}),
    event('day_close', at(16, 45), { finalReading: { fuelL: 88, mh: 1241.15 } }),
  ];
}

async function login(app: Awaited<ReturnType<typeof testHarness>>['app']) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor('TMK') },
  });
  return res.json().token as string;
}

async function post(
  app: Awaited<ReturnType<typeof testHarness>>['app'],
  token: string,
  events: unknown[],
) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events },
  });
}

describe('bazodanowe karty arkusza (PgSheets + GET /sheets/:tab)', () => {
  it('day_close → karta w bazie, serwowana pod URL-em z export_log i sync-status', async () => {
    const { app, db } = await testHarness();
    const token = await login(app);
    await post(app, token, day());

    const res = await app.inject({
      method: 'GET',
      url: '/sheets/2026-06-22_SP-AXA',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const sheet = res.json();
    expect(sheet.tab).toBe('2026-06-22_SP-AXA');

    // Kanoniczne liczby - ta sama projekcja co ekran 10 telefonu.
    expect(sheet.rows).toContainEqual(['UZ Aero - doba samolotu', '2026-06-22 (UTC)']);
    expect(sheet.rows).toContainEqual(['S1', '1', '08:25', '09:18', '00:53', 'AUTO']);
    expect(sheet.rows).toContainEqual(['Doba', '1234:30', '1241:09', '6:39']);
    expect(sheet.rows).toContainEqual(['Czas blokowy doby', '02:22']);

    // Link jest jeden i wszędzie ten sam: dziennik eksportu i sync-status telefonu.
    const { rows } = await db.query<{ sheet_url: string }>(
      "SELECT sheet_url FROM export_log WHERE session_uuid = 'sess-1'",
    );
    expect(rows[0]!.sheet_url).toBe(TAB_URL);
    const status = await app.inject({
      method: 'GET',
      url: '/sessions/sess-1/sync-status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.json().exportUrl).toBe(TAB_URL);
  });

  it('spóźnione dane NADPISUJĄ kartę (jeden rekord per tab), rewizja rośnie w dzienniku', async () => {
    const { app, db } = await testHarness();
    const token = await login(app);
    await post(app, token, day());

    // Spóźniony zrzut dociera po eksporcie - karta ma się przegenerować.
    await post(app, token, [
      event('drop', at(8, 48), {
        dropNumber: 1,
        altitudeFt: 13_000,
        jumpers: { tandem: 2, aff: 1, solo: 1 },
        client: null,
      }),
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/sheets/2026-06-22_SP-AXA',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json().rows).toContainEqual(['Doba', '1', '4 (2 tandem / 1 AFF / 1 solo)']);

    const count = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM exported_sheets');
    expect(Number(count.rows[0]!.n)).toBe(1); // karta jak u Google: nadpisana, nie zdublowana
    const log = await db.query<{ revision: number }>(
      "SELECT MAX(revision) AS revision FROM export_log WHERE session_uuid = 'sess-1'",
    );
    expect(Number(log.rows[0]!.revision)).toBe(2); // a historia rewizji została w dzienniku
  });

  it('karta to dokument klubu - bez tokenu 401', async () => {
    const { app } = await testHarness();
    const token = await login(app);
    await post(app, token, day());

    const res = await app.inject({ method: 'GET', url: '/sheets/2026-06-22_SP-AXA' });
    expect(res.statusCode).toBe(401);
  });

  it('nieistniejąca karta → 404, nie pusty dokument', async () => {
    const { app } = await testHarness();
    const token = await login(app);

    const res = await app.inject({
      method: 'GET',
      url: '/sheets/2099-01-01_SP-XXX',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });
});
