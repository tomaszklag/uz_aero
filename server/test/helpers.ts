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

import type { Clock, Queryable } from '../src/application/ports.ts';
import { AuthCommands } from '../src/application/commands/auth.ts';
import { ReferenceQueries } from '../src/application/queries/reference.ts';
import { Hs256Tokens } from '../src/infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from '../src/infrastructure/auth/scryptHasher.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { PgPilotsRepo, PgRefreshTokens } from '../src/infrastructure/pg/pilotsRepo.ts';
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
  const db: Queryable = new PGlite();
  await migrate(db);
  await seed(db, new ScryptHasher(), { defaultPassword: TEST_PASSWORD });

  const clock = new TestClock();
  const tokens = new Hs256Tokens(TEST_SECRET, clock);
  const app = buildServer({
    auth: new AuthCommands(
      new PgPilotsRepo(db),
      new PgRefreshTokens(db, clock),
      new ScryptHasher(),
      tokens,
      clock,
    ),
    reference: new ReferenceQueries(new PgReferenceRepo(db)),
    tokens,
  });

  return { app, db, clock, tokens };
}
