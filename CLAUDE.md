# UZ Aero — instrukcje dla Claude Code

## Nazwa aplikacji
Aplikacja nazywa się zawsze **UZ Aero** (mixed case w tekście, **UZ AERO** w nagłówkach display/Bebas Neue).
Stare nazwy — `e-Chronometraż`, `e-CHRONO`, `CHRONO` — są błędne, nigdy ich nie używaj.

## Projekt
Aplikacja Android (React Native + Expo) — elektroniczny system lotniczy dla pilotów.
Rejestruje: czasy blokowe, paliwo, starty/lądowania, eksportuje do Google Sheets.
Dokumentacja: `docs/_main.md.txt`

Stack: React Native + Expo · Zustand · expo-sqlite · expo-location · własny backend (Node/TS + PostgreSQL) · eksport do Google Sheets po stronie serwera

## Faza aktualna
**Monorepo: aplikacja RN w `app/`, backend w `server/`, wspólne pakiety w `packages/`** —
`@uzaero/domain` (zdarzenia, reguły, projekcje, detekcja), `@uzaero/tokens` (palety
pięciu motywów, skale, typografia, emiter zmiennych CSS) i `@uzaero/format` (czasy UTC,
czas blokowy, motogodziny, litry). Wszystkie trzy to czysty TypeScript bez importów
z RN/DOM. `app/src/ui/theme/tokens.ts` i `app/src/ui/format.ts` są shimami zgodności —
kod ekranów importuje po staremu.
Fazy z `docs/_main.md.txt` §10: 1–4 ✅ **wobec modelu sprzed 2026-08-06** (ekrany 00–12 komplet; sync end-to-end z eksportem §4.7 na kartach W BAZIE — `exported_sheets` + `GET /sheets/:tab`; adapter Google Sheets = opcjonalna przyszła podmiana portu `SheetsPort`, gdy będzie klucz) · **faza 8 = przebudowa flow, WYPRZEDZA fazę 5** (patrz niżej) · potem: 5 testy z pilotami, 6 wdrożenie + backlog audytu.
Faza 7 **panel administracyjny (web)** — projekt UI zamknięty (`design/admin/`: 23 ekrany, `SZABLON.html`, `ANALIZA.md`), a backend i klient web **są wdrożone**: role, `/admin/*`, cykl życia flagi, audyt oraz `admin/` (React+Vite, ekrany A01–A11 z modułami czystymi 1:1 z testami).
**Analityka zużycia** (2026-08-05) — wdrożona end-to-end: domena `packages/domain/src/consumption/` (interwały paliwowe odczyt→odczyt, NNLS per faza, przelicznik MH z automatycznym rozpoznaniem obrotomierz/Hobbs, oś faz pionowych ze śladu), `GET /admin/api/fleet/:id/consumption` + ekran A10a/A10b w panelu, norma zużycia w aplikacji pilota (migracja serwera 19 + SQLite 4, ekrany 04/06/10). Reguła czytania strumienia poza listami: `docs/architektura-panelu-serwer.md` §7.7; przepis „nowa metryka analityki": `docs/architektura-kodu.md` §7.
**Progi analityki są DO KALIBRACJI** (`consumption/policy.ts`) — służy do tego `server/scripts/consumptionReplay.ts`, który puszcza realną historię przez ten sam kod, co serwer. Pierwszy przebieg (2026-08-05) znalazł pięć wad, każda ma test regresyjny; nie strojimy tych progów w dyskusji.
**PIVOT MODELU 2026-08-10 — SESJA = JEDEN BIEG SILNIKA** (sekcja „Sesja = jeden bieg
silnika" niżej). Story użytkownika częściowo odwraca przebudowę z 2026-08-06: `leg_close`
do usunięcia, ekran 09 scala się z 09b, odczyty przy zdaniu OBOWIĄZKOWE, 09a ginie.
Etapy pivotu: **A' design+docs ✅** → **B' domena ✅** (SESSION_ALREADY_RAN; `leg_close`
wycięty z domeny, app i serwera z mechaniczną kaskadą; okno korekty = 24 h od ZDANIA
z domkniętą granicą; `CURRENT_SCHEMA_VERSION` z powrotem = 1; kanoniczny dzień 22 JUNE
przebudowany na TRZY sesje z łańcuchem MH przez zdania) → C' app (ekrany 1:1 z nowych
mockupów) → D' serwer+panel (słownik, oś zdarzeń, admin/) → E' seed+demo.
Opisy etapów B–D niżej zostają jako historia — częściowo już cofnięte.
**PRZEBUDOWA FLOW** (od 2026-08-06, gałąź `poc-zmiany-flow`) — dzień służby przestał
być kontenerem na loty (patrz sekcja „Czas służby" niżej). Rozjazd design↔kod jest świadomy
i tymczasowy: mockupy prowadzą, kod dogania. **Nie „naprawiaj" ekranów RN pod stare mockupy
— zostały usunięte.**
- **Etap A ✅** — `design/` i dokumentacja przebudowane i zacommitowane.
- **Etap B ✅ DOMKNIĘTY** (`packages/domain`) — pięć kroków, każdy z testami:
  - **B1 ✅** `leg_close`, `CURRENT_SCHEMA_VERSION` = 2, `dutyStart`/`dutyEnd` opcjonalne,
    trzy reguły `LEG_*`.
  - **B2a ✅** `EngineRun` → **`Leg`** (`engineRuns` → `legs`): wzlot to cykl silnika
    RAZEM z potwierdzeniem (`confirmed`, `confirmedAt`, `reading`, `notes`). Nie ma
    osobnej tablicy obok — to ten sam byt.
  - **B2b ✅** `projections/duty.ts` — `projectDuty(sessions, pilotId, day)` jako CZYSTA
    funkcja POZA `SessionState`. Klamra = **unia** deklaracji i wzlotów (tu mieszka
    reguła „służba ⊇ suma wzlotów"); `declaredStart/End` obok, żeby UI umiało napisać
    „poprawione"; `declarationNarrowsStart/End` na ostrzeżenie. Przynależność wzlotu
    do doby wyznacza czas URUCHOMIENIA silnika, nie zamknięcia.
  - **B3 ✅** okno korekty kotwiczy się we WZLOCIE (`leg_close`, awaryjnie `engine_stop`),
    osobno dla każdego; `eventIndex` niesie `{type, at}`, żeby regułę dało się przypisać
    do konkretnego wzlotu. **Administrator NIE JEST NIGDY BLOKOWANY** (decyzja 2026-08-07)
    — przy kolizji dostaje ostrzeżenia `ADMIN_EDIT_SESSION_ACTIVE` /
    `ADMIN_EDIT_PILOT_WINDOW_OPEN`. Twarde reguły są w obu trybach IDENTYCZNE bez wyjątku;
    pilnuje tego `writeAuthority.test.ts` i to on złapał błąd, w którym miękkie
    ostrzeżenie w „kopercie" wycinało komplet reguł per typ.
    **Do etapu D zostaje bramka `400 day_open` w panelu** — domena jej już nie egzekwuje.
  - **B4 ✅** `consumption/intervals.ts` czyta `leg_close`: odczyt przy wzlocie działa jak
    tankowanie bez dolewki (zamyka interwał i otwiera następny tą samą wartością), a wzlot
    BEZ odczytu nie tworzy granicy w ogóle.
  - **B5 ✅** (poprawka znaleziona dopiero w etapie C, 2026-08-07) — projekcja dostała
    `claimedAt` i **`preflightAt`**, bo `PREFLIGHT_REQUIRED` pytało o `state.dutyStart`.
    Po B1 godzina meldunku jest opcjonalna i ekran 02 o nią NIE PYTA, więc reguła
    unieruchamiała silnik i blokowała zdanie samolotu pilotowi, który zrobił wszystko
    dobrze. Komplet 906 testów tego nie widział, bo KAŻDY helper podawał `dutyStart` —
    stąd nowy blok „preflight bez deklaracji meldunku" w `rules.test.ts`.
    Przy okazji `day_close` ma `noFlightReason` (09C) z miękką flagą
    `NO_FLIGHT_WITHOUT_REASON`: brak powodu nie może kasować faktu, że maszyna stała zajęta.
    **ETAP B DOMKNIĘTY.**
- **RYZYKO §3.6b — warunek wstępny SPEŁNIONY 2026-08-08**: generator demo
  (`server/scripts/demo/`) przebudowany pod nowy model. Produkuje cztery style pracy
  z ekranem 09 (`ConfirmStyle`: odczyt przy każdym wzlocie / co trzeci / potwierdzenie bez
  odczytu / brak potwierdzenia), próby silnika bez lotu i jeden wzlot przerwany —
  czyli materiał, na którym `consumptionReplay.ts` da się uruchomić sensownie. Pierwszy
  przebieg (bez strojenia) pokazał: próg 30 min stoi 2 min pod typowym wzlotem skokowym;
  dzień skokowy NIE ROZDZIELA ziemi od lotu przy żadnej liczbie danych (stała proporcja
  faz → `collinear`), rozdział wychodzi tylko na maszynie z różnorodnym ruchem; sesja
  „skrupulatna" produkuje do 25% interwałów degeneracyjnych między ostatnim `leg_close`
  a zdaniem samolotu. **Progów nadal NIE stroimy w dyskusji** — to osobna decyzja
  po kalibracji na tych danych (`docs/_main.md.txt` §3.6b).
- **Etap C** `app/` (ekrany 1:1 z nowych mockupów) — w toku:
  - **C1 ✅** komendy i store: `closeLeg`, `releaseAircraft` (dawne `dayClose`).
  - **C2 ✅** ekran 01 „Mój dzień" — `logic/myDay.ts` + `logic/heldAircraft.ts`.
    Dwa modele, bo to dwie OSIE: służba pilota przekrojowo po maszynach vs jedna sesja.
  - **C3 ✅** ekrany 09/09A (`LegCloseScreen`) i 09B/09C (`ReleaseAircraftScreen`) —
    po jednym pliku na parę, bo wariant to STAN tego samego ekranu, nie osobny ekran:
    seria skokowa włącza się obecnością zrzutu, 09C brakiem wzlotów. Logika w
    `logic/legClose.ts` i `logic/releaseAircraft.ts`.
  - **C4 ✅** przejęcie skrócone do trzech kroków (02 → 02e → 02a). `PreflightConfirmScreen`
    USUNIĘTY razem z trasą w nawigacji — zapis `session_claim` + `preflight_confirm`
    przeniósł się pod „PRZEJMIJ I LEĆ" na 02a. Godziny meldunku nie ma już ani w szkicu,
    ani w payloadzie. Konsekwencja: `dutyStart` w projekcji jest odtąd zwykle `null`,
    więc czytelnicy przeszli na `claimedAt` (historia, sortowanie sesji, nazwa karty
    arkusza, załoga). **Karta historii mierzy SESJĘ (przejęcie → zdanie), nie „Duty"** —
    służba należy do pilota i potrafi objąć kilka maszyn.
  - **C5 ✅** kokpit i nawigacja. `DutyStrip` → **`ClaimStrip`** (pasek sesji: czyja
    maszyna, od kiedy, ile wzlotów). **Od 2026-08-10 pasek został tylko w 04B** — patrz
    „Kokpit jest stanem modalnym" niżej. `DutyHero` → **`SessionHero`** na ekranie 10, gdzie bohaterem jest czas
    blokowy sesji, nie służba. **`SplashScreen` i `EndOfDayScreen` USUNIĘTE** — 01 jest
    ekranem domowym, a zdanie samolotu zastąpiło zamknięcie dnia. STOP ENGINE prowadzi
    na 09. Wznowienie po restarcie w `navigation/resumeTarget.ts`: pytamy o `closed`,
    bo `dutyEnd` po §3.6a nie odróżnia już sesji trwającej od zdanej.
  - **ETAP C DOMKNIĘTY** — aplikacja jest spójnie klikalna: 01 → 02/02e/02a → kokpit →
    09 → 09b → 01.
- **Etap D ✅ DOMKNIĘTY** serwer + panel:
  - **D1 ✅** `claim_time` = czas `session_claim` (migracja 21 z backfillem); pole DTO
    `dutyStart` → `claimedAt`. Przy okazji: walidacja payloadów nie znała `leg_close`,
    więc potwierdzenia wzlotów wracały jako `400 bad_payload` — cały etap C nie miał
    jak się zsynchronizować.
  - **D3 ✅** karta arkusza = DOBA SAMOLOTU (migracja 23): jedna karta na (doba, maszyna),
    sesje jako jej wiersze z kolumną `Sesja`; rewizja per karta, bramka flagi zawężona
    do sesji objętych flagą. Stary eksporter odrzucał KAŻDĄ sesję z nowego flow
    (bramka `dutyStart == null → no_preflight`).
  - **D4 ✅** `session_overlap` → `aircraft_overlap` (bramka arkusza) + `pilot_overlap`
    (nakładka grafiku, nowy `server/src/domain/pilotOverlap.ts`), migracja 22.
    Zetknięcie sesji co do minuty NIE jest nakładką — to normalny dzień po §3.6a.
  - **D2 ✅** bramka `400 day_open` **USUNIĘTA** (decyzja 2026-08-07): administrator może
    edytować ZAWSZE. `DayStillOpen` i `reason: 'day_open'` znikły z komendy i query
    korekt, trasa podglądu ma dziś JEDNĄ odmowę (404). Zamiast odmowy jedzie
    `warnings` — `correctionWarnings()` w `admin/correctionCandidate.ts` oddaje miękkie
    naruszenia domeny (`ADMIN_EDIT_SESSION_ACTIVE`, `ADMIN_EDIT_PILOT_WINDOW_OPEN`)
    i w podglądzie, i w wyniku zapisu. Panel rysuje z nich baner nad formularzem
    (`screens/correction/correctionWarnings.ts`), świadomie BEZ pola, z którego dałoby
    się wyprowadzić wyszarzenie przycisku — inaczej bramka wraca tylnymi drzwiami.
  - **D6 ✅** panel pod nowy model. `dutyStart` → `claimedAt` w `admin/` (bez tego panel
    się nie budował). Napisy poszły za nazwami: „duty 6:24" → „zajęty 6:24" na pulpicie,
    „Dzień otwarty" → „Samolot zajęty" na A02, kafel „Czas służby (duty)" na A02a
    zastąpiony przez „Samolot zajęty" (przejęcie → zdanie) — służba należy do PILOTA
    i obejmuje kilka maszyn, więc na karcie JEDNEJ sesji była pomyłką kategorii.
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
- **Dane demo i schemat bazy (2026-08-08)** — dwa zadania po etapie D:
  - **Generator demo przebudowany** (`server/scripts/demo/`): `dayStream.ts` → `sessionStream.ts`,
    `DemoDay` → `DemoSession`. Sesja ma TABLICĘ wzlotów (`engine_start`/`engine_stop` na
    każdy), payloady NIE niosą klamry służby, jest `leg_close` z opcjonalnym odczytem,
    `noFlightReason` (09C), dwie zmiany jednej maszyny w dobie i zetknięcie sesji co do
    minuty. **51 sesji, ~1400 zdarzeń, 6 typów flag na 7 egzemplarzach** — patologie są
    mniejszością (panel ma pokazywać normalny klub, nie klub, w którym wszystko zepsute).
    `pilot_overlap` spadł z 5 do 1 ZAMIERZONEGO; regułę, która to trzyma („pilot z otwartą
    sesją nie siada do innej maszyny"), opisuje docblock `scenario.ts`.
  - **Migracje ZGNIECIONE w jedną bazową** (`SCHEMA_VERSION = 1`). Uzasadnienia z 23
    docbloków przeniesione do komentarzy SQL przy kolumnach; historia pułapek (trzy
    podejścia do `NULLS LAST`, sprostowania `UNIQUE` dziennika eksportu, dwa przesunięcia
    znaczenia karty) do `docs/architektura-panelu-serwer.md` §7.8. Odwołania „migracja N"
    w kodzie przepisane na NAZWY rzeczy; w narracji historycznej tamtego dokumentu zostają.
    Zgniecenie jest wierne: 99 kolumn, 28 indeksów i 19 ograniczeń bez zmian, a
    `test/schema.test.ts` nie zmienił żadnej listy kolumn.
    **Uwaga operacyjna:** baza deweloperska założona przed zgnieceniem ma
    w `schema_migrations` numery do 23. Runner odmawia teraz startu na bazie NOWSZEJ niż
    kod (inaczej po cichu pominąłby kolejną migrację) — naprawa to
    `DELETE FROM schema_migrations WHERE version > 1`, nie migracja: schemat jest identyczny.

**Strażnik zgodności ZDJĘTY 2026-08-10 decyzją użytkownika.** Aplikacja nie jest nigdzie
wdrożona, więc: zgodność ze strumieniami `schema_version` 1/2 wylatuje z domeny W CAŁOŚCI
(wersja wraca do 1), kanoniczny dzień 22 JUNE w `projections.test.ts` zostaje PRZEBUDOWANY
pod nowy model (odtąd wzorzec poprawności, nie zgodności), a baz NIE migrujemy — schematy
edytujemy w miejscu, bazę dev kasujemy, seed + `seed:demo` stawiają świat od nowa.
- Mockupy w `design/` to **zatwierdzona specyfikacja**: ekran RN wdrażamy 1:1 z odpowiadającego pliku HTML, sekcja po sekcji, bez upraszczania. Wątpliwość do mockupu = rozmowa przed implementacją, nie cicha zmiana w kodzie.
- **Gdzie położyć nowy plik** (reguła od 2026-07-31, pełne uzasadnienie w `docs/architektura-kodu.md`):
  warstwa jest osią główną, a wewnątrz `application/`, `http/routes/` i `infrastructure/pg/`
  drugi poziom mówi, KOMU plik służy — `admin/` (tylko panel), `mobile/` (tylko aplikacja
  pilota), `common/` (obie powierzchnie; to twarde znaczenie, nie worek na resztę). Rzeczy
  bez powierzchni tam NIE trafiają: maszyneria Postgresa siedzi w korzeniu `infrastructure/pg/`,
  punkty wejścia w `server/src/bin/`, mapowania w `application/*/mappers/`. W aplikacji:
  komponenty w `ui/components/<sekcja>/` (osiem sekcji zgodnych z barrelem), czysta logika
  ekranów w `ui/screens/logic/`. Przenosisz plik — zaktualizuj ścieżki w `server/test/architecture.test.ts`, bo egzekwuje reguły PO ŚCIEŻCE.
- Architektura kodu i przepisy (nowy typ zdarzenia / reguła / ekran): `docs/architektura-kodu.md` (tam też zaległości audytu serwera). Po zmianach w `app/`: `npx jest` i `npx tsc --noEmit`; po zmianach w `server/` lub `packages/*`: `npx vitest run` i `npx tsc --noEmit` w `server/` — wszystko musi przechodzić. Zmiana w `packages/` dotyka OBU stron, więc uruchamiaj oba zestawy.
- **Detekcja stanów lotu (kołowanie / start / lądowanie) i wszystkie progi: `docs/algorytm-detekcji.md`.** Zmieniasz cokolwiek w `packages/domain/src/detection/` — zaktualizuj ten dokument w tym samym commicie. Progów NIE stroimy „na wyczucie": służy do tego `server/scripts/replay.ts` na nagraniach ze śladu kalibracyjnego.
- **Katalog lotnisk mapy śladu i jego licencje: `docs/dane-lotnisk.md`.** Dane składa generator `packages/domain/scripts/` z dwóch źródeł: OurAirports (domena publiczna) uzupełnione o pasy z OpenStreetMap (ODbL — stąd atrybucja przy mapie i katalog udostępniony na tej samej licencji). **AIP PAŻP jest ODRZUCONY** do czasu pisemnej zgody agencji — jej copyright policy zabrania użycia „w innej formie"; nie proponuj go ponownie. `packages/domain/src/airfields.ts` jest GENEROWANY — poprawki wchodzą przez generator i regenerację, nie ręczną edycją.
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
- `Bebas Neue` — nagłówki display, timery duże, canvas labels
- `Archivo` — body text, etykiety, przyciski
- `JetBrains Mono` — cyfry timerów, kody ICAO, wartości GPS, kody pilotów

### Phone frame (`design/*.html` — aplikacja pilota)
Każdy mockup używa ramki telefonu 393×852px (iPhone 14 Pro) z `--phone-scale` do auto-skalowania.
Struktura: `.canvas-label` → `.phone` (z Dynamic Island `::before`) → `.nav-strip`

### Browser frame (`design/admin/*.html` — panel administracyjny)
Panel to **aplikacja web**, więc ramką jest okno przeglądarki 1440×900 z `--app-scale`
(działa dokładnie jak `--phone-scale`) i paskiem chrome zamiast Dynamic Island.
Struktura: `.canvas-label` → `.browser` (`.chrome` → `.shell` = `.sidebar` + `.main`) → `.nav-strip`.
**Nowy ekran panelu zaczyna się od skopiowania `<head>` z `design/admin/SZABLON.html`** —
tam mieszkają tokeny, rama, kanoniczny sidebar i inwentarz komponentów back-office'u
(tabele, plakietki stanu, szuflada `.drawer`, oś zdarzeń, stany puste). Nowy komponent
dokładamy do szablonu, nie do pojedynczego ekranu.
Tokeny, czcionki i wszystkie reguły niżej obowiązują tak samo — inne urządzenie, ten sam produkt.

### Wzorzec formularzy
- Pola input: `background: var(--surface-raised)`, `border-radius: 12px`, focus = `var(--green-border)`
- Dropdowny jako lista kart do wyboru (nie natywny `<select>`) — widoczne opcje, zaznaczona = zielona obramówka
- Operacje/typy jako siatka kart z ikonami

### Nawigacja i warianty mockupów (obowiązuje każdy nowy/zmieniany ekran)
- Każdy plik: nav-strip z linkami do sąsiadów + karta w `index.html` (warianty literowe → sekcja "Warianty i stany")
- Ekran mający warianty → **panel „Warianty tego ekranu" na canvasie pod telefonem**: linki do całej rodziny + opis KIEDY dany wariant się wyświetla; bieżący ekran z tagiem „ten ekran"; badge amber dla stanów offline/warning. Wzorzec: `00-login.html`, `02-preflight.html`
- Po zmianach: zero martwych linków (sprawdzaj greppem po `href`)

## Strefa czasowa
**UTC jest domyślnym czasem wszędzie** — log samolotu, sesje dnia, T/O, LDG, tankowanie, klamra służby, arkusz. Czas nieoznaczony = UTC.
LT tylko jako wartość drugorzędna przy deklaracji klamry służby na `01`: `08:00 UTC · 10:00 LT` (scenariusz mockupów: LT = UTC+2).
Logi i tabele oznaczaj jawnie („Log dnia · UTC", „Lista lotów · czasy UTC").

## Screen flow (kolejność ekranów — model 2026-08-10)
```
00-login → 01-moj-dzien (EKRAN DOMOWY)
01-moj-dzien → 02-przejecie → 02e-zadanie → 02a-liczniki → „Przejmij i leć"
→ 04a-kokpit PRZED URUCHOMIENIEM (tankowanie / zmiana załogi / zdanie bez lotu 09c)
→ START ENGINE → 05-cockpit-running (wiele startów i lądowań = LOTÓW w jednej sesji)
→ STOP ENGINE → 04-kokpit PO ZATRZYMANIU (hero = ZDAJ SAMOLOT; tankowanie nadal;
  drugiego START ENGINE NIE MA — kolejny lot to nowe przejęcie)
→ 09b-zdaj-samolot (odczyty paliwa i MH OBOWIĄZKOWE = zatwierdzenie logu sesji;
  wariant 09c: zdanie bez lotu) → 01-moj-dzien
01-moj-dzien → 15-reczny-lot (wpis CAŁEGO lotu po fakcie: samolot, czasy, odczyty)
01-moj-dzien → 10-statystyki (rozliczenie samolotu) / 11-eksport / 12-historia
01-moj-dzien → „Zamknij dzień" (OPCJONALNE) → 01b (okno korekty 24 h)
```
**Wszystko wraca do 01, nie do kokpitu.** Dzień pilota nie ma „startu" ani „końca" jako
kroków flow: zaczyna się pierwszą sesją i domyka sam na ostatniej. Wyjście działa też
offline — niepusty outbox nigdy nie więzi pilota na ostatnim ekranie (§4.1).

### Kokpit jest stanem modalnym (decyzja 2026-08-10)
**Dopóki pilot trzyma samolot, z kokpitu nie ma wyjścia bokiem** — z 04/05 nie prowadzi
żadna droga na 01. Maszynę oddaje się przez „Zdaj samolot" (09b) i to ona wraca na 01;
akcje ground (06/07/08) i 09 wracają do kokpitu. Wyjątkiem są ustawienia (13), bo tam
wraca się tym samym krokiem.
Konsekwencje przy każdej zmianie kokpitu:
- **nie dokładaj linków na 01** — ani paska, ani przycisku, ani wpisu w nagłówku. Pasek
  sesji `ClaimStrip` z linkiem „Mój dzień →" był jedyną taką drogą i został USUNIĘTY
  z 04/04A (żyje wyłącznie w 04B, gdzie opisuje CUDZĄ maszynę i nie prowadzi nikąd)
- z tego samego powodu kokpit nie powtarza tego, co mówi już pasek górny (maszyna, trasa)
  ani nagłówek logu dnia (liczba cykli) — 04A pokazywał tak „jeszcze żadnego wzlotu"
  jako trzecią deklarację braku na jednym ekranie
- **ta sama reguła dotyczy paliwa**: litry stoją na 04 w JEDNYM miejscu. Pasek „Paliwo ·
  ostatni odczyt" pojawia się tylko wtedy, gdy jest przyrządem (jest norma → jest szacunek
  wystarczalności, ton ostrzeżenia i adnotacja o źródle); bez normy paska nie ma i FOB
  niesie podpis kafelka „Tankowanie". Podział ról ma test i mieszka w
  `app/src/ui/screens/logic/cockpitFuel.ts` — nie rozstrzygaj tego w JSX
- **reguła obowiązuje też przycisk sprzętowy** (wdrożone 2026-08-10): kokpit trzyma
  `usePreventRemove(holdsAircraft(projection), …)` i zamiast wyjścia pokazuje arkusz 04d
  („TRZYMASZ SP-AXA" → ZOSTAŃ / ZDAJ SAMOLOT). `usePreventRemove`, nie `BackHandler`,
  bo obejmuje także gest cofania krawędzią. Warunek pyta o TRZYMANIE maszyny, nie
  o istnienie sesji — inaczej zablokowałby powrót 09B → 01, który w stosie zdejmuje
  kokpit. Blokada bez komunikatu jest zakazana (§6 pkt 3: przycisk, który nic nie robi,
  wygląda jak zawieszona aplikacja)

## Sesja = jeden bieg silnika (decyzja 2026-08-10)
Story użytkownika zdefiniował model na nowo; częściowo odwraca §3.6a z 2026-08-06:
- **sesja** = od URUCHOMIENIA do ZATRZYMANIA silnika — dokładnie jeden bieg na sesję.
  **Lot** = od startu do lądowania; w jednej sesji wiele lotów (w tym touch and go).
  Słowo **„wzlot" jest WYCOFANE** ze słownika — zlało się z sesją.
- po STOP ENGINE **nie ma drugiego startu**: hero kokpitu zmienia się w „ZDAJ SAMOLOT"
  (09b). Kolejny lot = NOWE przejęcie (02 → 02e → 02a).
- odczyty paliwa i MH przy zdaniu są **OBOWIĄZKOWE** i są zatwierdzeniem logu sesji;
  trafiają do logu jako kolejne wpisy. `leg_close` znika z domeny, ekrany 09 i 09a
  znikają z designu, 09c (zdanie bez lotu — pogoda/usterka) zostaje wariantem 09b.
- tankowanie mieszka w kokpicie: PRZED uruchomieniem i PO zatrzymaniu (przed zdaniem).
  Zmiana załogi tylko PRZED uruchomieniem — po biegu nowa załoga = nowe przejęcie.
- kokpit pokazuje WYŁĄCZNIE bieżącą sesję — bez „Log dnia", bez „CYKL n", bez harmonijki
  wielu cykli. Kokpit pozostaje stanem modalnym (sekcja wyżej).
- na 01 lista sesji dnia (różne zadania, różne maszyny) + ręczny wpis CAŁEGO lotu (15).
- **klamra służby i „Zamknij dzień" na 01: BEZ ZMIAN** — użytkownik chce je przemyśleć
  osobno; nie ruszaj ich przy okazji pivotu.
- zysk uboczny analityki: każda sesja domknięta odczytami z OBU stron — znika patologia
  interwałów degeneracyjnych między ostatnim `leg_close` a zdaniem (§3.6b).

## Czas służby — klamra, nie kontener (decyzja 2026-08-06)
Reguła w jednym zdaniu: **loty są ZAPISYWANE, służba jest DEKLAROWANA i zawsze stanowi
klamrę wokół lotów** (duty ⊇ suma sesji, zawsze). Z tego wynika wszystko inne:
- służba należy do **pilota**, nie do samolotu — dwa samoloty mieszczą się w jednej służbie
  (to odwraca „jeden samolot = jeden dzień" z 2026-07-23 i usuwa jego trade-off)
- klamra bierze się domyślnie z pierwszej i ostatniej sesji doby UTC (pierwsze
  uruchomienie → ostatnie zatrzymanie silnika); pilot **nie otwiera
  ani nie zamyka niczego, żeby polecieć**. Deklaracja jest korektą po fakcie na ekranie 01
- jednostką potwierdzenia danych jest **sesja**, potwierdzana przy zdaniu samolotu (09b)
  — ZMIENIONE 2026-08-10 (sekcja „Sesja = jeden bieg silnika"); wcześniej wzlot + ekran 09
- odczyt liczników przy zdaniu samolotu jest **OBOWIĄZKOWY** (zdanie = przekazanie
  i ogniwo łańcucha MH) — ZMIENIONE 2026-08-10. Dawna opcjonalność per wzlot straciła
  rację bytu: dzień skokowy z gorącym załadunkiem to JEDEN bieg silnika z 8–12 lotami,
  czyli jedno przejęcie i jeden odczyt — do licznika nie trzeba chodzić w środku serii
- **zdanie samolotu nie kończy dnia pilota**; „Zamknij dzień" jest opcjonalne
- łańcuch MH nie ma ze służbą nic wspólnego: to oś samolotu
Pełny opis: `docs/_main.md.txt` §3.6, §3.6a — czytany RAZEM z sekcją „Sesja = jeden bieg
silnika" wyżej, która ma pierwszeństwo tam, gdzie się różnią (jednostka potwierdzenia,
obowiązkowość odczytów, brak `leg_close`).

## Pilot i samolot — UX
- Pierwsze logowanie: login + hasło na `00-login.html` (konta zakłada administrator w bazie, BEZ samodzielnej rejestracji i BEZ Google OAuth — decyzja odwrócona 2026-07-22; wymaga sieci); codzienny powrót = odblokowanie PIN-em (działa offline)
- **Przejęcie samolotu ma trwać kilka sekund** — trzy kroki (samolot+Dual → zadanie → liczniki) i „Przejmij i leć" prowadzi wprost do kokpitu. Nie pytamy o czas meldowania i nie ma ekranu podsumowania (dawny `03` usunięty): powtarzał to, co pilot wpisał sekundę wcześniej
- Tożsamość pilota jest znana w całej sesji — NIE pytamy o kod pilota w formularzach
- Samolot wybieramy z listy zarejestrowanych jednostek (dropdown/lista kart), NIE pole tekstowe
- Rodzaj operacji — siatka kart z ikonami, NIE select. Nazwy dla pilota: Skoki / **Przelot** / Egzamin / Lot tech. / Inne (wartości w rejestrze zostają angielskie — `ferry` to identyfikator, nie napis)
- **Rodzaj operacji wyznacza pola trasy** (issue #13): skoki = JEDNO lotnisko (startują i lądują na tym samym placu), pozostałe operacje = para start → lądowanie. Reguła mieszka w domenie (`isSameFieldOperation`) i tą samą odpowiedzią uzbraja bramkę lądowania w detekcji — formularz i detekcja nie mają jak się rozjechać
- **Rodzaj operacji wyznacza też dostępne akcje** (issue #19): zrzut skoczków istnieje wyłącznie w dniu skokowym (`isJumpOperation`) — przy przelocie czy egzaminie przycisku NIE MA (to brak akcji, nie blokada z powodem: `drop` nie może się tam wydarzyć)

## Offline-first (obowiązuje w designie i implementacji)
Pełna architektura: `docs/_main.md.txt` (sekcje 4–6). Zasady twarde:

- **Brak sieci NIGDY nie blokuje pracy pilota** — sieć to okazja do synca, nie warunek. Jedyny świadomy wyjątek: utworzenie profilu (pierwsze logowanie / zapomniany PIN) wymaga sieci — tryb awaryjny bez tożsamości został rozważony i ODRZUCONY, nie proponuj go ponownie
- Zapis = lokalne zdarzenie append-only (SQLite, UUID) → outbox wysyła automatycznie, gdy jest sieć; eksport do Sheets robi serwer (ekran 11 = status synchronizacji, nie akcja eksportu)
- Komponenty dzielimy wg źródła danych:
  1. **dane sesji** (timery, log samolotu na `04`, lista sesji doby na `01`, liczniki, statystyki) — lokalne, zawsze świeże, zero wariantów offline
  2. **dane z serwera** (przekazanie FOB/MH, status claim, lista pilotów) — 3 stany świeżości: `live` (bez adnotacji) / `cache` ("· z cache · sync 21 JUN 17:30", amber) / `brak` ("brak danych — wpisz z licznika")
  3. **akcje wymagające sieci** (pierwsze logowanie, zmiana konta, ręczny sync) — offline: disabled z podanym powodem, nigdy cichy błąd
- Jeden globalny wskaźnik łączności: SyncChip — nie rozsiewamy komunikatów o braku sieci po ekranach. **Online nie rysuje NIC** (decyzja 2026-08-06, issue #12: „zsynchronizowano" to stan domyślny, a plakietka świecąca przez 99% czasu uczy oko ignorować róg ekranu). Offline: `OFFLINE · n` + stempel ostatniej udanej synchronizacji pod spodem
- Blokada PIC = optymistyczny claim — przejęcie samolotu działa też offline (ostrzeżenie z danych cache)
- Wygasły token ≠ wylogowanie; wylogowanie zablokowane przy niepustym outboxie
- Liczniki fizyczne (MH, paliwomierz) > dane z serwera — serwer tylko podpowiada

## Reguły przy zlecaniu agentom
Gdy tworzysz prompt dla agenta do tworzenia HTML mockupów, zawsze dołącz:
1. Pełne design tokeny CSS z `:root` (z sekcji wyżej)
2. Szablon ramki właściwej dla powierzchni: aplikacja pilota → phone frame (393×852px,
   `--phone-scale`, Dynamic Island); panel administracyjny → `<head>` skopiowany w całości
   z `design/admin/SZABLON.html` (okno 1440×900, `--app-scale`, kanoniczny sidebar)
3. Informację że aplikacja = UZ Aero
4. Linki nawigacyjne do sąsiednich ekranów w `nav-strip`
5. Nazwy plików do stworzenia i docelowy katalog `d:\uz_areo\design\`
6. Gdy ekran pokazuje dane z serwera — stany świeżości `live`/`cache`/`brak` i SyncChip (sekcja Offline-first wyżej). **Online SyncChip nie rysuje NIC** — plakietka istnieje wyłącznie offline
7. Gdy ekran ma warianty — panel „Warianty tego ekranu" na canvasie z opisem kiedy który (sekcja Nawigacja i warianty wyżej)
8. **Gdy ekran dotyka czasu, dnia albo zamknięcia czegokolwiek — sekcje „Sesja = jeden bieg silnika" i „Czas służby" wyżej**: sesja = jeden bieg silnika (po STOP nie ma drugiego startu — hero to ZDAJ SAMOLOT), lot = start→lądowanie, słowo „wzlot" wycofane; jednostką potwierdzenia jest SESJA, odczyty przy zdaniu (`09b`) OBOWIĄZKOWE; służba należy do pilota i może obejmować kilka maszyn; zdanie samolotu NIE kończy dnia. Bez tego punktu agent zbuduje ekran poprawny wizualnie i błędny modelowo — dokładnie tak powstał flow, który właśnie przebudowaliśmy

## Banery — trzy typy (szczegóły: `docs/design-notes.md`)
- **Status** (offline, tylko-odczyt, odliczanie) — nigdy zamykalny, to przyrząd
- **Ostrzeżenie warunkowe** (paliwo/MH, załoga) — znika samo z warunkiem, nie zamyka się ręcznie
- **Pouczający jednorazowy** — zamykalny `×` → zwija się do mini-`(?)` w miejscu; stan schowany zapamiętany NA STAŁE per pilot. Klasy `.edu-dismiss`/`.edu-mini`, funkcje `eduCollapse/eduExpand`

## Czego unikać
- Nie dodawaj loadera/spinnera bez określonego celu (patrz: feedback do dawnego ekranu splash, dziś `01-moj-dzien`)
- Nie używaj natywnego `<select>` — zawsze stylizowana lista kart
- Nie wpisuj hardcoded kolorów — tylko zmienne CSS
- Nie twórz nowych plików poza `design/` i `app/` bez pytania
