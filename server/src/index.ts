/**
 * UZ Aero (serwer) — composition root.
 *
 * Jedyne miejsce, które zna WSZYSTKIE konkrety naraz: config z env, pulę Postgresa,
 * adaptery i złożenie ich w komendy/zapytania. Reszta kodu dostaje zależności
 * konstruktorem — dokładnie jak `bootstrap/` w aplikacji mobilnej.
 */

import { Pool } from 'pg';
import { z } from 'zod';

import { AuthCommands } from './application/commands/auth.ts';
import { IngestCommands } from './application/commands/ingest.ts';
import { ReferenceQueries } from './application/queries/reference.ts';
import { StateQueries } from './application/queries/aircraftState.ts';
import { Hs256Tokens } from './infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from './infrastructure/auth/scryptHasher.ts';
import { PgDatabase } from './infrastructure/pg/database.ts';
import { PgEventsStore } from './infrastructure/pg/eventsStore.ts';
import { PgFlagsRepo } from './infrastructure/pg/flagsRepo.ts';
import { PgSessionsProjection } from './infrastructure/pg/sessionsProjection.ts';
import { migrate } from './infrastructure/pg/migrate.ts';
import { PgPilotsRepo } from './infrastructure/pg/pilotsRepo.ts';
import { PgRefreshTokens } from './infrastructure/pg/refreshTokensRepo.ts';
import { PgReferenceRepo } from './infrastructure/pg/referenceRepo.ts';
import { buildServer } from './http/server.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .parse(process.env);

const clock = { now: () => new Date() };
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = new PgDatabase(pool);

await migrate(db);

const tokens = new Hs256Tokens(env.JWT_SECRET, clock);
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
  reference: new ReferenceQueries(new PgReferenceRepo(db)),
  ingest: new IngestCommands(db, events, sessions, flags),
  state: new StateQueries(db, events, sessions, flags),
  tokens,
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`UZ Aero server: http://localhost:${env.PORT}`);
