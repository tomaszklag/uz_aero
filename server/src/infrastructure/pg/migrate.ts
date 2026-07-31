/**
 * UZ Aero (serwer) — aplikowanie migracji.
 *
 * `schema_migrations` trzyma numer ostatniej zastosowanej — ten sam mechanizm co
 * `PRAGMA user_version` w aplikacji, tylko tabelą, bo Postgres nie ma pragm.
 * Runner jest idempotentny: wołanie na aktualnej bazie nic nie robi.
 *
 * ── Transakcyjność (naprawa 2026-07-31) ──────────────────────────────────────
 * Skrypt migracji i wpis o jej zastosowaniu idą JEDNĄ transakcją. Wcześniej były to
 * dwa osobne polecenia i między nimi istniała szczelina: śmierć procesu (restart
 * kontenera, deploy, OOM) zostawiała bazę ZMIGROWANĄ, ale NIEODNOTOWANĄ, więc przy
 * następnym starcie runner puszczał ten sam skrypt drugi raz. Migracje oparte na
 * `CREATE TABLE IF NOT EXISTS` to przeżywały, ale migracja 3 (`ADD CONSTRAINT`)
 * i 6 (`ADD COLUMN`) nie mają takiego zabezpieczenia — powtórka kończyła się błędem
 * i serwer NIE WSTAWAŁ, aż ktoś ręcznie poprawił bazę.
 *
 * Teraz albo dzieje się jedno i drugie, albo nic: przerwany proces zostawia stan
 * sprzed migracji, a ponowny start po prostu ją powtarza. To zdejmuje też presję
 * pisania każdej migracji idempotentnie — `ADD CONSTRAINT`, którego nie da się
 * sensownie ubrać w `IF NOT EXISTS`, przestaje być pułapką.
 */

import type { Queryable } from '../../application/common/ports.ts';
import { MIGRATIONS } from './schema.ts';

/**
 * Migracja to jedyne miejsce z SQL-em WIELOPOLECENIOWYM. `pg` wykonuje go zwykłym
 * `query` (simple protocol), ale PGlite w `query` używa extended protocol (prepared
 * statement), który przyjmuje dokładnie jedno polecenie — i wywala się na średniku.
 * PGlite ma od tego `exec`; używamy go, gdy jest.
 *
 * Ta sama właściwość wymusza kształt transakcji niżej: skoro całość i tak jedzie
 * jednym łańcuchem, `BEGIN`/`COMMIT` piszemy w SQL-u, a nie przez `db.transaction()`
 * — port `Queryable` transakcji nie ma, a obiekt transakcji PGlite nie ma `exec`.
 */
async function runScript(db: Queryable, sql: string): Promise<void> {
  const maybeExec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof maybeExec === 'function') {
    await maybeExec.call(db, sql);
  } else {
    await db.query(sql);
  }
}

/**
 * `migrations` jest parametrem wyłącznie po to, żeby dało się przetestować zachowanie
 * przy NIEUDANEJ migracji — produkcja woła `migrate(db)` i dostaje `MIGRATIONS`.
 */
export async function migrate(
  db: Queryable,
  migrations: readonly string[] = MIGRATIONS,
): Promise<void> {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );

  const { rows } = await db.query<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );
  const current = Number(rows[0]?.version ?? 0);

  for (let v = current; v < migrations.length; v += 1) {
    // Numer wersji wstawiamy do SQL-a dosłownie, bo polecenie wieloczłonowe nie
    // przyjmuje parametrów. Bezpieczne: to licznik pętli po tablicy modułu,
    // nigdy wartość z zewnątrz.
    const version = v + 1;
    try {
      await runScript(
        db,
        `BEGIN;
${migrations[v]!}
INSERT INTO schema_migrations (version) VALUES (${version});
COMMIT;`,
      );
    } catch (err) {
      // Jawne `BEGIN` znaczy, że po błędzie transakcja ZOSTAJE OTWARTA w stanie
      // aborted — `COMMIT` z końca łańcucha już się nie wykonał. Każde następne
      // polecenie na tym połączeniu dostałoby wtedy „current transaction is aborted",
      // czyli awaria jednej migracji zatruwałaby połączenie na resztę jego życia.
      // Sprzątamy jawnie; błąd samego ROLLBACK-u tłumimy, bo to już tylko sprzątanie
      // po prawdziwej przyczynie, którą rzucamy dalej nietkniętą.
      await runScript(db, 'ROLLBACK;').catch(() => undefined);
      throw err;
    }
  }
}
