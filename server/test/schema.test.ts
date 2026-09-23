/**
 * Ninerdeck (serwer) - test KONTRAKTU SCHEMATU na prawdziwym Postgresie (PGlite).
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

import { beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS, MIGRATION_TITLES, SCHEMA_VERSION } from '../src/infrastructure/pg/schema.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import type { Queryable } from '../src/application/common/ports.ts';
import { newPglite } from './pglite';

async function migrated(): Promise<Queryable & { exec(sql: string): Promise<unknown> }> {
  const pglite = newPglite();
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
    // `sheets_key` (issue #99, C5): sekret adresu kart arkusza, losowany per klub.
    // `timezone` i `home_icao` (migracja 11): kalendarz rezerwacji liczy się w strefie
    // KLUBU, a dobę lotną wyznacza wschód i zachód słońca nad lotniskiem macierzystym.
    ['organizations', ['id', 'name', 'slug', 'active', 'created_at', 'created_by', 'join_code', 'join_code_since', 'sheets_key', 'timezone', 'home_icao']],
    [
      'memberships',
      ['org_id', 'pilot_id', 'code', 'status', 'reject_reason', 'joined_via', 'created_at', 'decided_at', 'decided_by', 'credentials_valid_from', 'updated_at'],
    ],
    // Tożsamość Google ZAWSZE podpięta do osoby (epik D, issue #100): `status`,
    // `reject_reason`, `decided_at`, `decided_by` ZNIKŁY migracją 8 - decyzja o zgłoszeniu
    // jest wierszem `memberships`, nie stanem tożsamości.
    ['external_identities', ['provider', 'subject', 'pilot_id', 'email', 'name', 'created_at', 'last_login_at']],
    // Hasło jako DRUGIE poświadczenie osoby (migracja 9, 2.1.0, issue #132) - osobna
    // tabela, jak tożsamość Google, a nie kolumna na `pilots` (tak było do migracji 7).
    ['password_credentials', ['pilot_id', 'hash', 'set_at', 'set_via', 'updated_at']],
    // Sesje logowania (migracja 10) - jeden wiersz na żywą sesję telefonu I panelu.
    [
      'login_sessions',
      ['id', 'pilot_id', 'org_id', 'surface', 'method', 'created_at', 'last_seen_at', 'expires_at', 'revoked_at', 'revoked_by', 'device_label', 'ip'],
    ],
    // Zakres uprawnień (migracja 12, issue #197): zdolność NADANA członkostwu. Bez
    // `CHECK`-a na wartość i bez `granted_at` - katalog żyje w TypeScripcie, a kto
    // i kiedy zmienił zakres, mówi audyt (`membership.scope`).
    ['membership_capabilities', ['org_id', 'pilot_id', 'capability']],
    // Zajętość maszyny (migracja 11, issue #145): JEDNA tabela na rezerwację pilota
    // i wyłączenie z użytku, bo ograniczenie wykluczające musi objąć oba rodzaje naraz.
    [
      'bookings',
      ['id', 'org_id', 'aircraft_id', 'kind', 'status', 'starts_at', 'ends_at', 'pilot_id', 'dual_id', 'operation', 'from_icao', 'to_icao', 'planned_air_min', 'planned_fuel_l', 'session_uuid', 'block_reason', 'note', 'created_by', 'created_at', 'updated_at', 'closed_at', 'close_reason'],
    ],
    // Ścieżka akceptacji (migracja 13, issue #164): krok ma NAZWĘ i LISTĘ OSÓB - roli
    // w nim nie ma. `id` jest TRWAŁE, a `position` zmienne, bo ścieżka jest zawsze
    // bieżąca; `removed_at` zamiast `DELETE`, bo decyzje pod krokiem są append-only.
    ['approval_steps', ['id', 'org_id', 'position', 'label', 'removed_at']],
    ['approval_step_members', ['org_id', 'step_id', 'pilot_id']],
    // Decyzje na rezerwacji: `via` odróżnia kliknięcie człowieka od kroku pominiętego
    // przez rezerwującego, `reason` jest wymagany przy odmowie (pilnuje domena).
    [
      'booking_approvals',
      ['booking_id', 'org_id', 'step_id', 'decision', 'via', 'reason', 'decided_by', 'decided_at'],
    ],
    // Skrzynka (migracja 13): źródło prawdy powiadomień, push jest tylko budzikiem.
    ['notifications', ['id', 'org_id', 'pilot_id', 'kind', 'payload', 'created_at', 'read_at']],
    // Token push BEZ `org_id`: opisuje URZĄDZENIE osoby, a ta bywa w kilku klubach
    // naraz i przełącza je bez wylogowania. Klub niesie powiadomienie.
    ['push_tokens', ['token', 'session_id', 'pilot_id', 'created_at']],
    // Tokeny linku „ustaw hasło": `kind`/`email`/`display_name` niosą rejestrację e-mailem
    // (osoba powstaje przy realizacji), `triggered_by` - który z czterech wyzwalaczy.
    [
      'password_reset_tokens',
      ['token_hash', 'kind', 'pilot_id', 'email', 'display_name', 'triggered_by', 'created_at', 'created_by', 'expires_at', 'consumed_at'],
    ],

    [
      'aircraft',
      // `org_id` na KOŃCU każdej tabeli klubu - dołożony `ALTER`-em migracją 8.
      ['id', 'reg', 'type', 'year', 'capacity_l', 'mh_format', 'dual_required', 'service_status', 'updated_at', 'oil_min_l', 'oil_capacity_l', 'oil_norm_l_per_h', 'fuel_norm_l_per_h', 'initial_mh', 'initial_fuel_l', 'initial_oil_l', 'org_id'],
    ],
    // `session_id` NOT NULL od migracji 10: każdy refresh należy do sesji logowania,
    // także te sprzed 2.1.0 (backfill zakłada im sesję `mobile`/`legacy`).
    ['refresh_tokens', ['token_hash', 'pilot_id', 'expires_at', 'created_at', 'org_id', 'session_id']],
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
    // `admin_audit` jest świadomym wyjątkiem: założenie klubu nie dzieje się w żadnym
    // klubie. `login_sessions` (migracja 10) jest drugim i z tego samego powodu: sesja
    // PLATFORMOWA należy do superadministratora, który klubu nie ma. Zawężenia po klubie
    // to nie luzuje - panel klubu czyta sesje WYŁĄCZNIE z `org_id = actor.orgId`, więc
    // wiersz platformowy nie wpada tam nigdy (`tenantIsolation.test.ts`).
    const db = await migrated();
    const { rows } = await db.query<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
        WHERE column_name = 'org_id' ORDER BY table_name`,
    );
    const nullable = rows.filter((r) => r.is_nullable === 'YES').map((r) => r.table_name);
    expect(nullable).toEqual(['admin_audit', 'login_sessions']);
    expect(rows.map((r) => r.table_name)).toEqual([
      'admin_audit',
      'aircraft',
      'aircraft_consumption',
      'aircraft_readings',
      'approval_step_members',
      'approval_steps',
      'booking_approvals',
      'bookings',
      'bug_reports',
      'events',
      'export_log',
      'exported_sheets',
      'flags',
      'login_sessions',
      'membership_capabilities',
      'memberships',
      'notifications',
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

  it('e-mail osoby jest jedyny BEZ WZGLĘDU NA WIELKOŚĆ LITER (migracja 9, `idx_pilots_email_lower`)', async () => {
    // Od 2.1.0 adres jest LOGINEM, a odczyty robią `lower()`: `Jan@x.pl` i `jan@x.pl`
    // muszą być jedną osobą. Do migracji 9 `pilots.email UNIQUE` przepuszczało oba.
    const db = await migrated();
    await db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('p-a', 'A', 'Jan@x.pl', TRUE)`);
    await expect(
      db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('p-b', 'B', 'jan@X.PL', TRUE)`),
    ).rejects.toThrow();
    // Puste adresy indeks pomija - osoba bez e-maila nie blokuje drugiej bez e-maila.
    await db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('p-c', 'C', NULL, TRUE)`);
    await expect(
      db.query(`INSERT INTO pilots (id, name, email, active) VALUES ('p-d', 'D', NULL, TRUE)`),
    ).resolves.toBeDefined();
  });

  it('token linku „ustaw hasło" ma kształt zgodny z rodzajem (CHECK `password_reset_token_shape`)', async () => {
    const db = await migrated();
    await db.query(`INSERT INTO pilots (id, name, active) VALUES ('p-t', 'T', TRUE)`);
    const insert = (values: string): Promise<unknown> =>
      db.query(
        `INSERT INTO password_reset_tokens (token_hash, kind, pilot_id, email, display_name, triggered_by, created_at, expires_at)
         VALUES ${values}`,
      );
    // `reset` z osobą - dobrze; `reset` bez osoby - odmowa.
    await expect(insert(`('h1', 'reset', 'p-t', NULL, NULL, 'self', now(), now())`)).resolves.toBeDefined();
    await expect(insert(`('h2', 'reset', NULL, NULL, NULL, 'self', now(), now())`)).rejects.toThrow();
    // `signup` z adresem i imieniem, BEZ osoby - dobrze; z osobą albo bez imienia - odmowa.
    await expect(insert(`('h3', 'signup', NULL, 'nowy@x.pl', 'Nowa Osoba', 'self', now(), now())`)).resolves.toBeDefined();
    await expect(insert(`('h4', 'signup', 'p-t', 'nowy@x.pl', 'Nowa Osoba', 'self', now(), now())`)).rejects.toThrow();
    await expect(insert(`('h5', 'signup', NULL, 'nowy@x.pl', NULL, 'self', now(), now())`)).rejects.toThrow();
    // Wyzwalacz spoza czwórki - odmowa (kod jednorazowy administratora nie istnieje).
    await expect(insert(`('h6', 'reset', 'p-t', NULL, NULL, 'code', now(), now())`)).rejects.toThrow();
  });

  it('unieważnienie sesji jest PARĄ: chwila i sprawca (CHECK `login_session_revocation`)', async () => {
    // Połowiczny stempel opisywałby sesję, której panel nie umie pokazać („wyłączona,
    // ale nie wiadomo przez kogo") ani audyt wytłumaczyć. CHECK jest tu jedyną obroną,
    // bo stemplują cztery różne komendy (C8) i każda robi to własnym `UPDATE`.
    const db = await migrated();
    await db.query(`INSERT INTO pilots (id, name, active) VALUES ('p-s', 'S', TRUE)`);
    const insert = (id: string, revoked: string): Promise<unknown> =>
      db.query(
        `INSERT INTO login_sessions (id, pilot_id, surface, method, created_at, last_seen_at, expires_at, revoked_at, revoked_by)
         VALUES ('${id}', 'p-s', 'mobile', 'password', now(), now(), now(), ${revoked})`,
      );
    await expect(insert('s1', 'NULL, NULL')).resolves.toBeDefined();
    await expect(insert('s2', `now(), 'admin'`)).resolves.toBeDefined();
    await expect(insert('s3', 'now(), NULL')).rejects.toThrow();
    await expect(insert('s4', `NULL, 'admin'`)).rejects.toThrow();
    // Sprawca spoza czwórki - odmowa.
    await expect(insert('s5', `now(), 'pilot'`)).rejects.toThrow();
  });

  it('migracja 10 zakłada sesję KAŻDEMU refreshowi sprzed 2.1.0 (backfill `legacy`)', async () => {
    // `session_id` jest `NOT NULL`, więc bez backfillu migracja wywróciłaby się na
    // produkcji, w której refreshe żyją 90 dni. Test jedzie schematem SPRZED tej migracji
    // (migracje 1–9), dokłada refresh jak żywy telefon i dopiero wtedy stosuje dziesiątkę.
    const pglite = newPglite();
    const db = {
      query: (text: string, params?: unknown[]) => pglite.query(text, params as never) as never,
      exec: (sql: string) => pglite.exec(sql),
    } as unknown as Queryable & { exec(sql: string): Promise<unknown> };
    for (const sql of MIGRATIONS.slice(0, 9)) await db.exec(sql);

    await db.query(`INSERT INTO organizations (id, name, slug) VALUES ('o-b', 'Klub B', 'klub-b')`);
    await db.query(`INSERT INTO pilots (id, name, active) VALUES ('p-b', 'B', TRUE)`);
    await db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ('stary-skrot', 'p-b', 'o-b', now() + interval '90 days', now())`,
    );

    await db.exec(MIGRATIONS[9]!);

    const { rows } = await db.query<{ session_id: string; method: string; surface: string; org_id: string }>(
      `SELECT r.session_id, s.method, s.surface, s.org_id
         FROM refresh_tokens r JOIN login_sessions s ON s.id = r.session_id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'legacy', surface: 'mobile', org_id: 'o-b' });
    // Identyfikator sesji jest LOSOWY, nie wyprowadzony ze skrótu refresha - po pierwszej
    // rotacji pojedzie w czytelnym payloadzie tokenu.
    expect(rows[0]!.session_id).not.toContain('stary-skrot');
  });

  it('`joined_via` zna TRZY drogi do klubu - `panel` odeszło razem z dopisywaniem członka', async () => {
    // Od issue #100 (D3) z panelu KLUBU nie da się nikogo dopisać: nowy członek wchodzi
    // kodem (`code`), pierwszy administrator klubu z modułu Organizacje (`platform`),
    // a `backfill` to przepisane konta 1.x. CHECK jest tu jedyną gwarancją, że czwarta
    // droga nie wróci tyłem - przez `INSERT` z boku.
    const db = await migrated();
    await db.query(
      `INSERT INTO organizations (id, name, slug) VALUES ('o-check', 'Klub CHECK', 'klub-check')`,
    );
    await db.query(`INSERT INTO pilots (id, name, active) VALUES ('p-check', 'Ktoś', TRUE)`);

    const membership = (via: string): Promise<unknown> =>
      db.query(
        `INSERT INTO memberships (org_id, pilot_id, code, status, joined_via)
         VALUES ('o-check', 'p-check', 'CHK', 'active', $1)
         ON CONFLICT (org_id, pilot_id) DO UPDATE SET joined_via = $1`,
        [via],
      );

    for (const via of ['code', 'platform', 'backfill']) {
      await expect(membership(via), via).resolves.toBeDefined();
    }
    await expect(membership('panel')).rejects.toThrow();
  });

  /**
   * ZAJĘTOŚĆ MASZYNY (migracja 11, issue #145) - nakładanie wyklucza BAZA.
   *
   * Te testy są jedynym miejscem, w którym widać, że ograniczenie ma właściwą
   * SEMANTYKĘ, a nie tylko istnieje: półotwarty zakres przepuszcza zetknięcie co do
   * minuty, predykat częściowy oddaje termin po zwolnieniu, a nakładka odbija się
   * niezależnie od rodzaju wpisu - rezerwacja pilota i wyłączenie z użytku siedzą
   * w jednej tabeli właśnie po to.
   *
   * PRAWDZIWEGO WYŚCIGU NIE DA SIĘ TU ODEGRAĆ: PGlite ma jedno połączenie i szereguje
   * transakcje własnym mutexem (ta sama uwaga stoi w `adminExports.test.ts`). Testy
   * sprawdzają więc, że ograniczenie ISTNIEJE i odbija sekwencyjnie; o równoległość
   * dba baza produkcyjna - po to jest ograniczenie zamiast sprawdzenia w kodzie.
   */
  describe('zajętość maszyny: wykluczenie nakładania', () => {
    // `migrated()` daje schemat BEZ danych (świat testowy mieszka w `helpers.ts`), więc
    // ten blok zakłada sobie minimum sam. Baza wstaje RAZ, a testy rozdziela WŁASNA
    // MASZYNA dla każdego: klucz wykluczenia zaczyna się od maszyny, więc dwa terminy
    // z sąsiednich testów nie mają jak się o siebie odbić.
    let db: Awaited<ReturnType<typeof migrated>>;
    let seq = 0;

    beforeAll(async () => {
      db = await migrated();
      await db.query(`INSERT INTO organizations (id, name, slug) VALUES ('org', 'Klub', 'klub')`);
      await db.query(`INSERT INTO pilots (id, name) VALUES ('plt', 'Tomasz Małkiewicz')`);
    });

    async function aircraft(): Promise<string> {
      const id = `ac${++seq}`;
      await db.query(
        `INSERT INTO aircraft (id, reg, type, capacity_l, mh_format, org_id)
         VALUES ($1, $2, 'C172', 200, 'decimal', 'org')`,
        [id, `SP-A${String(seq).padStart(2, '0')}`],
      );
      return id;
    }

    const insert = (ac: string, from: string, to: string, status = 'confirmed') =>
      db.query(
        `INSERT INTO bookings (id, org_id, aircraft_id, kind, status, starts_at, ends_at, pilot_id, operation, created_by)
         VALUES (gen_random_uuid()::text, 'org', $1, 'flight', $2, $3, $4, 'plt', 'przelot', 'plt')`,
        [ac, status, from, to],
      );

    it('zetknięcie co do minuty PRZECHODZI (zakres półotwarty)', async () => {
      const ac = await aircraft();
      await insert(ac, '2026-10-01T08:00:00Z', '2026-10-01T10:00:00Z');
      await expect(insert(ac, '2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z')).resolves.toBeDefined();
    });

    it('nakładka odbija się o bazę', async () => {
      const ac = await aircraft();
      await insert(ac, '2026-10-01T08:00:00Z', '2026-10-01T10:00:00Z');
      await expect(insert(ac, '2026-10-01T09:00:00Z', '2026-10-01T11:00:00Z')).rejects.toThrow(
        /exclusion constraint|bookings_no_overlap/,
      );
    });

    it('druga MASZYNA w tym samym oknie przechodzi', async () => {
      // Klucz wykluczenia zaczyna się od maszyny i na niej kończy - `org_id` w nim
      // NIE STOI, bo egzemplarz należy do dokładnie jednego klubu (klucz obcy
      // `aircraft.org_id`). Dołożenie klubu do klucza nic by nie zawęziło, a sugerowałoby,
      // że ten sam płatowiec da się zarezerwować dwa razy pod dwiema nazwami.
      const a = await aircraft();
      const b = await aircraft();
      await insert(a, '2026-10-02T08:00:00Z', '2026-10-02T10:00:00Z');
      await expect(insert(b, '2026-10-02T08:00:00Z', '2026-10-02T10:00:00Z')).resolves.toBeDefined();
    });

    it('zwolniona i odwołana ODDAJĄ termin (predykat częściowy)', async () => {
      const ac = await aircraft();
      await insert(ac, '2026-10-01T08:00:00Z', '2026-10-01T10:00:00Z', 'released');
      await insert(ac, '2026-10-01T08:00:00Z', '2026-10-01T10:00:00Z', 'cancelled');
      // Ten sam termin wchodzi po raz trzeci, tym razem jako czynna rezerwacja.
      await expect(insert(ac, '2026-10-01T08:00:00Z', '2026-10-01T10:00:00Z')).resolves.toBeDefined();
    });

    it('wyłączenie z użytku blokuje rezerwację tej samej maszyny', async () => {
      const ac = await aircraft();
      await db.query(
        `INSERT INTO bookings (id, org_id, aircraft_id, kind, status, starts_at, ends_at, block_reason, created_by)
         VALUES (gen_random_uuid()::text, 'org', $1, 'block', 'confirmed', '2026-10-05T06:00:00Z', '2026-10-08T20:00:00Z', 'maintenance', 'plt')`,
        [ac],
      );
      await expect(insert(ac, '2026-10-06T09:00:00Z', '2026-10-06T11:00:00Z')).rejects.toThrow(
        /exclusion constraint|bookings_no_overlap/,
      );
    });

    it('kolumny rodzaju spina CHECK: rezerwacja bez pilota nie istnieje', async () => {
      const ac = await aircraft();
      await expect(
        db.query(
          `INSERT INTO bookings (id, org_id, aircraft_id, kind, status, starts_at, ends_at, created_by)
           VALUES (gen_random_uuid()::text, 'org', $1, 'flight', 'confirmed', '2026-10-01T08:00:00Z', '2026-10-01T10:00:00Z', 'plt')`,
          [ac],
        ),
      ).rejects.toThrow(/booking_flight_fields/);
    });

    it('koniec musi być po początku', async () => {
      const ac = await aircraft();
      await expect(insert(ac, '2026-10-01T10:00:00Z', '2026-10-01T08:00:00Z')).rejects.toThrow(
        /booking_order/,
      );
    });
  });

  describe('ścieżka akceptacji: co trzyma baza, a co domena', () => {
    // Ten sam wzorzec, co w bloku zajętości: schemat bez danych, minimum zakładane
    // na miejscu, a testy rozdziela WŁASNY KROK dla każdego.
    let db: Awaited<ReturnType<typeof migrated>>;
    let seq = 0;

    beforeAll(async () => {
      db = await migrated();
      await db.query(`INSERT INTO organizations (id, name, slug) VALUES ('org2', 'Klub', 'klub2')`);
      await db.query(`INSERT INTO pilots (id, name) VALUES ('plt2', 'Tomasz Małkiewicz')`);
      await db.query(
        `INSERT INTO aircraft (id, reg, type, capacity_l, mh_format, org_id)
         VALUES ('ac-w', 'SP-WWW', 'C172', 200, 'decimal', 'org2')`,
      );
    });

    async function step(): Promise<string> {
      const id = `st${++seq}`;
      await db.query(
        `INSERT INTO approval_steps (id, org_id, position, label) VALUES ($1, 'org2', 1, 'Mechanik')`,
        [id],
      );
      return id;
    }

    async function booking(): Promise<string> {
      const id = `bk${seq}`;
      const hour = 6 + seq;
      await db.query(
        `INSERT INTO bookings (id, org_id, aircraft_id, kind, status, starts_at, ends_at, pilot_id, operation, created_by)
         VALUES ($1, 'org2', 'ac-w', 'flight', 'pending', $2, $3, 'plt2', 'przelot', 'plt2')`,
        [id, `2026-11-01T${String(hour).padStart(2, '0')}:00:00Z`, `2026-11-01T${String(hour).padStart(2, '0')}:30:00Z`],
      );
      return id;
    }

    const decide = (bk: string, st: string, decision = 'approved', via = 'person') =>
      db.query(
        `INSERT INTO booking_approvals (booking_id, org_id, step_id, decision, via, decided_by)
         VALUES ($1, 'org2', $2, $3, $4, 'plt2')`,
        [bk, st, decision, via],
      );

    it('KROKU Z DECYZJĄ NIE DA SIĘ USUNĄĆ - stąd `removed_at`, a nie `DELETE`', async () => {
      // Klucz obcy decyzji celuje w krok BEZ kaskady, więc zapis nie ma jak zniknąć razem
      // z konfiguracją. Zdjęcie kroku ze ścieżki jest wobec tego stemplem, nie usunięciem.
      const st = await step();
      await decide(await booking(), st);
      await expect(db.query(`DELETE FROM approval_steps WHERE id = $1`, [st])).rejects.toThrow(
        /booking_approvals|foreign key/i,
      );
    });

    it('krok BEZ decyzji da się usunąć, a lista osób znika razem z nim', async () => {
      const st = await step();
      await db.query(
        `INSERT INTO approval_step_members (org_id, step_id, pilot_id) VALUES ('org2', $1, 'plt2')`,
        [st],
      );
      await expect(db.query(`DELETE FROM approval_steps WHERE id = $1`, [st])).resolves.toBeDefined();
      const { rows } = await db.query(`SELECT 1 FROM approval_step_members WHERE step_id = $1`, [st]);
      expect(rows).toHaveLength(0);
    });

    it('DECYZJA JEST JEDNA NA KROK - drugiej baza nie przyjmie (append-only)', async () => {
      // Zmiana zdania znaczy nową rezerwację, nie nadpisanie decyzji (§11.4), więc
      // kolizja klucza jest tu zachowaniem zamierzonym, nie usterką zapisu.
      const st = await step();
      const bk = await booking();
      await decide(bk, st);
      await expect(decide(bk, st, 'rejected')).rejects.toThrow(/duplicate key|booking_approvals_pkey/);
    });

    it('rozstrzygnięcie i jego pochodzenie mają zamknięte zbiory wartości', async () => {
      const st = await step();
      const bk = await booking();
      await expect(decide(bk, st, 'maybe')).rejects.toThrow(/booking_approvals_decision_check|constraint/);
      await expect(decide(bk, st, 'approved', 'admin')).rejects.toThrow(/booking_approvals_via_check|constraint/);
    });

    it('POWODU NIE PILNUJE BAZA i to jest decyzja: wymóg dotyczy TREŚCI', async () => {
      // CHECK umiałby sprawdzić wyłącznie obecność kolumny, a powodem nie jest ani NULL,
      // ani napis z samych spacji. Odpowiedź ma paść tam, gdzie da się ją nazwać
      // człowiekowi - w domenie (`refuseDecision`) i przy przycisku.
      const st = await step();
      await expect(decide(await booking(), st, 'rejected')).resolves.toBeDefined();
    });

    it('TOKEN PUSH GAŚNIE RAZEM Z SESJĄ LOGOWANIA (§12.2)', async () => {
      // Bez tego wspólny tablet klubu wysyłałby powiadomienia pilota, który dawno oddał
      // urządzenie koledze - zdalne wylogowanie z panelu nie tknęłoby budzika.
      await db.query(
        `INSERT INTO login_sessions (id, pilot_id, org_id, surface, method, created_at, last_seen_at, expires_at)
         VALUES ('ses-w', 'plt2', 'org2', 'mobile', 'password', now(), now(), '2026-12-01T00:00:00Z')`,
      );
      await db.query(
        `INSERT INTO push_tokens (token, session_id, pilot_id) VALUES ('ExponentPushToken[x]', 'ses-w', 'plt2')`,
      );
      await db.query(`DELETE FROM login_sessions WHERE id = 'ses-w'`);
      const { rows } = await db.query(`SELECT 1 FROM push_tokens WHERE session_id = 'ses-w'`);
      expect(rows).toHaveLength(0);
    });
  });
});
