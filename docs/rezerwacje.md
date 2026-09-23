# Rezerwacja samolotu, kalendarz floty i workflow akceptacji (3.0.0 / 3.1.0)

> Dokument decyzji milestone **„Workflow oraz rezerwacja samolotu 3.0.0"** (zgłoszenie
> #145). Powstaje PRZED kodem i przed makietami - ta sama kolejność, co przy
> wielofirmowości (`docs/wielofirmowosc.md`) i logowaniu hasłem (`docs/logowanie-haslem.md`).
>
> Stan: **szkic planu, 2026-09-18.** Decyzje właściciela z tego dnia są w §1 i §16;
> propozycje czekające na potwierdzenie - w §15.

## 0. Skąd to się wzięło

Zgłoszenie #145, słowami właściciela: pilot chce zarezerwować samolot na konkretny dzień
i slot; dzisiejsze „definiowanie nowego lotu" ma być dostępne jako rezerwacja (czym,
z kim, jakie zadanie, skąd dokąd, spodziewany czas lotu, notatka, planowane paliwo).
Do tego kalendarz - kiedy maszyna jest zajęta albo wyłączona z użytku, zbiorczo dla całej
floty. Sugestie slotów „jak w kinie", żeby nie zostawiać dziur. Workflow akceptacji:
kilka osób musi się zgodzić, odrzucenie wymaga powodu, każda wymagana akcja budzi
powiadomieniem tego, kto ma zareagować. Nowa zdolność „może akceptować". I przebudowa
nawigacji aplikacji - ekranem startowym nie jest już „Mój dzień".

**To jest pierwsza funkcja Ninerdeck, która nie opisuje przeszłości, tylko przyszłość.**
Cały dotychczasowy system stoi na trzech zdaniach: rejestr jest append-only, ma JEDNEGO
piszącego (PIC operacji) i dlatego działa bez sieci. Rezerwacja łamie każde z nich
osobno - i dlatego §2 jest najważniejszą częścią tego dokumentu.

## 1. Zakres: co wchodzi do 3.0.0, co do 3.1.0

**Decyzja właściciela 2026-09-18:** zgłoszenie rozkłada się na DWA wydania. Powód
techniczny: powiadomienia push wymagają modułu natywnego, czyli nowego APK i konta
Firebase - to inny rytm wydania niż reszta, która jedzie OTA. Powód produktowy: klub,
który dostanie sam kalendarz i rezerwacje, ma już działające narzędzie; workflow
akceptacji bez kalendarza nie ma czego akceptować.

**3.0.0 - rezerwacja i kalendarz:**
- model zajętości maszyny: rezerwacje i wyłączenia z użytku (serwer, migracja 11),
- kalendarz floty - oś maszyn × czas, w aplikacji i w panelu,
- sugestie slotów (domena, czysta funkcja z testami),
- rezerwacja z telefonu: samolot, Dual, zadanie, trasa, czas, planowany czas lotu,
  paliwo do zabrania, notatka,
- wejście w lot z rezerwacji (podpowiedź, NIGDY blokada - §2.3),
- nowa nawigacja aplikacji i ekran startowy (kokpit zostaje modalny - §9.1),
- panel: moduł „Kalendarz" z wyłączeniami serwisowymi.

**3.1.0 - workflow akceptacji i powiadomienia:**
- ścieżka akceptacji klubu (uporządkowane kroki; krok ma nazwę i listę osób),
- decyzje z powodem przy odrzuceniu i stany rezerwacji,
- skrzynka powiadomień w aplikacji (źródło prawdy; wymaga sieci, jak cały moduł),
- push jako budzik (`expo-notifications` + FCM, nowy APK).

## 2. Czym JEST rezerwacja w tym systemie

### 2.1 Rezerwacja NIE jest zdarzeniem rejestru

Pokusa jest oczywista: mamy rejestr, który sam się synchronizuje, więc niech rezerwacja
będzie zdarzeniem `reservation_create`. **Nie.** Trzy powody, każdy wystarczający:

1. **Rejestr ma JEDNEGO piszącego** (§4.1 pkt 3: PIC operacji). Rezerwacja jest z definicji
   przedmiotem konkurencji - dwóch pilotów sięga po ten sam slot tej samej maszyny. Rzecz,
   o którą się konkuruje, potrzebuje arbitra, a arbiter musi być JEDEN. Tym arbitrem jest
   serwer.
2. **Rejestr opisuje fakty, rezerwacja opisuje zamiar.** Fakt się nie zmienia - stąd
   append-only i korekty dopisywane obok. Zamiar zmienia się z natury: przesuwa się
   o godzinę, odwołuje w przeddzień. Wtłoczenie mutowalnego planu w niemutowalny rejestr
   znaczyłoby łańcuch korekt tam, gdzie właściwą operacją jest `UPDATE`.
3. **Wysyłka z opóźnieniem jest tu szkodliwa.** Outbox dowozi zapisy, gdy wróci zasięg -
   to zaleta przy locie, który już się odbył. Przy rezerwacji znaczyłaby, że pilot
   dowiaduje się o przepadnięciu slotu godzinę po tym, jak „zarezerwował": w międzyczasie
   zajął go ktoś z zasięgiem. Uczciwe „do rezerwacji potrzebujesz sieci" jest lepsze niż
   obietnica cofnięta po fakcie.

**Precedens jest już postawiony:** przełączenie klubu i dołączenie do klubu wymagają
sieci (`docs/wielofirmowosc.md` §6 - „offline-first dotyczy pracy w klubie, nie zmiany
klubu"). Rezerwacja należy do tej samej kategorii: to nie jest praca pilota w terenie,
tylko ustalenie z innymi ludźmi, kto kiedy leci.

### 2.2 Cały moduł rezerwacji wymaga sieci

**Decyzja właściciela 2026-09-20 - ODWRACA pierwotne §2.2 („odczyt kalendarza działa
bez sieci").** Uzasadnienie w jednym zdaniu: *„rezerwację raczej robimy w domu, gdzie
zasięg jest"*.

To jest JEDYNY moduł aplikacji z takim rozstrzygnięciem i dlatego trzeba je czytać
razem z §4.1 („brak sieci NIGDY nie blokuje pracy pilota"). Tamta reguła broni PRACY
W LOCIE: rejestru zdarzeń, czasów, odczytów, zdania samolotu - wszystkiego, co powstaje
przy samolocie i czego nikt poza pilotem nie odtworzy. Rezerwacja nie należy do tej
kategorii: jest UMOWĄ MIĘDZY LUDŹMI składaną przy biurku, a nie pomiarem robionym
w kabinie.

- **zapis** (`POST`/`PATCH`/`DELETE`) wymaga sieci, bo slot jest przedmiotem
  konkurencji i potrzebuje arbitra (§2.1). Bez niej przycisk niesie POWÓD WEWNĄTRZ
  SIEBIE (issue #55): „Rezerwacja wymaga połączenia - slot potwierdza serwer";
- **odczyt** też wymaga sieci: kalendarz floty, sugestie slotów i karta najbliższej
  rezerwacji na Pulpicie pytają serwer przy wejściu. Bez zasięgu ekran mówi to wprost
  i nie rysuje pustej siatki, która wyglądałaby na wolną flotę.

**CO TA DECYZJA KOSZTUJE** - trzy rzeczy dzieją się PRZY SAMOLOCIE, czyli tam, gdzie
zasięg bywa najgorszy, i bez cache’u przestają działać. Wszystkie trzy degradują się
łagodnie, bo żadna nie jest warunkiem lotu (§2.3):

| Co | Bez zasięgu |
| --- | --- |
| karta „Twoja rezerwacja" na Pulpicie | karty nie ma - tak samo, jak przy braku rezerwacji |
| wypełnienie kroków przejęcia rezerwacją | kroki są puste, pilot wpisuje jak dotąd |
| ostrzeżenie o cudzej rezerwacji przy przejęciu | ostrzeżenia nie ma; nigdy nie blokowało, więc lot idzie dalej |

**Czego NIE MA i nie wolno dorobić po cichu**: tabeli zajętości w SQLite, pobierania
z ETagiem, adnotacji wieku („· z cache · sync …") i wariantów offline pokazujących
ostatnią migawkę. Gdyby któraś z tych trzech rzeczy okazała się w testach z pilotami
realnie potrzebna, wraca tu decyzja, a nie cache dopisany przy okazji - bo cache
zajętości, raz dodany, natychmiast rodzi pytanie „jak stara jest ta odpowiedź", na które
kalendarz musi wtedy odpowiadać na każdym ekranie.
### 2.3 Rezerwacja nie warunkuje lotu

**Decyzja właściciela 2026-09-18.** „ROZPOCZNIJ LOT" działa dokładnie jak dziś - także
bez zasięgu i bez żadnej rezerwacji. Rezerwacja jest PODPOWIEDZIĄ:

- wypełnia kroki 1-2 przejęcia (samolot, Dual, zadanie, trasa, notatka). To jest
  odpowiedź na zdanie ze zgłoszenia „obecne definiowanie nowego lotu powinno być dostępne
  jako rezerwacja": formularz jest ten sam, więc jeden wypełnia drugi;
- OSTRZEGA (nigdy nie blokuje), gdy pilot przejmuje maszynę, którą na ten czas ma
  zarezerwowaną ktoś inny. Ostrzeżenie liczy się z CACHE, więc działa offline;
- `session_claim` niesie opcjonalne `reservationId` - dzięki temu panel wie, że lot odbył
  się z rezerwacji, a rezerwacja dostaje stan `fulfilled`.

Uzasadnienie to §4.1 pkt 1: brak sieci NIGDY nie blokuje pracy pilota. Blokada „nie masz
rezerwacji" byłaby pierwszym miejscem, w którym administracja klubu zatrzymuje samolot
na ziemi przez zasięg GSM.

## 3. Model danych (serwer, migracja 11)

Baza produkcyjna żyje od 2026-09-16, więc **migracja 11 jest wyłącznie addytywna**
(`SCHEMA_VERSION` 10 → 11). Nic nie jest kasowane i nic nie zmienia znaczenia.

### 3.1 `bookings` - JEDNA tabela na dwa rodzaje zajętości

```sql
CREATE TABLE bookings (
  id           TEXT PRIMARY KEY,           -- uuid NADANY PRZEZ KLIENTA (idempotencja POST)
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  aircraft_id  TEXT NOT NULL REFERENCES aircraft(id),
  kind         TEXT NOT NULL CHECK (kind IN ('flight', 'block')),
  status       TEXT NOT NULL CHECK (status IN
                 -- `released` = slot zwolniony po godzinie bez przejęcia (§4.1); to nie jest
                 -- decyzja człowieka, więc nie `cancelled`, a rezerwacja zostaje w zapisie.
                 ('pending', 'confirmed', 'rejected', 'cancelled', 'fulfilled', 'released')),
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT booking_order CHECK (ends_at > starts_at),

  -- ── wyłącznie kind = 'flight' ────────────────────────────────────────────────
  pilot_id        TEXT REFERENCES pilots(id),  -- kto rezerwuje (przyszły PIC)
  dual_id         TEXT REFERENCES pilots(id),
  operation       TEXT,                        -- rodzaj zadania (katalog domeny)
  from_icao       TEXT,
  to_icao         TEXT,
  planned_air_min INTEGER,                     -- spodziewany czas LOTU (minuty)
  planned_fuel_l  REAL,                        -- paliwo do zabrania
  session_uuid    TEXT,                        -- operacja, która ją zrealizowała

  -- ── wyłącznie kind = 'block' ────────────────────────────────────────────────
  block_reason TEXT CHECK (block_reason IN ('maintenance', 'defect', 'other')),

  note          TEXT,
  created_by    TEXT NOT NULL REFERENCES pilots(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancel_reason TEXT,

  CONSTRAINT booking_flight_fields CHECK (
    kind <> 'flight' OR (pilot_id IS NOT NULL AND operation IS NOT NULL)),
  CONSTRAINT booking_block_fields CHECK (
    kind <> 'block'  OR (block_reason IS NOT NULL AND pilot_id IS NULL))
);
```

**DLACZEGO JEDNA TABELA, SKORO TO DWA BYTY.** Rezerwacja pilota i wyłączenie maszyny
z użytku mają inne pola, inne uprawnienia i inny cykl życia - kusi, żeby rozdzielić je na
`reservations` i `aircraft_blocks`. Przeciw stoi jeden argument i jest rozstrzygający:
**wykluczenie nakładania musi obejmować OBA rodzaje naraz**, a ograniczenie wykluczające
działa w obrębie jednej tabeli. Przy dwóch tabelach „nie zarezerwujesz maszyny, która jest
w tym czasie na przeglądzie" byłoby sprawdzeniem w kodzie - czyli dyscypliną, a nie
niezmiennikiem. Ten projekt konsekwentnie wybiera niezmiennik trzymany przez bazę (CHECK-i,
unikaty, `membership_active_has_code`).

Kolumny nullowalne spina `CHECK` wiążący je z `kind` - dokładnie tak, jak
`password_reset_tokens` wiąże swoje kolumny z `kind` ('reset' / 'signup').

Wyłączenie z użytku jest przy okazji **przedłużeniem `aircraft.service_status` w czasie**:
tamta kolumna mówi „maszyna wyłączona bezterminowo", `kind = 'block'` mówi „wyłączona od
wtorku do piątku". Kalendarz czyta obie - maszyna z `service_status = 'disabled'` jest
zajęta na całej osi, bez wiersza w `bookings`.

### 3.2 Nakładanie wyklucza BAZA, nie kod

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    aircraft_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));   -- `released` wypada z predykatu (§4.1)
```

**Sprawdzone empirycznie 2026-09-18** na PGlite (baza testów serwera) - trzy własności,
wszystkie zgodne z tym, czego projekt potrzebuje:

1. rozszerzenie `btree_gist` jest w paczce PGlite, ale wymaga JAWNEGO załadowania
   w konstruktorze: `PGlite.create({ extensions: { btree_gist } })` plus `CREATE EXTENSION`
   w schemacie. Bez tego `CREATE EXTENSION` odmawia („extension is not available") - to
   zmiana w bootstrapie testów, nie w kodzie produkcyjnym;
2. **zetknięcie co do minuty PRZECHODZI** - zakres półotwarty `[)` znaczy, że rezerwacja
   10:00-12:00 nie koliduje z 08:00-10:00. Ta sama zasada, którą issue #100 (D4) przyjęło
   dla operacji: „zetknięcie operacji co do minuty NIE jest nakładką";
3. predykat częściowy (`WHERE status IN (...)`) sprawia, że rezerwacja odwołana
   i odrzucona zwalnia slot natychmiast, zostając w tabeli jako zapis.

**PGlite ma JEDNO połączenie i szereguje transakcje mutexem**, więc prawdziwego wyścigu
dwóch rezerwacji nie da się w teście odegrać (ta sama uwaga stoi już
w `adminExports.test.ts`). Test sprawdza więc, że ograniczenie ISTNIEJE (`schema.test.ts`)
i że drugi wpis odbija się sekwencyjnie - o równoległość dba baza produkcyjna, po to jest
ograniczenie zamiast sprawdzenia w kodzie.

**Ryzyko wdrożeniowe:** `CREATE EXTENSION btree_gist` wymaga pakietu contrib na instancji
Postgresa - **POTWIERDZONE NA PRODUKCJI przy wydaniu 3.0.0** (2026-09-21, §14 R2): obraz
Railway rozszerzenie ma, migracja 11 przeszła. Plan awaryjny, gdyby rozszerzenia nie było: blokada doradcza
`pg_advisory_xact_lock(hashtext(aircraft_id))` na czas transakcji zapisu plus sprawdzenie
nakładania w tej samej transakcji. Działa wszędzie, kosztuje szeregowanie zapisów per
maszyna - a tych są dziesiątki na sezon, nie tysiące na sekundę.

### 3.3 Izolacja klubu

`org_id NOT NULL` + `org_id` w KAŻDYM zapytaniu i KAŻDYM złączeniu, jako argument portu,
nie pole filtra (`docs/wielofirmowosc.md` epik C). Cudza rezerwacja odpowiada **404**, nie
403. Obowiązują oba strażniki z epiku C - `tenantIsolation.test.ts` (przypadek izolacji dla
każdej nowej trasy albo imienny wyjątek z powodem) i strażnik `org_id` w SQL-u adapterów
(`architecture.test.ts`).

```sql
CREATE INDEX idx_bookings_window ON bookings (org_id, aircraft_id, starts_at)
  WHERE status IN ('pending', 'confirmed');
```

### 3.4 Tabele workflow i powiadomień (3.1.0, migracja 13)

```sql
-- Ścieżka akceptacji klubu: uporządkowane kroki. Brak wierszy = brak akceptacji.
-- Krok ma NAZWĘ i LISTĘ OSÓB (decyzja właściciela 2026-09-22) - roli nie ma, bo role
-- klubu są dwie i „Mechanik" żadną z nich nie jest (§8).
CREATE TABLE approval_steps (
  org_id    TEXT NOT NULL REFERENCES organizations(id),
  -- TRWAŁY identyfikator, bo ścieżka jest ZAWSZE BIEŻĄCA (§11.2): dołożenie kroku
  -- w środku przesuwa numery następnych, a decyzja zapisana pod NUMEREM opisywałaby
  -- po takiej zmianie inny krok niż w chwili kliknięcia.
  id         TEXT PRIMARY KEY,
  position   INTEGER NOT NULL,          -- kolejność pytania; zmienna, w odróżnieniu od `id`
  label      TEXT NOT NULL,             -- np. „Mechanik", „Szef wyszkolenia"
  -- Krok się NIE KASUJE, tylko przestaje być pytany. Decyzje pod nim zapadłe zostają
  -- czytelne (append-only), a klucz obcy nie ma czego blokować przy „usuwaniu" kroku.
  removed_at TIMESTAMPTZ
);
-- Unikatu na (org_id, position) NIE MA świadomie: przestawianie kolejności rodziłoby
-- przejściowe kolizje, a odroczone ograniczenie kosztuje więcej, niż daje. Remis
-- rozstrzyga `id`, więc porządek jest deterministyczny bez nowej reguły w bazie.

-- Kto może zatwierdzić dany krok. WIĘCEJ NIŻ JEDNA OSOBA, a wystarczy zgoda JEDNEJ
-- z nich (§11.2) - to pula uprawnionych, nie komplet podpisów.
CREATE TABLE approval_step_members (
  org_id   TEXT NOT NULL REFERENCES organizations(id),
  step_id  TEXT NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
  pilot_id TEXT NOT NULL REFERENCES pilots(id),
  PRIMARY KEY (step_id, pilot_id)
);

-- Decyzje na rezerwacji - append-only, bo to zapis o tym, kto co postanowił.
CREATE TABLE booking_approvals (
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  org_id     TEXT NOT NULL REFERENCES organizations(id),
  step_id    TEXT NOT NULL REFERENCES approval_steps(id),
  decision   TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  -- Skąd wzięła się zgoda: ktoś kliknął (`person`) czy krok przeszedł sam, bo
  -- rezerwujący jest na jego liście (`self`, §11.2). Bez tego pominięty krok jest
  -- nieodróżnialny od kroku, o który nikt nie zapytał.
  via        TEXT NOT NULL DEFAULT 'person' CHECK (via IN ('person', 'self')),
  reason     TEXT,                      -- WYMAGANY przy 'rejected' (§11.3)
  decided_by TEXT NOT NULL REFERENCES pilots(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, step_id)
);

-- Skrzynka: źródło prawdy powiadomień. Push jest tylko budzikiem (§12).
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id),
  pilot_id   TEXT NOT NULL REFERENCES pilots(id),
  kind       TEXT NOT NULL,             -- approval_requested | approved | rejected | ...
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);

-- Token push ŻYJE RAZEM Z SESJĄ LOGOWANIA (§12.2).
CREATE TABLE push_tokens (
  token      TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES login_sessions(id) ON DELETE CASCADE,
  pilot_id   TEXT NOT NULL REFERENCES pilots(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```


### 3.5 Co naprawdę stanęło w migracji 11 (epik R-B)

Poza tabelą `bookings` i ograniczeniem wykluczającym:

- **`organizations.timezone`** (domyślnie `Europe/Warsaw`) i **`organizations.home_icao`**
  - strefa rysuje siatkę (§6), lotnisko macierzyste wyznacza dobę lotną (§7.1). Oba mogą
  być puste i oba mają wtedy wartość domyślną: brak konfiguracji nie może zablokować
  rezerwacji;
- **`CREATE EXTENSION btree_gist`** - bez niego `EXCLUDE USING gist` na równości tekstu
  nie istnieje. W PGlite rozszerzenie wymaga JAWNEGO załadowania w konstruktorze
  (`new PGlite({ extensions: { btree_gist } })`, `server/test/pglite.ts`);
- **trzy indeksy częściowe**: okno kalendarza `(org_id, aircraft_id, starts_at)`,
  kandydaci do zwolnienia `(starts_at)` i wejście po operacji `(session_uuid)`.

**KLUCZ WYKLUCZENIA NIE NIESIE `org_id`** i to jest decyzja: egzemplarz należy do
dokładnie jednego klubu (klucz obcy `aircraft.org_id`), więc klub niczego by tu nie
zawęził - a sugerowałby, że ten sam płatowiec da się zająć dwa razy pod dwiema nazwami.
Izolacja klubów stoi w ODCZYTACH (§3.3), bo tam jest czym wyciec.

**Odmowy zapisu są CZTERY, nie trzy** (`server/src/domain/bookings.ts`): do `slot_taken`,
`aircraft_disabled` i `booking_in_past` doszło **`aircraft_not_found`** - maszyna
skasowana albo z cudzego klubu, jeden kod na oba przypadki, bo odróżnienie ich
potwierdzałoby istnienie cudzego egzemplarza. Osobny od `aircraft_disabled`, i to nie
jest pedanteria: wyłączenie z użytku NIE pyta o stan służby (przegląd na maszynie
stojącej w serwisie to norma), więc razem ze stanem przestawało sprawdzać ISTNIENIE -
i panel klubu A mógł zająć terminem maszynę klubu B, odbierając jej właścicielowi
własny samolot. Złapał to test izolacji tras, nie przegląd kodu.
## 4. Cykl życia rezerwacji

```
                    ┌ klub bez ścieżki akceptacji ─────────────┐
utworzenie ────────►│                                          ▼
                    └ klub ze ścieżką ──► pending ──► kroki ──► confirmed ──► fulfilled
                                             │                     │          (doszło
                                             ▼                     ▼        session_claim
                                          rejected             cancelled    z reservationId)
                                        (z powodem)          (odwołanie)
```

- **`pending` istnieje dopiero w 3.1.0.** W 3.0.0 utworzenie daje od razu `confirmed` -
  klub bez ścieżki akceptacji nie klika w nic, a stan modelu jest już przygotowany;
- `pending` i `confirmed` TRZYMAJĄ SLOT (predykat ograniczenia z §3.2). Rezerwacja
  czekająca na zgodę blokuje termin - inaczej „czekam na akceptację" znaczyłoby „ktoś mi
  to zaraz zajmie";
- `fulfilled` nadaje serwer, gdy przyjdzie `session_claim` z `reservationId`. To jedyne
  miejsce, w którym rejestr zdarzeń dotyka rezerwacji - w jedną stronę;
- rezerwacja, która minęła bez operacji, NIE zmienia stanu automatem. Kalendarz liczy
  „minęła" z zegara; osobny stan `no_show` to materiał na osobną decyzję (§15 P5).


### 4.1 Slot zwalnia się sam po godzinie (P5, decyzja 2026-09-19)

Rezerwacja, po którą nikt nie przyszedł, blokowała maszynę do końca slotu - w sobotę
to godziny, w których ktoś inny mógłby polecieć. **Po 60 minutach od początku rezerwacji
serwer zwalnia slot**, jeśli nie widzi ani przejęcia maszyny, ani biegu silnika.

- **status `released`**, nie `cancelled`: to nie jest decyzja człowieka, tylko upłynięcie
  czasu, a rezerwacja ma zostać w zapisie („był plan, nikt nie przyszedł"). Status wypada
  z predykatu ograniczenia wykluczającego (§3.2), więc slot wraca do puli natychmiast;
- **liczy to zadanie okresowe serwera** (co 5 minut), bo ograniczenie w bazie jest
  statyczne i samo z siebie nie wie, że minęła godzina. To pierwszy taki wątek w tym
  serwerze - jedna instancja (§8.8 architektury), więc `setInterval` wystarczy
  i nie potrzeba kolejki;
- **próg 60 minut jest DO KALIBRACJI** (`booking/policy.ts`) razem z resztą progów.

**TO JEST ŚWIADOMY WYŁOM W ROZDZIALE REJESTRU I REZERWACJI** (§2.1), jedyny w 3.0.0:
rezerwacja zaczyna zależeć od ZDARZEŃ - od tego, czy przyszło `session_claim` albo
`engine_start` tej maszyny. Cena jest realna i trzeba ją nazwać: **pilot lecący bez
zasięgu wysyła zdarzenia dopiero po locie**, więc z punktu widzenia serwera „nie
przyszedł" - i jego slot zwolni się w trakcie lotu.

Dlaczego mimo to jest to do przyjęcia: zwolnienie nie kasuje rezerwacji ani nie przerywa
lotu, a maszyny fizycznie nie ma w hangarze - kolejny pilot zderzy się z tym samym,
z czym zderzyłby się bez żadnej rezerwacji. Gdy zdarzenia dojdą, rezerwacja dostaje
`fulfilled` po `reservationId` i wraca do zapisu jako zrealizowana.

Wariant bezpieczniejszy - liczyć zwolnienie dopiero, gdy telefon POTWIERDZI brak lotu -
nie istnieje: brak zdarzenia jest nieodróżnialny od braku zasięgu i tak zostanie.
## 5. API

### 5.1 Telefon (token klubu, brama członkostwa)

| Trasa | Znaczenie |
| --- | --- |
| `GET /bookings?from=&to=` | zajętość floty w oknie dat; ETag, bo kalendarz odpytuje często |
| `GET /bookings/:id` | JEDNA zajętość razem z jej dobą - karta rezerwacji (23) i karta na Pulpicie |
| `POST /bookings` | nowa rezerwacja (uuid klienta = idempotencja); `409 slot_taken` |
| `PATCH /bookings/:id` | przesunięcie i zmiana zadania - WŁASNEJ rezerwacji |
| `DELETE /bookings/:id` | odwołanie własnej (zapis zostaje, `status = 'cancelled'`) |
| `GET /bookings/suggestions?aircraftId=&day=&minutes=` | sugestie slotów (§7) |
| `GET /me/notifications` *(3.1)* | skrzynka, kursor jak `/me/events` |
| `POST /me/notifications/:id/read` *(3.1)* | odczytanie |
| `POST /me/push-token` *(3.1)* | rejestracja tokenu push dla BIEŻĄCEJ sesji |
| `POST /bookings/:id/decision` *(3.1)* | zgoda albo odmowa z powodem |

Odmowy: `409 slot_taken` (nakładka - z danymi kolidującej zajętości, żeby ekran mógł
powiedzieć CO stoi w tym czasie), `409 aircraft_disabled`, `403 not_your_booking`,
`404` na cudzy klub.

**Ciało odmowy niesie `takenAt` OBOK `taken`**, a nie w środku: „weszła 3 min temu"
znaczy wyścig o slot, a cudzy plan sprzed tygodnia - zwykły stan kalendarza, którego
pilot nie zauważył (makieta 22C). Na siatce kalendarza wiek wiersza nie znaczy nic,
więc do wspólnego kształtu zajętości nie wchodzi - inaczej jechałby w każdej
odpowiedzi, której nikt o to nie pyta.

**`PATCH` nie przyjmuje maszyny i to jest decyzja, nie luka**: rezerwacja należy do
konkretnego egzemplarza. Przeniesienie jej na inny jest NOWĄ rezerwacją i telefon
robi wtedy dwa zapisy - **najpierw zakłada nowy termin, a stary odwołuje dopiero po
jego potwierdzeniu** (decyzja właściciela 2026-09-21). Odwrotna kolejność oddawałaby
slot, zanim wiadomo, czy jest co wziąć w zamian; obie rezerwacje stoją na RÓŻNYCH
maszynach, więc nie mają jak zderzyć się ze sobą. Nieudane odwołanie nie cofa zapisu:
pilot ma wtedy dwa terminy i dowiaduje się o tym z karty starego - to jest lepszy
stan niż utrata nowego.

### 5.2 Panel (sesja klubu, `adminRoute`)

| Trasa | Zdolność |
| --- | --- |
| `GET /admin/api/bookings?from=&to=` | `panel.access` |
| `POST /admin/api/bookings` (rezerwacja za pilota, wyłączenie z użytku) | `reservations.manage` / `fleet.manage` |
| `PATCH`/`DELETE /admin/api/bookings/:id` | `reservations.manage` |
| `GET`/`PUT /admin/api/approval-steps` *(3.1)* | `accounts.manage` |

Wpisy administratora idą przez `AuditedWrite` - nowe akcje w `domain/adminActions.ts`:
`booking.create`, `booking.cancel`, `booking.block`, `approval.decide`.

## 6. Czas: kalendarz mówi czasem klubu, rejestr zostaje w UTC

Reguła projektu brzmi „UTC jest domyślnym czasem wszędzie, LT nie pojawia się nigdzie"
(CLAUDE.md) - i dotyczy REJESTRU: czasu blokowego, startów, lądowań, kart arkusza. To są
POMIARY i mieszanie ich ze zmianą czasu letniego byłoby wadą.

**Rezerwacja nie jest pomiarem, tylko umową między ludźmi o godzinie.** Nikt w klubie nie
mówi „lecę o 07:00 UTC", tylko „w sobotę o dziewiątej". Przy dwóch zmianach czasu w roku
kalendarz pisany w UTC przesuwałby siatkę dnia o godzinę dwa razy w roku - i to dokładnie
w sezonie.

**ROZSTRZYGNIĘTE 2026-09-18 (P1):** kalendarz i formularz rezerwacji pokazują czas
w strefie KLUBU (`organizations.timezone`, domyślnie `Europe/Warsaw`); baza trzyma
`TIMESTAMPTZ`, czyli nadal chwilę bezwzględną. Log operacji, oś zdarzeń i karta arkusza
zostają w UTC bez zmian. **Gdy strefa urządzenia RÓŻNI SIĘ od klubowej, przy godzinie
staje drobna adnotacja z czasem lokalnym** - wzorzec `TimeStepper.localTime` („14:30 LT",
issue #62). Przy strefach zgodnych - a to jest 99% przypadków - adnotacji nie ma wcale
(reguła SyncChipa: stan domyślny nie dostaje zdania).

**PRZECHOWYWANIE NIE BYŁO PRZEDMIOTEM WYBORU** - pytanie brzmiało, CZYJA strefa rysuje
siatkę: klubu czy urządzenia, na którym ktoś patrzy. Cztery powody, dla których klubu:

1. **kalendarz jest wspólnym zasobem, więc siatka musi znaczyć to samo dla wszystkich.**
   Pilot rezerwujący z Grecji wpisuje „sobota 9:00", myśląc o dziewiątej w klubie; w strefie
   urządzenia zapisałby 8:00 czasu lotniska. Dwie osoby rozmawiają wtedy o dwóch różnych
   godzinach, patrząc na ten sam wiersz. Samolot stoi w JEDNYM miejscu na ziemi;
2. **wspólny tablet** (2.1.0) bywa bez karty SIM i z ręcznie ustawioną strefą, której nikt
   nie pilnuje - „strefa urządzenia" znaczy wtedy „strefa, którą ktoś kiedyś klepnął";
3. **granice dnia i sugestie slotów** liczą się w oknie doby lotnej klubu (§7). Rezerwacja
   o 23:30 czasu klubu widziana z innej strefy wskakuje na sąsiedni dzień siatki;
4. **panel** otwiera się w przeglądarce gdziekolwiek, a dziennik i kalendarz klubu mają
   podawać jedną godzinę.

Cena jest realna i dlatego to było pytanie: wariant „strefa urządzenia" byłby DARMOWY -
`timeLocal` w `packages/format` liczy czas lokalny jednym `getHours()`, bez `Intl` i bez
danych stref. Strefa klubu wymaga konwersji UTC → strefa IANA (ryzyko niżej).

**Ryzyko techniczne:** aplikacja nie używa dziś `Intl` ani żadnej biblioteki stref
(`packages/format` liczy wszystko sam na milisekundach). `Intl.DateTimeFormat` z opcją
`timeZone` na Hermes/Androidzie wymaga sprawdzenia NA URZĄDZENIU (dev build) - zadanie
w epiku R-A. Plan awaryjny bez `Intl`: serwer zwraca przy oknie kalendarza offset strefy
w minutach dla każdego dnia zakresu, a telefon tylko dodaje - reguł czasu letniego nie
musi wtedy znać nikt poza serwerem.

### 6.1 Kontrakt `GET /bookings`: GRANICE DÓB, nie offsety (rozstrzygnięte przy R-B)

Pytanie brzmiało: czy trasa oddaje same chwile UTC (telefon liczy strefę sam), czy do
każdego dnia okna dochodzi offset w minutach, bo reguł czasu letniego nie ma jak
odtworzyć na urządzeniu bez danych ICU. **Odpowiedź jest trzecia i nie zależy od wyniku
sondy stref (B0): trasa oddaje GRANICE KAŻDEJ DOBY jako pary chwil UTC, a telefon nie
konwertuje stref w ogóle.**

```
days: [{ date: "2026-10-01", startsAt: "2026-09-30T22:00:00Z", endsAt: "2026-10-01T22:00:00Z" }, …]
```

- położenie rezerwacji na siatce = `(startsAt - dayStart) / godzina`;
- godzina z formularza w chwilę = `dayStart + godzina * godzina`;
- podpis osi = ta sama różnica.

Żadne z tych trzech działań nie potrzebuje `Intl`, tablicy stref ani reguł czasu
letniego. **Doba zmiany czasu wychodzi poprawnie sama**, bo jest po prostu krótsza
albo dłuższa (23 albo 25 godzin) - a offset per doba byłby w takim dniu KŁAMSTWEM
w którejś połowie, bo offsety są tam dwa. Liczy to `server/src/domain/clubTime.ts`
(`Intl` na serwerze jest pełne), a testy stoją dokładnie na tych dwóch dniach.

**Sonda stref (B0/F0) przestała być warunkiem wstępnym epiku R-B**, a po domknięciu
R-F nie rozstrzyga już niczego - i to jest fakt sprawdzalny w kodzie, nie domysł.

Zostało jej jedno pytanie: czy telefon może formatować daty i nazwy miesięcy przez
`Intl`. **Odpowiedź brzmi: nie ma to znaczenia, bo NIE FORMATUJE ICH PRZEZ `Intl`.**
Sprawdzone 2026-09-21 na całym drzewie: `Intl.` nie pada w `app/src` ani
w `packages/*/src` ANI RAZU poza samą sondą (`ui/screens/logic/timeZoneProbe.ts`).
Dni tygodnia (`weekdayUtc`, `weekdayShortUtc`), nazwy miesięcy (`MONTHS_PL`,
`MONTHS_PL_NOMINATIVE`) i wszystkie napisy dat liczą się z WŁASNYCH TABLIC
w `@ninerdeck/format`, na `getUTC*` i milisekundach.

Wariant awaryjny, który zadanie wymienia jako skutek wyniku negatywnego („własny
formater w `@ninerdeck/format`"), jest więc tym, co już się wysyła - BEZWARUNKOWO.
Żaden wynik sondy nie zmieni ani jednej linijki kodu.

Uruchomienie sondy na dev buildzie zostaje warte zachodu z jednego powodu: jako
ZAPIS, ile ICU ma Hermes w tym buildzie. Pierwszy kod, który sięgnie po `Intl`,
będzie miał wtedy gotową odpowiedź zamiast zakładu - ale dzisiaj nic na nią nie
czeka, a diagnostyka stoi w Ustawieniach (tylko dev build).

## 7. Sugestie slotów („jak w kinie")

Czysta funkcja domeny - `packages/domain/src/booking/slots.ts`, zero zależności od RN i od
bazy, testy jak przy detekcji faz lotu.

**Problem:** dzień z rezerwacjami 08:00-10:00 i 13:00-15:00 ma trzy dziury. Pilot
proszący o 2 godziny może wejść w 10:00-12:00 (zostawia 12:00-13:00 - godzinę, w której
nic sensownego nie poleci) albo w 11:00-13:00 (przylega do następnej rezerwacji i zostawia
jedną dziurę 10:00-11:00 zamiast dwóch). **Druga odpowiedź jest lepsza i to jest cała
treść „jak w kinie": sadzamy przy zajętych miejscach, nie na środku pustego rzędu.**

```
wejście:  zajętości dnia (zakresy), żądana długość, okno dnia klubu, ziarno (15 min)
wyjście:  lista kandydatów posortowana oceną upakowania
ocena:    kara za każdą powstałą RESZTKĘ krótszą niż MIN_USEFUL_SLOT
          + premia za przyleganie do istniejącej zajętości (z obu stron mocniejsza)
          + premia za porę dnia bliską żądanej, jeśli pilot ją podał
```

- `MIN_USEFUL_SLOT` i ziarno stoją w `booking/policy.ts` i są **DO KALIBRACJI** - ta sama
  zasada, co progi detekcji i analityki zużycia: nie stroimy ich w dyskusji, tylko na
  danych klubu po pierwszym sezonie;
- sugestia NIGDY nie jest przymusem: pilot może wpisać dowolny wolny slot. Sugestia to
  trzy-cztery kafelki nad kontrolką czasu, nie lista, z której trzeba wybrać;
- funkcja liczy się NA TELEFONIE z cache'owanych zajętości (działa offline) i po stronie
  serwera na trasie `GET /bookings/suggestions` - ten sam kod z `packages/domain`, więc
  odpowiedzi nie mają jak się rozjechać.


### 7.1 Okno doby lotnej: wschód i zachód słońca (P2, decyzja 2026-09-19)

Sugestie slotów potrzebują granic dnia, a kalendarz - zakresu siatki. **Liczą się
z EFEMERYD nad lotniskiem macierzystym klubu**, nie ze stałych godzin: w grudniu doba
lotna ma osiem godzin, w czerwcu siedemnaście, a stała 06-21 kłamałaby w obie strony -
latem odcinałaby pierwszy poranny lot, zimą proponowała slot po zmroku.

**Okno to zmierzch CYWILNY, nie sam wschód-zachód:** od 30 minut przed wschodem do
30 minut po zachodzie. Tak liczy się dzień w lotnictwie VFR i tak wygląda praktyka
klubu - ostatni lot ląduje po zachodzie słońca, a nie przed nim. Margines stoi
w `booking/policy.ts` razem z resztą progów DO KALIBRACJI.

Czego ta decyzja wymaga (zakres #158 i #159 rośnie):

- **`organizations.home_icao`** - lotnisko macierzyste klubu. Migracja 11 (R-B) oraz
  **pole na karcie klubu w module Organizacje** (R-W, 2026-09-21 - do wydania 3.0.0
  kolumna była WYŁĄCZNIE do odczytu, więc każdy klub siedział na oknie domyślnym,
  choć produkt obiecywał wschód i zachód słońca). Współrzędne przychodzą z katalogu
  lotnisk (`packages/domain/src/airfields.ts`), więc klub podaje sam kod, a **kod spoza
  katalogu jest ODMOWĄ** (`400 invalid` z polem): wzorzec czterech liter przepuściłby
  `ZZZZ`, a klub dostałby okno domyślne bez ani jednego słowa o tym, dlaczego. Puste
  pole to co innego niż zły wpis - znaczy „wyczyść" i jest dozwolone;
- **`packages/domain/src/booking/solar.ts`** - czysta funkcja liczącą wschód i zachód
  z szerokości, długości i daty (algorytm NOAA, ~60 linii, zero zależności). Precedens
  w tym pakiecie już jest: `geoid/` liczy undulację, `magneticDeclination.ts` deklinację -
  obliczenia astronomiczno-geodezyjne mieszkają w domenie i mają testy;
- **siatka kalendarza przestaje być stała**, więc oś telefonu rysuje zakres dnia,
  a nie sztywne 06-21; w panelu kolumny dni zostają równe, bo tam osią są DNI,
  a nie godziny. Makiety `21` i `kalendarz-flota` pokazują dziś 06-21 jako placeholder
  i wymagają poprawki przy wdrożeniu;
- **klub bez lotniska macierzystego** (stare wiersze, świeżo założony) dostaje okno
  domyślne 06-21. Brak konfiguracji nie może zablokować rezerwacji - to ta sama zasada,
  przez którą brak normy zużycia nie blokuje lotu, tylko wyłącza werdykt.

**Loty nocne (NVFR) zostają poza 3.0.0** i to jest świadome zawężenie: klub z takimi
uprawnieniami nie zarezerwuje slotu po zmierzchu. Gdy się pojawi, właściwym ruchem jest
przełącznik „doba lotna" na karcie klubu (efemerydy / pełna doba / własne godziny),
a nie rozciąganie marginesu zmierzchu.
### 7.2 Co naprawdę stanęło w module planowania (epik R-C)

Cztery pliki w `packages/domain/src/booking/`, każdy z jednym pytaniem:

| Plik | Odpowiada na |
| --- | --- |
| `solar.ts` | kiedy wschodzi i zachodzi Słońce (NOAA, zero zależności) |
| `dayWindow.ts` | jakie są granice doby lotnej - składa efemerydy z progami |
| `slots.ts` | które sloty proponujemy i DLACZEGO |
| `policy.ts` | wszystkie liczby, wszystkie DO KALIBRACJI |

**`slots.ts` dostaje okno ARGUMENTEM i o jego pochodzeniu nie wie nic.** Rozdział jest
celowy: gdy przyjdą loty nocne (NVFR, świadomie poza 3.0.0), zmienia się `dayWindow.ts`,
a upakowanie dnia zostaje nietknięte. Ta sama granica, co przy kopercie śladu.

**Kandydaci nie nakładają się nawzajem** i to jest własność, nie optymalizacja: bez niej
pusty dzień oddawałby cztery propozycje odległe o kwadrans, czyli jedną propozycję
powiedzianą cztery razy. Pilot ma dostać wybór, a nie listę zaokrągleń.

**Przyleganie NIE MUSI trafić w ziarno.** Rezerwacja kończąca się o 10:07 daje
przyleganie o 10:07, a siatka liczona co kwadrans by je minęła - czyli zgubiłaby
dokładnie ten slot, o który w całej regule chodzi. Stąd kandydaci z obu krawędzi dziury
wchodzą JAWNIE, obok siatki.

**Granica dnia nie liczy się jako przyleganie.** Świt i zmrok są ścianą, nie sąsiadem;
premiowanie ich kazałoby proponować lot o pierwszej możliwej minucie po wschodzie.

**Relacja progów niesie regułę**: kara za martwą resztkę (1,5) jest WIĘKSZA niż premia
za jedno przyleganie (1). Slot doklejony do cudzej rezerwacji, który zostawia po drugiej
stronie pół godziny na nic, psuje dzień bardziej, niż pomaga - i ma przegrać ze slotem
stojącym luzem. Zmieniając którąkolwiek z tych liczb, sprawdź, czy ta nierówność zostaje.

**HORYZONTU NIE MA** (P7): lista zadań #159 wymieniała go w C3, bo powstała przed
decyzją właściciela z 2026-09-19. W 3.0.0 nie ma limitów horyzontu ani liczby rezerwacji
na pilota.

**Trasa `GET /bookings/suggestions` przyszła z R-B** (B5) i wylądowała w tym epiku razem
z funkcją, którą woła. Chwila bieżąca idzie z portu `Clock`, nie z `Date.now()` -
planowanie odcina to, co minęło, więc „teraz" jest wejściem rachunku, a wejście z zegara
systemowego jest niesprawdzalne testem.

## 8. Uprawnienia

Katalog `Capability` nazywa ZASOBY (`server/src/domain/roles.ts`), a rezerwacja jest
zasobem, którego dotąd nie było - stąd nowe pozycje, nie doklejenie do istniejących:

- **`reservations.manage`** (3.0.0, rola `admin`) - odwołanie i zmiana CUDZEJ rezerwacji,
  wpisanie rezerwacji za pilota. Nie `fleet.manage`, bo tamta nazywa flotę i konfigurację
  maszyn, a tu chodzi o władzę nad cudzym planem;
- **wyłączenie maszyny z użytku idzie na `fleet.manage`** - to stan maszyny w czasie,
  czyli przedłużenie `service_status`, którym tamta zdolność już steruje (§3.1);
- **`reservations.approve`** (3.1.0) - prawo do rozstrzygania cudzych rezerwacji ORAZ
  do oglądania wszystkich ścieżek i terminów klubu. **Nadaje się je OSOBIE, nie roli**
  (decyzja właściciela 2026-09-23, `docs/uprawnienia.md`) - i dlatego zapis z 2026-09-22,
  że ta pozycja „nie powstaje", jest ODWRÓCONY: właściciela nie miałaby tylko dopóty,
  dopóki zdolności rozdawały role;
- **rezerwuje KAŻDY aktywny członek klubu** - to nie jest zdolność panelu, tylko zwykła
  praca pilota, jak wpisanie lotu.

**Napięcie ROZWIĄZANE 2026-09-23 - U ŹRÓDŁA, NIE OBEJŚCIEM.** Role klubu były dwie
(`pilot`, `admin`), a `admin` miał wszystko; „szef wyszkolenia" wycofano 2026-08-30, więc
krok o tej nazwie nie miał na czym stanąć. Dwa pierwsze wyjścia obchodziły problem, zamiast
go usuwać: krok wskazujący **rolę ALBO jedną osobę** robił z każdego urlopu blokadę
rezerwacji, a krok z **listą osób BEZ żadnej zdolności** (zapis z 2026-09-22) kupował
działający workflow kosztem drugiego, równoległego mechanizmu uprawnień - obecność na
liście rozstrzygałaby o dostępie do cudzych planów, o czym katalog `Capability` nie
wiedziałby nic.

Właściciel rozstrzygnął to inaczej: **ról nie ma, jest ZAKRES ZDOLNOŚCI NADAWANY OSOBIE.**
Administrator klubu zaznacza każdemu członkowi, co wolno mu robić; „administrator" zostaje
presetem wypełniającym ten zbiór, a nie władzą samą w sobie. Mechanik jest więc zwykłym
pilotem z doklejonym `reservations.approve` - i nie trzeba mu do tego oddawać floty, kont
ani dziennika. Model, migracja, ekran i zapora przed zamknięciem klubu:
**`docs/uprawnienia.md`**. Kod był na to gotowy: pyta o ZDOLNOŚĆ w dziewiętnastu miejscach
i o rolę w żadnym - dwa trafienia `role === 'admin'` zamieniają ją na polskie słowo
do wyświetlenia.

**Lista kroku i zdolność odpowiadają na DWA różne pytania i oba są potrzebne**: zdolność
mówi „ta osoba w ogóle akceptuje i widzi terminy klubu", lista kroku - „to jest KROK, za
który odpowiada". Bez zdolności nie da się nadać prawa do oglądania cudzych planów; bez
listy każdy akceptujący rozstrzygałby każdy krok, a „Mechanik" i „Szef wyszkolenia"
przestałyby cokolwiek znaczyć.

## 9. Aplikacja pilota

### 9.1 Nawigacja: trzy zakładki, kokpit nad nimi

Ekran startowy przestaje być „Mój dzień" (zgłoszenie #145). Dolny pasek zakładek
(`@react-navigation/bottom-tabs` - czysty JS na `react-native-screens`, które już jest,
więc warstwa natywna zostaje nietknięta; samo wydanie idzie mimo to nowym APK - §13 pkt 7):

| Zakładka | Treść |
| --- | --- |
| **Pulpit** (start) | „MÓJ DZIEŃ" - sumy doby (Loty · Blok · Lot) z wejściem w operacje, POD NIM najbliższa rezerwacja z odliczaniem, „ROZPOCZNIJ LOT" i wpis ręczny, (3.1) rzeczy czekające na moją decyzję |
| **Kalendarz** | oś maszyn × czas, zakres dni, wejście w rezerwację i w nową rezerwację - JEDYNE miejsce z zajętością floty |
| **Historia** | WSZYSTKIE operacje - dzisiejsze i z poprzednich dni, z korektą w oknie 24 h. Dzień jest NAGŁÓWKIEM grupy, operacje zwartymi wierszami (makieta 24, nie 12) |

**PULPIT NIE MA LISTY OPERACJI** (decyzja właściciela 2026-09-19). Ekran startowy
odpowiada na dwa pytania: „jak mi dziś poszło" i „co mam przed sobą" - przebieg
pojedynczej operacji jest pytaniem trzecim, zadawanym rzadziej. Zamiast kafelków stoi
jedna karta z sumami dnia.

**KOLEJNOŚĆ: „MÓJ DZIEŃ" NAD REZERWACJĄ** (ta sama decyzja): pilot otwiera aplikację
w kontekście tego, co dziś lata, a plan jest odpowiedzią na pytanie zadawane raz - rano
albo przy układaniu tygodnia. Karta nosi tę samą nazwę, co dotychczasowy ekran domowy
(01), bo to ta sama rzecz: doba pilota z sumami.

**PULPIT NIE POWTARZA KALENDARZA** (uwaga właściciela 2026-09-19). Pierwsza wersja miała
pasek zajętości floty na dziś; wyleciał, bo odpowiadał na pytanie, które ma własną
zakładkę widoczną przez cały czas - „jak będę chciał sprawdzić, to wejdę w kalendarz".
Sygnałem było już uzasadnienie tego paska w makiecie: nie potrzebował przycisku „zobacz
więcej", bo zakładka stała centymetr niżej. Ekran startowy niesie odtąd wyłącznie to,
czego nie ma nigdzie indziej: sumy dnia, najbliższą rezerwację i akcje.

**Przed pierwszym lotem „Mój dzień" kurczy się do JEDNEJ LINIJKI** („dziś bez lotów",
wariant 20A) zamiast pokazywać trzy zera - zera znaczyłyby zmierzony wynik, a nie brak
pomiaru (reguła z 01A: „- -", nigdy zera). To jest też warunek praktyczny tej kolejności:
pełnowymiarowa karta z zerami spychałaby rezerwację poza pierwszy ekran dokładnie rano,
czyli wtedy, kiedy jest najbardziej potrzebna.

Konsekwencja, którą trzeba było domknąć razem z tą decyzją: **kafelek operacji był
JEDYNYMI drzwiami do korekty dzisiejszego lotu** w oknie 24 h (issue #23, #43). Skoro
znika z ekranu startowego, drzwi przejmuje zakładka Historia - i dlatego obejmuje ona
odtąd także dzisiejsze operacje, wbrew issue #35 („dzisiejszych operacji tam nie ma, bo
mieszkają na 01"). Karta podsumowania jest linkiem, który tam prowadzi. Zakładki nadal
nie dublują list: Pulpit pokazuje SUMY, Historia POZYCJE.

Podział nazw poszedł za tym samym rachunkiem: zakładka nazywa się **Historia**, a nie
„Loty", bo „Loty" obok zakładki z dzisiejszymi sumami sugerowałoby dwa różne zbiory lotów. Pierwsza zakładka nazywa się PULPIT, a nie „Dziś" (decyzja właściciela 2026-09-19): niesie najbliższą rezerwację, która bywa jutrzejsza, więc nazwa czasowa obiecywałaby węższy zakres, niż daje. „Start" i „Przegląd" odpadły przez kolizję ze słownikiem - to w tej aplikacji zdarzenie na osi operacji i stan maszyny.

**KOKPIT ZOSTAJE MODALNY I ZAKŁADEK W NIM NIE MA.** To jest reguła, której ta przebudowa
nie ma prawa naruszyć (CLAUDE.md „Kokpit jest stanem modalnym"): dopóki pilot trzyma
samolot, z kokpitu nie prowadzi żadna droga bokiem - ani zakładka, ani pasek. Flow lotu
(02 → 02e → 02a → kokpit → 09b) żyje w stosie NAD zakładkami, a `usePreventRemove` działa
jak dziś. Zakładka, która wyprowadza z kokpitu, to nie jest zmiana nawigacji, tylko
skasowanie modalności.

### 9.1a Co się dzieje z ekranem „Mój dzień" (01)

Pulpit zastępuje ekran domowy, więc rodzina `01` staje się nieaktualna - ale **nie
z chwilą narysowania makiet, tylko z chwilą WYDANIA 3.0.0**. Do tego czasu `01` jest
prawdą: opisuje aplikację, którą piloci mają w telefonach (2.1.0), i to on jest
specyfikacją dla poprawek w tej linii.

To jest ważne przez podręcznik: `docs/podrecznik/` osadza rodzinę `01` w **13 miejscach
na 9 stronach** (`czym-jest-ninerdeck`, `moj-dzien`, `model-operacji`, `poprzednie-dni`,
`praca-bez-zasiegu`, `synchronizacja`, `ustawienia`, `zdanie-samolotu`, `instalacja`,
`kluby-i-dolaczanie`). Podręcznik opisuje wersję WDROŻONĄ, więc podmiana osadzeń przed
wydaniem dałaby dokumentację ekranu, którego nikt nie ma.

**Do zrobienia w R-A** (żeby przy wydaniu było czym podmienić): rodzina Pulpitu musi mieć
komplet stanów, które dziś ma rodzina `01` - `20a` (bez rezerwacji), **`20c`** (offline
z arkuszem synchronizacji, dziś `01c`), **`20d`** (`SYNC STOI`, dziś `01d`). Wariant
`01e` (dwa kluby) przenosi się do **Historii**, bo to kafelek operacji niesie plakietkę
klubu - na Pulpicie zostaje jej ślad w karcie rezerwacji, która też należy do klubu.

**Do zrobienia w R-W** (wydanie): podmiana 13 osadzeń w podręczniku, przepisanie stron
`moj-dzien` i `poprzednie-dni` pod Pulpit i Historię, screen flow w `CLAUDE.md`
i `docs/design-notes.md` oraz nav-stripy 32 makiet linkujących do `01`.

**Same pliki `01*` ZOSTAJĄ W MIEJSCU jako ARCHIWUM** (decyzja właściciela 2026-09-19,
P8) - z banerem „archiwum linii 2.x, nie jest specyfikacją", dokładnie jak `design/admin/`
po panelu 2.0. Po wydaniu APK linia 2.x żyje na telefonach tygodniami, bo nie każdy
aktualizuje od razu, a zgłoszenie z takiego telefonu trzeba mieć z czym zestawić.

### 9.2 Rezerwacja = ten sam formularz, co lot

„Definiowanie nowego lotu dostępne jako rezerwacja" (zgłoszenie) znaczy dosłownie: kroki
1-2 przejęcia (samolot + Dual, zadanie + trasa + notatka) plus czas i dwie liczby planu
(spodziewany czas lotu, paliwo do zabrania). Kroku 3 (liczniki) NIE MA - odczyt jest
faktem, a nie planem, i powstaje dopiero przy przejęciu maszyny.

Wymóg Duala obowiązuje tak samo, jak na 02 i 15 (`logic/dualRequirement.ts` - jedno
zdanie czytane przez wszystkie trzy ekrany). Ta sama reguła: powód blokady stoi wewnątrz
przycisku.

### 9.3 Ekrany do zaprojektowania (design-first)

Makiety powstają PRZED kodem (`design/*.html`, ramka telefonu 393×852):
`20-pulpit` (+ `20a` bez rezerwacji, `20c` offline, `20d` `SYNC STOI`), `21-kalendarz`
(+ `21b` offline z cache, `21c` doba pusta, **`21d` filtr maszyn**), `22-rezerwacja`
(krok 1 - termin i maszyna; `22a` krok 2 - zadanie; `22b` arkusz czasu; `22c` slot zajęty),
`23-rezerwacja-szczegoly` (+ `23a` kolizja przy przejęciu), **`24-historia`** (+ `24a`
archiwum rozwinięte; zakładka -
nowy numer, bo `12` zostaje specyfikacją linii 2.x). W 3.1.0 dochodzą: `25-powiadomienia`
(skrzynka), `26-decyzja` (zgoda/odmowa z powodem).

**LOG HISTORII: DZIEŃ JAKO NAGŁÓWEK, OPERACJE JAKO ZWARTE WIERSZE** (decyzja właściciela
2026-09-19). Do 3.0.0 każda operacja była pełnym kafelkiem z własną datą i własnym pasem
akcji - dzień z dwiema operacjami powtarzał przez to datę (na zrzucie z urządzenia
„11 SIERPNIA 2026" stało dwa razy pod rząd), a przycisk „OTWÓRZ I POPRAW" dokładał 44 px
do każdej pozycji, choć cała karta prowadziła w to samo miejsce. Odtąd data pada RAZ,
w nagłówku grupy; na ekran wchodzi około trzy
razy więcej pozycji, co ma znaczenie, odkąd lista obejmuje także dziś.

- **ikona po prawej niesie SKUTEK tapnięcia**, który przedtem niósł pas akcji: ołówek
  (operacja w oknie korekty) albo oko (podgląd po oknie, ekran 10B). Cały wiersz jest
  celem dotknięcia, ikona nie jest drugim;
- **liczby stoją BEZ ETYKIET** (uwaga właściciela 2026-09-19: podpisy Loty · Blok · Lot
  w nagłówku każdej grupy były powtórzeniem). Trójka jest znana z kafelka, ze stopki osi
  i z rozliczenia, a jej kolejność jest w aplikacji stała: liczba całkowita to loty, dwa
  czasy to blok i czas w powietrzu;
- **suma dnia tylko przy dniu z kilkoma operacjami** - przy jednej byłaby przepisaniem
  wiersza wyżej;
- **plakietki wyłącznie przy stanie odchylonym** (wpis ręczny, zaległość wysyłki, gasnące
  okno korekty z terminem). „Wysłane" i „można poprawić" nie istnieją - to stany domyślne
  (issue #35, reguła SyncChipa);
- **domyślnie widać TYLKO to, co można poprawić** - dziś i dzień poprzedni, czyli
  operacje w oknie korekty 24 h. Reszta stoi zwinięta za przyciskiem „Starsze operacje"
  z liczbą (`24a` - stan rozwinięty). Zwinięcie jest CHWILOWE: pytanie „co mogę
  poprawić" wraca przy każdym wejściu, a „co latałem w maju" pada raz na jakiś czas.
  Gdy okno korekty jest puste, lista rozwija się sama - nie ma czego chować za
  przyciskiem, skoro przed nim nic nie stoi;
- **GRANICA ZWIJANIA** - tego samego dnia zwijanie zostało w kalendarzu ZAKAZANE
  (maszyny wyłączone z użytku), a w historii NAKAZANE, i to nie jest sprzeczność:
  w kalendarzu chowana byłaby informacja operacyjna potrzebna TERAZ („czemu nie ma czym
  latać"), w historii chowa się zapis, po który sięga się świadomie. **Zwijamy to, czego
  pilot nie szuka, wchodząc na ekran**;
- **sygnatura NIE JEST ZIELONA** (uwaga właściciela 2026-09-19). Na kafelku z linii 2.x
  zieleń była śladem po znaku maszyny, który sygnatura zastąpiła (issue #68) - ale tam
  stała raz na karcie. W zwartym logu świeci przy każdym wierszu, czyli niczego nie
  odróżnia (reguła SyncChipa), a przy okazji obiecuje stan, bo zieleń znaczy w tej
  aplikacji „w normie" albo akcję główną. Identyfikator dostaje ton danej maszynowej;
- **ekran 3.0 ma NOWY NUMER (24)**, a `12-historia.html` zostaje specyfikacją linii 2.x -
  ta sama zasada, co przy `01` (§9.1a): podręcznik i telefony pilotów opisują wersję
  wdrożoną aż do wydania.

**FILTR MASZYN NA OSI** (uwaga właściciela 2026-09-19: „samolotów może być dużo - nawet
kilkanaście"). Przy dwunastu maszynach oś przestaje odpowiadać na „co jest wolne", bo
odpowiedzi trzeba szukać przewijaniem. Chip w nagłówku osi otwiera arkusz wyboru (`21d`):

- **wybór jest PREFERENCJĄ PATRZENIA**, nie danymi klubu - mieszka lokalnie per pilot
  i klub, jak motyw. Nikt nikomu niczego nie chowa;
- **chip jest CICHY: ikona lejka i liczba w tonie podpisu**, bez tła i bez ramki - ten sam
  wzorzec, co zębatka i przycisk zgłoszenia błędu (issue #87). Kontrolka stojąca w rogu
  każdego ekranu nie może krzyczeć, bo uczy oko pomijać ten róg. **Sygnał zawężenia niesie
  SAMA LICZBA** („6 z 12" kontra „12"), a rozjaśnienie napisu jest dodatkiem, nie
  komunikatem;
- dwie wersje odrzucone tego samego dnia, obie uwagą właściciela: **zielony chip** („nie
  sugeruje, że to filtr" - zieleń znaczy w tej aplikacji stan w normie albo akcję główną,
  więc czytał się jak wynik pomiaru; stąd ikona lejka, ustalona afordancja) i **chip
  odwrócony**, czyli jasne tło z ciemnym napisem („strasznie rzuca się w oczy i jest za
  duży" - to był najmocniejszy kontrast na ekranie, mocniejszy niż zielony przycisk
  akcji). Odwrócenie zostaje tam, gdzie opisuje WYBÓR W LIŚCIE (wybrany dzień, pozycja
  kolumny w panelu), a nie kontrolkę w rogu;
- **maszyny wyłączone z użytku ZOSTAJĄ WIDOCZNE na osi** (uwaga właściciela: „te
  wyłączenia były spoko, że były widoczne - nie zwijaj tak"). Pierwsza wersja zwijała je
  w jedną linijkę, żeby oszczędzić wiersze; to było błędem, bo pilot patrzy na kalendarz
  także po to, żeby wiedzieć, CZEMU nie ma czym latać. Filtr służy do chowania maszyn,
  na których się nie lata - nie tych, które akurat stoją w hangarze;
- **akcje arkusza są PRZYPIĘTE**, przewija się lista (reguła ramy arkuszy: skraca się to,
  co pilot doczyta przewinięciem, nie rząd akcji).

### 9.4 Ekrany 3.1.0 (wykonane w epiku #196, design-first)

Makiety powstały PRZED kodem, tak jak w 3.0.0: **`25-powiadomienia`** (+ `25a` nic nie
przyszło, `25b` bez zasięgu), **`26-decyzja`** (+ `26a` podgląd pilota, `26b` podgląd
samolotu, `26c` odmowa z powodem), **stany karty rezerwacji** `23b` czeka na zgodę,
`23e` doszedł krok, `23c` odrzucona, `23d` wygasła, oraz **`20e`** - Pulpit
z rezerwacją, która czeka.

**WIADOMOŚĆ TO NIE SPRAWA** - z tego rozróżnienia bierze się cała skrzynka. „Nowe"
mówi o WIADOMOŚCI („nie widziałeś jeszcze tej nowiny") i gaśnie z chwilą otwarcia
listy; „Do decyzji" mówi o SPRAWIE i stoi, dopóki nie zapadnie decyzja - choćby pilot
czytał listę dziesięć razy. Gdyby jedno gasiło drugie, wystarczyłoby zerknąć na
skrzynkę, żeby prośba o zgodę przestała się dopominać. Stąd dwa różne znaki: krawędź
przy brzegu wiersza i plakietka przy treści.

**CZWARTEJ ZAKŁADKI NIE MA I NIE BĘDZIE.** Zakładka to MIEJSCE PRACY (dzień, plan,
przeszłość), a skrzynka jest kanałem - zagląda się do niej, kiedy coś przyszło,
i wychodzi. Wejściem jest **dzwonek w nagłówku Pulpitu**, obok zębatki i z tego samego
powodu, co ona (issue #82: jedno wejście, tylko tutaj). Licznik zapala się wyłącznie
z nieprzeczytanymi; **bez zasięgu nie ma go wcale**, bo liczbę zna serwer, a
zapamiętana sprzed godziny mówiłaby o stanie, którego telefon nie zna. Paska zakładek
nie ma ani na 25, ani na 26: zakładki są w nawigacji JEDNYM ekranem stosu, a wszystko
otwarte z Pulpitu leży nad nimi (§9.1).

**SPRAWY NIE SĄ PRZYPINANE do góry** - lista jest chronologiczna, a wyróżnia je
plakietka. Przypięcie kazałoby czytać listę dwa razy: raz w kolejności czasu i raz
w kolejności wagi.

**POWÓD ODMOWY JEST CZĘŚCIĄ WIADOMOŚCI** - bez niego „odmowa" zostawia pilota
z pytaniem, na które musiałby zadzwonić. Tą samą zasadą wiadomość o wygaśnięciu mówi,
co robić dalej, a wiadomość o zmianie ścieżki - dlaczego rezerwacja czeka, mimo że ktoś
już ją zatwierdził.

**PODGLĄD JEST NA TELEFONIE EKRANEM, NIE ARKUSZEM.** W panelu te same fakty wysuwają
się szufladą nad kolejką, bo tam sprawa zostaje widoczna pod spodem; na telefonie nie
ma takiego miejsca, a cztery karty z tabelą to treść na cały ekran - arkusz z sufitem
56 px byłby ekranem udającym wstawkę. Podgląd nie ma ANI JEDNEJ akcji na sprawie: zgoda
i odmowa zostają tam, gdzie stoi komplet danych.

**WIERSZ PROWADZĄCY W GŁĄB WYGLĄDA INACZEJ NIŻ W PANELU.** Tam afordancję niesie
ghost-badge POD KURSOREM (§10); na telefonie kursora nie ma, więc ta sama sztuczka
dałaby wiersz, po którym nic nie widać. Afordancja stoi w spoczynku i jest nią szewron
na prawej krawędzi - przy trzech wierszach karty (samolot, pilot, drugi pilot), nie
przy każdym.

**ODMOWA NIE JEST CZERWONA.** Czerwień niesie w tej aplikacji odwołanie WŁASNEJ
rezerwacji i unieważnienie wpisu - rzeczy, które coś kasują. Odmowa jest decyzją
i stoi obok zgody jako druga, wyciszona odpowiedź.

**KROKU NIE PISZEMY** - ani na 26, ani w kolejce panelu: ekran pyta CIEBIE, więc nazwa
kroku odpowiada na pytanie, którego nikt nie zadał. Co się stanie po decyzji, mówi
jedno zdanie pod pasem akcji.

**STANY KARTY REZERWACJI: UKŁAD ZOSTAJE, ZMIENIA SIĘ TON.** Miejsce na plakietkę stanu
przewidziano już w 3.0.0, kiedy stan był jeden - ekran, który przy odmowie przestawia
karty, każe czytać się od nowa w najgorszym momencie. Zieleń znaczy „w normie" i niesie
akcję główną, więc na karcie rezerwacji obiecuje, że lot jest pewny: rezerwacja
czekająca idzie w ton ostrzeżenia (NIE w wygaszenie - zajmuje maszynę), a zamknięta
(odrzucona, wygasła) wraca do tonu neutralnego, bo czerwień niesie baner, a dwa czerwone
pudełka pod sobą przestają się odróżniać.

**ŚCIEŻKA MÓWI, ILE KROKÓW ZOSTAŁO I KTO JE TRZYMA** - to jedyna odpowiedź na pytanie
„do kogo mam zadzwonić". Nazwisk decydujących NIE MA: krok bywa obsadzony przez kilka
osób i rozstrzyga pierwsza (§11.2), więc jedno nazwisko byłoby nieprawdą, a trzy - listą
do przepisania przy każdej zmianie obsady.

**POPRAWKA CZYŚCI ZGODY i ekran mówi to PRZED tapnięciem.** Zgoda dotyczyła KONKRETNEGO
terminu, więc po przesunięciu przestaje cokolwiek znaczyć - inaczej ktoś zatwierdziłby
dwie godziny w sobotę rano, a poleciałoby się przez pół niedzieli. Odwołanie zostaje:
rezerwacja czekająca trzyma slot tak samo jak zatwierdzona (§11.5). Rezerwacja ZAMKNIĘTA
ma za to jedno wyjście - „wybierz inny termin": nie ma czego przesuwać ani odwoływać,
a wyszarzone przyciski obiecywałyby akcje, których reguły nie dopuszczą.

**ODLICZANIE ZOSTAJE przy rezerwacji czekającej** (`20e`). Termin zbliża się niezależnie
od tego, czy ktoś zdążył zdecydować, a para „za godzinę - i nadal czeka" jest tu całą
informacją.

**LICENCJE, BADANIA I UPRAWNIENIA NA TYP SĄ POZA ZAKRESEM 3.1.0** (decyzja właściciela
2026-09-23: „na razie pomijamy, jest do tego inny epik"). Podgląd pilota przy decyzji
odpowiada więc wyłącznie NALOTEM I HISTORIĄ LOTÓW - tym, co rejestr naprawdę wie.
Ważności badań ani uprawnień na typ nie pokazujemy w żadnej postaci, także jako
pustego wiersza albo kreski: pole „Badania -" na ekranie, który ma odpowiedzieć „czy
mogę mu zatwierdzić ten lot", czyta się jak stwierdzenie o stanie dokumentów, a byłoby
wyłącznie stwierdzeniem o brakującym module. Kiedy tamten epik wejdzie, podgląd dostanie
kartę z prawdziwymi datami i to jest właściwa kolejność.

**CO ZOSTAŁO OTWARTE do rozmowy z właścicielem**: katalog zestawów uprawnień
(`docs/uprawnienia.md` §2) - czy sześć pozycji wystarczy i czy nazwy są te właściwe.

## 10. Panel: moduł „Kalendarz"

Piąta pozycja kolumny bocznej (`ui/shell/nav.ts`), po „Samolotach", na `panel.access`.
Makiety wg `design/panel/SZABLON.html`, styl lekki (issue #107), arkusz `panel.css`
generowany (`npm run panel:css`):

- `kalendarz-flota` - oś maszyn × dni, zakres dat, zajętości jako paski (rezerwacja
  w tonie neutralnym, wyłączenie z użytku bursztynowe);
- `kalendarz-wpis` - szuflada jednej zajętości: kto, co, kiedy, notatka, odwołanie
  z powodem; dla wyłączenia - powód serwisowy;
- `kalendarz-blokada` - wpisanie wyłączenia z użytku (maszyna, zakres, powód, komentarz);
- (3.1) `kalendarz-sciezka` - kroki akceptacji klubu (kolejność przestawia się
  chwytem, nie strzałkami), `kalendarz-kolejka` - co czeka na decyzję,
  `kalendarz-podglad` - szuflada pilota i samolotu nad kolejką.

**STAN „CZEKA NA AKCEPTACJĘ" NA OSI FLOTY WYGLĄDA JAK ZAJĘTOŚĆ, BO NIĄ JEST** (L4):
rezerwacja złożona trzyma termin od razu, nie od zgody - wiersz w `bookings` powstaje
przy złożeniu i od tej chwili wyklucza nakładanie. Wpis ma więc to samo tło, ten sam
napis i to samo miejsce, co każdy inny; różni go PRZERYWANA RAMKA, czyli kształt,
a nie barwa (bursztyn niesie wyłączenie z użytku). Kreska jest JAŚNIEJSZA od zwykłego
obrysu - przerywana linia o kontraście zwykłej ramki zlewa się z wypełnieniem i zostaje
wpis wyglądający na odrobinę wytarty. Konsekwencja: ramka pod kursorem idzie do końca
skali, bo `--text-muted` należy odtąd do stanu czekającego.

Oś pokazuje KAŻDY wpis czekający w zakresie, a baner kolejki liczy TYLKO te, które
czekają na zalogowanego - dwa różne pytania, więc liczby nie muszą się zgadzać.

**PODGLĄD OTWIERA SIĘ Z WARTOŚCI, A AFORDANCJĄ JEST GHOST-BADGE POD KURSOREM**
(komponent `.go`, sześć wersji, wybór właściciela 2026-09-23). W spoczynku wartość jest
wartością - w swoim miejscu, w swoim kolorze, bez ramki i bez tła, z wyciszoną ikoną
panelu bocznego; pod kursorem i na fokusie dostaje KSZTAŁT: tło i zaokrąglenie,
dokładnie jak `.btn.ghost`. Odrzucone i po co to wiedzieć: niebieski odnośnik obiecywał
przejście gdzie indziej (a ekran pod spodem zostaje), przyciski pod tytułem oderwały
kontrolkę od rzeczy, której dotyczy, karty `.opt` ważyły dwie obramowane pozycje na
każdą sprawę, szewron mówi „dalej", a sama ikona z podkreśleniem była afordancją bez
kształtu. **Podpis wartości wchodzi do środka** (kod pilota przy nazwisku): jest
częścią odpowiedzi, a nie sąsiadem - zostawiony na zewnątrz rozcinał jedną rzecz na dwie.
**Drugi pilot ma własne wejście**: przy locie szkolnym i załodze dwuosobowej to jego
nalot bywa pytaniem, a nie dowódcy.

Panel NIE pokazuje sugestii slotów: to narzędzie pilota szukającego miejsca dla siebie,
a administrator patrzy na całość i wpisuje konkretny termin.

## 11. Workflow akceptacji (3.1.0)

### 11.1 Klub bez ścieżki nie klika w nic

Brak wierszy w `approval_steps` znaczy „rezerwacja potwierdzona od razu" - i to jest stan
domyślny każdego nowego klubu. Wymóg akceptacji jest decyzją klubu, nie podatkiem
nakładanym przez narzędzie.

### 11.2 Krok to NAZWA i LISTA OSÓB, a kroki idą PO KOLEI

**Decyzja właściciela 2026-09-22** - zastępuje pierwotny model „krok wskazuje rolę ALBO
jedną osobę" i domyka przy okazji P3. Ścieżkę definiuje **administrator klubu**: nadaje
krokom nazwy, ustala ich kolejność i dopisuje do każdego osoby, które mogą go zatwierdzić.

- **osób w kroku bywa kilka, a wystarczy zgoda JEDNEJ** - to pula uprawnionych, nie
  komplet podpisów. Skrajny przypadek („jeden krok, kilka osób, ktokolwiek zatwierdzi")
  ma być najprostszy z możliwych, a nie najcięższy. Wariant „wszyscy muszą podpisać"
  jest innym mechanizmem i wymagałby innej nazwy - patrz §16;
- **kroki idą po kolei**: krok 2 pyta dopiero po zgodzie kroku 1. Opisuje to prawdziwy
  porządek („najpierw mechanik zwalnia maszynę, potem szef wyszkolenia zgadza się na
  lot"), budzi jedną grupę naraz zamiast wszystkich, a przy odmowie na kroku 1 nikt
  dalszy nie jest fatygowany;
- **ROLI W KROKU NIE MA I NIE BĘDZIE** - to jest właśnie rozwiązanie napięcia z §8. Role
  klubu są dwie (`pilot`, `admin`), więc „Mechanik" nigdy nie był rolą, a wskazanie
  JEDNEJ imiennej osoby robiło z każdego urlopu blokadę rezerwacji. Lista osób znosi
  jedno i drugie;
- **osobą w kroku bywa ZWYKŁY PILOT bez dostępu do panelu**, więc decyzja musi dać się
  podjąć z telefonu, ze skrzynki (§12.1). Panel jest dla tego, kto ścieżkę układa, nie
  dla tego, kto po niej klika.

**Rezerwujący pomija własne kroki.** Jeśli osoba zakładająca rezerwację jest na liście
któregoś kroku, ten krok przechodzi sam - nikt nie prosi człowieka o zgodę na własny
plan. Pominięcie **zapisuje się jako decyzja** z adnotacją `via = self`, a nie jako brak
wpisu: po miesiącu krok pominięty musi być odróżnialny od kroku, o który nikt nie zapytał.
Gdy rezerwujący jest na liście wszystkich kroków, rezerwacja potwierdza się od razu.

**Pomijanie dotyczy OBECNOŚCI NA LIŚCIE, nie władzy administratora** - inaczej rezerwacje
administratora omijałyby ścieżkę, której sam pilnuje. Administrator może natomiast
zdecydować za KAŻDY krok (`reservations.manage`) i to jest jawny akt zapisany w historii,
a nie ciche ominięcie.

**ŚCIEŻKA JEST ZAWSZE BIEŻĄCA** (decyzja właściciela 2026-09-23). Rezerwacja w toku czyta
konfigurację klubu na ŻYWO, a nie jej kopię z chwili złożenia: poprawka ścieżki obowiązuje
natychmiast i wszystkich. Cena jest przyjęta świadomie - **dołożenie kroku COFA sprawy
w toku** (rezerwacja czekająca na krok 2 wraca do nowego kroku 1), więc ekran musi to
powiedzieć wprost, zamiast po prostu pokazać cofnięty stan.

Z żywej ścieżki wynikają dwie rzeczy w modelu (§3.4), obie NIEOCZYWISTE:

- **decyzja wskazuje KROK, nie jego numer**. Dołożenie kroku w środku przesuwa numery
  następnych, więc zgoda zapisana jako „krok 2" opisywałaby po takiej zmianie inny krok
  niż w chwili kliknięcia - czyli żywa ścieżka po cichu przepisywałaby cudze podpisy.
  Stąd trwałe `approval_steps.id` i zmienna `position` obok niego;
- **kroku się NIE KASUJE, tylko przestaje być pytany** (`removed_at`). Rejestr decyzji
  jest append-only, więc zgoda wydana pod krokiem zdjętym ze ścieżki zostaje czytelna -
  a bez tego klucz obcy i tak nie pozwoliłby kroku usunąć.

**Krok bez ani jednej osoby blokuje wszystko**, więc stoją przed tym dwie zapory: panel
nie zapisze takiego kroku, a administrator odblokuje ścieżkę, w której ludzie stracili
członkostwo. Bez tej drugiej wystarczyłoby jedno odejście z klubu, żeby rezerwacje utknęły
na zawsze.

### 11.3 Odmowa wymaga powodu, zgoda nie

Powód jest w `booking_approvals.reason` WYMAGANY przy `rejected` - pilot czyta go na
telefonie, tak jak czyta powód odrzucenia zgłoszenia do klubu na ekranie 00D. Precedens
jest wprost: „powód odrzucenia jest w panelu WYMAGANY, bo pilot czyta go na ekranie"
(`docs/logowanie-google.md`). Pierwsza odmowa kończy sprawę - rezerwacja przechodzi
w `rejected` i zwalnia slot.

### 11.4 Decyzja jest zapisem, nie polem

`booking_approvals` jest append-only: kto, kiedy, co postanowił, dlaczego i czy kliknął
to człowiek, czy krok przeszedł sam (`via`). Zmiana zdania znaczy nową rezerwację, nie
nadpisanie decyzji.

### 11.5 Termin nadszedł, a decyzji nie ma

**Nierozstrzygnięta rezerwacja WYGASA z początkiem swojego terminu** (decyzja właściciela
2026-09-23), slot wraca do puli, a pilot dostaje powiadomienie „nikt nie zdążył zdecydować".
Bez tej reguły maszyna stałaby w sobotę zablokowana prośbą, której nikt nie rozpatrzył -
czyli dokładnie tym, przed czym broni P5.

Mechanizm JUŻ ISTNIEJE: `BookingReleaseJob` (§3.5) przemiata sloty co 5 minut, więc dochodzi
mu jedno pytanie, a nie drugi wątek. Stan jest osobny od `released` z P5 (tam maszyny nie
przejęto, tu zgody nie wydano) i BEZ powodu - `close_reason` niesie zdanie CZŁOWIEKA,
a tutaj po prostu upłynął czas.

**„Milczenie znaczy zgodę" ODRZUCONE** (§16): najprostszą drogą do zatwierdzenia dowolnego
lotu stałoby się nieklikanie niczego, a zgoda przestałaby cokolwiek znaczyć.

## 12. Powiadomienia (3.1.0)

### 12.1 Skrzynka jest źródłem prawdy, push tylko budzikiem

**Decyzja właściciela 2026-09-18.** Push bywa niedostarczony, wyłączony w ustawieniach
systemu albo odrzucony na Androidzie 13+ (`POST_NOTIFICATIONS`) - a prośba o zgodę, która
przepadła, znaczy pilota czekającego na odpowiedź, która nigdy nie przyszła. Dlatego:

- **skrzynka** (`notifications` + `GET /me/notifications`) jest kompletna i ma historię.
  Licznik nieprzeczytanych stoi przy zakładce Pulpit;
- **push** niesie tylko „masz coś w skrzynce" i otwiera właściwy ekran. Brak push nie gubi
  ani jednej informacji.

**CAŁY TEN MODUŁ WYMAGA SIECI** (decyzja właściciela 2026-09-22) - i to ODWRACA zdanie
„skrzynka działa offline z cache", które stało tu do 3.0.0. Powód jest ten sam, co przy
rezerwacji (§2.2): zgoda jest umową między ludźmi, a nie pomiarem z kabiny, i zapada przy
biurku. Cache powiadomień w SQLite więc NIE POWSTAJE, a zakres R-I jest o niego mniejszy.
Reguła §4.1 („brak sieci nigdy nie blokuje pilota") broni PRACY W LOCIE - rejestru, czasów,
odczytów, zdania samolotu - i tego nie rusza: bez zasięgu pilot lata dokładnie jak dotąd,
tylko nie zobaczy skrzynki i nie zatwierdzi cudzego terminu.

### 12.2 Token push żyje razem z sesją logowania

`push_tokens.session_id` z kasowaniem kaskadowym: zdalne wylogowanie z panelu (2.1.0,
`login_sessions`) gasi przy okazji powiadomienia na tamtym urządzeniu. Bez tego wspólny
tablet klubu wysyłałby powiadomienia pilota, który dawno oddał urządzenie koledze.

### 12.3 Port, nie zależność

`PushPort` + adapter `ExpoPush` (HTTP do Expo Push API przez `fetch`, zero zależności)
+ `LogPush` dla dev - dokładnie wzorzec `MailPort`/`Resend`/`LogMail` z 2.1.0.

**`PUSH_PROVIDER` (`expo` | `log`) NIE JEST WYMAGANY i domyślnie znaczy `log`** - inaczej
niż `MAIL_PROVIDER`, bo rachunek jest tu naprawdę inny. Poczta musi być, bo „Nie pamiętam
hasła", które po cichu nic nie wysyła, zostawia człowieka bez drogi do konta. Push jest
BUDZIKIEM (§12.1): bez niego prośba o zgodę nadal czeka w skrzynce, kompletna i z historią.
Serwer, który nie wstaje przez brak budzika, kosztuje więcej niż budzik, który nie dzwoni.

### 12.4 Cena po stronie aplikacji: nowy APK

`expo-notifications` jest modułem natywnym - wejście do 3.1.0 znaczy nowy build i nowy
`versionCode`, nie OTA (`runtimeVersion: appVersion` - skill `wydanie`, krok 0). Do tego
zadanie właściciela: projekt Firebase, FCM V1 (service account) w EAS, `google-services.json`.
Ta pozycja jest na drodze krytycznej 3.1.0 tak samo, jak poczta (#137) była dla 2.1.0.

## 13. Etapy i kolejność realizacji

Numeracja **R** (rezerwacje), jak **H** przy logowaniu hasłem. Strzałka = zależność twarda.

```
3.0.0   R-A projekt i makiety ──┬─► R-B serwer: model i API ──┬─► R-D panel: Kalendarz ──┐
                                │                             │                          ├─► R-W wydanie
                                └─► R-C domena: sloty ────────┴─► R-E aplikacja: nawigacja┤
                                                                  └─► R-F aplikacja: kalendarz i rezerwacja
3.1.0   R-G serwer: ścieżka i skrzynka ──┬─► R-H panel: ścieżka i kolejka ──┐
                                         └─► R-I aplikacja: skrzynka i decyzje ├─► R-K wydanie
                                            R-J push (APK) + zadanie właściciela ┘
```

1. **R-A - projekt** (design-first, blokuje wszystko): ten dokument dociągnięty do końca
   po potwierdzeniu §15, makiety telefonu i panelu, sprawdzenie `Intl`/stref na urządzeniu.
2. **R-B - serwer** (migracja 11, `bookings`, wykluczenie nakładania, trasy telefonu
   i panelu, izolacja klubu, testy). Najdłuższy pojedynczy kawałek.
3. **R-C - domena slotów** (`packages/domain/src/booking/`) - może iść RÓWNOLEGLE z R-B,
   bo nie dotyka bazy; R-B tylko ją woła.
4. **R-D - panel** (moduł Kalendarz, wyłączenia z użytku) - po R-B.
5. **R-E - aplikacja: nawigacja** (zakładki, ekran startowy, kokpit nadal modalny) - zależy
   tylko od makiet, więc może iść równolegle z R-B/R-D.
6. **R-F - aplikacja: kalendarz i rezerwacja** (formularz, sugestie, wejście w lot
   z rezerwacji) - po R-B, R-C i R-E. **Cache'u zajętości NIE MA**: §2.2 zdjęło go razem
   z odczytem bez zasięgu, więc schemat SQLite telefonu zostaje na wersji 9.
7. **R-W - wydanie 3.0.0**: podręcznik, changelog, migracja na staging, **nowy APK**
   (decyzja właściciela 2026-09-21). Warstwa natywna się nie zmienia, więc aktualizacja
   w tle byłaby technicznie możliwa - ale przy `runtimeVersion: appVersion` nie wolno
   przy niej podnieść `version`, a bez podbicia telefon w „O aplikacji" i strona wydań
   mówiłyby „2.1.0" o wersji z rezerwacjami. Numer wersji jest tym, co pilot podaje
   w zgłoszeniu z terenu, a klub czyta na stronie - wygrywa z jedną reinstalacją.

Kolejność w 3.1.0: **R-G** (serwer: ścieżka, decyzje, skrzynka) → **R-H** (panel) i
**R-I** (aplikacja) równolegle → **R-J** push razem z zadaniem właściciela (Firebase/EAS)
→ **R-K** wydanie 3.1.0 **nowym APK**.

## 14. Ryzyka

| # | Ryzyko | Co z nim robimy |
| --- | --- | --- |
| R1 | **Termin milestone** wobec siedmiu epików, w tym przebudowy nawigacji aplikacji | **ROZSTRZYGNIĘTE 2026-09-18: termin przesunięty z 26.09 na 3 października, zakres 3.0.0 bez zmian** - aplikacja zostaje w tym wydaniu. Praca mieści się w oknie (2.0.0: 7 dni na 10 epików; 2.1.0: 3 dni na 7), bufor idzie na to, co od tempa pracy nie zależy: sprawdzenia na urządzeniu, staging z migracją 11 i turę uwag do nawigacji |
| R2 | `btree_gist` niedostępne na instancji Postgresa | Sprawdzić na **staging** przed wdrożeniem; plan awaryjny (blokada doradcza) w §3.2 |
| R3 | `Intl` ze strefami na Hermes/Androidzie | Sprawdzić w dev buildzie w R-A; plan awaryjny: offsety liczone przez serwer (§6) |
| R4 | Wyścigu dwóch rezerwacji nie da się przetestować na PGlite | Test sprawdza ISTNIENIE ograniczenia i odbicie sekwencyjne; równoległość bierze na siebie baza |
| R5 | Push wymaga nowego APK i konta Firebase | Osobne zadanie właściciela na drodze krytycznej 3.1.0, jak poczta w #137 |
| R6 | Zakładki mogą złamać modalność kokpitu | Reguła zapisana w §9.1; do tego test nawigacji, że z kokpitu nie ma wyjścia bokiem |
| R7 | Rezerwacja to pierwszy byt mutowalny obok append-only rejestru - kusi, by dołożyć do niego kolejne | Granica zapisana w §2.1; `session_claim.reservationId` jest JEDYNYM połączeniem i tylko w jedną stronę |

## 15. Decyzje DO POTWIERDZENIA przed R-B

- ~~**P1 - strefa czasu kalendarza**~~ - **rozstrzygnięte 2026-09-18**: siatkę rysuje
  strefa KLUBU (`organizations.timezone`), rejestr bez zmian w UTC, a czas lokalny
  urządzenia dochodzi adnotacją WYŁĄCZNIE przy różnicy stref (§6).
- ~~**P2 - okno dnia klubu**~~ - **rozstrzygnięte 2026-09-19**: okno liczy się
  z **WSCHODU I ZACHODU SŁOŃCA nad lotniskiem macierzystym klubu** (§7.1), a nie ze
  stałych godzin. Konsekwencje w §7.1 - to najdroższa z decyzji tej tury i zmienia
  zakres #158 oraz #159.
- ~~**P3 - kroki akceptacji po kolei czy równolegle**~~ - **rozstrzygnięte 2026-09-22**:
  **po kolei**, a przy okazji przebudowany sam krok - ma NAZWĘ i LISTĘ OSÓB zamiast roli
  albo jednego człowieka, wystarczy zgoda jednej osoby z listy, a rezerwujący pomija
  kroki, na których sam stoi (§11.2). To rozwiązuje też napięcie z §8.
- ~~**P4 - kto odwołuje cudzą rezerwację**~~ - **rozstrzygnięte 2026-09-19, uściślone
  2026-09-23**: administrator (`reservations.manage`) **oraz osoby ze zdolnością**
  **`reservations.approve`**. W 3.0.0 znaczyło to „tylko administrator", bo ścieżki jeszcze
  nie było. Uprawnia ZDOLNOŚĆ, a nie obecność na liście kroku: lista mówi, za który krok
  ktoś odpowiada, a nie czy w ogóle wolno mu sięgać po cudze terminy (§8). Powód jest
  WYMAGANY w obu wypadkach: odwołujący sięga po cudzy plan, a pilot czyta powód w aplikacji.
- ~~**P5 - „no-show"**~~ - **rozstrzygnięte 2026-09-19**: slot **zwalnia się sam po
  60 minutach** od początku rezerwacji, jeśli serwer nie widzi ani przejęcia maszyny,
  ani biegu silnika. Maszyna nie stoi bezczynnie w sobotę. Mechanizm, jego cena
  i zderzenie z offline-first: §4.1.
- ~~**P6 - zakres wobec terminu**~~ - **rozstrzygnięte 2026-09-18**: termin 3 października,
  zakres 3.0.0 bez zmian (§14 R1).
- ~~**P7 - horyzont i limity**~~ - **rozstrzygnięte 2026-09-19**: w 3.0.0 BEZ limitów.
  Ile i jak daleko w przód wolno rezerwować, to reguła społeczna klubu, nie techniczna;
  limity dokładamy, gdy klub pokaże, że ich potrzebuje.
- ~~**P8 - los plików `01*` przy wydaniu 3.0.0**~~ - **rozstrzygnięte 2026-09-19**:
  zostają W MIEJSCU jako ARCHIWUM z banerem, dokładnie jak `design/admin/` po panelu 2.0
  (§9.1a). Powód: po wydaniu APK linia 2.x żyje na telefonach tygodniami, bo nie każdy
  aktualizuje od razu - zgłoszenie z takiego telefonu trzeba mieć z czym zestawić.
  Dodatkowo 32 makiety linkujące do `01` nie wymagają wtedy ruszania.

## 16. Odrzucone warianty - nie wracać

| Wariant | Dlaczego odrzucony |
| --- | --- |
| **Rezerwacja jako zdarzenie rejestru** (`reservation_create` w outboksie) | §2.1 - konkurencja o zasób potrzebuje arbitra, a wysyłka z opóźnieniem cofa obietnicę po fakcie |
| **Rezerwacja wymagana do rozpoczęcia lotu** | Decyzja właściciela 2026-09-18 - łamie §4.1 pkt 1 (brak sieci nigdy nie blokuje pilota) i wywraca loty awaryjne |
| **Dwie tabele: `reservations` + `aircraft_blocks`** | §3.1 - wykluczenie nakładania musi objąć oba rodzaje naraz, a to działa tylko w obrębie jednej tabeli |
| **Sprawdzanie nakładania w kodzie aplikacji** | Dyscyplina zamiast niezmiennika; przy dwóch równoległych żądaniach po prostu nie działa |
| **Jeden akceptujący („dyżurny")** | Decyzja właściciela 2026-09-18 - odwracałoby zdanie ze zgłoszenia „kilka osób musi się zgodzić" |
| **Akceptacja warunkowa (reguły typu „pilot poniżej X godzin")** | Rozważona i odłożona: wymaga katalogu warunków, którego klub jeszcze nie umie nazwać. Wraca, gdy poprosi |
| **Ścieżka z chwili złożenia (kopia kroków w rezerwacji)** | Decyzja właściciela 2026-09-23 - ścieżka jest ZAWSZE BIEŻĄCA (§11.2). Kopia dawała historię niezmienną pod ręką, ale kosztem poprawki, która nie obowiązuje tego, co już w toku |
| **Milczenie znaczy zgodę** | §11.5 - najprostszą drogą do zatwierdzenia dowolnego lotu stałoby się nieklikanie niczego |
| **Rezerwacja czeka bez końca na decyzję** | §11.5 - maszyna stałaby w sobotę zablokowana prośbą, której nikt nie rozpatrzył |
| **Zdolność akceptacji jako ROLA (trzecia albo `admin`)** | §8 - żeby mechanik zatwierdzał swój krok, trzeba by mu oddać flotę, konta i dziennik; jedna rola i tak nie opisałaby klubu, w którym mechanik i szef wyszkolenia to dwa różne kroki |
| **Krok wskazuje ROLĘ albo JEDNĄ osobę** | Pierwotny model §3.4, zastąpiony 2026-09-22: role klubu są dwie, więc krok i tak celował w człowieka - a wtedy jeden urlop blokuje rezerwacje |
| **Wszystkie osoby kroku muszą zatwierdzić** | Odwracałoby sens listy: ma ona ZWIĘKSZAĆ szansę, że ktoś odpowie, a nie mnożyć podpisy. Komplet zgód to inny mechanizm i wymagałby innej nazwy |
| **Rezerwujący prosi sam siebie o zgodę** | Krok, na którego liście stoi rezerwujący, przechodzi sam (§11.2) - pytanie człowieka o zgodę na własny plan jest pustym kliknięciem |
| **Skrzynka powiadomień z cache offline** | Decyzja właściciela 2026-09-22 - cały moduł wymaga sieci, jak rezerwacja (§2.2); cache byłby kosztem bez odbiorcy |
| **Tylko push, bez skrzynki** | §12.1 - powiadomienie, które nie doszło, znaczy prośbę o zgodę wiszącą bez odpowiedzi |
| **Tylko e-mail zamiast skrzynki** | Rozważone (poczta działa od 2.1.0); e-mail w hangarze bywa czytany z opóźnieniem, a historia decyzji ma być w aplikacji |
| **Kalendarz w UTC** | §6 - rezerwacja jest umową o godzinie, a nie pomiarem; dwa razy w roku przesuwałby siatkę dnia |

## 17. Przegląd bezpieczeństwa (W7, 2026-09-21)

Zrobiony PRZED dokumentacją, nie po niej - nauka z wydania 2.1.0, gdzie kolejność była
odwrotna. Trzy pytania z zadania W7 i jedno ustalenie, które wymagało decyzji.

**Izolacja klubu na nowych trasach: SPEŁNIONA strukturalnie.** `GET /bookings/:id`
i reszta tras rezerwacji mają przypadki w `server/test/tenantIsolation.test.ts`, który
bierze listę tras z REJESTRU FASTIFY - nowa trasa bez przypadku albo bez imiennego
wyjątku wywraca ten test. Klub jest argumentem portu (`byId(db, orgId, id)`), a nie
polem filtra, więc pominięcia nie da się przeoczyć.

**Odmowy 404 zamiast 403: SPEŁNIONE.** Cudza rezerwacja jest dla tokenu NIEISTNIEJĄCA -
`403` mówiłoby „to istnieje, ale nie dla ciebie". Osobno sprawdzone zderzenie uuidów
między klubami: wiersz o tym samym identyfikatorze w innym klubie oddaje
`{ ok: false, taken: null }`, czyli odmowę bez wskazania, co stoi w terminie - inaczej
idempotencja zapisu byłaby sondą na cudzy kalendarz.

**Ile mówimy o cudzej rezerwacji: ZNALEZIONE I ZAWĘŻONE.** Z cudzych terminów ekrany
czytają dokładnie pięć rzeczy - godziny, maszynę, właściciela, rodzaj zajętości i powód
wyłączenia z użytku (`calendarGrid.ts`, `slotChips.ts`, `aircraftAvailability.ts`,
`claimConflict.ts`). Serwer wysyłał przy tym na KAŻDY telefon w klubie komplet pól:
trasę, drugiego pilota, planowany czas lotu, paliwo i NOTATKĘ - wolny tekst, który pilot
pisał dla siebie i dla administratora. Na ekran nie trafiał nigdy, a jechał przy każdym
odświeżeniu kalendarza i w każdej odmowie `slot_taken`.

**Decyzja właściciela 2026-09-21: pełne pola tylko dla WŁASNYCH rezerwacji.**
`bookingWire` pyta odtąd, KTO PATRZY. Wąski kształt nie jest zawężeniem „na wszelki
wypadek" - to jest ta sama lista pól, którą czytają wymienione wyżej moduły. Wyłączenie
z użytku nie ma właściciela, więc idzie wąskim kształtem, a `blockReason` jest w nim od
zawsze, bo to ono nazywa taką zajętość na pasku osi.

Po stronie telefonu pola własnej rezerwacji są **OPCJONALNE, a nie nullowalne**:
`undefined` znaczy „nie moja rezerwacja", a `null` znaczyłoby „moja, tylko pusta" -
i kod czytający je nie miałby jak odróżnić jednego od drugiego. Pilnuje tego test
`server/test/bookings.test.ts` (pełna lista kluczy cudzej zajętości, karta `23` i ciało
odmowy), bo niepilnowana własność jest własnością do czasu.

**Czego świadomie NIE zmieniono:** panel widzi komplet - administrator ma do tego
osobną zdolność (`reservations.manage`) i to jest jego robota; karta `23` otwarta na
cudzym terminie dalej działa i pokazuje, KTO i KIEDY - tyle, ile wie po zawężeniu.

**OD 3.1.0 WIDZÓW JEST TRZECH, NIE DWÓCH** (decyzja właściciela 2026-09-23). Obok
właściciela terminu i reszty klubu staje **osoba ze zdolnością `reservations.approve`**:
widzi wszystkie ścieżki i wszystkie rezerwacje klubu w komplecie. Powód jest wprost
praktyczny - „SP-AXA, sobota 9:00-12:00, J. Nowak" to za mało, żeby zgoda cokolwiek
znaczyła; akceptujący ma zobaczyć zadanie, trasę, drugiego pilota, planowany czas
i notatkę, bo dokładnie o nich rozstrzyga.

To NIE jest wyłom w zawężeniu, tylko jego trzeci przypadek: `bookingWire` dalej pyta
KTO PATRZY, a odpowiedź „akceptujący" jest odpowiedzią o ZDOLNOŚCI, sprawdzaną tak samo,
jak `reservations.manage` w panelu. Zwykły członek klubu nie zyskuje ani jednego pola.

## 18. Odstępstwa wobec planu - gdzie ich szukać

Ten dokument powstał PRZED kodem i w kilku miejscach kod go poprawił. Odstępstwa są
opisane TAM, GDZIE MIESZKA DECYZJA - poniżej jest spis, a nie druga kopia: dwa opisy
tej samej zmiany rozjeżdżają się przy pierwszej poprawce jednego z nich.

| Epik | Co wyszło inaczej | Gdzie |
| --- | --- | --- |
| R-A | slot zwalnia się sam po godzinie bez przejęcia maszyny - świadomy wyłom w „rezerwacja jest mutowalna tylko przez człowieka" | §3.5 |
| R-B | kontrakt kalendarza oddaje GRANICE DÓB, nie offsety; sonda stref przestała być warunkiem wstępnym | §6.1 |
| R-B | `aircraft_not_found` osobno od `aircraft_disabled` - wyłączenie z użytku nie pyta o stan służby, więc razem z nim przestawało sprawdzać ISTNIENIE | §3.5 |
| R-C | horyzontu rezerwacji NIE MA (P7); chwila bieżąca idzie z portu `Clock` | §7.2 |
| R-E | zakładki nazwane PULPIT · KALENDARZ · HISTORIA, a Historia obejmuje także DZIŚ - odejście od issue #35 | §9.1 |
| R-F | **cały moduł wymaga sieci** - odwraca pierwotne „odczyt kalendarza działa z cache" | §2.2 |
| R-F | krok 1 formularza pyta o TERMIN I MASZYNĘ, nie o zadanie - lista zadań w issue #162 jest starsza niż makiety 22/22A | §9.2 |
| R-F | tapnięcie w wolne pasmo NIE ustawia terminu, tylko przekazuje godzinę jako preferowaną porę do sugestii | makiety `21`, `21c`, `21d` |
| R-F | `PATCH` nie przyjmuje maszyny - zmiana egzemplarza zakłada rezerwację od nowa i odwołuje starą, w tej kolejności | §5.1 |
| R-F | `GET /bookings/:id` i `takenAt` w ciele odmowy - dwa dopiski wymuszone przez ekrany | §5.1 |
| R-F | sonda stref odpowiedziana KODEM: aplikacja nie woła `Intl` ani razu | §6.1 |
| R-W | cudza zajętość niesie tylko to, co ekran z niej czyta | §17 |

Decyzje właściciela podjęte w trakcie (skrócone nazwisko na pasku osi, ponawianie co 60 s
bez przycisku, czternaście dób w pasku dni, zmiana maszyny przez odwołanie i założenie od
nowa, pełne pola tylko dla własnych rezerwacji) stoją w `CLAUDE.md` w sekcji epiku R-F -
tam, gdzie szuka ich kod, a nie plan.
