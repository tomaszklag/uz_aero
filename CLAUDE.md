# Ninerdeck - instrukcje dla Claude Code

## Nazwa aplikacji
Aplikacja nazywa się zawsze **Ninerdeck** (mixed case w tekście, **NINERDECK** w nagłówkach
display/Bebas Neue). Nigdy `NinerDeck`, `Niner Deck` ani `9DECK` - domena jest jednym słowem,
a `9DECK` czyta się „nine deck". Monogram `9` służy za znak w ikonie i faviconie; obok niego
stoi zawsze pełne `NINERDECK`.
Stare nazwy - `UZ Aero`, `UZ AERO`, `e-Chronometraż`, `e-CHRONO`, `CHRONO` - są błędne,
nigdy ich nie używaj. „UZ Aero" było nazwą roboczą do 2026-09-08 i zostaje wyłącznie
w narracji historycznej (nazwa repozytorium `tomaszklag/uz_aero`, pierwotna specyfikacja
`docs/Aplikacja UZ AERO.pdf`).

## Projekt
Aplikacja Android (React Native + Expo) - elektroniczny system lotniczy dla pilotów.
Rejestruje: czasy blokowe, paliwo, starty/lądowania, eksportuje do Google Sheets.
Dokumentacja: `docs/_main.md.txt`

Stack: React Native + Expo · Zustand · expo-sqlite · expo-location · własny backend (Node/TS + PostgreSQL) · eksport do Google Sheets po stronie serwera

## Faza aktualna
**Monorepo: aplikacja RN w `app/`, backend w `server/`, wspólne pakiety w `packages/`** -
`@ninerdeck/domain` (zdarzenia, reguły, projekcje, detekcja), `@ninerdeck/tokens` (palety
dwóch motywów: ciemnego i jasnego, skale, typografia, emiter zmiennych CSS)
i `@ninerdeck/format` (czasy UTC, czas blokowy, motogodziny, litry). Wszystkie trzy to czysty TypeScript bez importów
z RN/DOM. `app/src/ui/theme/tokens.ts` i `app/src/ui/format.ts` są shimami zgodności -
kod ekranów importuje po staremu.
Fazy z `docs/_main.md.txt` §10: 1–4 ✅ **wobec modelu sprzed 2026-08-06** (ekrany 00–12 komplet; sync end-to-end z eksportem §4.7 na kartach W BAZIE - `exported_sheets` + `GET /sheets/:tab`; adapter Google Sheets = opcjonalna przyszła podmiana portu `SheetsPort`, gdy będzie klucz) · **faza 8 = przebudowa flow, WYPRZEDZA fazę 5** (patrz niżej) · potem: 5 testy z pilotami, 6 wdrożenie + backlog audytu.
Faza 7 **panel administracyjny (web)** - backend wdrożony w całości (role, `/admin/*`, cykl życia flagi, audyt) i **nietknięty**; klient web przepisany na **PANEL 2.0** (2026-08-30, gałąź `panel-2.0`): dwa moduły - **PILOCI i SAMOLOTY** - zamiast jedenastu ekranów, bez banerów wyjaśniających, bez kafli z licznikami; od issue #107 (2026-09-08) w STYLU LEKKIM: kolumna boczna z ikonami i kontekstem klubu, okruszki w dzienniku, typografia zdaniowa - sekcja „Styl lekki panelu". Trzeci moduł - **DZIENNIK** (2026-08-30): trzy poziomy (flota w zakresie dat → grid operacji jednej maszyny → jedna operacja z osią zdarzeń), dziewięć kolumn zamiast siedemnastu, wyłącznie ODCZYTY - zero szacunków i prognoz, brak odczytu widoczny jako kreska. Wymagał migracji 3 (osiem kolumn projekcji: bieg silnika, koperta lotów, lotniska, dolewka paliwa, wpis ręczny, olej do lotu) i **przebudowy projekcji na istniejących wierszach**. Decyzje, reguły redakcyjne i liczby: **`docs/panel-2.0.md`**; szkielet warstw dalej w `docs/architektura-panelu-frontend.md`. Pozostałe ekrany (pulpit, dni, flagi, zdarzenia, eksporty, audyt, statystyki, analityka, konserwacja) usunięte z kodu i odzyskiwalne z historii gita - wracają pojedynczo, każdy przepisany pod reguły 2.0. **`design/admin/` (23 ekrany, `SZABLON.html`, `ANALIZA.md`) jest odtąd ARCHIWUM panelu 1.0**, nie specyfikacją.
**Analityka zużycia** (2026-08-05) - wdrożona end-to-end: domena `packages/domain/src/consumption/` (interwały paliwowe odczyt→odczyt, NNLS per faza, przelicznik MH z automatycznym rozpoznaniem obrotomierz/Hobbs, oś faz pionowych ze śladu), `GET /admin/api/fleet/:id/consumption` + ekran A10a/A10b w panelu, norma zużycia w aplikacji pilota (migracja serwera 19 + SQLite 4, ekrany 04/06/10). Reguła czytania strumienia poza listami: `docs/architektura-panelu-serwer.md` §7.7; przepis „nowa metryka analityki": `docs/architektura-kodu.md` §7.
**Rozszerzona przy issue #38 (2026-08-12)**: norma telefonu niesie parę stawek fazowych
(ziemia + powietrze) i przeliczniki MH, a `consumption/expectation.ts` liczy z nich
oczekiwanie dla KONKRETNEJ operacji - patrz sekcja „Norma zużycia liczy się PER OPERACJA" niżej.
**Progi analityki są DO KALIBRACJI** (`consumption/policy.ts`) - służy do tego `server/scripts/consumptionReplay.ts`, który puszcza realną historię przez ten sam kod, co serwer. Pierwszy przebieg (2026-08-05) znalazł pięć wad, każda ma test regresyjny; nie strojimy tych progów w dyskusji.
**PIVOT MODELU 2026-08-10 - OPERACJA = JEDEN BIEG SILNIKA** (sekcja „Operacja = jeden bieg
silnika" niżej). Story użytkownika częściowo odwraca przebudowę z 2026-08-06: `leg_close`
do usunięcia, ekran 09 scala się z 09b, odczyty przy zdaniu OBOWIĄZKOWE, 09a ginie.
Etapy pivotu: **A' design+docs ✅** → **B' domena ✅** (SESSION_ALREADY_RAN; `leg_close`
wycięty z domeny, app i serwera z mechaniczną kaskadą; okno korekty = 24 h od ZDANIA
z domkniętą granicą; `CURRENT_SCHEMA_VERSION` z powrotem = 1; kanoniczny dzień 22 JUNE
przebudowany na TRZY operacje z łańcuchem MH przez zdania) → **C' app ✅** (kokpit
w dwóch stanach ground z hero ZDAJ SAMOLOT, log = płaska oś jednej operacji bez `DayLog`,
09b z przeglądem lotów i „ZDAJ I ZATWIERDŹ LOG", 01 bez karty claimu, NOWY ekran 15
`ManualFlightScreen` + komenda `manualFlight` z próbą generalną przed zapisem) →
**D' serwer+panel ✅** (oś zdarzeń i plakietki bez `leg_close`, okno korekty „od zdania"
w banerach, słownik operacja/lot w kontraktach) → **E' seed+demo ✅** (generator: `DemoRun`
z tablicą LOTÓW zamiast tablicy wzlotów, `ConfirmStyle` i `gaugeNoise` wycięte, próba
techniczna scala się z oblotem w JEDEN bieg, przerwany bieg = OSOBNA operacja z sufiksem
uuid `-r2` i handoffem, dolewka PO zatrzymaniu jako materiał logu 04; 52 operacje).
**PIVOT DOMKNIĘTY W KODZIE.** (Zdanie „`seed` + `seed:demo` stawiają świat od nowa"
przestało obowiązywać przy issue #50 - patrz niżej.)
**ISSUE #50 (2026-08-26) - SEED = SAM ADMINISTRATOR, DANE DEMO USUNIĘTE.**
Przygotowanie testów z pilotami: `npm run seed` zakłada WYŁĄCZNIE konto `admin`
(hasło z `SEED_PASSWORD`), bez floty i bez pilotów - wszystko zakłada administrator
w panelu (A06/A07). Generator demo (`server/scripts/demo/`, `seed:demo`, `db:demo`,
`demoScenario.test.ts`) skasowany W CAŁOŚCI (odzyskiwalny z historii gita); świat
referencyjny testów serwera (SP-AXA i spółka) mieszka odtąd w `server/test/testWorld.ts`.
Zaślepka floty telefonu (`app/src/infrastructure/referenceSeed.ts`) też skasowana:
cache referencyjny wypełnia wyłącznie `GET /reference`, bo upsert synca nigdy nie
kasuje wierszy i fikcyjne SP-AXA zostawałoby na telefonach testerów na zawsze.
Kalibracja §3.6b poczeka na dane PRAWDZIWE z testów - po to one są.
Baza dev wyczyszczona i postawiona od nowa (`docker rm -f uzaero-pg` → `db:up` → `seed`).
**ISSUE #23 (2026-08-11) - KLAMRA SŁUŻBY USUNIĘTA W CAŁOŚCI** (sekcja „Dzień pilota =
lista operacji" niżej). Zamyka temat odłożony przy pivocie: z modelu znikły
`preflight_confirm.dutyStart`, `day_close.dutyEnd`, reguła `DUTY_END_BEFORE_START`
i projekcja klamry (`projections/duty.ts` → `projections/pilotDay.ts`,
`projectDuty` → `projectPilotDay`); z designu ekran `01b` i sekcja „Służba" na 01
(w zamian wariant `01c` - offline + arkusz szczegółów syncu). Ekran 01 = płaski log
operacji (bez grupowania po maszynie) + sumy Blok/Loty; nagłówki wg jednego wzorca
(tytuł do lewej, ustawienia po prawej); SyncChip = sam pill z arkuszem pod tapnięciem.
Opisy etapów B–D niżej zostają jako historia - częściowo już cofnięte.
**PRZEBUDOWA FLOW** (od 2026-08-06, gałąź `poc-zmiany-flow`) - dzień służby przestał
być kontenerem na loty (patrz sekcja „Czas służby" niżej). Rozjazd design↔kod jest świadomy
i tymczasowy: mockupy prowadzą, kod dogania. **Nie „naprawiaj" ekranów RN pod stare mockupy
- zostały usunięte.**
- **Etap A ✅** - `design/` i dokumentacja przebudowane i zacommitowane.
- **Etap B ✅ DOMKNIĘTY** (`packages/domain`) - pięć kroków, każdy z testami:
  - **B1 ✅** `leg_close`, `CURRENT_SCHEMA_VERSION` = 2, `dutyStart`/`dutyEnd` opcjonalne,
    trzy reguły `LEG_*`.
  - **B2a ✅** `EngineRun` → **`Leg`** (`engineRuns` → `legs`): wzlot to cykl silnika
    RAZEM z potwierdzeniem (`confirmed`, `confirmedAt`, `reading`, `notes`). Nie ma
    osobnej tablicy obok - to ten sam byt.
  - **B2b ✅** `projections/duty.ts` - `projectDuty(sessions, pilotId, day)` jako CZYSTA
    funkcja POZA `SessionState`. Klamra = **unia** deklaracji i wzlotów (tu mieszka
    reguła „służba ⊇ suma wzlotów"); `declaredStart/End` obok, żeby UI umiało napisać
    „poprawione"; `declarationNarrowsStart/End` na ostrzeżenie. Przynależność wzlotu
    do doby wyznacza czas URUCHOMIENIA silnika, nie zamknięcia.
  - **B3 ✅** okno korekty kotwiczy się we WZLOCIE (`leg_close`, awaryjnie `engine_stop`),
    osobno dla każdego; `eventIndex` niesie `{type, at}`, żeby regułę dało się przypisać
    do konkretnego wzlotu. **Administrator NIE JEST NIGDY BLOKOWANY** (decyzja 2026-08-07)
    - przy kolizji dostaje ostrzeżenia `ADMIN_EDIT_SESSION_ACTIVE` /
    `ADMIN_EDIT_PILOT_WINDOW_OPEN`. Twarde reguły są w obu trybach IDENTYCZNE bez wyjątku;
    pilnuje tego `writeAuthority.test.ts` i to on złapał błąd, w którym miękkie
    ostrzeżenie w „kopercie" wycinało komplet reguł per typ.
    **Do etapu D zostaje bramka `400 day_open` w panelu** - domena jej już nie egzekwuje.
  - **B4 ✅** `consumption/intervals.ts` czyta `leg_close`: odczyt przy wzlocie działa jak
    tankowanie bez dolewki (zamyka interwał i otwiera następny tą samą wartością), a wzlot
    BEZ odczytu nie tworzy granicy w ogóle.
  - **B5 ✅** (poprawka znaleziona dopiero w etapie C, 2026-08-07) - projekcja dostała
    `claimedAt` i **`preflightAt`**, bo `PREFLIGHT_REQUIRED` pytało o `state.dutyStart`.
    Po B1 godzina meldunku jest opcjonalna i ekran 02 o nią NIE PYTA, więc reguła
    unieruchamiała silnik i blokowała zdanie samolotu pilotowi, który zrobił wszystko
    dobrze. Komplet 906 testów tego nie widział, bo KAŻDY helper podawał `dutyStart` -
    stąd nowy blok „preflight bez deklaracji meldunku" w `rules.test.ts`.
    Przy okazji `day_close` ma `noFlightReason` (09C) z miękką flagą
    `NO_FLIGHT_WITHOUT_REASON`: brak powodu nie może kasować faktu, że maszyna stała zajęta.
    **ETAP B DOMKNIĘTY.**
- **RYZYKO §3.6b - warunek wstępny SPEŁNIONY 2026-08-08**: generator demo
  (`server/scripts/demo/`) przebudowany pod nowy model. Produkuje cztery style pracy
  z ekranem 09 (`ConfirmStyle`: odczyt przy każdym wzlocie / co trzeci / potwierdzenie bez
  odczytu / brak potwierdzenia), próby silnika bez lotu i jeden wzlot przerwany -
  czyli materiał, na którym `consumptionReplay.ts` da się uruchomić sensownie. Pierwszy
  przebieg (bez strojenia) pokazał: próg 30 min stoi 2 min pod typowym wzlotem skokowym;
  dzień skokowy NIE ROZDZIELA ziemi od lotu przy żadnej liczbie danych (stała proporcja
  faz → `collinear`), rozdział wychodzi tylko na maszynie z różnorodnym ruchem; operacja
  „skrupulatna" produkuje do 25% interwałów degeneracyjnych między ostatnim `leg_close`
  a zdaniem samolotu. **Progów nadal NIE stroimy w dyskusji** - to osobna decyzja
  po kalibracji na tych danych (`docs/_main.md.txt` §3.6b).
- **Etap C** `app/` (ekrany 1:1 z nowych mockupów) - w toku:
  - **C1 ✅** komendy i store: `closeLeg`, `releaseAircraft` (dawne `dayClose`).
  - **C2 ✅** ekran 01 „Mój dzień" - `logic/myDay.ts` + `logic/heldAircraft.ts`.
    Dwa modele, bo to dwie OSIE: służba pilota przekrojowo po maszynach vs jedna operacja.
  - **C3 ✅** ekrany 09/09A (`LegCloseScreen`) i 09B/09C (`ReleaseAircraftScreen`) -
    po jednym pliku na parę, bo wariant to STAN tego samego ekranu, nie osobny ekran:
    seria skokowa włącza się obecnością zrzutu, 09C brakiem wzlotów. Logika w
    `logic/legClose.ts` i `logic/releaseAircraft.ts`.
  - **C4 ✅** przejęcie skrócone do trzech kroków (02 → 02e → 02a). `PreflightConfirmScreen`
    USUNIĘTY razem z trasą w nawigacji - zapis `session_claim` + `preflight_confirm`
    przeniósł się pod „PRZEJMIJ I LEĆ" na 02a. Godziny meldunku nie ma już ani w szkicu,
    ani w payloadzie. Konsekwencja: `dutyStart` w projekcji jest odtąd zwykle `null`,
    więc czytelnicy przeszli na `claimedAt` (historia, sortowanie operacji, nazwa karty
    arkusza, załoga). **Karta historii mierzy OPERACJĘ (przejęcie → zdanie), nie „Duty"** -
    służba należy do pilota i potrafi objąć kilka maszyn.
  - **C5 ✅** kokpit i nawigacja. `DutyStrip` → **`ClaimStrip`** (pasek operacji: czyja
    maszyna, od kiedy, ile wzlotów). **Od 2026-08-10 pasek został tylko w 04B** - patrz
    „Kokpit jest stanem modalnym" niżej. `DutyHero` → **`SessionHero`** na ekranie 10, gdzie bohaterem jest czas
    blokowy operacji, nie służba. **`SplashScreen` i `EndOfDayScreen` USUNIĘTE** - 01 jest
    ekranem domowym, a zdanie samolotu zastąpiło zamknięcie dnia. STOP ENGINE prowadzi
    na 09. Wznowienie po restarcie w `navigation/resumeTarget.ts`: pytamy o `closed`,
    bo `dutyEnd` po §3.6a nie odróżnia już operacji trwającej od zdanej.
  - **ETAP C DOMKNIĘTY** - aplikacja jest spójnie klikalna: 01 → 02/02e/02a → kokpit →
    09 → 09b → 01.
- **Etap D ✅ DOMKNIĘTY** serwer + panel:
  - **D1 ✅** `claim_time` = czas `session_claim` (migracja 21 z backfillem); pole DTO
    `dutyStart` → `claimedAt`. Przy okazji: walidacja payloadów nie znała `leg_close`,
    więc potwierdzenia wzlotów wracały jako `400 bad_payload` - cały etap C nie miał
    jak się zsynchronizować.
  - **D3 ✅** karta arkusza = DOBA SAMOLOTU (migracja 23): jedna karta na (doba, maszyna),
    operacje jako jej wiersze z kolumną `Operacja`; rewizja per karta, bramka flagi zawężona
    do operacji objętych flagą. Stary eksporter odrzucał KAŻDĄ operację z nowego flow
    (bramka `dutyStart == null → no_preflight`).
  - **D4 ✅** `session_overlap` → `aircraft_overlap` (bramka arkusza) + `pilot_overlap`
    (nakładka grafiku, nowy `server/src/domain/pilotOverlap.ts`), migracja 22.
    Zetknięcie operacji co do minuty NIE jest nakładką - to normalny dzień po §3.6a.
  - **D2 ✅** bramka `400 day_open` **USUNIĘTA** (decyzja 2026-08-07): administrator może
    edytować ZAWSZE. `DayStillOpen` i `reason: 'day_open'` znikły z komendy i query
    korekt, trasa podglądu ma dziś JEDNĄ odmowę (404). Zamiast odmowy jedzie
    `warnings` - `correctionWarnings()` w `admin/correctionCandidate.ts` oddaje miękkie
    naruszenia domeny (`ADMIN_EDIT_SESSION_ACTIVE`, `ADMIN_EDIT_PILOT_WINDOW_OPEN`)
    i w podglądzie, i w wyniku zapisu. Panel rysuje z nich baner nad formularzem
    (`screens/correction/correctionWarnings.ts`), świadomie BEZ pola, z którego dałoby
    się wyprowadzić wyszarzenie przycisku - inaczej bramka wraca tylnymi drzwiami.
  - **D6 ✅** panel pod nowy model. `dutyStart` → `claimedAt` w `admin/` (bez tego panel
    się nie budował). Napisy poszły za nazwami: „duty 6:24" → „zajęty 6:24" na pulpicie,
    „Dzień otwarty" → „Samolot zajęty" na A02, kafel „Czas służby (duty)" na A02a
    zastąpiony przez „Samolot zajęty" (przejęcie → zdanie) - służba należy do PILOTA
    i obejmuje kilka maszyn, więc na karcie JEDNEJ operacji była pomyłką kategorii.
    Kolumna „Dzień" na A02 i A05 niesie teraz godzinę przejęcia, bo dwie zmiany dnia
    dzielą datę, a na A05 także NAZWĘ KARTY (karta = doba samolotu). Skrzynka flag
    rozróżnia `aircraft_overlap` (bramka arkusza) od `pilot_overlap` (grafik pilota).
    Oś zdarzeń pokazuje `noFlightReason` z 09C.
  - **Rozjazd z mockupami `design/admin/` ZAMKNIĘTY 2026-08-08**: mockupy panelu dogoniły
    kod (23 ekrany + `SZABLON.html`), więc `design/admin/` znów jest zatwierdzoną
    specyfikacją i obowiązuje reguła „ekran wdrażamy 1:1". Napisy poszły za modelem
    („zajęty" zamiast „duty", „Samolot zajęty" zamiast „Dzień otwarty"), `leg_close`
    dostał wreszcie plakietkę i wiersz osi zdarzeń, a `ANALIZA.md` sekcje 1–12 jest
    oznaczona jako archiwum decyzji sprzed 2026-08-06. Nazwa `session_overlap` zostaje
    już tylko w narracji historycznej (legenda A03, `index.html`, `ANALIZA.md`).
- **Dane demo i schemat bazy (2026-08-08)** - dwa zadania po etapie D:
  - **Generator demo przebudowany** (`server/scripts/demo/`): `dayStream.ts` → `sessionStream.ts`,
    `DemoDay` → `DemoSession`. (HISTORIA sprzed pivotu - ówczesna operacja miała TABLICĘ
    wzlotów i `leg_close`; od etapu E' pivotu operacja ma JEDEN bieg `DemoRun` z tablicą
    lotów, patrz status na górze.) Payloady NIE niosą klamry służby, jest
    `noFlightReason` (09C), dwie zmiany jednej maszyny w dobie i zetknięcie operacji co do
    minuty. **52 operacje, 6 typów flag na 7 egzemplarzach** - patologie są
    mniejszością (panel ma pokazywać normalny klub, nie klub, w którym wszystko zepsute).
    `pilot_overlap` spadł z 5 do 1 ZAMIERZONEGO; regułę, która to trzyma („pilot z otwartą
    operacją nie siada do innej maszyny"), opisuje docblock `scenario.ts`.
  - **Migracje ZGNIECIONE w jedną bazową** (`SCHEMA_VERSION = 1`). Uzasadnienia z 23
    docbloków przeniesione do komentarzy SQL przy kolumnach; historia pułapek (trzy
    podejścia do `NULLS LAST`, sprostowania `UNIQUE` dziennika eksportu, dwa przesunięcia
    znaczenia karty) do `docs/architektura-panelu-serwer.md` §7.8. Odwołania „migracja N"
    w kodzie przepisane na NAZWY rzeczy; w narracji historycznej tamtego dokumentu zostają.
    Zgniecenie jest wierne: 99 kolumn, 28 indeksów i 19 ograniczeń bez zmian, a
    `test/schema.test.ts` nie zmienił żadnej listy kolumn.
    **Uwaga operacyjna:** baza deweloperska założona przed zgnieceniem ma
    w `schema_migrations` numery do 23. Runner odmawia teraz startu na bazie NOWSZEJ niż
    kod (inaczej po cichu pominąłby kolejną migrację) - naprawa to
    `DELETE FROM schema_migrations WHERE version > 1`, nie migracja: schemat jest identyczny.

**Strażnik zgodności ZDJĘTY 2026-08-10 decyzją użytkownika.** Aplikacja nie jest nigdzie
wdrożona, więc: zgodność ze strumieniami `schema_version` 1/2 wylatuje z domeny W CAŁOŚCI
(wersja wraca do 1), kanoniczny dzień 22 JUNE w `projections.test.ts` zostaje PRZEBUDOWANY
pod nowy model (odtąd wzorzec poprawności, nie zgodności), a baz NIE migrujemy - schematy
edytujemy w miejscu, bazę dev kasujemy, `seed` stawia konto admina, resztę świata
zakłada się w panelu (dane demo usunięte przy issue #50).
- Mockupy w `design/` to **zatwierdzona specyfikacja**: ekran RN wdrażamy 1:1 z odpowiadającego pliku HTML, sekcja po sekcji, bez upraszczania. Wątpliwość do mockupu = rozmowa przed implementacją, nie cicha zmiana w kodzie.
- **Gdzie położyć nowy plik** (reguła od 2026-07-31, pełne uzasadnienie w `docs/architektura-kodu.md`):
  warstwa jest osią główną, a wewnątrz `application/`, `http/routes/` i `infrastructure/pg/`
  drugi poziom mówi, KOMU plik służy - `admin/` (tylko panel), `mobile/` (tylko aplikacja
  pilota), `common/` (obie powierzchnie; to twarde znaczenie, nie worek na resztę). Rzeczy
  bez powierzchni tam NIE trafiają: maszyneria Postgresa siedzi w korzeniu `infrastructure/pg/`,
  punkty wejścia w `server/src/bin/`, mapowania w `application/*/mappers/`. W aplikacji:
  komponenty w `ui/components/<sekcja>/` (osiem sekcji zgodnych z barrelem), czysta logika
  ekranów w `ui/screens/logic/`. Przenosisz plik - zaktualizuj ścieżki w `server/test/architecture.test.ts`, bo egzekwuje reguły PO ŚCIEŻCE.
- Architektura kodu i przepisy (nowy typ zdarzenia / reguła / ekran): `docs/architektura-kodu.md` (tam też zaległości audytu serwera). Po zmianach w `app/`: `npx jest` i `npx tsc --noEmit`; po zmianach w `server/` lub `packages/*`: `npx vitest run` i `npx tsc --noEmit` w `server/` - wszystko musi przechodzić. Zmiana w `packages/` dotyka OBU stron, więc uruchamiaj oba zestawy.
- **Detekcja stanów lotu (kołowanie / start / lądowanie) i wszystkie progi: `docs/algorytm-detekcji.md`.** Zmieniasz cokolwiek w `packages/domain/src/detection/` - zaktualizuj ten dokument w tym samym commicie. Progów NIE stroimy „na wyczucie": służy do tego `server/scripts/replay.ts` na nagraniach ze śladu kalibracyjnego.
- **Katalog lotnisk mapy śladu i jego licencje: `docs/dane-lotnisk.md`.** Dane składa generator `packages/domain/scripts/` z dwóch źródeł: OurAirports (domena publiczna) uzupełnione o pasy z OpenStreetMap (ODbL - stąd atrybucja przy mapie i katalog udostępniony na tej samej licencji). **AIP PAŻP jest ODRZUCONY** do czasu pisemnej zgody agencji - jej copyright policy zabrania użycia „w innej formie"; nie proponuj go ponownie. `packages/domain/src/airfields.ts` jest GENEROWANY - poprawki wchodzą przez generator i regenerację, nie ręczną edycją.
- `design/PLAN.md` nie jest już aktywną checklistą (został backlog UX). Reguły designu niżej nadal obowiązują przy każdej zmianie mockupów.

## Design system (`design/*.html`)

### Kolory (zawsze używaj tych zmiennych CSS)
```css
--green: #2ECC71      /* silnik running, status OK, główny akcent */
--amber: #F39C12      /* paliwo, ostrzeżenia */
--red:   #E74C3C      /* stop engine, zakończenie, błędy */
--blue:  #3498DB      /* UTC, informacje */
--bg:    #0D0D0D      /* tło główne */
```

**W MOTYWIE JASNYM (`solar`) AKCENTY SĄ INNE I DOBIERANE RACHUNKIEM** (uwaga
z urządzenia, 2026-09-04: „w jasnym motywie czerwony i zielony mało się wyróżniają,
wyglądają raczej jak czarny"). Skarga NIE dotyczyła kontrastu - ten był aż nadto
wysoki (zieleń 6,25, czerwień 8,99 wobec bieli, przy progu AA 4,5) - tylko
KOLOROWOŚCI: barwa niesie w tej aplikacji znaczenie (zielony = w normie, czerwony =
błąd, bursztyn = uwaga), a przy jasności 22-30% wszystkie cztery czytały się jak czerń.
- **metoda**: w obrębie odcienia marki (ten sam hue, co w Night) bierzemy MAKSYMALNĄ
  chromę CIELAB, jaka mieści się w kontraście ≥4,5 wobec tła I wobec karty. Nowe
  wartości: `green #027E2B`, `amber #A25A01`, `red #D02A1E`, `blue #0069D1`
- **próg trzyma test** (`app/src/__tests__/themeContrast.test.ts`) i to on jest miejscem
  na kolejną taką uwagę: dolna granica broni czytelności, GÓRNA (kontrast ≤6,0 na bieli)
  broni barwy - na starej palecie wywracały się trzy kolory z czterech
- **zieleń zyskuje najmniej i to jest fizyka**: kanał zielony waży w luminancji 0,7152,
  więc każde rozjaśnienie natychmiast zjada kontrast. Czerwony (0,2126) i niebieski
  (0,0722) mają dużo więcej miejsca
- **ten sam kolor bywa TŁEM przycisku `solid`**, na którym napis ma kolor `bg` (w jasnym
  motywie biały) - czytelność napisu i czytelność koloru jako tekstu to ta sama liczba.
  Rozjaśnianie „aż będzie ładnie" psuje oba naraz

### Czcionki
- `Bebas Neue` - nagłówki display, timery duże, canvas labels
- `Archivo` - body text, etykiety, przyciski
- `JetBrains Mono` - cyfry timerów, kody ICAO, wartości GPS, kody pilotów

### Ikona aplikacji = ZNAK Z EKRANU LOGOWANIA PANELU (2026-09-04, monogram od 2026-09-10)
Monogram `9` (`BrandMark` w `admin/src/ui/components/icons.tsx`) w `--green` na
ciemnozielonym tle z poświatą - ten sam znak, który stoi w plakietce `.login-badge`
panelu. Jedna marka na dwóch powierzchniach, więc znaku NIE rysujemy drugi raz.
- **`BrandMark` to ZNAK, `PlaneIcon` to IKONA FLOTY** i od issue #103 są to dwie różne
  rzeczy. Do 2026-09-10 samolot był jednym i drugim naraz, więc podmiana znaku zabrałaby
  samolot listom maszyn i dziennikowi
- **cyfra jest geometryczna, nie wzięta z kroju**: oczko o promieniu 6,1 z obwodem
  grubości 3,3 i ogon tej samej szerokości, więc jego lewa krawędź siada na okręgu
  wewnętrznym, a prawa jest pionową styczną do zewnętrznego. Bebas Neue jest za wąska na
  monogram - w 48 px faviconu oczko zlewałoby się z obwodem
- **znak ma DZIURĘ, więc generator wypełnia regułą niezerowego nawinięcia**: parzystość
  przecięć (którą rysowało się samolot) wycina każdy obszar objęty dwoma konturami, a tu
  drugi kontur ma wyciąć TYLKO oczko. Dziurę robi jego przeciwny kierunek
- **pliki w `app/assets/` są GENEROWANE** (`npm run icons` → `app/scripts/build-icons.js`):
  `icon.png` 1024, para adaptive Androida (`foreground` na 40% boku - bezpieczna strefa,
  `background` = sam gradient), `monochrome` 432 BIAŁĄ sylwetką (system barwi ją sam),
  `favicon.png` 48, `brand-mark.png` 256 dla komponentu `Brand` ORAZ `site/src/favicon.png`
  (jedyny plik pisany poza `app/assets/` - do 2026-09-10 był ręczną kopią, czyli drugim
  znakiem czekającym na rozjechanie się z pierwszym). Poprawka wchodzi przez generator
  i regenerację, nie ręczną edycją PNG - ta sama reguła, co przy katalogu lotnisk
  (`packages/domain/scripts/`)
- **znak w aplikacji jedzie OBRAZKIEM, nie cyfrą złożoną krojem display**: RN nie ma
  renderera SVG (projekt nie dokłada modułów natywnych), a cyfra napisana drugi raz
  byłaby drugim znakiem marki. `brand-mark.png` jest BIAŁY i barwi go `tintColor`, bo
  zieleń różni się między motywami (`#2ECC71` w ciemnym, `#027E2B` w jasnym) - znak
  zapieczony w kolorze ciemnego motywu zniknąłby w słońcu
- **bez zależności i bez modułu natywnego**: rasteryzacja wielokąta z antyaliasingiem
  (poziomo analitycznie, pionowo 8 podwierszy) i koder PNG na `zlib` ze stdlib. Sharpa
  ani ImageMagicka w tym repozytorium nie ma i nie dokładamy ich dla siedmiu plików
- **ścieżkę SVG trzyma generator, nie import z panelu**: `admin/` jest osobnym modułem
  z TSX, a skrypt ma działać gołym `node`. Zmiana `BrandMark` w panelu wymaga więc
  przeniesienia geometrii ręcznie (stała `NINE` w generatorze) - jedyny koszt tego
  rozwiązania i dlatego stoi tu zapisany
- **ikona zapieka się w APK**: podmiana widać dopiero w nowym buildzie EAS, w Expo Go
  nie zmieni się wcale
- **podgląd `design/IKONA.html` też jest GENEROWANY** (`app/scripts/build-icon-preview.js`):
  ekran główny telefonu, cztery maski launcherów, motyw ikon Androida 13+ i rozmiary
  rzeczywiste - z obrazami wklejonymi DATA URI, więc strona nie ciągnie niczego spoza
  siebie. To jedyny plik w `design/`, który NIE JEST specyfikacją: tu kod prowadzi
  obrazek, a podgląd ma pokazywać to, co naprawdę leży w `app/assets/`

### Phone frame (`design/*.html` - aplikacja pilota)
Każdy mockup używa ramki telefonu 393×852px (iPhone 14 Pro) z `--phone-scale` do auto-skalowania.
Struktura: `.canvas-label` → `.phone` (z Dynamic Island `::before`) → `.nav-strip`

### Browser frame (`design/panel/*.html` - panel 2.0)
> **PANEL WRACA DO DESIGN-FIRST** (decyzja właściciela 2026-09-07, odwraca zapis
> „panel 2.0 nie ma makiet"): najpierw powstaje makieta HTML, potem kod - ta sama reguła,
> co w aplikacji pilota. Uzasadnienie i historia: `docs/panel-2.0.md` §3.7.
> **`design/admin/` (23 pliki) zostaje ARCHIWUM panelu 1.0** i nie jest specyfikacją.

Panel to **aplikacja web**, więc ramką jest okno przeglądarki 1440×900 z `--app-scale`
(działa dokładnie jak `--phone-scale`) i paskiem chrome zamiast Dynamic Island.
Struktura: `.canvas-label` → `.browser` (`.chrome` → `.shell`: `.topbar` + `.workspace`
= `.sidebar` + `.content > .page`) → `.nav-strip`. Od stylu lekkiego (issue #107, sekcja
niżej) rama to pasek górny z marką i zalogowanym ORAZ kolumna boczna z kontekstem klubu
i pozycjami modułów.
- **nowy ekran panelu zaczyna się od skopiowania `design/panel/SZABLON.html`** - tam stoi
  kanoniczna rama (pasek, kolumna, okruszki) i INWENTARZ komponentów (tabela, plakietki,
  chipy filtrów, szuflada, karta, baner, stan pusty, plamki ładowania)
- **arkusz makiet `design/panel/panel.css` jest GENEROWANY** (`npm run panel:css`
  w `admin/`): składa się z arkuszy `admin/src/styles/` w kolejności kaskady z `main.tsx`
  plus `design/panel/rama.css` (kanwa, okno przeglądarki, inwentarz - klasy, których panel
  nie ma). Nowy komponent dokłada się do `admin/src/styles/components/*.css` i uruchamia
  generator - makieta i panel widzą go w tej samej chwili. Równość pilnuje
  `admin/test/panelCss.generated.test.ts`. Ręczna poprawka w `panel.css` znika przy
  najbliższym przebiegu - to nie jest miejsce na edycję
- **makiety panelu ilustrują podręcznik**: strony panelu w `docs/podrecznik/` osadzają je
  dyrektywą `@panel` (ramka okna przeglądarki), tak jak strony aplikacji osadzają `@screen`
- panel ma JEDEN motyw (`night`) i nie ma przełącznika - jasny istnieje dla kokpitu
  w słońcu, a administrator siedzi przy biurku

### Styl lekki panelu (issue #107, 2026-09-08)
Zgłoszenie: „migrować wygląd panelu admina do stylu lekkiego, jak ma GitLab; przepisać
obecne widoki i pliki design; wszystkie późniejsze w zadanym stylu". Pełne decyzje
i uzasadnienia: **`docs/panel-2.0.md` §3.8**. Reguły obowiązujące KAŻDY nowy ekran panelu:
- **kolory bez zmian** (decyzja właściciela: „kolory możemy zachować te co mamy") -
  tokeny `night`, zero nowych zmiennych, zero literałów koloru w `admin/src/styles/`.
  Lekkość wychodzi z układu i typografii, nie z palety
- **treść jest WARSTWĄ WYŻEJ** (uwaga właściciela: „główny kontent w oknie o zaokrąglonych
  krawędziach, jakby warstwa wyżej"): pasek i kolumna NIE są sekcjami z liniami, tylko
  jednym tłem na `--bg`; `.content` to kontener na `--surface` z oboma górnymi rogami
  zaokrąglonymi, włosem na trzech krawędziach i odstępem od prawej krawędzi okna, dołem
  dociągnięty do krawędzi (tam jest przewijanie). Karty i tabele na tej warstwie rysuje
  sama ramka; szuflada w tonie treści. Tło chrome'u ma LEKKI GRADIENT (`--chrome-bg`
  w `layout.css`: zielona poświata przy znaku + `--bg-tint` gasnące w `--bg`, same
  tokeny) - pasek i kolumna są przezroczyste, maluje go korzeń; logowanie przepuszcza
  ten sam gradient zamiast mieć własny
- **rama = pasek 48 px (marka + zalogowany) i kolumna 240 px** (`.sidebar`: kontekst klubu
  `.sidebar-context` nad płaską listą `.nav-item` z ikonami; pozycje w `ui/shell/nav.ts`,
  ikony jako KLUCZE - moduł zostaje czysty). Rama superadministratora: `.sidebar-context.scope`
  + jedna pozycja. Wyszukiwarki w pasku NIE MA - byłaby afordancją bez funkcji
- **okruszki (`Breadcrumbs`) WYŁĄCZNIE pod innym ekranem** - dziś dziennik od poziomu
  maszyny w dół, w miejsce „← Dziennik". Na liście modułu okruszek opisywałby jedno
  kliknięcie w kolumnie obok
- **Bebas Neue tylko w marce i na logowaniu.** Tytuły stron, kart i szuflad: Archivo 600
  w PISOWNI ZDANIOWEJ („Dziennik", nie „DZIENNIK"). Etykiety, nagłówki tabel, `.kv-k`,
  `.cell-sub`, `.opt-desc`: krój tekstowy, nie mono-wersaliki. Mono zostaje przy wartości
  MASZYNOWEJ (liczby, kody, sygnatury, e-maile - `.cell-sub.mono`). Plakietki bez ramki,
  bez wersalików, z wielkiej litery - napis w kodzie pisze się już z wielkiej
- **zaznaczenie jest odwrócone** (jasne tło, ciemny napis): aktywna pozycja kolumny
  i włączony chip. Zieleń = stan w normie, akcja główna, ramka zaznaczonej karty wyboru
- **lżejsze komponenty**: promienie 6–8 px, przycisk 32 px (`ghost` bez ramki, `danger`/`ok`
  obramówką), pole 34 px z pierścieniem fokusu, nagłówek tabeli na tle wierszy, szuflada
  na `--bg` z lekkim cieniem, logowanie bez poświaty, stopień bazowy 14 px
- **`td.cell-sub` ma `display: table-cell`** - klasa bywa klasą całej komórki (kolumny
  „E-mail", „Kiedy") i `display: block` wyjmowało ją z wiersza (usterka z 2.0 naprawiona
  przy okazji)
- **WYBÓR Z DŁUGIEJ LISTY IDZIE NATYWNYM `<select>`** (decyzja właściciela 2026-09-20,
  przy kalendarzu 3.0.0) - to JEDYNY wyjątek od reguły „zawsze lista kart" i obowiązuje
  WYŁĄCZNIE w panelu. Tamta reguła powstała dla telefonu: kciuk w rękawicy, słońce,
  wybór spośród kilku maszyn. Panel to mysz i biurko, a klub z dwunastoma maszynami
  dostałby dwanaście kart w szufladzie. Granica jest w DŁUGOŚCI listy, nie w powierzchni:
  zbiór ZAMKNIĘTY i krótki (powód wyłączenia z użytku, rodzaj operacji, rola) zostaje
  listą kart `OptionButton` także w panelu, bo tam widoczność wszystkich opcji naraz jest
  całą wartością. Zbiór rosnący z klubem (maszyna, pilot) dostaje `<select class="input">`,
  tak jak rysują to makiety `design/panel/kalendarz-*.html`

Tokeny, czcionki i wszystkie reguły niżej obowiązują tak samo - inne urządzenie, ten sam produkt.

### Czas zdarzenia - JEDNA kontrolka (2026-08-14)
Ustawienie godziny zdarza się w pięciu arkuszach (korekta czasu 10e, odczytu 10f, zrzutu
10g, dopisanie wpisu 10h, wpis ręczny z kokpitu 05f) i do issue #43 każdy składał ją sam.
Efekt po pięciu kopiach: jedna nie pozwalała wpisać godziny, druga miała zbędny rząd
±10 min, trzecia pisała na przycisku **„+60000"** (krok jest w milisekundach, tylko nikt
go nie nazwał). Odtąd jest **`components/input/TimeStepper.tsx`** i ona ustala:
- **krok to MINUTA i tylko ona** - dalszy skok wpisuje się, a nie odklikuje
- **godzinę da się WPISAĆ z klawiatury** (tapnięcie w wartość; przerywana kreska pod nią
  jest jedynym znakiem afordancji). Maska stawia dwukropek, a dzień bierze się
  z poprawianego zdarzenia - `timeStepperEdit`, nie „dzisiaj"
- **podpis mówi, o ile przesunięto** względem wartości pierwotnej (`timeShiftHint`),
  także przy zmianie zerowej: pilot, który wrócił do punktu wyjścia, musi to widzieć
- **bez podkreślenia pod wartością** - przerywana kreska „zapraszająca do wpisu"
  wyglądała jak usterka rysowania; godzina jest największym elementem kontrolki, więc
  palec i tak ląduje na niej sam
- **przycisk kroku rośnie z napisem**: 46 dp to MINIMUM celu dotykowego, nie sztywna
  szerokość - przy `width: 46` napis „+1 min" łamał się na dwie linie
- **JEDEN wygląd, bez parametru tonu**: kontrolka jest neutralna wszędzie. Bursztyn
  w korekcie odczytu, błękit w zrzucie i zieleń w korekcie czasu niosły ton ARKUSZA,
  a nie stan wartości - ta sama czynność ma wyglądać tak samo
- **podpis „o ile przesunięto" pojawia się TYLKO przy zmianie**, a miejsce na niego jest
  zarezerwowane: „bez zmiany względem wpisu (09:01)" opisywało stan widoczny w kontrolce
  nad nim, a wskakiwanie i znikanie zdania przesuwało resztę arkusza
- arkusz podaje wyłącznie to, co go RÓŻNI: etykietę, granice i ewentualną stopkę.
  Nowy krok, nowa nazwa kroku ani własna para przycisków ± nie wchodzą do arkusza -
  wchodzą do `TimeStepper`
- **rozszerzone przy issue #62** (sekcja niżej): godzina bywa PUSTA (`value: number | null`
  - koniec z podstawianiem 10:00), separator wpisu jest wolny (kropka i przecinek znaczą
  dwukropek), przesunięcie ponad godzinę mówi w godzinach, czas lokalny rysuje SAMA
  kontrolka (`localTime`), a krok ± liczy się od wpisu w toku, nie od wartości sprzed
  otwarcia klawiatury

### Wzorzec formularzy
- Pola input: `background: var(--surface-raised)`, `border-radius: 12px`, focus = `var(--green-border)`
- **Placeholder ma własny token `--text-placeholder`** (o stopień słabszy niż `--text-muted`,
  uwaga z urządzenia 2026-08-14). To instrukcja, nie treść: w `textMuted` konkurowała wagą
  z wpisaną wartością obok i puste pole wyglądało jak wypełnione. Stopnia pisma nie
  różnicujemy - `placeholder` dziedziczy go z pola i inaczej się nie da, więc cała
  różnica siedzi w kontraście. Po dołożeniu koloru do palet: `npm run tokens:css` w `admin/`
- Dropdowny jako lista kart do wyboru (nie natywny `<select>`) - widoczne opcje, zaznaczona = zielona obramówka
- Operacje/typy jako siatka kart z ikonami
- **Pole wpisu w arkuszu otwiera się z KURSOREM NA KOŃCU wartości, nie z zaznaczoną
  całością** (uwaga z urządzenia, 2026-09-02, arkusz oleju): sterowane „zaznacz
  wszystko" trzymane aż do pierwszej cyfry przywracało się przy każdym odświeżeniu
  pola i nie dawało postawić kursora tapnięciem. Sterowanie zaznaczeniem jest
  jednorazowe i oddaje się polu, gdy doniesie zadaną pozycję - mechanika i historia:
  `components/sheets/sheetSelection.ts` + `docs/architektura-kodu.md` §2 (tam też
  reguła `useSheetInputFocus`: klawiatura wchodzi razem z arkuszem)

### Arkusz (popup) - jedna rama dla wszystkich (2026-08-14)
Arkusz wysuwany od dołu jest **wstawką NAD ekranem i musi to być widać**: nad nim zostaje
pas przyciemnionego tła (`SHEET_TOP_GAP` = 56 dp ponad bezpiecznym obszarem), a treść
przewija się WEWNĄTRZ arkusza - skraca się to, co pilot doczyta przewinięciem, nie rząd
akcji. Arkusz bez sufitu dobijał do samej góry telefonu i czytał się jak nowy ekran.
- w kodzie rama to **`components/sheets/SheetSurface.tsx`** (Modal + tło + panel + sufit
  + obszar przewijania + `pinned` na akcje). Nowy arkusz zaczyna się od niej - nie od
  kopii `Modal`+`Pressable`+`View`, bo właśnie te kopie gubiły sufit
- geometria (`sheetMaxHeight`, `sheetBottomPad`, `SHEET_TOP_GAP`) mieszka w
  `ui/hooks/keyboardGeometry.ts` i ma testy: to jedyna część arkusza sprawdzalna bez
  urządzenia, a psuła się już czterokrotnie
- w mockupach ta sama reguła to `max-height: calc(100% - 56px)` + `overflow-y:auto`
  na `.modal-sheet`
- **KLAWIATURA ARKUSZA NIE JEST KLAWIATURĄ EKRANU** (uwaga z urządzenia, 2026-09-04:
  „czasem jak mam na manualnym locie przejście na ekran z przebiegiem operacji, to tak
  jakby dwa razy muszę kliknąć DALEJ"). Zdarzenia klawiatury są w RN GLOBALNE, a arkusz
  żyje we własnym oknie - więc `Screen` pod spodem kurczył się o wysokość klawiatury,
  której u siebie nie ma, i dociągał listę (`useKeyboardAwareScroll`). Rachunek płacił
  się przy ZAMYKANIU: `keyboardDidHide` pada na Androidzie dopiero po animacji chowania
  (~300 ms), więc ekran stał jeszcze skrócony, pilot tapał „DALEJ" tam, gdzie go widział,
  layout w tej samej chwili wracał na miejsce - i tapnięcie lądowało w pustce. Odtąd
  `SheetSurface` zgłasza obecność na czas życia OKNA (`hooks/sheetPresence.ts` - LICZNIK,
  bo zamykany arkusz i otwierany następny nachodzą na siebie), a `Screen` czyta
  `useOwnKeyboardHeight`: pożyczoną klawiaturę oddaje dopiero, gdy naprawdę zniknie
  (reguła `keyboardBorrowedBySheet` w `keyboardGeometry.ts`, z testem sekwencji).
  Objaw widać było najwyraźniej na kroku 2 wpisu ręcznego, bo tam arkusz wchodzi
  z klawiaturą sam, a „DALEJ" stoi tuż pod ostatnią kartą - ale mechanizm dotyczył
  KAŻDEGO ekranu z arkuszem i dlatego poprawka siedzi w ramie, nie w ekranie

### Nawigacja i warianty mockupów (obowiązuje każdy nowy/zmieniany ekran)
- Każdy plik: nav-strip z linkami do sąsiadów + karta w `index.html` (warianty literowe → sekcja "Warianty i stany")
- Ekran mający warianty → **panel „Warianty tego ekranu" na canvasie pod telefonem**: linki do całej rodziny + opis KIEDY dany wariant się wyświetla; bieżący ekran z tagiem „ten ekran"; badge amber dla stanów offline/warning. Wzorzec: `00-login.html`, `02-preflight.html`
- Po zmianach: zero martwych linków (sprawdzaj greppem po `href`)

### Nagłówek ekranu (issue #23 pkt 7 - jeden wzorzec dla całej aplikacji)
Tytuł i podtytuł wyrównane **DO LEWEJ**, ustawienia (zębatka) zawsze **PO PRAWEJ** -
za pillem łączności, na skraju. Układ wyśrodkowany zostaje wyłącznie dla kroków
formularza z powrotem („Wróć" ← tytuł → badge kroku). Nie projektuj ekranu z zębatką
po lewej ani tytułem na środku bez powrotu - 01 był takim wyjątkiem i przestał nim być.

## Strefa czasowa
**UTC jest domyślnym czasem wszędzie** - log samolotu, operacje dnia, T/O, LDG, tankowanie, arkusz. Czas nieoznaczony = UTC.
LT nie pojawia się już nigdzie: jedynym miejscem był meldunek klamry służby na `01`, usunięty razem z klamrą (issue #23).
Logi i tabele oznaczaj jawnie („Log dnia · UTC", „Lista lotów · czasy UTC").

## Screen flow (zakładki od 3.0.0; model operacji 2026-08-10, bez klamry od issue #23)
```
00-login → ZAKŁADKI: 20-pulpit · 21-kalendarz · 24-historia (EKRAN DOMOWY; flow lotu
  leży NAD nimi, kokpit zakładek nie ma - patrz „epik R-E" niżej)
20-pulpit (sumy doby + najbliższa rezerwacja; warianty: 20a bez rezerwacji,
  20c offline + arkusz synchronizacji, 20d SYNC STOI)
20-pulpit → 02-samolot → 02e-zadanie → 02a-liczniki → „ROZPOCZNIJ LOT"
  (rezerwacja na TERAZ wypełnia krok 1; 23a ostrzega o cudzym planie, nigdy nie blokuje)
→ 04a-kokpit PRZED URUCHOMIENIEM (tankowanie / załadunek skoczków w dniu skokowym /
  zmiana załogi / zdanie bez lotu 09c)
→ START ENGINE → 05-cockpit-running (wiele startów i lądowań = LOTÓW w jednej operacji)
→ STOP ENGINE → 04-kokpit PO ZATRZYMANIU (hero = ZDAJ SAMOLOT; tankowanie nadal;
  drugiego START ENGINE NIE MA - kolejny lot to nowe przejęcie)
→ 09b-zdaj-samolot (odczyty paliwa i MH OBOWIĄZKOWE = zatwierdzenie logu operacji;
  wariant 09c: zdanie bez lotu) → 20-pulpit
20-pulpit → 15-reczny-lot (wpis CAŁEGO lotu po fakcie - STEPPER 4 kroków od
  2026-08-16: 15 data+samolot+Dual (data pierwsza - issue #58) → 15a zadanie →
  15b czasy i loty → 15c liczniki; arkusze: 15d czas zdarzenia na TimeStepperze,
  15e data lotu na KALENDARZU miesięcznym)
24-historia (WSZYSTKIE operacje - dziś i wcześniej; dzień nagłówkiem, archiwum
  zwinięte w 24a); WIERSZ operacji → 10-statystyki (detale i korekty TEJ operacji)
24-historia → wiersz w oknie 24 h → 10-statystyki; wiersz po oknie → 10b (ten sam
  ekran w trybie PODGLĄDU: bez „Edytuj dane")
21-kalendarz → wolne pasmo → 22/22a (rezerwacja w dwóch krokach; 22b arkusz czasu,
  22c termin zajęty) · pasek zajętości → 23 (karta rezerwacji: przesunięcie i odwołanie)
10-statystyki → „EDYTUJ DANE" → 10d (TRYB EDYCJI tego samego ekranu - issue #43;
  ołówek przy każdym wierszu osi, arkusze: 10e czas zdarzenia · 10f paliwo i MH przy
  przejęciu/zdaniu · 10g zrzut · 10h dodaj wpis · 10i historia zmian)
  · PLAKIETKA WERDYKTU → 10c (arkusz normy)
04-kokpit PO ZATRZYMANIU → kafelek „Popraw dane operacji" → 10d → powrót do KOKPITU
  (jedyne wejście w edycję sprzed zdania samolotu; kokpit jest modalny)
EKRANÓW 08 I 04C NIE MA (usunięte 2026-08-13, issue #43) - lista ręczna była drugim
  widokiem tej samej operacji, a arkusz korekty żyje dalej jako 10e
10-statystyki → MINIATURA ŚLADU → 14-slad (pełny ślad CAŁEJ operacji: kołowanie,
  wszystkie starty i lądowania, profil pionowy z przerwą na ziemi).
  EKRANU 16 NIE MA (usunięty 2026-08-12, issue #38) - szczegóły pojedynczego lotu
  wróciły na oś czasu operacji, bo dublowały ekran wyżej
EKRANU 11 NIE MA (usunięty 2026-08-12) - stan wysyłki, uwagi serwera i awaryjne
  „Synchronizuj teraz" to SEKCJA w Ustawieniach (13); kolejkę i ostatnią wysyłkę
  pokazuje też arkusz pod SyncChipem
```
**Wszystko wraca na PULPIT, nie do kokpitu.** Dzień pilota nie ma „startu" ani „końca" jako
kroków flow: zaczyna się pierwszą operacją i NICZYM się nie domyka - „Zamknij dzień",
ekran 01b i klamra służby zostały usunięte (issue #23). Wyjście działa też offline -
niepusty outbox nigdy nie więzi pilota na ostatnim ekranie (§4.1).

### Kokpit jest stanem modalnym (decyzja 2026-08-10)
**Dopóki pilot trzyma samolot, z kokpitu nie ma wyjścia bokiem** - z 04/05 nie prowadzi
żadna droga na Pulpit - paska zakładek w kokpicie NIE MA. Maszynę oddaje się przez „Zdaj samolot" (09b) i to ona wraca na Pulpit;
akcje ground (06/07/08) i 09 wracają do kokpitu. **Od issue #82 nie ma już ani jednego
wyjątku**: ustawienia (13) były ostatnim i zniknęły z paska kokpitu - zębatka stoi
wyłącznie na Pulpicie, a w jej miejscu pilot ma przełącznik jasności (sekcja niżej).
Konsekwencje przy każdej zmianie kokpitu:
- **nie dokładaj linków na Pulpit** - ani paska, ani przycisku, ani wpisu w nagłówku. Pasek
  operacji `ClaimStrip` z linkiem „Mój dzień →" był jedyną taką drogą i został USUNIĘTY
  z 04/04A (żyje wyłącznie w 04B, gdzie opisuje CUDZĄ maszynę i nie prowadzi nikąd)
- z tego samego powodu kokpit nie powtarza tego, co mówi już pasek górny (maszyna, trasa)
  ani nagłówek logu dnia (liczba cykli) - 04A pokazywał tak „jeszcze żadnego wzlotu"
  jako trzecią deklarację braku na jednym ekranie
- **ta sama reguła dotyczy paliwa**: litry stoją na 04 w JEDNYM miejscu. Pasek „Paliwo ·
  ostatni odczyt" pojawia się tylko wtedy, gdy jest przyrządem (jest norma → jest szacunek
  wystarczalności, ton ostrzeżenia i adnotacja o źródle); bez normy paska nie ma i FOB
  niesie podpis kafelka „Tankowanie". Podział ról ma test i mieszka w
  `app/src/ui/screens/logic/cockpitFuel.ts` - nie rozstrzygaj tego w JSX
- **kafelek „Dolej olej" niesie STAN silnika, nie konfigurację** (uwaga
  z urządzenia, 2026-09-03: „zamiast «Minimum x L» napisz jak dla paliwa
  «W silniku x L»"): podpis = pomiar z przejęcia + dolewki
  (`projection.oil.afterL`), analogicznie do „Na pokładzie" przy paliwie;
  minimum mówi podziałka na 02A i ostrzeżenia. Bez pomiaru w strumieniu (stary
  zapis) podpis wraca do „Olej silnikowy" - liczby nie zmyślamy
- **PO uruchomieniu silnika litry kokpitu są SZACUNKIEM i mówią to** (kolejna
  tura: „jak silnik został uruchomiony, mamy tylko szacunki - «W silniku około»,
  «Na pokładzie około» - i co jakiś czas odświeżamy wartości"): przed pierwszym
  biegiem wartości są odczytami (bez „około"); po nim FOB liczy `estimateFob`
  (ta sama logika, co 06/09B - wypiera nieaktualny odczyt i zasila pasek paliwa,
  wystarczalność, ton i komórkę „Fuel on board" w locie), olej `cockpitOilSub`
  (`logic/cockpitOil.ts`: pomiar + dolewki − norma oleju × czas pracy silnika).
  Odświeżanie CO 5 MINUT, nie co sekundę (trzecia tura: „wystarczy co 5 minut") -
  zegar szacunków to sekundowy tick skwantowany do kubełka `ESTIMATE_REFRESH_MS`,
  a memo przelicza rachunek dopiero przy zmianie kubełka; drobniejszy krok
  udawałby precyzję, której szacunek nie ma (5 min ≈ nieco ponad litr przy
  typowej normie). Po zgaszeniu silnika wartości zamierają same (czas pracy
  stoi). Bez normy zostaje ostatni zapis z „około" - dopisek mówi wtedy
  o niepewności bez rachunku; `buildCockpitFuel.estimated` i `cockpitOilSub`
  mają testy
- **reguła obowiązuje też przycisk sprzętowy** (wdrożone 2026-08-10): kokpit trzyma
  `usePreventRemove(holdsAircraft(projection), …)` i zamiast wyjścia pokazuje arkusz 04d
  („TRZYMASZ SP-AXA" → ZOSTAŃ / ZDAJ SAMOLOT). `usePreventRemove`, nie `BackHandler`,
  bo obejmuje także gest cofania krawędzią. Warunek pyta o TRZYMANIE maszyny, nie
  o istnienie operacji - inaczej zablokowałby powrót 09B → 01, który w stosie zdejmuje
  kokpit. Blokada bez komunikatu jest zakazana (§6 pkt 3: przycisk, który nic nie robi,
  wygląda jak zawieszona aplikacja)

## Operacja = jeden bieg silnika (decyzja 2026-08-10)
Story użytkownika zdefiniował model na nowo; częściowo odwraca §3.6a z 2026-08-06:
- **operacja** = od URUCHOMIENIA do ZATRZYMANIA silnika - dokładnie jeden bieg na operację.
  **Lot** = od startu do lądowania; w jednej operacji wiele lotów (w tym touch and go).
  Słowo **„wzlot" jest WYCOFANE** ze słownika - zlało się z operacją.
- po STOP ENGINE **nie ma drugiego startu**: hero kokpitu zmienia się w „ZDAJ SAMOLOT"
  (09b). Kolejny lot = NOWE przejęcie (02 → 02e → 02a).
- odczyty paliwa i MH przy zdaniu są **OBOWIĄZKOWE** i są zatwierdzeniem logu operacji;
  trafiają do logu jako kolejne wpisy. `leg_close` znika z domeny, ekrany 09 i 09a
  znikają z designu, 09c (zdanie bez lotu - pogoda/usterka) zostaje wariantem 09b.
- tankowanie mieszka w kokpicie: PRZED uruchomieniem i PO zatrzymaniu (przed zdaniem).
  Zmiana załogi tylko PRZED uruchomieniem - po biegu nowa załoga = nowe przejęcie.
- kokpit pokazuje WYŁĄCZNIE bieżącą operację - bez „Log dnia", bez „CYKL n", bez harmonijki
  wielu cykli. Kokpit pozostaje stanem modalnym (sekcja wyżej).
- na Pulpicie sumy doby i najbliższa rezerwacja; lista operacji (różne zadania, różne maszyny) w Historii (24), a ręczny wpis CAŁEGO lotu (15) z Pulpitu.
- zysk uboczny analityki: każda operacja domknięta odczytami z OBU stron - znika patologia
  interwałów degeneracyjnych między ostatnim `leg_close` a zdaniem (§3.6b).

## Sygnatura operacji lotniczej (issue #68, 2026-09-01)
Zgłoszenie: „brakuje nam nazwy operacji - wyświetlamy w różnych miejscach guid".
Uuid nadaje się do ADRESOWANIA (klucz w bazie, ścieżka w panelu, cel korekty) i do
niczego więcej: `7c1e5a9b-…-83b4` nie da się przeczytać przez telefon administratorowi,
wpisać w zgłoszenie ani znaleźć wzrokiem na liście.

    SP-AXA/2026-09-01/BNO/1
    └ znak  └ doba     └ PIC └ która operacja tego pilota w tej dobie

- **SKŁADA JĄ DOMENA** (`packages/domain/src/signature.ts`: `operationSignature`,
  `operationIndexes`) i **liczy się przy każdym wyświetleniu**, jak czas blokowy.
  Zapisana w `session_claim` byłaby drugą kopią na drucie: wpis ręczny dopisany PRZED
  istniejącą operacją tej samej doby przenumerowuje ją, a zapisany numer wskazywałby
  po tym dwie operacje naraz
- **NUMER TO TEN SAM NUMER, KTÓRY EKRAN 01 PISZE JAKO „OPERACJA n"**
  (`PilotDaySession.index`). Dwa różne numery na jednym kafelku byłyby sprzecznością,
  więc reguła jest JEDNA: operacje TEGO pilota, nieunieważnione, z uruchomionym
  silnikiem; doba i kolejność z chwili uruchomienia
- **NUMERUJE DOBĘ PILOTA, NIE DOBĘ SAMOLOTU** - i to jest warunek offline-first: telefon
  ma wszystkie operacje SWOJEGO pilota w lokalnym rejestrze (§4.1: jeden piszący),
  a operacji cudzych na tej samej maszynie nie ma i mieć nie może. Sygnatura wychodzi
  więc bez sieci, jak reszta danych operacji (§6 pkt 1). Jednoznaczności pilnuje kod PIC
  w środku napisu
- **CZASU W SYGNATURZE NIE MA** i to jest decyzja: korekta czasu (issue #43) przesuwa
  uruchomienie o kilka minut, więc sygnatura z godziną opisywałaby po niej inną operację
  niż przed. Numer porządkowy przeżywa korektę, dopóki nie zmienia kolejności w dobie
- **ZAPIS BEZ BIEGU SILNIKA dostaje sygnaturę TYLKO Z TREŚCIĄ** (issue #75 pkt 3
  rozszerzyło #68): zdanie ze zmienionym odczytem paliwa/MH albo z dolewką numeruje
  się kotwicą PRZEJĘCIA i dopiero po zdaniu (`operationAnchor`
  w `packages/domain/src/operationSubstance.ts` - tam pełna reguła). Zapis bez biegu
  i bez treści numeru nadal nie ma: pusty jest ukrywany w całości (sekcja issue #75
  niżej), niekompletny pokazuje się w historii z kreską, jak przed #68. Granica
  zostaje granicą `projectPilotDay`, bo numer sygnatury MUSI być numerem z ekranu 01
- **SERWER LICZY TEN SAM NUMER SQL-em** (`PgAdminSessionsRepo`, ranga po kolumnach
  projekcji - nie da się jej wypełnić przy zapisie, bo ingest widzi JEDNĄ operację).
  Rozjazd dwóch torów znaczyłby dwie nazwy jednego lotu, więc pilnuje ich test
  krzyżowy `server/test/operationSignature.test.ts` - i to on złapał pierwszą wersję,
  w której operacja unieważniona dostawała numer swojej poprzedniczki
- **PANEL NIGDY NIE SKLEJA SYGNATURY U SIEBIE** - dostaje ją gotową w DTO. Ta sama
  reguła, przez którą nazwę karty arkusza liczy wyłącznie serwer
- gdzie stoi: kafelek operacji (01, 12), nagłówek ekranu 10, potwierdzenie usunięcia
  wpisu (10L), grid i nagłówek DZIENNIKA w panelu, potwierdzenie unieważnienia w panelu,
  **pasek górny KOKPITU** (uwaga z urządzenia, 2026-09-02: pasek pokazywał surowy
  identyfikator maszyny - guid z panelu; sygnatura zastępuje znak, bo się od niego
  zaczyna). Przed uruchomieniem silnika operacja nie ma numeru - pasek 04A pokazuje
  sam ZNAK z cache floty; 04B (cudza maszyna) zostaje przy znaku, bo cudzej sygnatury
  nie da się policzyć offline (numeruje dobę TAMTEGO pilota). Surowego id nie pisze
  żaden nagłówek
- **na ekranie 10 sygnatura JEST tytułem nagłówka I STOI SAMA** (przegląd 2026-09-02,
  w dwóch turach): wiersz „OPERACJA" nad nią powtarzał kategorię, którą sygnatura już
  niesie, i kosztował linię; podtytuł z zadaniem („SKOKI") odpadł drugą uwagą z tego
  samego dnia - „daj tylko sygnaturę, nie ma sensu pisać, jakie to zadanie": rodzaj
  operacji nie identyfikuje lotu, a nagłówek jest od tożsamości. „OPERACJA" ze
  znakiem i datą w podtytule wraca wyłącznie bez sygnatury (operacja niekompletna
  nie ma jej z czego złożyć); `headerIdentity` w `StatsScreen`
- **W KARCIE ARKUSZA SYGNATURY NIE MA** i to nie jest przeoczenie: kolumna `Operacja`
  spina sześć bloków JEDNEGO dokumentu etykietami `S1`, `S2`, a karta jest dobą
  SAMOLOTU - numer z sygnatury (doba PILOTA) nie zgadzałby się z kolejnością zmian
  w tym dokumencie. Rodzaj operacji nazywa się tam odtąd `Zadanie`, jak na 02E i w panelu

## Treść operacji: puste zdania znikają, zmiany dostają numer (issue #75, 2026-09-02)
Cztery uwagi UI; wspólny rdzeń pkt 2 i 3 to **treść operacji** -
`packages/domain/src/operationSubstance.ts` (fakty + `hasOperationSubstance`,
`isEmptyOperation`, `operationAnchor`), lustro SQL w `server/src/infrastructure/pg/substanceSql.ts`,
zgodność torów przybija rozszerzony `server/test/operationSignature.test.ts`.
- **pkt 1 - lot unieważniony przez admina ZNIKA z telefonu.** Łańcuch działał od zawsze
  (`session_void` stemplowany PIC-em pilota → `GET /me/events` → lokalny rejestr →
  `projectPilotDay` filtruje), ale **`buildHistory` (ekran 12) nie filtrował `voided`** -
  lot znikał z 01, a jego karta stała na 12 dalej. Filtr dodany w `historyDays.ts`
  (lista + plakietka wejścia), zgodnie z docblockiem projekcji („wypada z dnia pilota,
  z historii, z sum"). Do tego ręczny sync ciągnie odtąd także zdarzenia
  (`restoreEventsNow`, sekcja Offline-first) - unieważnienie nie czeka do kwadransa
  na bramę wieku. Przy okazji NAPRAWIONE agregaty L1 dziennika (`logRepo`):
  baner na ekranie operacji obiecywał „nie liczy się do sum dziennika", a `LEFT JOIN`
  sumował unieważnione jak każde inne
- **pkt 2 - PUSTA operacja jest śmieciem** (słowa właściciela): zdana, bez biegu, bez
  lotów, z KOMPLETEM odczytów równych przejęciu i bez dolewek. Nie pokazuje jej ŻADNA
  lista - 01, 12, plakietka „można poprawić", dziennik panelu (L1+L2), karta arkusza
  (`dayExporter`). Rejestr zostaje append-only: adres bezpośredni (10 z linku, panel
  L3 po uuid) działa dalej. Ekran 09C ostrzega PRZED zdaniem (amber, Typ B, ze szkicu
  odczytu - gaśnie z pierwszą poprawką; `logic/releaseWarnings.ts`), że „nic nie
  zostanie zapisane, bo nic nie zostało zmienione"; NIGDY nie blokuje - samolot trzeba
  oddać. Plakietka „bez zmian" przy licznikach gaśnie po poprawce (nad zmienioną liczbą
  kłamała). Niebieski status „Zapis zostaje w rejestrze - administrator widzi… Twój
  dzień liczy się dalej" USUNIĘTY (uwaga z urządzenia, 2026-09-03): opisywał budowę
  rejestru i panelu komuś, kto chce tylko oddać samolot (kategoria przypisów
  z issue #43/#72), a zapis jest stanem domyślnym i nie dostaje zdania (reguła
  SyncChipa z issue #12) - w stanie ze zmianą ekran o zapisie MILCZY, zostaje samo
  ostrzeżenie amber w stanie bez zmian
- **pkt 3 - zapis bez biegu ZE ZMIANĄ jest operacją**: dostaje numer, sygnaturę
  (kotwica: przejęcie - patrz sekcja sygnatury wyżej) i kafelek na 01/12 z godzinami
  ZAJĘCIA maszyny (przejęcie → zdanie) oraz trójką 0 · 0:00 · 0:00. Decyzja zapada
  dopiero PRZY ZDANIU (treść bez biegu orzeka się z odczytów końcowych - numer nadany
  wcześniej i odebrany przenumerowałby sąsiadów w trakcie dnia); operacja trzymana bez
  biegu wiersza nadal nie ma. Odczyt NIEKOMPLETNY (strumień legacy/złamany) nie jest
  ani treścią, ani pustką: widoczny w historii bez numeru, jak przed #75
- **pkt 4 - kołowanie inną linią niż lot** na KAŻDYM rysunku trasy: mapa 14, profil
  pionowy, miniatura na 10, mapa w dzienniku panelu. Przerywana szara (`textMuted` /
  `--text-muted`) kontra pełna zielona - dokładnie to, co mockupy 14 i 10 rysowały od
  issue #38, a kod pomijał. Fazy dzieli DOMENA (`track/phases.ts`: `trackPhaseRuns` -
  faza należy do ODCINKA, oba końce w oknie lotu; przebiegi dzielą wierzchołek
  graniczny; bieg bez lotów = całość kołowaniem), a okna lotów przynosi WOŁAJĄCY
  z rejestru/DTO - koperta śladu niesie samą geometrię (issue #47) i tak zostaje.
  W RN kreskę przerywaną tnie `dashPath` (`screenPolyline.ts`) po długości łuku;
  kawałki przechodzą przez `polylineSegments`, więc nadmiar styku (pół grubości
  z każdej strony) wydłuża kreski dokładnie tak, jak `stroke-linecap: round` wydłuża
  `stroke-dasharray` w SVG - wzór [4, 4] wygląda w obu technikach tak samo. Panel:
  `mapPlot` oddaje trasę w przebiegach, legenda mapy dostała wiersz „Kołowanie";
  `trackPhaseRuns` dopisany do imiennego wyjątku w `admin/test/architecture.test.ts`

## Słownik: „operacja lotnicza" zamiast „sesji" (issue #68)
Drugie zdanie zgłoszenia: **„sesja" powinno ewoluować w słowo kluczowe „operacja
lotnicza" - bardziej czytelne biznesowo.** Przemianowane zostały NAPISY (aplikacja
pilota, panel, karta arkusza, komunikaty reguł domeny), mockupy `design/*.html`
i dokumentacja.

- **identyfikatory w kodzie zostają angielskie**: `sessionUuid`, `projectSession`,
  `SessionState`, `session_claim`, `/sessions/:uuid`. Reguła „nazwy w kodzie po
  angielsku" nie zmienia się przez zmianę słownika po polsku, a przemianowanie
  `session_claim` znaczyłoby migrację rejestru append-only
- **polska odmiana zgadza się co do znaku**: `sesj` → `operacj` obsługuje wszystkie
  przypadki (sesja→operacja, sesji→operacji, sesję→operację). Dlatego podmiana była
  mechaniczna i dlatego wymagała jednego strażnika - patrz niżej
- **„SESJA" MA W TYM PROJEKCIE DRUGIE ZNACZENIE i ono ZOSTAJE**: sesja logowania
  (panelu, przeglądarki, telefonu). „Sesja wygasła. Zaloguj się jeszcze raz",
  `ADMIN_SESSION_TTL_SEC`, `refresh_tokens`, ciasteczko `ninerdeck_admin` - tam „sesja"
  znaczy dostęp, nie lot. Przemianowanie ich byłoby błędem rzeczowym
- **`design/admin/` (archiwum panelu 1.0) NIE zostało przemianowane** - to zamrożony
  zapis decyzji sprzed 2026-08-30, nie specyfikacja
- komentarze w kodzie przemianowano tam, gdzie i tak zmieniał się plik; reszta mówi
  „sesja" dalej i nie jest to niespójność do naprawiania hurtem - docblock stoi obok
  identyfikatora, który nazywa się `session`

## Dzień pilota = lista operacji (issue #23, 2026-08-11 - klamra służby USUNIĘTA)
Reguła w jednym zdaniu: **do pilota w danej dobie UTC przypisana jest lista operacji
i nic ponadto.** Klamra służby („loty zapisywane, służba deklarowana", 2026-08-06)
przeżyła pięć dni - czas „od meldunku do zamknięcia" niczego nie mierzył, a wymagał
deklaracji, przycisku „Zamknij dzień" i osobnych reguł. Konsekwencje:
- dzień należy do **pilota** i obejmuje operacje na różnych maszynach - na 01 jako PŁASKA
  oś czasu (rejestracja to informacja kafelka, NIE oś grupowania); sumy doby w TEJ SAMEJ
  trójce, co kafelek operacji: Loty · Blok · Lot (2026-08-16 - podpis „5 st / 5 ldg" był
  liczbą lotów powiedzianą dwa razy, a komórka „Loty" niosła CZAS zamiast liczby)
- dnia **nie otwiera się ani nie zamyka** - zaczyna się pierwszą operacją; „Zamknij dzień",
  ekran `01b` i edu-baner o klamrze nie istnieją
- z modelu znikły: `preflight_confirm.dutyStart`, `day_close.dutyEnd`, reguła
  `DUTY_END_BEFORE_START`, projekcja klamry (`projectDuty` → **`projectPilotDay`**:
  lista operacji + sumy, `projections/pilotDay.ts`)
- **zdanie samolotu już POTWIERDZA dane** - po locie niczego się nie potwierdza ani nie
  wysyła ponownie (decyzja biznesowa przy issue #23; z ekranu 10 zniknął „ZATWIERDŹ →
  SYNC"). Detale operacji (10) otwiera KAFELEK operacji na 01 - tam się ogląda i koryguje
- okno korekty jest JEDNO, per operacja: 24 h od ZDANIA samolotu; drzwiami są kafelek
  operacji na 01 i historia (12)
- **zdanie samolotu nie kończy dnia pilota** - kolejna maszyna dopisze się do listy operacji
- odczyt liczników przy zdaniu (09b) pozostaje **OBOWIĄZKOWY** (przekazanie + ogniwo
  łańcucha MH); jednostką potwierdzenia pozostaje OPERACJA (pivot 2026-08-10)
- łańcuch MH nie ma z dniem pilota nic wspólnego: to oś samolotu
Pełny opis: `docs/_main.md.txt` §3.6, §3.6a - czytane RAZEM z sekcją „Operacja = jeden bieg
silnika" wyżej.

## Poprzednie dni = operacje spoza dzisiejszej doby (issue #35, 2026-08-12)
Ekran 12 przestał być drugą listą tych samych lotów, co „Mój dzień":
- **kafelek = OPERACJA, nie doba** - doba z dwiema operacjami daje dwie karty, rozróżnione
  godzinami biegu silnika. Kafelek-doba nie miałby czego otworzyć: jego celem jest
  rozliczenie (10), a ono opisuje JEDNĄ maszynę
- **dzisiejszych operacji tam nie ma** - mieszkają na 01, na TAKICH SAMYCH kafelkach
  (issue #42). Doba liczy się tak samo jak na 01 (kotwicą jest URUCHOMIENIE silnika,
  awaryjnie przejęcie - `sessionDay` w `logic/historyDays.ts`), więc operacja spod północy
  nie wpada w dziurę między ekranami. Plakietka wejścia na 01 pomija dziś z tego samego powodu
- **metryki kafelka = metryki kafelka operacji z 01**: Loty · Blok · Lot. Skoczkowie zeszli
  do szczegółów lotu, czas trzymania maszyny wypadł
- **„Wysłane" i „Okno minęło" nie istnieją**. Pierwsze jest stanem domyślnym (reguła
  SyncChipa z issue #12), więc zostaje sama plakietka zaległości w dwóch odmianach:
  `queued` („Oczekuje na przesłanie · n") i `sending` („W trakcie wysyłania · n") -
  rozstrzyga wynik OSTATNIEJ próby synca, bo innego pojęcia „online" aplikacja nie ma
- **operacja po oknie 24 h otwiera się do PODGLĄDU** (`design/10b-rozliczenie-zamkniete.html`):
  ten sam ekran 10 bez ani jednego elementu zapisu - amber baner zamiast terminu,
  plakietka „Podgląd” w nagłówku, powrót do 12. Od issue #40 różnica jest DOKŁADNIE
  JEDNA: nie ma przycisku „EDYTUJ DANE" (ołówków przy wierszach nie ma już nigdzie, więc
  przestały odróżniać tryby). Warunkiem jest `!correctionWindow(...).open` - operacja
  jeszcze niezdana ma okno otwarte i działa jak dotąd. Wyszarzony przycisk jest
  ZAKAZANY: obiecuje akcję, którą reguły odrzucą

## Ślad należy do OPERACJI (issue #38, 2026-08-12 - odwraca #25)
Zapis GPS powstaje w JEDNYM ciągu: od uruchomienia do zatrzymania silnika. Operacja ma więc
swój ślad, a loty są jego ODCINKAMI - zdanie z issue #25 („operacja z trzema lotami nie ma
swojego śladu") było fałszywe technicznie i kosztowało jeden ekran pośredni. Droga jest
odtąd dwuczłonowa: **10 (operacja) → 14 (pełny ślad)**.
- **miniatura śladu stoi WPROST na 10**, razem z osią czasu - znacznik na trasie i wiersz
  osi to ten sam start albo to samo lądowanie, więc rozdzielone na dwa ekrany kazały
  pilotowi zestawiać je z pamięci
- **14 rysuje CAŁY bieg silnika**: kołowanie przerywaną szarą, loty pełną zieloną,
  wszystkie starty i lądowania jako znaczniki, profil pionowy z PRZERWĄ NA ZIEMI między
  wyniesieniami (ta przerwa nie jest dziurą w zapisie - to czas, który od issue #38
  wchodzi wprost do normy zużycia)
- **z list wejść w ślad nadal NIE MA** (to z #25 zostaje): numer operacji na kafelku 01 jest
  samą liczbą porządkową. Wejście jest jedno - miniatura na ekranie operacji
- **`14b` = brak zapisu** (wpis ręczny albo nagranie, które nie dotarło): stan pusty
  z POWODEM. Retencja z tego powodu ZNIKŁA - patrz issue #47 niżej
- **EKRAN 16 USUNIĘTY** razem z `16a`: jego treść wróciła tam, skąd przyszła - zrzuty
  na oś czasu operacji (jako zdarzenia w czasie, bo nimi są), czasy do wierszy osi, korekta
  do ołówka wiersza (od issue #40 - do przycisku „EDYTUJ DANE"). Kod:
  `FlightDetailsScreen.tsx`, `logic/flightDetails.ts` i trasa `FlightDetails` skasowane;
  `TrackThumbnail` przeniesiony na ekran operacji

## Log operacji: jedne drzwi do korekty, norma pod plakietką (issue #40, 2026-08-13)
Osiem uwag z urządzenia do ekranu 10 (`design/10`, `10a`, `10b` + NOWY `10c`). Wspólny
mianownik: **ekran ma odpowiadać, a nie oferować** - każdy powtórzony ołówek, plakietka
i liczba, których pilot nie czyta, kosztują miejsce w kolumnie, w której coś naprawdę
stoi.
- **ołówek znika z KAŻDEGO wiersza osi** (pkt 1 i 2). Korekta ma odtąd jedne drzwi -
  „EDYTUJ DANE" pod ekranem. Kilkanaście identycznych celów w jednej kolumnie czytało się
  jak szum, a prawa kolumna wróciła do jedynej liczby, która coś w niej znaczy - czasu
  trwania. Baner okna korekty mówi teraz, GDZIE się poprawia.
  **Uściślenie z issue #43**: przycisk nie prowadzi już na listę ręczną (08 skasowana),
  tylko przełącza TEN ekran w tryb edycji (10d) - i dopiero tam wiersz odzyskuje ołówek
  razem z rytmem 44 px. Reguła zostaje w mocy: w trybie ODCZYTU oś ołówków nie ma
- **kołowanie wchodzi na oś** (pkt 4): `taxi` było jedyną dziurą wobec logu kokpitu.
  Wiersz niesie SAMĄ GODZINĘ - „ile trwało kołowanie" jest w rozliczeniu ciekawostką
  (do bloku i tak wchodzi cały bieg silnika), więc zegar przygotowania zostaje
  w kokpicie, gdzie pilot patrzy na niego w trakcie
- **„Czas lotu" zamiast „W powietrzu"** (pkt 3) - dwa słowa łamały stopkę na dwie linie
- **oś jest KOMPAKTOWA** (uwagi z przeglądu): wiersz 28 px zamiast 40 - brak celów
  dotknięcia zdejmuje rytm 44 px, a warunkiem są jawne `lineHeight` (wariant `mono`
  niesie domyślnie 18 px, więc jedna linia zajmowała tyle, co dwie). Numer lotu zszedł
  z drugiej linii na PRAWĄ krawędź i pada RAZ, przy starcie: przy lądowaniu prawą
  kolumnę zajmuje czas lotu, a para start → lądowanie czyta się w pionie. Prawa krawędź
  niesie odtąd dokładnie jedną rzecz na wiersz, więc nic nie rezerwuje miejsca na to,
  czego w wierszu nie ma. Oba końce osi mają oddech (12 px): PRZEJĘCIE nie klei się do
  śladu, ZDANIE nie czyta się jak pierwszy wiersz stopki z sumami
- **nagłówek bez plakietki z liczbą lotów**: stopka osi mówi „STARTY 2" trzy centymetry
  niżej, a plakietka świecąca przy każdej normalnej operacji uczy oko pomijać róg nagłówka
  (reguła SyncChipa z issue #12). Zostaje sam stan ODCHYLONY - amber „bez lotu" na 10A
  i „Podgląd" na 10B
- **notatki mają wreszcie swoje miejsce** (pkt 5): karta na końcu ekranu zbiera notatkę
  z zadania (02e) i uwagi wpisów ręcznych (08, 15) - `logic/sessionNotes.ts`. Do issue #40
  ten tekst widział administrator w panelu, a jego autor NIGDZIE. Karty nie ma, gdy nie
  ma treści: „Notatki -" byłoby wierszem o niczym
- **plakietka „RĘCZNIE" znika z osi** (pkt 6): sposób powstania zapisu nie jest pytaniem
  pilota - metoda zostaje w rejestrze i w panelu. Reguła z issue #38 („AUTO" nie świeci
  przy każdym wierszu) dociągnięta do końca
- **z rachunku zostaje SAMA plakietka werdyktu** (pkt 7 i 8), a pasmo, stawki normy,
  średnia TEJ operacji i rozpisane działanie przenoszą się do arkusza pod tapnięciem
  (`design/10c-norma-detale.html`, `BalanceDetails` w `logic/sessionBalance.ts`). Karta
  odpowiada „czy dobrze", arkusz „dlaczego tak". **Wiek normy (§4.8) idzie tam razem
  z liczbami** - adnotacja o cache'u przy samej plakietce nie miałaby czego kwalifikować.
  Arkusz otwiera się także w podglądzie (10B): zamknięte okno korekty odbiera prawo do
  zmiany danych, nie do ich zrozumienia. Celem dotknięcia jest CAŁY wiersz - plakietka
  ma 9 px czcionki

## Jeden kafelek operacji i jeden przycisk (issue #42, 2026-08-13)
Zasada: **jedna rzecz ma w aplikacji JEDEN kształt.** „Mój dzień" (01) i „Poprzednie
dni" (12) pokazywały tę samą operację na dwa sposoby - 01 własną tabelą `.leg-row`, 12
kafelkiem `.day-card` - a na 01 stały obok siebie trzy przyciski w trzech krojach.
- **kafelek operacji = `DayCard` na OBU ekranach**; kształt (nagłówek, rejestracja, godziny
  biegu silnika, trójka Loty · Blok · Lot) liczy `screens/logic/sessionCard.ts`, wspólny
  dla `myDay.ts` i `historyDays.ts`. Dokładając pole „bo na jednym ekranie wygodniej",
  zaczynasz rozjazd od nowa - pilnuje tego test kształtu w `myDay.test.ts`
- **różnice są DWIE i obie wymuszone treścią**: (1) nagłówkiem kafelka jest data (12)
  albo numer operacji w dobie (01 - data stoi w nagłówku ekranu, więc na kafelku byłaby
  szumem); (2) stopka z plakietką wysyłki i terminem korekty istnieje tylko w historii
- **na 01 kafelki NIE są niebieskie**, choć wszystkie dzisiejsze operacje są w oknie korekty:
  na 12 błękit ODDZIELA operacje w oknie od zamkniętych, a kolor przy każdej pozycji listy
  niczego nie oddziela (reguła SyncChipa z issue #12)
- **przycisk to zawsze `ActionButton`** - „Poprzednie dni" były przyciskiem-linkiem
  pisanym Archivo obok dwóch pisanych Bebas. Plakietka okna korekty wjechała do przycisku
  (`badge`), zamiast wymuszać własny kształt obok. Wielkość dalej różnicuje wagę akcji,
  rodzina jest jedna: `button` (Bebas 22) / `button_small` (Bebas 16) z pakietu tokenów.
  Mockupowe `.btn-secondary` na 01/01a/01c/LOADERY poszły za tym samym tokenem
- **powrót jest JEDEN - w nagłówku**: zielone „WRÓĆ DO DNIA" na dole ekranu 10 (i „WRÓĆ
  DO DNI" na 10b) usunięte. Przycisk akcji głównej, który wyłącznie wychodzi z ekranu,
  obiecuje czynność, której nie ma; w trybie podglądu (10b) nie zostaje żaden pas akcji
  i tak ma być
- **„DODAJ LOT RĘCZNIE" jest na 01 ZAWSZE**, także przy pustym dniu (zgłoszenie
  z urządzenia, 2026-08-14). Do tej pory pusty dzień miał wyłącznie zielone „ROZPOCZNIJ
  LOT", więc pilot bez ani jednej operacji nie miał jak wpisać lotu odbytego bez telefonu -
  a to jest dokładnie sytuacja, dla której wpis ręczny istnieje (§3.8). Decyzję trzyma
  `myDayActions` w `logic/myDay.ts`, żeby dało się ją przetestować (warunek w JSX
  przeżył tę dziurę bez jednego czerwonego testu)
- **„ROZPOCZNIJ LOT" wygląda i stoi TAK SAMO przez cały dzień** (zgłoszenia
  z urządzenia, 2026-08-16 i 2026-08-26): zawsze zielony główny, POD logiem dnia
  i NAD „DODAJ LOT RĘCZNIE" - jednakowo na 01, 01A i 01C. Log jest właściwą treścią
  ekranu domowego, więc stoi pierwszy; wcześniej pusty dzień miał przycisk zielony
  na górze, a dzień z operacjami szary pod sumami - ekran uczył się dwa razy w ciągu
  jednego dnia, a druga operacja nie jest mniej ważna od pierwszej. `myDayActions` jest
  BEZARGUMENTOWE, a kolejność jego tablicy JEST kolejnością na ekranie - pas akcji
  nie czeka na wczytanie strumienia, więc skeleton nie trzyma plamki po przyciskach.
  Przypis „Odczytasz paliwo i motogodziny…" USUNIĘTY (2026-08-26): opisywał kroki
  formularza, które pilot i tak zaraz zobaczy

## Edycja danych operacji = TRYB ekranu 10, nie osobny ekran (issue #43, 2026-08-13)
„EDYTUJ DANE" prowadziło na ekran 08 (lista ręczna) - drugi widok tej samej operacji, z inną
osią, innym słownikiem i jedyną możliwą korektą: czas albo unieważnienie. Poprawić odczyt
paliwa, licznik motogodzin ani składu zrzutu nie dało się w ogóle, a o tym, że dana była
kiedykolwiek zmieniana, pilot nie dowiadywał się znikąd.
- **korekta jest STANEM ekranu 10, nie miejscem** (`design/10d`): ten sam ślad, ta sama
  oś, te same rachunki - plus ołówek przy każdym wierszu i pas akcji z „DODAJ WPIS".
  Wiersz wraca w trybie edycji do **44 px**: to nie jest cofnięcie issue #40 (tam wiersz
  NIE BYŁ celem dotknięcia, więc rytm 44 px marnował kolumnę), tylko jego druga połowa
- **cztery arkusze zamiast jednego**, bo cztery różne pytania: `10e` czas zdarzenia
  (+ „tego nie było"), `10f` paliwo i MH przy przejęciu/zdaniu, `10g` zrzut (czas
  + skład), `10h` dopisanie brakującego faktu. Piąty, `10i`, jest wyłącznie do czytania:
  historia zmian pola albo zdarzenia
- **`amend` - TRZECIA akcja korekty** obok `retime` i `void`: poprawia WARTOŚĆ w payloadzie
  (`fuelL`, `mh`, `jumpers`, `notes`, `dualId`), nie czas. Biała lista pól jest wąska i zależy od typu celu;
  `preflight_confirm` i `day_close` przestały być całkiem niekorygowalne, ale wyłącznie
  przez `amend` - `retime`/`void` na nich nadal odrzuca `CORRECTION_TARGET_NOT_ALLOWED`,
  bo unieważnienie zdania rozbiłoby operację w pół. `refuel` `amend`-a NIE dostaje: niesie
  spójną trójkę before/added/after, więc poprawia się przez unieważnienie i dopisanie
- **historia zmian jest w strumieniu z definicji** - rejestr jest append-only, więc
  `correctionHistory` tylko go czyta. Widać w niej także korekty administratora, bo od
  issue #32 wracają na telefon (`GET /me/events`, §4.9). Znacznik **„popr."** przy wierszu
  zostaje widoczny w trybie ODCZYTU: to fakt o danych, nie akcja
- **niespójności wykrywa domena na CAŁYM strumieniu** (`rules/consistency.ts`), inaczej
  niż `checkAppend`, który pyta o kandydata do zapisu: „lot bez lądowania" jest zdaniem
  o operacji, nie o wpisie. Baner w trybie edycji nazywa fakt i mówi, czym się go naprawia
- **ekran 08 i arkusz 04C SKASOWANE**. Kokpit po zatrzymaniu silnika dostaje kafelek
  „Popraw dane operacji" → 10d z powrotem DO KOKPITU: bez niego pilot nie miałby jak naprawić
  brakującego lądowania przed zdaniem samolotu, a zdanie zatwierdza log. To nie łamie
  modalności kokpitu - maszyna zostaje w jego rękach
- **powód korekty jest OPCJONALNY** (jedno pole w każdym arkuszu): wymagany byłby tarciem
  w polu, a bez niego administrator patrzący na zmieniony odczyt nie ma jak się dowiedzieć
  dlaczego. Wchodzi do historii zmian i do panelu
- **NOTATKA i DRUGI PILOT też są korygowalne** (uwagi z urządzenia, 2026-08-14). Notatka
  otwiera TEN SAM arkusz, w którym powstała (02e) - pusty tekst ją kasuje. Dual wymagał
  zmiany MODELU: żył wyłącznie w nagłówku zdarzeń (`Event.dualId`), a nagłówka nie da się
  poprawić bez łamania append-only, więc `preflight_confirm` dostał pole `dualId` i to ono
  wygrywa w projekcji. Poprawka działa WSTECZ na całą operację („wpisałem złego drugiego
  pilota"); zmiana załogi W TRAKCIE to nadal `crew_change` i ekran 07 - inne pytanie,
  inne zdarzenie. PIC-a nie da się zmienić w ogóle (`PIC_CHANGE_NOT_ALLOWED`)
- **GODZINA PRZEJĘCIA jest korygowalna, a jej korekta potrafi PRZESUNĄĆ CAŁY BIEG**
  (uwaga z urządzenia). `session_claim` przyjmuje odtąd `retime` (i wyłącznie jego -
  `void` zabrałby operacji właściciela). Przesunięcie w tył jest zwykłą poprawką; w przód,
  ZA uruchomienie silnika, pociąga wszystkie zdarzenia biegu o tyle, żeby uruchomienie
  wypadło dokładnie w nowej godzinie przejęcia - czasy trwania zostają, bo przesuwamy,
  nie skracamy. Ekran zapowiada to ZANIM pilot zapisze (`logic/claimRetime.ts` liczy
  plan, `useSessionEdit` go wykonuje jako N korekt). Kaskada NIE RUSZA `day_close`: od
  niego liczy się okno 24 h, więc przesuwanie go własną poprawką przedłużałoby sobie
  termin. Bieg, który po przesunięciu wyszedłby poza zdanie samolotu, jest odmawiany
  z powodem - zamiast produkować operację z silnikiem pracującym po oddaniu maszyny.
  **Zdanie samolotu godziny NIE MA** i to jest ta sama reguła widziana z drugiej strony
- **ołówek nigdy nie jest akcją główną**: otwarcie korekty wygląda tak samo przy wierszu
  osi, przy notatce i przy Dualu - ikona w stałej kolumnie, nigdy wypełniona pigułka
  (`PillButton` jest zielony i czytał się jak CTA ekranu)
- **WEJŚCIE NIE MOŻE ZNIKAĆ RAZEM Z RZECZĄ, KTÓREJ DOTYCZY** - reguła wyciągnięta
  z dwóch zgłoszeń naraz (2026-08-14). Karta „Notatki" w trybie ODCZYTU nadal istnieje
  tylko z treścią (issue #40), ale w trybie EDYCJI dochodzi drugie wejście - wiersz
  „Dodaj notatkę do operacji" - inaczej operacja bez notatki nie miałaby jak notatki dostać.
  Ten sam błąd co znikające „DODAJ LOT RĘCZNIE" przy pustym dniu (issue #42 wyżej):
  affordancja gasła dokładnie w stanie, w którym jest potrzebna. Dopisanie ma PLUS,
  nie ołówek - ołówek obiecuje poprawianie istniejącej wartości
- **notatka operacji jest DOKŁADNIE JEDNA i stąd dwie reguły** (uwaga z urządzenia,
  2026-08-14). Niesie ją jedno pole payloadu `preflight_confirm`, więc: (1) wiersz
  dopisania istnieje WYŁĄCZNIE przy jej braku - obok istniejącej obiecywałby drugą,
  a naprawdę nadpisałby pierwszą (`missingSessionNote` w `logic/sessionNotes.ts`,
  z testem: warunek w JSX już raz był i już raz był zły); (2) nie ma STEMPLA, bo nie
  ma jej od czego odróżnić, a „Zadanie · 08:04" mówiło o godzinie potwierdzenia
  zadania i po pierwszej poprawce treści zaczynało kłamać. Podpis zostaje przy
  uwagach wpisów ręcznych (`kind: 'entry'`) - tych bywa wiele
- **plakietka „popr." jest WSZĘDZIE i jest KLIKALNA** (uwagi z urządzenia, 2026-08-14).
  Nosi ją każda poprawiona wartość - wiersz osi, notatka i drugi pilot - bo wszystkie
  są tym samym: liczbą albo zdaniem, które nie jest tym, co zapisał przyrząd albo pilot.
  Widać ją w OBU trybach i w podglądzie po oknie (10B), a tapnięcie otwiera historię
  zmian (10I). W trybie odczytu to **jedyne** wejście w historię i jedyny cel dotknięcia
  osi - nie łamie reguły „bez ołówków" z issue #40, bo ołówek obiecuje zapis, a historia
  jest wyłącznie do czytania. Napisu nie powiększamy (7,5 px, przypis do nazwy): obszar
  reakcji rozciąga `hitSlop`, więc wiersz zostaje przy 28 px. Jeden komponent na całość -
  `components/status/CorrectedTag.tsx`; licznik zapalający plakietkę i licznik przy
  wejściu w historię to ta sama funkcja (`logic/fieldChanges.ts`), więc nie mają jak
  powiedzieć czegoś innego
- **poprawiona notatka niesie „popr." i własną historię** (uwaga z urządzenia,
  2026-08-14). Historię otwiera też wiersz w arkuszu notatki (`design/10k` - ten sam
  arkusz co 02e plus to jedno wejście). **Historia jest ZAWĘŻONA do pola**:
  `preflight_confirm` niesie paliwo, licznik, notatkę i Duala w jednym payloadzie,
  a każde z nich ma własny arkusz i własne pytanie - bez zawężenia poprawka paliwa
  zapalałaby plakietkę i licznik przy notatce oraz przy Dualu. Zakresy trzyma `useSessionEdit`
  (`READING_FIELDS`/`NOTE_FIELDS`/`DUAL_FIELDS`). Arkusz notatki jest jedynym bez pola
  „powód": przy odczycie powód tłumaczy liczbę, której nikt inny nie wyjaśni, a przy
  notatce wyjaśnieniem jest sam nowy tekst
- **w historii zmian nazwa pola ODRÓŻNIA, a nie opisuje** (uwaga z urządzenia,
  2026-08-14): plakietka („czas", „notatka") pojawia się przy wierszach WYŁĄCZNIE wtedy,
  gdy lista miesza różne pola. Historia notatki ma same notatki, a lądowania - same
  czasy, więc podpis powtarzał nagłówek arkusza przy każdym wpisie i zabierał miejsce
  parze „było → jest". Rozstrzyga FAKTYCZNA zawartość listy, nie zakres, w jakim ją
  otwarto (`needsFieldLabels` w `logic/correctionHistoryRows.ts`)
- **arkusz nie tłumaczy braków ani samego siebie**: przypis „odczytu nie da się
  unieważnić" opisywał przycisk, którego nikt nie szuka. Tak samo wyleciały podpowiedzi
  „litry z paliwomierza" i „wskazanie licznika" (nazywały pole, które nazywa się tak samo
  dwa centymetry wyżej), zdanie „korekty zapisują się od razu - rejestr jest append-only"
  spod pasa edycji, przypis „ta lista jest kompletna z definicji" pod historią zmian,
  baner „korekta nie kasuje historii…" z arkusza 10E razem z chipem „Jak to działa?"
  oraz przypisy pod akcjami destrukcyjnymi („oznacza zdarzenie jako błędne (nie usuwa
  go z rejestru)", „wiersz zostaje w rejestrze"). Wszystkie opisywały wewnętrzną budowę
  rejestru komuś, kto o nią nie pytał - a napis na przycisku („TEGO LĄDOWANIA NIE BYŁO")
  Tą samą drogą poszły (2026-09-04) ostrzeżenia arkusza korekty odczytu mówiące, CZYM
  ten odczyt jest w rejestrze - „ten odczyt otwiera łańcuch motogodzin", „jest
  przekazaniem maszyny": świeciły przy każdym otwarciu, nie mówiły nic o poprawianej
  wartości i nie dawały się na nic zamienić. Ostrzeżenie zostaje tam, gdzie mówi
  o SKUTKU konkretnej zmiany (przesunięcie biegu silnika przy korekcie godziny).
  Tego samego dnia wyleciały z arkusza DOPISANIA wpisu (10H): niebieski baner „wpis
  dostanie w rejestrze znacznik «ręcznie»…" (znacznik jest sprawą panelu, nie pilota)
  i przypis „uruchomienia i wyłączenia silnika tu nie ma…" - siatka dostępnych typów
  mówi to sama, samym brakiem takiego kafelka.
- **KOREKTA ODCZYTU WYGLĄDA JAK KAŻDA INNA KOREKTA** (uwaga z urządzenia, 2026-09-04:
  „korekta «zdania» i «przejęcia» wygląda trochę inaczej niż korekta innych zdarzeń […]
  ma jakiś taki wielki pill z nazwą zdarzenia"). Cel korekty w 10F to odtąd JEDNA LINIA
  MONO, dokładnie ta sama, co w arkuszu czasu 10E - karta z ramką, ikoną medium i nazwą
  pełnym stopniem robiła z przejęcia i zdania korektę innego gatunku. To cofa decyzję
  z 2026-08-14 („mono 9 px czytało się jak przypis"): spójność rodziny arkuszy waży
  więcej niż wyrazistość jednego z nich. Godzina dokleja się do tej samej linii przy
  ZDANIU, bo tam kontrolki czasu nie ma i to jedyne miejsce, gdzie ją widać.
- **zerowa zmiana blokuje BEZ ZDANIA także tutaj** (ta sama uwaga: „po co pisać na
  przycisku «Zmień którąś…»"): to wąski wyjątek reguły issue #55 - blokadę widać
  z kontrolki nad przyciskiem, bo pilot patrzy na wartość, której jeszcze nie tknął.
  Zdanie zostaje przy wpisie NIECZYTELNYM i przy twardej regule czasu.
  mówi już wszystko, co trzeba wiedzieć przed tapnięciem. Podpowiedź pod polem pojawia
  się WYŁĄCZNIE po zmianie i mówi, co było
- **arkusz korekty nie krzyczy** (uwagi z urządzenia, 2026-08-14). Trzy rzeczy naraz:
  (1) **unieważnienie jest KOSZEM w linii tytułu** (`IconAction` + `Sheet.headerAction`),
  nie pełnowymiarowym czerwonym przyciskiem pod akcjami - separator miał go odsunąć od
  „Zapisz", a robił z niego najgłośniejszy element arkusza, choć intencją wchodzącego
  jest POPRAWKA, nie kasowanie; (2) **cel korekty to jeden wiersz mono**, bez kolorowej
  ramki, ikony typu i plakietki metody (ta dublowała wiersz „Metoda wykrycia"); (3) **przy
  zerowej zmianie „Zapisz" jest po prostu nieaktywny** - `ActionButton.disabled` bez
  powodu, bo powód widać w kontrolce wyżej. To NIE jest odwołanie reguły §6 pkt 3:
  `disabledReason` zostaje dla blokad, których z ekranu nie widać
- **plakietki „bez lotu" w nagłówku operacji NIE MA**: oś bez ani jednego lotu, zerowa
  stopka i powód zdania mówią to trzy razy; róg nagłówka trzyma stan TRYBU (edycja,
  podgląd), a nie kolejny opis danych
- **„DODAJ WPIS" jest OSTATNIM WIERSZEM OSI**, nie przyciskiem na dnie ekranu: dopisywany
  fakt trafia do przebiegu operacji, więc wejście stoi tam, gdzie skończy się jego skutek
- **licznik motogodzin wpisuje się z klawiatury NUMERYCZNEJ** (uwaga z urządzenia,
  2026-08-14). Format hh:mm wymuszał dotąd pełną QWERTY, bo dwukropka nie ma na
  numerycznej - a QWERTY zajmuje pół ekranu i podsuwa podpowiedzi słownikowe pod liczbę
  z tarczy. Separator stawia odtąd MASKA (`maskMotoHoursInput` w `@ninerdeck/format`):
  kropka, przecinek i dwukropek znaczą TO SAMO, maska zamienia je na znak właściwy dla
  formatu licznika i pilnuje, żeby był dokładnie jeden. Tryb `text` w `ReadingSheet`
  został usunięty - nie ma go do czego przywracać
- **kotwica historii to sama para „kiedy → co"**: podpis o źródle zapisu („autodetekcja ·
  GPS", „zapis operacji") zniknął razem z plakietkami „AUTO"/„RĘCZNIE" z osi (issue #40) -
  prowenienecja nie jest pytaniem pilota, tylko rejestru i panelu
- **wiersz „Historia zmian" istnieje TYLKO wtedy, gdy jest historia**: zerowy licznik to
  szum, nie informacja - ta sama reguła, którą issue #40 wyrzuciło „Notatki -"

## Wpis ręczny = ten sam lot, te same pytania (przebudowa 15, 2026-08-16)
Ekran 15 przestał być formularzem czterech pól: wpis po fakcie opisuje TEN SAM lot,
co zapis automatyczny, więc pyta o to samo i tymi samymi kontrolkami. STEPPER czterech
kroków (jak 02 → 02E → 02A): data+samolot+Dual → zadanie → czasy → liczniki
(data PIERWSZA i wymóg Duala - issue #58, sekcja wyżej).
- **data lotu jest POLEM, domyślnie dzisiejszym** (arkusz 15E: od issue #58 kalendarz
  miesięczny ze skrótami „Wczoraj"/„Dzisiaj"; `maskDateUtcInput`/`parseDateUtc` wyszły
  z użycia w tym arkuszu). W nagłówku daty NIE MA - stała tam data z ZEGARA, która
  przy wpisie sprzed tygodnia kłamała o tym, czego wpis dotyczy. Zmiana doby PRZESUWA
  wpisane godziny razem z dniem
- **pełna parita zadania**: rodzaj operacji (bez wartości podstawionej - wybór ma być
  świadomy), lotniska wg issue #13 (WYMAGANE - issue #58, sekcja wyżej; inaczej niż
  na 02E), klient, notatka i Dual. Komenda `manualFlight`
  wpisywała twardo `operation: 'inne'` i `dualId: null` - lot szkolny z kartki gubił
  drugiego pilota bezpowrotnie. Podpowiedzi z ostatniego dnia TU NIE MA (inaczej niż
  na 02E): wpis opisuje konkretny lot z przeszłości, podstawianie robiłoby domysł
- **dowolnie wiele lotów w jednym biegu** - od issue #62 na OSI OPERACJI, nie na płaskiej
  liście (sekcja „Krok 3 wpisu ręcznego = OŚ OPERACJI" niżej), z „DODAJ LOT" jako ostatnim
  wierszem (wzorzec „DODAJ WPIS" z issue #43). Stara wersja przyjmowała jedną parę
  i odsyłała dzień skokowy do dziesięciu arkuszy korekty po zapisaniu.
  Zrzuty tylko w dniu skokowym (issue #19 - brak sekcji, nie blokada)
- **paliwo ma trzy stany**: przed uruchomieniem (wpisywany, nie zgadywany z cache -
  zgadnięte ogniwo psuło łańcuch następnemu pilotowi), dolewki (trójka `refuel` domyka
  się z pary „dolano + stan po") i stan po locie. Motogodziny z OBU stron biegu.
  **Dolewka w środku biegu jest twardym błędem** (`REFUEL_ENGINE_RUNNING` - dolewa się
  przy zatrzymanym śmigle): blokada mówi to przy przycisku, a komenda wstawia dolewkę
  w jej miejscu czasowym, żeby próba generalna odrzuciła zapis nazwanym błędem
- **ostrzeżenia NIE blokują** (`logic/manualFlightWarnings.ts`): kolizje czasów
  z WŁASNYMI operacjami liczą się z lokalnego rejestru, łańcuch MH i paliwa z ostatniego
  przekazania w cache (z adnotacją wieku, §4.8) - wszystko offline. Kolizje z cudzymi
  operacjami rozstrzyga serwer flagą `aircraft_overlap` (§4.5). Blokują wyłącznie rzeczy,
  które domena odrzuci twardo (kolejność czasów, cofnięty licznik) - fakt lotu jest
  cenniejszy niż kompletność formularza. Granicę pilnują testy obu modułów
- **operacja z wpisu niesie JAWNY znacznik** `session_claim.manualEntry` - z metody
  zdarzeń nie da się go wywieść (`manual` niesie też lot z ręcznymi przyciskami),
  a heurystyka po stemplach padłaby przy odtworzeniu rejestru. Plakietka „RĘCZNIE"
  stoi na kafelku operacji (01/12, `DayCard.titleTag`) i w nagłówku rozliczenia (10) -
  **nie przy wierszach osi** (issue #40 pkt 6 zostaje: świeciłyby wszystkie naraz)
- **bez tagów „wymagane"**: wymagalność jest stanem DOMYŚLNYM formularza, plakietka
  przy każdej sekcji nie odróżniała niczego od niczego (reguła SyncChipa z issue #12).
  Oznaczamy WYŁĄCZNIE to, co opcjonalne. Ta reguła obowiązuje każdy nowy formularz
- **OPCJONALNOŚĆ MÓWI PLAKIETKA, NIGDY SŁOWO DOKLEJONE DO NAZWY** (uwaga z urządzenia,
  2026-08-29: „jak coś jest opcjonalne, to zaznaczałeś w pill, a nie jak zwykły tekst
  w tym popup"). „Dolano · opcjonalnie" i „Wysokość zrzutu (ft) - opcjonalnie" czytały
  się jak część NAZWY pola, choć są jego WŁAŚCIWOŚCIĄ - a właściwość ma w tym systemie
  jeden kształt: `Field.tag` w linii etykiety, ta sama plakietka, co „opcjonalne" przy
  Dualu i „wymagany · załoga 2-os." przy maszynie. Poprawione w `OilSheet`,
  `ManualDropSheet` i makietach 02A/02I; `TimeStepper` przepuszcza `tag` do `Field`.
  **Placeholdery to co innego** i zostają zdaniem („Powód (opcjonalnie) - np. …"):
  są instrukcją W POLU, a nie etykietą nad nim
- **W ARKUSZU ZRZUTU CZAS STOI POD SKŁADEM** (ta sama uwaga). Treścią zrzutu jest to,
  KOGO wyniesiono - i tylko tego nie odtworzy nikt poza pilotem, który leciał. Godzina
  jest wtórna, bo formularz podstawia ją ze ŚRODKA pierwszego lotu bez zrzutu
  (`nextDropAt`), więc pilot, który jej nie tyka, dostaje wartość sensowną, a nie pustą;
  stąd plakietka „opcjonalne" przy niej. Skoro skład jest pierwszym pytaniem, dostał
  wreszcie własną etykietę („Skład - ilu wyskoczyło", ta sama, co w 10G).
  **Kolejność jest inna niż w arkuszu KOREKTY zrzutu (10G) i to jest świadome**: tam
  wchodzi się tapnięciem w wiersz osi, żeby poprawić godzinę, więc godzina jest pytaniem
  pierwszym. Pusta godzina pozostaje niewyrażalna - zrzut jest zdarzeniem rejestru,
  a zdarzenie bez czasu nie istnieje (`gpsTime ?? deviceTime`) i nie przeszłoby reguły
  `DROP_ON_GROUND`
- edu-baner „Wpis trafi na listę dnia…" USUNIĘTY (opisywał budowę rejestru komuś, kto
  chce wpisać lot z kartki); `ManualEntrySheet` SKASOWANY (komponent po ekranie 08,
  krok 10 minut, bez wpisu z klawiatury) - czasy idą przez `FlightTimesSheet`
  na `TimeStepper`; notatka ma własną sekcję zamiast pola w arkuszu czasów
- **KRĘGI (TOUCH AND GO) TO LICZBA PRZY LĄDOWANIU, NIE PIĘĆ PAR GODZIN** (uwaga
  z urządzenia, 2026-08-29; mockup `15I`). Zgłoszenie: „częściej będzie tak, że podaję
  godzinę uruchomienia, startu, ostatniego lądowania i wyłączenia oraz podaję ilość
  lotów - czyli wykonałem w tym czasie 4 touch and go".
  - **`LandingPayload.touchAndGo`** (opcjonalne, dodatnie) - ile razy maszyna przyziemiła
    i wystartowała ponownie MIĘDZY startem lotu a tym lądowaniem. Brak pola i zero znaczą
    to samo, więc do payloadu wchodzi tylko liczba dodatnia (serwer odrzuca `0`: dwa
    zapisy jednego faktu rozjeżdżają się przy pierwszej korekcie)
  - **rośnie OBA liczniki**: `touchAndGo: 4` to 5 lądowań i 5 startów (start otwierający
    plus cztery po kręgach). Arytmetykę trzymają PROJEKCJE, nie czytelnicy - i są DWIE:
    `projections/session.ts` liczy ze strumienia, `projections/pilotDay.ts` z LOTÓW.
    Bez tej drugiej doba pilota po cichu zaniżałaby lądowania (operacja 5, dzień 1, obie
    liczby na innych ekranach); ma na to własny test
  - **NIE DZIELIMY koperty na równe odcinki**: pięć par wymyślonych minut wyglądałoby
    na osi jak zapisane, a arkusz korekty pozwoliłby je „poprawiać" jak fakty. Rejestr
    mówi prawdę o swojej dokładności - jedna koperta czasu i tyle lądowań, ile pilot
    policzył. To świadoma cena: ten sam dzień zapisany automatem da 5 lotów, a skrótem
    1 lot i 5 lądowań
  - **detekcja GPS tego pola NIE USTAWIA** i ścieżka automatyczna liczy się dokładnie
    jak przed zmianą - każdy krąg produkuje tam własną, PRAWDZIWĄ parę zdarzeń.
    Pilnuje tego osobny test w `projections.test.ts`
  - **licznik jest w arkuszu CAŁEGO lotu I w arkuszu LĄDOWANIA**
    (`FlightTimesSheet.circuits`, bramka `showsCircuits` - jedna na widoczność I na
    zapis, bo rozjazd między nimi jest cichy: pokazany licznik bez zapisu gubi wpis,
    a zapis bez pokazania zeruje liczbę, której nikt nie widział). Nigdy przy biegu
    silnika (kręgi są własnością lotu) ani przy edycji STARTU: start otwierający lot
    jest jeden i o kręgach nie wie. Lądowanie licznik dostało uwagą z urządzenia
    (2026-08-29: „jak edytuję lot, to nie mogę edytować ilości touch and go") - kręgi
    są jego własnością, oś wypisuje je przy nim, a pole, które da się WPISAĆ, ale nie
    da się POPRAWIĆ, to ten sam błąd, który issue #43 nazwało regułą „wejście nie może
    znikać razem z rzeczą, której dotyczy". Podpis pod polem mówi, ile z tego wychodzi
    LĄDOWAŃ - zamiana „4" na „5" w głowie jest rachunkiem, którego formularz ma oszczędzić.
    Odmiana idzie przez `landingsCount` w `@ninerdeck/format`, wspólną z osią
- **wpis bez ani jednego lotu OSTRZEGA, nie blokuje** (uwaga z urządzenia, 2026-08-29 -
  odwraca decyzję z przebudowy 15). Blokada „Dodaj przynajmniej jeden lot" stała na
  uzasadnieniu „wpis nazywa się LOT RĘCZNY, więc lot jest jego treścią", a ono było
  fałszywe: „mogła być taka sytuacja, że uruchomiłem i wyłączyłem, ale nie wykonałem
  żadnego lotu". To DOKŁADNIE ten stan, który flow na żywo ma jako 09C (pogoda, usterka,
  próba silnika), a domena traktuje go miękko (`NO_FLIGHT_WITHOUT_REASON` to flaga, nie
  odmowa) - blokada odbierała pilotowi zapisanie czasu, w którym maszyna była zajęta.
  Ostrzeżenie `no-flight` stoi na kroku 3, jak baner braku zrzutu

## Powód blokady wewnątrz przycisku, rezygnacja z lotu przez arkusz (issue #55, 2026-08-26)
Cztery uwagi z urządzenia; dwie z nich to reguły obowiązujące każdy nowy ekran:
- **powód blokady stoi WEWNĄTRZ przycisku, nigdy pod nim** - `ActionButton.disabledReason`
  renderuje się bursztynem w slocie podpisu (`hint`) i wygrywa z nim na czas blokady.
  Napis doklejany pod przyciskiem pojawiał się i znikał razem ze stanem, skacząc
  layoutem wszystkiego poniżej. Przycisk z powodem NIE dostaje przygaszenia opacity
  (bursztyn pod 0.45 przestaje być ostrzeżeniem) - wyszarzenie niosą kolory. Reguła
  §6 pkt 3 zostaje: blokada niewidoczna z ekranu ma powód, widoczna - sam `disabled`.
  W mockupach: `.btn-reason` wewnątrz `.btn-primary.disabled` (02, 02A).
  **WYJĄTEK „widoczna z ekranu" JEST WĄSKI I ZWĘŻONY 2026-08-29** (uwaga z urządzenia):
  obejmuje wyłącznie stan czytelny z KONTROLKI NAD PRZYCISKIEM - arkusz korekty otwarty
  na wartości pierwotnej („nic się jeszcze nie zmieniło"). NIE obejmuje stanu opisanego
  gdzie indziej na ekranie: wymóg Duala mówił o sobie banerem pod listą wyboru
  i to był błąd - pilot napotyka blokadę przy PRZYCISKU i tam szuka odpowiedzi,
  a wszystkie pozostałe blokady formularzy odpowiadają mu właśnie tam. Jeden wyjątek
  kosztuje więcej niż powtórzenie, którego miał oszczędzić. Sam wymóg mieszka odtąd
  w `logic/dualRequirement.ts` - JEDNO zdanie czytane przez 02 (`disabledReason`)
  i przez krok 1 wpisu ręcznego (gałąź `manualFlightStepBlocker`), bo rozjazd między
  tymi dwoma ekranami był treścią zgłoszenia. Plakietka „wymagany · załoga 2-os."
  przy nagłówku ZOSTAJE: mówi o WŁAŚCIWOŚCI maszyny w miejscu wyboru, także wtedy
  gdy nic nie blokuje - to inna rzecz niż powód, dla którego nie da się iść dalej
- **REGUŁA OBOWIĄZUJE TAKŻE ARKUSZE** (uwaga z urządzenia, 2026-08-29: „jak mam wpis
  paliwa, to po co dajesz baner «wpisz wartość, żeby zapisać»? […] taki pattern
  powinien być wszędzie"). Granica jest jedna i przechodzi między dwoma pytaniami:
  - **baner „Zanim potwierdzisz" opisuje WARTOŚĆ**, którą pilot wpisał - różni się od
    szacunku, przekracza pojemność, schodzi pod minimum. Zapisu nie wstrzymuje;
  - **przycisk niesie POWÓD, dla którego zapisu nie ma** - wpis nieczytelny, nic nie
    zmienione. `Sheet.confirmDisabledReason` → `ActionButton`.

  **PUSTE POLE WYMAGANE NIE DOSTAJE ZDANIA** (druga uwaga z urządzenia, 2026-08-29:
  „nie ma sensu pisać «wpisz wartość, żeby zapisać» - wiadomo, że jak pole jest
  wymagane, to dlatego przycisk jest disabled"). To ten WĄSKI wyjątek reguły issue #55:
  blokadę widać z KONTROLKI NAD PRZYCISKIEM. Wpis NIECZYTELNY zdanie zachowuje, bo
  czerwona ramka mówi, KTÓRE pole, ale nie mówi, czemu zapisu nie ma. Do tego służy
  `Sheet.confirmDisabled` - i nowego użycia nie dokładaj bez tego rachunku.

  **ARKUSZ ODCZYTU WALIDUJE WARTOŚĆ NA MIEJSCU** (`logic/readingSheetWarning.ts`,
  z testami). Do 2026-08-29 sufit zbiornika i ciągłość z sąsiadem odzywały się dopiero
  na kroku 4 - czyli po zamknięciu arkusza, gdy liczby nie ma już przed oczami.
  Ostrzega: odczyt ponad pojemność, „po locie" ponad zastane + dolane, rozjazd
  z poprzednikiem/następcą w łańcuchu (`readings-chain`, tolerancja 6 L i 0,1 MH),
  cofnięty licznik. Kolejność sprawdzeń jest kolejnością POWAGI - arkusz pokazuje
  JEDNO zdanie, więc pierwsze musi być tym, które trzeba przeczytać. Olej dochodzi
  tą samą drogą (`oilEntryWarning` + `oilContinuityWarnings`). **Nic z tego nie
  blokuje**: paliwomierz i licznik są przyrządami fizycznymi i to one mają rację,
  a twarde odmowy domeny zostają w bramce kroku 4

  Trzy arkusze łamały to na trzy sposoby i wszystkie zostały poprawione: `ReadingSheet`
  i `OilSheet` wrzucały blokadę do banera, a przycisk sprawdzał warunek w środku
  `onConfirm` i po tapnięciu MILCZAŁ (§6 pkt 3); `ReadingCorrectionSheet` podawał
  `onConfirm: undefined`, a `Sheet` bez akcji nie rysuje przycisku WCALE - znikające
  „ZAPISZ KOREKTĘ" w wypełnianym formularzu czyta się jak usterka. **Brak akcji ma sens
  tam, gdzie akcji nie ma z definicji** (podgląd po oknie korekty 10B, pusta flota 02G),
  nie w formularzu, który pilot właśnie wypełnia. Czerwony baner „nie rozumiem tej
  wartości" znika razem z tym: nieczytelny wpis znaczy już czerwona ramka POLA, a ona
  jedna mówi, KTÓRE pole poprawić
- **pusta flota na kroku 1 = warning na CAŁY ekran, nie formularz** (`design/02g`,
  stan `noFleet` w `PreflightAircraftScreen`): sekcja „Samolot" z szarą linijką
  „brak samolotów w pamięci urządzenia" czytała się jak usterka, a o ścianie pilot
  dowiadywał się z zablokowanego DALEJ. Zamiast formularza bursztynowa karta z powodem
  i drogą wyjścia; DALEJ nie ma WCALE (wyszarzony przycisk obiecywałby akcję, której
  reguły nie dopuszczą - zasada z 10B). **Brama wieku cache referencyjnego (15 min)
  NIE trzyma pustej floty** (`referenceSync.refreshIfStale`, z testem): brama chroni
  dane już użyteczne przed odpytywaniem co puls, a bez ani jednego samolotu aplikacja
  nie ma czym pracować - pilot patrzyłby w warning przez kwadrans, choć administrator
  zdążył założyć flotę w panelu. Wejście w stan pyta serwer od razu, pętla synca
  ponawia co 60 s, a ekran czyta lokalną bazę co 5 s - formularz wraca sam.
  **„SYNCHRONIZUJ TERAZ" (13) ponagla odtąd OBA kierunki**: dopycha kolejkę wysyłki
  i pobiera dane referencyjne z pominięciem bramy wieku (`refreshReferenceNow`
  w store → `ReferenceSync.refresh()`, ETag dalej działa) - pilot sięgający po
  przycisk awaryjny pyta „co serwer wie teraz", a sama wysyłka odpowiadała na pół
  pytania. Stempel wieku danych w „O aplikacji" odświeża się od razu po przebiegu.
  **Od issue #75 pkt 1 ponagla też DOSYŁKĘ ZDARZEŃ** (`restoreEventsNow` →
  `EventRestore.restore()`, bez bramy wieku §4.9) - bez tego unieważnienie wpisane
  przez administratora czekało na telefonie do kwadransa mimo ręcznego ponaglenia;
  „PONÓW PRÓBĘ" w arkuszu SyncChipa robi ten sam komplet
- **„wstecz" z kroku 1 przy niepustym szkicu pyta o rezygnację** (`design/02h`,
  `AbandonDraftSheet` + `usePreventRemove` - ta sama mechanika co blokada kokpitu
  04D; od 2026-08-29 ten sam arkusz obsługuje wpis ręczny, patrz sekcja niżej).
  Potwierdzenie CZYŚCI szkic (`draft.reset()`): następne wejście zaczyna od nowa,
  bo porzucony formularz wracał z wyborami sprzed godziny i czytał się jak podpowiedź.
  Pusty formularz wychodzi bez pytania - arkusz nad niczym pytałby o zgodę na nic
  (`dirty()` w `preflightDraft.ts`, z testami). Bramka gaśnie po ukończeniu flow
  (krok 3 czyści szkic), więc zwinięcie stosu po zdaniu samolotu przechodzi bez arkusza.
  Zatrzymana akcja nawigacji jedzie dopiero z efektu PO re-renderze z opuszczoną bramką
- **przypisy o budowie aplikacji wyleciały z dwóch miejsc**: spod klawiatury PIN
  („PIN odblokowuje aplikację bez sieci…" przy ustawianiu PIN-u ORAZ - druga tura
  z urządzenia - „Pełne logowanie wymaga internetu" pod „Nie pamiętam PIN":
  ograniczenie mówi o sobie samo na 00B i nazwanym błędem po nieudanej próbie
  logowania, a nie codziennie pod klawiaturą; strażnik outboxa zostaje, bo niesie
  BLOKADĘ z powodem) i z pustego stanu „Poprzednich dni" (wzmianka „również bez
  zasięgu") - pusty stan 12 mówi teraz o WARTOŚCI ekranu (komplet czasów i lotów,
  okno korekty 24 h), nie o tym, skąd liczy dane

## Kontrolka = pole z arkusza, kalendarz daty, klawiatura od razu (issue #58, 2026-08-27)
Dziesięć uwag z urządzenia wokół wpisu ręcznego (15) i design systemu:
- **metryka wartości w kontrolce formularza = pole wpisu z arkusza: mono 16 / odstęp 1,5**
  (`ValueBox`, mockupy 15/15A–C/15E/02E/02F/09B). Kontrolka jest tym samym polem
  oglądanym w spoczynku - 22 px robiło z każdej wartości bohatera ekranu. Większe
  stopnie zostają w ARKUSZACH edycji (`ReadingSheet`/`OilSheet`: odczyt 22 od uwagi
  2026-09-02, wcześniej 30–32 - patrz `valueFieldMetrics.ts`) - tam się wpisuje,
  tu się czyta
- **placeholder jest ZAWSZE składem tekstowym: body 15 w `--text-placeholder`**
  (trzecia i czwarta tura #58) - dokładnie jak placeholder arkusza notatki.
  Placeholder to instrukcja („wybierz lotnisko", „Kod ICAO albo nazwa…"), nie
  wartość, więc NIE dziedziczy kroju liczb - mono robił z zachęty wpisany kod.
  W kontrolkach (`ValueBox`) wysokość trzyma `minHeight`, więc osobny skład niczym
  nie skacze. W polach `TextInput` reguła obowiązuje TAK SAMO: pole tekstowe
  (notatka, klient) ma ją za darmo (natywny placeholder dziedziczy body), a pole
  MONO - wyszukiwarka lotniska - dostaje zachętę NAKŁADKĄ `PlaceholderOverlay`
  nad polem o stałej metryce, bo natywnego placeholdera nie da się ostylować
  osobno, a zmiana kroju całego pola przy pustym stanie skakałaby wysokością.
  Nowe pole mono z placeholderem idzie przez tę nakładkę. Pola zdań pilota
  (klient, notatka) to `ValueBox variant="text"` na KAŻDYM ekranie - na 15 brak
  wariantu składał wartości licznikiem
- **wariant tekstowy `ValueBox` zawija się W CAŁOŚCI** (klient, notatka): ucięta
  notatka wyglądała, jakby się nie zapisała. Bez `numberOfLines`
- **arkusz z polem wpisu otwiera się Z KLAWIATURĄ**: hook `useSheetInputFocus`
  (drabinka prób) - callback ref na polu + `onShow` przez ramę `SheetSurface.onShow`
  → `Sheet.onShow`; korzystają AirfieldSheet, TextEntrySheet, ReadingSheet i OilSheet
  (dołączony 2026-09-02 - otwierał się gołym `autoFocus`, czyli bez klawiatury). TRZY
  podejścia JUŻ zawiodły i nie wracamy do nich (historia w `hooks/keyboardFocus.ts`):
  `autoFocus` odpala się przy montowaniu, zanim okno modala istnieje; pojedyncze
  `focus()` w `onShow` bywa przed fokusem IME okna i ustawia fokus widoku BEZ
  klawiatury (drugi focus na skupionym polu to no-op); start drabinki wyłącznie
  z `onShow` gubił pierwszą próbę, bo `onShow` potrafi wyprzedzić commit dzieci
  modala (ref pusty → klawiatura dopiero z ponowienia = widoczne opóźnienie).
  Drabinka rusza więc w PÓŹNIEJSZYM z dwóch zdarzeń (okno pokazane, pole
  zamontowane - `shouldStartLadder`) i ponawia przez `blur()`+`focus()`, dopóki
  klawiatura nie wyjdzie. **Odstępy ponowień: patrz „ponowienie fokusu jest drogie"
  niżej** - nie dobieraj ich pod „żeby było szybciej", bo ponowienie nie otwiera
  klawiatury, tylko naprawia próbę, która zawiodła. Nowy arkusz z wpisem MUSI iść
  przez ten hook
- **data lotu jest PIERWSZYM polem kroku 1 wpisu ręcznego** - wpis zaczyna się od
  „którego to było?", potem czym. Przypis „doba liczy się od uruchomienia silnika"
  zniknął z formularza; to samo zdanie stoi w arkuszu daty jako ZWYKŁE zdanie
  (nie wersalikowa etykieta) - przy kontrolce, której dotyczy
- **arkusz daty = KALENDARZ MIESIĘCZNY** (`CalendarGrid` + `calendarMonth.ts`
  z testami; mockup 15E) - odwraca decyzję z 2026-08-16 („kalendarza NIE MA"):
  kalendarz jest kontrolką, którą pilot zna, odklikiwanie ±1 dzień - tą, której
  musiał się uczyć. Skróty „Wczoraj"/„Dzisiaj" zostają NAD siatką (obsługują niemal
  każdy wpis); tydzień od PONIEDZIAŁKU, doby = północe UTC, dni przyszłe wygaszone,
  dni sąsiednich miesięcy nierysowane, strzałka „nowszy" gaśnie na bieżącym miesiącu.
  Nagłówek miesiąca w MIANOWNIKU (`monthYearUtc` w `@ninerdeck/format`)
- **wymóg Duala działa TAKŻE we wpisie ręcznym**: An-2 z kartki podlega temu samemu
  prawu, co na preflightcie - bursztynowa plakietka „wymagany · załoga 2-os." przy
  nagłówku i powód W PRZYCISKU (`logic/dualRequirement.ts` - patrz sekcja niżej;
  baner pod listą i `manualFlightNeedsDual` usunięte 2026-08-29). **Wybór Duala PRZEŻYWA wybór i zmianę
  samolotu** (druga tura z urządzenia: pilot wybrany przed samolotem znikał po
  tapnięciu w maszynę) - wymóg jest właściwością samolotu, ale wybrana OSOBA nie
  traci ważności przy zmianie maszyny; lista Duali nie zależy od samolotu, więc
  kasowanie było czystą stratą wyboru. Obowiązuje na 02 i 15 (`preflightDraft.test.ts`)
- **trasa we wpisie ręcznym jest WYMAGANA** (`manualFlightStepBlocker`, krok 2):
  bez lotniska (przy operacji z parą - bez OBU) DALEJ stoi z powodem w przycisku.
  Pole bez plakietki „opcjonalne" obiecuje wymóg, więc bramka go egzekwuje. To
  świadome odejście od 02E, gdzie pustą trasę wolno zostawić (start silnika ma
  trwać sekundy - fakt lotu > kompletność formularza): wpis opisuje lot, który JUŻ
  się odbył, więc „jeszcze nie wiem, dokąd" nie istnieje. Jedyny wymóg czysto
  produktowy w blokadzie (reszta to twarde odmowy domeny)
- **skeleton „Mojego dnia" = JEDNA plamka-kafelek** + trójka sum: część wspólna doby
  pustej (karta „DZIŚ BEZ LOTÓW" ma tę samą wysokość 156 dp) i doby z operacjami -
  dwie plamki zgadywały wariant i przy pustym dniu pół ekranu skakało
- **arkusz Klient/Notatka nie ogłasza braku podpowiedzi**: zdanie „podpowiedzi
  wymagają połączenia - wpisz wartość ręcznie" USUNIĘTE (opisywało budowę aplikacji
  komuś, kto chce coś wpisać - kategoria przypisów z issue #43); offline i wpis
  ręczny (`suggestions: null`) renderują nic. Stany „historia pusta" i „brak
  w historii" zostają - mówią o liście, która istnieje

## Kontrolka czasu, oś wpisu ręcznego, kod spoza katalogu (issue #62, 2026-08-28)
Dziesięć uwag z urządzenia; sześć pierwszych mieszka w JEDNEJ kontrolce czasu, więc
poprawka dosięgła ośmiu arkuszy naraz.
- **kropka i przecinek ZNACZĄ dwukropek** (`maskTimeUtcInput`) - maska wycinała je razem
  z resztą niecyfr, więc „8.30" wychodziło jako **„83:0"**, `parseTimeUtcOnDay` odrzucał
  to (83 > 23), a `Stepper` cicho zostawiał wartość sprzed edycji. Reguła jest ta sama,
  co w `maskMotoHoursInput`: PIERWSZY separator kończy część godzinową. Stąd też druga
  połowa zgłoszenia - „przyciski nie przesuwają wpisanej godziny" - bo przesuwały tę,
  której pilot nie wpisał
- **krok ± liczy się od WPISU W TOKU**, nie od wartości sprzed otwarcia klawiatury:
  zatwierdzenie pola dzieje się przy `onBlur`, więc w chwili tapnięcia świeża wartość
  istnieje TYLKO w `draft` (`Stepper.bump`). Przy okazji `StepButton` wyszedł z ciała
  `Stepper` - zadeklarowany w środku był przy każdym renderze NOWYM typem komponentu,
  co odmontowywało `Pressable` w połowie tapnięcia
- **wartości domyślnej NIE MA** (`Stepper`/`TimeStepper` przyjmują `value: number | null`,
  mockup `15F`): arkusz biegu silnika otwierał się z 10:00 i 11:00, których nikt nie
  wpisał - a podstawiona godzina wygląda jak wpisana, służy potem za punkt odniesienia
  podpisu i za bazę kroku. Ta sama reguła, która każe wpisywać paliwo przed uruchomieniem
  zamiast brać je z cache. Przy `null` przyciski ± są wygaszone, a zapisu pilnuje blokada
- **przesunięcie ponad godzinę mówi w godzinach** („+3 h 25 min", nie „+205 min")
- **arkusz czasów sam sprawdza kolejność pary** (`flightTimesBlocker`, mockup `15G`) -
  odmowa padała dopiero przy „DALEJ", gdy obu godzin nie było już widać. Zdanie mówi
  o SKUTKU („blok wychodzi ujemny"), bo nazwy pól są w mianowniku, a odmiany nie da się
  wyprowadzić regułą; ta sama blokada obsługuje przez to obie role arkusza
- **z arkusza czasów znikła DATA** (niesie ją podtytuł ekranu), UTC zeszło do ETYKIET pól,
  a **czas lokalny stanął W LINII ETYKIETY, PO PRAWEJ** (`TimeStepper.localTime` →
  `Field.labelNote`) - do #62 składał go sobie sam arkusz 05F (issue #19), choć pytanie
  „która to u mnie godzina" pada przy każdym wpisywanym czasie. **Pod kontrolką stał
  za nisko** (uwaga z urządzenia, 2026-08-29): wisiał ZA zarezerwowanym wierszem podpisu
  przesunięcia i złożony tak samo jak wiersze odniesienia arkusza - więc czytał się jak
  pierwszy z NICH, a nie jak przypis do godziny nad nim. W linii etykiety para mówi
  wszystko sama (po lewej strefa wpisu, po prawej „która to u mnie"), nic nie kosztuje
  w pionie, a przy PARZE kontrolek każda godzina ma swoje LT dokładnie nad sobą.
  `labelNote` to goła linijka mono, nie plakietka: `tag` mówi o WŁAŚCIWOŚCI pola
  („opcjonalne"), adnotacja o jego bieżącej WARTOŚCI widzianej inaczej
- **wartość wychodzi na KAŻDĄ ZMIANĘ TEKSTU, nie przy `onBlur`** (druga tura z urządzenia):
  wpis szedł do rodzica dopiero po wyjściu z pola, więc czas trwania pary, podpis
  przesunięcia i powód blokady „ZAPISZ" odpowiadały dopiero po tapnięciu gdzieś obok -
  pilot patrzył na wiersz „Blok" i widział poprzedni wynik. Wpis niepełny („08:3") nie
  parsuje się i po prostu nie rusza wartości; `commit` przy `onBlur` zostaje domknięciem
  (kasuje szkic i przywraca widok wartości). **Ta reguła obowiązuje każde pole wpisu**:
  formularz odpowiada na to, co pilot właśnie napisał, a nie na to, co zatwierdził
- **ARKUSZ I KLAWIATURA WCHODZĄ RAZEM** (szósta tura z urządzenia: „otwiera się popup
  i po krótkiej chwili otwiera się klawiatura"). To nie było złe wyczucie czasu w JS,
  tylko kolejność wymuszona przez system: `Modal` na Androidzie jest OSOBNYM OKNEM
  natywnym, a IME może przyczepić się wyłącznie do okna z fokusem wejścia - więc
  animacja wjazdu okna leżała na krytycznej ścieżce klawiatury.
  - **`animationType="none"` na `Modal`, a panel animuje `SheetSurface` sam**
    (`Animated` po `transform`/`opacity`, `useNativeDriver` - bez modułu natywnego,
    jak puls skeletonów). Okno pojawia się natychmiast, `onShow` pada od razu, a ruch
    panelu biegnie RÓWNOLEGLE z wjeżdżającą klawiaturą
  - **wyjazd trzyma okno dłużej niż `visible`**: `Modal` odmontowuje dzieci
    natychmiast, więc bez tego panel znikałby skokiem. Otwarcie W TRAKCIE wyjazdu ubija
    tamtą animację (`stopAnimation` → `finished: false`), inaczej jej callback zamknąłby
    arkusz właśnie otwarty
  - **wysunięcie rusza w PÓŹNIEJSZYM z dwóch zdarzeń** (okno pokazane, panel zmierzony)
    - ta sama koniunkcja i ten sam powód, co przy drabince fokusu
  - **drabinka fokusu ZOSTAJE**, ale w węższej roli: broni już tylko przed `onShow`
    wyprzedzającym commit dzieci modala, nie przed animacją okna. Odstępy przestrojone
    wtedy na 50/180/400/800 okazały się jednak BŁĘDEM - patrz punkt niżej
  - **zamykany arkusz NIE ŁAPIE DOTYKU** (`pointerEvents` po `visible`, nie po animacji):
    odkąd okno żyje dłużej niż `visible`, pełnoekranowa nakładka przez ~160 ms po
    zamknięciu zjadała pierwsze tapnięcie w ekran pod spodem („jakby 2× muszę wcisnąć
    DALEJ"). Arkusz w trakcie wyjazdu ma być już tylko OBRAZEM
  - **PONOWIENIE FOKUSU JEST DROGIE I DLATEGO STOI DALEKO** (uwaga z urządzenia,
    2026-08-29: „otwiera się klawiatura i znika"). Przestrojenie odstępów na
    50/180/400/800 wzięło się z myślenia, że wcześniejszy rung = szybsza klawiatura.
    Ponowienie NIE OTWIERA klawiatury - otwiera ją próba nr 0 w `onShow`. Ponowienie
    NAPRAWIA próbę, która zawiodła, a o tym, że zawiodła, nie da się wiedzieć, dopóki
    klawiatura ma jeszcze czas wyjść: jedyny sygnał sukcesu (`keyboardDidShow`) pada
    na końcu jej animacji (~300 ms). Rungi 50 i 180 wypadały więc w środku tej animacji,
    widziały `Keyboard.isVisible() === false` i robiły `blur()`+`focus()` - chowały
    klawiaturę, którą same przed chwilą wywołały, i to przy KAŻDYM normalnym otwarciu.
    Odtąd: `KEYBOARD_SHOW_MS` = 300 jako nazwana granica, `RETRY_DELAYS_MS` = [350, 800]
    za nią, a `useSheetInputFocus` kasuje wiszące rungi na `keyboardDidShow` - przy
    udanym otwarciu nie odpala się ani jeden. Niezmiennik „żadne ponowienie przed
    `KEYBOARD_SHOW_MS`" ma test; poprzedni test wymagał `≤ 80 ms`, czyli PILNOWAŁ
    usterki - dobierając te liczby, pilnuj sygnału, nie wrażenia szybkości
  - **kontrolka `autoEdit` NIE ZWIJA SIĘ przy wyjściu z pola** (`Stepper.onBlur`, ta
    sama uwaga): `commit` kasuje szkic, a szkic jest warunkiem renderowania `TextInput`,
    więc każdy `blur()` ODMONTOWYWAŁ pole. Poza `autoEdit` to jest sens domknięcia
    (pilot tapnął gdzie indziej, wraca widok wartości), ale przy `autoEdit` pole JEST
    kontrolką - a `blur()` przychodzi tam nie tylko od pilota: robi je ponowienie
    drabinki. Kontrolka zamieniała przez to nieudaną próbę fokusu w ZNIKNIĘCIE POLA.
    Nic się nie gubi, bo wartość wychodzi na każdą zmianę tekstu: `commit` przy wyjściu
    nie jest zapisem, tylko domknięciem widoku
  - **przy JEDNEJ kontrolce etykieta nie powtarza tytułu**: „URUCHOMIENIE" nad polem
    „Uruchomienie (UTC)" to było jedno słowo dwa razy. Zostaje sama jednostka
    („Godzina (UTC)"); przy parze kontrolek etykiety wracają do nazw, bo wtedy odróżniają
  - **pole KONTEKSTU nie jest polem do wypełnienia** (`FlightTimesPair.readOnly`):
    blokada żądała wartości także od drugiego końca pary, którego arkusz nie pokazuje -
    a przy pierwszym wpisywaniu biegu silnika ten koniec z definicji jest pusty, więc
    „wpisz obie godziny" nie gasło NIGDY i nie dało się zapisać wpisanej godziny.
    Kontekst wchodzi do porównań (kolejność, granice) tylko wtedy, gdy MA wartość
  - `SheetSurface` jest JEDYNYM `Modal`-em w aplikacji, więc ta zmiana obejmuje
    wszystkie osiem arkuszy naraz
- **arkusz czasu OTWIERA SIĘ Z KLAWIATURĄ, ale TYLKO NAD PUSTĄ GODZINĄ** (trzecia tura;
  zawężone 2026-08-29 uwagą z urządzenia). Pierwotny rachunek - „formularz o jednym
  pytaniu, więc pilot i tak tapie w wartość" - jest prawdziwy dla arkusza stawiającego
  godzinę OD ZERA (15F) i fałszywy dla wszystkich pozostałych: „jak mam «dodaj lot»,
  gdzie mam już wpisane default wartości, to nie otwieraj klawiatury - tutaj raczej będę
  korzystał z przycisków ±1 min. Tak samo jak otwieram popup, aby wyedytować godzinę".
  **Reguła: klawiatura wchodzi sama wyłącznie tam, gdzie nie ma czego przesuwać** -
  przy pustej wartości ± są wygaszone (brak bazy dla kroku), więc wpis jest jedyną
  drogą; przy wpisanej zasłaniałaby drugą kontrolkę pary i wiersz „Blok" pod nią.
  Decyzja siedzi w KONTROLCE (`stepperOpensForTyping`, z testami), nie w arkuszu, bo
  jest własnością `autoEdit` jako takiego - każdy przyszły arkusz dostaje ją za darmo.
  `Stepper.autoEdit` startuje wtedy w trybie wpisu (pole musi ISTNIEĆ, żeby callback ref
  miał się na czym zawiesić), a klawiaturę podnosi drabinka `useSheetInputFocus` i nic
  innego. `autoFocus` działa TYLKO poza `autoEdit`: przy `autoEdit` pole montuje się
  razem z arkuszem, czyli zanim okno modala istnieje - to jest dokładnie pierwszy
  z trzech błędów opisanych w `hooks/keyboardFocus.ts`
- **„WSTECZ" W STEPPERZE COFA O KROK, A Z PIERWSZEGO PYTA O REZYGNACJĘ** (uwaga
  z urządzenia, 2026-08-29). Stepper wpisu ręcznego jest JEDNYM ekranem nawigacji, a krok
  to jego stan - więc strzałka w nagłówku cofała o krok, a przycisk sprzętowy i gest
  krawędziowy zdejmowały ze stosu CAŁY wpis („jak cofam z definicji zadania, to jest
  cofnięcie do ekranu startu"). Dwa „wstecz" na jednym ekranie mają robić to samo:
  łapie je `usePreventRemove` (ta sama mechanika, co blokada kokpitu 04D i rezygnacja
  z preflightu). Z kroku 1 przy NIEPUSTYM szkicu wchodzi arkusz rezygnacji - pusty
  wychodzi bez pytania (`manualFlightDirty`, liczone z KLUCZY pustego szkicu, więc nowe
  pole wchodzi do rachunku samo; ręczna koniunkcja przestałaby być prawdziwa przy
  pierwszym dopisanym polu i nikt by tego nie zauważył). Arkusz jest JEDEN dla obu dróg
  do lotu - `AbandonDraftSheet` (dawny `AbandonPreflightSheet`), a parametrami idą tytuł
  i wiersze podsumowania. **Arkusz nie ma banera** (druga uwaga z tego samego dnia):
  zdanie „Do rejestru nie trafiło jeszcze nic - zapis robi dopiero «ZAPISZ LOT»…"
  USUNIĘTE, bo „nic nie wnosi i zamiast tłumaczyć stawia jeszcze więcej pytań" -
  opowiadało o REJESTRZE komuś, kto chce tylko wyjść z formularza, a przy okazji
  podsuwało myśl, że coś jednak mogło się zapisać. Ta sama kategoria przypisów, którą
  issue #43 wyrzuciło z arkuszy korekty. Arkusz mówi, CO PILOT STRACI (wiersze
  odniesienia), i nic ponadto
- **arkusz ma tyle kontrolek, ile pytań** (trzecia tura): tapnięcie w START na osi
  otwierało parę start + lądowanie, czyli dawało kontrolkę, o którą nikt nie prosił -
  „skoro klikam w konkretną pozycję, to wiem, że tylko to chcę edytować". Cel osi niesie
  więc KONIEC pary (`ManualAxisTarget.field`), tytuł go nazywa („START · LOT 2"),
  a drugi koniec schodzi do wiersza odniesienia (`FlightTimesField.readOnly`) - nie
  znika, bo pilot poprawia godzinę WZGLĘDEM niego, a reguła kolejności musi mieć co
  porównać. Para w całości zostaje tam, gdzie powstaje w całości: „DODAJ LOT" i wejście
  z karty „Bieg silnika"
- **lot musi MIEŚCIĆ SIĘ w biegu silnika, a arkusz mówi to od razu** (trzecia tura):
  przyjmował start po wyłączeniu silnika bez słowa, a odmowa padała dopiero przy „DALEJ".
  `FlightTimesBounds` jest osobne od `min`/`max` ŚWIADOMIE: granice steppera przycinają
  wpis po cichu, a cichej poprawki wartości pilota ta aplikacja nie robi (§6 pkt 3) -
  wyjście poza okno jest blokadą z nazwanym powodem. Kolejność godzin ma pierwszeństwo
  przed granicami (najpierw to, co widać w kontrolce nad przyciskiem)
- **arkusz wyboru lotniska nie powtarza placeholdera** (druga tura z urządzenia):
  przypis „Wpisz kod ICAO albo nazwę lotniska" mówił dokładnie to, co pole wpisu dwa
  centymetry niżej. Bez pozycji i bez wpisu arkusz jest PUSTĄ WYSZUKIWARKĄ i tak ma
  wyglądać - pustka nie wymaga tu podpisu
- **rezygnacja z wartości to „×" PRZY NIEJ**, nie link pod listą: „Wyczyść lotnisko
  (EPKK)" na dnie arkusza stało osobno, powtarzało kod widoczny wyżej i nazywało
  czynność, którą ikona mówi krócej (`IconAction name="clear"`; kosz zostaje przy
  ODEJMOWANIU z rejestru i dlatego jest czerwony). W sekcji „Wybrane" ptaszek USTĘPUJE
  temu „×" - prawa krawędź wiersza niesie jedną rzecz, a nagłówek sekcji już mówi,
  że to jest wybrane. W liście wyników ptaszek zostaje: tam odróżnia jeden wiersz
  od kilku podobnych, kształtem, a nie samym kolorem
- **KOD SPOZA KATALOGU jest OZNACZONY** (`airfieldMark.ts`): w arkuszu bursztynowy wiersz
  z plakietką „spoza katalogu", w formularzu ta sama plakietka przy wartości. Do #62 EDDB
  wyglądało dokładnie jak EPKK, a jedyną różnicą był BRAK drugiej linii z nazwą - sygnał
  negatywny. **Nazwa albo plakietka, NIGDY obie** (prawa krawędź niesie jedną rzecz).
  Napis mówi o SKUTKU tapnięcia („Zapisze się sam kod, bez nazwy lotniska"), a nie
  o zawartości katalogu - „katalog zna tylko polskie lotniska" opisywało budowę aplikacji
  komuś, kto wpisuje kod lotniska docelowego

### Krok 3 wpisu ręcznego = OŚ OPERACJI (issue #62 pkt 8–10)
Krok 3 pokazywał DWIE PŁASKIE LISTY obok siebie („Loty" i „Zrzuty"), więc zrzut nie miał
jak powiedzieć, do którego lotu należy - mimo że model to wie: `DropPayload` **nie ma**
pola z numerem lotu i mieć nie musi, bo przynależność jest ZAWIERANIEM SIĘ W CZASIE
i tak sprawdza ją `DROP_ON_GROUND` (`rules/consistency.ts`). Wiedział model, milczał ekran.
- **oś jest ta sama, co w kokpicie i w rozliczeniu** (`SessionAxis`; builder ze szkicu:
  `logic/manualFlightAxis.ts`, mockup `15b`). Zrzut stoi między startem a lądowaniem
  swojego lotu i niesie jego numer w prawej kolumnie - tej samej, która przy starcie
  mówi „który lot się tu zaczyna"
- **wiersz ma tu 44 px, nie 28**: w rozliczeniu oś jest opisowa i rytm celu dotykowego
  marnowałby kolumnę (issue #40), a tutaj KAŻDY wiersz otwiera swój arkusz
- **zrzut poza każdym lotem** dostaje bursztynową kropkę, podpis „poza lotem" i baner -
  ale NIE blokuje zapisu (fakt lotu > kompletność formularza; domena też trzyma tę regułę
  jako ostrzeżenie). Baner stoi na kroku 3, nie 4: ostrzeżenie ma być tam, gdzie da się
  je naprawić
- **DZIEŃ SKOKOWY BEZ ANI JEDNEGO ZRZUTU OSTRZEGA** (`jumpDayWithoutDrop`, zgłoszenie
  z urządzenia 2026-08-29): zrzut jest TREŚCIĄ zadania skokowego, więc jego brak niemal
  zawsze znaczy, że pilot o nim zapomniał - a zapomnianego nie odtworzy nikt, bo skład
  i wysokość zna wyłącznie ten, kto leciał. Na żywo problem nie istnieje (zrzut zapisuje
  się przyciskiem w chwili wyniesienia), więc pyta o to sam wpis ręczny. **Nigdy blokada**:
  lot skokowy bez wyniesienia zdarza się naprawdę (chmura, powrót z pełną kabiną), więc
  zdanie podaje OBIE drogi wyjścia - dopisz albo zostaw. Baner na kroku 3 (tam stoi
  „DODAJ ZRZUT") i pozycja w ostrzeżeniach kroku 4, jak przy zrzucie poza lotem.
  **Milczy bez ani jednego lotu**: mówi wtedy ostrzeżenie `no-flight`, a zrzut nie ma
  jeszcze do czego należeć - dwa zdania o pustym logu naraz byłyby szumem
- **OŚ ISTNIEJE OD PIERWSZEJ SEKUNDY, a karty „Bieg silnika" NIE MA** (czwarta tura
  z urządzenia; mockup `15H` = ten sam układ, co `15B`). Karta niosła parę godzin, którą
  oś rysuje jako swój pierwszy i ostatni wiersz - „dubluje się «bieg silnika» z tym, co
  mam na osi czasu, nie ma sensu ten input". Oba końce startują z `--:--` i SAME są
  wejściem w wpisanie godziny, więc pusty krok 3 i krok 3 z pełną operacją to ten sam ekran
  w dwóch stanach. Stopka sum czeka na bieg (trójka zer byłaby liczbą o niczym), a wiersza
  „DODAJ LOT" nie ma, dopóki oba końce nie mają godziny - to BRAK AKCJI, nie wyszarzony
  przycisk (zasada z 10B i 02G); powód niesie „DALEJ" bursztynem w środku
- **KOLEJNOŚĆ OSI IDZIE LOTAMI, NIE GLOBALNĄ RANGĄ TYPU** (czwarta tura): przy locie
  startującym DOKŁADNIE w godzinie lądowania poprzedniego stała ranga „start przed
  lądowaniem" dawała obraz lotu, który zaczął się przed wylądowaniem poprzedniego.
  Jednej rangi nie da się dobrać - wewnątrz lotu start musi wyprzedzać lądowanie,
  a MIĘDZY lotami odwrotnie - więc każdy lot wykłada swoje wiersze w komplecie
  (start → jego zrzuty → lądowanie), a loty idą po sobie w porządku czasu. Zrzuty poza
  lotami wchodzą po czasie
- **PALIWO TO TRZY LICZBY I ANI JEDNA GODZINA** (siódma tura, mockup `15C`;
  `ManualFlightFuel` w `logic/manualFlight.ts`): „system wykrywa ilość paliwa w oparciu
  o poprzedzający lot, później podaję, ile paliwa zostało dotankowane oraz ile paliwa
  zostało po wykonaniu operacji. Nie ma sensu podawać godziny, kiedy nastąpiło dolanie
  albo pomiar - to wynika z godzin, kiedy samolot został uruchomiony i wyłączony."
  Szkic trzyma `{ foundL, addedL, afterL }`, a kolejność pól zastępuje godziny:
  zastane → dolane → (lot) → zostało.
  - **ZASTANE wykrywa się z operacji poprzedzającej** (`readings-chain`) - razem
    z LICZNIKIEM, bo jedna odpowiedź niesie oba (ósma tura). Reguły podstawiania
    i granica „czego nie podstawiamy": sekcja o łańcuchu niżej
  - **dolewka nie jest już pozycją listy**: jedna liczba, a zdarzenie `refuel` składa się
    przy zapisie minutę PRZED uruchomieniem. `RefuelEntrySheet` i `manualFuelChain.ts`
    SKASOWANE
  - **trzy rzeczy zniknęły razem z godzinami**: (1) minuta dolewki nie ważyła nigdzie -
    w obu dozwolonych oknach silnik stoi, więc żaden interwał analityki się nie zmienia;
    (2) dolewkę dało się wpisać na ŚRODEK biegu, czyli w stan, który domena odrzuca -
    dziś jest NIEWYRAŻALNY, więc blokada `REFUEL_ENGINE_RUNNING` przestała być potrzebna;
    (3) odczyt „przed uruchomieniem" był stanem PO porannym tankowaniu, więc rachunek
    musiał go cofać o dolewki sprzed niego (`preRunAddedL`), inaczej litry liczyły się
    podwójnie. **Ta pułapka zniknęła razem z polem, które ją tworzyła** - `initialReading`
    to wprost `foundL`
  - **bilans „paliwa po locie więcej, niż mogło być" przestał być ostrzeżeniem**: domena
    odrzuca ten stan twardo (`FUEL_INCREASE_WITHOUT_REFUEL`), więc mówi o nim BLOKADA.
    Sufitem jest `foundL + addedL`
- **NORMA LICZY SIĘ NA KROKU 4** (`logic/manualFlightBalance.ts`): oczekiwanie i pasmo
  liczy DOMENA (`consumption/expectation.ts`) z normy w cache referencyjnym, więc werdykt
  powstaje OFFLINE - ta sama arytmetyka, którą po zapisaniu pokaże ekran 10. Bez normy
  maszyny ekran MILCZY o oczekiwaniu (brak normy nie jest brakiem danych pilota), a
  werdykt poza pasmem jest BURSZTYNOWY: paliwomierz i licznik mają rację. Podpis
  „przyrost … · blok …" USUNIĘTY - przyrost licznika nie równa się blokowi i nie ma
  prawa się równać (poprawka z issue #38, tu powtórzona)
- **NORMA NA KROKU 4 TO TEN SAM RACHUNEK, CO PO ZAPISANIU** (uwaga z urządzenia,
  2026-08-29: „jak mam wpisanie paliwa, to może odpalisz ten moduł, co przy
  automatycznym locie? […] jak go kliknę, to otwierają się szczegóły, jak to zostało
  policzone"). Krok 4 pokazywał sam werdykt, więc pilot widział „↑ POWYŻEJ NORMY"
  i nie miał jak sprawdzić, z czego to wyszło - a ekran rozliczenia (10) odpowiada
  na to od issue #40.
  - **zależność `sessionBalance` od projekcji była POZORNA**: rachunek czyta z niej
    DWIE liczby (czas blokowy i czas w powietrzu) plus odczyty, a jedno i drugie wpis
    ręczny ma w szkicu. Stąd podział na RDZEŃ (`fuelBalanceOf`, `mhBalanceOf` - biorą
    fakty) i cienkie adaptery `fuelBalance`/`mhBalance` dla projekcji. Ekran 10 woła
    je jak dotąd, krok 4 woła rdzeń przez `manualFuelBalanceView`/`manualMhBalanceView`
  - **do karty wchodzi SAMO PODSUMOWANIE, nie cały rachunek** (druga uwaga tego dnia:
    „trochę dublujemy to, co jest w inputach - nie możesz dodać tylko tego podsumowania
    do sekcji PALIWO?"). Wiersze działania wypisywały zastane, dolane i po locie, czyli
    dokładnie te trzy liczby, które pilot ma w polach wyżej. Osobne karty rachunku
    ZNIKNĘŁY, a do kart „Paliwo" i „Motogodziny" doszedł `BalanceSummary` - suma,
    plakietka werdyktu i ARKUSZ SZCZEGÓŁÓW (10C) pod tapnięciem. Rozpisane działanie
    nie ginie: mieszka w arkuszu, czyli tam, gdzie pada pytanie „jak to policzone".
    Ta sama zasada, którą issue #40 zastosowało na 10 - karta odpowiada „czy dobrze",
    arkusz „dlaczego"
  - **`BalanceSummary` jest WSPÓLNY**: `BalanceCard` (ekran 10, gdzie składowych nie ma
    nigdzie indziej, więc karta je rozpisuje) nosi go tak samo. Różnica między tymi
    powierzchniami jest DOKŁADNIE JEDNA - obecność wierszy działania
  - **podpis „zużycie 36 L · przed startem …" USUNIĘTY**: mówił to samo, co wiersz sumy,
    tylko w linii i bez werdyktu
  - wiek normy zszedł przy okazji DO ARKUSZA (§4.8, reguła z issue #40): przy karcie
    została sama plakietka, a adnotacja o cache'u bez liczb obok nie ma czego kwalifikować
  - **`ManualBalance` i spółka USUNIĘTE**: były DRUGIM rachunkiem tej samej wielkości,
    a takie pary rozjeżdżają się przy pierwszej poprawce jednej z nich. Została
    `manualPhaseTimes` (czasy faz ze szkicu) i dwa adaptery
  - **SZLAK TEJ OPERACJI W ARKUSZU ODCZYTU KOŃCOWEGO** (uwaga z urządzenia,
    2026-09-04: „w manualnym locie z paliwem zastanym czemu nie dasz też info, ile
    użytkownik przejął, ile dolał, ile latał i ile wpisał, że zostało. To samo
    motogodziny i olej"). Szlaki wpisu ręcznego opowiadały wyłącznie o SĄSIEDZIE
    z łańcucha, a o wpisywanej operacji nic - rachunek istniał, ale żeby go zobaczyć,
    trzeba było zamknąć arkusz i tapnąć plakietkę werdyktu. Odtąd pola „po locie"
    (paliwo i MH) niosą chronologię: zastane (ze źródłem) → dolane → latano (blok,
    czas w powietrzu, zużycie z normy) → ZIELONE oczekiwanie → co zastał następny.
    `logic/manualReadingsTrail.ts`, z testami; oczekiwanie liczą TE SAME
    `expectedFuelL`/`expectedMhH`, z których powstaje werdykt karty, a zielone ogniwo
    paliwa składa `fuelExpectationRow` - jedna liczba nie ma prawa nazywać się
    czterema zdaniami na 06, 09B, 02A i tutaj (przy normie z DOKUMENTACJI ogniwo mówi
    „z dokumentacji jednostki" zamiast okna centyli, bo pasmo jest tam zadeklarowane,
    nie zmierzone). Pole DOLEWKI szlaku nie dostaje: rejestr nie wie, ile pilot
    zatankował, a ze szkicu wyszłyby liczby stojące w polach obok
  - **OLEJ DOSTAŁ OCZEKIWANIE Z NORMY** (ta sama uwaga): `oilConfig.normLPerH` było
    we wpisie ręcznym `null` z uzasadnieniem „rachunek mówiłby o innym dniu" - prawdziwym
    dla kotwicy z cache przekazania i nieprawdziwym od issue #62, bo kotwicę daje
    `readings-chain` pytany o CHWILĘ URUCHOMIENIA tego wpisu. Arkusz oleju pokazuje
    więc ten sam szlak, co 02I („Ostatni pomiar" → „Latano · ΔMH" → „na bagnecie
    oczekuj ≈"), liczony tym samym `oilClaimView`
  - **wiersz odniesienia gaśnie od OGNIWA SĄSIADA, nie od całego szlaku**: gdyby
    bramkowała go cała tablica, wpis bez sieci (szlak operacji jest, łańcucha nie ma)
    zostałby bez jedynego punktu odniesienia, jaki wtedy istnieje - przekazania z cache
- **CIĄGŁOŚĆ ODCZYTÓW Z SĄSIEDNIMI OPERACJAMI** (piąta i szósta tura;
  `GET /aircraft/:id/readings-chain`, `server/src/domain/readingsChain.ts`,
  `logic/readingsContinuity.ts`, `hooks/useReadingsChain.ts`): maszyna nie tankuje się
  sama między operacjami, więc ile jeden pilot zostawił, tyle następny powinien zastać.
  Trasa oddaje DWA punkty - odczyt przy zdaniu operacji poprzedzającej i przy przejęciu
  następnej - i obejmuje PALIWO, MOTOGODZINY oraz OLEJ.
  - **olej idzie WŁASNĄ osią**: bagnet tuż po locie kłamie, więc zdanie samolotu oleju
    NIE MIERZY (issue #60), a interwał biegnie pomiar→pomiar przez wiele operacji. Olej
    dostaje przez to KOTWICĘ (ostatni pomiar nie późniejszy niż pytana chwila + suma
    dolewek od niej, kształt `Handover.oil`), a nie parę „przed/po". „Ile powinno zostać
    po tym locie" nie jest pytaniem, na które rejestr umie odpowiedzieć
  - **ostrzegamy tylko o oleju, którego PRZYBYŁO** bez zapisanej dolewki: ubytek jest
    normalnym zużyciem i ma własny rachunek. Ta sama asymetria, co przy
    `FUEL_INCREASE_WITHOUT_REFUEL`
  - **ostrzeżenia łańcucha WYPIERAJĄ te liczone z przekazania**, gdy trasa odpowiedziała:
    `handover` mówi „ile jest teraz", a wpis dotyczy przeszłej chwili - dwa zdania o tej
    samej liczbie, z których jedno jest mniej trafne, to szum. Bez łańcucha zostają
    lokalne, jak dotąd
  - **nazwa poszła za znaczeniem**: trasa nazywała się `fuel-chain`, dopóki niosła samo
    paliwo. Po dołożeniu MH i oleju byłaby kłamstwem, więc `readings-chain`
  - **`handover` z `/reference` na to nie odpowiada**: to JEDEN punkt („ile jest teraz"),
    a wpis ręczny pyta „ile było w czwartek" - między czwartkiem a dziś maszyna zdążyła
    polatać, zwykle z kimś innym. Dla wpisu bieżącego oba pytania mają tę samą odpowiedź
    i dlatego brak tej trasy tak długo nie przeszkadzał
  - **PODSTAWIAMY WYŁĄCZNIE ODCZYTY ZASTANE I ZAWSZE ZE ŹRÓDŁEM PRZY POLU**
    (`logic/readingsPrefill.ts` z testami; paliwo - issue #62 siódma tura, licznik -
    ósma, bo trasa niesie MH sąsiada tą samą odpowiedzią). To NIE jest pomyłka
    z 2026-08-16 („wpis brał odczyt początkowy z cache, a zgadnięte ogniwo psuło łańcuch
    MH następnemu pilotowi") pod trzema warunkami naraz: (1) źródłem jest REJESTR -
    konkretny sąsiad tej maszyny w tej chwili, nie „ostatni znany stan"; (2) liczba
    niesie ŹRÓDŁO przy polu („z poprzedniego lotu · BNO"), więc nie udaje odczytu
    z przyrządu - a to było sednem tamtej pomyłki; (3) wpisujemy się TYLKO w pole puste
    albo takie, w którym stoi nasza własna wcześniejsza podpowiedź (zmiana maszyny
    wymienia ją, poprawka pilota jest nietykalna, a wtedy gaśnie też adnotacja).
    **Odczytów PO locie nie podstawia nikt**: `after` jest odpowiedzią na pytanie, które
    formularz zadaje, więc podstawiony zawsze by się „zgadzał" i kasował jedyne
    ostrzeżenie, dla którego łańcuch powstał - zostaje wierszem odniesienia w arkuszu
  - **rozjazd jest OSTRZEŻENIEM, nigdy blokadą** - paliwomierz jest przyrządem fizycznym
    i to on ma rację; ktoś mógł też dolać poza aplikacją. Tolerancja 6 L (podziałka
    przyrządu), ostrzeżenie w OBIE strony
  - **to nie jest wyłom w offline-first**: łańcuch należy do kategorii „dane z serwera"
    (§4.8) i ma jej trzeci stan - `brak`. Bez sieci, na starszym serwerze (404) albo przy
    pierwszym locie maszyny ekran o ciągłości MILCZY, a wpis zapisuje się jak dotąd.
    Świadomie BEZ cache: odpowiedź dotyczy konkretnej chwili konkretnej maszyny, więc
    magazyn trzeba by unieważniać przy każdym cudzym locie
  - **serwer nie liczy nowego SQL-a**: `listByAircraft` i tak wczytuje całą historię
    maszyny (łańcuch MH potrzebuje sąsiedztwa przez lata) - nowe jest samo pytanie
    zadane tym wierszom. Trasa jest czystym odczytem, bez migracji
- **CO BLOKUJE, A CO OSTRZEGA - GRANICA JEST JEDNA** (piąta tura): blokada zostaje
  WYŁĄCZNIE tam, gdzie domena i tak odmówi, bo `manualFlight` robi próbę generalną całej
  sekwencji i przy pierwszym twardym naruszeniu rzuca `DomainRuleError`, nie zapisując
  ani jednego zdarzenia - wybór jest więc między „powiedzieć teraz" a „wywalić się po
  tapnięciu w ZAPISZ", nie między blokadą a swobodą. Bramka kroku 4 pokrywa dokładnie:
  `FUEL_NEGATIVE`, `MH_NEGATIVE`, `FUEL_OVER_CAPACITY` (śpi bez znanej pojemności, jak
  w domenie), `MH_REGRESSION`, `FUEL_INCREASE_WITHOUT_REFUEL` (tolerancja `fuelToleranceL`
  - ta sama, co serwer), `REFUEL_ENGINE_RUNNING`. Wszystko, co jest OCENĄ danych -
  ciągłość paliwa, łańcuch MH, werdykt normy, bilans - nie blokuje NIGDY
- **kolejny zrzut dziedziczy skład i wysokość po POPRZEDNIM** (`previousDrop`, czwarta
  tura): dzień skokowy to ta sama maszyna, ten sam klub i zwykle ta sama wysokość
  wyniesienia lot po locie. Poprzednik liczy się porządkiem CZASU, nie kolejnością
  dopisywania - zrzuty wpisuje się w dowolnej kolejności, a poprawka godziny je przestawia
- **nowy lot dziedziczy granice BIEGU** (`nextFlightTimes`): pierwszy bierze cały bieg
  (przy operacji z jednym lotem to od razu wartość właściwa), każdy kolejny biegnie od
  ostatniego lądowania do wyłączenia silnika. Stare „10 minut po ostatnim lądowaniu,
  30 minut długości" brało się znikąd i wymagało dwóch poprawek
- **nowy zrzut ląduje w PIERWSZYM locie bez zrzutu** (`nextDropAt`) - do #62 każdy trafiał
  w połowę OSTATNIEGO, więc na dniu skokowym wszystkie wpadały do tego samego. Dzień
  skokowy to zwykle jedno wyniesienie na lot, więc ta reguła trafia w intencję bez
  ani jednego dodatkowego pytania
- stopka sum zamyka oś, a wiersze dopisania idą POD nią - ta sama kolejność, co w trybie
  edycji rozliczenia (10D)

## Norma z dokumentacji i stan początkowy jednostki (issue #66, 2026-09-01)
Zgłoszenie: „dla pierwszych lotów gdzie nie ma jeszcze danych nie ma jak wyliczyć normy
i odchyleń […] jak dodaję samolot to powinno być pole w którym wpiszę startowy stan
motogodzin, paliwa w zbiorniku i oleju". Punkty 2 i 3 zgłoszenia (norma oleju, pojemność
i minimum oleju) **były wdrożone przy issue #60** - doszły punkty 1 i 4.
- **TO SĄ DWA RODZAJE LICZB** - `fuelNormLPerH` jest KONFIGURACJĄ: liczbą z instrukcji
  użytkowania, prawdziwą póki silnik ten sam, siostrą `oilNormLPerH`. `initialMh` /
  `initialFuelL` / `initialOilL` opisują JEDNĄ CHWILĘ - co pokazywały przyrządy, gdy
  jednostka trafiła do Ninerdeck. **Zero znaczy w nich co innego**: norma zerowa jest
  literówką (silnik bez paliwa nie istnieje), startowe zero - zwyczajnym faktem (nowy
  silnik, puste zbiorniki). Rozróżnienie żyje w WALIDACJI; „dwie karty w panelu"
  (2026-09-01) przeżyły jeden dzień - patrz „uwagi z przeglądu" niżej
- **NORMA NOMINALNA TO TRZECI SZCZEBEL DRABINY** `consumption/expectation.ts`
  (`ExpectationBasis: 'nominal'`), a nie druga arytmetyka: **wyliczona wygrywa
  z wpisaną** - model opisuje TEN egzemplarz, dokumentacja typ (ta sama kolejność, co
  przy oleju). Mianownikiem jest GODZINA PRACY SILNIKA, ten sam co `blockLPerH`, więc
  wchodzi wprost w miejsce stawki blokowej i nie wymaga zgadywania podziału na fazy
- **PASMO JEST ZADEKLAROWANE, NIE ZMIERZONE** (`NOMINAL_BAND_RATIO` = ±15%,
  DO KALIBRACJI jak reszta `consumption/policy.ts`). Dokumentacja podaje punkt, a nie
  rozrzut, więc udawanie centyli byłoby zmyśleniem - i dlatego ekran MUSI to nazwać:
  arkusz 10C pisze „Pasmo pochodzi z dokumentacji jednostki, a nie z lotów tej maszyny"
- **`fuelNorm.ts` ZOSTAJE NIETKNIĘTY** i to nie jest przeoczenie: szacunek
  wystarczalności potrzebuje stawki W LOCIE (`airLPerH`), a nominalna jest stawką na
  godzinę pracy silnika. Podstawienie jej zaniżyłoby rezerwę - „błąd w tę stronę jest
  niedopuszczalny" (docblock `liftsRemaining`)
- **DOKUMENTACJA JAKO WARTOŚĆ REFERENCYJNA**: gdy model JUŻ jest, arkusz 10C dokłada
  dwa wiersze - „Z dokumentacji" i „Odchyłka od dokumentacji · ta operacja −21% · norma
  maszyny −25%". To jest druga połowa zgłoszenia („można badać, jakie jest odchylenie
  nowej średniej oraz średniej z operacji od wartości referencyjnej")
- **STAN POCZĄTKOWY JEST ZEROWYM OGNIWEM ŁAŃCUCHA, nie polem na drucie.** Nie jedzie na
  telefon: serwer składa z niego PRZEKAZANIE (`aircraftStateView.pickHandover`) i wysyła
  gotowe, wyłącznie gdy rejestr nie ma czym odpowiedzieć - i tylko z KOMPLETEM pary
  (paliwo + licznik; połowa nie jest przekazaniem). Druga kopia tych liczb na drucie
  byłaby pierwszym miejscem, w którym ktoś policzy je inaczej niż `pickHandover`
- **`Handover.byPilotId` JEST ODTĄD NULLOWALNY** i to jest cały sygnał: `null` = NIKT
  tej maszyny nie przekazał. Telefon pisze wtedy „stan początkowy wpisany w panelu"
  zamiast „przekazał J. Kowalski" (ekran 02A), a panel dostaje `reading.source:
  'initial'`. Zdanie o poprzednim pilocie przy liczbie, której nie przekazał żaden pilot,
  byłoby nieprawdą dokładnie tam, gdzie zaufanie do liczb jest całą treścią ekranu
- **CZASU POMIARU NIE MA i nie udajemy, że jest**: `at` seeda to `aircraft.updated_at`,
  czyli chwila ZAPISU W PANELU - podpisana „Wpis z …", nigdy „Stan z …". Ta sama zasada,
  przez którą kontrakt floty nie ma `disabledAt`
- **`pickHandover(sessions, seed)` MA SEED JAKO ARGUMENT WYMAGANY**, nie opcjonalny:
  wołający bez konfiguracji floty (`GET /aircraft/:id/state` - trasa uśpiona) musi
  napisać `null` i tym samym zadeklarować, że pierwszy lot maszyny zobaczy „brak danych".
  Wartość domyślna zamieniłaby tę decyzję w przeoczenie
- migracja serwera 4 (addytywna, baza produkcyjna) + SQLite 6 (`reference_fuel` -
  osobna tabela z tych samych powodów, co `reference_oil`: `ADD COLUMN` w SQLite nie jest
  idempotentne). Cztery nowe odmowy w `domain/fleetGuards.ts`; sufity paliwa i oleju
  liczą się na stanie EFEKTYWNYM, więc obniżenie pojemności pod zapisany stan
  początkowy też odbija. Decyzje i tabela porównawcza: `docs/panel-2.0.md` §10

### Uwagi z przeglądu karty samolotu (issue #66 c.d., 2026-09-02)
Siedem uwag właściciela do karty z 2026-09-01; pełny zapis `docs/panel-2.0.md` §10.5:
- **sekcje idą MEDIAMI: Paliwo / Olej / Motogodziny** - karty „Zużycie z dokumentacji"
  i „Stan początkowy" USUNIĘTE, ich pola stoją w sekcji płynu/licznika, którego dotyczą.
  Pojemność zbiorników wyprowadziła się z sekcji „Samolot", format licznika
  z „Ustawień dla pilota"
- **wszystkie pola tych sekcji są WYMAGANE** („olej musi być wymagany zawsze") -
  plakietek „opcjonalne" nie ma, puste pole blokuje zapis samym brakiem (issue #55).
  Egzekwuje FORMULARZ (`verdictOf`); serwer dalej przyjmuje `null`, bo stare wiersze
  go mają. Wyjątek: „Aktualny stan" wymagany tylko PRZY TWORZENIU - przy edycji wymóg
  blokowałby niezwiązaną poprawkę na starym wierszu
- **„Stan początkowy" → „Aktualny stan"**, w dwóch trybach po `reading.source`
  (`admin/src/screens/fleet/currentState.ts` + `InitialFieldsMode` w `aircraftForm.ts`):
  do WPISANIA przy tworzeniu i póki jedynym źródłem jest wpis z panelu (`initial` /
  brak odczytu - własną literówkę wolno poprawić); DO ODCZYTU, gdy maszynę prowadzi
  dziennik - wartości z ostatniego odczytu z podpisem pochodzenia, a `PATCH` pól
  `initial*` nie niesie WCALE (tryb `locked`; formatowanie licznika do napisu bywa
  stratne, więc wykluczenie jest twarde, nie „i tak się nie zmieni")
- **stan oleju wszedł do kontraktu floty**: `AdminAircraftReading.oilL` (pomiar
  + dolewki po nim - SUMUJE SERWER, jak `oilAfterL`), `oilAddedSinceL` (do podpisu,
  żeby suma nie udawała odczytu z bagnetu), `oilAt` (własny stempel - pomiar bywa dużo
  starszy niż odczyt paliwa). Źródłem ten sam `pickHandover`, co `GET /reference`
- **norma oleju liczy się na godzinę PRACY SILNIKA, jak paliwo** („nie na
  motogodzinę") - zmiana DEKLARACJI (etykieta, docblock `ReferenceAircraft.oilNormLPerH`),
  nie arytmetyki: `oilPreflight.expectation()` dalej mnoży stawkę przez ΔMH, bo licznik
  to jedyny zegar maszyny znany offline przez cudze operacje (Hobbs mierzy 1:1,
  obrotomierzowy na ziemi przyrasta wolniej - wtedy ΔMH jest przybliżeniem; dokładniejszy
  przelicznik przyjdzie z modelem MH analityki w fazie 2 modułu oleju)

## Brak normy MILCZY na karcie rachunku (issue #69, 2026-09-02)
„Zamiast wyświetlać «Nie porównujemy z normą…» to lepiej nic nie wyświetlać. Skoro nie ma
danych to po co zajmować UI?" Z czterech zdań `naNote` (`sessionBalance.ts`) zostaje
JEDNO - reszta to cisza, na obu powierzchniach naraz (ekran 10 i krok 4 wpisu ręcznego,
bo obie wołają ten sam rdzeń):
- **zostaje „silnik nie pracował"**: mówi o TEJ operacji (zdanie bez lotu, 09C)
  i odpowiada na pytanie, które tam naprawdę pada - dwa zgodne odczyty bez słowa
  wyglądałyby na brak danych, a są informacją. Mockup `10a` pokazuje je celowo
  i zostaje bez zmian
- **„nie ma jeszcze policzonej normy / przeliczników licznika" WYCIĘTE**: opisywało
  wnętrze analityki komuś, kto nic z tym nie zrobi (kategoria przypisów z issue #43/#72).
  Dla paliwa gałąź i tak prawie wymarła - norma z dokumentacji jest od issue #66
  WYMAGANA na karcie samolotu (stare wiersze floty z `null` świadomie odpuszczone);
  dla licznika była stanem KAŻDEJ młodej maszyny przez tygodnie, bo żadna instrukcja
  nie podaje przelicznika obrotomierza - a stan domyślny nie dostaje zdania (reguła
  SyncChipa z issue #12)
- **„brakuje odczytu przy zdaniu" WYCIĘTE**: powtarzało kreskę z wiersza „Odczyt przy
  zdaniu" tuż wyżej, a we wpisie ręcznym opisywało pole, które pilot właśnie widzi
  puste (issue #55: blokady widocznej z kontrolki się nie opisuje). Obejmowało też
  edycję 10d z kokpitu przed zdaniem - tam brak werdyktu tłumaczy się sam, bo operacja
  jeszcze trwa
- docblock `BalanceCard` „werdykt albo powód jego braku - nigdy cisza" przestał
  obowiązywać: §6 pkt 3 dotyczy BLOKAD akcji, a brak plakietki werdyktu akcją nie
  jest - karta i tak pokazuje pełny rachunek

## Karta „Olej" na logu operacji (issue #70, 2026-09-02)
Zgłoszenie: „brakuje sekcji z olejem oraz możliwości modyfikacji tych danych
z komentarzem tak jak to jest dla innych pól". Druga połowa istniała już od issue #60
(arkusz 10F przy przejęciu niesie pola oleju + powód; dolewka z kokpitu poprawia się
na osi przez unieważnienie i dopisanie, parytet z tankowaniem) - dochodziła pierwsza.
- **karta „Olej" stoi za Motogodzinami** (kolejność mediów z 02A i 15), ale jest
  RACHUNKIEM BEZ WERDYKTU: zdanie samolotu oleju nie mierzy, więc zużycia jednej
  operacji nie ma z czego policzyć - interwał biegnie pomiar→pomiar przez wiele
  operacji. Wiersze: „Odczyt przy przejęciu", „Dolane", suma „Po dolewkach".
  `logic/sessionOil.ts` z testami. **Etykiety wyrównane do karty paliwa przy
  przeglądzie 2026-09-02** („Pomiar przy przejęciu" obok „Odczytu przy przejęciu"
  było rozbieżnością słownika, nie rozróżnieniem), a **licznik dolewek USUNIĘTY tym
  samym przeglądem**: wzór „Dolane · 2 tankowania" ma sens przy paliwie, gdzie
  tankowań bywa kilka - olej dolewa się praktycznie raz, więc „· 1 dolewka" przy
  każdej operacji mówiła to samo i niczego nie odróżniała (reguła SyncChipa)
- **werdyktu nie ma i nie ma zdania o jego braku**: `naNote` tłumaczy sytuacyjny
  brak porównania, a tu porównanie nie istnieje jako pojęcie - stały przypis
  świeciłby przy każdej operacji (reguła SyncChipa z issue #12)
- **zero pokazuje się TYLKO przy odczycie**: operacja z odczytem mówi „nie dolewano"
  (0,0 L), operacja sprzed modułu oleju dostaje KRESKI - „0,0 L" przy braku odczytu
  byłoby faktem wziętym znikąd (ta sama reguła, którą dziennik panelu pokazuje brak
  odczytu jako kreskę). Kreska sumy bez bursztynu - to zwykły stan starych danych
- **karta jest czystym odczytem w OBU trybach**, jak Paliwo i Motogodziny - korekta
  wchodzi osią (wiersz „Przejęcie" → 10F), nie ołówkiem na karcie
- mockupy: karta na 10 (odczyt + dolewka), 10A (odczyt bez dolewki), 10B (kreski -
  operacja sprzed modułu), 10D (tryb edycji, bez zmian względem odczytu); podpisy
  przejęcia na 10A/10D dostały wreszcie człon „olej …" z issue #60

## Dolewka oleju przy przejęciu = zdarzenie `oil_add` (2026-09-03)
Pytanie użytkownika („dolewka oleju i dolanie paliwa przy przejęciu to nie powinny
być oddzielne eventy?") trafiło w realną asymetrię: paliwo JUŻ tak działało
(tankowanie przed lotem to zawsze osobne `refuel`, także we wpisie ręcznym),
a dolewka oleju z arkusza 02I była polem `oilAddedL` W ŚRODKU payloadu
`preflight_confirm` - podczas gdy ta sama dolewka z kokpitu była zdarzeniem
`oil_add`. Jeden fakt w dwóch kształtach kosztował: brak wiersza osi (po
przycięciu podpisu przejęcia dolewka z 02I znikała z osi zupełnie), dwie drogi
korekty (amend vs unieważnij+dopisz) i dwa źródła sumy dla analityki oleju.
- **NOWE ZAPISY**: 02A i wpis ręczny składają `preflight_confirm` z SAMYM
  pomiarem (`oilL`) + osobne `oil_add` przy dolewce (02A tuż po potwierdzeniu;
  wpis ręczny w sekwencji za przejęciem, stempel = uruchomienie - silnik jeszcze
  nie działa, więc `OIL_ADD_ENGINE_RUNNING` nie odbija). Dolewka ma odtąd WŁASNY
  wiersz osi („Dolewka oleju · +0,5 L") i TĘ SAMĄ drogę korekty, co tankowanie
- **REJESTR APPEND-ONLY - nic nie migrujemy**: pole `oilAddedL` w starych
  strumieniach czytamy dalej (projekcje telefonu i serwera sumują OBA źródła
  do jednej liczby, więc stare operacje liczą się bez zmian; treść operacji
  idzie przez tę sumę). Biała lista `amend` zachowuje `oilAddedL` dla starych
  zapisów
- **pole „Olej - dolewka" w arkuszu 10F istnieje TYLKO, gdy payload ją niesie**
  (stary strumień): amend dopisujący dolewkę do payloadu nowego strumienia
  dublowałby fakt, który ma już własne zdarzenie (`ReadingOilFields.addedText:
  string | null`, `null` = pola nie ma). W nowych strumieniach dolewkę dopisuje
  się arkuszem 10H (`oil_add` był tam od issue #70)
- **serwer bez zmian**: ingest zna `oil_add` od issue #60, a kolumna
  `sessions.oil_added_l` od zawsze sumuje payload + zdarzenia
- **STARY STRUMIEŃ DOSTAJE WIERSZ OSI SYNTETYCZNIE** (uwaga z urządzenia tego
  samego dnia: „nie doświetla się wpis z dolewką oleju przy przejęciu" - operacja
  sprzed zmiany): `buildSessionAxis` rysuje `oilAddedL` z payloadu przejęcia jak
  każde `oil_add` (wiersz „Dolewka oleju · +1,0 L" tuż za przejęciem), z celem
  korekty w PRZEJĘCIU - tryb edycji dobiera arkusz po typie zdarzenia docelowego,
  więc trafia w 10F, gdzie pole dolewki dla starych payloadów istnieje. Plakietka
  „popr." pyta o pole `oilAddedL`, nie o dowolną poprawkę przejęcia. Oś ma JEDEN
  kształt niezależnie od tego, kiedy zapis powstał; testy w `sessionAxis.test.ts`
  (stary kształt → wiersz syntetyczny; nowy → jedno `oil_add`, bez dublowania)

## Sekcja oleju na 02A: podziałka zamiast tekstu, podpowiedź w arkuszu (2026-09-02)
Uwagi z urządzenia do kroku liczników (NOWY LOT · 3/3):
- **adnotacja „Twój pomiar z bagnetu" USUNIĘTA**: pomiar jest aktem pilota z definicji,
  więc poświadczanie własnego wpisu niczego nie odróżniało (reguła SyncChipa).
  **Częściowo ODWRÓCONE po przebudowie góry ekranu** (późniejsza tura tego samego
  dnia): odkąd baner mówi, że wartości pochodzą z PRZEKAZANIA, wpis pilota musi się
  od nich odróżniać - adnotacja `manual` wróciła na olej po pomiarze, a jej napis
  nazywa PRZYRZĄD medium („jak jest paliwo, to nie pisz «Twój odczyt z licznika» -
  to nieprawda"): paliwo „Twój pomiar ze zbiorników", olej „Twój odczyt na
  bagnecie", motogodziny „Twój odczyt z licznika" (domyślne).
  `FreshnessNote.manualLabel` + `Readout.manualNote` niosą tę odmianę
- **„min/zbiornik" mówi PODZIAŁKA, nie tekst**: `LevelBar` pod wartością, jak przy
  paliwie - wypełnienie = stan PO dolewce względem zbiornika, bursztynowa kreska =
  minimum (`LevelBar.markerRatio`), pod minimum wypełnienie bursztynieje. Arytmetyka
  w `oilClaimView().gauge` (testy); bez pojemności podziałki nie ma, bez minimum -
  znacznika. Znacznik jest bursztynowy niezależnie od tonu wypełnienia: to granica
  ostrzeżenia, nie część poziomu
- **podpowiedź (ostatni pomiar → oczekiwanie z normy) mieszka W ARKUSZU i jest
  SZLAKIEM** („koncepcja ciekawa, ale lepiej dać to do popup"; druga tura: „styl,
  który był wcześniej, był lepszy - trzeba tylko go przenieść do popup", bo wiersze
  label→wartość dawały „za dużo linijek tekstu"): `oilClaimView().trail` renderuje
  w arkuszu 02I ten sam `Trail`, co szlaki paliwa/MH - kropka, tytuł ze
  stemplem („Ostatni pomiar · 21 CZERWCA 07:02 - J. Kowalski", meta z bagnetem
  i kotwicą MH), zielone ogniwo oczekiwania. Stoi POD polami, NAD wierszami
  konfiguracji (min/zbiornik), **domknięty od dołu taką samą kreską, jaką otwiera
  się od góry** (kolejna tura) - podpowiedź stoi we własnej ramce; stempel niesie
  przy okazji wiek podpowiedzi (osobna adnotacja świeżości nie ma czego
  kwalifikować). **Wartość oleju w arkuszu BEZ
  BURSZTYNU** (ta sama tura: „paliwo na żółto to dobre rozróżnienie - oleju nie
  pokazuj na żółto"): oba pola 02I pisane standardowo, jak pole „Dolano"; bursztyn
  zostaje przy paliwie (02B). Na ekranie zostaje: ile oleju
  JEST W SILNIKU - **dużą liczbą sekcji jest STAN PO DOLEWCE** (trzecia tura:
  „pokazać ile jest oleju, a poniżej opisać: odczytano X, dolano Y"), a podpis
  rozbija go na składowe „odczytano 8,2 L · dolano +1,0 L" wyłącznie przy dolewce,
  bo bez niej stan równa się odczytowi i „bez dolewki" przy każdym przejęciu
  niczego by nie odróżniało. **Instrukcja „pomiar przy zimnym silniku" WYCIĘTA**
  (druga tura tego samego dnia): procedura pomiaru to wiedza pilota, nie treść
  ekranu - przed pomiarem sekcja stoi z samym „- -" i przyciskiem „Wpisz pomiar"
- **podpis „licznik w formacie hh:mm" przy motogodzinach USUNIĘTY** (kolejna tura):
  format widać z samej wartości, a tam, gdzie pilot go potrzebuje - przy wpisywaniu -
  mówi go wiersz „Format licznika · SP-AXA" w arkuszu 02C. Opis konfiguracji nie jest
  treścią odczytu (ta sama kategoria, co przypisy z issue #43/#72)
- **powód blokady jest INSTRUKCJĄ, nie uzasadnieniem wymogu** („po co pisać na
  przycisku, że odczyt przy przejęciu jest obowiązkowy"): z `preflightBlocker` wycięte
  doklejki „- odczyt przy przejęciu jest obowiązkowy" i „- rozpoczną nowe ogniwo
  łańcucha" - skoro przycisk stoi, wymóg jest oczywisty, a budowa rejestru nie jest
  pytaniem pilota (kategoria przypisów z issue #43/#72). Zostaje pełne zdanie
  o cofniętym liczniku: ta blokada jest niewidoczna z kontrolki (issue #55)
- **ostrzeżenie arkusza wygląda jak `.modal-warning` z mockupów** („warning na
  telefonie odbiega od designu - biały tekst i brak ikonki"): `Sheet.warning`
  renderuje się przez `InlineNote` (trójkąt + zdanie mono w kolorze tonu), nie przez
  `Banner` z tytułem i szarym body. Napisu „Zanim potwierdzisz" mockup nigdy nie
  rysował - to zostaje NAZWĄ wzorca z issue #55 (baner mówi o wartości, przycisk
  o blokadzie). Do tego `Banner kind="warning"` dostaje trójkąt DOMYŚLNIE, jak
  wymuszony pytajnik `edu` - ikona zdana na wołającego raz już zawiodła
- **ostrzeżenie arkusza stoi ZARAZ POD POLAMI wpisu** (dwie tury: „walidacja jest
  na utratę fokusa, a powinna być live" → „ginie pod klawiaturą - może powinno się
  pojawiać zaraz pod inputami?"). Ostrzeżenie LICZYŁO SIĘ od zawsze na każdą zmianę
  pola, ale renderowane na końcu przewijanej treści lądowało przy wysuniętej
  klawiaturze poza widokiem - pokazywało się dopiero po jej schowaniu, czyli „po
  utracie fokusa"; przypięcie nad akcjami (rozwiązanie pierwszej tury) przeżyło
  jeden dzień, bo stało za daleko od pola. Odtąd `Sheet` renderuje `warning` zaraz
  po `children`, przed wierszami odniesienia - pilot patrzy tam, gdzie pisze.
  Kształt ma JEDNĄ definicję (`SheetWarning` w `Sheet.tsx`); arkusz oleju renderuje
  je sam między polami a szlakiem, bo jego children niosą treść pod polami.
  Mockupy 02B/02I za tym (baner nad wierszami odniesienia)
- **wiersze arkuszy odczytu BEZ znaków rejestracyjnych** (dwie tury): „Minimum przed
  lotem · SP-AXA" → „Minimum przed lotem", tak samo zbiornik oleju, „Pojemność
  zbiorników" i „Format licznika" - arkusz dotyczy maszyny, którą pilot właśnie
  trzyma (02A) albo wybrał w kroku 1 (15), więc znak niczego nie odróżniał, tylko
  wydłużał wiersz
- **„Po dolewce" podaje SAM rachunek - bez „powyżej minimum" i bez zieleni**
  (kolejna tura): jedno i drugie sugerowało, że oleju WYSTARCZY, a wystarczalność
  zależy od długości lotu, o której konfiguracyjne minimum nic nie wie. O zejściu
  POD minimum mówi osobne ostrzeżenie; `oilAfterRow` stracił parametr konfiguracji
- **ostrzeżenie sekcji stoi WEWNĄTRZ jej karty** (kolejna tura): `Readout.warning`
  renderuje `InlineNote` na dole karty - ostrzeżenie stojące POD kartą czytało się
  jak osobny komunikat ekranu, a dotyczy liczby nad sobą. Sekcja oleju na 02A
  przeszła na ten prop; reguła obowiązuje każdy przyszły `Readout` z ostrzeżeniem
- **szlaki PALIWA i MH też przeniesione do arkuszy** (kolejna tura: „możemy podobnie
  przenieść informacje o odczytach paliwa i motogodzin do popupów?"). Mechanika
  jest odtąd RAMOWA: `Sheet.trail` renderuje szlak między ostrzeżeniem a wierszami
  odniesienia (z kreską domykającą), a olej, paliwo i MH tylko podają ogniwa -
  `OilSheet` przestał składać własną kolejność, `Readout` STRACIŁ slot `trail`
  (sekcje 02A mówią samym stanem: wartość, świeżość, podziałka, podpis). Mockupy:
  szlaki w modalach 02A oraz w 02B/02C, sekcje bez nich. **Szlak przekazania
  dostał wreszcie DANE**: `Handover.trail` istniał wyłącznie w typie i mockupie -
  serwer nigdy go nie wypełniał, więc oś na telefonie była pusta. `handoverTrail`
  w `aircraftStateView` buduje ogniwa sesji-źródła (przejęcie z ZASTANYM paliwem
  i licznikiem - czyli poprzednim przekazaniem, bo „mogłem nie tankować, tylko
  lecieć na paliwie, które zostało z poprzednika" - tankowania ze strumienia,
  zdanie z czasem blokowym), a `/reference` dociąga strumienie sesji-źródeł JEDNYM
  `sessionStreams` dla całej floty (wzorzec analityki §7.7). Ogniwo `claim` rysuje
  się odtąd także na osi PALIWA („zastane 185 L z przekazania"). W szlaku OLEJU
  ogniwo oczekiwania jest NEUTRALNE i mówi „Latano · 4:00 MH" (nie „Od pomiaru",
  nie na zielono - kolejna tura): jak wiersze „J. Kowalski latał" przy paliwie/MH,
  bez nazwiska, bo od pomiaru mogło latać wielu pilotów
- **banery „skąd te wartości" NA SAMEJ GÓRZE 02A** (kilka tur jednej uwagi): pilot
  ma wiedzieć, na co patrzy, ZANIM spojrzy na liczby. Dwa banery, dwa pytania:
  (1) POUCZAJĄCY `Banner kind="edu"` - niebieski nagłówek boldem („Wartości
  z ostatniego przekazania" / „Stan początkowy z panelu") + jasny opis (kto
  przekazał, stan z kiedy), ZAMYKALNY do mini-chipu „Skąd te wartości?"
  (`useEduBanner('handover-origin')`, trwale per pilot); (2) bursztynowa
  INSTRUKCJA (InlineNote, niezamykalna): „Zweryfikuj ilość paliwa w zbiornikach
  i aktualny stan licznika motogodzin." - bez doklejki „Twój odczyt z przyrządów
  jest ważniejszy…" (kolejna tura: instrukcja ma być instrukcją). Zdanie
  „ewentualne nieścisłości zostaną rozwiązane przez koordynatora" WYCIĘTE -
  odpowiadało na obawę, której pilot nie zgłosił
- **jedna czcionka banerów i przypisów: body 14** (kolejna tura: „mamy 2 style
  czcionek, na żółtym mniejsza - ładniejsza jest na niebieskim"): `InlineNote`
  przeszedł z mono 10 na TĘ SAMĄ metrykę body, którą pisze `Banner` - różnicę ról
  niesie rozmiar pudełka i kolor tonu, nie krój pisma. Obejmuje wszystkie przypisy
  i ostrzeżenia arkuszy (to jeden komponent); mockupy 02A/02B/02I poszły za tym
  (`.none-box`/`.modal-warning`/`.hint-text` = Archivo 12), pozostałe pliki
  designu dociągną się przy najbliższym dotknięciu
- **pole dużej wartości w arkuszach odczytu ZMNIEJSZONE ~30%** („input zajmuje
  strasznie dużo miejsca" - przy dwóch polach arkusza oleju nadmiar liczył się
  podwójnie): cyfry 22 zamiast 30–32, padding 8, z PODŁOGĄ 46 dp celu dotykowego.
  Metryka jest JEDNA dla `ReadingSheet` i `OilSheet` (`valueFieldMetrics.ts`) -
  bliźniacze pola już raz się rozjechały i nikt tego nie widział. Hierarchia
  z issue #58 zostaje: pole arkusza (22) > kontrolka formularza (mono 16).
  Mockupy 02A/02B/02C/02I za tym (kursor 24, jednostka 14)

## Tankowanie (06) po przeglądzie 2026-09-02
- **korekta odczytu FOB = OŁÓWEK W ROGU karty** (dwie tury): bursztynowy „Koryguj
  z paliwomierza" pod wielką liczbą czytał się jak główna akcja ekranu, a wyciszona
  pigułka „Zmień odczyt" nadal była „duża i w miejscu, które sugeruje klikanie" -
  wyśrodkowana kontrolka pod herosem to pozycja CTA niezależnie od koloru. Odtąd
  `GaugeHero` rysuje `IconAction` (ołówek) w prawym górnym rogu - ustalona
  affordancja poprawiania (issue #43), nie konkuruje z celem ekranu (DOLEWKA);
  napis „Zmień odczyt" został etykietą czytnika ekranu
- **powód blokady bez doklejki**: „Ustaw ilość dolaną - zapis bez dolewki nie miałby
  czego rejestrować" → „Ustaw ilość dolanego paliwa" (powód jest instrukcją, nie
  uzasadnieniem wymogu - jak w `preflightBlocker`; brzmienie z kolejnej tury).
  Zdania o silniku i pojemności zostają w całości: tych blokad nie widać z kontrolki
  nad przyciskiem
- **dolewkę da się WPISAĆ z klawiatury, z miejscami po przecinku** (kolejna tura:
  „ktoś wpisuje poprawny odczyt z licznika tankowania i tam są wartości po
  przecinku"): tap w wartość otwiera decimal-pad (`Stepper.edit` + `parseLitres` -
  kropka i przecinek znaczą to samo), przyciski ± dalej chodzą po pełnych litrach.
  Miejsca po przecinku ZOSTAJĄ w wartości i w rachunku („112 + 48,7 = 160,7 L") -
  zaokrąglenie okłamywałoby pilota o jego własnym wpisie (`addedLitresText`
  w `refuelMath.ts`, do dwóch miejsc - dystrybutor liczy po 0,01 L)
- **bez rachunku ekran o nim MILCZY** (uwaga z urządzenia, 2026-09-03: „jeśli nie ma
  z czego policzyć, to po co to w ogóle wyświetlać?"): przy `estimateConsumption ==
  null` (brak odczytu odniesienia, silnik nie pracował, paliwa przybyło) nie ma ani
  pudełka, ani zdania w jego miejscu - komunikat tłumaczył budowę rachunku, nie dane
  pilota. Ta sama reguła, którą issue #69 zastosowało do braku normy na karcie
  rachunku
- **etykieta „Ilość dolana" USUNIĘTA** (ta sama tura): powtarzała nagłówek karty
  „Dolano" słowo w słowo - reguła „przy jednej kontrolce etykieta nie powtarza
  tytułu" z issue #62. `Field.label` jest odtąd opcjonalne: pole będące jedyną
  treścią nazwanej sekcji bierze z `Field` samą oprawę (podpowiedź, odstępy)
- **kalkulacja zużycia jest NEUTRALNA i bez przypisu** (ta sama tura: „czemu na
  żółtym polu? po co tłumaczyć coś o punkcie kontrolnym i cache?"): rachunek jest
  informacją, nie ostrzeżeniem - bursztyn przy każdym tankowaniu robił z normalnego
  stanu alarm. `CalcBox` domyślnie neutralny (wniosek wyróżnia `textPrimary`),
  prop `note` WYCIĘTY z komponentu: zdanie o punkcie kontrolnym i cache'u opisywało
  budowę analityki komuś, kto przyszedł zatankować (kategoria przypisów
  z issue #43/#72). Werdykt normy zostaje kolorem przy swoim wierszu
- **kalkulacja stoi POD KARTĄ FOB, nie na dnie ekranu** (pytanie z urządzenia,
  2026-09-03: „to można wyliczyć i oszacować - czy to jest Kalkulacja zużycia? może
  lepiej dać to na górze?"). Odpowiedź brzmi: FOB na górze to OSTATNI ODCZYT
  paliwomierza (rachuby zużycia ekran nie robi), a kalkulacja liczy W DRUGĄ STRONĘ -
  z wpisanego stanu i czasu pracy silnika od odczytu wyprowadza średnią L/h
  i werdykt względem normy, czyli KONTROLĘ wiarygodności liczby wyżej. Dlatego stoi
  bezpośrednio pod nią (wyjaśnienie przy liczbie, której dotyczy - reguła szlaków)
  i reaguje na żywo na korektę ołówkiem. Podpis mockupu „Obliczone z ostatnich
  operacji silnika" poprawiony na „Odczyt z paliwomierza" - obiecywał rachubę,
  której nie ma
- **„Stan po tankowaniu" na BURSZTYNIE, z miarką** (uwagi z urządzenia, 2026-09-03:
  „zielony jest do czegoś innego raczej" + „dodać miarkę - zaznaczyć, ile jest przed
  odczytem, ile dolano i ile łącznie"): to liczba o paliwie, a zieleń jest akcentem
  głównym (silnik, CTA) i robiła z wyniku rachunku osobny komunikat „OK"; czerwień
  zostaje dla wyniku łamiącego limit. Pod wierszem miarka na tle pojemności:
  zastane NEUTRALNĄ szarością (rgba biała 0.4), dolewka akcentem - bursztynowa
  część rośnie razem ze Stepperem. Zastane NIE jest przygaszonym bursztynem
  (trzecia tura: „nadal żółty na żółtym") - dwa poziomy bursztynu na bursztynowej
  karcie zlewały się w jedno; różne HUE czyta się z kąta oka, różna jasność nie.
  Proporcje liczy `refuelGauge` w `refuelMath.ts` (z testami; `null` bez
  pojemności - pasek bez mianownika nic nie mówi, jak przy FOB); segmenty rysuje
  `LevelBar.baseRatio` (przez `ScaleBar` i `ResultBar.gauge`). Pod miarką
  podziałka ćwiartek jak pod dolewką (kolejna tura) - ten sam `refuelScale`,
  tylko na osi POJEMNOŚCI; ostatnia etykieta to pojemność zbiorników
- **pasek na TONOWANEJ karcie ma CIEMNĄ rynienkę** (kolejna tura: „źle wygląda
  żółty pasek na żółtym tle"): rynienka z `surfaceRaised` zlewała bursztynowe
  wypełnienie z bursztynową kartą. `LevelBar.trackColor` + stała `TINTED_TRACK`
  (`rgba(0,0,0,0.35)` - dokładnie `.fob-bar` z mockupu: półprzezroczysta czerń
  przyciemnia tło karty, więc działa na obu motywach); używają jej wskaźnik FOB
  (`GaugeHero`) i miarka wyniku (`ResultBar`). Paski na kartach neutralnych
  (olej na 02A) zostają przy `surfaceRaised`
- **FOB przed tankowaniem ma DWA PRZYPADKI BIZNESOWE** (opis użytkownika,
  2026-09-03, po kilku turach; wcześniejsze przymiarki - szacunek jako wartość
  pola, potem pigułka POTWIERDŹ przy świeżym odczycie - wprowadzone i COFNIĘTE
  tego samego dnia: potwierdzanie dublowało preflight, nie proponować ponownie):
  - **samolot NIE LATAŁ od ostatniego odczytu** (tankowanie przed lotem -
    przypadek CZĘSTSZY): wartość wychodzi z PRZEKAZANIA potwierdzonego
    w preflighcie i pole wypełnia się samo (podpis „z przekazania · preflight
    08:00 UTC") - pilot tylko dolewa
  - **samolot LATAŁ** (tankowanie między lotami - rzadkie): pole WYMAGA pomiaru -
    karta `GaugeHero` NEUTRALNA (bursztyn zostaje na dolewce i wyniku), PUSTA
    („- -" placeholderem, wzorzec sekcji oleju z 02A), ZAPISZ blokuje „Wpisz stan
    paliwa z paliwomierza". SUGESTIA w podpisie („szacunek z normy samolotu:
    ~112 L") - liczy ją `estimateFob` w `refuelMath.ts` (z testami): ostatni
    odczyt − zużycie z normy za czas pracy silnika; stawki FAZOWE, gdy model je
    rozdzielił (czas lotu z `flightSpans`, offline), inaczej blokowa (drabina jak
    w `consumption/expectation.ts`, issue #38); pełne litry, podłoga 0
  - **historię „ile miał · ile latał · ile mógł spalić" opowiada SZLAK w arkuszu
    pomiaru** (uwaga: „mamy już ciekawy komponent, który obrazuje statystyki
    z ostatniego lotu [preflight, potwierdzanie paliwa] - użyj analogicznych, po
    co wymyślać na nowo"): ogniwa `Trail` przez `Sheet.trail` jak na 02B - odczyt
    → „Latano · 2h 22 min · zużycie z normy ~38 L" → ZIELONE „Szacunkowo zostało
    ~112 L" (jak ogniwo oczekiwania oleju na 02I). Pudełko „Szacunek z normy" na
    ekranie SKASOWANE - było wymyślaniem szlaku na nowo. Arkusz startuje PUSTY
    (podstawiony szacunek dałoby się zatwierdzić bez patrzenia na paliwomierz),
    wiersz odniesienia nie powtarza odczytu, gdy niesie go ogniwo szlaku
  - **po pomiarze ekran pokazuje „Rzeczywiste zużycie"** (`CalcBox`: odczyt
    odniesienia, czas pracy, zużycie, średnia L/h + werdykt normy - werdykt TYLKO
    tu, bo szacunek wyprowadzony z normy „zgadzałby się" z nią zawsze). Bez
    normy/odczytu/biegu pudełka nie ma. Wynik z miarką pojawia się dopiero
    z wartością „przed" (z przekazania albo z pomiaru); `consumptionLPerH`
    w zapisie wychodzi tylko z pomiaru
- **miarka jest JEDNA - na wyniku** (ta sama tura: „skoro mam miarkę na stanie po
  tankowaniu, usuń miarki przy FOB i dolano"): pasek poziomu zniknął z karty FOB
  (`GaugeHero` nie ma już `ratio`/`scale`) i spod dolewki (suwak-wskaźnik) - trzy
  paski mówiły tę samą oś pojemności trzy razy
- **ZDANIE SAMOLOTU (09B) dostaje TEN SAM szacunek z normy** (kolejna tura:
  „analogiczne i nawet te same komponenty i logika") - `estimateFob`
  i `fuelEstimateTrail` są wspólne (dlatego mieszkają w `refuelMath.ts`, odtąd
  logice OBU ekranów): po biegu silnika pole „Paliwo na pokładzie" startuje
  PUSTE (prefill z odczytu sprzed lotu udawał stan bieżący - ta sama pułapka,
  co na 06), podpis niesie sugestię „szacunek z normy: ~60 L", a arkusz odczytu
  końcowego ten sam szlak trzech ogniw. Gdy silnik NIE pracował od odczytu
  (09C, tankowanie tuż po locie), pole wypełnia rejestr jak dotąd - reguła
  świeżości identyczna z 06. MH zostaje przy rejestrze: licznik nie „spala się"
  w tle, a wartość końcową pilnuje blokada cofnięcia
- **PRZEJĘCIE (02A) dostaje to samo zielone ogniwo** (kolejna tura: „na przejęciu
  też pokaż ten szacunek z normy") - szlak paliwa w arkuszu 02B kończy się
  ogniwem `fuelExpectationRow` (jedno brzmienie na 06/09B/02A: „Szacunkowo
  zostało ~X L"). Tu liczy je `expectedHandoverL` z HISTORII przekazania
  (zastane przy przejęciu poprzednika + jego dolewki − norma × czas lotów)
  stawką BLOKOWĄ - świadomie inaczej niż `estimateFob`, bo wpisy szlaku niosą
  czas blokowy bez podziału na fazy. Rola: KRZYŻOWA KONTROLA przekazania -
  rozjazd łapie literówkę w odczycie zdania albo tankowanie poza aplikacją.
  Bez normy / zastanego / lotów ogniwa nie ma (oczekiwanie bez lotów równałoby
  się przekazaniu - zdanie o niczym)

## Zdanie samolotu (09B/09C) po przeglądzie 2026-09-03
Trzy uwagi z urządzenia do ekranu zdania:
- **nagłówek to sam tytuł „ZDAJ SAMOLOT"** („w nagłówku wyświetla się guid - po co"):
  podtytuł sklejał `aircraftId` (w produkcji uuid z panelu) z datą, a mockupy 09B/09C
  od zawsze rysowały sam tytuł - kod dogonił spec. Maszynę i datę mówi oś operacji
- **komentarz do powodu zdania bez lotu - OPCJONALNY** („może warto dać opcjonalne
  pole z komentarzem doszczegóławiającym, dlaczego nie wykonano lotu"): cztery karty
  powodu odpowiadają na „co", nie „co dokładnie" - „usterka" bez słowa KTÓRA jest dla
  administratora pytaniem. NOWE pole payloadu `day_close.noFlightNote` (domena +
  walidacja serwera, sufit 500 znaków jak powód korekty; wchodzi TYLKO z treścią -
  `releasePayload` przycina i pomija pusty, test w `releaseAircraft.test.ts`).
  UI: `Field` z plakietką „opcjonalne" + `ValueBox variant="text"` pod siatką powodów,
  wpis w `TextEntrySheet` bez podpowiedzi (komentarz opisuje konkretną sytuację).
  Korekty komentarza po zdaniu (amend) na razie NIE MA - biała lista `day_close`
  zostaje przy paliwie i MH; dołożyć razem z wejściem w 10F, gdy pilot o to poprosi
- **ołówki przy licznikach 09C BEZ obramówki** („brzydko wyglądają"): `IconAction`
  w stałej kolumnie, jak przy wierszach osi w trybie edycji (issue #43) - ramka
  robiła z ołówka drugi przycisk obok wartości. Cel dotykowy 44 px zostaje

## Zmiana załogi (07) po przeglądzie 2026-09-02
Sześć uwag z urządzenia; wspólny mianownik ten sam, co na 02A - ekran mówi decyzją,
nie architekturą:
- **zmiana Duala jest PRZYCISKIEM przy „Aktualnej załodze", wybór w ARKUSZU** (nowy
  Dual albo „Bez drugiego pilota", jeden zapis). Osobna sekcja „A" powtarzała stan
  załogi stojący wiersz wyżej. Pusty wybór blokuje bez zdania (widać z listy - wąski
  wyjątek issue #55); rezygnację przy wymogu załogi 2-os. blokuje powód przy samej
  pozycji listy. Przycisk NEUTRALNY, nie zielony (kolejna tura): zmiana Duala to
  opcja, nie następny krok procedury - zieleń jest głównym akcentem i czytała się
  jak CTA ekranu
- **wiersze załogi piszą KOD pilota z cache floty, nie surowy identyfikator** („przy
  Dualu wyświetla się guid zamiast nazwy użytkownika" - w produkcji piloci mają
  identyfikatory UUID z panelu; ta sama klasa błędu, co guid w pasku kokpitu).
  Surowy id zostaje ostatnią deską ratunku dla pilota spoza cache'u.
  **Ta sama poprawka na kafelku „Zmiana załogi" w kokpicie** (2026-09-03: podpis
  kafelka sklejał surowe `picId`/`dualId`, choć mockup 04A od zawsze pisał
  „PIC: AKO · DUAL: BNO") - kody rozwiązuje odtąd hook `usePilotCode`
  (`hooks/usePilots.ts`, wzorzec `useAircraft`): `queries.pilots()` ładowało
  sobie już SZEŚĆ ekranów własnymi kopiami, siódma kopia byłaby dokładnie tym,
  przed czym ostrzega docblock tamtego hooka
- **licznik „block" TYKA przy pracującym silniku** (pytanie z urządzenia: „czy
  aktualizuje się czas block?"). Rachunek `blockSince` był dobry (otwarty cykl domyka
  „teraz"), ale „teraz" pochodziło z renderu - licznik na ekranie stał. Sekundowy
  tick jak w kokpicie, tylko przy `engineRunning`
- **litery sekcji „A"/„B", plakietki zasięgu zapisu** („zapis lokalny · offline OK",
  „kończy Twoją operację") **i przypisy pod przyciskami** („zdarzenie crew_change ·
  zapis natychmiastowy…", „działa offline…") **USUNIĘTE** - opisywały budowę
  aplikacji (kategoria z issue #43/#72). Baner „Dlaczego dwie osobne sekcje" zszedł
  razem z podziałem, który tłumaczył
- **sekcja przekazania PIC zredagowana**: bez „(zasada jednego piszącego urządzenia)"
  i „bez nich zaczyna od zera"; krok 2 mówi słownikiem flow („Nowy dowódca na swoim
  telefonie rozpoczyna lot i przejmuje ten samolot z listy maszyn - przekazane
  odczyty porównuje z licznikami"). Architektura pod spodem bez zmian: PIC zmienia
  się wyłącznie przez zdanie + przejęcie (`PIC_CHANGE_NOT_ALLOWED`)

## Usunięcie CAŁEGO wpisu = `session_void` (uwaga z urządzenia, 2026-08-30)
„Daj możliwość usunięcia całego lotu. Ta operacja powinna być poprzedzona jeszcze
potwierdzeniem użytkownika, aby nie było przypadkowego usunięcia."
- **NOWE ZDARZENIE, nie `void` na przejęciu**: domena tego drugiego ODMAWIA i słusznie -
  `session_claim` jest tożsamością operacji, a `preflight_confirm`/`day_close` trzymają
  końce łańcucha MH. Skasowanie CAŁOŚCI jest innym faktem niż skasowanie kawałka i ma
  własny zapis, zamiast obchodzić istniejące reguły
- **rejestr zostaje APPEND-ONLY**: nic nie znika z bazy. Operacja przestaje się LICZYĆ -
  wypada z dnia pilota, z sum, z historii i z eksportu - ale jej strumień zostaje razem
  z powodem. Administrator ma widzieć, że wpis był i został wycofany; zniknięcie bez
  śladu byłoby w rejestrze lotniczym wadą, nie funkcją
- **filtr stoi W `projectPilotDay`**, w jednym miejscu: gdyby pomijał go ekran, wycofana
  operacja znikałaby z listy, ale nadal dokładała się do „Blok" i „Loty"
- **na serwerze to TRZECI STATUS operacji** (`voided`; kolumna jest zwykłym TEXT-em bez
  CHECK-a, więc wchodzi bez migracji). Oba krytyczne wykluczenia są napisane jako
  „musi być `closed`", więc działają same: eksport do arkusza (`dayExporter`) i ŁAŃCUCH
  MH (`aircraftStateView`) pomijają taki wiersz. Lista eksportów mówi `impossible`,
  nie `waiting` - operacja wycofana nie czeka na nic
- **uprawnienie TO SAMO, co przy korekcie**: typ jest w `CORRECTION_EVENT_TYPES`, więc
  pilot ma 24 h od zdania, a administrator nie jest blokowany nigdy. Reguły odrzucają
  unieważnienie operacji nieotwartej (`SESSION_VOID_NO_SESSION`) i drugie z rzędu
  (`SESSION_ALREADY_VOIDED`)
- **w APLIKACJI PILOTA wejście jest JEDNO i tylko w trybie EDYCJI** (`10D` → arkusz `10L`), na samym dole,
  za wszystkim: intencją wchodzącego w edycję jest poprawka, a kasowanie jest wyjściem
  awaryjnym. Przycisk OBRAMOWANY, nie wypełniony - czerwień mówi „uwaga", nie „zrób to";
  pełnowymiarowy, inaczej niż kosz w linii tytułu arkusza (issue #43), bo kosz kasuje
  jedno zdarzenie, a ten przycisk CAŁY wpis
- **arkusz nazywa KONKRETNY wpis** (maszyna, bieg silnika, Loty·Blok·Lot): dwie operacje
  tej samej maszyny w dobie różnią się wyłącznie godzinami. Baner mówi o SKUTKU
  („zapis zostaje w rejestrze i widzi go administrator") - to NIE jest przypis o budowie
  rejestru, tylko odpowiedź na pytanie, które pilot zada sobie przed tapnięciem
  w czerwony przycisk. Powód OPCJONALNY, jak przy każdej korekcie
- **ADMINISTRATOR MA DRUGĄ DROGĘ, BEZ OKNA** (zamówienie 2026-08-31: „z poziomu admina
  powinienem mieć możliwość w dowolnym momencie usunięcia operacji"). `POST
  /admin/api/sessions/:uuid/void` na zdolności `events.correct`, karta na dole ekranu
  operacji w DZIENNIKU panelu. „W dowolnym momencie" obejmuje operację W TOKU - kolizja
  z pilotem jest ostrzeżeniem (`ADMIN_EDIT_SESSION_ACTIVE`), nie odmową, dokładnie jak
  przy korekcie. Powód jest tam WYMAGANY (w telefonie opcjonalny): pilot wycofuje własny
  wpis, administrator - cudzy lot. Decyzje i trzy naprawione miejsca, w których status
  `voided` nie docierał poza kolumnę w bazie (karta arkusza z wycofaną operacją, martwa
  plakietka w panelu, maszyna zajęta bez końca): `docs/panel-2.0.md` §9.4b

## Operacja osierocona: zakończenie przez administratora i odczyty z panelu (issue #81, 2026-09-03)
Zgłoszenie: „admin powinien móc zakończyć rozpoczęty dowolny lot przez panel […]
opcjonalnie oznaczyć jako usunięty. Pamiętać o offline first […] Nie możemy pozwolić,
żeby [zdanie z telefonu] zostało wysłane na serwer" oraz „admin przez panel powinien
móc modyfikować odczyty, które będą nadrzędne (MH, paliwo, olej) […] jako oddzielna
akcja, z komentarzem". Dzięki temu znikają osierocone loty i sztuczne zajętości maszyn.
- **`session_close` = NOWE zdarzenie, nie `day_close` w imieniu pilota**: zdanie niesie
  OBOWIĄZKOWE odczyty i twarde reguły o silniku (`ENGINE_RUNNING_AT_DAY_CLOSE`),
  a administrator przy biurku nie wie, co pokazują przyrządy; poluzowanie reguł
  `day_close` dla panelu złamałoby „twarde reguły identyczne w obu trybach"
  (`writeAuthority.test.ts`). Nowy fakt: „tę operację zakończył administrator", z powodem,
  BEZ odczytów - projekcja dostaje `closed` + `closedByAdmin` + `adminCloseReason`,
  odczyty końcowe zostają `null`, więc operacja NIE jest ogniwem łańcucha MH
  (`pickHandover` ją pomija). Reguł per typ nie ma; „już zakończona" = `DAY_ALREADY_CLOSED`
- **domena nie zna ról, więc „tylko panel" pilnuje POWIERZCHNIA**: `POST /events`
  odrzuca `session_close` w kopercie (`403 admin_only_event`, `ADMIN_ONLY_EVENT_TYPES`),
  a telefon nie ma komendy, która by je składała. Jedyna gałąź zależna od uprawnienia
  zostaje ta sama: `correctionWindow` zamyka okno pilota NATYCHMIAST po zakończeniu
  administracyjnym (komunikat `CORRECTION_WINDOW_EXPIRED` mówi wtedy „zakończył
  administrator"), administrator poprawia dalej
- **jedna karta w panelu dla operacji W TOKU**: „Zakończenie operacji" z wyborem
  „zostaw w dzienniku" / „od razu unieważnij" (lista kart, nie checkbox). Unieważnienie
  w tym samym ruchu = DWA zdarzenia (`session_close` + `session_void` z `source: 'admin'`),
  jedna decyzja, jeden wpis audytu `session.close`. Karta „Unieważnienie wpisu" zostaje
  dla operacji ZAKOŃCZONYCH. `session_void` z panelu nosi odtąd `source: 'admin'`
  (telefon musi odróżnić cudze wycofanie od własnego)
- **TELEFON: najpierw pyta, potem wysyła** (`sessionStore.syncNow`): przy niepustym
  outboksie dosyłka z `GET /me/events` idzie BEZ bramy wieku PRZED wysyłką, żeby decyzja
  panelu była w lokalnym rejestrze, zanim silnik przemiecie kolejkę. Do #81 kolejność była
  odwrotna i zdanie z telefonu potrafiło dojechać po zakończeniu administracyjnym
- **ZAPISY WSTRZYMANE** (`withheld_events`, migracja SQLite 7; `EventsRepo.withholdAdminEnded`
  w `SyncEngine.drain` PRZED każdą wysyłką): zaległe zapisy operacji zakończonej albo
  unieważnionej przez administratora WYPADAJĄ z outboxa na zawsze, ale ZOSTAJĄ w rejestrze
  (`synced_at` dalej `null` - serwer ich nie ma; ekran 10 dalej je pokazuje, plakietka
  „Oczekuje na przesłanie" ich nie liczy). Trzy powody: `admin_close`, `admin_void`,
  `server`. Niezmiennik: outbox nigdy nie niesie zapisu do operacji zakończonej przez panel
- **serwer ma DRUGĄ zaporę na wyścig**: ingest sprawdza sesje o statusie innym niż
  `active` i zdarzenia do operacji z `closedByAdmin`/`voidedByAdmin` ODRZUCA bez wpisu,
  zwracając ich uuidy w `withheld` - telefon oznacza je jak własne wstrzymane. To jedyny
  świadomy wyjątek od „serwer nie odrzuca, flaguje" (§4.5): decyzja administratora jest
  ostatnim słowem o tej operacji
- **kokpit schodzi na 01 sam** (`CockpitScreen`, efekt na `closedByAdmin || voidedByAdmin`;
  `holdsAircraft` pyta też o `voided`), store czyści klucz usługi GPS, a na 01 stoi baner
  `status` amber z przyciskiem „ROZUMIEM" (`logic/adminNotices.ts` + `useAdminNotices`):
  KTÓRA operacja (sygnatura albo znak i chwila), POWÓD, los zapisów („3 zapisy nie wyjdą
  na serwer"). Potwierdzenia trwają w `session_meta` (`admin.notices.acked`) - operacja
  unieważniona nie ma innego śladu na ekranie. Kafelki 01/12 dostają plakietkę
  „Zakończył administrator" (`SessionCardVm.adminClosed`), oś operacji własny wiersz
  `adminClose` z powodem (bez ołówka; „Zdanie" tylko gdy zdanie BYŁO), ekran 10 baner
  zamiast „minęły 24 h" i tryb PODGLĄDU
- **ODCZYTY ADMINISTRATORA = tabela `aircraft_readings` (migracja 5), NIE zdarzenie i NIE
  `initial_*`**: zdarzenia należą do operacji i PIC-a; stan początkowy opisuje jedną chwilę
  wprowadzenia jednostki. Wpis (`POST /admin/api/fleet/:id/readings`, komentarz WYMAGANY,
  audyt `aircraft.reading`, append-only) wchodzi do `pickHandover` jako KONKURENT zdania:
  bazą przekazania zostaje ten, kto stoi DALEJ W ŁAŃCUCHU MH (wyższy licznik; remis -
  późniejszy zegarem), więc kolejne zdanie wypiera go samo. Olej opcjonalny (bez niego
  kotwica oleju zostaje przy rejestrze). Telefon dostaje `Handover.origin: 'admin'`
  (02A: „odczyty wpisał administrator"), ETag `/reference` zmienia się z każdym wpisem.
  Panel: `reading.source: 'admin'` + `note`, karta „Poprawa odczytów" w szufladzie
  samolotu (tryb `locked`; przy `initial` poprawia się wprost w polach). Czego wpis NIE
  dotyka: rejestru zdarzeń, flag łańcucha, analityki zużycia, `readings-chain` wpisu
  ręcznego - świadoma granica pierwszej wersji
- **makiet dla nowych stanów NIE MA** (baner na 01, baner na 10, wiersz osi) - zgłoszone
  właścicielowi przy wdrożeniu jako dług; reguła „ekran 1:1 z `design/*.html`" zostaje

## Ustawienia mają JEDNO wejście, kokpit ma jasność (issue #82, 2026-09-04)
Pięć uwag ze zgłoszenia; wszystkie sprowadzają się do tego samego pytania „po co mi to
tutaj":
- **zębatka stoi WYŁĄCZNIE na 01** („zostawmy ustawienia takie, jakie są na głównym
  ekranie; usuńmy wszędzie indziej"). Zniknęła z paska kokpitu (04/04A/05 i warianty),
  a `AppBar` stracił prop `onSettings` - nowa akcja paska wchodzi przez `right`.
  To domyka modalność kokpitu: ustawienia były jej ostatnim wyjątkiem
- **w miejscu zębatki stoi PRZEŁĄCZNIK JASNOŚCI** (`ThemeToggle` + czysta decyzja
  w `components/settings/themeTarget.ts`). Jasność zostaje w kokpicie, bo jest
  odpowiedzią na SŁOŃCE, a nie na chęć konfigurowania aplikacji - w locie pilot nie
  może zejść z ekranu, na którym pracuje. **IKONA POKAZUJE SKUTEK TAPNIĘCIA, NIE STAN**:
  w motywie ciemnym stoi SŁOŃCE. To ta sama reguła, przez którą issue #72 odrzuciło
  suwak - pilot nie ma zgadywać, co zrobi kontrolka; stan i tak widać, bo jest nim cały
  ekran. `ThemeSwitch` z dwiema pozycjami zostaje w ustawieniach, gdzie wybór jest
  świadomy i jest na niego miejsce
- **PIN i wylogowanie NA KOŃCU ekranu 13**, w tej kolejności („daj wylogowanie na samym
  końcu, a przed nim zmianę PIN-u"). Obie sekcje dotyczą DOSTĘPU, a wylogowanie jest
  jedyną rzeczą w tych ustawieniach, której nie da się cofnąć bez internetu. Na górze
  stały na drodze każdego, kto przyszedł po cokolwiek innego
- **wiersz „Samolot operacji" USUNIĘTY** („to jest do usunięcia"): mówił, którą maszynę
  pilot ma w ręce, czyli to, co pasek kokpitu i kafelek na 01 niosą w kółko - a pisał
  przy tym SUROWY identyfikator z panelu (ta sama klasa błędu, co guid w nagłówku śladu,
  issue #84)
- **JEDEN STEMPEL CZASU ZAMIAST DWÓCH** („czemu mam dwa czasy, które się różnią […] to
  nie powinno być jakoś to samo, w sensie jeden mechanizm synchronizacji?"). Pytanie
  trafiło w USTERKĘ, nie w kosmetykę: stempel wysyłki aktualizował się WYŁĄCZNIE wtedy,
  gdy było co wysłać (`SyncOutcome.idle` przy pustej kolejce nie jest `synced`), więc
  pilot bez zaległości widział godzinę sprzed kilku godzin obok świeżego stempla danych
  referencyjnych. Odtąd wiersz „Ostatnia synchronizacja" niesie PÓŹNIEJSZY z dwóch
  kierunków (`lastContactAt` w `logic/syncStatus.ts`), bo pytanie brzmi „od kiedy nie
  mam kontaktu z serwerem"; poza bieżącą dobą UTC dochodzi data, bo sama godzina przy
  stemplu sprzed dwóch dni kłamie. `RefDataStamp` skasowany
- **„UWAGI SERWERA" ZNIKNĘŁY Z APLIKACJI PILOTA** („widzę takie ostrzeżenie i nie wiem,
  co mam dalej zrobić i zareagować"). Flagi §4.5 są narzędziem ADMINISTRATORA -
  rozstrzyga je panel, a pilot dostawał listę rzeczy, których nie naprawi. Ta sama
  kategoria, którą issue #72 wyrzuciło z ustawień, a issue #84 z kokpitu (rozjazd
  zegara). Serwer nadal odsyła je w odpowiedzi na wysyłkę i nadal widzi je panel;
  zniknął magazyn na telefonie (`sessionStore.serverFlags`) i katalog napisów
  (`flagLabel`, `serverNoticeLabel`), którego nikt już nie czytał

## Motywy: DWA i przełącznik ciemny/jasny (issue #72, 2026-09-01)
„Niepotrzebnie mamy tak duży wybór motywów. Zostawmy domyślny ciemny oraz jasny jako
»Solar«. Można usunąć całe to wybieranie i zostaje tylko switch ciemny/jasny. Dodatkowo
ekran z podglądem motywów jest do usunięcia i nie jest już potrzebny."
- **zostają DWA motywy**: `night` (ciemny, domyślny) i `solar` (jasny, maksymalny
  kontrast pod pełne słońce). **Paper, Sky i Amber/NVG USUNIĘTE** z `packages/tokens` -
  pięć palet było wyborem, którego pilot nie ma po co dokonywać: pyta „widzę czy nie widzę
  ekranu", a nie „która biel". Wartości usuniętych palet zostają w historii gita
- **pilot wybiera JASNOŚĆ, nie nazwę palety**: sekcja „Motyw wyświetlacza" na 13 to
  `ThemeSwitch` - dwie pozycje obok siebie („Ciemny" / „Jasny", księżyc i słońce), obie
  widoczne naraz. Nie suwak: suwak pokazuje stan bieżący i każe zgadywać, co zrobi
  przesunięcie - ta sama reguła, przez którą w całej aplikacji zamiast selecta stoją karty.
  Opisy palet („ciepła biel · mniej odblasków za dnia") zniknęły razem z wyborem
- **nazwy `night`/`solar` ZOSTAJĄ** w kodzie, w rekordzie per pilot i w kolumnie
  `pilots.theme`. Zmiana na `dark`/`light` byłaby ładniejsza, ale przemalowałaby ekran
  każdemu, kto już raz zsynchronizował motyw: serwer trzyma nazwę jako nieprzezroczysty
  tekst i nie ma jak jej przetłumaczyć
- **motyw wycofany wraca z profilu i schodzi do tej samej JASNOŚCI** (`resolveThemeName`
  w `packages/tokens`, z testem): Paper i Sky → Solar, Amber → Night, nazwa nieznana →
  Night. Bez tej tablicy pilot latający w słońcu na Paperze obudziłby się w ciemnym
  kokpicie w środku dnia. Sprawdzenie idzie przez LISTĘ i mapę, nigdy przez
  `name in THEMES`: rekord `{ theme: 'toString' }` odpowiadał na to pytanie twierdząco
  i wywracał render
- **USTAWIENIA NIE TŁUMACZĄ, JAK APLIKACJA JEST ZBUDOWANA** (uwaga z urządzenia,
  2026-09-01: „po co tam piszesz, że zmiana działa offline? To powinno być
  w dokumentacji, a nie na UI - to nie interesuje biznesowego usera"). Z ekranu 13
  i z mockupu wyleciało PIĘĆ przypisów sekcji: motyw („zapisuje się w profilu pilota …
  zmiana działa offline"), PIN („sprawdzany lokalnie … w 100% offline"), synchronizacja
  („kolejka opróżnia się sama …"), GPS („czujnik lokalny …") i dane referencyjne
  („odświeżają się same …"). Mechanizmy (rekord per pilot, `/me/prefs`, LWW, pętla
  okazji, brama wieku) mieszkają w docblokach i w `docs/architektura-kodu.md` - pilot
  przyszedł przyciemnić ekran albo zmienić PIN, a nie poznać warstwę synchronizacji.
  **ZOSTAŁ JEDEN**, przy koncie: „Ponowne logowanie wymaga internetu - konta zakłada
  administrator", bo niesie POWÓD, dla którego wylogowanie jest decyzją.
  Reguła na przyszłość - ta sama kategoria, którą issue #43 wyrzuciło z arkuszy korekty,
  a issue #55 spod klawiatury PIN: **na ekranie zostaje to, co niesie BLOKADĘ z powodem
  albo instrukcję do wykonania** - nie opis budowy aplikacji
- **EKRAN PODGLĄDU MOTYWÓW USUNIĘTY** w całości: `StyleGuideScreen` i trasa
  `StyleGuide` (razem z wejściem „Podgląd motywów w kokpicie" z 13) oraz mockup
  `design/05-themes.html`. Katalog tokenów i prymitywów odpowiadał na pytanie
  „czy system motywów działa", zadane raz, w fazie 1
- **ŹRÓDŁEM PRAWDY PALET JEST ODTĄD `packages/tokens`**, nie mockup - `05-themes.html`
  był jednym plikiem naraz: ekranem podglądu i słownikiem wartości, a skasowaliśmy ekran.
  Reguła „ekran wdrażamy 1:1 z `design/*.html`" zostaje w mocy dla wszystkich pozostałych
  ekranów aplikacji; kolory mockupów dalej stoją w bloku `:root` ich `<head>`, a równość
  z tokenami przybija `app/src/__tests__/tokensCssVars.test.ts`

## Log zdarzeń jest JEDEN - kokpit rysuje oś operacji (issue #44, 2026-08-14)
Aplikacja miała dwa style logu tej samej operacji: oś na ekranie operacji (10) i osobny
`EventLog` w kokpicie (04, 05, 04B). Ta sama operacja czytała się przez to dwa razy inaczej,
choć oba widoki opisują JEDEN bieg silnika - raz oglądany w trakcie, raz po wszystkim.
Zostaje oś: `components/data/SessionAxis.tsx` + builder `logic/sessionAxis.ts`.
- **`EventLog` SKASOWANY** razem z całym swoim inwentarzem: szyną ikon w plakietkach,
  chipami licznika i paliwa, pełnoszerokimi pasami tankowania i separatorami „Lot n".
  Kokpit buduje wiersze przez **`buildCockpitAxis`** (`logic/cockpitLog.ts`), które woła
  ten sam `buildSessionAxis`, co ekran 10
- **role dokłada wywołujący, nie przełącznik trybu**: kokpit podaje wiersz `live`
  i znaczniki outboxa, rozliczenie - stopkę sum i (w edycji) `onCorrect`. To obecność
  albo brak danych, nie flaga „tryb kokpitu"
- **odczyt startowy wraca do PRZEJĘCIA**: wisiał jako chipy przy „Start engine", czyli
  przy zdarzeniu, które go nie wykonało - bo log kokpitu nie miał wiersza przejęcia
  w ogóle. Kokpit ma go odtąd tak samo jak 10, razem z podpisem odczytów.
  **Podpis nazywa media** (uwaga z urządzenia, 2026-09-03): „paliwo 112 L ·
  1 236:30 · olej 8,2 L" - słowo „odczyt" obok oleju nazwanego mediem przestało
  odróżniać, a słownik jest JEDEN dla przejęcia i zdania (`readingLine`).
  Olej w podpisie przejęcia to SAM POMIAR ZASTANY, bez „(+dolewka)" (druga tura:
  „nie pisz, ile dolano, tylko ile zastano") - dolewka jest zdarzeniem przebiegu
  i ma na osi własny wiersz, a powtórzona w nawiasie mówiła to samo dwa razy
- **słownik jest jeden i polski**: „Uruchomienie", „Kołowanie", „Start", „Lądowanie",
  „Wyłączenie" - zamiast „Start engine", „Taxi", „Takeoff", „Landing", „Stop engine".
  Angielskie nazwy zostają tam, gdzie opisują FAZĘ lotu (hero 05), nie zapis w rejestrze
- **wiersz „na żywo" nie ma godziny**: nie jest zdarzeniem rejestru, tylko czasem
  TRWANIA, a te w tej osi stoją po prawej (tam, gdzie czas lotu przy lądowaniu).
  W powietrzu liczy od startu, na ziemi od uruchomienia silnika
- **znika czas kołowania i podpis „blok 1:13"**: pierwszy materializował się dopiero przy
  starcie, więc nigdy nie pomógł temu, kto kołuje; drugi jest sumą OPERACJI i mieszka
  w stopce osi. Stopka w kokpicie pojawia się dopiero po zatrzymaniu silnika (jest co
  sumować) i **nie powtarza trasy** - ta stoi w pasku górnym
- **liczba lotów schodzi z nagłówka karty**: mówi ją stopka trzy centymetry niżej.
  Nagłówek w locie przestał też liczyć „3 T/O · 2 LDG", a słowo „cykl" zniknęło
  z ostatniego miejsca, w którym przetrwało pivot 2026-08-10
- **zdarzenia naziemne wchodzą na oś WSZĘDZIE** (tankowanie, załadunek, zmiana załogi).
  Na 10 ich nie było i to był błąd, nie decyzja: rachunek paliwa mówił „dolane ·
  2 tankowania", a oś milczała o tym, kiedy - mimo że arkusz 10H pozwala tankowanie
  DOPISAĆ, a dopisany wpis znikał bez śladu. Tankowanie niesie „+48 L → 171 L" (dolewka
  i stan po niej; stan przed to poprzedni odczyt, który stoi wyżej na tej samej osi)
- **`manual_log_entry` na oś NIE wchodzi**: niesie dziś samą uwagę i mieszka w karcie
  „Notatki" (issue #40 pkt 5); na osi byłby zdarzeniem bez przebiegu
- przy równym stemplu tankowanie i załadunek stoją PRZED uruchomieniem silnika i PO jego
  wyłączeniu (`RANK` w `sessionAxis.ts`) - dolewa się przy zatrzymanym śmigle

## Ślad idzie z SERWERA, a telefon go nie trzyma (issue #47, 2026-08-14)
Zapis GPS przestał mieszkać na telefonie: nagrywa → oddaje (`POST /traces`) → **kasuje**,
a ekran 14 pobiera gotową geometrię z `GET /me/sessions/:uuid/track`. Retencja 14 dni
była limitem PAMIĘCI URZĄDZENIA, nie decyzją o wartości danych - ślad przestał więc
znikać, wraca po reinstalacji i jest na nowym telefonie.
- **koperta niesie WYŁĄCZNIE geometrię** (linia, profil, log, statystyki). Rejestracja,
  loty, czasy i czas w powietrzu liczą się dalej z LOKALNEGO rejestru (§6 pkt 1) - stąd
  wariant `14c` (bez zasięgu) pokazuje komplet czasów i mówi wprost, że brakuje rysunku.
  Dołożenie danych rejestru do tej koperty tworzy DRUGĄ prawdę o operacji: pilnuje tego test
- **to jedyny świadomy wyjątek od offline-first** (decyzja użytkownika przy wyborze
  wariantu): ślad jest materiałem do OGLĄDANIA po locie, nie przyrządem w locie. Reguła
  „dane operacji nie mają wariantu z cache" zostaje nietknięta
- **cztery powody braku znaczą co innego** i nie wolno ich zwijać do jednego: `manual`
  (wpis ręczny), `no-record` (serwer nie ma), `pending-upload` (nagranie czeka
  w kolejce NA TYM telefonie), `offline` (jest, brakuje drogi). „Brak śladu" pokazany
  komuś, kto ma tylko wyłączone dane, jest kłamstwem o jego locie
- **ale każdy z nich mieści się w JEDNYM krótkim zdaniu** (uwaga z urządzenia,
  2026-09-04: „jak mam przeglądanie zapisanych śladów, to po co pisać «telefon nagrał
  tę trasę i oddał ją serwerowi»? Lepiej dać info, że nie ma danych, i koniec").
  Ekran braku trasy opowiadał MODEL PRZECHOWYWANIA śladu - kto nagrał, komu oddał,
  że nie zajmuje pamięci telefonu i wraca po reinstalacji - czyli tę samą kategorię
  przypisów, którą issue #43 wyrzuciło z arkuszy korekty, a issue #72 z ustawień.
  Baner o modelu śladu USUNIĘTY w całości (`MissingTrackCopy` nie ma już pola
  `banner`), liczba punktów w kolejce zeszła razem z nim (`pendingFixes` wypadło
  z `SessionTrackView` - pilot nie ma z niej co zrobić), a `offline` jest jedynym
  powodem, którego zdanie jest INSTRUKCJĄ („Wróć na ten ekran z zasięgiem"), bo jako
  jedyny ma drogę wyjścia. Krótko ≠ jednakowo: rozróżnienia czterech powodów i braku
  technicznego słownika pilnuje `missingTrack.test.ts`
- **kompresja to RDP + zaokrąglenia** (`track/payload.ts`): linia w metrach, profil
  w stopach, współrzędne do 5 miejsc. Statystyki liczą się PRZED upraszczaniem -
  inaczej „max wznoszenie" zależałoby od tolerancji rysowania
- **LOGU PUNKTÓW NIE MA** ani na ekranie, ani w kopercie (przegląd 2026-08-15): tabela
  surowych fixów ze stanem bramki jakości jest materiałem do STROJENIA PROGÓW, a nie
  odpowiedzią na pytanie pilota - została w nagraniu czytanym przez `replay.ts`
  (panel 2.0 również jej nie pokazuje: ekran operacji rysuje mapę i profil, nie tabelę). Ekran nie ma też banera o pochodzeniu danych ani podpowiedzi o gestach:
  jedno i drugie opowiadało o BUDOWIE aplikacji komuś, kto ogląda swój lot
- **atrybucji źródeł katalogu nie ma na mapie** (2026-08-15) - obowiązek ODbL spełnia
  `docs/dane-lotnisk.md` §3.2. To zamiana miejsca, nie przeoczenie: przywrócenie napisu
  na mapę wymaga rozmowy
- **linię rysuje się w przestrzeni EKRANU** (`screenPolyline.ts`) i obowiązują tam DWIE
  reguły, obie okupione zgłoszeniem z urządzenia:
  1. odcinek podpikselowy **scala się z następnym**, a nie znika. Stary kod pomijał go
     i zostawiał DZIURĘ - dlatego gęsty zapis rysował się jako zbiór kropek. Nie
     przywracaj żadnego „pomiń krótki odcinek": to jest dokładnie ten błąd;
  2. prostokąt odcinka jest **dłuższy od niego o grubość kreski** (pół z każdej strony).
     Prostokąt o dokładnej długości styka się z sąsiadem w JEDNYM PUNKCIE osi, a przy
     zaokrąglonych końcach i obrocie to za mało: łuk rozpadał się w kropki, a wierzchołek
     załamania był ścięty. Nadmiar zamienia styk w okrągłe złącze (`stroke-linejoin:
     round` w SVG). Nie „optymalizuj" tego z powrotem do dokładnej długości
- **znaczniki stoją na OBU wykresach** z czasem: mapa z nazwą („T/O 1 · 08:20"), profil
  samą godziną, bo tam rodzaj niesie kolor - pełne nazwy przy czterech znacznikach nie
  mieszczą się w szerokości telefonu. Maksimum bliższe niż 2 min od innego znacznika
  DOPISUJE się do jego podpisu jako „MAX" zamiast stawiać drugi punkt w tym samym miejscu
- **statystyki mają trzy bloki i każdy gaśnie osobno** (`null` = ekran milczy): prędkość
  z pionem, czasy faz (pasek proporcji, suma = bieg silnika), trzymanie wysokości
  w locie poziomym. Prędkość pionowa liczy się TĄ SAMĄ regresją, co faza w kokpicie
  (`verticalSpeedSeries`) - druga definicja „wznoszenia" rozjechałaby się po cichu
- **kursor prowadzi się WYŁĄCZNIE na profilu**, mapa go tylko pokazuje (przegląd
  2026-08-15). Kursor jest pytaniem o CHWILĘ, a mapa nie ma osi czasu: dotknięcie trasy
  trzeba było przekładać na najbliższy wierzchołek, co nad polem skoków wskazywało
  dowolny z pięciu przelotów. Skutek uboczny jest korzystny - jeden palec zostaje
  ekranowi na przewijanie, a mapa ma na nie 300 px wysokości
- **przybliżony profil PODŚWIETLA fragment trasy na mapie, nie przestawia jej kadru.**
  Sprzężenie zoomu byłoby jednostronne: profil → mapa jest jednoznaczny, mapa → profil
  nie (ten sam obszar to kilka przelotów). Podświetlenie odpowiada „ten kawałek oglądasz"
  bez uciekania mapy spod palca. Fragment jest zawsze JEDEN, bo linia jest uporządkowana
  czasem (`highlightRuns.ts` - pierwsza wersja zbierała listę i test pokazał, że nie ma
  jak zajść przypadek, dla którego ją napisano)
- **gesty bez modułu natywnego** (`PanResponder`): jeden palec = kursor NA PROFILU,
  dwa palce = zoom i przesunięcie, dwuklik = powrót do całości. Kadr
  przelicza WSPÓŁRZĘDNE, nie skaluje widoku - inaczej podpisy rosłyby razem z trasą.
  Matematyka kadru siedzi w `logic/mapViewport.ts` i ma testy. **Profil przybliża się
  TYLKO W POZIOMIE** (`zoomAxis: 'x'`): jego pionem jest wysokość dobrana do zakresu
  lotu, więc rozciąganie jej niczego nie odsłania - a rozciągnięcie czasu owszem, bo to
  ono rozdziela zdarzenia leżące na sobie
- **każdy wykres ma PODZIAŁKĘ i to ona jest wskaźnikiem przybliżenia**: mapa odległości
  („500 m" zamiast „2 km"), profil czasu („2 min" zamiast „15 min", `timeScaleBar.ts`).
  Nie plakietka „×2,4" - pilota interesuje odległość i czas, nie krotność. Obie stoją
  w LEWYM DOLNYM rogu swojej karty, z tymi samymi odstępami (8/6 px): dwa wykresy
  jednego ekranu trzymają skale w jednym miejscu, więc oko szuka ich raz. Profil nie
  dostaje za to osi z regularnymi znacznikami czasu: wpadłyby w rząd godzin przy startach
  i lądowaniach, a dwa rzędy liczb pod wykresem to błąd, który przegląd już raz wyrzucił
- **siatka pionowa profilu = JEDEN KROK PODZIAŁKI**, więc kratka jest odczytem („garb
  o dwóch kratkach trwał pół godziny"), a nie tłem. Jedzie razem z wykresem, bo opisuje
  czas - tak jak siatka współrzędnych mapy opisuje teren
- **dystans przy podziałce profilu dotyczy KONKRETNEGO ODCINKA**, nie „NM na piksel"
  (`logic/trackDistance.ts`). Na osi czasu proporcji między czasem a drogą NIE MA: pięć
  minut wznoszenia to inna droga niż pięć minut przelotu, a pięć minut postoju to zero.
  Dlatego liczba zmienia się przy przesuwaniu wykresu i to jest poprawne - opisuje to
  miejsce lotu, a nie średnią z całej operacji
- **kolejność ekranu: mapa → profil → statystyki**. Metryki spod mapy zeszły do karty
  statystyk (razem ze średnim wznoszeniem i zejściem spod profilu), żeby oba wykresy
  przylegały do siebie - kursor je sprzęga, więc pilot patrzy na nie na przemian

## Norma zużycia liczy się PER OPERACJA, nie per godzina (issue #38, 2026-08-12)
Werdykt „w normie" porównywał L/h operacji z pasmem blokowym samolotu - czyli z liczbą
policzoną na średniej mieszance faz z 90 dni. Operacja z długim kołowaniem wychodziła przez
to „poniżej normy" bez żadnego powodu poza proporcją ziemi do powietrza, a motogodziny
nie miały normy w ogóle: ekran twierdził, że ΔMH RÓWNA SIĘ czasowi blokowemu, czemu
`consumption/mhModel.ts` wprost zaprzecza (obrotomierz na ziemi przyrasta wolniej niż zegar).
- **jedno równanie dla obu wielkości**: `oczekiwane = k_lot · t_lot + k_ziemia · t_ziemia`
  (`consumption/expectation.ts`). Paliwo i motogodziny dostają dzięki temu tę samą formę
  prezentacji na ekranie - rachunek, wynik, pasmo, werdykt - a nie dwie przypadkowo różne
- **pasmo z ROZRZUTU OBSERWACJI, nie z przedziału ufności** (`consumption/ratio.ts`):
  centyle 10/90 ilorazu fakt/model, liczone TĄ SAMĄ formułą, którą policzy telefon.
  Reguła przeniesiona wprost z `summary.ts` - przy stu równaniach przedział ufności jest
  wąski i werdykt zapalałby się na normalnej zmienności między lotami
- **podłoga pasma z podziałki przyrządu** (`policy.ts`: 6 L, 0,1 MH): przy danych
  wewnętrznie spójnych rozrzut schodzi do zera i bez podłogi werdykt orzekałby o różnicy
  mniejszej niż to, co paliwomierz i licznik w ogóle umieją pokazać. **DO KALIBRACJI**
  razem z resztą progów - `server/scripts/consumptionReplay.ts`
- **norma telefonu niesie parę stawek, nie cały model**: model czterofazowy skleja się do
  „ziemia + powietrze" ŚREDNIĄ WAŻONĄ udziałem faz w oknie. Do issue #38 stawką lotu był
  sam `cruise` - najniższa z trzech - więc dla dnia skokowego (prawie samo wznoszenie
  i zniżanie) norma zaniżała zużycie, a razem z nim rezerwę paliwa w kokpicie
- `null` znaczy „nie ma czego pokazać" i ekran wtedy MILCZY: brak przeliczników MH nie
  unieważnia normy paliwa i odwrotnie (inne wejście, inny próg publikacji)

## Zgłaszanie błędów z aplikacji (issue #87, 2026-09-04) - NA CZAS TESTÓW
Zgłoszenie: „na każdym ekranie i w każdym popup dodaj w prawym górnym rogu przycisk
do zgłoszenia buga […] ten kontekst okna powinien być również dołączony do buga.
Im więcej informacji tym lepiej." Kanał zwrotny na czas testów z pilotami; makieta
decyzji: **`design/ZGLOSZENIA.html`**.
- **PRZYCISK MIESZKA W RAMACH, NIE W EKRANACH** - `ScreenHeader`, `AppBar`
  i `SheetSurface`. Ekranów jest kilkanaście, arkuszy dwadzieścia, więc nowy ekran
  dostaje go w chwili powstania, bez ani jednej linijki u siebie (ta sama zasada, przez
  którą sufit wysokości arkusza siedzi w `SheetSurface`). Stoi na SAMYM SKRAJU - za
  zębatką (01), za `ThemeToggle` (kokpit), w rzędzie uchwytu arkusza: przez czas testów
  to jedyny element obecny wszędzie, więc ma jeden adres pod kciukiem. **Cichy**
  (`textMuted`, jak zębatka): amber przy każdym nagłówku uczyłby oko pomijać róg ekranu
  (reguła SyncChipa z issue #12). Kolor niesie dopiero arkusz - bursztynowy, bo
  zgłoszenie niczego nie niszczy
- **NIE MA GO NA LOGOWANIU I PIN-ie**: zgłoszenie jedzie z tożsamością pilota, a przed
  odblokowaniem jej nie ma. To świadoma dziura - „nie mogę się zalogować" zgłasza się
  telefonem
- **ARKUSZ OTWIERA SIĘ TAM, GDZIE STOI PRZYCISK** (`BugButton` trzyma własny
  egzemplarz `BugReportSheet`). `Modal` na Androidzie jest osobnym oknem, a okno
  otwarte z korzenia nie ma gwarancji, że stanie NAD oknem arkusza, z którego je
  wywołano. Stąd też budowa arkusza wprost na `SheetSurface`, nie na `Sheet`: przez
  `Sheet` domknąłby się CYKL IMPORTÓW (`Sheet` → `BugButton` → `BugReportSheet` →
  `Sheet`), a cykl w Metro objawia się dopiero w locie. Rama dostała slot
  `topRight` - przycisk podaje jej wołający, nigdy ona jego
- **OFFLINE-FIRST, bez wyjątku**: zapis idzie do lokalnej tabeli (`bug_reports`,
  SQLite 8), wysyłkę robi pętla okazji na SAMYM KOŃCU przebiegu - jak ślad
  kalibracyjny (`BugReportSync`, `POST /me/bug-reports`, idempotencja po uuid,
  potwierdzone znika z telefonu). Pilot zauważa błąd tam, gdzie pracuje, czyli często
  bez zasięgu; formularz wymagający sieci nie pojechałby w teren, a tam odbywają się
  testy
- **KONTEKST ZBIERA SIĘ BEZ PYTANIA** (`bugContext.ts`, moduł czysty z testami):
  trasa nawigacji + tytuł arkusza, sygnatura i uuid operacji, samolot, zadanie, stan
  silnika i liczba lotów (z LOKALNEGO rejestru, więc też offline), pilot, wersja
  aplikacji ORAZ wydanie JS (`updateId` - patrz sekcja o aktualizacjach OTA), system,
  model telefonu, motyw, wersja schematu bazy, stan łączności
  z kolejką i stemplami, czas zgłoszenia i strefa telefonu. **`context` i wiersze
  pokazane pilotowi powstają z JEDNEGO wywołania** - napis „Dołączamy automatycznie"
  jest obietnicą, a lista pokazująca co innego, niż telefon wyśle, byłaby w narzędziu
  do zgłaszania błędów gorsza niż brak listy
- **ZRZUTU EKRANU NIE MA I NIE BĘDZIE**: wymaga modułu natywnego, a projekt ich unika
  (ta sama reguła, przez którą mapa śladu ma własny renderer). Zamiast obrazka jedzie
  STAN - z niego da się odtworzyć ekran, z obrazka nie da się odtworzyć danych
- **WAGA JEST OPCJONALNA** (blokuje / utrudnia / drobiazg, bez wartości podstawionej):
  zgłoszenie ma kosztować jedno zdanie, a nie decyzję. Pytanie brzmi „jak bardzo to
  przeszkadza W PRACY", nie „jak trudne do naprawienia". Pusty opis blokuje przycisk
  BEZ zdania (issue #55 - widać z kontrolki nad nim)
- **POTWIERDZENIE MÓWI „ZAPISANE", NIE „WYSŁANE"** - drugi stan tego samego arkusza.
  W chwili tapnięcia telefon nie wie, czy paczka dojdzie; zniknięcie arkusza bez słowa
  wygląda tak samo przy sukcesie i przy awarii (reguła „każda akcja zostawia ślad")
- **PANEL: moduł „Zgłoszenia"** (`#/zgloszenia`, czwarta pozycja nawigacji) - lista z licznikami
  wszystkich statusów i szuflada z pełnym opisem, kontekstem i zmianą statusu.
  Cztery statusy: **nowe → w toku → rozwiązane / odrzucone**; widok domyślny to
  „do zrobienia", bo archiwum przykryłoby robotę. Odczyt na `panel.access`, zmiana
  statusu na NOWEJ zdolności `bugs.triage` (decyzja o CUDZYM zgłoszeniu, ślad
  w audycie `bug.status`). Odrzucenie WYMAGA komentarza; treści zgłoszenia nie
  zmienia nikt, kasowania nie ma - odrzucenie z powodem niesie więcej niż pusty wiersz
- **KONTEKST WYPISUJE SIĘ CAŁY**, także pola, o których panel nie wie (`bugContextRows`
  nazywa po polsku znane, resztę pokazuje pod surowym kluczem). Serwer nie waliduje
  kształtu `context` i to jest decyzja: aplikacja dokłada tam nowe pola co tydzień
  testów, a schemat po tamtej stronie znaczyłby wdrożenie serwera przy każdej takiej
  zmianie - i odbicie `400` dokładnie wtedy, gdy zgłoszenie niesie najwięcej nowego
- **JAK TO ZDJĄĆ PO TESTACH**: `BUG_REPORTER_ENABLED = false`
  (`app/src/ui/components/bug/bugReporter.ts`) gasi przycisk we wszystkich trzech
  ramach naraz. Usunięcie w całości: katalog `components/bug/`, `bugReportPort.ts`,
  `bugReportSync.ts`, migracja SQLite 8, cztery wywołania w ramach, moduł
  `admin/src/screens/bugs/` z arkuszem `styles/components/bugs.css` i pozycją w `ui/shell/nav.ts`,
  po stronie serwera migracja 6 z trasami. Narzędzie fazy testów ma dać się usunąć
  decyzją, a nie archeologią

## Logowanie przez Google, rejestracja z zatwierdzeniem (2026-09-04, gałąź `logowanie-google`)
**Odwraca decyzję z 2026-07-22** („brak samodzielnej rejestracji, brak Google OAuth").
Hasła znikają z produktu w całości - z aplikacji pilota I z panelu. Pełne decyzje,
model danych, ryzyka i etapy: **`docs/logowanie-google.md`**.
- **BRAMKĄ JEST BRAK KONTA, NIE ROLA.** Zgłoszenie rejestracyjne żyje w osobnej tabeli
  `external_identities`; wiersz w `pilots` powstaje DOPIERO przy zatwierdzeniu przez
  administratora. Nie ma konta → nie ma czego podpisać w tokenie → `authorize()` odmawia
  bez ani jednej nowej reguły. **Nie opieraj tego na kolumnie `role`**: `pilot` to dziś
  NAJMNIEJSZE uprawnienia i cały system jest pod to zbudowany - `isPilotRole(...) ?
  role : DEFAULT_ROLE` w dwóch repozytoriach i w `hs256Tokens` degraduje nieznaną rolę
  do `pilot`, więc nadanie `pilot` znaczenia „wpuszczamy" zamieniłoby trzy bezpieczniki
  w luki. ODRZUCONE z tego samego powodu: flaga `approved_at` na `pilots` (wymusza
  nullowalny `code`, czyli sygnaturę operacji i karty arkusza, plus nową bramę na ~20
  trasach telefonu)
- **PIN i offline-first BEZ ZMIAN** - Google podmienia wyłącznie jednorazowy provisioning
  (§3.0), który i tak zawsze wymagał sieci. `AuthService`, rotacja refresha, „wygasły
  token ≠ wylogowanie", blokada wylogowania przy niepustym outboksie - nietknięte
- **TOKEN REJESTRACYJNY JEST OSOBNYM TYPEM.** Ekran oczekiwania musi odpytywać serwer,
  a zgłaszający nie ma konta. `verify()` MUSI zwracać `null` dla każdego tokenu
  z claimem `purpose`, a `verifyRegistration()` dla każdego bez niego - inaczej token
  rejestracyjny przechodzi zwykłą weryfikację (potrzebuje tylko `sub` i `code`) i jest
  ważną tożsamością wskazującą nieistniejące konto, czyli `POST /events` pisze zdarzenia
  z `pilot_id`, za którym nikt nie stoi. Test w OBIE strony
- **PODPIĘCIE KONTA PO ZWERYFIKOWANYM E-MAILU** - jedyne miejsce w systemie, gdzie e-mail
  cokolwiek uwierzytelnia. Działa, bo `pilots.email` wpisuje wyłącznie administrator
  (panel/seed), czyli jest listą dopuszczonych, a nie danymi od użytkownika. Wymaga
  `email_verified` od dostawcy i **zostaje wyłącznie dla Google** (Apple pozwala ukryć
  adres, Facebook zwracał niezweryfikowane). Tą samą drogą wchodzi administrator po
  wdrożeniu (`SEED_ADMIN_EMAIL`) i podpina się konto założone w A06 z adresem Google
  ZANIM pilot zaloguje się pierwszy raz. **Baza produkcyjna staje przy wdrożeniu OD
  ZERA (decyzja właściciela 2026-09-05)** - dotychczasowych kont z hasłami NIE
  przenosimy, więc kolejność wdrożenia to: pusta baza → seed → serwer → build, bez
  wpisywania e-maili zawczasu
- **POWÓD ODRZUCENIA JEST W PANELU WYMAGANY**, bo pilot czyta go na ekranie `00d`.
  Ekrany: `00a` (sam przycisk Google), `00b` (offline), `00c` (czeka na zatwierdzenie),
  `00d` (odrzucone). `00` (PIN) bez zmian
- **Apple i Facebook POZA zakresem**: Apple nie ma dziś platformy docelowej (EAS buduje
  wyłącznie Androida), Facebook wymaga App Review. Model jest na nie gotowy - klucz
  `(provider, subject)` od początku
- **`app.json` dostaje `scheme`** (redirect OAuth) - zmiana NATYWNA, więc testerzy muszą
  dostać nowy build; w starym przycisk Google nie zadziała
- **ETAP D (aplikacja) TEŻ WDROŻONY (2026-09-04)**: `ui/hooks/useGoogleSignIn.ts` jest
  JEDYNYM miejscem znającym `expo-auth-session`; `scheme` w `app.json` to PAKIET
  (`com.tomekklag.uzaero` - Google wymaga tego dla klientów Android, a dostawca składa
  adres powrotu z `Application.applicationId`); identyfikator klienta Android to stała
  buildu `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (`app/.env.example`, do EAS w `eas.json`).
  Zgłoszenie żyje pod OSOBNYM kluczem `SecureStore` (`StoredRegistration`) - wpisane do
  `StoredCredentials` udawałoby profil. Wynik wymiany kodu przychodzi STANEM hooka
  (`response.authentication.idToken`), nie z `promptAsync` - stąd strażnik czasu na
  nieudaną wymianę, której dostawca nie zgłasza. Znak Google to czysty komponent RN
  (`GoogleMark`: pierścień z czterech kolorowych krawędzi + maska + poprzeczka) - jedyne
  miejsce w aplikacji z kolorami spoza tokenów, bo to znak towarowy
- **ETAPY A–C WDROŻONE W KODZIE (2026-09-04), E (wdrożenie) czeka.**
  Serwer: `GOOGLE_WEB_CLIENT_ID` (WYMAGANY - bez niego nie wstaje) i
  `GOOGLE_ANDROID_CLIENT_ID` (opcjonalny), `SEED_ADMIN_EMAIL` zamiast `SEED_PASSWORD`;
  `scryptHasher`, `startPassword`, reset hasła i `PilotSecretDto` USUNIĘTE po obu
  stronach; **kolumna `pilots.password_hash` USUNIĘTA migracją 7** (`DROP COLUMN` -
  decyzja o bazie od zera 2026-09-05; pierwsza wersja zostawiała ją nullowalną „bo
  produkcja"). **Zerwanie sesji ma odtąd jedną drogę: deaktywację** (+ ponowne włączenie;
  `setActive` przesuwa `credentials_valid_from`, aktywacja go nie cofa) - reset hasła
  był drugą i zniknął razem z hasłem. Panel: kolejka zgłoszeń NAD listą pilotów
  wyłącznie gdy ktoś czeka (pusta nie dostaje karty z zerem - reguła SyncChipa),
  wszystkie trasy `/admin/api/registrations*` na `accounts.manage` **także odczyt**
  (e-maile osób spoza klubu), przycisk Google rysuje skrypt GIS w kontenerze
  `.login-google` (plamka w jego geometrii, dopóki nie wjedzie), a CSP statycznego
  buildu ma JEDEN obcy origin: ścieżki `accounts.google.com/gsi/`. Testy serwera
  podstawiają wyłącznie weryfikację podpisu Google (`test/testIdentityProvider.ts` -
  granica: nasza decyzja kontra cudza kryptografia), sama weryfikacja ma
  `googleIdTokens.test.ts` na kluczu RSA z procesu
- **AUDYT BEZPIECZEŃSTWA 2026-09-05 - trzy poprawki, każda z testem, który padał
  przed nią** (`docs/logowanie-google.md` §14): (1) **token rejestracyjny wydaje
  tokeny pilota RAZ** - `registrationStatus` odmawia, gdy `last_login_at` tożsamości
  jest ustawione (ktoś już wszedł) albo token jest starszy niż `credentials_valid_from`
  konta; pierwsza wersja wydawała świeżą parę przy każdym wywołaniu przez 30 dni, czyli
  skopiowany token był fabryką refreshów odporną na deaktywację; (2) **`aud` per
  powierzchnia** - `IdentityProviderPort.verifyIdToken(token, surface)`, `GoogleIdTokens`
  dostaje `{ panel: Web, mobile: Android | null }`; wspólny zbiór pozwalał wymienić
  token z przeglądarki na 90-dniowy refresh na trasie telefonu; (3) **podpięcie po
  e-mailu obejmuje zgłoszenie `pending`** (`ON CONFLICT … DO UPDATE … WHERE status =
  'pending'`) - bez tego rada panelu „wpisz adres w istniejącym koncie zamiast
  zatwierdzać" zostawiała człowieka w kolejce na zawsze. Nowy `LoginSurface` w portach;
  atrapa testowa ignoruje powierzchnię celowo (rozdział testuje prawdziwy weryfikator)

## Logowanie hasłem i sesje logowania - 2.1.0 (issue #130, 2026-09-16, gałąź `feature-130-logowanie-haslem`)
**Odwraca „e-mail + hasło - nigdy" z 2026-09-09** (`docs/wielofirmowosc.md` §15) z powodu,
którego tamta decyzja nie przewidziała: **w samolocie jest JEDEN tablet wspólny dla kilku
pilotów**, a logowanie Googlem na cudzym urządzeniu znaczy dodanie własnego konta do cudzej
przeglądarki. **NIE odwraca Google** (2026-09-04): Google zostaje pierwszą drogą na telefonie
osobistym i w panelu. Dokument decyzji: **`docs/logowanie-haslem.md`**; epiki H-A…H-F + H-W
= issue #131–#138, zadanie właściciela #137. Decyzje właściciela z 2026-09-16 - nie wracać:
- **hasło jest DRUGĄ metodą TEJ SAMEJ osoby** - poświadczenie w osobnej tabeli
  `password_credentials` (jak `external_identities`), NIE kolumna na `pilots`. Logowanie
  hasłem kończy się DOKŁADNIE tam, gdzie Google: od chwili ustalenia osoby wspólny rdzeń
  `AuthCommands` (aktywne członkostwo → tokeny klubu; brak → `202` token osoby → 00C/00D/00E;
  panel → `no_panel_access`). Osoba z Googlem i hasłem = jeden wiersz `pilots`
- **login = e-mail ALBO kod pilota w klubie, który urządzenie zna**: kod pilota jest jedyny
  W KLUBIE, nie na serwerze, więc sam loginem być nie może; urządzenie pamięta KLUBY,
  z których się na nim logowano (nie osoby), a kod rozwiązuje się w bieżącym. **Przegląd
  makiet 2026-09-17: zna JEDEN klub → 00F nic o nim nie mówi** („po co to pisać"); zna
  więcej → pigułka z nazwą bieżącego pod marką i „Zmień klub" w stopce → ekran 00I z listą
  tych klubów. Zdania „kod pilota działa w klubie X" ani przycisku „to nie mój klub" NIE MA
- **scrypt z `node:crypto`** (N=2¹⁷, r=8, p=1) w zapisie PHC z parametrami (re-hash przy
  logowaniu zamiast migracji; Argon2id wymagałby modułu natywnego). Przy nieznanym loginie
  liczy się skrót ZASTĘPCZY - czas odpowiedzi nie wylicza kont. JEDNA odpowiedź
  `401 invalid_credentials` na login nieznany / bez hasła / złe hasło. Limity PRZED skrótem
  (`AttemptLimiter` z `POST /auth/join`: 10/login, 30/IP w 15 min)
- **polityka NIST SP 800-63B**: min 12 znaków, max 128, BEZ reguł złożoności, **BEZ wygasania**
  (zmianę wymusza wyłącznie unieważnienie albo reset), lista zablokowanych + fragmenty
  e-maila i nazwiska, wklejanie dozwolone, przełącznik „pokaż". JEDNA implementacja
  w `packages/domain/src/auth/passwordPolicy.ts` dla serwera, telefonu, panelu (i lustro
  w `site/src/haslo/` z testem równości - decyzja H-F)
- **ZAPOMNIANE HASŁO = JEDEN MECHANIZM: link z e-maila** („Nie pamiętam hasła albo jeszcze go
  nie mam" → adres → `202` ZAWSZE → list z `/haslo/#<token>` ważnym godzinę → strona
  `site/src/haslo/` ustawia hasło przez `POST /auth/password/reset` → `204`, BEZ sesji →
  logowanie). Strona, nie ekran aplikacji: pocztę czyta się na WŁASNYM telefonie, a loguje
  na wspólnym tablecie. Token we FRAGMENCIE adresu (poza logami i Referer), 256 bitów,
  `sha256` w bazie (`password_reset_tokens`), jednorazowy, nowy zużywa stary. **Cztery
  WYZWALACZE tego samego listu**: pilot (`self`) / administrator klubu - przycisk „Wyślij link
  do ustawienia hasła" w karcie członka (`admin`) / platforma - zaproszenie pierwszego
  administratora przy założeniu klubu i „Wyślij ponownie" (`platform`, 72 h) / operator -
  `seed -- --reset-link <email>` DRUKUJE adres zamiast wysyłać (`cli`; jedyna droga poza
  pocztą, gdy Google i poczta padły). **KODU JEDNORAZOWEGO DO PRZEPISYWANIA NIE MA I NIE
  PROPONOWAĆ** - dwie pierwsze wersje dokumentu go miały (najpierw jako drogę główną, potem
  awaryjną), właściciel wyciął oba razy: „działanie administratora powinno być takie samo,
  jak kliknięcie w e-mail z resetem, tylko inny punkt triggera". Panel NIE pokazuje linków ani
  kodów (link do wklejenia w komunikator to ten sam kanał ręczny innym kształtem). Reset
  unieważnia WSZYSTKIE sesje osoby; zmiana hasła w ustawieniach - wszystkie poza bieżącą.
  **SMS odrzucony** (koszt, numery telefonów jako nowe dane, słabszy kanał)
- **poczta wychodząca jest WYMAGANIEM serwera** (`MAIL_PROVIDER` = `resend` | `log`, bez niego
  serwer nie wstaje - „Nie pamiętam hasła", które po cichu nic nie wysyła, jest gorsze niż
  serwer, który nie wstał). `MailPort` + adapter HTTP dostawcy przez `fetch` (zero
  zależności) + `LogMail` dla dev. **#137 na drodze krytycznej**: rekordy DNS poczty
  (SPF/DKIM/DMARC) na `ninerdeck.pl` w Cloudflare, konto Resend, zmienne `MAIL_*` na Railway.
  Domena JUŻ JEST od #124 (wdrożone 2026-09-17) - pierwsza wersja dokumentu (2026-09-16)
  miała jej rejestrację jako pierwszy krok #137, ten punkt odpadł
- **`login_sessions` dla KAŻDEJ powierzchni** (telefon, panel klubu, platforma; token osoby
  sesji NIE zakłada), `sid` w claimach, `refresh_tokens.session_id` (backfill `legacy`
  w migracji 9). Brama sprawdza unieważnienie W TYM SAMYM zapytaniu, co członkostwo
  (`authSnapshot` + `LEFT JOIN`); brak `sid` przyjmowany WYŁĄCZNIE do wygaśnięcia tokenów
  sprzed wdrożenia. `last_seen_at` z przepustnicą 60 s w pamięci procesu. NOWE
  `POST /auth/logout` - dziś telefon przy wylogowaniu NIE woła serwera i refresh żyje 90 dni.
  Panel: lista sesji członka W KLUBIE aktora („Wyloguj", „Wyloguj wszędzie w tym klubie"),
  `#/konto` z własnymi sesjami wszystkich powierzchni, „ostatnio aktywny" z sesji
- **zdalne wylogowanie NIE kasuje danych z tabletu** (§3.0 zostaje): serwer odbija od razu
  (`401 session_revoked`, także na refreshu), telefon przestaje wysyłać i mówi dlaczego
  (baner Status na 00 i w Koncie 13), **PIN dalej otwiera**, zaległe zapisy czekają na
  ponowne logowanie TEGO SAMEGO pilota. Wyrzucenie do logowania kasowałoby dane dnia
- **nowy klub bez Google**: O2 pyta o „E-mail" (nie „Konto Google"), a razem z klubem wychodzi
  e-mail z zaproszeniem; karta klubu: „zaproszenie wysłano na … · ważne 72 h", „Wyślij
  ponownie". Podpięcie Googlem po tym samym adresie DALEJ działa
- **wspólny tablet = „Wyloguj i zmień konto" ze strażnikiem outboxa** (zapisy pilota A wychodzą
  wyłącznie tokenem A); zmiana pilota = nowy PIN. Wieloprofilowość urządzenia - OSOBNY temat
  po 2.1.0
- **REJESTRACJA E-MAILEM WCHODZI DO 2.1.0** (przegląd makiet 2026-09-17: „powinna być opcja
  rejestracji, jeśli jeszcze nie mam konta" - odwraca D9 z 2026-09-16) i jest TYM SAMYM
  mechanizmem linku: 00H „Załóż konto" (imię i nazwisko + e-mail) → `POST /auth/signup`
  zawsze `202` → list → `/haslo/` ustawia hasło i DOPIERO WTEDY powstaje osoba (adres
  potwierdzony kliknięciem; zajęty adres dostaje list resetu zamiast odmowy) → logowanie
  hasłem → 00E i kod klubu. Bez członkostwa, bez omijania zatwierdzenia, bez trasy w panelu.
  Ta sama tura: link na 00F to samo „Nie pamiętam hasła" (bez „albo jeszcze go nie mam" -
  list i tak USTAWIA hasło osobie z Googlem), a klub urządzenia zszedł spod pola do pigułki
  pod marką + „Zmień klub" (00I), widocznych WYŁĄCZNIE przy więcej niż jednym znanym klubie
- **migracje 9 i 10 WYŁĄCZNIE addytywne** (produkcja 2.0.0 żyje od 2026-09-16): **9 (H-B)** =
  `password_credentials`, `password_reset_tokens`, `idx_pilots_email_lower` (dziś
  `pilots.email UNIQUE` jest wrażliwe na wielkość liter, a odczyty robią `lower()`;
  migracja sprawdza duplikaty PRZED indeksem i pada nazwanym błędem); **10 (H-C)** =
  `login_sessions`, `refresh_tokens.session_id`. Dokument zapowiadał jedną migrację 9 -
  epiki idą osobnymi PR-ami, każdy niesie własny DDL. Telefon dostaje zmianę **OTA** (bez
  modułów natywnych); serwer z migracjami i zmiennymi `MAIL_*` idzie PRZED aktualizacją telefonów
- **etap H-B (serwer: hasła i link) WYKONANY 2026-09-17** (gałąź `feature-132-serwer-hasla`,
  issue #132) - reguły obowiązujące odtąd:
  - **hasło NIGDY nie omija rdzenia**: `AuthCommands.loginWithPassword` /
    `panelLoginWithPassword` robią WYŁĄCZNIE dowód (`verifyPassword`: limit PRZED skrótem →
    osoba po adresie albo po kodzie w klubie urządzenia → scrypt ZAWSZE, na skrócie
    zastępczym dla nieznanego loginu → jedno `invalid_credentials` → `account_disabled`
    dopiero po dowodzie → re-hash), a potem wołają `enterMobile` / `enterPanel` - TE SAME
    metody, którymi kończy Google. Nowy sposób logowania = nowy dowód + te dwie metody,
    nigdy trzecia kopia wyboru klubu
  - **link „ustaw hasło" ma JEDNO źródło**: `PasswordCommands` składa token i list
    (`issueLink` + `deliver`); `AdminPasswordLinkCommands` (panel) dokłada wyłącznie zakres,
    zdolność i audyt `password.link_sent` (bez tokenu w `details`). Treści listów to czyste
    funkcje w `application/common/mail/passwordMails.ts`; atrapą w testach jest WYŁĄCZNIE
    poczta (`test/fakeMail.ts` - test czyta list i wyjmuje token jak człowiek ze skrzynki)
  - **realizacja linku: `peek` → polityka → JEDNA transakcja** (`consume`, osoba przy
    `signup`, skrót `set_via: 'link'`, `revokeAllOf` refreshy WSZYSTKICH klubów, stempel
    `pilots.credentials_valid_from`). Słabe hasło NIE spala linku; sesji strona nie dostaje
  - **W OTWARTEJ TRANSAKCJI CZYTA SIĘ WYŁĄCZNIE PRZEZ `tx`** - odczyt cudzym uchwytem
    (`PgPilotsRepo.findById` z `this.db` wewnątrz `write.run`) w PGlite CZEKA na koniec
    transakcji i test kończy się limitem czasu zamiast odpowiedzi (pierwszy przebieg
    `passwordLinks.ts`). Dane do komendy panelu bierze się z portu, który już ma `tx`
    (`PilotsAdminPort.byId`, `OrganizationsPlatformPort.byId`), albo PRZED transakcją
  - **ADRES E-MAIL ZAPISUJE SIĘ ZNORMALIZOWANY** (`domain/email.ts`, §4.4): od 2.1.0 adres
    jest LOGINEM, a migracja 9 liczy unikalność po `lower(email)` - więc `lower(trim())`
    wchodzi na KAŻDEJ z pięciu dróg zapisu do `pilots.email` (pierwsze logowanie Googlem,
    pierwszy administrator klubu, edycja członka w panelu, rejestracja e-mailem, seed).
    Nowa droga zapisu woła `normalizeEmail`, inaczej w kolumnie stanie drugi napis na tę
    samą osobę. **ODCZYTY zostają przy `lower()` po obu stronach** - w bazie mogą stać
    wiersze sprzed migracji 9. `external_identities.email` zostaje SUROWY: to zapis
    o cudzym koncie u dostawcy, nie login. Pilnuje tego `test/emailNormalization.test.ts`
    (jeden plik na jedną regułę - cztery z sześciu przypadków upadały przed poprawką)
  - `AttemptLimiter` przeszedł do `application/common/` (używa go telefon, panel i wysyłka
    linku); jeden egzemplarz dla haseł, klucze rozróżnia przedrostek (`password:login:`,
    `password:send:`, `password:admin-send:`, `password:change:`)
  - **`MAIL_PROVIDER` jest WYMAGANY już teraz** (`log` do czasu adaptera Resend z H-F);
    `MailPort`, `LogMail` i treści listów powstały w H-B, nie w H-F
  - **`/haslo/` musi być serwowane NA HOŚCIE APLIKACJI** (zadanie H-F): link składa się
    z `PUBLIC_BASE_URL`, bo strona woła `POST /auth/password/reset` względnie, a na hoście
    strony API nie istnieje (`hostSplit.ts`)
  - `refreshTokensRepo.ts#revokeAllOf` ma imienny wyjątek od strażnika `org_id`
    (reset zrywa sesje osoby we WSZYSTKICH klubach); `adminRoute` zna metodę `PUT`
  - **pułapka worktree**: `node_modules/@ninerdeck/*` w worktree wskazywało GŁÓWNY checkout
    (`main`), więc nowy eksport z `packages/domain` nie istniał dla testów - linki
    przepięte na `packages/` worktree (`New-Item -ItemType Junction`); po `npm install`
    w worktree sprawdzić cel linków
- **etap H-C (serwer: sesje logowania) WYKONANY 2026-09-18** (gałąź
  `feature-133-sesje-logowania`, issue #133) - reguły obowiązujące odtąd:
  - **KAŻDA ŻYWA SESJA MA WIERSZ** (`login_sessions`, migracja 10), a jej identyfikator
    jedzie w claimie `sid` tokenu klubu, platformowego i ciasteczka panelu. Do 2.1.0 sesja
    telefonu była wierszem `refresh_tokens` bez metadanych, a sesja panelu NIE MIAŁA
    WIERSZA WCALE - jedynym zdalnym wylogowaniem był młot `credentials_valid_from`,
    zrywający wszystko naraz. Nowa droga logowania MUSI założyć sesję: bez `sid` nie ma
    czym podpisać tokenu, a `Identity.sessionId` jest wymagane przy podpisywaniu
  - **ROTACJA ZACHOWUJE SESJĘ, PRZEŁĄCZENIE KLUBU ZAKŁADA NOWĄ** (metoda dziedziczona ze
    źródłowej): para tokenów jest parą DLA KLUBU, więc sesja też. Gdyby rotacja zakładała
    wiersz, lista urządzeń w panelu byłaby dziennikiem odświeżeń
  - **BRAK `sid` PRZECHODZI, `sid` NIEZNANY ODBIJA** - to dwa różne stany i muszą takie
    zostać: brak znaczy „token sprzed 2.1.0" (wdrożenie nie ma prawa wylogować wszystkich
    naraz), nieznany znaczy „ktoś wskazuje sesję, której nie ma". Weryfikacja oddaje
    `null` zamiast pustego napisu, a `sign` pustego `sid` NIE WPISUJE do payloadu -
    dzięki temu token z testu bramy jest bajt w bajt poświadczeniem sprzed wdrożenia
  - **`/auth/refresh` SPRAWDZA SESJĘ PRZED ROTACJĄ** i odmawia z powodem
    (`401 session_revoked`). Po rotacji byłoby za późno: każda próba synca wylogowanego
    telefonu zostawiałaby świeży, nikomu niedoręczony refresh na kolejne 90 dni
  - **TRASY TELEFONU MAJĄ JEDNO `401`**, a powód pada z odświeżenia (§6) - aplikacja na
    każde 401 sięga po refresh. PANEL dostaje `session_revoked` od razu, bo nie ma czego
    odświeżyć. Nie dokładaj drugiego ciała 401 do tras telefonu
  - **UNIEWAŻNIANIE TOWARZYSZY INNYM DECYZJOM i idzie TĄ SAMĄ transakcją**: zmiana hasła
    gasi wszystkie sesje POZA BIEŻĄCĄ (`Actor.sessionId`), realizacja linku - wszystkie,
    wyłączenie członkostwa - wszystkie w TYM klubie. Sprawca (`revoked_by`) to `self`,
    `admin`, `platform` albo `system`; `system` znaczy „skutek uboczny innej decyzji"
  - **PANEL KLUBU WIDZI I GASI WYŁĄCZNIE SESJE U SIEBIE** - zawężenie po osobie I klubie
    stoi w SQL-u (`revoke`, `revokeAll`, `list`), nie w sprawdzeniu przed zapisem. Własne
    sesje osoby (`/me/sessions`) mają zakres OSOBY, nie klubu, i dlatego są imiennym
    wyjątkiem w `tenantIsolation`. Bieżącej sesji nie da się wyłączyć tą trasą
  - **AUDYT NIE NIESIE `sid`** (jak `password.link_sent` nie niesie tokenu): `session.revoke`
    i `session.revoke_all` zapisują kod pilota, powierzchnię i etykietę urządzenia
  - **„OSTATNIO AKTYWNY" MA PRZEPUSTNICĘ** (`LastSeenThrottle`, 60 s, pamięć procesu jak
    `AttemptLimiter`) i stempluje się w BRAMIE, nie w komendzie - to warstwa HTTP zna
    żądanie (adres, nagłówek `X-Ninerdeck-Device`). `null` w kontrakcie znaczy „nie ma
    czynnej sesji", a NIE „nigdy się nie logował"
  - **KONTRAKTY PANELU MAJĄ LUSTRA UNII, NIE IMPORTY DOMENY SERWERA**
    (`SessionSurfaceWire`, `LoginMethodWire`) - `contracts/` jest powierzchnią dla
    klienta i strażnik architektury tego pilnuje; rozjazd łapie kompilator przy mapowaniu
- **etap H-D (panel: hasło, link i sesje) WYKONANY 2026-09-18** (gałąź
  `feature-134-panel-haslo`, issue #134) - reguły obowiązujące odtąd KAŻDY ekran panelu
  dotykający poświadczeń:
  - **DWIE METODY, JEDNA KARTA I JEDNA SESJA**: formularz e-mail + hasło stoi NA WIERZCHU
    (administrator klubu założonego bez Google nie ma innej drogi), Google pod separatorem
    „albo". Bez klienta Google (`methods.google == null`) separator i kontener znikają
    W CAŁOŚCI - nie ma wyszarzonego przycisku. Panel loguje WYŁĄCZNIE e-mailem: przed
    sesją nie ma klubu, w którym kod pilota cokolwiek by znaczył
  - **JEDNA ODMOWA NA TRZY STANY**: „Nieprawidłowy e-mail lub hasło" dla loginu
    nieznanego, osoby bez hasła i złego hasła - ekran nie ma prawa ich rozróżnić, bo
    serwer starannie tego nie robi. `429` mówi CZAS („za 3 min"), nie „za chwilę"
  - **„NIE PAMIĘTAM HASŁA" ODPOWIADA TAK SAMO PO ODMOWIE SERWERA**: `202` i `429` dają to
    samo zdanie („jeśli ten adres jest w systemie, link już idzie - ważny godzinę"), bo
    druga odpowiedź byłaby jedyną różnicą między adresem znanym a obcym. Wyjątkiem jest
    AWARIA SIECI - „nie wiem, czy wysłano" to inna wiadomość niż „wysłano"
  - **PANEL NIE POKAZUJE ANI LINKU, ANI KODU** - ani administratorowi klubu, ani
    superadministratorowi. Potwierdzenie mówi DOKĄD poszedł list i JAK DŁUGO jest ważny,
    a termin liczy się z odpowiedzi serwera, nie ze stałej w panelu (reset ma godzinę,
    zaproszenie 72 h)
  - **WIERSZ SESJI MA DWIE IKONY, NIE TRZY**: rozstrzyga POWIERZCHNIA (`panel`/`mobile`),
    bo to są dane; kształtu obudowy („tablet czy telefon") rejestr nie zna, a wyprowadzanie
    go z nazwy urządzenia byłoby domysłem postawionym obok faktów. Człon powierzchni
    dokleja się WYŁĄCZNIE do etykiety przeglądarki - etykietę telefonu składa aplikacja
    i nazywa w niej siebie. Sesja `legacy` MILCZY o metodzie zamiast pisać o wydaniach
  - **`#/konto` NIE JEST MODUŁEM**: nie ma pozycji w kolumnie (kolumna wymienia moduły
    KLUBU), wchodzi się z nazwiska w pasku górnym, a adres stoi przy kanonicznej liście
    tras (`ui/shell/nav.ts`). Ta sama strona w ramie klubu i superadministratora
  - **POLITYKĘ HASŁA LICZY DOMENA, NIE PANEL** - `checkPassword` jest DRUGIM imiennym
    wyjątkiem od zakazu importu wartości z `@ninerdeck/domain` (`admin/test/architecture.test.ts`).
    Kopia reguły dałaby ekran mówiący „hasło dobre" przy serwerze odpowiadającym
    `weak_password`; odmowa serwera wraca POD POLE tym samym zdaniem, które pokazała
    przeglądarka
  - **TRZY POLA DOSZŁY NA SERWERZE** (H-D niesie cienki plaster serwera, bo B i C ich nie
    wystawiły): `loginMethods` w wierszu listy członków, `GET /admin/api/me/account`
    (adres i metody zalogowanego - OSOBNO od `GET /me`, które przestawia całą ramę
    i nie starzeje się nigdy) oraz `invite` przy administratorze klubu. Przy okazji
    `signedIn` na karcie klubu przestało pytać WYŁĄCZNIE o tożsamość Google - inaczej
    administrator, który wszedł z linku i hasłem, zostawałby „tym, który się nie zalogował"
- **REJESTRACJA I „NIE PAMIĘTAM HASŁA" TAKŻE Z PANELU (issue #180, 2026-09-24)** - odwraca
  „w panelu jej nie ma" z §5.4a; pełny zapis `docs/logowanie-haslem.md` §16:
  - **panel woła WYŁĄCZNIE `/admin/api/*`**, a `POST /auth/password/forgot` istniało tylko
    pod prefiksem telefonu - „Nie pamiętam hasła" w panelu kończyło się 404 od 2.1.0,
    a ekran pisał „link już idzie" (reguła „jedno zdanie na każdą odmowę" zasłania też 404).
    Odtąd `forgotHandler`/`signupHandler` z `routes/common/password.ts` stoją pod OBOMA
    prefiksami; **każda trasa panelu potrzebuje testu serwera pod swoim prefiksem** -
    `tenantIsolation.test.ts` wymaga wpisu tylko dla tras, które ISTNIEJĄ
  - **`#/logowanie/konto` = lustro 00H** (imię i nazwisko + adres → list → hasło na stronie
    → osoba). Bez pola hasła i bez kodu klubu - do klubu wchodzi się kodem w APLIKACJI
    (00E), panel tego nie ma i to jest granica zgłoszenia, nie przeoczenie
  - **UKŁAD JAK U GITHUBA / STRIPE'A / LINEAR** (przegląd właściciela tego samego dnia:
    dwa linki pod przyciskiem „wyglądają jak linki"): „Nie pamiętam hasła" stoi W WIERSZU
    ETYKIETY pola hasła (`Field.action` → `.label-row` + `.label-action` w `controls.css`),
    a „Załóż konto" w lżejszej ramce POD kartą (`.login-alt` w `login.css`: „Nie masz
    jeszcze konta? Załóż konto" - karta niesie JEDNĄ akcję główną, zdanie jest treścią,
    link czasownikiem). Ekrany hasła i rejestracji mają tę samą ramkę („Wróć do logowania",
    „Masz już konto? Zaloguj się"). Klasy `.login-link`/`.login-links` NIE ISTNIEJĄ -
    link w karcie pod przyciskiem nie wraca
  - **UKŁAD JAK W GITLABIE** (przegląd właściciela tego samego dnia, wieczorem: „wygląda
    okropnie") - odwraca kartę i ramkę `.login-alt`: znak + TYTUŁ ZDANIOWY („Zaloguj się
    do Ninerdeck", bez wersalikowego NINERDECK), formularz BEZ KARTY w kolumnie 400 px,
    wszystkie przyciski 40 px i tej samej szerokości (Google: GIS `filled_black`,
    prostokąt, `width: 400`), separator „albo zaloguj się przez" krojem tekstowym, droga
    dla kogoś bez konta JEDNYM ZDANIEM pod spodem (`.login-foot`, bez ramki), poświata
    u dołu ekranu z tokenów `-muted` (odwraca „bez poświaty" z #107). Cztery ekrany przed
    ramą (logowanie, hasło, rejestracja, wybór klubu) składa JEDEN `screens/login/AuthFrame.tsx`
  - **odmowa `403 no_panel_access` mówi, skąd bierze się klub** („Do klubu wchodzi się kodem
    klubu w aplikacji Ninerdeck, a dostęp do panelu nadaje administrator klubu") - osobą bez
    klubu bywa odtąd ktoś, kto założył konto w tym panelu
  - **strażnik hexów panelu łapie `#180` w napisie testu** (jak `#207`) - numer issue
    zostaje w komentarzu; strażnik napisów (`copy.test.ts`) trzyma lead w dwóch linijkach
- **etap H-E (aplikacja pilota) WYKONANY 2026-09-18** (PR #150, issue #135) - reguły
  obowiązujące odtąd KAŻDY ekran logowania w aplikacji:
  - **HASŁO KOŃCZY SIĘ TAM, GDZIE GOOGLE**: `AuthService.loginWithPassword` robi WYŁĄCZNIE
    dowód i wpada w ten sam provisioning (`signed_in` / `no_club`). Nowy sposób logowania
    = nowy dowód, nigdy trzecia kopia wyboru klubu
  - **URZĄDZENIE PAMIĘTA KLUBY, NIE OSOBY** (`DeviceClubsPort` + `DeviceClubsStore`):
    lista w ZWYKŁYM magazynie i pod JEDNYM kluczem bez pilota, bo ma PRZEŻYĆ wylogowanie -
    opisuje samolot, a nie człowieka. Kod pilota rozwiązuje się w klubie bieżącym; przy
    JEDNYM znanym klubie 00F o nim MILCZY (reguła SyncChipa), przy kilku - pigułka
    z nazwą i „Zmień klub" (00I). Urządzenie znające klub startuje po wylogowaniu
    wprost na 00F
  - **`logout` WOŁA SERWER PRZED czyszczeniem magazynu**, a bez sieci czyści i tyle (§9):
    pilot oddaje tablet następnemu i nie ma na co czekać
  - **`session_revoked` ≠ `invalid_refresh`**: pierwsze jest DECYZJĄ CZŁOWIEKA, więc
    `rotate()` stawia znacznik `revoked` w magazynie (przeżywa restart), a `SyncEngine`
    oddaje `auth_revoked` obok `auth_expired`. ŻADNE nie kasuje poświadczeń ani PIN-u:
    zdalne wylogowanie zatrzymuje WYSYŁKĘ, nie kasuje dnia, którego serwer jeszcze nie ma
  - **pięć ekranów przed bramką prowadzi `ui/navigation/SignInFlow.tsx` zwykłym stanem** -
    `RootNavigator` mieszka ZA bramką i opisuje aplikację pilota, a tam nikt nie jest
    jeszcze pilotem
  - **`GET /me/account` = cienki plaster serwera H-E** (jak trzy pola w H-D): wiersz
    „Ustaw hasło" / „Zmień hasło" nie miał z czego wyjść. Odczyt w `application/common/
    queries/account.ts`, bo o to samo pyta panel; OSOBNO od `GET /reference`, bo to cache
    KLUBU z ETagiem, a metody należą do OSOBY
- **etap H-F (poczta i strona `/haslo/`) WYKONANY 2026-09-18** (PR #147 i #151, issue #136):
  - **`/haslo/` MIESZKA NA HOŚCIE APLIKACJI** (`hostSplit.ts`, `PASSWORD_PAGE`) - jedyny
    plik strony rozpoznawany po ŚCIEŻCE. Bez tego droga z listu była PRZERWANA: link
    składa się z `PUBLIC_BASE_URL`, a plik strony był stamtąd odsyłany na host strony,
    gdzie `POST /auth/password/reset` nie istnieje
  - **ceną jest plik strony na origin panelu, więc ma WŁASNĄ, ścisłą politykę**
    (`PASSWORD_PAGE_CSP`) bez `'unsafe-inline'`. Uzasadnienie luzu reszty strony („nie ma
    pola, w które ktokolwiek cokolwiek wpisuje") przestało jej dotyczyć przy polu hasła.
    **To jedyna strona w `site/` bez skryptu i stylu w treści pliku** - dopisanie ich
    ją psuje, i pilnuje tego `app/src/__tests__/passwordPage.test.ts`
  - **polityka hasła na stronie to LUSTRO z testem równości** (`site/src/haslo/policy.js`
    ↔ `passwordPolicyMirror.test.ts`), bo `site/` jest świadomie poza workspace'ami
    i bez zależności. Lustro jest WĘŻSZE: `contains_email`/`contains_name` zna tylko
    serwer i wracają jako `400 weak_password { reason }`, które ZOSTAJE NA FORMULARZU -
    odmowa polityki linku nie spala
- **przegląd bezpieczeństwa (W6) 2026-09-18**: dwanaście punktów §8 sprawdzonych,
  ZERO podatności; wynik i to, czego świadomie nie zmieniono, w `docs/logowanie-haslem.md` §15
- **etap H-A (makiety, design-first) - PR #144**: telefon `00a` (drugi przycisk „ZALOGUJ SIĘ
  HASŁEM"), NOWE `00f-login-haslo` (e-mail/kod + hasło, pigułka klubu urządzenia tylko przy
  kilku znanych klubach, odmowa przy polu, offline z powodem w przycisku), NOWE `00g-link-hasla`
  (adres → „WYŚLIJ LINK" → potwierdzenie; ŻADNEGO pola hasła), NOWE `00h-zaloz-konto`
  (imię i nazwisko + e-mail → link; potwierdzenie w trybie warunkowym), NOWE `00i-wybor-klubu`
  (lista klubów urządzenia ze stopki 00F), `13` sekcja „Hasło"
  + arkusz `13b`, `00` baner sesji
  unieważnionej; panel `00-logowanie` (formularz + „albo" + Google), `piloci-konto`
  („Logowanie" z plakietkami Google/hasło, „Wyślij link", karta Sesje), `organizacje-klub`
  (E-mail + zaproszenie), NOWE `konto` (`#/konto`: zmiana hasła, moje sesje); strona
  `site/src/haslo/` (trzy stany: formularz / link wygasł / gotowe)

## Wielofirmowość 2.0.0 - epik A: decyzje i makiety (issue #97, 2026-09-08, gałąź `feature-97-wielofirmowosc-projekt`)
Jeden serwer dla wielu klubów, superadministrator zakłada kluby, **nic nie wycieka między
klubami**. Dokument decyzji: **`docs/wielofirmowosc.md`** (model danych, przepływy, migracja
z backfillem, ryzyka, etapy A–F ↔ issue #97–#102). Epik A wyprzedza kod: reguła
design-first obowiązuje tu tak samo w aplikacji, jak w panelu.
- **decyzje właściciela (2026-09-08), nie wracać do nich w dyskusji**: klub = `organizations`
  (tenant) z `org_id` denormalizowanym na tabelach zależnych; pilot = OSOBA globalna,
  a **kod pilota i rola żyją na CZŁONKOSTWIE** (`memberships` - `pilots.code` i
  `pilots.role` znikają); superadmin = `pilots.platform_role` bez klubu; telefon
  w kontekście JEDNEGO aktywnego klubu (przełącznik w 13 tylko przy >1 członkostwie,
  „Mój dzień" pokazuje WSZYSTKIE operacje); produkcja = pierwotnie **migracja
  z backfillem**, **ZMIENIONE 2026-09-10 na NOWĄ INSTANCJĘ** (sekcja „Nowa instancja
  zamiast migracji" niżej); drogi dołączenia: pierwotnie trzy - **ZMIENIONE
  2026-09-09 na JEDNĄ: kod klubu z zatwierdzeniem** (sekcja „JEDNA droga dołączenia"
  niżej; link osobisty i adres e-mail WYCOFANE); bez wysyłki e-maili w 2.0.0; pakiet
  Android `com.ninerdeck.app`
- **ROZSTRZYGNIĘTE 2026-09-08: klub jest W TOKENIE** (`sub`, `org`, `code`, `role`;
  `refresh_tokens.org_id`), a **przełączenie klubu i dołączenie do klubu WYMAGAJĄ
  SIECI** - offline-first dotyczy pracy w klubie, nie zmiany klubu. Przełączenie =
  `POST /auth/switch` (nowa para tokenów) + PUSTA kolejka wysyłki, jak wylogowanie;
  na 13A offline/zaległości = karty zablokowane z powodem. Propozycja nagłówka `X-Org`
  (przełączanie offline) ODRZUCONA - nie proponować ponownie
- **propozycje dokumentu DO POTWIERDZENIA przed epikami B–F** (§13 dokumentu): superadmin
  NIE wchodzi do danych klubu; token odczytu kart arkusza; kształt kodu klubu
  (`AZG-7K4M`). Migracja 9 nie istnieje (rozstrzygnięte w epiku B), termin linku
  odpadł razem z linkiem (2026-09-09)
- **bramką jest BRAK CZŁONKOSTWA** - ta sama zasada, co „brak konta" z logowania Google,
  piętro wyżej: osoba bez klubu ma wiersz w `pilots`, ale żadna trasa klubowa jej nie
  wpuszcza. Statusy `pending`/`rejected` przenoszą się z `external_identities` na
  `memberships.status`, bo dotyczą KLUBU, nie tożsamości
- **makiety telefonu**: NOWE `00e-bez-klubu` (pole na kod klubu; od 2026-09-09 BEZ „albo
  wklej link" - przebudowane;
  druga ramka: nieznany kod - błąd przy polu), `01e-moj-dzien-dwa-kluby` (plakietka
  klubu na kafelku TYLKO przy >1 członkostwie; sygnatura niesie kod z TEGO klubu),
  `13a-ustawienia-klub` (sekcja „Klub" jako pierwsza, lista kart z kodem w każdym
  klubie; ramka ONLINE, bo przełączenie wymaga sieci); ZMIENIONE `00c`/`00d` (klub nazwany w zdaniu; 00D ma drugie
  wyjście „DOŁĄCZ INNYM KODEM" → 00E). Wpisy w `index.html` i panelach wariantów
  całej rodziny 00/01/13
- **makiety panelu** (`design/panel/`): NOWE `00a-wybor-klubu` (drugi krok logowania przy
  >1 członkostwie admin; superadmin widzi „Organizacje" jako pierwszą kartę),
  `organizacje-lista` + `organizacje-klub` (rama superadministratora: JEDNA pozycja w kolumnie,
  kafel zakresu `.sidebar-context.scope` zamiast kontekstu klubu; nowy klub = nazwa + stały slug + pierwszy
  administrator: adres Google + imię + kod, członkostwo `admin` od razu, podpięcie przy
  pierwszym logowaniu; karta klubu z kodem klubu do odczytu), `piloci-kod-klubu` (dawne
  `piloci-zaproszenie`, przebudowane 2026-09-09: zamiast trzech kart JEDNA karta „Kod klubu" -
  kod, od kiedy, ile zgłoszeń czeka, „Wygeneruj nowy" i „Wyłącz dołączanie kodem"
  z potwierdzeniem inline; P4a = stan wyłączony);
  ZMIENIONE `piloci-lista` (karta ZGŁOSZENIA KODEM KLUBU nad listą, znika pusta; karty
  ZAPROSZENIA od 2026-09-09 NIE MA; „Dodaj pilota" USUNIĘTE - było drogą e-mail w innym
  ubraniu), `piloci-zgloszenie` („Zatwierdź i przyjmij do klubu"), `piloci-konto`
  (szuflada CZŁONKOSTWA: osoba do odczytu, kod i rola w tym klubie, „Wyłącz
  członkostwo" - inne kluby osoby bez zmian; bez `#/piloci/nowy`, nowy członek = kod
  klubu + zatwierdzenie P3). **`.sidebar-context`
  (kontekst klubu na szczycie kolumny bocznej - do issue #107 `.topbar-org` za znakiem) stoi w KAŻDEJ ramie klubowej**, także przy jednym
  członkostwie - nazwa klubu odpowiada na „czyj to dziennik" przy każdym wklejonym
  linku. Komponent `.club-code` czeka w `design/panel/rama.css` (sekcja
  „wielofirmowość") na kod epików B–F - stamtąd idzie do `admin/src/styles/` pod tą
  samą nazwą; `.linkbox` WYCIĘTY z `rama.css` i `SZABLON` (link osobisty wycofany 2026-09-09); kontekst
  klubu (`.sidebar-context`) jest już w `shell.css`
- **strona `site/src/dolacz/index.html` WYCOFANA 2026-09-09** razem z linkiem osobistym:
  plik do skasowania w epiku D, trasa `GET /dolacz/*` NIE powstaje (reguła „bez
  fallbacku SPA" zostaje bez wyjątku), schemat `ninerdeck` w `app.json` służy wyłącznie
  powrotowi z logowania Google (epik R)
- **podręcznik**: rozdział `docs/podrecznik/kluby-i-dolaczanie.md` (szkic - opisuje
  stan PO wdrożeniu epików B–F; przy każdym epiku sprawdzić stronę), osadza nowe makiety
  przez `@screen` i `@panel`

## Wielofirmowość 2.0.0 - JEDNA droga dołączenia: kod klubu (decyzja 2026-09-09, zmienia decyzję 6 z issue #97)
Przegląd 2026-09-09 (pytanie właściciela o zaproszenia e-mailem → hasła → Apple/Facebook
→ kod klubu) zostawił z trzech dróg JEDNĄ. Pełny zapis i tabela odrzuconych wariantów:
**`docs/wielofirmowosc.md` §3.8 i §15**; zadania: issue #100. Reguły obowiązujące odtąd:
- **do klubu wchodzi się WYŁĄCZNIE kodem klubu**: `organizations.join_code` (jawny tekst,
  `UNIQUE` na serwerze, `NULL` = dołączanie wyłączone) + `join_code_since`; pilot loguje
  się Googlem, wpisuje kod na 00E (albo „Dołącz do innego klubu" na 13A) → członkostwo
  `pending` → 00C → administrator klubu zatwierdza z kodem pilota i rolą (P3) albo
  odrzuca z powodem (00D). **Tabeli `invitations` NIE MA** - WYCIĘTA z migracji 8
  2026-09-09 (D0; epik B jest w `develop` po PR #110, ale nie na produkcji, więc migracja 8
  zmieniła się W MIEJSCU, bez migracji 9; baza dev od nowa); `memberships.joined_via` =
  `code | panel | platform | backfill` - `panel` (dopisanie wprost z panelu klubu) żyje
  do D3, gdzie `POST /pilots` przechodzi do modułu Organizacje i wartość zamienia się
  w `platform`; martwe klasy `.secret*` (po hasłach) wycięte z `surfaces.css` (D8)
- **człowiek decyduje PRZED wejściem** - to główna przewaga nad linkiem, który wpuszczał
  od razu. Zgłoszenie `pending` NIE wygasa samo (kończy je decyzja); administrator klubu
  może wyłączyć dołączanie kodem (kasuje kod - wtedy nikt nie dołączy, bo innej drogi
  nie ma); „Wygeneruj nowy" nie rusza złożonych zgłoszeń
- **pierwszego administratora klubu dodaje SUPERADMINISTRATOR** przy zakładaniu klubu
  (adres Google + imię + kod): osoba + członkostwo `admin` od razu, tożsamość podpina
  się przy pierwszym logowaniu (`claimByVerifiedEmail` - ten sam bootstrap, co
  `SEED_ADMIN_EMAIL`). To wyjątek klasy bootstrap, nie druga droga: z panelu KLUBU nikogo
  nie da się dopisać adresem, `POST /admin/api/pilots` przechodzi do modułu Organizacje
- **`POST /auth/join { code }`**: `202` pending / `403` rejected z powodem / `409` już
  w klubie / `404` dla kodu nieznanego, wyłączonego I klubu nieaktywnego (jedna odpowiedź,
  nic się nie ujawnia) / `429` ograniczenie tempa per osoba i adres
- **rozstrzygnięte 2026-09-09 przy przebudowie makiet** (nie wracać): kształt kodu
  `XXX-XXXX` = 7 symboli z alfabetu 32 znaków (litery bez O/I, cyfry bez 0/1; myślnik
  i wielkość liter są ZAPISEM - serwer przyjmuje `azg7k4m`), limity tempa `POST /auth/join`
  = 10 prób/osoba i 30/adres IP na 15 min (`429` z czasem odczekania), superadministrator
  widzi kod klubu na karcie klubu DO ODCZYTU (kod jest konfiguracją klubu, nie jego
  danymi; generuje i wyłącza go wyłącznie panel klubu)
- **NIE WRACAJĄ** (odrzucone z powodami w §15): zaproszenie e-mailem z linkiem i dostawca
  poczty (możliwe rozszerzenie PO 2.0.0, gdy klub poprosi), link osobisty, dopasowanie
  po adresie jako droga dla pilotów, e-mail + hasło (nigdy), Facebook (wcale), Apple
  (wyłącznie razem z iOS). Logowanie kodem z e-maila bez hasła - po 2.0.0, gdy pojawi
  się pilot bez konta Google. Nie proponować ponownie
- **makiety PRZEBUDOWANE 2026-09-09** (design-first, przed kodem): `00e` (samo pole kodu,
  odmowy serwera w komentarzu drugiej ramki), `13a` („Dołącz do innego klubu" - arkusz
  z polem jak na 00E, zgłoszenie jako wiersz `pending` na liście klubów),
  `piloci-kod-klubu` (dawne `piloci-zaproszenie`: karta „Kod klubu" z potwierdzeniami
  inline, P4a = stan wyłączony z kreskami `.club-code.off`), `piloci-lista` (bez karty
  ZAPROSZENIA, akcja główna „Kod klubu"), `piloci-konto`, `organizacje-klub`/`-lista`
  (pierwszy administrator „nie zalogował się" zamiast „zaproszenie czeka", karta „Kod
  klubu" do odczytu), `00c`/`00d`, oba spisy, `SZABLON` (inwentarz „Kod klubu" zamiast
  LinkBox) i `rama.css` (`.linkbox` wycięty, `.club-code.off` dodany; `panel.css`
  wygenerowany na nowo). Strona `site/src/dolacz/` do skasowania; `registrations.ts` z #89
  do skasowania (kolejka żyje na członkostwach)

## Wielofirmowość 2.0.0 - epik B: serwer, model klubów (issue #98, 2026-09-08, gałąź `feature-98-serwer-kluby`)
Migracja 8 + domena ról + porty + adaptery + komendy; **pierwsza migracja Z BACKFILLEM
na bazie produkcyjnej** - pułapki w `docs/architektura-panelu-serwer.md` §7.9, odstępstwa
od dokumentu decyzji w `docs/wielofirmowosc.md` §14 (B). Reguły obowiązujące odtąd KAŻDY
plik serwera:
- **osoba jest jedna, kod i rola są CZŁONKOSTWA** (`memberships (org_id, pilot_id)`):
  `pilots.code` i `pilots.role` NIE ISTNIEJĄ. Każde złączenie po kodzie pilota to
  `LEFT JOIN memberships m ON m.pilot_id = X AND m.org_id = <klub wiersza>` plus
  `LEFT JOIN pilots` po nazwisko - nigdy sam `pilots.code`. `pilots.active` znaczy
  blokadę PLATFORMOWĄ (superadministrator); „wyłącz konto" w panelu = `memberships.status
  = 'disabled'` + `memberships.credentials_valid_from`, a brama sprawdza OBIE daty
- **klub jest W TOKENIE** (`Identity.orgId`; claim `org`): token bez `org` - każdy sprzed
  2.0.0 - jest NIEWAŻNY (`verify()` → `null`), telefon odświeża go refreshem, który klub
  zna (`refresh_tokens.org_id`). Rotacja zostaje w tym samym klubie; przełączenie
  (`POST /auth/switch`) i dołączanie (`POST /auth/join`) to epiki F i D. Logowanie wybiera
  klub aktywny: ostatnio używany (najświeższy refresh) → pierwszy alfabetycznie;
  osoba bez aktywnego członkostwa → `403 no_membership`
- **TRZY rodzaje tokenów, rozłączne claimem `purpose`**: klubu (bez `purpose`),
  rejestracyjny (`registration`), PLATFORMOWY (`platform` - superadministrator bez klubu,
  `signPlatform`/`verifyPlatform`). Każda weryfikacja odrzuca dwa pozostałe rodzaje
- **bramy**: `authorize` (token klubu, trasy telefonu - bez bazy), `authorizeOrg`
  (dawne `authorizeAccount`: członkostwo `(org, sub)` czytane przy KAŻDYM żądaniu panelu -
  osoba aktywna I klub aktywny I członkostwo `active`, obie daty unieważnienia),
  `authorizePlatform` (`pilots.platform_role`, zdolność `platform.manage` - jedyna
  zdolność platformowa, NIE MA jej żaden administrator klubu). `adminRoute` jest trasą
  KLUBU i daje handlerowi `Actor` z `orgId`; `PlatformActor` (bez klubu) zna wyłącznie
  `AuditedWrite`, który pisze wtedy `admin_audit.org_id = NULL`
- **`org_id` NOT NULL na każdej tabeli klubu** (`aircraft`, `events`, `sessions`, `flags`,
  `export_log`, `exported_sheets`, `aircraft_readings`, `aircraft_consumption`,
  `bug_reports`, `refresh_tokens`), nullowalne WYŁĄCZNIE w `admin_audit`. Każdy zapis
  podaje klub JAWNIE parametrem portu (`insertBatch(tx, orgId, …)`, `SessionRow.orgId`,
  `FlagRecord.orgId`, `writeDaySheet(orgId, …)`, `insertMany(db, orgId, …)`), bo `Event`
  i `SessionState` z domeny klubu nie znają i znać nie mają (§2 dokumentu). Klub
  zdarzenia = klub tokenu telefonu; klub korekty/unieważnienia/zakończenia z panelu =
  klub WIERSZA PROJEKCJI sesji (sesja cudzego klubu → 404, nie 403 - jak maszyna)
- **jedyna nowa odmowa ingestu: `aircraft_not_in_org`** (403, cała paczka) - maszyna
  z paczki należy do innego klubu niż token, albo sesja już istniejąca należy do innego
  klubu. Twarda, bez miękkiej wersji: flaga w cudzym dzienniku byłaby już wyciekiem.
  Maszyna NIEZNANA rejestrowi floty przechodzi (rejestr przyjmuje to, co przyszło)
- **unikaty klubu**: `(org_id, reg)`, `(org_id, code)`, `(org_id, tab)` - ta sama wartość
  w dwóch klubach to dwa byty. `uniqueConflictOn` widzi `idx_memberships_code`, bo
  separatorem jest podkreślenie. Sygnatura numeruje dobę pilota W KLUBIE
  (`AND x.org_id = s.org_id` w partycji `PgAdminSessionsRepo`)
- **`/reference` = flota i CZŁONKOWIE klubu z tokenu** (kod z członkostwa, `active`
  = członkostwo aktywne, ETag z klubem); `GET /sheets/:tab` czyta kartę w kluczu klubu
  z tokenu (cudza o tej samej nazwie → 404). Panel: `AdminPilotListItem` to CZŁONKOSTWO
  (`orgId`, kod i rola w klubie sesji), `POST /pilots` z e-mailem osoby z INNEGO klubu
  dopisuje jej członkostwo zamiast zakładać drugą osobę (`insert` oddaje id osoby;
  audyt `existingPerson`), `remove` odbija także osobę z członkostwem gdzie indziej
- **seed = SUPERADMINISTRATOR bez klubu** (`pilots.platform_role`), zero klubów na świeżej
  bazie; kluby zakłada moduł Organizacje (epik E). Backfill migracji 8 wymaga
  `SEED_ORG_NAME`/`SEED_ORG_SLUG` WYŁĄCZNIE na bazie z danymi 1.x (`MigrationContext.seedOrg`
  → `set_config`, `current_setting` w bloku `DO`); bez nich runner odmawia startu na
  takiej bazie, świeża przechodzi bez zmiennych. Na bazie z backfillem `admin` zostaje
  administratorem klubu domyślnego I dostaje rolę platformową - to dziś ta sama osoba
- **panel bez klubu dla superadministratora**: `panelLoginWithProvider` daje sesję
  PLATFORMOWĄ (`kind: 'platform'`, wire `{ pilot: { code: null, role: 'superadmin' },
  org: null, capabilities: ['platform.manage'] }`), która NIE otwiera `GET /me` ani
  żadnej trasy klubu - moduł Organizacje przychodzi w epiku E. Do tego czasu świeża baza
  dev (superadmin, zero klubów) nie ma jak wejść do panelu klubu; testy stoją na
  `test/testWorld.ts` z DWOMA klubami (Alfa: dotychczasowy świat; Beta: SP-BBB, BAD, BPI;
  PWI w obu pod kodami `PWI`/`PWB` - klub aktywny PWI = Alfa alfabetycznie)
- **test architektury ma imienny wyjątek** dla `infrastructure/pg/schema.ts` na `UPDATE`
  tabel append-only (backfill `SET org_id = club WHERE org_id IS NULL`, z asercją treści) -
  dopisanie drugiego pliku jest decyzją, nie refaktorem
- **czego epik B świadomie NIE ROBI** (idzie dalej): filtr `WHERE org_id` w KAŻDYM
  odczycie i test izolacji każdej trasy (C), adres kart ze slugiem i token odczytu (C),
  kontrola członkostwa per żądanie telefonu (C), `POST /auth/join { code }` i kolejka
  `pending` na członkostwach (D - od 2026-09-09 jedyna droga, sekcja wyżej; tabela
  `invitations` WYCIĘTA z migracji 8 W MIEJSCU tego samego dnia - epik B jest w `develop`,
  PR #110, ale nie na produkcji), moduł Organizacje i wybór klubu w panelu (E), klub
  w aplikacji (F). Panel web dostał wyłącznie lustro: `platform.manage` w `dto.ts`
  i `can.ts`, `org` w `PanelSessionDto`

## Wielofirmowość 2.0.0 - epik D, D1 + D4: dołączanie kodem klubu na serwerze (issue #100, 2026-09-09, gałąź `feature-100-dolaczanie-kodem`)
Domyka B4 z issue #98: kolejka zgłoszeń żyje na CZŁONKOSTWACH, a moduł zgłoszeń
rejestracyjnych z #89 (`registrations.ts` po obu stronach) jest SKASOWANY. Reguły
obowiązujące odtąd:
- **OSOBA POWSTAJE PRZY PIERWSZYM LOGOWANIU GOOGLEM, bez żadnego członkostwa**
  (`docs/wielofirmowosc.md` §4). Nazwisko i adres idą z profilu; adres trafia na osobę
  WYŁĄCZNIE potwierdzony przez dostawcę (`email_verified`) i wolny - `pilots.email` jest
  listą, po której panel dopisuje członkostwo do istniejącej osoby, więc adres
  niepotwierdzony byłby drogą do podszycia się. Podpięcie po adresie wpisanym zawczasu
  (`claimByVerifiedEmail`) działa jak dotąd. `ExternalIdentitiesPort.createPerson` to
  JEDNA transakcja (osoba + tożsamość); przegrany wyścig dwóch pierwszych logowań
  oddaje `null` i wołający czyta wiersz zwycięzcy
- **`external_identities` BEZ statusów**: `pilot_id NOT NULL`, kolumny `status`,
  `reject_reason`, `decided_at`, `decided_by` skasowane migracją 8 W MIEJSCU (nie ma jej na
  produkcji; baza dev od nowa). Backfill zgłoszeń 1.x → osoby + członkostwa
  `pending`/`rejected` w klubie domyślnym; dwie pułapki (kolumny kasowane na końcu tej
  samej migracji jeszcze stoją, pętla zamiast `INSERT…SELECT`) w `docs/architektura-
  panelu-serwer.md` §7.9 (h)
- **TOKEN OSOBY** (`purpose: 'person'`, `sub` = id osoby, 30 dni) zastępuje rejestracyjny.
  Otwiera DOKŁADNIE DWIE trasy bez klubu: `GET /auth/memberships` i `POST /auth/join`.
  Rozłączność `verify`/`verifyPerson`/`verifyPlatform` w obie strony, z testami.
  `POST /auth/google` bez aktywnego członkostwa odpowiada **`202`** `{ status:
  'pending' | 'rejected' | 'none', personToken, memberships }` - `403 no_membership`
  ZNIKNĘŁO; panel: `not_registered` ZNIKNĘŁO (osoba bez klubu = `no_panel_access`)
- **`GET /auth/memberships`** przyjmuje token osoby ALBO dowolnego klubu (13A pokazuje
  z niej listę); tokeny klubu wydaje WYŁĄCZNIE tokenowi osoby i DOKŁADNIE RAZ - trzy
  bramy z audytu #89 przeniesione 1:1: wejście do klubu (`last_login_at`) późniejsze niż
  wydanie tokenu, `credentials_valid_from` osoby ALBO członkostwa, stempel przed wydaniem.
  Stan zbiorczy: `active` > `pending` > `rejected` > `none` (`clubsView` w `commands/auth.ts`
  - jedna funkcja dla logowania, stanu zgłoszeń i kodu klubu)
- **`POST /auth/join { code }`** (`application/mobile/commands/join.ts`, adapter
  `infrastructure/pg/mobile/clubJoinRepo.ts`, trasa `http/routes/mobile/join.ts`):
  `202` pending (także przy powtórce - `ON CONFLICT (org_id, pilot_id) DO NOTHING`, bez
  drugiego wiersza), `403 membership_rejected` z powodem, `409 already_member` /
  `membership_disabled`, **`404 unknown_code` dla kodu nieznanego = wyłączonego (`join_code
  NULL`) = klubu nieaktywnego = złego kształtu** (jedna odpowiedź co do bajtu),
  `429 too_many_attempts` z `Retry-After` i `retryAfterSec`. Pilot pisze do `memberships`
  SAM, poza panelem i bez audytu - ślad powstaje przy decyzji (D2)
- **KOD KLUBU w bazie ZNORMALIZOWANY** (`domain/clubCode.ts`: 7 znaków z alfabetu 32,
  wersaliki, bez myślnika - `AZG7K4M`); `XXX-XXXX` jest zapisem do wyświetlenia
  (`formatClubCode`). Wpis pilota normalizuje `normalizeClubCode` (myślniki, spacje,
  wielkość liter), zły kształt → `null` → to samo `404`. Generowanie kodu - D2
- **OGRANICZENIE TEMPA W PAMIĘCI PROCESU** (`application/mobile/attemptLimiter.ts`, czysty,
  na porcie `Clock`): okno przesuwne 15 min, 10 prób na osobę i 30 na adres IP naraz;
  liczą się próby DOZWOLONE (udane i nieudane), odbita `429` nie przedłuża blokady;
  `retryAfterMs` = do wygaśnięcia najstarszej z ostatnich `limit` prób. Jedna instancja
  serwera (§8.8 architektury), więc tabela byłaby kosztem bez zysku
- **`credentialsRevoked` przeniesione do `domain/credentials.ts`** - potrzebują go trzy
  miejsca (brama panelu, token osoby, dołączanie), a warstwa aplikacji nie importuje
  z `http/`. `PilotAccount` niesie odtąd `credentialsValidFrom`; `Membership` -
  `rejectReason`, `createdAt`, `decidedAt`
- **audyt**: `registration.approve/reject` → `membership.approve/reject` (emituje D2)
- **panel stracił kolejkę zgłoszeń i szufladę zatwierdzania** (wracają 1:1 z makiet
  `piloci-lista`/`piloci-zgloszenie`/`piloci-kod-klubu` w epiku E na kontrakcie
  członkostw); lustro `RegistrationStatusDto` wycięte z `mirrors.test.ts`
- **aplikacja pilota NIE jest tknięta** - woła stare `GET /auth/registration`
  i `registrationToken` do epiku F; na `develop` nic się nie buduje, więc rozjazd jest
  przyjęty. D9 (podręcznik, `docs/logowanie-google.md`, `_main.md.txt`, changelog) idzie
  razem z resztą epiku
- testy: `joinClub.test.ts` (cała tabela odpowiedzi z §5 + oba limity na sterowanym
  zegarze), `attemptLimiter.test.ts`, `clubCode.test.ts`, blok „osoba BEZ klubu"
  w `auth.test.ts`, backfill tożsamości w `organizations.test.ts`

## Wielofirmowość 2.0.0 - epik C: izolacja danych między klubami (issue #99, 2026-09-10, gałąź `feature-99-izolacja-klubow`)
Epik B dał model (klub w tokenie, `org_id` na tabelach); epik C zamyka pytanie „czy to
naprawdę nie wycieka". Reguły obowiązujące odtąd KAŻDĄ nową trasę i KAŻDE nowe zapytanie:
- **klub jest ARGUMENTEM PORTU, nie polem filtra**: `list(db, orgId, filter)`,
  `byId(db, orgId, id)`, `latest(db, orgId, uuid)`. Pole filtra dałoby się pominąć
  i nikt by nie zauważył; argument wymusza kompilator. W predykacie klub stoi jako
  PIERWSZY warunek (`filter.add('s.org_id = ?', orgId)` przed czymkolwiek innym)
- **KLUB POWTARZA SIĘ W KAŻDYM PODZAPYTANIU I ZŁĄCZENIU**, nawet gdy zewnętrzne `WHERE`
  zawęziło już wiersz nadrzędny (`AND f.org_id = s.org_id`, `LEFT JOIN aircraft a ON
  a.id = s.aircraft_id AND a.org_id = s.org_id`). Bez tego izolacja wisi na GLOBALNEJ
  jedyności identyfikatora - a uuid operacji nadaje TELEFON, nie serwer. Strażnik
  z `architecture.test.ts` znalazł jedenaście takich miejsc przy pierwszym przebiegu;
  wszystkie dostały jawny predykat po jednej linijce
- **CUDZA RZECZ ODPOWIADA 404, NIE 403**: operacja, maszyna, flaga, karta i norma innego
  klubu są dla tokenu NIEISTNIEJĄCE. `403` mówiłoby „to istnieje, ale nie dla ciebie",
  czyli potwierdzałoby cudzy zasób. `sync-status` cudzej operacji oddaje kształt
  „nieznana serwerowi" (`received: 0`, `status: 'unknown'`, `flags: []`), bo telefon
  musi umieć to przeczytać bez wyjątku
- **INGEST WAŻY CZŁONKOSTWO PER ZDARZENIE, nie per paczka**: zapis do maszyny albo
  operacji innego klubu wraca w `withheld[]` (mechanizm z issue #81), a reszta paczki
  wchodzi. Odmowa całej paczki (`aircraft_not_in_org` z epiku B) dawała cudzej operacji
  władzę nad synchronizacją WŁASNYCH zapisów pilota. Jedyna twarda odmowa ingestu
  zostaje `not_session_pic` (jeden piszący, §4.1)
- **BRAMA TELEFONU PYTA BAZĘ O CZŁONKOSTWO PRZY KAŻDYM ŻĄDANIU** (`authorizeMember`
  + `MemberGate`/`memberFromRequest` w `http/memberGate.ts`): wyłączenie członkostwa
  zamyka trasy natychmiast, nie po godzinie życia tokenu. Panel miał to od epiku B
  (`authorizeOrg`), a teraz obie bramy liczą to samo jednym kodem
- **KARTA ARKUSZA MA ADRES Z KLUBEM I SEKRETEM**: `GET /sheets/<slug>/<tab>?k=<sekret>`,
  gdzie sekretem jest `organizations.sheets_key` (losuje baza przy założeniu klubu).
  Trasa NIE MA SESJI i to jest jej sens - link musi otworzyć się skarbnikowi bez konta.
  Każda rozbieżność (slug, sekret, nazwa karty, klub wyłączony) to TEN SAM `404`, więc
  adres nie potwierdza istnienia ani klubu, ani karty; porównanie sekretu czasowo stałe.
  Adres sprzed 2.0.0 (`/sheets/:tab`) zostaje dla linków zapisanych w dzienniku eksportu
  i czyta kartę w klubie Z TOKENU. Nazwa karty (`sheetTab`) bez zmian
- **ZGŁOSZENIA BŁĘDÓW SĄ MODUŁEM PLATFORMY**: `bugs.triage` wyszło z roli klubowej
  `admin` i weszło do `PLATFORM_CAPABILITIES` obok `platform.manage`. Opis błędu niesie
  kontekst okna razem z danymi operacji, a poprawia go jedna osoba dla całego serwera -
  więc decyzja o CUDZYM zgłoszeniu nie należy do klubu. W panelu: pozycji „Zgłoszenia"
  w kolumnie klubu NIE MA WCALE (nie jest wyszarzona - `navItemsFor` w `ui/shell/nav.ts`
  bramkuje pozycje ZDOLNOŚCIĄ), trasa pyta o zdolność (`RequireCapability`), a wiersz
  listy niesie kolumnę „Klub", bo kolejka jest jedna dla serwera, a kod pilota jedyny
  w klubie. Ekran startowy liczy `homeFor(capabilities)` - stała `/dziennik` odsyłałaby
  superadministratora na trasę, która odpowie mu 401
- **SYGNATURA NUMERUJE DOBĘ PILOTA W KLUBIE**: osoba w dwóch klubach ma tego samego dnia
  dwa niezależne numerowania i dwa kody (`PWI` w Alfie, `PWB` w Becie) - kod pochodzi
  z CZŁONKOSTWA w klubie OPERACJI, nie z klubu tokenu, którym ktoś patrzy
- **`/me/events` JEDZIE Z KLUBU TOKENU**: osoba w dwóch klubach odtwarza rejestr osobno
  w każdym z nich. Odtworzenie wszystkich naraz wymagałoby, żeby telefon trzymał
  operacje spoza klubu aktywnego - to decyzja epiku F, nie C
- **DWA STRAŻNIKI, KTÓRE TRZEBA ZNAĆ PRZED DOPISANIEM TRASY** (opis: `docs/architektura-
  panelu-serwer.md` §7.10):
  1. `server/test/tenantIsolation.test.ts` bierze listę tras z REJESTRU FASTIFY
     (`app.routeCatalog`) i wymaga, żeby każda miała przypadek izolacji albo imienny
     wyjątek z powodem. **Nowa trasa bez jednego z dwóch wywala ten test** - i to jest
     zamierzone, bo dokument dezaktualizuje się po cichu, a rejestr tras nie;
  2. strażnik w `server/test/architecture.test.ts`: każda metoda adaptera, która dotyka
     tabeli skopowanej, musi mówić `org_id`. Jednostką jest METODA (nie plik, nie
     literał - `SqlFilter` rozbija predykat na osobny napis), a szablony `${SELECT}`
     z modułu wklejają się do wołającego. Sprawdzenie jest TEKSTOWE: gwarantuje, że
     o klubie ktoś pomyślał, nie że pomyślał dobrze - poprawność bierze na siebie test
     izolacji. Wyjątki są imienne i mają kontrolę „nie zgnij": metoda z listy musi
     istnieć i nadal pomijać klub. Dziś jest jeden (`bugReportsRepo.countByStatus`)
- **czego epik C świadomie NIE ROBI**: nakładek na maszynę współdzieloną między klubami
  (`aircraft_overlap` liczy się w obrębie klubu), przełączania klubu w panelu (epik E)
  i klubu w aplikacji pilota (epik F)

## Wielofirmowość 2.0.0 - epik D domknięty: kolejka zgłoszeń, kod klubu, Organizacje (issue #100, 2026-09-10, gałąź `feature-100-kolejka-i-organizacje`)
D1+D4 dały drogę PILOTA (`POST /auth/join`, token osoby); ten PR daje drugą połowę -
DECYZJĘ KLUBU i zakładanie klubów - oraz kasuje drogi, które zostały po 1.x. Decyzje
i odstępstwa: `docs/wielofirmowosc.md` §14 D. Reguły obowiązujące odtąd:
- **TRZY KOMENDY DECYZJI, KAŻDA W JEDNĄ STRONĘ** (`commands/memberships.ts`,
  `accounts.manage`): `approve` (`pending` → `active` z kodem i rolą), `reject`
  (`pending` → `rejected`, **powód WYMAGANY** - pilot czyta go na 00D), `reopen`
  (`rejected` → `pending`, kasuje KOMPLET decyzji: powód, chwilę, autora - wiersz opisuje
  STAN, historię trzyma audyt). **Zatwierdzenie NIE przyjmuje `rejected`**: wpuszczenie
  odrzuconego jednym ruchem pomijałoby chwilę, w której ktoś świadomie zdejmuje cudzą
  decyzję. Odmowa z innego stanu to `409 wrong_status` ZE STANEM - administrator z otwartą
  szufladą nie wie, że drugi rozstrzygnął minutę temu, a „nie można" bez powodu wygląda
  jak awaria
- **KOLEJKA I KOD KLUBU MAJĄ WŁASNE TRASY**, nie pola w `GET /pilots`: tamta lista jedzie
  na `panel.access` (czyta ją każdy z wejściem do panelu, jest też słownikiem pilotów dla
  filtrów innych ekranów), a kolejka z adresami ludzi spoza klubu i włącznik drogi do
  klubu - na `accounts.manage`. Zdolność jest ATRYBUTEM TRASY i doklejenie ich do tamtej
  odpowiedzi oddałoby je każdemu, kto czyta listę
- **„ILE ZGŁOSZEŃ CZEKA TYM KODEM" LICZY SIĘ OD `join_code_since`** - `memberships` nie
  zapisuje, którym kodem ktoś wszedł, i zapisywać nie ma po co (kod jest jeden na klub,
  a jego zmiana ma stempel). Stąd DWIE różne liczby na ekranie i to jest zamierzone: karta
  kodu mówi o BIEŻĄCYM kodzie, karta ZGŁOSZENIA o całej kolejce. Rotacja zgłoszeń NIE RUSZA
- **KODU NIE DA SIĘ WPISAĆ Z RĘKI - tylko wylosować** (`clubCodeFrom` w domenie, bajty
  z `randomBytes` przez konstruktor): klub dobierający sobie kody wybierałby łatwe do
  zgadnięcia. `% 32` nie ma obciążenia (256/32 = 8 dokładnie) i to jest powód długości
  alfabetu. Zderzenie z kodem innego klubu (`UNIQUE` na serwerze) = LOSUJ PONOWNIE,
  **nową transakcją**: po błędzie unikalności transakcja Postgresa jest odrzucona, więc
  pętla stoi WOKÓŁ `write.run`, nie w jego wnętrzu; nieudana próba nie zostawia ani kodu,
  ani wpisu w dzienniku
- **MODUŁ ORGANIZACJE UMIE CZTERY RZECZY** (`platform.manage`, `platformRoute`): lista
  (liczby członków i maszyn + administratorzy z flagą „nie zalogował się"), **założenie
  klubu razem z kodem i PIERWSZYM administratorem** (jedno, nierozdzielne zamówienie -
  klub bez administratora nie ma jak zacząć, bo kodem nie miałby kto zatwierdzić), zmiana
  NAZWY i wyłączenie klubu. Czego NIE umie: kasowania klubu (dziennik jest jego
  dokumentem), zmiany sluga (adres kart arkusza, nadawany raz), rotacji kodu (to panel
  KLUBU) i wejścia w dane klubu (§3.3 - z wnętrza oddaje LICZBY i administratorów).
  `sheets_key` losuje BAZA (`DEFAULT`), żeby sekret nie powstawał w dwóch miejscach
- **SESJA KLUBU DOSTAJE NA TRASACH PLATFORMY 401, NIE 403** - to nie jest ten rodzaj
  tokenu (`authorizePlatform`). Ta sama asymetria, co przy zgłoszeniach błędów (issue #99)
- **`POST /admin/api/pilots` USUNIĘTE** razem z `joined_via = 'panel'` (CHECK w migracji 8
  zmieniony W MIEJSCU - nie ma jej na produkcji) i ze ścieżką „Dodaj pilota" w panelu web
  (przycisk, `#/piloci/nowy`, `useCreatePilot`, `createBodyOf`). Z panelu KLUBU nie da się
  nikogo dopisać ani adresem, ani linkiem; jedyny wyjątek jest klasy bootstrap i należy do
  platformy. Pusta lista pilotów mówi odtąd, CO ma się stać („podaj pilotom kod klubu"),
  a nie oferuje akcji, której serwer nie ma - ekran „Kod klubu" wchodzi w epiku E
- **`pilot.deactivate` → `membership.disable`** w katalogu audytu: od wielofirmowości
  odcina się CZŁONKOSTWO, nie osobę (ta lata dalej w pozostałych klubach). Dawny kod
  ZOSTAJE w katalogu dla wierszy 1.x - precedens `pilot.password_reset`. Przywrócenie
  dostępu własnego kodu NIE MA (`pilot.update`) i to ta sama asymetria, co przy klubie
  (`organization.disable` kontra `organization.update`)
- **WYJŚCIE Z KLUBU TO WYŁĄCZENIE CZŁONKOSTWA i NIE MA własnego kodu** (D6): wszystkie
  cztery skutki wynikają z bramy członkostwa (epik C) i z append-only rejestru - trasy
  telefonu i refresh zamykają się natychmiast, rejestr i dziennik zostają nietknięte,
  zaległe zapisy do tamtego klubu wracają we `withheld` pod tokenem drugiego klubu,
  a okno korekty pilota gaśnie razem z dostępem. Dostały za to test (`test/leaveClub.test.ts`),
  bo niepilnowana własność jest własnością do czasu. **„Opuść klub" z telefonu NIE
  ISTNIEJE**: pilot mógłby wyjść z otwartą operacją i niewysłaną kolejką
- **KAŻDA NOWA TRASA PŁACI ZA OBA STRAŻNIKI Z EPIKU C** (`tenantIsolation.test.ts`
  z rejestru Fastify + `org_id` w SQL-u): dwanaście tras tego PR-a dostało przypadki
  izolacji, a świat testowy - dwa nowe znaczniki klubu B (kandydat w kolejce Bety i kod
  klubu Bety), bo bez danych po tamtej stronie „czysta" odpowiedź nie dowodzi niczego
- pułapki SQL-a z tego epiku (`CASE` z `NULL` bierze typ z parametru; stempel „obowiązuje
  od" musi iść z zegara APLIKACJI): `docs/architektura-panelu-serwer.md` §7.9 (i), (j)

## Wielofirmowość 2.0.0 - epik E: panel w kontekście klubu (issue #101, 2026-09-10, gałąź `feature-101-panel-kluby`)
Epiki B–D dały model, izolację i drogi wejścia; epik E daje POWIERZCHNIĘ: moduł
Organizacje, wybór klubu, członkowie, zgłoszenia i kod klubu. Decyzje i odstępstwa:
`docs/wielofirmowosc.md` §14 E. Reguły obowiązujące odtąd:
- **ADRES PANELU JEST PŁASKI, KLUB SIEDZI W SESJI** (decyzja właściciela 2026-09-10 -
  odrzuca `#/k/<slug>/…` z listy zadań issue #101, potwierdza §8.2). `#/dziennik` znaczy
  to samo przez całą sesję, wybór zakresu stoi pod `#/klub`, a kafel kolumny bocznej
  prowadzi tam z powrotem. Prefiks ze slugiem kupowałby link przenośny MIĘDZY klubami -
  przypadek administratora dwóch klubów - kosztem przepisania każdej trasy i każdego
  linku panelu oraz drugiego źródła prawdy o klubie obok sesji. **Nie proponować ponownie.**
- **TRZY TRASY SESJI, KTÓRE EPIKI B–D ODŁOŻYŁY**: `GET /me` odpowiada odtąd OBU rodzajom
  sesji (nowe `sessionRoute` w `adminRoute.ts`) - bez tego superadministrator po
  odświeżeniu karty lądował na ekranie logowania, z którego przed chwilą wszedł;
  `POST /admin/api/auth/switch { orgId | null }` wydaje NOWĄ sesję dla klubu albo dla
  platformy (`null`), ten sam token Google w tle. `sessionRoute` jest deklaracją dla
  pytań, które zadaje SAMA SESJA, a nie moduł - trzeciej takiej trasy nie dokładaj bez
  tego rachunku.
- **ZAKRESY JADĄ W KAŻDEJ ODPOWIEDZI O SESJI** (`PanelScopes`: kluby z rolą panelu +
  flaga platformy), a nie osobną trasą: panel pyta o to przy KAŻDYM wczytaniu (czy kafel
  jest linkiem, czy po zalogowaniu iść na wybór). Osobna trasa znaczyłaby drugie żądanie
  przy każdym starcie panelu - i to o odpowiedź, która przy jednym członkostwie nic nie
  zmienia. Koszt: jeden odczyt członkostw przy `GET /me`, czyli ten sam rachunek, co
  `authorizeOrg`.
- **PRZEŁĄCZENIE SPRAWDZA CEL OD ZERA, ŹRÓDŁA PYTA WYŁĄCZNIE O TOŻSAMOŚĆ**: administrator
  wyłączony w klubie A ma prawo przejść do B - o wejściu rozstrzyga członkostwo w CELU.
  Ciasteczko starsze niż `credentials_valid_from` OSOBY albo CELU nie mieni nowej sesji;
  bez tego wyłączenie członkostwa dałoby się obejść przełączeniem tam i z powrotem
  ciasteczkiem sprzed wyłączenia (ta sama reguła, którą audyt 2026-09-05 nałożył na token
  osoby). Zakres, którego ta osoba nie ma - cudzy klub ALBO platforma bez roli
  platformowej - to **404**, nie 403 (epik C: 403 potwierdzałoby, że taki klub jest).
- **KAFEL KONTEKSTU STOI ZAWSZE, PRZEŁĄCZNIK - NIE** (`ui/shell/scope.ts`, z testami):
  nazwa klubu odpowiada na „czyj to dziennik" przy każdym wklejonym linku, więc kafel jest
  też przy jednym zakresie - ale wtedy jest `div`, nie linkiem. Ekran wyboru z jedną kartą
  obiecywałby wybór, którego nie ma. **Platforma liczy się jako ZAKRES**, inaczej operator
  z jednym klubem nie miałby jak zejść do niego ani wrócić (przypadek 00A′ z makiety).
- **`homeFor` DECYDUJE O EKRANIE STARTOWYM I ZALEŻY OD KOLEJNOŚCI `NAV_ITEMS`**:
  Organizacje stoją PRZED Zgłoszeniami, więc superadministrator ląduje w Organizacjach.
  Dopisując moduł platformy, sprawdź, czy nie przestawiasz tym ekranu startowego.
- **MODUŁ PILOCI MA TRZY SZUFLADY NAD JEDNĄ LISTĄ** i każda ma własny adres, bo każda
  opisuje inny byt: członek (`#/piloci/:id`), KANDYDAT z kolejki (`#/piloci/zgloszenia/:id`
  - osoba bez kodu) i KOD KLUBU (`#/piloci/kod` - konfiguracja klubu, nie człowiek).
  Rozstrzyga TRASA (prop `drawer`), a nie ekran czytający adres w środku: `zgloszenia`
  i `kod` byłyby dla `:id?` zwykłym identyfikatorem konta.
- **KOLEJKA I KOD PYTAJĄ SERWER TYLKO Z `accounts.manage`** (`enabled` na hookach): to są
  adresy ludzi spoza klubu i włącznik jedynej drogi do niego, więc bez tej zdolności
  odpowiedź byłaby 403 - czyli baner błędu na ekranie, na którym nic złego się nie stało.
  Nieudany odczyt KOLEJKI mówi o sobie tak samo jak nieudany odczyt listy: bez tego karta
  po prostu by nie wjechała, a awaria wyglądałaby jak „nikt nie czeka".
- **PRZEŁĄCZENIE CZYŚCI CACHE DOKŁADNIE JAK WYLOGOWANIE**: po zmianie klubu każda pobrana
  lista opisuje inny świat, a wiersz cudzego dziennika, który mignąłby przed odświeżeniem,
  byłby wyciekiem - tym samym, przed którym broni cały epik C. Kolejność też ta sama:
  najpierw nowa sesja (to ona przestawia ramę), potem reszta do kosza.
- **ZATWIERDZENIE NIE PRZYJMUJE ODRZUCONEGO** - w panelu tak samo jak na serwerze:
  „Cofnij odrzucenie" jest OSOBNYM przyciskiem w karcie po decyzji (P3b), bo zdjęcie cudzej
  odmowy i wpuszczenie do klubu to dwie decyzje i każda ma własny wpis w dzienniku.
- **KOD KLUBU STOI JAWNIE I NA STAŁE**: nie jest sekretem (daje wyłącznie zgłoszenie do
  rozpatrzenia), więc nie ma „pokaż raz", zasłony ani przycisku „Kopiuj" - administrator
  czyta go z ekranu i dyktuje. Karta pokazuje DWIE różne liczby i to jest zamierzone: podpis
  mówi, ile zgłoszeń czeka BIEŻĄCYM kodem (od jego wygenerowania), a karta ZGŁOSZENIA nad
  listą - ile czeka w ogóle.
- **MAKIETY DOSTAŁY BRAKUJĄCE RAMKI** (O2 „nowy klub", P3 zatwierdzenie, P3b po decyzji):
  panele wariantów obiecywały je od epiku A, a kotwice prowadziły donikąd. Z kolumny
  bocznej makiet KLUBOWYCH zeszła przy okazji pozycja „Zgłoszenia" - należy do platformy
  od epiku C (C6), a `SZABLON.html` miał już postać właściwą. Komponent `.club-code`
  przeszedł z `design/panel/rama.css` do `admin/src/styles/components/surfaces.css` pod
  TĄ SAMĄ nazwą, jak zapowiadał tamten plik; `panel.css` przegenerowany.
- **SUPERADMINISTRATOR NIE PRZEGLĄDA INNYCH KLUBÓW** (decyzja właściciela 2026-09-10;
  §3.3 przestał być propozycją). Z wnętrza klubu widzi DOKŁADNIE: nazwę, adres, stan,
  datę założenia, LICZBĘ członków, LICZBĘ maszyn, kod klubu i administratorów (do kogo
  dzwonić). Ani wiersza dziennika, ani maszyny, ani pilota poza administratorami. Nie ma
  też trasy, którą sesja platformowa otwierałaby panel klubu - `POST /auth/switch`
  przełącza wyłącznie do klubu z AKTYWNYM członkostwem i rolą panelu. Operator, który ma
  pomóc klubowi, dostaje od niego członkostwo - jawnie i z audytem. **Punkt „wejście do
  panelu klubu" z listy zadań issue #101 wypadł razem z tą decyzją; nie proponuj go
  ponownie.** Kolejka zgłoszeń błędów nie jest wyjątkiem: opisuje APLIKACJĘ, nie klub
  (issue #99, C6).
- **czego epik E świadomie NIE ROBI**: zmiany sluga i rotacji kodu z platformy (kod
  prowadzi klub), edycji administratorów klubu z modułu Organizacje. Zostaje epik F
  (aplikacja pilota, issue #102).

## Wielofirmowość 2.0.0 - epik F: aplikacja pilota w kontekście klubu (issue #102, 2026-09-10, gałąź `feature-102-aplikacja-kluby`)
Telefon pracuje w JEDNYM aktywnym klubie, ale rejestr należy do PILOTA - i z tej asymetrii
bierze się cały epik. Decyzje i odstępstwa: `docs/wielofirmowosc.md` §14 F. Reguły
obowiązujące odtąd KAŻDY nowy ekran i KAŻDE nowe zapytanie do magazynu:
- **KLUB JEST KONTEKSTEM FLOTY I WYSYŁKI, NIE REJESTRU**: `getAircraft()` i `getPilots()`
  oddają dane KLUBU AKTYWNEGO (kod pilota należy do członkostwa - ten sam człowiek jest
  w Alfie `AKO`, a w Becie `AKB`), a „Mój dzień", historia i sumy doby pokazują operacje
  WSZYSTKICH klubów. Stąd `getAircraftById` i NOWE `getAllAircraft()` idą BEZ zawężenia:
  kafelek operacji z drugiego klubu musi mieć czym się podpisać, inaczej wraca na ekran
  surowy identyfikator z panelu. Do WYBORU maszyny służy `aircraft()` i tylko ono.
- **KLUB OPERACJI STAWIA JEJ PIERWSZE ZDARZENIE I NIKT GO POTEM NIE ZMIENIA**
  (`session_orgs`, `INSERT OR IGNORE`). Korekta operacji z klubu A, dopisana wtedy, gdy
  aktywny jest klub B, ZOSTAJE zapisem klubu A - bo wysłana tokenem klubu B wróciłaby
  jako `withheld` (epik C waży członkostwo per zdarzenie), czyli przepadłaby na zawsze.
- **KOLEJKA WYSYŁKI JEST PER KLUB, LICZNIK - NIE**: `getOutbox()` oddaje wyłącznie zapisy
  klubu aktywnego (plus operacje bez klubu, czyli sprzed 2.0.0), a `getOutboxCount()`
  liczy WSZYSTKO, bo SyncChip i blokada wylogowania pytają „czego serwer jeszcze nie ma".
  Trzeci licznik, `pendingInActiveOrg()`, obsługuje blokadę przełączenia klubu.
- **PRZEŁĄCZENIE KLUBU BLOKUJE TYLKO KOLEJKA KLUBU BIEŻĄCEGO** (decyzja właściciela
  2026-09-10, zawęża §6 dokumentu). Dosłowne „pusta kolejka" dawało ZAKLESZCZENIE:
  korekta z klubu A czekałaby na powrót do A, a powrót do A blokowałaby właśnie ona.
  Blokujemy tym, co osieroci WYJŚCIE z klubu. Kolejność powagi w `clubSwitchBlock`:
  trzymana maszyna → zaległe zapisy → brak sieci.
- **`GET /me/events` ZOSTAJE PER KLUB** (decyzja właściciela 2026-09-10): po reinstalacji
  telefon odtwarza rejestr klubu aktywnego, historię drugiego dostaje po przełączeniu.
- **SQLite 9 NIE RUSZA `events`**: `ALTER TABLE … ADD COLUMN` nie jest idempotentne
  (`sqliteSchema.test.ts`), a rejestr jest jedyną tabelą, której nie wolno zgubić.
  Klub operacji mieszka w `session_orgs`, cache referencyjny (pięć tabel) leci
  `DROP` + `CREATE` z `org_id` - to materiał roboczy i wraca jednym `GET /reference`.
  `reference_pilots` ma odtąd klucz `(org_id, id)`.
- **KLUB MELDUJE SIĘ MAGAZYNOWI PRZY KAŻDYM WYDANIU PARY TOKENÓW** (`AuthService`
  → `onActiveClub` → `EventsRepo.setActiveOrg`): logowanie, zatwierdzenie w międzyczasie,
  przełączenie i ROTACJA. Ta ostatnia jest drogą telefonu aktualizowanego z 1.x (§11):
  stary profil klubu nie zna, a pierwsze odświeżenie tokenów przynosi go razem z parą
  i przygarnia wszystkie operacje bez klubu.
- **PRZEŁĄCZENIE NIE ZERUJE PIN-u** - zmienia kontekst pracy, nie tożsamość urządzenia;
  inaczej pilot dwóch klubów ustawiałby PIN po każdej zmianie. Zeruje go WYŁĄCZNIE
  świadomy provisioning (§3.0).
- **`POST /auth/switch` PRZYJMUJE WYŁĄCZNIE TOKEN KLUBU** (serwer): kto go ma, już raz
  wszedł. Token OSOBY ma własną, JEDNORAZOWĄ drogę do tokenów klubu
  (`GET /auth/memberships`, stempel `lastLoginAt`) - gdyby przechodził przełączeniem,
  byłby fabryką par tokenów z pominięciem tamtej bramy (audyt 2026-09-05).
- **NUMER SYGNATURY LICZY SIĘ W KLUBIE, NUMER KAFELKA - W DOBIE PILOTA**: to jedyne
  miejsce, w którym rozjeżdżają się liczby, o których issue #68 mówiło „ten sam numer" -
  i tak rysuje to makieta `01e` („OPERACJA 3" nad sygnaturą `…/TOM/1`). Klub przynosi
  WOŁAJĄCY (`operationIndexes(states, picId, orgOf)`), bo domena klubu nie zna (§2) -
  ta sama granica, co przy oknach lotów w `trackPhaseRuns`.
- **PLAKIETKA KLUBU I PRZEŁĄCZNIK ISTNIEJĄ WYŁĄCZNIE PRZY >1 CZŁONKOSTWIE** (reguła
  SyncChipa z issue #12); zgłoszenie `pending` liczy się do tej dwójki, bo pilot, który
  właśnie wpisał kod, ma prawo zobaczyć, że czeka. Podpis karty klubu nie pisze
  „0 samolotów" dla klubu, którego floty telefon nigdy nie widział - to byłoby zdanie
  o flocie, a jest zdaniem o pustym cache'u.
- **KLUB JEDZIE PRZEZ WSPÓLNY `SessionCardVm`, NIE PRZEZ PROPS EKRANU** - jak sygnatura:
  kafelek ma na 01 i 12 JEDEN kształt (issue #42), a wartość spoza projekcji wstrzykuje
  się funkcją (`clubOf`, `signatureOf`). Regułę „>1 członkostwo" trzyma `useOperationClub`,
  więc oba ekrany nie mają jak jej powiedzieć inaczej. Pierwsza wersja przekazywała klub
  propsem i **strażnik kształtu w `myDay.test.ts` tego nie widział** - to on wymusił
  poprawkę, gdy pole weszło do modelu.
- **SYGNATURA WRÓCIŁA NA KAFELEK 01** (dług sprzed 2.0.0, znaleziony przy tym epiku):
  `buildMyDay` umiał ją policzyć od issue #68, ale ekran wołał go BEZ `signatureOf`,
  więc kafelek „Mojego dnia" pokazywał sam numer operacji - wbrew mockupom 01/01e i wbrew
  karcie w historii, gdzie stała od początku. Rachunek był, brakowało jednego argumentu.
- **00C/00D/00E TO TRZY STANY JEDNEGO EKRANU** (`ClubGateScreen`, dawny
  `RegistrationPendingScreen`): treść liczy `logic/clubGateView.ts`, kod klubu maskuje
  `logic/clubCode.ts` (myślnik i wielkość liter są ZAPISEM). Maska NIE filtruje alfabetu
  kodów - pole, które połyka wciśnięty klawisz, nie mówi dlaczego; kod spoza alfabetu
  dostaje od serwera to samo „Nie znam takiego kodu", co kod nieznany.
- **PLAKIETKA KONTA NA 00C/00D/00E JEDZIE Z SERWERA** (`ClubsView.person`): token osoby
  niesie identyfikator, nie profil, a wyłuskiwanie imienia z tokenu Google byłoby drugim,
  niesprawdzanym źródłem tych samych napisów.
- **MAKIETA 13A MA CZTERY RAMKI**: przełącznik (stan, w którym działa), zgłoszenie
  czekające na liście (`.club-opt.pending` - przygaszony, nieklikalny, podpis
  bursztynem) i DWA stany zablokowane - zaległe zapisy klubu oraz maszyna w ręce.
  Trzy powody blokady mają jedno miejsce i jedną kolejność: **maszyna w ręce → zaległe
  zapisy → brak sieci**; brak sieci zmienia w tej ramce samo zdanie, więc własnej nie
  dostał. Ramka „maszyna w ręce" rysuje stan DZIŚ NIEOSIĄGALNY (kokpit jest modalny,
  a zębatka stoi tylko na 01) i to jest świadome: brzmienie powodu jest decyzją
  produktową i ma stać w specyfikacji, a nie tylko w kodzie - inaczej pierwszy, kto
  je zobaczy, napisze je drugi raz po swojemu.
- **czego epik F świadomie NIE ROBI**: odtwarzania rejestru wszystkich klubów naraz,
  „opuść klub" z telefonu (D6: wychodzi się przez panel).

## Wielofirmowość 2.0.0 - NOWA INSTANCJA zamiast migracji produkcji (decyzja 2026-09-10)
**2.0.0 startuje na PUSTEJ bazie w nowym projekcie, a stara instancja dożywa.** Odwraca
decyzję 5 z issue #97 („produkcja = migracja z backfillem"). Pełny zapis i konsekwencje:
`docs/wielofirmowosc.md` §10; zadania: issue #106 i #120.
- **argument za migracją był fałszywy**: backfill `org_id` to operacja JEDNORAZOWA dla jednej
  bazy 1.x i nigdy się nie powtórzy - przyszły klub zakłada superadministrator w module
  Organizacje, na bazie już wielofirmowej. Migracja testowała ścieżkę martwą; pusta baza
  testuje TĘ, którą przejdzie każdy klient (seed → Organizacje → klub → kod klubu → piloci)
- **dwie instancje przez okres przejściowy**: stara (`uzaeroserver-production`, pakiet
  `com.tomekklag.uzaero`, stary klient OAuth) stoi nietknięta, dopóki testerzy nie przejdą
  na 2.0.0; nowa na `app.ninerdeck.pl`. **Nowy serwer nie musi rozumieć tokenu bez `org`** -
  kompatybilność wsteczną z §11 zdejmuje sam fakt, że stary serwer dalej odpowiada
- **migracja 8 zostaje w kodzie nietknięta**, tylko nigdy nie zobaczy danych; `SEED_ORG_NAME`
  i `SEED_ORG_SLUG` przestają być potrzebne na produkcji. W1 z epiku W (próba generalna
  `pg_dump` → migracja na kopii → sumy kontrolne) ODPADA - istniał, żeby obronić backfill
- **zrzut starej bazy idzie do ARCHIWUM, nie do nowej instancji**: to jedyne prawdziwe dane
  z lotu, jakie projekt ma, i materiał kalibracyjny (§3.6b) - `consumptionReplay.ts`
  i `replay.ts` czytają go bez żywej bazy
- **cena jest jedna i realna**: flotę wpisuje się od nowa (normy paliwa i oleju, pojemności,
  minima, format licznika, stany początkowe), piloci rejestrują się ponownie, a dokumenty
  klubu z okresu testów zostają po starej stronie
- **do rozstrzygnięcia po wygaszeniu starej instancji**: czy wyciąć backfill z migracji 8
  razem z imiennym wyjątkiem na `UPDATE` w `architecture.test.ts`

## Nowa instancja dotyczy TEŻ APLIKACJI, Play schodzi do 4.0.0 (decyzje 2026-09-15)
Rebranding stawiamy od zera po OBU stronach naraz - serwer i aplikacja. Rozstrzyga to
pytanie „nowy projekt EAS czy przemianowanie obecnego" (#120 §5) i zdejmuje Play z drogi
krytycznej 2.0.0.
- **nowy projekt EAS**, nie przemianowanie: własny `projectId`, własny adres aktualizacji
  i własne kanały `production`/`development`
- **nowy pakiet** `com.ninerdeck.app` = osobna instalacja, osobne dane lokalne, osobna
  ikona. To jest ta sama ochrona, o którą prosiło R7: klucze magazynu, PIN, poświadczenia
  i zadanie GPS zmieniły nazwy, więc aktualizacja istniejącej instalacji zostawiłaby
  osieroconą usługę `uzaero-location` i pusty rejestr na telefonie
- **2.0.0 NIE JEST aktualizacją niczego** - to pierwsze wydanie nowej linii. OTA z niej
  do telefonów z 1.1.0 nie dojdzie i nie ma dojść; stara linia (projekt EAS, pakiet,
  instancja, klient OAuth) dożywa równolegle do W4
- **PUBLIKACJA W PLAY SCHODZI DO 4.0.0**: 2.0.0 rozchodzi się jak 1.1.0 - plikiem APK ze
  strony pobierania. Dzięki temu **R3 potrzebuje JEDNEGO odcisku SHA-1** (klucz EAS);
  drugi odcisk, Play App Signing, był jedyną pozycją wiążącą wydanie z kontem organizacji
  w Play i procedurą D-U-N-S (do 30 dni)
- **„klient Android z dwoma SHA-1" będzie przy 4.0.0 ZMIANĄ W KODZIE, nie wpisem
  w konsoli**: aplikacja woła `Google.useAuthRequest({ androidClientId })`, więc `aud`
  tokenu to identyfikator klienta ANDROID, a konsola wiąże jeden klient z jednym odciskiem.
  Klucz EAS i klucz Play dają dwa różne `aud`, a serwer przyjmuje dziś dokładnie jeden
  (`mobile: string | null` w `GoogleIdTokens`). Do sprawdzenia i domknięcia przy 4.0.0

- **WŁASNA DOMENA TEŻ SCHODZI DO 4.0.0** (ta sama decyzja): 2.0.0 stoi na adresie nadanym
  przez Railway, a `ninerdeck.pl` (strona) i `app.ninerdeck.pl` (panel + API) przychodzą
  razem ze sklepem. `PUBLIC_BASE_URL`, `EXPO_PUBLIC_API_URL`, origin klienta Web i adres
  polityki w ekranie zgody wskazują do tego czasu adres Railway. **R2 wypada z drogi
  krytycznej 2.0.0**: zostają na niej nowy projekt Railway z pustą bazą, nowy projekt Google
  Cloud (klient Web + klient Android na JEDNYM odcisku, kluczu EAS) i nowy projekt EAS -
  ani domen, ani D-U-N-S, ani konta Play
- **przeniesienie będzie OTA, nie nowym APK**: `EXPO_PUBLIC_API_URL` jest wkompilowany
  w bundle, a `eas update` buduje nowy bundle (krok 0 skilla `wydanie`)
- **co przeniesienie zostawia otwarte do 4.0.0**: (1) luka CSP z docblocka `staticSite.ts` -
  strona ma luźniejszą politykę niż panel WYŁĄCZNIE dlatego, że dzielą origin, a rozdział
  hostów był jej jedynym domknięciem; (2) **linki do kart arkusza zapisane w dzienniku
  eksportu niosą adres BEZWZGLĘDNY** (`dayExporter` zapisuje `sheetUrl` złożony
  z `PUBLIC_BASE_URL`), więc po zmianie domeny stary host musi odpowiadać albo linki trzeba
  przepisać - rozstrzygnięcie należy do 4.0.0

## Własna domena WYKONANA W KODZIE (issue #124, 2026-09-16, gałąź `feature-124-wlasna-domena`)
Domena kupiona 2026-09-16, a hostowana instancja 2.0.0 nie miała jeszcze użytkowników -
decyzja właściciela: „możemy bezpiecznie zmienić adres". Przeniesienie zeszło więc z 4.0.0
i odbyło się BEZ żadnej zgodności wstecz: bez trzymania domeny Railway, bez przepisywania
linków do kart, bez czekania z adresem w `eas.json`. Reguły obowiązujące odtąd:
- **ROZDZIAŁ HOSTÓW ROBI SERWER, NIE DNS**: dwie domeny wskazujące na jedną usługę podają
  wszystko pod obydwoma, więc `ninerdeck.pl/admin/` otwierałoby panel na origin strony
  z `'unsafe-inline'` - luka CSP z docblocka `staticSite.ts` NIE zamyka się sama.
  Zamyka ją `server/src/http/hostSplit.ts`: `PUBLIC_SITE_URL` (`https://ninerdeck.pl`)
  obok `PUBLIC_BASE_URL` (`https://app.ninerdeck.pl`) włącza hook `onRequest` na całej
  instancji (przed trasami, jak strażnik CSRF). Host STRONY: pliki strony przechodzą,
  `GET /admin*` → 301 na host aplikacji, API i trasy telefonu → **404, nie 401** (401
  potwierdzałoby, że trasa istnieje - ta sama zasada, co przy cudzym klubie). KAŻDY INNY
  host (aplikacja, domena hostingu, localhost): samo `/` → 301 na `/admin/` (korzeń hosta
  aplikacji jest wejściem PANELU - kto wpisuje `app.ninerdeck.pl`, szuka panelu, nie
  landingu; decyzja właściciela 2026-09-17; przekierowanie WZGLĘDNE, więc zostaje na tym
  hoście, także na domenie hostingu), inne pliki strony (`/pobierz/`, `/dokumentacja/…`)
  → 301 na stronę, reszta przechodzi. `/health` przechodzi wszędzie (sonda hostingu nie
  zna własnej domeny)
- **rodzaj trasy czyta się z WZORCA routera** (`request.routeOptions.url`: `/*` strona,
  `/admin` + `/admin/*` panel), nie z prefiksu ścieżki - `/admin/api/…` zaczyna się od
  `/admin/`, a jest API. Hook nie rejestruje tras, więc `tenantIsolation.test.ts` go nie
  widzi; własne testy: `server/test/hostSplit.test.ts` (czysta tabela + `inject` z `Host`)
- **bez `PUBLIC_SITE_URL` jeden host, jak dotąd** (dev, testy). `PUBLIC_SITE_URL` bez
  `PUBLIC_BASE_URL` albo o tym samym hoście = ODMOWA STARTU (`hostSplitFrom` rzuca):
  połowiczny rozdział wyglądałby jak działający serwer
- **`PUBLIC_BASE_URL` znaczy odtąd „adres PANELU I API"**, nie „adres serwera widziany
  z telefonu": to host aplikacji jest bazą linków do kart, bo `/sheets/…` na hoście strony
  nie istnieje
- **`eas update` NIE CZYTA `build.<profil>.env` z `eas.json`** - to pole obsługuje tylko
  `eas build`. Do #124 `npm run update:prod` brało `EXPO_PUBLIC_*` z lokalnego `app/.env`
  (adres serwera ZAKOMENTOWANY, klient Google ze starego projektu) i wysłałoby telefonom
  bundle z fallbackiem `apiBaseUrl()` na `http://localhost:3000`. Odtąd skrypt idzie przez
  `app/scripts/eas-update.js`: czyta profil `production` z `eas.json`, odmawia bez adresu
  `https://` i bez klienta Google (`eas-profile-env.js`, z testami) i wstrzykuje komplet do
  środowiska `eas-cli` - zmienne procesu wygrywają z plikami `.env` Expo. `eas.json` jest
  JEDYNYM źródłem adresu dla builda I OTA; `app/.env` służy wyłącznie Metro. Skrypt podaje
  też `--platform android` (pierwsze OTA 2026-09-17 padło bez tego na eksporcie web:
  projekt nie ma `react-native-web`, a `eas update` domyślnie eksportuje wszystkie platformy)
- **adres produkcyjny aplikacji: `https://app.ninerdeck.pl`** (`eas.json`, przybite
  testem `easProfileEnv.test.ts`). Zmiana adresu = OTA (bundle), nie nowy APK
- po stronie właściciela: dwie domeny na usłudze Railway (CNAME + TXT dla każdej, apex
  przez CNAME flattening/ALIAS albo Cloudflare z SSL „Full"; Hobby = limit 2 domen),
  zmienne `PUBLIC_SITE_URL`/`PUBLIC_BASE_URL`, w Google Cloud origin
  `https://app.ninerdeck.pl` w kliencie Web, `ninerdeck.pl` w Authorized domains
  (Search Console) i polityka pod `https://ninerdeck.pl/prywatnosc.html` - komplet
  w README „Wdrożenie: Railway"

## Wariant deweloperski aplikacji = OSOBNY PAKIET (2026-09-17, gałąź `feature-wariant-dev`)
Prośba właściciela po własnej domenie: testować aplikację lokalnie na nowej instancji i mieć
osobny dev build do pracy z Expo. Reguły obowiązujące odtąd:
- **`app.json` jest bazą, `app.config.js` ją przestawia**: przy `APP_VARIANT=development`
  nazwa „Ninerdeck Dev", pakiet `com.ninerdeck.app.dev`, schemat adresu równy pakietowi
  (`app/scripts/app-variant.js` - czysty CommonJS z testami, bo czytają go dwa miejsca).
  Wersja, `versionCode`, ikony i projekt EAS BEZ ZMIAN - to ta sama aplikacja pod innym
  adresem. Każda inna wartość zmiennej (albo brak) znaczy produkcję
- **dlaczego osobny pakiet**: dev build z pakietem produkcyjnym zastępowałby na telefonie APK
  z produkcji, a zapisane w nim tokeny produkcji jechałyby do lokalnego serwera. Koszt:
  poświadczenia EAS są PER PAKIET, więc dev build ma własny klucz, własny SHA-1 i WŁASNY
  klient OAuth Android w Google Cloud - jego identyfikator stoi w `app/.env` (Metro)
  i w `GOOGLE_ANDROID_CLIENT_ID` lokalnego serwera, NIGDY w `eas.json`
- **kto ustawia `APP_VARIANT`**: `app/.env` (Metro, `expo run:android`), profil `development`
  w `eas.json` (build) i JAWNIE `production` w profilu produkcyjnym - `eas update` eksportuje
  na komputerze, gdzie `.env` mówi `development`, a zmienne procesu wygrywają. Pilnuje tego
  `easProfileEnv.test.ts`. Profil `development` NIE niesie adresu serwera ani klienta
  Google: dev client bierze JS z Metro, więc te wartości i tak idą z `app/.env`
- **dev build to nasza binarka, ale NAZWANA**: `ownRelease` oddaje `dev: true`, a napis
  wersji brzmi „2.0.0 (build 3) · dev" (ekran 13, zgłoszenie błędu, kolumna w panelu).
  Wzorzec pakietu dev `nativeRelease.ts` liczy z tego samego helpera, nie
  z `Constants.expoConfig` - manifest z Metro odzwierciedla `.env` komputera, nie binarkę
- **Expo Go nie jest drogą testów**: nie zna pakietu, do którego Google przypina logowanie,
  ani usługi GPS w tle. Lokalnego Android SDK w projekcie nie ma, więc `npm run build:dev`
  (EAS) jest jedyną drogą do dev builda; procedura krok po kroku w README „Dev build aplikacji"
- **lokalne środowisko = nowa instancja od zera** (ta sama decyzja, co §10 wielofirmowości):
  baza `ninerdeck` w kontenerze `ninerdeck-pg`, klient Web z NOWEGO projektu Google (ten
  sam, którym loguje się `app.ninerdeck.pl`), seed superadministratora. Komplet zmiennych
  opisują `.env.example` obu stron; dev build nie jest wydaniem (skill `wydanie`)

## Staging ODRZUCONY (issue #155, decyzja właściciela 2026-09-22)
Środowisko staging na Railway (własna baza, domeny `staging`/`app-staging`, poczta)
zostało postawione 2026-09-22 i **tego samego dnia wycofane w całości**: usługa, baza,
domeny, runbook i `npm run update:stg`. Powód właściciela: „staging i tak odpalam
lokalnie w expo, wtedy też mógłbym startować lokalny serwer API oraz docker z bazą" -
czyli codzienna praca sprawdza się lokalnie, a drugie hostowane środowisko kosztowało
pieniądze i czas, nie dając nic ponad to.
- **nie proponuj staging ponownie bez nowego powodu.** Rachunek jest znany: lokalne
  środowisko NIE pokazuje czterech rzeczy - obrazu Dockera (panel i strona budują się
  tylko tam), rozdziału hostów i rozdziału origin CSP (`hostSplit.ts` przy jednym haście
  w ogóle się nie wykonuje), poczty, która naprawdę wychodzi (`MAIL_PROVIDER=log` dowodzi
  tokenu, nie doręczenia) oraz migracji na hostowanej bazie. Jeśli któraś z nich zacznie
  boleć, to jest argument do rozmowy - a nie powód do cichego postawienia środowiska
- **co ZOSTAŁO z tej pracy, bo nie dotyczy staging**: wariant dev builda
  (`com.ninerdeck.app.dev` obok produkcyjnego APK - sekcja wyżej), wyprowadzanie gałęzi
  OTA z KANAŁU profilu (`eas-profile-env.js`) oraz cytowanie argumentów powłoki
  w runnerze OTA (`shell-args.js`, PR #192) - ta ostatnia poprawka dotyczyła także
  `update:prod`, czyli wydań dla pilotów
- **dwa fakty o produkcji przeniesione do README** (sekcja „Wdrożenie: Railway"): Postgres
  musi umieć `CREATE EXTENSION btree_gist` (migracja 11), a adres w `MAIL_FROM` musi stać
  na domenie zweryfikowanej u dostawcy poczty - inaczej „Nie pamiętam hasła" kończy się
  błędem 500, a list nigdy nie wychodzi

## Obieg gałęzi (git-flow od 2026-09-08, milestone „Wielofirmowość + SaaS 2.0.0")
```
feature-… → develop → ninerdeck_x_x_x → main        (wydanie planowe)
hotfix-…  → main → develop                          (poprawka dla obecnych telefonów)
```
- **`develop` = gałąź integracyjna**. Od milestone 3 leży na niej niedokończona
  przebudowa wielofirmowa, więc **nigdy nie buduje się z niej APK ani nie wysyła OTA** -
  pilot dostałby pół przebudowy, przy OTA bez reinstalacji i bez ostrzeżenia
- **`ninerdeck_x_x_x` = gałąź wydaniowa** o nazwie z numerem wersji: dostaje zawartość
  `develop`, gdy zakres milestone jest domknięty, i odtąd przyjmuje wyłącznie
  stabilizację (podbicie wersji, changelog, poprawki z testów wydania). Build produkcyjny
  robi się z NIEJ. Gałęzie wydaniowe **ZOSTAJĄ po wydaniu** jako zapis każdej wersji:
  `ninerdeck_1_0_0` = pierwsze wydanie (stan `main` z 2026-09-08, binarka „1.1.0
  (build 2)"), `ninerdeck_2_0_0` = gałąź milestone 3 (issue #97–#106)
- **`main` = produkcja**: merge gałęzi wydaniowej wdraża serwer, panel i stronę (Railway).
  Zaraz po nim `main` → `develop`, żeby wersja, changelog i link do pobrania nie zginęły
- **poprawka dla telefonów, które JUŻ mają aplikację, NIE idzie przez `develop`**:
  gałąź `hotfix-…` od `main`, PR do `main`, OTA z checkoutu `main`, potem `main` → `develop`
- procedurę wydania (OTA czy APK, wersja, changelog, APK na stronie) prowadzi skill
  `wydanie` (`.claude/skills/wydanie/SKILL.md`) - tam sekcja „Gałęzie" z tym samym obiegiem

## Wydania, changelog i strona publiczna (2026-09-06; przeprowadzka 2026-09-07)
Wchodzimy w fazę testów i wersjonowania. Punkt wejścia dla pilotów, testerów i klubów:
landing sprzedażowy, `pobierz/` = adres APK, `wydania/` = changelog,
`dokumentacja/` = podręcznik, polityka prywatności i regulamin (wymagane przez ekran
zgody Google).
**STRONA STOI NA TYM SAMYM SERWERZE, CO PANEL I API** (decyzja właściciela 2026-09-07,
odwraca GitHub Pages): źródła w `site/src/`, budowanie `npm run site`
(`site/tools/build.mjs`), wynik `site/dist` serwowany pod `/` przez
`server/src/http/routes/site/staticSite.ts`; panel zostaje pod `/admin/`, API pod
`/admin/api/`. Obraz buduje stronę własnym etapem (`site-build` w `Dockerfile`,
bez `npm ci` - skrypty jadą na samej stdlib node).
- **osobnego repozytorium strony JUŻ NIE MA** (`tomaszklag/tomaszklag.github.io`).
  Leżało w nim 2,9 MB, z czego **2,1 MB to 71 z 75 makiet `design/` skopiowanych
  bajt w bajt** plus wygenerowany podręcznik - a repozytorium aplikacji jest publiczne,
  więc drugie niczego nie chroniło; było wyłącznie miejscem na wynik renderowania.
  Decyzje i układ katalogów: `site/README.md`
- **każda treść ma JEDNO źródło i czyta się je tam, gdzie leży**: `docs/CHANGELOG.md`
  → wydania, `docs/podrecznik/` → dokumentacja, `design/*.html` → żywe ekrany.
  `site/dist` jest w .gitignore, więc kopii nie ma nigdzie
- **`site/` NIE JEST workspace'em npm** i to jest decyzja: skrypty nie mają ani jednej
  zależności, a dopisanie katalogu do `workspaces` ruszyłoby lockfile i obie linijki
  `npm ci -w …` w `Dockerfile` - za nic
- **wszystkie odnośniki strony są WZGLĘDNE** i to dzięki temu przeprowadzka nie tknęła
  ani jednej strony treści: ten sam katalog działał pod `/uzaero/` na Pages i działa
  pod `/`. Nowa strona ma trzymać tę własność
- **APK zostaje na GitHub Releases**, nie na hostingu: to pliki po kilkadziesiąt MB,
  a Railway liczy transfer
- **CSP strony jest LUŹNIEJSZA niż panelu w dwóch miejscach** (`script-src`
  `'unsafe-inline'` - makiety mają skrypty w treści pliku; fonty z Google). Strona nie ma
  sesji ani pola do wpisywania, ale stoi na TYM SAMYM origin co panel, więc właściwym
  domknięciem jest osobna nazwa hosta po podpięciu własnej domeny (`ninerdeck.pl` strona,
  `app.ninerdeck.pl` panel i API) - powód stoi w docblocku `staticSite.ts`
- **`docs/CHANGELOG.md` jest ŹRÓDŁEM strony wydań** - pisany dla pilotów i klubów językiem
  korzyści, bez nazw plików i identyfikatorów. Sekcja „W przygotowaniu" rośnie razem
  z PR-ami (każdy PR, który zmienia coś widocznego, dopisuje punkt); przy buildzie
  produkcyjnym dostaje nagłówek `## <wersja> (build <N>) · <data>`, a nad nią powstaje
  pusta „W przygotowaniu". Format parsuje `site/tools/render-changelog.mjs`
  (`##` wydanie, `>` streszczenie, `###` grupy, `-` punkty, komentarze HTML pomijane)
- **wersjonowanie**: `version` w `app/app.json` podnosimy przy wydaniu; numer builda to
  `appBuildVersion` z EAS (build 1 = 2026-08-26, commit `3b7653e`)
- **rytm wydania**: bump wersji → `eas build --profile production` →
  `node site/tools/update-download.mjs [--release]` (podmienia cel przycisku w ŹRÓDLE,
  `site/src/pobierz/index.html`) → `npm run site` na podgląd → push. Push do gałęzi
  wdrożeniowej publikuje aplikację i stronę JEDNYM obrazem - drugiego repozytorium
  ani drugiego wdrożenia nie ma.
  **Artefakty EAS wygasają po kilku tygodniach** (build z 2026-08-16 zwracał 404 już
  2026-09-06), więc na dłużej `--release`: APK jako GitHub Release w `tomaszklag/uz_aero`
  pod trwałym `releases/latest/download/ninerdeck.apk`
- **AKTUALIZACJE OTA (EAS Update) od wydania 1.1.0** - `expo-updates` w aplikacji,
  kanały `production`/`development` w `eas.json`. Odtąd „wydanie" znaczy DWIE różne
  rzeczy, a pomylenie ich kosztuje reinstalację u wszystkich testerów:
  - **`npm run update:prod -- -m "…"`** dowozi JS i assety do JUŻ ZAINSTALOWANYCH
    aplikacji: ekrany, teksty, arkusze, reguły domeny, `packages/*`, a nawet zmianę
    `EXPO_PUBLIC_API_URL` (te zmienne są wkompilowane w bundle, a `eas update` buduje
    nowy bundle). Bez builda i bez rozsyłania APK;
  - **`npm run build:prod`** jest konieczny przy zmianie NATYWNEJ: nowy moduł, inne
    uprawnienia, `scheme`, pakiet. Wtedy podbija się `version` I `android.versionCode`
    w `app/app.json` (`appVersionSource: local`, więc EAS czyta je stamtąd; „build N"
    w changelogu to `versionCode`);
  - **`runtimeVersion` = `appVersion`, a NIE `fingerprint`** (2026-09-07). Fingerprint
    liczy odcisk warstwy natywnej i sam odcinałby niepasujące aktualizacje - ładniejsze
    w teorii, ale w TYM monorepo nie działa: odcisk powstaje z zawartości drzewa,
    a **180 ze 190 jego źródeł to pliki z hoistowanego `node_modules`** wspólnego dla
    czterech workspace'ów. Serwer budujący EAS odtwarza ten katalog po swojemu, odciski
    się rozjeżdżają i build pada na „Runtime version calculated on local machine not
    equal to runtime version calculated during build". Sprawdzone eksperymentalnie -
    `app/.env` i inne pliki lokalne nie mają z tym nic wspólnego;
  - **stąd twarda reguła: `version` PODNOSI SIĘ WYŁĄCZNIE PRZY NOWYM APK.** Przy
    `appVersion` numer wersji JEST kluczem aktualizacji, więc podbicie go bez builda
    osierociłoby wszystkie zainstalowane aplikacje (aktualizacja poszłaby do wersji,
    której nikt nie ma). Odwrotny błąd jest groźniejszy: moduł natywny dołożony bez
    nowego APK dowozi starym telefonom JS wymagający nieobecnego kodu i je wywraca.
    Fingerprint bronił przed tym sam; `appVersion` polega na dyscyplinie i dlatego
    decyzja „OTA czy APK" stoi na początku skilla `wydanie`, a nie na końcu;
  - **`fallbackToCacheTimeout: 0` stoi JAWNIE**: start aplikacji nigdy nie czeka na
    sieć (§4.1 - brak sieci NIGDY nie blokuje pracy pilota). Aktualizacja pobiera się
    w tle i wchodzi przy NASTĘPNYM uruchomieniu, więc pilot bez zasięgu nie zauważy nic;
  - **OTA potrafi zepsuć aplikację zdalnie.** Jest `eas update:rollback`, ale w narzędziu
    używanym w locie aktualizacje wypuszcza się świadomie, nie przy każdym commicie;
  - **wersja binarki PRZESTAŁA identyfikować działający kod**: `nativeRelease.ts` czyta
    PAKIET, więc jedna binarka „1.1.0 (build 2)" obsługuje wiele wydań JS. Dlatego
    zgłoszenie błędu niesie `updateId` z `infrastructure/release/otaUpdate.ts` (JEDYNY
    import `expo-updates`, exact-list w teście architektury - ta sama reguła, co przy
    `expo-application`). Na kartę „O aplikacji" to NIE wchodzi: identyfikator bundle'a
    jest opisem wewnętrznej budowy aplikacji, a takie napisy issue #72 z ekranów wyrzuciło
- **plan wydań w tym samym pliku**: sekcja `## Plan wydań` z kamieniami milowymi
  `### <wersja> · <termin>` i punktami `- [x]` (gotowe) / `- [~]` (w toku) / `- [ ]`
  (w planach). Pierwszy kamień milowy = następne wydanie: jego wersja i termin trafiają na
  tablicę stanu i do nagłówka „W przygotowaniu". Terminy są orientacyjne i podaje je
  właściciel - nie zmyślamy dat
- **`docs/podrecznik/` jest ŹRÓDŁEM modułu „Dokumentacja"** (`/dokumentacja/`):
  `spis.md` (rozdziały i kolejność stron) + `<slug>.md` na stronę; renderuje
  `site/tools/render-docs.mjs` (drzewko, wyszukiwarka w przeglądarce, spis „na tej
  stronie", żywe ekrany makiet przez dyrektywy `@screen` i `@panel`). Piszemy dla pilota i administratora, który szuka
  pomocy: jak działa funkcja i jakie są założenia, ale językiem biznesowym - bez nazw
  plików, identyfikatorów, numerów issue i żargonu (format i reguły: komentarz w `spis.md`).
  Zmiana ekranu w PR = zmiana odpowiedniej strony podręcznika
- **ŻYWY EKRAN STOI PRZY SEKCJI, KTÓREJ DOTYCZY** (uwaga użytkownika 2026-09-07:
  „w dokumentacji brakuje screenów, mamy przecież makiety"). Galeria hurtem na górze
  strony nie liczy się jako ilustracja - dyrektywa `@screen` idzie pod akapit, krok
  formularza albo arkusz, który opisuje. Limit: 5 linii i 10 ekranów na stronę (makieta
  waży ~30 KB i ładuje się przy przewijaniu). Strony panelu mają własną dyrektywę
  `@panel` (ramka okna przeglądarki, makiety z `design/panel/`) - odkąd panel wrócił
  do design-first (`docs/panel-2.0.md` §3.7), zdanie „panel makiet NIE MA" jest
  nieaktualne. **`design/panel/` MUSI być zacommitowane**: obraz buduje stronę
  z repozytorium, więc brakująca makieta `@panel` wywraca build, a nie stronę
- **strona pobierania i landing mają jeden komponent przycisku** (`.dl`
  w `site/src/site.css`);
  `update-download.mjs` dalej podmienia `#apk-link` i `#apk-meta` - te znaczniki siedzą
  w przycisku, nie ruszać ich

## Rezerwacja samolotu i kalendarz floty (3.0.0, issue #145, gałąź `feature-145-projekt-rezerwacji`)
Pierwsza funkcja Ninerdeck, która nie opisuje przeszłości, tylko PRZYSZŁOŚĆ. Decyzje,
model danych, API i odrzucone warianty: **`docs/rezerwacje.md`**; epiki R-A…R-W =
issue #157–#163, workflow akceptacji i push = milestone 3.1.0 (#164–#169).

- **REZERWACJA NIE JEST ZDARZENIEM REJESTRU** (§2.1) i to jest decyzja, z której wynika
  reszta. Rejestr ma JEDNEGO piszącego, jest append-only i opisuje FAKTY; rezerwacja jest
  przedmiotem konkurencji dwóch pilotów, jest mutowalna i opisuje ZAMIAR. Rzecz, o którą
  się konkuruje, potrzebuje arbitra - a arbiter musi być JEDEN, więc **zapis wymaga
  sieci**, dokładnie jak przełączenie i dołączenie do klubu. Wysyłka przez outbox
  znaczyłaby „twój slot przepadł" godzinę po tym, jak pilot go zarezerwował.
- **CAŁY MODUŁ REZERWACJI WYMAGA SIECI** (§2.2, decyzja właściciela 2026-09-20 -
  ODWRACA „odczyt działa z cache"): *„rezerwację raczej robimy w domu, gdzie zasięg
  jest"*. Cache’u zajętości w SQLite NIE MA i nie wolno go dorobić po cichu - ani
  pobierania z ETagiem, ani adnotacji wieku, ani wariantów offline z ostatnią migawką.
  To jedyny moduł z takim rozstrzygnięciem i czyta się je RAZEM z §4.1 („brak sieci
  nigdy nie blokuje pracy pilota"): tamta reguła broni PRACY W LOCIE - rejestru, czasów,
  odczytów, zdania samolotu - czyli tego, czego nikt poza pilotem nie odtworzy.
  Rezerwacja jest UMOWĄ MIĘDZY LUDŹMI składaną przy biurku, nie pomiarem z kabiny.
  Cena jest znana i zapisana: bez zasięgu przy samolocie nie ma karty „Twoja
  rezerwacja", kroki przejęcia nie wypełniają się rezerwacją, a ostrzeżenie o cudzym
  terminie nie pada. Wszystkie trzy degradują się łagodnie, bo żadna nie jest warunkiem
  lotu (§2.3). Zmiana tego wymaga nowej decyzji, nie cache’u dopisanego przy okazji.
- **REZERWACJA NIE WARUNKUJE LOTU** (§2.3, decyzja właściciela): „ROZPOCZNIJ LOT" działa
  jak dziś, także bez zasięgu i bez rezerwacji. Rezerwacja wypełnia kroki przejęcia
  i OSTRZEGA przy cudzej kolizji - nigdy nie blokuje.
- **NAKŁADANIE WYKLUCZA BAZA, NIE KOD** (§3.2): `EXCLUDE USING gist` na `tstzrange`
  z zakresem `[)` (zetknięcie co do minuty przechodzi, jak przy operacjach). Rezerwacje
  i wyłączenia maszyny z użytku siedzą w JEDNEJ tabeli `bookings` z dyskryminatorem
  `kind` właśnie dlatego, że jedno ograniczenie ma objąć oba rodzaje naraz.
- **KALENDARZ MÓWI CZASEM KLUBU, REJESTR ZOSTAJE W UTC** (§6): reguła „UTC wszędzie"
  broni POMIARÓW, a rezerwacja jest umową między ludźmi o godzinie. Siatkę rysuje strefa
  KLUBU (`organizations.timezone`), czas lokalny urządzenia dochodzi adnotacją TYLKO przy
  różnicy stref.
- **NAWIGACJA: PULPIT · KALENDARZ · HISTORIA** (§9.1). Ekran startowy przestał być „Mój
  dzień": Pulpit niesie SUMY doby, najbliższą rezerwację i akcje, a listy operacji NIE MA
  - kafelki i korekta w oknie 24 h przeniosły się do Historii, która obejmuje odtąd także
  dziś (odejście od issue #35). **KOKPIT ZOSTAJE MODALNY**: zakładek w nim nie ma, flow
  lotu żyje NAD nimi, a zakładka wyprowadzająca z kokpitu byłaby skasowaniem modalności.
- **HISTORIA: dzień nagłówkiem, operacje zwartymi wierszami** (makieta `24`, nie `12`).
  Ikona po prawej niesie skutek tapnięcia (ołówek - okno korekty, oko - podgląd po oknie).
  Domyślnie widać tylko to, co można poprawić; archiwum stoi pod przyciskiem.
- **GRANICA ZWIJANIA**: zwijamy to, czego pilot NIE SZUKA, wchodząc na ekran. Dlatego
  archiwum w historii jest zwinięte, a maszyny wyłączone z użytku w kalendarzu ZOSTAJĄ
  widoczne - tam schowana byłaby odpowiedź na „czemu nie ma czym latać".
- **PULPIT NIE POWTARZA KALENDARZA**: paska zajętości floty na nim NIE MA, bo zakładka
  Kalendarz stoi widoczna przez cały czas.
- **KONTROLKA POMOCNICZA NIE DOSTAJE WAGI TREŚCI**: chip filtra maszyn jest cichy (ikona
  lejka i liczba w tonie podpisu), a zawężenie niesie SAMA LICZBA („6 z 12" kontra „12").
  Zieleń i odwrócone zaznaczenie odpadły jako dwa kolejne kroki tej samej pomyłki - zieleń
  znaczy tu stan w normie albo akcję główną, a odwrócenie jest najmocniejszym kontrastem
  na ekranie.
- **MAKIETY 3.0 MAJĄ NOWE NUMERY** (20-24), a `01` i `12` zostają specyfikacją linii 2.x
  aż do wydania - podręcznik osadza rodzinę `01` w 13 miejscach i opisuje wersję, którą
  piloci mają w telefonach. Plan przejścia i los tych plików (archiwum w miejscu, jak
  `design/admin/`): `docs/rezerwacje.md` §9.1a.
- **PANEL PATRZY SZERZEJ NIŻ TELEFON**: na telefonie osią kalendarza jest JEDNA DOBA całej
  floty („czym polecę dzisiaj"), w panelu maszyny × DNI („kto ma zaplanowane loty, kiedy
  wcisnąć przegląd"). Ta sama zajętość, dwa pytania, dwa kadry. Komponenty osi mieszkają
  w `admin/src/styles/components/calendar.css` i idą do makiet generatorem `panel:css`.
- **KONFIGURACJĘ KALENDARZA KLUBU USTAWIA MODUŁ ORGANIZACJE** (karta klubu: lotnisko
  macierzyste i strefa; dołożone przy wydaniu, R-W). Do 2026-09-21 `organizations.home_icao`
  było wszędzie WYŁĄCZNIE do odczytu, więc doba lotna schodziła u każdego klubu do
  domyślnych 06-21, choć changelog obiecywał wschód i zachód słońca - kolumna z migracji
  bez drogi zapisu jest funkcją, której nie ma. **Kod spoza KATALOGU lotnisk to ODMOWA**
  (`400 invalid` z polem, nie wzorzec czterech liter: `ZZZZ` przeszłoby, a klub dostałby
  okno domyślne bez słowa dlaczego), **nieznana strefa też** - `safeZone` RATUJE ODCZYT,
  więc do walidacji wpisu służy osobne `isKnownZone`. Puste lotnisko jest dozwolone
  i znaczy „wyczyść": stąd `homeIcao?: string | null` o TRZECH stanach (pominięte /
  napis / `null`) i `CASE` zamiast `COALESCE` w SQL-u. Listę stref oddaje PRZEGLĄDARKA
  (`Intl.supportedValuesOf`), a nie nasza tablica; strefa klubu spoza tej listy dokleja
  się siłą, inaczej `<select>` po cichu przestawiłby konfigurację na pierwszą pozycję.
## Rezerwacje 3.0.0 - epik R-B: serwer, model zajętości i API (issue #158, 2026-09-19)
Migracja 11 + domena + porty + trasy telefonu i panelu + zadanie okresowe. Decyzje
i odstępstwa: `docs/rezerwacje.md` §3.5, §6.1. Reguły obowiązujące odtąd:
- **NAKŁADANIE ODBIJA BAZA, A ADAPTER TŁUMACZY JEJ ODMOWĘ**: `bookings_no_overlap` rzuca
  `23P01`, `PgBookingsRepo` zamienia to na `slot_taken` i DOCIĄGA kolidujący wiersz -
  ekran ma powiedzieć, CO stoi w tym czasie, a nie samo „nie da się". Zapis idzie
  w **`SAVEPOINT`** i to nie jest ostrożność: odmowa ograniczenia unieważnia CAŁĄ
  transakcję, więc bez punktu zapisu ani dociągnięcie kolizji, ani ślad audytu panelu
  nie miałyby jak powstać
- **KLUCZ WYKLUCZENIA NIE NIESIE `org_id`**: egzemplarz należy do jednego klubu (klucz
  obcy `aircraft.org_id`), więc klub niczego by nie zawęził, a sugerowałby, że ten sam
  płatowiec da się zająć dwa razy pod dwiema nazwami
- **`aircraft_not_found` JEST OSOBNĄ ODMOWĄ OD `aircraft_disabled`** i kosztowała dziurę:
  wyłączenie z użytku nie pyta o stan służby (przegląd na maszynie stojącej w serwisie
  to norma), więc razem ze stanem przestawało sprawdzać ISTNIENIE - i panel klubu A
  zakładał blokadę na maszynie klubu B, odbierając jej właścicielowi własny samolot.
  Złapał to `tenantIsolation.test.ts`, nie przegląd kodu. Jeden kod na „skasowana"
  i „cudza", bo odróżnienie ich potwierdzałoby istnienie cudzego egzemplarza
- **`GET /bookings` ODDAJE GRANICE DÓB, NIE OFFSETY** (§6.1) - i to jest odpowiedź na
  pytanie B0 o `Intl` na telefonie, NIEZALEŻNA od wyniku sondy: telefon liczy położenie
  na siatce, godzinę z formularza i podpis osi samym odejmowaniem, a doba zmiany czasu
  wychodzi poprawnie sama, bo jest krótsza albo dłuższa. Offset per doba kłamałby
  w takim dniu w którejś połowie, bo offsety są tam DWA (`domain/clubTime.ts`)
- **REGUŁA TERMINU STOI NA JEGO KOŃCU, NIE POCZĄTKU**: rezerwacja zaczynająca się
  kwadrans temu jest normalna (pilot bierze maszynę TERAZ i wpisuje, do której
  godziny); odrzucamy dopiero termin, który CAŁY minął
- **ZAPIS Z TELEFONU NIE MA ŚLADU W AUDYCIE, Z PANELU MA**: rezerwacja własna to zwykła
  praca pilota, jak wpisanie lotu. Trzy akcje panelu (`booking.create`, `booking.cancel`,
  `booking.block`) dotyczą CUDZYCH spraw; odwołanie cudzej wymaga POWODU (P4)
- **NOWA ZDOLNOŚĆ `reservations.manage`** (władza nad cudzym planem), a wyłączenie
  z użytku idzie na istniejące `fleet.manage` - to stan MASZYNY w czasie
- **`session_claim.reservationId` JEST JEDYNYM ZETKNIĘCIEM REJESTRU Z REZERWACJĄ**
  i tylko w jedną stronę. Nieznany identyfikator NIE odrzuca paczki: rezerwacja nie
  jest warunkiem lotu (§2.3), a pilot mógł wejść w lot z rezerwacji odwołanej
  w międzyczasie. Domena nie robi z tym polem NIC
- **PIERWSZY WĄTEK OKRESOWY W TYM SERWERZE** (`BookingReleaseJob`, co 5 min): slot
  zwalnia się sam po godzinie bez przejęcia maszyny. `setInterval`, nie kolejka - jedna
  instancja (§8.8 architektury); wyłączalny `BOOKING_RELEASE=0`, bo przebieg zmienia
  dane w tle i testy nie mają go dostać przypadkiem. Status `released`, nie `cancelled`,
  i BEZ powodu: `close_reason` niesie zdanie CZŁOWIEKA, a tu upłynął czas
- **PGlite WYMAGA JAWNEGO `btree_gist`** w konstruktorze (`server/test/pglite.ts`) -
  bez tego `CREATE EXTENSION` odmawia i cała migracja 11 nie wchodzi
- **czego epik R-B świadomie NIE ROBI**: `GET /bookings/suggestions` (czeka na
  `packages/domain/src/booking/slots.ts` z epiku R-C, #159) i okna doby lotnej
  z efemeryd - `organizations.home_icao` już jest, ale nikt go jeszcze nie czyta

## Rezerwacje 3.0.0 - epik R-C: sugestie slotów i doba lotna (issue #159, 2026-09-19)
Czysta domena planowania w `packages/domain/src/booking/` - ten sam kod liczy sugestie
na telefonie (OFFLINE, z cache’owanych zajętości) i na serwerze. Decyzje:
`docs/rezerwacje.md` §7.2; przepis „nowa funkcja planowania": `docs/architektura-kodu.md` §7.
- **CZTERY PLIKI, KAŻDY Z JEDNYM PYTANIEM**: `solar.ts` (kiedy wschodzi Słońce - NOAA,
  zero zależności), `dayWindow.ts` (granice doby lotnej - składa efemerydy z progami),
  `slots.ts` (które sloty i DLACZEGO), `policy.ts` (wszystkie liczby, DO KALIBRACJI)
- **`slots.ts` DOSTAJE OKNO ARGUMENTEM i o jego pochodzeniu nie wie nic** - ta sama
  granica, co przy kopercie śladu niosącej samą geometrię (issue #47). Gdy przyjdą loty
  nocne (NVFR, poza 3.0.0), zmienia się `dayWindow.ts`, a upakowanie dnia zostaje
- **KANDYDACI NIE NAKŁADAJĄ SIĘ NAWZAJEM** i to jest własność, nie optymalizacja: bez
  niej pusty dzień oddawał cztery propozycje odległe o kwadrans, czyli jedną propozycję
  powiedzianą cztery razy. Pilot ma dostać WYBÓR, a nie listę zaokrągleń
- **PRZYLEGANIE NIE MUSI TRAFIĆ W ZIARNO**: rezerwacja kończąca się o 10:07 daje
  przyleganie o 10:07, a siatka co kwadrans by je minęła - czyli zgubiłaby dokładnie ten
  slot, o który w całej regule chodzi. Oba kandydaty z krawędzi dziury wchodzą JAWNIE
- **GRANICA DNIA NIE JEST PRZYLEGANIEM**: świt i zmrok to ściana, nie sąsiad -
  premiowanie ich kazałoby proponować lot o pierwszej minucie po wschodzie
- **RELACJA PROGÓW NIESIE REGUŁĘ**: kara za martwą resztkę (1,5) jest WIĘKSZA niż premia
  za jedno przyleganie (1), więc slot zostawiający pół godziny na nic przegrywa ze slotem
  luzem. Zmieniasz którąś liczbę - sprawdź, czy ta nierówność zostaje
- **WYNIK NIESIE POWÓD** (`SlotSuggestion.reason`), bo ekran ma umieć napisać, dlaczego
  proponuje właśnie to. Pusta lista NIE JEST błędem - dzień bywa pełny
- **CHWILA BIEŻĄCA IDZIE Z PORTU `Clock`, NIGDY Z `Date.now()`**: planowanie odcina to,
  co minęło, więc „teraz" jest WEJŚCIEM rachunku, a wejście z zegara systemowego jest
  niesprawdzalne testem. Ta usterka powstała przy tym epiku i złapał ją test izolacji
- **TEST EFEMERYD KOTWICZY SIĘ NA CZYMŚ NIEZALEŻNIE WERYFIKOWALNYM** (południe słoneczne
  z długości geograficznej, długość dnia z kąta godzinnego) - asercja przepisana z tej
  samej formuły, którą testuje, jest kołem w powietrzu. Pierwsza wersja testu padła na
  wartościach „z pamięci", które okazały się wewnętrznie sprzeczne z geometrią
- **HORYZONTU NIE MA** (P7, decyzja właściciela): lista zadań #159 wymieniała go w C3, bo
  powstała przed tą decyzją. W 3.0.0 nie ma limitów horyzontu ani liczby rezerwacji
- **KLUB BEZ LOTNISKA MACIERZYSTEGO** dostaje okno domyślne 06-21, a odpowiedź MÓWI, że
  jest domyślne (`window.basis`) - inaczej sugestia wyglądałaby na wynik rachunku
  z efemeryd, którego nie było. Dwa razy w roku to okno jest o godzinę obok (doba zmiany
  czasu) i to jest przyjęte: poprawka wymagałaby konwersji stref na telefonie

## Rezerwacje 3.0.0 - epik R-E: zakładki i nowy ekran startowy (issue #161, 2026-09-20)
Ekran startowy przestał być logiem dnia. Aplikacja dostała dolny pasek **Pulpit ·
Kalendarz · Historia**, a flow lotu żyje NAD nim. Decyzje: `docs/rezerwacje.md` §9.1.
Reguły obowiązujące odtąd KAŻDY nowy ekran aplikacji:
- **KOKPIT NIE MA ZAKŁADKI I MIEĆ NIE MOŻE.** Zakładki są JEDNYM ekranem stosu
  (`Tabs`), a 02 → 02E → 02A → kokpit → 09B leżą NAD nimi - wejście w lot przykrywa
  pasek w całości, bez ani jednej linijki warunku w kokpicie. Dopisanie pozycji do
  `ui/navigation/tabs.ts` to jedna niewinnie wyglądająca linijka, więc pilnuje tego
  TEST (`src/__tests__/tabs.test.ts`), nie komentarz: `TABS` nie może zawierać żadnej
  trasy z `FLOW_ROUTES`. Zakładka wyprowadzająca z kokpitu nie jest zmianą nawigacji,
  tylko skasowaniem modalności (issue #82)
- **NAZWY ZAKŁADEK SĄ ROZSTRZYGNIĘTE** (decyzja właściciela 2026-09-19, `rezerwacje.md`
  §9.1): PULPIT, nie „Dziś" - niesie najbliższą rezerwację, która bywa jutrzejsza, więc
  nazwa czasowa obiecywałaby węższy zakres; HISTORIA, nie „Loty" - „Loty" obok zakładki
  z dzisiejszymi sumami sugerowałoby dwa różne zbiory lotów. „Start" i „Przegląd"
  odpadły przez kolizję ze słownikiem. **Lista zadań w issue #161 jest STARSZA niż ta
  decyzja i mówi „Dziś · Kalendarz · Loty" - nie wracać do tamtych nazw**
- **PULPIT NIE MA LISTY OPERACJI I NIE POWTARZA KALENDARZA**: same sumy doby, najbliższa
  rezerwacja i akcje. Kafelek operacji był JEDYNYMI drzwiami do korekty w oknie 24 h
  (issue #23, #43), więc drzwi przejęła HISTORIA - i dlatego obejmuje ona odtąd także
  DZIŚ, wbrew issue #35. Karta „Mój dzień" jest linkiem, który tam prowadzi. Paska
  zajętości floty nie ma: powtarzał zakładkę stojącą centymetr niżej
- **BEZ REZERWACJI KARTY NIE MA WCALE** (wariant `20a`) - pusta karta „brak rezerwacji"
  byłaby zdaniem o niczym. Do epiku R-F (#162) ekran dostaje `null` i wygląda dokładnie
  jak ten wariant; zaślepki „wkrótce" nie ma
- **POWRÓT NA EKRAN DOMOWY IDZIE PRZEZ `goHome()`** (`ui/navigation/goHome.ts`) - to
  jedyne miejsce znające zagnieżdżony kształt trasy (`navigate('Tabs', { screen })`).
  `navigate` przyjmuje dowolny napis, więc literówka w którymkolwiek z sześciu wyjść
  z flow objawiłaby się dopiero w locie
- **HISTORIA: dzień NAGŁÓWKIEM, operacje zwartymi wierszami** (makieta `24`). Data pada
  RAZ, liczby stoją BEZ ETYKIET (kolejność Loty · Blok · Lot jest w aplikacji stała),
  suma doby wchodzi dopiero przy KILKU operacjach, a ikona po prawej niesie SKUTEK
  tapnięcia: ołówek (okno korekty) albo oko (podgląd po oknie). Archiwum jest zwinięte
  i zwija się przy KAŻDYM wejściu - pytanie „co mogę poprawić" wraca za każdym razem,
  a „co latałem w maju" pada raz na jakiś czas
- **`MyDayScreen` (01) SKASOWANY**, a `buildHistory`/`editableBadge`/`remainingLabel`
  umarły razem z pełnowymiarowym kafelkiem. Same pliki `design/01*` ZOSTAJĄ jako
  archiwum linii 2.x (`rezerwacje.md` §9.1a) - podręcznik osadza je w 13 miejscach
  i opisuje wersję, którą piloci mają w telefonach
- **zakładki NIE RUSZAJĄ WARSTWY NATYWNEJ**: `@react-navigation/bottom-tabs` to czysty
  JS na `react-native-screens`, które projekt już ma. Samo wydanie 3.0.0 idzie mimo to
  NOWYM APK (decyzja właściciela 2026-09-21): przy `runtimeVersion: appVersion`
  aktualizacji w tle nie wolno podnieść numeru wersji, a bez podbicia telefon i strona
  wydań pisałyby dalej „2.1.0" o wersji, która ma rezerwacje - a numer wersji jest tym,
  co pilot podaje w zgłoszeniu z terenu i co klub czyta na stronie
- **czego R-E świadomie NIE ROBI**: treści zakładki Kalendarz i danych najbliższej
  rezerwacji (epik R-F, #162), podmiany 13 osadzeń podręcznika i screen flow w tym
  pliku (epik R-W, #163 - podręcznik opisuje wersję WDROŻONĄ)

## Rezerwacje 3.0.0 - epik R-F: kalendarz i formularz w telefonie (issue #162, 2026-09-21)
Zakładka Kalendarz dostała treść, a rezerwacja - dwa kroki. Reguły obowiązujące odtąd
KAŻDY ekran modułu rezerwacji:
- **CAŁY MODUŁ WYMAGA SIECI I MÓWI TO WPROST** (§2.2): `useCalendarWindow` oddaje `null`
  = „nie wiem", a ekran rysuje kartę „BRAK POŁĄCZENIA" zamiast pustej siatki - ta
  wyglądałaby jak flota wolna na wylot. Przycisku ponowienia NIE MA (makieta 21B), ale
  dopóki karta stoi, ekran pyta serwer **co 60 s** i wraca sam (decyzja właściciela
  2026-09-21; wzorzec pustej floty z 02G). Cache’a zajętości nie dorabiamy - to jest
  decyzja, nie brak czasu
- **OKNO OSI TO DOBA LOTNA, NIE KALENDARZOWA**: liczy je `flightDayWindow`
  z `@ninerdeck/domain`, czyli ten sam kod, którym serwer liczy okno dla sugestii.
  Bez lotniska macierzystego schodzi do domyślnego i mówi o tym (`windowBasis`) -
  inaczej okno awaryjne wyglądałoby na wynik rachunku z efemeryd
- **REZERWACJA WYSTAJĄCA POZA OKNO ROZCIĄGA JE, WYŁĄCZENIE Z UŻYTKU - NIE.** Plan ukryty
  jest ukrytą kolizją; maszyna w serwisie jest niedostępna także w widocznym oknie, więc
  przycięcie niczego nie gubi (całodobowy przegląd rysuje się na całej szerokości)
- **GODZINY LICZY ODEJMOWANIE OD GRANIC DÓB** (`logic/clubClock.ts`), a dni tygodnia mają
  własną tablicę w `@ninerdeck/format` - `Intl` w Hermesie bez danych ICU przyjmuje
  `timeZone` i po cichu formatuje w UTC, czyli ODPOWIADA, tylko źle. Offset klubu
  wyczytuje się z granic doby (`clubOffset`) i służy WYŁĄCZNIE do nazwania DNIA
- **NA PASKU OSI STOI SKRÓCONE NAZWISKO - także przy własnej rezerwacji** (decyzja
  właściciela 2026-09-21, odwraca makietę 21). Kod pilota zostaje ostatnią deską ratunku
  dla pilota spoza cache’u floty; surowy identyfikator nie trafia na pasek nigdy
- **PASEK DNI SIĘGA 14 DÓB**, choć makiety rysują siedem chipów: siedem to tyle, ile MIEŚCI
  SIĘ na ekranie. Kalendarz miesięczny w formularzu PRZESTAWIA KOTWICĘ okna, więc termin
  spoza dwóch tygodni pyta serwer o doby wokół siebie
- **FILTR MASZYN ZAPISUJE UKRYTE, NIE POKAZYWANE** - maszyna dokupiona przez klub pojawia
  się na osi sama. Wybór jest preferencją PATRZENIA, więc mieszka w `AsyncStorage` per
  pilot i klub, jak motyw
- **KROK 1 REZERWACJI PYTA O TERMIN I MASZYNĘ, NIE O ZADANIE** (makieta 22, odwrotnie niż
  przejęcie): rezerwacja rozstrzyga KONKURENCJĘ o zasób, a rodzaj lotu i trasa nikomu
  niczego nie zabierają. **Lista zadań w issue #162 jest starsza niż makiety i mówi
  „samolot + Dual" w kroku 1 - nie wracać do tamtego podziału**
- **DWA KROKI TO JEDEN EKRAN NAWIGACJI** (wzorzec wpisu ręcznego): „wstecz" z kroku 2 cofa
  o krok, z kroku 1 przy niepustym szkicu pyta o rezygnację (`AbandonDraftSheet`). Termin
  i maszyna PODSTAWIONE przez nawigację nie liczą się jako wpis pilota
- **TAPNIĘCIE W WOLNE PASMO NIE USTAWIA TERMINU**, tylko przekazuje wskazaną godzinę jako
  PREFEROWANĄ PORĘ do zapytania o sugestie (`SLOT_PREFERRED_BONUS`). Podstawiona godzina
  wyglądałaby jak wpisana - to ta sama reguła, przez którą `Stepper` nie ma wartości
  domyślnej (issue #62)
- **WOLNE PASMA LICZY DOMENA** (`freeSpans` w `@ninerdeck/domain`) - ta sama odpowiedź,
  z której `suggestSlots` wybiera kandydatów. Własne scalanie zajętości po stronie ekranu
  byłoby drugą definicją słowa „wolne"
- **KSZTAŁT TRASY MA JEDNO ŹRÓDŁO** (`logic/routeShape.ts`): reguła „skoki = jedno
  lotnisko" obowiązuje szkic przejęcia I szkic rezerwacji, więc wyszła ze środka
  `preflightDraft.ts` do wspólnego modułu
- **WYMÓG DUALA JEDZIE WSPÓLNYM ZDANIEM** (`logic/dualRequirement.ts`) - trzeci ekran po
  02 i 15, bez ani jednej nowej kopii napisu
- **SĄSIAD W POWODZIE SUGESTII STOI ZA SEPARATOREM** („tuż przed rezerwacją · J. Nowak"):
  odmiany nazwiska nie da się wyprowadzić regułą, więc zdanie zostaje poprawne, a nazwisko
  dochodzi w mianowniku. Ta sama decyzja, co przy blokadzie arkusza czasów
- **`NumberSheet` to arkusz JEDNEJ liczby** (plan lotu, paliwo do zabrania) - dwa osobne
  pliki różniłyby się wyłącznie napisami, a `ReadingSheet` niesie cały świat paliwa
  i licznika. Rezygnacja z wartości opcjonalnej to „×" w linii tytułu
- **ODMOWA ZAPISU NIESIE TREŚĆ, WIĘC NIE JEST BŁĘDEM** (`logic/bookingDeny.ts`,
  makieta 22C): `409 slot_taken` przychodzi z kolidującą zajętością, a ekran wraca na
  KROK 1 - tam stoją kontrolki, którymi da się ją naprawić, i tam stoi karta z powodem.
  Karta niesie skrót „najbliższe wolne" TYLKO przy zajętym terminie: sugestie liczą się
  dla wybranej maszyny, więc przy maszynie wyłączonej z użytku prowadziłyby w tę samą
  ścianę. **Wiek kolizji jedzie OBOK zajętości** (`takenAt` w ciele odmowy, nie
  w `bookingWire`): „weszła 3 min temu" znaczy wyścig o slot, a plan sprzed tygodnia -
  stan kalendarza, którego pilot nie zauważył; na siatce ta liczba nie znaczy nic
- **ZAPIS, KTÓRY NIE DOJECHAŁ, TO INNA KATEGORIA NIŻ ODMOWA REGUŁY**: `null` z portu
  znaczy „o terminie nie wiemy nic", więc ekran mówi, CZYJĄ decyzją jest slot
  („Slot potwierdza serwer"), a nie „spróbuj ponownie". Preemptywnego powodu
  w przycisku NIE MA i to jest świadome: `syncIndicator` opisuje kolejkę ZDARZEŃ,
  więc przy pustym outboksie milczałby dokładnie u pilota bez zasięgu
- **KARTA REZERWACJI (23) MA JEDNE DRZWI DO ZMIANY**: „PRZESUŃ I POPRAW" wraca do
  kroku 1 z wypełnionym szkicem, ołówków przy wierszach nie ma (issue #40). Poprawka
  niesie SAMĄ RÓŻNICĘ (`logic/bookingEdit.ts` + `PATCH`), a **zmiana maszyny jest NOWĄ
  rezerwacją** (decyzja właściciela 2026-09-21): termin należy do egzemplarza, więc
  ekran zakłada nowy i odwołuje stary - **w tej kolejności**, bo odwrotna oddawałaby
  slot, zanim wiadomo, czy jest co wziąć w zamian. Obie stoją na różnych maszynach,
  więc nie mają jak zderzyć się ze sobą
- **ODWOŁANIE I POPRAWKA MAJĄ RÓŻNE WARUNKI I TO NIE JEST NIEDOPATRZENIE**: oddać da
  się termin, który już TRWA (pilot nie poleci), przesunąć - dopiero taki, który się
  nie zaczął; przesuwanie trwającego opisywałoby przeszłość. Cudzej rezerwacji nie
  dotyczy ani jedno, ani drugie
- **`GET /bookings/:id` JEST OSOBNĄ TRASĄ**, nie szukaniem w oknie kalendarza: termin
  bywa za dwa miesiące, a karta nie rysuje żadnej siatki. Odpowiedź niesie DOBĘ razem
  z wierszem, więc telefon liczy godziny odejmowaniem, jak wszędzie indziej (§6.1)
- **KARTA NAJBLIŻSZEJ REZERWACJI PYTA SERWER PRZY WEJŚCIU NA PULPIT** (F12): bez
  zasięgu karty NIE MA WCALE, czyli ekran wygląda jak wariant `20a` - i to jest stan
  poprawny, nie zaślepka. „Najbliższa" znaczy pierwszą WŁASNĄ, która się jeszcze nie
  skończyła - także tę, która właśnie trwa
- **REZERWACJA WYPEŁNIA PRZEJĘCIE, ALE GO NIE ZASTĘPUJE** (F8, `logic/claimFromBooking.ts`):
  „ROZPOCZNIJ LOT" ma jedno miejsce i jeden wygląd przez cały dzień (issue #42),
  a rezerwacja zmienia wyłącznie to, czym wypełni się krok 1. Wypełnia TYLKO termin,
  który dzieje się teraz (godzina przed początkiem, do końca) - plan na przyszły
  weekend podstawiony w formularz wyglądałby jak wpis pilota. `session_claim` niesie
  `reservationId` i to jest JEDYNE zetknięcie rejestru z rezerwacją, w jedną stronę
- **OSTRZEŻENIE O CUDZYM TERMINIE TO BANER, NIGDY BLOKADA** (F9, makieta 23A): okno
  dwóch godzin (tyle trwa typowy lot klubowy), własna rezerwacja kolizją nie jest,
  a bez sieci ostrzeżenia nie ma i przejęcie idzie dalej - rezerwacja nigdy go nie
  warunkowała (§2.3)
- **CUDZA ZAJĘTOŚĆ NIESIE TYLKO TO, CO EKRAN Z NIEJ CZYTA** (przegląd W7, decyzja
  właściciela 2026-09-21): `bookingWire` pyta, KTO PATRZY. Własna rezerwacja jedzie
  w komplecie, cudza - godziny, maszyna, właściciel, rodzaj zajętości i powód
  wyłączenia z użytku, czyli dokładnie to, co czytają `calendarGrid.ts`,
  `slotChips.ts`, `aircraftAvailability.ts` i `claimConflict.ts`. Trasa, drugi pilot,
  plan lotu i NOTATKA (wolny tekst pilota) nie trafiają na cudzy ekran nigdy, a jechały
  na każdy telefon w klubie przy każdym odświeżeniu kalendarza. **Na telefonie te pola
  są OPCJONALNE, nie nullowalne**: `undefined` znaczy „nie moja rezerwacja", a `null`
  znaczyłby „moja, tylko pusta". Panel widzi komplet - ma do tego osobną zdolność
- **DOKŁADAJĄC POLE DO ODPOWIEDZI TELEFONU, SPRAWDŹ, KTO JE CZYTA**: reguła wyżej nie
  jest o rezerwacjach, tylko o kształtach na drucie. Pole, którego żaden ekran nie
  czyta, nie jest „na zapas" - jest wyciekiem czekającym na pierwszego, kto zajrzy
  w odpowiedź
- **czego epik R-F NIE ROBI**: sprawdzeń NA URZĄDZENIU (F0 sonda stref, F11 i F13) -
  wymagają dev builda. Kod jest kompletny: trasa `BookingDetails` istnieje, a nazwa
  parametru jest jedna (`bookingId`) po obu stronach

## Akceptacja rezerwacji 3.1.0 - MAKIETY ZATWIERDZONE (issue #196, 2026-09-23)
Cały epik makiet przed kodem, design-first jak w 3.0.0. Decyzje i uzasadnienia:
**`docs/rezerwacje.md` §9.4 (telefon), §10 (panel), §11 (workflow)** oraz
**`docs/uprawnienia.md`** (epik #197). Reguły obowiązujące odtąd:
- **ZAKRES UPRAWNIEŃ ZAMIAST ROLI**: zdolności należą do CZŁONKOSTWA, `memberships.role`
  znika. Panel pokazuje SZEŚĆ ZESTAWÓW (Pilot · Akceptujący · Koordynator lotów ·
  Technik · Administrator · Własny zakres) - katalog zatwierdzony 2026-09-23, ale
  **zestaw NIE JEST bytem w modelu**: w bazie stoi ZBIÓR, a etykieta liczy się z niego
  z powrotem. Zmiana katalogu nie rusza nikomu uprawnień. „Własny zakres" wskakuje SAM
  przy tknięciu którejkolwiek zdolności - nie wybiera się go świadomie
- **MODEL WDROŻONY W KODZIE (epik #197, 2026-09-23)**: migracja 12 z tabelą
  `membership_capabilities`, backfillem z ról i `DROP COLUMN memberships.role`.
  `can(zbiór, zdolność)` zamiast `can(rola, …)`, zbiór czytany RAZEM z członkostwem
  (`authSnapshot`), claim `role` wypadł z tokenu, zapora przeszła na
  `refuseScopeChange` liczoną po `accounts.manage`. Katalog ma DZIESIĘĆ zdolności
  klubowych - doszła `reservations.approve` (rozstrzyganie kroku ścieżki + podgląd
  cudzych terminów), osobna od `reservations.manage`, bo akceptujący nie kasuje
  cudzych rezerwacji. Nazwy zestawów i zdolności po polsku mieszkają WYŁĄCZNIE
  w panelu (`admin/src/screens/accounts/scope.ts`) - serwer nie zna języka interfejsu
- **`admin_audit.actor_role` niesie odtąd KLUCZ ZAKRESU** (`full`/`partial`/`none`),
  a wiersze sprzed 3.1.0 zostają przy `admin`/`pilot`: dziennik jest zapisem
  historycznym i przepisanie go zmieniłoby to, co się wtedy wydarzyło
- **`<select>` przy zestawie** - drugie (po kalendarzu) odstępstwo od „zawsze lista kart",
  bo zawartość wyboru stoi ROZPISANA POD NIM: dwie listy kart jedna nad drugą zlałyby się
  w jedną
- **WIADOMOŚĆ TO NIE SPRAWA** (skrzynka `25`): „Nowe" gaśnie z otwarciem listy, „Do
  decyzji" stoi do decyzji. Gdyby jedno gasiło drugie, zerknięcie na skrzynkę uciszałoby
  prośbę o zgodę. CZWARTEJ ZAKŁADKI NIE MA - wejściem jest DZWONEK na Pulpicie (obok
  zębatki, issue #82); licznik wyłącznie z nieprzeczytanymi, bez zasięgu nie ma go wcale
- **PODGLĄD PILOTA I SAMOLOTU** (panel: szuflada `kalendarz-podglad`; telefon: EKRANY
  `26a`/`26b`, bo cztery karty z tabelą to nie arkusz). Otwiera się z maszyny i z OBU
  pilotów, nie ma ani jednej akcji na sprawie, a doświadczenie NA TYM egzemplarzu stoi
  przed nalotem ogólnym - to jest pytanie decyzji
- **LICENCJE, BADANIA I UPRAWNIENIA NA TYP SĄ POZA ZAKRESEM** (decyzja właściciela
  2026-09-23: osobny epik). Podgląd odpowiada nalotem i historią lotów - i NIE pokazuje
  pustych wierszy „Badania -": na ekranie decyzji czytałyby się jak stwierdzenie o stanie
  dokumentów, a byłyby stwierdzeniem o brakującym module
- **ODMOWA NIE JEST CZERWONA** (jest decyzją, nie zniszczeniem), ale POWÓD JEST WYMAGANY
  po obu stronach - pilot czyta go jako treść wiadomości. Przycisk blokuje BEZ zdania,
  bo puste pole widać nad nim (issue #55)
- **KROKU NIE PISZEMY** ani w kolejce, ani na ekranie decyzji: ekran pyta CIEBIE
- **STAN „CZEKA" WYGLĄDA JAK ZAJĘTOŚĆ, BO NIĄ JEST** - rezerwacja trzyma termin od
  ZŁOŻENIA, nie od zgody. Na osi floty różni go KSZTAŁT (przerywana ramka, jaśniejsza od
  zwykłego obrysu - inaczej ginie), na karcie pilota TON (ostrzeżenie, nie wygaszenie);
  zamknięta wraca do tonu neutralnego, bo czerwień niesie baner
- **POPRAWKA CZEKAJĄCEJ REZERWACJI CZYŚCI ZGODY** i ekran mówi to PRZED tapnięciem:
  zgoda dotyczyła konkretnego terminu. Rezerwacja ZAMKNIĘTA ma jedno wyjście („wybierz
  inny termin") - wyszarzone przyciski obiecywałyby akcje, których reguły nie dopuszczą
- **`.go` - WARTOŚĆ PROWADZĄCA W GŁĄB** (panel): w spoczynku wartość, pod kursorem
  ghost-badge. Sześć wersji, cztery odrzucone z powodami w docblocku `controls.css`.
  Podpis wartości (kod pilota) wchodzi DO ŚRODKA przycisku. Na telefonie ten sam byt
  wygląda INACZEJ - szewron w spoczynku, bo na dotyku nie ma hovera
- **kolejność `NAV_ITEMS` decyduje o ekranie startowym** (`homeFor`) - dokładając moduł
  platformy albo klubu, sprawdź, czy go nie przestawiasz

## Rezerwacje 3.1.0 - epik R-G: ścieżka akceptacji, decyzje z powodem, skrzynka (issue #164, 2026-09-23)
Migracja 13 + domena + porty + adaptery + trasy telefonu i panelu + budzik. Decyzje:
`docs/rezerwacje.md` §11, §12, §3.4; odstępstwa §18. Reguły obowiązujące odtąd:
- **ROZSTRZYGNIĘCIA LICZY CZYSTA DOMENA** (`server/src/domain/approvals.ts`): który krok
  pyta teraz, czy decyzja może zapaść, kogo zapytać dalej. Warstwa aplikacji
  (`ApprovalFlow`) dokłada odczyt, transakcję, powiadomienia i zmianę stanu wiersza -
  i to jest cała granica. Domena nie zna SQL-a, zegara ani zdolności `reservations.approve`
- **ŚCIEŻKA JEST ZAWSZE BIEŻĄCA** (decyzja właściciela 2026-09-23), więc **decyzja wskazuje
  KROK przez `step_id`, nigdy przez numer**, a kroku się NIE KASUJE (`removed_at`).
  Dołożenie kroku COFA sprawy w toku i to jest cena przyjęta świadomie; zapadłe podpisy
  zostają przy SWOICH krokach, bo numery przesuwają się, a `id` nie
- **KROK TO NAZWA I LISTA OSÓB, nigdy rola** - w kroku wystarczy zgoda JEDNEJ osoby
  (pula uprawnionych, nie komplet podpisów), a kroki idą PO KOLEI. Rezerwujący pomija
  kroki, na których sam stoi, i pominięcie ZAPISUJE SIĘ (`via = 'self'`): po miesiącu
  krok pominięty musi być odróżnialny od kroku, o który nikt nie zapytał
- **DWIE ZDOLNOŚCI, DWIE RÓŻNE ROLE**: `reservations.approve` mówi „ta osoba w ogóle
  akceptuje", lista kroku - „to jest JEJ krok". Trasa decyzji wpuszcza `approve` ALBO
  `manage`, bo `manage` jest DRUGĄ ZAPORĄ przed zakleszczeniem ścieżki (§11.2) - wymóg
  obu naraz znaczyłby, że utkniętą ścieżkę odblokuje wyłącznie ktoś, kogo w tej roli nie
  ma. `manage` odblokowuje przy tym KAŻDY krok, ale NIE pomija żadnego automatycznie:
  rezerwacje administratora podlegają ścieżce, której sam pilnuje
- **DECYZJE NIE TRAFIAJĄ DO DZIENNIKA AUDYTU i to jest decyzja, nie przeoczenie.**
  Ich rejestrem jest append-only `booking_approvals` - z powodem, krokiem i adnotacją
  `via` - czyli ślad BOGATSZY niż wiersz `admin_audit`. Do dziennika wchodzi za to
  zmiana ŚCIEŻKI (`approval.steps`, `accounts.manage`), bo to ona rozdaje władzę.
  Architektura zresztą tej drugiej drogi nie ma: decyzja zapada z TELEFONU (osobą kroku
  bywa zwykły pilot bez wejścia do panelu), a `application/common/` nie importuje
  z `admin/` - pilnuje tego oś powierzchni w `architecture.test.ts`
- **REZERWACJA `pending` TRZYMA SLOT** (była w `SLOT_HOLDING_STATUSES` od 3.0.0, teraz
  wchodzi w życie): inaczej „czekam na akceptację" znaczyłoby „ktoś mi to zaraz zajmie"
- **NOWY STAN `expired`** (§11.5): termin nadszedł, decyzji nie ma - slot wraca do puli
  BEZ powodu (`close_reason` niesie zdanie CZŁOWIEKA). Osobny od `released`, bo tam
  maszyny nie przejęto, a tu zgody nie wydano. `BookingReleaseJob` dostał drugie pytanie,
  nie drugi wątek; **wygaszanie idzie PIERWSZE**, a `due()` zawęziło się do `confirmed` -
  rezerwacji czekającej na zgodę nikt nie mógł przejąć, więc zwolnienie jej jako
  „pilot się nie zjawił" byłoby zdaniem nieprawdziwym
- **SKRZYNKA JEST ŹRÓDŁEM PRAWDY, PUSH BUDZIKIEM** (§12.1): powiadomienie powstaje TĄ
  SAMĄ transakcją, co rzecz, o której mówi (`Notifier.record`), a budzik idzie PO
  commicie i NIGDY nie rzuca (`Notifier.wake`). Rozdzielenie widać w sygnaturach:
  `record` żąda uchwytu transakcji, `wake` go nie przyjmuje. Stąd też `PUSH_PROVIDER`
  jest NIEWYMAGANY i domyślnie znaczy `log` - inaczej niż `MAIL_PROVIDER`, bez którego
  serwer nie wstaje: bez budzika prośba nadal czeka w skrzynce, kompletna i z historią
- **PUSH NIE NIESIE NAZWISK ANI GODZIN**: ląduje na ekranie blokady, który widzi każdy,
  kto akurat patrzy na telefon. Tytuł nazywa rzecz („Prośba o zgodę"), a treść stoi
  w skrzynce. `payload` wozi IDENTYFIKATORY - znak maszyny rozwiązuje aplikacja z cache
  floty, jak wszędzie indziej
- **KURSOR SKRZYNKI JEST PARĄ** `(created_at, id)`: powiadomienia jednej decyzji rodzą
  się w tej samej transakcji, więc sam stempel nie porządkuje ich jednoznacznie i strona
  potrafiłaby zgubić wiersz. Kursor NIEPEŁNY to `400`, a nie ciche „od początku" -
  strona od początku wygląda jak strona z wynikami, więc telefon pętliłby się na
  pierwszej i nikt by tego nie zauważył
- **TOKEN PUSH ŻYJE RAZEM Z SESJĄ LOGOWANIA** (kaskada z `login_sessions`, §12.2) i jako
  jedyna nowa tabela **NIE MA `org_id`**: opisuje URZĄDZENIE osoby, a ta bywa w kilku
  klubach naraz i przełącza je bez wylogowania. Klub niesie POWIADOMIENIE, czyli treść,
  która przez ten token wychodzi. Sesja bierze się z TOKENU żądania, nie z ciała
- **AKCEPTUJĄCY JEST TRZECIM WIDZEM `bookingWire`** (§17, G5b): ze zdolnością
  `reservations.approve` widzi komplet pól WSZYSTKICH rezerwacji klubu - bez zadania,
  trasy i notatki zgoda zapadałaby na podstawie samych godzin i znaku maszyny. Zwykły
  członek klubu nie zyskuje ani jednego pola
- **STAN ŚCIEŻKI JEDZIE W `GET /bookings/:id`, NIE W OKNIE KALENDARZA**: siatka rysuje
  pasek zajętości i o kroki nie pyta, a odczyt per wiersz zamieniłby jedno zapytanie
  o dobę w tyle zapytań, ile rezerwacji stoi na ekranie. **Nazwisk decydujących nie ma
  nigdzie** (§9.4): krok bywa obsadzony przez kilka osób i rozstrzyga pierwsza
- **ZAPIS ŚCIEŻKI IDZIE CAŁĄ LISTĄ** (`PUT /admin/api/approval-steps`), bo `position`
  jest własnością LISTY, a nie kroku. Odmawia kroku BEZ OSÓB (zatrzymałby rezerwacje na
  zawsze) i kroku obsadzonego kimś spoza klubu; odmowa niesie NAZWĘ kroku, nie numer -
  ekran pokazuje listę, w której numer i tak nie stoi
- **czego epik R-G świadomie NIE ROBI**: ekranów telefonu (25/26 - epik R-H) ani modułu
  panelu; `expo-notifications` w aplikacji to moduł natywny, więc 3.1.0 idzie NOWYM APK
  (§12.4), a projekt Firebase i FCM V1 w EAS są zadaniem właściciela na drodze krytycznej

## Rezerwacje 3.1.0 - epik R-H: panel - ścieżka akceptacji i kolejka decyzji (issue #165, 2026-09-23)
Cztery decyzje właściciela na wejściu (pytane pojedynczo) i reguły obowiązujące odtąd:
- **DECYZJA Z PANELU = TA SAMA DECYZJA, CO Z TELEFONU** - `POST /admin/api/bookings/:id/decision`
  na tym samym `ApprovalFlow.decide`, BEZ wpisu w dzienniku audytu: rejestrem jest
  append-only `booking_approvals`, a drugi ślad zależny od powierzchni mówiłby o jednym
  fakcie na dwa sposoby. Trasa wpuszcza `reservations.approve` ALBO `reservations.manage`
  (druga jest zaporą przed zakleszczeniem), więc deklaracja stoi na `panel.access`,
  a rozstrzygnięcie w handlerze - `adminRoute` zna jedną zdolność, a „approve albo manage"
  nie jest żadną z nich
- **HISTORIA W PANELU NIESIE OSOBĘ** (`decidedBy` w `panelApprovalWire`), telefon dalej
  nie (`approvalWire`, §9.4): administrator pyta „do kogo zadzwonić". Widok w warstwie
  aplikacji jest JEDEN; o polach na drucie rozstrzyga trasa. Rozstrzygnięcie pisze się
  RZECZOWNIKIEM („zgoda · Jan Bąk JBA · 24 wrz, 18:40"), bo czasownika nie da się
  odmienić bez znajomości płci - ta sama granica, co przy `originLabel`
- **HISTORIA (H5) I ODBLOKOWANIE UTKNIĘTEGO KROKU MIESZKAJĄ W SZUFLADZIE ZAJĘTOŚCI** (K2a
  w `kalendarz-wpis`, dorysowana PRZED kodem): kolejka K5 pokazuje wyłącznie sprawy na
  MOIM kroku bieżącym (`ApprovalFlow.queueFor`), więc rezerwacja utknięta na kroku bez
  obsady nigdy by się w niej nie pojawiła. `ApprovalCard`: kroki po numerach, krok
  bieżący bursztynem, nieosiągnięty kreską, pominięcie jako zapis „przeszedł sam";
  dla `reservations.manage` przy sprawie w toku karta „Decyzja za krok …". Klub bez
  ścieżki karty NIE MA (reguła SyncChipa)
- **KOLEJKA MA WŁASNĄ TRASĘ** (`GET /admin/api/approvals/queue`, `reservations.approve`),
  nie filtr na oknie kalendarza - kolejka nie ma okna dat. Odpowiedź niesie `timezone`,
  bo „wczoraj 18:40" i „termin za 3 dni" liczą się DOBĄ KLUBU (`clubDayIndex`
  w `bookingLabels.ts` czyta części daty z `Intl`, nie napis - `pl-PL` układa go po
  swojemu). Najstarsze ZŁOŻONE pierwsze: to one są najbliżej wygaśnięcia (§11.5)
- **BANER NA OSI ISTNIEJE WYŁĄCZNIE Z PRACĄ** i liczy sprawy SŁOWEM do czterech („Dwie
  rezerwacje czekają na Twoją zgodę."); wiersz „Krok" na karcie kolejki wraca TYLKO przy
  kolejce mieszającej kroki (`showsStepRow` - wzorzec `needsFieldLabels` z issue #43);
  zdanie „co po decyzji" stoi RAZ pod listą (`decisionHint`). `Banner` dostał slot `action`
  (przycisk jest rodzeństwem treści w układzie flex, jak w makietach); ikona banera dalej
  wynika z TONU, więc zegar z makiety K1 został ikoną informacji
- **KOLEJNOŚĆ KROKÓW ZAPISUJE SIĘ OD RAZU** przy przestawieniu (uchwyt = `<button
  draggable>` ze strzałkami góra/dół; kolejność jest REGUŁĄ, nie szkicem), a ścieżka
  zawsze jedzie CAŁA (`withStep`/`withoutStep` w `approvalPath.ts`). Tabelę ścieżki
  rysuje ekran sam, nie `DataTable` - uchwyt potrzebuje zdarzeń na WIERSZU, których
  tabela-kręgosłup nie wystawia. Zdjęcie kroku ma kartę `danger` w szufladzie z opisem
  skutku (nie było w makiecie - sprawy czekające na krok przejdą dalej)
- **OBSADA LICZY SIĘ WOBEC ŻYWEGO KLUBU** (`stepMembers`/`stepHealth`): osoba, która
  straciła zdolność albo członkostwo, ZOSTAJE na liście (konfiguracji klubu nie czyścimy
  po cichu), nazwisko przygasa (`.cell-sub .dim` - stopień placeholdera, bo `--text-muted`
  należy w kalendarzu do stanu „czeka"), a krok bez nikogo dostaje baner `warn`
  z drogą naprawy. W szufladzie taka osoba stoi na liście ZAZNACZONA z adnotacją -
  inaczej nie dałoby się jej z kroku zdjąć. `OptionButton` dostał `multiple`
  (`role="checkbox"`): obsada kroku to pula, nie jedna z listy
- **PODGLĄD PILOTA I SAMOLOTU (K6) TO OSOBNE ZGŁOSZENIE**: wymaga zapytań serwera (nalot,
  ostatnie loty, najbliższe rezerwacje) wspólnych z telefonem 26a/26b. Wartości w kolejce
  NIE prowadzą w głąb (`.go` z makiety czeka na tamten epik)
- **STRAŻNIK LUSTER PILNUJE ODTĄD KONTRAKTÓW KALENDARZA I ŚCIEŻKI** (#204, zrobione
  pierwszym commitem tego epiku): `BookingStatus`, `BookingKind`, `ApprovalOutcome`,
  `ApprovalRefusal`, `ApprovalVerdict`, `ApprovalVia`, `ApprovalStepsRefusal` - skaner
  czyta unie także z `application/common/ports.ts` i z komendy ścieżki. Dokładając unię
  po stronie serwera, dopisz lustro i jego wiersz w `admin/test/mirrors.test.ts`
- **czego R-H NIE ROBI**: sprawdzenia w przeglądarce na żywym serwerze (panel przeszedł
  `tsc` i 413 testów, w tym strażników); podręcznika (R-K, #169); domknięcia rezerwacji,
  którym po SKRÓCENIU ścieżki nie zostało czego pytać (osobne zgłoszenie - dziś stoją
  w `pending` do wygaśnięcia)

## Rezerwacje 3.1.0 - epik R-I: aplikacja - skrzynka, decyzja z telefonu, stany rezerwacji (issue #166, 2026-09-23)
Ekrany 25/25A/25B (skrzynka), 26/26C (decyzja), stany karty 23B–23E, Pulpit 20E -
wszystko 1:1 z makiet #196. Do tego cienki plaster serwera i migracja 14. Decyzje:
`docs/rezerwacje.md` §9.4, §11.4, §12.1; odstępstwa §18. Reguły obowiązujące odtąd:
- **POPRAWKA TERMINU CZYŚCI ZGODY** (decyzja właściciela 2026-09-23 - wzięte do R-I,
  choć plan tego nie miał; migracja 14). `booking_approvals` dostało własny `id`
  i `superseded_at`, a unikat `(booking_id, step_id)` obowiązuje TYLKO wśród żywych
  (indeks częściowy). `PATCH` ze zmienionym terminem na rezerwacji z żywą ścieżką:
  `ApprovalFlow.restart` unieważnia decyzje, planuje ścieżkę od nowa, wiersz wraca do
  `pending` (`BookingsPort.reopen`), a osoby kroku bieżącego dostają świeżą prośbę.
  Zmiana notatki/zadania/trasy zgód NIE rusza. Append-only zostaje: unieważniona zgoda
  nie znika, tylko przestaje się liczyć - `listFor` czyta wyłącznie żywe
- **SKRZYNKA I KOLEJKA TO DWA PYTANIA, JEDNA ODPOWIEDŹ** (`useInbox`): „Nowe" gaśnie
  z otwarciem listy (oznaczenie w tle po udanym odczycie, zielona krawędź zostaje na
  czas tej wizyty), „Do decyzji" liczy się z `GET /me/approvals/queue` i stoi do decyzji.
  Kolejka, która nie dojechała, NIE gasi listy - wiersze są bez plakietki. Skrzynka
  niesie `timezone` i DOBĘ terminu przy każdej wiadomości, bo godziny liczą się
  odejmowaniem od granic doby (§6.1) - `Intl` w aplikacji dalej ani razu
- **CAŁY MODUŁ WYMAGA SIECI, BEZ CACHE** (§12.1): `null` z hooka = 25B „BRAK POŁĄCZENIA",
  ponawianie co 60 s bez przycisku (wzorzec kalendarza). Punkt I2 z issue #166 („działa
  offline, zapis lokalny") jest STARSZY niż decyzja z 2026-09-22 - nie wracać
- **LICZNIK PRZY DZWONKU, NIE PRZY ZAKŁADCE** (czwartej zakładki nie ma, §9.4):
  `ScreenHeader.onNotifications` + `unread`, dzwonek PRZED zębatką i wyłącznie na
  Pulpicie. `useUnreadCount` pyta serwer o JEDNĄ wiadomość przy każdym wejściu; bez
  zasięgu `null` i licznika nie ma wcale (ostatnia znana liczba kłamałaby). Zero nie
  dostaje plakietki (reguła SyncChipa)
- **ROZSTRZYGNIĘCIA IDĄ RZECZOWNIKIEM**: „Odmowa zgody · Anna Kowal", nie „Anna Kowal
  odmówiła zgody" (makieta 25 ma czasownik) - czasownika nie da się odmienić bez płci,
  a rzeczownik brzmi tak samo dla każdego. „Prosi o zgodę" zostaje: trzecia osoba czasu
  teraźniejszego jest wspólna. Nazwisko rezerwującego przychodzi IDENTYFIKATOREM
  w payloadzie (`pilotId`) i rozwiązuje się z cache członków; poza cache’em tytuł
  ogólny („Prośba o zgodę na lot"), nigdy surowy id
- **STANY KARTY LICZY `approvalView`** (`logic/bookingApproval.ts`): `none` (klub bez
  ścieżki - karta jak w 3.0.0) / `waiting` / `stepAdded` / `confirmed` / `rejected`
  / `expired` / `closed`. **„Doszedł krok" (23E) poznaje się po KSZTAŁCIE ścieżki**:
  decyzja stojąca ZA krokiem bieżącym nie ma innego wytłumaczenia - serwer nie mówi
  „dołożono krok", a osobne powiadomienie o zmianie ścieżki to #207. Krok bieżący czeka
  od OSTATNIEJ zgody przed nim, bez niej od złożenia (`createdAt` własnej rezerwacji -
  nowe pole `bookingWire`, tylko dla właściciela). Wygasła: pierwszy niezdecydowany
  „nie zdecydował", dalsi „nie zaczął"; po odmowie każdy dalszy „nie zaczął"
- **BANER ODMOWY NA KARCIE NAZYWA KROK, NIE OSOBĘ** (makieta 23C ma nazwisko): stan
  ścieżki na telefonie nazwisk decydujących nie niesie (§9.4) - powód jest treścią,
  a to, KTÓRY krok odmówił, mówi też oś ścieżki (znacznik czerwony)
- **TON KARTY TERMINU IDZIE ZA STANEM**: `heroTone` amber (czeka - zieleń obiecywałaby
  pewny lot), green (potwierdzona), off (zamknięta - czerwień niesie baner). Na Pulpicie
  ta sama reguła (20E): plakietka „Czeka na zgodę", odliczanie bursztynem, „krok 1 z 2"
  z `GET /bookings/:id` - pytany WYŁĄCZNIE przy czekającej (`useBooking(null)` serwera
  nie woła), bo okno kalendarza ścieżki nie niesie (§17)
- **REZERWACJA ZAMKNIĘTA MA JEDNO WYJŚCIE** (`BookingDetailsVm.closed` → „WYBIERZ INNY
  TERMIN" → `goHome(navigation, 'Calendar')`): nie ma czego przesuwać ani odwoływać,
  a wyszarzone przyciski obiecywałyby akcje, których reguły nie dopuszczą. Przy
  czekającej pod „PRZESUŃ I POPRAW" stoi `editNote` - ekran mówi o czyszczeniu zgód
  PRZED tapnięciem
- **EKRAN DECYZJI PYTA CIEBIE** (`logic/decision.ts`): kroku nie piszemy, karta niesie
  plan w komplecie bez kresek za pola, których nie ma; zdanie pod pasem akcji nazywa
  NASTĘPNY krok (albo „jest potwierdzona" przy ostatnim). ZATWIERDŹ zielony solid, ODMÓW
  neutralny secondary (odmowa jest decyzją, nie zniszczeniem); arkusz 26C blokuje BEZ
  zdania przy pustym powodzie (issue #55), sufit 500 znaków jak serwer. `null` z synca
  = „Decyzję zapisuje serwer - potrzebne połączenie", odmowa reguły = zdanie
  z `decisionRefusalText` + `reload()`, żeby karta pokazała NOWY stan sprawy zamiast
  obiecywać pas akcji. Udana decyzja wraca do skrzynki (lista czyta się na nowo przy
  fokusie)
- **PLAKIETKA `pending` NA OSI FLOTY NIE WCHODZI DO LEGENDY** - to decyzja z R-F
  (różni się KSZTAŁTEM ramki, nie kolorem); pierwsza wersja tego epiku dopisała ją
  i została cofnięta. `CalendarBooking.createdAt` jest OPCJONALNE, nie nullowalne:
  brak pola = „nie ta odpowiedź" (cudza, serwer sprzed 3.1.0)
- **CZAS WIADOMOŚCI TO WIEK, NIE GODZINA** („12 min temu", „wczoraj", „2 dni temu" -
  `agoLabel`): telefon nie ma doby klubu dla chwili powstania wiadomości, tylko dla
  terminu, a „wczoraj 18:40" z makiety wymagałoby konwersji stref
- **czego R-I NIE ROBI**: podglądów 26A/26B (to samo zgłoszenie, co K6), powiadomienia
  o zmianie ścieżki (#207), push (R-J - moduł natywny, nowy APK), sprawdzenia
  NA URZĄDZENIU (wymaga dev builda - do epiku wydaniowego #169), podręcznika (R-K)

## Rezerwacje 3.1.0 - epik R-J: push jako budzik (issue #167, 2026-09-23)
`expo-notifications` w aplikacji, cienki plaster serwera (`channelId`, bit `approver`),
plik Firebase poza repozytorium. Decyzje: `docs/rezerwacje.md` §12.1–§12.5; odstępstwa §18.
**Cały łańcuch (telefon → serwer → Expo Push Service → FCM), miejsce każdego sekretu, koszt,
sklep Play i pułapki konfiguracji z 2026-09-24: `docs/rezerwacje.md` §12.6** - tam zaglądaj,
zanim ruszysz Firebase, EAS albo `PUSH_PROVIDER`.
**Zadanie właściciela #168 (Firebase, FCM V1 w EAS, `PUSH_PROVIDER=expo`) jest na
drodze krytycznej** - bez niego kod działa, ale budzik milczy. Reguły obowiązujące odtąd:
- **JEDEN PLIK ZNA `expo-notifications`** (`infrastructure/push/expoNotifications.ts`,
  exact-list w `architecture.test.ts`, poza barrelem): adres urządzenia (`ExpoPushDevice`
  za `PushDevicePort`), kanał Androida `default` (WYSOKA ważność - serwer adresuje go
  `channelId`), pokazanie budzika przy otwartej aplikacji i tapnięcie. `configureNotifications()`
  woła `App.tsx` raz na proces, PRZED bramką tożsamości - kanał ma istnieć, zanim
  przyjdzie pierwsze powiadomienie do zablokowanej aplikacji
- **KAŻDA AWARIA PUSH JEST CISZĄ**: `getExpoPushTokenAsync` rzuca bez Firebase, w Expo Go
  i na telefonie bez usług Google - token jest wtedy `null` (`unavailable`), a skrzynka
  działa (§12.1). Nikt wyżej nie ma czego łapać
- **TOKEN REJESTRUJE PĘTLA OKAZJI** (`PushTokenSync.register` w `useSyncLoop`, po
  motywie, przed śladem): klucz pamięci = pilot + para poświadczeń + token, więc jeden
  `POST` na uruchomienie i na nową sesję logowania; rotacja tokenów odświeża klucz
  (jeden nadmiarowy `POST`, tańszy niż wystawianie identyfikatora sesji z serwisu
  poświadczeń). Klucz liczy się PO rozmowie - `authorizedFetch` mógł w niej odświeżyć parę
- **PROŚBA O ZGODĘ PADA W DWÓCH MOMENTACH I RAZ NA URUCHOMIENIE** (decyzja właściciela
  2026-09-23; `logic/pushOptIn.ts` + `hooks/askForPush.ts`): Pulpit dla AKCEPTUJĄCEGO
  (`approver` w `GET /me/notifications` - telefon zdolności nie zna, a Pulpit i tak czyta
  skrzynkę przy wejściu) oraz zapis rezerwacji, która CZEKA (`pending`). Rezerwacja
  potwierdzona od razu nie rodzi powiadomień, więc przy niej nie pytamy - to jest
  świadome zawężenie słów „gdy zalogowana osoba złoży rezerwację". Prośba jest miękka
  (`requestNotificationPermission` z usługi GPS), po niej od razu próba rejestracji
- **TAPNIĘCIE LICZY CZYSTA FUNKCJA** (`logic/pushTarget.ts`): prośba → `Decision`,
  decyzja/wygaśnięcie → `BookingDetails`, wszystko inne → `Notifications`. Dane z push
  są `unknown` - spreparowane albo z nowszego serwera mają prowadzić w bezpieczne
  miejsce, nie wywracać aplikacji. `usePushNavigation` dostaje `navigationRef`
  i flagę gotowości nawigatora; zimny start i tapnięcie sprzed PIN-u czyta
  `getLastNotificationResponseAsync`, a identyfikator obsłużonego tapnięcia trzyma
  STAN MODUŁU (ponowne zamontowanie nawigatora nie otwiera tej samej rezerwacji)
- **PLIK FIREBASE POZA REPOZYTORIUM** (`scripts/google-services.js`, z testem):
  `android.googleServicesFile` ze zmiennej EAS `GOOGLE_SERVICES_JSON` (typ „file")
  albo z lokalnego `app/google-services.json` (`.gitignore`); bez obu pole nie istnieje
  i Metro pracuje jak dotąd. Jeden plik Firebase obejmuje obie aplikacje projektu
  (`com.ninerdeck.app` i `.dev`) - dev build to osobna aplikacja w Firebase
- **IKONA POWIADOMIEŃ Z GENERATORA** (`notification-icon.png`, 96 px, biała sylwetka
  znaku bez tła - Android barwi ją sam kolorem z pluginu). Ta sama reguła, co przy
  reszcie ikon: poprawka przez `npm run icons`, nie ręczną edycją PNG
- **WERSJI NIE PODBIJAMY W TYM EPIKU**: `develop` nie buduje APK, a bump `version`
  i `versionCode` należy do gałęzi wydaniowej (R-K, #169). J6 (APK) i J7 (sprawdzenie
  na urządzeniu) czekają na #168
- **czego R-J NIE ROBI**: przełącznika powiadomień w ustawieniach aplikacji (system ma
  swój), listy urządzeń w telefonie, pokwitowań Expo (receipts - `DeviceNotRegistered`
  przychodzi już w biletach), powiadomień o zmianie ścieżki (#207)

## Rezerwacje 3.1.0 - podgląd pilota i samolotu przy decyzji (K6, 26A/26B; issue #206, 2026-09-24)
Akceptujący pyta „komu zatwierdzam" i „czym poleci" - i ma dostać na to TEN SAM komplet
faktów w panelu (szuflada `kalendarz-podglad`) i w telefonie (ekrany 26A/26B), bo decyzję
podejmuje też mechanik, który panelu nie otwiera. Decyzje: `docs/rezerwacje.md` §10;
odstępstwa §18. Reguły obowiązujące odtąd:
- **JEDNO ZAPYTANIE DLA OBU POWIERZCHNI**: rachunek w `server/src/domain/decisionPreview.ts`
  (czysty: wiersze + „teraz"), składanie w `application/common/queries/decisionPreview.ts`,
  kształt na drucie w `http/routes/common/previewWire.ts`. Trasy telefonu
  (`GET /bookings/:id/preview/pilot/:pilotId`, `…/preview/aircraft`) i panelu (te same pod
  `/admin/api`) różnią się WYŁĄCZNIE bramą; test `decisionPreview.test.ts` przybija
  równość odpowiedzi bajt w bajt. Panel i telefon NICZEGO nie liczą - składają napisy
  (`admin/src/screens/calendar/previewLabels.ts`, `app/src/ui/screens/logic/previewRows.ts`)
- **OSOBA NA SPRAWIE, NIE DOWOLNA**: podgląd pilota istnieje tylko dla PIC-a albo Duala
  rozpatrywanej rezerwacji; inna osoba i cudza sprawa to 404 (epik C), członek bez
  `reservations.approve`/`manage` - 403 (sprawę widać w kalendarzu i tak, więc nic nie
  wycieka). Bez tej granicy trasa byłaby wyszukiwarką nalotu każdego członka klubu
- **NOWE PYTANIA DO ISTNIEJĄCYCH WIERSZY, NIE NOWE DANE**: zero migracji. Doszły
  `SessionsProjectionPort.listByCrew` (PIC albo Dual - uczeń lata jako Dual) i filtr
  `BookingQuery.pilotId` (`pilot_id = $n OR dual_id = $n`). Liczy się operacja
  nieunieważniona z biegiem silnika albo lotem (`flew`); zapis bez biegu ze zmienionym
  odczytem jest operacją w sensie issue #75, ale nalotu nie daje
- **DOŚWIADCZENIE NA EGZEMPLARZU SPRAWY STOI PIERWSZE** (pytanie decyzji: „czy zna TĘ
  maszynę"), „pierwszy raz na tej maszynie" pisze się wprost; potem okna 30/90 dni
  i „w klubie" trójką Loty · Blok · Lot; ostatnie loty do pięciu
- **ROZPATRYWANA SPRAWA JEST NA LIŚCIE TERMINÓW ZAWSZE** (`upcomingOf`): lista sięga po
  sufit okna kalendarza, ale sprawa wchodzi także spoza niego. Termin PILOTA nachodzący
  na sprawę dostaje bursztyn - baza pilnuje egzemplarza, nie człowieka. Wyłączenie
  z użytku na liście maszyny też bursztynem, z powodem
- **LICZNIKI NIOSĄ ŹRÓDŁO** - `pickHandover` z odczytem administratora jako konkurentem,
  jak karta samolotu w panelu; etykiety źródła: zdanie samolotu / operacja w toku / stan
  początkowy z panelu / wpis administratora. Bez odczytu KRESKI, nie zera
- **DWA ZEGARY, ŚWIADOMIE**: chwile operacji (ostatnie loty, ostatni lot, odczyt) datą
  rejestru w UTC (`dateUtcDayMonth`, `dateTimeUtcShort`), terminy dobą klubu - serwer
  przysyła dobę przy każdym terminie, telefon liczy godziny odejmowaniem (`Intl` ani razu)
- **PANEL: `.go` bywa PRZYCISKIEM** (`button.go` w `controls.css` zdejmuje oprawę
  przeglądarki; `panel.css` przegenerowany) - szuflada otwiera się bez adresu. Znak na
  tytule karty kolejki oraz pilot i drugi pilot prowadzą w głąb (`QueueRow.go`,
  `QueueCard.aircraft` + `when`); szuflada `PreviewDrawer` NIE MA akcji na sprawie.
  Stopka pilota: „Pokaż kartę pilota" (`#/piloci/:id`) - dziennik nie ma wejścia po
  osobie; stopka maszyny: „Pokaż w dzienniku" (`#/dziennik/:reg`)
- **TELEFON: PODGLĄD JEST EKRANEM, NIE ARKUSZEM** (`PilotPreviewScreen`,
  `AircraftPreviewScreen`, wspólna treść `components/data/PreviewBody.tsx`): cztery karty
  i tabela to treść na cały ekran. `KeyValueRow.onPress` rysuje szewron ZA wartością
  w spoczynku (na dotyku nie ma hovera); na karcie decyzji mają go DOKŁADNIE trzy
  wiersze - samolot i obie osoby (`DecisionRow.opens`). Hooki `usePilotPreview`/
  `useAircraftPreview` w `ui/hooks/usePreview.ts` czytają przy każdym wejściu, bez cache
  (§12.1); `null` = ekran „BRAK PODGLĄDU - składa serwer, wróć z zasięgiem"
- **czego #206 NIE ROBI**: licencji, badań i uprawnień na typ (osobny epik, decyzja
  właściciela 2026-09-23), sprawdzenia w przeglądarce i na urządzeniu (→ #169)

## Rezerwacje 3.1.0 - zapis ścieżki domyka sprawy w toku (issue #207, 2026-09-24)
Luka znaleziona przy R-H: ścieżka jest bieżąca (§11.2), więc jej SKRÓCENIE zostawiało
rezerwacje w `pending` z kompletem zgód - nikt nie mógł ich domknąć (`refuseDecision` →
`not_pending`), a wygasały jako „nikt nie zdążył zdecydować". Decyzje: `docs/rezerwacje.md`
§11.2 (akapit „ZAPIS ŚCIEŻKI DOMYKA…"); odstępstwa §18. Reguły obowiązujące odtąd:
- **ZAPIS ŚCIEŻKI PRZECHODZI PO SPRAWACH `pending` W TEJ SAMEJ TRANSAKCJI**
  (`ApprovalFlow.reconcile(tx, orgId, before, after)`, wołane z `ApprovalStepsCommands.replace`
  zaraz po `steps.replace`): komplet zgód na nowej ścieżce → `bookings.confirm` +
  `booking_approved` do pilota; inny krok bieżący niż przed zmianą → `approval_requested`
  do osób nowego kroku; krok dołożony z rezerwującym na liście → pominięcie `self`
  (`missingSelfApprovals` w domenie). Odmowa w rejestrze sprawy `pending` nie ma jak
  powstać, a gdyby stała, rozstrzyga o niej człowiek, nie zapis konfiguracji
- **„INNY KROK" ZNACZY INNY `id` KROKU BIEŻĄCEGO**, nie inną obsadę: dopisanie osoby do
  kroku bieżącego nie rodzi prośby (sprawa czeka tam, gdzie czekała, a osoba widzi ją
  w kolejce). Przestawienie kolejności PRZEKIEROWUJE tak samo, jak dołożenie - panel
  przy przestawianiu też pokazuje skutek
- **BUDZIK PO COMMICIE, JAK WSZĘDZIE**: `reconcile` oddaje `notices`, komenda woła
  `notifier.wake` po `write.run`. `ApprovalStepsCommands` dostał przez to `ApprovalFlow`
  i `Notifier` w konstruktorze (oba korzenie kompozycji: `index.ts` i `test/helpers.ts`)
- **LICZBY JADĄ DO DZIENNIKA I DO PANELU**: audyt `approval.steps` ma w `details`
  `confirmed` i `moved` obok `before`/`after`; `PUT /admin/api/approval-steps` oddaje
  `reconciled: { confirmed, moved }`, a ekran ścieżki pokazuje to banerem `ok`
  (`pathSavedNotice` w `approvalPath.ts`, z testami) - ZERO nie dostaje zdania (reguła
  SyncChipa). Szuflada kroku zamyka się po zapisie, więc skutek podaje ekran pod nią
  (`StepDrawer.onSaved`), a mutacja unieważnia też cache KALENDARZA - pasek na osi
  zmienia kształt z `pending` na `confirmed`
- **TESTY DOWIODŁY LUKI PRZED POPRAWKĄ**: pięć z sześciu nowych przypadków
  w `approvalFlow.test.ts` pada bez wywołania `reconcile`; szósty (zmiana obsady bez
  prośby) jest strażnikiem przed budzeniem wszystkich. Strażnik hexów w panelu
  (`architecture.test.ts`) łapie `#207` w NAPISIE testu - numer issue w nazwie `describe`
  wygląda dla niego jak kolor; w komentarzach jest bezpieczny (są zdejmowane)
- **czego #207 NIE ROBI**: powiadomienia o samej ZMIANIE ŚCIEŻKI (osoby dostają prośby
  o zgodę, nie „administrator przestawił kroki"), sprawdzenia w przeglądarce (→ #169)

## Pilot i samolot - UX
- Pierwsze logowanie: **Google** na `00a-login-full.html` (decyzja 2026-09-04 odwraca 2026-07-22; wymaga sieci), a **od 2.1.0 także e-mail/kod pilota + hasło** na `00f` dla wspólnego tabletu (decyzja 2026-09-16 - sekcja „Logowanie hasłem i sesje logowania" niżej; zapomniane hasło = link z e-maila, kodów nie ma); codzienny powrót = odblokowanie PIN-em (działa offline). Rejestracja jest OTWARTA, ale dostęp daje dopiero **przyjęcie do KLUBU**: logowanie zakłada OSOBĘ bez klubu, a do klubu wchodzi się **kodem klubu** (`00e` → `pending` → `00c`; administrator zatwierdza z kodem pilota i rolą albo odrzuca z powodem czytanym na `00d`). Bramką jest brak CZŁONKOSTWA, nie rola i nie brak konta - patrz sekcje „Logowanie przez Google" i „Wielofirmowość … JEDNA droga dołączenia" niżej
- **Rozpoczęcie lotu ma trwać kilka sekund** - trzy kroki (samolot+Dual → zadanie → liczniki) i „ROZPOCZNIJ LOT" prowadzi wprost do kokpitu. Nie pytamy o czas meldowania i nie ma ekranu podsumowania (dawny `03` usunięty): powtarzał to, co pilot wpisał sekundę wcześniej
- **Nazewnictwo wejścia w lot** (decyzja 2026-08-12): główny przycisk na 01 i CTA kroku 3 to **„ROZPOCZNIJ LOT"**, a nagłówek kroków brzmi **„NOWY LOT · n/3"**. Słowa **„przejmij / przejęcie" używamy WYŁĄCZNIE tam, gdzie maszynę odbiera się INNEMU pilotowi** (podgląd 04B, modal claimu, `session_claim` w rejestrze) - pilot startujący na wolnym samolocie niczego nie przejmuje, tylko zaczyna latać. Identyfikatory w kodzie (`claim`, `takeover`, `Preflight*`) zostają: to nazwy techniczne, nie napisy
- Tożsamość pilota jest znana w całej operacji - NIE pytamy o kod pilota w formularzach
- Samolot wybieramy z listy zarejestrowanych jednostek (dropdown/lista kart), NIE pole tekstowe
- Rodzaj operacji - siatka kart z ikonami, NIE select. Nazwy dla pilota: Skoki / **Przelot** / Egzamin / Lot tech. / Inne (wartości w rejestrze zostają angielskie - `ferry` to identyfikator, nie napis)
- **Rodzaj operacji wyznacza pola trasy** (issue #13): skoki = JEDNO lotnisko (startują i lądują na tym samym placu), pozostałe operacje = para start → lądowanie. Reguła mieszka w domenie (`isSameFieldOperation`) i tą samą odpowiedzią uzbraja bramkę lądowania w detekcji - formularz i detekcja nie mają jak się rozjechać
- **Rodzaj operacji wyznacza też dostępne akcje** (issue #19): zrzut skoczków istnieje wyłącznie w dniu skokowym (`isJumpOperation`) - przy przelocie czy egzaminie przycisku NIE MA (to brak akcji, nie blokada z powodem: `drop` nie może się tam wydarzyć)
- **Zrzut i załadunek to para** (issue #21, 2026-08-11): na ziemi dnia skokowego slot zrzutu w pasku akcji zajmuje ZAŁADUNEK (`boarding` - znacznik wejścia skoczków na pokład, skład OPCJONALNY), przed startem także kafelek na 04a. Zadeklarowany skład wypełnia arkusz zrzutu 05e - w locie pilot tylko POTWIERDZA listę; zrzut konsumuje załadunek. Skład przy zrzucie też OPCJONALNY (`null` = niepodany, nie zero) - przycisk zapisu zrzutu nie ma stanu zablokowanego. Wysokość zrzutu = średnia z okna `DROP_ALT_WINDOW_SEC` (15 s), nie ostatni fix

## Offline-first (obowiązuje w designie i implementacji)
Pełna architektura: `docs/_main.md.txt` (sekcje 4–6). Zasady twarde:

- **Brak sieci NIGDY nie blokuje pracy pilota** - sieć to okazja do synca, nie warunek. Jedyny świadomy wyjątek: utworzenie profilu (pierwsze logowanie / zapomniany PIN) wymaga sieci - tryb awaryjny bez tożsamości został rozważony i ODRZUCONY, nie proponuj go ponownie
- Zapis = lokalne zdarzenie append-only (SQLite, UUID) → outbox wysyła automatycznie, gdy jest sieć; eksport do Sheets robi serwer (**pilot niczego nie eksportuje ręcznie**). Osobnego ekranu statusu NIE MA od 2026-08-12 - był trzecim widokiem tej samej operacji (tabela lotów i „dane dnia" = ekran 10) i drugim wskaźnikiem sieci (kolejka = arkusz SyncChipa). Została sekcja w Ustawieniach (13): kolejka, ostatnia udana wysyłka, **uwagi serwera** (§4.5 - jedyne ich miejsce w aplikacji, bo SyncChip pojawia się tylko offline) i awaryjne „Synchronizuj teraz"
- **Outbox ma DRUGI kierunek** (issue #32, 2026-08-12): `GET /me/events` odbudowuje lokalny rejestr z serwera po czyszczeniu pamięci aplikacji, reinstalacji albo na nowym telefonie (`application/sync/eventRestore.ts`, kursor per pilot, zapis od razu ze stemplem wysyłki). **To NIE jest wyjątek od offline-first - to jego warunek**: pobranie zasila REJESTR, nie EKRAN. „Mój dzień", „Historia dni" i statystyki dalej liczą się WYŁĄCZNIE z lokalnego strumienia (§6 pkt 1), więc nie wolno kazać im pytać serwera. Jedyny ślad w UI jest negatywny - dopóki pierwsze odtworzenie nie wróci, ekran nie rysuje stanu pustego (`streamHydrated` w store operacji), bo „jeszcze żadnego lotu" pokazane pilotowi z trzema operacjami wygląda jak utrata danych. Pełny opis: `docs/_main.md.txt` §4.9
- **Ślad GPS jest JEDYNYM świadomym wyjątkiem** (issue #47, 2026-08-14): nagranie idzie na serwer i telefon kasuje kopię, więc ekran 14 bez zasięgu nie narysuje trasy (wariant `14c` mówi to wprost i pokazuje czasy z lokalnego rejestru). Wyjątek dotyczy WYŁĄCZNIE geometrii - czasy, loty i rozliczenie operacji liczą się lokalnie jak dotąd. Sekcja „Ślad idzie z SERWERA" wyżej, pełny opis: `docs/_main.md.txt` §4.10
- Komponenty dzielimy wg źródła danych:
  1. **dane operacji** (timery, log samolotu na `04`, lista operacji doby na `01`, liczniki, statystyki) - lokalne, zawsze świeże, zero wariantów offline
  2. **dane z serwera** (przekazanie FOB/MH, status claim, lista pilotów) - 3 stany świeżości: `live` (bez adnotacji) / `cache` ("· z cache · sync 21 JUN 17:30", amber) / `brak` ("brak danych - wpisz z licznika")
  3. **akcje wymagające sieci** (pierwsze logowanie, zmiana konta, ręczny sync) - offline: disabled z podanym powodem, nigdy cichy błąd
- Jeden globalny wskaźnik łączności: SyncChip - nie rozsiewamy komunikatów o braku sieci po ekranach. **Online nie rysuje NIC** (decyzja 2026-08-06, issue #12: „zsynchronizowano" to stan domyślny, a plakietka świecąca przez 99% czasu uczy oko ignorować róg ekranu). Offline: **SAM pill** `OFFLINE · n`; tapnięcie otwiera arkusz szczegółów synchronizacji (kolejka, ostatni udany sync, wiek danych referencyjnych - issue #23 pkt 5, wzorzec `01c`). Stemple syncu nie wiszą na ekranie na stałe. **Arkusz MA akcję „PONÓW PRÓBĘ"** (uwaga z urządzenia, 2026-08-30) - odwraca to zdanie z issue #23 („arkusz jest INFORMACYJNY, bez akcji: przycisk-atrapa uczyłby, że trzeba pomagać"), bo ponowienie NIE JEST atrapą: robi to samo, co „SYNCHRONIZUJ TERAZ" w ustawieniach (dopycha kolejkę i pyta o dane referencyjne z pominięciem bramy wieku, issue #55). Znikły za to stopka odsyłająca po ten przycisk do ustawień oraz zdanie „brak zasięgu niczego nie blokuje" - drugie odpowiadało na obawę, której pilot nie zgłosił, a przez to ją podsuwało
- **„OFFLINE" ZNACZY WYNIK OSTATNIEJ PRÓBY, NIGDY NIEPUSTĄ KOLEJKĘ** (uwaga z urządzenia,
  2026-08-30: „w logach api widzę, że udało się połączenie, ale UI nadal mówi, że jest
  offline"). Chip liczył stan jako `outboxCount === 0 ? 'synced' : 'offline'`, więc KAŻDA
  zaległość była „brakiem sieci" - także taka, która stoi dlatego, że serwer ODPOWIEDZIAŁ
  i odmówił. Właściwą definicję aplikacja miała już w dwóch innych miejscach (Ustawienia:
  „innego pojęcia o sieci aplikacja nie ma i nie udaje, że ma"; plakietka zaległości na 12
  z issue #35), a chip był jedynym z definicją drugą - powtórzoną w piętnastu ekranach.
  Odtąd rachunek jest JEDEN, w `components/status/syncIndicator.ts`, a ekran podaje samo
  `<SyncChip />`: szesnasta kopia nie ma jak się rozjechać, skoro nie ma czego kopiować
- **TRZECI STAN: `blocked`** (`SYNC STOI · n`, CZERWONY, mockup `01d`) - serwer odmówił
  albo sesja wygasła. To NIE jest offline i nie wolno tego tak nazywać: sieć jest, a
  kolejka mimo to stoi i sama nie ruszy. Bursztyn w tej aplikacji znaczy „poczekaj, samo
  przejdzie", więc kolor musi je rozróżniać już na pillu. Baner nazywa powód, uspokaja
  o ZAPISACH (rejestr na telefonie jest kompletny - bez tego czerwień czyta się jak utrata
  danych), niesie KOD odmowy (pilot przeczyta go administratorowi) i kończy się DROGĄ
  WYJŚCIA. Rozdzielenie stanów nie jest ozdobą awarii - bez niego jedyną odpowiedzią na
  odmowę serwera było zdanie o czekaniu na zasięg
- **KAŻDA AKCJA MUSI ZOSTAWIĆ ŚLAD, TAKŻE NIEUDANA** - wiersz „Ostatnia próba"
  (`sessionStore.lastAttemptAt`, osobno od `lastSyncAt`: tamto mówi, ile lat mają dane,
  to - czy przycisk zadziałał). Przy nieudanym ponowieniu NIC innego w arkuszu się nie
  zmienia: kolejka stoi, stempel udanego syncu stoi, pill stoi - więc bez tego wiersza
  tapnięcie było nieodróżnialne od martwego przycisku. Przycisk mówi przy tym, co się
  DZIEJE („WYSYŁANIE…"), a nie tylko gaśnie; to nie jest wyjątek od §6 pkt 3, bo tamta
  reguła dotyczy BLOKAD, a to jest postęp czynności, o którą pilot właśnie poprosił
- **DWA LIMITY CZASU, BO DWA RÓŻNE PYTANIA** (`SyncTrigger` w porcie serwera): pętla
  tła czeka 8 s, ponowienie z ręki pilota 30 s. Krótki limit jest słuszny w tle - przy
  słabym zasięgu lepiej szybko powiedzieć „offline" i wrócić za minutę - ale pod
  przyciskiem rachunek się odwraca: nikt nie wróci za minutę, bo pilot stoi i patrzy,
  a sięga po ponowienie DOKŁADNIE wtedy, gdy długo nic nie szło, czyli gdy serwer
  zdążył się uśpić. Zimny start dłuższy niż 8 s zamieniał udaną wysyłkę w „brak sieci":
  telefon rzucał `abort()`, serwer w tym samym czasie przyjmował paczkę i zapisywał ją,
  a w logach API zostawał sukces przy pilocie patrzącym na OFFLINE. **Port przyjmuje
  KTO POPROSIŁ, nigdy milisekundy** - warstwa aplikacji wie, czy przy telefonie ktoś
  stoi, a ile trwa obudzenie instancji wie wyłącznie transport
- **ARKUSZ ŻYJE DŁUŻEJ NIŻ PILL**: udane ponowienie gasi wskaźnik, ale arkusz zostaje
  otwarty ze zdaniem „Wysłano n". Do 2026-08-30 komponent zaczynał się od `return null`,
  więc jedyny przypadek z dobrą wiadomością wyrywał pilotowi arkusz z rąk - a zniknięcie
  jest fatalnym raportem, bo wygląda dokładnie tak samo jak awaria
- Blokada PIC = optymistyczny claim - przejęcie samolotu działa też offline (ostrzeżenie z danych cache)
- Wygasły token ≠ wylogowanie; wylogowanie zablokowane przy niepustym outboxie
- Liczniki fizyczne (MH, paliwomierz) > dane z serwera - serwer tylko podpowiada

## Reguły przy zlecaniu agentom
Gdy tworzysz prompt dla agenta do tworzenia HTML mockupów, zawsze dołącz:
1. Pełne design tokeny CSS z `:root` (z sekcji wyżej)
2. Szablon ramki właściwej dla powierzchni: aplikacja pilota → phone frame (393×852px,
   `--phone-scale`, Dynamic Island); panel → kopia ramy z `design/panel/SZABLON.html`
   (okno 1440×900, pasek górny, kolumna boczna z kontekstem klubu, `.content > .page`),
   BEZ własnego bloku `<style>` - style panelu są jednym generowanym arkuszem
   (`panel.css`), a nowy komponent wchodzi do `admin/src/styles/components/` i do
   inwentarza szablonu (sekcje „Browser frame" i „Styl lekki panelu" wyżej)
3. Informację że aplikacja = Ninerdeck
4. Linki nawigacyjne do sąsiednich ekranów w `nav-strip`
5. Nazwy plików do stworzenia i docelowy katalog `d:\uz_areo\design\`
6. Gdy ekran pokazuje dane z serwera - stany świeżości `live`/`cache`/`brak` i SyncChip (sekcja Offline-first wyżej). **Online SyncChip nie rysuje NIC** - plakietka istnieje wyłącznie offline
7. Gdy ekran ma warianty - panel „Warianty tego ekranu" na canvasie z opisem kiedy który (sekcja Nawigacja i warianty wyżej)
8. **Gdy ekran dotyka czasu, dnia albo zamknięcia czegokolwiek - sekcje „Operacja = jeden bieg silnika" i „Dzień pilota = lista operacji" wyżej**: operacja = jeden bieg silnika (po STOP nie ma drugiego startu - hero to ZDAJ SAMOLOT), lot = start→lądowanie, słowo „wzlot" wycofane; jednostką potwierdzenia jest OPERACJA, odczyty przy zdaniu (`09b`) OBOWIĄZKOWE; dzień pilota to LISTA OPERACJI - klamry służby, meldunku i „Zamknij dzień" NIE MA (issue #23); zdanie samolotu NIE kończy dnia. Bez tego punktu agent zbuduje ekran poprawny wizualnie i błędny modelowo - dokładnie tak powstał flow, który właśnie przebudowaliśmy
9. **Gdy ekran czeka na jakikolwiek odczyt** - sekcja „Stan ładowania" niżej i arkusz
   `design/LOADERY.html`: skeleton w geometrii docelowej, nigdy spinner, nigdy pustka;
   stan pusty i triada świeżości `live`/`cache`/`brak` zostają osobnymi rzeczami

## Stan ładowania - skeleton, nigdy spinner (issue #33)
Wzorzec obowiązuje **każdy ekran** i ma swój arkusz: `design/LOADERY.html` (siedem reguł
+ inwentarz rozmiarów plamek). W kodzie: `docs/architektura-kodu.md` §2 „Stan ładowania".
- ekran, który czeka na odczyt, rysuje **plamki w geometrii docelowej** - nigdy spinnera
  i nigdy pustki. Jedno wejście: `const skeleton = useSkeleton(!loaded)`
- plamka należy się temu, co **na pewno przyjdzie**; element opcjonalny miejsca nie
  rezerwuje, a przy wariantach o różnym kształcie skeleton obiecuje ich część wspólną
- **co znamy lokalnie, nie czeka**: nagłówek, tytuł karty, statyczne wejścia nawigacyjne
- **skeleton ≠ stan pusty** („brak wyników" dopiero po `streamHydrated`, §4.9)
  i **skeleton ≠ triada świeżości** (`live`/`cache`/`brak` zostaje tam, gdzie jest -
  serwer, który nie odpowiedział, nie jest tym samym co odczyt w toku)
- próg **180 ms**, minimum **420 ms** (`ui/screens/logic/skeletonGate.ts`, testy) - odczyt
  z SQLite mieści się zwykle pod progiem, więc na co dzień plamek nie widać
- puls przezroczystości wspólny dla całego ekranu, `useNativeDriver`; **nie shimmer** -
  gradienty w RN wymagają modułu natywnego, którego projekt unika
- **pusta tablica nie znaczy „brak danych"** - każdy odczyt listy ma osobną flagę `loaded`.
  Bez niej ekran pisze „Brak samolotów w pamięci urządzenia" w trakcie normalnego startu

## Banery - trzy typy (szczegóły: `docs/design-notes.md`)
- **Status** (offline, tylko-odczyt, odliczanie) - nigdy zamykalny, to przyrząd
- **Ostrzeżenie warunkowe** (paliwo/MH, załoga) - znika samo z warunkiem, nie zamyka się ręcznie
- **Pouczający jednorazowy** - zamykalny `×` → zwija się do mini-`(?)` w miejscu; stan schowany zapamiętany NA STAŁE per pilot. Klasy `.edu-dismiss`/`.edu-mini`, funkcje `eduCollapse/eduExpand`

## Czego unikać
- Nie dodawaj **spinnera** - nigdzie. Czekanie na dane pokazuje skeleton w geometrii
  docelowej (sekcja „Stan ładowania" wyżej); ekranu ładowania z logo też nie ma
  (dawny splash został usunięty)
- Nie używaj natywnego `<select>` - zawsze stylizowana lista kart
- Nie wpisuj hardcoded kolorów - tylko zmienne CSS
- Nie twórz nowych plików poza `design/` i `app/` bez pytania
