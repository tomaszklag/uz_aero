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
import { ReferenceQueries } from './application/queries/reference.ts';
import { Hs256Tokens } from './infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from './infrastructure/auth/scryptHasher.ts';
import { migrate } from './infrastructure/pg/migrate.ts';
import { PgPilotsRepo, PgRefreshTokens } from './infrastructure/pg/pilotsRepo.ts';
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

await migrate(pool);

const app = buildServer({
  auth: new AuthCommands(
    new PgPilotsRepo(pool),
    new PgRefreshTokens(pool, clock),
    new ScryptHasher(),
    new Hs256Tokens(env.JWT_SECRET, clock),
    clock,
  ),
  reference: new ReferenceQueries(new PgReferenceRepo(pool)),
  tokens: new Hs256Tokens(env.JWT_SECRET, clock),
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`UZ Aero server: http://localhost:${env.PORT}`);
