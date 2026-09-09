# UZ Aero - wielofirmowość (decyzje)

Dokument decyzji dla milestone **„Wielofirmowość + SaaS 2.0.0"** (epik A, issue #97).
Wzorzec: `docs/logowanie-google.md` - najpierw to, czego zmiana NIE dotyka, potem model
danych, potem przepływy per powierzchnia, na końcu ryzyka i etapy.

Cel w jednym zdaniu: **jeden serwer obsługuje wiele klubów, superadministrator zakłada
kluby, a między klubami nie wycieka nic** - ani flota, ani piloci, ani dziennik, ani
karta arkusza.

Decyzje właściciela z 2026-09-08 (siedem punktów w issue #97) są tu utrwalone jako
DANE, nie jako propozycje. Propozycje tego dokumentu są oznaczone „**propozycja**" -
każda z nich wymaga potwierdzenia przed epikiem, w którym się materializuje.
**Decyzja 6 (drogi dołączenia) została ZMIENIONA 2026-09-09**: zostaje JEDNA droga,
kod klubu z zatwierdzeniem - §3.8 mówi, jak to działa, §15 - co odrzucono i dlaczego.

---

## 1. Zmiana w dwóch zdaniach

Klub staje się bytem w bazie (`organizations`), a każda rzecz, która dziś należy do
„klubu domyślnego", dostaje jawną przynależność. Pilot pozostaje jedną osobą globalnie,
ale to, KIM jest w klubie - kod pilota, rola, aktywność - przenosi się z konta na
członkostwo, więc ten sam człowiek może latać w dwóch klubach pod dwoma kodami.

## 2. Czego ta zmiana NIE dotyka

- **Rejestr zdarzeń, projekcje, detekcja, analityka zużycia** - arytmetyka bez zmian.
  Zdarzenie dostaje `org_id`, ale żadna reguła domeny go nie czyta: reguły pytają
  o operację, maszynę i pilota, a te trzy rzeczy są już w obrębie jednego klubu z mocy
  modelu (§3.5).
- **Sygnatura operacji** `SP-AXA/2026-09-01/AKO/1` - ten sam kształt. Kod pilota
  w sygnaturze to kod Z CZŁONKOSTWA w klubie, do którego należy maszyna (§3.6).
- **Logowanie Google, token rejestracyjny, PIN, offline-first** - Google dalej
  potwierdza tożsamość, PIN dalej odblokowuje lokalnie. Zmienia się wyłącznie to, co
  dzieje się MIĘDZY zweryfikowaną tożsamością a wejściem do aplikacji: zamiast
  „zgłoszenie do klubu" jest „członkostwo w klubie" (§5).
- **Karta arkusza, eksport** - format bez zmian. Zmienia się adresowanie (§3.7).
- **Panel 2.0: Dziennik, Samoloty, Zgłoszenia** - te moduły nie zmieniają ani jednego
  ekranu. Zmienia się to, CO widzą (jeden klub) i moduł Piloci (§8).

## 3. Model danych

### 3.1 `organizations` - klub jako tenant

```sql
CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,            -- uuid
  name        TEXT NOT NULL,               -- „Aeroklub Zielonogórski"
  slug        TEXT NOT NULL UNIQUE,        -- „aeroklub-zielonogorski": adres kart arkusza (§3.7)
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  join_code   TEXT UNIQUE,                 -- kod klubu (§3.8); NULL = dołączanie kodem wyłączone
  join_code_since TIMESTAMPTZ,             -- od kiedy obowiązuje bieżący kod
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT REFERENCES pilots(id)   -- superadministrator
);
```

`slug` jest jedynym publicznym identyfikatorem klubu (adres arkusza), nadawany raz przy
założeniu. Zmiana nazwy klubu nie zmienia sluga - nazwa jest napisem, slug adresem.

### 3.2 `memberships` - kim pilot jest W TYM klubie

```sql
CREATE TABLE memberships (
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  pilot_id    TEXT NOT NULL REFERENCES pilots(id),
  code        TEXT,                        -- kod pilota W TYM klubie; NULL tylko przy 'pending'
  role        TEXT NOT NULL DEFAULT 'pilot' CHECK (role IN ('pilot', 'admin')),
  status      TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled', 'rejected')),
  reject_reason TEXT,                      -- widoczny dla pilota na 00D
  joined_via  TEXT NOT NULL CHECK (joined_via IN ('code', 'platform', 'backfill')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ,
  decided_by  TEXT REFERENCES pilots(id),
  credentials_valid_from TIMESTAMPTZ,      -- unieważnienie poświadczeń PER KLUB (§3.4)
  PRIMARY KEY (org_id, pilot_id),
  CONSTRAINT membership_active_has_code
    CHECK (status <> 'active' OR code IS NOT NULL)
);
CREATE UNIQUE INDEX idx_memberships_code ON memberships (org_id, code) WHERE code IS NOT NULL;
```

Z `pilots` **znikają `code` i `role`** (decyzja 2). Zostają: `id`, `name`, `email`,
`theme`, `theme_updated_at`, `platform_role` (§3.3), `active` w znaczeniu
PLATFORMOWYM (blokada osoby na całym serwerze - używa jej wyłącznie
superadministrator; codzienne „wyłącz konto" w panelu klubu jest `memberships.status
= 'disabled'`).

`CHECK membership_active_has_code` jest odpowiednikiem `identity_linked_has_pilot`
z logowania Google: **aktywny ⟺ ma kod**. Kod jest tym, czym pilot podpisuje operacje
i bez niego nie da się złożyć sygnatury ani karty arkusza, więc członkostwo bez kodu
nie ma prawa być aktywne - a pilot z kodem, ale `pending`, nie ma prawa nic zapisać.

Status `rejected` zostaje w wierszu jak przy zgłoszeniu rejestracyjnym: decyzja
zapadła, drugie zgłoszenie tym samym kodem klubu trafia na tę samą odpowiedź.
Administrator może ją cofnąć (`rejected → pending` albo wprost `active` z kodem).

### 3.3 Superadministrator = `pilots.platform_role`, bez klubu

```sql
ALTER TABLE pilots ADD COLUMN platform_role TEXT CHECK (platform_role IN ('superadmin'));
```

Superadministrator jest OSOBĄ bez ani jednego członkostwa (decyzja 3) - zakłada
kluby i pierwszych administratorów, i to wszystko. **Nie wchodzi do danych klubu**
(**propozycja**): panel klubu wymaga członkostwa `admin`, a superadministrator go nie
ma. Gdy operator ma pomóc klubowi w dzienniku, administrator klubu dodaje go jako
członka - jawnie, z audytem. Bez tej reguły „nic nie wycieka między klubami" miałoby
wyjątek wpisany w rolę, a wyjątek w roli jest niewidoczny dla klubu.

`seed` zakłada superadministratora z `SEED_ADMIN_EMAIL` (jak dziś admina) i JEDEN klub
z `SEED_ORG_NAME` **wyłącznie na bazie deweloperskiej** - produkcja dostaje klub
z migracji (§10).

### 3.4 Unieważnienie poświadczeń: per klub i per osoba

`pilots.credentials_valid_from` zostaje (deaktywacja OSOBY przez superadministratora)
i dochodzi `memberships.credentials_valid_from` (wyłączenie CZŁONKOSTWA przez
administratora klubu). Brama sprawdza OBIE daty: token starszy niż którakolwiek z nich
jest odrzucony. Bez daty na członkostwie wyłączenie w klubie A wylogowywałoby pilota
także z klubu B - albo, gorzej, nie wylogowywałoby z A, bo token wydany przed
wyłączeniem dalej byłby ważny.

### 3.5 `org_id` DENORMALIZOWANY na tabelach zależnych

`org_id NOT NULL REFERENCES organizations(id)` dochodzi do: `aircraft`, `events`,
`sessions`, `flags`, `export_log`, `exported_sheets`, `aircraft_readings`,
`aircraft_consumption`, `admin_audit`, `bug_reports`, `refresh_tokens` (refresh niesie
klub, dla którego wydano tokeny - klub jest w tokenie, §6).

**Dlaczego denormalizacja, a nie złączenie przez `aircraft`.** Każda trasa panelu
i większość tras telefonu filtruje po klubie; złączenie `events → sessions → aircraft
→ org` przy każdym odczycie to koszt w każdym zapytaniu i - ważniejsze - miejsce,
w którym jedno przeoczone złączenie otwiera cudze dane. Kolumna na wierszu pozwala
napisać filtr jako `WHERE org_id = $1` W KAŻDYM zapytaniu bez wyjątku i sprawdzić
to mechanicznie (§12: test izolacji, epik C).

**Niezmiennik (egzekwowany przy zapisie, nie CHECK-iem):** `events.org_id =
sessions.org_id = aircraft.org_id` dla jednej operacji, a pilot zdarzenia ma aktywne
członkostwo w tym `org_id` w chwili zapisu. Ingest odrzuca zdarzenie, którego
`org_id` (z nagłówka §6) nie zgadza się z klubem maszyny - to jedyna nowa odmowa
w ingeście i jest twarda: zapis do cudzego klubu nie ma miękkiej wersji.

### 3.6 Unikaty: co jest jedyne w klubie, co na serwerze

| dziś (globalnie) | po zmianie |
|---|---|
| `pilots.code UNIQUE` | `memberships (org_id, code)` - kod jedyny W KLUBIE; ta sama osoba może mieć `TMK` w jednym klubie i `TOM` w drugim |
| `pilots.email UNIQUE` | bez zmian - osoba jest jedna na serwerze; e-mail to adres Google z pierwszego logowania albo wpisany przez superadministratora dla pierwszego administratora klubu (§3.8) |
| `aircraft.reg UNIQUE` | `aircraft (org_id, reg)` - maszyna należy do JEDNEGO klubu; ta sama rejestracja w dwóch klubach jest dopuszczalna (maszyna sprzedana, przerejestrowana - historia zostaje u starego właściciela) |
| `exported_sheets.tab UNIQUE` | `exported_sheets (org_id, tab)` |

**Sygnatura zostaje jednoznaczna w klubie i tylko tam** - i to wystarcza, bo sygnaturą
posługuje się klub (dziennik, karta arkusza, zgłoszenie). Serwer liczy numer w sygnaturze
tym samym SQL-em co dziś, z dodatkowym `org_id` w partycji. Test krzyżowy
`operationSignature.test.ts` dostaje przypadek: ten sam pilot, ta sama doba, dwa kluby -
dwa niezależne numerowania.

### 3.7 Karta arkusza: adres z klubem

`GET /sheets/:tab` jest dziś publiczne po samej nazwie karty - `SP-AXA 2026-09-06`
z dowolnego klubu odpowiedziałoby każdemu, kto zgadnie nazwę. Po zmianie:
**`GET /sheets/:orgSlug/:tab`** i - **propozycja** - adres z tokenem odczytu
generowanym w panelu (`organizations.sheets_token`), bez którego trasa odpowiada 404.
Dziś nazwy kart są zgadywalne (znak + data), więc publiczność „po nazwie" była
akceptowalna przy jednym klubie i przestaje być przy wielu. Decyzja o tokenie wchodzi
do epiku C razem z testem izolacji.

### 3.8 Kod klubu - JEDNA droga dołączenia (decyzja 2026-09-09, zmienia decyzję 6)

Pierwotna decyzja 6 z 2026-09-08 przewidywała trzy drogi (adres e-mail wpisany przez
administratora, jednorazowy link osobisty, wielorazowy kod klubu) i tabelę
`invitations`. **2026-09-09 właściciel zostawił JEDNĄ: kod klubu.** Historia
i odrzucone alternatywy: §15.

```sql
-- kolumny na organizations (§3.1):
join_code       TEXT UNIQUE,      -- jawny tekst, jedyny na serwerze; NULL = dołączanie wyłączone
join_code_since TIMESTAMPTZ       -- od kiedy obowiązuje bieżący kod
```

Tabeli `invitations` NIE MA: jeden kod na klub jest kolumną klubu, a historia dołączeń
mieszka w `memberships` (`joined_via = 'code'`, `created_at`, `decided_at`, `decided_by`).

Reguły:

- **Klub ma najwyżej jeden żywy kod.** „Wygeneruj nowy" nadpisuje go od razu; stary
  przestaje działać w tej samej chwili. Zgłoszeń już złożonych to nie dotyka - są
  wierszami `memberships`, nie kodem.
- **Kod jest krótki i czytelny przez telefon** (rozstrzygnięte 2026-09-09): 7 symboli
  z alfabetu 32 znaków (litery bez `O` i `I`, cyfry bez `0` i `1`), zapisywane jako
  `XXX-XXXX`, np. `AZG-7K4M`. Myślnik i wielkość liter są ZAPISEM, nie treścią: serwer
  przyjmuje `azg7k4m` tak samo jak `AZG-7K4M`, a 00E pokazuje wpis w zapisie kanonicznym.
  Wpisuje się go z klawiatury, więc długość jest granicą wygody, nie bezpieczeństwa -
  32⁷ ≈ 3,4·10¹⁰ kombinacji przy ograniczeniu tempa niżej wystarcza z zapasem.
- **Kod stoi w bazie jawnym tekstem, nie hashem**: administrator musi go ODCZYTAĆ
  z panelu, żeby podać pilotom, a sam kod nie daje dostępu (niżej). Hash chroniłby
  sekret, którego tu nie ma.
- **Kod jest jedyny na SERWERZE** (`UNIQUE`), bo pilot wpisuje sam kod, bez nazwy
  klubu. Zderzenie przy generowaniu = losuj ponownie.
- **Kod daje WYŁĄCZNIE członkostwo `pending`.** Wejście do klubu jest zawsze decyzją
  administratora klubu: zatwierdzenie z nadaniem kodu pilota i roli (P3) albo
  odrzucenie z powodem, który pilot czyta na 00D. Człowiek decyduje PRZED wejściem,
  nie po - to główna przewaga tej drogi nad linkiem, który wpuszczał od razu
  i zostawiał administratorowi naprawę wyłączeniem członkostwa.
- **Zgłoszenie `pending` nie wygasa samo** (decyzja właściciela 2026-09-09): kończy
  je wyłącznie decyzja. Kolejka bez decyzji to sprawa klubu, nie serwera.
- **Administrator klubu może wyłączyć dołączanie kodem** (decyzja właściciela
  2026-09-09): kasuje kod (`join_code = NULL`), a serwer odpowiada na każdy kod tego
  klubu „nie znam takiego kodu" - tak samo jak na kod zmyślony, bo klub wyłączony nie
  ma powodu się ujawniać. Ponowne „Wygeneruj" włącza drogę z powrotem. Do tego czasu
  do klubu nie dołączy nikt, bo innej drogi nie ma.
- **Wyciek kodu jest tani i przewidziany**: kod wisi w hangarze i krąży po grupach,
  więc wycieknie. Skutkiem jest najwyżej zgłoszenie do rozpatrzenia, a `POST /auth/join`
  ma ograniczenie tempa (rozstrzygnięte 2026-09-09): **10 prób na osobę i 30 prób na
  adres IP w oknie 15 minut**, udane i nieudane razem; przekroczenie → `429` z czasem
  odczekania. Zgadywanie kodu kończy się więc najwyżej zgłoszeniem, a pilot, który
  pomyli się kilka razy, nie zostaje odcięty.
- **Pierwszego administratora klubu dodaje SUPERADMINISTRATOR** (decyzja właściciela
  2026-09-09), nie kod: kodem nie miałby go kto zatwierdzić. Przy zakładaniu klubu
  (§8.1) superadministrator podaje adres konta Google, imię i nazwisko oraz kod
  pilota; powstaje osoba (albo dopisuje się do istniejącej po adresie) i członkostwo
  `admin` `active` z `joined_via = 'platform'`, a tożsamość Google podpina się przy
  pierwszym logowaniu tym adresem - dokładnie mechanizm z `docs/logowanie-google.md`
  §6 (`claimByVerifiedEmail`), ten sam, którym wchodzi superadministrator
  z `SEED_ADMIN_EMAIL`. To wyjątek klasy bootstrap, nie druga droga: z panelu KLUBU
  nikogo nie da się dopisać adresem, a `POST /admin/api/pilots` (osoba z adresem
  + członkostwo) przechodzi w całości do modułu Organizacje.

## 4. Bramką jest BRAK CZŁONKOSTWA - ta sama zasada, jedno piętro wyżej

`docs/logowanie-google.md` §4: „bramką jest brak konta, nie rola". Ta zasada zostaje
i dostaje drugie piętro. Osoba bez członkostwa w żadnym klubie ma wiersz w `pilots`
(powstaje przy pierwszym logowaniu Googlem - inaczej nie ma komu przypisać zgłoszenia),
ale **nie ma tokenów pilota do żadnego klubu**: `authorize()` dla trasy klubowej pyta
o aktywne członkostwo w klubie z żądania (§6) i odmawia bez niego. Jedna brama, jedno
miejsce, test izolacji na każdej trasie (epik C).

**Konsekwencja dla `external_identities`:** statusy `pending` / `rejected` znikają
z tej tabeli - tożsamość Google jest albo nieznana, albo `linked` do osoby. Oczekiwanie
i odrzucenie przenoszą się na `memberships.status`, bo dotyczą KLUBU, nie tożsamości:
ta sama osoba może czekać w jednym klubie i być odrzucona w drugim. Token rejestracyjny
(§5 logowania Google) zostaje jako **token osoby bez klubu**: `purpose: 'registration'`
→ `purpose: 'person'`, przyjmowany przez trasy `GET /auth/memberships` (stan zgłoszeń)
i `POST /auth/join` (kod klubu). Rozłączność `verify()` / `verifyPerson()` zostaje
z tym samym testem w obie strony.

## 5. Przepływ logowania i dołączania

`POST /auth/google { idToken }` → weryfikacja jak dziś → osoba (`pilots`) istnieje albo
powstaje → **podpięcie po zweryfikowanym adresie** (jak dziś, `docs/logowanie-google.md`
§6 - obsługuje superadministratora z `SEED_ADMIN_EMAIL` i pierwszego administratora
klubu wpisanego przez superadministratora, §3.8) → decyzja po członkostwach:

| stan osoby | odpowiedź |
|---|---|
| ≥1 członkostwo `active` | `200` + tokeny pilota; **aktywny klub = ostatnio używany** (`refresh_tokens.org_id`), inaczej jedyny / pierwszy alfabetycznie |
| brak `active`, ≥1 `pending` | `202` + token osoby; aplikacja: **00C** z nazwą klubu |
| brak `active`, ostatnie zgłoszenie `rejected` | `202` + token osoby; aplikacja: **00D** z powodem i klubem; wyjście: „DOŁĄCZ INNYM KODEM" (00E) |
| brak członkostw | `202` + token osoby; aplikacja: **00E** „nie należysz do żadnego klubu" |
| osoba wyłączona platformowo | `401 account_disabled` |

`POST /auth/join { code }` (token osoby albo token dowolnego klubu - pilot z klubu A
dołącza do B z ustawień, 13A):

- kod pasuje do klubu z żywym kodem → członkostwo `pending` (`joined_via = 'code'`),
  odpowiedź `202` → 00C. Osoba z członkostwem `pending` w tym klubie dostaje to samo
  `202` bez drugiego wiersza (klucz `(org_id, pilot_id)`);
- osoba z członkostwem `rejected` w tym klubie → `403` z powodem: ponowne zgłoszenie
  nie obchodzi decyzji, cofnąć ją może wyłącznie administrator klubu (P3);
- osoba z członkostwem `active` albo `disabled` w tym klubie → `409` „już jesteś
  w tym klubie" / „członkostwo wyłączone - skontaktuj się z administratorem";
- kod nieznany ALBO klub z wyłączonym dołączaniem ALBO klub nieaktywny → `404`
  „Nie znam takiego kodu" - jedna odpowiedź na trzy stany, bo żaden z nich nie ma
  powodu się ujawniać;
- ograniczenie tempa: 10 prób na osobę i 30 na adres IP w 15 minut (§3.8); przekroczenie
  → `429` z czasem odczekania, który aplikacja pisze jako powód w przycisku.

Stan zgłoszenia odpytuje `GET /auth/memberships` (token osoby): 00C sprawdza go sam
co kilkanaście sekund i pod „SPRAWDŹ PONOWNIE"; po zatwierdzeniu trasa wydaje tokeny
klubu DOKŁADNIE RAZ i odmawia tokenowi starszemu niż `credentials_valid_from` - te
same reguły, które audyt 2026-09-05 nałożył na `GET /auth/registration`
(`docs/logowanie-google.md` §14).

Kod klubu jest **krótki i czytelny przez telefon** (§3.8), bo wpisuje się go z ekranu
00E z klawiatury. 00E przyjmuje wyłącznie kod - pola na link nie ma, bo linku nie ma.

## 6. Klub w TOKENIE; przełączenie i dołączenie wymagają sieci

**Token pilota niesie osobę I klub**: `sub`, `org`, a z członkostwa w tym klubie `code`
i `role` (jak dziś `code`). Serwer przy każdym żądaniu trasy klubowej sprawdza, że
członkostwo `(org, sub)` jest `active` i że token nie jest starszy niż żadna z dwóch
dat unieważnienia (§3.4) - to samo, co dziś robi z `credentials_valid_from`.
`refresh_tokens` niosą `org_id`: para tokenów jest parą DLA KLUBU.

**Przełączenie klubu = nowa para tokenów** (`POST /auth/switch { orgId }` na refreshu)
i **wymaga sieci** - decyzja właściciela (2026-09-08): reguła offline-first dotyczy
PRACY w klubie, a nie zmiany klubu ani dołączenia do klubu. Pilot pracuje bez zasięgu
w klubie, w którym już jest; przełącza się tam, gdzie ma sieć. Ta sama kategoria, co
pierwsze logowanie i wylogowanie (§4.1: akcje wymagające sieci - zablokowane
z podanym powodem, nigdy cichy błąd). Alternatywa z klubem w nagłówku żądania
(przełączanie offline) była rozważona i ODRZUCONA: kupowała offline tam, gdzie nikt
o niego nie prosi, kosztem sprawdzania członkostwa przy każdym żądaniu i drugiego
źródła prawdy o klubie obok tokenu.

**Przełączenie wymaga też PUSTEJ kolejki wysyłki** - jak wylogowanie: zapisy w outboksie
należą do klubu, dla którego wydano bieżący token, a serwer przyjmuje zdarzenia
wyłącznie w klubie z tokenu (§3.5). Blokada z powodem na 13A („najpierw wyślij
n zapisów").

Trasy BEZ klubu (działają z tokenem osoby albo z tokenem dowolnego klubu):
`POST /auth/google`, `/auth/refresh`, `POST /auth/switch`, `GET /auth/memberships`,
`POST /auth/join`, `PUT /me/prefs` (motyw jest własnością osoby), `GET /me/events`
(dosyłka **wszystkich** klubów - §7), `POST /me/bug-reports` (zgłoszenie niesie
`org_id` w kontekście, bo dotyczy ekranu w konkretnym klubie). Trasy panelu: klub
z sesji panelu (§8.2) - ten sam model, co w telefonie.

## 7. Telefon: jeden aktywny klub, wszystkie operacje na liście

Decyzja 4 w trzech regułach:

1. **Aktywny klub jest kontekstem FLOTY I PRZEJĘCIA**: `/reference` (flota, piloci,
   przekazania, normy) pobiera się dla aktywnego klubu i trzyma w cache z `org_id`;
   ekran 02 pokazuje flotę aktywnego klubu; nowa operacja dostaje `org_id` aktywnego
   klubu i tak jedzie do outboxa. Cache referencyjny jest KLUCZOWANY klubem - przełączenie
   nie kasuje danych drugiego klubu, więc powrót do niego działa offline.
2. **„Mój dzień" i historia pokazują WSZYSTKIE operacje pilota** - lokalny rejestr
   zdarzeń niesie `org_id`, a projekcja dnia pilota go nie filtruje. Kafelek operacji
   dostaje plakietkę z nazwą klubu **wyłącznie przy więcej niż jednym członkostwie**
   (mockup `01e`): przy jednym plakietka świeciłaby przy każdym kafelku i niczego nie
   odróżniała (reguła SyncChipa z issue #12). Sumy doby są sumą wszystkiego - doba
   pilota nie zna klubów.
3. **Przełącznik w Ustawieniach (13) istnieje wyłącznie przy >1 członkostwie**
   (mockup `13a`): lista kart z nazwą klubu i kodem pilota w nim, wybrana zielona.
   **Wymaga sieci i pustej kolejki wysyłki** (§6) - bez tego karty są zablokowane
   z powodem pod sekcją, jak wylogowanie. Przełączyć klubu nie da się z kokpitu -
   kokpit jest modalny, a operacja należy do klubu, w którym ją zaczęto; ustawienia
   są dostępne tylko z 01. Cache referencyjny drugiego klubu ZOSTAJE w pamięci, więc
   po przełączeniu ekran 02 ma flotę od razu, a świeżą pobiera przy tym samym
   połączeniu, które wydało tokeny.

**Ekran 00E** („nie należysz do żadnego klubu") to trzeci stan tej samej rodziny,
co 00C i 00D: pole na kod klubu, „DOŁĄCZ", wyjście „Zaloguj innym kontem Google".
**Ma prawo tłumaczyć** (kategoria z issue #72: blokada z powodem): pilot nie może
dalej i musi wiedzieć, skąd wziąć kod - od administratora klubu. Nie ma na nim
natomiast ani słowa o tym, jak zbudowana jest kolejka zgłoszeń. **Dołączenie wymaga
sieci** (decyzja właściciela, 2026-09-08) - jak cała rodzina 00A–00D, która i tak
istnieje wyłącznie po zalogowaniu Googlem; bez zasięgu „DOŁĄCZ" jest zablokowane
z powodem w przycisku. To samo pole, pod „Dołącz do innego klubu", stoi w sekcji Klub
na 13A - dla pilota, który już lata w jednym klubie i do czasu zatwierdzenia pracuje
w nim dalej.

**Deep linku dołączania NIE MA** (zmiana 2026-09-09, §15): kod przepisuje się z ręki,
więc aplikacja nie przechwytuje żadnego adresu, strona `dolacz/` nie istnieje (§9),
a schemat `ninerdeck` w `app.json` służy wyłącznie powrotowi z logowania Google
(epik R).

## 8. Panel

### 8.1 Superadministrator: moduł `#/organizacje` (mockupy `organizacje-lista`, `organizacje-klub`)

Osobna rama: kolumna boczna z JEDNĄ pozycją „Organizacje" i kaflem zakresu
(`.sidebar-context.scope`) zamiast kontekstu klubu (styl lekki, issue #107).
Lista klubów (nazwa, slug, liczba członków, liczba maszyn, stan), „Załóż klub"
= szuflada: nazwa, slug (podpowiedziany z nazwy), **pierwszy administrator** (adres
konta Google + imię i nazwisko + kod pilota w klubie) - klub bez administratora nie
ma jak zacząć, więc pole jest wymagane. Powstaje osoba (albo dopisuje się do
istniejącej po adresie) i członkostwo `admin` `active` (`joined_via = 'platform'`);
tożsamość Google podpina się przy pierwszym logowaniu tym adresem (§3.8). Kod klubu
generuje się przy założeniu klubu, żeby pierwszy administrator miał od razu co podać
pilotom. **Superadministrator widzi kod klubu na karcie klubu DO ODCZYTU** (rozstrzygnięte
2026-09-09): kod jest KONFIGURACJĄ klubu, jak nazwa i slug, a nie jego danymi (§3.3 mówi
o dzienniku, flocie i pilotach) - bez tego nie miałby go jak przekazać pierwszemu
administratorowi razem z dostępem. Nie generuje go i nie wyłącza: to należy do panelu
klubu (§8.3). Makieta `organizacje-klub` przebudowana 2026-09-09.
Wyłączenie klubu = `organizations.active =
false`: logowanie do jego panelu i trasy klubowe odpowiadają `403 org_disabled`;
danych nie kasujemy (dziennik jest dokumentem klubu, jak przy koncie z historią).

Zdolność: **`platform.manage`** - nowa, bo katalog `Capability` nazywa zasoby,
a „kluby" są zasobem, którego dziś nie ma. Wynika z `platform_role`, nie z roli
członkostwa; superadministrator nie ma `panel.access` do żadnego klubu (§3.3).

### 8.2 Wybór klubu po zalogowaniu (mockup `00a-wybor-klubu`)

Sesja panelu (ciasteczko, JWT 8 h) niesie `org` - klub jest w SESJI, nie w nagłówku,
bo panel nie ma trybu offline i jedno okno pracuje w jednym klubie (adres `#/dziennik`
ma znaczyć to samo przez całą sesję). Administrator z JEDNYM członkostwem `admin`
wchodzi od razu; z kilkoma - dostaje ekran wyboru (lista kart, jak każdy wybór w tym
produkcie), a nazwa klubu stoi odtąd w pasku górnym obok znaku, z przełącznikiem
„Zmień klub" (nowa sesja, ten sam token Google w tle - bez ponownego logowania).
Superadministrator z członkostwami `admin` też wybiera: „Organizacje" jest na tej liście
pierwszą kartą.

### 8.3 Moduł Piloci: członkowie, zgłoszenia i kod klubu (mockupy `piloci-lista`, `piloci-zgloszenie`, `piloci-kod-klubu`)

- Lista = **członkowie klubu** (kod w klubie, imię i nazwisko osoby, e-mail Google,
  rola, status członkostwa). Karta konta (P2) edytuje CZŁONKOSTWO: kod, rolę, dostęp.
  Imię i nazwisko należą do osoby - panel je pokazuje, a poprawia tylko wtedy, gdy osoba
  nie ma innych członkostw (**propozycja**; inaczej klub A zmieniałby nazwisko widoczne
  w klubie B).
- **Nowy członek wchodzi WYŁĄCZNIE kodem klubu** (§3.8). Z panelu klubu nie da się
  nikogo dopisać adresem ani linkiem: „Dodaj pilota" z panelu 1.0 zniknęło już
  w epiku A, a szuflada „Zaproś do klubu" z trzema kartami (P4, P4a–c) kurczy się do
  JEDNEJ karty **„Kod klubu"**: kod dużym monospace, od kiedy obowiązuje, ile zgłoszeń
  nim czeka, „Wygeneruj nowy" i „Wyłącz dołączanie kodem" (kasuje kod; ta sama karta
  pokazuje wtedy stan wyłączony z „Wygeneruj kod"). Makieta `piloci-kod-klubu`
  (dawne `piloci-zaproszenie`, przebudowane 2026-09-09; stan wyłączony = P4a).
- Nad listą, wyłącznie gdy niepuste: karta **ZGŁOSZENIA** (członkostwa `pending`:
  imię i e-mail z Google, kiedy; „Rozpatrz" → P3, gdzie nadaje się kod i rolę;
  odrzucenie z powodem wymaganym, jak dziś). Karty ZAPROSZENIA nie ma - nie ma czego
  w niej pokazać.
- Zdolności: `accounts.manage` dla wszystkiego powyżej - to nadal „zakładanie kont",
  tylko klubowych. Audyt: `membership.approve`, `membership.reject`,
  `membership.disable`, `club_code.rotate`, `club_code.disable`.

## 9. Strona `dolacz/<token>` - USUNIĘTA Z PROJEKTU (2026-09-09)

Strona istniała dla linku osobistego (§15). Bez linku nie ma czego otwierać: pilot
przepisuje kod z ręki na 00E. Plik `site/src/dolacz/index.html` (epik A) jest do
skasowania w epiku D; trasa `GET /dolacz/*` w `staticSite.ts` NIE powstaje, więc reguła
„bez fallbacku SPA" zostaje bez wyjątku.

## 10. Migracja produkcji z backfillem (decyzja 5)

Baza produkcyjna ma od 1.0.0 dane JEDNEGO klubu i te dane zostają. Migracja 8 (epik B)
w jednej transakcji:

1. `organizations` + wiersz klubu z `SEED_ORG_NAME`/`SEED_ORG_SLUG` (zmienne
   WYMAGANE przy tej migracji - bez nazwy klubu runner odmawia startu, zamiast
   wymyślać „Klub 1");
2. `memberships` z **każdego** wiersza `pilots`: `code`, `role`, `status = active`
   (albo `disabled` dla `active = false`), `joined_via = 'backfill'`,
   `credentials_valid_from` przepisane;
3. `org_id` na tabelach z §3.5: `ADD COLUMN` nullowalny → `UPDATE … SET org_id = <klub>`
   → `SET NOT NULL` → indeksy z `org_id` na czele;
4. `external_identities` `pending` → `memberships` `pending` w tym klubie (z datami),
   `rejected` → `memberships` `rejected` z powodem; potem `DROP` statusów w tabeli
   tożsamości (zostaje sam `linked`);
5. zamiana unikatów (§3.6): `DROP CONSTRAINT` globalnych, `CREATE UNIQUE INDEX`
   z `org_id`;
6. `pilots`: `ADD platform_role`; `DROP COLUMN code, role` - **na końcu**, po
   przepisaniu do członkostw, i jako osobna migracja 9 (**propozycja**): między 8 a 9
   kod czyta OBIE kolumny, więc wdrożenie serwera z 8 na bazie z danymi nie ma okna,
   w którym sygnatura nie ma z czego się złożyć.

Superadministrator: `SEED_ADMIN_EMAIL` → jeśli osoba z tym e-mailem istnieje, dostaje
`platform_role` (i ZOSTAJE administratorem klubu - to jest dziś ta sama osoba);
inaczej powstaje z pustymi członkostwami.

**Procedura odwrotu**: kopia bazy przed migracją (Railway snapshot) - migracja 8
nie jest odwracalna skryptem, bo `DROP CONSTRAINT` globalnych unikatów kasuje
informację, której nie da się odtworzyć po dołożeniu drugiego klubu.

## 11. Telefon po aktualizacji: co z lokalnym rejestrem

Aplikacja 2.0.0 na telefonie z rejestrem 1.x: migracja SQLite dokłada `org_id` do
zdarzeń, cache referencyjnego i `bug_reports` i wypełnia go **klubem z pierwszego
odświeżenia tokenów** po aktualizacji (`/auth/refresh` na starym refreshu wydaje parę
dla jedynego klubu po backfillu). Do tego czasu outbox NIE WYSYŁA (stary token bez
`org` jest dla serwera 2.0.0 nieważny) - to trwa jedno połączenie, a pilot widzi
zwykłe „OFFLINE · n" na chipie.
Zmiana pakietu (`com.ninerdeck.app`) i tak wymusza nową instalację (epik R), więc
w praktyce rejestr odtwarza się z `GET /me/events` (§4.9 architektury) już z `org_id`;
migracja lokalna zostaje dla telefonów, które dostaną 2.0.0 aktualizacją OTA na
starym pakiecie - decyzja o tym w epiku W.

## 12. Ryzyka przyjęte świadomie

- **Test izolacji jest warunkiem wydania, nie dodatkiem** (epik C): każda trasa
  klubowa dostaje test „klub B nie widzi wiersza klubu A" - także `GET /sheets`,
  `readings-chain`, `consumption`, `track`, `bug-reports`. Trasa bez takiego testu
  nie wchodzi do 2.0.0.
- **Kod klubu jest wielorazowy i stały**, więc wycieknie prędzej czy później - dlatego
  daje wyłącznie `pending`, `POST /auth/join` ma ograniczenie tempa, a „Wygeneruj nowy"
  jest zawsze pod ręką. Klub, który nie chce tej drogi, kasuje kod - i do czasu
  wygenerowania nowego nikt do niego nie dołączy, bo innej drogi nie ma (§3.8).
- **Pilot czeka na administratora.** Jedyna droga do klubu kończy się decyzją
  człowieka, więc pilot bez zatwierdzenia nie poleci - także wtedy, gdy stoi już na
  lotnisku. To cena za „człowiek decyduje przed wejściem" (§3.8), przyjęta świadomie;
  zaproszenie e-mailem wpuszczające od razu jest możliwym rozszerzeniem po 2.0.0
  (§15), nie częścią tego wydania.
- **Sygnatura jednoznaczna tylko w klubie** (§3.6) - dwa kluby mogą mieć
  `SP-AXA/2026-09-01/AKO/1` naraz. Wszędzie, gdzie sygnatura opuszcza klub (zgłoszenie
  błędu w panelu superadministratora - dziś nie istnieje), musi iść z nazwą klubu.
- **Superadministrator nie widzi danych klubu** (§3.3) - operator, który ma pomóc,
  musi zostać dodany jako członek. To jest cena reguły „nic nie wycieka", zapłacona
  świadomie.
- **Osoba bez klubu ma wiersz w `pilots`** - lista osób rośnie z każdym, kto zalogował
  się Googlem i niczego nie dołączył. Superadministrator widzi ich liczbę w module
  Organizacje; sprzątanie (usunięcie osób bez członkostw starszych niż N dni) to
  zadanie na później, nie na 2.0.0.
- **Zmiana pakietu odcina OTA** od 1.1.0 - testerzy instalują 2.0.0 na nowo
  (epik R / W).

## 13. Co musi zrobić właściciel (poza kodem)

1. Nazwa i slug klubu produkcyjnego (`SEED_ORG_NAME`, `SEED_ORG_SLUG`) - PRZED
   wdrożeniem migracji 8; slug wchodzi do adresów kart arkusza.
2. Potwierdzenie propozycji z tego dokumentu (oznaczone „**propozycja**"): superadmin
   bez wstępu do danych klubu (§3.3), token odczytu kart arkusza (§3.7), zmiana nazwiska
   tylko przy jednym członkostwie (§8.3).
   **Rozstrzygnięte 2026-09-08**: klub W TOKENIE, przełączenie i dołączenie wymagają
   sieci (§6) - propozycja nagłówka `X-Org` odrzucona; migracja 9 nie istnieje (§14 B).
   **Rozstrzygnięte 2026-09-09**: jedna droga dołączenia (§3.8, §15) - pierwszego
   administratora klubu dodaje superadministrator, zgłoszenie `pending` kończy
   wyłącznie decyzja, administrator klubu może wyłączyć dołączanie kodem; przy przebudowie
   makiet tego samego dnia: kształt kodu `XXX-XXXX` z alfabetu 32 symboli, limity tempa
   10/osoba i 30/adres na 15 minut, superadministrator widzi kod klubu do odczytu (§3.8, §8.1).
3. Kopia bazy produkcyjnej przed migracją 8 (§10).
4. Google Cloud: nowy klient Android dla pakietu `com.ninerdeck.app` z DWOMA odciskami
   SHA-1 (EAS i Play App Signing) - epik R.

## 14. Etapy

- **A - decyzje, makiety telefonu i panelu, szkic podręcznika** (issue #97, ten
  dokument + `design/00e`, `00c`, `00d`, `01e`, `13a`, `design/panel/00a-wybor-klubu`,
  `organizacje-*`, `piloci-*`, `docs/podrecznik/kluby-i-dolaczanie.md`). Trzy drogi
  dołączenia i strona `site/src/dolacz/` z tego etapu zostały WYCOFANE 2026-09-09
  (§15); makiety `00e`, `13a`, `piloci-kod-klubu` (dawne `piloci-zaproszenie`),
  `piloci-lista`, `piloci-konto`, `organizacje-*`, `00c`/`00d`, oba spisy i `SZABLON`
  PRZEBUDOWANE 2026-09-09 pod §3.8; `.linkbox` wycięty z `rama.css`.
- **B - serwer: model** (issue #98): migracja 8 (+9), `organizations`, `memberships`,
  `platform_role`, backfill, brama członkostwa w `authorize()`.
  **WDROŻONE 2026-09-08** (gałąź `feature-98-serwer-kluby`; pułapki migracji:
  `docs/architektura-panelu-serwer.md` §7.9). Odstępstwa od tego dokumentu, każde
  z powodem:
  - **tabela `invitations` z pierwszej wersji migracji 8 WYLATUJE** (zmiana 2026-09-09,
    §3.8): epik B wszedł do `develop` (PR #110, 2026-09-09), ale migracja 8 nie dotarła
    na produkcję (`main`), więc jej kształt nadal zmienia się W MIEJSCU, bez migracji 9 -
    bazę dev stawia się od nowa. Dochodzą `organizations.join_code` i `join_code_since`,
    a `memberships.joined_via` traci `email` i `link` (zostaje `code | panel | platform |
    backfill`; `panel` = dopisanie wprost z panelu klubu żyje do D3, gdzie `POST /pilots`
    przechodzi do modułu Organizacje i wartość zamienia się w `platform`). Zadanie D0
    w issue #100 - WYKONANE 2026-09-09;
  - **migracja 9 NIE istnieje** - `DROP COLUMN pilots.code, pilots.role` stoi na końcu
    migracji 8 (issue #98 tak kazało; serwer po 8 czyta wyłącznie członkostwa, więc okno
    z §10 pkt 6 nie występuje);
  - **`admin_audit.org_id` jest nullowalne** - jedyna taka kolumna: akcja superadministratora
    na platformie nie dzieje się w żadnym klubie (§3.5 mówiło „na wszystkich" i nie
    przewidziało wpisu bez klubu);
  - **`pilots.active` wraca na `TRUE` przy backfillu** - dawne „wyłącz konto" przechodzi
    na członkostwo, a kolumna osoby znaczy odtąd blokadę platformową (§3.2), której nikt
    jeszcze nie nałożył;
  - **`external_identities` bez zmian** - kolejka `pending`/`rejected` przenosi się na
    członkostwa razem z epikiem D (§4), nie wcześniej;
  - **trasy telefonu nadal NIE pytają bazy o członkostwo przy każdym żądaniu** (§6
    zapowiada tę kontrolę) - token klubu żyje godzinę, brama panelu pyta zawsze; kontrola
    per żądanie telefonu wchodzi z testem izolacji w epiku C;
  - **`GET /sheets/:tab` czyta kartę W KLUBIE Z TOKENU** (klucz `(org_id, tab)` już jest),
    adres ze slugiem i token odczytu (§3.7) - epik C;
  - **osoba bez aktywnego członkostwa dostaje `403 no_membership`**, a superadministrator
    bez klubu - sesję PLATFORMOWĄ panelu (`org: null`, sama zdolność `platform.manage`);
    trasy, które ta sesja otwiera, dochodzą w epiku E.
  Świat testowy ma DWA kluby (`test/testWorld.ts`: Alfa i Beta, PWI w obu pod dwoma
  kodami) - warunek testu izolacji z epiku C jest spełniony.
- **C - serwer: izolacja** (issue #99): `org_id` w każdym zapytaniu, adres kart
  arkusza, test izolacji każdej trasy.
- **D - dołączanie kodem klubu** (issue #100): `POST /auth/join { code }`,
  `GET /auth/memberships`, kolejka `pending` na członkostwach (zatwierdzenie z kodem
  i rolą, odrzucenie z powodem), kod klubu w panelu (generowanie, wyłączenie), pierwszy
  administrator z modułu Organizacje, kasacja `registrations.ts` z #89 i strony
  `dolacz/`. **D1 + D4 WDROŻONE 2026-09-09** (gałąź `feature-100-dolaczanie-kodem`):
  osoba powstaje przy pierwszym logowaniu (§4), token `purpose: 'person'`, `202` ze
  stanem `pending` / `rejected` / `none` zamiast `403 no_membership`, obie trasy bez klubu,
  ograniczenie tempa w pamięci procesu (§8.8 architektury serwera), `external_identities`
  bez statusów z backfillem zgłoszeń 1.x na członkostwa (pułapki: `docs/architektura-
  panelu-serwer.md` §7.9 (h)), moduł zgłoszeń z #89 skasowany z serwera i panelu.
  Odstępstwa od tego dokumentu: `GET /auth/memberships` przyjmuje TAKŻE token klubu
  (lista klubów na 13A), ale tokeny klubu wydaje wyłącznie tokenowi osoby; stan zbiorczy
  ma czwartą wartość `active` (tylko dla tokenu klubu); członkostwo `disabled` bez innego
  aktywnego daje `202` ze stanem `none` i wierszem `disabled` na liście, nie odmowę -
  z tokenem osoby da się wpisać kod innego klubu. D2 (komendy panelu), D3, D5–D7 i D9 -
  następne PR-y.
- **E - panel** (issue #101): moduł Organizacje, wybór klubu, kontekst klubu w kolumnie,
  członkowie, zgłoszenia i kod klubu 1:1 z makiet.
- **F - aplikacja** (issue #102): klub w tokenie i `POST /auth/switch`, cache per klub,
  00E/00C/00D, przełącznik 13a (sieć + pusta kolejka) z „Dołącz do innego klubu",
  plakietka klubu 01e. Deep linku dołączania nie ma (§7).
- **R - rebranding** (issue #103) i **W - wydanie** (issue #106): pakiet, schemat,
  kolejność wdrożenia (migracja → serwer → panel → APK), sunset starego pakietu.

## 15. Zmiana z 2026-09-09: jedna droga dołączenia

Issue #97 (decyzja 6) przewidywało trzy drogi. Przegląd 2026-09-09 zaczął się od
pytania właściciela o zaproszenia e-mailem jako jedyną drogę, przeszedł przez hasła
i dodatkowych dostawców logowania, a skończył na kodzie klubu. Zapis po to, żeby nikt
nie proponował odrzuconych wariantów drugi raz:

| wariant | decyzja | dlaczego |
|---|---|---|
| **kod klubu + zatwierdzenie** | **PRZYJĘTY jako jedyna droga** | zero infrastruktury poczty i linków; człowiek decyduje PRZED wejściem; administrator nie musi znać ani adresu, ani konta Google pilota; wyciek kodu daje tylko zgłoszenie; wszystko z tego jest zaprojektowane od logowania Google (00C/00D/P3, statusy `pending`/`rejected`) |
| zaproszenie e-mailem z linkiem | odrzucone na 2.0.0 | wymaga dostawcy poczty, domeny nadawcy, DNS, obsługi niedostarczeń i głębokich linków z klientów poczty; jedyna przewaga - wejście bez czekania - nie waży tyle. Możliwe rozszerzenie po 2.0.0, gdy klub o to poprosi |
| link osobisty kopiowany z panelu | odrzucony | wpuszczał od razu, a pomyłkę naprawiało się wyłączeniem członkostwa; bez poczty i tak szedł kanałem obok aplikacji, jak kod |
| dopasowanie po adresie Google wpisanym przez administratora | zostaje WYŁĄCZNIE jako bootstrap (superadministrator z `SEED_ADMIN_EMAIL`, pierwszy administrator klubu) | jako droga dla pilotów wymagała znajomości konta Google i nie mówiła pilotowi nic; dla administratora klubu i tak wymaga kontaktu poza aplikacją |
| e-mail + hasło | odrzucone, nie wraca | w tym produkcie hasło byłoby używane raz na urządzenie (codziennie PIN), więc reset stałby się główną drogą - a reset to i tak kod w e-mailu; do tego hash w bazie, ochrona przed zgadywaniem i „zapomniałem hasła" u administratora. Bezpieczeństwo hasła nie przekracza bezpieczeństwa skrzynki resetu |
| logowanie kodem z e-maila (bez hasła) | po 2.0.0, gdy pojawi się pilot bez konta Google | jedyna metoda niezależna od Google bez hasła; wymaga dostawcy poczty; kod do przepisania, nie link (skanery poczty zużywają linki) |
| Apple / Facebook | Apple wyłącznie razem z iOS (wymóg App Store), Facebook wcale | produkt jest na Androida, więc każdy telefon ma konto Google; kolejny dostawca mnoży pomyłki „zalogowałem się nie tym" bez wiarygodnego łączenia po adresie (Apple ukrywa adres, Facebook go nie potwierdza) |

Z tego wynika §3.8 (kolumna `organizations.join_code` zamiast tabeli `invitations`),
§5 (`POST /auth/join { code }`), §7 (00E bez pola na link, bez deep linku), §8.3 (karta
„Kod klubu" zamiast szuflady z trzema kartami), §9 (strona `dolacz/` usunięta) i lista
w §14. Trzy odpowiedzi właściciela z 2026-09-09: pierwszego administratora dodaje
superadministrator; zgłoszenie `pending` kończy wyłącznie decyzja; administrator klubu
może wyłączyć dołączanie kodem. Trzy pytania, które wyszły przy przebudowie makiet,
rozstrzygnięte tego samego dnia: kształt kodu i jego zapis (§3.8), limity tempa
dołączania (§3.8, §5), kod klubu do odczytu dla superadministratora (§8.1).
