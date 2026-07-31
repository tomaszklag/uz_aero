/**
 * UZ Aero (serwer) — `npm run seed`: migracje + dane scenariusza.
 *
 * `SEED_PASSWORD` jest wymagane jawnie — seed z domyślnym hasłem zaszytym w kodzie
 * prędzej czy później trafiłby na serwer, na którym nikt go nie zmienił.
 */

import { Pool } from 'pg';
import { z } from 'zod';

import { ScryptHasher } from '../auth/scryptHasher.ts';
import { migrate } from './migrate.ts';
import { seed } from './seed.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SEED_PASSWORD: z.string().min(8, 'SEED_PASSWORD: minimum 8 znaków'),
  })
  .parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL });

await migrate(pool);
await seed(pool, new ScryptHasher(), { defaultPassword: env.SEED_PASSWORD });
await pool.end();

console.log('Seed OK: 4 samoloty, 5 pilotów (hasło z SEED_PASSWORD).');
