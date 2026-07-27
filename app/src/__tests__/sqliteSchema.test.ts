/**
 * UZ Aero — test SCHEMATU lokalnej bazy na PRAWDZIWYM silniku SQLite.
 *
 * DLACZEGO ten plik istnieje: DDL był jedyną warstwą bez testów, bo adapter importuje
 * `expo-sqlite` (moduł natywny, niedostępny w Node). Efekt: błąd `no such column: rowid`
 * w `CREATE INDEX` przeszedł przez `tsc` i cały zestaw testów, a wysypał aplikację
 * dopiero przy pierwszym uruchomieniu na telefonie.
 *
 * Rozwiązanie bez nowych zależności: DDL mieszka w `schema.ts` (czysty tekst, zero
 * importów natywnych), a tutaj uruchamiamy go na `node:sqlite` — silniku SQLite
 * wbudowanym w Node 24. Ten sam parser i ten sam planer zapytań co na urządzeniu,
 * więc błędy składni i braki kolumn wychodzą w sekundę.
 *
 * Zakres: schemat i założenia, na których opiera się adapter (§5.2 dokumentacji).
 * Logikę zapisu/odczytu testuje `repo.test.ts` na `InMemoryAdapter`.
 */

import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS, SCHEMA_VERSION } from '../infrastructure/storage/schema';

/** Świeża baza w pamięci z zastosowanymi wszystkimi migracjami — jak po `init()`. */
function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const migration of MIGRATIONS) db.exec(migration);
  return db;
}

/** Nazwy kolumn tabeli w kolejności deklaracji. */
function columnsOf(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

/** Nazwy indeksów założonych jawnie (pomijamy automatyczne `sqlite_autoindex_*`). */
function indexesOf(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA index_list(${table})`).all() as {
    name: string;
    origin: string;
  }[];
  return rows
    .filter((r) => r.origin === 'c') // 'c' = CREATE INDEX, 'pk'/'u' = automatyczne
    .map((r) => r.name)
    .sort();
}

describe('schemat lokalnej bazy (node:sqlite)', () => {
  it('wykonuje się na silniku SQLite bez błędu', () => {
    // Regresja: `CREATE INDEX ... (session_uuid, rowid)` przechodziło review i typecheck,
    // a SQLite odrzuca `rowid` na liście kolumn indeksu. Ten test to wyłapuje.
    expect(() => migratedDb()).not.toThrow();
  });

  it('SCHEMA_VERSION zgadza się z liczbą migracji', () => {
    // `init()` stosuje migracje od `PRAGMA user_version` do `MIGRATIONS.length`, a potem
    // zapisuje `SCHEMA_VERSION`. Rozjazd tych dwóch liczb oznaczałby migrację stosowaną
    // dwa razy albo pominiętą przy kolejnym starcie.
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('jest idempotentny — ponowne zastosowanie migracji niczego nie psuje', () => {
    // Scenariusz z życia: telefon z bazą w wersji 0 (przerwany pierwszy start) dostaje
    // komplet migracji jeszcze raz.
    const db = migratedDb();
    db.prepare(
      `INSERT INTO session_meta (key, value) VALUES ('k', 'v')`,
    ).run();

    expect(() => {
      for (const migration of MIGRATIONS) db.exec(migration);
    }).not.toThrow();

    const row = db.prepare(`SELECT value FROM session_meta WHERE key = 'k'`).get() as
      | { value: string }
      | undefined;
    expect(row?.value).toBe('v'); // CREATE TABLE IF NOT EXISTS nie zdmuchnęło danych
    db.close();
  });

  // Listy kolumn są KONTRAKTEM z interfejsami wierszy w `expoSqliteAdapter.ts`
  // (`EventRow`, `AircraftRow`, `PilotRow`). Adapter mapuje snake_case → camelCase ręcznie,
  // więc literówka w nazwie kolumny nie jest błędem typów — tylko `undefined` w runtime.
  it.each([
    [
      'events',
      [
        'uuid',
        'session_uuid',
        'aircraft_id',
        'pic_id',
        'dual_id',
        'type',
        'device_time',
        'gps_time',
        'payload',
        'schema_version',
        'synced_at',
      ],
    ],
    [
      'reference_aircraft',
      [
        'id',
        'reg',
        'type',
        'year',
        'capacity_l',
        'mh_format',
        'dual_required',
        'service_status',
        'claim_pic',
        'claim_since',
        'handover',
        'fetched_at',
      ],
    ],
    ['reference_pilots', ['id', 'code', 'name', 'active', 'fetched_at']],
    ['session_meta', ['key', 'value']],
  ])('tabela %s ma dokładnie uzgodnione kolumny', (table, expected) => {
    const db = migratedDb();
    expect(columnsOf(db, table as string)).toEqual(expected);
    db.close();
  });

  it('events ma indeksy po sesji i po outboxie', () => {
    const db = migratedDb();
    expect(indexesOf(db, 'events')).toEqual(['idx_events_outbox', 'idx_events_session']);
    db.close();
  });

  it('indeks sesji jest faktycznie używany przez zapytanie adaptera', () => {
    // Sam fakt istnienia indeksu nic nie znaczy, jeśli planer go nie wybiera.
    const db = migratedDb();
    const plan = db
      .prepare('EXPLAIN QUERY PLAN SELECT * FROM events WHERE session_uuid = ? ORDER BY rowid ASC')
      .all() as { detail: string }[];
    expect(plan.map((r) => r.detail).join(' ')).toContain('idx_events_session');
    db.close();
  });

  it('events pozwala sortować po rowid (kolejność wstawienia)', () => {
    // Adapter opiera na tym całą „chronologię": klucz główny jest tekstowy (UUID),
    // więc porządek daje niejawny rowid. Tabela WITHOUT ROWID zabrałaby tę możliwość.
    const db = migratedDb();
    const insert = db.prepare(
      `INSERT INTO events
         (uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
          device_time, gps_time, payload, schema_version, synced_at)
       VALUES (?, ?, 'AC', 'TMK', NULL, ?, ?, NULL, '{}', 1, ?)`,
    );
    insert.run('u-b', 's1', 'engine_start', 2000, null);
    insert.run('u-a', 's1', 'takeoff', 1000, 123);

    const rows = db
      .prepare('SELECT uuid FROM events WHERE session_uuid = ? ORDER BY rowid ASC')
      .all('s1') as { uuid: string }[];
    expect(rows.map((r) => r.uuid)).toEqual(['u-b', 'u-a']); // kolejność INSERT, nie alfabet
    db.close();
  });

  it('uuid jest kluczem głównym — INSERT OR IGNORE odrzuca duplikat (idempotencja syncu)', () => {
    const db = migratedDb();
    const sql = `INSERT OR IGNORE INTO events
        (uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
         device_time, gps_time, payload, schema_version, synced_at)
      VALUES ('dup', 's1', 'AC', 'TMK', NULL, 'takeoff', 1000, NULL, '{}', 1, NULL)`;

    expect(db.prepare(sql).run().changes).toBe(1);
    expect(db.prepare(sql).run().changes).toBe(0); // §4.3: powtórka to nie błąd, tylko no-op
    db.close();
  });

  it('outbox to wiersze z synced_at IS NULL', () => {
    const db = migratedDb();
    const insert = db.prepare(
      `INSERT INTO events
         (uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
          device_time, gps_time, payload, schema_version, synced_at)
       VALUES (?, 's1', 'AC', 'TMK', NULL, 'takeoff', 1000, NULL, '{}', 1, ?)`,
    );
    insert.run('sent', 999);
    insert.run('pending', null);

    const rows = db
      .prepare('SELECT uuid FROM events WHERE synced_at IS NULL ORDER BY rowid ASC')
      .all() as { uuid: string }[];
    expect(rows.map((r) => r.uuid)).toEqual(['pending']);
    db.close();
  });
});
