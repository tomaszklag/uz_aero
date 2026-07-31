/**
 * UZ Aero (serwer) — schemat PostgreSQL jako czysty tekst (§5.3).
 *
 * Ten sam wzorzec co `app/src/infrastructure/storage/schema.ts` i z tego samego powodu:
 * DDL trzymany osobno da się uruchomić na prawdziwym silniku w testach (tu: PGlite,
 * Postgres w procesie Node) — błąd składni wychodzi w sekundę, nie na serwerze.
 *
 * `events` jest append-only również tutaj: serwer niczego nie edytuje, korekty
 * przychodzą jako zdarzenia `event_correction` (04c). `sessions` i statystyki to
 * projekcje — odświeżane przy przyjęciu zdarzeń, zawsze odtwarzalne ze strumienia.
 */

export const SCHEMA_VERSION = 7;

export const MIGRATION_1 = `
  CREATE TABLE IF NOT EXISTS pilots (
    id            TEXT PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS aircraft (
    id             TEXT PRIMARY KEY,
    reg            TEXT NOT NULL UNIQUE,
    type           TEXT NOT NULL,
    year           INTEGER,
    capacity_l     REAL NOT NULL,
    mh_format      TEXT NOT NULL,
    dual_required  BOOLEAN NOT NULL DEFAULT FALSE,
    service_status TEXT NOT NULL DEFAULT 'active',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Refresh tokeny: przechowujemy HASH, nie wartość — wyciek bazy nie daje sesji.
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    pilot_id   TEXT NOT NULL REFERENCES pilots(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_pilot ON refresh_tokens (pilot_id);

  -- Rejestr zdarzeń (§5.3) — lustro lokalnego rejestru telefonów, klucz = uuid
  -- nadany przez urządzenie (idempotencja synca: INSERT ... ON CONFLICT DO NOTHING).
  CREATE TABLE IF NOT EXISTS events (
    uuid           TEXT PRIMARY KEY,
    session_uuid   TEXT NOT NULL,
    aircraft_id    TEXT NOT NULL,
    pic_id         TEXT NOT NULL,
    dual_id        TEXT,
    type           TEXT NOT NULL,
    device_time    BIGINT NOT NULL,
    gps_time       BIGINT,
    payload        JSONB NOT NULL,
    schema_version INTEGER NOT NULL,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_device  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_session  ON events (session_uuid);
  CREATE INDEX IF NOT EXISTS idx_events_aircraft ON events (aircraft_id);
`;

/**
 * Migracja 2: projekcje po stronie serwera (§5.3).
 *
 * `sessions` NIE jest źródłem prawdy — to zrzut `projectSession(events)` odświeżany
 * w tej samej transakcji, w której przyjmujemy zdarzenia. Kolumny liczbowe trzymamy
 * po to, żeby `state`, `sync-status` i (w M4) eksport nie musiały wczytywać strumienia.
 *
 * `flags` żyją osobno od sesji: jedna flaga może dotyczyć DWÓCH sesji (nakładka po
 * przejęciu offline), a jej cykl życia (open → resolved) jest dłuższy niż dzień lotny.
 */
export const MIGRATION_2 = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_uuid  TEXT PRIMARY KEY,
    aircraft_id   TEXT NOT NULL,
    pic_id        TEXT NOT NULL,
    dual_id       TEXT,
    status        TEXT NOT NULL DEFAULT 'active',
    claim_time    BIGINT,
    close_time    BIGINT,
    mh_start      DOUBLE PRECISION,
    mh_end        DOUBLE PRECISION,
    fuel_start_l  DOUBLE PRECISION,
    fuel_end_l    DOUBLE PRECISION,
    fuel_last_l   DOUBLE PRECISION,
    mh_last       DOUBLE PRECISION,
    block_ms      BIGINT NOT NULL DEFAULT 0,
    flight_ms     BIGINT NOT NULL DEFAULT 0,
    flights_count INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_aircraft ON sessions (aircraft_id);

  CREATE TABLE IF NOT EXISTS flags (
    id            SERIAL PRIMARY KEY,
    type          TEXT NOT NULL,
    aircraft_id   TEXT NOT NULL,
    session_uuids TEXT[] NOT NULL,
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status        TEXT NOT NULL DEFAULT 'open',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_flags_aircraft ON flags (aircraft_id) WHERE status = 'open';
`;

/**
 * Migracja 3 (audyt): unikalność flag na poziomie BAZY.
 *
 * Dedupe w adapterze (SELECT-then-INSERT) przegrywa wyścig dwóch równoległych
 * transakcji — constraint jest jedyną gwarancją, której nie da się ominąć timingiem.
 * `session_uuids` wstawiamy zawsze posortowane, więc UNIQUE działa na zbiorze.
 */
export const MIGRATION_3 = `
  ALTER TABLE flags ADD CONSTRAINT uq_flags_type_sessions UNIQUE (type, session_uuids);
`;

/**
 * Migracja 4: dziennik eksportu arkuszy (§4.7, §5.3 `export_log`).
 *
 * Append-only jak wszystko wokół: spóźnione dane po eksporcie regenerują kartę
 * i dopisują NOWY wiersz z podbitą rewizją — nadpisanie zgubiłoby historię „co
 * i kiedy poszło do arkusza", a to jedyny ślad, którym da się wyjaśnić rozjazd
 * między arkuszem a rejestrem. `session_uuid` spina wpis z sesją — po nim pyta
 * `GET /sessions/:uuid/sync-status` (link na ekranie 11).
 */
export const MIGRATION_4 = `
  CREATE TABLE IF NOT EXISTS export_log (
    id           SERIAL PRIMARY KEY,
    session_uuid TEXT NOT NULL,
    day          DATE NOT NULL,
    aircraft_id  TEXT NOT NULL,
    sheet_url    TEXT NOT NULL,
    revision     INTEGER NOT NULL,
    exported_at  TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_export_log_session ON export_log (session_uuid);
`;

/**
 * Migracja 5: treść wyeksportowanych kart dziennych (§4.7) — bazodanowy adapter
 * `SheetsPort` (zamiast czekania na klucz serwisowy Google).
 *
 * Semantyka DOKŁADNIE jak karty w arkuszu Google: jedna nazwa = jedna karta,
 * a rewizja NADPISUJE treść (UPSERT po `tab`) — czytelnik linku z ekranu 11 ma
 * widzieć wyłącznie aktualny stan dnia, tak jak widziałby arkusz. Historii rewizji
 * tu NIE ma i nie wolno jej tu dodawać: „co i kiedy poszło" pamięta append-only
 * `export_log` (jedyny ślad rozjazdu arkusz↔rejestr), a treść każdej rewizji da się
 * odtworzyć ze strumienia zdarzeń — pełne kopie dublowałyby rejestr bez zysku.
 * `rows` to DOSŁOWNE wiersze karty (`DaySheet.rows`, string[][]) — karta jest
 * dokumentem w kształcie Excela, nie projekcją do dalszego liczenia.
 */
export const MIGRATION_5 = `
  CREATE TABLE IF NOT EXISTS exported_sheets (
    tab        TEXT PRIMARY KEY,
    rows       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
`;

/**
 * Migracja 6: preferencje pilota — motyw aplikacji (decyzja 2026-07-29: motyw jest
 * preferencją PILOTA, nie telefonu, i wędruje za nim między urządzeniami).
 *
 * Kolumny na `pilots`, nie osobna tabela: preferencje są 1:1 z pilotem, a osobna
 * tabela z jednym wierszem na pilota to przerost. `theme` jest NULL-owalny —
 * NULL znaczy „pilot nigdy nie wybrał motywu na żadnym urządzeniu" (telefon zostaje
 * przy swoim lokalnym stanie). `theme_updated_at` to stempel DECYZJI pilota nadany
 * przez telefon — oś rozstrzygania LWW w `PUT /me/prefs`, nie czas zapisu w bazie.
 * Serwer nie zna listy motywów (to tokeny UI aplikacji) — trzyma nazwę jako tekst.
 */
export const MIGRATION_6 = `
  ALTER TABLE pilots ADD COLUMN theme TEXT;
  ALTER TABLE pilots ADD COLUMN theme_updated_at TIMESTAMPTZ;
`;

/**
 * Migracja 7: rola konta (decyzja 2026-07-31 — panel administracyjny, `design/admin/`).
 *
 * Kolumna na `pilots`, nie osobna tabela użytkowników panelu: administrator i szef
 * wyszkolenia SĄ pilotami, więc drugi byt tożsamości rozjechałby ich nalot na dwa
 * konta (uzasadnienie w `src/domain/roles.ts`).
 *
 * `IF NOT EXISTS` jest tu świadome. Migracje 3 (`ADD CONSTRAINT`) i 6 (`ADD COLUMN`)
 * go NIE mają, więc powtórzenie po przerwaniu procesu między `runScript` a wpisem
 * do `schema_migrations` wywala się i blokuje start serwera (zaległość opisana
 * w `docs/architektura-kodu.md`). Nowa migracja tego długu nie powiększa.
 *
 * CHECK zamiast typu ENUM: wartości ról zmieniają się rzadko, ale enum w Postgresie
 * rozszerza się osobnym DDL-em o własnych ograniczeniach transakcyjnych, a CHECK jest
 * zwykłym ograniczeniem tabeli — tańszy w utrzymaniu i tak samo nieprzepuszczalny.
 * `DEFAULT 'pilot'` domyka istniejące konta: podniesienie uprawnień ma być jawną
 * decyzją administratora, nigdy skutkiem ubocznym wdrożenia.
 */
export const MIGRATION_7 = `
  ALTER TABLE pilots ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'pilot'
    CHECK (role IN ('pilot', 'training_lead', 'admin'));
`;

export const MIGRATIONS: readonly string[] = [
  MIGRATION_1,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  MIGRATION_5,
  MIGRATION_6,
  MIGRATION_7,
];
