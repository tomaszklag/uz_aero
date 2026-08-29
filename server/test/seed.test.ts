/**
 * UZ Aero (serwer) - produkcyjny seed po issue #50: wyłącznie konto administratora.
 *
 * Seed przestał być danymi scenariusza (te mieszkają w `test/testWorld.ts`) i został
 * bootstrapem wdrożenia, więc testujemy go w roli, w której będzie użyty: świeża baza,
 * `migrate` + `seed`, logowanie loginem `admin`, wejście do panelu. Osobno powtórny
 * bieg - na żywej bazie seed bywa odpalany „na wszelki wypadek" i nie wolno mu wtedy
 * ani zresetować hasła, ani dorobić drugiego konta.
 */

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import type { Database, Queryable } from '../src/application/common/ports.ts';
import { can } from '../src/domain/roles.ts';
import { ScryptHasher } from '../src/infrastructure/auth/scryptHasher.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { seed } from '../src/infrastructure/pg/seed.ts';
import { PgPilotsRepo } from '../src/infrastructure/pg/common/pilotsRepo.ts';

const PASSWORD = 'haslo-administratora-1';

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
    const hasher = new ScryptHasher();
    await seed(db, hasher, { adminPassword: PASSWORD });

    // `Number(...)`, bo node-pg oddaje count jako napis, a PGlite jako liczbę.
    const pilots = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(pilots.rows[0]?.count)).toBe(1);
    const aircraft = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM aircraft');
    expect(Number(aircraft.rows[0]?.count)).toBe(0);

    // Logowanie tak, jak zrobi to trasa: po kodzie, bez rozróżniania wielkości liter.
    const account = await new PgPilotsRepo(db).findByLogin('ADMIN');
    expect(account).not.toBeNull();
    expect(account?.role).toBe('admin');
    expect(account?.active).toBe(true);
    expect(await hasher.verify(PASSWORD, account!.passwordHash)).toBe(true);
    expect(can(account!.role, 'panel.access')).toBe(true);
  });

  it('powtórny bieg nie resetuje hasła i nie dokłada drugiego konta', async () => {
    const db = await freshDb();
    const hasher = new ScryptHasher();
    await seed(db, hasher, { adminPassword: PASSWORD });
    await seed(db, hasher, { adminPassword: 'inne-haslo-po-zmianie' });

    const pilots = await db.query<{ count: unknown }>('SELECT count(*) AS count FROM pilots');
    expect(Number(pilots.rows[0]?.count)).toBe(1);
    // Obowiązuje hasło z PIERWSZEGO biegu - zmiana hasła to panel, nie seed.
    const account = await new PgPilotsRepo(db).findByLogin('admin');
    expect(await hasher.verify(PASSWORD, account!.passwordHash)).toBe(true);
  });

  it('powtórny bieg przywraca rolę admin - jedyna droga awaryjna klubu bez administratora', async () => {
    const db = await freshDb();
    const hasher = new ScryptHasher();
    await seed(db, hasher, { adminPassword: PASSWORD });
    await db.query(`UPDATE pilots SET role = 'pilot' WHERE id = 'admin'`);

    await seed(db, hasher, { adminPassword: PASSWORD });
    const account = await new PgPilotsRepo(db).findByLogin('admin');
    expect(account?.role).toBe('admin');
  });
});
