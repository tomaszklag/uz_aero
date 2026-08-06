# UZ Aero — panel administracyjny · analiza zakresu i architektury informacji

> Wejście dla zespołu budującego mockupy HTML w `design/admin/`. Nie jest to specyfikacja
> implementacji — jest to **decyzja o tym, co panel pokazuje, komu i skąd bierze dane**.
> Rama okna, tokeny i inwentarz komponentów: `design/admin/SZABLON.html` (istnieje).
> Architektura systemu: `docs/_main.md.txt`. Architektura kodu: `docs/architektura-kodu.md`.
>
> Wersja 1.0 — 2026-07-31.

> ## ⚠ STATUS (2026-08-07): cały dokument stoi na modelu sprzed 2026-08-06
>
> Panel zaprojektowano przy założeniu **dzień lotny = sesja jednego samolotu**
> (`session_claim` → `day_close`). Decyzja z 2026-08-06 (`docs/_main.md.txt` §3.6a) to
> unieważniła: jednostką potwierdzenia jest **wzlot**, służba należy do **pilota** i może
> obejmować kilka maszyn, a zamknięcie dnia jest **opcjonalne**.
>
> Co z tego wynika dla panelu (faza 8 etap D — przebudowa jeszcze się nie zaczęła):
> - **A02 „Dni lotne" rozpada się na dwie listy** — dni PILOTÓW (klamra służby, przekrojowo
>   po maszynach) i sesje SAMOLOTÓW (claim → zdanie). Dziś jeden wiersz udaje oba.
> - **A02a** ma kafel „Czas służby (duty)" przypisany do sesji samolotu — czas służby
>   przestał być własnością sesji.
> - **Plakietka „Dzień otwarty"** i bramka `400 day_open` opierają się na braku `day_close`
>   jako oznace „dzień trwa". Po zmianie brak `day_close` będzie normą także dla dni dawno
>   skończonych.
> - **Nakładka sesji** przestaje być anomalią: dwóch pilotów tą samą maszyną w jednej dobie
>   to typowy dzień skokowy, nie patologia (`_main.md.txt` §4.7).
> - **Sidebar we wszystkich 23 ekranach** ma pozycję „Dni lotne" — jedna zmiana
>   w `SZABLON.html` plus propagacja.
>
> Do czasu etapu D czytaj ten dokument jako opis stanu wdrożonego, nie docelowego.

---

## 0. Zgodność z plikami, które powstały

**Numeracja w tym dokumencie NIE jest numeracją plików.** Mockupy ruszyły równolegle z analizą,
zanim ta się domknęła, więc na dysku obowiązuje inny podział. **Źródłem prawdy są nazwy plików
w `design/admin/` i karty w `index.html`** — poniższa tabela tłumaczy jedno na drugie. Rozjazd
nie jest tylko numeryczny: część ekranów analizy została scalona, a część nie powstała.

| ID w tej analizie | Co powstało na dysku | Uwaga |
|---|---|---|
| `A00-logowanie` | `A00-login.html` | — |
| `A00a-brak-uprawnien` | wbudowane w `A00-login.html` | Komunikat o koncie bez roli panelu jest częścią ekranu logowania. Osobny plik `A00a-login-blad.html` to inny wariant: odpowiedź po 401 |
| `A01-pulpit` | `A01-pulpit.html` | Bez zmian |
| `A01a-pulpit-cisza` | `A01a-pulpit-cisza.html` | Zbudowany 2026-07-31. Rozstrzyga stan, którego dokument nie przewidział: „nikt nie lata" i „nic nie dotarło" wyglądają w bazie identycznie, więc werdykt stoi na czterech sprawdzalnych warunkach, nie na braku danych |
| `A02-dni` | `A02-dni.html` | Bez zmian |
| `A03-dzien` | `A02a-dzien.html` | Karta dnia jest wariantem listy dni, stąd `A02a` |
| `A03a-korekta-zdarzenia` | `A02b-korekta.html` | — |
| `A03b-dzien-w-drodze` | stan w `A02a-dzien.html` | Zbudowany jako baner „dane w drodze", nie osobny plik |
| `A04-zdarzenia` | `A04-zdarzenia.html` | Bez zmian |
| `A05-flagi` | `A03-flagi.html` | Skrzynka flag stoi wyżej w nawigacji niż zakładał dokument |
| `A06-flaga` | `A03a-flaga.html` | — |
| `A06a-flaga-rozwiazana` | `A03b-flagi-zero.html` | **Zamiana zakresu**: zbudowano stan pusty skrzynki, a historię rozwiązanych umieszczono jako sekcję `A03` |
| `A07-eksporty` | `A05-eksporty.html` | — |
| `A07a-karta-arkusza` | podgląd w `A05-eksporty.html` | Bez osobnego pliku |
| `A08-statystyki-floty` + `A09-statystyki-pilotow` | `A10-statystyki.html` | **Scalone** w jeden ekran z przełącznikiem ujęcia: per samolot / pilot / operacja |
| `A10-piloci` | `A06-piloci.html` | — |
| `A11-pilot` + `A11a-nowe-konto` + `A11b-reset-hasla` | `A06a-konto.html` | **Scalone** w jedną szufladę o trzech wejściach |
| `A12-flota` | `A07-flota.html` | — |
| `A13-samolot` + `A13a-nowy-samolot` | `A07a-samolot.html` | **Scalone** |
| `A14-audyt` | `A09-audyt.html` | — |
| `A15-progi` | `A08-progi.html` | Rekomendacja „tylko do odczytu" przyjęta i rozwinięta: ekran rozdziela progi detekcji (telefon, nieedytowalne) od tolerancji flag (serwer, edytowalne za dowodem z replaya) |
| `A16-konserwacja` | `A11-konserwacja.html` | Zbudowany 2026-07-31. Przebudowa projekcji z dry-runem jako akcją domyślną, kolejka ponowień eksportu, sprzątanie wygasłych tokenów, stan migracji |

Poza tabelą: analiza nie przewidziała ekranu `A00a-login-blad.html` (odpowiedź po 401 z limitem
prób), który powstał jako wariant logowania.

---

## 1. Po co panel

Dziś każda operacja administracyjna w UZ Aero to `psql` albo `npm run seed`. Założenie konta
pilota = dopisanie krotki do `PILOTS` w `server/src/infrastructure/pg/seed.ts` i ponowny bieg
seeda z `SEED_PASSWORD` (`seedCli.ts`). Reset hasła = ręczny `UPDATE pilots SET password_hash`
z hashem wyliczonym poza aplikacją. Zmiana pojemności zbiorników albo formatu licznika = `UPDATE
aircraft`. **Rozwiązanie flagi nie ma dziś żadnej ścieżki** — kolumna `flags.status` ma wartość
`'open'` i w całym `server/src` nie istnieje kod, który ustawiłby `'resolved'` (sprawdzone
greppem); a dopóki flaga `session_overlap` jest otwarta, `DayExporter` **odmawia eksportu karty
dnia** (`application/export/dayExporter.ts`, bramka druga). Znaczy to tyle, że dziś nakładka
sesji trwale blokuje dokument klubu i nie da się jej odblokować inaczej niż ręcznym UPDATE-em.
Korekta po oknie 24 h (decyzja 2026-07-23) nie ma ścieżki w ogóle — reguła
`CORRECTION_WINDOW_EXPIRED` mówi „korektę wprowadza administrator", a administrator nie ma czym.

Użytkownik: **jedna–dwie osoby w klubie** — administrator (utrzymuje konta, flotę i rejestr)
oraz szef wyszkolenia (patrzy na statystyki i rozstrzyga flagi). Nie jest to narzędzie codzienne:
realny rytm to kilka minut rano (co się dzieje na lotnisku), przegląd skrzynki flag raz na kilka
dni i sesja przy zamknięciu miesiąca (statystyki, arkusze). Wyjątkiem są dni po awarii — wtedy
panel jest jedynym miejscem, w którym da się zobaczyć, dlaczego arkusz nie powstał.

Decyzja **2026-07-24 „Panel administratora — nie teraz"** (log decyzji, `docs/_main.md.txt`)
odkładała to świadomie: przy braku backendu nie było czego administrować. Odwracają ją trzy
fakty, które zaszły po niej:

1. **Faza 2 i 4 są zamknięte** — backend przyjmuje zdarzenia, liczy projekcje, wystawia flagi
   i eksportuje karty dzienne end-to-end (§10). Jest baza, która wymaga obsługi.
2. **Eksport ma bramkę, której nikt nie może otworzyć** — `session_overlap` blokuje kartę do
   „rozwiązania flagi przez administratora" (§4.7); ścieżka rozwiązania nie istnieje.
3. **Faza 5 to testy z pilotami** — wchodzą prawdziwe konta, prawdziwe dni i prawdziwe błędy
   wpisu. Odkładanie panelu do fazy 6 znaczy: przez cały okres testów naprawiać dane SQL-em na
   produkcji, bez śladu, kto co zmienił.

Panel **nie dubluje aplikacji**. Pilot ma u siebie statystyki dnia (`10-statystyki.html`),
własną historię z oknem korekty (`12-historia.html`), status synchronizacji swojej sesji
(`11-eksport.html`) i korektę własnego zdarzenia (`04c-korekta-zdarzenia.html`). Panel dokłada
dokładnie trzy rzeczy, których telefon mieć nie może: **przekrój przez całą flotę i wszystkich
pilotów**, **operacje na cudzych danych po oknie 24 h**, i **konfigurację, której telefon jest
tylko konsumentem**.

---

## 2. Role i uprawnienia

Dwie role (decyzja właściciela produktu; §4.5 mówi o obu przy cyklu życia flag):

- **`admin`** — administrator systemu: konta, flota, korekty po oknie, progi, konserwacja.
- **`instructor`** (w UI: **szef wyszkolenia**) — nadzór wyszkoleniowy: podgląd, statystyki,
  rozstrzyganie flag.

Trzecia wartość — **`pilot`** — jest domyślną rolą każdego konta i **nie daje dostępu do panelu
w ogóle** (patrz A00a). To ważne: piloci i administratorzy dzielą jedną tabelę `pilots`, więc
brak roli musi znaczyć „brak wstępu", nie „wstęp bez ograniczeń".

| Funkcja | `admin` | szef wyszkolenia | Dlaczego odmowa |
|---|:--:|:--:|---|
| Pulpit operacyjny (A01) | ✅ | ✅ | — |
| Dni lotne — lista i karta dnia (A02, A03) | ✅ | ✅ | — |
| Rejestr zdarzeń — przeglądarka (A04) | ✅ | ✅ (odczyt) | — |
| **Korekta zdarzenia po oknie 24 h (A03a)** | ✅ | ❌ | Korekta zmienia liczby w dokumencie klubu i wywołuje re-eksport arkusza. To operacja o skutku księgowym, nie wyszkoleniowym — wąskie grono ogranicza liczbę osób, które mogą wprowadzić rozjazd z arkuszem. **Do decyzji** (rekomendacja: zostawić przy `admin` w v1; jeśli szef wyszkolenia ma realnie poprawiać cudze loty, właściwym krokiem jest rola trzecia, nie rozszerzanie tej) |
| Skrzynka flag — przegląd (A05, A06) | ✅ | ✅ | — |
| **Rozwiązanie flagi (A06 → `resolve`)** | ✅ | ✅ | §4.5 wprost przypisuje cykl `open → resolved` „administratorowi/szefowi wyszkolenia". Rozstrzygnięcie „czy dziura MH to lot bez aplikacji" to wiedza operacyjna, nie systemowa |
| Monitor eksportu — podgląd (A07, A07a) | ✅ | ✅ | — |
| **Ponowienie eksportu (A07 → `retry`)** | ✅ | ❌ | Ponowienie nadpisuje kartę w dokumencie klubu (`exported_sheets` = UPSERT po `tab`). Operacja jest idempotentna, ale jej skutek widzi cały klub — trzymamy ją przy właścicielu systemu |
| Statystyki floty i pilotów (A08, A09) | ✅ | ✅ | — |
| **Konta pilotów — przegląd (A10)** | ✅ | ❌ | Lista kont z e-mailami i stanem aktywności to dane osobowe i mapa dostępów do systemu. Szef wyszkolenia widzi pilotów w statystykach (kod + nazwisko) — do jego pracy to wystarcza |
| **Konta — założenie, edycja, dezaktywacja, reset hasła (A11, A11a, A11b)** | ✅ | ❌ | Klucze do systemu. Jedna osoba odpowiada za to, kto ma dostęp |
| **Flota — przegląd (A12)** | ✅ | ✅ (odczyt) | — |
| **Flota — edycja konfiguracji (A13, A13a)** | ✅ | ❌ | `capacity_l`, `mh_format` i `dual_required` sterują walidacjami w aplikacji **i formatem eksportu** (§5.4). Zmiana `mh_format` z `hhmm` na `decimal` zmienia wygląd każdej przyszłej karty tego samolotu — to konfiguracja systemu, nie parametr wyszkoleniowy |
| **Progi detekcji (A15)** | ✅ (odczyt) | ✅ (odczyt) | Nikt nie edytuje w panelu — patrz §6, ryzyko 6. Odczyt jest dla obu ról, bo szef wyszkolenia musi wiedzieć, przy jakich progach powstały dane, które ocenia |
| **Audyt akcji (A14)** | ✅ | ❌ | Zapis „kto komu zresetował hasło" ujawnia zdarzenia kadrowe. **Do decyzji** (rekomendacja: w v1 tylko `admin`; jeśli dojdzie trzecia osoba w roli `admin`, wzajemna widoczność audytu jest zaletą, nie kosztem) |
| **Konserwacja: przebudowa projekcji, kolejka ponowień (A16)** | ✅ | ❌ | Operacje na maszynerii; błąd tutaj dotyka wszystkich dni naraz |

**Zasada UI dla odmowy: pozycja niedostępna jest WIDOCZNA i wyszarzona z podanym powodem**
(`.nav-item.locked` z `title="Wymaga roli: administrator"` — wzorzec już jest w `SZABLON.html`).
Chowanie pozycji uczy zgadywania („czy to jest, czy mnie nie wpuszcza?"), a to ten sam błąd,
który w aplikacji rozwiązuje reguła „akcja disabled **z podanym powodem**, nigdy cichy błąd"
(CLAUDE.md, Offline-first pkt 3).

**Autoryzacja jest po stronie serwera, UI tylko ją odzwierciedla.** Ukrycie przycisku nie jest
zabezpieczeniem; każda trasa `/admin/*` musi sama sprawdzić rolę (patrz §5 pkt 2).

---

## 3. Architektura informacji

### Zasada podziału

Nawigacja idzie po **horyzoncie czasowym i typie obiektu**, nie po ekranach aplikacji. Telefon
prowadzi pilota przez dzień (00 → 02 → 04 → 09 → 11); panel nie ma przepływu, ma **inwentarz**.
Administrator wchodzi z pytaniem („dlaczego SP-ABC nie ma arkusza za wtorek?"), a nie z zadaniem
do wykonania krok po kroku. Dlatego sidebar, nie stepper — i dlatego każdy widok ma być
osiągalny jednym kliknięciem z każdego innego.

Cztery grupy, w kolejności malejącej pilności:

```
┌─ OPERACJE ──────────── co dzieje się TERAZ i co czeka na decyzję
│  Pulpit                A01   stan floty na żywo, otwarte flagi, zaległe eksporty
│  Dni lotne             A02   lista dni/sesji z filtrami → A03 karta dnia
│  Flagi            [7]  A05   skrzynka niespójności → A06 karta flagi
│
├─ REJESTR ───────────── surowe fakty, gdy trzeba dojść do dna
│  Zdarzenia             A04   przeglądarka strumienia `events` z filtrami
│  Eksporty              A07   dziennik `export_log` + zaległości + ponowienia
│
├─ ANALITYKA ─────────── liczby zbiorcze, horyzont miesięczny
│  Statystyki floty      A08   MH, block, paliwo, wykorzystanie per samolot
│  Statystyki pilotów    A09   nalot, dni, zrzuty per pilot
│
└─ KONFIGURACJA ──────── rzeczy, które zmieniają się kilka razy w sezonie
   Piloci                A10   konta → A11 karta konta
   Flota                 A12   samoloty → A13 karta samolotu
   Progi i detekcja      A15   progi §3.3 (tylko odczyt) + procedura kalibracji
   Audyt i konserwacja   A14   ślad akcji admina · A16 operacje na maszynerii
```

**Uzasadnienia podziału, których nie widać z listy:**

- **„Dni lotne" ≠ „Sesje".** Model danych zna sesje (`sessions`, klucz `session_uuid`), ale
  administrator myśli dniami samolotu. Jeden dzień = jedna sesja **z definicji** (decyzja
  2026-07-23 „jeden samolot = jeden dzień"), więc nazwa „Dni lotne" nie kłamie i mówi językiem
  użytkownika. Wyjątek — nakładka po przejęciu offline — daje dwie sesje w jednym dniu i jest
  właśnie tym, co pokazuje flaga `session_overlap`; A02 pokazuje wtedy dwa wiersze z jawnym
  spięciem („nakładka · patrz flaga #14”).
- **Flagi mają własną pozycję z licznikiem, nie zakładkę w dniu.** Flaga bywa przypięta do
  **dwóch sesji naraz** (`flags.session_uuids TEXT[]` — schemat, migracja 2), więc nie jest
  własnością żadnego dnia. Licznik przy pozycji to jedyny sposób, żeby otwarta flaga sama się
  upomniała — pushów nie ma i nie będzie (§4.6).
- **Rejestr jest osobno od dni**, bo odpowiada na inne pytanie. A03 mówi „jak wyglądał dzień";
  A04 mówi „gdzie jest zdarzenie `uuid=…`, które telefon uważa za wysłane". To narzędzie
  diagnostyczne i ma wyglądać jak narzędzie diagnostyczne.
- **Analityka jest osobno od operacji**, bo ma inny horyzont (miesiąc/sezon vs dziś) i inny
  tryb pracy (eksport do rozliczeń vs reakcja). Wspólny ekran zmuszałby do filtrowania dat przy
  każdym wejściu.
- **Progi siedzą w Konfiguracji, mimo że są tylko do odczytu** — bo administrator szuka ich
  tam, gdzie inne parametry systemu, a nie w dokumentacji. Ekran, który mówi „tu jest wartość,
  a tu procedura jej zmiany", jest lepszy niż brak ekranu.

### Wzorce nawigacyjne w obrębie widoków

- **Lista → szuflada (drawer), nie osobna strona**, gdy szczegół mieści się w 520 px i praca
  polega na przeglądaniu kolejnych pozycji (flagi, konta, wpisy audytu). `SZABLON.html` ma
  gotowy `.drawer`. Utrata kontekstu listy przy każdym kliknięciu to główny koszt back-office'u.
- **Lista → pełna strona**, gdy szczegół jest gęsty i sam w sobie jest miejscem pracy (A03 karta
  dnia). Karta dnia ma oś zdarzeń, tabelę lotów, bilanse i historię eksportu — to nie mieści się
  w szufladzie i nie powinno.
- **Głęboki link do wszystkiego.** `#/dni/<session_uuid>`, `#/flagi/14`, `#/zdarzenia?uuid=…` —
  administrator kopiuje link do wiadomości „zobacz, co tu się stało".
- **Czas zawsze UTC**, zegar UTC w topbarze (jest w szablonie). Każda tabela z czasami ma
  w nagłówku jawny marker „czasy UTC" — reguła nadrzędna z CLAUDE.md i `design-notes.md`.
  LT nie pojawia się w panelu **w ogóle**: administrator nie melduje się do służby, więc jedyny
  uzasadniony przypadek LT z aplikacji tu nie zachodzi.

> **Uwaga do `SZABLON.html`:** obecny sidebar szablonu ma trzy grupy (Operacje / Rejestr /
> Konfiguracja) i nie zawiera pozycji Analityka ani Audytu. Przy pierwszym ekranie trzeba go
> uzupełnić o grupę **Analityka** (2 pozycje) i pozycję **Audyt i konserwacja** w Konfiguracji —
> i od tej chwili sidebar jest identyczny we wszystkich plikach `A*`.

---

## 4. Katalog ekranów

Format stały dla każdej pozycji. Ekrany bazowe `A00`–`A16`, warianty literowo (`A03a`) — jak
w `design/`. Każdy plik dostaje panel „Warianty tego ekranu" na canvasie i nav-strip z linkami
do sąsiadów (reguła z CLAUDE.md, sekcja „Nawigacja i warianty mockupów").

Legenda źródeł danych:
- **IST** — endpoint już istnieje, ścieżka podana z `server/src/http/routes/`.
- **DOROBIĆ** — endpoint do napisania; propozycja kontraktu w miejscu.

---

### A00 · `A00-logowanie.html`

**Cel.** Administrator wchodzi do panelu i dostaje sesję przeglądarkową ze swoją rolą.

**Kto ma dostęp.** Niezalogowany.

**Dane na ekranie.** Znak UZ AERO (`Brand`), pola `login` i `hasło`, informacja „Konta zakłada
administrator — panel nie ma rejestracji ani odzyskiwania hasła" (decyzja 2026-07-22),
stopka z wersją serwera i stanem połączenia z bazą.

**Skąd dane.** DOROBIĆ: `POST /admin/auth/login` `{login, password}` → `204` + cookie
`HttpOnly; Secure; SameSite=Strict` z krótkim JWT, oraz `GET /admin/me` →
`{pilotId, code, name, role}`. Komenda logowania to **istniejące** `AuthCommands.login`
(`application/commands/auth.ts`) — nowa jest wyłącznie koperta (cookie + rola + krótszy refresh).

**Akcje.** „Zaloguj" → `POST /admin/auth/login`. Brak „zapamiętaj mnie", brak „nie pamiętam
hasła" (nie ma kanału e-mail; reset robi drugi administrator na A11b).

**Stany brzegowe.**
- *błąd* — jeden komunikat dla złego loginu i złego hasła („Nieprawidłowe dane logowania”);
  serwer już dziś wyrównuje czas odpowiedzi `DUMMY_HASH`-em, UI nie może tego popsuć treścią.
- *konto wyłączone* — `account_disabled` z komunikatem „Konto nieaktywne — skontaktuj się
  z administratorem".
- *ładowanie* — przycisk w stanie zajętym, pola zablokowane.
- *serwer nieosiągalny* — baner `danger` „Brak połączenia z serwerem" (panel nie jest
  offline-first; tu brak sieci **jest** blokadą i wolno to powiedzieć wprost).

**Warianty.** `A00a`.

---

### A00a · `A00a-brak-uprawnien.html`

**Cel.** Powiedzieć poprawnie zalogowanemu pilotowi, że panel nie jest dla niego.

**Kiedy się pokazuje.** Poświadczenia poprawne, ale `role = 'pilot'` (albo brak roli).

**Kto ma dostęp.** Każde uwierzytelnione konto bez roli panelowej.

**Dane na ekranie.** Kto jest zalogowany (kod + nazwisko), komunikat „To konto ma rolę:
pilot. Panel wymaga roli administratora lub szefa wyszkolenia.", przycisk „Wyloguj".

**Skąd dane.** DOROBIĆ: `GET /admin/me` (zwraca rolę; brak uprawnień = `403` z ciałem
`{role}`).

**Akcje.** „Wyloguj" → `POST /admin/auth/logout` (kasuje cookie).

**Stany brzegowe.** Jedyny stan; nie ma tu ładowania ani pustki.

---

### A01 · `A01-pulpit.html`

**Cel.** W dziesięć sekund odpowiedzieć: czy coś się dzieje na lotnisku i czy coś wymaga mojej
decyzji dzisiaj.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.**
- **Kafle** (`.tiles`): samoloty z aktywnym claimem (`sessions.status='active'`) / łącznie
  w służbie (`aircraft.service_status='active'`); flagi otwarte (`flags` `status='open'`)
  z wiekiem najstarszej; zdarzenia przyjęte dziś (`events.received_at`); eksporty zaległe
  (sesje `closed` bez wpisu w `export_log` albo zablokowane flagą).
- **Flota na żywo** — wiersz per samolot: `aircraft.reg` + `type`, `claimPicId` → kod i nazwisko
  pilota, `claimSince` (UTC), `handover.reading.fuelL` / `.mh`, `lastSyncAt` (z
  `events.lastReceivedAt`), plakietka stanu: `W POWIETRZU` (sesja aktywna, ostatnie zdarzenie
  to `takeoff` bez `landing`) / `NA ZIEMI` / `WOLNY` / `WYŁĄCZONY`.
- **Do decyzji** — trzy najstarsze otwarte flagi (typ, samolot, wiek) z linkiem do A06.
- **Ostatnie dni** — pięć ostatnio zamkniętych sesji z linkiem do A03.

**Skąd dane.** DOROBIĆ: `GET /admin/dashboard` →
`{aircraft: [{aircraftId, reg, type, serviceStatus, claim: {picId, code, name, since} | null, handover: Handover | null, lastSyncAt, phase: 'air'|'ground'|'free'|'disabled'}], flags: {open, oldestAgeH, top: FlagRecord[]}, exports: {pending, failed}, eventsToday}`.
Wszystkie składniki istnieją już jako funkcje — `activeClaim` i `latestHandover`
(`application/aircraftStateView.ts`), `EventsStorePort.lastReceivedAt`,
`FlagsPort.openForAircraft`. Nowy jest wyłącznie agregat po całej flocie zamiast per samolot
(dziś `GET /aircraft/:id/state` w `http/routes/state.ts` odpowiada za jeden).

**Akcje.** Wyłącznie nawigacja (kafel → odfiltrowana lista, wiersz → A03/A06). **Pulpit nie ma
przycisków zmieniających stan** — ekran, na który się patrzy przy porannej kawie, nie jest
miejscem na akcję nieodwracalną.

**Stany brzegowe.**
- *pusty* — → wariant `A01a`.
- *ładowanie* — `.skel` w kafelkach i wierszach tabeli; nigdy spinner na całą stronę
  (CLAUDE.md: „nie dodawaj loadera bez określonego celu”).
- *dane w drodze* — samolot z aktywną sesją i `lastSyncAt` starszym niż ~30 min dostaje
  plakietkę amber `SYNC 2 H TEMU`; to **nie jest błąd**, to normalny dzień bez zasięgu.
- *błąd* — baner `danger` nad treścią z przyciskiem „Ponów"; kafle zostają w ostatnim znanym
  stanie z adnotacją wieku (ta sama logika co `cache` w aplikacji, §4.8).
- *brak uprawnień* — nie dotyczy (oboje mają dostęp).

**Warianty.** `A01a`.

---

### A01a · `A01a-pulpit-cisza.html`

**Cel.** Uczciwy stan zerowy — pokazać, że system działa, mimo że nic się nie dzieje.

**Kiedy się pokazuje.** Zero aktywnych claimów, zero otwartych flag, zero zaległych eksportów
(zima, dzień nielotny, świeżo postawiona instancja).

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Kafle z zerami (nie ukryte — zero to informacja), `.empty` w miejscu
tabeli floty: „Żaden samolot nie ma dziś aktywnej sesji", pod spodem data ostatniego dnia
lotnego z linkiem. Sekcja „Do decyzji" zwinięta do jednej linii `.banner.ok` „Skrzynka flag
pusta".

**Skąd dane.** Jak A01.

**Akcje.** Nawigacja do A02 („Zobacz historię dni").

**Stany brzegowe.** Rozróżnij *pusto* od *nigdy nie było danych*: świeża instancja pokazuje
dodatkowo `.banner.status` „Baza zawiera 0 zdarzeń — jeśli piloci już latali, sprawdź
synchronizację" z linkiem do A04.

---

### A02 · `A02-dni.html`

**Cel.** Znaleźć konkretny dzień lotny i ocenić, czy jest kompletny.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Tabela, jeden wiersz = jedna sesja (`sessions`), sortowana po `claim_time`
malejąco. Kolumny: **Dzień** (data UTC z `preflight_confirm.dutyStart`, pod spodem
`session_uuid` skrócony `.cell-sub`) · **Samolot** (`reg` + `type`) · **PIC** (nazwisko +
kod; `dual_id` jako podpis) · **Operacja** (`operation`) · **Loty** (`flights_count`) ·
**Block** (`block_ms` jako HH:MM) · **MH** (`mh_start` → `mh_end` w formacie `mh_format`
samolotu) · **Paliwo** (`fuel_start_l` → `fuel_end_l`) · **Stan** (plakietka:
`ZAMKNIĘTY` zielona / `OTWARTY` niebieska z pulsem / `FLAGA` amber z typem / `NAKŁADKA` amber)
· **Arkusz** (rewizja z `export_log` albo `—`).

Filtry (`.filters`): zakres dat, samolot, pilot, chipy `Wszystkie` / `Otwarte` / `Zamknięte`
/ `Z flagą` / `Bez arkusza`.

**Skąd dane.** DOROBIĆ: `GET /admin/sessions?from&to&aircraftId&picId&status&flagged&exported&limit&cursor`
→ `{items: [SessionRow & {reg, picCode, picName, dualCode, operation, dutyStart, flags: string[], exportRevision: number|null, lastSyncAt}], nextCursor}`.
Podstawą jest istniejąca projekcja `sessions` (`infrastructure/pg/sessionsProjection.ts`), która
dziś umie tylko `get` i `listByAircraft` — trzeba dołożyć `list(filter)` z paginacją.
Pola `operation` i `dutyStart` **nie są dziś w projekcji** — patrz §5 pkt 8.

**Akcje.** Wiersz → A03. „Eksportuj listę do CSV" (czysty odczyt, obie role). Zero akcji
mutujących na liście — masowe operacje na dniach to najprostszy sposób na masową szkodę.

**Stany brzegowe.**
- *pusty (filtr)* — `.empty` „Brak dni spełniających filtry" + przycisk „Wyczyść filtry".
- *pusty (baza)* — `.empty` „Nie zsynchronizowano jeszcze żadnego dnia".
- *ładowanie* — 8 wierszy `.skel`.
- *dane w drodze* — wiersz sesji otwartej ma plakietkę `OTWARTY` z pulsem i podpis
  „ostatni sync HH:MM UTC"; liczby w takim wierszu są przygaszone (`td.dim`) z tooltipem
  „stan na ostatni sync — dzień jeszcze trwa".
- *błąd* — baner nad tabelą, tabela zostaje z poprzednimi danymi.

---

### A03 · `A03-dzien.html`

**Cel.** Zrozumieć jeden dzień lotny w całości i — jeśli trzeba — wskazać zdarzenie do korekty.

**Kto ma dostęp.** Oboje (korekta tylko `admin`).

**Dane na ekranie.** Układ `.cols` (treść + kolumna boczna 380 px).

*Nagłówek:* samolot, data UTC, PIC/Dual (kody + nazwiska), operacja, klient, trasa
(`departureIcao` → `arrivalIcao`), `dutyStart` → `dutyEnd`, plakietka stanu.

*Baner stały (nie zamykalny — typ „status", `docs/design-notes.md`):* „Rejestr zdarzeń jest
append-only. Panel nie edytuje ani nie kasuje zdarzenia — korekta dopisuje `event_correction`."
Ten baner jest w `SZABLON.html` i **musi być na każdym ekranie, z którego da się coś poprawić**.

*Oś zdarzeń* (`.tl`) — pełny strumień w kolejności `gpsTime ?? deviceTime`, jak liczy
`projectSession`: czas UTC, typ zdarzenia po polsku, metoda (`AUTO`/`RĘCZNIE`), źródło
(`source_device`), oba zegary z podświetleniem rozjazdu > `CLOCK_DRIFT_MS`, uuid skrócony.
Zdarzenia unieważnione korektą — przekreślone (`.tl-row.voided`, klasa jest w szablonie),
z podpisem „unieważnione korektą <uuid> · <kto> · <kiedy>". Zdarzenia z poprawionym czasem —
stary czas przekreślony obok nowego.

*Tabela lotów* — z `SessionState.flights`: `index`, `takeoffAt`, `landingAt`, `durationMs`,
`method`, `takeoffUuid`/`landingUuid` jako cel korekty. Lot bez lądowania zostaje w tabeli
z myślnikami — jak na ekranie 10 i w karcie arkusza (`daySheetContent.ts`): ukrycie
schowałoby dokładnie ten wiersz, który wymaga korekty.

*Bilanse* — paliwo (`startL` / `addedL` / `consumedL` / `endL` / średnie L/h), motogodziny
(`start` / `end` / `deltaH` w formacie `mh_format`), zrzuty (`count`, `jumpers`,
`avgAltitudeFt`, `client`) tylko dla operacji `skoki`.

*Kolumna boczna:* flagi tej sesji (link do A06), historia eksportu (wszystkie rewizje
z `export_log` + link do karty A07a), licznik „zdarzeń przyjętych: N", `lastSyncAt`,
łańcuch MH — sesja poprzednia i następna tego samolotu z deltą (to samo, co liczy
`server/src/domain/mhChain.ts`).

**Skąd dane.** DOROBIĆ: `GET /admin/sessions/:uuid` →
`{row: SessionRow, state: SessionState, events: Event[], flags: FlagRecord[], exports: ExportRecord[], crew: {picCode, picName, dualCode, dualName}, aircraft: ReferenceAircraft, chain: {prev, next}}`.
`state` liczy **serwer** przez `projectSession` z `@uzaero/domain` — panel nie liczy nic
sam (ta sama gwarancja co `test/contract.test.ts`, który pilnuje, że wiersz `sessions`
odtwarza liczby projekcji). Strumień: istniejące `EventsStorePort.sessionEvents`.
Flagi: `FlagsPort.openForSession` — **rozszerzyć o rozwiązane**, bo karta dnia ma pokazywać
także flagi już zamknięte (inaczej historia decyzji znika).

**Akcje.**
- „Popraw" przy wierszu osi/lotu → **A03a** (tylko `admin`; dla szefa wyszkolenia przycisk
  jest widoczny i disabled z powodem „Wymaga roli: administrator").
- „Zobacz w rejestrze" → A04 z filtrem `sessionUuid`.
- „Ponów eksport" → A07 (akcja wykonuje się tam, nie tutaj — jedno miejsce na jedną operację).
- „Kopiuj link do dnia".

**Stany brzegowe.**
- *dzień otwarty* → wariant `A03b`.
- *ładowanie* — `.skel` w osi i bilansach.
- *sesja nieznana* — `.empty` „Nie ma sesji o tym identyfikatorze" (deep link z literówką).
- *sesja bez `preflight_confirm`* — realny stan: telefon wysłał `session_claim` i stracił
  zasięg. Bilanse pokazują `—`, baner `warn`: „Sesja nie ma potwierdzonego preflightu —
  brak odczytów startowych. Karta arkusza nie powstanie" (to dokładnie warunek `return null`
  w `buildDaySheet`).
- *brak uprawnień do korekty* — przycisk disabled z powodem, reszta ekranu bez zmian.

**Warianty.** `A03a`, `A03b`.

---

### A03a · `A03a-korekta-zdarzenia.html`

**Cel.** Administrator poprawia czas zdarzenia albo stwierdza, że zdarzenia nie było — po
upływie 24-godzinnego okna pilota.

**Kiedy się pokazuje.** Kliknięcie „Popraw" na A03/A04 przez konto z rolą `admin`.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.** Szuflada (`.drawer`) — **1:1 wzorzec arkusza 04c z aplikacji**, przeniesiony
na desktop:
- karta korygowanego zdarzenia: typ, obecny czas UTC, uuid, metoda, `source_device`;
- wybór akcji jako lista kart (`.opt-list`, **nigdy `<select>`**): **„Zły czas"** (`retime`) /
  **„Tego zdarzenia nie było"** (`void`);
- dla `retime`: pole czasu HH:MM UTC (maska, wpis czterech cyfr — jak na 02b/02c) + `± 1 min`;
- **„Wpływ na dzień"** — zapowiedź skutku wyliczona tą samą projekcją: czas lotu N przed/po,
  block time przed/po, MH bez zmian;
- **pole „Powód korekty" (wymagane)** — trafia do audytu, nie do zdarzenia;
- baner `warn`: „Okno samodzielnej korekty pilota (24 h) minęło HH:MM UTC — to jest korekta
  administracyjna. Pilot **nie zobaczy jej na swoim telefonie**" (patrz §6, ryzyko 3);
- baner `status`: „Oryginalne zdarzenie zostaje w rejestrze. Dopisujemy `event_correction`."

**Skąd dane.** DOROBIĆ: `POST /admin/sessions/:uuid/corrections`
`{targetUuid, action: 'retime'|'void', newTime?: number, reason: string}` →
`{correctionUuid, state: SessionState, export: {revision, url} | null}`.

Kontrakt po stronie serwera — cztery rzeczy, które ta trasa **musi** zrobić i żadnej więcej:
1. dopisać zdarzenie `event_correction` z `picId` **równym `sessionPicId` sesji** — inaczej
   reguła `WRITER_MISMATCH` (`packages/domain/src/rules/sessionRules.ts`) słusznie by je
   odrzuciła; tożsamość administratora **nie idzie do zdarzenia**, tylko do `source_device`
   (`'admin:<pilotId>'`) i do audytu;
2. przejść `checkAppend` z **jawnym pominięciem wyłącznie `CORRECTION_WINDOW_EXPIRED`** —
   wszystkie pozostałe inwarianty (`CORRECTION_TARGET_NOT_FOUND`,
   `CORRECTION_TARGET_NOT_ALLOWED`, `CORRECTION_TIME_IN_FUTURE`, `SESSION_MISMATCH`) obowiązują
   administratora tak samo jak pilota;
3. przeliczyć projekcję sesji w tej samej transakcji (jak `IngestCommands`);
4. wywołać `DayExporter.exportSession` → nowa rewizja karty, i dopisać wpis do audytu
   **w tej samej transakcji co zdarzenie**.

**Akcje.** „Zapisz korektę" (primary, wymaga wypełnionego powodu) · „Anuluj".

**Stany brzegowe.**
- *cel już unieważniony* — dozwolone (`applyCorrections`: „ostatnia wygrywa", `void` → `retime`
  przywraca zdarzenie); UI mówi to wprost: „To zdarzenie jest już unieważnione. Nadanie czasu
  przywróci je do wyliczeń".
- *cel to sama korekta* — zablokowane (`CORRECTION_TARGET_NOT_ALLOWED`): „Poprawia się fakt,
  nie poprawkę".
- *czas z przyszłości* — walidacja lokalna + serwerowa.
- *sesja nie ma `day_close`* — korekta administracyjna jest wtedy zbędna: pilot ma pełne prawo
  zapisu. Baner `warn` „Dzień jest otwarty — pilot poprawi to sam na telefonie" i akcja disabled.
- *błąd zapisu* — komunikat z kodem naruszenia po polsku (`RuleViolation.message` już jest po
  polsku i jest pisany do pilota — nadaje się wprost), szuflada zostaje otwarta z wypełnionymi
  polami.
- *brak uprawnień* — ekran nieosiągalny; `403` z serwera pokazujemy jako `.no-access`.

---

### A03b · `A03b-dzien-w-drodze.html`

**Cel.** Powiedzieć administratorowi, że patrzy na niepełny dzień — zanim wyciągnie wniosek.

**Kiedy się pokazuje.** `sessions.status = 'active'` (brak `day_close`), niezależnie od tego,
czy dzień faktycznie trwa, czy telefon nie dosłał danych.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Ten sam układ co A03, z czterema różnicami:
1. **Baner status na górze, nie zamykalny:** „Dzień otwarty — dane w drodze. Ostatnie zdarzenie
   przyjęto HH:MM UTC. Liczby poniżej to stan na ten moment, nie stan końcowy."
2. Wszystkie sumy (block, flight, zużycie, MH delta) mają przyrostek `…` i tooltip „w toku";
   `consumedL` i `deltaH` **nie są pokazywane** — projekcja zwraca dla nich `null` dopóki nie
   ma `day_close`, i wpisanie tam liczby byłoby zmyśleniem.
3. Ostatni wiersz osi zdarzeń to żywy wskaźnik „sesja aktywna · PIC KRZ od 07:10".
4. Korekta administracyjna disabled z powodem (patrz A03a, stan brzegowy).

**Skąd dane.** Jak A03.

**Akcje.** „Odśwież" (jawny, bo panel nie ma pushów — §4.6 „bez pushów" dotyczy też panelu).

**Stany brzegowe.** *Sesja otwarta od >24 h* — dodatkowy baner `warn`: „Sesja otwarta od 3 dni.
Możliwe, że pilot nie zamknął dnia albo telefon nie ma zasięgu. Sesja bez `day_close` blokuje
przekazanie dla następnego pilota" — to realna konsekwencja (`latestHandover` bierze bazę
z sesji **zamkniętych**).

---

### A04 · `A04-zdarzenia.html`

**Cel.** Odnaleźć konkretne zdarzenie albo wzorzec w surowym rejestrze — narzędzie do dochodzenia.

**Kto ma dostęp.** Oboje (odczyt).

**Dane na ekranie.** Tabela nad surowymi `events`: **Czas** (`gpsTime ?? deviceTime` UTC, pod
spodem `deviceTime` gdy różny) · **Typ** (plakietka kolorem grupy: silnik zielony, lot niebieski,
paliwo amber, korekta czerwona) · **Samolot** · **PIC** · **Sesja** (skrót + link do A03) ·
**Payload** (skrót, rozwijany) · **Źródło** (`source_device`) · **Przyjęto** (`received_at`) ·
**uuid**.

Filtry: zakres dat, samolot, pilot, typ zdarzenia (chipy po `EVENT_TYPES`), `sessionUuid`,
wyszukiwarka po `uuid` (wklejenie uuid z telefonu i naciśnięcie Enter to główny scenariusz
tego ekranu).

**Skąd dane.** DOROBIĆ:
`GET /admin/events?from&to&aircraftId&picId&type&sessionUuid&uuid&limit&cursor` →
`{items: (Event & {receivedAt, sourceDevice})[], nextCursor}`. Dziś `EventsStorePort` umie
wyłącznie `sessionEvents` — potrzebny `listEvents(filter)` z paginacją kursorową po
`(received_at, uuid)` (offsetowa paginacja po rosnącej tabeli gubi wiersze).

**Akcje.** Rozwiń payload (JSON w `.mono`, tylko odczyt) · „Popraw" przy zdarzeniu
korygowalnym → A03a (tylko `admin`) · „Pokaż dzień" → A03 · „Kopiuj uuid".
**Zero akcji edycji i usuwania — nigdy, w żadnym wariancie.**

**Stany brzegowe.**
- *pusty* — `.empty` „Brak zdarzeń dla tych filtrów".
- *uuid nieznany* — osobny komunikat, nie pustka: „Zdarzenie `<uuid>` nie dotarło na serwer.
  Sprawdź outbox telefonu (ekran 11 aplikacji)". To najczęstsze pytanie, jakie ten ekran
  dostanie, i pustka na nie nie odpowiada.
- *bardzo szeroki filtr* — twardy limit 500 wierszy na stronę (tyle, ile maksymalna paczka
  `POST /events`) + informacja „pokazano 500 z ~12 400 — zawęź filtry".
- *ładowanie / błąd* — jak A02.

---

### A05 · `A05-flagi.html`

**Cel.** Zobaczyć wszystko, co system uznał za niespójne, i wybrać, czym zająć się najpierw.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Tabela: **Typ** (plakietka: `MH_GAP` / `MH_REGRESSION` / `SESSION_OVERLAP`)
· **Samolot** · **Czego dotyczy** (1–2 sesje z datami i PIC-ami) · **Szczegóły** (z `details`:
`gapH`, `regressionH`, `prevEnd`, `nextStart`, `openSessions`) · **Otwarta od** (wiek) ·
**Skutek** (`SESSION_OVERLAP` → plakietka red `BLOKUJE ARKUSZ`) · **Stan**.

Chipy: `Otwarte` (domyślnie) / `Rozwiązane` / `Wszystkie`; filtr po typie i samolocie.

**Ważna prawda do pokazania na tym ekranie:** §4.5 dokumentacji wymienia sześć flag
(`DOUBLE_CLAIM`, `TIME_OVERLAP`, `MH_GAP`, `MH_REGRESSION`, `FUEL_MISMATCH`, `CLOCK_DRIFT`),
ale serwer produkuje dziś **trzy** (`server/src/domain/mhChain.ts`: `mh_gap`, `mh_regression`,
`session_overlap`). `FUEL_MISMATCH` i `CLOCK_DRIFT` istnieją wyłącznie jako **lokalne
ostrzeżenia w telefonie** (`packages/domain/src/rules/violations.ts`) i nigdy nie docierają
do serwera. Skrzynka będzie więc uboższa, niż sugeruje dokumentacja — mockup nie powinien
udawać, że jest inaczej (i patrz §5 pkt 12).

**Skąd dane.** DOROBIĆ: `GET /admin/flags?status&type&aircraftId&from&to` →
`{items: (FlagRecord & {aircraftReg, sessions: [{sessionUuid, day, picCode, status}], createdAt, resolvedAt, resolvedByCode, resolutionNote, blocksExport: boolean})[]}`.
`FlagsPort` ma dziś tylko `openForSession` / `openForAircraft` — brak listy globalnej i brak
możliwości odczytu flag rozwiązanych.

**Akcje.** Wiersz → A06 (szuflada). „Rozwiąż" bezpośrednio z listy **nie istnieje** — decyzja
o flagie wymaga zobaczenia obu sesji, a przycisk w wierszu zachęca do klikania bez patrzenia.

**Stany brzegowe.**
- *pusty (dobry)* — `.empty` z ikoną `ok`: „Skrzynka pusta — łańcuch motogodzin bez anomalii".
- *ładowanie / błąd* — jak A02.
- *flaga blokująca eksport starsza niż 7 dni* — wiersz wyróżniony `.banner.danger` nad tabelą:
  „1 flaga blokuje arkusz od 9 dni".

---

### A06 · `A06-flaga.html`

**Cel.** Rozstrzygnąć jedną niespójność: zobaczyć obie strony i zamknąć sprawę z uzasadnieniem.

**Kto ma dostęp.** Oboje (obie role mogą rozwiązywać — §4.5).

**Dane na ekranie.** Pełna strona (nie szuflada — porównanie dwóch sesji potrzebuje szerokości):
- nagłówek: typ flagi, samolot, kiedy powstała, czy blokuje eksport;
- **wyjaśnienie po polsku, co ta flaga znaczy** — nie sam kod: „Licznik motogodzin przeskoczył
  o 0,8 h między zamknięciem dnia 22 JUN a otwarciem dnia 24 JUN. Ktoś latał bez aplikacji albo
  odczyt startowy jest zawyżony";
- **dwie karty sesji obok siebie** (`.cols.even`): PIC, data, MH start/end, FOB start/end,
  block, liczba lotów, link do A03;
- **oś łańcucha MH** — pozycja obu sesji w łańcuchu samolotu z zaznaczoną dziurą/cofnięciem
  i tolerancją `MH_TOLERANCE_H = 0.1 h`;
- **pole „Jak rozstrzygnięto" (wymagane)** — trafia do `flags.resolution_note` i do audytu;
- baner `status`: „Rozwiązanie flagi **nie zmienia danych**. Jeśli dane są błędne, popraw je
  korektą (A03a) — flagę zamyka się dopiero wtedy, gdy sprawa jest zrozumiana."

**Skąd dane.** DOROBIĆ: `GET /admin/flags/:id` → jak wyżej + `chain: ChainLink[]` z sesji
samolotu (dane, które dziś liczy `chainFlags` w pamięci przy każdym ingescie).

**Akcje.**
- **„Oznacz jako rozwiązaną"** → DOROBIĆ: `POST /admin/flags/:id/resolve` `{note}` →
  `flags.status='resolved'`, `resolved_at`, `resolved_by`, `resolution_note`; **jeśli to była
  `session_overlap`, natychmiast wywołaj `DayExporter.exportSession` dla obu sesji** — to jest
  właśnie „re-eksport po rozwiązaniu flagi" z zaległości audytu (§5 pkt 10). Odpowiedź niesie
  wynik eksportu, żeby UI mogło powiedzieć „arkusz odblokowany · rewizja 2".
- „Otwórz dzień" → A03 (dla każdej z sesji).
- „Popraw zdarzenie" → A03a (tylko `admin`).

**Stany brzegowe.**
- *flaga już rozwiązana* → wariant `A06a`.
- *wyścig* — dwie osoby rozwiązują tę samą flagę: `POST …/resolve` na fladze `resolved`
  zwraca `409` z aktualnym stanem; UI pokazuje „Flagę rozwiązał już <kto> o HH:MM" i przeładowuje
  widok. Optymistyczna współbieżność wystarcza — konflikt jest rzadki, a blokady w back-offisie
  dla dwóch użytkowników to koszt bez zysku.
- *flaga bez drugiej sesji* (`session_uuids` jednoelementowe) — druga karta pusta z wyjaśnieniem.
- *ładowanie / błąd* — standard.

**Warianty.** `A06a`.

---

### A06a · `A06a-flaga-rozwiazana.html`

**Cel.** Pokazać zamkniętą sprawę jako dokument, nie jako zadanie.

**Kiedy się pokazuje.** `flags.status = 'resolved'`.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Jak A06, plus pas rozstrzygnięcia u góry (`.banner.ok`): kto, kiedy, notatka.
Akcje zamiany stanu **nie ma** — flagi nie otwiera się ponownie (adapter i tak nie pozwoli
utworzyć jej drugi raz: dedupe `ON CONFLICT (type, session_uuids) DO NOTHING` celowo obejmuje
flagi rozwiązane — `infrastructure/pg/flagsRepo.ts`). Zamiast tego przycisk „Zgłoś ponownie"
prowadzi do korekty albo do A16, z wyjaśnieniem dlaczego.

**Skąd dane.** Jak A06.

**Akcje.** Nawigacja + „Kopiuj link".

**Stany brzegowe.** Brak notatki (flaga rozwiązana przed wdrożeniem pola) — „—" z adnotacją
„rozstrzygnięcie sprzed rejestrowania uzasadnień".

---

### A07 · `A07-eksporty.html`

**Cel.** Odpowiedzieć: czy każdy zamknięty dzień ma aktualny arkusz — a jeśli nie, dlaczego.

**Kto ma dostęp.** Oboje (ponowienie: `admin`).

**Dane na ekranie.** Tabela zbudowana z **dwóch źródeł naraz**, bo pytanie dotyczy także tego,
czego w `export_log` nie ma: wiersz per zamknięta sesja. Kolumny: **Karta**
(`YYYY-MM-DD_SP-XXX` — konwencja §4.7, liczona identycznie po obu stronach: `sheetTabName`
w `daySheetContent.ts` i lustro w aplikacji) · **Dzień** · **Samolot** · **PIC** · **Rewizja**
(`export_log.revision`) · **Wyeksportowano** (`exported_at`) · **Stan**:
- `AKTUALNY` (zielony) — ostatnia rewizja młodsza niż ostatnie zdarzenie sesji;
- `NIEAKTUALNY` (amber) — do sesji doszły zdarzenia po ostatniej rewizji (spóźniony sync
  albo korekta administratora);
- `ZABLOKOWANY` (czerwony) — otwarta flaga `session_overlap` (bramka w `DayExporter`);
- `BRAK` (szary) — sesja zamknięta, zero wpisów w `export_log`;
- `NIEMOŻLIWY` (szary) — sesja bez `preflight_confirm`, `buildDaySheet` zwraca `null`.

Kafle u góry: aktualnych / nieaktualnych / zablokowanych / bez karty.

**Skąd dane.** DOROBIĆ: `GET /admin/exports?from&to&aircraftId&status` →
`{items: [{sessionUuid, tab, day, aircraftId, reg, picCode, revision, exportedAt, sheetUrl, state, blockingFlagId}]}`.
`ExportLogPort` ma dziś tylko `latest` i `append` — potrzebna lista z historią rewizji.

**Akcje.**
- **„Ponów eksport"** (`admin`) → DOROBIĆ: `POST /admin/exports/:sessionUuid/retry` →
  wywołuje `DayExporter.exportSession`, zwraca `{revision, url}` albo powód odmowy
  (`session_open` / `overlap_flag` / `no_preflight`). Odmowa **nie jest błędem HTTP** — to
  poprawna odpowiedź o stanie świata i UI ma ją pokazać jako wyjaśnienie, nie jako awarię.
- „Podgląd karty" → A07a.
- „Otwórz dzień" → A03.

**Stany brzegowe.**
- *pusty* — „Żaden dzień nie został jeszcze zamknięty".
- *ponowienie odmówione* — baner `warn` z powodem i linkiem do przyczyny (np. do flagi A06).
- *ponowienie w toku* — przycisk zajęty; eksport jest synchroniczny po stronie serwera,
  ale sieciowo może potrwać.
- *brak uprawnień* — przycisk widoczny, disabled, powód w podpisie.
- *adapter Google zamiast bazy* — kolumna „Karta" przestaje być klikalna wewnątrz panelu
  i staje się linkiem zewnętrznym; A07a wtedy nie istnieje (patrz A07a).

**Warianty.** `A07a`.

---

### A07a · `A07a-karta-arkusza.html`

**Cel.** Zobaczyć, co dokładnie poszło do dokumentu klubu — bez opuszczania panelu.

**Kiedy się pokazuje.** Kliknięcie „Podgląd karty" przy wierszu z rewizją ≥ 1, **przy
bazodanowym adapterze `SheetsPort`** (stan obecny, decyzja 2026-07-28). Po podmianie na adapter
Google ten ekran znika, bo karta mieszka wtedy poza nami.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Dosłowne wiersze karty (`exported_sheets.rows`, `string[][]`) wyrenderowane
jako tabela z zachowaniem pustych wierszy-separatorów, nagłówek z nazwą karty i `updated_at`,
oraz **pasek porównania**: „Karta z rewizji 2 (30 JUL 14:02 UTC) · dzień ma zdarzenia
z 30 JUL 15:40 UTC" gdy karta jest nieaktualna.

**Skąd dane.** IST: `GET /sheets/:tab` — `server/src/http/routes/sheets.ts`. **Uwaga:** trasa
autoryzuje wyłącznie nagłówkiem `Authorization: Bearer` (`http/authorize.ts`); panel na cookie
jej nie otworzy bez zmiany w autoryzacji (§5 pkt 3).

**Akcje.** „Ponów eksport" (skrót do akcji z A07) · „Kopiuj jako TSV".

**Stany brzegowe.**
- *`404`* — „Karta o tej nazwie nie istnieje w bazie" (wpis w `export_log` bez treści = usterka,
  warta zgłoszenia).
- *ładowanie* — `.skel` w wierszach.
- *karta pusta* — nie powinno wystąpić; jeśli wystąpi, pokazać surowy JSON.

---

### A08 · `A08-statystyki-floty.html`

**Cel.** Rozliczyć wykorzystanie samolotów za okres — dane do rozliczeń i planowania obsług.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Wybór okresu (miesiąc / kwartał / zakres). Tabela per samolot: **Reg + typ**
· **Dni lotne** (liczba zamkniętych sesji) · **Block time** (Σ `block_ms`) · **Flight time**
(Σ `flight_ms`) · **Loty** (Σ `flights_count`) · **MH początek/koniec/Δ** (z łańcucha:
najniższy `mh_start` i najwyższy `mh_end` w okresie, w formacie `mh_format`) · **Paliwo dolane**
· **Zużycie średnie L/h** · **Zrzuty** (dla samolotów latających skoki) · **Anomalie**
(liczba flag w okresie).

Kafle: łączny block floty, łączne MH, samolot najintensywniej używany, samolot bez lotów.

**Skąd dane.** DOROBIĆ: `GET /admin/stats/fleet?from&to` →
`{items: [...], totals: {...}}`. Liczone z projekcji `sessions` (te same kolumny, które
`sessionRowFrom` wypełnia z `projectSession`) — **nie z osobnych zapytań agregujących po
`events`**, żeby liczba w panelu nie mogła różnić się od liczby na telefonie.

**Akcje.** „Eksport CSV" · wiersz → A02 z filtrem samolotu i zakresu.

**Stany brzegowe.**
- *okres bez lotów* — `.empty` z podaniem okresu; **średnie pokazujemy jako „— —", nie 0**
  (ta sama zasada co ekran 10a: „przypis zamiast dzielenia przez zero").
- *dane niekompletne w okresie* — baner `warn`: „W okresie są 2 sesje otwarte — ich liczby nie
  wchodzą do sum" z linkiem. Sesja bez `day_close` nie ma `mh_end` ani `fuel_end_l`, więc
  wliczanie jej zafałszowałoby delty.
- *ładowanie / błąd* — standard.

---

### A09 · `A09-statystyki-pilotow.html`

**Cel.** Rozliczyć nalot i aktywność pilotów — podstawa nadzoru wyszkoleniowego.

**Kto ma dostęp.** Oboje.

**Dane na ekranie.** Wybór okresu. Tabela per pilot: **Kod + nazwisko** · **Dni lotne** ·
**Block jako PIC** · **Block jako Dual** · **Flight time** · **Loty** (starty/lądowania) ·
**Samoloty** (na jakich latał) · **Zrzuty** (wyniesienia / skoczkowie) · **Ostatni dzień lotny**.

**Uwaga do modelu:** block time Duala **nie jest** w projekcji `sessions` — jest tylko `dual_id`
i sumy sesji. §4.1 pkt 3 mówi „godziny Duala wylicza serwer", a aplikacja ma już do tego
`crewChange.test.ts` (atrybucja block time per pilot). Do panelu trzeba tę atrybucję wystawić
serwerowo — patrz §5 pkt 9. Do czasu jej wdrożenia kolumna „Block jako Dual" pokazuje
„—" z przypisem, a nie zero.

**Skąd dane.** DOROBIĆ: `GET /admin/stats/pilots?from&to`.

**Akcje.** „Eksport CSV" · wiersz → A02 z filtrem pilota · (`admin`) „Karta konta" → A11.

**Stany brzegowe.**
- *pilot bez lotów w okresie* — wiersz zostaje z zerami (nieobecność jest informacją dla szefa
  wyszkolenia), chip „bez lotów".
- *pilot dezaktywowany* — wiersz przygaszony z plakietką `NIEAKTYWNY`; historia zostaje, bo
  zdarzenia niosą jego `pic_id` na zawsze.
- *ładowanie / błąd / pusty okres* — standard.

---

### A10 · `A10-piloci.html`

**Cel.** Zobaczyć, kto ma dostęp do systemu i w jakim jest stanie.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.** Tabela nad `pilots`: **Kod** (`code`) · **Nazwisko** (`name`) ·
**E-mail** (`email`) · **Rola** (`pilot` / `instructor` / `admin` — po wdrożeniu §5 pkt 1) ·
**Stan** (`active` → plakietka `AKTYWNY` / `WYŁĄCZONY`) · **Ostatni dzień lotny** ·
**Aktywna sesja** (plakietka, jeśli pilot ma teraz claim) · **Motyw** (`theme` — informacyjnie,
migracja 6). Filtry: chipy `Aktywni` / `Wyłączeni` / `Wszyscy`, wyszukiwarka.

**Skąd dane.** DOROBIĆ: `GET /admin/pilots` →
`{items: [{id, code, name, email, role, active, updatedAt, theme, lastDayAt, activeSessionUuid}]}`.
`PilotsPort` (`application/ports.ts`) jest dziś **czystym odczytem po loginie/id** — nie ma
listy. Hasła (`password_hash`) **nie wychodzą z serwera nigdy**, w żadnej formie.

**Akcje.** „Nowe konto" → A11a · wiersz → A11.

**Stany brzegowe.**
- *pusty* — nie wystąpi w praktyce (admin jest w bazie), ale świeża instancja: „Tylko Twoje
  konto — dodaj pilotów".
- *ładowanie / błąd* — standard.
- *brak uprawnień* — `.no-access` z komunikatem „Konta pilotów obsługuje administrator".

---

### A11 · `A11-pilot.html`

**Cel.** Zmienić dane jednego konta albo odciąć mu dostęp.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.** Szuflada: kod (**tylko odczyt** — `code` jest w każdej karcie arkusza
i w każdym zdarzeniu; zmiana zerwałaby ciągłość dokumentów), nazwisko, e-mail, rola (lista kart
`.opt-list`: Pilot / Szef wyszkolenia / Administrator, z opisem uprawnień przy każdej),
przełącznik `active`, sekcja „Bezpieczeństwo" (data ostatniej zmiany hasła, przycisk resetu),
sekcja „Aktywność" (ostatnie dni lotne, aktywna sesja, liczba urządzeń = liczba żywych
refresh tokenów), sekcja „Ślad" (ostatnie wpisy audytu dotyczące tego konta).

**Skąd dane.** DOROBIĆ: `GET /admin/pilots/:id`, `PATCH /admin/pilots/:id`
`{name?, email?, role?, active?}`.

**Akcje.**
- „Zapisz" → `PATCH` + wpis do audytu (z diffem pól, **bez** wartości wrażliwych).
- „Resetuj hasło" → A11b.
- „Wyłącz konto" → `PATCH {active:false}`, z potwierdzeniem wymagającym wpisania kodu pilota
  (wzorzec „przytrzymaj/potwierdź" z aplikacji, przeniesiony na desktop). Dezaktywacja
  **unieważnia refresh** (`AuthCommands.refresh` sprawdza `account.active`), ale **nie unieważnia
  wydanego JWT** — ten żyje do godziny (`ACCESS_TTL_SEC`). UI musi to powiedzieć wprost:
  „Dostęp wygaśnie w ciągu godziny; sesja na telefonie działa do tego czasu".
- **„Usuń konto" nie istnieje.** Zdarzenia niosą `pic_id` i `dual_id` na zawsze; usunięcie
  pilota osierociłoby cały jego dorobek. Wyłączenie jest jedyną formą odejścia.

**Stany brzegowe.**
- *pilot ma aktywną sesję* — baner `warn` przy wyłączaniu: „Pilot prowadzi teraz SP-ABC.
  Wyłączenie konta nie zamknie dnia — zdarzenia z jego telefonu nadal będą przyjmowane przez
  godzinę, potem outbox zacznie się zatykać".
- *e-mail zajęty* — `UNIQUE` na kolumnie; komunikat przy polu.
- *ostatni administrator* — próba zmiany własnej roli lub wyłączenia ostatniego konta `admin`
  odrzucona z komunikatem „System musi mieć co najmniej jednego administratora".
- *ładowanie / błąd / brak uprawnień* — standard.

**Warianty.** `A11a`, `A11b`.

---

### A11a · `A11a-nowe-konto.html`

**Cel.** Założyć konto pilota — operacja, która dziś wymaga edycji `seed.ts`.

**Kiedy się pokazuje.** Przycisk „Nowe konto" na A10.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.** Formularz: kod (3 znaki, wielkie litery — walidacja `UNIQUE`), nazwisko,
e-mail (opcjonalny), rola (lista kart, domyślnie „Pilot"). Sekcja „Hasło startowe":
**hasło generuje serwer**, pole jest tylko do odczytu i pojawia się **dopiero w odpowiedzi**.
Baner `status`: „Hasło pokażemy raz. Przekaż je pilotowi kanałem, któremu ufasz — pierwsze
logowanie w aplikacji wymaga sieci i tworzy profil z PIN-em (§3.0)."

**Skąd dane.** DOROBIĆ: `POST /admin/pilots` `{code, name, email?, role}` →
`{id, code, tempPassword}`. Hasło **wyłącznie w ciele odpowiedzi**, nigdy w URL-u, nigdy
w parametrze zapytania, nigdy w logu (patrz §6, ryzyko 5). Hash liczy istniejący
`ScryptHasher` (`infrastructure/auth/scryptHasher.ts`).

**Akcje.** „Utwórz konto" · po sukcesie: karta z hasłem + „Kopiuj" + „Zamknij" (zamknięcie jest
nieodwracalne — hasła nie da się odczytać ponownie, można tylko zresetować).

**Stany brzegowe.**
- *kod zajęty* — walidacja przy polu.
- *sukces* — ekran zmienia się w kartę z hasłem; **nie zamykaj szuflady automatycznie**.
- *błąd po utworzeniu* (np. zerwana sieć w momencie odpowiedzi) — komunikat „Konto mogło
  powstać. Sprawdź listę i w razie potrzeby zresetuj hasło" — bo idempotencji tu nie ma.
- *brak uprawnień* — nieosiągalne.

---

### A11b · `A11b-reset-hasla.html`

**Cel.** Przywrócić pilotowi dostęp po zapomnianym haśle (§3.0: „reset hasła też u admina").

**Kiedy się pokazuje.** Przycisk „Resetuj hasło" na A11.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.** Potwierdzenie z kodem i nazwiskiem pilota, pole „Powód" (wymagane — trafia
do audytu), baner `warn`: „Reset unieważnia wszystkie sesje na urządzeniach tego pilota.
Jeśli ma niewysłane zdarzenia w outboxie, **musi je najpierw zsynchronizować** — aplikacja
blokuje wylogowanie przy niepustym outboxie (§3.0), ale wymuszony reset omija tę ochronę."
Po wykonaniu — hasło tymczasowe pokazane raz.

**Skąd dane.** DOROBIĆ: `POST /admin/pilots/:id/password-reset` `{reason}` →
`{tempPassword}`. Skutek: nowy `password_hash` + **skasowanie wszystkich `refresh_tokens`
tego pilota** + wpis do audytu.

**Akcje.** „Resetuj hasło" (przycisk `danger`, wymaga wpisania kodu pilota) · „Anuluj".

**Stany brzegowe.**
- *pilot ma aktywną sesję* — baner `danger` z jawnym ostrzeżeniem o outboxie; akcja pozostaje
  dostępna (bywa konieczna), ale nie bez tej informacji.
- *sukces* — karta z hasłem, jak A11a.
- *błąd* — hasło **nie zostało** zmienione (operacja transakcyjna); komunikat mówi to wprost.

---

### A12 · `A12-flota.html`

**Cel.** Zobaczyć konfigurację wszystkich samolotów w jednym miejscu.

**Kto ma dostęp.** Oboje (edycja: `admin`).

**Dane na ekranie.** Tabela nad `aircraft`: **Rejestracja** · **Typ + rok** · **Pojemność
(`capacity_l`)** · **Format MH (`mh_format`)** · **Załoga 2-os. (`dual_required`)** ·
**Stan służby (`service_status`)** · **Aktywny claim** · **Ostatnie przekazanie** (FOB/MH
z `latestHandover` + kto i kiedy) · **Ostatni sync**.

**Skąd dane.** IST (częściowo): `GET /reference` — `http/routes/reference.ts` — zwraca już
komplet konfiguracji **plus** `claimPicId`, `claimSince` i `handover` per samolot
(`application/queries/reference.ts`). Panel może użyć tego endpointu do odczytu; do zapisu
i do samolotów wyłączonych trzeba DOROBIĆ `GET /admin/aircraft` (bo `/reference` jest
kontraktem telefonu i nie powinien puchnąć od pól panelowych).

**Akcje.** „Nowy samolot" → A13a (`admin`) · wiersz → A13.

**Stany brzegowe.**
- *samolot wyłączony* — wiersz przygaszony z plakietką `WYŁĄCZONY`; nie znika z listy (na 02
  w aplikacji też jest widoczny jako disabled).
- *pusty* — nie wystąpi po seedzie; świeża baza: „Brak samolotów — dodaj pierwszy".
- *ładowanie / błąd* — standard.

---

### A13 · `A13-samolot.html`

**Cel.** Zmienić konfigurację samolotu ze świadomością, co ta zmiana rozjedzie.

**Kto ma dostęp.** `admin` (szef wyszkolenia: odczyt).

**Dane na ekranie.** Szuflada: rejestracja (**tylko odczyt** — `reg` = `id` = klucz w każdej
nazwie karty `YYYY-MM-DD_SP-XXX`), typ, rok, `capacity_l` (litry), `mh_format` (lista kart:
`Dziesiętny 1234.5` / `Godzinowy 1234:30` — **nigdy `<select>`**), `dual_required` (przełącznik
z opisem „blokuje przejście preflightu bez drugiego pilota"), `service_status`
(`active` / `disabled`). Sekcja „Skutki zmiany" — żywa, zależna od pola:
- zmiana `capacity_l` → „Zmieni skalę wskaźnika paliwa i walidację `FUEL_OVER_CAPACITY`
  w aplikacji, oraz tolerancję `FUEL_MISMATCH` (5% pojemności)";
- zmiana `mh_format` → „Zmieni wygląd odczytów MH w aplikacji **i w kartach arkusza**.
  Karty już wyeksportowane zostają w starym formacie — do ponownego eksportu";
- `service_status → disabled` → „Samolot zniknie z wyboru w preflightcie. Aktywna sesja
  **nie zostanie przerwana**".

Sekcja „Historia": ostatnie dni tego samolotu, aktualny łańcuch MH.

**Skąd dane.** DOROBIĆ: `GET /admin/aircraft/:id`, `PATCH /admin/aircraft/:id`.
`PATCH` **musi podbić `aircraft.updated_at`** — ta kolumna jest składnikiem ETagu `/reference`
(`ReferenceQueries.get`: `W/"ref-<refStamp>-<sessStamp>"`), więc bez podbicia telefony
dostawałyby `304` i nigdy nie zobaczyły nowej konfiguracji.

**Akcje.** „Zapisz" (z podsumowaniem zmian przed zapisem) · „Wyłącz ze służby".

**Stany brzegowe.**
- *samolot ma aktywną sesję* — baner `warn`: „SP-ABC prowadzi teraz KRZ. Zmiana `capacity_l`
  wejdzie na jego telefon dopiero przy następnym odświeżeniu cache referencyjnego (brama
  15 min, §4.8) — bieżące walidacje pozostaną na starej wartości".
- *`capacity_l` niższa niż ostatni znany FOB* — baner `warn` z liczbami: „Ostatnie przekazanie
  to 150 L, a wpisujesz pojemność 120 L. Aplikacja uzna dotychczasowe odczyty za przekroczenie".
- *ładowanie / błąd / brak uprawnień* — standard.

**Warianty.** `A13a`.

---

### A13a · `A13a-nowy-samolot.html`

**Cel.** Wprowadzić nową maszynę do floty.

**Kiedy się pokazuje.** Przycisk „Nowy samolot" na A12.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.** Jak A13, plus pola rejestracji i `id` (**`id = reg`** — tak jest w seedzie
i tak zakłada nazwa karty; formularz to pokazuje, a nie pyta o dwie wartości). Sekcja
„Stan początkowy": informacja, że **pierwszy odczyt MH i FOB wprowadzi pilot w preflightcie** —
panel nie zakłada łańcucha, bo licznik fizyczny jest źródłem prawdy (§4.1 pkt 5). To jest
świadoma decyzja, nie brak funkcji, i mockup ma ją nazwać.

**Skąd dane.** DOROBIĆ: `POST /admin/aircraft`.

**Akcje.** „Dodaj samolot".

**Stany brzegowe.** *Rejestracja zajęta* — `UNIQUE (reg)`, walidacja przy polu.

---

### A14 · `A14-audyt.html`

**Cel.** Odtworzyć, kto co zmienił w systemie — i przez to uczynić panel bezpiecznym.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.** Tabela wpisów w porządku odwrotnie chronologicznym: **Czas UTC** ·
**Kto** (kod + nazwisko + rola w chwili akcji) · **Akcja** (plakietka: `KOREKTA`, `FLAGA`,
`KONTO`, `HASŁO`, `FLOTA`, `EKSPORT`, `KONSERWACJA`) · **Czego dotyczy** (typ + identyfikator
z linkiem do obiektu) · **Szczegóły** (diff/notatka, rozwijane) · **Adres IP**.
Filtry: zakres dat, aktor, typ akcji.

**Skąd dane.** DOROBIĆ: `GET /admin/audit?from&to&actor&action&limit&cursor`, nad nową tabelą
`admin_audit` (§5 pkt 4).

**Akcje.** Rozwiń szczegóły · „Otwórz obiekt" · „Eksport CSV". **Zero akcji zmieniających** —
audyt jest append-only jak rejestr zdarzeń, i to nie jest analogia, tylko ta sama zasada.

**Stany brzegowe.**
- *pusty* — „Brak zarejestrowanych akcji" (świeży panel).
- *obiekt usunięty* — nie wystąpi (nic nie usuwamy), ale wpis o pilocie wyłączonym prowadzi
  do konta z plakietką `NIEAKTYWNY`.
- *ładowanie / błąd / brak uprawnień* — standard.

---

### A15 · `A15-progi.html`

**Cel.** Pokazać, przy jakich progach system wykrywa starty i lądowania — i dlaczego nie zmienia
się ich tutaj.

**Kto ma dostęp.** Oboje (**odczyt, obie role**).

**Dane na ekranie.** Trzy grupy progów z `packages/domain/src/detection/thresholds.ts`, każdy
z wartością, jednostką i **jednozdaniowym uzasadnieniem z docblocka** (te uzasadnienia już
istnieją i są dobre — mockup ma je pokazać, nie streszczać):
- **Kołowanie** — `TAXI_DISPLACEMENT_M 25`, `TAXI_ANCHOR_RADIUS_M 10`, `ANCHOR_WINDOW_SEC 20`,
  `STOP_WINDOW_SEC 15`, `STOP_DISPLACEMENT_M 10`, `TAXI_SPEED_KT 4`, `TAXI_CONFIRM_SEC 4`;
- **Start i lądowanie** — `TAKEOFF_SPEED_KT 50`, `LANDING_SPEED_KT 35`,
  `TAKEOFF_ALT_DIFF_FT 50`, `LANDING_ALT_DIFF_FT 30`, `TAKEOFF_CONFIRM_SEC 5`,
  `LANDING_CONFIRM_SEC 8`, cooldowny 60/30 s, `AUTODETECT_TOAST_SEC 5`,
  `TAKEOFF_MAX_DECEL_KT_PER_SEC 0.5`, `LANDING_TURN_RATE_VETO_DPS 3`;
- **Jakość sygnału** — `GPS_STALE_SEC 15`, `MAX_FIX_ACCURACY_M 50`,
  `MAX_PLAUSIBLE_SPEED_KT 250`, `LANDING_FIELD_VICINITY_NM 2`.

Plus tolerancje reguł z `rules/tolerances.ts`: `FUEL_TOLERANCE_L 10` / 5% pojemności,
`MH_TOLERANCE_H 0.1`, `CLOCK_DRIFT_MS 120 000`, `CORRECTION_WINDOW_MS 24 h`.

**Baner `warn`, nie zamykalny, u góry ekranu:**
> „Progów nie stroimy na wyczucie. Zmiana progu wymaga przebiegu `server/scripts/replay.ts`
> na nagraniach ze śladu kalibracyjnego (`POST /traces`) i aktualizacji
> `docs/algorytm-detekcji.md` w tym samym commicie (CLAUDE.md). Ten ekran pokazuje wartości
> obowiązujące w wydanej wersji aplikacji."

Pod spodem: **wersja aplikacji, z której pochodzą wartości**, liczba nagrań w katalogu
`TRACES_DIR` i data ostatniego przebiegu replaya.

**Skąd dane.** DOROBIĆ: `GET /admin/detection/thresholds` → `{thresholds: GPS_THRESHOLDS,
tolerances: {...}, appVersion, traces: {sessions, lastAt}}`. Serwer po prostu serializuje
stałe z `@uzaero/domain` — panel nie trzyma ich kopii.

**Akcje.** „Kopiuj jako JSON" (materiał do promptu/zgłoszenia) · „Procedura kalibracji" —
rozwijana sekcja z krokami: nagraj ślad → `npx tsx scripts/replay.ts traces/<plik>.ndjson` →
porównaj z markerami pilota → zmień `overrides` → commit z aktualizacją dokumentacji.

**Stany brzegowe.**
- *brak nagrań* — „Katalog śladu jest pusty — bez nagrań kalibracja nie ma na czym się oprzeć"
  z linkiem do instrukcji włączenia śladu w aplikacji.
- *ładowanie / błąd* — standard.

> **Do decyzji (ważne).** Zakres v1 wymienia „edycję progów detekcji". Progi są dziś **stałymi
> kompilacyjnymi** w `@uzaero/domain`, zaszytymi w bundle aplikacji — ich edycja z panelu
> wymagałaby tabeli konfiguracyjnej, dostarczania wartości przez `/reference` i przepisania
> detektora tak, żeby czytał progi z cache referencyjnego zamiast z importu (szacunek: **L**,
> ryzyko: **wysokie** — patrz §6, ryzyko 6). **Rekomendacja: w v1 ekran jest tylko do odczytu.**
> Jeśli edycja ma powstać, właściwym kształtem nie jest formularz z liczbami, tylko wniosek
> zmiany z załączonym raportem replaya — a to jest osobna funkcja, nie pole tekstowe.

---

### A16 · `A16-konserwacja.html`

**Cel.** Wykonać operacje na maszynerii systemu, gdy dane wymagają naprawy strukturalnej.

**Kto ma dostęp.** `admin`.

**Dane na ekranie.**
- **Stan bazy** — wersja schematu (`SCHEMA_VERSION`, dziś 6), liczby wierszy w `events`,
  `sessions`, `flags`, `export_log`, `exported_sheets`, data najstarszego i najświeższego
  zdarzenia.
- **Przebudowa projekcji `sessions`** — karta operacji z opisem: „Przelicza wszystkie wiersze
  `sessions` ze strumienia `events` przez `projectSession`. Bezpieczne z definicji — projekcja
  nie jest źródłem prawdy. Używaj po zmianie kodu projekcji albo gdy liczby w panelu nie zgadzają
  się z telefonem." Podgląd zakresu (ile sesji), przycisk, wynik z liczbą przeliczonych wierszy
  i wykrytymi różnicami.
- **Kolejka ponowień eksportu** — lista sesji, dla których ostatni eksport się nie powiódł,
  z powodem i przyciskiem ponowienia wsadowego.
- **Sprzątanie refresh tokenów** — liczba wygasłych, przycisk usunięcia.
- **Konfiguracja eksportu (odczyt)** — adapter (`baza` / `google`), `PUBLIC_BASE_URL`,
  `TRACES_DIR`.

**Skąd dane.** DOROBIĆ: `GET /admin/maintenance` (stan) ·
`POST /admin/maintenance/rebuild-projections` · `POST /admin/maintenance/retry-exports` ·
`POST /admin/maintenance/prune-refresh-tokens`. Przebudowa projekcji to **pozycja
z „Zaległości audytu serwera"** („skrypt administracyjny przebudowy projekcji `sessions`
ze zdarzeń") — panel jest dla niej naturalnym opakowaniem.

**Akcje.** Każda operacja z potwierdzeniem, każda pisze do audytu, każda zwraca **raport**
(co zrobiła), nie samo „OK".

**Stany brzegowe.**
- *operacja w toku* — przycisk zajęty, pozostałe zablokowane (nie równolegle).
- *operacja długa* — przebudowa przy dużej bazie potrwa; UI pokazuje postęp albo mówi wprost
  „to może potrwać kilka minut, nie zamykaj karty".
- *różnice wykryte przy przebudowie* — wynik jest wtedy **ważną informacją**, nie sukcesem:
  „Przeliczono 412 sesji, 3 miały inne liczby niż zapisane" + lista z linkami do A03.
- *brak uprawnień* — `.no-access`.

---

## 5. Czego brakuje po stronie serwera

Kolejność = kolejność wdrażania (każda pozycja zakłada poprzednie). „Zaległość" = pozycja
z listy **„Zaległości audytu serwera (2026-07-28)"** w `docs/architektura-kodu.md` §0.

| # | Brak | Skąd | Praco-chłonność |
|---|---|---|---|
| 1 | **Rola na koncie.** `pilots` nie ma kolumny roli, a claims JWT to `{pilotId, code}` (`infrastructure/auth/hs256Tokens.ts`, `application/ports.ts`). Migracja 7: `ALTER TABLE pilots ADD COLUMN role TEXT NOT NULL DEFAULT 'pilot'` + rozszerzenie claims + `test/schema.test.ts` (lista kolumn przybita na sztywno). **Brak roli w starym tokenie musi znaczyć `pilot`**, nie „przepuść". | Nowe | **S** |
| 2 | **Autoryzacja per rola.** `http/authorize.ts` zwraca tożsamość albo `null` — nie zna pojęcia uprawnienia. Dołożyć `requireRole(tokens, header, ...roles)` i użyć w każdej trasie `/admin/*`. To jedyne miejsce, w którym audyt czyta, co przepuszczamy (tak mówi docblock tego pliku) — i tak ma zostać. | Nowe | **S** |
| 3 | **Sesja przeglądarkowa.** `authorize` czyta wyłącznie `Authorization: Bearer`. Panel na cookie `HttpOnly` wymaga, żeby autoryzacja akceptowała też cookie (albo żeby panel trzymał token w pamięci JS — gorzej: XSS). Do tego `POST /admin/auth/login` z **krótkim** refreshem: 90 dni z `REFRESH_TTL_DAYS` jest sensowne dla telefonu w terenie i bez sensu dla przeglądarki na biurku. Plus CSRF (`SameSite=Strict` + nagłówek na mutacjach). | Nowe | **M** |
| 4 | **Tabela audytu.** Migracja 8: `admin_audit (id BIGSERIAL, actor_pilot_id TEXT NOT NULL, actor_role TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT, target_id TEXT, details JSONB NOT NULL DEFAULT '{}', ip TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`, append-only, bez `UPDATE`/`DELETE` w kodzie. Adapter `PgAuditRepo` + port. **Zapis audytu w tej samej transakcji co zmiana** — zmiana bez śladu ma nie mieć prawa się zapisać. | Nowe | **S** |
| 5 | **Zapis kont.** `PilotsPort` to czysty odczyt („zapis kont mieszka w seedzie/administratorze" — docblock w `ports.ts`). Nowy `PilotsAdminPort`: `list(filter)`, `create`, `update`, `setPassword`, `deactivate`; komendy `PilotAdminCommands` z generowaniem hasła (`node:crypto`), użyciem `ScryptHasher` i kasowaniem `refresh_tokens` przy resecie. | Nowe | **M** |
| 6 | **Zapis floty.** `PgReferenceRepo` czyta migawkę; brak `create`/`update` z podbiciem `updated_at` (składnik ETagu `/reference` — bez podbicia telefony dostaną `304` i nie zobaczą zmiany). | Nowe | **S** |
| 7 | **Korekta administracyjna.** Trasa `POST /admin/sessions/:uuid/corrections` + komenda, która: stempluje zdarzenie `picId = sessionPicId` (inaczej `WRITER_MISMATCH`), przechodzi `checkAppend` z **pominięciem wyłącznie `CORRECTION_WINDOW_EXPIRED`**, przelicza projekcję w transakcji, dopisuje audyt i wywołuje `DayExporter`. Wymaga rozszerzenia `checkAppend` o jawny tryb administracyjny — **nie o obejście reguł w warstwie HTTP**; reguła omijana z zewnątrz przestaje być regułą. | Nowe | **L** |
| 8 | **Listy i filtry po sesjach.** `SessionsProjectionPort` ma `get` i `listByAircraft`. Brak: `list(filter, cursor)`. Dodatkowo projekcja **nie trzyma** `operation`, `dutyStart` ani `client` — a lista dni bez rodzaju operacji i daty jest bezużyteczna. Migracja 9: trzy kolumny do `sessions` + uzupełnienie `sessionRowFrom` (`application/sessionRow.ts`) + przebudowa istniejących wierszy (patrz #14). | Nowe | **M** |
| 9 | **Atrybucja block time per pilot.** §4.1 pkt 3: „godziny Duala wylicza serwer" — dziś nie wylicza. Aplikacja ma tę logikę (`crewChange.test.ts`), serwer nie. Bez niej A09 nie ma kolumny „Block jako Dual". Właściwe miejsce: funkcja w `@uzaero/domain` (wspólna z aplikacją), użyta przez zapytanie statystyk. | Nowe | **M** |
| 10 | **Cykl życia flag.** Brak `resolve` (w całym `server/src` nie ma kodu ustawiającego `status='resolved'`), brak listy globalnej, brak kolumn `resolved_by` i `resolution_note` (migracja 10). **Re-eksport po rozwiązaniu flagi** jest wprost w zaległościach audytu i musi wejść razem z `resolve` — inaczej odblokowanie flagi nie odblokuje arkusza. | Częściowo zaległość (re-eksport), reszta nowe | **M** |
| 11 | **Przeglądarka zdarzeń.** `EventsStorePort.sessionEvents` to jedyny odczyt strumienia. Potrzebne `listEvents(filter, cursor)` z paginacją kursorową po `(received_at, uuid)` i indeksami pod filtry (`received_at`, `type`, `pic_id`). | Nowe | **M** |
| 12 | **Flagi, których serwer nie produkuje.** §4.5 obiecuje `DOUBLE_CLAIM`, `TIME_OVERLAP`, `FUEL_MISMATCH`, `CLOCK_DRIFT`; `mhChain.ts` liczy trzy inne. `FUEL_MISMATCH` i `CLOCK_DRIFT` telefon wykrywa lokalnie i **nigdzie nie zgłasza**. Do decyzji: albo serwer liczy je sam przy ingescie (ma wszystkie dane: oba zegary w każdym zdarzeniu, `capacity_l` w `aircraft`), albo dokumentacja przestaje ich obiecywać. **Rekomendacja: policzyć na serwerze przy ingescie** — to kilkadziesiąt linii obok `chainFlags`, a skrzynka flag bez nich pomija dwie najczęstsze usterki terenowe. | Nowe (rozjazd dokumentacji z kodem) | **M** |
| 13 | **Statystyki zbiorcze.** Brak jakiegokolwiek zapytania agregującego. `GET /admin/stats/fleet` i `/admin/stats/pilots` liczone **z projekcji `sessions`**, nie z osobnych sum po `events` — inaczej panel zacznie mówić inne liczby niż telefon i arkusz. Rozszerzyć `test/contract.test.ts` o tę gwarancję. | Nowe | **M** |
| 14 | **Przebudowa projekcji `sessions`.** Wprost w zaległościach audytu („skrypt administracyjny przebudowy projekcji sessions ze zdarzeń”). Panel potrzebuje jej jako **endpointu**, nie tylko skryptu — i potrzebuje jej natychmiast po #8 (nowe kolumny w istniejących wierszach będą puste). | Zaległość | **M** |
| 15 | **`UNIQUE (session_uuid, revision)` na `export_log` + kolejka ponowień.** Wprost w zaległościach audytu. Ekran A07/A16 opiera się na obu. | Zaległość | **S** |
| 16 | **Rate-limit na `/auth/*`.** Wprost w zaległościach audytu, dziś brute-force ogranicza tylko koszt scrypta. Panel **podnosi wagę tej pozycji z „przed wdrożeniem" na „przed uruchomieniem panelu"**: formularz logowania w przeglądarce jest publiczny w sposób, w jaki API telefonu nie było. | Zaległość (podniesiony priorytet) | **S** |
| 17 | **Klucze obce `events`/`sessions` → `pilots`/`aircraft`.** Zaległość audytu; nabiera znaczenia, gdy panel pozwala wyłączać pilotów i samoloty (dziś spójność pilnuje kod, nie schemat). | Zaległość | **S** |
| 18 | **Serwowanie panelu.** `@fastify/static` pod `/admin` z tego samego kontenera — zero CORS, zero drugiego deploya, cookie na tym samym origin. | Nowe | **S** |
| 19 | **Progi jako dane (opcjonalnie).** Tylko jeśli edycja progów wejdzie do zakresu: tabela konfiguracji + dostarczanie przez `/reference` + przepisanie detektora na progi wstrzykiwane. Patrz A15 „Do decyzji". | Nowe | **L** |

**Suma szacunków:** 4×L/M ciężkich (#7, #8, #10, #13) plus kilkanaście S/M. Pozycje #1–#4 są
warunkiem wszystkiego pozostałego i powinny wejść jednym ciągiem.

---

## 6. Ryzyka i pułapki

**1. Append-only vs. pokusa edycji.**
Tabela z wierszami, których nie da się kliknąć i poprawić, jest w back-offisie nienaturalna —
i to jest właśnie ta pokusa. Kiedyś ktoś powie „to tylko literówka w czasie, po co całe
zdarzenie".
*Odpowiedź projektowa:* (a) **panel nie ma trasy, która wykonuje `UPDATE` ani `DELETE` na
`events`** — nie jako konwencja, tylko jako test architektury po stronie serwera, w duchu
`architecture.test.ts` z aplikacji; (b) każdy ekran, z którego da się coś poprawić, nosi
niezamykalny baner „Rejestr jest append-only" (jest już w `SZABLON.html`); (c) wiersze osi
zdarzeń **nie mają pól edytowalnych** — jedyna akcja to „Popraw", która otwiera arkusz
korekty 1:1 jak 04c; (d) unieważnione zdarzenia zostają widoczne jako przekreślone
(`.tl-row.voided`), więc historia decyzji jest częścią widoku, a nie czymś, co znika.

**2. Panel jako źródło rozjazdu z arkuszem.**
Korekta administratora zmienia liczby dnia. Karta w `exported_sheets` to UPSERT po `tab` —
czytelnik linku widzi ostatnią wersję i nie ma pojęcia, że coś się zmieniło.
*Odpowiedź projektowa:* każda korekta **kończy się wywołaniem `DayExporter`** w tej samej
operacji, a odpowiedź niesie numer nowej rewizji — UI mówi „arkusz zaktualizowany · rewizja 3”,
nie „zapisano". A07 ma osobny stan `NIEAKTUALNY` liczony z porównania `export_log.exported_at`
z czasem ostatniego zdarzenia sesji, więc rozjazd jest widoczny **zanim** ktoś o niego zapyta.
`export_log` zostaje append-only — historia „co i kiedy poszło" jest jedynym śladem rozjazdu
arkusz↔rejestr (docblock migracji 5 mówi to wprost i to się nie zmienia).

**3. Rozjazd panel ↔ telefon pilota — ryzyko, którego dziś nie ma czym zamknąć.**
Korekta administratora zapisuje się na serwerze. **Telefon pilota nigdy się o niej nie dowie** —
w kontrakcie §4.6 nie ma endpointu, który zwraca zdarzenia do aplikacji; sync jest
jednokierunkowy (telefon pisze, serwer czyta stan floty). Pilot otworzy `12-historia`, zobaczy
swoje stare liczby i będzie miał rację, że są jego.
*Odpowiedź projektowa v1:* powiedzieć to wprost w miejscu, w którym zapada decyzja — baner
w A03a: „Pilot nie zobaczy tej korekty na swoim telefonie". Plus wymagane pole „Powód" i wpis
w audycie, żeby rozmowa z pilotem miała podstawę.
*Rekomendacja poza v1:* minimalny `GET /sessions/:uuid/events?since=<received_at>` i dociąganie
cudzych korekt do lokalnego rejestru — to jest tani endpoint i domyka pętlę, którą panel
otwiera. **Do decyzji właściciela produktu.**

**4. Uprawnienia i ślad audytowy.**
Panel z dwiema rolami, w którym wszystko robi „administrator" i nikt nie wie kto, jest gorszy
od SQL-a — bo SQL przynajmniej zostawia ślad w historii powłoki.
*Odpowiedź projektowa:* (a) **audyt zapisywany w tej samej transakcji, co zmiana** — operacja,
której nie udało się zaudytować, nie zachodzi; (b) rola sprawdzana **na serwerze przy każdej
trasie**, UI tylko ją odzwierciedla (ukryty przycisk nie jest zabezpieczeniem); (c) pola
„Powód"/„Jak rozstrzygnięto" **wymagane** przy korekcie, rozwiązaniu flagi i resecie hasła —
nie jako biurokracja, tylko dlatego, że za pół roku nikt nie pamięta; (d) rola zapisywana
w audycie **w chwili akcji** (`actor_role`), bo role się zmieniają.

**5. Dane osobowe pilotów i hasła.**
Panel wyświetla nazwiska, e-maile, historię aktywności i wydaje hasła startowe.
*Odpowiedź projektowa:* (a) hasło **wyłącznie w ciele odpowiedzi `POST`, jednorazowo** — nigdy
w URL-u, nigdy w query stringu, nigdy w treści logu; UI pokazuje je raz i nie ma sposobu na
ponowny odczyt (tylko reset); (b) hash **nigdy nie opuszcza serwera** w żadnym kształcie —
`GET /admin/pilots` zwraca konto bez `password_hash`; (c) **konta się nie usuwa, tylko
dezaktywuje** — zdarzenia niosą `pic_id` na zawsze, a usunięcie osieroci cały dorobek pilota;
(d) audyt zapisuje fakt resetu i powód, **nie hasło**; (e) szef wyszkolenia **nie widzi listy
kont** — do nadzoru wystarczają kod i nazwisko w statystykach.

**6. Progi detekcji zmieniane „na wyczucie".**
`CLAUDE.md` zakazuje tego wprost: „Progów NIE stroimy »na wyczucie«: służy do tego
`server/scripts/replay.ts` na nagraniach ze śladu kalibracyjnego". Formularz z polami
liczbowymi i przyciskiem „Zapisz" jest zaproszeniem dokładnie do tego, czego zakaz dotyczy —
zwłaszcza po pierwszym telefonie od pilota „za późno wykryło mi start".
*Odpowiedź projektowa:* A15 jest **tylko do odczytu**, z wartościami, ich uzasadnieniami
z kodu, procedurą kalibracji i liczbą dostępnych nagrań. Zmiana progu przechodzi przez replay
i commit (razem z `docs/algorytm-detekcji.md` — reguła twarda z CLAUDE.md). Gdyby edycja
kiedyś weszła, jej właściwym kształtem jest **wniosek zmiany z załączonym raportem replaya**,
nie pole liczbowe. Dodatkowo: progi są dziś stałymi kompilacyjnymi w bundlu aplikacji, więc
„zapisanie" ich w panelu i tak nie zmieniłoby zachowania telefonów w powietrzu — **fałszywe
poczucie kontroli jest tu groźniejsze niż brak funkcji**.

**7. Administrator patrzy na niepełny dzień.**
Sesja bez `day_close` to normalny stan: pilot lata, telefon nie ma zasięgu, outbox rośnie.
Panel pokazujący „block time 2:14" bez kontekstu skłania do wniosku, że dzień się skończył.
*Odpowiedź projektowa:* (a) osobny wariant ekranu `A03b` z niezamykalnym banerem „dane
w drodze" i czasem ostatniego przyjętego zdarzenia; (b) sumy, których projekcja nie umie
policzyć bez `day_close` (`consumedL`, `mh.deltaH`), **nie są pokazywane jako zero** — zwracają
`null` i UI pokazuje „—"; (c) sesje otwarte **wypadają z sum** w A08/A09, z banerem mówiącym
ile ich było; (d) plakietka `OTWARTY` z pulsem w każdej liście; (e) „dzień otwarty" nigdy nie
jest stylizowany na błąd — to normalny stan, nie awaria.

**8. Dezaktywacja konta w środku dnia lotnego.**
Administrator wyłącza konto pilota, który właśnie lata. Refresh przestaje działać
(`AuthCommands.refresh` sprawdza `active`), ale wydany JWT żyje do godziny — potem outbox
telefonu zaczyna dostawać `401` i zdarzenia zostają na urządzeniu.
*Odpowiedź projektowa:* baner ostrzegawczy na A11 z konkretną treścią („pilot prowadzi teraz
SP-ABC"), a nie ogólne „czy na pewno". Panel nie blokuje operacji — bywa konieczna — ale
nazywa jej skutek. To ta sama zasada, co „akcja disabled z podanym powodem" w aplikacji.

**9. Panel liczy po swojemu.**
Najłatwiejszy sposób zepsucia systemu: `SELECT SUM(...)` w zapytaniu panelu, bo „szybciej".
Miesiąc później arkusz mówi 6:39, panel 6:41 i nikt nie wie który kłamie.
*Odpowiedź projektowa:* **wszystkie liczby z `projectSession`** — karta dnia (A03) dostaje
`SessionState` policzony na serwerze, statystyki (A08/A09) liczą się z projekcji `sessions`,
która jest zrzutem tej samej funkcji (pilnuje tego `test/contract.test.ts`: „wiersz `sessions`
musi odtwarzać liczby `projectSession`, nie liczyć własnych"). Panel importuje
`@uzaero/domain` do **formatowania** (MH wg `mh_format`, block HH:MM), nie do liczenia.
Ten test należy rozszerzyć o nowe endpointy statystyk przy ich powstaniu.

**10. Wyścig o flagę i o eksport.**
Dwie osoby otwierają tę samą flagę, obie klikają „Rozwiąż"; albo dwie klikają „Ponów eksport"
na tej samej sesji.
*Odpowiedź projektowa:* optymistyczna współbieżność — `resolve` na fladze `resolved` zwraca
`409` z aktualnym stanem i UI mówi „rozwiązał już X o HH:MM". Dla eksportu wystarczy
`UNIQUE (session_uuid, revision)` z zaległości audytu (#15): druga równoległa rewizja odbija
się o constraint zamiast tworzyć duplikat. Blokad pesymistycznych **nie wprowadzamy** — przy
dwóch użytkownikach to koszt bez zysku (ta sama logika, co „czego świadomie nie ma"
w `docs/architektura-kodu.md` §6).

**11. Panel jako nowa powierzchnia ataku.**
Do tej pory API rozmawiało wyłącznie z aplikacją mobilną. Publiczny formularz logowania
w przeglądarce zmienia model zagrożeń: brute-force, CSRF, XSS przez wyświetlany payload zdarzeń.
*Odpowiedź projektowa:* rate-limit na `/auth/*` **przed** uruchomieniem panelu (nie „przed
wdrożeniem" — patrz #16 w §5); cookie `HttpOnly; Secure; SameSite=Strict` zamiast tokenu
w `localStorage`; **payload zdarzeń renderowany jako tekst, nigdy jako HTML** (payloady są
JSON-em z telefonu i mogą zawierać dowolne stringi — np. `notes` z `manual_log_entry`
i `client` z preflightu); krótki refresh dla sesji przeglądarkowej.

**12. Rozjazd dokumentacji z kodem, który panel obnaży.**
§4.5 obiecuje sześć typów flag; serwer produkuje trzy. Ekran skrzynki z trzema typami będzie
pierwszym miejscem, w którym ta różnica stanie się widoczna dla użytkownika.
*Odpowiedź projektowa:* mockup pokazuje **stan faktyczny** (trzy typy), a nie obiecany —
mockup, który udaje funkcje nieistniejące, wyprodukuje ekran do wyrzucenia. Równolegle:
pozycja #12 w §5 (policzyć `FUEL_MISMATCH` i `CLOCK_DRIFT` na serwerze) albo poprawka
dokumentacji. **To wymaga decyzji przed rozpoczęciem mockupów A05/A06.**

---

## 7. Czego świadomie NIE robimy w v1

| Nie robimy | Dlaczego |
|---|---|
| **Edycji progów detekcji** (tylko odczyt) | Zakaz z CLAUDE.md ma podstawę merytoryczną, a progi są stałymi kompilacyjnymi w bundlu aplikacji — „zapis" w panelu nie zmieniłby zachowania telefonu, dając fałszywe poczucie kontroli. Ścieżka zmiany to replay + commit |
| **Powiadomień (e-mail/push) o flagach i błędach eksportu** | Nie ma kanału wychodzącego w systemie (§4.6: „bez pushów"), a dodanie go to nowa infrastruktura z własnym utrzymaniem. Licznik przy pozycji „Flagi" w sidebarze wystarcza przy rytmie pracy klubu |
| **Samodzielnego resetu hasła przez pilota** | §3.0 mówi wprost: reset u administratora. Kanał e-mail nie istnieje, a jego dodanie oznacza SMTP, tokeny resetu i nową powierzchnię ataku dla wygody używanej kilka razy w sezonie |
| **Ściągania korekt administratora na telefon pilota** | Wymaga nowego endpointu pull i zmiany w silniku sync aplikacji (§4.3). To osobna decyzja o kontrakcie, nie funkcja panelu — patrz §6, ryzyko 3 |
| **Masowych operacji (bulk) na dniach i zdarzeniach** | Największe zagrożenie dla rejestru przy najmniejszym zysku. Korekta jest z natury pojedyncza i wymaga uzasadnienia |
| **Usuwania czegokolwiek** — zdarzeń, sesji, kont, flag | Append-only jest fundamentem systemu. Odpowiednikiem usunięcia jest `void` (zdarzenie), dezaktywacja (konto), `resolved` (flaga) |
| **Ręcznego wpisywania dnia lotnego z papieru** | Panel nie jest urządzeniem do zapisu sesji. Dzień powstaje na telefonie pilota — inaczej single-writer (§4.1 pkt 3) przestaje cokolwiek znaczyć. Braki uzupełnia pilot wpisem ręcznym (§3.8) |
| **Wykresów i BI** (trendy nalotu, wykorzystanie w czasie) | Tabela z eksportem CSV pokrywa realne potrzeby rozliczeniowe klubu. Wykresy dokłada się, gdy ktoś powie, jakiej decyzji potrzebuje — nie zanim |
| **Wielu klubów / dzierżawców** | Jedna instancja, jeden klub. Tenancy przenika każdą tabelę i każde zapytanie — dokładanie jej „na zapas" to dokładnie ten koszt bez zysku, który `docs/architektura-kodu.md` §6 odrzuca |
| **Responsywności mobilnej panelu** | Administrator siedzi przy biurku (założenie właściciela produktu). Rama 1440×900 z `SZABLON.html` jest celem; minimum to zachowanie użyteczności na 1280 px |
| **i18n** | Interfejs po polsku, jak cała aplikacja i wszystkie komunikaty domeny (`RuleViolation.message` jest po polsku z założenia) |
| **Trybu offline panelu** | Offline-first dotyczy pilota w terenie, nie administratora przy biurku (założenie właściciela produktu). Brak sieci w panelu **wolno** pokazać jako blokadę — i to jedyne miejsce w systemie, gdzie wolno |
| **Motywów jasnych/NVG w panelu** | Pięć motywów aplikacji istnieje dla kokpitu w słońcu (§2). Panel ma jeden motyw — ciemny, zgodny z tokenami |

---

## 8. Propozycja stosu technicznego

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| **Framework** | React 19 + Vite, TypeScript strict | Ten sam język i te same typy co `app/` i `server/`; `@uzaero/domain` importuje się bez żadnego mostu. Vite daje statyczny build bez konfiguracji — panel to kilkanaście ekranów, nie aplikacja SSR |
| **Routing** | React Router (data router), hash lub history | Back-office żyje deep linkami: `#/dni/<uuid>`, `#/flagi/14`. „Wklej mi link do tego dnia" to podstawowy scenariusz współpracy administratora z szefem wyszkolenia |
| **Dane** | TanStack Query nad `fetch` | Serwer jest jedynym źródłem prawdy; Query daje cache, unieważnianie po mutacji i stany `loading`/`error` bez pisania ich ręcznie na 20 ekranach. **Zero globalnego store'u** — panel nie ma stanu, który przeżywa odświeżenie strony (odwrotnie niż aplikacja, gdzie Zustand trzyma projekcję dnia) |
| **Domena** | `@uzaero/domain` jako zależność workspace | Warunek twardy: liczby z `projectSession`, formaty MH z tego samego kodu, typy `Event`/`SessionState`/`FlagRecord` bez przepisywania. Ten sam powód, dla którego pakiet powstał (`docs/architektura-kodu.md` §0) |
| **Auth** | `POST /admin/auth/login` → JWT w cookie `HttpOnly; Secure; SameSite=Strict`; krótki refresh; rola w claims | Przeglądarka to nie telefon: token w `localStorage` jest łupem dla XSS, a 90-dniowy refresh (`REFRESH_TTL_DAYS`) na biurkowej sesji jest nieuzasadniony. Tożsamość i komenda logowania — istniejące `AuthCommands` |
| **Style** | Zwykły CSS z tokenami z `design/admin/SZABLON.html` (te same zmienne `:root`), bez frameworka UI | Panel ma wyglądać jak UZ Aero, a nie jak Material. Szablon zawiera już komplet komponentów (tabela, plakietki, szuflada, banery, stany puste); framework UI trzeba by z nich obdzierać |
| **Testy** | Vitest + Testing Library w `admin/`; testy tras `/admin/*` po stronie serwera na PGlite (`app.inject`) | Wzorzec z `server/test/` — prawdziwe endpointy, prawdziwy silnik SQL, zero atrap. Najważniejsze testy są **serwerowe**: rola, append-only, audyt w transakcji |
| **Deploy** | Statyczny build serwowany przez `@fastify/static` pod `/admin` z tego samego kontenera | Jeden kontener + Postgres (§8 „Utrzymanie własnego backendu": mały serwis, Docker). Wspólny origin usuwa CORS i pozwala na cookie bez `SameSite=None` |

**Gdzie w repo:** nowy workspace **`admin/`** obok `app/` i `server/` (dopisany do
`workspaces` w głównym `package.json`, nazwa pakietu `@uzaero/admin`), z tą samą wewnętrzną
strukturą warstw co reszta monorepo. Mockupy zostają w **`design/admin/`** — jak wszystkie
mockupy w tym projekcie.

---

## Załącznik — spis plików do zbudowania

```
design/admin/
  SZABLON.html            ✅ istnieje — baza dla wszystkich A* (uzupełnić sidebar o Analitykę i Audyt)
  index.html              spis widoków panelu (wzorzec design/index.html, z sekcją „Warianty i stany")
  A00-logowanie.html          A00a-brak-uprawnien.html
  A01-pulpit.html             A01a-pulpit-cisza.html
  A02-dni.html
  A03-dzien.html              A03a-korekta-zdarzenia.html   A03b-dzien-w-drodze.html
  A04-zdarzenia.html
  A05-flagi.html
  A06-flaga.html              A06a-flaga-rozwiazana.html
  A07-eksporty.html           A07a-karta-arkusza.html
  A08-statystyki-floty.html
  A09-statystyki-pilotow.html
  A10-piloci.html
  A11-pilot.html              A11a-nowe-konto.html          A11b-reset-hasla.html
  A12-flota.html
  A13-samolot.html            A13a-nowy-samolot.html
  A14-audyt.html
  A15-progi.html
  A16-konserwacja.html
```

17 ekranów bazowych + 9 wariantów. Każdy plik: `<head>` skopiowany z `SZABLON.html`,
identyczny sidebar, panel „Warianty tego ekranu" na canvasie, nav-strip bez martwych linków,
karta w `design/admin/index.html`.
