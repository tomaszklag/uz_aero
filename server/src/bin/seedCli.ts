/**
 * UZ Aero (serwer) — `npm run seed`: migracje + konto administratora.
 *
 * `SEED_PASSWORD` jest wymagane jawnie — seed z domyślnym hasłem zaszytym w kodzie
 * prędzej czy później trafiłby na serwer, na którym nikt go nie zmienił.
 */

import { Pool } from 'pg';
import { z } from 'zod';

import { ScryptHasher } from '../infrastructure/auth/scryptHasher.ts';
import { migrate } from '../infrastructure/pg/migrate.ts';
import { seed } from '../infrastructure/pg/seed.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SEED_PASSWORD: z.string().min(8, 'SEED_PASSWORD: minimum 8 znaków'),
  })
  .parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL });

await migrate(pool);
await seed(pool, new ScryptHasher(), { adminPassword: env.SEED_PASSWORD });
await pool.end();

console.log('Seed OK: konto administratora „admin" (hasło z SEED_PASSWORD).');
