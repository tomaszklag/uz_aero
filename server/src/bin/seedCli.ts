/**
 * Ninerdeck (serwer) - `npm run seed`: migracje + konto superadministratora.
 *
 * `SEED_ADMIN_EMAIL` jest wymagane jawnie i jest to ADRES KONTA GOOGLE, którym
 * superadministrator się zaloguje: pierwsze logowanie tym kontem podpina je do wiersza
 * `admin` (`docs/logowanie-google.md` §6). Bez tej zmiennej nie ma jak wejść do panelu,
 * więc seed z wartością domyślną byłby obietnicą bez pokrycia.
 *
 * `SEED_ORG_NAME` / `SEED_ORG_SLUG` są potrzebne WYŁĄCZNIE migracji 8 na bazie z danymi
 * jednego klubu sprzed wielofirmowości (backfill, `docs/wielofirmowosc.md` §10) - na
 * świeżej bazie nic nie przepisują i wolno je pominąć. Runner odmówi, jeśli baza ma
 * dane, a zmiennych nie ma.
 */

import { Pool } from 'pg';
import { z } from 'zod';

import { ORG_SLUG_PATTERN } from '../domain/organizations.ts';
import { migrate } from '../infrastructure/pg/migrate.ts';
import { seed } from '../infrastructure/pg/seed.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SEED_ADMIN_EMAIL: z.string().email('SEED_ADMIN_EMAIL: potrzebny adres e-mail konta Google'),
    SEED_ORG_NAME: z.string().trim().min(1).optional(),
    SEED_ORG_SLUG: z.string().regex(ORG_SLUG_PATTERN, 'SEED_ORG_SLUG: małe litery, cyfry i myślniki').optional(),
  })
  .parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL });

await migrate(pool, undefined, {
  seedOrg:
    env.SEED_ORG_NAME != null && env.SEED_ORG_SLUG != null
      ? { name: env.SEED_ORG_NAME, slug: env.SEED_ORG_SLUG }
      : null,
});
await seed(pool, { adminEmail: env.SEED_ADMIN_EMAIL });
await pool.end();

console.log(
  `Seed OK: konto superadministratora „admin" czeka na podpięcie konta Google ${env.SEED_ADMIN_EMAIL}.`,
);
