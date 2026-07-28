/**
 * UZ Aero (serwer) — test KONTRAKTU SCHEMATU na prawdziwym Postgresie (PGlite).
 *
 * Lustro `sqliteSchema.test.ts` z aplikacji i domknięcie tej samej luki: kolumny DDL
 * ↔ interfejsy wierszy ↔ mapowanie to trzy miejsca, które muszą się zgadzać, a literówka
 * w nazwie kolumny nie jest błędem typów — tylko `undefined` w runtime. Listy kolumn
 * są tu przybite na sztywno; zmiana schematu bez zmiany testu ma NIE przejść.
 */

import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

import { MIGRATIONS, SCHEMA_VERSION } from '../src/infrastructure/pg/schema.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import type { Queryable } from '../src/application/ports.ts';

async function migrated(): Promise<Queryable & { exec(sql: string): Promise<unknown> }> {
  const pglite = new PGlite();
  const db = {
    query: (text: string, params?: unknown[]) => pglite.query(text, params as never) as never,
    exec: (sql: string) => pglite.exec(sql),
  };
  await migrate(db as Queryable);
  return db as never;
}

async function columnsOf(db: Queryable, table: string): Promise<string[]> {
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

describe('schemat PostgreSQL (kontrakt)', () => {
  it('SCHEMA_VERSION zgadza się z liczbą migracji', () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('migracje są idempotentne — ponowne wołanie niczego nie psuje', async () => {
    const db = await migrated();
    await expect(migrate(db as Queryable)).resolves.toBeUndefined();
  });

  it.each([
    [
      'pilots',
      ['id', 'code', 'name', 'email', 'password_hash', 'active', 'updated_at'],
    ],
    [
      'aircraft',
      ['id', 'reg', 'type', 'year', 'capacity_l', 'mh_format', 'dual_required', 'service_status', 'updated_at'],
    ],
    ['refresh_tokens', ['token_hash', 'pilot_id', 'expires_at', 'created_at']],
    [
      'events',
      ['uuid', 'session_uuid', 'aircraft_id', 'pic_id', 'dual_id', 'type', 'device_time', 'gps_time', 'payload', 'schema_version', 'received_at', 'source_device'],
    ],
    [
      'sessions',
      ['session_uuid', 'aircraft_id', 'pic_id', 'dual_id', 'status', 'claim_time', 'close_time', 'mh_start', 'mh_end', 'fuel_start_l', 'fuel_end_l', 'fuel_last_l', 'mh_last', 'block_ms', 'flight_ms', 'flights_count', 'updated_at'],
    ],
    [
      'flags',
      ['id', 'type', 'aircraft_id', 'session_uuids', 'details', 'status', 'created_at', 'resolved_at'],
    ],
    [
      'export_log',
      ['id', 'session_uuid', 'day', 'aircraft_id', 'sheet_url', 'revision', 'exported_at'],
    ],
    ['exported_sheets', ['tab', 'rows', 'updated_at']],
  ])('tabela %s ma dokładnie uzgodnione kolumny', async (table, expected) => {
    const db = await migrated();
    expect(await columnsOf(db, table as string)).toEqual(expected);
  });
});
