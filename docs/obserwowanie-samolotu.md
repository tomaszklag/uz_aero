# Obserwowanie samolotu: karta maszyny w aplikacji i powiadomienia o jej lotach (3.2.0)

> Dokument decyzji zgłoszenia **#205 „Obserwowanie samolotu"**. Powstaje PRZED kodem
> i przed makietami - ta sama kolejność, co przy rezerwacjach (`docs/rezerwacje.md`)
> i zakresach uprawnień (`docs/uprawnienia.md`).
>
> Stan: **decyzje właściciela z 2026-09-25 w dwóch turach** (§1 - sześć pytań o kształt
> i pięć wąskich z §11, wszystkie zamknięte; nic nie zostaje otwarte). Wydanie: **razem
> z 3.2.0** (rozbudowa panelu, `docs/panel-3.2.md`), więc etapy z §9 wchodzą do tamtego
> milestone'u. Następny krok: epik O-A (makiety).

## 0. Skąd to się wzięło

Zgłoszenie #205, słowami właściciela: *„mając odpowiednie uprawnienia chciałbym móc
subskrybować zdarzenia na samolocie. W aplikacji potrzebujemy szczegółowej strony
samolotu na której zobaczę jej aktualny stan oraz status ze szczegółami. Chciałbym
również zobaczyć nadchodzące rezerwacje oraz historyczny log. Interesuje mnie też
przebieg motogodzin oraz przepływ paliwa. Jeśli subskrybuję to chciałbym dostawać
powiadomienia o tym że zbliża się nowy lot (np. odbędzie się za 1h), że lot się
rozpoczął lub się zakończył. To jest szczególnie istotna funkcjonalność dla
zarządzającego lotami oraz dla mechanika który przygotowuje samolot."*

Dwie osoby, o których mówi zgłoszenie, są w tym systemie od 3.1.0 nazwane: **Koordynator
lotów** i **Technik** (zestawy z `docs/uprawnienia.md` §2.2) - a mechanik decydujący
z telefonu to **Akceptujący**. Wszyscy troje mają dziś wobec maszyny wyłącznie NARZĘDZIA
DECYZJI (zgoda na rezerwację, wyłączenie z użytku) i żadnego narzędzia OBSERWACJI: nikt
nie dowiaduje się, że maszyna właśnie wróciła z lotu i można ją tankować, ani że za
godzinę ktoś ją bierze.

**Około dwóch trzecich fundamentu już stoi** i to przesądza o koszcie:

- **podgląd samolotu 26B** (issue #206) liczy liczniki ze źródłem, ostatnie 30 dni,
  ostatnie loty i najbliższe terminy JEDNYM zapytaniem dla panelu i telefonu
  (`server/src/domain/decisionPreview.ts`). Brakuje mu wejścia spoza sprawy - trasa jest
  przypięta do rezerwacji i do bramy akceptującego;
- **skrzynka i budzik** (R-G, R-J): nowy rodzaj wiadomości dopisuje się w
  `application/common/notify/bookingNotices.ts`, `Notifier.record` idzie w cudzej
  transakcji, `wake` po commicie i nigdy nie rzuca. Aplikacja NIEZNANY rodzaj kieruje
  do skrzynki, więc telefon sprzed tej zmiany nic nie zgubi;
- **zadanie okresowe** (`BookingReleaseJob`, co 5 minut) zadaje już dwa pytania o
  rezerwacje; „za godzinę" jest trzecim pytaniem w TEJ SAMEJ pętli;
- **ingest** ma już punkt, w którym `session_claim` dotyka rezerwacji
  (`bookings.fulfil`). Uruchomienie silnika i zdanie samolotu przechodzą tym samym
  miejscem;
- **zbiór zdolności per członkostwo** (epik #197) pozwala dać obserwowanie mechanikowi
  bez wpuszczania go do panelu;
- **wykres z gestami** istnieje: profil pionowy śladu (`VerticalProfile`,
  `useChartGesture`, `mapViewport.ts`) ma kursor jednym palcem, zoom dwoma i dwuklik -
  bez modułu natywnego.

Cała zmiana jest w JS i na serwerze - **żadnego modułu natywnego**, więc jedzie
aktualizacją OTA na runtime 3.1.0, bez kolejnego APK.

## 1. Decyzje właściciela (2026-09-25) - nie wracać do nich w dyskusji

Pierwsza tura - kształt:

1. **Nowa zdolność `fleet.watch`** („Obserwowanie samolotów"), a nie doklejka do
   `fleet.manage`. W zestawach: **Akceptujący, Koordynator lotów, Technik**;
   Administrator przez komplet. Zestaw „Akceptujący" przestaje przez to nazywać JEDNĄ
   rzecz - to świadoma cena: mechanik decydujący z telefonu ma dostać kartę maszyny
   bez ręcznego dopisywania zdolności przez administratora (§3).
2. **„Lot się rozpoczął" = URUCHOMIENIE SILNIKA** (`engine_start`), nie przejęcie
   samolotu. Zdanie bez lotu (09C) nie daje więc sygnału startu i to jest zgodne
   z decyzją: maszyna, która nie pracowała, nie „rozpoczęła lotu" (§5.3).
3. **Wpis ręczny lotu po fakcie MILCZY** - opisuje przeszłość, nie zmianę stanu
   maszyny teraz. Jego odczyty i tak wchodzą na kartę maszyny i do łańcucha (§5.6).
4. **Przebieg motogodzin i przepływ paliwa OD RAZU WYKRESEM**, własnym rendererem jak
   mapa śladu - bez modułu natywnego (§6.4).
5. **Pięć wiadomości**, nie trzy: za godzinę · odwołano termin, który już przypomniano
   · uruchomienie silnika · zdana z odczytami · nie odebrano po godzinie (§5).
6. **Wydanie razem z 3.2.0.** Milestone „Dodatkowe zadania 3.1.0" (termin 26 IX)
   tego nie mieści; zgłoszenie #205 przechodzi do milestone'u „Panel admina 3.2.0"
   i dokłada tam etapy O-A…O-D (§9). Konsekwencja dla `docs/panel-3.2.md` §11:
   3.2.0 przestaje być wydaniem, które „aplikacji pilota nie rusza w ogóle" - dostaje
   OTA (§9).

Druga tura tego samego dnia - pięć wąskich pytań z §11:

7. **BEZ backfillu zestawów.** Słowa właściciela: *„jeszcze nie używaliśmy aplikacji,
   więc tak jakby startujemy od zera"*. Migracja 15 to SAM DDL - tabela `aircraft_watches`
   i kolumna `bookings.reminded_at`. Katalog panelu dostaje `fleet.watch` w zestawach,
   a członkostwom w bazie nikt niczego nie dopisuje: zakresy nadaje się od nowa. Pułapka
   „zestaw liczy się ze zbioru" zostaje ZAPISANA na przyszłość (§3.2, `docs/uprawnienia.md`
   §12) - wraca, gdy w bazie będą prawdziwe kluby.
8. **Cudza rezerwacja na karcie maszyny niesie DOKŁADNIE to, co w kalendarzu** (§6.2,
   §11 P2): godziny, maszyna, właściciel, rodzaj zajętości, powód wyłączenia. Bez zadania,
   trasy i notatki - kształt na drucie bez zmian.
9. **Wykresy Z KURSOREM I PRZYBLIŻENIEM od razu** (§6.4, §11 P3 - odwraca rekomendację
   „statyczne"): ten sam mechanizm, co profil pionowy śladu.
10. **Przypomnienie „za godzinę" jest STAŁĄ** w `policy.ts`, nie ustawieniem klubu
    (§5.1, §11 P4).
11. **Historia na karcie sięga po WSZYSTKIE operacje maszyny, stronami** (§6.2,
    §11 P5); wykres zostaje przy 90 dniach - to inne pytanie.

Trzecia tura (po makietach O-A, uwaga właściciela: „gdzieś w ustawieniach i na profilu
warto byłoby dodać listę obserwowanych samolotów oraz możliwość zarządzania"):

12. **LISTA OBSERWOWANYCH I ZARZĄDZANIE W DWÓCH MIEJSCACH** (§6.6): w Ustawieniach
    aplikacji (13) sekcja „Obserwowane samoloty" = CAŁA flota klubu z przełącznikiem przy
    każdej maszynie (jedno miejsce do włączania i wyłączania, bez arkusza „dodaj"), oraz
    w panelu karta w **`#/konto`** z tą samą listą. Odwraca zdanie z §7.2 „ani przełącznika
    w `#/konto`" - tamto było „wraca, gdy ktoś poprosi", i ktoś poprosił.

## 2. Czym JEST obserwowanie w tym systemie

### 2.1 Zapis zamiaru osoby, prawo sprawdzane przy KAŻDEJ wysyłce

Obserwowanie to wiersz „ta osoba chce wiedzieć, co się dzieje z tą maszyną w tym
klubie" (`aircraft_watches`, §4.1). **Nie jest zdolnością ani jej częścią**: zdolność
`fleet.watch` mówi „wolno ci patrzeć i obserwować", wiersz mówi „chcę". Bez wiersza
osoba ze zdolnością ma kartę maszyny, ale nie dostaje powiadomień.

**Prawo sprawdza się w chwili WYSYŁKI, nie w chwili zapisu.** Lista adresatów każdej
wiadomości powstaje z wierszy obserwowania złączonych z AKTYWNYM członkostwem
i obecnością `fleet.watch` w zbiorze - dokładnie tak, jak obsada kroku ścieżki liczy się
„wobec żywego klubu" (`stepMembers`, epik R-H), a brama telefonu pyta bazę o członkostwo
przy każdym żądaniu (epik C). Skutki:

- odebranie zdolności albo wyłączenie członkostwa **wycisza od razu**, bez sprzątania
  wierszy i bez wygaśnięcia tokenu;
- wiersz obserwowania ZOSTAJE - przywrócenie zdolności przywraca powiadomienia bez
  proszenia człowieka, żeby włączył je drugi raz. Konfiguracji osoby nie czyścimy po
  cichu (ta sama zasada, którą R-H przyjął dla obsady kroku);
- skasowanie członkostwa (kaskada z `memberships`) zabiera wiersze - wtedy nie ma już
  czego przywracać.

### 2.2 Cały moduł wymaga sieci

Karta maszyny czyta CUDZE operacje, zajętość kalendarza i odczyty innych pilotów -
niczego z tego telefon nie ma i mieć nie może (§4.1 rejestru: jeden piszący, własne
operacje). Skrzynka i tak wymaga sieci (`docs/rezerwacje.md` §12.1). Stąd:

- **karta maszyny** pyta serwer przy każdym wejściu; bez zasięgu rysuje kartę
  „BRAK POŁĄCZENIA" i ponawia co 60 sekund bez przycisku - wzorzec kalendarza (21B)
  i pustej floty (02G). **Cache'u karty NIE MA** i nie wolno go dorobić po cichu:
  liczniki z cache wyglądałyby na stan maszyny, a byłyby stanem sprzed godziny;
- **przełącznik „Obserwuj"** zapisuje się na serwerze wprost, nie przez outbox. To nie
  jest fakt z kabiny, tylko ustawienie osoby; bez sieci przycisk niesie POWÓD WEWNĄTRZ
  SIEBIE (issue #55): „Obserwowanie zapisuje serwer - potrzebne połączenie".

Reguła §4.1 („brak sieci nigdy nie blokuje pracy pilota") broni PRACY W LOCIE i tego
nie rusza: pilot bez zasięgu lata jak dotąd, tylko nie zobaczy karty cudzej maszyny.

### 2.3 Wiadomość mówi CZASEM Z REJESTRU, a paczka dociera, kiedy dociera

To jest najważniejsza reguła tego dokumentu i bierze się z offline-first. Telefon pilota
wysyła zdarzenia, gdy ma zasięg - uruchomienie silnika o 08:12 potrafi dotrzeć na serwer
o 09:40, a zdanie samolotu razem z nim. Wiadomość „lot się rozpoczął" powstaje więc
w chwili DOTARCIA paczki i **nie ma prawa udawać, że opisuje „teraz"**.

- każda wiadomość o operacji niesie **`at` = chwilę zdarzenia Z REJESTRU** (UTC, jak
  cała historia operacji) oraz `createdAt` = chwilę powstania wiadomości. Skrzynka pisze
  „Uruchomienie 08:12 UTC", a gdy zapis dotarł później niż kwadrans po zdarzeniu,
  dokłada „· zapis dotarł 09:40". Rejestr mówi prawdę o swojej dokładności - ta sama
  zasada, którą issue #62 przyjęło przy kręgach (jedna koperta, tyle lądowań, ile pilot
  policzył);
- **paczka, która niesie uruchomienie I zdanie tej samej operacji, rodzi TYLKO „zdana"**
  - wiadomość o zdaniu niesie w treści czas uruchomienia, więc „uruchomiona" obok niej
  byłaby zdaniem o stanie, który już nie istnieje. Pilot bez zasięgu przez cały dzień
  daje jedną wiadomość na operację, nie dwie;
- push nie niesie czasu zdarzenia w ogóle (§5): budzik mówi „coś jest w skrzynce",
  a skrzynka mówi kiedy.

Rezerwacje NIE mają tego problemu: „za godzinę" i „nie odebrano" liczy serwer własnym
zegarem, a „odwołano" powstaje w chwili decyzji człowieka z zasięgiem.

### 2.4 Ziarnem jest OPERACJA, nie lot

Słownik od pivotu 2026-08-10: operacja = jeden bieg silnika, lot = start→lądowanie,
w jednej operacji wiele lotów. Dzień skokowy to dziesięć lądowań w jednym biegu.
Powiadomienie na każdy start i lądowanie dałoby dwadzieścia budzików o jednej rzeczy,
która mechanika interesuje w DWÓCH chwilach: gdy maszyna zaczyna pracować (nie wolno jej
tknąć) i gdy wraca z odczytami (można ją obsłużyć). Stąd „uruchomienie silnika" i „zdana"
- i ani jednej wiadomości pomiędzy. To ta sama granica, którą issue #38 postawiło
śladowi GPS: ślad należy do operacji, loty są jego odcinkami.

## 3. Uprawnienia: `fleet.watch`

### 3.1 Nowa pozycja katalogu

Katalog nazywa ZASOBY, a obserwowanie jest nowym RODZAJEM dostępu do zasobu, który do
dziś miał wyłącznie „zarządzanie" (`fleet.manage`). Koordynator lotów floty nie
konfiguruje, mechanik-Akceptujący nie ma nic poza zgodą - obu nie da się wpuścić na
kartę maszyny żadną istniejącą pozycją bez oddania im władzy, o którą nikt nie prosił.

| Zdolność | Otwiera |
| --- | --- |
| `fleet.watch` · „Obserwowanie samolotów" | kartę maszyny w aplikacji (stan, liczniki, terminy, historia, wykresy) i powiadomienia o jej lotach po włączeniu obserwowania |

Wchodzi do `CLUB_CAPABILITIES` na serwerze (komplet administratora - jedenaście
pozycji) i do katalogu panelu (`admin/src/screens/accounts/scope.ts`) z opisem jak
wyżej. Zestawy po zmianie:

| Zestaw | Zdolności |
| --- | --- |
| Pilot | żadnych |
| Akceptujący | `reservations.approve` **+ `fleet.watch`** |
| Koordynator lotów | `panel.access`, `reservations.manage`, `reservations.approve` **+ `fleet.watch`** |
| Technik | `panel.access`, `fleet.manage` **+ `fleet.watch`** |
| Administrator | komplet (11) |

Opis zestawu „Akceptujący" w panelu ma odtąd mówić o dwóch rzeczach („rozstrzyga swój
krok i widzi kartę maszyny - bez wejścia do panelu"). Tabela w `docs/uprawnienia.md`
§2.2 dostała tę zmianę jako uzupełnienie z datą.

### 3.2 Pułapka: zestaw liczy się ZE ZBIORU - i dlaczego mimo to NIE MA backfillu

`presetOf` w panelu i `scopeKey` na serwerze porównują zbiór członka ze ZBIOREM ZESTAWU
co do pozycji. Dołożenie `fleet.watch` do czterech zestawów znaczy, że po wdrożeniu
**każde członkostwo z dawnym zbiorem zestawu czyta się jako „Własny zakres"** -
administrator, technik, koordynator i akceptujący sprzed zmiany nie mają w zbiorze
jedenastej pozycji.

Na ŻYWEJ bazie właściwą odpowiedzią byłby backfill w migracji: dopisanie zdolności
członkostwom o zbiorze DOKŁADNIE równym jednemu z zestawów w brzmieniu sprzed zmiany.
Reguła stoi zapisana w `docs/uprawnienia.md` §12 razem z testem, jaki taki backfill
musiałby mieć - **ale przy #205 NIE WCHODZI W ŻYCIE.** Decyzja właściciela 2026-09-25
(druga tura): *„jeszcze nie używaliśmy aplikacji, więc tak jakby startujemy od zera"*.
Baza hostowana nie ma prawdziwych klubów, tylko konta testowe, więc migracja, która
dopisywałaby im zdolność, opisywałaby stan, którego nikt nie broni. Konsekwencje:

- **migracja 15 to SAM DDL** (§4): tabela obserwowania i stempel przypomnienia.
  Bez `INSERT … SELECT` po członkostwach i bez testu czterech przypadków;
- **członkostwa testowe z dawnym zbiorem zestawu czytają się po wdrożeniu jako
  „Własny zakres"**, dopóki administrator nie nada zakresu od nowa - to jest przyjęte,
  nie przeoczone;
- **pierwszy klub, który dostanie zakresy PO tej zmianie**, ma je od razu z jedenastą
  pozycją, bo katalog panelu proponuje zestaw w nowym brzmieniu;
- zdanie „zmiana katalogu nie rusza nikomu uprawnień" (`docs/uprawnienia.md` §2.2)
  zostaje prawdziwe: nikomu niczego nie odejmujemy.

## 4. Model danych (serwer, migracja 15 - wyłącznie addytywna, sam DDL)

### 4.1 `aircraft_watches`

```sql
CREATE TABLE IF NOT EXISTS aircraft_watches (
  org_id      TEXT NOT NULL REFERENCES organizations(id),
  aircraft_id TEXT NOT NULL REFERENCES aircraft(id),
  pilot_id    TEXT NOT NULL REFERENCES pilots(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (aircraft_id, pilot_id),
  -- Członkostwo znika → obserwowanie znika. Wyłączenie członkostwa (status) wiersza
  -- NIE kasuje: wycisza je sprawdzenie przy wysyłce (§2.1).
  FOREIGN KEY (org_id, pilot_id) REFERENCES memberships(org_id, pilot_id) ON DELETE CASCADE
);
```

- **`org_id` jest, choć maszyna należy do jednego klubu** - z tego samego powodu, co
  na każdej tabeli klubu (epik C): strażnik w `architecture.test.ts` wymaga `org_id`
  w każdej metodzie adaptera, a odczyt „kogo obudzić" ma stać w klubie wiersza;
- **bez `kind`/rodzajów** - obserwowanie jest jednym przełącznikiem (§5, „bez wyboru
  rodzajów"); kolumna na wybór, którego nie ma, byłaby zaproszeniem do dorobienia go
  bez decyzji;
- **bez audytu** - to ustawienie OSOBY o sobie, jak motyw i PIN, nie decyzja o kimś.
  Zapis idzie z telefonu; panel w pierwszej wersji nie ma na to ekranu (§7.2);
- jedno pytanie zadawane tej tabeli poza zapisem: `watchersOf(tx, orgId, aircraftId)`
  → osoby z aktywnym członkostwem i `fleet.watch` (złączenie z `memberships`
  i `membership_capabilities` w SQL-u, nie w kodzie - §2.1).

### 4.2 `bookings.reminded_at`

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
```

Stempel przypomnienia „za godzinę". Odpowiada na dwa pytania: **idempotencji** (zadanie
okresowe nie przypomina dwa razy) i **„co ogłosiłeś, to odwołaj"** (§5.2 - odwołanie
terminu, który już przypomniano, rodzi wiadomość; nieprzypomnianego - nie). Poprawka
przesuwająca początek terminu ZERUJE stempel: nowy termin dostanie własne przypomnienie.

### 4.3 Bez backfillu

Decyzja z §1 pkt 7 i uzasadnienie w §3.2. Migracja nie dotyka `membership_capabilities`
ani jednym wierszem. Test migracji sprawdza to, co migracja robi: istnienie tabeli,
klucza i kaskady oraz kolumny na `bookings` - jak przy migracji 13.

### 4.4 Izolacja klubu i strażniki

Każda nowa trasa (§7) płaci za OBA strażniki epiku C: przypadek w
`tenantIsolation.test.ts` (rejestr tras Fastify) i `org_id` w każdej metodzie
adaptera `aircraftWatchesRepo`. Cudza maszyna odpowiada **404**, nie 403.

## 5. Powiadomienia: pięć wiadomości

Jedna tabela, jedno spojrzenie. „Do kogo" znaczy zawsze: **obserwujący tę maszynę
z prawem sprawdzonym przy wysyłce (§2.1), BEZ sprawcy** - pilot, który sam uruchomił
silnik albo sam odwołał termin, o własnym działaniu nie jest budzony (koordynator też
lata, a wiadomość o sobie samym jest szumem).

| # | `kind` | Kiedy | Producent | Do kogo (bez…) | Push |
| --- | --- | --- | --- | --- | --- |
| 1 | `aircraft_flight_soon` | najbliższy przebieg zadania po tym, jak do początku POTWIERDZONEJ rezerwacji zostało ≤ 60 min; raz (`reminded_at`) | zadanie okresowe | …PIC-a i Duala rezerwacji | „Zbliża się lot · SP-AXA" / „Za godzinę" |
| 2 | `aircraft_flight_cancelled` | odwołanie albo przesunięcie początku rezerwacji z `reminded_at` (telefon i panel) | komendy rezerwacji | …odwołującego | „Odwołany lot · SP-AXA" |
| 3 | `aircraft_engine_started` | przyjęte `engine_start` w paczce BEZ `day_close` tej operacji | ingest | …PIC-a i Duala operacji | „SP-AXA uruchomiona" |
| 4 | `aircraft_released` | przyjęte `day_close`; także `session_close`/`session_void` z panelu na operacji W TOKU | ingest; komendy panelu | …PIC-a, Duala, administratora zamykającego | „SP-AXA zdana" |
| 5 | `aircraft_not_taken` | zadanie zwalnia slot (`released`, §4.1 rezerwacji) | zadanie okresowe | …PIC-a i Duala rezerwacji | „Nie odebrano · SP-AXA" |

**Push jak dotąd: tytuł nazywa rzecz, nazwisk nie ma, treść stoi w skrzynce**
(§12.1 rezerwacji). Znak maszyny w tytule jest dopuszczalny - to dane klubu, nie osoby;
„za godzinę" jest czasem względnym i niczego o czyimś grafiku nie zdradza.
`payload` wozi IDENTYFIKATORY (`aircraftId`, `pilotId`, `bookingId`, `sessionUuid`)
i CZASY; znak i nazwisko rozwiązuje aplikacja z cache floty, jak wszędzie.

**Tapnięcie** (`logic/pushTarget.ts`): każdy z pięciu rodzajów → **karta maszyny (27)**
z `aircraftId`. Aplikacja sprzed tej zmiany kieruje je do skrzynki - to jest
zaprojektowane w R-J i niczego nie trzeba dla niej robić.

### 5.1 Za godzinę

Trzecie pytanie `BookingReleaseJob` (plik dostaje przy okazji nazwę mówiącą o trzech
pytaniach - `bookingClock.ts`, sama zmiana nazwy). Kandydaci: `status = 'confirmed'`,
`kind = 'flight'`, `reminded_at IS NULL`, `starts_at <= now + 60 min`, `ends_at > now`.
Tick co 5 minut, więc przypomnienie pada 55-60 minut przed początkiem; **rezerwacja
złożona później niż godzinę przed startem** dostaje przypomnienie na najbliższym
przebiegu, a treść push mówi wtedy „Za 20 min" - zdanie liczy się z `startsAt` w chwili
wysyłki, nie ze stałej. Rezerwacja już ZREALIZOWANA (pilot wziął maszynę wcześniej,
`fulfilled`) przypomnienia nie dostaje - wypadła ze `confirmed`. Rezerwacja CZEKAJĄCA
NA ZGODĘ też nie: mechanik nie ma szykować maszyny na lot, na który nikt się nie zgodził;
gdy zgoda zapadnie w ostatniej godzinie, przypomnienie pada z `confirm` na najbliższym
przebiegu.

**Sześćdziesiąt minut jest STAŁĄ** (decyzja właściciela 2026-09-25, P4): liczba
w `packages/domain/src/booking/policy.ts` obok progów planowania, DO KALIBRACJI jak
reszta - bez pola w karcie klubu i bez kolumny konfiguracji. Ustawienie per klub
wraca, gdy klub poprosi o inne wyprzedzenie.

### 5.2 Odwołano po przypomnieniu

„Co ogłosiłeś, to odwołaj." Odwołanie (`cancel`, telefon albo panel) i poprawka
przesuwająca `startsAt` (`patch`) na rezerwacji z `reminded_at` rodzą wiadomość
w TEJ SAMEJ transakcji, co zmiana (`Notifier.record`), budzik po commicie. Rezerwacja
nieprzypomniana odwołuje się po cichu - mechanik nic o niej nie wiedział. Wiadomość
niesie stary termin; przy przesunięciu także nowy, a `reminded_at` wraca do `NULL`,
więc nowy termin dostanie własne „za godzinę" (§4.2). Wygaśnięcie bez decyzji
(`expired`) tu nie wchodzi: dotyczy wyłącznie `pending`, a `pending` nie ma
przypomnienia.

### 5.3 Uruchomienie silnika

W ingeście, po przeliczeniu projekcji dotkniętych sesji: dla każdego PRZYJĘTEGO
(`accepted`, nie duplikatu) zdarzenia `engine_start` - chyba że ta sama paczka niesie
`day_close` tej operacji (§2.3). Adnotacja **„zgodnie z planem" / „poza planem"**
liczy się z `session_claim.reservationId` tej operacji: rezerwacja `fulfilled` przez
tę sesję → zgodnie z planem, brak → poza planem. Koordynator lotów chce wiedzieć o tym
drugim - to jest pytanie, na które kalendarz sam nie odpowie. Wiadomość niesie `at`
= `engine_start.at` (z rejestru), PIC-a i Duala.

Wpis ręczny (`session_claim.manualEntry`) NIE rodzi ani tej, ani następnej wiadomości
(decyzja 3).

### 5.4 Zdana

Przyjęte `day_close` → wiadomość z odczytami końcowymi (`fuelEndL`, `mhEnd`), czasem
uruchomienia i wyłączenia, blokiem i liczbą lotów - czyli z tym, po co mechanik czeka.
Olej NIE: zdanie samolotu oleju nie mierzy (issue #60), a zero w tym miejscu byłoby
liczbą znikąd. Zdanie bez lotu (09C) rodzi „zdana" z powodem (`noFlightReason`) -
maszyna była zajęta i wróciła.

**Zakończenie z panelu** (`session_close`, issue #81) i unieważnienie operacji W TOKU
(`session_void` z panelu) rodzą tę samą wiadomość z `closedBy: 'admin'` i powodem, bez
odczytów. Bez tego obserwujący, który dostał „uruchomiona", nigdy nie dostałby
domknięcia - a maszyna w jego skrzynce latałaby bez końca.

### 5.5 Nie odebrano

Przebieg zwalniający slot (`released`) budzi obserwujących. Zadanie i tak liczy ten fakt;
dochodzi jedno `record` w transakcji `close` i `wake` po niej.

### 5.6 Czego NIE MA - i dlaczego

- **każdy start i lądowanie** - §2.4;
- **wpis ręczny** - decyzja 3;
- **nowa rezerwacja / wyłączenie z użytku** na obserwowanej maszynie - zmiana PLANU,
  nie stanu maszyny; koordynator ma na to kalendarz i kolejkę akceptacji, mechanik sam
  wpisuje wyłączenia. Wraca, gdy klub poprosi (§12);
- **rozjazdy liczników** (flagi §4.5) i **olej pod minimum** - to jest treść modułu „Do
  sprawdzenia" panelu 3.2.0 (P-D); dublowanie jej w skrzynce telefonu byłoby drugim
  kanałem tych samych uwag;
- **wybór rodzajów per obserwowanie** - jeden przełącznik. Trzy przełączniki przy
  każdej maszynie to konfiguracja, której nikt nie prosił; jeśli po testach hałas okaże
  się realny, wraca tu decyzja (§10 R1), nie kolumna dopisana przy okazji;
- **zbiorcze podsumowanie dnia** („digest") - budzik ma dzwonić przy zdarzeniu, a nie
  wieczorem.

## 6. Karta maszyny w aplikacji (ekran 27)

### 6.1 Wejścia

- **Kalendarz (21)**: nagłówek wiersza maszyny - znak po lewej osi - jest celem
  dotknięcia dla osoby z `fleet.watch`. Bez zdolności wiersz zostaje samą etykietą:
  BRAK akcji, nie wyszarzona akcja (zasada z 10B/02G);
- **skrzynka (25) i push**: pięć rodzajów z §5;
- **podgląd 26B**: stopka „Pokaż kartę samolotu" - tylko z `fleet.watch` (panelowa
  szuflada K6a ma analogiczną stopkę „Pokaż w dzienniku").

**Telefon zdolności nie zna** (R-J: „telefon zdolności nie zna, a Pulpit i tak czyta
skrzynkę"), więc bit `watch: boolean` dojeżdża tam, gdzie ekran i tak pyta serwer:
w odpowiedzi okna kalendarza (`GET /bookings`) i w podglądzie 26B. Osobna trasa
o jeden bit byłaby drugim żądaniem przy każdym wejściu - ten sam rachunek, co przy
`approver`.

Karta jest EKRANEM otwieranym z powrotem, nie zakładką (czwartej zakładki nie ma, §9.4
rezerwacji), i nie ma paska zakładek - jak 23, 25, 26.

### 6.2 Bloki, od góry

1. **Nagłówek**: znak + typ; strzałka powrotu; przycisk zgłoszenia jak w każdej ramie.
2. **Stan teraz** (hero, §6.3): jedno z pięciu zdań z tonem. Pod nim, gdy stan
   pochodzi z rejestru, czas ostatniego zapisu, który dotarł.
3. **Obserwuj**: karta-przełącznik. Włączony: „Obserwujesz · powiadomienia o lotach
   tej maszyny"; wyłączony: „Obserwuj". Włączenie pyta o zgodę na powiadomienia
   systemu, jeśli jeszcze nie pytano (trzeci moment w `logic/pushOptIn.ts`, obok
   akceptującego i rezerwacji czekającej).
4. **Liczniki**: paliwo, motogodziny, olej - wartość, ŹRÓDŁO i stempel, ten sam
   `pickHandover`, co przekazanie na 02A i wiersze 26B. Bez odczytu kreska, nie zero.
5. **Najbliższe terminy**: do pięciu, razem z wyłączeniami z użytku, polami cudzej
   rezerwacji DOKŁADNIE jak w kalendarzu - godziny, maszyna, właściciel, rodzaj,
   powód wyłączenia; bez zadania, trasy i notatki (`bookingWire` pyta, kto patrzy - §17
   rezerwacji; decyzja P2 2026-09-25). Własny termin otwiera kartę 23.
6. **Przebieg**: dwa wykresy (§6.4) i sumy 30 / 90 dni (dni z lotami, starty, blok,
   czas lotu - `aircraftFacts`).
7. **Historia operacji**: zwarte wiersze jak w Historii (24): data · pilot · zadanie
   · Loty · Blok · Lot, a w drugiej linii ODCZYTY („3907:48 → 3908:12 · 112 → 96 L")
   - to jest „przepływ" czytany wierszami, dla kogoś, kto szuka konkretnego dnia.
   **Lista sięga po WSZYSTKIE operacje maszyny** (decyzja P5 2026-09-25), stronami
   z doładowaniem starszych i kursorem PARĄ (chwila operacji + uuid), jak skrzynka;
   własna operacja otwiera 10, cudza nie otwiera niczego (jej szczegóły to dziennik
   panelu).

**Dwa zegary, świadomie** (jak na 26B): chwile operacji i odczytów datą rejestru
w UTC, terminy dobą klubu.

### 6.3 Stan teraz - rachunek po stronie serwera

Jedna funkcja domeny (`aircraftNow`), czysta, z testami; wejście: operacje maszyny,
zajętości kalendarza, `service_status`, „teraz". Pierwszeństwo od góry:

| Stan | Warunek | Zdanie |
| --- | --- | --- |
| wycofana | `service_status` ≠ w służbie | „Wycofana z użytku" |
| w locie | operacja `active` z `engineStartAt`, bez `engineStopAt` | „W locie · A. Kowalski · od 08:12 UTC" |
| przejęta | operacja `active` bez uruchomienia | „Przejęta · A. Kowalski" |
| po locie | operacja `active` z `engineStopAt` | „Po locie, jeszcze nie zdana · A. Kowalski" |
| wyłączona | `block` obejmujący „teraz" | „Wyłączona z użytku · przegląd · do 30 IX" |
| zarezerwowana | `confirmed` `flight` obejmująca „teraz" | „Zarezerwowana · J. Nowak · 10:00-12:00" |
| wolna | nic z powyższych | „Wolna" + „następny termin: dziś 14:00" |

Stan z rejestru jest stanem WG OSTATNIEGO ZAPISU, KTÓRY DOTARŁ (§2.3): pod herosem
stoi „zapisy do 09:40", a nie „teraz". Operacja W TOKU jest dziś już źródłem
przekazania (`pickHandover`: `open_session`), więc rachunek nie wprowadza drugiej
definicji zajętości.

### 6.4 Wykresy: motogodziny i paliwo

Decyzja 4: od razu, własnym rendererem. Technika jest ta sama, co profil pionowy śladu
(`components/data/VerticalProfile.tsx` na `TrackPolyline`): łamana z obróconych
`<View>`, podziałka czasu w lewym dolnym rogu (`timeScaleBar.ts`), zero zależności
natywnych.

- **Motogodziny**: licznik w czasie z ostatnich 90 dni. Punkty = odczyty z rejestru
  (przejęcie, zdanie, wpis administratora z `aircraft_readings`), oś pionowa od
  minimum do maksimum okna, nie od zera - jak profil („skala zaczyna się od dna lotu").
  Linia jest z natury niemalejąca; cofnięcie licznika (flaga `MH_REGRESSION`) rysuje
  się takie, jakie jest - wykres nie poprawia rejestru;
- **Paliwo**: poziom w czasie z tych samych 90 dni. Punkty = odczyt przejęcia, odczyt
  zdania i **tankowania** (`refuel` ze strumienia: stan po dolewce); między zdaniem
  a następnym przejęciem linia jest przerywana szarą - maszyna stała i rejestr o tym
  czasie nie mówi nic (ta sama kreska, którą issue #75 rysuje kołowanie);
- **serie liczy SERWER** i oddaje gotowe punkty `(at, value, source)`; telefon liczy
  wyłącznie geometrię ekranu (`logic/aircraftSeries.ts`, z testami). Druga kopia
  rachunku w aplikacji byłaby pierwszym miejscem, w którym wykres pokazałby co innego
  niż karta liczników obok;
- **Z KURSOREM I PRZYBLIŻENIEM OD RAZU** (decyzja właściciela 2026-09-25, P3 - odwraca
  rekomendację „statyczne"): ten sam mechanizm, co profil śladu (`useChartGesture`,
  `logic/mapViewport.ts`, bez modułu natywnego). Jeden palec = kursor - podpis mówi
  chwilę i wartość, a przy niej ŹRÓDŁO punktu (zdanie · przejęcie · tankowanie · wpis
  administratora); dwa palce = przybliżenie i przesunięcie WYŁĄCZNIE W POZIOMIE
  (`zoomAxis: 'x'` - pion jest dobrany do zakresu, więc rozciąganie go niczego nie
  odsłania; to rozstrzygnięcie z issue #47 stosuje się tu wprost); dwuklik = całość.
  Podziałka czasu jest wskaźnikiem przybliżenia („2 dni" zamiast „30 dni"), nie
  plakietka z krotnością. Kursor prowadzi się na KAŻDYM z dwóch wykresów osobno -
  sprzęgania między nimi nie ma, bo oś MH i oś paliwa nie mają wspólnej chwili poza
  tymi, w których oba odczyty padły naraz;
- **bez normy i bez werdyktu** - to jest analityka zużycia (panel, 3.2.0 P-E) i ma
  własne reguły redakcyjne (`docs/panel-3.2.md` §8). Wykres pokazuje, co pokazały
  przyrządy; brak danych to brak linii, nie zero (issue #69).

### 6.5 Makiety (design-first, epik O-A - WYKONANE 2026-09-25, issue #219)

Aplikacja, z `26b` jako punktem wyjścia dla kart liczników i terminów. Warianty 27A-C
są GENEROWANE z matki 27 (bloki `@hero`/`@watch`/`@counters`/`@upcoming`), więc dzielą
z nią arkusz stylów co do bajtu; 25C powstaje ze skrzynki 25 tą samą drogą:

- **`27-samolot`** - w locie, obserwowana, komplet bloków i oba wykresy z kursorem
  na jednym z nich;
- **`27a-samolot-wolna`** - wolna, nieobserwowana, z najbliższym terminem;
- **`27b-samolot-wylaczona`** - wyłączona z użytku, przegląd z terminem;
- **`27c-samolot-offline`** - brak połączenia (wzorzec 21B);
- **`25c-powiadomienia-samolot`** - skrzynka z pięcioma rodzajami z §5, w tym wiersz
  z adnotacją „zapis dotarł" i wiersz „poza planem" bursztynem;
- **`21`** dostaje ramkę z afordancją na nagłówku wiersza maszyny (szewron, jak przy
  wierszach prowadzących w głąb na 26);
- **`13c-ustawienia-obserwowane`** (trzecia tura) - Ustawienia z sekcją „Obserwowane
  samoloty" po motywie: cała flota z przełącznikami, profil technika.

Panel: **`piloci-konto`** - sekcja zakresu z nową pozycją i nowym opisem zestawu
„Akceptujący"; **`konto`** (trzecia tura) - karta „Obserwowane samoloty" z listą floty
jako przełącznikami `.opt` (§6.6, §7.2).

Panele „Warianty tego ekranu", wpisy w `index.html`, zero martwych linków - jak przy
każdej rodzinie.

### 6.6 Lista obserwowanych i zarządzanie: Ustawienia (13C) i Moje konto (decyzja 12)

Karta maszyny jest wejściem W JEDNĄ maszynę. Mechanik obserwujący trzy samoloty musiałby
otworzyć trzy karty, a przeglądu „co obserwuję" nie miałby nigdzie - stąd lista w dwóch
miejscach, które są O OSOBIE, nie o maszynie:

- **Ustawienia (13), sekcja „Obserwowane samoloty"** po motywie, przed synchronizacją:
  **CAŁA flota klubu bieżącego**, każdy wiersz ze znakiem, typem, STANEM TERAZ w podpisie
  (ten sam rachunek `aircraftNow`, co hero karty) i przełącznikiem. Wiersz ma dwa cele:
  lewa część prowadzi w kartę 27, przełącznik zapisuje obserwowanie na serwerze wprost -
  ten sam zapis, co karta-przełącznik na 27. Cała flota, nie „tylko obserwowane +
  dodaj": zarządzać znaczy włączać I wyłączać, a do włączenia trzeba widzieć maszyny,
  których się jeszcze nie obserwuje (decyzja właściciela 2026-09-25). Sekcja istnieje
  WYŁĄCZNIE przy zdolności `fleet.watch` - pilot bez niej jej nie widzi (brak sekcji,
  nie sekcja wyszarzona); bit `viewer.watch` dojeżdża w odpowiedzi listy. **Wymaga
  sieci** jak cały moduł: bez połączenia w miejscu listy stoi jedno zdanie w tonie
  ostrzeżenia, a reszta ustawień działa jak zawsze - PIN, motyw i synchronizacja nie
  potrzebują tej listy do niczego. Makieta `13c`.
- **Panel, `#/konto`, karta „Obserwowane samoloty"**: ta sama lista floty klubu bieżącej
  sesji jako przełączniki `.opt` z rolą checkbox (komponent, którym karta członka nadaje
  zdolności), zaznaczony = obserwuję, zapis od razu, BEZ audytu - to decyzja osoby
  o sobie, jak motyw. Karta stoi w `#/konto`, bo to jedyny ekran panelu o osobie
  patrzącej; widzą ją Koordynator lotów, Technik i Administrator, Akceptujący bez panelu
  zarządza z aplikacji. Powiadomienia i tak przychodzą na telefon - panel niesie samą
  listę, a podpis pod kartą to mówi. Makieta `konto`.

Czego tu NIE MA: listy obserwujących na karcie SAMOLOTU w module Samoloty („kto dostanie
powiadomienie o tej maszynie") - to pytanie administratora o cudze ustawienia; wraca,
gdy ktoś o nie poprosi (§7.2).

## 7. API

### 7.1 Telefon (token klubu, brama członkostwa, `fleet.watch`)

| Trasa | Odpowiedź | Odmowy |
| --- | --- | --- |
| `GET /aircraft/:id/card` | `{ timezone, aircraft, now, counters, facts, upcoming[], series: { mh[], fuel[] }, watching, viewer: { watch: true } }` | 401 · 403 bez `fleet.watch` (`required`) · 404 cudza albo nieznana maszyna |
| `GET /aircraft/:id/operations?beforeAt=&beforeUuid=&limit=` | strona historii, kursor PARĄ jak w skrzynce (chwila operacji + uuid); bez dolnej granicy czasu (P5) | jak wyżej; kursor niepełny 400 |
| `PUT /aircraft/:id/watch` | 204, idempotentne | jak wyżej |
| `DELETE /aircraft/:id/watch` | 204, idempotentne | jak wyżej |
| `GET /aircraft/watches` (decyzja 12) | `{ timezone, viewer: { watch }, items: [{ aircraftId, watching, now }] }` - cała flota klubu z tokenu ze stanem `aircraftNow` per maszyna; materiał sekcji 13C | 401 · 403 bez `fleet.watch` |

`GET /bookings` (okno kalendarza) i `GET /bookings/:id/preview/aircraft` dokładają bit
`viewer.watch` (§6.1). `GET /me/notifications` nie zmienia się: nowe rodzaje jadą
przez `kind`/`payload`, a `day` liczy się z `startsAt` tam, gdzie wiadomość mówi
o terminie (1, 2, 5); wiadomości o operacji (3, 4) niosą `at` w UTC i `day` mają `null`
- dwa zegary jak wszędzie.

Rachunek karty składa `application/common/queries/aircraftCard.ts` z tych samych
klocków, co `decisionPreview.ts` (`aircraftFacts`, `pickHandover`, `clubDays`) plus
`aircraftNow` i serie. Podgląd 26B ZOSTAJE osobną trasą z własną bramą: tam pyta się
o sprawę („· ta sprawa" na liście, `overlaps`), tu o maszynę.

### 7.2 Panel

Katalog: pozycja `fleet.watch` w `dto.ts` (lustro unii - `mirrors.test.ts`), w `scope.ts`
i w opisach zestawów. **Do tego, od decyzji 12, karta „Obserwowane samoloty" w `#/konto`**
(§6.6) na trasach sesji klubu:

| Trasa | Odpowiedź | Zdolność |
| --- | --- | --- |
| `GET /admin/api/me/watches` | jak `GET /aircraft/watches` telefonu - flota klubu sesji ze stanem i `watching` | `fleet.watch` |
| `PUT` / `DELETE /admin/api/me/watches/:aircraftId` | 204, idempotentne, BEZ wpisu w `admin_audit` (ustawienie osoby o sobie) | `fleet.watch` |

Trasy siedzą pod `/me/`, obok sesji i konta, bo pytają o osobę patrzącą, nie o klub;
cudza maszyna to 404 (epik C). Czego panel NIE dostaje: listy obserwujących na karcie
samolotu w module Samoloty - pytanie administratora o cudze ustawienia, wraca, gdy ktoś
o nie poprosi.

## 8. Aplikacja - co się zmienia

- **ekran** `AircraftCardScreen.tsx`, trasa `Aircraft: { aircraftId }` w `RootNavigator`;
  logika w `logic/aircraftCard.ts` (napisy, grupy wierszy, stan teraz - czysta, testy)
  i `logic/aircraftSeries.ts` (geometria wykresów - czysta, testy);
- **wykresy** na `TrackPolyline` z gestami z profilu śladu: `useChartGesture`
  i `logic/mapViewport.ts` bez zmian, kursor i zoom w poziomie, podpis kursora ze
  źródłem punktu (§6.4);
- **hook** `useAircraftCard` na wzorcu okna kalendarza: `undefined` = skeleton, `null`
  = „nie wiem teraz", ponowienie co 60 s przy `null`; drugi hook na strony historii;
- **skrzynka** (`logic/inbox.ts`): pięć nowych gałęzi z tytułami RZECZOWNIKIEM
  („Uruchomienie · SP-AXA", „Zdana · SP-AXA", „Zbliża się lot · SP-AXA", „Odwołany lot
  · SP-AXA", „Nie odebrano · SP-AXA"), podpis z pilotem i czasem, wiersz `reason`
  z odczytami przy „zdana", z „poza planem" bursztynem przy uruchomieniu, z „zapis
  dotarł …" przy zwłoce ponad kwadrans; `opens: 'aircraft'`;
- **tapnięcie** (`logic/pushTarget.ts`, `usePushNavigation`): pięć rodzajów → `Aircraft`;
- **kalendarz**: nagłówek wiersza maszyny jako `Pressable` przy `viewer.watch`;
- **zgoda na powiadomienia**: trzeci moment (`'watching'`) w `logic/pushOptIn.ts`
  - po włączeniu obserwowania (z karty 27 ALBO z sekcji w Ustawieniach);
- **Ustawienia (13)**: sekcja „Obserwowane samoloty" (decyzja 12) - `useAircraftWatches`
  na wzorcu okna kalendarza (`null` = zdanie o braku połączenia w miejscu listy), wiersze
  z `logic/watchList.ts` (znak, typ, podpis stanu z `aircraftNow`), przełącznik na tym
  samym `setAircraftWatch`; sekcja renderuje się wyłącznie przy `viewer.watch`;
- **port serwera**: `fetchAircraftCard`, `fetchAircraftOperations`, `fetchAircraftWatches`,
  `setAircraftWatch`.

Schemat SQLite telefonu NIE ROŚNIE: cache'u nie ma (§2.2).

## 9. Etapy i kolejność realizacji

Numeracja **O** (obserwowanie). Wszystko wchodzi do milestone'u **„Panel admina 3.2.0"**
(decyzja 6) i jedzie razem z P-W.

```
O-A projekt i makiety ──┬─► O-C aplikacja: karta, wykresy, skrzynka ─┐
                        │                                             ├─► P-W wydanie 3.2.0
O-B serwer: migracja 15, port, producenci, trasy ─┴─► O-D panel: katalog zdolności ─┘
```

1. **O-A - projekt i makiety** (design-first, blokuje O-C): makiety z §6.5. Decyzje
   z §1 i §11 zapadły 2026-09-25 w komplecie, więc epik zaczyna się od rysowania.
2. **O-B - serwer**: migracja 15 (§4, sam DDL, bez backfillu); `AircraftWatchesPort`
   i adapter; `watchersOf` w SQL-u; pięć treści w `notify/aircraftNotices.ts` (czyste,
   testowane brzmieniem, jak `bookingNotices.ts`); producenci: ingest (§5.3, §5.4),
   komendy rezerwacji telefonu i panelu (§5.2), `sessionClose`/`void` panelu (§5.4),
   trzecie pytanie zadania okresowego (§5.1, §5.5) ze stałą 60 min w `policy.ts`;
   `aircraftNow` i serie w domenie; zapytanie karty i historii (bez dolnej granicy
   czasu); pięć tras telefonu (z listą floty ze stanem, decyzja 12) + dwa bity `viewer.watch`
   + trzy trasy panelu pod `/admin/api/me/watches`; przypadki izolacji dla każdej
   trasy. Może iść RÓWNOLEGLE z O-A.
3. **O-C - aplikacja**: po O-A i O-B. Ekran 27 z wariantami, wykresy z kursorem
   i przybliżeniem, skrzynka, tapnięcie, wejście z kalendarza i z 26B, zgoda na
   powiadomienia, sekcja „Obserwowane samoloty" w Ustawieniach (13C, decyzja 12).
4. **O-D - panel**: katalog i opisy zestawów (lustro unii) oraz karta „Obserwowane
   samoloty" w `#/konto` (decyzja 12) - po O-B.
5. **Wydanie - w P-W 3.2.0**, z JEDNĄ zmianą wobec `docs/panel-3.2.md` §11: aplikacja
   pilota DOSTAJE aktualizację OTA na runtime 3.1.0 (bez podbicia `version` - moduł
   natywny się nie zmienia). Kolejność: serwer z migracją 15 i panel PRZED OTA;
   telefony na 3.0.0 nic nie dostają, bo i tak potrzebują APK 3.1.0. Podręcznik:
   strona „Karta samolotu i obserwowanie" w rozdziale rezerwacji, akapit w stronie
   powiadomień i w stronie zakresów uprawnień; changelog.

| Epik | Issue |
| --- | --- |
| O-A projekt i makiety | #219 |
| O-B serwer | #220 |
| O-C aplikacja | #221 |
| O-D panel | #222 |
| zgłoszenie nadrzędne | #205 (milestone „Panel admina 3.2.0") |

## 10. Ryzyka

| # | Ryzyko | Co z nim robimy |
| --- | --- | --- |
| R1 | **Hałas** - dzień skokowy na trzech maszynach to kilkanaście wiadomości | Ziarno = operacja (§2.4), sprawca wykluczony (§5), obserwowanie opt-in per maszyna. Jeśli testy pokażą, że to za dużo, wraca decyzja o rodzajach - nie kolumna |
| R2 | **Zwłoka zapisu** - „uruchomiona" godzinę po fakcie czyta się jak teraz | Czas z rejestru w każdej wiadomości, adnotacja „zapis dotarł", zbiorcza paczka daje tylko „zdana" (§2.3) |
| R3 | **Członkostwa testowe z dawnym zbiorem zestawu** czytają się po wdrożeniu jako „Własny zakres" | Przyjęte decyzją właściciela (§3.2): baza nie ma prawdziwych klubów, zakresy nadaje się od nowa. Reguła backfillu na żywej bazie zapisana na przyszłość w `docs/uprawnienia.md` §12 |
| R4 | **Ingest to gorąca ścieżka** | `watchersOf` woła się wyłącznie przy przyjętym `engine_start`/`day_close` i per maszyna; `wake` po commicie i nigdy nie rzuca |
| R5 | **Wykres z gestami bez modułu natywnego** | Ten sam renderer i te same gesty, co profil śladu - mechanizm sprawdzony na urządzeniu od issue #47; geometria serii w czystym module z testami, kadr w `mapViewport.ts` z testami, które już są |
| R6 | **Klub przy tapnięciu w push** - luka istniejąca od R-J: powiadomienie z klubu B przy aktywnym klubie A otworzy ekran, który odpowie 404 | Rozwiązać RAZEM dla rezerwacji i maszyn w O-C: `payload.orgId` + porównanie z klubem aktywnym; klub inny → skrzynka z komunikatem „przełącz klub w ustawieniach". Rejestr nie ma jak tego obejść (§6 wielofirmowości: przełączenie wymaga sieci) |
| R7 | **3.2.0 dostaje OTA aplikacji** wbrew zdaniu „aplikacji nie rusza" | Zapisane w tym dokumencie (§9) i w `docs/panel-3.2.md` §11 jako uzupełnienie z datą |
| R8 | **`Akceptujący` z dwiema rzeczami** w zestawie | Opis zestawu w panelu nazywa obie; decyzja właściciela, nie przeoczenie |

## 11. Decyzje wąskie - rozstrzygnięte 2026-09-25 (druga tura)

- ~~**P1 - backfill czterech zestawów co do zbioru**~~ - **rozstrzygnięte: BEZ
  backfillu.** Właściciel: „jeszcze nie używaliśmy aplikacji, więc tak jakby startujemy
  od zera". Migracja 15 to sam DDL; członkostwa testowe z dawnym zbiorem czytają się
  jako „Własny zakres", dopóki administrator nie nada zakresu od nowa (§3.2). Reguła
  na żywą bazę zostaje w `docs/uprawnienia.md` §12.
- ~~**P2 - co obserwujący widzi z CUDZEJ rezerwacji**~~ - **rozstrzygnięte: to samo,
  co w kalendarzu** (§6.2 pkt 5). Poszerzenie widza `bookingWire` o `fleet.watch` nie
  wchodzi; wraca, gdy mechanik powie, że do przygotowania maszyny potrzebuje zadania.
- ~~**P3 - wykresy statyczne**~~ - **rozstrzygnięte ODWROTNIE: z kursorem
  i przybliżeniem od razu** (§6.4), mechanizm profilu śladu.
- ~~**P4 - stała „60 minut"**~~ - **rozstrzygnięte: stała** w `policy.ts`, do
  kalibracji (§5.1).
- ~~**P5 - historia sięga po wszystkie operacje**~~ - **rozstrzygnięte: tak**, stronami
  (§6.2 pkt 7); wykres zostaje przy 90 dniach.

## 12. Odrzucone warianty - nie wracać

| Wariant | Dlaczego odrzucony |
| --- | --- |
| **Obserwowanie jako zdarzenie rejestru** (`watch_start` w outboksie) | Rejestr opisuje fakty jednego piszącego o operacji; obserwowanie jest ustawieniem osoby o cudzej maszynie - ta sama granica, którą §2.1 rezerwacji postawiło zamiarowi |
| **Cache karty maszyny na telefonie** | §2.2 - liczniki z cache wyglądają na stan maszyny; ta sama decyzja, co przy kalendarzu i skrzynce (2026-09-22) |
| **Powiadomienie na każdy start i lądowanie** | §2.4 - dzień skokowy dałby dwadzieścia budzików o jednej rzeczy |
| **„Lot się rozpoczął" = przejęcie samolotu** | Decyzja właściciela 2026-09-25: uruchomienie silnika |
| **Wpis ręczny rodzi „zdana"** | Decyzja właściciela 2026-09-25: milczy |
| **Wybór rodzajów powiadomień per maszyna** | §5.6 - konfiguracja bez zamówienia; wraca decyzją po testach, nie kolumną |
| **Gate na `fleet.manage` zamiast nowej zdolności** | Koordynator lotów floty nie zarządza; mechanik-Akceptujący nie ma nic - obu nie da się wpuścić bez oddania władzy, o którą nikt nie prosił (§3.1) |
| **Zestawy bez `fleet.watch`, tylko „Własny zakres"** | Decyzja właściciela 2026-09-25: trzy zestawy niosą obserwowanie |
| **Backfill zestawów w migracji 15** | Decyzja właściciela 2026-09-25 (druga tura): baza nie ma prawdziwych klubów, „startujemy od zera"; reguła na żywą bazę zapisana w `docs/uprawnienia.md` §12 |
| **Tylko lista i sumy zamiast wykresu** | Decyzja właściciela 2026-09-25: wykres od razu |
| **Wykresy statyczne w pierwszej wersji** | Decyzja właściciela 2026-09-25 (druga tura): kursor i przybliżenie od razu - mechanizm i tak istnieje w profilu śladu |
| **Wyprzedzenie przypomnienia jako ustawienie klubu** | Decyzja właściciela 2026-09-25: stała 60 min, bez kolumny i pola w panelu |
| **Historia na karcie tylko z 90 dni** | Decyzja właściciela 2026-09-25: wszystkie operacje stronami - to jest „historyczny log" ze zgłoszenia |
| **Wydanie w 3.1.0 albo OTA zaraz po nim** | Decyzja właściciela 2026-09-25: razem z 3.2.0 |
| **Powiadomienia o flagach i oleju w skrzynce** | To treść modułu „Do sprawdzenia" panelu (P-D); drugi kanał tych samych uwag |
| **Zbiorcze podsumowanie dnia** | Budzik dzwoni przy zdarzeniu; wieczorne podsumowanie odpowiada na inne pytanie |
| **Karta maszyny jako czwarta zakładka albo lista „Samoloty"** | Czwartej zakładki nie ma i nie będzie (§9.4 rezerwacji); wejściem jest wiersz maszyny w kalendarzu |
