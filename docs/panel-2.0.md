# UZ Aero - panel administracyjny 2.0

Dokument decyzji. Szczegóły warstw, zależności i wzorców danych zostają
w `architektura-panelu-frontend.md` - tam opisany jest ten sam szkielet, na którym
2.0 stoi (jedne drzwi do sieci, własne DTO, TanStack Query bez globalnego store'u,
moduły czyste obok komponentów). Tutaj jest wyłącznie to, co się ZMIENIŁO i dlaczego.

## 0. Skąd to się wzięło

Zdanie właściciela produktu o panelu 1.0: *„jest za ciężki i nie do końca spełnia
biznesowe wymagania… Nie może być tyle bannerów i tłumaczeń jak teraz. Teraz trochę
to przypomina projekt techniczny, a nie aplikację dla użytkownika."*

Diagnoza była policzalna. Cztery ekrany kont i floty niosły **~11 200 znaków prozy
wyjaśniającej** (około czterech stron maszynopisu), dziewięć stałych banerów,
czternaście kart tłumaczących, osiem kafli z licznikami i kilkanaście wstawek
z nazwami tras, tabel i kodów reguł. Najdłuższy pojedynczy napis miał 700 znaków
i zaczynał się od słów „Sprostowanie z 2026-08-01".

Kod: 40 098 linii w 331 plikach na jedenaście ekranów. Same konta i flota - 4 610 linii
na dwa formularze CRUD.

## 1. Zakres 2.0

**Dwa moduły: PILOCI i SAMOLOTY.** Nic poza tym. Pozostałe ekrany panelu 1.0
(pulpit, dni lotne, flagi, rejestr zdarzeń, eksporty, audyt, statystyki, analityka
zużycia, konserwacja) **zostały usunięte z kodu** i są do odzyskania z historii gita
- gałąź `panel-2.0`, punkt odcięcia to ostatni commit `develop` sprzed przebudowy.

To jest decyzja o KOLEJNOSCI, nie o wartości tamtych ekranów: klub zaczyna od
założenia kont i floty, bo bez nich aplikacja pilota nie ma czego pokazać. Moduły
wracają pojedynczo, każdy przepisany pod reguły z sekcji 3.

**API serwera nie zmieniło się ani o jedną trasę.** Wszystkie `/admin/api/*` stoją
jak stały; 2.0 przestał wołać część z nich.

## 2. Co zostało z 1.0 bez zmian

Szkielet okazał się dobry i nie ma powodu go ruszać:

- **jedne drzwi do sieci** - `api/httpClient.ts` jako jedyne miejsce z `fetch`,
  nagłówek CSRF przy każdej mutacji, odpowiedzi spoza 2xx jako `HttpError` ze statusem;
- **własne DTO** zamiast importu z `server/src` (panel nie widzi wnętrza serwera);
- **z `@uzaero/domain` wolno brać wyłącznie TYPY** - panel nie liczy po swojemu.
  W 2.0 ta reguła nie ma już ani jednego wyjątku;
- **tokeny, kroje i tło** - `@uzaero/tokens`, motyw `night`, `tokens.css` generowany;
- **testy granic** (`test/architecture.test.ts`) - kierunki zależności, `.tsx`
  eksportuje wyłącznie komponenty, zero arytmetyki w widoku, nazwa klasy CSS nie
  powstaje przez sklejenie;
- **wdrożenie** - `admin/dist` za `@fastify/static` pod `/admin/`, routing na hashu,
  CSP, self-hostowane fonty. Dockerfile i `staticPanel.ts` bez zmian.

## 3. Co się zmieniło - siedem decyzji

### 3.0a Ekran logowania

Zgłoszenie z urządzenia: *„brakuje paddingów i nie wygląda nowocześnie"*. Ekran
korzystał z generycznej karty back-office'u (padding 16/18 px) i pól o wysokości 40 px,
czyli wymiarów dobranych do tabeli z ośmioma kolumnami. Ma własny arkusz
(`styles/components/login.css`) i własne wymiary: karta 32 px, pola 48 px, odstęp
między polami 20 px, znak 68 px z poświatą.

To jedyne miejsce w panelu z gradientem i jedyne, gdzie marka jest duża - reszta jest
gęsta z zawodu, a tu na ekranie stoją dwa pola: gęstość nie ma czego oszczędzać.

### 3.1 Ekran odpowiada, nie tłumaczy

Z interfejsu wypadły WSZYSTKIE stałe banery i karty wyjaśniające. Zostały trzy
rodzaje tekstu:

| Rodzaj | Kiedy | Przykład |
|---|---|---|
| podpowiedź pod polem | pole wymaga wiedzy spoza tabliczki znamionowej | „Znaki z kadłuba, np. SP-KLM." |
| komunikat po akcji | akcja się wydarzyła albo została odmówiona | „Konto Anny Wrzosek wyłączone." |
| powód blokady | przycisk jest nieczynny, a przyczyny nie widać z pola | „Ktoś ma teraz ten samolot." |

Reguły redakcyjne, wszystkie z konkretnym „przed → po" z panelu 1.0:

1. **ekran mówi, co zrobić, nie jak działa system** - „Blokada dotyczy telefonów,
   które pobrały świeżą konfigurację…" → *(nic; a gdy wyłączona maszyna ma otwartą
   sesję, wiersz mówi „ktoś jeszcze na nim lata")*;
2. **historia decyzji projektowych nie jest treścią interfejsu** - żadnego zdania
   zaczynającego się od „Sprostowanie z…" ani „to nie jest przeoczenie";
3. **podpowiedź daje przykład, nie wykład** - 237 znaków o unikalności rejestracji
   → „Znaki z kadłuba, np. SP-KLM.";
4. **błąd stoi przy polu, którego dotyczy** - baner „Serwer odrzucił dane jednostki…"
   → pod polem: „Rejestracja: litery, cyfry i myślnik.";
5. **nazwy z bazy i z API nie wychodzą na ekran** - `FUEL_MISMATCH` → „rozjazd paliwa";
6. **skutek akcji nieodwracalnej mówi się PRZED nią** - baner po deaktywacji
   → pytanie przed nią, z dwoma zdaniami: co z dostępem, co z danymi;
7. **liczba wymagająca przypisu wypada razem z przypisem** - kafel „Konta aktywne
   8 / 10" i jego objaśnienie → kolumna `Status`;
8. **powód blokady stoi w jednym miejscu** - w 1.0 brak roli `accounts.manage`
   mówił o sobie 21 razy na jednym ekranie.

Reguł 2 i 5 pilnuje **`admin/test/copy.test.ts`**: skanuje napisy w `src/` na żargon
z konkretnej listy i na długość ponad 160 znaków. Test nie ocenia, czy zdanie jest
potrzebne - tego nie da się wykonać maszyną; broni granicy, nie pisze tekstu.

### 3.2 Pasek górny zamiast kolumny bocznej

Kolumna 236 px z jedenastoma pozycjami w czterech grupach (w tym grupa z JEDNĄ
pozycją) przy dwóch modułach oddawałaby ćwierć okna pod dwa słowa. Nawigacja 2.0 to
jeden pasek 56 px: znak, dwie zakładki, zalogowany, „Wyloguj".

Jak ma rosnąć (`ui/shell/tabs.ts`): 2–3 moduły - zakładki; 4–6 - kolumna boczna jako
PŁASKA lista bez grup; 7+ - kolumna z trzema grupami. Z paska zniknęły też okruszki
(trzy słowa opisujące jedno kliknięcie) i zegar UTC (w 2.0 nie ma ani jednej kolumny
z czasem - zegar wraca razem z modułem, w którym czas coś znaczy).

### 3.2a Role: zostają dwie (2026-08-30)

Decyzja właściciela produktu: *„na razie pozbądźmy się roli szef wyszkolenia, niech
zostanie tylko admin i pilot. Rozbudujemy i przemyślimy uprawnienia w kolejnych
iteracjach."* `training_lead` znika z `server/src/domain/roles.ts`, z kontraktu API
i z panelu.

Konsekwencja, którą trzeba znać: **jedna z dwóch ról w ogóle nie dotyczy panelu**,
więc każdy, kto do niego wejdzie, ma dziś komplet zdolności. Katalog `Capability`
i brama na każdej trasie **zostają nietknięte** - wracają razem z trzecią rolą,
a brama, która przez jedną iterację nikomu nie odmawia, jest tańsza niż brama
dopisywana z powrotem do dwudziestu tras.

**`CHECK` na `pilots.role` poszedł za zmianą** - kolumna dopuszcza dokładnie dwie role.
Rozważałem zostawienie go permisywnym (wycofanie jest tymczasowe, a migracja tam
i z powrotem kosztuje), ale decyzja użytkownika brzmiała: *„nie musisz przejmować się
danymi, które już mamy - na razie nic nie jest wdrożone, więc mamy kontrolę nad danymi"*.
Kolumna ma więc mówić to samo, co `PILOT_ROLES`.

Baza deweloperska założona wcześniej ma starsze ograniczenie i to nie przeszkadza:
żaden wiersz go nie używa, a każdy odczyt przechodzi przez
`isPilotRole(...) ? role : DEFAULT_ROLE`, więc wartość spoza katalogu schodzi do
`pilot` - czyli do NAJMNIEJSZYCH uprawnień. Ten kierunek błędu jest bezpieczny;
odwrotny nie byłby.

### 3.2b Usuwanie: dwustopniowe, „wycofaj, potem wyczyść" (2026-08-30)

Pytanie właściciela produktu: *„czy nie warto dodać opcji usuwania? Usuwanie nie powinno
być hard - chyba że nie ma żadnych zależności w innych miejscach systemu"*. Reguła
trafna; przegląd pokazał, że **połowa jej już istniała**, a druga wymaga warunku, którego
w pytaniu nie było.

**Soft delete był od początku** - nazywał się tylko inaczej: konto `active = false`
(w jednej transakcji zrywa sesje telefonu i unieważnia sesję panelu), samolot
`serviceStatus = 'disabled'` z blokadą przy otwartej sesji.

**Twarde usunięcie wymaga DWOCH warunków naraz:**

1. **zero odwołań** - `refuseDelete` / `refuseDeleteAircraft`. Konto: brak zdarzeń (jako
   PIC **i jako drugi pilot**, także po korekcie w payloadzie), sesji i wpisów audytu
   jako sprawca. Samolot: brak zdarzeń, sesji, flag, dziennika eksportu i normy zużycia;
2. **rekord jest już wyłączony** - konto nieaktywne, samolot poza służbą.

Drugi warunek NIE jest ostrożnością. `referenceSync` w aplikacji pilota robi wyłącznie
`upsertAircraft` / `upsertPilots` - **nie ma ścieżki kasowania wiersza**. Rekord usunięty
„na gorąco" zostałby na każdym telefonie, który zdążył się zsynchronizować, z ostatnim
znanym stanem: przy koncie byłby duchem na liście Duali, przy samolocie - maszyną
**dalej wybieralną**, więc pilot zacząłby lot na jednostce, której serwer nie zna.
Wyłączenie jedzie natomiast normalną drogą (`GET /reference`) i aplikacja je rozumie:
kolejność „wyłącz → poczekaj na sync (15 min) → usuń" zamyka dziurę mechanizmem, który
już istnieje - bez zmiany w aplikacji i bez wydania APK.

**Baza nie pomaga w niczym.** W całym schemacie jest **jeden** klucz obcy
(`refresh_tokens.pilot_id`); `events`, `sessions`, `flags`, `export_log`,
`exported_sheets`, `admin_audit` i `aircraft_consumption` wskazują konto i samolot
zwykłym tekstem. `DELETE` przeszedłby i po cichu osierocił historię - powstrzymują go
wyłącznie te dwie funkcje domeny.

**Odrzucona alternatywa: blokowanie po czasie.** Padła propozycja, żeby telefon dostawał
ostrzeżenie przy najbliższym połączeniu, a po jakimś czasie blokadę. Pierwsza połowa jest
właściwą naprawą przyczyny (**tombstone**: kanał danych mówi „tego już nie ma"), ale
druga zderza się z regułą nadrzędną: `POST /events` jest append-only i przyjmuje FAKTY
Z TERENU, a odrzucenie paczki gubi dane o locie, który i tak się odbył - i uderzyłoby
najmocniej w telefon offline od tygodnia, czyli w przypadek, dla którego ta reguła
istnieje. Właściwą odpowiedzią na „zdarzenie dotyczy maszyny, której nie ma" jest FLAGA
w panelu (siódmy typ), nie odmowa zapisu.

**Do backlogu:** tombstone w `/reference` + kasowanie wiersza w aplikacji + flaga
nieznanej maszyny. Wymaga wydania APK, a starsze buildy w terenie i tak nigdy nie skasują
wiersza - więc warunek „najpierw wyłącz" zostaje, dopóki taki build gdziekolwiek działa.

**Audyt jest po usunięciu JEDYNYM śladem**, więc `pilot.delete` i `aircraft.delete` niosą
komplet tożsamości (kod, nazwisko, e-mail, rola / rejestracja, typ, rocznik), a nie sam
identyfikator - `target_id` jest uuid-em, którego nikt nie rozpozna.

### 3.3 Brak uprawnień = brak przycisku

**Odwrócenie reguły z 1.0** („pozycja niedostępna zostaje WIDOCZNA i wyszarzona,
bo ukrycie zmusza do zgadywania, czy funkcji nie ma, czy nie ma jej moje konto").

Uzasadnienie tamtej reguły jest prawdziwe w produkcie z wieloma poziomami uprawnień.
W klubie z kilkunastoma osobami nikt nie zgaduje, kim jest - a koszt reguły był realny:
baner na górze ekranu, kłódki przy każdym wierszu i `title` przy każdym przycisku,
czyli dwadzieścia jeden wystąpień jednej informacji.

W 2.0 konto bez `accounts.manage` / `fleet.manage` nie widzi przycisków „Dodaj"
i zapisu, a karta otwiera się z plakietką **„tylko podgląd"** przy tytule. Jedno
miejsce, jedno zdanie. Serwer egzekwuje to niezależnie - jak zawsze.

### 3.4 Stan operacyjny nie miesza się z konfiguracją

Z listy floty wypadły kolumny `Claim teraz`, `Ostatnie MH`, `Ostatni FOB` razem
z całym aparatem trzech stanów świeżości i progiem 24 h, a z listy kont - `Dni lotne`
i `Zmieniono`. To nie jest konfiguracja, tylko stan przysyłany przez telefony;
w 1.0 wymagał drugiego, niezawężonego żądania listy i połowy karty wyjaśniającej.

Jeden wyjątek został świadomie: **jednostka wyłączona ze służby, na której ktoś
jeszcze lata**. Tego nie widać nigdzie indziej w panelu 2.0, a znaczy, że maszyna
zniknęła pilotom z listy w połowie czyjegoś dnia.

### 3.5 Skeleton zamiast pustki

Reguła produktu z issue #33 („ekran czekający na odczyt rysuje plamki w geometrii
docelowej - nigdy spinnera i nigdy pustki") **nie była w panelu 1.0 wdrożona wcale**:
`grep skeleton` po `admin/src/` dawał zero trafień, a listy renderowały
`isPending ? null : …`, czyli pusty obszar nie do odróżnienia od „nikogo nie ma".

W 2.0: `ui/components/Loadable.tsx` + `TableSkeleton.tsx`, próg 180 ms i minimum
420 ms w module czystym z testem (`skeletonGate.ts`) - te same liczby, co w aplikacji
pilota. Nagłówki tabeli rysują się od razu, bo znamy je lokalnie.

### 3.6 Jedna reguła, jedno zdanie

Powody odmowy serwera są mapowane `Record<Refusal, string>`, więc nowy powód
w `server/src/domain/*Guards.ts` **wywala kompilację panelu**, zamiast pokazać
klientowi surowe `oil_min_above_capacity`. Rozjazdu samych unii pilnuje
`admin/test/mirrors.test.ts` (zdolności, role, oba katalogi odmów).

To nie jest ostrożność teoretyczna: przed 2.0 lustro `FleetRefusal` w panelu **nie
znało obu powodów oleju** dodanych na serwerze przy issue #60, a nikt tego nie
zauważył, bo nic tego nie sprawdzało.

Dwie reguły, które widać wprost w polach (pojemność większa od zera, minimum oleju
nie większe od zbiornika), formularz blokuje TĄ SAMĄ stałą, którą wyświetla przy
odmowie serwera - to nie jest druga kopia reguły, tylko ta sama reguła powiedziana
wcześniej.

### 3.7 Makiet HTML dla panelu 2.0 nie ma

`design/admin/` (23 pliki) opisuje panel 1.0 i zostaje jako **archiwum**. Nowe ekrany
powstały bez makiet - a razem z nimi zniknął test `classInventory.test.ts`, który
przybijał inwentarz klas CSS do `SZABLON.html`.

Powód jest wąski i dotyczy WYŁĄCZNIE panelu: makieta zastępuje oglądanie rzeczy,
której jeszcze nie da się uruchomić. Aplikacja pilota to spełnia (ekran RN wymaga
buildu i urządzenia), panel - nie: jest stroną, którą widać w przeglądarce w chwili
zapisania pliku. Reguła „ekran RN wdrażamy 1:1 z `design/*.html`" **zostaje w mocy
dla `app/`** i nic w niej nie zmieniamy.

## 4. Liczby

| | 1.0 | 2.0 |
|---|---|---|
| pliki `admin/src` | 331 | 62 |
| linie kodu | 40 098 | 4 978 |
| build JS (bez gzip) | 702 kB | 361 kB |
| build CSS | 36 kB | 24 kB |
| znaki prozy wyjaśniającej (konta + flota) | ~11 200 | ~900 |
| stałe banery | 9 | 0 |
| karty wyjaśniające | 14 | 0 |
| kafle z licznikami | 8 | 0 |
| kolumny tabel (konta + flota) | 18 | 11 |
| ekrany ze skeletonem | 0 | 4 |

## 5. Czego serwer nie umie - i czego panel dlatego nie obiecuje

Ustalone przy przeglądzie kontraktu; każda pozycja to ekran, którego świadomie NIE ma:

- **usunięcie konta i samolotu istnieje od 2026-08-30, ale WĄSKO** (§3.2b): wyłącznie
  dla rekordu bez ani jednego odwołania i już wyłączonego. Wszystko, co latało, można
  tylko wycofać - deaktywacją konta i wyłączeniem jednostki ze służby;
- **„ostatniego logowania" nie ma** - kolumny nie ma w tabeli kont i nikt jej nie
  zapisuje. Makieta 1.0 tę kolumnę rysowała; była fikcją;
- **daty i powodu wyłączenia jednostki nie ma** - wie o tym wyłącznie dziennik audytu;
- **hasła nie ustawia administrator** - generuje je serwer i pokazuje JEDEN RAZ;
  trasy „pokaż ponownie" nie ma;
- **pojedynczych tras `GET /pilots/:id` i `GET /fleet/:id` nie ma** - karta otwiera
  wiersz, który jest już na liście; przy wklejonym linku spoza zawężenia panel mówi
  to wprost i proponuje pokazanie wszystkich.

## 6. Znalezione przy okazji - do decyzji, poza zakresem 2.0

Trzy rzeczy wyszły z przeglądu kontraktu i **nie są naprawione w tej gałęzi**, bo
dotyczą serwera i aplikacji pilota, a nie panelu:

1. **deaktywacja pilota z otwartą sesją nie jest niczym blokowana** (`accountGuards.ts`
   pyta tylko o „siebie" i o ostatniego administratora). Refresh tokeny giną w tej
   samej transakcji, więc telefon przestaje synchronizować, a wylogowanie jest
   zablokowane przy niepustym outboksie - pilot zostaje z danymi, których nie ma jak
   oddać. Odpowiednikiem po stronie floty jest `refuseDisable` i on istnieje;
2. **wymóg drugiego pilota jest regułą WYŁACZNIE kliencką** - domena i serwer nie
   znają kodu `DUAL_REQUIRED`, więc sesja An-2 bez Duala przejdzie przez `POST /events`
   bez śladu;
3. **obniżenie pojemności zbiorników działa WSTECZ** - ingest liczy flagi rozjazdu
   paliwa na całej historii maszyny przy bieżącej pojemności, więc nowa wartość potrafi
   wystawić flagę na parze dni zamkniętych przed zmianą. Panel 2.0 mówi o zmianie progu
   jedną linijką pod polem, ale nie ostrzega o skutku wstecznym - bo najpierw trzeba
   rozstrzygnąć, czy to zachowanie jest pożądane.
