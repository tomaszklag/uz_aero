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
 *
 * ══ `npm run seed -- --reset-link <email>` - DROGA AWARYJNA DO HASŁA (2.1.0, §5.4) ══
 * Gdy Google I poczta padły, operator z konsolą serwera wydaje link „ustaw hasło"
 * (72 h, `triggered_by: 'cli'`) i dostaje go NA STDOUT zamiast w liście - to jedyne
 * miejsce poza adapterem `log`, w którym token opuszcza serwer inaczej niż pocztą
 * (§8 pkt 4). Kto ma konsolę Railway, ma i tak dostęp do bazy, więc ta droga nic nie
 * dokłada do jego władzy. Adres linku składa się z `PUBLIC_BASE_URL` jak w serwerze;
 * bez zmiennej - `http://localhost:3000`. Osoba bez wiersza w `pilots` → błąd i wyjście 1.
 * Konta superadministratora seed w tym trybie NIE zakłada (samo `--reset-link`).
 */

import { Pool } from 'pg';
import { z } from 'zod';

import { INVITE_LINK_TTL_MS } from '../application/common/commands/passwords.ts';
import { ORG_SLUG_PATTERN } from '../domain/organizations.ts';
import { BaseUrlPasswordLinks } from '../infrastructure/auth/resetLinks.ts';
import { PgDatabase } from '../infrastructure/pg/database.ts';
import { migrate } from '../infrastructure/pg/migrate.ts';
import { PgPasswordResetTokensRepo } from '../infrastructure/pg/common/passwordResetTokensRepo.ts';
import { PgPilotsRepo } from '../infrastructure/pg/common/pilotsRepo.ts';
import { seed } from '../infrastructure/pg/seed.ts';

const resetLinkFor = resetLinkArg(process.argv.slice(2));

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SEED_ADMIN_EMAIL:
      resetLinkFor == null
        ? z.string().email('SEED_ADMIN_EMAIL: potrzebny adres e-mail konta Google')
        : z.string().email().optional(),
    SEED_ORG_NAME: z.string().trim().min(1).optional(),
    SEED_ORG_SLUG: z.string().regex(ORG_SLUG_PATTERN, 'SEED_ORG_SLUG: małe litery, cyfry i myślniki').optional(),
    PUBLIC_BASE_URL: z.string().url().optional(),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL });

await migrate(pool, undefined, {
  seedOrg:
    env.SEED_ORG_NAME != null && env.SEED_ORG_SLUG != null
      ? { name: env.SEED_ORG_NAME, slug: env.SEED_ORG_SLUG }
      : null,
});

if (resetLinkFor != null) {
  const db = new PgDatabase(pool);
  const account = await new PgPilotsRepo(db).findByEmail(resetLinkFor);
  if (account?.email == null) {
    console.error(`Brak osoby z adresem ${resetLinkFor} - link nie ma dla kogo powstać.`);
    await pool.end();
    process.exit(1);
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_LINK_TTL_MS);
  const issued = await db.transaction((tx) =>
    new PgPasswordResetTokensRepo(db).issue(tx, {
      kind: 'reset',
      pilotId: account.id,
      triggeredBy: 'cli',
      createdBy: null,
      now,
      expiresAt,
    }),
  );
  const links = new BaseUrlPasswordLinks(env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`);
  await pool.end();
  console.log(
    [
      `Link „ustaw hasło" dla ${account.name} <${account.email}> (ważny do ${expiresAt.toISOString()}):`,
      '',
      `  ${links.resetUrl(issued.token)}`,
      '',
      'Poprzednie niezużyte linki tej osoby przestały działać. Przekaż adres bezpiecznym kanałem;',
      'po ustawieniu hasła wszystkie dotychczasowe sesje tej osoby zostaną wylogowane.',
    ].join('\n'),
  );
} else {
  await seed(pool, { adminEmail: env.SEED_ADMIN_EMAIL! });
  await pool.end();
  console.log(
    `Seed OK: konto superadministratora „admin" czeka na podpięcie konta Google ${env.SEED_ADMIN_EMAIL}.`,
  );
}

/** `--reset-link <email>` albo `--reset-link=<email>`; brak flagi = zwykły seed. */
function resetLinkArg(argv: readonly string[]): string | null {
  const index = argv.indexOf('--reset-link');
  if (index >= 0) {
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      console.error('Użycie: npm run seed -- --reset-link <email>');
      process.exit(2);
    }
    return value;
  }
  const inline = argv.find((arg) => arg.startsWith('--reset-link='));
  return inline == null ? null : inline.slice('--reset-link='.length);
}
