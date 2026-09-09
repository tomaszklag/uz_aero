/**
 * UZ Aero (serwer) - test KONTRAKTU SCHEMATU na prawdziwym Postgresie (PGlite).
 *
 * Lustro `sqliteSchema.test.ts` z aplikacji i domknięcie tej samej luki: kolumny DDL
 * ↔ interfejsy wierszy ↔ mapowanie to trzy miejsca, które muszą się zgadzać, a literówka
 * w nazwie kolumny nie jest błędem typów - tylko `undefined` w runtime. Listy kolumn
 * są tu przybite na sztywno; zmiana schematu bez zmiany testu ma NIE przejść.
 *
 * ══ TEN PLIK BYŁ DOWODEM ZGNIECENIA MIGRACJI (2026-08-08) ══
 * Dwadzieścia trzy migracje zwinęły się w jedną bazową. Listy niżej NIE ZMIENIŁY SIĘ ani
 * o kolumnę, ani o pozycję - i to jest cała weryfikacja tamtej zmiany: zgnieciony skrypt
 * produkuje ten sam schemat, który produkowała historia. Stąd też porządek kolumn wygląda,
 * jak wygląda (rzeczy dokładane `ALTER`-em siedzą na końcu tabel); jest zachowany
 * świadomie, żeby to porównanie dało się zrobić.
 */

import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

import { MIGRATIONS, MIGRATION_TITLES, SCHEMA_VERSION } from '../src/infrastructure/pg/schema.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import type { Queryable } from '../src/application/common/ports.ts';

async function migrated(): Promise<Queryable & { exec(sql: string): Promise<unknown> }> {
  const pglite = new PGlite();
  const db = {
    query: (text: string, params?: unknown[]) => pglite.query(text, params as never) as never,
    exec: (sql: string) => pglite.exec(sql),
  };
  await migrate(db as Queryable);
  return db as never;
}

async function columnsOf(db: Queryable, table: string): Promise<string[]> {
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

describe('schemat PostgreSQL (kontrakt)', () => {
  it('SCHEMA_VERSION zgadza się z liczbą migracji', () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('KAŻDA migracja ma opis - inaczej `A11` wypisuje cudzy przy nowej pozycji', () => {
    // Ekran konserwacji sklejał do 2026-08-02 numer z bazy z opisem z kodu PO INDEKSIE.
    // Dopisanie migracji bez dopisania opisu przesunęłoby całą kolumnę „Co wprowadza"
    // o jeden i nikt by tego nie zauważył: tabela dalej wyglądałaby poprawnie.
    expect(MIGRATION_TITLES).toHaveLength(MIGRATIONS.length);
    for (const title of MIGRATION_TITLES) expect(title.trim().length).toBeGreaterThan(10);
  });

  it('migracje są idempotentne - ponowne wołanie niczego nie psuje', async () => {
    const db = await migrated();
    await expect(migrate(db as Queryable)).resolves.toBeUndefined();
  });

  it.each([
    [
      'pilots',
      // `theme`/`theme_updated_at`/`credentials_valid_from`/`platform_role` na końcu:
      // dołożone `ALTER`-em, w kolejności, w jakiej powstawały. `password_hash` (między
      // `email` a `active` w schemacie bazowym) ZNIKŁO migracją 7; `code` (po `id`)
      // i `role` (między `theme_updated_at` a `credentials_valid_from`) ZNIKŁY migracją 8
      // - kod i rola są własnością CZŁONKOSTWA w klubie, nie osoby (wielofirmowość).
      ['id', 'name', 'email', 'active', 'updated_at', 'theme', 'theme_updated_at', 'credentials_valid_from', 'platform_role'],
    ],
    // Wielofirmowość (migracja 8, issue #98): klub jako tenant, członkostwo, kod klubu
    // (`join_code` - jedyna droga dołączenia od 2026-09-09; tabeli `invitations` NIE MA).
    ['organizations', ['id', 'name', 'slug', 'active', 'created_at', 'created_by', 'join_code', 'join_code_since']],
    [
      'memberships',
      ['org_id', 'pilot_id', 'code', 'role', 'status', 'reject_reason', 'joined_via', 'created_at', 'decided_at', 'decided_by', 'credentials_valid_from', 'updated_at'],
    ],

    [
      'aircraft',
      // `org_id` na KOŃCU każdej tabeli klubu - dołożony `ALTER`-em migracją 8.
      ['id', 'reg', 'type', 'year', 'capacity_l', 'mh_format', 'dual_required', 'service_status', 'updated_at', 'oil_min_l', 'oil_capacity_l', 'oil_norm_l_per_h', 'fuel_norm_l_per_h', 'initial_mh', 'initial_fuel_l', 'initial_oil_l', 'org_id'],
    ],
    ['refresh_tokens', ['token_hash', 'pilot_id', 'expires_at', 'created_at', 'org_id']],
    [
      'events',
      ['uuid', 'session_uuid', 'aircraft_id', 'pic_id', 'dual_id', 'type', 'device_time', 'gps_time', 'payload', 'schema_version', 'received_at', 'source_device', 'org_id'],
    ],
    [
      'sessions',
      // `operation`/`client`, kolumny statystyk (od `takeoff_count`) i `notes` na końcu -
      // dołożone `ALTER`-em. `claim_time` niesie CZAS PRZEJĘCIA maszyny (uzasadnienie:
      // `application/common/mappers/sessionRow.ts`), i dlatego kolumny `duty_start` tu
      // świadomie NIE MA: klamra służby należy do PILOTA, nie do sesji (§3.6a).
      ['session_uuid', 'aircraft_id', 'pic_id', 'dual_id', 'status', 'claim_time', 'close_time', 'mh_start', 'mh_end', 'fuel_start_l', 'fuel_end_l', 'fuel_last_l', 'mh_last', 'block_ms', 'flight_ms', 'flights_count', 'updated_at', 'operation', 'client', 'takeoff_count', 'landing_count', 'mh_delta_h', 'fuel_consumed_l', 'drop_count', 'jumpers_tandem', 'jumpers_aff', 'jumpers_solo', 'drop_alt_sum_ft', 'drop_alt_count', 'notes', 'oil_level_l', 'oil_added_l', 'engine_start_at', 'engine_stop_at', 'first_takeoff_at', 'last_landing_at', 'departure_icao', 'arrival_icao', 'fuel_added_l', 'manual_entry', 'oil_after_l', 'org_id'],
    ],
    [
      'flags',
      // `resolved_by`/`resolution_note` na końcu - dołożone `ALTER`-em.
      ['id', 'type', 'aircraft_id', 'session_uuids', 'details', 'status', 'created_at', 'resolved_at', 'resolved_by', 'resolution_note', 'org_id'],
    ],
    [
      'export_log',
      ['id', 'session_uuid', 'day', 'aircraft_id', 'sheet_url', 'revision', 'exported_at', 'org_id'],
    ],
    ['exported_sheets', ['tab', 'rows', 'updated_at', 'org_id']],
    [
      'admin_audit',
      ['id', 'actor_pilot_id', 'actor_role', 'action', 'target_type', 'target_id', 'details', 'ip', 'created_at', 'org_id'],
    ],
    // Dopisana przy zgnieceniu: tabela istniała od materializacji normy zużycia
    // (2026-08-05), ale wypadła z tego kontraktu - czyli jedyna tabela schematu, której
    // literówka w nazwie kolumny nie zatrzymałaby żadnego testu.
    ['aircraft_consumption', ['aircraft_id', 'window_days', 'model', 'computed_at', 'org_id']],
    // Odczyty wpisane ręką administratora (issue #81) - append-only, jak rejestr.
    ['aircraft_readings', ['id', 'aircraft_id', 'mh', 'fuel_l', 'oil_l', 'note', 'by_pilot_id', 'created_at', 'org_id']],
    [
      'bug_reports',
      ['uuid', 'pilot_id', 'created_at', 'received_at', 'severity', 'description', 'screen', 'app_version', 'session_uuid', 'context', 'status', 'status_note', 'status_by', 'status_at', 'org_id'],
    ],
  ])('tabela %s ma dokładnie uzgodnione kolumny', async (table, expected) => {
    const db = await migrated();
    expect(await columnsOf(db, table as string)).toEqual(expected);
  });

  it('`org_id` jest NOT NULL na każdej tabeli klubu poza `admin_audit` (akcje platformowe)', async () => {
    // Denormalizacja z `docs/wielofirmowosc.md` §3.5 działa wyłącznie wtedy, gdy kolumna
    // nie bywa pusta - `WHERE org_id = $1` z pustą kolumną cicho pomijałoby wiersze.
    // `admin_audit` jest jedynym świadomym wyjątkiem: założenie klubu nie dzieje się
    // w żadnym klubie.
    const db = await migrated();
    const { rows } = await db.query<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
        WHERE column_name = 'org_id' ORDER BY table_name`,
    );
    const nullable = rows.filter((r) => r.is_nullable === 'YES').map((r) => r.table_name);
    expect(nullable).toEqual(['admin_audit']);
    expect(rows.map((r) => r.table_name)).toEqual([
      'admin_audit',
      'aircraft',
      'aircraft_consumption',
      'aircraft_readings',
      'bug_reports',
      'events',
      'export_log',
      'exported_sheets',
      'flags',
      'memberships',
      'refresh_tokens',
      'sessions',
    ]);
  });

  it('unikaty klubu zastąpiły globalne: `(org_id, reg)`, `(org_id, code)`, `(org_id, tab)`', async () => {
    const db = await migrated();
    const { rows } = await db.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE indexname IN ('uq_aircraft_org_reg', 'idx_memberships_code', 'exported_sheets_pkey', 'aircraft_reg_key')
        ORDER BY indexname`,
    );
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.has('aircraft_reg_key')).toBe(false);
    expect(byName.get('uq_aircraft_org_reg')).toMatch(/UNIQUE.*\(org_id, reg\)/);
    expect(byName.get('idx_memberships_code')).toMatch(/UNIQUE.*\(org_id, code\)/);
    expect(byName.get('exported_sheets_pkey')).toMatch(/\(org_id, tab\)/);
  });
});
