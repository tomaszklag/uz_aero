# Kanał klubu: jedno połączenie na powiadomienia i odświeżanie ekranów (4.0.0)

> Dokument decyzji modułu, który powstaje RAZEM ze zleceniami (`docs/zlecenia.md`) i ich
> makietami (epik Z-A, #244), ale należy do całej aplikacji: zlecenia są jego pierwszym
> klientem, nie właścicielem. Kolejność ta sama, co zawsze - decyzje i makiety przed kodem.
>
> Stan: **7 decyzji właściciela z 2026-09-28** (§1), pytanych pojedynczo przy przeglądzie
> makiet zleceń. Odwracają pkt 42 zleceń („bez połączenia na żywo") i rozszerzają pkt 21
> i 27 z modułu zleceń na cały klub. Wydanie: **4.0.0** razem ze zleceniami (milestone
> „Zlecenia na lot 4.0.0"), epik **#246** - dawny „kanał na żywo zleceń", odtąd „Kanał
> klubu".

## 0. Skąd to się wzięło

Do 3.2.0 serwer odpowiada wyłącznie na żądania. Świeżość ekranu bierze się z trzech
mechanizmów, każdego osobno:

- **skrzynka i push** (3.1.0, `docs/rezerwacje.md` §12): skrzynka w bazie jest źródłem
  prawdy, push budzi telefon i prowadzi do właściwego ekranu. Panel skrzynki nie ma;
- **odczyt przy wejściu**: każdy ekran pyta REST, gdy się otwiera; panel dodatkowo przy
  powrocie na kartę przeglądarki;
- **pętle „co 60 s"** w aplikacji - kalendarz, skrzynka, karta samolotu i lista
  obserwowanych ponawiają odczyt, dopóki stoją w stanie „BRAK POŁĄCZENIA".

Projekt zleceń zaczął od kanału na żywo wyłącznie dla zleceń (pkt 21, 27), potem go zdjął
na rzecz pusha i odświeżania przy wejściu (pkt 42). Tego samego dnia właściciel odwrócił
kierunek słowami: *„Proponuję myśleć jakby już modułem wymiany wiadomości w klubie.
Wszelkie powiadomienia powinny iść po websocket. [...] Nie chcę pooling na każdej
karcie."* Stąd ten dokument: jeden moduł połączenia i powiadomień, do którego podpina się
każda funkcja - dziś zlecenia, kalendarz i dziennik, jutro ogłoszenia (#10) i grupy
dyskusyjne (#11).

## 1. Decyzje właściciela (2026-09-28) - nie wracać do nich w dyskusji

K1. **Moduł globalny.** Jedno połączenie na urządzenie - aplikację albo kartę panelu -
    niesie WSZYSTKIE powiadomienia i odświeżenia ekranów. Ekrany niczego nie odpytują.

K2. **Kanał tylko rozsyła, zapis zawsze RESTem.** Wiadomość w rozmowie, odpowiedź na
    zlecenie, decyzja o rezerwacji idą zwykłym zapisem: serwer sprawdza uprawnienia
    i klub, zapisuje, a potem rozsyła kanałem. Jedna droga zapisu - te same uprawnienia,
    izolacja klubów, dziennik i odporność na powtórzenie. Kanał nie jest też źródłem
    prawdy: są nim skrzynka w bazie i odpowiedzi REST.

K3. **Zakres 4.0.0.** Na żywo działają:
    - skrzynka i dzwonek - WSZYSTKIE rodzaje powiadomień;
    - zlecenia i rozmowy;
    - kalendarz z kolejką zgód (telefon i panel);
    - karta samolotu i lista obserwowanych;
    - dziennik i „Do sprawdzenia" w panelu.
    Piloci, Samoloty, Statystyki, Organizacje i Zgłoszenia błędów odświeżają się przy
    wejściu, jak dziś.

K4. **Push wyłącznie do urządzeń bez połączenia.** Serwer wie, które urządzenia są
    połączone: tam powiadomienie idzie kanałem, a push dostają tylko pozostałe (aplikacja
    w tle, tablet w szafce). Bez podwójnych banerów i z mniejszym ruchem przez Google.
    Połączenie należy do JEDNEGO klubu - tego z tokenu - więc powiadomienie z innego klubu
    tej samej osoby idzie pushem, tak jak w 3.1.0.

K5. **Przy otwartej aplikacji - własny baner w aplikacji** (makieta 25E): u góry ekranu,
    znika sam po kilku sekundach, BEZ DŹWIĘKU; tapnięcie otwiera rzecz, przesunięcie
    w górę zamyka. Nie pojawia się na ekranie, którego powiadomienie dotyczy - ten ekran
    po prostu się odświeża (pkt 43 zleceń). Ten sam baner pokazuje push odebrany przy
    otwartej aplikacji - wiadomość z innego klubu niesie nazwę klubu, a tapnięcie otwiera
    skrzynkę z instrukcją przełączenia; na liście systemowej zostaje po cichu, bo dzwonek
    liczy tylko klub aktywny.

K6. **W kokpicie łącze się rozłącza.** Serwer wysyła wtedy push, a aplikacja kładzie go
    po cichu na listę systemową i do skrzynki (pkt 44 zleceń). Kokpit nie zużywa baterii
    ani transferu na nic poza lotem; po oddaniu samolotu łącze wraca i dociąga zaległości.

K7. **Panel dostaje dzwonek i skrzynkę.** Ta sama skrzynka, co w telefonie - dzwonek
    z licznikiem w pasku górnym, lista w szufladzie, baner przy nowym powiadomieniu
    (znika sam, bez dźwięku). Przeczytane w panelu jest przeczytane w telefonie.

## 2. Zasady, których implementacja nie może złamać

- **Kanał niczego nie zapisuje** (K2). Od klienta przychodzi wyłącznie uwierzytelnienie
  i podtrzymanie połączenia. Każda czynność ma swoją trasę REST - z walidacją, bramą
  członkostwa, audytem tam, gdzie jest, i identyfikatorem klienta jako idempotencją.
- **Kanał nie jest źródłem prawdy** (K2). Zgubiona ramka niczego nie gubi: po każdym
  (ponownym) połączeniu klient odświeża to, co pokazuje, a skrzynkę czyta RESTem.
- **Dane lotu zostają offline-first.** Rejestr zdarzeń, kolejka wysyłki, odtwarzanie
  (`GET /me/events`) i kokpit działają bez sieci jak dotąd. Kanał nie niesie zdarzeń
  rejestru i nie jest warunkiem żadnej czynności pilota (`docs/_main.md.txt` §4.1).
- **Sygnał zmiany nie niesie treści.** „Zlecenie X się zmieniło" - a ekran pobiera kartę
  RESTem. Kształt danych zależy od patrzącego (adresat nie widzi innych adresatów, cudza
  rezerwacja jedzie wąsko - `docs/rezerwacje.md` §17), więc liczy go WYŁĄCZNIE REST;
  druga kopia tej reguły w kanale byłaby pierwszym miejscem, w którym się rozjedzie.
- **Powiadomienie i wiadomość w rozmowie jadą w całości.** Pozycja skrzynki jest liczona
  dla konkretnego odbiorcy, a odbiorców rozmowy zna się z góry - tu nie ma czego liczyć
  drugi raz, a liczy się natychmiastowość.
- **Odbiorców wyznacza serwer.** Klient niczego nie subskrybuje: serwer wysyła ramkę tym,
  którym wolno ją dostać, a klient reaguje na to, co akurat ma na ekranie. Bez protokołu
  subskrypcji nie ma czego autoryzować drugi raz.

## 3. Architektura

```
SERWER (jedna instancja)
  zapis RESTem ─► transakcja ─► commit ─► Rozdzielnik
                    └─ skrzynka (baza)      ├─► Kanał (WebSocket) ─► urządzenia połączone
                                            └─► Push (FCM) ────────► urządzenia bez połączenia
  odczyt: zawsze REST

KLIENT (aplikacja; panel tak samo)
  Łącze: jedno połączenie
    ├─ notification      ─► skrzynka, dzwonek, baner
    ├─ changed           ─► ekran pokazujący temat pobiera go RESTem
    └─ ponowne połączenie ─► odświeżenie tego, co widać (zamiast odpytywania)
```

### 3.1 Serwer

- **Rejestr połączeń** (`LivePort` w `application/common/ports.ts`, adapter w pamięci
  procesu w `infrastructure/live/`). Połączenie zna OSOBĘ, KLUB (z tokenu albo sesji
  panelu) i SESJĘ LOGOWANIA (`login_sessions`, claim `sid`). Port: dostarcz ramkę
  osobie / odbiorcom w klubie, powiedz, które sesje są połączone, zamknij połączenia
  sesji / członkostwa / osoby z powodem.
- **Dwa wejścia, jedna koperta** (wtyczka `@fastify/websocket`, wyłącznie host aplikacji -
  `hostSplit.ts`):
  - `GET /live` - telefon. Token klubu w **PIERWSZEJ RAMCE** (`auth`), nigdy w adresie -
    adres ląduje w dziennikach żądań. Bez `auth` w 5 s - zamknięcie. Brama członkostwa
    ta sama, co w REST (`authorizeMember`: aktywne członkostwo, sesja nieunieważniona);
  - `GET /admin/api/live` - panel. Ciasteczko sesji przy nawiązaniu + **ŚCISŁE
    sprawdzenie `Origin`** z `PUBLIC_BASE_URL`: strażnik CSRF panelu pilnuje metod zapisu,
    a nawiązanie połączenia jest GET-em - bez tego obca strona otworzyłaby kanał
    ciasteczkiem zalogowanego administratora (Cross-Site WebSocket Hijacking). Brama
    `authorizeOrg`. Sesja platformowa kanału w 4.0.0 nie ma (K3 - moduły platformy
    odświeżają się przy wejściu).
- **Rozdzielnik powiadomień.** `Notifier.record` bez zmian (w transakcji, skrzynka jest
  źródłem prawdy). `Notifier.wake` - po commicie, nigdy nie rzuca - staje się
  rozdzielnikiem (K4): dla każdej pozycji skrzynki wysyła ramkę `notification` do
  połączonych sesji ODBIORCY, a push do jego tokenów (`push_tokens`, przypiętych do
  sesji), których sesja połączona NIE jest. Istniejący producenci (zgody, obserwowanie
  samolotu, zlecenia) nie zmieniają ani linijki.
  - **„Połączona" znaczy: połączona W KLUBIE POWIADOMIENIA.** Sesja logowania i łącze
    należą do jednego klubu (przełączenie klubu zakłada nową sesję), a token push jest
    przypięty do sesji. Powiadomienie klubu B dla osoby połączonej w klubie A idzie więc
    pushem, jak w 3.1.0, a telefon postępuje z nim tak samo, jak wtedy
    (`docs/obserwowanie-samolotu.md` §10, R6): baner z nazwą klubu, tapnięcie otwiera
    skrzynkę z instrukcją przełączenia. Ramka tego nie zastąpi: znikający baner nie
    zostawiłby żadnego śladu - dzwonek liczy tylko klub aktywny, a wiadomość z listy
    systemowej zostaje do tapnięcia. Przy okazji kanał nigdy nie niesie danych innego
    klubu niż ten, którym się uwierzytelnił (§5).
- **Sygnały zmian** (`LiveSignals.changed(orgId, topics, audience)`) - po commicie, obok
  budzika. Każda funkcja ogłasza SWOJE tematy (§4), a odbiorców wyznacza jednym z trzech
  sposobów: cały klub, konkretne osoby, posiadacze zdolności (liczone na aktywnych
  członkostwach - ta sama reguła, co `watchersOf` obserwowania). Ramki `changed` trafiają
  wyłącznie do połączeń TEGO klubu.
- **Zamykanie** w tych samych miejscach, które dziś unieważniają dostęp: unieważnienie
  sesji (`revoke`, `revokeAll` - 2.1.0 H-C), wyłączenie członkostwa, blokada osoby,
  wyłączenie klubu. Ramka `bye` niesie powód (`session_revoked`, `membership_disabled`,
  `token_expired`), a klient robi to, co robi dziś przy takiej odmowie REST.
- **Podtrzymanie**: ping serwera co 25 s (pośrednicy hostingu zamykają bezczynne
  połączenia), zamknięcie po dwóch cyklach bez odpowiedzi.
- **Skalowanie**: rozsyłanie w pamięci procesu wystarcza przy jednej instancji
  (`docs/architektura-panelu-serwer.md` §8.8). Druga instancja = adapter portu na
  `LISTEN/NOTIFY` Postgresa; żadna funkcja nie zna implementacji.

### 3.2 Ramki

Koperta `{ v: 1, type, … }` - ogólna: nowy moduł dokłada swój rodzaj ramki, nie nowe
połączenie.

| Kierunek | Ramka | Treść |
| --- | --- | --- |
| serwer → klient | `hello` | po uwierzytelnieniu: sesja, czas serwera |
| serwer → klient | `notification` | klub + pozycja skrzynki w kształcie REST + liczba nieprzeczytanych |
| serwer → klient | `changed` | klub + tematy, bez treści |
| serwer → klient | `message` | wiadomość w rozmowie w kształcie REST (zlecenie, adresat wątku) |
| serwer → klient | `read` | odczytanie rozmowy (kto, kiedy) - „Odczytane 14:05" |
| serwer → klient | `bye` | powód zamknięcia |
| klient → serwer | `auth` | wyłącznie telefon, pierwsza ramka: token klubu |
| oba kierunki | `ping` / `pong` | podtrzymanie |

Nic więcej od klienta (K2). Ramka o nieznanym typie jest ignorowana po obu stronach -
starszy telefon nie wywraca się na nowym rodzaju ramki, tak jak nieznany rodzaj
powiadomienia idzie do skrzynki (reguła z 3.1.0).

### 3.3 Aplikacja pilota

- **Jeden plik zna WebSocket**: `infrastructure/live/liveSocket.ts` - exact-list
  w `architecture.test.ts`, ta sama reguła, co `expoNotifications.ts` i `otaUpdate.ts`.
  `WebSocket` jest wbudowany w React Native - bez modułu natywnego.
- **Kiedy łącze działa** (reguła jako czysta funkcja z testem): aplikacja na wierzchu,
  jest poświadczenie klubu i pilot NIE trzyma samolotu (K6). Zejście w tło albo wejście
  do kokpitu zamyka połączenie od razu - serwer natychmiast wie, że push ma iść
  (K4). Wznowienie z rosnącym odstępem i losowym rozrzutem (bez burzy połączeń po
  restarcie serwera); wygasły token → odświeżenie pary tokenów i ponowne połączenie;
  `bye session_revoked` → istniejąca ścieżka zdalnego wylogowania (2.1.0, `auth_revoked`).
- **Szyna** (`LiveBus`, czysta, w warstwie aplikacji): rozdziela ramki na funkcje.
  Funkcja podpina się jednym hakiem - `useLiveTopic(tematy, odśwież)` - i nic więcej o
  kanale nie wie. Skrzynka i licznik przy dzwonku dostają `notification` wprost.
- **Po (ponownym) połączeniu** każdy zamontowany ekran z hakiem odświeża się sam, a pętle
  `RETRY_MS` (60 s) w `useCalendar`, `useInbox`, `useAircraftCard` i `useAircraftWatches`
  znikają: ekran „BRAK POŁĄCZENIA" wraca w chwili, w której wraca łącze.
- **Baner w aplikacji** (K5, makieta 25E) - jeden komponent nad nawigacją:
  - dwa źródła, jeden wygląd: ramka `notification` oraz push odebrany przy otwartej
    aplikacji (wiadomość z innego klubu albo chwila bez łącza) - ten drugi zostaje też po
    cichu na liście systemowej;
  - u góry ekranu, znika po ok. 5 s, przesunięcie w górę zamyka, bez dźwięku;
  - tapnięcie prowadzi tam, gdzie tapnięcie w push (`pushTarget` - jedna mapa rodzaj →
    ekran dla obu dróg);
  - NIE pojawia się na ekranie, którego dotyczy (karta tego zlecenia, rozmowa tego
    wątku) - ten ekran się odświeża; ani w kokpicie (tam łącza nie ma, K6);
  - kilka powiadomień naraz: widać ostatnie, licznik przy dzwonku mówi resztę;
  - wiadomość z innego klubu niesie nazwę klubu nad tytułem, a tapnięcie otwiera skrzynkę
    z instrukcją przełączenia (R6) - rzeczy z innego klubu telefon nie otworzy.
- **Push** bez zmian po stronie aplikacji (`usePushNavigation`, kanał Androida). Zmienia
  się tylko to, że serwer nie wysyła go na urządzenie połączone. W kokpicie push przychodzi
  i jest wyciszony (pkt 44 zleceń).

### 3.4 Panel

- **Jeden moduł zna WebSocket** (`admin/src/live/`), jedno połączenie na kartę
  przeglądarki (bez `SharedWorker` w 4.0.0), wyłącznie w sesji klubu.
- **`changed` → unieważnienie zapytań**: mapa temat → klucze `queries/keys.ts`, wywołanie
  `invalidateQueries`. React Query pobiera tylko to, co jest na ekranie - reszta
  odświeży się przy wejściu, jak dziś. Zero odpytywania.
- **Dzwonek i skrzynka** (K7, makieta `design/panel/powiadomienia.html`): dzwonek w pasku
  górnym ram KLUBU, przed nazwiskiem zalogowanego; licznik wyłącznie przy liczbie
  dodatniej (reguła SyncChipa). Szuflada „Powiadomienia" BEZ własnego adresu (skrzynka
  jest osobista - wklejony link nie miałby czego otworzyć u drugiej osoby) - te same
  rodzaje i ten sam kształt pozycji, co skrzynka telefonu (25, 25C, 25D): nowe z zieloną
  krawędzią,
  „Do decyzji" przy prośbach o zgodę, wiersz prowadzi do rzeczy (zlecenie → szuflada
  zlecenia, prośba o zgodę → kolejka decyzji, samolot → karta samolotu w module
  Samoloty). Baner (toast) w LEWYM DOLNYM rogu obszaru treści - w prawym górnym stoją
  akcje strony i nagłówek otwartej szuflady z jej „×", w prawym dolnym stopka szuflady
  z akcją główną; znika sam, bez dźwięku, kursor na nim wstrzymuje odliczanie, „×" nie
  ma. Nie pojawia się nad szufladą, której dotyczy, ani przy otwartej skrzynce.
- **REST panelu**: `GET /admin/api/me/notifications` i `POST
  /admin/api/me/notifications/:id/read` - ta sama `NotificationQueries`, co telefon
  (skrzynka należy do osoby w klubie, nie do powierzchni).
- **CSP**: `connect-src 'self'` w polityce panelu obejmuje `wss:` tego samego hosta
  w przeglądarkach docelowych (CSP poziomu 3) - do sprawdzenia w Z-D; inaczej jawny adres.

## 4. Co idzie kanałem w 4.0.0 (K3)

| Funkcja | Ramka / temat | Kto dostaje | Gdzie |
| --- | --- | --- | --- |
| Skrzynka i dzwonek | `notification` (wszystkie rodzaje) | adresat powiadomienia | telefon, panel |
| Zlecenia - karta | `changed order:<id>` | autor, adresaci niewykreśleni, przydzieleni, `reservations.manage` | telefon (28, 32), panel (ZL3) |
| Zlecenia - listy i karta „Zlecenia" | `changed orders` | ci sami, per osoba | telefon (20F, 30), panel (ZL1) |
| Rozmowy | `message`, `read` | uczestnicy wątku, czytający z `reservations.manage` | telefon (29), panel (wątek) |
| Kalendarz | `changed calendar:<doba klubu>` | cały klub | telefon (21, Pulpit), panel (K1) |
| Rezerwacja i jej ścieżka zgód | `changed booking:<id>` | cały klub | telefon (23, 26), panel (K2, K5) |
| Karta samolotu, obserwowane | `changed aircraft:<id>` | posiadacze `fleet.watch` | telefon (27, 13C), panel (`#/konto`) |
| Dziennik | `changed log:<doba UTC>`, `changed session:<uuid>` | posiadacze `panel.access` | panel (L1–L3) |
| Do sprawdzenia | `changed attention` | posiadacze `panel.access` | panel (moduł i licznik w kolumnie) |

Czego kanał w 4.0.0 NIE obejmuje: Piloci, Samoloty, Statystyki, Organizacje, Zgłoszenia
błędów (K3); sesja platformowa; ekrany osoby bez klubu (00C–00E - czekanie na
zatwierdzenie zostaje przy dzisiejszym sprawdzaniu); dane lotu (§2).

## 5. Bezpieczeństwo

- **Uwierzytelnienie**: telefon - token w pierwszej ramce, 5 s na `auth`; panel -
  ciasteczko + ścisłe `Origin`. Obie drogi przez te same bramy członkostwa, co REST.
- **Izolacja klubów**: ramka niesie wyłącznie dane klubu, którym połączenie się
  uwierzytelniło - powiadomienie z innego klubu tej samej osoby idzie pushem (§3.1);
  `changed` wyłącznie do połączeń klubu, którego dotyczy; `notification` wyłącznie do
  adresata; `message`/`read` wyłącznie do uczestników
  i czytających z `reservations.manage` W TYM klubie. Rejestr tras (`app.routeCatalog`)
  widzi `/live` i `/admin/api/live` jak każdą trasę, więc `tenantIsolation.test.ts` wymaga
  dla nich przypadków: sygnał cudzego klubu nie dochodzi, wątek cudzego klubu nie dochodzi.
- **Zamykanie** przy każdym odebraniu dostępu (§3.1) - połączenie nie przeżywa
  wylogowania zdalnego ani wyłączenia członkostwa.
- **Od klienta tylko dwie ramki** (K2): limit rozmiaru i tempa; wszystko inne zamyka
  połączenie.
- **Push dalej bez nazwisk i godzin** (ekran blokady widzi każdy) - treść idzie kanałem
  wyłącznie do uprawnionych albo czeka w skrzynce.

## 6. Testy

- **Serwer**: trasy WebSocket przez `injectWS` wtyczki albo port efemeryczny;
  rozdzielnik (połączony → ramka bez pusha, niepołączony → push, połączony w innym
  klubie → push bez ramki); „kto dostaje `changed`" dla każdego tematu z §4 (osoba wykreślona i osoba
  spoza zlecenia NIE dostają); zamykanie przy unieważnieniu sesji i wyłączeniu
  członkostwa; izolacja klubów.
- **Aplikacja**: czyste funkcje - reguła „kiedy łącze działa" (na wierzchu × poświadczenie
  × kokpit), reguła banera (ekran, którego dotyczy / kokpit / inny klub / push odebrany na
  wierzchu), szyna ramek.
- **Panel**: mapa temat → klucze zapytań; licznik dzwonka (zero bez plakietki).

## 7. Co to zmienia w innych dokumentach

- **`docs/zlecenia.md`**: pkt 42 (bez połączenia na żywo) - ZMIENIONE przez K1–K7 (pkt 49);
  §11 odsyła tutaj i wymienia tematy zleceń; §12 - push tylko bez połączenia; §13 - trasy
  kanału; §18 - epik Z-E wraca jako „Kanał klubu".
- **`docs/rezerwacje.md` §12**: skrzynka zostaje źródłem prawdy; push budzi WYŁĄCZNIE
  urządzenia bez połączenia, a połączone dostają powiadomienie kanałem (§12.8).
- **`docs/obserwowanie-samolotu.md`**: pięć wiadomości obserwowania idzie rozdzielnikiem
  (kanał albo push) - bez zmian u producentów.
- **`CLAUDE.md`**: sekcja „Kanał klubu".

## 8. Etapy

Epik **#246 „Kanał klubu"** w milestone 4.0.0. Strzałka = zależność twarda.

```
KK-A makiety (w PR Z-A #251) ──┬─► KK-C aplikacja ──┐
                               │                    ├─► funkcje podpinają tematy (Z-B/Z-C/Z-D
KK-B serwer ───────────────────┴─► KK-D panel ──────┘    dla zleceń, KK-B…KK-D dla reszty K3)
```

1. **KK-A** - makiety: 25E (baner w aplikacji), `design/panel/powiadomienia.html`
   (dzwonek, szuflada, baner), dzwonek w pasku górnym wszystkich ram klubu - **zrobione
   w PR #251** razem z makietami zleceń.
2. **KK-B** - serwer: rejestr połączeń, dwa wejścia, rozdzielnik, sygnały, zamykanie,
   testy; tematy kalendarza, rezerwacji, samolotu, dziennika i „Do sprawdzenia".
3. **KK-C** - aplikacja: łącze, szyna, hak, baner, usunięcie pętli `RETRY_MS`.
4. **KK-D** - panel: łącze, mapa tematów, dzwonek i skrzynka, baner.
5. Tematy zleceń i rozmów wchodzą z epikami Z-B (serwer), Z-C (aplikacja), Z-D (panel).

## 9. Ryzyka

| # | Ryzyko | Co z nim robimy |
| --- | --- | --- |
| KK1 | Rozsyłanie w pamięci jednej instancji | Wystarcza dziś (§8.8 architektury); druga instancja = adapter `LISTEN/NOTIFY`, bez zmian w funkcjach. REST i skrzynka są źródłem prawdy, więc awaria kanału niczego nie gubi |
| KK2 | Pośrednicy hostingu zamykają bezczynne połączenia | Ping co 25 s; ponowne połączenie z rozrzutem |
| KK3 | Bateria i transfer telefonu | Łącze tylko z aplikacją na wierzchu, nigdy w kokpicie (K6); ping to kilkadziesiąt bajtów |
| KK4 | Przejęcie połączenia, token w adresie | Token w pierwszej ramce, `Origin` w panelu, zamykanie przy unieważnieniu; przegląd bezpieczeństwa w Z-W |
| KK5 | Zakres 4.0.0 rośnie (K3 - wszystkie wymienione moduły od razu) | Świadomie; termin 1 X i tak nie obejmował kodu (`docs/zlecenia.md` §19) |
| KK6 | Duplikaty (ramka + odczyt REST po ponownym połączeniu) | Pozycje skrzynki i wiadomości deduplikowane po identyfikatorze |

## 10. Odrzucone warianty

| Wariant | Dlaczego nie |
| --- | --- |
| Odpytywanie ekranów co N sekund | K1 - „Nie chcę pooling na każdej karcie" |
| Kanał wyłącznie dla zleceń | K1 - moduł klubu; zlecenia są pierwszym klientem |
| Push i odświeżanie przy wejściu, bez kanału | Pkt 42 zleceń - odwrócony przez K1 |
| Zapis przez kanał | K2 - druga droga zapisu obok REST |
| Push także do urządzeń połączonych | K4 - podwójne banery i niepotrzebny ruch |
| Wiadomość z innego klubu ramką przez łącze klubu aktywnego | K4 - znikający baner nie zostawiłby śladu (dzwonek liczy klub aktywny), a kanał niósłby dane klubu, którym się nie uwierzytelnił |
| Baner systemowy albo sam dzwonek przy otwartej aplikacji | K5 |
| Baner czekający na zamknięcie; baner z dźwiękiem | K5 - znika sam, bez dźwięku |
| Łącze w kokpicie | K6 |
| Subskrypcje tematów od klienta | §2 - odbiorców wyznacza serwer; mniej powierzchni do autoryzacji |
| Na żywo także Piloci, Samoloty, Statystyki, Organizacje, Zgłoszenia błędów | K3 |
| Wspólne połączenie kart przeglądarki (`SharedWorker`) | Poza 4.0.0 - zysk przy kilku kartach nie jest wart złożoności |
