# UZ Aero — architektura kodu

> Dotyczy monorepo: `app/` (React Native + Expo), `server/` (Fastify + PostgreSQL)
> i `packages/domain` (wspólna domena). TypeScript strict wszędzie.
> Architektura systemu (offline-first, sync, kontrakt API): `docs/_main.md.txt`.
> Ten dokument mówi, **jak jest zbudowany kod** i gdzie dopisać nową rzecz.

> ## ⚠ STATUS (aktualizacja 2026-08-11): przebudowa flow WYLĄDOWAŁA, słownik „duty" jest historią
>
> Nota z 2026-08-07 niżej opisywała okres przejściowy (design przebudowany, kod nie).
> Od tego czasu: etapy B–D flow ✅, pivot „sesja = jeden bieg silnika" (2026-08-10) ✅,
> a **klamra służby została usunięta w całości** (issue #23, 2026-08-11 — `dutyStart`/
> `dutyEnd`/`DUTY_END_BEFORE_START` nie istnieją; `projections/duty.ts` →
> `projections/pilotDay.ts`, `projectDuty` → `projectPilotDay`). Każde wystąpienie
> „dutyStart", „klamra służby", „wzlot" czy `leg_close` w dalszej części dokumentu
> czytaj jako narrację HISTORYCZNĄ. Specyfikacją modelu jest `_main.md.txt` §3.6/§3.6a
> i `CLAUDE.md` (sekcje „Sesja = jeden bieg silnika" i „Dzień pilota = lista sesji").
>
> (Nota z 2026-08-07, zachowana jako historia:) Decyzja z 2026-08-06 (`_main.md.txt`
> §3.6a) odwróciła fundament: dzień służby przestał być kontenerem na loty, jednostką
> potwierdzenia jest **wzlot**, a służba jest **klamrą** wokół lotów. Miejsca oznaczone
> blokiem `> ⚠ ETAP B` opisywały konsekwencje tej różnicy w trakcie przebudowy.

## 0. Monorepo (Faza 2)

```
packages/domain    @uzaero/domain — zdarzenia, reguły, projekcje, detekcja, ślad lotu,
                   analityka zużycia. Czysty TS, ZERO zależności (pilnowane testem
                   architektury — dlatego regresja i algebra są napisane ręcznie).
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
ekran 00-login za bramką `AuthGate` i sekcja „Synchronizacja" w Ustawieniach (13) —
kolejka, ostatnia wysyłka, uwagi serwera §4.5 i awaryjne ponaglenie; osobny ekran 11
usunięty 2026-08-12 jako trzecia kopia rozliczenia. Cache referencyjny zasila `ReferenceSync`
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
sesja/obcy profil = `skipped`. Po stronie serwera `pilots.theme` + `pilots.theme_updated_at` dokładają
`pilots.theme`/`theme_updated_at` (prefs są 1:1 z pilotem — osobna tabela to
przerost), a trasy `GET/PUT /me/prefs` (`http/routes/mobile/prefs.ts`, tożsamość WYŁĄCZNIE
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
stemplem cache referencyjnego).

> ⚠ **ETAP C — dychotomia `ResumeGate` przestaje obowiązywać.** `01` nie jest już „startem
> dnia" z jednym przyciskiem, tylko **ekranem domowym osiągalnym ZAWSZE** — także przy
> otwartej sesji samolotu (kokpit ma do niego wyjście przez pasek sesji). `ResumeGate`
> może co najwyżej wybierać ekran startowy, nie odbierać dostępu do domu.
>
> Konsekwencja, którą trzeba rozwiązać osobno: argument bezpieczeństwa przy ekranie 12
> („historia osiągalna tylko ze splasha, więc bez otwartego dnia w tle") upada razem z tą
> dychotomią. Ładowanie zamkniętej sesji do store'u przy żywej sesji w tle to realne ryzyko
> nadpisania stanu — albo `12` czyta bez ładowania do store'u, albo potrzebna jest inna
> bariera. Blokowanie wejścia na `01` przy otwartej sesji jest złym rozwiązaniem, bo łamie
> regułę „wszystko wraca do 01".

„Nie pamiętam PIN" nie czyści poświadczeń (nadpisuje
je dopiero udany login) i jest zablokowane przy niepustym outboxie. Klawisz biometrii
z mockupu 00 odłożony (wymagałby `expo-local-authentication`).

Eksport arkuszy (§4.7, serwer): `application/common/export/` — `buildDaySheet` (czysta funkcja
`DaySheetDay` → karta; nazwa `YYYY-MM-DD_SP-XXX` bajt w bajt zgodna z `sheetTabName`
aplikacji, treść = ekrany 10/11, MH w formacie samolotu) i `DayExporter` (po commicie
ingestu, dla sesji zamkniętych po przetworzeniu; spóźnione dane → rewizja +1).
Dziennik `export_log` (append-only — historia rewizji to jedyny ślad rozjazdu
arkusz↔rejestr); `sync-status.exportUrl` z ostatniej rewizji. Awarię Sheets łapie ingest —
telefon dostał 200 za PRZYJĘCIE, arkusz to skutek, nie warunek.

**Karta = DOBA SAMOLOTU** (decyzja 2026-08-07), nie sesja: agregat wszystkich
sesji maszyny w dobie UTC wyznaczonej przez `session_claim` (`sessions.claim_time` —
**nie `dutyStart`**, bo meldunek jest po §3.6a opcjonalny i bramka na nim odrzucałaby każdą
sesję z przebudowanego flow). Sesje są WIERSZAMI karty, etykietowanymi `S1`, `S2`…
chronologicznie; `Sesja` jest pierwszą kolumną tabeli lotów, bo numer lotu liczy się
w obrębie sesji. Bramki: doba bez sesji (`no_events`) / nikt jeszcze nie zdał maszyny
(`session_open`) / otwarta flaga `aircraft_overlap` — ale **wyłącznie dla sesji nią
objętych** (`overlap_flag`), reszta doby idzie do arkusza z adnotacją „Niekompletna".
Rewizja należy do PARY (doba, samolot): `export_log` ma po jednym wierszu na sesję
wchodzącą do rewizji, wszystkie z tym samym numerem, bo `sync-status` pyta o link po
sesji. Blokada advisory (`ExportLogPort.lock`) obejmuje ten sam klucz co rewizja.
Skład doby czyta `SessionsProjectionPort.listByAircraftDay` (projekcja), a tabelę lotów —
`projectSession` per sesja (strumień).

Karty mieszkają W BAZIE (decyzja 2026-07-28: nie czekamy na Google): adapter
`PgSheets` (`infrastructure/pg/common/sheetsRepo.ts`) zapisuje dosłowne wiersze karty do
`exported_sheets` (UPSERT po `tab` — semantyka jak karta w Google:
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
fixa, siatka „— —", LAND·RĘCZNIE amber; napisy w `screens/logic/gpsLoss.ts`
— **z tego opisu nieaktualne jest sygnalizowanie stanu GPS w pasku akcji**: 2026-08-12
przycisk stracił i dopisek „· ręcznie", i ton amber, a baner — oba przyciski i czerwień
(patrz tabela komponentów: `NoGpsBanner`, `CockpitActions`)); ekran 13
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

Ekran 12 („Poprzednie dni"): `queries.historyDays()` grupuje CAŁY lokalny strumień
po sesjach i projektuje każdą tym samym `projectSession` — karta i ekran 10 nie mogą
się różnić liczbami. Reszta jest czystą funkcją `screens/historyDays.ts`:
- **doba bieżąca odpada** (issue #35) — te sesje mieszkają na 01 i tam prowadzi je
  ołówek wiersza. Kotwicą doby jest URUCHOMIENIE silnika, awaryjnie przejęcie
  (`sessionDay`) — ta sama reguła co w `projectPilotDay`, żeby sesja spod północy nie
  wpadła w dziurę między ekranami ani nie pokazała się w obu naraz;
- **podział na grupy robi okno korekty**; sesja TRZYMANA nie jest historią (ma kokpit
  przez `ResumeGate`);
- **obie grupy są klikalne** — „OTWÓRZ I POPRAW" i „ZOBACZ SZCZEGÓŁY" ładują sesję do
  store'u i otwierają 10. Po oknie ekran 10 rysuje się w trybie podglądu
  (`readOnly = !correctionWindow(...).open`): `onCorrect` bez wartości, więc kolumny
  ołówka NIE MA, i bez „EDYTUJ DANE". Bezpieczne, bo z kokpitu nie ma tu drogi
  (kokpit jest stanem modalnym), więc żadna trzymana maszyna nie zostaje w tle;
- **plakietka wysyłki istnieje tylko przy zaległości** (`uploadSpec`) — „Wysłane" jest
  stanem domyślnym i nie ma napisu, tak samo jak SyncChip online. Rozróżnienie
  „oczekuje" / „w trakcie wysyłania" bierze się z wyniku OSTATNIEJ próby synca, bo
  innego pojęcia „online" aplikacja nie ma.

Plakietka `.history-badge` na 01 pokazuje najświeższą sesję w oknie — również z
pominięciem doby bieżącej, inaczej obiecywałaby coś, czego pilot w 12 nie znajdzie.

**Zaległości audytu serwera (2026-07-28) — świadomie odłożone, do zrobienia przed
wdrożeniem (faza 6):** rate-limit na `/auth/*` (dziś brute-force ogranicza tylko koszt
scrypta); okno łaski przy rotacji refresh tokenu (równoległe rotacje z dwóch urządzeń
tego samego pilota unieważniają się nawzajem — dziś akceptowalne, bo profil żyje na
jednym telefonie); klucze obce `events`/`sessions` → `pilots`/`aircraft` (dziś spójność
pilnowana kodem, nie schematem); odświeżanie pola `details` istniejącej flagi przy
zmianie wielkości dziury MH (dedupe zostawia pierwszy pomiar); transakcyjne pary
~~migracji w `migrate.ts`~~ **ZROBIONE 2026-07-31** (patrz niżej); sprzątanie wygasłych
refresh tokenów — **RĘCZNIE ZROBIONE 2026-08-02** (`POST /admin/api/maintenance/refresh-tokens/purge`,
ekran `A11`: kasuje wyłącznie `expires_at <= now`, wymaga jawnego potwierdzenia w ciele
żądania, do audytu idą liczby i zakres dat wygaśnięcia). **Automatu nadal NIE MA**:
`rotate()` kasuje wiersz tylko przy przedstawieniu tokenu, `login` wyłącznie wstawia,
więc tokeny porzucone zbierają się między jednym a drugim ręcznym sprzątaniem;
~~skrypt administracyjny przebudowy projekcji `sessions` ze zdarzeń~~
**ZROBIONE 2026-07-31** (przekrój 2, `npm run rebuild-projections`; od 2026-08-02
także trasami panelu — porównanie `GET …/maintenance/projections/compare` jako
ZAPYTANIE bez śladu w audycie, nadpisanie `POST …/projections/rebuild` przez `AuditedWrite`);
porównywanie treści przy duplikacie uuid (dziś duplikat = potwierdzenie, treść
ignorowana); ~~`UNIQUE` na `export_log`~~ **ZROBIONE** (`uq_export_log_card_revision`, przekluczone na
`(day, aircraft_id, revision, session_uuid)` 2026-08-07) + kolejka ponowień
nieudanych eksportów (~~re-eksport po rozwiązaniu flagi przez administratora~~
**ZROBIONE 2026-07-31**, przekrój 1 — zostaje samo ponawianie eksportów, które padły).

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
- ~~**Flaga nie ma jak się zamknąć.**~~ **ZROBIONE 2026-07-31** — przekrój 1, opis niżej.
- ~~**Korekta administracyjna** musi stemplować zdarzenie `picId` PIC-a sesji (inaczej
  `WRITER_MISMATCH`), pomijać wyłącznie `CORRECTION_WINDOW_EXPIRED` i wywołać re-eksport.~~
  **ZROBIONE 2026-07-31** — przekrój 3, opis niżej.
- ~~**Projekcja `sessions` nie niesie `operation`, `dutyStart` ani `client`**~~ **ZROBIONE
  2026-07-31** — przekrój 2, opis niżej. Migracja 11 dokłada `operation` i `client`;
  `duty_start` NIE POWSTAJE, bo `claim_time` niesie tę wartość od pierwszej wersji
  (`sessionRowFrom` mapuje `claimTime: s.dutyStart`) — szczegóły w docblocku
  `application/common/mappers/sessionRow.ts`.

> ⚠ **ETAP B/D — to jest najgroźniejsza mina całej przebudowy.**
> `claim_time` **jest** `dutyStart` z `preflight_confirm`. Po usunięciu czasu meldowania
> z przejęcia (2026-08-06) `dutyStart` będzie `null` dla praktycznie każdej sesji, a razem
> z nim wyzeruje się: klucz sortowania listy dni, kursor keyset (`claim_time DESC NULLS
> LAST` — predykat trójgałęziowy zaprojektowany pod przypadek brzegowy, który stanie się
> większościowy), indeks `idx_sessions_day`, filtr zakresu dat w A02, `openSessionsUndated`
> w statystykach A08/A09 i kolumna „Dzień" w panelu. Sześciu konsumentów jednej kolumny.
>
> **Decyzja 2026-08-07** (`_main.md.txt`, log): `claim_time` = czas zdarzenia `session_claim`
> (istnieje zawsze, jest pierwsze w sesji). Klamra służby przenosi się do osobnej projekcji
> per pilot per doba UTC. Wymaga migracji z backfillem i `rebuild-projections` — którego
> niezerowy dry-run jest normalnie incydentem, a **tu będzie ogromny i oczekiwany**.
- **Tabela audytu `admin_audit` nie istnieje.** Niezmienność wymuszamy uprawnieniami
  (`GRANT INSERT, SELECT` dla roli aplikacyjnej), nie dyscypliną programisty.
- **Brak list i filtrów** (sesje, zdarzenia, flagi), zapisu kont i floty, agregatów
  statystycznych oraz sesji przeglądarkowej — `authorize` czyta dziś wyłącznie `Bearer`.
- **Rate-limit na `/auth/*` awansuje** z listy wyżej: panel wystawia formularz logowania
  w przeglądarce.

Dwie sprawy z tej analizy są **decyzją produktową, nie robotą do wykonania**: (1) korekta
administratora **nie wraca na telefon pilota** — sync jest jednokierunkowy, §4.6 nie ma
endpointu zwracającego zdarzenia do aplikacji, więc pilot zobaczy stare liczby na ekranie 12;
(2) ~~§4.5 obiecuje 6 typów flag, `domain/mhChain.ts` produkuje 3~~ — **ZROBIONE
2026-07-31.** Katalog liczy pięć pozycji (`session_overlap` zastąpił `DOUBLE_CLAIM`
i `TIME_OVERLAP`) i serwer produkuje wszystkie:
- `fuel_mismatch` mieszka w `domain/mhChain.ts` razem z flagami motogodzin, bo to **ten
  sam łańcuch**: te same ogniwa, to samo uporządkowanie po liczniku i ta sama sąsiedniość
  par. Osobny moduł powtórzyłby sortowanie i parowanie, a rozjazd dwóch kopii tej samej
  pętli byłby kwestią czasu. Porządek nadaje MH, ale porównywać wzdłuż niego można
  dowolną wielkość przekazywaną z dnia na dzień. Flagujemy **wartość bezwzględną**
  różnicy: wzrost znaczy tankowanie poza aplikacją, spadek — spuszczone paliwo albo
  błędny odczyt. Tolerancja z `fuelToleranceL(capacityL)`, więc ingest dostał wąski
  port `AircraftConfigPort` (jedna liczba, czytana W TEJ SAMEJ transakcji co reszta
  rachunku — `ReferenceRepo` buduje całą migawkę floty z ETagiem i czyta poza nią).
- `clock_drift` dostał własny moduł `domain/clockDrift.ts`, bo jest własnością
  POJEDYNCZEGO zdarzenia, nie łańcucha. Liczy się na strumieniu dnia, który ingest
  i tak ma wczytany. **Jedna flaga na sesję, nie jedna na zdarzenie**: przestawiony
  zegar to własność telefonu na czas dnia, a dwadzieścia flag o tym samym zegarze
  nauczyłoby wyłącznie ignorowania skrzynki. Raportujemy maksimum rozjazdu i wskazujemy
  najgorszy zapis — bez tropu administrator ma flagę i nic więcej.

Progi obu są WSPÓLNE z telefonem (`CLOCK_DRIFT_MS`, `fuelToleranceL`), więc lokalne
ostrzeżenie i flaga serwera mówią to samo — pilot nie dowiaduje się dzień później, że
serwerowi coś nie pasowało.

**Architektura panelu (decyzje 2026-07-31).** Pełne rozstrzygnięcia: `docs/architektura-panelu-serwer.md`
(podział modeli, ORM, uproszczony CQRS komend admina, audyt w transakcji, sesja przeglądarkowa)
i `docs/architektura-panelu-frontend.md` (wspólne pakiety, drzewo panelu, mapowanie szablonu
na komponenty). Skrót wiążący dla tego dokumentu:
- **bez ORM-a i bez query buildera** — sekcja „Spójność modeli bez ORM" niżej zrewidowana
  i PODTRZYMANA, z mocniejszym powodem: nie ma tu encji do zarządzania (append-only `events`,
  `sessions` nadpisywane w całości), więc change tracking zaprasza do obejścia strumienia;
- **panel nie widzi modelu persystencji** — wyłącznie DTO z `/admin/api/*` (nie `/admin/*`:
  kolizja z wildcardem `@fastify/static`); osobnego pakietu „modele z bazy" nie tworzymy;
- **wspólne pakiety są nie-wizualne**: `@uzaero/tokens` i `@uzaero/format` (**wyciągnięte
  2026-07-31**, patrz niżej); komponentów
  między RN a webem nie dzielimy;
- ~~kształt flagi przenieść do `packages/domain/src/flags.ts`~~ — **ZROBIONE 2026-07-31**
  (patrz niżej).

**Wspólne pakiety `@uzaero/tokens` i `@uzaero/format` — zrobione 2026-07-31**, PRZED
pierwszym ekranem panelu i to jest cała istota terminu: gdyby panel wystartował pierwszy,
dorobiłby sobie własne kopie palety i formatów, a kopie w działającym UI cofa się dużo
drożej niż w pliku, którego nikt jeszcze nie renderuje.

- **`packages/tokens`** — pięć motywów, skale, typografia i `themeCssVars()` zamieniające
  motyw na zmienne CSS, żeby panel nie trzymał DRUGIEJ palety. Jedyny szew między
  platformami przebiega przy czcionkach: `fontFamilyNative` (osiem wariantów, bo RN wybiera
  grubość osobnym plikiem czcionki) obok `fontFamilyCss` (trzy rodziny, bo w przeglądarce
  grubość jest osobną właściwością). `fontFamily` zostaje aliasem wariantu natywnego.
- **`packages/format`** — powód nie jest teoretyczny: `application/common/export/daySheetContent.ts`
  trzymał ręczne KOPIE `timeUtc`, `hhmm` i `motoHours` z docblockami „lustro … z
  app/src/ui/format.ts". Umowa utrzymywana dyscypliną, nie kompilatorem. Teraz serwer
  importuje te trzy z pakietu. `litres` **zostało prywatne w serwerze celowo**: aplikacja
  pisze „88 L", a komórka arkusza niesie jednostkę w nagłówku kolumny — różnica jest
  zamierzona i udawanie wspólnej funkcji byłoby kłamstwem.
- **Dwa formaty czasu blokowego zostają dwoma**: `duration` daje `6:39` (kokpit, koniec
  dnia, historia), `hhmm` daje `06:39` (ekran 10 i karty arkusza). Każdy jest wierny
  innemu zatwierdzonemu mockupowi; scalenie „w ramach porządków" zepsułoby jeden z nich,
  dlatego oba mają własną nazwę i własny komentarz zamiast jednej funkcji z flagą.
- **Migracja bez regresu**: `app/src/ui/theme/tokens.ts` i `app/src/ui/format.ts` są
  shimami (`export * from …`), więc kilkadziesiąt plików ekranów nie zmieniło ani znaku.
- **Rozjazd tokenów z mockupami pilnuje test** `app/src/__tests__/tokensCssVars.test.ts`:
  porównuje `themeCssVars(THEMES.night)` z blokiem `:root` w `design/admin/SZABLON.html`.
  Ma kontrolę samego siebie (część wspólna > 20 zmiennych), bo bez niej „zgodne" mogłoby
  znaczyć „zero wspólnych nazw". Sprawdza też, że wymiary ramy panelu (`--sidebar-w`,
  `--topbar-h`, `--app-scale`) NIE wyciekają do tokenów produktu — to układ jednego
  ekranu, nie token designu.

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
   pułapką, więc `flags_type_known` mógł bezpiecznie wejść jako `CHECK` na `flags.type`.
2. **Kształt flagi ma jedno miejsce.** `packages/domain/src/flags.ts` — katalog
   `FLAG_TYPES` (pięć pozycji: `session_overlap` zastąpił `DOUBLE_CLAIM` i `TIME_OVERLAP`
   z §4.5), `FlagType`, `FlagStatus`, `SessionFlag` (kształt „na drucie") i strażnik
   `isFlagType`. Zastąpił cztery ręcznie przepisane deklaracje. `ChainFlag` w
   `server/src/domain/mhChain.ts` jest teraz `Extract<FlagType, …>`, więc przemianowanie
   pozycji katalogu wywala kompilację zamiast zostawić martwy literał. `FlagRecord.type`
   przestał być `string`, a adapter `flagsRepo` rzuca na wartości spoza katalogu —
   ciche pominięcie flagi byłoby najgorszą opcją, bo flaga istnieje po to, żeby być widoczna.

**Przekrój 1 panelu — cykl życia flagi, zrobione 2026-07-31.** Pierwszy pionowy przekrój
i wzorzec dla następnych (`docs/architektura-panelu-serwer.md` §5, mockup
`design/admin/A03a-flaga.html`). Domyka §4.7: otwarta `session_overlap` blokowała kartę
dnia BEZTERMINOWO, bo nic w `server/src` nie ustawiało `status='resolved'`.

- **Audyt jest wymuszony TYPEM, nie dyscypliną.** `application/admin/auditedWrite.ts` to
  jedyna droga zapisu panelu: `effect` musi oddać `Audited<T>` (skutek **i** wpis), więc
  pominięcie śladu jest błędem kompilacji, a nie rzeczą do wyłapania na review; wpis leci
  TĄ SAMĄ transakcją, więc operacja, której nie udało się zaudytować, nie zachodzi. Druga
  połowa mechanizmu, bez której pierwsza nic nie znaczy: **komendy panelu nie dostają
  `Database` ani `Queryable` w konstruktorze**, tylko `AuditedWrite` i porty odczytu —
  nie mają czym ominąć bramy. Obie własności są wykonywalne: `test/adminAudit.test.ts`
  (awaria audytu zostawia flagę `open`; nieudany skutek nie zostawia śladu; `actor_role`
  to rola z CHWILI akcji, nie złączenie z `pilots`) i nowy `test/architecture.test.ts`.
- **Migracja 9** — `admin_audit` (append-only; słownik akcji `src/domain/adminActions.ts`
  w duchu `roles.ts`). Celowo **bez `CHECK`-a** na `action`/`actor_role`, inaczej niż
  `pilots.role` i `flags.type`: tamte opisują byt żywy, wczytywany z powrotem do zamkniętej
  unii, a wiersz audytu jest zapisem HISTORYCZNYM — przemianowanie akcji nie może
  unieważnić tego, co zdarzyło się rok temu. **Migracja 10** — `flags.resolved_by`
  i `resolution_note` (obie NULL-owalne: wymóg komentarza jest regułą wejścia w `zod`,
  bo dotyczy NOWYCH rozstrzygnięć, a nie wierszy sprzed wdrożenia pola).
- **Osobny port i osobny adapter dla flag panelu** (`FlagsAdminPort` /
  `infrastructure/pg/admin/flagsRepo.ts`) — ten sam powód, co `SheetsReadPort` obok
  `SheetsPort`: inny jest POWÓD istnienia. `FlagsPort` obsługuje gorącą transakcję
  ingestu, więc ścieżka przyjęcia zdarzeń nie ma jak zregresować od zmian w panelu.
  Zamknięcie flagi ma warunek `status='open'` w SQL-u — dwie osoby klikające „Rozwiąż"
  nie prześcigną się timingiem, druga dostaje 409 z aktualnym stanem.
- **`DayExporter.exportSession` zwraca `ExportOutcome`** zamiast `void`: odmowa nie jest
  błędem, tylko poprawną odpowiedzią o stanie świata (`session_open`, `overlap_flag`, …).
  Dzięki temu panel mówi „arkusz odblokowany · rewizja 1", a nie samo „zapisano".
  `IngestCommands` ignoruje wartość i nie zmienił się o linijkę. Re-eksport leci **po
  commicie** i wyłącznie dla `session_overlap` — pozostałe typy nie są bramką eksportu,
  więc udawanie inaczej myliłoby UI (odpowiedź niesie wtedy `exports: []`).
- **Trasa `POST /admin/api/flags/:id/resolve`** (`http/routes/admin/`), cienka jak reszta:
  zod → komenda → status. Zdolność jest ATRYBUTEM deklaracji (`adminRoute`), nie zdaniem
  w ciele handlera, więc „czego wymaga ten endpoint" czyta się z jednej linii. Prefiks
  **`/admin/api`, nie `/admin`** — to drugie zostaje pod statyczny build panelu i kolidowałoby
  z wildcardem `@fastify/static`. Autoryzacja zostaje na `Bearer`; sesja przeglądarkowa
  na ciasteczku czeka na klienta panelu, bo dziś nie byłoby jej czym sprawdzić.

**Przekrój 3 panelu — korekta zdarzenia po oknie 24 h, zrobione 2026-07-31.** Drugi
przekrój pionowy, zbudowany na wzorcu przekroju 1 (mockup `design/admin/A02b-korekta.html`,
`docs/architektura-panelu-serwer.md` §6). Domyka lukę, o której mówi sam komunikat reguły:
`CORRECTION_WINDOW_EXPIRED` od początku brzmi „korektę wprowadza administrator", a do dziś
administrator nie miał czym jej wprowadzić.

- **Uprawnienie zapisu jest PARAMETREM domeny, nie wyjątkiem obok niej.**
  `packages/domain/src/rules/authority.ts` — `WriteAuthority = 'pilot' | 'administrative'`,
  czwarty argument `checkAppend` bramkujący DOKŁADNIE JEDNĄ gałąź. Odrzucone alternatywy
  i powody: filtrowanie naruszeń z zewnątrz (reguła omijana spoza domeny przestaje być
  regułą) oraz druga funkcja `checkAdminAppend` (dwie kopie, które muszą pozostać
  identyczne poza jedną gałęzią, rozjadą się niewidocznie). **Wartość domyślna `'pilot'`
  jest częścią zabezpieczenia** — pominięcie argumentu nigdy nie poszerza uprawnień, więc
  aplikacja i jej testy nie zmieniły się o linijkę.
- **Trzy mechanizmy pilnują, żeby to nie stało się furtką.** (1) `app/src/__tests__/writeAuthority.test.ts`
  przybija RÓŻNICĘ, nie zachowanie: bateria ~40 strumieni odpala każdy kod z `ViolationCode`
  poza samym oknem i wymaga wyniku IDENTYCZNEGO w obu trybach (drugie `authority === 'pilot' &&`
  gdziekolwiek wywala test), a osobna grupa pokazuje, że po 24 h administrator dalej wpada
  na `CORRECTION_TARGET_NOT_FOUND`, `CORRECTION_TARGET_NOT_ALLOWED`, `CORRECTION_TIME_IN_FUTURE`,
  `WRITER_MISMATCH`, `DAY_CLOSED` i `DAY_ALREADY_CLOSED`. (2) Test kontrolny wewnątrz tej
  baterii sprawdza, że pokrycie kodów jest pełne — inaczej „identyczne" mogłoby znaczyć
  „dwie puste listy". (3) `test/architecture.test.ts`: literał `'administrative'` wolno mieć
  DOKŁADNIE jednemu plikowi produkcyjnemu serwera.
- **Korekta administratora NIE idzie przez `POST /events`.** Ta trasa należy do telefonu
  i jej single-writer (podpis w paczce + porównanie z PIC-em istniejącej sesji) zostaje
  nietknięty. Panel dostaje własną trasę `POST /admin/api/sessions/:uuid/corrections`
  ze zdolnością `events.correct` — administrator TAK, szef wyszkolenia NIE (pisanie
  w cudzym rejestrze to inna odpowiedzialność niż wyjaśnianie rozbieżności).
- **Zdarzenie stemplujemy PIC-em SESJI, nie administratorem** (`AdminCorrectionCommands`
  w `application/admin/commands/corrections.ts`). `picId` odpowiada na pytanie „czyja to
  sesja", nie „kto to wpisał": konto administratora zerwałoby single-writer i zafałszowało
  atrybucję nalotu. Kto to zrobił, mówią `events.source_device` (`admin:<pilotId>`)
  i `admin_audit` — i tylko one. Powód korekty (pole obowiązkowe w A02b) idzie do audytu,
  nie do rejestru: rejestr opisuje lot, nie motywację człowieka przy biurku.
- **Ścieżka administratora waliduje się SAMA** — `checkAppend(state, candidate, limits,
  'administrative')` w tej samej transakcji, `insertBatch` tym samym adapterem (korekta
  jest zwykłym zdarzeniem), przeliczenie projekcji `sessionRowFrom` z pełnego strumienia,
  ślad audytu, a po commicie wymuszony re-eksport karty (`export_log` +1 rewizja). Limity
  samolotu czytamy `AircraftConfigPort` W TEJ SAMEJ transakcji — tak jak ingest. Blokada
  `pg_advisory_xact_lock` per sesja jest tu z tego samego powodu co w `IngestCommands`:
  bez niej paczka dosyłana równolegle przez telefon nadpisałaby wiersz `sessions` stanem
  sprzed korekty.
- **Flag łańcucha NIE przeliczamy.** Ich wejściem są odczyty z `preflight_confirm`
  i `day_close`, a te są niekorygowalne (`CORRECTION_TARGET_NOT_ALLOWED`), więc korekta
  nie ma jak ruszyć MH ani przekazania paliwa. Otwarta `clock_drift` też zostaje —
  A02b mówi to wprost: „zamyka ją człowiek na A03".

> ⚠ **ETAP B — ten argument upada.** Decyzja 2026-08-07 przesądza, że `leg_close` MUSI być
> korygowalny (okno 24 h kotwiczy się właśnie w nim, więc bez korygowalności pilot nie
> poprawi literówki w odczycie, mimo że okno istnieje po to). A `leg_close` niesie
> opcjonalny odczyt FOB+MH, czyli **ogniwo łańcucha stanie się korygowalne** — flagi
> łańcucha trzeba będzie przeliczać albo świadomie zdecydować, że nie, i uzasadnić to
> na nowo.
- **Odmowy są wariantami wyniku, nie wyjątkami na granicy HTTP** (wzorzec `ResolveFlagOutcome`):
  404 nieznana sesja, **422 `rule_violation`** z listą naruszeń. Rozdział 400 od 422 jest
  celowy: 400 znaczy „popraw formularz", 422 — „domena odmawia i oto powód". To pierwsze
  422 w repo; wcześniej nie było endpointu, który odrzucałby poprawnie zbudowane żądanie
  regułą domenową.
  > ⚠ **ETAP D (2026-08-07): `400 day_open` USUNIĘTE.** Brzmiało „dzień otwarty = pilot
  > poprawia sam na 04c". Po §3.6a zdanie samolotu jest OPCJONALNE, więc brak `day_close`
  > przestał znaczyć „dzień trwa" i bramka odmawiałaby korekty przede wszystkim tam, gdzie
  > jest potrzebna. Administrator nie jest NIGDY blokowany; kolizja z pilotem jedzie jako
  > `warnings` (`ADMIN_EDIT_SESSION_ACTIVE`, `ADMIN_EDIT_PILOT_WINDOW_OPEN`) w ciele
  > odpowiedzi 200 — i podglądu, i zapisu. Panel rysuje z nich baner nad formularzem,
  > świadomie bez blokowania przycisku.

**Przekrój 2 panelu — czytanie dni, zrobione 2026-07-31.** Trzeci wdrożony przekrój
pionowy (mockupy `A02-dni.html`, `A02a-dzien.html`, `A03-flagi.html`, `A11-konserwacja.html`;
`docs/architektura-panelu-serwer.md` §7). Pierwszy, w którym panel CZYTA listy — i dlatego
pierwszy, w którym trzeba było rozstrzygnąć, skąd biorą się jego liczby.

- **Zamiast query buildera: dwa nazwane moduły, nie framework.** `infrastructure/pg/sqlFilter.ts`
  składa `WHERE` z filtrów OPCJONALNYCH (numeracja `$n` powstaje w jednym miejscu — jej
  przesunięcie o jeden nie jest błędem typów ani składni, tylko cichym porównaniem złej
  kolumny ze złą wartością), a `infrastructure/pg/keyset.ts` daje kursor **keyset, nie
  `OFFSET`**: tabele rosną w trakcie przeglądania, a offset na rosnącej tabeli gubi
  i dubluje wiersze — najgorszy tryb awarii narzędzia diagnostycznego. Razem ~200 linii
  z testami (`test/sqlFilter.test.ts`, `test/keyset.test.ts`). `addOptional` rozróżnia
  `undefined` („nie ustawiono filtra") od `null` („ustawiono na nic"), a predykat kursora
  ma gałąź dla `NULLS LAST`, bo `claim_time` jest NULL-owalne (sesja bez preflightu).
- **Migracja 11: `sessions.operation` i `sessions.client`** + `CHECK` na słowniku operacji
  (ten sam powód co przy `flags.type`: adapter wczytuje wartość do zamkniętej unii).
  `OperationType` jest teraz wyprowadzony z tablicy `OPERATION_TYPES` w `@uzaero/domain`
  — filtr panelu waliduje się katalogiem domeny zamiast trzecią ręczną kopią listy.
  **Kolumny `duty_start` NIE MA i nie będzie bez decyzji człowieka**: `claim_time` niesie
  `SessionState.dutyStart` od pierwszej wersji, więc druga kolumna byłaby duplikatem tej
  samej liczby (docblock `application/common/mappers/sessionRow.ts` opisuje też konsekwencje tej nazwy).
- **Przebudowa projekcji ze strumienia** (`AdminMaintenanceCommands.rebuildProjections`,
  CLI `npm run rebuild-projections`) — WARUNEK KONIECZNY każdej nowej kolumny projekcji: `upsert` uruchamia
  dopiero następna paczka zdarzeń sesji, a dla dnia zamkniętego takiej paczki już nie
  będzie, więc bez przeliczenia kolumna „Operacja" byłaby pusta dla całej historii.
  **Dry-run jest trybem domyślnym, a niezerowa różnica to INCYDENT, nie sukces**: projekcja
  jest odświeżana w tej samej transakcji co przyjęcie zdarzeń, więc w normalnej pracy
  różnicy być nie może, a zapis wyrówna liczby i skasuje jedyny ślad po przyczynie —
  dlatego `write` wymaga jawnego powodu, który trafia do audytu (ślad powstaje także dla
  dry-runu). Listę sesji bierzemy z `events`, nie z `sessions`: wiersz, którego NIE MA,
  jest najcięższym przypadkiem dryfu, a lista z projekcji nie umiałaby go zobaczyć.
  Nadpisywane wiersze biorą `pg_advisory_xact_lock` i są przeliczane po ponownym odczycie
  strumienia — inaczej narzędzie do wykrywania dryfu samo by go tworzyło, wyścigając się
  z paczką dosyłaną przez telefon.
- **Trzy trasy odczytu** (`GET /admin/api/sessions`, `/sessions/:uuid`, `/flags`), wszystkie
  ze zdolnością `panel.access` — czyta administrator i szef wyszkolenia, piszą węższe
  zdolności. Odmowy są wariantami wyniku: uszkodzony kursor → **400 `bad_cursor`** (wartość
  z zewnątrz, nie awaria serwera), nieznana sesja → 404.
- **Reguła twarda, teraz pilnowana MASZYNOWO:** *agreguj wartości projekcji, nigdy nie
  odtwarzaj projekcji SQL-em*. `test/contract.test.ts` liczy odczyty `sessionEvents`
  przez dekorator prawdziwego adaptera: lista dni ma ich ZERO, karta dnia — dokładnie
  JEDEN. Nowa liczba w panelu = nowa kolumna projekcji wypełniana przez `sessionRowFrom`,
  nie nowe wyrażenie SQL.
- **Panel nie widzi kształtu wierszy.** `application/admin/contracts/` zawiera wyłącznie
  typy DTO i wolno mu importować jedynie `@uzaero/domain` (nowy przypadek w
  `test/architecture.test.ts`). `AdminSessionListItem` jest PŁASKI, a nie `SessionRow & {…}`
  — projekcja ma rosnąć swobodnie, a nie łamać panel przy każdej migracji. Byty domenowe
  (`SessionState`, `Event`) jadą bez własnego DTO, zgodnie z regułą granicy typów.
  Wpis `exports` w `server/package.json` czeka na pierwszego konsumenta.
- **Oś zdarzeń karty dnia liczy adnotacje PORÓWNANIEM z `applyCorrections`**
  (`application/admin/mappers/eventTimeline.ts`), a nie własnym czytaniem korekt: reguła
  „ostatnia korekta wygrywa" (razem z `void` → `retime`, który przywraca zdarzenie do
  życia) ma jedną implementację, w domenie. Zdarzenia unieważnione ZOSTAJĄ na osi —
  to właśnie one tłumaczą, dlaczego liczby dnia różnią się od tego, co zapisał telefon.
- **Skrzynka flag sortuje `blokujące eksport → najstarsze`** w `ORDER BY`, nie w pamięci
  (limit musi obcinać po właściwej stronie porządku), a `blocksExport` jest funkcją
  wyliczaną z bramki eksportera (`blocksExport` w `dayExporter.ts`), nie kolumną —
  rozjazd „panel mówi blokuje, eksporter przepuszcza" byłby niewidoczny. Skrzynka
  celowo NIE ma kursora: jej porządek ma trzy składowe, a kursor keyset opisuje parę;
  jest zbiorem spraw do zamknięcia, więc dostaje twardy limit i dokładny `total`.

**Przekrój 4 panelu — workspace `admin/`, sesja przeglądarkowa i logowanie, zrobione
2026-07-31.** Pierwszy przekrój, w którym panel ISTNIEJE jako aplikacja: da się go
uruchomić, wygląda jak mockup i da się do niego zalogować (`design/admin/A00-login.html`
i wariant błędu `A00a`; `docs/architektura-panelu-frontend.md` §10 krok 3,
`docs/architektura-panelu-serwer.md` §8). Bez skrzynki flag i bez pozostałych ekranów —
te wchodzą następnym przekrojem.

- **`authorize` przestało czytać nagłówek — czyta TOKEN.** Sesja panelu to ciasteczko,
  telefon nosi `Bearer`; to dwa kanały tego samego poświadczenia, więc autoryzacji nie
  dublujemy, tylko zmieniamy jej wejście. Skąd token pochodzi, wie DOKŁADNIE JEDEN plik
  (`http/tokenFromRequest.ts`, **nagłówek wygrywa z ciasteczkiem** — żądanie niosące oba
  nie ma prawa podnieść uprawnień drugim poświadczeniem). Nowy przypadek w
  `test/architecture.test.ts`: żaden plik w `http/` poza tym jednym nie sięga po
  `headers.authorization`. Trasy telefonu zmieniły się o jedno wywołanie; zachowanie
  identyczne, bo `Path=/admin` trzyma ciasteczko z dala od `/events`.
- **`POST /admin/api/auth/login` → ciasteczko, nie token w ciele.** `HttpOnly; Secure;
  SameSite=Strict; Path=/admin; Max-Age=28800`. Ciało odpowiedzi niesie tożsamość
  i listę zdolności (`capabilitiesOf` z `domain/roles.ts`) — i to jest cały kontrakt:
  gdyby niosło token, panel mógłby go „na chwilę" odłożyć do `localStorage`, a ochrona
  przed XSS-em kończy się na pierwszym takim `const`. **Bez refresh tokenu w przeglądarce**
  (§8.4): obietnica §3.0 „wygasły token ≠ wylogowanie" istnieje dla pilota w terenie,
  administratorowi przy biurku wolno powiedzieć „zaloguj się ponownie".
- **Konto bez `panel.access` nie dostaje sesji panelu** — i dostaje **403 `no_panel_access`**,
  odróżnialne od 401. To decyzja z mockupu A00: pilot z POPRAWNYM hasłem ma zobaczyć,
  że odbija go rola, a nie szukać błędu w haśle, którego nie popełnił. Enumeracji kont
  to nie otwiera (żeby zobaczyć ten komunikat, trzeba już znać hasło), a 401 pozostaje
  identyczne dla złego hasła i konta, którego nie ma.
- **`panelLogin` to metoda `AuthCommands`, nie druga komenda** — `application/common/`
  znaczy „obie powierzchnie". Weryfikacja hasła (razem z wyrównaniem czasu odpowiedzi
  przy nieznanym loginie) ma jedną implementację w prywatnym `verifyCredentials`; druga
  kopia prędzej czy później zgubiłaby ten `else`, a różnicy czasów nie widać w żadnym
  teście funkcjonalnym.
- **CSRF: nagłówek `X-UZ-Admin` na KAŻDEJ mutacji `/admin/api/*`** (`http/adminCsrf.ts`,
  hook na całej instancji). `SameSite=Strict` jest polityką przeglądarki, więc stoi obok
  niego drugi, niezależny mechanizm: nagłówka niestandardowego nie da się wysłać
  cross-origin bez preflightu, a serwer nie wysyła żadnych nagłówków CORS. Hook, a nie
  zdanie w `adminRoute`, bo `POST /auth/login` jest trasą PUBLICZNĄ (nie przechodzi przez
  `adminRoute`) — i to właśnie logowanie jest klasycznym celem login-CSRF.
- **`GET /admin/api/me`** istnieje z jednego powodu: ciasteczko jest `HttpOnly`, więc po
  odświeżeniu karty JavaScript panelu nie ma jak odczytać własnej tożsamości.
- **Workspace `admin/`** (`@uzaero/admin`, React 19 + Vite + TS strict + `noUncheckedIndexedAccess`):
  `api/` (jedyny `fetch`) → `queries/` (TanStack, zero globalnego store'u) → `screens/`,
  a `ui/` nie zna żadnej z nich. Granice są WYKONYWALNE (`admin/test/architecture.test.ts`,
  lustro serwerowego): jedno miejsce z `fetch`, zakaz importów WARTOŚCIOWYCH z
  `@uzaero/domain` (panel nie ma czym policzyć), zakaz `toFixed`/`Math.round` w widoku,
  zakaz hexów w kodzie, zakaz importu z `server/src`. Routing na **hashu** — zero
  fallbacku SPA po stronie serwera.
- **`admin/src/styles/tokens.css` jest GENEROWANY** z `@uzaero/tokens`
  (`packages/tokens/scripts/emitCss.ts`, `npm run tokens:css --workspace admin`), jeden
  blok `:root` z motywu `night` — panel nie ma przełącznika motywów. Równość pliku ze
  źródłem przybija `admin/test/tokens.generated.test.ts`, bo plik generowany leżący
  w repozytorium DA SIĘ otworzyć i „poprawić kolor na szybko". Wymiary ramy panelu
  (`--sidebar-w`, `--topbar-h`) mieszkają w `admin/src/styles/layout.css`: tokeny to
  wartości produktu wspólne z telefonem, a telefon nie ma sidebara.
- **Sidebar jest kanoniczny od teraz** — 11 pozycji w czterech grupach, jeden plik
  (`ui/shell/navItems.tsx`), z którego wyprowadzają się też trasy i okruszki (dwie listy
  nazw ekranów rozjechałyby się przy pierwszym przemianowaniu). Pozycja niedostępna dla
  roli jest **widoczna, wyszarzona i przestaje być linkiem** (`<span aria-disabled>`,
  nie `<a>` z `preventDefault`), z powodem w `title`.
- **`dateUtcShort` dołożone do `@uzaero/format`** („31 JUL 2026"). Obok `dateUtcLong`
  („22 JUNE 2026"), bo to różnica POWIERZCHNI: telefon pokazuje datę raz, w plakietce
  dnia; panel powtarza ją w każdym wierszu tabeli, gdzie cztery znaki to inna szerokość
  kolumny. Własna kopia tablicy miesięcy w panelu byłaby dokładnie tym trzecim
  egzemplarzem, dla którego ten pakiet powstał.
- **Czego w tym przekroju NIE MA, świadomie:** (1) **serwowania builda pod `/admin`
  przez `@fastify/static`** — dev jedzie na proxy Vite (`/admin/api` → serwer), żeby panel
  i API były tym samym originem, bo `SameSite=Strict` inaczej nie działa; produkcyjne
  serwowanie to `base:'/admin/'` (już ustawione), `ADMIN_DIST_DIR` i nagłówki cache
  z §9. (2) **Rate-limitu na `/auth/*` i `/admin/api/auth/login`** (§8.8) — razem z nim
  wchodzi licznik prób z A00a, którego mockup sam zabrania przepisywać („5 prób / 15 minut
  to WARTOŚCI ROBOCZE"). (3) ~~**Świeżej roli przy każdym żądaniu panelu**~~ —
  **ZROBIONE 2026-08-01 razem z przekrojem A06** (`http/authorize.ts`:
  `authorizeAccount` czyta konto po kluczu głównym przy każdym żądaniu `/admin/api/*`;
  `adminRoute` buduje `Actor` z KONTA, nie z claimu). Konto nieaktywne daje 401, rola
  bez zdolności 403 — obie decyzje natychmiast, a nie po wygaśnięciu 8-godzinnej sesji.
  Bez tego przycisk „Deaktywuj" na A06 obiecywałby coś, co dzieje się dopiero pod
  wieczór. Przybite testami: `roles.test.ts` („konto DEAKTYWOWANE po wydaniu tokenu →
  401", „odebranie roli działa NATYCHMIAST") i `adminAccounts.test.ts` („DEAKTYWACJA
  ODCINA PANEL NATYCHMIAST"). (4) **Self-hostowanych czcionek i CSP** —
  `admin/index.html` ciągnie fonty z CDN jak mockupy; §9 wymaga `.woff2` w `public/fonts/`
  przed wdrożeniem (brak JetBrains Mono to inna szerokość każdej kolumny liczbowej).
  (5) **`classInventory.test.ts`** — ma porównywać klasy panelu z `SZABLON.html`, a biblioteka
  komponentów jest dopiero w budowie (8 z 24), więc dziś świeciłby na czerwono z definicji.

**Granulacja plików (reguła twarda, dotyczy całego repo):** jeden adapter / jedna klasa /
jedna odpowiedzialność = jeden plik o nazwie równej roli; trasy HTTP per zasób;
mapowania jako osobne, nazwane moduły (`application/common/mappers/sessionRow.ts`);
wspólna autoryzacja w jednym miejscu (`http/authorize.ts`). Warstw NIE przybywa —
kierunek zależności zostaje; chodzi o to, żeby plik dało się przeczytać w całości
i żeby nazwa mówiła, co w środku.

**Druga oś podziału: POWIERZCHNIA (`admin` / `mobile` / `common`)** — uporządkowane
2026-07-31. Warstwa zostaje osią główną; wewnątrz `application/`, `http/routes/`
i `infrastructure/pg/` katalog drugiego poziomu mówi, KOMU dany plik służy:

- **`mobile/`** — istnieje wyłącznie dla aplikacji pilota (ingest, `GET /reference`, prefs),
- **`admin/`** — istnieje wyłącznie dla panelu i podlega jego regułom: audyt obowiązkowy,
  brama zdolności, prefiks `/admin/api`,
- **`common/`** — używane przez OBIE powierzchnie. To znaczenie jest twarde: `common`
  nie jest workiem na resztę, tylko stwierdzeniem „korzysta z tego panel i telefon"
  (`export/`, `sessionRow.ts`, `ports.ts`, `commands/auth.ts` — panel loguje się tą samą
  komendą co telefon).

**Skąd ta zmiana.** Wcześniej `admin/` było wydzielone, a „cała reszta" nie niosła żadnej
informacji: `application/common/export/dayExporter.ts` (wspólny — woła go ingest ORAZ dwie komendy
panelu) leżał na tym samym poziomie co `application/mobile/queries/reference.ts` (tylko telefon).
Ta sama lokalizacja, dwa różne znaczenia, zero sposobu, by je odróżnić bez otwarcia pliku.

**Dlaczego NIE dwie gałęzie najwyższego poziomu (`admin/` + `mobile/`).** Te powierzchnie
nie są dwoma systemami: dzielą jedną bazę, jeden strumień zdarzeń, jedną projekcję, jedną
domenę i to samo logowanie. Rozdział po kliencie wymusiłby trzecią gałąź na kod wspólny,
która wchłonęłaby większość plików — a granica byłaby przekraczana przy każdym żądaniu,
bo panel czyta to, co zapisał telefon.

**Dlaczego NIE spłaszczenie.** `admin/` nie jest porządkowaniem, tylko granicą sprawdzaną
maszynowo: `test/architecture.test.ts` skanuje `application/admin/commands` i
`http/routes/admin` PO ŚCIEŻCE, żeby wymusić „komendy panelu nie mają uchwytu do bazy"
i „trasy panelu rejestrują się wyłącznie przez `adminRoute`". Usunięcie katalogu usuwa
egzekucję tych reguł. Przenosząc pliki, aktualizuj te ścieżki w teście.

**Oś powierzchni obowiązuje TYLKO tam, gdzie plik istnieje dla kogoś.** To była druga
lekcja tego porządkowania: pierwsze podejście wepchnęło pod `common/` również rzeczy, które
żadnej powierzchni nie mają, i etykieta zaczęła kłamać. Stąd trzy dopowiedzenia:

- **`infrastructure/pg/` w korzeniu = maszyneria Postgresa**, nie adaptery: `schema.ts`
  (DDL), `migrate.ts` (runner), `seed.ts`, `database.ts`, `keyset.ts`, `sqlFilter.ts`,
  `sessionDbRow.ts`. Schemat bazy nie służy ani panelowi, ani telefonowi — służy bazie.
  Katalogi `admin/`, `mobile/`, `common/` trzymają wyłącznie ADAPTERY portów.
  > **`schema.ts` jest JEDNĄ migracją bazową** (zgniecenie 2026-08-08, `SCHEMA_VERSION = 1`)
  > i jednocześnie najgęstszym dokumentem o bazie w repo: uzasadnienie każdej kolumny,
  > ograniczenia i indeksu stoi komentarzem SQL przy nim. Dokładając kolumnę, dopisz je
  > tam — nie w commit message. Cztery reguły przekrojowe (projekcje vs rejestr, kolumna
  > projekcji zamiast wyrażenia SQL, kiedy `CHECK`, kiedy `NULLS` w indeksie) są
  > w docblocku pliku; historia pułapek — `architektura-panelu-serwer.md` §7.8.
- **`src/bin/` = punkty wejścia.** `seedCli.ts` i `rebuildProjectionsCli.ts` to composition
  rooty: same składają zależności i same startują. Leżały wśród adapterów, w dwóch różnych
  katalogach, jakby były adapterami. Trzeci punkt wejścia (`index.ts`) zostaje w korzeniu
  `src/`, bo jest wejściem serwera, nie narzędziem.
- **`mappers/` w `application/*/`** — mapowania między reprezentacjami (`sessionRow.ts`:
  strumień → wiersz projekcji; `sessionListItem.ts`, `flagListItem.ts`, `eventTimeline.ts`:
  projekcja/strumień → DTO panelu; `projectionDiff.ts`: dwa wiersze → raport różnic).
  Leżały luzem na wierzchu `application/admin/`, odtwarzając piętro niżej dokładnie ten
  problem, który ten podział miał usunąć. Na wierzchu modułu zostają tylko `ports.ts`
  i `auditedWrite.ts` — kontrakt modułu i jego egzekucja.

**Wyjątki, świadome:** `domain/` jest płaskie, bo domena nie ma powierzchni — reguła jest
regułą niezależnie od tego, kto pyta. `infrastructure/auth/` i `infrastructure/traces/`
grupujemy po technologii. W `infrastructure/pg/{admin,mobile,common}/` pamiętaj, że
przynależność adaptera jest POCHODNA (idzie za portem, którego używa) i bywa nietrwała:
`aircraftConfigRepo` obsługuje dziś ingest, a jutro ekran floty. Gdy się zmieni, przenosimy
plik — to tańsze niż etykieta, która kłamie.

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
| `screens/` | ekrany aplikacji (`.tsx`) |
| `screens/logic/` | **czysta logika ekranów** (`.ts`) — patrz niżej |
| `navigation/` | stos nawigacji + `RootStackParamList` |
| `components/` | **Design System** — patrz katalog niżej |
| `hooks/` | spoiny między portami a UI (np. `useFlightDetection`) |
| `theme/` | tokeny 5 motywów + `ThemeProvider` / `useTheme` |
| `store/` | Zustand — cienka warstwa nad komendami i zapytaniami |
| `bootstrap/` | **composition root**: otwiera SQLite, buduje warstwy, podłącza do store'u |
| `format.ts` | prezentacja liczb domeny (czas UTC, block time, MH wg formatu, litry) |

`App.tsx` odpowiada wyłącznie za poziom aplikacji: dostawcy kontekstu, fonty, composition
root i nawigację. Ekran nie wie, skąd biorą się zależności.

### `screens/logic/` — logika wyniesiona z ekranu

Kilkanaście czystych modułów (`sessionAxis`, `sessionBalance`, `refuelMath`, `cockpitLog`,
`historyDays`, `syncStatus`, `operations`, `cockpitFuel`…) liczących to, co ekran pokazuje:
oś czasu sesji, rachunki paliwa i motogodzin z werdyktem, arytmetykę dolewki, log cyklu,
listę dni, nazwy operacji. Bywa, że moduł
rozstrzyga nie wartość, a PODZIAŁ RÓL między elementami ekranu — `cockpitFuel.ts` mówi,
czy litry niesie pasek paliwa, czy podpis kafelka „Tankowanie", żeby ta sama liczba nie
stała na ekranie dwa razy ani nie zniknęła z niego całkiem. **Bez importów z Reacta** —
testują się w gołym Node, bez urządzenia i bez RNTL, i stąd bierze się większość pokrycia
testowego aplikacji.

Moduł bywa wspólny dla kilku ekranów i to jest normalne, a nie wyjątek: `operations.ts`
(2026-08-06) powstał dlatego, że nazwę operacji pokazywały cztery ekrany na trzy sposoby —
siatka wyboru miała własne etykiety, a kokpit, podgląd i podsumowanie wypisywały surową
wartość przez `toUpperCase()`. Po zmianie „Ferry" → „Przelot" (issue #13) pilot wybierałby
„Przelot", a dwa ekrany dalej czytał „FERRY".

Moduł potrafi też ZNIKNĄĆ, gdy ekran przestaje go potrzebować, i tak ma być: `routeSuggestions.ts`
liczył, pod którym z dwóch pól trasy powiesić listę podpowiedzi i co potwierdzić pod spodem.
Po issue #14 pola trasy są przyciskami otwierającymi arkusz (`AirfieldSheet`), który sam pyta
katalog — więc moduł został usunięty razem z testami opisującymi układ, którego już nie ma.
Zostało z niego `airfieldRow`, przeniesione do `components/input/` (kształt wiersza należy do
komponentu, który go rysuje), z własnym testem kursu magnetycznego.

Wydzielone do podkatalogu 2026-07-31. Wcześniej leżały wymieszane z ekranami w jednym
płaskim katalogu, więc wzorzec był niewidoczny: nie dało się zobaczyć, który ekran ma
wyniesioną logikę, a `statsDay.ts` (używany przez `StatsScreen` ORAZ `CockpitReadonlyScreen`)
wyglądał, jakby należał do jednego z nich.

**To NIE jest warstwa aplikacji.** Te moduły liczą widok, nie przypadek użycia — dlatego
zostają w `ui/`, a nie wędrują do `application/`. Granica: jeśli moduł zmienia stan albo
woła port, jest komendą i jego miejsce jest w `application/`.

### Design System (`ui/components/`)

**Zasada: ekran nie definiuje własnych kart, chipów ani przycisków.** Jeśli czegoś
brakuje — dokładamy to do DS i używamy wszędzie. Dzięki temu poprawka wzorca (np.
powiększenie celów dotykowych po audycie użyteczności) przechodzi przez całą aplikację,
a nie przez jeden ekran.

**Osiem sekcji, jeden katalog na sekcję** (2026-07-31): `foundation/` · `layout/` ·
`status/` · `input/` · `readouts/` · `sheets/` · `data/` · `settings/`. Podział nie jest
nowy — barrel `index.ts` deklarował te same sekcje w komentarzach od dawna; do tej pory
nie egzekwowała ich jednak żadna struktura, więc nowy komponent mógł wylądować gdziekolwiek,
a sekcja rozjeżdżała się z rzeczywistością przy pierwszym niedopatrzeniu. Teraz nazwa
katalogu i nagłówek w barrelu opisują to samo, a rozjazd widać od razu.

Ekrany importują **przez barrel** (`from '../components'`) i tak ma zostać: dzięki temu
przenosiny wewnątrz DS nie dotykają ekranów — to właśnie barrel wchłonął tę zmianę
niemal w całości. Import bezpośredni z sekcji jest dopuszczalny, ale nie jest normą.

`tone.ts` zostaje w korzeniu `components/` — to pomocnik doboru barwy stanu, nie komponent.

| Komponent | Rola | Skąd w designie |
|---|---|---|
| `Screen` | tło, safe area, scroll, **przyklejony nagłówek**, akcja kończąca (`footer`) | wszystkie ekrany |
| `AppText` | typografia z tokenów (`display`/`timer`/`param`/`body`/`label`/`mono`/`micro`) | wszystkie |
| `Brand` | znak marki (kafel z ikoną, „UZ AERO", tagline), rozmiary `md`/`hero` | `.brand` (00/00a), `.app-icon` (01) |
| `Icon` | ikony po nazwie **znaczeniowej** (`peek`, `warning`, `op-skoki`) | wklejone SVG Feather |
| `Skeleton` | plamka trzymająca miejsce po danej, której jeszcze nie ma; wymiary podaje się **wprost, w rozmiarze wartości**, którą zastąpi | `.skel` (`LOADERY.html`) |
| `SkeletonRows` | n plamek w geometrii wiersza listy; tu mieszka komunikat „Ładowanie" dla czytnika ekranu | `LOADERY.html` |
| `SkeletonScreen` | skeleton **ramy** dla bramek startu w `App.tsx` — nagłówek i blok treści, bez udawania konkretnego ekranu | `LOADERY.html` |
| `CheckIcon` | ptaszek „✓" bez `react-native-svg` (obrócony prostokąt, 2 krawędzie) | `.aircraft-check` |
| `Avatar` | kafelek z inicjałami (albo z kodem pilota — `code`), 40/32 px | `.pilot-avatar`, `.crew-avatar` |
| `AppBar` | pasek **sesji samolotu**: samolot, trasa, wskaźnik łączności | `.app-bar` / `.compact-bar` |
| `ScreenHeader` | nagłówek **formularza**: tytuł, krok, powrót, wariant wyśrodkowany | `.app-header` |
| `IdentityStrip` | kto jest zalogowany (awatar, nazwisko, rola) | `.pilot-strip` |
| `Card` | karta; nagłówek `bar` (kokpit) albo `inline` (formularz) | `.day-log` / `.section` / `.form-card` (00a) |
| `SyncChip` | **jedyny** globalny wskaźnik sieci; online nic nie rysuje, offline SAM pill `OFFLINE · n` — tapnięcie otwiera arkusz szczegółów (kolejka, ostatni sync z `syncStamp`, wiek danych referencyjnych; issue #23 pkt 5) | reguła z `CLAUDE.md` |
| `StatusChip` | chipy **stanu sesji** (GROUND, RUNNING, cache) | `.ground-chip` |
| `Tag` | **przypisy** przy pozycji listy/nagłówku (8–11 px) | `.pic-lock-tag`, `.optional-tag`, `.step-badge` |
| `Banner` | trzy typy: `status` / `warning` / `edu` (zamykalny → mini-`?`) | taksonomia z `design-notes.md` |
| `CardPicker` | wybór z **listy kart** (nigdy natywny select), układ jednowierszowy; pozycja `peek` = do podglądu, nie do wyboru (ikona oka w miejscu kółka) | `.aircraft-option`, `.crew-option` |
| `OptionGrid` | siatka kart **z ikonami**, 2 kolumny | `.op-grid` |
| `OptionInput` | wartość konfiguracyjna w „ubraniu" pola — bez wpisywania | `.option-input` (11) |
| `PinDots` | kropki PIN-u; odmowa = czerwień + potrząśnięcie (jedyny komunikat) | `.pin-dots` (00) |
| `Numpad` | klawiatura PIN 3×4, klawisze 58 px; slot biometrii celowo pusty | `.numpad` (00) |
| `ProfileChip` | karta lokalnego profilu na zamku (awatar, nazwisko, kod) | `.profile-chip` (00) |
| `Field`, `TextField` | oprawa pola: etykieta mono, tag, podpowiedź; fokus zielony | `.field` / `.field-input` |
| `AirfieldSuggestions` | podpowiedzi lotnisk (kod, nazwa, pas i elewacja); lista kart w przepływie treści, nie nakładka — od issue #14 mieszka w arkuszu | `.suggest-list` (02f) |
| `AirfieldSheet` | arkusz wyboru lotniska: wpis kodu ALBO nazwy + żywa lista z katalogu w telefonie | `#sheet-airfield` (02e/02f) |
| `TextEntrySheet` | arkusz wpisu tekstu z listą ostatnio używanych (klient, notatka dnia); lista **tylko online** | `#sheet-client` (02e) |
| `ValueBox` | pole **odczytu**: duża wartość + jednostka, kontekst i ołówek po prawej | `.field-input.filled` |
| `Readout` | sekcja odczytu z licznika: wartość, świeżość, pasek, korekta, historia | `.section` w 02a |
| `FreshnessNote` | adnotacja §4.8: `live` (cisza) / `cache` (data) / `brak` / `manual` | `.fresh-note` |
| `LevelBar` | pasek poziomu wobec pojemności | wskaźnik paliwa w 02a |
| `Trail` | oś czasu prowadząca do wartości przekazania | `.trail` |
| `InlineNote` | przypis w kolorowym pudełku (mono 10 px + ikona) | `.certified-row`, `.none-box` |
| `PeekBanner` | pasek „oglądasz cudzą sesję" ze źródłem i wiekiem danych | `.ro-banner` (04b) |
| `OutboxGuard` | amber-box ochrony konta przy niepustym outboxie (§3.0) | `.outbox-guard` (00, 13) |
| `RefDataStamp` | stempel cache referencyjnego: kropka + „sync HH:MM UTC" | `.ref-sync` (13; z 01 usunięty — issue #23 pkt 5: stempel mieszka w arkuszu SyncChipa) |
| `Caption` | wyśrodkowany podpis pod akcją (mono 9 px) | `.takeover-hint`, `.actions-reason` |
| `CrewRow` | wiersz aktualnej załogi: rola, kod, „od kiedy", block | `.crew-row` (07) |
| `StepList` | numerowana procedura wychodząca poza ten telefon | `.handover-steps` (07) |
| `PillButton` | mała akcja nagłówka (pigułka z ikoną) | `.btn-add` (08) |
| `GhostAction` | dyskretna akcja w stopce karty (kreskowana linia) | `.block-add` (08) |
| `ReadingSheet` | arkusz korekty odczytu: duża wartość, odniesienia, ostrzeżenie | 02b / 02c (godzin klamry służby nie zbiera — klamra usunięta, issue #23) |
| `Stepper` | wartość liczbowa przyciskami ±, cele 46 px | odczyty paliwa/MH, skoczkowie, czas |
| `KeyValueRow` | wiersz klucz—wartość (kroje `micro`/`mono`, `valueTone`, `divider`) | `.diag-row` (13) |
| `SettingsAction` | wiersz akcji ustawień: ikona, nazwa, podpis (przy blokadzie niesie powód), strzałka | `.action-item` (13) |
| `SummaryStrip` | pasek bilansu dnia poza obszarem przewijania | `.summary-strip` |
| `ResultRow` | stopka sekcji: opis + wyliczona wartość nad linią | `.result-row` (09) |
| `ResultBar` | samodzielny pasek wyniku z rachunkiem, na tonowanym tle | `.result-row` (06) |
| `CalcBox` | wyliczenie zużycia paliwa z podaniem składników | `.calc-box` |
| `GaugeHero`, `ScaleBar` | wskaźnik FOB z podziałką | `.fob-indicator` |
| `SessionHero` | czas blokowy SESJI wielką czcionką + zakres (10). Nazwany `DutyHero` do etapu C5 — na karcie jednej maszyny bohaterem jest sesja, nie służba pilota | `.duty-hero` |
| `DayCard` | karta dnia w historii; wariant `editable` = niebieska ramka + pas „OTWÓRZ I POPRAW" | `.day-card` (12) |
| `CrewCard`, `CrewGrid` | karty załogi ze statystykami | `.crew-card` |
| `DataTable` | tabela lotów z celem korekty ≥ 44 px | `.data-table` |
| `StatGrid` | siatka 2×2 statystyk (etykieta / wartość / jednostka) | `.fuel-grid-2x2` |
| `CounterRow` | licznik sztuk z przyciskami 46 px | `.type-row` (05e) |
| `DropSheet`, `ManualEventSheet` | arkusze zrzutu i wpisu ręcznego nad kokpitem | 05e / 05f |
| `CorrectionSheet` | arkusz korekty: czas ±1 min, wpływ na czasy, strefa „nie było" | 04c |
| `LeaveCockpitSheet` | arkusz blokady wyjścia: co trzyma pilota w kokpicie + jedyne wyjście („ZDAJ SAMOLOT" → 09B). Wywołuje go `usePreventRemove` w kokpicie, więc łapie przycisk sprzętowy ORAZ gest cofania | 04d |
| `PhaseHero` | plakietka + faza lotu 54 px + prędkość pionowa | `.phase-hero` |
| `ParamGrid` | sztywna siatka 2×2 parametrów GPS; `stale` (— — po utracie fixa, przypis **amber** jak baner — 2026-08-12) i `note` (skąd wartość) | `.param-grid`, `.param-stale-note` (05g) |
| `NoGpsBanner` | baner-przyrząd braku fixa GPS (status): wiek fixa i co dalej. **Zawsze AMBER i bez przycisków** (2026-08-12) — trzy stany (rozruch / utrata / brak uprawnienia) różni TREŚĆ, bo dla pilota znaczą to samo; czerwień pochodziła z rejestru ryzyk §8, który stopniuje skutki, nie banery. „Zapisz zdarzenie" i „Lista ręczna" dublowały pasek akcji i kafelek z 04, a na przyrządzie czytały się jak drugi pasek | `.no-gps` (05g) |
| `CockpitActions` | dolny pasek: zapis ręczny, zrzut (tylko dzień skokowy — bez `onDrop` przycisku NIE MA), STOP z powodem blokady | `.action-row` |
| `EventLog` | log dnia jako **oś cykli**: szyna z ikonami (nieprzezroczyste — zakrywają kreskę), chipy, cel korekty ≥ 44 px. **Zieleń ma tylko wiersz `live`** — historia jest neutralna | `.day-log`, `.cycle-log` |
| `ClaimStrip` | pasek sesji CUDZEGO samolotu (04B): czyja maszyna, od kiedy, ile lotów — **przyrząd, nie nawigacja**. Zastąpił `DutyStrip` w etapie C5 (czasu służby w kokpicie NIE MA, §3.2), a 2026-08-10 stracił wariant klikalny razem z paskiem we WŁASNYM kokpicie: z 04/05 nie prowadzi żadna droga na 01 (`CLAUDE.md`, „Kokpit jest stanem modalnym") | `.claim-strip` (04B) |
| `FuelStrip` | odczyt paliwa + szacunek wystarczalności; ton z `fuelTone` (amber godzinę przed rezerwą, czerwony na rezerwie). **Na 04 stoi tylko przy znanej normie** — bez niej byłby samą liczbą, tą samą co podpis kafelka „Tankowanie" (`logic/cockpitFuel.ts`, 2026-08-10) | `.fuel-strip` (04) |
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

### Stan ładowania — jeden wzorzec, zero spinnerów (issue #33)

Specyfikacją jest `design/LOADERY.html` (siedem reguł na canvasie); tu mieszka to, jak
wzorzec wygląda w kodzie. Zasada w jednym zdaniu: **ekran, który czeka na odczyt, rysuje
plamki w geometrii docelowej — nigdy spinnera i nigdy pustki.**

Trzy kawałki, każdy w swojej warstwie:

| Plik | Rola |
|---|---|
| `ui/components/foundation/Skeleton.tsx` | plamka: wymiary wartości, kolor `surfaceHover`, niewidzialna dla czytnika ekranu |
| `ui/components/foundation/skeletonPulse.ts` | **jedna** `Animated.Value` na aplikację — wspólna faza; pętla chodzi tylko, gdy jest co animować; `useNativeDriver` |
| `ui/screens/logic/skeletonGate.ts` | CZYSTA reguła progu (180 ms) i minimum (420 ms) + „kiedy obudzić Reacta"; testy w `__tests__/skeletonGate.test.ts` |
| `ui/hooks/useSkeleton.ts` | pamięć chwil i jeden `setTimeout` na granicę — jedyne wejście dla ekranu |

Ekran pyta o jedno: `const skeleton = useSkeleton(!loaded)`. Reszta to układ.

**Trzy pułapki, po jednej na każdą regułę, którą łatwo złamać w dobrej wierze:**

1. **Pusta tablica to nie „brak danych".** `PreflightAircraftScreen` wypisywał „Brak
   samolotów w pamięci urządzenia" w trakcie normalnego odczytu cache'u, bo `fleet.length
   === 0` znaczyło naraz „jeszcze nie wiem" i „nie ma ani jednego". Każdy odczyt listy
   potrzebuje osobnej flagi `loaded` — nie da się jej wyprowadzić z długości wyniku.
2. **Skeleton nie zastępuje triady świeżości.** Dane z serwera mają własną skalę
   `live` / `cache` / `brak` (§6 pkt 2 wymagań). „Serwer jeszcze nie potwierdził tej sesji"
   (11) jest ODPOWIEDZIĄ, nie oczekiwaniem — plamka obiecywałaby coś, co może nie przyjść.
   Tak samo `disabled` z podanym powodem (04B) zostaje tym, czym jest.
3. **Skeleton nie zastępuje stanu pustego.** „JESZCZE ŻADNEGO LOTU" wolno napisać dopiero,
   gdy wiadomo, że jest pusto — czyli po odtworzeniu rejestru z serwera (`streamHydrated`,
   §4.9). Do tej chwili miejsce trzymają plamki. To ta sama zasada, dla której `usePilotDay`
   oddaje `null` zamiast pustej doby.

Wysokości plamek przepisujemy z komponentu, który zastąpią (`CardPicker` 56, `ActionButton
size="md"` 48, `DayCard` 116) — dlatego skeleton listy sesji na 01 jest lokalnym
komponentem ekranu obok `SessionRow`, a nie kolejnym wariantem w DS: geometria wiersza
i jego skeleton mają się zmieniać w jednym pliku, w jednym commicie.

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
- **Klawiatura przy otwarciu arkusza: samo `autoFocus` i nic więcej — SPRAWA OTWARTA.**
  Arkusz powinien otwierać się gotowy do pisania (zgłoszenia z urządzenia, issue #12
  i #14: „miała się otwierać klawiatura, ale się nie otwiera"), ale na Androidzie
  `TextInput` w `Modal` po prostu jej nie podnosi. Sprawdzone i **nieskuteczne**:
  `focus()` po zwłoce 150 ms, `focus()` z `Modal.onShow`, ponawiany `focus()`
  (0/60/180/350/600/900 ms) z przerwaniem na `isFocused()`, zdjęcie
  `statusBarTranslucent` z okna modalnego. Każda z tych prób dokładała maszynerii, żadna
  nie podniosła klawiatury — więc w kodzie został jeden `autoFocus` i tyle, a rzetelne
  rozwiązanie (najpewniej rezygnacja z `Modal` na rzecz nakładki wewnątrz ekranu, dla
  WSZYSTKICH arkuszy naraz) czeka na własne zadanie. Nie dokładaj kolejnej łatki
  celującej w timing: problem nie jest w momencie wywołania.
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

> ⚠ **ETAP C — cały ten akapit opisuje ścieżkę, której już nie ma.** Ekran `03` został
> usunięty, ścieżka to `02 → 02e → 02a`, a zdarzenia powstają przy „ROZPOCZNIJ LOT" na `02a`.
> Czas meldowania zniknął z przejęcia, więc `refreshDutyStart`, `dutyStartEdited` i cała
> historia issue #12 dotyczą pola, które przestało istnieć — do usunięcia razem ze szkicem.
> Sam mechanizm „szkic nie dotyka rejestru" pozostaje w mocy i jest nadal słuszny.

`ui/store/preflightDraft.ts` trzyma **szkic** preflightu przez trzy ekrany (02 → 02a → 03).
Rejestr jest append-only, więc nie wolno do niego wpisywać stanów pośrednich, które pilot
może jeszcze zmienić albo porzucić. Zdarzenia `session_claim` i `preflight_confirm`
powstają dopiero przy potwierdzeniu na ekranie 3. **Przejęcie samolotu z podglądu 04b też
jest tylko wypełnieniem szkicu** (`setAircraft` + powrót na 02) — ekran read-only nadal
nie pisze do rejestru ani jednego zdarzenia.

Szkic żyje tak długo jak proces aplikacji i to ma jeden nieoczywisty skutek: wartości
udające „teraz" starzeją się w nim po cichu. Dlatego czas meldowania **odświeża się przy
wejściu na krok 1** (`refreshDutyStart`, wołane z efektu montowania ekranu), a nie
w `initial()` — inaczej pilot, który otworzył aplikację o 6:00, a zaczynał dzień o 8:00,
dostawał w formularzu 6:00 (issue #12). Wpis własny jest nietykalny: `dutyStartEdited`
działa dokładnie jak `taskTouched` przy podpowiedziach zadania.

### `.tsx` eksportuje wyłącznie komponenty

Reguła narzędziowa, a przy kontekstach — reguła **poprawności**.

Fast Refresh podmienia moduł w miejscu tylko wtedy, gdy wszystkie jego eksporty są
komponentami. Jeden eksport obok — hook, stała, funkcja pomocnicza — i moduł przestaje
być granicą odświeżania. Przy zwykłym komponencie kosztem jest utrata stanu ekranu.
Przy pliku, który woła `createContext`, kosztem jest **błąd**: kontekst re-ewaluuje się
razem z komponentami, zamontowany provider podaje stary obiekt, odświeżony ekran szuka
nowego, `useContext` zwraca `undefined`. Na ekranie stojącym wewnątrz providera pojawia
się wtedy „useTheme() musi być użyty wewnątrz `<ThemeProvider>`", albo — ciszej i gorzej —
`useGps()` zwraca `null` przy działającym odbiorniku.

Dlatego kontekst i jego czytnik mieszkają OSOBNO od providera:

| kontekst + hook | provider (sam komponent) |
| --- | --- |
| `ui/theme/themeContext.ts` | `ui/theme/ThemeProvider.tsx` |
| `ui/bootstrap/servicesContext.ts` | `ui/bootstrap/ServicesProvider.tsx` |

Dla wołających nic się nie zmienia — barrel `ui/theme/index.ts` wystawia jedno i drugie,
więc `import { useTheme } from '../../theme'` działa jak dotąd (i jest jedyną poprawną
formą: 82 pliki tak robią, a omijanie barrela to druga konwencja bez powodu).

Jeden świadomy wyjątek: `ui/hooks/useEventCorrection.tsx` zwraca gotowy element
(`correctionSheet`), więc musi być `.tsx`, choć komponentu nie eksportuje. Kontekstu
nie tworzy, więc jedynym skutkiem jest propagacja odświeżenia do trzech ekranów,
które go wołają.

Ta sama reguła po stronie panelu: `docs/architektura-panelu-frontend.md` §2.3.

### To nie jest tylko obietnica

Granice pilnuje **wykonywalny test** — `src/__tests__/architecture.test.ts` skanuje importy i wywala się, gdy ktoś je złamie. Ma też własny test kontrolny („skaner faktycznie widzi pliki i importy"), żeby nie przechodził dlatego, że niczego nie znalazł. Dodatkowo sprawdza, że **barrel infrastruktury nie wciąga modułu natywnego** — dzięki temu testy działają w Node, bez urządzenia — oraz że **żaden `.tsx` w `ui/` nie eksportuje nie-komponentu** (reguła wyżej; komponent w tej aplikacji to zawsze `export function` z wielkiej litery).

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

**Punkt odniesienia łańcucha MH: `lastKnownMh(state)`, nie `state.mh.start`** (2026-08-07).
Reguła powstała, gdy `leg_close` niósł odczyt (2026-08-06→08-10): sesja miała więcej niż
jedno wskazanie licznika i porównywanie wyłącznie ze stanem przy przejęciu przepuszczało
wartość niższą od tej, którą pilot sam wpisał chwilę wcześniej — formalnie „wyższą niż na
starcie", faktycznie cofnięty licznik. Zasada zostaje po pivocie (ostatni ZNANY odczyt,
np. z ręcznego wpisu, zamiast stanu przy przejęciu).
Ta sama funkcja jest **wołana przez ekran** (`releaseAircraft.mhRegressionWarning`), bo próg
ostrzeżenia w arkuszu i próg odrzucenia w komendzie muszą być jedną liczbą: rozjazd wygląda
dla pilota jak awaria aplikacji, nie jak jego literówka.

**Miękkie, choć wymagane przez ekran: `NO_FLIGHT_WITHOUT_REASON`.** Zdanie samolotu bez
ani jednego biegu silnika i bez powodu (09C) jest flagą, nie odrzuceniem — twarda reguła kasowałaby
jedyny ślad po tym, że maszyna stała zajęta, czyli dokładnie tę informację, której szuka
administrator. Wymóg mieszka w ekranie, gdzie kosztuje jedno tapnięcie pilota stojącego
przy samolocie.

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

Moduły natywne (`expo-sqlite`, `expo-location`, `expo-sensors`, `expo-task-manager`)
są importowane **wyłącznie** przez swoje adaptery/moduły i nie trafiają do barrela
infrastruktury — inaczej testy w Node przestałyby działać. Pilnuje tego rodzina
testów exact-list w `architecture.test.ts` (po jednym na moduł natywny + wykluczenia
barrela + strażnik importu taska w `app/index.ts`).

**`GpsPort.start()` = subskrypcja JEDNEGO odbiorcy, nie przełącznik odbiornika.**
Zwrócona funkcja wypisuje wyłącznie jego; odbiornik gaśnie dopiero, gdy zejdzie ostatni
(`gps/gpsFanout.ts`, regresja `gpsFanout.test.ts`). Reguła jest twarda, bo słuchaczy jest
dwóch naraz: autodetekcja w kokpicie i diagnostyka GPS na 13. Adapter z jednym słuchaczem
oddawał strumień temu, kto wszedł później, i gasił go przy wyjściu — kokpit tracił
autodetekcję na resztę dnia, a baner „GPS: brak sygnału" nie miał już czym zniknąć.
Stąd też odbudowa nasłuchu w `useFlightDetection`: po `GPS_STALE_SEC` ciszy hook zdejmuje
subskrypcję i zakłada nową, bo martwej subskrypcji powrót sygnału nie obudzi.

### GPS w tle (usługa pierwszoplanowa + start headless)

Zapis lotu działa przy wygaszonym ekranie (ryzyko 🔴 z `_main.md.txt` §8 — battery
saver zabija proces). Konstrukcja, warstwa po warstwie:

- **Okno usługi = `projection.engineRunning`** (start silnika = start usługi i
  powiadomienia „UZ Aero — rejestracja lotu"; stop = koniec obu; między lotami zero
  GPS). Spoiną jest `ui/hooks/useBackgroundTracking.ts` — subskrypcja store'u wołająca
  `GpsPort.setBackgroundMode(...)` na zboczach. Binder montuje się w `ResumeGate`
  **po** `loadSession`, bo pierwszy odczyt stanu też jest komendą: zamontowany wyżej
  gasiłby adoptowaną usługę przy każdym otwarciu aplikacji w locie.
- **Adapter ma dwa źródła za jednym fanoutem**: `watchPositionAsync` (tryb `watch`,
  ekran włączony) ↔ `startLocationUpdatesAsync` + task `uzaero-location` (tryb
  `service`). Odbiorcy (kokpit, 13, ślad) nie widzą różnicy. Kadencja obu źródeł
  identyczna (1 s, bez `deferredUpdates*` — inaczej watchdog `GPS_STALE_SEC`
  i `MAX_FIX_GAP_SEC` czytałyby dosyłkę paczkami jako utratę sygnału).
- **Decyzje uzbrajania to czysta funkcja** (`gps/backgroundModePolicy.ts`): działającą
  usługę ADOPTUJEMY (`none` — restart mrugałby powiadomieniem i ciął ślad), startu
  z tła Android zakazuje → `retry-later` ponowione przy `AppState 'active'`.
- **Task rejestruje się z `app/index.ts`** (`gps/backgroundLocationTask.ts`,
  `defineTask` na poziomie modułu) — w starcie headless po śmierci procesu ładuje się
  bundle, ale React i bootstrap NIE. Usługa przeżywa proces (`killServiceOnDestroy:
  false`); paczki bez żywego sinka idą przez `gps/backgroundFixRouting.ts` do
  `gps/headlessTraceWriter.ts`, który pisze do `gps_trace` **tym samym**
  `TraceRecorder` + `appendTrace` co ścieżka żywa — `TraceSync` i `replay.ts` nie
  odróżniają trybów. Sesję wskazuje meta `active_session_uuid` (zapis w `claim`,
  czyszczenie w `releaseAircraft` — zdanie SAMOLOTU, nie zamknięcie dnia — uzgodnienie
  w `loadSession`); bez niej paczka idzie do kosza — fix bez atrybucji mógłby trafić
  do cudzej sesji.
- **Uprawnienia**: usłudze pierwszoplanowej wystarcza while-in-use — o „w tle" NIE
  prosimy (na Androidzie 11+ to wycieczka do ustawień bez korzyści). Dialogi
  (lokalizacja + powiadomienia 13+) wychodzą przy zatwierdzeniu preflight na 02a
  („PRZEJMIJ I LEĆ" — ekran 03 zniknął w etapie C4), nie przy pierwszym START ENGINE;
  odmowa niczego nie blokuje (§4.1).

Degradacja bez modułu natywnego (stary dev client, Expo Go na Androidzie — tam
lokalizacja w tle nie działa wcale): `backgroundLocationTask` robi MIĘKKI `require`
w try/catch (wzorzec `useSystemBackground`), więc aplikacja startuje normalnie,
a gdy uzbrojenie usługi twardo padnie, `armService` otwiera z powrotem zwykły nasłuch
(`serviceUnavailable`) — usługa jest ulepszeniem (ekran wygaszony), nie warunkiem
działania GPS.

Znane zachowania (świadome): wiersze `sensor` nie powstają headless (hooki UI śpią);
detekcja wraca dopiero po otwarciu aplikacji (od zdarzeń jest korekta ręczna + okno
24 h); `useSyncLoop` tyka dalej, gdy usługa trzyma proces; po reboocie telefonu usługa
NIE wstaje sama (bez `RECEIVE_BOOT_COMPLETED`) — wznawia ją resume przy otwarciu;
nawigacja poza kokpit przy pracującym silniku nadal usypia detekcję i ślad (hook
odmontowany — jak przed zmianą; usługa trzyma tylko GPS ciepły).

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
8. Ekran czekający na odczyt (lista z cache'u, ślad, doba pilota) → **„Stan ładowania"**
   w §2: `useSkeleton` + plamki w geometrii docelowej. Pustka i spinner są zakazane, a stan
   pusty („brak wyników") wolno pokazać dopiero wtedy, gdy wiadomo, że jest pusto.

### Nowa metryka analityki zużycia

Moduł `packages/domain/src/consumption/` (dodany 2026-08-05) liczy stawki paliwa per faza
i przelicznik motogodzin. Podział plików idzie wzorcem `track/`: typy → czysta matematyka
→ polityka → orkiestrator → widoki pochodne.

| Plik | Rola |
|---|---|
| `interval.ts` | typy `FuelInterval` / `MhEquation`; zero logiki |
| `timeInPhase.ts` | odcinki pracy silnika i lotu, przycinanie do okna, **scalanie nakładek** |
| `matrix.ts` | Cholesky, Gram, inwersja (n ≤ 4); bez pojęć dziedzinowych |
| `nnls.ts` | regresja z więzem nieujemności — wyliczeniowy zbiór aktywny |
| `fit.ts` | dopasowanie RAZEM z przedziałami ufności (t-Studenta, nie bootstrap) |
| `policy.ts` | wszystkie progi i bramka publikacji |
| `intervals.ts` | ekstrakcja interwałów z jednej sesji (korekty przed arytmetyką) |
| `model.ts` | drabina degradacji faz + wykluczanie odstających |
| `mhModel.ts` | przeliczniki MH + rozpoznanie typu licznika |
| `summary.ts` | ilorazy sum, pasmo centylowe, trend miesięczny |
| `norm.ts` | skrócony widok dla aplikacji pilota (`ConsumptionNorm`) |
| `phaseTimeline.ts` | oś faz pionowych ze śladu GPS — zależy WYŁĄCZNIE od nagrania |

Dokładając metrykę:

1. **Iloraz sum czy regresja?** To dwie różne liczby i wybór jest merytoryczny, nie
   stylistyczny. `summary.ts` waży interwały LINIOWO czasem (`ΣL / Σh`), a `model.ts` —
   KWADRATEM (regresja minimalizuje błąd w litrach, więc dłuższy interwał ma większą
   wagę). Obie są poprawne; rozjazd między nimi jest oczekiwany i **nie należy go
   „ujednolicać"** (test `nnls.test.ts` przybija to wprost).
2. **Nowy próg** trafia do `policy.ts`, nigdy do modułu, który go używa — i wchodzi
   z komentarzem, co się dzieje przy podniesieniu i obniżeniu. Progi kalibrujemy na
   realnej historii, nie na wyczucie (ta sama reguła, co w `algorytm-detekcji.md` §15).
3. **Nowa metryka zbiorcza** idzie do `summary.ts` i musi zwracać `null` przy pustym
   mianowniku. Zero nigdy nie udaje pomiaru.
4. Test w `app/src/__tests__/` (mapowanie 1:1 z modułem), z przypadkiem, w którym metryka
   **nie ma prawa** się policzyć.
5. Po stronie panelu: kolumna DTO w `server/src/application/admin/contracts/consumption.ts`
   i iloraz w mapperze — nigdy w SQL (`architektura-panelu-serwer.md` §7.7).
6. **Jeśli metryka ma trafić do telefonu**, dochodzi trzeci krok: pole w `ConsumptionNorm`
   (`packages/domain/src/reference.ts`) i przepisanie go w `application/common/consumptionNorm.ts`.
   Norma jest materializowana w tabeli `aircraft_consumption` i przeliczana
   PO commicie ingestu, gdy dzień się domknął — nigdy na żądanie `GET /reference`, bo
   tę trasę odpytuje każdy telefon co kwadrans.

> ⚠ **ETAP B/D — wyzwalacz przeliczenia normy znika razem z `day_close`.** Trzeba wskazać
> nowy: zdanie samolotu (spójne z „przekazanie zamyka sesję") albo każdy `leg_close`
> z odczytem (częściej, ale drożej). Osobno: `_main.md.txt` §3.6b opisuje ryzyko, że przy
> opcjonalnym odczycie dzień skokowy da JEDEN interwał paliwowy na całą sesję — czyli
> dokładnie przypadek, w którym `MAX_VARIANCE_INFLATION` odrzuci rozdział ziemia/lot.
> Progów **nie stroimy w dyskusji**; rozstrzyga `consumptionReplay.ts`, ale musi dostać
> dane w nowym kształcie, których nie ma nawet w scenariuszu demo.

**Dwie bramki, które łatwo pomylić** (obie znalezione przebiegiem po realnej historii,
2026-08-05, oba przypadki mają testy regresyjne):

- `MAX_RELATIVE_CI` pyta „jak dokładnie znamy stawkę PRZY TYCH danych";
- `MAX_VARIANCE_INFLATION` pyta „czy te dane w ogóle rozstrzygają ten podział".

Przy danych wewnętrznie spójnych σ reszt schodzi do zera, więc pierwsza bramka
przepuszcza wynik, w którym stawka ziemi wychodzi WYŻSZA niż stawka lotu. Druga to
łapie. Model motogodzin ma zamiast niej bramkę FIZYCZNĄ (`k_ziemia ≤ k_lot`), bo relację
między jego dwiema niewiadomymi znamy z góry — patrz docblok `trustworthy` w `mhModel.ts`.

**Fazy pionowe cache'ujemy przy śladzie, nie w bazie.** `consumption/phaseTimeline.ts`
zależy wyłącznie od nagrania, więc `<sesja>.phases.json` obok `<sesja>.ndjson` unieważnia
się rozmiarem pliku źródłowego i wersją formatu — a korekta czasu startu (04c) go NIE
unieważnia, bo okno lotu nie wchodzi do tego rachunku. Podbij `TIMELINE_VERSION`
w `server/src/infrastructure/traces/fsPhaseTimeline.ts` przy każdej zmianie progów fazy.

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
| `statsDay.test.ts` | odmian wspólnych ekranowi sesji: liczebnik lotów, rozbicie skoczków |
| `sessionAxis.test.ts` | osi czasu sesji (10): kolejność zdarzeń, adresy korekty, plakietka tylko dla wpisu ręcznego, stopka (blok / w powietrzu / starty), sesja bez pracy silnika |
| `sessionBalance.test.ts` | rachunków paliwa i MH: oczekiwanie liczone z PROPORCJI faz tej sesji, podłoga pasma z błędu odczytu, powód zamiast kreski, gdy nie ma z czym porównywać |
| `cockpitPeek.test.ts` | podglądu cudzej sesji: świeżość migawki, treść ostrzeżeń |
| `crewChange.test.ts` | atrybucji block time per pilot i blokad zmiany Duala |
| `manualLog.test.ts` | grupowania logu w cykle silnikowe i wierszy oczekiwanych |
| `corrections.test.ts` | nakładania korekt 04c (retime/void, „ostatnia wygrywa") i ich reguł |
| `correctionUi.test.ts` | zapowiedzi skutku korekty — „Wpływ na czas lotu" liczy ta sama projekcja |
| `syncEngine.test.ts` | pętli wysyłki §4.3 i poświadczeń §3.0: duplikaty = dostarczone, offline ≠ auth_expired, jedna rotacja tokenu, `fetchStatus` dla ekranu 11 |
| `syncStatus.test.ts` | prezentacji ekranu 11: odmiana liczebników, konwencja nazwy karty §4.7, licznik wysyłki z ogonem outboxa |
| `referenceSync.test.ts` | odświeżania cache §4.8: nadpisanie seedu prawdą serwera, ETag/304 z podbiciem wieku, brama 15 min, offline nie psuje cache |
| `eventRestore.test.ts` | odtworzenia rejestru §4.9 (issue #32): odbudowa strona po stronie, pobrane NIE wchodzi do outboxa, dedup chroni wpis czekający w kolejce, kursor per pilot, przerwanie w połowie nie cofa postępu |
| `claimMode.test.ts` | trybu przejęcia §4.4: `takeover_online` tylko z odpowiedzią serwera, żywy poprzednik wygrywa z cache, „już wolny" gasi przejęcie |
| `pinCrypto.test.ts` | własnego SHA-256 (wektory NIST + node:crypto dla UTF-8) i solonego skrótu PIN-u — rekord nigdy nie niesie PIN-u wprost |
| `historyDays.test.ts` | ekranu 12: doba bieżąca poza listą (i sesja spod północy po stronie doby uruchomienia), podział wg okna korekty, sesja trzymana poza historią, plakietka wysyłki z outboxa sesji w dwóch odmianach, plakietka na 01, odliczanie |
| `traceRecorder.test.ts` | śladu kalibracyjnego: zapis fixów/markerów, retencja po zegarze urządzenia, księgowość wysyłki (offline zostawia wpisy), limit paczki |
| `gpsLoss.test.ts` | napisów 05g (wiek fixa, baner, „— —" z czasem) i formatu pozycji DDM z ekranu 13 (półkule, zera wiodące) |
| `themePrefsSync.test.ts` | uzgadniania motywu pilota przez `/me/prefs`: LWW po stemplu decyzji w obie strony, `dirty` jak outbox, brama wieku pulla, offline = `skipped` |
| `themePrefsStore.test.ts` | rekordu motywu per pilot: izolacja pilotów na wspólnym telefonie, migracja starego klucza per telefon, odporność na zepsuty zapis |
| `locationToFix.test.ts` | translacji odczytu platformy: null-nie-zero (regres do `?? 0`), `−1` = brak, jednostki m→ft i m/s→kt, czas z fixa zamiast zegara urządzenia |
| `backgroundFixRouting.test.ts` | routingu paczek z taska tła: żywy sink > zapis headless > kosz — fix bez sesji nie wchodzi do śladu |
| `backgroundModePolicy.test.ts` | usługi pierwszoplanowej GPS: adopcja bez restartu po headless, `retry-later` przy próbie startu z tła, sprzątanie osieroconej usługi |

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
Tor CAŁKOWICIE osobny od rejestru: tabela `gps_trace` (migracja 2 SQLite aplikacji, poza
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

### 8.3 Czas pracy silnika liczony z dwóch źródeł (2026-08-05)

Wada znaleziona przy budowie analityki zużycia, naprawiona razem z nią — warta opisu,
bo jej **objawem był brak objawu**.

`projectSession` obsługuje czas blokowy DWIEMA drogami. Para `engine_start`/`engine_stop`
tworzy wpis w `state.legs` (do etapu B2a tablica nazywała się `engineRuns`);
`manual_log_entry` (fallback GPS, ekran 08) dokłada odcinek off-block→on-block **wprost
do `blockTimeMs`, bez wpisu w `legs`**. Jest to sensowne — wpis ręczny nie opisuje cyklu
silnika, tylko zaraportowany czas — ale każdy, kto liczy czas pracy silnika z samych
`legs`, dostanie w dniu z wpisem ręcznym mianownik za mały.

Robił tak ekran 06: `estimateConsumption` dzieliło ubytek paliwa przez czas z cykli, więc
średnia L/h wychodziła **zawyżona**. Nic tego nie zdradzało: zła średnia wygląda dokładnie
tak samo jak dobra, a docblok modułu ostrzegał przed tym trybem awarii dwa lata wcześniej,
niż on wystąpił.

Naprawa jest jedną funkcją dla obu stron — `consumption/timeInPhase.ts`:

- `blockSpans(state, events)` zbiera odcinki z OBU źródeł i nakłada korekty (wpis
  unieważniony `void` przestaje liczyć się do mianownika);
- `spanTimeInWindow` **scala nakładki zamiast sumować długości**. Ręczny wpis potrafi
  nachodzić na zarejestrowany cykl (pilot dopisał lot, który aplikacja też złapała),
  a suma policzyłaby te minuty dwa razy — mianownik rośnie, L/h spada, i znowu nic tego
  nie widać. `state.blockTimeMs` sumuje bez scalania i **to zostaje**: tam liczba opisuje
  „ile czasu zaraportowano", tu miara opisuje „ile silnik pracował". Różnica jest
  zamierzona i nazwana w obu miejscach.

Test regresyjny: `app/src/__tests__/timeInPhase.test.ts`, przypadek nazwany wprost
(„liczy ręczny off/on-block, którego NIE MA w legs") plus asercja pokazująca,
że projekcja i miara odpowiadają na różne pytania.

---

## 9. Uruchamianie

```bash
cd app
npx expo start        # aplikacja (Expo Go / emulator)
npx jest              # testy — wszystkie w Node, bez urządzenia (liczba: §8)
npx tsc --noEmit      # kontrola typów (strict)
```

### Dziennik żądań serwera

Serwer wypisuje na konsolę JEDNĄ linię na zakończone żądanie (`http/requestLog.ts`):

```
08:14:32  POST  /events                             200    38 ms  1.3 kB
08:14:33  GET   /me/task-suggestions                200     4 ms
08:14:41  GET   /admin/api/dni                      401     1 ms
```

Czas w UTC — inaczej dziennik nie dałby się zestawić z czasami zdarzeń, które w nim widać.
**Bez nagłówków, ciasteczek, treści i query stringu**: linia loga bywa kopiowana do
zgłoszenia, a `authorization` albo `?token=…` skopiowany razem z nią jest tokenem oddanym.

Jedna linia po ODPOWIEDZI, a nie dwie (żądanie + odpowiedź) jak w `logger: true` Fastify'ego:
przy jednym serwerze klubu JSON Pino jest formatem dla agregatora, którego tu nie ma, a puls
telefonu co 60 s zamieniłby okno w szum. Testy integracyjne gaszą dziennik
(`buildServer(deps, { requestLog: false })`), sam format ma test jednostkowy.

---

*Aktualizuj przy zmianie granic warstw lub zasad z §4. Reszta jest opisana testami.*
