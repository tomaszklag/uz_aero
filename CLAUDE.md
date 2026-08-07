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
**PRZEBUDOWA FLOW W TOKU** (od 2026-08-06, gałąź `poc-zmiany-flow`) — dzień służby przestał
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
    BEZ odczytu nie tworzy granicy w ogóle. **ETAP B DOMKNIĘTY.**
- **OTWARTE RYZYKO (§3.6b), świadomie niezamknięte**: progów analityki nie da się nastroić,
  dopóki `consumptionReplay.ts` nie dostanie danych w NOWYM kształcie (krótkie sesje,
  wzloty z odczytem i bez) — a takich nie ma nawet w `server/scripts/demo/`. Dzień skokowy
  bez odczytów pośrednich daje JEDEN interwał na sesję, czyli przypadek, w którym
  `MAX_VARIANCE_INFLATION` odrzuci rozdział ziemia/lot. Przebudowa generatora demo to
  osobne zadanie i warunek wstępny kalibracji. **Progów nie stroimy w dyskusji.**
- **Etap C** `app/` (ekrany 1:1 z nowych mockupów), **etap D** serwer + panel.

**Twardy warunek każdego commitu etapu B:** strumień `schema_version 1` musi projektować się
BEZ ZMIANY WYNIKÓW. Strażnikiem jest kanoniczny dzień 22 JUNE w `app/src/__tests__/projections.test.ts`
(budowany jawnie z `schemaVersion: 1`) — nie usuwaj go i nie „aktualizuj" pod nowy model.
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
**UTC jest domyślnym czasem wszędzie** — log samolotu, wzloty dnia, T/O, LDG, tankowanie, klamra służby, arkusz. Czas nieoznaczony = UTC.
LT tylko jako wartość drugorzędna przy deklaracji klamry służby na `01`: `08:00 UTC · 10:00 LT` (scenariusz mockupów: LT = UTC+2).
Logi i tabele oznaczaj jawnie („Log dnia · UTC", „Lista lotów · czasy UTC").

## Screen flow (kolejność ekranów)
```
00-login → 01-moj-dzien (EKRAN DOMOWY)
01-moj-dzien → 02-przejecie → 02e-zadanie → 02a-liczniki → „Przejmij i leć"
→ 04-cockpit-ground ⇄ 05-cockpit-running
→ 06-tankowanie / 07-zmiana-zalogi / 08-lista-reczna (akcje ground)
→ 09-zamknij-lot (po STOP ENGINE) → kolejny wzlot (04) ALBO 09b-zdaj-samolot
→ 01-moj-dzien
01-moj-dzien → 10-statystyki (rozliczenie samolotu) / 11-eksport / 12-historia
01-moj-dzien → „Zamknij dzień" (OPCJONALNE) → 01b (okno korekty 24 h)
```
**Wszystko wraca do 01, nie do kokpitu.** Dzień pilota nie ma „startu" ani „końca" jako
kroków flow: zaczyna się pierwszym wzlotem i domyka sam na ostatnim. Wyjście działa też
offline — niepusty outbox nigdy nie więzi pilota na ostatnim ekranie (§4.1).

## Czas służby — klamra, nie kontener (decyzja 2026-08-06)
Reguła w jednym zdaniu: **loty są ZAPISYWANE, służba jest DEKLAROWANA i zawsze stanowi
klamrę wokół lotów** (duty ⊇ suma wzlotów, zawsze). Z tego wynika wszystko inne:
- służba należy do **pilota**, nie do samolotu — dwa samoloty mieszczą się w jednej służbie
  (to odwraca „jeden samolot = jeden dzień" z 2026-07-23 i usuwa jego trade-off)
- klamra bierze się domyślnie z pierwszego i ostatniego wzlotu doby UTC; pilot **nie otwiera
  ani nie zamyka niczego, żeby polecieć**. Deklaracja jest korektą po fakcie na ekranie 01
- jednostką potwierdzenia danych jest **wzlot** (cykl silnika), nie doba — ekran 09
- odczyt liczników przy zamknięciu wzlotu jest **opcjonalny**, a **wymagany dopiero przy
  zdaniu samolotu** (09b), bo to on jest przekazaniem i ogniwem łańcucha MH. Powód
  opcjonalności: dzień skokowy to 8–12 wzlotów pod rząd i nikt nie chodzi do licznika po
  każdym — wymóg zrobiłby z aplikacji coś wolniejszego od papieru
- **zdanie samolotu nie kończy dnia pilota**; „Zamknij dzień" jest opcjonalne
- łańcuch MH nie ma ze służbą nic wspólnego: to oś samolotu
Pełny opis: `docs/_main.md.txt` §3.6, §3.6a. **Design jest przebudowany, domena jeszcze
nie** — etap B doprowadza `packages/domain` do zgodności (nowy `leg_close`, klamry duty
opcjonalne, projekcja służby per pilot per doba UTC).

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
  1. **dane sesji** (timery, log samolotu na `04`, lista wzlotów doby na `01`, liczniki, statystyki) — lokalne, zawsze świeże, zero wariantów offline
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
8. **Gdy ekran dotyka czasu, dnia albo zamknięcia czegokolwiek — regułę „klamra, nie kontener"** (sekcja „Czas służby" wyżej): jednostką potwierdzenia jest WZLOT, nie doba; służba należy do pilota i może obejmować kilka maszyn; odczyt liczników opcjonalny na `09`, wymagany na `09b`; zdanie samolotu NIE kończy dnia. Bez tego punktu agent zbuduje ekran poprawny wizualnie i błędny modelowo — dokładnie tak powstał flow, który właśnie przebudowaliśmy

## Banery — trzy typy (szczegóły: `docs/design-notes.md`)
- **Status** (offline, tylko-odczyt, odliczanie) — nigdy zamykalny, to przyrząd
- **Ostrzeżenie warunkowe** (paliwo/MH, załoga) — znika samo z warunkiem, nie zamyka się ręcznie
- **Pouczający jednorazowy** — zamykalny `×` → zwija się do mini-`(?)` w miejscu; stan schowany zapamiętany NA STAŁE per pilot. Klasy `.edu-dismiss`/`.edu-mini`, funkcje `eduCollapse/eduExpand`

## Czego unikać
- Nie dodawaj loadera/spinnera bez określonego celu (patrz: feedback do dawnego ekranu splash, dziś `01-moj-dzien`)
- Nie używaj natywnego `<select>` — zawsze stylizowana lista kart
- Nie wpisuj hardcoded kolorów — tylko zmienne CSS
- Nie twórz nowych plików poza `design/` i `app/` bez pytania
