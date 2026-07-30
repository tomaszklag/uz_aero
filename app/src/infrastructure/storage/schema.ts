/**
 * UZ Aero — schemat lokalnej bazy (DDL) jako czysty tekst.
 *
 * DLACZEGO OSOBNY MODUŁ: adapter importuje `expo-sqlite`, którego nie ma w Node, więc
 * schemat był jedyną warstwą bez testów — i to właśnie w nim ukrył się błąd, który
 * wyszedł dopiero na urządzeniu (`rowid` na liście kolumn indeksu; SQLite tego nie
 * przyjmuje, choć w `ORDER BY` jest legalny).
 *
 * Trzymając DDL tutaj, uruchamiamy go w teście na prawdziwym silniku SQLite
 * (`node:sqlite`, wbudowany w Node) i wyłapujemy takie rzeczy w sekundę, bez telefonu.
 * Adapter i test korzystają z tego samego źródła — nie da się poprawić jednego,
 * zapominając o drugim.
 *
 * Model danych: §5.2 dokumentacji. `events` jest append-only; `synced_at IS NULL`
 * wyznacza outbox (§4.3).
 */

/** Wersja schematu — sterowana `PRAGMA user_version`. Podnieś przy każdej migracji. */
export const SCHEMA_VERSION = 3;

/**
 * Migracja 0 → 1: pełny schemat początkowy.
 *
 * Uwaga o indeksach: NIE wymieniamy `rowid` na liście kolumn (SQLite odrzuca to błędem
 * „no such column: rowid"). Nie trzeba go zresztą podawać — rowid jest lokalizatorem
 * wiersza w każdym indeksie, więc po trafieniu w `session_uuid` / `synced_at`
 * sortowanie po rowid nadal idzie po indeksie.
 */
export const MIGRATION_1 = `
  CREATE TABLE IF NOT EXISTS events (
    uuid           TEXT PRIMARY KEY NOT NULL,
    session_uuid   TEXT NOT NULL,
    aircraft_id    TEXT NOT NULL,
    pic_id         TEXT NOT NULL,
    dual_id        TEXT,
    type           TEXT NOT NULL,
    device_time    INTEGER NOT NULL,
    gps_time       INTEGER,
    payload        TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    synced_at      INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_uuid);
  CREATE INDEX IF NOT EXISTS idx_events_outbox  ON events (synced_at);

  CREATE TABLE IF NOT EXISTS reference_aircraft (
    id             TEXT PRIMARY KEY NOT NULL,
    reg            TEXT NOT NULL,
    type           TEXT NOT NULL,
    year           INTEGER,
    capacity_l     REAL NOT NULL,
    mh_format      TEXT NOT NULL,
    dual_required  INTEGER NOT NULL,
    service_status TEXT NOT NULL,
    claim_pic      TEXT,
    claim_since    INTEGER,
    handover       TEXT,
    fetched_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reference_pilots (
    id         TEXT PRIMARY KEY NOT NULL,
    code       TEXT NOT NULL,
    name       TEXT NOT NULL,
    active     INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

/**
 * Migracja 1 → 2: ślad kalibracyjny GPS (faza 5).
 *
 * SUROWE fixy sprzed kwarantanny + markery (detekcja / COFNIJ) — materiał do
 * kalibracji progów i replayu przez `runDetector`. To NIE są zdarzenia domenowe:
 * tabela żyje obok rejestru, nigdy nie przechodzi przez outbox (ma WŁASNĄ wysyłkę
 * na `POST /traces` z własną księgowością `uploaded_at`) i jest przycinana do
 * `TRACE_RETENTION_DAYS` — rejestr jest wieczny, ślad jest materiałem roboczym.
 */
export const MIGRATION_2 = `
  CREATE TABLE IF NOT EXISTS gps_trace (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT,
    kind         TEXT NOT NULL,
    time         INTEGER NOT NULL,
    device_time  INTEGER NOT NULL,
    gs           REAL,
    alt          REAL,
    lat          REAL,
    lon          REAL,
    accuracy_m   REAL,
    detail       TEXT,
    uploaded_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_trace_upload ON gps_trace (uploaded_at);
  CREATE INDEX IF NOT EXISTS idx_trace_device_time ON gps_trace (device_time);
`;

/**
 * Migracja 2 → 3: kurs nad ziemią + kanały czujników pokładowych w śladzie.
 *
 * DLACZEGO `DROP` I `CREATE`, A NIE `ALTER TABLE ADD COLUMN`: SQLite nie zna
 * `ADD COLUMN IF NOT EXISTS`, więc migracja z `ALTER` przestałaby być idempotentna —
 * a idempotencję kompletu migracji pilnuje `sqliteSchema.test.ts` dla realnego
 * scenariusza „telefon z przerwanym pierwszym startem dostaje wszystko jeszcze raz".
 * Nie chcę osłabiać tego testu, a mam tu wyjątkowy komfort: `gps_trace` to JEDYNA
 * tabela, której wolno zniknąć. Ślad jest materiałem roboczym z 14-dniową retencją,
 * poza outboxem, nigdy źródłem prawdy — utrata niewysłanego nagrania przy jednej
 * aktualizacji aplikacji nie kosztuje nic, czego nie da się nadrobić następnym lotem.
 * Gdyby to była tabela `events`, rozmowa byłaby zupełnie inna.
 *
 * Kolumny czujników są NULL w wierszach `fix` i odwrotnie — to celowe. Ślad analizujemy
 * kolumnowo (`replay.ts`, przyszłe zapytania po NDJSON), a nie przez rozpakowywanie JSON-a
 * z jednego pola; typy trzymają się wtedy end-to-end.
 */
export const MIGRATION_3 = `
  DROP TABLE IF EXISTS gps_trace;

  CREATE TABLE gps_trace (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid  TEXT,
    kind          TEXT NOT NULL,
    time          INTEGER NOT NULL,
    device_time   INTEGER NOT NULL,
    gs            REAL,
    alt           REAL,
    track_deg     REAL,
    lat           REAL,
    lon           REAL,
    accuracy_m    REAL,
    pressure_hpa  REAL,
    accel_mean    REAL,
    accel_max     REAL,
    vibration_rms REAL,
    gyro_mean     REAL,
    gyro_max      REAL,
    imu_samples   INTEGER,
    detail        TEXT,
    uploaded_at   INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_trace_upload ON gps_trace (uploaded_at);
  CREATE INDEX IF NOT EXISTS idx_trace_device_time ON gps_trace (device_time);
`;

/** Migracje w kolejności stosowania: indeks = wersja docelowa − 1. */
export const MIGRATIONS: readonly string[] = [MIGRATION_1, MIGRATION_2, MIGRATION_3];
