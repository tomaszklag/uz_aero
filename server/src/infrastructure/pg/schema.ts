/**
 * UZ Aero (serwer) - schemat PostgreSQL jako czysty tekst (§5.3).
 *
 * Ten sam wzorzec co `app/src/infrastructure/storage/schema.ts` i z tego samego powodu:
 * DDL trzymany osobno da się uruchomić na prawdziwym silniku w testach (tu: PGlite,
 * Postgres w procesie Node) - błąd składni wychodzi w sekundę, nie na serwerze.
 *
 * ══ JEDNA MIGRACJA BAZOWA (zgniecenie 2026-08-08) ══
 * Do 2026-08-08 stały tu 23 migracje: `CREATE TABLE`, potem dwadzieścia dwie poprawki,
 * z których kilka odwoływało poprzednie (indeksy przechodziły przez trzy kształty, zanim
 * wróciły do drugiego). Zgnieliśmy je w JEDEN skrypt opisujący schemat DOCELOWY, bo faza
 * 5 (testy z pilotami) jeszcze się nie zaczęła i **nie istnieją żadne dane produkcyjne
 * do zachowania** - backfille z migracji 21 i 22 nie miały już czego przepisywać.
 *
 * Warunek, na którym to zrobiliśmy, brzmiał: **uzasadnienia mają przetrwać**. Stoją więc
 * niżej, przy kolumnach i ograniczeniach, których dotyczą - nie w historii gita, bo tam
 * nikt nie zagląda, czytając definicję tabeli. Rzeczy, które opisują DROGĘ do tego
 * schematu (trzy podejścia do `NULLS LAST`, sprostowania do `UNIQUE` dziennika eksportu,
 * dwa przesunięcia znaczenia karty arkusza) przeniosły się do
 * `docs/architektura-panelu-serwer.md` §7.8 - tam są narracją o pułapkach, a tutaj byłyby
 * opowieścią o numerach, które przestały istnieć.
 *
 * **Odwołania „migracja N" w kodzie i dokumentacji zostały przepisane na NAZWY rzeczy**
 * (kolumn, ograniczeń, indeksów). Tam, gdzie dokument opisuje przebieg prac z lipca
 * i sierpnia 2026 (`architektura-panelu-serwer.md` §5, §10, §11), numery zostają - opisują
 * historię projektu, a nie stan bazy.
 *
 * ══ CZTERY REGUŁY, KTÓRE OBOWIĄZUJĄ CAŁY TEN PLIK ══
 *
 * **1. `events` jest append-only; `sessions`, `flags`, `export_log` to PROJEKCJE.**
 * Serwer niczego nie edytuje - korekty przychodzą jako zdarzenia `event_correction` (04c),
 * a projekcje są odświeżane w tej samej transakcji, w której przyjmujemy zdarzenia,
 * i zawsze odtwarzalne ze strumienia (`npm run rebuild-projections`, ekran `A11`).
 *
 * **2. Nowa liczba w panelu = nowa KOLUMNA PROJEKCJI, nigdy nowe wyrażenie SQL**
 * (`docs/architektura-panelu-serwer.md` §7.2). Wszystkie kolumny liczbowe `sessions` są
 * PRZEPISANIEM wartości policzonej przez `projectSession` (`@uzaero/domain`) razem z jej
 * regułą. Wyciąganie tych samych rzeczy w locie z `events.payload` byłoby drugim,
 * równoległym odtwarzaniem projekcji - czyli tym, co zaczyna kłamać, gdy zmieni się reguła.
 *
 * **3. `CHECK` na słowniku zakłada się tam, gdzie adapter wczytuje wartość z powrotem
 * do ZAMKNIĘTEJ unii TypeScriptu** (`flags.type`, `pilots.role`, `sessions.operation`) -
 * bez ograniczenia w bazie strażnik w adapterze byłby zgadywaniem, a z nim jest asercją,
 * która nigdy nie powinna wystąpić. Zapisy HISTORYCZNE (`admin_audit.action`,
 * `admin_audit.actor_role`) `CHECK`-a NIE mają i mieć nie mogą: przemianowanie akcji nie
 * może unieważnić tego, co zdarzyło się rok temu. Wolny tekst wpisywany przez człowieka
 * (`sessions.client`, `sessions.notes`) też nie - to nie są słowniki, a długości pilnuje
 * reguła WEJŚCIA (`zod` na trasie), bo dotyczy innego zbioru wierszy niż tabela.
 *
 * **4. Indeks niesie `NULLS` WYŁĄCZNIE dla klucza, który faktycznie bywa `NULL`.**
 * `keysetOrderBy` (`infrastructure/pg/keyset.ts`) emituje `NULLS` po tej samej zasadzie
 * (`CursorShape.k1Nullable`), a planer dopasowuje porządek indeksu SKŁADNIOWO i o `NOT NULL`
 * nie wnioskuje - więc `NULLS LAST` na kolumnie `NOT NULL` nie opisuje żadnego realnego
 * porządku, a ODBIERA indeks drugiemu kierunkowi sortowania (skan wstecz daje wtedy
 * `ASC NULLS FIRST`, o które nikt nie prosi). Ta reguła kosztowała trzy podejścia i jest
 * jedyną, której złamanie nie zmienia ŻADNEGO wyniku - tylko koszt strony, z ~10 na ~440.
 * Pilnują jej `EXPLAIN`-y w `test/adminEvents.test.ts` i `test/adminAudit.test.ts`
 * (brak węzła `Sort` w planie), bo zdanie w prozie już raz nie powstrzymało powielenia wady.
 *
 * ══ RUNNER ROBI SKRYPT I WPIS JEDNĄ TRANSAKCJĄ ══
 * Dlatego migracje NIE MUSZĄ być pisane idempotentnie (`migrate.ts`): stan „zastosowana,
 * ale nieodnotowana" jest niemożliwy, więc `ADD CONSTRAINT` bez `IF NOT EXISTS` przestał
 * być pułapką blokującą start serwera. `IF NOT EXISTS` zostaje mimo to tam, gdzie nic
 * nie kosztuje.
 */

export const SCHEMA_VERSION = 2;

/**
 * Migracja bazowa - CAŁY schemat serwera.
 *
 * Kolejność kolumn jest DZIEDZICTWEM dwudziestu trzech migracji sprzed zgniecenia
 * (kolumny dokładane `ALTER`-em lądowały na końcu tabeli) i zostaje zachowana świadomie:
 * dzięki temu `test/schema.test.ts` - który przybija listy kolumn na sztywno - nie musiał
 * się zmienić i sam jest dowodem, że zgnieciony schemat jest identyczny z tym, który
 * produkowała historia. Nowe kolumny dokładaj na końcu właściwej tabeli.
 */
export const MIGRATION_1 = `
  -- ═══ KONTA ══════════════════════════════════════════════════════════════════
  -- Konta zakłada wyłącznie seed / administrator (decyzja 2026-07-22: brak
  -- samodzielnej rejestracji, brak Google OAuth).
  CREATE TABLE IF NOT EXISTS pilots (
    id            TEXT PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Motyw aplikacji jest preferencją PILOTA, nie telefonu (decyzja 2026-07-29), więc
    -- wędruje za nim między urządzeniami. Kolumny na pilots, nie osobna tabela: to
    -- relacja 1:1, a tabela z jednym wierszem na pilota jest przerostem. NULL znaczy
    -- „pilot nigdy nie wybrał motywu na żadnym urządzeniu" - telefon zostaje wtedy przy
    -- swoim stanie lokalnym. Serwer nie zna listy motywów (to tokeny UI) i trzyma nazwę
    -- jako tekst.
    theme            TEXT,
    -- Stempel DECYZJI pilota nadany przez telefon - oś rozstrzygania LWW w PUT /me/prefs,
    -- a nie czas zapisu w bazie. Te dwie rzeczy rozjeżdżają się przy synchronizacji
    -- z opóźnieniem i wtedy wygrywałby ten, kto miał lepszą sieć.
    theme_updated_at TIMESTAMPTZ,

    -- Rola konta (panel administracyjny). Administrator i szef wyszkolenia SĄ pilotami,
    -- więc drugi byt tożsamości rozjechałby ich nalot na dwa konta (src/domain/roles.ts).
    -- CHECK zamiast typu ENUM: enum w Postgresie rozszerza się osobnym DDL-em o własnych
    -- ograniczeniach transakcyjnych, a CHECK jest zwykłym ograniczeniem tabeli - tańszy
    -- w utrzymaniu i tak samo nieprzepuszczalny. DEFAULT 'pilot' domyka istniejące konta:
    -- podniesienie uprawnień ma być jawną decyzją administratora, nigdy skutkiem ubocznym.
    role TEXT NOT NULL DEFAULT 'pilot' CHECK (role IN ('pilot', 'training_lead', 'admin')),

    -- Znacznik UNIEWAŻNIENIA POŚWIADCZEŃ konta (przekrój A06).
    --
    -- Sesja panelu to podpisany JWT w ciasteczku uzaero_admin z TTL 8 h i NIE MA dla
    -- niej wiersza w bazie - revokeAllFor kasuje refresh_tokens, czyli sesje TELEFONU.
    -- Bez tej kolumny wykradzione poświadczenie panelu przeżywało reset hasła nawet o osiem
    -- godzin, a ekran A06a pisał „Aktywne sesje pilota - unieważnione": obietnica bez
    -- pokrycia dokładnie w operacji, która istnieje po to, żeby dostęp odebrać.
    --
    -- Kolumna, a nie tabela sesji przeglądarkowych: pytanie brzmi „czy to poświadczenie
    -- jest starsze niż ostatnie unieważnienie", a odpowiada na nie JEDNA data przy koncie,
    -- którą brama (http/authorize.ts) i tak czyta przy każdym żądaniu - kontrola nie
    -- kosztuje dodatkowego zapytania. Tabela oznaczałaby wiersz na każde logowanie.
    --
    -- NULL = „poświadczeń tego konta nigdy nie unieważniano" (wartość domyślna dla kont
    -- istniejących - inaczej wdrożenie wylogowałoby wszystkich naraz bez powodu). Znacznik
    -- przesuwają DWIE operacje: reset hasła i deaktywacja (admin/commands/pilots.ts).
    -- Porównanie jest GRUBOZIARNISTE: token niesie iat w SEKUNDACH (RFC 7519), więc token
    -- wydany w tej samej sekundzie co unieważnienie zostaje ODRZUCONY - zaokrąglenie
    -- działa w stronę bezpieczną.
    credentials_valid_from TIMESTAMPTZ
  );

  -- ═══ FLOTA ══════════════════════════════════════════════════════════════════
  -- capacity_l nie jest opisem: z niej liczy się tolerancja fuel_mismatch
  -- (max(10 L, 5% pojemności), §4.5). mh_format to sposób WYŚWIETLANIA licznika
  -- (decimal/hhmm) - w danych motogodziny są zawsze godzinami dziesiętnymi.
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

  -- ═══ SESJE TELEFONU ═════════════════════════════════════════════════════════
  -- Przechowujemy HASH, nie wartość tokenu - wyciek bazy nie daje sesji.
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    pilot_id   TEXT NOT NULL REFERENCES pilots(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_pilot ON refresh_tokens (pilot_id);

  -- ═══ REJESTR ZDARZEŃ (§5.3) ═════════════════════════════════════════════════
  -- Lustro lokalnego rejestru telefonów. Klucz = uuid NADANY PRZEZ URZĄDZENIE, i to on
  -- jest całą idempotencją synca (INSERT ... ON CONFLICT DO NOTHING): retry tej samej
  -- paczki wraca jako duplicates, nie jako podwójne wiersze.
  --
  -- Tabela jest APPEND-ONLY. type celowo BEZ CHECK-a: katalog typów zdarzeń jest
  -- w @uzaero/domain, a walidacja zachodzi na WEJŚCIU (POST /events, zod) - rejestr
  -- ma przyjąć i zachować to, co przyszło z terenu, także gdy katalog się zmieni.
  -- source_device jest NULL-owalny: null znaczy „paczka sprzed wprowadzenia tego pola
  -- albo zapis spoza telefonu" (korekta z panelu podaje tu własną wartość).
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

  -- Oś PULSU SYSTEMU (A01) i lista śledcza (A04). Pulpit pyta rejestr po ZEGARZE
  -- SERWERA („co przyszło ostatnio", „ile w każdej z ostatnich dwunastu godzin"), a lista
  -- paginuje kursorem w OBU kierunkach. Bez tego indeksu każde z tych pytań jest pełnym
  -- skanowaniem tabeli, która rośnie bez granicy - a pulpit jest ekranem, na którym KAŻDY
  -- zalogowany ląduje jako pierwszym.
  --
  -- uuid jako druga kolumna, bo cała paczka z jednego synca ma identyczny received_at
  -- i bez rozstrzygnięcia sortowanie byłoby niestabilne. BEZ NULLS LAST - obie kolumny
  -- są NOT NULL, patrz reguła 4 w docblocku pliku: ten zapis jest DOMYŚLNY, więc jeden
  -- indeks obsługuje oba kierunki (skanem w przód DESC, DESC, wstecz ASC, ASC).
  CREATE INDEX IF NOT EXISTS idx_events_received ON events (received_at DESC, uuid DESC);

  -- Skąd wiadomo, że zdarzenie UNIEWAŻNIONO korektą. Rejestr pokazuje takie wiersze
  -- PRZEKREŚLONE, ale obecne - to właśnie one tłumaczą, dlaczego liczby dnia różnią się
  -- od tego, co zapisał telefon. Strona listy dobiera więc korekty celujące w swoje
  -- wiersze, także spoza zakresu dat (zdarzenie sprzed miesiąca mogło zostać unieważnione
  -- wczoraj). Indeks jest CZĘŚCIOWY i wyrażeniowy, bo korekty są ułamkiem rejestru: pełny
  -- indeks po wyrażeniu z JSONB kosztowałby przy KAŻDYM przyjęciu paczki, a odpowiadałby
  -- na pytanie zadawane wyłącznie o korekty.
  CREATE INDEX IF NOT EXISTS idx_events_correction_target
    ON events ((payload->>'targetUuid'))
    WHERE type = 'event_correction';

  -- ═══ PROJEKCJA SESJI ════════════════════════════════════════════════════════
  -- NIE jest źródłem prawdy - to zrzut projectSession(events) odświeżany w tej samej
  -- transakcji, w której przyjmujemy zdarzenia. Kolumny liczbowe istnieją po to, żeby
  -- state, sync-status, eksport i listy panelu nie musiały wczytywać strumienia
  -- (reguła 2 w docblocku pliku).
  CREATE TABLE IF NOT EXISTS sessions (
    session_uuid  TEXT PRIMARY KEY,
    aircraft_id   TEXT NOT NULL,
    pic_id        TEXT NOT NULL,
    dual_id       TEXT,
    status        TEXT NOT NULL DEFAULT 'active',

    -- CZAS PRZEJĘCIA MASZYNY: zdarzenie session_claim, czyli SessionState.claimedAt
    -- (COALESCE(gps_time, device_time)). Do 2026-08-07 kolumna nazywała się tak samo,
    -- a niosła dutyStart, czyli godzinę MELDUNKU z preflightu - rozjazd świadomy
    -- i opisany, dopóki meldunek był obowiązkowy. Od §3.6a jest OPCJONALNY i ekran 02
    -- o niego nie pyta, więc kolumna byłaby NULL w ZWYKŁYM przypadku, a opierają się
    -- na niej: sortowanie listy dni, kursor keyset, idx_sessions_day, filtr zakresu dat,
    -- rozpoznanie sesji „bez daty" i przynależność sesji do karty doby (§4.7).
    --
    -- Kolumny duty_start tu NIE MA: klamra służby najpierw należała do PILOTA
    -- (nie do sesji), a od issue #23 (2026-08-11) nie istnieje w modelu w ogóle -
    -- dzień pilota to lista sesji (projectPilotDay per pilot per doba UTC).
    -- NULL-owalna, bo rejestr bywa niekompletny po imporcie - stąd NULLS LAST w indeksie.
    claim_time    BIGINT,
    -- Czas day_close, czyli ZDANIA SAMOLOTU. Nie kończy dnia pilota (§3.6a).
    close_time    BIGINT,

    -- Ogniwa łańcucha MH (§4.5). mh_end/fuel_end_l wypełniamy WYŁĄCZNIE dla sesji
    -- zamkniętej: to odczyty z day_close, czyli przekazanie dla następnego pilota.
    mh_start      DOUBLE PRECISION,
    mh_end        DOUBLE PRECISION,
    fuel_start_l  DOUBLE PRECISION,
    fuel_end_l    DOUBLE PRECISION,
    -- …a te żyją też W TRAKCIE sesji (tankowanie) - z nich GET /aircraft/:id/state
    -- podpowiada stan bieżący. (Do 2026-08-10 źródłem bywał też odczyt z leg_close.)
    fuel_last_l   DOUBLE PRECISION,
    mh_last       DOUBLE PRECISION,

    block_ms      BIGINT NOT NULL DEFAULT 0,
    flight_ms     BIGINT NOT NULL DEFAULT 0,
    flights_count INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Wymiary listy dni (A02). Lista bez rodzaju operacji jest bezużyteczna, a wyciąganie
    -- go w locie z events.payload byłoby drugim odtwarzaniem projekcji. client zostaje
    -- wolnym tekstem - to nazwa odbiorcy wpisywana przez pilota, nie słownik (reguła 3).
    operation TEXT,
    client    TEXT,

    -- Kolumny statystyk zakresu (A10), wszystkie przepisane z projectSession:
    --  • takeoff_count/landing_count - liczniki ZDARZEŃ; NIE to samo co flights_count
    --    (drugi takeoff w powietrzu podbija licznik, ale nie otwiera drugiego lotu);
    --  • mh_delta_h/fuel_consumed_l - bilanse sesji; NULL dopóki nie ma day_close,
    --    razem z regułą projekcji „zużycie istnieje dopiero z odczytem końcowym";
    --  • drop_alt_sum_ft/drop_alt_count - SUMA wysokości zrzutów Z FIXEM i ich LICZNIK,
    --    celowo zamiast średniej: średnia per sesja nie składa się w średnią zakresu,
    --    a zrzut bez wysokości nie wchodzi ani do sumy, ani do licznika.
    --
    -- NULL w KTÓREJKOLWIEK z tych kolumn znaczy „wiersz jeszcze nieprzeliczony", a NIE
    -- zero. Agregaty A10 odróżniają ten stan po takeoff_count IS NULL (kolumny wypełnia
    -- się razem) i wtedy zamiast liczby pokazują kreskę z liczbą wierszy do przebudowy
    -- (AdminMaintenanceCommands.rebuildProjections, ekran A11).
    takeoff_count   INTEGER,
    landing_count   INTEGER,
    mh_delta_h      DOUBLE PRECISION,
    fuel_consumed_l DOUBLE PRECISION,
    drop_count      INTEGER,
    jumpers_tandem  INTEGER,
    jumpers_aff     INTEGER,
    jumpers_solo    INTEGER,
    drop_alt_sum_ft DOUBLE PRECISION,
    drop_alt_count  INTEGER,

    -- Notatka pilota do dnia (issue #14) - okoliczności, nie rozliczenie („lot z uczniem",
    -- „drugi zbiornik nie działa"). NULL znaczy tu WYŁĄCZNIE „dzień bez notatki", stan
    -- najczęstszy - inaczej niż przy kolumnach statystyk wyżej.
    notes TEXT
  );

  ALTER TABLE sessions ADD CONSTRAINT sessions_operation_known CHECK (
    operation IS NULL OR operation IN ('skoki', 'ferry', 'egzamin', 'techniczny', 'inne')
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_aircraft ON sessions (aircraft_id);

  -- Sortowanie i kursor keyset listy dni. NULLS LAST jest tu ISTOTNE, nie ozdobne -
  -- i jest JEDYNYM miejscem w tym pliku, gdzie ten zapis opisuje realny porządek:
  -- claim_time bywa NULL (rejestr niekompletny), a takie sesje mają lądować na końcu
  -- listy, nie na początku. PostgreSQL domyślnie daje przy DESC porządek NULLS FIRST,
  -- więc indeks bez tego dopisku nie obsługiwałby zapytania listy: planer i tak sortowałby
  -- pełny wynik przed LIMIT, czyli indeks byłby martwym kosztem zapisu.
  CREATE INDEX IF NOT EXISTS idx_sessions_day
    ON sessions (claim_time DESC NULLS LAST, session_uuid DESC);

  -- Zakres statystyk liczy się PO CZASIE ZAMKNIĘCIA, więc każde zapytanie A10 zawęża
  -- status = 'closed' AND close_time BETWEEN …. Bez indeksu częściowego byłby to pełny
  -- skan projekcji przy każdym wejściu na ekran raportów.
  CREATE INDEX IF NOT EXISTS idx_sessions_closed_day
    ON sessions (close_time) WHERE status = 'closed';

  -- ═══ FLAGI (§4.5) ═══════════════════════════════════════════════════════════
  -- Żyją OSOBNO od sesji z dwóch powodów: jedna flaga może dotyczyć DWÓCH sesji (nakładka),
  -- a jej cykl życia (open → resolved) jest dłuższy niż doba lotna.
  CREATE TABLE IF NOT EXISTS flags (
    id            SERIAL PRIMARY KEY,
    type          TEXT NOT NULL,
    aircraft_id   TEXT NOT NULL,
    -- Zawsze POSORTOWANE - dzięki temu uq_flags_type_sessions działa na ZBIORZE sesji,
    -- a nie na ich kolejności. Cena: z tej tablicy NIE DA SIĘ odczytać, która sesja była
    -- pierwsza (pilotOverlap.ts oddaje to osobnym polem laterSessionUuid).
    session_uuids TEXT[] NOT NULL,
    -- JSONB, a nie kolumny: kształt szczegółów jest inny dla każdego typu flagi i zmienia
    -- się razem z detektorem. Serwer tej struktury nie filtruje ani nie sortuje.
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status        TEXT NOT NULL DEFAULT 'open',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ,

    -- KTO i JAK flagę rozstrzygnął (A03a). Komentarz jest w UI **wymagany** - za pół roku
    -- nikt nie pamięta, dlaczego nakładka okazała się pozorna - ale kolumny zostają
    -- NULL-owalne: wymóg jest regułą WEJŚCIA (zod na trasie), nie ograniczeniem tabeli,
    -- a te dwie rzeczy dotyczą różnych zbiorów wierszy. Panel pokazuje wtedy
    -- „rozstrzygnięcie sprzed rejestrowania uzasadnień".
    resolved_by     TEXT,
    resolution_note TEXT
  );

  -- Unikalność flagi na poziomie BAZY. Dedupe w adapterze (SELECT-then-INSERT) przegrywa
  -- wyścig dwóch równoległych transakcji - ograniczenie jest jedyną gwarancją, której nie
  -- da się ominąć timingiem.
  ALTER TABLE flags ADD CONSTRAINT uq_flags_type_sessions UNIQUE (type, session_uuids);

  -- Katalog z packages/domain/src/flags.ts. Sześć pozycji, bo session_overlap udawał
  -- dwie różne patologie i został rozdzielony (2026-08-07): aircraft_overlap (dwie
  -- niezamknięte sesje jednej MASZYNY - bramka arkusza) i pilot_overlap (sesje jednego
  -- PILOTA nachodzące w czasie - anomalia grafiku, arkusza nie dotyka). Przy długich
  -- sesjach zbiegały się w praktyce; po §3.6a sesje są krótkie i to przestało być prawdą.
  ALTER TABLE flags ADD CONSTRAINT flags_type_known CHECK (
    type IN ('mh_gap', 'mh_regression', 'aircraft_overlap', 'pilot_overlap',
             'fuel_mismatch', 'clock_drift')
  );

  CREATE INDEX IF NOT EXISTS idx_flags_aircraft ON flags (aircraft_id) WHERE status = 'open';
  -- Porządek skrzynki flag (A03): (status, created_at DESC, id DESC).
  CREATE INDEX IF NOT EXISTS idx_flags_status_created ON flags (status, created_at DESC, id DESC);

  -- ═══ DZIENNIK EKSPORTU (§4.7) ═══════════════════════════════════════════════
  -- APPEND-ONLY i w tym jest cała jego wartość: po nim, i tylko po nim, da się odpowiedzieć
  -- na pytanie „co widział skarbnik klubu, kiedy zamykał miesiąc". Spóźnione dane po
  -- eksporcie regenerują kartę i dopisują NOWY wiersz z podbitą rewizją - nadpisanie
  -- zgubiłoby jedyny ślad rozjazdu między arkuszem a rejestrem.
  --
  -- **session_uuid znaczy CZŁONKOSTWO SESJI W REWIZJI, nie „sesję, której to karta".**
  -- Karta jest DOBĄ SAMOLOTU (§4.7), więc jedna rewizja ma tyle wierszy, ile sesji do niej
  -- weszło, i wszystkie niosą ten sam numer. Kolumna istnieje w tej postaci dlatego, że
  -- GET /sessions/:uuid/sync-status (ekran 11 telefonu) pyta o link PO SESJI - także ta
  -- zmiana, która eksportu nie wyzwoliła, musi go znaleźć. Klucz karty niosą day
  -- + aircraft_id.
  CREATE TABLE IF NOT EXISTS export_log (
    id           SERIAL PRIMARY KEY,
    session_uuid TEXT NOT NULL,
    day          DATE NOT NULL,
    aircraft_id  TEXT NOT NULL,
    sheet_url    TEXT NOT NULL,
    revision     INTEGER NOT NULL,
    exported_at  TIMESTAMPTZ NOT NULL
  );

  -- Rewizja należy do KARTY (doba + samolot), nie do sesji: skoro dokumentów jest tyle,
  -- ile dób maszyny, to i numer rewizji liczy się per doba maszyny. session_uuid jest
  -- na KOŃCU klucza, bo jedna rewizja ma ich wiele - bez niego ograniczenie zabraniałoby
  -- drugiej sesji wejść do karty. Ta sama decyzja co przy uq_flags_type_sessions: dedupe
  -- w adapterze przegrywa wyścig, a pg_advisory_xact_lock (ExportLogPort.lock, na TEJ
  -- SAMEJ parze doba+samolot) szereguje normalną pracę. UNIQUE broni przed czymś węższym:
  -- ręcznym INSERT-em w psql i przyszłą ścieżką kodu, która zapomni zawołać lock().
  ALTER TABLE export_log ADD CONSTRAINT uq_export_log_card_revision
    UNIQUE (day, aircraft_id, revision, session_uuid);

  -- Ograniczenie wyżej prowadzi (day, aircraft_id), więc pytania PO SESJI - sync-status
  -- telefonu i LEFT JOIN LATERAL monitora A05 - nie miałyby czym schodzić. Porządek
  -- (exported_at DESC, id DESC) jest tym, którym te dwa miejsca czytają: „ostatni zapis
  -- zawierający tę sesję". Bez NULLS LAST - obie kolumny są NOT NULL (reguła 4).
  CREATE INDEX IF NOT EXISTS idx_export_log_session
    ON export_log (session_uuid, exported_at DESC, id DESC);

  -- ═══ TREŚĆ KART (§4.7) ══════════════════════════════════════════════════════
  -- Bazodanowy adapter SheetsPort (zamiast czekania na klucz serwisowy Google).
  -- Semantyka DOKŁADNIE jak karty w arkuszu: jedna nazwa = jedna karta, a rewizja
  -- NADPISUJE treść (UPSERT po tab) - czytelnik linku z ekranu 11 ma widzieć wyłącznie
  -- aktualny stan doby, tak jak widziałby arkusz.
  --
  -- Historii rewizji tu NIE MA i **nie wolno jej tu dodawać**: „co i kiedy poszło" pamięta
  -- append-only export_log, a treść każdej rewizji da się odtworzyć ze strumienia zdarzeń
  -- - pełne kopie dublowałyby rejestr bez zysku. rows to DOSŁOWNE wiersze karty
  -- (DaySheet.rows, string[][]): karta jest dokumentem w kształcie Excela, nie
  -- projekcją do dalszego liczenia. tab = YYYY-MM-DD_SP-XXX, czyli DOBA i SAMOLOT.
  CREATE TABLE IF NOT EXISTS exported_sheets (
    tab        TEXT PRIMARY KEY,
    rows       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  -- ═══ DZIENNIK AKCJI ADMINISTRATORÓW ═════════════════════════════════════════
  -- Wiersz powstaje WYŁĄCZNIE przez AdminAuditPort.append, wołane z wnętrza
  -- AuditedWrite - czyli w tej samej transakcji co skutek, który opisuje. Operacja,
  -- której nie udało się zaudytować, po prostu nie zachodzi.
  --
  -- Tabela jest append-only i NIE MA na to ograniczenia bazodanowego: docelowo niezmienność
  -- wymusza GRANT INSERT, SELECT dla roli aplikacyjnej (wymaga drugiego connection stringa,
  -- decyzja wdrożeniowa docs/architektura-panelu-serwer.md §11 pkt 2). Do tego czasu
  -- pilnuje jej test/architecture.test.ts: żaden plik w src/ nie ma prawa zawierać
  -- UPDATE admin_audit ani DELETE FROM admin_audit.
  --
  -- action i actor_role celowo BEZ CHECK-a - reguła 3 w docblocku pliku: to zapis
  -- HISTORYCZNY, a nie byt żywy wczytywany do zamkniętej unii. Słownika pilnuje typ
  -- AdminAction w jedynym miejscu zapisu (domain/adminActions.ts), a strona odczytu
  -- (A09) ma pokazać nieznany kod dosłownie, nigdy się nim wywrócić.
  --
  -- ip jest NULL-owalny: akcja może przyjść z narzędzia bez żądania HTTP (skrypt
  -- administracyjny), a wymyślony adres byłby gorszy niż jego brak.
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

  -- Dziennik bez zawężenia (A09) i dziennik zawężony po koncie działającego (kolumna
  -- „Kto" jest linkiem, więc to najczęstsze zawężenie ekranu). Oba porządki to
  -- (created_at DESC, id DESC); w drugim indeksie kolumna równości idzie PIERWSZA, żeby
  -- filtr i sortowanie schodziły jednym przejściem. Bez NULLS LAST (reguła 4) - inaczej
  -- KAŻDA strona dziennika kończy się pełnym Sort-em rosnącym liniowo z tabelą, która
  -- z natury tylko przyrasta.
  CREATE INDEX IF NOT EXISTS idx_audit_created
    ON admin_audit (created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON admin_audit (actor_pilot_id, created_at DESC, id DESC);

  -- ═══ NORMA ZUŻYCIA PER SAMOLOT ══════════════════════════════════════════════
  -- Materializacja modelu dla telefonów. GET /reference woła KAŻDY telefon co kwadrans,
  -- a model zużycia czyta strumienie kilkudziesięciu sesji i puszcza przez regresję -
  -- liczenie go na żądanie telefonu byłoby wpuszczeniem analityki na ścieżkę, która ma być
  -- tania i zawsze dostępna. Memo w procesie nie wystarcza: nie przeżywa restartu
  -- i rozjeżdża się między instancjami.
  --
  -- model jako JSONB, nie osiem kolumn: kształt ConsumptionNorm należy do domeny
  -- i będzie się zmieniał razem z modelem, a serwer tej struktury nie filtruje ani nie
  -- sortuje - zapisuje ją i oddaje. Ta sama decyzja co przy flags.details
  -- i events.payload.
  --
  -- BRAK WIERSZA znaczy „model poniżej progu publikacji albo jeszcze nieliczony", czyli
  -- dokładnie to samo, co consumption: null w kontrakcie - telefon nie pokazuje wtedy
  -- porównania z normą, zamiast pokazywać zero. computed_at jest stemplem POLICZENIA,
  -- nie zapisu: wchodzi do odpowiedzi i pozwala telefonowi powiedzieć, jak stara jest
  -- podpowiedź, niezależnie od wieku samego cache'u.
  CREATE TABLE IF NOT EXISTS aircraft_consumption (
    aircraft_id  TEXT PRIMARY KEY,
    window_days  INTEGER NOT NULL,
    model        JSONB NOT NULL,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

/**
 * Migracja 2: MODUŁ OLEJU (issue #60) - konfiguracja floty i projekcja sesji.
 *
 * PIERWSZA migracja po zgnieceniu (2026-08-08) i pierwsza wobec BAZY PRODUKCYJNEJ
 * (Railway, 2026-08-26) - „schemat edytujemy w miejscu" przestało obowiązywać, więc
 * zmiana jest w całości ADDYTYWNA: nullable kolumny na końcach tabel, zero backfillu
 * (NULL = „sprzed modułu oleju" i to jest poprawna odpowiedź, nie brak przeliczenia).
 * `IF NOT EXISTS`, żeby migracja przeżyła powtórne wykonanie na bazie, którą ktoś
 * poprawiał ręcznie - runner i tak stosuje ją raz.
 *
 *  • `aircraft.oil_*` - trzy liczby z dokumentacji jednostki (A07a), wszystkie
 *    OPCJONALNE: minimum zapala ostrzeżenie na kroku liczników, pojemność ogranicza
 *    pomiar i dolewkę (siostra `capacity_l`), norma nominalna zasila sugestię
 *    oczekiwanego poziomu, dopóki analityka nie policzy własnej stawki (faza 2).
 *  • `sessions.oil_level_l/oil_added_l` - projekcja `SessionState.oil`: pomiar
 *    z przejęcia i SUMA dolanego (para z preflightu + zdarzenia `oil_add`). Z nich
 *    `GET /reference` składa przekazanie oleju (`Handover.oil`) bez chodzenia po
 *    strumieniu zdarzeń całej floty.
 */
export const MIGRATION_2 = `
  ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS oil_min_l        DOUBLE PRECISION;
  ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS oil_capacity_l   DOUBLE PRECISION;
  ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS oil_norm_l_per_h DOUBLE PRECISION;

  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS oil_level_l DOUBLE PRECISION;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS oil_added_l DOUBLE PRECISION;
`;

export const MIGRATIONS: readonly string[] = [MIGRATION_1, MIGRATION_2];

/**
 * Jednozdaniowy opis KAŻDEJ migracji - kolumna „Co wprowadza" z ekranu `A11`.
 *
 * ══ DLACZEGO TO STOI TUTAJ, A NIE W PANELU ══
 * Bo tutaj stoi DDL. Lista opisów trzymana po drugiej stronie drutu rozjeżdżałaby się
 * przy pierwszej nowej migracji i nikt by tego nie zauważył - panel wypisywałby wtedy
 * opis jednej migracji przy drugiej. Tu rozjazd jest niemożliwy do przeoczenia: długość
 * tej tablicy musi się równać długości `MIGRATIONS` i pilnuje tego `test/schema.test.ts`.
 *
 * Opisy są streszczeniem komentarzy wyżej, a nie ich powtórzeniem: ekran ma powiedzieć,
 * CO migracja wprowadza, a nie dlaczego - uzasadnienia zostają przy kodzie.
 *
 * Po zgnieceniu (2026-08-08) `A11` pokazuje JEDEN wiersz i to jest właściwy stan, nie
 * zubożenie ekranu: jego pytaniem nigdy nie było „ile migracji przeszło", tylko „czy baza
 * jest starsza niż kod" (`schemaWarning`, plakietka „nie zastosowana"). Na to odpowiada
 * tak samo przy jednej pozycji, jak przy dwudziestu trzech - a od następnej migracji
 * tabela znowu rośnie.
 */
export const MIGRATION_TITLES: readonly string[] = [
  'Schemat bazowy: konta, flota, rejestr zdarzeń, projekcje, eksport, audyt, analityka',
  'Moduł oleju (issue #60): konfiguracja floty (minimum, zbiornik, norma nominalna) i projekcja pomiaru z dolewkami w sesji',
];
