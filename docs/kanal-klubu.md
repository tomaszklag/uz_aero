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
>
> **KK-B (serwer) WYKONANE 2026-09-30/10-01** na gałęzi `feature-246-kanal-klubu` -
> sześć etapów, każdy z testami i sondami regresji; stan, mapa plików i przepisy „jak
> dopisać temat / decyzję odbierającą dostęp" w §11. Zostają KK-C (aplikacja) i KK-D (panel).

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

K6. **W kokpicie łącze się rozłącza.** Serwer wysyła wtedy push, który trafia po cichu na
    listę systemową i do skrzynki (pkt 44 zleceń). Kokpit nie zużywa baterii ani transferu
    na nic poza lotem; po oddaniu samolotu łącze wraca i dociąga zaległości. *Uściślone
    2026-10-06 (§13): cichy kanał Androida wybiera SERWER - dla dowódcy i drugiego pilota
    operacji w toku, bo w locie ekran gaśnie, a aplikacja w tle nie ma jak wyciszyć się sama.*

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
  sesji / członkostwa / osoby / klubu z powodem, przestaw zdolności otwartych połączeń
  członka po zmianie jego zakresu.
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
- **Rozdzielnik powiadomień.** `Notifier.record` - w transakcji, skrzynka jest źródłem
  prawdy - oddaje to, co zapisał (`RecordedNotice[]`: identyfikator wiersza i jego
  chwila; przy rozmowie wiersz odświeżony), a `Notifier.wake(orgId, recorded)` - po
  commicie, nigdy nie rzuca - przyjmuje WYŁĄCZNIE takie wiadomości i jest rozdzielnikiem
  (K4): dla każdej pozycji skrzynki wysyła ramkę `notification` do połączonych sesji
  ODBIORCY, a push do jego tokenów (`push_tokens`, przypiętych do sesji), których sesja
  połączona NIE jest. Adresat spoza klubu nie dostaje wiersza, więc ani ramki, ani pusha.
  Producenci (zgody, obserwowanie samolotu, zlecenia) przekazują dalej wynik zapisu, a ich
  zachowanie się nie zmienia; awaria odczytu przed ramką kończy się pushem do wszystkich -
  dwa sygnały są lepsze niż cisza.
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
  budzika, i nigdy nie rzucają. Producent podaje FAKT (który termin, która operacja),
  a tematy i odbiorców liczy jedno miejsce: `ClubSignals` (kalendarz, rezerwacje,
  samolot, dziennik, „Do sprawdzenia") i `OrderSignals` (zlecenia i rozmowy). Odbiorców
  wyznacza się jednym z trzech sposobów: cały klub, konkretne osoby, posiadacze zdolności -
  zbiór z bramy przy nawiązaniu, przestawiany przy zmianie zakresu (zamykanie niżej).
  Ramki `changed` trafiają wyłącznie do połączeń TEGO klubu.
- **Zamykanie.** Brama sprawdza połączenie RAZ, przy nawiązaniu (REST - przy każdym
  żądaniu), więc każda decyzja, która odbiera dostęp w REST, zamyka po commicie
  połączenia, których dotyczy - `LiveAccess` jest jedynym miejscem reguły „który powód
  i który zakres". Ramka `bye` niesie powód, a klient robi to, co robi dziś przy takiej
  odmowie REST:
  - `session_revoked` - wylogowanie telefonu i panelu, własne urządzenie wyłączone
    z `#/konto`, „Wyloguj to urządzenie" i „Wyloguj wszędzie w tym klubie" z karty
    członka (tylko ten klub), zmiana hasła (wszystkie sesje POZA bieżącą) i reset hasła
    z linku (wszystkie sesje osoby, we wszystkich klubach);
  - `membership_disabled` - wyłączone członkostwo (ta sama osoba w innym klubie pracuje
    dalej) i wyłączony klub;
  - `token_expired` - połączenie nie przeżywa tokenu, którym je otwarto (telefon 1 h,
    panel 8 h): telefon odświeża parę tokenów i łączy się ponownie przez bramę, która
    widzi stan bieżący. To granica dla wszystkiego, czego serwer nie zamknął sam.

  Zmiana zakresu uprawnień NIE zamyka połączenia - członek dalej jest w klubie - tylko
  przestawia jego zdolności: ramka `message` z treścią rozmowy nie dochodzi do kogoś,
  komu odebrano prawo jej czytania. Blokady osoby na całej platformie nie ma czym wywołać
  (żadna komenda nie wyłącza `pilots.active`); gdy powstanie, zamknie połączenia zakresem
  osoby. Usunięcie członka wymaga wcześniejszego wyłączenia członkostwa, więc jego
  połączenia są już wtedy zamknięte.
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
| serwer → klient | `notification` | klub + pozycja skrzynki w kształcie REST + liczba nieprzeczytanych; `quiet: true` wyłącznie dla załogi operacji w toku (§13) |
| serwer → klient | `changed` | klub + tematy, bez treści |
| serwer → klient | `message` | wiadomość w rozmowie w kształcie REST (zlecenie, adresat wątku) |
| serwer → klient | `read` | odczytanie rozmowy (kto, kiedy) - „Odczytane 14:05" |
| serwer → klient | `bye` | powód zamknięcia: `session_revoked`, `membership_disabled`, `token_expired` |
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
  kanale nie wie. Skrzynka i licznik przy dzwonku podpinają się tak samo: ramka
  `notification` jest dla nich lokalnym tematem `inbox` i czytają po niej od nowa
  (KK-C, §13 - „Do decyzji" liczy się z kolejki, której ramka nie niesie).
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
- **Push**: tapnięcie i kanał Androida bez zmian (`usePushNavigation`); serwer nie wysyła
  go na urządzenie połączone. Przy OTWARTEJ aplikacji system nie pokazuje własnego banera
  i nie gra - zapowiada go baner aplikacji, a budzik zostaje po cichu na liście systemowej.
  W kokpicie (pkt 44 zleceń) budzik idzie cichym kanałem `quiet`, który serwer wybiera dla
  załogi operacji w toku - także przy zgaszonym ekranie (§13).

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
- **REST panelu** (wykonane w KK-B): `GET /admin/api/me/notifications` i `POST
  /admin/api/me/notifications/:id/read` - ta sama `NotificationQueries`, co telefon
  (skrzynka należy do osoby w klubie, nie do powierzchni), i ten sam kształt strony
  i odpowiedzi (`http/routes/common/inboxWire.ts`). Skrzynkę ma każdy aktywny członek,
  bez zdolności; sesja platformowa jej nie ma. Bit `approver` dostaje wyłącznie telefon -
  o zgodę na powiadomienia pyta tylko on.
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
| Dziennik | `changed log:<doba UTC przejęcia>`, `changed session:<uuid>` | posiadacze `panel.access` | panel (L1–L3) |
| Do sprawdzenia | `changed attention` | posiadacze `panel.access` | panel (moduł i licznik w kolumnie) |

Szczegóły, które ustaliła implementacja (KK-B): przesunięcie terminu i zmiana maszyny
ogłaszają OBIE doby i OBIE karty samolotu; termin przez północ KLUBU ma dwie doby,
a długie wyłączenie z użytku najwyżej 62. Przyjęcie lotu ogłasza wyłącznie operacje, do
których paczka naprawdę coś wniosła - ponowiona paczka milczy. „Odczytane" w zleceniu
rusza tylko tematy zlecenia, bo termin się nie zmienił. Odczyt i konfiguracja maszyny
z panelu ogłaszają samą kartę samolotu.

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
  wylogowania zdalnego, wyłączenia członkostwa ani klubu, zmiany hasła ani tokenu,
  którym je otwarto.
- **Od klienta tylko `auth` i `ping`/`pong`** (K2): ramka poprawnego kształtu, ale
  nieznanego typu, jest ignorowana (§3.2 - starszy serwer nie wywraca się na nowszym
  kliencie); ramka, która nie jest obiektem JSON z `type`, binarna, za duża (4 KB) albo
  za częsta (20 w 10 s) zamyka połączenie.
- **Push dalej bez nazwisk i godzin** (ekran blokady widzi każdy) - treść idzie kanałem
  wyłącznie do uprawnionych albo czeka w skrzynce.

## 6. Testy

- **Serwer** (wykonane w KK-B, pliki w §11): trasy WebSocket przez `injectWS` wtyczki
  albo port efemeryczny; rozdzielnik (połączony → ramka bez pusha, niepołączony → push,
  połączony w innym klubie → push bez ramki); „kto dostaje `changed`" dla każdego tematu
  z §4 (osoba wykreślona i osoba spoza zlecenia NIE dostają); zamykanie przy każdym
  odebraniu dostępu, z kontrolą, że połączenia spoza zakresu decyzji zostają otwarte;
  izolacja klubów. Pułapka: w `injectWS` gniazdo serwera po zamknięciu przez klienta
  dostaje `end`, ale nigdy `close` - test odłączenia z rejestru idzie na prawdziwym
  porcie, a test, który zamyka połączenie pomocnicze, nie może potem pytać rejestru
  o tę samą osobę.
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
  (kanał albo push) - producenci przekazują wynik zapisu (`record` → `wake`), ich
  zachowanie się nie zmienia.
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
   testy; tematy kalendarza, rezerwacji, samolotu, dziennika i „Do sprawdzenia" -
   **zrobione 2026-09-30/10-01** (§11).
3. **KK-C** - aplikacja: łącze, szyna, hak, baner, usunięcie pętli `RETRY_MS` -
   **zrobione 2026-10-05/10-06** (§13).
4. **KK-D** - panel: łącze, mapa tematów, dzwonek i skrzynka, baner - **zrobione
   2026-10-01/10-05** (§12).
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

## 11. KK-B - serwer (wykonane 2026-09-30/10-01, gałąź `feature-246-kanal-klubu`)

| Etap | Commit | Co weszło |
| --- | --- | --- |
| 1 | `c1bb7aa3` | rejestr połączeń w pamięci procesu i koperty ramek |
| 2 | `cb5125c6` | wejścia `GET /live` i `GET /admin/api/live` (`@fastify/websocket` 11.3.1), protokół po uwierzytelnieniu, limity 4 KB i 20 ramek na 10 s |
| 3 | `26e8d0a2` | rozdzielnik: ramka `notification` albo push (K4), `record` → `RecordedNotice[]` → `wake` |
| 4 | `575d615e` | sygnały `changed` dla tematów §4, `ClubSignals` |
| 5 | `9432a8bd` | zamykanie połączeń przy odebraniu dostępu, termin tokenu, zmiana zakresu |
| 6 | `13a97c65` | skrzynka panelu przez REST, wspólny kształt z telefonem |

**Mapa plików serwera**:

- `application/common/ports.ts` - `LivePort` (połączenia) i `LiveSignalsPort` (sygnały),
  `LiveFrame`, `LivePeer`, `LiveCloseScope`, `LiveByeReason`;
- `infrastructure/live/liveRegistry.ts` - jedna klasa w obu rolach, w pamięci procesu;
  druga instancja serwera wymieni ją na adapter `LISTEN/NOTIFY` (KK1);
- `application/common/live/` - `frames.ts` (koperty ramek), `topics.ts` (nazwy tematów),
  `liveAccess.ts` (zamykanie przy odebraniu dostępu: powód i zakres);
- `application/common/notify/` - `notifier.ts` (rozdzielnik), `inboxItem.ts` (pozycja
  skrzynki - ten sam kształt w REST i w ramce), `clubSignals.ts` (kalendarz, rezerwacje,
  samolot, dziennik, „Do sprawdzenia"), `orderSignals.ts` (zlecenia i rozmowy);
- `http/routes/mobile/live.ts` i `http/routes/admin/live.ts` - wejścia (różnią się
  WYŁĄCZNIE tym, jak połączenie dowodzi tożsamości), `http/routes/common/liveConnection.ts`
  - protokół po uwierzytelnieniu (powitanie, ping, termin tokenu, odbiór ramek),
  `liveRate.ts` - tempo ramek;
- `http/routes/common/inboxWire.ts` i `http/routes/admin/meNotifications.ts` - skrzynka
  panelu.

**Testy serwera**: `liveRegistry.test.ts` (rejestr), `liveRoutes.test.ts` (wejścia
i protokół), `notificationDelivery.test.ts` (rozdzielnik), `liveTopics.test.ts` (kto
dostaje który temat), `liveClose.test.ts` (zamykanie i termin tokenu),
`adminNotifications.test.ts` (skrzynka panelu) oraz sondy obu wejść i skrzynki panelu
w `tenantIsolation.test.ts`. Pomocniki połączeń: `test/liveClients.ts` (`phoneLive`,
`panelLive`); atrapa sygnałów, która zapisuje i przekazuje dalej do prawdziwego rejestru:
`test/fakeLiveSignals.ts`.

**Jak dopisać temat**: nazwa w `topics.ts`, odbiorcy w `ClubSignals` (nowa metoda - nigdy
wprost z komendy), wywołanie PO commicie w producencie. `ClubSignals` jest wymaganym
parametrem konstruktora, więc kompilator wskaże każde miejsce kompozycji. Do tego przypadek
w `liveTopics.test.ts` prawdziwą trasą i sonda regresji, która go łamie.

**Jak dopisać decyzję odbierającą dostęp**: metoda w `LiveAccess` (powód i zakres w jednym
miejscu), wywołanie PO commicie i wyłącznie przy udanej decyzji, przypadek w
`liveClose.test.ts` - z kontrolą, że połączenie spoza zakresu decyzji zostaje otwarte.

## 12. KK-D - panel (wykonane 2026-10-01/10-05, gałąź `feature-246-kanal-klubu`)

| Etap | Commit | Co weszło |
| --- | --- | --- |
| 1 | `5eb626ba` | łącze: jedno połączenie na kartę w sesji klubu, `changed` → unieważnienie zapytań, wznowienie z rozrzutem i strażnik ciszy, `bye` → brama REST; proxy Vite z `Origin` serwera; CSP z jawnym `ws(s)://` |
| - | `81d41e82` | licznik „Do sprawdzenia" bez odpytywania co minutę i strażnik K1 w teście architektury |
| 2 | `caeecc4a` | dzwonek w pasku ram klubu, skrzynka w szufladzie bez adresu, ramka `notification` w pamięci skrzynki, format licznika w słowniku klubu |
| 3 | `78104626` | baner nowego powiadomienia w lewym dolnym rogu treści |

**Mapa plików panelu** (`admin/src/`):

- `live/` - `liveSocket.ts` (JEDYNE miejsce z `WebSocket`), `frames.ts`, `reconnect.ts`,
  `liveUrl.ts`, `topicKeys.ts`, `useLiveChannel.ts` (woła je `auth/ShellRoute.tsx`);
- `api/notifications.ts`, `queries/useNotifications.ts`, `queries/inboxCache.ts` - skrzynka
  w stronach i jej czyste przekształcenia (ramka, przeczytanie, kursor);
- `screens/inbox/` - `InboxDrawer.tsx`, `InboxRow.tsx` (wspólny środek `InboxRowBody`),
  `InboxToast.tsx`; czyste: `inboxRows.ts` (zdanie wiersza, ten sam słownik, co w telefonie),
  `inboxLookups.ts`, `toast.ts` (baner i jego odliczanie);
- `ui/shell/bell.ts` i dzwonek w `AppShell.tsx`; style `styles/components/inbox.css`
  (skrzynka, baner) i dzwonek w `shell.css` - klasy przeszły z `design/panel/rama.css`
  pod tymi samymi nazwami.

**Reguły, które wyszły przy wdrażaniu**:

- **przeczytanie idzie RAZ na wiadomość w wizycie**: efekt szuflady w StrictMode i odczyt
  w locie wysyłały je po trzy razy. Odczyt w locie jest wstrzymany przed zapisem w pamięci,
  a po zapisie skrzynka czyta się od nowa - przeczytanie, które nie doszło, wraca jako nowe;
- **szuflada nie rysuje wierszy bez słownika klubu i kolejki decyzji** - inaczej zdanie
  przeskakiwało z ogólnego („Prośba o zgodę na lot") na pełne. Czeka przez `pending`
  wspólnego `Loadable`, który od 2026-10-06 pod progiem plamek nie rysuje nic (wcześniej
  rysował treść i szuflada bramkowała ją sama). Skrzynka, która się nie wczytała, to
  zdanie o błędzie odczytu bez stanu pustego pod nim;
- **baner nie stoi przy otwartej skrzynce ani na ekranie, którego dotyczy** (adres rzeczy
  i adresy pod nim), a baner, który nie ma prawa stać, znika na dobre. Kursor ALBO fokus
  wstrzymuje odliczanie, zejście wznawia je od tego, co zostało. Przełączenie klubu kończy
  baner poprzedniego;
- **świeża prośba o zgodę prowadzi do kolejki decyzji**, zanim kolejka w pamięci zdąży się
  odświeżyć - serwer wysyła ją osobom kroku bieżącego;
- **kliknięcie banera otwiera rzecz i niczego nie przeczytuje** - „Nowe" gaśnie z otwarciem
  listy, jak w telefonie;
- **region `role="status"` stoi w ramie klubu zawsze**, a baner wchodzi do środka: czytnik
  ekranu ogłasza zmianę treści regionu, który już jest. To jedyna świadoma różnica wobec
  makiety PW1, która stawia rolę na samym linku;
- **słownik klubu dociąga się dopiero przy pierwszym banerze** (`useDirectory(enabled)`) -
  ekran bez banera nie płaci za niego żądaniem;
- **ramka `notification` nie przecieka między klubami**: gniazdo starego klubu milknie
  (warunek `this.socket !== socket` w każdym handlerze), zanim ruszy odczyt skrzynki nowego,
  a ramka bez pobranej skrzynki niczego nie dopisuje.

**Testy panelu**: `live/*.test.ts` (ramki, wznowienie, adres, gniazdo na atrapie, mapa
tematów), `queries/inboxCache.test.ts`, `screens/inbox/{inboxRows,inboxLookups,toast}.test.ts`,
`ui/shell/bell.test.ts` i strażnicy w `test/architecture.test.ts` (`WebSocket` wyłącznie
w `liveSocket.ts`; `live/` bez ekranów, komponentów i `api/`; zero `refetchInterval`
i `setInterval`).

**Jak podpiąć ekran pod odświeżanie na żywo**: klucz zapytania w `queries/keys.ts`, temat →
klucz w `live/topicKeys.ts` z przypadkiem w `topicKeys.test.ts`. Tematu, którego nie ma,
nie wymyśla panel - dopisuje go serwer (§11, „Jak dopisać temat").

**Jak dopisać rodzaj wiadomości w panelu**: gałąź w `screens/inbox/inboxRows.ts` z testem -
zdanie jak w telefonie (`app/src/ui/screens/logic/inbox.ts`) i adres rzeczy w `href`. Baner
bierze to samo zdanie sam (`toast.ts`).

**Sprawdzone w przeglądarce** (2026-10-01/05, tymczasowa baza): łącze przez proxy Vite i na
zbudowanym panelu z CSP; zdalne wylogowanie przenosi na logowanie; licznik i wiersz skrzynki
przychodzą ramką bez przeładowania; jedno „przeczytaj" na wiadomość; baner - pozycja i treść
jak w PW1, zniknięcie po 5 s, pauza pod kursorem z resztą odliczania, brak banera na
kolejce decyzji i przy otwartej skrzynce, ostatni z dwóch, kliknięcie otwiera kolejkę.

## 13. KK-C - aplikacja pilota (wykonane 2026-10-05/10-06, gałąź `feature-246-kanal-klubu`)

| Etap | Commit | Co weszło |
| --- | --- | --- |
| 0 | `90a02fb5` | jedno odświeżenie tokenów dla wołających naraz (`AuthService.rotate` dzieli obietnicę) - warunek łącza, które odświeża tokeny obok pętli synca |
| 1 | `82a3388a` | łącze: jedno połączenie poza kokpitem, token w pierwszej ramce, `pong`, strażnik ciszy, wznowienie z rozrzutem, `bye` → odświeżenie tokenów |
| 2 | `7fc55651` | szyna i hak `useLiveTopic`; odczyty ekranów odświeża sygnał, pętle `RETRY_MS` usunięte |
| 3 | `b4493c1f` | baner w aplikacji (25E) z ramki i z pusha odebranego na wierzchu; system przy otwartej aplikacji milczy |
| 4 | `2d69acef` | dokumentacja: ten rozdział, przepis „nowy temat kanału", podręcznik |
| 5 | `3b59acc6` | cisza w kokpicie: serwer wycisza załogę operacji w toku kanałem `quiet` (decyzje 2026-10-06) |

**Mapa plików aplikacji** (`app/src/`):

- `application/live/` - czyste: `frames.ts` (parser ramek; pozycja skrzynki w kształcie
  REST), `linkRule.ts` (`linkTarget`, `isForegroundState`), `liveLink.ts` (łącze),
  `liveBus.ts` (szyna: tematy, sklejanie serii, `onNotification` dla banera),
  `reconnect.ts`, `liveUrl.ts`, `timers.ts`;
- `application/ports/livePort.ts` - port gniazda; `infrastructure/live/liveSocket.ts`
  (`RnLiveSockets`) - JEDYNE miejsce z `WebSocket`;
- `ui/bootstrap/appBootstrap.ts` składa szynę i łącze, `useLive()` w `servicesContext.ts`;
- `ui/hooks/` - `useLiveLink.ts` (binder `LiveLinkBinder` w `App.tsx`, za bramką
  tożsamości i po `loadSession`; most „push klubu aktywnego → szyna"),
  `useAppForeground.ts`, `useLiveTopic.ts`;
- `ui/screens/logic/` - `liveRefresh.ts` (ciche odświeżenie), `aircraftOperationsPage.ts`,
  `inbox.ts` (`keepVisitNew`), `inAppBanner.ts` (treść i reguła banera), `pushTarget.ts`
  (`isActiveClubPush`);
- `ui/navigation/` - `BannerHost.tsx` (gospodarz banera nad nawigacją), `activeRoute.ts`
  (trasa na czubku stosu razem z parametrami), `openTarget.ts` (jedno otwarcie celu dla
  tapnięcia w push i w baner);
- `ui/components/status/InAppBanner.tsx` i `InboxRowContent`
  w `components/data/InboxRow.tsx` - treść wiersza skrzynki wspólna z banerem;
- `infrastructure/push/expoNotifications.ts` - handler przy otwartej aplikacji (bez banera
  systemowego i dźwięku) i `onNotificationReceived`.

**Kto czego słucha**:

| Ekran | Hak | Tematy |
| --- | --- | --- |
| Kalendarz (21), krok 1 rezerwacji (22) | `useCalendar` | `calendar` |
| Karta rezerwacji (23), decyzja (26), czekająca rezerwacja na Pulpicie (20E) | `useBooking` | `booking:<id>` |
| Skrzynka (25) | `useInbox` | `inbox`, `booking` |
| Dzwonek na Pulpicie | `useUnreadCount` | `inbox` |
| Karta samolotu (27) i jej historia | `useAircraftCard`, `useAircraftOperations` | `aircraft:<id>` |
| Lista obserwowanych (13C) | `useAircraftWatches` | `aircraft` |

**Reguły, które wyszły przy wdrażaniu**:

- **odświeżenie tokenów jest wspólne dla wołających w tej samej chwili**: serwer zużywa
  refresh atomowo, więc łącze po `bye` i pętla synca po 401 dostawały naraz dwie
  odpowiedzi, z których druga była odmową - a dla łącza odmowa znaczy „nie ma
  poświadczeń" i koniec łączenia się;
- **połączenie liczy się od powitania**, nie od otwarcia gniazda - i KAŻDE powitanie,
  także pierwsze po starcie bez zasięgu, każe podpiętym ekranom dociągnąć stan. To ono
  zastąpiło pętle `RETRY_MS`: ekran „BRAK POŁĄCZENIA" wraca razem z łączem;
- **minuta ciszy = połączenie martwe**, także przed powitaniem (zmiana sieci, uśpione
  radio); świeży token odrzucony przed powitaniem zatrzymuje łącze - resztę powie REST;
- **podpięty jest tylko ekran widoczny** (`useIsFocused`): ekran pod spodem stosu i w
  nieaktywnej zakładce czyta od nowa przy wejściu, jak dotąd;
- **odświeżenie z sygnału jest CICHE**: bez plamek, a odpowiedź, której nie było, nie
  zamienia wiedzy w niewiedzę (`quietResult`); świeża pierwsza strona historii samolotu nie
  zwija doładowanych stron; wiadomość zobaczona w skrzynce jako nowa zostaje nowa do końca
  wizyty;
- **seria sygnałów jednej zmiany to jedno odświeżenie** (250 ms, osobno dla każdego
  podpięcia); ekran odpięty w trakcie nie dostaje odświeżenia w drodze;
- **skrzynka i dzwonek czytają od nowa na ramkę `notification`**, zamiast brać jej treść
  wprost (świadoma różnica wobec §3.3 sprzed wdrożenia): plakietka „Do decyzji" liczy się
  z kolejki decyzji, której ramka nie niesie, a push odebrany na wierzchu nie niesie
  licznika - jedna droga obsługuje oba źródła, a sklejanie serii robi z niej jedno żądanie;
- **przełącznik obserwowania zostaje „zajęty", dopóki nie przyjdzie nowy stan** - zwolniony
  przed cichym odświeżeniem mignąłby starą wartością;
- **baner mówi zdaniem wiersza skrzynki, gdy je ma**: ramka niesie pozycję w kształcie REST,
  więc treść składa ta sama funkcja (`inboxRows`), bez plakietki sprawy i z „teraz". Push
  niesie tylko tytuł i identyfikatory, więc baner z pusha mówi tytułem ze znakiem maszyny
  z pamięci floty;
- **baner nie staje w kokpicie, w tle ani na ekranie rzeczy, której dotyczy** (karta tej
  rezerwacji, decyzja o niej, karta tej maszyny, otwarta skrzynka), a wejście na taki ekran
  gasi baner, który już stoi (`bannerFits`). Wiadomość z innego klubu staje zawsze, także
  nad otwartą skrzynką - jej rzeczy na tym telefonie nie widać;
- **push klubu aktywnego na wierzchu wchodzi na szynę jako ramka bez pozycji**: skrzynka
  i dzwonek odświeżają się jak od kanału, a baner pokazuje sam push (ramkę bez pozycji
  pomija), więc nie ma dwóch banerów jednej wiadomości;
- **baner stoi w nawigatorze, czyli za bramką tożsamości** - nad zamkiem PIN-u pokazałby
  treść komuś, kto telefonu nie odblokował; arkusze żyją we własnych oknach i zostają nad
  nim;
- **jedno otwarcie celu** (`openTarget`): tapnięcie w push i w baner idą tą samą drogą, cel
  liczy jedna mapa (`pushTarget`).

**Cisza w kokpicie - rozstrzygnięte 2026-10-06** (decyzje właściciela, pkt 44 zleceń; do
tego dnia stało tu jako „Otwarte"): w locie ekran telefonu zwykle gaśnie - aplikacja nie
trzyma go włączonego - więc aplikacja jest w tle, a jej handler powiadomień działa
wyłącznie na wierzchu. Push dzwonił więc z kanału Androida mimo kokpitu. Rozstrzyga
SERWER: `Notifier` przy wysyłce pyta `SessionsProjectionPort.crewInOperation`, kto
z adresatów siedzi w załodze operacji w toku - dowódca ALBO drugi pilot (uczeń w locie
szkolnym też), w DOWOLNYM klubie - i takiemu budzik idzie kanałem `quiet` bez dźwięku.
Aplikacja zakłada ten kanał przy starcie („Podczas lotu - bez dźwięku", niska ważność: na
listę powiadomień, bez dźwięku, wibracji i banera).

**Banera w aplikacji załoga też nie dostaje** (druga decyzja tego dnia: „także przy otwartej
aplikacji"). Telefon dowódcy wie to sam - kokpit (`holdsAircraft`), łącze rozłączone - ale
telefon drugiego pilota nie: nie jest w trybie kokpitu, więc łącze stoi i wiadomość
przychodzi RAMKĄ. Dlatego ten sam odczyt załogi oznacza ramkę `notification` i dane pusha
flagą `quiet: true` (pole istnieje tylko z wartością - poza załogą kształt bez zmian),
a reguła banera (`inAppBanner`) pomija każdą cichą wiadomość, z ramki i z pusha odebranego
na wierzchu. Skrzynka i dzwonek odświeżają się jak zawsze. Załogę czyta się RAZ na wysyłkę.
Panel flagę ignoruje - przy biurku kabiny nie ma.

- **„w toku" znaczy to samo, co kokpit telefonu**: od przejęcia do zdania samolotu (albo
  zakończenia lub unieważnienia przez administratora) - status `active` projekcji;
- **ponad klubami świadomie** (imienny wyjątek w strażniku `org_id`): telefon jest
  w kokpicie bez względu na to, z którego klubu przyszła wiadomość, a wynik to bit
  o adresacie - żadnych danych operacji;
- **awaria odczytu załogi nie wycisza nikogo** - lepszy dzwonek w locie niż zgubiona
  wiadomość;
- **granica**: serwer zna przejęcie wtedy, gdy dotrze do niego zapis - zwykle od razu, na
  ziemi. Bez zasięgu push i tak nie dochodzi, więc okno „trzymam samolot, a serwer jeszcze
  o tym nie wie" jest wąskie i przyjęte;
- **starsza aplikacja** bez kanału `quiet` dostaje budzik kanałem zapasowym
  `expo-notifications` - zadzwoni, ale nie zginie; 4.0.0 i tak idzie nowym APK;
- testy: `notificationDelivery.test.ts` (dowódca, drugi pilot, drugi pilot połączony -
  ramka cicha, cudza operacja, po zdaniu, inny klub, awaria odczytu), `expoPush.test.ts`
  (kanał i dźwięk), `pushData.test.ts` (flaga), a w aplikacji `liveFrames.test.ts`
  i `inAppBanner.test.ts` (cicha ramka i cichy push bez banera).

**Testy aplikacji**: `liveFrames.test.ts`, `liveLinkRule.test.ts`, `liveLink.test.ts`
(atrapa gniazda i zegara), `liveBus.test.ts`, `liveRefresh.test.ts`, `inbox.test.ts`
(`keepVisitNew`), `inAppBanner.test.ts`, `activeRoute.test.ts`, `pushTarget.test.ts`
(`isActiveClubPush`), `authService.test.ts` (wspólne odświeżenie) oraz strażnicy
w `architecture.test.ts` (`WebSocket` wyłącznie w `liveSocket.ts`; plik UI, który czyta
serwer, bez `setInterval`).

**Jak podpiąć ekran aplikacji pod odświeżanie na żywo**: w haku, który czyta serwer,
`useLiveTopic(tematy, odśwież)` z cichym odświeżeniem (`quietResult`). Tematy są kontraktem
serwera (§11, „Jak dopisać temat"); lokalny jest wyłącznie `inbox`. Pętli `setInterval`
nie dokładaj - strażnik architektury jej nie przepuści.

**Jak dopisać ekran rzeczy do reguły banera** (np. karta zlecenia w Z-C): rodzaj
wiadomości → ekran w `pushTarget.ts`, rzecz w `targetThing`/`routeThing`
w `inAppBanner.ts` z przypadkiem „na ekranie tej rzeczy baner nie staje" i trasa
w `openTarget.ts`. Zdanie banera przychodzi samo z gałęzi rodzaju w `logic/inbox.ts`.

**Sprawdzone na lokalnym serwerze** (2026-10-05/06, tymczasowa baza, łącze z Node):
śmieciowy token dostaje `bye token_expired`, odświeżenie daje nową parę i powitanie;
połączenie przeżywa trzy cykle pingu; rezerwacja Piotra Lisa przynosi `notification`
i `changed` z klubem logowania, powitanie odświeża każdy podpięty temat raz, a seria ramek -
kalendarz, tę rezerwację, skrzynkę i samoloty po jednym razie, temat zleceń wcale; z ramki
tej rezerwacji baner mówi „Piotr Lis prosi o zgodę na lot · SP-KKD · pt 23 PAŹ
09:00-11:00 · teraz" i prowadzi do decyzji, a na karcie tej rezerwacji, w skrzynce,
w kokpicie i w tle nie staje. Na urządzeniu (animacja, gest, czytnik ekranu, push przy
otwartej aplikacji) - w Z-W.
