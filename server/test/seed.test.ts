/**
 * Ninerdeck (serwer) - produkcyjny seed po issue #50, po wejściu Google (2026-09-04)
 * i po wielofirmowości (issue #98).
 *
 * Seed przestał być danymi scenariusza (te mieszkają w `test/testWorld.ts`) i został
 * bootstrapem wdrożenia, więc testujemy go w roli, w której będzie użyty: świeża baza,
 * `migrate` + `seed`, a potem PODPIĘCIE konta Google po e-mailu - bo to jest cały
 * mechanizm wejścia do panelu (`docs/logowanie-google.md` §6).
 *
 * Od wielofirmowości konto z seeda jest SUPERADMINISTRATOREM bez klubu
 * (`docs/wielofirmowosc.md` §3.3): kluby zakłada w module Organizacje, a nie dostaje
 * żadnego z góry - świeża baza ma zero klubów i zero członkostw.
 *
 * Osobno powtórny bieg: na żywej bazie seed bywa odpalany „na wszelki wypadek" i nie
 * wolno mu wtedy ani dorobić drugiego konta, ani zerwać istniejącego podpięcia.
 */

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import type { Database, Queryable } from '../src/application/common/ports.ts';
import { platformCan } from '../src/domain/roles.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { seed } from '../src/infrastructure/pg/seed.ts';
import { PgExternalIdentitiesRepo } from '../src/infrastructure/pg/common/externalIdentitiesRepo.ts';
import { PgPilotsRepo } from '../src/infrastructure/pg/common/pilotsRepo.ts';

const ADMIN_EMAIL = 'szef@aeroklub.pl';

const googleProfile = (email: string, subject = 'google-sub-admin') => ({
  provider: 'google',
  subject,
  email,
  emailVerified: true,
  name: 'Szef Klubu',
});

async function freshDb() {
  const pglite = new PGlite();
  const db: Database & { exec: (sql: string) => Promise<unknown> } = {
    query: (text, params) => pglite.query(text, params as never) as never,
    exec: (sql) => pglite.exec(sql),
    transaction: (fn) => pglite.transaction((tx) => fn(tx as unknown as Queryable)) as never,
  };
  await migrate(db);
  return db;
}

const count = async (db: Queryable, table: string): Promise<number> => {
  // `Number(...)`, bo node-pg oddaje count jako napis, a PGlite jako liczbę.
  const { rows } = await db.query<{ count: unknown }>(`SELECT count(*) AS count FROM ${table}`);
  return Number(rows[0]?.count);
};

describe('seed (bootstrap wdrożenia)', () => {
  it('świeża baza: jedna OSOBA `admin` z rolą platformową, zero klubów, zero członkostw, zero samolotów', async () => {
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    expect(await count(db, 'pilots')).toBe(1);
    expect(await count(db, 'organizations')).toBe(0);
    expect(await count(db, 'memberships')).toBe(0);
    expect(await count(db, 'aircraft')).toBe(0);

    const repo = new PgPilotsRepo(db);
    const account = await repo.findById('admin');
    expect(account?.platformRole).toBe('superadmin');
    expect(account?.active).toBe(true);
    expect(account?.email).toBe(ADMIN_EMAIL);
    expect(platformCan(account!.platformRole, 'platform.manage')).toBe(true);
    // Superadministrator nie ma kodu ani klubu - kod jest własnością członkostwa.
    expect(await repo.memberships('admin')).toEqual([]);
  });

  it('konto założone seedem NIE MA hasła ani kodu - kolumn nie ma w tabeli osób', async () => {
    // Seed pisał tu kiedyś `password_hash = NULL`; od migracji 7 kolumny nie ma wcale,
    // a od migracji 8 nie ma też `code` i `role` (przeszły na członkostwa). Jedyne,
    // co da się sprawdzić, to że seed na takim schemacie w ogóle wchodzi i że nic nie
    // próbuje tych kolumn przywrócić.
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pilots' AND column_name IN ('password_hash', 'code', 'role')`,
    );
    expect(rows).toEqual([]);
  });

  it('PIERWSZE logowanie kontem Google o tym e-mailu przejmuje konto superadministratora', async () => {
    // To jest CAŁY bootstrap dostępu do panelu i dlatego ma własny przypadek:
    // bez tego kroku po wdrożeniu nie ma kto założyć pierwszego klubu.
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const identities = new PgExternalIdentitiesRepo(db);
    const linked = await identities.claimByVerifiedEmail(googleProfile(ADMIN_EMAIL));

    expect(linked?.pilotId).toBe('admin');
  });

  it('e-mail SPOZA konta nie przejmuje niczego - logowanie zakłada wtedy NOWĄ osobę bez klubu', async () => {
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const identities = new PgExternalIdentitiesRepo(db);
    expect(await identities.claimByVerifiedEmail(googleProfile('ktos.inny@gmail.com'))).toBeNull();
  });

  it('konto JUŻ PODPIĘTE nie da się przejąć drugim kontem Google', async () => {
    // Bez tego warunku ktokolwiek, kto ustawi sobie ten sam adres, przejąłby konto
    // superadministratora - a `pilots.email` bywa zmieniany w panelu.
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const identities = new PgExternalIdentitiesRepo(db);
    await identities.claimByVerifiedEmail(googleProfile(ADMIN_EMAIL, 'pierwszy-sub'));

    expect(
      await identities.claimByVerifiedEmail(googleProfile(ADMIN_EMAIL, 'drugi-sub')),
    ).toBeNull();
  });

  it('powtórny bieg nie dokłada drugiego konta i nie zrywa podpięcia', async () => {
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const identities = new PgExternalIdentitiesRepo(db);
    await identities.claimByVerifiedEmail(googleProfile(ADMIN_EMAIL));

    await seed(db, { adminEmail: ADMIN_EMAIL });

    expect(await count(db, 'pilots')).toBe(1);
    expect((await identities.find('google', 'google-sub-admin'))?.pilotId).toBe('admin');
  });

  it('powtórny bieg przywraca rolę platformową - jedyna droga awaryjna serwera bez superadministratora', async () => {
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });
    await db.query(`UPDATE pilots SET platform_role = NULL, active = FALSE WHERE id = 'admin'`);

    await seed(db, { adminEmail: ADMIN_EMAIL });
    const account = await new PgPilotsRepo(db).findById('admin');
    expect(account?.platformRole).toBe('superadmin');
    expect(account?.active).toBe(true);
  });
});
