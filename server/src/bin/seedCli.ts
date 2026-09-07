/**
 * UZ Aero (serwer) - `npm run seed`: migracje + konto administratora.
 *
 * `SEED_ADMIN_EMAIL` jest wymagane jawnie i jest to ADRES KONTA GOOGLE, którym
 * administrator się zaloguje: pierwsze logowanie tym kontem podpina je do wiersza
 * `admin` (`docs/logowanie-google.md` §6). Bez tej zmiennej nie ma jak wejść do panelu,
 * więc seed z wartością domyślną byłby obietnicą bez pokrycia.
 */

import { Pool } from 'pg';
import { z } from 'zod';

import { migrate } from '../infrastructure/pg/migrate.ts';
import { seed } from '../infrastructure/pg/seed.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SEED_ADMIN_EMAIL: z.string().email('SEED_ADMIN_EMAIL: potrzebny adres e-mail konta Google'),
  })
  .parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL });

await migrate(pool);
await seed(pool, { adminEmail: env.SEED_ADMIN_EMAIL });
await pool.end();

console.log(
  `Seed OK: konto administratora „admin" czeka na podpięcie konta Google ${env.SEED_ADMIN_EMAIL}.`,
);
