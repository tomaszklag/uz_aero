# UZ Aero — architektura kodu

> Dotyczy monorepo: `app/` (React Native + Expo), `server/` (Fastify + PostgreSQL)
> i `packages/domain` (wspólna domena). TypeScript strict wszędzie.
> Architektura systemu (offline-first, sync, kontrakt API): `docs/_main.md.txt`.
> Ten dokument mówi, **jak jest zbudowany kod** i gdzie dopisać nową rzecz.

## 0. Monorepo (Faza 2)

```
packages/domain    @uzaero/domain — zdarzenia, reguły, projekcje, detekcja. Czysty TS,
                   ZERO zależności (pilnowane testem architektury).
app/               aplikacja; w `src/domain` został shim `export * from '@uzaero/domain'`
server/            backend; importuje TĘ SAMĄ domenę
```

**Po co wspólny pakiet:** serwer liczy sesje `projectSession` i sprawdza te same
inwarianty co telefon. Dwie implementacje rozjechałyby się przy pierwszej zmianie —
a rozjazd klient/serwer w liczeniu czasów to błąd, którego nie widać do końca miesiąca.

**Serwer — te same warstwy co aplikacja** (`application/` komendy·zapytania·porty,
`infrastructure/` adaptery, `http/` cienkie trasy, composition root w `index.ts`).
Uproszczony CQRS: komendy piszą, zapytania czytają projekcje; bez szyny zdarzeń
i osobnej bazy odczytu — projekcje odświeżane synchronicznie w transakcji przyjęcia
zdarzeń. Przy skali klubu każdy dodatkowy ruchomy element to koszt bez zysku.

Stan po M2: `POST /events` (idempotencja po uuid, single-writer egzekwowany tożsamością
z JWT **i** — po audycie — zgodnością z `pic_id` istniejącej sesji, plus walidacja
payloadów per typ zdarzenia i `pg_advisory_xact_lock` per sesja), projekcja `sessions`
odświeżana w transakcji przyjęcia, flagi łańcucha MH (`mh_gap` / `mh_regression` /
`session_overlap` — czysta funkcja `server/src/domain/mhChain.ts`, tolerancja
`MH_TOLERANCE_H` z domeny), `GET /aircraft/:id/state`, `GET /sessions/:uuid/sync-status`
i `GET /reference` wzbogacone o claim/przekazanie z projekcji sesji (ETag liczy też
znacznik sesji). Serwer projektuje sesje `projectSession` z `@uzaero/domain` — liczby
kanonicznego dnia wychodzą identyczne jak na ekranie 10 telefonu, co przybija test
integracyjny.

Stan po M3 (app ↔ serwer): `ServerPort` + adapter fetch (`infrastructure/api/`),
`AuthService` na `expo-secure-store` (§3.0: wygasły token ≠ wylogowanie, logout blokowany
niepustym outboxem), `SyncEngine` (§4.3: paczki ≤ 500, duplikaty = dostarczone, jedna
rotacja tokenu, offline ≠ auth_expired) podpięty do store'u sesji (`attachSync` /
`syncNow`), pętla okazji `useSyncLoop` (start, powrót z tła, przyrost outboxa, puls 60 s),
ekran 00-login za bramką `AuthGate` i ekran 11 (synchronizacja) z flagami serwera
w trzech stanach świeżości. Cache referencyjny zasila `ReferenceSync`
(`application/sync/referenceSync.ts`): `GET /reference` z ETagiem (304 = podbicie
`fetchedAt`, treść bez transferu), brama wieku 15 min w pętli okazji, upsert — nie
replace (flota i piloci są wyłączani, nie kasowani); seed został danymi pierwszego
uruchomienia. Wspólny wzorzec „świeży token + jedna rotacja przy 401" dla odczytów
mieszka w `application/sync/authorizedFetch.ts` (wysyłka outboxa celowo NIE korzysta —
tam rozróżnienie offline/auth_expired/rejected niesie decyzje). Przejęcie samolotu
pyta o żywy stan (`SyncEngine.fetchAircraftState`) w chwili claimu: odpowiedź →
`takeover_online` z AKTUALNYM poprzednikiem (serwer mógł wskazać kogoś innego niż
cache, albo „już wolny" → zwykłe `free`), brak odpowiedzi → `takeover_offline`;
decyzja to czysta funkcja `screens/claimMode.ts`.

Motyw aplikacji jest preferencją PILOTA i wędruje między urządzeniami (decyzja
2026-07-29, ostatnia pozycja audytu UI): lokalnie rekord per pilot
(`infrastructure/prefs/themePrefsStore.ts` — klucz `uzaero.theme.<pilotId>` jak
banery edu; klasa dostaje magazyn KV konstruktorem, więc format i łagodna migracja
starego klucza per telefon są testowane w Node), `ThemeProvider` nakłada motyw razem
z tożsamością (subskrypcja store'u auth: odblokowanie/przelogowanie = motyw TEGO
pilota, bez pilota Night; nazwa spoza tokenów zjeżdża do Night), a `ThemePrefsSync`
(`application/sync/themePrefsSync.ts`, wzorzec `ReferenceSync`, wołany z pętli
okazji za `refreshReference`) uzgadnia rekord z serwerem przez `/me/prefs`:
push rekordu `dirty` przy każdej okazji (outbox preferencji — zmiana motywu NIGDY
nie czeka na sieć), pull za bramą wieku 15 min, LWW po stemplu DECYZJI pilota
w OBIE strony (adoptujemy wyłącznie stan ściśle nowszy; adopcję ogłasza
`onApplied`, którym ThemeProvider przemalowuje ekran na żywo), offline/wygasła
sesja/obcy profil = `skipped`. Po stronie serwera migracja 6 dokłada
`pilots.theme`/`theme_updated_at` (prefs są 1:1 z pilotem — osobna tabela to
przerost), a trasy `GET/PUT /me/prefs` (`http/routes/prefs.ts`, tożsamość WYŁĄCZNIE
z tokenu) piszą przez `PrefsCommands` + `PgPilotPrefsRepo`, gdzie warunek LWW
siedzi w SQL-u (`theme_updated_at IS NULL OR < $3`) — a odpowiedź PUT jest ZAWSZE
stanem autorytatywnym po operacji, żeby telefon-przegrany dostosował się zamiast
wiecznie ponawiać. Serwer nie zna listy motywów (tokeny UI zostają w UI): trasa
pilnuje tylko niepustego tekstu ≤ 40 znaków i poprawnego ISO stempla.

Wejście do aplikacji (§3.0, mockupy 00/00a/01): bramka `AuthGate` w `App.tsx` ma pięć
stanów — `signed_out` → 00a login, `pin_setup` → „Ustaw PIN" (ten sam układ co zamek;
mockupu konfiguracji nie ma, spec §3.0 wymaga PIN-u po provisioning), `locked` → 00
odblokowanie (w 100% offline, solony SHA-256 w `expo-secure-store`; własna
implementacja skrótu w `infrastructure/auth/sha256.ts` — powody w docblocku),
`signed_in` → `ResumeGate`: otwarta sesja z `session_meta` (§5.2) wraca prosto do
kokpitu, inaczej ekran 01 (start dnia: „NOWY DZIEŃ LOTNY" → preflight, stopka ze
stemplem cache referencyjnego). „Nie pamiętam PIN" nie czyści poświadczeń (nadpisuje
je dopiero udany login) i jest zablokowane przy niepustym outboxie. Klawisz biometrii
z mockupu 00 odłożony (wymagałby `expo-local-authentication`).

Eksport arkuszy (§4.7, serwer): `application/export/` — `buildDaySheet` (czysta funkcja
`SessionState` → karta; nazwa `YYYY-MM-DD_SP-XXX` bajt w bajt zgodna z `sheetTabName`
aplikacji, treść = ekrany 10/11, MH w formacie samolotu) i `DayExporter` (po commicie
ingestu, dla sesji zamkniętych po przetworzeniu; bramki: sesja otwarta / otwarta flaga
`session_overlap` = nic; spóźnione dane → rewizja +1). Dziennik `export_log`
(migracja 4, append-only — historia rewizji to jedyny ślad rozjazdu arkusz↔rejestr);
`sync-status.exportUrl` z ostatniej rewizji. Awarię Sheets łapie ingest — telefon
dostał 200 za PRZYJĘCIE, arkusz to skutek, nie warunek.

Karty mieszkają W BAZIE (decyzja 2026-07-28: nie czekamy na Google): adapter
`PgSheets` (`infrastructure/pg/sheetsRepo.ts`) zapisuje dosłowne wiersze karty do
`exported_sheets` (migracja 5; UPSERT po `tab` — semantyka jak karta w Google:
czytelnik widzi wyłącznie aktualny stan, historię rewizji trzyma `export_log`),
a `GET /sheets/:tab` (autoryzowane, `SheetQueries` + osobny `SheetsReadPort` —
odczyt po nazwie istnieje tylko przy własnej bazie, Google „czyta się" samym
`sheet_url`) serwuje je pod linkiem z `export_log`. Eksport jest WŁĄCZONY
domyślnie; `PUBLIC_BASE_URL` w env ustawia bazę linków widzianą z telefonu.
Adapter Google pozostaje przyszłą podmianą `SheetsPort` w composition root —
eksporter, treść kart i dziennik nie drgną. Zastrzeżenie: link z ekranu 11 otwarty
w przeglądarce telefonu dostanie 401 (zasób autoryzowany) — klikalny „na
zewnątrz" stanie się z adapterem Google.

Backlog UX z audytów wdrożony w RN (2026-07-29, mockupy 2026-07-28): wariant 05g —
utrata fixa GPS to degradacja CZUJNIKA, osobna oś od sieci (watchdog świeżości
w `useFlightDetection` na `GPS_STALE_SEC` z domeny; baner-przyrząd z czasem ostatniego
fixa, siatka „— —", LAND·RĘCZNIE amber; napisy w `screens/gpsLoss.ts`); ekran 13
Ustawienia (motyw kartami, `PinChangeSheet` offline, wylogowanie z ochroną outboxa
przez `authStore.logout`, diagnostyka GPS z żywą subskrypcją i pozycją DDM, stempel
cache referencyjnego) — zębatki kokpitu prowadzą tu zamiast do StyleGuide; 08 — pełny
wpis §3.8 (`ManualEntrySheet`: 4 czasy + uwagi jedną komendą `manual_log_entry`)
i stopki „Uwagi · …" na grupach rejestru; 09a/10a — dzień bez lotów: warunkowy baner
zera, wariant edu-przekazania („liczniki się nie ruszyły"), przypis zamiast dzielenia
przez zero. `GpsFix` niesie teraz też `lat`/`lon`/`accuracyM` (diagnostyka; detektor
ich nie czyta).

Audyt UI (2026-07-29, kod aplikacji — nie mockupy) wdrożony: dwa złamane cele
dotykowe 34 px → 44/46 (akcje banera 05g, steppery pełnego wpisu); `fontWeight`
wszędzie zastąpiony rodzinami z tokenów (dwa mechanizmy pogrubienia → jeden; Android
nie musi syntetyzować wag dla fontów z `@expo-google-fonts`); token `colors.overlay`
kończy dryf scrimów 0.7/0.74 w sześciu arkuszach, a token `radius.btn = 14` tym samym
wzorem — dryf promieni 13/14 (18 literałów w 11 komponentach DS; steppery i wiersze
05e/05f przybijały 13, normalizacja celowa, odnotowana komentarzem przy każdym takim
miejscu); duplikaty `.outbox-guard`
i `.ref-sync` awansowane do DS (`OutboxGuard`, `RefDataStamp` — odmiana liczebników
przeniesiona do `ui/format.ts`, bo DS nie może zależeć od helperów ekranów); kłódka
zamiast trójkąta przy zamkniętych dniach (12); `SyncChip` na `AppText`; hitSlopy na
małych z designu celach (mini-chip edu, „Nie pamiętam PIN", oko podglądu); jawny błąd
otwarcia linku arkusza; deklaracje stylów ujednolicone do `StyleSheet.create` —
ostatnie 5 ekranów (00a, 07, 08, 09, 10) trzymało gołe obiekty z rzutowaniami
`as const`, teraz całe `ui/` deklaruje style jednym mechanizmem (w 10-statystyki
wspólna baza wiersza stoi przed arkuszem, bo wpis `firstRow` wyrasta z niej
spreadem). **Zaległości audytu UI domknięte 2026-07-29** — ostatnia pozycja
(motyw per PILOT zamiast per telefon) wdrożona syncem `/me/prefs` (akapit wyżej
przy M3); nota na 13 mówi nową prawdę: profil pilota, wędruje między urządzeniami.

Ekran 12 (historia): `queries.historyDays()` grupuje CAŁY lokalny strumień po sesjach
i projektuje każdą tym samym `projectSession` — karta historii i ekran 10 nie mogą
się różnić liczbami. Podział na grupy robi okno korekty (czysta funkcja
`screens/historyDays.ts`); dzień otwarty nie jest historią (ma kokpit przez
`ResumeGate`). „OTWÓRZ I POPRAW" ładuje zamkniętą sesję do store'u i otwiera 10 —
bezpieczne, bo historia jest osiągalna tylko ze splasha (bez otwartego dnia w tle).
Tag „arkusz gotowy" dołączy do „Wysłane" razem z eksportem Sheets; plakietka
`.history-badge` na 01 pokazuje najświeższy dzień w oknie.

**Zaległości audytu serwera (2026-07-28) — świadomie odłożone, do zrobienia przed
wdrożeniem (faza 6):** rate-limit na `/auth/*` (dziś brute-force ogranicza tylko koszt
scrypta); okno łaski przy rotacji refresh tokenu (równoległe rotacje z dwóch urządzeń
tego samego pilota unieważniają się nawzajem — dziś akceptowalne, bo profil żyje na
jednym telefonie); klucze obce `events`/`sessions` → `pilots`/`aircraft` (dziś spójność
pilnowana kodem, nie schematem); odświeżanie pola `details` istniejącej flagi przy
zmianie wielkości dziury MH (dedupe zostawia pierwszy pomiar); transakcyjne pary
~~migracji w `migrate.ts`~~ **ZROBIONE 2026-07-31** (patrz niżej); sprzątanie wygasłych
refresh tokenów (cron/`DELETE` przy logowaniu — `rotate()` kasuje wiersz tylko przy
przedstawieniu tokenu, `login` wyłącznie wstawia, więc tokeny porzucone zostają na
zawsze); skrypt administracyjny przebudowy projekcji `sessions` ze zdarzeń;
porównywanie treści przy duplikacie uuid (dziś duplikat = potwierdzenie, treść
ignorowana); `UNIQUE (session_uuid, revision)` na `export_log` + kolejka ponowień
nieudanych eksportów i re-eksport po rozwiązaniu flagi przez administratora (dziś
ponowienie robi dopiero następna paczka tej sesji).

**Czego wymaga panel administracyjny (faza 7, decyzja 2026-07-31)** — braki wykryte przy
projektowaniu `design/admin/`, ODRĘBNE od listy wyżej. Pełne mapowanie ekran → endpoint
i wycena: `design/admin/ANALIZA.md`.

- ~~**Rola nie istnieje nigdzie.**~~ **ZROBIONE 2026-07-31.** Migracja 7 dokłada
  `pilots.role` (CHECK na słowniku, `DEFAULT 'pilot'`), JWT niesie trzeci claim, a mapa
  ról na zdolności mieszka w `src/domain/roles.ts` — jedno miejsce z odpowiedzią na
  pytanie „kto może co", zamiast `if (role === 'admin')` rozsianych po trasach.
  `http/authorize.ts` dostał `authorizeCapability`, które rozróżnia 401 od 403 i zwraca
  wymaganą zdolność (panel ma podawać POWÓD odmowy). Dwie własności pilnowane testem
  (`test/roles.test.ts`): token bez claimu roli (wydany przed migracją) działa jako
  `pilot`, nigdy nie awansuje — odrzucenie wylogowałoby telefony w terenie, a cichy
  awans byłby luką; rola przy odświeżeniu idzie z KONTA, nie ze starego tokenu, więc
  odebranie uprawnień działa od razu, a nie po wygaśnięciu 90-dniowego refresha.
- **Flaga nie ma jak się zamknąć.** W całym `server/src` nie ma kodu ustawiającego
  `status='resolved'`, a `application/export/dayExporter.ts` odmawia eksportu przy otwartej
  `session_overlap` — nakładka sesji **trwale blokuje kartę dnia** i odblokowuje ją wyłącznie
  ręczny UPDATE. Endpoint rozwiązania + re-eksport to warunek, żeby §4.7 w ogóle się domykało.
- **Korekta administracyjna** musi stemplować zdarzenie `picId` PIC-a sesji (inaczej
  `WRITER_MISMATCH`), pomijać wyłącznie `CORRECTION_WINDOW_EXPIRED` i wywołać re-eksport.
- **Projekcja `sessions` nie niesie `operation`, `dutyStart` ani `client`** — wartości siedzą
  w payloadach `preflight_confirm` / `day_close`, więc to przepisanie projekcji, nie zmiana
  modelu zdarzeń.
- **Tabela audytu `admin_audit` nie istnieje.** Niezmienność wymuszamy uprawnieniami
  (`GRANT INSERT, SELECT` dla roli aplikacyjnej), nie dyscypliną programisty.
- **Brak list i filtrów** (sesje, zdarzenia, flagi), zapisu kont i floty, agregatów
  statystycznych oraz sesji przeglądarkowej — `authorize` czyta dziś wyłącznie `Bearer`.
- **Rate-limit na `/auth/*` awansuje** z listy wyżej: panel wystawia formularz logowania
  w przeglądarce.

Dwie sprawy z tej analizy są **decyzją produktową, nie robotą do wykonania**: (1) korekta
administratora **nie wraca na telefon pilota** — sync jest jednokierunkowy, §4.6 nie ma
endpointu zwracającego zdarzenia do aplikacji, więc pilot zobaczy stare liczby na ekranie 12;
(2) ~~§4.5 obiecuje 6 typów flag, `domain/mhChain.ts` produkuje 3~~ — **ROZSTRZYGNIĘTE
2026-07-31: kod dogania dokumentację.** `FUEL_MISMATCH` i `CLOCK_DRIFT` doliczamy przy
ingescie (dane są — `checkClocks` już porównuje oba zegary), a `session_overlap` zostaje
następcą `DOUBLE_CLAIM` + `TIME_OVERLAP`. Decyzja musiała zapaść przed cyklem życia flagi,
bo determinuje kształt `FlagType`.

**Architektura panelu (decyzje 2026-07-31).** Pełne rozstrzygnięcia: `docs/architektura-panelu-serwer.md`
(podział modeli, ORM, uproszczony CQRS komend admina, audyt w transakcji, sesja przeglądarkowa)
i `docs/architektura-panelu-frontend.md` (wspólne pakiety, drzewo panelu, mapowanie szablonu
na komponenty). Skrót wiążący dla tego dokumentu:
- **bez ORM-a i bez query buildera** — sekcja „Spójność modeli bez ORM" niżej zrewidowana
  i PODTRZYMANA, z mocniejszym powodem: nie ma tu encji do zarządzania (append-only `events`,
  `sessions` nadpisywane w całości), więc change tracking zaprasza do obejścia strumienia;
- **panel nie widzi modelu persystencji** — wyłącznie DTO z `/admin/api/*` (nie `/admin/*`:
  kolizja z wildcardem `@fastify/static`); osobnego pakietu „modele z bazy" nie tworzymy;
- **wspólne pakiety są nie-wizualne**: `@uzaero/tokens` i `@uzaero/format`; komponentów
  między RN a webem nie dzielimy;
- ~~kształt flagi przenieść do `packages/domain/src/flags.ts`~~ — **ZROBIONE 2026-07-31**
  (patrz niżej).

**Przekrój 0 panelu — zrobione 2026-07-31.** Dwie rzeczy, które musiały wejść przed
cyklem życia flagi, bo obie zmniejszają ryzyko wszystkiego, co po nich:

1. **Runner migracji jest transakcyjny.** `migrate.ts` puszcza skrypt i wpis do
   `schema_migrations` jednym łańcuchem `BEGIN … COMMIT`, więc stan „zmigrowana, ale
   nieodnotowana" jest niemożliwy. Wcześniej śmierć procesu w szczelinie między tymi
   poleceniami powodowała, że przy następnym starcie runner puszczał skrypt drugi raz —
   a migracje 3 (`ADD CONSTRAINT`) i 6 (`ADD COLUMN`) nie mają `IF NOT EXISTS`, więc
   powtórka wywalała się i **blokowała start serwera**.
   Naprawa odsłoniła drugą wadę, której nie było widać w kodzie, a którą pokazał
   prawdziwy silnik w teście: po nieudanej migracji jawne `BEGIN` zostawia sesję
   w stanie *aborted transaction*, więc każde kolejne polecenie na tym połączeniu
   dostaje „current transaction is aborted" — jedna zła migracja zatruwała połączenie
   na resztę jego życia. Runner robi teraz jawny `ROLLBACK` przed przekazaniem błędu
   dalej. Własności pilnuje `test/migrate.test.ts` (m.in. „nieudana migracja nie
   zostawia ani wpisu, ani skutków DDL" i „po nieudanej migracji kolejny bieg stosuje
   poprawioną wersję").
   Skutek uboczny, dla którego to była pierwsza pozycja: `ADD CONSTRAINT` przestał być
   pułapką, więc migracja 8 mogła bezpiecznie dołożyć `CHECK` na `flags.type`.
2. **Kształt flagi ma jedno miejsce.** `packages/domain/src/flags.ts` — katalog
   `FLAG_TYPES` (pięć pozycji: `session_overlap` zastąpił `DOUBLE_CLAIM` i `TIME_OVERLAP`
   z §4.5), `FlagType`, `FlagStatus`, `SessionFlag` (kształt „na drucie") i strażnik
   `isFlagType`. Zastąpił cztery ręcznie przepisane deklaracje. `ChainFlag` w
   `server/src/domain/mhChain.ts` jest teraz `Extract<FlagType, …>`, więc przemianowanie
   pozycji katalogu wywala kompilację zamiast zostawić martwy literał. `FlagRecord.type`
   przestał być `string`, a adapter `flagsRepo` rzuca na wartości spoza katalogu —
   ciche pominięcie flagi byłoby najgorszą opcją, bo flaga istnieje po to, żeby być widoczna.

**Granulacja plików (reguła twarda, dotyczy całego repo):** jeden adapter / jedna klasa /
jedna odpowiedzialność = jeden plik o nazwie równej roli; trasy HTTP per zasób
(`http/routes/*.ts`); mapowania jako osobne, nazwane moduły (`application/sessionRow.ts`);
wspólna autoryzacja w jednym miejscu (`http/authorize.ts`). Warstw NIE przybywa —
kierunek zależności zostaje; chodzi o to, żeby plik dało się przeczytać w całości
i żeby nazwa mówiła, co w środku.

**Spójność modeli bez ORM:** źródłem prawdy jest `@uzaero/domain`, a styki pilnują testy
kontraktowe — `test/schema.test.ts` (listy kolumn PG przybite na sztywno, na PGlite;
lustro `sqliteSchema.test.ts` z aplikacji) i `test/contract.test.ts` (każdy typ zdarzenia
domeny musi przechodzić przez kopertę zod `/events`; wiersz `sessions` musi odtwarzać
liczby `projectSession`, nie liczyć własnych). Nowe pole w domenie bez aktualizacji
koperty wywala test, a nie produkcyjny sync.

Wybory infrastrukturalne serwera (i dlaczego):
- **scrypt z `node:crypto`** zamiast argon2 — argon2 to natywny addon (node-gyp),
  scrypt jest wbudowany i wystarczający; parametry KDF zapisane w hashu, więc da się
  je podnieść bez unieważniania haseł;
- **JWT HS256 własnym modułem** (~70 linii na `createHmac`) — potrzebny dokładnie jeden
  wariant, a stały nagłówek wyklucza confusion algorytmów; refresh tokeny są OSOBNO,
  nieprzezroczyste i rotowane (hash w bazie → wyciek tabeli nie daje sesji, jedno
  użycie unieważnia token);
- **PGlite w testach** — Postgres w procesie Node: ten sam trik co `node:sqlite`
  w aplikacji; testy przechodzą przez prawdziwe endpointy (`app.inject`) i prawdziwy
  silnik SQL, atrap brak. Jedyna pułapka: `query()` PGlite nie przyjmuje SQL-a
  wielopoleceniowego — runner migracji używa `exec`, gdy jest.

---

## 1. Skąd ten kształt

Aplikacja od początku jest z ducha **event sourcing + CQRS**, bo tak wynika z wymagań, nie z mody:

- **strona zapisu** — zdarzenia append-only (`engine_start`, `takeoff`, `refuel`…), bo pilot pracuje offline i nic nie może zginąć (§4.1);
- **strona odczytu** — `projectSession()` liczy stan dnia w pamięci ze strumienia zdarzeń; zero tabel agregujących (§5.2).

Refaktor niczego z tego nie dokładał — **nazwał to i postawił granice**, oraz dołożył brakujący element: **inwarianty jako kod**.

### Problem, który to rozwiązuje

Kolejne audyty designu wyłapywały stany, które nigdy nie powinny powstać: paliwo rosnące w locie bez tankowania, cofnięty licznik motogodzin, `engine_stop` w powietrzu, dwa urządzenia piszące do jednej sesji. Wyłapywało je ludzkie oko i grep po mockupach. **Architektura ma sprawić, że takie stany są nie do zapisania** — nie „odradzane w dokumentacji".

Dlatego istnieje warstwa `domain/rules`: 34 kody naruszeń, sprawdzane przy każdym zapisie.

---

## 2. Warstwy i kierunek zależności

```
        ui/                 ekrany, komponenty, motywy, store (Zustand)
         │  wywołuje
         ▼
    application/            komendy · zapytania · porty
         │  wywołuje
         ▼
      domain/               zdarzenia · reguły · projekcje · progi detekcji
         ▲
         │  implementuje porty
  infrastructure/           expo-sqlite, in-memory, zegar, uuid
```

**Zależności idą tylko do środka.** `domain/` nie wie o niczym poza sobą — ani o Reakcie, ani o Expo, ani o bazie. `application/` zna domenę i **interfejsy** portów, ale nie ich implementacje (dostaje je konstruktorem). `infrastructure/` implementuje porty. `ui/` siedzi na zewnątrz.

| Warstwa | Katalog | Co tu mieszka | Czego NIE wolno importować |
|---|---|---|---|
| Domena | `src/domain/` | typy zdarzeń, inwarianty, projekcje, **detekcja lotu** | React, RN, Expo, SQLite, Zustand, **oraz pozostałe warstwy** |
| Aplikacja | `src/application/` | komendy, zapytania, porty, `EventsRepo` | framework, `infrastructure/`, `ui/` |
| Infrastruktura | `src/infrastructure/` | adaptery: SQLite, in-memory, zegar, id | `ui/` |
| UI | `src/ui/` | ekrany, nawigacja, komponenty, motywy, store, formatowanie | — |

Wnętrze `ui/`:

| Katalog | Rola |
|---|---|
| `screens/` | ekrany aplikacji |
| `navigation/` | stos nawigacji + `RootStackParamList` |
| `components/` | **Design System** — patrz katalog niżej |
| `hooks/` | spoiny między portami a UI (np. `useFlightDetection`) |
| `theme/` | tokeny 5 motywów + `ThemeProvider` / `useTheme` |
| `store/` | Zustand — cienka warstwa nad komendami i zapytaniami |
| `bootstrap/` | **composition root**: otwiera SQLite, buduje warstwy, podłącza do store'u |
| `format.ts` | prezentacja liczb domeny (czas UTC, block time, MH wg formatu, litry) |

`App.tsx` odpowiada wyłącznie za poziom aplikacji: dostawcy kontekstu, fonty, composition
root i nawigację. Ekran nie wie, skąd biorą się zależności.

### Design System (`ui/components/`)

**Zasada: ekran nie definiuje własnych kart, chipów ani przycisków.** Jeśli czegoś
brakuje — dokładamy to do DS i używamy wszędzie. Dzięki temu poprawka wzorca (np.
powiększenie celów dotykowych po audycie użyteczności) przechodzi przez całą aplikację,
a nie przez jeden ekran.

| Komponent | Rola | Skąd w designie |
|---|---|---|
| `Screen` | tło, safe area, scroll, **przyklejony nagłówek**, akcja kończąca (`footer`) | wszystkie ekrany |
| `AppText` | typografia z tokenów (`display`/`timer`/`param`/`body`/`label`/`mono`/`micro`) | wszystkie |
| `Brand` | znak marki (kafel z ikoną, „UZ AERO", tagline), rozmiary `md`/`hero` | `.brand` (00/00a), `.app-icon` (01) |
| `Icon` | ikony po nazwie **znaczeniowej** (`peek`, `warning`, `op-skoki`) | wklejone SVG Feather |
| `CheckIcon` | ptaszek „✓" bez `react-native-svg` (obrócony prostokąt, 2 krawędzie) | `.aircraft-check` |
| `Avatar` | kafelek z inicjałami, 40/32 px | `.pilot-avatar`, `.crew-avatar` |
| `AppBar` | pasek **dnia lotnego**: samolot, trasa, wskaźnik łączności | `.app-bar` / `.compact-bar` |
| `ScreenHeader` | nagłówek **formularza**: tytuł, krok, powrót, wariant wyśrodkowany | `.app-header` |
| `IdentityStrip` | kto jest zalogowany (awatar, nazwisko, rola) | `.pilot-strip` |
| `Card` | karta; nagłówek `bar` (kokpit) albo `inline` (formularz) | `.day-log` / `.section` / `.form-card` (00a) |
| `SyncChip` | **jedyny** globalny wskaźnik sieci (`SYNC` / `OFFLINE · n`) | reguła z `CLAUDE.md` |
| `SyncStatusBox` | przyrząd statusu wysyłki: plakietka, licznik, pasek postępu | `.google-box` (11) / `.sync-box` (11a) |
| `QueueBox` | kolejka outboxa: aktywna (amber) albo przygaszona do 30% | `.queue-box` (11a) / `.offline-queue` (11) |
| `ExportedBox` | pudełko „Serwer zaktualizował arkusz": link do karty, jawny błąd otwarcia (§6 pkt 3) | `.success-box` (11) |
| `StatusChip` | chipy **stanu sesji** (GROUND, RUNNING, cache) | `.ground-chip` |
| `Tag` | **przypisy** przy pozycji listy/nagłówku (8–11 px) | `.pic-lock-tag`, `.optional-tag`, `.step-badge` |
| `Banner` | trzy typy: `status` / `warning` / `edu` (zamykalny → mini-`?`) | taksonomia z `design-notes.md` |
| `CardPicker` | wybór z **listy kart** (nigdy natywny select), układ jednowierszowy | `.aircraft-option`, `.crew-option` |
| `OptionGrid` | siatka kart **z ikonami**, 2 kolumny | `.op-grid` |
| `OptionInput` | wartość konfiguracyjna w „ubraniu" pola — bez wpisywania | `.option-input` (11) |
| `PinDots` | kropki PIN-u; odmowa = czerwień + potrząśnięcie (jedyny komunikat) | `.pin-dots` (00) |
| `Numpad` | klawiatura PIN 3×4, klawisze 58 px; slot biometrii celowo pusty | `.numpad` (00) |
| `ProfileChip` | karta lokalnego profilu na zamku (awatar, nazwisko, kod) | `.profile-chip` (00) |
| `Field`, `TextField` | oprawa pola: etykieta mono, tag, podpowiedź; fokus zielony | `.field` / `.field-input` |
| `ValueBox` | pole **odczytu**: duża wartość + jednostka, kontekst i ołówek po prawej | `.field-input.filled` |
| `Readout` | sekcja odczytu z licznika: wartość, świeżość, pasek, korekta, historia | `.section` w 02a |
| `FreshnessNote` | adnotacja §4.8: `live` (cisza) / `cache` (data) / `brak` / `manual` | `.fresh-note` |
| `LevelBar` | pasek poziomu wobec pojemności | wskaźnik paliwa w 02a |
| `Trail` | oś czasu prowadząca do wartości przekazania | `.trail` |
| `InlineNote` | przypis w kolorowym pudełku (mono 10 px + ikona) | `.certified-row`, `.none-box` |
| `PeekBanner` | pasek „oglądasz cudzą sesję" ze źródłem i wiekiem danych | `.ro-banner` (04b) |
| `OutboxGuard` | amber-box ochrony konta przy niepustym outboxie (§3.0) | `.outbox-guard` (00, 13) |
| `RefDataStamp` | stempel cache referencyjnego: kropka + „sync HH:MM UTC" | `.ref-sync` (01, 13) |
| `Caption` | wyśrodkowany podpis pod akcją (mono 9 px) | `.takeover-hint`, `.actions-reason` |
| `CrewRow` | wiersz aktualnej załogi: rola, kod, „od kiedy", block | `.crew-row` (07) |
| `StepList` | numerowana procedura wychodząca poza ten telefon | `.handover-steps` (07) |
| `PillButton` | mała akcja nagłówka (pigułka z ikoną) | `.btn-add` (08) |
| `GhostAction` | dyskretna akcja w stopce karty (kreskowana linia) | `.block-add` (08) |
| `ReadingSheet` | arkusz korekty odczytu: duża wartość, odniesienia, ostrzeżenie | 02b / 02c, godziny duty (02, 09) |
| `Stepper` | wartość liczbowa przyciskami ±, cele 46 px | odczyty paliwa/MH, skoczkowie, czas |
| `SummaryHero` | karta „to zaraz zapiszesz": kod, wielki napis, tagi | `.summary-card` |
| `SummaryGrid` | dwukolumnowa siatka klucz/wartość do podsumowań | `.summary-grid` |
| `KeyValueRow` | wiersz klucz—wartość (kroje `micro`/`mono`, `valueTone`, `divider`) | `.diag-row` (13), `.row` „Dane dnia" (11a) |
| `SettingsAction` | wiersz akcji ustawień: ikona, nazwa, podpis (przy blokadzie niesie powód), strzałka | `.action-item` (13) |
| `SummaryStrip` | pasek bilansu dnia poza obszarem przewijania | `.summary-strip` |
| `ResultRow` | stopka sekcji: opis + wyliczona wartość nad linią | `.result-row` (09) |
| `ResultBar` | samodzielny pasek wyniku z rachunkiem, na tonowanym tle | `.result-row` (06) |
| `CalcBox` | wyliczenie zużycia paliwa z podaniem składników | `.calc-box` |
| `GaugeHero`, `ScaleBar` | wskaźnik FOB z podziałką | `.fob-indicator` |
| `DutyHero` | czas służby wielką czcionką + zakres | `.duty-hero` |
| `DayCard` | karta dnia w historii; wariant `editable` = niebieska ramka + pas „OTWÓRZ I POPRAW" | `.day-card` (12) |
| `CrewCard`, `CrewGrid` | karty załogi ze statystykami | `.crew-card` |
| `DataTable` | tabela lotów z celem korekty ≥ 44 px | `.data-table` |
| `StatGrid` | siatka 2×2 statystyk (etykieta / wartość / jednostka) | `.fuel-grid-2x2` |
| `CounterRow` | licznik sztuk z przyciskami 46 px | `.type-row` (05e) |
| `DropSheet`, `ManualEventSheet` | arkusze zrzutu i wpisu ręcznego nad kokpitem | 05e / 05f |
| `CorrectionSheet` | arkusz korekty: czas ±1 min, wpływ na czasy, strefa „nie było" | 04c |
| `Metric`, `MetricGrid` | komórka parametru i zawijana siatka | `.param-cell`, `.metric` |
| `PhaseHero` | plakietka + faza lotu 54 px + prędkość pionowa | `.phase-hero` |
| `ParamGrid` | sztywna siatka 2×2 parametrów GPS; `stale` (— — po utracie fixa) i `note` (skąd wartość) | `.param-grid`, `.param-stale-note` (05g) |
| `NoGpsBanner` | baner-przyrząd utraty fixa GPS (status, ryzyko 🔴 §8): wiek fixa + akcje ratunkowe 44 px | `.no-gps` / `.no-gps-link` (05g) |
| `CockpitActions` | dolny pasek: zapis ręczny, zrzut, STOP z powodem blokady | `.action-row` |
| `EventLog` | log dnia jako **oś cykli**: szyna z ikonami, chipy, cel korekty ≥ 44 px | `.day-log`, `.cycle-log` |
| `DutyStrip` | licznik czasu służby od meldunku | `.duty-strip` |
| `ActionGrid` | siatka 2×2 akcji naziemnych z podpisem stanu | `.action-grid` |
| `ActionButton` | akcja z **przytrzymaniem 2 s** i blokadą **z podanym powodem** | `.btn-primary`, `.start-engine`, `.start-btn` (01) |
| `Sheet` | arkusz od dołu dla decyzji dotykających innych | `.modal-overlay` (przejęcie) |
| `PinChangeSheet` | zmiana PIN w trzech krokach (obecny→nowy→powtórz), offline | arkusz PIN z 13 |
| `ManualEntrySheet` | pełny wpis §3.8: cztery czasy ze stepperami ±1 min (przytrzymanie powtarza) + uwagi | „Nowy wpis ręczny" (08) |
| `DetectToast` | toast autodetekcji: duży **COFNIJ** + licznik | `.detect-sheet` |
| `tone.ts` | mapowanie tonu → (akcent, tło, obramowanie) | wspólne dla wszystkich |

Trzy rzeczy w `ActionButton` nie są ozdobnikiem: przytrzymanie chroni przed
przypadkowym dotknięciem w wibracjach, powód blokady jest **widocznym tekstem** (nie
tooltipem — `title` w RN nie istnieje), a cel dotykowy ma ≥ 44 px, bo pilot pracuje
w rękawicach.

`CheckIcon` powstał, bo zaznaczenie w `CardPicker` było wyłącznie zielonym krążkiem —
czyli sygnałem **wyłącznie kolorystycznym**. W słońcu, w motywach jasnych i przy
daltonizmie to za mało; kształt ptaszka niesie tę informację niezależnie od koloru.
Rysujemy go layoutem RN, a nie `react-native-svg` ani fontem ikon — obie te biblioteki
są modułami natywnymi i wymuszałyby przebudowę dev clienta.

**Czwarty stan świeżości: `manual`.** §4.8 zna trzy stany danych z serwera (`live` / `cache`
/ `brak`), ale po ręcznej korekcie wartość nie pochodzi już z serwera **wcale**. Audyt
wyłapał, że ekran 02a zostawiał wtedy „Ostatnie pobrane · 21 JUN 17:30" obok liczby wpisanej
przez pilota — kłamstwo o pochodzeniu danych. `manual` renderuje zieloną adnotację „Twój
odczyt z licznika": zielona, bo `CLAUDE.md` stawia licznik fizyczny WYŻEJ niż serwer, więc
to potwierdzenie, a nie ostrzeżenie.

**Stan banerów `edu` jest trwały i per pilot** (`ui/store/eduBanners.ts`, AsyncStorage).
To wymóg z `CLAUDE.md`, a nie usprawnienie: baner pouczający jest pomocny raz i szumem
zawsze potem. Trzymamy go poza rejestrem zdarzeń — rejestr opisuje lot, nie ustawienia.

**Przycisk podaje ikonę NAZWĄ, nie gotowym elementem.** `ActionButton icon="check"`, nie
`icon={<Icon … color={…} />}`. Kolor i rozmiar zna tylko przycisk, bo tylko on wie, czy
jest zablokowany i jakiego jest wariantu. Gdy kolor ustawiały ekrany, każdy wpisywał
`theme.colors.bg` na sztywno i po zablokowaniu zostawała czarna ikona na ciemnym tle.

**Mockup jest specyfikacją, nie inspiracją.** Ekran implementujemy przez odczytanie
odpowiadającego mu pliku w `design/` i odwzorowanie go sekcja po sekcji — kolejność,
treść etykiet i formy kontrolek stamtąd, nie z improwizacji. Gdy w DS brakuje wzorca
(pasek tożsamości, siatka ikon, arkusz przejęcia), **dokładamy komponent**, a nie
upraszczamy ekran do tego, co już mamy. Jeśli mockup wydaje się zły — to temat na rozmowę
przed implementacją, nie na cichą zmianę w kodzie.

Trzy warianty `ActionButton` odpowiadają trzem klasom z mockupów: `solid` = `.btn-primary`
(pełna zieleń, ciemny napis — „DALEJ" formularza), `primary` = `.start-engine` (przygaszone
tło akcentu, bo pełna zieleń świeciłaby nocą w oczy), `secondary` = sam kontur.
Do tego rozmiary: `hero` (`.start-engine` w skali kokpitu), `lg` (22 px / ls 3,
`.btn-primary`) dla głównej akcji ekranu, `md` (16 px / ls 2, `.modal-btn-*`) dla pary
akcji w arkuszu i `splash` (`.start-btn` z 01: 20 px / ls 3) — jedyny, który przy
naciśnięciu wypełnia się akcentem zamiast przygaszać opacity, bo tak przybija go mockup;
rozmiar odpowiada klasie przycisku z mockupu, więc i to zachowanie mieszka w rozmiarze,
nie w osobnym przełączniku. Etykiety idą z tokenów `button` i `button_small` (`hero`
i `splash` nadpisują na nich tylko rozmiar) — napis na przycisku **nigdy** nie używa
tokenu `display` (34 px), bo to rozmiar tytułu ekranu.

`Stepper` istnieje z konkretnego powodu: audyt użyteczności wykazał, że dolewka paliwa
była ustawiana uchwytem suwaka 16×16 px na torze 312 px — około **1,4 litra na piksel**.
W rękawicach to nie precyzja, tylko loteria.

### Klawiatura i pola edycji (Android edge-to-edge, Expo SDK 54 / RN 0.81)

Ta sekcja jest zapisem **pięciu tur zgłoszeń z urządzenia** (2026-07-30). Każda reguła
niżej ma za sobą konkretny objaw u pilota, więc zanim ją zmienisz — sprawdź, czy nie
wracasz do stanu, który już raz nie działał. Cała arytmetyka mieszka w RN-free module
`ui/hooks/keyboardGeometry.ts` i ma testy (`__tests__/keyboardAwareScroll.test.ts`);
hooki obok tylko dostarczają do niej pomiary.

**Dlaczego to w ogóle jest problem.** Od SDK 54 aplikacja rysuje edge-to-edge, więc
systemowy `adjustResize` nie zmniejsza już okna — klawiatura wjeżdża NAD treść. Nic nie
zrobi tego za nas: `KeyboardAvoidingView` zachowuje się różnie na obu systemach i reaguje
na translucent status bar, a `react-native-keyboard-controller` to moduł natywny (przebudowa
buildu) — sięgamy po niego dopiero, gdy własna droga okaże się niewystarczająca.

1. **Ekran kurczy się o klawiaturę**, a nie daje się nią zasłonić: `Screen` +
   `useKeyboardHeight` (`paddingBottom`, przy tym znika dolny inset safe-area — wysunięta
   klawiatura i tak przykrywa pasek nawigacji).
2. **Wysokość klawiatury to większa z dwóch miar** — `height` i `windowHeight − screenY`
   (`keyboardBottomOffset`). Na Androidzie edge-to-edge `height` bywa wysokością samej
   powierzchni klawiatury, bez paska nawigacji, nad którym ona stoi, a okno sięga już pod
   pasek. Wynik nierealny (brak `screenY`) odrzucamy, żeby nie wypchnąć arkusza za ekran.
   **Pasek nawigacji jest już w tej liczbie** — to źródło pomyłki nr 3.
3. **Zapas pod akcjami arkusza liczy `sheetBottomPad`** i nigdzie indziej. Dwa objawy
   z jednego cyklu: dolny inset dodany OBOK wysokości klawiatury = pas martwego powietrza
   między arkuszem a klawiaturą; stały zapas z mockupu (24–32 dp) mniejszy niż pasek
   trzech przycisków (~48 dp) = ucięty dolny skraj POTWIERDŹ. Reguła: klawiatura
   wysunięta → sam odstęp; zwinięta → inset paska + odstęp, z zapasem z mockupu jako
   podłogą (nawigacja gestami daje inset 0–24 dp).
4. **Arkusz ma sufit wysokości** (miejsce nad klawiaturą minus status bar) i skraca
   PRZEWIJANĄ treść, nie rząd akcji — przyciski zostają widoczne zawsze.
5. **Dociąganie zogniskowanego pola: dwa razy `measureInWindow`** (pole i lista), nigdy
   `measureLayout`. Na Fabric `measureLayout` wymaga REFERENCJI węzła nadrzędnego, a przy
   czymkolwiek innym (liczbowy tag z `getInnerViewNode`) tylko wypisuje „ref.measureLayout
   must be called with a ref to a native component" i **nie mierzy nic** — mechanizm był
   martwy przez cały czas, a pilot widział czerwony błąd. Dwa pomiary w jednym układzie
   (okna) dają różnicę do dosunięcia; dół widocznej listy jest tu górą klawiatury, bo
   ekran jest już skrócony. Nie mieszaj układów okna i ekranu — to była pomyłka nr 1.

**Pola edycji w arkuszach** (`ReadingSheet`):

- **Godzina = klawiatura numeryczna + maska**, nie QWERTY: `keyboardType="number-pad"`
  i `maskTimeUtcInput` składa cztery cyfry w „HH:MM" (klawiatura numeryczna nie ma
  dwukropka, a pełna zajmuje pół ekranu i podstawia podpowiedzi słownikowe). Licznik MH
  w formacie `hh:mm` zostaje na `text`, bo liczba cyfr godzin jest dowolna.
- **Nigdy `selectTextOnFocus` na polu sterowanym.** Na Androidzie to `selectAllOnFocus`,
  które odnawia zaznaczenie przy KAŻDYM programowym ustawieniu tekstu — a wartość idzie
  przez JS i wraca, więc pierwsza wpisana cyfra znów była zaznaczona i druga ją wymazywała.
  Zamiast tego zaznaczamy całość jawnie **raz, przy otwarciu** (`selection`), a potem
  oddajemy kursor polu; przy masce dosuwamy go na koniec, bo maska przestawia znaki.
  `onSelectionChange` świadomie NIE jest podłączone: zdarzenie potrafi dojść z pozycją
  sprzed maski i cofnąć kursor w środek napisu.
- **Kolor zaznaczenia z tokenu `colors.selection`**, neutralnego per motyw — nigdy akcent
  tonu. Cyfry mają kolor tonu (mockup 02b), więc akcent w tle dawał jednolity prostokąt
  bez czytelnego tekstu. Kursor i uchwyty zostają w pełnym kryciu tonu.

### Stan UI vs rejestr zdarzeń

`ui/store/preflightDraft.ts` trzyma **szkic** preflightu przez trzy ekrany (02 → 02a → 03).
Rejestr jest append-only, więc nie wolno do niego wpisywać stanów pośrednich, które pilot
może jeszcze zmienić albo porzucić. Zdarzenia `session_claim` i `preflight_confirm`
powstają dopiero przy potwierdzeniu na ekranie 3.

### To nie jest tylko obietnica

Granice pilnuje **wykonywalny test** — `src/__tests__/architecture.test.ts` skanuje importy i wywala się, gdy ktoś je złamie. Ma też własny test kontrolny („skaner faktycznie widzi pliki i importy"), żeby nie przechodził dlatego, że niczego nie znalazł. Dodatkowo sprawdza, że **barrel infrastruktury nie wciąga modułu natywnego** — dzięki temu testy działają w Node, bez urządzenia.

Dokument może się zdezaktualizować; test nie.

---

## 3. Jedyna ścieżka zapisu

Każda intencja pilota przechodzi tę samą drogę (`application/commands/sessionCommands.ts`):

```
1. wczytaj strumień sesji z magazynu        stan trwały, nie ekranowy
2. zbuduj projekcję  projectSession()       co wiemy o dniu
3. ostempluj kandydata  repo.stampEvent()   uuid + oba zegary (device + GPS)
4. sprawdź inwarianty  checkAppend()        domena, czysta funkcja
5. twarde naruszenie → wyjątek              NIC się nie zapisuje
6. zapisz + zwróć miękkie ostrzeżenia       repo.appendStamped()
```

**Dlaczego stan czytamy z bazy, a nie ze store'u:** gwardia ma działać niezależnie od tego, co akurat trzyma UI — po restarcie aplikacji, przy dwóch ekranach naraz, przy zdarzeniu z autodetekcji GPS. Przy kilkuset zdarzeniach dziennie (§5.2) koszt przeliczenia jest nieistotny, a niezależność od pamięci UI — nie.

**Komendy są bezstanowe:** kontekst sesji (`SessionContext`) przychodzi argumentem, więc test komendy to jedno wywołanie, bez ceremonii „najpierw zaloguj".

Wynik komendy (`CommandResult`): zapisane zdarzenie + lista **miękkich ostrzeżeń**.

---

## 4. Inwarianty: twardy błąd czy miękka flaga

To najważniejsza decyzja w tej warstwie.

- **`error` — twarde odrzucenie.** Zdarzenie jest logicznie niemożliwe: `ENGINE_STOP_IN_FLIGHT`, `MH_REGRESSION`, `NOT_IN_FLIGHT`, `FUEL_ARITHMETIC`, `WRITER_MISMATCH`. Komenda rzuca wyjątek, nic nie trafia do rejestru, pilot dostaje natychmiastowy komunikat.
- **`warning` — miękka flaga.** Zdarzenie **zostaje zapisane**, ale komenda zwraca ostrzeżenie: `FUEL_MISMATCH`, `CLOCK_DRIFT`, `MH_DELTA_MISMATCH`.

**Dlaczego nie wszystko flagujemy, skoro serwer flaguje (§4.5).** Bo to inne role. Serwer scala dane wielu pilotów po fakcie i nie ma prawa odrzucić czegoś, co już się wydarzyło w terenie — flaguje do wyjaśnienia. Klient stoi w drugą stronę: **pilot jest przy samolocie i patrzy na licznik**, więc rozbieżność da się naprawić natychmiast. Cichy zapis śmiecia byłby tu wygodnictwem, nie offline-first.

Reguła kciuka: *niemożliwe → error; wymagające rozstrzygnięcia przez człowieka → warning*.

### Grupy naruszeń (`domain/rules/violations.ts`)

sesja i single-writer · preflight · silnik i lot · paliwo · motogodziny · zrzuty · załoga · wpis ręczny i zamknięcie dnia · zegary.

Nazwy pokrywające się z flagami serwera (`MH_REGRESSION`, `FUEL_MISMATCH`, `CLOCK_DRIFT`) są **celowo** takie same — ten sam język po obu stronach.

---

## 5. Porty i adaptery

Porty w `application/ports/`, każdy z realnym powodem:

| Port | Po co istnieje |
|---|---|
| `StoragePort` | `expo-sqlite` **nie działa w Node/Jest**. Bez tego portu logika byłaby nietestowalna. Implementacje: `expoSqliteAdapter` (aplikacja), `inMemoryAdapter` (testy). |
| `ClockPort` | Czas musi być deterministyczny w testach; produkcyjnie dwa zegary (device + GPS, §4.5). |
| `IdPort` | UUID zdarzenia = klucz idempotencji; w testach przewidywalny. |
| `GpsPort` | Lot trwa 45 minut i wymaga samolotu. Port pozwala **odtworzyć trasę** z serii fixów i sprawdzić detekcję w milisekundach. Implementacje: `expoLocationAdapter` (urządzenie), `replayGpsAdapter` (testy i podgląd). |
| `SensorPort` | Czujniki pokładowe (barometr, akcelerometr, żyroskop). Osobno od GPS, bo mają inne właściwości: brak własnego zegara, fizyczna NIEOBECNOŚĆ na części urządzeń i próbkowanie 50 Hz. Oddaje **agregaty sekundowe**, nie surowe próbki. Implementacje: `expoSensorsAdapter` (urządzenie), `nullSensorAdapter` (brak czujników / testy). |

Moduły natywne (`expo-sqlite`, `expo-location`, `expo-sensors`) są importowane
**wyłącznie** przez swoje adaptery i nie trafiają do barrela infrastruktury — inaczej
testy w Node przestałyby działać. Pilnują tego dwa testy w `architecture.test.ts`.

**`GpsPort.start()` = subskrypcja JEDNEGO odbiorcy, nie przełącznik odbiornika.**
Zwrócona funkcja wypisuje wyłącznie jego; odbiornik gaśnie dopiero, gdy zejdzie ostatni
(`gps/gpsFanout.ts`, regresja `gpsFanout.test.ts`). Reguła jest twarda, bo słuchaczy jest
dwóch naraz: autodetekcja w kokpicie i diagnostyka GPS na 13. Adapter z jednym słuchaczem
oddawał strumień temu, kto wszedł później, i gasił go przy wyjściu — kokpit tracił
autodetekcję na resztę dnia, a baner „GPS: brak sygnału" nie miał już czym zniknąć.
Stąd też odbudowa nasłuchu w `useFlightDetection`: po `GPS_STALE_SEC` ciszy hook zdejmuje
subskrypcję i zakłada nową, bo martwej subskrypcji powrót sygnału nie obudzi.

Portów **nie mnożymy na zapas** — port bez drugiej implementacji lub potrzeby testowej to koszt bez zysku.

---

## 6. Czego świadomie NIE ma

Aplikacja mobilna dla kilkudziesięciu pilotów. Poniższe rozwiązania rozwiązują problemy, których tu nie ma:

- **Kontener DI** — zależności wstrzykujemy konstruktorem, jest ich kilka. Kontener dodałby magię i konfigurację, nic nie upraszczając.
- **Mediator / event bus** — komendy wołamy wprost. Pośrednik utrudniłby czytanie ścieżki wykonania.
- **Osobna baza read-model** — projekcje liczą się w pamięci w kilka ms (§5.2). Druga baza to drugie źródło prawdy do zsynchronizowania.
- **Agregaty DDD z tożsamością encji** — sesja dnia to strumień zdarzeń, nie graf obiektów. `SessionState` + czyste reguły dają to samo bez ceremonii.
- **Mappery DTO ↔ domena w obie strony** — typy zdarzeń są serializowalne; podwójne mapowanie to praca bez zysku.
- **Generyczne repozytorium** — mamy jeden strumień zdarzeń i cache referencyjny; `EventsRepo` opisuje je wprost.

Kryterium przy dokładaniu warstwy: **czy junior wchodzący w projekt szybciej znajdzie miejsce na nową regułę, czy wolniej?**

---

## 7. Przepisy

### Nowy typ zdarzenia

1. `domain/events/events.ts` — dopisz wariant do `EventType` i payload do `EventPayloadMap` (unia dyskryminowana: `type` zawęża `payload`).
2. `domain/projections/session.ts` — obsłuż go w `switch`, jeśli wpływa na stan dnia.
3. `domain/rules/sessionRules.ts` — dopisz gwardię w `checkAppend` (kiedy wolno, kiedy nie).
4. `application/commands/sessionCommands.ts` — metoda komendy (ścieżka z §3 jest wspólna, nie powielaj jej).
5. Testy: `rules.test.ts` (dozwolony + odrzucony) i `projections.test.ts` (wpływ na stan).

### Nowa reguła / inwariant

1. Kod naruszenia w `domain/rules/violations.ts` + waga (`error` / `warning` — patrz §4).
2. Sprawdzenie w `checkAppend`.
3. Test w `rules.test.ts`: przypadek przechodzący **i** odrzucany. Sama ścieżka szczęśliwa niczego nie dowodzi.

### Nowy ekran

Wzorzec: `ui/screens/CockpitScreen.tsx` (pierwszy ekran wpięty end-to-end).

1. Plik w `ui/screens/`, zbudowany na prymitywach z `ui/components` i tokenach z `ui/theme` — **żadnych kolorów na sztywno**; styl przez lokalny `useStyles()` czytający motyw.
2. Dane czytaj ze store'u (`useSessionStore`), zapisuj **wyłącznie komendą**. Ekran nie dotyka repozytorium ani bazy.
3. Komenda może rzucić przy twardym inwariancie — przechwyć wyjątek, żeby nie wywalić aplikacji, ale **pokaż powód** (`lastError`). Cichy błąd jest zakazany (§6 pkt 3 wymagań).
4. Pokaż też `warnings` — zdarzenie zapisane, lecz warte uwagi pilota.
5. Zarejestruj ekran w `RootStackParamList` i `RootNavigator`.
6. Liczby formatuj przez `ui/format.ts` (czasy w UTC, MH wg formatu samolotu).
7. Ekran z polem tekstowym albo arkuszem → przeczytaj wcześniej **„Klawiatura i pola
   edycji"** w §2. Wysokość klawiatury, zapas pod akcjami arkusza i zaznaczenie tekstu mają
   po jednym poprawnym rozwiązaniu i po kilka objawów, gdy się je obejdzie własnym kodem.

### Nowy adapter (np. serwer sync)

Interfejs do `application/ports/`, implementacja do `infrastructure/`. Domena i komendy nie mogą się dowiedzieć, że coś się zmieniło.

---

## 8. Testy

`app/src/__tests__/` — 346 testów, wszystkie w Node (bez urządzenia):

| Plik | Czego pilnuje |
|---|---|
| `architecture.test.ts` | granic warstw — patrz §2 |
| `rules.test.ts` | inwariantów: każda gwardia w wersji dozwolonej i odrzuconej |
| `commands.test.ts` | ścieżki zapisu: walidacja przed zapisem, brak zapisu przy twardym błędzie |
| `projections.test.ts` | zgodności z designem — patrz niżej |
| `repo.test.ts` | append, outbox (`syncedAt IS NULL`), `markSynced`, dedup po uuid, dwa zegary |
| `store.test.ts` | cienkiej warstwy Zustand nad aplikacją |
| `flightDetector.test.ts` | automatu detekcji — patrz niżej |
| `detectionTrends.test.ts` | modułów pomocniczych detekcji w izolacji: bufor historii, cechy trendowe (prędkość z dopplera i z przemieszczenia, przyspieszenie, prędkość kątowa z przejściem przez północ), retro-datowanie |
| `imu.test.ts` | matematyki czujników inercyjnych: pułapka „3 %", niezmienniczość względem ułożenia telefonu, zamrożenie filtra grawitacji z budżetem, agregaty okna, tor barometryczny |
| `sqliteSchema.test.ts` | DDL na prawdziwym silniku SQLite — patrz niżej |
| `format.test.ts` | formatowania i **parsowania** odczytów w obie strony |
| `cockpitLog.test.ts` | budowania wierszy logu dnia, w tym wyliczenia łańcucha MH |
| `flightPhase.test.ts` | fazy lotu i prędkości pionowej — patrz niżej |
| `refuelMath.test.ts` | wyliczeń tankowania: zużycie L/h, limit dolewki, podziałka |
| `statsDay.test.ts` | składania statystyk dnia: tabela lotów, zużycie, rozbicie skoczków |
| `cockpitPeek.test.ts` | podglądu cudzej sesji: świeżość migawki, treść ostrzeżeń |
| `crewChange.test.ts` | atrybucji block time per pilot i blokad zmiany Duala |
| `manualLog.test.ts` | grupowania logu w cykle silnikowe i wierszy oczekiwanych |
| `corrections.test.ts` | nakładania korekt 04c (retime/void, „ostatnia wygrywa") i ich reguł |
| `correctionUi.test.ts` | zapowiedzi skutku korekty — „Wpływ na czas lotu" liczy ta sama projekcja |
| `syncEngine.test.ts` | pętli wysyłki §4.3 i poświadczeń §3.0: duplikaty = dostarczone, offline ≠ auth_expired, jedna rotacja tokenu, `fetchStatus` dla ekranu 11 |
| `syncStatus.test.ts` | prezentacji ekranu 11: odmiana liczebników, konwencja nazwy karty §4.7, licznik wysyłki z ogonem outboxa |
| `referenceSync.test.ts` | odświeżania cache §4.8: nadpisanie seedu prawdą serwera, ETag/304 z podbiciem wieku, brama 15 min, offline nie psuje cache |
| `claimMode.test.ts` | trybu przejęcia §4.4: `takeover_online` tylko z odpowiedzią serwera, żywy poprzednik wygrywa z cache, „już wolny" gasi przejęcie |
| `pinCrypto.test.ts` | własnego SHA-256 (wektory NIST + node:crypto dla UTF-8) i solonego skrótu PIN-u — rekord nigdy nie niesie PIN-u wprost |
| `historyDays.test.ts` | ekranu 12: podział wg okna korekty, dzień otwarty poza historią, tag wysyłki z outboxa sesji, plakietka splasha, odliczanie |
| `traceRecorder.test.ts` | śladu kalibracyjnego: zapis fixów/markerów, retencja po zegarze urządzenia, księgowość wysyłki (offline zostawia wpisy), limit paczki |
| `gpsLoss.test.ts` | napisów 05g (wiek fixa, baner, „— —" z czasem) i formatu pozycji DDM z ekranu 13 (półkule, zera wiodące) |
| `themePrefsSync.test.ts` | uzgadniania motywu pilota przez `/me/prefs`: LWW po stemplu decyzji w obie strony, `dirty` jak outbox, brama wieku pulla, offline = `skipped` |
| `themePrefsStore.test.ts` | rekordu motywu per pilot: izolacja pilotów na wspólnym telefonie, migracja starego klucza per telefon, odporność na zepsuty zapis |

**Korekta (04c) to jedyne miejsce, gdzie prawda projekcji odkleja się od surowego
rejestru** — i cały jej model mieszka w `domain/projections/corrections.ts`:
`applyCorrections` zamienia strumień surowy na EFEKTYWNY (czasy po poprawce, bez zdarzeń
unieważnionych, bez samych `event_correction`), a przechodzą przez nią WSZYSCY konsumenci
(projekcja, log dnia, statystyki), więc „starych" czasów nie widać nigdzie poza rejestrem,
który celowo pamięta wszystko. Gdy cel ma kilka korekt, wygrywa ostatnia — `retime` po
`void` przywraca zdarzenie do życia. Wiersz „Wpływ na czas lotu: 0:53 → 0:56" w arkuszu
liczy się PODWÓJNĄ PROJEKCJĄ (przed/po kandydacie) — obietnica i skutek to jeden kod,
nie dwa równoległe wyliczenia. Walidację celu robią reguły przez `state.eventIndex`
(uuid → typ, z surowego strumienia): cel musi istnieć, zdarzenia cyklu życia sesji
(claim/preflight/day_close) nie podlegają korekcie, czas z przyszłości odpada, a po
`day_close` obowiązuje okno 24 h (`CORRECTION_EVENT_TYPES`).

**`crewChange.test.ts` pilnuje atrybucji czasu per pilot.** Dual wchodzący w połowie dnia
dostaje block time WYŁĄCZNIE z cykli po swoim wejściu (cykl trwający w chwili wejścia —
od momentu wejścia). Do dokumentów każdy pilot wpisuje własny czas, więc przybliżenie
„wszyscy mają tyle co dzień" byłoby fałszem rozliczeniowym, którego nikt nie zauważy
aż do kontroli.

**Zdarzenie `taxi` ma inną „cenę pomyłki" niż start i lądowanie** — i stąd wynika cała
jego obsługa. Nie wyznacza żadnego czasu w dokumentach (blok liczą `engine_start`/`engine_stop`,
lot — `takeoff`/`landing`), więc fałszywy wpis dokłada wiersz w logu zamiast psuć rozliczenie.
Dlatego zapisuje się **od razu, bez okna „COFNIJ"**, a jego detekcja jest w automacie
rozpatrywana **dopiero po** starcie i lądowaniu: gdyby szła pierwsza, jej wykrycie kończyłoby
krok i przesuwało potwierdzenie startu o jeden fix. Ten defekt wyszedł dopiero z testu
i został naprawiony kolejnością, nie obejściem w teście.

**`flightPhase.test.ts` wymusił zmianę algorytmu, a nie tylko go opisał.** Pierwsza wersja
liczyła prędkość pionową jako różnicę skrajnych fixów okna. Test z realnym artefaktem GPS
(jeden fix wyżej o 30 ft przy 5 s historii) dał **360 ft/min** — czyli fałszywe „Climb"
z szumu. Metodę zastąpiła regresja liniowa po całym oknie plus minimalna rozpiętość 5 s:
ten sam artefakt daje teraz ~275 ft/min, poniżej progu. Faza jest najbardziej wyeksponowaną
informacją w locie (napis 54 px) — migotanie odebrałoby jej sens.

`format.test.ts` pilnuje `parseMotoHours` — jedynego miejsca, w którym napis wpisany przez
pilota staje się liczbą trafiającą do rejestru. Pomyłka o pół godziny nie wygląda tam na
błąd, tylko na zapisaną wartość, więc parser i formater sprawdzamy razem (`1234:30` ↔ `1234.5`),
razem z wpisami nieczytelnymi, które muszą dać `null`, a nie „prawie liczbę".

**`sqliteSchema.test.ts` zamyka jedyną lukę, przez którą błąd doszedł na telefon.**
Adapter importuje `expo-sqlite`, więc schemat był poza zasięgiem testów w Node — i właśnie
tam ukrył się `rowid` na liście kolumn `CREATE INDEX` (legalny w `ORDER BY`, odrzucany
w indeksie). `tsc` i 103 testy przeszły; aplikacja wysypała się przy pierwszym starcie
na urządzeniu. Dlatego DDL mieszka teraz w `infrastructure/storage/schema.ts` jako czysty
tekst i jest uruchamiany na `node:sqlite` (silnik wbudowany w Node 24 — zero zależności).
Test sprawdza też rzeczy, na których adapter milcząco polega: idempotencję migracji,
zgodność `SCHEMA_VERSION` z liczbą migracji, listy kolumn (kontrakt z `EventRow`
i spółką — literówka w nazwie kolumny nie jest błędem typów, tylko `undefined` w runtime),
użycie indeksu przez planer oraz sortowanie po `rowid`.

**`flightDetector.test.ts` odtwarza sytuacje, których nie da się wyklikać na biurku.**
Consumer-grade GPS kłamie, a §8 klasyfikuje fałszywe detekcje jako ryzyko 🔴. Testy
odtwarzają je deterministycznie: **ciasny zakręt** (GS spada do zera na wysokości 2500 ft —
nie wolno uznać za lądowanie), **turbulencja przy ziemi** (±30 ft nie może udawać startu),
**przelot nad pasem** (nisko, ale szybko), **utrata sygnału** (po przerwie nie wolno
„domknąć" warunku z rozpędu), **skok zegara wstecz**, oraz pełny cykl kołowanie → start
→ przelot → lądowanie. To jedyny sposób, żeby sprawdzić algorytm bez samolotu.

Po przebudowie (§8.1) doszła druga rodzina asercji, równie ważna jak „czy wykryto":
**KIEDY wykryto**. Detekcja zwraca `at` (retro-datowane) obok `confirmedAt` (fix
potwierdzający), a do dokumentów idzie `at` — więc różnica między nimi jest przedmiotem
testu, nie szczegółem implementacji. Doszły też: **static-hold** (odbiornik melduje 0 kt,
choć pozycja jedzie — kołowanie MUSI zostać wykryte), **brak prędkości w ogóle**, **dryf
na stanowisku** (kontrola czułości kanału przemieszczeniowego), **dobieg kontra rozbieg**
przez ten sam próg prędkości, oraz **weto zakrętu** z kontrolą, że nie tnie lądowań na
kursie stabilnym. `detectionTrends.test.ts` bada moduły pomocnicze w izolacji — tam siedzi
m.in. przejście kursu przez północ (bez różnicy kołowej weto unieważniałoby lądowania na
kursach północnych). `imu.test.ts` mierzy liczbowo pułapkę „3 %" i pilnuje
niezmienniczości względem trzech różnych ułożeń telefonu.

**Zakłócenia GPS (audyt algorytmu 2026-07-29).** Jamming to częściej DEGRADACJA niż
cisza — fixy przychodzą, ale kłamią. Detektor ma trójstopniową bramkę (`fixUsable` +
plauzybilność + geofence): fix z dokładnością > `MAX_FIX_ACCURACY_M` albo prędkością
(deklarowaną LUB implikowaną skokiem pozycji) > `MAX_PLAUSIBLE_SPEED_KT` liczy się jak
BRAK fixa (hook kwarantannuje go całkowicie — watchdog wygasza `gpsAvailable` i kokpit
pokazuje 05g); dla operacji jednolotniskowych (skoki) lądowanie dodatkowo wymaga
pozycji w promieniu `LANDING_FIELD_VICINITY_NM` od pola — ferry/przelot bramki NIE ma,
bo tam lądowanie gdzie indziej jest normą. Testy przybijają: fałszywe lądowanie ze
śmieciowego strumienia, teleportację spoofingu przy niewinnym GS, powrót dobrego
sygnału i brak regresji ferry.

### 8.1 Przebudowa detekcji na okno historii (2026-07-30)

> **Pełna dokumentacja referencyjna algorytmu i wszystkich progów — wraz ze skutkiem
> zmiany każdego z nich, macierzą trybów porażki i procedurą kalibracji — mieszka
> w `docs/algorytm-detekcji.md`.** Ta sekcja opisuje tylko DECYZJE i ich uzasadnienie.

Punktem wyjścia była skarga z praktyki: **początek kołowania jest trudny do wykrycia**.
Diagnoza wskazała trzy przyczyny, z których żadnej nie da się naprawić przesuwaniem progu.

**Przyczyna 1 — adapter zamieniał „nie wiem" na „stoi".** `coords.speed ?? 0` w
`expoLocationAdapter` mapował brak pomiaru na twarde zero. Android przy małych prędkościach
albo prędkości nie podaje, albo zeruje ją filtrem *static-hold* w układzie GNSS (żeby
zaparkowany telefon nie dryfował po mapie). Detektor widział „0 kt" — pomiar, którego nikt
nie wykonał, w przebraniu pomiaru wiarygodnego. `GpsFix.groundSpeedKt` jest teraz
`number | null`, a `trends.groundSpeed` odtwarza prędkość z przemieszczenia.

**Przyczyna 2 — próg mierzył najgorszą dostępną wielkość.** 4 kt ≈ 2 m/s przy dokładności
dopplera ~0,3 m/s to stosunek sygnału do szumu **~7:1**, i to zanim static-hold zbije go do
zera. To samo zjawisko widziane jako **przemieszczenie w oknie 30 s**: samolot kołujący 8 kt
przejeżdża ~120 m, stojący dryfuje ~5 m, czyli **~24:1**. Dlatego kanałem podstawowym
kołowania jest teraz oddalenie od **kotwicy postoju** (`motion.ts`) — centroidu pozycji
z postoju, odświeżanego, dopóki samolot jest bezspornie na stanowisku. Prędkość zeszła do
roli kanału wsparcia (fixy bez pozycji) i **została przy 4 kt**: obniżanie progu akurat
tam, gdzie danych jest najmniej, byłoby odwrotnością tego, co należy zrobić.

**Przyczyna 3 — zdarzenia dostawały zły czas.** Detektor emitował stempel fixa, który
warunek POTWIERDZIŁ. Każde zdarzenie było systematycznie spóźnione: kołowanie o kilkanaście
sekund, lądowanie z gałęzi wysokościowej nawet o kilkanaście — a w logu stała po prostu
jakaś godzina, więc nikt tego nie widział. Rozwiązaniem jest rozdzielenie dwóch pytań:
**CZY** (decyzja może zapaść późno i pewnie) od **KIEDY** (odpowiedź szukana WSTECZ
w buforze, `onset.ts`). `DetectorStep` zwraca teraz `detectedAt` — i to on idzie do rejestru.

Skutek uboczny okazał się ważniejszy niż sama poprawka czasu: skoro późna decyzja nie
pogarsza już dokładności, **okna potwierdzenia wolno było WYDŁUŻYĆ** (start 3→5 s,
lądowanie 5→8 s). Wcześniej były kompromisem między czułością a dokładnością i nie służyły
żadnej ze stron.

Architektura: automat trzyma w stanie okno historii (`history.ts`, 120 s) i deleguje pracę
do modułów o jednej odpowiedzialności — `trends.ts` (przyspieszenie, przemieszczenie,
prędkość kątowa), `motion.ts` (stoi/jedzie), `onset.ts` (kiedy), `geo.ts`, `regression.ts`.
Automatowi zostaje to, co naprawdę jego: kolejność decyzji, fazy, histereza. Hook UI
przestał prowadzić własny bufor fixów — dwa bufory to dwie prawdy o tym, co widział algorytm.

Dwie nowe obrony wzięte **za darmo, bez nowego czujnika**:

- **weto zakrętu przy lądowaniu.** `coords.heading` był w każdym odczycie lokalizacji
  i szedł do kosza. Daje prędkość kątową, a przyziemienie ma kurs stabilny, gdy krąg
  nadlotniskowy trzyma 3–5 °/s. To druga, niezależna obrona przed ryzykiem 🔴 „ciasny
  zakręt udający lądowanie", do tej pory pilnowanym wyłącznie warunkiem wysokości.
- **weto hamowania przy starcie** (`TAKEOFF_MAX_DECEL_KT_PER_SEC`). Zamyka realną dziurę:
  po lądowaniu faza wraca na `ground`, histereza trwa 30 s, a dobieg z prędkości
  przyziemienia do kołowania bywa dłuższy — samolot przechodził wtedy przez próg startu
  **z góry** i po samej prędkości wyglądał jak rozbieg. Sformułowane jako weto na hamowanie,
  a nie wymóg przyspieszania: ustabilizowane wznoszenie ma przyspieszenie około zera,
  więc wymóg dodatniego wyciąłby prawdziwy start.

Po lądowaniu automat emituje parę `landing` → `taxi` (kotwica ustawiana na punkt
przyziemienia), zgodnie z logiem w mockupie 05: „14:08 Landing", „14:08 Taxi".

### 8.2 Czujniki pokładowe — nagrywanie, nie decydowanie (2026-07-30)

Barometr i czujniki inercyjne są podłączone (`SensorPort`, `expoSensorsAdapter`,
`useSensorTrace`), ale **wyłącznie do śladu kalibracyjnego**. Detekcja ich nie czyta i nie
będzie, dopóki progi nie wyjdą z nagrań fazy 5 — dokładanie zgadywanych progów do algorytmu,
który właśnie przestał zgadywać, byłoby krokiem w tył. `expo-sensors` jest w zestawie SDK 54,
więc **dev build nie jest potrzebny** (wcześniejsza notatka w tym pliku sugerowała inaczej).

**Sprostowanie do audytu 2026-07-29: akcelerometr NIE jest bezużyteczny.** Odrzucenie
(„nieznana orientacja + wibracje tłokowe") było słuszne dla surowych osi i dla naiwnego
modułu, ale nie dla modułu **po odjęciu grawitacji**. Rachunek pułapki: rozbieg to ~0,25 g
poziomo, więc |a| rośnie z 9,81 do 10,11 m/s² — **trzy procent**, utopione w wibracjach.
Grawitację da się jednak usunąć bez znajomości orientacji: mocny filtr dolnoprzepustowy
(τ = 30 s) zbiega do kierunku „w dół", bo wibracja jest zeromodalna. Po odjęciu tego wektora
te same 2,45 m/s² są sygnałem kilkudziesięciokrotnie nad tłem, wciąż niezmienniczym względem
obrotu. Z żyroskopu bierzemy analogicznie |ω|, nie osie.

Filtr musi być **zamrażany** przy dużym przyspieszeniu liniowym (zasada równoważności:
akcelerometr z definicji nie odróżni pochylenia od przyspieszania). Pierwsza wersja zamrażała
TRWALE i test to złapał: po przełożeniu telefonu w uchwycie skok pionu o ~13,9 m/s² nigdy nie
spada pod próg, więc estymata zostawała przy starym ułożeniu do końca dnia, a każdy kolejny
odczyt był śmieciem — bez żadnego sygnału o awarii. Stąd `GRAVITY_FREEZE_MAX_SEC = 60`:
dłużej niż każdy rozbieg (20–30 s), więc manewr mieści się w budżecie, a trwała zmiana
ułożenia budżet wyczerpuje i filtr dociąga się sam w czasie ograniczonym z góry (~4,5 min).

Do śladu idą **agregaty sekundowe**, nie surowe próbki: 50 Hz × 6 h ≈ milion próbek dziennie
byłoby niezapisywalne obok śladu GPS (~30 tys. wierszy). Agregat (średnia i maksimum
|a_liniowe|, odchylenie standardowe jako miara wibracji, średnia i maksimum |ω|, ciśnienie)
jest tego samego rzędu wielkości co fixy. Odchylenie standardowe zastępuje FFT celowo —
interesuje nas ENERGIA pasma szybkozmiennego (jazda po nawierzchni generuje uderzenia,
których nie ma na postoju z pracującym silnikiem, a oderwanie kół gasi je skokowo), a nie
jego widmo.

Barometr nie potrzebuje QNH: detektor pracuje na RÓŻNICY względem elewacji pola z ENGINE
START, a różnica ciśnień daje ją wprost (~27 ft/hPa przy rozdzielczości czujnika rzędu
pół stopy, wobec 15–50 ft błędu GPS). Dryf pogodowy wymaga przezerowania datum na każdym
postoju — jedno odniesienie na cały dzień lotny byłoby błędem rzędu 135 ft.

Migracja 3 schematu **usuwa i odtwarza** `gps_trace` zamiast robić `ALTER TABLE ADD COLUMN`.
Powód: SQLite nie zna `ADD COLUMN IF NOT EXISTS`, więc `ALTER` odebrałby migracjom
idempotencję, której pilnuje `sqliteSchema.test.ts`. `gps_trace` to jedyna tabela, której
wolno zniknąć — materiał roboczy z 14-dniową retencją, poza outboxem, nigdy źródło prawdy.
Gdyby to była `events`, rozmowa byłaby zupełnie inna.

**Rejestrator śladu kalibracyjnego (faza 5, zawsze włączony — decyzja 2026-07-29).**
Kalibracja progów bez danych z realnych lotów to zgadywanie — więc telefon nagrywa:
SUROWE fixy sprzed kwarantanny (śmieci to najcenniejszy materiał do progów bramki)
+ markery detektora (`detection` = toast pokazany, `undo` = COFNIJ pilota — czyli
fałszywa detekcja oznaczona przez człowieka, której rejestr zdarzeń nie widzi).
Tor CAŁKOWICIE osobny od rejestru: tabela `gps_trace` (migracja 2 aplikacji, poza
outboxem, własna księgowość `uploaded_at`), retencja `TRACE_RETENTION_DAYS = 14`
przy starcie, wysyłka `TraceSync` jako OSTATNI krok pętli okazji (jedna paczka
≤ 2000/okazję — ślad nie konkuruje o łącze z rejestrem dnia) na `POST /traces`;
serwer (`FsTraceSink`) odkłada NDJSON per sesja w `TRACES_DIR` z dopisanym
`pilotId` z JWT. Analiza: `server/scripts/replay.ts` — ten sam `runDetector`
na nagranym śladzie, z nadpisywalnymi progami i zderzeniem detekcji replayu
z markerami lotu; najlepsze nagrania staną się złotymi śladami-testami. Wiersz
„Rejestrator śladu" w diagnostyce na 13. Barometr dopisze się do tej samej
tabeli jako nowy `kind` — bez zmiany serwera (koperta `/traces` celowo luźna).

**`projections.test.ts` to kontrakt z designem, nie zwykły test.** Odwzorowuje kanoniczną oś dnia 22 JUNE z `docs/design-notes.md` — te same liczby, które pokazują mockupy 04/09/10/11: block **6:39** (2:22 + 1:13 + 3:04), 6 lotów, paliwo **150 +48 −110 = 88 L**, MH **1234:30 → 1241:09**, oraz inwariant **Δ MH = block time**. Zmiana tych liczb w teście bez zmiany designu (i odwrotnie) to rozjazd, nie poprawka.

Ten test już raz się opłacił: wykrył, że projekcja iterowała zdarzenia w kolejności **wstawienia**, a nie chronologicznej — co psułoby wyliczenia po użyciu ekranu wpisu ręcznego (05f zapisuje zdarzenie z **cofniętym** czasem) i po korekcie czasu (04c).

---

## 9. Uruchamianie

```bash
cd app
npx expo start        # aplikacja (Expo Go / emulator)
npx jest              # testy — wszystkie w Node, bez urządzenia (liczba: §8)
npx tsc --noEmit      # kontrola typów (strict)
```

---

*Aktualizuj przy zmianie granic warstw lub zasad z §4. Reszta jest opisana testami.*
