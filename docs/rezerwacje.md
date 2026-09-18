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
- ścieżka akceptacji klubu (lista kroków; krok wskazuje rolę albo imienną osobę),
- decyzje z powodem przy odrzuceniu i stany rezerwacji,
- skrzynka powiadomień w aplikacji (źródło prawdy, działa offline),
- push jako budzik (`expo-notifications` + FCM, nowy APK),
- zdolność `reservations.approve`.

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

### 2.2 Odczyt kalendarza działa bez sieci, zapis nie

Podział jest dokładnie ten z §4.8 (cache referencyjny):

- **odczyt** - telefon trzyma migawkę zajętości na najbliższe dni (cache SQLite,
  odświeżany przy okazji, ETag jak `/reference`). Kalendarz bez zasięgu pokazuje ostatnią
  znaną zajętość Z ADNOTACJĄ WIEKU („· z cache · sync 21 WRZ 17:30"). Pilot w hangarze
  bez zasięgu ma odpowiedź na „czy w sobotę coś stoi wolne";
- **zapis** - `POST`/`PATCH`/`DELETE` wymagają sieci. Bez niej przycisk niesie POWÓD
  WEWNĄTRZ SIEBIE (reguła issue #55 - powód blokady nigdy nie stoi pod przyciskiem):
  „Rezerwacja wymaga połączenia - slot potwierdza serwer".

**Cache kalendarza NIE jest rejestrem** i nie wolno go nim uczynić: przy migracji leci
`DROP` + `CREATE`, jak pięć tabel cache'u referencyjnego (SQLite 9). To materiał roboczy,
który wraca jednym zapytaniem.

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
                 ('pending', 'confirmed', 'rejected', 'cancelled', 'fulfilled')),
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
  ) WHERE (status IN ('pending', 'confirmed'));
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
Postgresa (Railway: standardowy obraz go ma - **do potwierdzenia na staging PRZED
wdrożeniem**, §14 R2). Plan awaryjny, gdyby rozszerzenia nie było: blokada doradcza
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

### 3.4 Tabele workflow i powiadomień (3.1.0, migracja 12)

```sql
-- Ścieżka akceptacji klubu: uporządkowane kroki. Brak wierszy = brak akceptacji.
CREATE TABLE approval_steps (
  org_id    TEXT NOT NULL REFERENCES organizations(id),
  step_no   INTEGER NOT NULL,
  label     TEXT NOT NULL,              -- np. „Mechanik", „Szef wyszkolenia"
  role      TEXT,                       -- rola klubu ALBO...
  pilot_id  TEXT REFERENCES pilots(id), -- ...konkretna osoba (§11.2)
  PRIMARY KEY (org_id, step_no),
  CONSTRAINT step_target CHECK ((role IS NULL) <> (pilot_id IS NULL))
);

-- Decyzje na rezerwacji - append-only, bo to zapis o tym, kto co postanowił.
CREATE TABLE booking_approvals (
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  step_no    INTEGER NOT NULL,
  decision   TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason     TEXT,                      -- WYMAGANY przy 'rejected' (§11.3)
  decided_by TEXT NOT NULL REFERENCES pilots(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, step_no)
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

## 5. API

### 5.1 Telefon (token klubu, brama członkostwa)

| Trasa | Znaczenie |
| --- | --- |
| `GET /bookings?from=&to=` | zajętość floty w oknie dat; ETag, bo kalendarz odpytuje często |
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

**Propozycja (do potwierdzenia, §15 P1):** kalendarz i formularz rezerwacji pokazują czas
w strefie KLUBU (`organizations.timezone`, domyślnie `Europe/Warsaw`); baza trzyma
`TIMESTAMPTZ`, czyli nadal chwilę bezwzględną. Log operacji, oś zdarzeń i karta arkusza
zostają w UTC bez zmian. Gdzie obie osie się spotykają (kafelek „Twoja rezerwacja
o 09:00"), godzina jest jawnie oznaczona.

**Ryzyko techniczne:** aplikacja nie używa dziś `Intl` ani żadnej biblioteki stref
(`packages/format` liczy wszystko sam na milisekundach). `Intl.DateTimeFormat` z opcją
`timeZone` na Hermes/Androidzie wymaga sprawdzenia NA URZĄDZENIU (dev build) - zadanie
w epiku R-A. Plan awaryjny bez `Intl`: serwer zwraca przy oknie kalendarza offset strefy
w minutach dla każdego dnia zakresu, a telefon tylko dodaje - reguł czasu letniego nie
musi wtedy znać nikt poza serwerem.

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

## 8. Uprawnienia

Katalog `Capability` nazywa ZASOBY (`server/src/domain/roles.ts`), a rezerwacja jest
zasobem, którego dotąd nie było - stąd nowe pozycje, nie doklejenie do istniejących:

- **`reservations.manage`** (3.0.0, rola `admin`) - odwołanie i zmiana CUDZEJ rezerwacji,
  wpisanie rezerwacji za pilota. Nie `fleet.manage`, bo tamta nazywa flotę i konfigurację
  maszyn, a tu chodzi o władzę nad cudzym planem;
- **wyłączenie maszyny z użytku idzie na `fleet.manage`** - to stan maszyny w czasie,
  czyli przedłużenie `service_status`, którym tamta zdolność już steruje (§3.1);
- **`reservations.approve`** (3.1.0, rola `admin`) - krok akceptacji;
- **rezerwuje KAŻDY aktywny członek klubu** - to nie jest zdolność panelu, tylko zwykła
  praca pilota, jak wpisanie lotu.

**Napięcie do rozwiązania w 3.1.0:** role klubu są dziś dwie (`pilot`, `admin`), a `admin`
ma wszystko - „szef wyszkolenia" został wycofany 2026-08-30 decyzją właściciela. Ścieżka
akceptacji z krokiem „szef wyszkolenia" nie ma więc na czym stanąć jako ROLA. Dlatego krok
ścieżki wskazuje **rolę ALBO imienną osobę** (§3.4), a osoba wskazana imiennie decyduje
o TEJ rezerwacji bez żadnej zdolności globalnej. Trzecia rola może wrócić później i model
jest na nią gotowy; do tego czasu kluby wskazują ludzi.

## 9. Aplikacja pilota

### 9.1 Nawigacja: trzy zakładki, kokpit nad nimi

Ekran startowy przestaje być „Mój dzień" (zgłoszenie #145). Propozycja: dolny pasek
zakładek (`@react-navigation/bottom-tabs` - czysty JS na `react-native-screens`, które już
jest, więc zmiana jedzie OTA):

| Zakładka | Treść |
| --- | --- |
| **Dziś** (start) | najbliższa MOJA rezerwacja z odliczaniem i „ROZPOCZNIJ LOT", dzisiejsze operacje, pasek zajętości floty na dziś, (3.1) rzeczy czekające na moją decyzję |
| **Kalendarz** | oś maszyn × czas, zakres dni, wejście w rezerwację i w nową rezerwację |
| **Loty** | dzisiejsze operacje i historia - dzisiejsze „Mój dzień" (01) i „Poprzednie dni" (12) scalone, bo od zawsze są tym samym kafelkiem (issue #42) |

**KOKPIT ZOSTAJE MODALNY I ZAKŁADEK W NIM NIE MA.** To jest reguła, której ta przebudowa
nie ma prawa naruszyć (CLAUDE.md „Kokpit jest stanem modalnym"): dopóki pilot trzyma
samolot, z kokpitu nie prowadzi żadna droga bokiem - ani zakładka, ani pasek. Flow lotu
(02 → 02e → 02a → kokpit → 09b) żyje w stosie NAD zakładkami, a `usePreventRemove` działa
jak dziś. Zakładka, która wyprowadza z kokpitu, to nie jest zmiana nawigacji, tylko
skasowanie modalności.

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
`20-dzis`, `21-kalendarz` (flota / jedna maszyna / stan pusty / offline z cache),
`22-rezerwacja` (dwa kroki + arkusz czasu z sugestiami slotów), `23-rezerwacja-szczegoly`
(z odwołaniem), `20a` - „Dziś" bez rezerwacji, `21a` - kolizja przy przejęciu.
W 3.1.0 dochodzą: `24-powiadomienia` (skrzynka), `25-decyzja` (zgoda/odmowa z powodem).

## 10. Panel: moduł „Kalendarz"

Piąta pozycja kolumny bocznej (`ui/shell/nav.ts`), po „Samolotach", na `panel.access`.
Makiety wg `design/panel/SZABLON.html`, styl lekki (issue #107), arkusz `panel.css`
generowany (`npm run panel:css`):

- `kalendarz-flota` - oś maszyn × dni, zakres dat, zajętości jako paski (rezerwacja
  w tonie neutralnym, wyłączenie z użytku bursztynowe);
- `kalendarz-wpis` - szuflada jednej zajętości: kto, co, kiedy, notatka, odwołanie
  z powodem; dla wyłączenia - powód serwisowy;
- `kalendarz-blokada` - wpisanie wyłączenia z użytku (maszyna, zakres, powód, komentarz);
- (3.1) `kalendarz-sciezka` - kroki akceptacji klubu, `kalendarz-kolejka` - co czeka na
  decyzję.

Panel NIE pokazuje sugestii slotów: to narzędzie pilota szukającego miejsca dla siebie,
a administrator patrzy na całość i wpisuje konkretny termin.

## 11. Workflow akceptacji (3.1.0)

### 11.1 Klub bez ścieżki nie klika w nic

Brak wierszy w `approval_steps` znaczy „rezerwacja potwierdzona od razu" - i to jest stan
domyślny każdego nowego klubu. Wymóg akceptacji jest decyzją klubu, nie podatkiem
nakładanym przez narzędzie.

### 11.2 Kroki idą PO KOLEI

Ścieżka to lista uporządkowana: krok 2 pyta dopiero po zgodzie kroku 1. Powody: opisuje
prawdziwy porządek („najpierw mechanik zwalnia maszynę, potem szef wyszkolenia zgadza się
na lot"), budzi jedną osobę naraz zamiast wszystkich, a przy odmowie na kroku 1 nikt
dalszy nie jest fatygowany. (Do potwierdzenia - §15 P3.)

### 11.3 Odmowa wymaga powodu, zgoda nie

Powód jest w `booking_approvals.reason` WYMAGANY przy `rejected` - pilot czyta go na
telefonie, tak jak czyta powód odrzucenia zgłoszenia do klubu na ekranie 00D. Precedens
jest wprost: „powód odrzucenia jest w panelu WYMAGANY, bo pilot czyta go na ekranie"
(`docs/logowanie-google.md`). Pierwsza odmowa kończy sprawę - rezerwacja przechodzi
w `rejected` i zwalnia slot.

### 11.4 Decyzja jest zapisem, nie polem

`booking_approvals` jest append-only: kto, kiedy, co postanowił i dlaczego. Zmiana zdania
znaczy nową rezerwację, nie nadpisanie decyzji.

## 12. Powiadomienia (3.1.0)

### 12.1 Skrzynka jest źródłem prawdy, push tylko budzikiem

**Decyzja właściciela 2026-09-18.** Push bywa niedostarczony, wyłączony w ustawieniach
systemu albo odrzucony na Androidzie 13+ (`POST_NOTIFICATIONS`) - a prośba o zgodę, która
przepadła, znaczy pilota czekającego na odpowiedź, która nigdy nie przyszła. Dlatego:

- **skrzynka** (`notifications` + `GET /me/notifications`) jest kompletna, ma historię
  i działa offline z cache. Licznik nieprzeczytanych stoi przy zakładce „Dziś";
- **push** niesie tylko „masz coś w skrzynce" i otwiera właściwy ekran. Brak push nie gubi
  ani jednej informacji.

### 12.2 Token push żyje razem z sesją logowania

`push_tokens.session_id` z kasowaniem kaskadowym: zdalne wylogowanie z panelu (2.1.0,
`login_sessions`) gasi przy okazji powiadomienia na tamtym urządzeniu. Bez tego wspólny
tablet klubu wysyłałby powiadomienia pilota, który dawno oddał urządzenie koledze.

### 12.3 Port, nie zależność

`PushPort` + adapter `ExpoPush` (HTTP do Expo Push API przez `fetch`, zero zależności)
+ `LogPush` dla dev - dokładnie wzorzec `MailPort`/`Resend`/`LogMail` z 2.1.0. Zmienna
`PUSH_PROVIDER` (`expo` | `log`) i decyzja, czy jest WYMAGANA (przy poczcie jest, bo
„Nie pamiętam hasła", które po cichu nic nie wysyła, jest gorsze niż serwer, który nie
wstał - tu rachunek jest łagodniejszy, bo skrzynka działa bez push).

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
5. **R-E - aplikacja: nawigacja** (zakładki, ekran „Dziś", kokpit nadal modalny) - zależy
   tylko od makiet, więc może iść równolegle z R-B/R-D.
6. **R-F - aplikacja: kalendarz i rezerwacja** (cache SQLite 10, formularz, sugestie,
   wejście w lot z rezerwacji) - po R-B, R-C i R-E.
7. **R-W - wydanie 3.0.0**: podręcznik, changelog, migracja na staging, OTA (bez zmian
   natywnych `@react-navigation/bottom-tabs` jedzie aktualizacją).

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

- **P1 - strefa czasu kalendarza.** Propozycja: czas klubu (`organizations.timezone`,
  domyślnie `Europe/Warsaw`), rejestr bez zmian w UTC (§6).
- **P2 - okno dnia klubu.** Sugestie slotów potrzebują granic („od 06:00 do 21:00")
  - konfiguracja klubu czy stała w domenie? Propozycja: konfiguracja z domyślną wartością,
  bo aeroklub podhalański i nadmorski mają inne doby lotne.
- **P3 - kroki akceptacji po kolei czy równolegle** (§11.2). Propozycja: po kolei.
- **P4 - kto może odwołać cudzą rezerwację** poza administratorem - czy właściciel
  maszyny/klubu ma jakąkolwiek dodatkową drogę? Propozycja: nie, `reservations.manage`
  i tyle.
- **P5 - rezerwacja, z której nikt nie poleciał** („no-show") - zostawiamy bez stanu,
  czy klub chce to widzieć? Propozycja: 3.0.0 bez tego; wraca, gdy klub poprosi.
- ~~**P6 - zakres wobec terminu**~~ - **rozstrzygnięte 2026-09-18**: termin 3 października,
  zakres 3.0.0 bez zmian (§14 R1).
- **P7 - maksymalny horyzont rezerwacji** (ile dni w przód) i **limit na pilota** (ile
  otwartych naraz) - czy klub ma je ustawiać? Propozycja: 3.0.0 bez limitów; to reguła
  społeczna, a nie techniczna, dopóki klub nie pokaże, że jej potrzebuje.

## 16. Odrzucone warianty - nie wracać

| Wariant | Dlaczego odrzucony |
| --- | --- |
| **Rezerwacja jako zdarzenie rejestru** (`reservation_create` w outboksie) | §2.1 - konkurencja o zasób potrzebuje arbitra, a wysyłka z opóźnieniem cofa obietnicę po fakcie |
| **Rezerwacja wymagana do rozpoczęcia lotu** | Decyzja właściciela 2026-09-18 - łamie §4.1 pkt 1 (brak sieci nigdy nie blokuje pilota) i wywraca loty awaryjne |
| **Dwie tabele: `reservations` + `aircraft_blocks`** | §3.1 - wykluczenie nakładania musi objąć oba rodzaje naraz, a to działa tylko w obrębie jednej tabeli |
| **Sprawdzanie nakładania w kodzie aplikacji** | Dyscyplina zamiast niezmiennika; przy dwóch równoległych żądaniach po prostu nie działa |
| **Jeden akceptujący („dyżurny")** | Decyzja właściciela 2026-09-18 - odwracałoby zdanie ze zgłoszenia „kilka osób musi się zgodzić" |
| **Akceptacja warunkowa (reguły typu „pilot poniżej X godzin")** | Rozważona i odłożona: wymaga katalogu warunków, którego klub jeszcze nie umie nazwać. Wraca, gdy poprosi |
| **Tylko push, bez skrzynki** | §12.1 - powiadomienie, które nie doszło, znaczy prośbę o zgodę wiszącą bez odpowiedzi |
| **Tylko e-mail zamiast skrzynki** | Rozważone (poczta działa od 2.1.0); e-mail w hangarze bywa czytany z opóźnieniem, a historia decyzji ma być w aplikacji |
| **Kalendarz w UTC** | §6 - rezerwacja jest umową o godzinie, a nie pomiarem; dwa razy w roku przesuwałby siatkę dnia |
