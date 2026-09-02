# UZ Aero - instrukcje dla Claude Code

## Nazwa aplikacji
Aplikacja nazywa się zawsze **UZ Aero** (mixed case w tekście, **UZ AERO** w nagłówkach display/Bebas Neue).
Stare nazwy - `e-Chronometraż`, `e-CHRONO`, `CHRONO` - są błędne, nigdy ich nie używaj.

## Projekt
Aplikacja Android (React Native + Expo) - elektroniczny system lotniczy dla pilotów.
Rejestruje: czasy blokowe, paliwo, starty/lądowania, eksportuje do Google Sheets.
Dokumentacja: `docs/_main.md.txt`

Stack: React Native + Expo · Zustand · expo-sqlite · expo-location · własny backend (Node/TS + PostgreSQL) · eksport do Google Sheets po stronie serwera

## Faza aktualna
**Monorepo: aplikacja RN w `app/`, backend w `server/`, wspólne pakiety w `packages/`** -
`@uzaero/domain` (zdarzenia, reguły, projekcje, detekcja), `@uzaero/tokens` (palety
dwóch motywów: ciemnego i jasnego, skale, typografia, emiter zmiennych CSS)
i `@uzaero/format` (czasy UTC, czas blokowy, motogodziny, litry). Wszystkie trzy to czysty TypeScript bez importów
z RN/DOM. `app/src/ui/theme/tokens.ts` i `app/src/ui/format.ts` są shimami zgodności -
kod ekranów importuje po staremu.
Fazy z `docs/_main.md.txt` §10: 1–4 ✅ **wobec modelu sprzed 2026-08-06** (ekrany 00–12 komplet; sync end-to-end z eksportem §4.7 na kartach W BAZIE - `exported_sheets` + `GET /sheets/:tab`; adapter Google Sheets = opcjonalna przyszła podmiana portu `SheetsPort`, gdy będzie klucz) · **faza 8 = przebudowa flow, WYPRZEDZA fazę 5** (patrz niżej) · potem: 5 testy z pilotami, 6 wdrożenie + backlog audytu.
Faza 7 **panel administracyjny (web)** - backend wdrożony w całości (role, `/admin/*`, cykl życia flagi, audyt) i **nietknięty**; klient web przepisany na **PANEL 2.0** (2026-08-30, gałąź `panel-2.0`): dwa moduły - **PILOCI i SAMOLOTY** - zamiast jedenastu ekranów, bez banerów wyjaśniających, bez kafli z licznikami, z paskiem górnym zamiast kolumny bocznej. Trzeci moduł - **DZIENNIK** (2026-08-30): trzy poziomy (flota w zakresie dat → grid operacji jednej maszyny → jedna operacja z osią zdarzeń), dziewięć kolumn zamiast siedemnastu, wyłącznie ODCZYTY - zero szacunków i prognoz, brak odczytu widoczny jako kreska. Wymagał migracji 3 (osiem kolumn projekcji: bieg silnika, koperta lotów, lotniska, dolewka paliwa, wpis ręczny, olej do lotu) i **przebudowy projekcji na istniejących wierszach**. Decyzje, reguły redakcyjne i liczby: **`docs/panel-2.0.md`**; szkielet warstw dalej w `docs/architektura-panelu-frontend.md`. Pozostałe ekrany (pulpit, dni, flagi, zdarzenia, eksporty, audyt, statystyki, analityka, konserwacja) usunięte z kodu i odzyskiwalne z historii gita - wracają pojedynczo, każdy przepisany pod reguły 2.0. **`design/admin/` (23 ekrany, `SZABLON.html`, `ANALIZA.md`) jest odtąd ARCHIWUM panelu 1.0**, nie specyfikacją.
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

### Czcionki
- `Bebas Neue` - nagłówki display, timery duże, canvas labels
- `Archivo` - body text, etykiety, przyciski
- `JetBrains Mono` - cyfry timerów, kody ICAO, wartości GPS, kody pilotów

### Phone frame (`design/*.html` - aplikacja pilota)
Każdy mockup używa ramki telefonu 393×852px (iPhone 14 Pro) z `--phone-scale` do auto-skalowania.
Struktura: `.canvas-label` → `.phone` (z Dynamic Island `::before`) → `.nav-strip`

### Browser frame (`design/admin/*.html` - panel 1.0, ARCHIWUM)
> **Panel 2.0 nie ma makiet i to jest decyzja** (`docs/panel-2.0.md` §3.7): makieta
> zastępuje oglądanie rzeczy, której nie da się jeszcze uruchomić, a panel jest stroną
> widoczną w przeglądarce w chwili zapisania pliku. Reguła „ekran wdrażamy 1:1
> z `design/*.html`" **zostaje w mocy dla aplikacji pilota** (`app/`) i nic w niej nie
> zmieniamy. Poniższy opis dotyczy archiwum 1.0.

Panel to **aplikacja web**, więc ramką jest okno przeglądarki 1440×900 z `--app-scale`
(działa dokładnie jak `--phone-scale`) i paskiem chrome zamiast Dynamic Island.
Struktura: `.canvas-label` → `.browser` (`.chrome` → `.shell` = `.sidebar` + `.main`) → `.nav-strip`.
**Nowy ekran panelu zaczyna się od skopiowania `<head>` z `design/admin/SZABLON.html`** -
tam mieszkają tokeny, rama, kanoniczny sidebar i inwentarz komponentów back-office'u
(tabele, plakietki stanu, szuflada `.drawer`, oś zdarzeń, stany puste). Nowy komponent
dokładamy do szablonu, nie do pojedynczego ekranu.
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

## Screen flow (kolejność ekranów - model 2026-08-10, bez klamry od issue #23)
```
00-login → 01-moj-dzien (EKRAN DOMOWY - płaski log operacji dnia; warianty: 01a pusty,
  01c offline + arkusz szczegółów synchronizacji)
01-moj-dzien → 02-samolot → 02e-zadanie → 02a-liczniki → „ROZPOCZNIJ LOT"
→ 04a-kokpit PRZED URUCHOMIENIEM (tankowanie / załadunek skoczków w dniu skokowym /
  zmiana załogi / zdanie bez lotu 09c)
→ START ENGINE → 05-cockpit-running (wiele startów i lądowań = LOTÓW w jednej operacji)
→ STOP ENGINE → 04-kokpit PO ZATRZYMANIU (hero = ZDAJ SAMOLOT; tankowanie nadal;
  drugiego START ENGINE NIE MA - kolejny lot to nowe przejęcie)
→ 09b-zdaj-samolot (odczyty paliwa i MH OBOWIĄZKOWE = zatwierdzenie logu operacji;
  wariant 09c: zdanie bez lotu) → 01-moj-dzien
01-moj-dzien → 15-reczny-lot (wpis CAŁEGO lotu po fakcie - STEPPER 4 kroków od
  2026-08-16: 15 data+samolot+Dual (data pierwsza - issue #58) → 15a zadanie →
  15b czasy i loty → 15c liczniki; arkusze: 15d czas zdarzenia na TimeStepperze,
  15e data lotu na KALENDARZU miesięcznym)
01-moj-dzien → 12-historia („Poprzednie dni" - operacje spoza dzisiejszej doby);
  KAFELEK operacji → 10-statystyki (ekran OPERACJI: detale i korekty TEJ operacji)
12-historia → karta w oknie 24 h → 10-statystyki; karta po oknie → 10b (ten sam
  ekran w trybie PODGLĄDU: bez „Edytuj dane")
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
**Wszystko wraca do 01, nie do kokpitu.** Dzień pilota nie ma „startu" ani „końca" jako
kroków flow: zaczyna się pierwszą operacją i NICZYM się nie domyka - „Zamknij dzień",
ekran 01b i klamra służby zostały usunięte (issue #23). Wyjście działa też offline -
niepusty outbox nigdy nie więzi pilota na ostatnim ekranie (§4.1).

### Kokpit jest stanem modalnym (decyzja 2026-08-10)
**Dopóki pilot trzyma samolot, z kokpitu nie ma wyjścia bokiem** - z 04/05 nie prowadzi
żadna droga na 01. Maszynę oddaje się przez „Zdaj samolot" (09b) i to ona wraca na 01;
akcje ground (06/07/08) i 09 wracają do kokpitu. Wyjątkiem są ustawienia (13), bo tam
wraca się tym samym krokiem.
Konsekwencje przy każdej zmianie kokpitu:
- **nie dokładaj linków na 01** - ani paska, ani przycisku, ani wpisu w nagłówku. Pasek
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
- na 01 lista operacji dnia (różne zadania, różne maszyny) + ręczny wpis CAŁEGO lotu (15).
- zysk uboczny analityki: każda operacja domknięta odczytami z OBU stron - znika patologia
  interwałów degeneracyjnych między ostatnim `leg_close` a zdaniem (§3.6b).

## Sygnatura operacji lotniczej (issue #68, 2026-09-01)
Zgłoszenie: „brakuje nam nazwy operacji - wyświetlamy w różnych miejscach guid".
Uuid nadaje się do ADRESOWANIA (klucz w bazie, ścieżka w panelu, cel korekty) i do
niczego więcej: `7c1e5a9b-…-83b4` nie da się przeczytać przez telefon administratorowi,
wpisać w zgłoszenie ani znaleźć wzrokiem na liście.

    SP-AXA/2026-09-01/AKO/1
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
  wpisu (10L), grid i nagłówek DZIENNIKA w panelu, potwierdzenie unieważnienia w panelu
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
  kłamała). Niebieski status „Twój dzień liczy się dalej" stoi odtąd WYŁĄCZNIE w stanie
  ze zmianą - jeden slot, dwa stany, nigdy oba
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
  `ADMIN_SESSION_TTL_SEC`, `refresh_tokens`, ciasteczko `uzaero_admin` - tam „sesja"
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
  z tarczy. Separator stawia odtąd MASKA (`maskMotoHoursInput` w `@uzaero/format`):
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
    Odmiana idzie przez `landingsCount` w `@uzaero/format`, wspólną z osią
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
  oglądanym w spoczynku - 22 px robiło z każdej wartości bohatera ekranu. Wielkie
  stopnie zostają w ARKUSZACH edycji (odczyt 32, `ReadingSheet`) - tam się wpisuje,
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
  → `Sheet.onShow`; korzystają AirfieldSheet, TextEntrySheet, ReadingSheet. TRZY
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
  Nagłówek miesiąca w MIANOWNIKU (`monthYearUtc` w `@uzaero/format`)
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
    niesie ŹRÓDŁO przy polu („z poprzedniego lotu · AKO"), więc nie udaje odczytu
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
  jednostka trafiła do UZ Aero. **Zero znaczy w nich co innego**: norma zerowa jest
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
  w ogóle. Kokpit ma go odtąd tak samo jak 10, razem z podpisem „odczyt 112 L · 1 236:30"
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

## Pilot i samolot - UX
- Pierwsze logowanie: login + hasło na `00-login.html` (konta zakłada administrator w bazie, BEZ samodzielnej rejestracji i BEZ Google OAuth - decyzja odwrócona 2026-07-22; wymaga sieci); codzienny powrót = odblokowanie PIN-em (działa offline)
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
   `--phone-scale`, Dynamic Island). **Dla panelu makiet nie zlecamy** - od 2.0 ekran
   powstaje wprost w `admin/` i ogląda się go w przeglądarce (`docs/panel-2.0.md` §3.7)
3. Informację że aplikacja = UZ Aero
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
