/**
 * UZ Aero (serwer) - produkcyjny seed po issue #50 i po wejściu Google (2026-09-04).
 *
 * Seed przestał być danymi scenariusza (te mieszkają w `test/testWorld.ts`) i został
 * bootstrapem wdrożenia, więc testujemy go w roli, w której będzie użyty: świeża baza,
 * `migrate` + `seed`, a potem PODPIĘCIE konta Google po e-mailu - bo to jest cały
 * mechanizm wejścia administratora do panelu (`docs/logowanie-google.md` §6).
 *
 * Osobno powtórny bieg: na żywej bazie seed bywa odpalany „na wszelki wypadek" i nie
 * wolno mu wtedy ani dorobić drugiego konta, ani zerwać istniejącego podpięcia.
 */

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import type { Database, Queryable } from '../src/application/common/ports.ts';
import { can } from '../src/domain/roles.ts';
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

describe('seed (bootstrap wdrożenia)', () => {
  it('świeża baza: jedno konto `admin` z rolą admin i dostępem do panelu, zero samolotów', async () => {
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    // `Number(...)`, bo node-pg oddaje count jako napis, a PGlite jako liczbę.
    const pilots = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(pilots.rows[0]?.count)).toBe(1);
    const aircraft = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM aircraft');
    expect(Number(aircraft.rows[0]?.count)).toBe(0);

    const account = await new PgPilotsRepo(db).findById('admin');
    expect(account?.role).toBe('admin');
    expect(account?.active).toBe(true);
    expect(account?.email).toBe(ADMIN_EMAIL);
    expect(can(account!.role, 'panel.access')).toBe(true);
  });

  it('konto założone seedem NIE MA hasła - hasła zniknęły z produktu razem z kolumną', async () => {
    // Seed pisał tu kiedyś `password_hash = NULL`; od migracji 7 kolumny nie ma wcale,
    // więc jedyne, co da się sprawdzić, to że seed na takim schemacie w ogóle wchodzi
    // i że nic nie próbuje tej kolumny przywrócić.
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pilots' AND column_name = 'password_hash'`,
    );
    expect(rows).toEqual([]);
  });

  it('PIERWSZE logowanie kontem Google o tym e-mailu przejmuje konto admina', async () => {
    // To jest CAŁY bootstrap dostępu do panelu i dlatego ma własny przypadek:
    // bez tego kroku po wdrożeniu nie ma kto zatwierdzić pierwszego zgłoszenia.
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const identities = new PgExternalIdentitiesRepo(db);
    const linked = await identities.claimByVerifiedEmail(googleProfile(ADMIN_EMAIL));

    expect(linked?.status).toBe('linked');
    expect(linked?.pilotId).toBe('admin');
  });

  it('e-mail SPOZA konta nie przejmuje niczego - dostaje zgłoszenie do zatwierdzenia', async () => {
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });

    const identities = new PgExternalIdentitiesRepo(db);
    expect(await identities.claimByVerifiedEmail(googleProfile('ktos.inny@gmail.com'))).toBeNull();
  });

  it('konto JUŻ PODPIĘTE nie da się przejąć drugim kontem Google', async () => {
    // Bez tego warunku ktokolwiek, kto ustawi sobie ten sam adres, przejąłby konto
    // administratora - a `pilots.email` bywa zmieniany w panelu.
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

    const pilots = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(pilots.rows[0]?.count)).toBe(1);
    expect((await identities.find('google', 'google-sub-admin'))?.pilotId).toBe('admin');
  });

  it('powtórny bieg przywraca rolę admin - jedyna droga awaryjna klubu bez administratora', async () => {
    const db = await freshDb();
    await seed(db, { adminEmail: ADMIN_EMAIL });
    await db.query(`UPDATE pilots SET role = 'pilot' WHERE id = 'admin'`);

    await seed(db, { adminEmail: ADMIN_EMAIL });
    expect((await new PgPilotsRepo(db).findById('admin'))?.role).toBe('admin');
  });
});
