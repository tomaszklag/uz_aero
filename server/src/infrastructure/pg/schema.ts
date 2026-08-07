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

export const SCHEMA_VERSION = 21;

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
 *
 * ══ CO Z TEGO WYNIKA I JEST NIEROZSTRZYGNIĘTE (2026-08-01) ══
 * Kluczem jest `tab`, czyli `YYYY-MM-DD_SP-XXX` — DZIEŃ i SAMOLOT, bez sesji. Dwie
 * ZAMKNIĘTE zmiany na tym samym samolocie tego samego dnia (poranna i popołudniowa)
 * budują więc kartę o tej samej nazwie i druga NADPISUJE pierwszą. Flaga
 * `session_overlap` tego nie łapie i nie ma prawa łapać — dotyczy sesji niezamkniętych.
 * Konwencji nazw nie zmieniamy jednostronnie: jest lustrem `sheetTabName` w telefonie
 * (`app/src/ui/screens/syncStatus.ts`, ekran 11) i częścią §4.7, więc scalanie sesji
 * w jedną kartę albo wpuszczenie sesji do nazwy jest DECYZJĄ PRODUKTOWĄ dotykającą obu
 * końców. Do czasu jej podjęcia monitor eksportu przynajmniej nie milczy: wykrywa
 * kolizję po `(day, aircraft_id)` w `export_log` i niesie ją jako
 * `AdminExportListItem.overwrittenBy`.
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

/**
 * Migracja 8: słownik typów flag w bazie (§4.5, katalog w `@uzaero/domain`).
 *
 * Powód: `FlagRecord.type` jest od 2026-07-31 typem `FlagType`, a nie `string`, więc
 * adapter musi wiedzieć, że wartość z kolumny należy do katalogu. Bez ograniczenia
 * w bazie strażnik w adapterze byłby zgadywaniem; z nim jest asercją, która nigdy
 * nie powinna wystąpić — i dlatego wolno jej rzucić.
 *
 * `ADD CONSTRAINT` nie ma wariantu `IF NOT EXISTS` i do 2026-07-31 była to pułapka:
 * powtórzenie po przerwanym biegu blokowało start serwera (tak jak migracja 3).
 * Teraz runner wykonuje skrypt i wpis o zastosowaniu JEDNĄ transakcją, więc stan
 * „zastosowana, ale nieodnotowana" jest niemożliwy i powtórka nie grozi.
 *
 * Katalog liczy pięć pozycji, bo `session_overlap` zastąpił `DOUBLE_CLAIM`
 * i `TIME_OVERLAP` z §4.5 (uzasadnienie: `packages/domain/src/flags.ts`).
 */
export const MIGRATION_8 = `
  ALTER TABLE flags ADD CONSTRAINT flags_type_known CHECK (
    type IN ('mh_gap', 'mh_regression', 'session_overlap', 'fuel_mismatch', 'clock_drift')
  );
`;

/**
 * Migracja 9: dziennik akcji administratorów (`admin_audit`, przekrój 1 panelu).
 *
 * Wiersz powstaje WYŁĄCZNIE przez `AdminAuditPort.append`, wołane z wnętrza
 * `AuditedWrite` — czyli w tej samej transakcji co skutek, który opisuje. Operacja,
 * której nie udało się zaudytować, po prostu nie zachodzi.
 *
 * **Tabela jest append-only i nie ma tu na to ograniczenia bazodanowego** — docelowo
 * niezmienność wymusza `GRANT INSERT, SELECT` dla roli aplikacyjnej (wymaga drugiego
 * connection stringa, decyzja wdrożeniowa `docs/architektura-panelu-serwer.md` §11
 * pkt 2). Do tego czasu pilnuje jej `test/architecture.test.ts`: żaden plik w `src/`
 * nie ma prawa zawierać `UPDATE admin_audit` ani `DELETE FROM admin_audit`.
 *
 * **`action` i `actor_role` celowo BEZ `CHECK`-a na słowniku** — inaczej niż
 * `pilots.role` (migracja 7) i `flags.type` (migracja 8). Tamte opisują byt ŻYWY,
 * który adapter wczytuje z powrotem do zamkniętej unii i musi umieć zinterpretować.
 * Tu wiersz jest zapisem HISTORYCZNYM: przemianowanie akcji albo wycofanie roli
 * z katalogu nie może unieważnić tego, co zdarzyło się rok temu, a `CHECK` zmusiłby
 * wtedy albo do przepisania historii, albo do porzucenia zmiany. Słownika pilnuje
 * typ `AdminAction` w jedynym miejscu zapisu (`domain/adminActions.ts`), a strona
 * odczytu (ekran A09) ma pokazać nieznany kod dosłownie, nigdy się nim wywrócić.
 *
 * `ip` jest NULL-owalny: akcja może przyjść z narzędzia bez żądania HTTP (skrypt
 * administracyjny), a wymyślony adres byłby gorszy niż jego brak.
 *
 * **UWAGA: kształt OBU indeksów niżej jest NIEAKTUALNY — unieważnia go migracja 12.**
 * Brak `NULLS LAST` i brak `id` w `idx_audit_actor` sprawiały, że planer nie mógł użyć
 * ich do porządkowania, więc każda strona dziennika kończyła się pełnym `Sort`-em.
 * Migracja zostaje w tej postaci, bo migracji nie przepisuje się wstecz — ale wzorca
 * stąd NIE KOPIUJ: dowodem, dlaczego to zdanie tu stoi, jest właśnie `idx_audit_actor`,
 * powielony z `idx_audit_created` razem z wadą.
 */
export const MIGRATION_9 = `
  CREATE TABLE IF NOT EXISTS admin_audit (
    id             BIGSERIAL PRIMARY KEY,
    actor_pilot_id TEXT        NOT NULL,
    actor_role     TEXT        NOT NULL,
    action         TEXT        NOT NULL,
    target_type    TEXT,
    target_id      TEXT,
    details        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ip             TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit (created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_actor   ON admin_audit (actor_pilot_id, created_at DESC NULLS LAST, id DESC);
`;

/**
 * Migracja 10: flaga zapamiętuje, KTO i JAK ją rozstrzygnął (mockup `A03a-flaga.html`).
 *
 * `resolved_at` jest od migracji 2; brakowało tożsamości rozstrzygającego i treści
 * rozstrzygnięcia. Komentarz jest w UI **wymagany** — za pół roku nikt nie pamięta,
 * dlaczego nakładka sesji okazała się pozorna — ale kolumna zostaje NULL-owalna:
 * flagi rozwiązane przed wdrożeniem tego pola istnieć mogą i panel pokazuje wtedy
 * „rozstrzygnięcie sprzed rejestrowania uzasadnień". Wymóg jest regułą wejścia
 * (`zod` na trasie), nie ograniczeniem tabeli — te dwie rzeczy dotyczą różnych
 * zbiorów wierszy.
 *
 * Indeks pod skrzynkę flag (A03): sortowanie listy to `(status, created_at DESC, id DESC)`.
 */
export const MIGRATION_10 = `
  ALTER TABLE flags ADD COLUMN IF NOT EXISTS resolved_by     TEXT;
  ALTER TABLE flags ADD COLUMN IF NOT EXISTS resolution_note TEXT;
  CREATE INDEX IF NOT EXISTS idx_flags_status_created ON flags (status, created_at DESC, id DESC);
`;

/**
 * Migracja 11: rodzaj operacji i klient w projekcji `sessions` (przekrój 2 panelu,
 * mockup `A02-dni.html`).
 *
 * Powód jest jedną regułą: **nowa liczba/wymiar w panelu = nowa KOLUMNA PROJEKCJI,
 * nigdy nowe wyrażenie SQL** (`docs/architektura-panelu-serwer.md` §7.2). Lista dni
 * bez rodzaju operacji jest bezużyteczna, a wyciąganie go w locie z `events.payload`
 * (`preflight_confirm`) byłoby drugim, równoległym odtwarzaniem projekcji — czyli
 * dokładnie tym, co zaczyna kłamać, gdy zmieni się reguła. Obie wartości SĄ JUŻ
 * w `SessionState` (`projections/session.ts`: `operation`, `client`), więc to
 * przepisanie projekcji, nie zmiana modelu zdarzeń.
 *
 * **`duty_start` NIE jest tu dokładany, choć §7.2 dokumentu go wymienia.** Kolumna
 * `claim_time` (migracja 2) już niesie `SessionState.dutyStart` — `sessionRowFrom`
 * mapuje `claimTime: s.dutyStart` od początku. Druga kolumna z tą samą wartością
 * byłaby dublem, który natychmiast zacząłby się rozjeżdżać. Rozbieżność NAZWY
 * z zawartością jest osobną sprawą, opisaną w docblocku `application/sessionRow.ts`.
 *
 * `CHECK` na `operation` — ten sam powód co przy `flags.type` (migracja 8): adapter
 * wczytuje wartość z powrotem do ZAMKNIĘTEJ unii (`OperationType`), więc bez
 * ograniczenia w bazie strażnik w adapterze byłby zgadywaniem, a z nim jest asercją,
 * która nigdy nie powinna wystąpić. `client` zostaje wolnym tekstem — to nazwa
 * odbiorcy wpisywana przez pilota, nie słownik.
 *
 * Indeks `idx_sessions_day` obsługuje sortowanie i kursor keyset listy dni.
 * `NULLS LAST` jest tu ISTOTNE, nie ozdobne: PostgreSQL domyślnie daje przy `DESC`
 * porządek `NULLS FIRST`, a `keysetOrderBy` żąda `NULLS LAST` (sesje bez preflightu
 * mają `claim_time = NULL` i mają lądować na końcu, nie na początku listy). Indeks
 * w domyślnym porządku NIE obsługiwałby zapytania listy — planer i tak sortowałby
 * pełny wynik przed `LIMIT`, czyli indeks byłby martwym kosztem zapisu.
 *
 * **Migracja wymaga PRZEBUDOWY PROJEKCJI**: nowe kolumny w istniejących wierszach
 * zostaną puste do najbliższej paczki zdarzeń danej sesji, a dla dni zamkniętych
 * takiej paczki już nie będzie. Przelicza je `npm run rebuild-projections`
 * (`AdminMaintenanceCommands.rebuildProjections`, mockup `A11-konserwacja.html`).
 */
export const MIGRATION_11 = `
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS operation TEXT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client    TEXT;
  ALTER TABLE sessions ADD CONSTRAINT sessions_operation_known CHECK (
    operation IS NULL OR operation IN ('skoki', 'ferry', 'egzamin', 'techniczny', 'inne')
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_day
    ON sessions (claim_time DESC NULLS LAST, session_uuid DESC);
`;

/**
 * Migracja 12: OBA indeksy dziennika audytu dopasowane do porządku, którym go czytamy.
 *
 * `idx_audit_created` powstał w migracji 9 jako `(created_at DESC, id DESC)` — a `DESC`
 * w PostgreSQL znaczy `NULLS FIRST`. Tymczasem `keysetOrderBy` (`infrastructure/pg/keyset.ts`)
 * generuje `DESC NULLS LAST` JAWNIE i celowo: domyślne porządki różnią się między `ASC`
 * a `DESC`, więc poleganie na nich dałoby dwa różne porządki pod jedną nazwą, a predykat
 * kursora musi opisywać dokładnie ten sam porządek co sortowanie.
 *
 * Skutek rozjazdu jest niewidoczny w wynikach i zabójczy dla wydajności: planer nie może
 * użyć indeksu do porządkowania, więc KAŻDA strona to `Seq Scan` + pełny `Sort` tabeli.
 * Zmierzone na PGlite przy 2000 wierszy: koszt pierwszej strony 109 zamiast 4, i rośnie
 * liniowo z dziennikiem, który z natury tylko przyrasta. Paginacja kursorem istnieje po to,
 * żeby koszt strony był STAŁY — bez pasującego indeksu wraca dokładnie ten problem,
 * przed którym miała chronić.
 *
 * **`idx_audit_actor` miał tę samą wadę i jeszcze jedną: brakowało mu `id`.** Filtr po
 * koncie (kolumna „Kto" na `A09` jest linkiem, więc to najczęstsze zawężenie ekranu)
 * sortuje tak samo — `(created_at DESC NULLS LAST, id DESC)` — a indeks bez tie-breakera
 * i bez `NULLS LAST` nie obsługuje tego porządku. Planer schodził wtedy na
 * `idx_audit_created` z filtrem albo na `Seq Scan`, czyli PIERWSZA strona zawężenia
 * kosztowała tyle, co przejrzenie całego dziennika. Trzy kolumny w tej kolejności
 * (równość, potem porządek) obsługują filtr i sortowanie jednym przejściem.
 *
 * Wada spała od migracji 9, bo do ekranu `A09` nikt tej tabeli nie czytał. Wzorzec
 * poprawny mieliśmy już obok: `idx_sessions_day` (migracja 11) od początku niesie
 * `NULLS LAST`. `created_at` jest `NOT NULL`, więc nulli tu nigdy nie będzie — ale
 * planer dopasowuje porządek indeksu SKŁADNIOWO i o ograniczeniu nie wnioskuje.
 *
 * Że oba indeksy faktycznie NIOSĄ porządek, sprawdza `EXPLAIN` w `test/adminAudit.test.ts`
 * (brak węzła `Sort` w planie obu zapytań listy) — zdanie w prozie już raz nie
 * powstrzymało powielenia tej wady.
 *
 * **SPROSTOWANIE (migracja 17, 2026-08-02): kierunek naprawy był ODWROTNY.** `NULLS LAST`
 * na kolumnie `NOT NULL` nie opisuje żadnego realnego porządku, a odbiera indeks w drugim
 * kierunku sortowania. Oba indeksy dziennika wracają do postaci bez tego dopisku, a
 * `keysetOrderBy` emituje `NULLS` wyłącznie dla klucza NULL-owalnego. Uzasadnienie
 * i pomiary: `MIGRATION_17` niżej.
 */
export const MIGRATION_12 = `
  DROP INDEX IF EXISTS idx_audit_created;
  CREATE INDEX IF NOT EXISTS idx_audit_created
    ON admin_audit (created_at DESC NULLS LAST, id DESC);

  DROP INDEX IF EXISTS idx_audit_actor;
  CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON admin_audit (actor_pilot_id, created_at DESC NULLS LAST, id DESC);
`;

/**
 * Migracja 13: znacznik UNIEWAŻNIENIA POŚWIADCZEŃ konta (przekrój A06, 2026-08-01).
 *
 * ══ CO ZAMYKA ══
 * Sesja panelu to podpisany JWT w ciasteczku `uzaero_admin` z TTL 8 h — i NIE MA dla
 * niej wiersza w bazie. `RefreshTokensAdminPort.revokeAllFor` kasuje `refresh_tokens`,
 * czyli sesje TELEFONU; ciasteczka panelu nie ma czym unieważnić, bo nie ma czego
 * skasować. Skutek przed tą migracją: wykradzione poświadczenie panelu przeżywało
 * reset hasła nawet o osiem godzin, a ekran `A06a` pisał „Aktywne sesje pilota —
 * unieważnione". Obietnica bez pokrycia, dokładnie w operacji, która istnieje po to,
 * żeby dostęp odebrać.
 *
 * ══ DLACZEGO KOLUMNA, A NIE TABELA SESJI PANELU ══
 * Tabela sesji przeglądarkowych oznaczałaby wiersz na każde logowanie i wpis do
 * skasowania przy każdym wylogowaniu — a pytanie, na które trzeba odpowiedzieć, brzmi
 * „czy to poświadczenie jest starsze niż ostatnie unieważnienie". Odpowiada na nie
 * JEDNA data przy koncie, którą brama i tak czyta przy każdym żądaniu panelu
 * (`http/authorize.ts`), więc kontrola NIE KOSZTUJE dodatkowego zapytania.
 *
 * `NULL` znaczy „poświadczeń tego konta nigdy nie unieważniano" i jest wartością
 * domyślną dla kont istniejących — inaczej wdrożenie wylogowałoby wszystkich naraz
 * bez powodu. Znacznik przesuwają DWIE operacje: reset hasła i deaktywacja
 * (`application/admin/commands/pilots.ts`).
 *
 * Porównanie jest po stronie serwera i celowo GRUBOZIARNISTE: token niesie `iat`
 * w SEKUNDACH (RFC 7519), więc odrzucamy token, którego sekunda wydania jest
 * WCZEŚNIEJSZA niż znacznik. Zaokrąglenie działa w stronę bezpieczną — token wydany
 * w tej samej sekundzie co unieważnienie zostaje odrzucony, a nie przepuszczony.
 */
export const MIGRATION_13 = `
  ALTER TABLE pilots ADD COLUMN IF NOT EXISTS credentials_valid_from TIMESTAMPTZ;
`;

/**
 * Migracja 14: JEDNA REWIZJA KARTY = JEDEN WIERSZ DZIENNIKA (przekrój A05, 2026-08-01).
 *
 * ══ CO ZAMYKA ══
 * `export_log` jest append-only i to jest jego cała wartość: po nim, i tylko po nim, da
 * się odpowiedzieć na pytanie „co widział skarbnik klubu, kiedy zamykał miesiąc".
 * Numer rewizji nadawał jednak `DayExporter` sekwencją „odczytaj ostatnią → dodaj jeden
 * → zapisz", w trzech osobnych zapytaniach bez transakcji. Dwa równoległe eksporty tej
 * samej sesji (spóźniona paczka z telefonu W CHWILI, gdy administrator klika „Ponów")
 * czytały ten sam stan i zapisywały DWA wiersze z rewizją 3. Dziennik, w którym numer
 * rewizji nie jest kluczem, przestaje odpowiadać na pytanie, dla którego istnieje.
 *
 * ══ DLACZEGO OGRANICZENIE, A NIE SAMA OSTROŻNOŚĆ W KODZIE ══
 * Ta sama decyzja, co przy `uq_flags_type_sessions` (migracja 3): dedupe w adapterze
 * przegrywa wyścig dwóch transakcji, a ograniczenie jest jedyną gwarancją, której nie
 * da się ominąć timingiem. Serializację (advisory lock na `session_uuid`, wzorzec
 * `lockAircraft`) dokłada `ExportLogPort.lock`.
 *
 * **Czego ogranicznenie łapie NAPRAWDĘ** (sprostowanie 2026-08-01 — poprzednia wersja
 * tego komentarza mówiła „drugą instancję procesu, której blokada by nie objęła" i było
 * to po prostu nieprawdą): `pg_advisory_xact_lock` jest blokadą KLASTROWĄ, więc dwie
 * instancje serwera na tej samej bazie szeregują się na niej dokładnie tak samo jak dwie
 * transakcje w jednym procesie. `UNIQUE` broni przed czymś innym i węższym:
 *  • ręcznym `INSERT`-em w `psql` (skrypt naprawczy, migracja danych z zewnątrz),
 *  • przyszłą ścieżką kodu, która dopisze wiersz, zapominając zawołać `lock()`,
 *  • starymi duplikatami — ujawnia je przy zakładaniu ograniczenia, zamiast zostawić
 *    w dzienniku dwa wiersze o tym samym numerze rewizji.
 *
 * **Blokada NIE MA testu i tak zostaje zapisane.** Jej jedynym dowodem jest rozumowanie:
 * PGlite ma JEDNO połączenie i szereguje transakcje własnym mutexem, więc po usunięciu
 * `pg_advisory_xact_lock` przypadki w `test/adminExports.test.ts` nadal przechodzą
 * (sprawdzone). Test udający równoległość dawałby fałszywe poczucie pokrycia — dlatego
 * go nie ma, a ta luka jest tu nazwana.
 *
 * **Przegrany wyścig wraca jako `23505` i kończy się PIĘĆSETKĄ** — tłumaczenia na odmowę
 * NIE MA i nie należy go tu obiecywać (drugie sprostowanie 2026-08-01). `uniqueConflictOn`
 * (`application/admin/commands/uniqueConflict.ts`) obsługuje formularze kont i floty,
 * gdzie kolizja jest zajętą wartością do poprawienia przez człowieka; tutaj kolizja
 * numeru rewizji jest awarią serializacji, a nie polem do zmiany, więc nie ma czego
 * pokazać w formularzu. Ponowienie z panelu odróżnia ten przypadek od awarii arkuszy
 * (`ExportFailureDto: 'unexpected'` vs `'sheets_adapter'`), żeby administrator nie
 * dostał zdania „spróbuj za chwilę" na błąd, który sam nie minie.
 *
 * **Migracja WYWALI SIĘ na bazie, w której duplikat rewizji już powstał** — i tak ma
 * być: to jest dokładnie ten stan, o którym trzeba się dowiedzieć, a nie ten, który
 * wolno cicho przepuścić. Runner wykonuje skrypt i wpis o zastosowaniu jedną transakcją,
 * więc nieudana migracja nie zostawia półproduktu.
 *
 * `idx_export_log_session` (migracja 4) znika, bo nowy indeks unikalności ma tę samą
 * kolumnę wiodącą i obsługuje oba pytania dziennika: „wiersze tej sesji" i „ostatnia
 * rewizja" (`ORDER BY revision DESC`). Dwa indeksy o tym samym prefiksie to koszt
 * zapisu bez czytelnika.
 */
export const MIGRATION_14 = `
  ALTER TABLE export_log ADD CONSTRAINT uq_export_log_revision UNIQUE (session_uuid, revision);
  DROP INDEX IF EXISTS idx_export_log_session;
`;

/**
 * Migracja 15: indeks po `events.received_at` — oś PULSU SYSTEMU (`A01`).
 *
 * Pulpit zadaje rejestrowi trzy pytania po ZEGARZE SERWERA: „co przyszło ostatnio"
 * (`ORDER BY received_at DESC LIMIT 6`), „ile przyszło w każdej z ostatnich dwunastu
 * godzin" i „ile przyszło dziś". Rejestr `events` ma dziś indeksy po `session_uuid`
 * i `aircraft_id` — żaden z nich nie obsługuje ani sortowania, ani zakresu po czasie
 * przyjęcia, więc każde z tych pytań byłoby PEŁNYM SKANOWANIEM tabeli, która rośnie
 * bez granicy.
 *
 * To jest dokładnie ten rodzaj kosztu, którego nie widać na starcie: pulpit ładuje się
 * natychmiast w pierwszym miesiącu i coraz wolniej w każdym następnym, a jest ekranem,
 * na którym KAŻDY zalogowany ląduje jako pierwszym. `uuid` jako druga kolumna, bo
 * porządek listy jest po parze `(received_at, uuid)` — cała paczka z jednego synca ma
 * identyczny `received_at`, więc bez rozstrzygnięcia sortowanie byłoby niestabilne.
 */
export const MIGRATION_15 = `
  CREATE INDEX IF NOT EXISTS idx_events_received ON events (received_at DESC, uuid DESC);
`;

/**
 * Migracja 16: rejestr zdarzeń pod LISTĘ ŚLEDCZĄ (`A04`, 2026-08-01).
 *
 * ══ 1. `idx_events_received` DOSTAJE `NULLS LAST` — TA SAMA WADA, CO W MIGRACJI 12 ══
 * Indeks z migracji 15 stoi jako `(received_at DESC, uuid DESC)`, czyli — bo taka jest
 * wartość domyślna dla `DESC` — `NULLS FIRST`. Paginacja kursorowa panelu emituje
 * `ORDER BY … DESC NULLS LAST` **jawnie w obu kierunkach** (`keysetOrderBy`: poleganie
 * na domyślnych oznaczałoby dwa różne porządki pod jedną nazwą). Te dwa zapisy NIE
 * PASUJĄ do siebie składniowo, a planer PostgreSQL-a **nie skraca tego przez `NOT NULL`
 * kolumny** — sprawdzone `EXPLAIN`-em, nie z lektury (`test/adminEvents.test.ts`):
 * przy 5 000 wierszy plan schodzi z `Index Only Scan` na `Bitmap Heap Scan` + `Sort`
 * CAŁEJ tabeli przed `LIMIT`-em. Wynik jest wtedy poprawny, a koszt strony rośnie
 * liniowo z rejestrem — czyli dokładnie to, czemu kursor miał zapobiec.
 *
 * Ta sama wada zdążyła się już raz powielić na drugi indeks dziennika audytu, dopóki
 * istniała wyłącznie w prozie. Dlatego tutaj pilnuje jej `EXPLAIN` w teście, a nie
 * zdanie w komentarzu.
 *
 * **Skutek uboczny, o którym trzeba wiedzieć:** dopasowanie działa w OBIE strony, więc
 * po tej zmianie zapytanie bez `NULLS LAST` przestaje dostawać porządek z indeksu.
 * Dlatego `PgAdminDashboardRepo.recent` (karta „Ostatnio przyjęte", `A01`) dostaje
 * `NULLS LAST` w tym samym commicie — inaczej naprawa listy zepsułaby pulpit.
 *
 * **SPROSTOWANIE (migracja 17, 2026-08-02): to nie była naprawa, tylko przesunięcie
 * wady na `?sort=asc`.** Indeks `DESC NULLS LAST` skanowany wstecz daje `ASC NULLS
 * FIRST`, a `keysetOrderBy` prosił wtedy o `ASC NULLS LAST` — więc jeden klik
 * w nagłówek kolumny sortował cały rejestr przed `LIMIT`-em (koszt 442 zamiast ~10).
 * Migracja 17 zdejmuje `NULLS LAST` z tego indeksu i z obu indeksów audytu, a `NULLS`
 * emitujemy odtąd wyłącznie dla klucza NULL-owalnego. `recent` wraca razem z nimi.
 *
 * ══ 2. `idx_events_correction_target` — SKĄD WIADOMO, ŻE ZDARZENIE UNIEWAŻNIONO ══
 * Rejestr pokazuje zdarzenie unieważnione korektą PRZEKREŚLONE, ale obecne — to
 * właśnie te wiersze tłumaczą, dlaczego liczby dnia różnią się od tego, co zapisał
 * telefon. Żeby to rozstrzygnąć, strona dobiera korekty celujące w swoje wiersze
 * (`payload->>'targetUuid'`), także spoza zakresu dat: zdarzenie sprzed miesiąca mogło
 * zostać unieważnione wczoraj.
 *
 * Indeks jest CZĘŚCIOWY (`WHERE type = 'event_correction'`) i wyrażeniowy, bo korekty
 * są ułamkiem rejestru — pełny indeks po wyrażeniu z `JSONB` kosztowałby przy każdym
 * przyjęciu paczki, a odpowiadałby na pytanie zadawane wyłącznie o korekty. Bez niego
 * to zapytanie jest pełnym skanowaniem rejestru RAZ NA STRONĘ.
 */
export const MIGRATION_16 = `
  DROP INDEX IF EXISTS idx_events_received;
  CREATE INDEX IF NOT EXISTS idx_events_received
    ON events (received_at DESC NULLS LAST, uuid DESC);

  CREATE INDEX IF NOT EXISTS idx_events_correction_target
    ON events ((payload->>'targetUuid'))
    WHERE type = 'event_correction';
`;

/**
 * Migracja 17: KONIEC z `NULLS LAST` na kluczach `NOT NULL` (2026-08-02).
 *
 * ══ CO TU NAPRAWDĘ BYŁO ZEPSUTE ══
 * Migracja 16 „naprawiła" rozjazd indeksu rejestru, dopisując `NULLS LAST` do
 * `idx_events_received` — bo tyle emitował `keysetOrderBy`. Wada nie zniknęła, tylko
 * przeniosła się na DRUGI kierunek: indeks `(received_at DESC NULLS LAST, uuid DESC)`
 * skanowany wstecz daje `ASC NULLS FIRST`, a `?sort=asc` prosi o `ASC NULLS LAST`.
 * Zmierzone `EXPLAIN`-em na 5 000 wierszy: `?sort=asc` sortował CAŁY rejestr przed
 * `LIMIT`-em (koszt 442 zamiast ~10). Wystarczył jeden klik w nagłówek kolumny.
 *
 * To był trzeci nawrót tej samej pułapki (migracje 12, 16 i ta), więc naprawa idzie
 * do ŹRÓDŁA: `keysetOrderBy` emituje `NULLS` wyłącznie dla klucza, który faktycznie
 * bywa `NULL` (`CursorShape.k1Nullable`). Dla kolumny `NOT NULL` zostaje czyste
 * `DESC`/`ASC`, a to są zapisy DOMYŚLNE — więc jeden indeks `(x DESC, y DESC)`
 * obsługuje OBA kierunki: skanem w przód `DESC, DESC`, skanem wstecz `ASC, ASC`.
 *
 * ══ CO Z TEGO WYNIKA DLA INDEKSÓW ══
 * Trzy indeksy stojące pod kluczami `NOT NULL` wracają do postaci bez `NULLS LAST` —
 * inaczej przestałyby pasować do zapytań PO naprawie. Wynik był i jest identyczny;
 * zmienia się wyłącznie to, czy planer może użyć indeksu do porządkowania:
 *
 *  • `idx_events_received`  — rejestr `A04` (oba kierunki) i pulpit `A01` (`recent`);
 *  • `idx_audit_created`    — dziennik audytu `A09` bez zawężenia;
 *  • `idx_audit_actor`      — dziennik audytu zawężony po koncie działającego.
 *
 * `idx_sessions_day` (migracja 11) zostaje BEZ ZMIAN i to jest cała pointa reguły:
 * `sessions.claim_time` jest NULL-owalne (dzień bez `preflight_confirm` nie ma duty
 * startu), więc tam `NULLS LAST` opisuje realny porządek, a nie ozdobę.
 *
 * Że wszystkie cztery kombinacje rejestru (`desc`/`asc` × z kursorem/bez) faktycznie
 * NIOSĄ porządek z indeksu, sprawdza `EXPLAIN` w `test/adminEvents.test.ts`. Poprzednia
 * wersja testu badała wyłącznie `desc` — i dlatego wada przeszła.
 */
export const MIGRATION_17 = `
  DROP INDEX IF EXISTS idx_events_received;
  CREATE INDEX IF NOT EXISTS idx_events_received
    ON events (received_at DESC, uuid DESC);

  DROP INDEX IF EXISTS idx_audit_created;
  CREATE INDEX IF NOT EXISTS idx_audit_created
    ON admin_audit (created_at DESC, id DESC);

  DROP INDEX IF EXISTS idx_audit_actor;
  CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON admin_audit (actor_pilot_id, created_at DESC, id DESC);
`;

/**
 * Migracja 18: STATYSTYKI zakresu z kolumn projekcji (przekrój A10, 2026-08-03).
 *
 * Reguła jest ta sama, co przy migracji 11 i stoi w `docs/architektura-panelu-serwer.md`
 * §7.2: **nowa liczba w panelu = nowa kolumna projekcji wypełniana przez
 * `sessionRowFrom`, nigdy nowe wyrażenie SQL.** Ekran `A10` sumuje starty/lądowania,
 * paliwo zużyte, przyrost motogodzin i stronę przychodową zrzutów — a projekcja żadnej
 * z tych wielkości dotąd nie niosła (dlatego pulpit `A01` pokazywał przy zrzutach kreskę).
 *
 * Co niesie która kolumna (wszystkie przepisane z `projectSession`, `@uzaero/domain`):
 *  • `takeoff_count` / `landing_count` — liczniki zdarzeń; NIE to samo co `flights_count`
 *    (drugi `takeoff` w powietrzu podbija licznik, ale nie otwiera drugiego lotu);
 *  • `mh_delta_h` / `fuel_consumed_l` — bilanse dnia; `NULL`, dopóki nie ma `day_close`,
 *    razem z regułą projekcji („zużycie istnieje dopiero z odczytem końcowym");
 *  • `drop_count`, `jumpers_tandem/aff/solo` — wyniesienia i skoczkowie wg typów;
 *  • `drop_alt_sum_ft` / `drop_alt_count` — SUMA wysokości zrzutów Z FIXEM i ich
 *    LICZNIK, celowo zamiast średniej: średnia per sesja nie składa się w średnią
 *    zakresu, a zrzut bez wysokości nie wchodzi ani do sumy, ani do licznika
 *    (mockup A10: „7 bez wysokości nie wchodzi do średniej").
 *
 * `NULL` w KAŻDEJ z tych kolumn znaczy „wiersz sprzed tej migracji, jeszcze
 * nieprzeliczony" — a nie zero. Agregaty `A10` odróżniają ten stan po `takeoff_count
 * IS NULL` (kolumny wypełnia się razem) i wtedy zamiast liczby pokazują kreskę
 * z liczbą wierszy do przebudowy.
 *
 * Indeks częściowy po `close_time`: zakres statystyk liczy się PO DNIU ZAMKNIĘCIA
 * (dzień wchodzi do sum tam, gdzie został domknięty), więc każde zapytanie `A10`
 * zawęża `status = 'closed' AND close_time BETWEEN …` — bez indeksu byłby to pełny
 * skan projekcji przy każdym wejściu na ekran raportów.
 *
 * **Migracja wymaga PRZEBUDOWY PROJEKCJI** — dokładnie jak 11: nowe kolumny
 * w istniejących wierszach zostaną puste do najbliższej paczki zdarzeń danej sesji,
 * a dla dni zamkniętych takiej paczki już nie będzie. Przelicza je
 * `AdminMaintenanceCommands.rebuildProjections` (`A11`) — jego test ma osobny
 * przypadek na kolumny tej migracji.
 */
export const MIGRATION_18 = `
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS takeoff_count   INTEGER;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS landing_count   INTEGER;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mh_delta_h      DOUBLE PRECISION;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fuel_consumed_l DOUBLE PRECISION;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS drop_count      INTEGER;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS jumpers_tandem  INTEGER;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS jumpers_aff     INTEGER;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS jumpers_solo    INTEGER;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS drop_alt_sum_ft DOUBLE PRECISION;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS drop_alt_count  INTEGER;
  CREATE INDEX IF NOT EXISTS idx_sessions_closed_day
    ON sessions (close_time) WHERE status = 'closed';
`;

/**
 * Migracja 19: NORMA ZUŻYCIA per samolot — materializacja modelu dla telefonów (2026-08-05).
 *
 * ══ DLACZEGO TABELA, A NIE LICZENIE W LOCIE ══
 * `GET /reference` woła KAŻDY telefon co kwadrans. Model zużycia czyta strumienie
 * kilkudziesięciu sesji i puszcza przez regresję — koszt zupełnie inny niż odczyt
 * konfiguracji floty. Liczenie go na żądanie telefonu byłoby wpuszczeniem analityki
 * na ścieżkę, która ma być tania i zawsze dostępna. Memo w procesie nie wystarcza:
 * nie przeżywa restartu i rozjeżdża się między instancjami.
 *
 * ══ DLACZEGO JSONB, A NIE KOLUMNY ══
 * Kształt `ConsumptionNorm` należy do domeny i będzie się zmieniał razem z modelem
 * (dojdą fazy pionowe). Serwer tej struktury nie filtruje ani nie sortuje — zapisuje
 * ją i oddaje. Rozbicie na osiem kolumn dałoby osiem miejsc do zapomnienia przy
 * następnym polu i migrację przy każdej zmianie modelu. To jest ta sama decyzja,
 * co przy `flags.details` i `events.payload`.
 *
 * ══ CO ZNACZY BRAK WIERSZA ══
 * „Model poniżej progu publikacji albo jeszcze nieliczony" — czyli dokładnie to samo,
 * co `consumption: null` w kontrakcie. Telefon nie pokazuje wtedy porównania z normą,
 * zamiast pokazywać zero.
 *
 * `computed_at` jest stemplem POLICZENIA, nie zapisu: wchodzi do odpowiedzi i pozwala
 * telefonowi powiedzieć, jak stara jest podpowiedź, niezależnie od wieku samego cache'u.
 */
export const MIGRATION_19 = `
  CREATE TABLE IF NOT EXISTS aircraft_consumption (
    aircraft_id  TEXT PRIMARY KEY,
    window_days  INTEGER NOT NULL,
    model        JSONB NOT NULL,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

/**
 * Migracja 20: NOTATKA PILOTA DO DNIA w projekcji `sessions` (issue #14, 2026-08-06).
 *
 * ══ DLACZEGO KOLUMNA, A NIE ODCZYT Z PAYLOADU ══
 * Ta sama reguła, co przy migracji 11 (`operation`, `client`) i 18: wartość jest już
 * policzona przez `projectSession` (`SessionState.notes`), więc kolumna jest jej
 * PRZEPISANIEM, a nie nowym modelem. Wyciąganie notatki w locie z `events.payload`
 * byłoby drugim, równoległym odtwarzaniem projekcji — czyli tym, co zaczyna kłamać,
 * gdy zmieni się reguła (dziś: „ostatni `preflight_confirm` wygrywa").
 *
 * ══ DLACZEGO WOLNY TEKST BEZ OGRANICZENIA ══
 * `notes` jest zdaniem pilota o okolicznościach dnia („lot z uczniem", „drugi zbiornik
 * nie działa"), nie słownikiem — więc żadnego `CHECK`-a, dokładnie jak przy `client`.
 * Długość pilnuje reguła WEJŚCIA (`zod` na trasie `POST /events`, 2000 znaków), a nie
 * ograniczenie tabeli: te dwie rzeczy dotyczą różnych zbiorów wierszy, a `TEXT` bez
 * limitu w PostgreSQL nie kosztuje ani bajtu więcej niż `VARCHAR(n)`.
 *
 * ══ CO ZNACZY `NULL` ══
 * „Dzień bez notatki" — stan całkowicie normalny i najczęstszy. Nie ma tu drugiego
 * znaczenia „wiersz sprzed migracji" (jak przy kolumnach migracji 18), bo notatki
 * przed tą migracją nie dało się wpisać: telefony wysyłające `preflight_confirm`
 * bez pola `notes` są zgodne WSTECZ i mają zostawać `NULL`.
 *
 * **Przebudowy projekcji ta migracja NIE wymaga** — inaczej niż 11 i 18. Tamte
 * dokładały kolumny na wartości, które w rejestrze JUŻ były i tylko nie miały gdzie
 * wylądować; tutaj pusta kolumna w starych wierszach to prawda o tych dniach, a nie
 * dziura do wypełnienia. Uruchomienie `A11` po tej migracji jest bezpieczne i nic
 * nie zmieni — i to jest właściwe zachowanie, nie przeoczenie.
 */
export const MIGRATION_20 = `
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes TEXT;
`;

/**
 * Migracja 21: `sessions.claim_time` zaczyna nieść CZAS PRZEJĘCIA (decyzja 2026-08-07).
 *
 * ══ CO SIĘ ZMIENIA ══
 * Kolumna od migracji 2 nazywała się `claim_time`, a niosła `SessionState.dutyStart`,
 * czyli godzinę MELDUNKU z `preflight_confirm`. Rozjazd nazwy z zawartością był opisany
 * i świadomy — do chwili, w której meldunek stał się opcjonalny (§3.6a). Od tego momentu
 * kolumna byłaby `NULL` w ZWYKŁYM przypadku, a nie w brzegowym, co wywraca wszystko,
 * co się o nią opiera: sortowanie listy dni, kursor keyset, indeks `idx_sessions_day`,
 * filtr zakresu dat i rozpoznanie sesji „bez daty".
 *
 * Nowa zawartość: czas zdarzenia `session_claim`, czyli `COALESCE(gps_time, device_time)`
 * — dokładnie to, co domena liczy jako `SessionState.claimedAt` (`eventTime`).
 *
 * ══ DLACZEGO NIE NOWA KOLUMNA ══
 * Bo stara wartość NIE MA następcy po tej stronie. Klamra służby przestała być
 * właściwością sesji: należy do PILOTA, obejmuje kilka maszyn i liczy się projekcją
 * `projectDuty` per pilot per doba UTC. Kolumna `duty_start` w tabeli `sessions` byłaby
 * miejscem na wielkość, która do sesji nie należy — a deklaracja pilota i tak zostaje
 * w rejestrze zdarzeń, skąd bierze ją ta projekcja.
 *
 * ══ BACKFILL I PRZEBUDOWA ══
 * Backfill przepisuje wartość z rejestru, więc jest bezpieczny i idempotentny: dla
 * każdej sesji bierze czas jej `session_claim`. Sesje bez tego zdarzenia (niemożliwe
 * wg §4.4, ale rejestr bywa niekompletny po imporcie) zostają nietknięte.
 *
 * **`rebuild-projections` po tej migracji ZOBACZY RÓŻNICĘ i jest to OCZEKIWANE** — to
 * jedyny znany wyjątek od reguły „niezerowy dry-run = incydent" (`A11`). Backfill robi
 * to samo, co zrobiłaby przebudowa; jest tutaj, żeby panel nie pokazywał przez chwilę
 * meldunków w kolumnie opisanej jako przejęcie.
 */
export const MIGRATION_21 = `
  UPDATE sessions s
     SET claim_time = e.at
    FROM (
      SELECT session_uuid, MIN(COALESCE(gps_time, device_time)) AS at
        FROM events
       WHERE type = 'session_claim'
       GROUP BY session_uuid
    ) e
   WHERE e.session_uuid = s.session_uuid
     AND (s.claim_time IS DISTINCT FROM e.at);
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
  MIGRATION_9,
  MIGRATION_10,
  MIGRATION_11,
  MIGRATION_12,
  MIGRATION_13,
  MIGRATION_14,
  MIGRATION_15,
  MIGRATION_16,
  MIGRATION_17,
  MIGRATION_18,
  MIGRATION_19,
  MIGRATION_20,
  MIGRATION_21,
];

/**
 * Jednozdaniowy opis KAŻDEJ migracji — kolumna „Co wprowadza" z ekranu `A11`.
 *
 * ══ DLACZEGO TO STOI TUTAJ, A NIE W PANELU ══
 * Bo tutaj stoi DDL. Lista opisów trzymana po drugiej stronie drutu rozjeżdżałaby się
 * przy pierwszej nowej migracji i nikt by tego nie zauważył — panel wypisywałby wtedy
 * opis migracji 17 przy migracji 18. Tu rozjazd jest niemożliwy do przeoczenia: długość
 * tej tablicy musi się równać długości `MIGRATIONS` i pilnuje tego `test/schema.test.ts`.
 *
 * Opisy są streszczeniem docbloków wyżej, a nie ich powtórzeniem: ekran ma powiedzieć,
 * CO migracja wprowadza, a nie dlaczego — uzasadnienia zostają przy kodzie.
 */
export const MIGRATION_TITLES: readonly string[] = [
  'Fundament: pilots, aircraft, refresh_tokens, events',
  'Projekcje serwera: sessions i flags',
  'Unikalność flag na poziomie bazy (UNIQUE po typie i sesjach)',
  'Dziennik eksportu export_log — append-only, rewizja +1',
  'Treść kart exported_sheets — bazodanowy adapter SheetsPort',
  'Motyw jako preferencja pilota: pilots.theme + theme_updated_at',
  'Rola konta: pilots.role z CHECK i domyślnym `pilot`',
  'Słownik typów flag w bazie (CHECK na flags.type)',
  'Dziennik akcji administratorów: admin_audit',
  'Flaga pamięta, KTO i JAK ją rozstrzygnął (resolved_by, resolution_note)',
  'Rodzaj operacji i klient w projekcji: sessions.operation, sessions.client',
  'Indeksy dziennika audytu dopasowane do porządku odczytu',
  'Znacznik unieważnienia poświadczeń: pilots.credentials_valid_from',
  'Jedna rewizja karty = jeden wiersz dziennika (UNIQUE na export_log)',
  'Indeks po events.received_at — oś pulsu systemu',
  'Rejestr zdarzeń pod listę śledczą (indeksy typu, pilota i urządzenia)',
  'Koniec z NULLS LAST na kluczach NOT NULL (rejestr i audyt)',
  'Kolumny statystyk w projekcji: starty/lądowania, bilanse dnia i zrzuty',
  'Norma zużycia per samolot: aircraft_consumption (materializacja modelu)',
  'Notatka pilota do dnia w projekcji: sessions.notes',
  'sessions.claim_time niesie czas przejęcia (session_claim), nie meldunek',
];
