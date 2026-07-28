/**
 * UZ Aero (serwer) — wspólny zestaw testowy: PGlite + prawdziwe warstwy.
 *
 * PGlite to Postgres skompilowany do WASM, działający W PROCESIE testu — ten sam trik,
 * co `node:sqlite` w aplikacji: prawdziwy silnik (parser, planner, JSONB), zero Dockera
 * i zero atrap. Testy składają serwer z TYCH SAMYCH klas co produkcja; podmieniamy
 * wyłącznie bazę i zegar.
 *
 * Zegar jest sterowany ręcznie — bez tego testy wygasania tokenów musiałyby spać.
 */

import { PGlite } from '@electric-sql/pglite';

import type { Clock, Database, Queryable } from '../src/application/ports.ts';
import { AuthCommands } from '../src/application/commands/auth.ts';
import { IngestCommands } from '../src/application/commands/ingest.ts';
import { ReferenceQueries } from '../src/application/queries/reference.ts';
import { StateQueries } from '../src/application/queries/aircraftState.ts';
import { Hs256Tokens } from '../src/infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from '../src/infrastructure/auth/scryptHasher.ts';
import { PgEventsStore } from '../src/infrastructure/pg/eventsStore.ts';
import { PgFlagsRepo } from '../src/infrastructure/pg/flagsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/sessionsProjection.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { PgPilotsRepo } from '../src/infrastructure/pg/pilotsRepo.ts';
import { PgRefreshTokens } from '../src/infrastructure/pg/refreshTokensRepo.ts';
import { PgReferenceRepo } from '../src/infrastructure/pg/referenceRepo.ts';
import { seed } from '../src/infrastructure/pg/seed.ts';
import { buildServer } from '../src/http/server.ts';

export class TestClock implements Clock {
  constructor(private current = Date.UTC(2026, 5, 22, 8, 0, 0)) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

export const TEST_SECRET = 'test-secret-o-dlugosci-co-najmniej-32-znakow';
export const TEST_PASSWORD = 'poprawne-haslo-testowe';

export async function testHarness() {
  const pglite = new PGlite();
  // PGlite spełnia `Queryable` wprost, a transakcje ma własne (`transaction(cb)` daje
  // obiekt z `query`) — opakowanie dopasowuje tylko kształt do portu `Database`.
  const db: Database & { exec: (sql: string) => Promise<unknown> } = {
    query: (text, params) => pglite.query(text, params as never) as never,
    // Runner migracji szuka `exec` dla SQL-a wielopoleceniowego (patrz `migrate.ts`).
    exec: (sql) => pglite.exec(sql),
    transaction: (fn) => pglite.transaction((tx) => fn(tx as unknown as Queryable)) as never,
  };
  await migrate(db);
  await seed(db, new ScryptHasher(), { defaultPassword: TEST_PASSWORD });

  const clock = new TestClock();
  const tokens = new Hs256Tokens(TEST_SECRET, clock);
  const events = new PgEventsStore();
  const sessions = new PgSessionsProjection();
  const flags = new PgFlagsRepo();

  const app = buildServer({
    auth: new AuthCommands(
      new PgPilotsRepo(db),
      new PgRefreshTokens(db, clock),
      new ScryptHasher(),
      tokens,
      clock,
    ),
    reference: new ReferenceQueries(new PgReferenceRepo(db), db, sessions),
    ingest: new IngestCommands(db, events, sessions, flags),
    state: new StateQueries(db, events, sessions, flags),
    tokens,
  });

  return { app, db, clock, tokens };
}
