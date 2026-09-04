/**
 * UZ Aero - schemat lokalnej bazy (DDL) jako czysty tekst.
 *
 * DLACZEGO OSOBNY MODUŁ: adapter importuje `expo-sqlite`, którego nie ma w Node, więc
 * schemat był jedyną warstwą bez testów - i to właśnie w nim ukrył się błąd, który
 * wyszedł dopiero na urządzeniu (`rowid` na liście kolumn indeksu; SQLite tego nie
 * przyjmuje, choć w `ORDER BY` jest legalny).
 *
 * Trzymając DDL tutaj, uruchamiamy go w teście na prawdziwym silniku SQLite
 * (`node:sqlite`, wbudowany w Node) i wyłapujemy takie rzeczy w sekundę, bez telefonu.
 * Adapter i test korzystają z tego samego źródła - nie da się poprawić jednego,
 * zapominając o drugim.
 *
 * Model danych: §5.2 dokumentacji. `events` jest append-only; `synced_at IS NULL`
 * wyznacza outbox (§4.3).
 */

/** Wersja schematu - sterowana `PRAGMA user_version`. Podnieś przy każdej migracji. */
export const SCHEMA_VERSION = 8;

/**
 * Migracja 0 → 1: pełny schemat początkowy.
 *
 * Uwaga o indeksach: NIE wymieniamy `rowid` na liście kolumn (SQLite odrzuca to błędem
 * „no such column: rowid"). Nie trzeba go zresztą podawać - rowid jest lokalizatorem
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
 * SUROWE fixy sprzed kwarantanny + markery (detekcja / COFNIJ) - materiał do
 * kalibracji progów i replayu przez `runDetector`. To NIE są zdarzenia domenowe:
 * tabela żyje obok rejestru, nigdy nie przechodzi przez outbox (ma WŁASNĄ wysyłkę
 * na `POST /traces` z własną księgowością `uploaded_at`) i jest przycinana do
 * `TRACE_RETENTION_DAYS` - rejestr jest wieczny, ślad jest materiałem roboczym.
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
 * `ADD COLUMN IF NOT EXISTS`, więc migracja z `ALTER` przestałaby być idempotentna -
 * a idempotencję kompletu migracji pilnuje `sqliteSchema.test.ts` dla realnego
 * scenariusza „telefon z przerwanym pierwszym startem dostaje wszystko jeszcze raz".
 * Nie chcę osłabiać tego testu, a mam tu wyjątkowy komfort: `gps_trace` to JEDYNA
 * tabela, której wolno zniknąć. Ślad jest materiałem roboczym z 14-dniową retencją,
 * poza outboxem, nigdy źródłem prawdy - utrata niewysłanego nagrania przy jednej
 * aktualizacji aplikacji nie kosztuje nic, czego nie da się nadrobić następnym lotem.
 * Gdyby to była tabela `events`, rozmowa byłaby zupełnie inna.
 *
 * Kolumny czujników są NULL w wierszach `fix` i odwrotnie - to celowe. Ślad analizujemy
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

/**
 * Migracja 4: norma zużycia samolotu z analityki (`A10a`) - wejście dla ekranów 04, 06 i 10.
 *
 * ══ DLACZEGO OSOBNA TABELA, A NIE KOLUMNA W `reference_aircraft` ══
 * Z konieczności i z wygody naraz.
 *
 * Konieczność: SQLite nie zna `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, a komplet migracji
 * musi dać się przepuścić PONOWNIE bez błędu - pilnuje tego `sqliteSchema.test.ts` na
 * prawdziwym silniku. `CREATE TABLE IF NOT EXISTS` tę własność ma, `ADD COLUMN` nie.
 *
 * Wygoda: to są dwa różne cykle życia. Konfiguracja samolotu zmienia się, gdy ktoś ją
 * zmieni w panelu - czyli raz na kwartał. Norma przelicza się po każdym zamkniętym dniu.
 * Trzymanie ich w jednym wierszu kazałoby przepisywać konfigurację przy każdym syncu.
 *
 * `model` jako JSON, a nie rozbite kolumny: telefon tej struktury NIE LICZY ani nie
 * filtruje - przepisuje ją z odpowiedzi i oddaje ekranowi. Rozbicie na osiem kolumn
 * dałoby osiem miejsc do zapomnienia przy następnym polu.
 */
export const MIGRATION_4 = `
  CREATE TABLE IF NOT EXISTS reference_consumption (
    aircraft_id TEXT PRIMARY KEY NOT NULL,
    model       TEXT NOT NULL,
    fetched_at  INTEGER NOT NULL
  );
`;

/**
 * Migracja 5: konfiguracja OLEJU samolotu (issue #60) - minimum, zbiornik i norma
 * nominalna dla sekcji oleju na kroku liczników (02a).
 *
 * Osobna tabela z DOKŁADNIE tych powodów, co `reference_consumption` (docblock wyżej):
 * `ADD COLUMN` nie jest idempotentne, a komplet migracji musi przejść ponownie bez
 * błędu. Do Etapu D serwer tych pól nie wysyła - tabela stoi pusta i sekcja oleju
 * działa bez podpowiedzi konfiguracji, dokładnie jak przy samolocie nieskonfigurowanym.
 * Trzy kolumny zamiast JSON-a, bo to trzy niezależne liczby KONFIGURACJI (siostry
 * `capacity_l`), a nie przepisywany w całości model.
 */
export const MIGRATION_5 = `
  CREATE TABLE IF NOT EXISTS reference_oil (
    aircraft_id  TEXT PRIMARY KEY NOT NULL,
    min_l        REAL,
    capacity_l   REAL,
    norm_l_per_h REAL,
    fetched_at   INTEGER NOT NULL
  );
`;

/**
 * Migracja 6: NORMA NOMINALNA SPALANIA z dokumentacji jednostki (issue #66).
 *
 * ══ DLACZEGO OSOBNA TABELA, SIOSTRA `reference_oil` ══
 * Ten sam powód, co przy oleju i przy normie: SQLite nie zna
 * `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, a komplet migracji musi dać się przepuścić
 * PONOWNIE bez błędu (`sqliteSchema.test.ts`). Kolumna w `reference_aircraft` odpadła
 * więc na starcie, mimo że logicznie jest siostrą `capacity_l`.
 *
 * ══ DLACZEGO NIE DOPISANA DO `reference_oil` ══
 * Bo tamta tabela nazywa się tak, jak jej treść. `fuel_norm_l_per_h` w tabeli oleju
 * byłaby pierwszym miejscem, w którym nazwa przestaje opisywać zawartość - a druga
 * taka kolumna zamieniłaby ją w worek na resztę. Kartę panelu, na której obie normy
 * stoją obok siebie, składa `AircraftDrawer`; magazyn nie musi tego lustrzanie odbijać.
 *
 * Brak wiersza = administrator nie wpisał normy. Ekran rozliczenia milczy wtedy
 * o oczekiwaniu dokładnie tak, jak przed tą zmianą.
 */
export const MIGRATION_6 = `
  CREATE TABLE IF NOT EXISTS reference_fuel (
    aircraft_id  TEXT PRIMARY KEY NOT NULL,
    norm_l_per_h REAL,
    fetched_at   INTEGER NOT NULL
  );
`;

/**
 * Migracja 7: ZAPISY WSTRZYMANE - wypadły z outboxa decyzją administratora (issue #81).
 *
 * ══ PO CO ══
 * Administrator zakończył albo unieważnił z panelu operację, którą ten telefon
 * prowadził - jej zaległe zapisy (zdanie, lądowanie dosłane po fakcie) NIE MOGĄ już
 * wyjść na serwer. Wiersz w `events` zostaje (rejestr jest append-only, ekran dalej
 * pokazuje pilotowi jego wersję), `synced_at` zostaje `NULL` (serwer tego nie
 * potwierdził i nie potwierdzi), a TA tabela mówi, że uuid wypadł z kolejki:
 * `getUnsyncedEvents` pomija wszystko, co tu stoi.
 *
 * ══ DLACZEGO OSOBNA TABELA, A NIE KOLUMNA W `events` ══
 * Ten sam powód, co przy każdej migracji od 4: `ADD COLUMN` w SQLite nie jest
 * idempotentne, a komplet migracji musi przejść ponownie bez błędu
 * (`sqliteSchema.test.ts`). Do tego to inny cykl życia: wstrzymanie jest decyzją
 * o ZAPISIE (kiedy, dlaczego), nie polem samego zdarzenia - jak stempel wysyłki,
 * który też jest księgowością telefonu, nie treścią rejestru.
 */
export const MIGRATION_7 = `
  CREATE TABLE IF NOT EXISTS withheld_events (
    uuid         TEXT PRIMARY KEY NOT NULL,
    session_uuid TEXT NOT NULL,
    reason       TEXT NOT NULL,
    withheld_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_withheld_session ON withheld_events (session_uuid);
`;

/** Migracje w kolejności stosowania: indeks = wersja docelowa − 1. */
/**
 * Migracja 7 → 8: ZGŁOSZENIA BŁĘDÓW (issue #87, na czas testów z pilotami).
 *
 * ══ PO CO ══
 * Przycisk w prawym górnym rogu każdego ekranu i każdego arkusza zapisuje TUTAJ, a
 * pętla okazji wysyła na `POST /me/bug-reports`. Zapis lokalny, bo pilot zauważa błąd
 * tam, gdzie pracuje - czyli często bez zasięgu (§4.1). Formularz wymagający sieci
 * nie pojechałby w teren, a właśnie tam odbywają się testy.
 *
 * ══ DLACZEGO OSOBNA TABELA, A NIE `events` ══
 * Ta sama granica, co przy `gps_trace`: rejestr opisuje LOT i jest wieczny, zgłoszenie
 * opisuje APLIKACJĘ i ma własną wysyłkę (`sent_at`) oraz własne życie - potwierdzone
 * znika z telefonu, bo jedyną kopią zostaje serwer (jak nagranie śladu, issue #47).
 *
 * `context` jako JSON w jednym polu, a nie dwadzieścia kolumn: telefon nie zadaje temu
 * polu żadnego pytania - pakuje je i oddaje. Kolumnowo czyta się ślad GPS, bo tam
 * naprawdę biegną zapytania analityczne.
 */
export const MIGRATION_8 = `
  CREATE TABLE IF NOT EXISTS bug_reports (
    uuid        TEXT PRIMARY KEY NOT NULL,
    created_at  INTEGER NOT NULL,
    severity    TEXT,
    description TEXT NOT NULL,
    screen      TEXT NOT NULL,
    app_version TEXT,
    session_uuid TEXT,
    context     TEXT NOT NULL,
    sent_at     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_bug_reports_outbox ON bug_reports (sent_at);
`;

export const MIGRATIONS: readonly string[] = [
  MIGRATION_1,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  MIGRATION_5,
  MIGRATION_6,
  MIGRATION_7,
  MIGRATION_8,
];
