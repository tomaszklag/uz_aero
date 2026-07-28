/**
 * UZ Aero (serwer) — aplikowanie migracji.
 *
 * `schema_migrations` trzyma numer ostatniej zastosowanej — ten sam mechanizm co
 * `PRAGMA user_version` w aplikacji, tylko tabelą, bo Postgres nie ma pragm.
 * Runner jest idempotentny: wołanie na aktualnej bazie nic nie robi.
 */

import type { Queryable } from '../../application/ports.ts';
import { MIGRATIONS } from './schema.ts';

/**
 * Migracja to jedyne miejsce z SQL-em WIELOPOLECENIOWYM. `pg` wykonuje go zwykłym
 * `query` (simple protocol), ale PGlite w `query` używa extended protocol (prepared
 * statement), który przyjmuje dokładnie jedno polecenie — i wywala się na średniku.
 * PGlite ma od tego `exec`; używamy go, gdy jest.
 */
async function runScript(db: Queryable, sql: string): Promise<void> {
  const maybeExec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof maybeExec === 'function') {
    await maybeExec.call(db, sql);
  } else {
    await db.query(sql);
  }
}

export async function migrate(db: Queryable): Promise<void> {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );

  const { rows } = await db.query<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );
  const current = Number(rows[0]?.version ?? 0);

  for (let v = current; v < MIGRATIONS.length; v += 1) {
    await runScript(db, MIGRATIONS[v]!);
    await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [v + 1]);
  }
}
