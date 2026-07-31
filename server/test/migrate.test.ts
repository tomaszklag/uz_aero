/**
 * UZ Aero (serwer) — runner migracji: TRANSAKCYJNOŚĆ (naprawa 2026-07-31).
 *
 * Testujemy jedną właściwość, ale najważniejszą: **częściowa migracja jest niemożliwa**.
 * Wcześniej skrypt i wpis do `schema_migrations` szły osobno, więc śmierć procesu między
 * nimi zostawiała bazę zmigrowaną i nieodnotowaną — a ponowny start puszczał ten sam
 * skrypt drugi raz i wywracał się na migracji bez `IF NOT EXISTS` (3 i 6), blokując
 * wstanie serwera.
 *
 * Symulacja awarii jest tu prawdziwa, nie zamarkowana: podajemy migrację z błędnym SQL-em
 * i sprawdzamy stan bazy PO niej. Silnik jest prawdziwy (PGlite = Postgres w WASM),
 * więc semantyka transakcji jest ta sama co na produkcji.
 */

import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

import { migrate } from '../src/infrastructure/pg/migrate.ts';
import type { Queryable } from '../src/application/ports.ts';

function freshDb(): Queryable {
  const pglite = new PGlite();
  return {
    query: (text: string, params?: unknown[]) => pglite.query(text, params as never) as never,
    exec: (sql: string) => pglite.exec(sql),
  } as unknown as Queryable;
}

async function appliedVersions(db: Queryable): Promise<number[]> {
  const { rows } = await db.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  return rows.map((r) => Number(r.version));
}

async function tableExists(db: Queryable, name: string): Promise<boolean> {
  const { rows } = await db.query<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [name],
  );
  return rows[0]?.present === true;
}

describe('runner migracji', () => {
  it('odnotowuje każdą zastosowaną migrację po kolei', async () => {
    const db = freshDb();
    await migrate(db, [
      'CREATE TABLE pierwsza (id INTEGER PRIMARY KEY);',
      'CREATE TABLE druga (id INTEGER PRIMARY KEY);',
    ]);

    expect(await appliedVersions(db)).toEqual([1, 2]);
    expect(await tableExists(db, 'pierwsza')).toBe(true);
    expect(await tableExists(db, 'druga')).toBe(true);
  });

  it('nie robi nic, gdy baza jest aktualna (idempotencja)', async () => {
    const db = freshDb();
    const scripts = ['CREATE TABLE pierwsza (id INTEGER PRIMARY KEY);'];

    await migrate(db, scripts);
    // Drugi bieg na tej samej liście MUSI przejść — gdyby runner powtórzył skrypt,
    // `CREATE TABLE` bez `IF NOT EXISTS` rzuciłby błędem.
    await migrate(db, scripts);

    expect(await appliedVersions(db)).toEqual([1]);
  });

  it('NIEUDANA migracja nie zostawia ani wpisu, ani skutków DDL', async () => {
    const db = freshDb();

    await expect(
      migrate(db, [
        'CREATE TABLE pierwsza (id INTEGER PRIMARY KEY);',
        // Poprawny `CREATE TABLE`, po nim polecenie, które MUSI się wywrócić.
        // Gdyby transakcji nie było, `druga` zostałaby w bazie jako sierota.
        'CREATE TABLE druga (id INTEGER PRIMARY KEY); SELECT kolumna_ktorej_nie_ma;',
      ]),
    ).rejects.toThrow();

    // Pierwsza migracja zdążyła się domknąć własną transakcją — i ma zostać.
    expect(await appliedVersions(db)).toEqual([1]);
    expect(await tableExists(db, 'pierwsza')).toBe(true);
    // Druga: ani śladu. To jest cała istota naprawy.
    expect(await tableExists(db, 'druga')).toBe(false);
  });

  it('po nieudanej migracji kolejny bieg stosuje poprawioną wersję', async () => {
    const db = freshDb();
    const zepsuta = 'CREATE TABLE druga (id INTEGER PRIMARY KEY); SELECT kolumna_ktorej_nie_ma;';
    const poprawiona = 'CREATE TABLE druga (id INTEGER PRIMARY KEY);';

    await expect(
      migrate(db, ['CREATE TABLE pierwsza (id INTEGER PRIMARY KEY);', zepsuta]),
    ).rejects.toThrow();

    // Naprawiony skrypt wchodzi bez sprzątania ręką — baza stoi dokładnie tam,
    // gdzie była przed nieudaną próbą.
    await migrate(db, ['CREATE TABLE pierwsza (id INTEGER PRIMARY KEY);', poprawiona]);

    expect(await appliedVersions(db)).toEqual([1, 2]);
    expect(await tableExists(db, 'druga')).toBe(true);
  });
});
