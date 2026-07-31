/**
 * UZ Aero (serwer) — przebudowa projekcji `sessions` ze strumienia (`A11-konserwacja.html`).
 *
 * Komenda jest wołana z CLI (`npm run rebuild-projections`), więc test składa ją z tych
 * samych klas co skrypt — PGlite, prawdziwe adaptery, prawdziwy `AuditedWrite`. Dni
 * powstają przez `POST /events`, żeby porównywać się z projekcją, którą naprawdę
 * zapisuje ingest, a nie z tą, którą test sobie wyobraża.
 *
 * Najważniejszy przypadek to pierwszy: przebudowa NIE ZNAJDUJE różnic. Narzędzie, które
 * przy każdym uruchomieniu melduje dryf, przestaje cokolwiek znaczyć.
 */

import { describe, expect, it } from 'vitest';

import { AdminMaintenanceCommands } from '../src/application/admin/commands/maintenance.ts';
import type { Actor } from '../src/application/admin/ports.ts';
import { PgAdminMaintenanceRepo } from '../src/infrastructure/pg/admin/maintenanceRepo.ts';
import { TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

const ADMIN: Actor = { pilotId: 'TMK', role: 'admin', ip: null };

let seq = 0;
function event(type: string, time: number, payload: Record<string, unknown>) {
  seq += 1;
  return {
    uuid: `m-${seq}-${type}`,
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

const fullDay = () => [
  event('session_claim', at(7, 50), { mode: 'free' }),
  event('preflight_confirm', at(8, 0), {
    operation: 'skoki',
    departureIcao: 'EPKK',
    arrivalIcao: null,
    dutyStart: at(8, 0),
    reading: { fuelL: 150, mh: 1234.5 },
    client: 'SKY CAMP',
    mhFormat: 'hhmm',
  }),
  event('engine_start', at(8, 12), {}),
  event('takeoff', at(8, 25), { method: 'auto' }),
  event('landing', at(9, 18), { method: 'auto' }),
  event('engine_stop', at(10, 34), {}),
  event('day_close', at(16, 45), {
    finalReading: { fuelL: 88, mh: 1241.15 },
    dutyEnd: at(16, 45),
  }),
];

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function withDay() {
  const harness = await testHarness();
  const login = await harness.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: 'TMK', password: TEST_PASSWORD },
  });
  await harness.app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${login.json().token}` },
    payload: { events: fullDay() },
  });

  const commands = new AdminMaintenanceCommands(
    harness.auditedWrite,
    new PgAdminMaintenanceRepo(),
    harness.events,
    harness.sessions,
  );
  return { ...harness, commands };
}

async function projectionOf(db: Harness['db']) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM sessions WHERE session_uuid = $1',
    ['sess-1'],
  );
  return rows[0]!;
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{ action: string; details: Record<string, unknown>; target_type: string | null }>(
    'SELECT action, target_type, details FROM admin_audit ORDER BY id',
  );
  return rows;
}

describe('przebudowa projekcji (A11)', () => {
  it('na zdrowej bazie melduje ZERO różnic — i to jest wynik oczekiwany', async () => {
    const { db, commands } = await withDay();

    const outcome = await commands.rebuildProjections(ADMIN);

    expect(outcome).toMatchObject({
      ok: true,
      report: { mode: 'dry_run', sessions: 1, rowsDiffering: 0, fieldsDiffering: 0, written: 0 },
    });
    expect(outcome.ok && outcome.report.diffs).toEqual([]);

    // Ślad powstaje TAKŻE bez różnic i bez zapisu: „sprawdzono i się zgadza" jest
    // faktem, który ktoś kiedyś będzie chciał odtworzyć.
    expect(await auditRows(db)).toMatchObject([
      {
        action: 'maintenance.rebuild_projections',
        target_type: 'projection',
        details: { mode: 'dry_run', sessions: 1, rowsDiffering: 0, written: 0, reason: null },
      },
    ]);
  });

  it('dry-run NIE ZAPISUJE — pokazuje różnicę i zostawia wiersz nietknięty', async () => {
    const { db, commands } = await withDay();

    // Symulujemy dryf tak, jak mógłby powstać naprawdę: ręczny `UPDATE` w bazie,
    // czyli poza wszystkim, co robi serwer.
    await db.query('UPDATE sessions SET flights_count = 6, block_ms = 111 WHERE session_uuid = $1', [
      'sess-1',
    ]);

    const outcome = await commands.rebuildProjections(ADMIN, { mode: 'dry_run' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.report).toMatchObject({
      mode: 'dry_run',
      sessions: 1,
      rowsDiffering: 1,
      fieldsDiffering: 2,
      written: 0,
    });
    expect(outcome.report.diffs[0]).toMatchObject({
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      day: '2026-06-22',
      missing: false,
    });
    // Raport jest POLE PO POLU: administrator ma wiedzieć, co się rozjechało,
    // a nie tylko „coś się nie zgadza".
    expect(outcome.report.diffs[0]!.fields).toEqual([
      { field: 'blockMs', stored: 111, computed: (2 * 60 + 22) * 60_000 },
      { field: 'flightsCount', stored: 6, computed: 1 },
    ]);

    // Baza nietknięta — to jest cała treść trybu domyślnego.
    expect(await projectionOf(db)).toMatchObject({ flights_count: 6, block_ms: 111 });
  });

  it('zapis wymaga POWODU — bez niego nic się nie dzieje i nie ma śladu', async () => {
    const { db, commands } = await withDay();
    await db.query('UPDATE sessions SET flights_count = 6 WHERE session_uuid = $1', ['sess-1']);

    expect(await commands.rebuildProjections(ADMIN, { mode: 'write' })).toEqual({
      ok: false,
      reason: 'reason_required',
    });
    expect(await commands.rebuildProjections(ADMIN, { mode: 'write', reason: '   ' })).toEqual({
      ok: false,
      reason: 'reason_required',
    });

    expect(await projectionOf(db)).toMatchObject({ flights_count: 6 });
    expect(await auditRows(db)).toEqual([]);
  });

  it('tryb `write` przelicza wiersz ze strumienia i zapisuje POWÓD do audytu', async () => {
    const { db, commands } = await withDay();
    await db.query('UPDATE sessions SET flights_count = 6, operation = NULL WHERE session_uuid = $1', [
      'sess-1',
    ]);

    const outcome = await commands.rebuildProjections(ADMIN, {
      mode: 'write',
      reason: 'Różnica wyjaśniona zmianą reguły liczenia bloku w wydaniu z 24 JUL.',
    });

    expect(outcome).toMatchObject({
      ok: true,
      report: { mode: 'write', rowsDiffering: 1, fieldsDiffering: 2, written: 1 },
    });
    expect(await projectionOf(db)).toMatchObject({
      flights_count: 1,
      operation: 'skoki',
      client: 'SKY CAMP',
    });

    expect((await auditRows(db))[0]).toMatchObject({
      action: 'maintenance.rebuild_projections',
      details: {
        mode: 'write',
        written: 1,
        sessionUuids: ['sess-1'],
        reason: 'Różnica wyjaśniona zmianą reguły liczenia bloku w wydaniu z 24 JUL.',
      },
    });
  });

  it('sesja obecna w rejestrze BEZ wiersza projekcji jest widziana jako brak', async () => {
    // Najcięższy przypadek dryfu i powód, dla którego listę sesji budujemy z `events`,
    // a nie z `sessions`: lista z projekcji nie umiałaby zobaczyć wiersza, którego nie ma.
    const { db, commands } = await withDay();
    await db.query('DELETE FROM sessions WHERE session_uuid = $1', ['sess-1']);

    const dry = await commands.rebuildProjections(ADMIN);
    expect(dry.ok && dry.report).toMatchObject({ sessions: 1, rowsDiffering: 1, written: 0 });
    expect(dry.ok && dry.report.diffs[0]).toMatchObject({ sessionUuid: 'sess-1', missing: true });

    await commands.rebuildProjections(ADMIN, { mode: 'write', reason: 'Odtworzenie wiersza.' });
    expect(await projectionOf(db)).toMatchObject({ flights_count: 1, status: 'closed' });
  });

  it('NIE DOTYKA rejestru zdarzeń — ani w dry-runie, ani przy zapisie', async () => {
    const { db, commands } = await withDay();
    const before = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    await db.query('UPDATE sessions SET flights_count = 6 WHERE session_uuid = $1', ['sess-1']);

    await commands.rebuildProjections(ADMIN);
    await commands.rebuildProjections(ADMIN, { mode: 'write', reason: 'Wyjaśnione.' });

    const after = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('wypełnia kolumny dołożone migracją 11 w wierszach sprzed migracji', async () => {
    // To jest powód, dla którego przebudowa MUSI wejść razem z migracją 11: `upsert`
    // uruchamia dopiero następna paczka zdarzeń sesji, a dla dnia zamkniętego takiej
    // paczki już nie będzie. Bez przeliczenia kolumna „Operacja" na liście dni byłaby
    // pusta dla całej historii.
    const { db, commands } = await withDay();
    await db.query('UPDATE sessions SET operation = NULL, client = NULL');

    const dry = await commands.rebuildProjections(ADMIN);
    expect(dry.ok && dry.report.diffs[0]!.fields).toEqual([
      { field: 'operation', stored: null, computed: 'skoki' },
      { field: 'client', stored: null, computed: 'SKY CAMP' },
    ]);

    await commands.rebuildProjections(ADMIN, { mode: 'write', reason: 'Migracja 11.' });
    expect(await projectionOf(db)).toMatchObject({ operation: 'skoki', client: 'SKY CAMP' });
  });
});
