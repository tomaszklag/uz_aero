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
   operację, wiersz mówi „ktoś jeszcze na nim lata")*;
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
`serviceStatus = 'disabled'` z blokadą przy otwartej operacji.

**Twarde usunięcie wymaga DWOCH warunków naraz:**

1. **zero odwołań** - `refuseDelete` / `refuseDeleteAircraft`. Konto: brak zdarzeń (jako
   PIC **i jako drugi pilot**, także po korekcie w payloadzie), operacji i wpisów audytu
   jako sprawca. Samolot: brak zdarzeń, operacji, flag, dziennika eksportu i normy zużycia;
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
| pliki `admin/src` | 331 | 96 |
| linie kodu | 40 098 | 10 233 |
| build JS (bez gzip) | 702 kB | 403 kB |
| build CSS | 36 kB | 28 kB |
| znaki prozy wyjaśniającej (konta + flota) | ~11 200 | ~900 |
| stałe banery | 9 | 0 |
| karty wyjaśniające | 14 | 0 |
| kafle z licznikami | 8 | 0 |
| kolumny tabel (konta + flota) | 18 | 11 |
| ekrany ze skeletonem | 0 | 4 |

Kolumna 2.0 jest stanem na 2026-08-31, czyli po dołożeniu modułu „Dziennik" (§9) razem
ze śladem GPS - a nie po samych kontach i flocie, na których zaczynaliśmy. Panel 1.0 miał
w tych 331 plikach 23 ekrany; 2.0 ma sześć i trzy z nich to trzy poziomy dziennika.
Cała karta śladu - renderer mapy, profil i katalog lotnisk - kosztowała 24 kB buildu
(379 → 403 kB).

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

1. **deaktywacja pilota z otwartą operacją nie jest niczym blokowana** (`accountGuards.ts`
   pyta tylko o „siebie" i o ostatniego administratora). Refresh tokeny giną w tej
   samej transakcji, więc telefon przestaje synchronizować, a wylogowanie jest
   zablokowane przy niepustym outboksie - pilot zostaje z danymi, których nie ma jak
   oddać. Odpowiednikiem po stronie floty jest `refuseDisable` i on istnieje;
2. **wymóg drugiego pilota jest regułą WYŁACZNIE kliencką** - domena i serwer nie
   znają kodu `DUAL_REQUIRED`, więc operacja An-2 bez Duala przejdzie przez `POST /events`
   bez śladu;
3. **obniżenie pojemności zbiorników działa WSTECZ** - ingest liczy flagi rozjazdu
   paliwa na całej historii maszyny przy bieżącej pojemności, więc nowa wartość potrafi
   wystawić flagę na parze dni zamkniętych przed zmianą. Panel 2.0 mówi o zmianie progu
   jedną linijką pod polem, ale nie ostrzega o skutku wstecznym - bo najpierw trzeba
   rozstrzygnąć, czy to zachowanie jest pożądane.

---

## 9. Moduł „Dziennik" (2026-08-30)

Trzeci moduł panelu, zamówiony przez właściciela produktu: *„ekran, z poziomu którego
będę mógł podejrzeć log dnia… raczej będę przeglądał taki log dla konkretnego samolotu,
więc widok musi być dwupoziomowy"*.

### 9.1 Trzy poziomy, trzy adresy

| Poziom | Adres | Co pokazuje |
|---|---|---|
| 1 | `#/dziennik?od=&do=` | CAŁA flota w zakresie dat - także maszyny, które nie latały |
| 2 | `#/dziennik/SP-KLM?od=&do=` | grid operacji jednej maszyny |
| 3 | `#/dziennik/SP-KLM/<uuid>` | jedna operacja: oś zdarzeń i komplet odczytów |

W adresie stoi **rejestracja, nie identyfikator** - `#/dziennik/SP-KLM` człowiek
przeczyta i wpisze z pamięci, a o to w wymogu „do wklejenia" chodziło. Zakres dat jedzie
w adresie ZAWSZE, także domyślny, żeby każdy adres z paska przeglądarki był kompletny.

Dziennik jest PIERWSZĄ zakładką i przejmuje ekran startowy: konta i flotę zakłada się
raz na sezon, dziennik ogląda się co tydzień.

### 9.2 Siedemnaście danych, dziewięć kolumn

Zamówienie wymieniało siedemnaście wartości; właściciel dopuścił ich łączenie
(*„możesz te kolumny jakoś mądrze pokazać"*). Reguła układu brzmi: **wartości czytane
jednym spojrzeniem stoją w jednej komórce, a kolumną jest PYTANIE, nie liczba.**

Grid ma przez to dziewięć kolumn danych i mieści się w 1136 px bez przewijania:
dzień · bieg silnika · lot · loty · pilot · zadanie · paliwo · motogodziny · olej.
Para niesie godziny w jednej linii, a druga linia ją KWALIFIKUJE - przy biegu silnika
mówi jak długo, przy locie dokąd, przy paliwie ile dolano.

Rejestracji w wierszach poziomu 2 NIE MA: jesteśmy wewnątrz jednej maszyny, więc byłaby
kolumną o stałej wartości. Stoi w tytule strony.

**Pierwsza kolumna nazywa się odtąd `Operacja`** (issue #68) i niesie dwie linie: datę
(mocną - po niej skanuje się listę jednej maszyny) i pod nią SYGNATURĘ, czyli
`SP-AXA/2026-09-01/AKO/1`. Dziesiątej kolumny to nie kosztuje, a odpowiada na pytanie,
na które uuid w pasku adresu nie odpowiadał: **jak nazwać ten lot w rozmowie**. Sygnaturę
składa SERWER i podaje gotową w DTO - panel nigdy nie skleja jej u siebie, bo druga
konwencja nazw znaczyłaby, że administrator i pilot mówią o jednym locie dwoma napisami
(ta sama reguła, przez którą nazwę karty arkusza liczy wyłącznie serwer). Wiersz bez
sygnatury - maszyna spoza rejestru, zapis bez biegu silnika i bez treści - wygląda jak
przed issue #68 i to jest stan poprawny, nie brak danych. Od issue #75 zapis bez biegu,
ale ZE zmianą (odczyt inny niż przy przejęciu, dolewka) sygnaturę MA - numeruje się
kotwicą przejęcia, tym samym wyrażeniem SQL, które liczy numer
(`pg/substanceSql.ts`, test krzyżowy z domeną).

### 9.3 Tylko odczyty, żadnych szacunków

Decyzja właściciela: *„nie wyświetlaj szacunków na tym gridzie - tutaj interesują mnie
tylko realne odczyty"*. Reguła obowiązuje CAŁY moduł:

- w gridzie stoją wyłącznie wartości **zmierzone** albo **policzone z faktów** (liczba
  lotów, czas trwania biegu, suma pomiaru i dolewki);
- **brakujący odczyt jest widoczny jako brak** - kreska, nigdy zero i nigdy wartość
  zastępcza. `0 L` znaczy pusty zbiornik, `—` znaczy „nikt nie zapisał";
- przy parze bez jednej strony kreska zostaje PRZY strzałce, więc widać, którego
  odczytu brakuje;
- operacja otwarta mówi **„w toku"**, bo to nie jest brak odczytu, tylko fakt, że jeszcze
  nie nastąpił;
- norma zużycia i szacowany poziom oleju **nie wchodzą** - ani teraz, ani później.

**Olej ma trzy wartości i ani jednej pary**: stan przed lotem · dolano · stan do lotu.
Po locie oleju się nie mierzy (issue #60), więc strzałka „przed → po" byłaby obietnicą
pomiaru, którego nie ma. Sumę „do lotu" liczy DOMENA (`oil.afterL`), nie panel - bo to
nie jest zwykła suma: dolewka bez pomiaru poziomu nie zna, a naiwne `pomiar + dolewka`
dałoby wtedy liczbę wziętą znikąd.

### 9.4 Co musiało dojść po stronie serwera

Sześć wartości zamówionego gridu **nie istniało nigdzie w projekcji** - nie dało się ich
„doczytać" zapytaniem, bo lista operacji czyta wyłącznie kolumny tabeli (§7.1 architektury
serwera). Migracja 3 dokłada osiem kolumn:

`engine_start_at` · `engine_stop_at` · `first_takeoff_at` · `last_landing_at` ·
`departure_icao` · `arrival_icao` · `fuel_added_l` · `manual_entry` · `oil_after_l`

Wszystkie są PRZEPISANIEM wartości, które `projectSession` już liczyła - żadna nie zmienia
modelu zdarzeń. **Istniejące wiersze zostaną puste do czasu przebudowy projekcji**
(`POST /admin/api/maintenance/projections/rebuild`).

Doszła też trasa `GET /admin/api/log` (poziom 1). Nie użyliśmy gotowego `/stats`, mimo
że ma agregat per samolot, z dwóch powodów: filtruje po `close_time` (zdanie samolotu),
a lista operacji po `claim_time` (przejęcie), i **liczy wyłącznie operacje zamknięte** - więc
dzisiejszy dzień byłby pusty do wieczora. Dwa poziomy jednego modułu liczące po dwóch
osiach potrafią pokazać cztery operacje na jednym ekranie i pięć wierszy na drugim, a
narzędzie nadzoru, którego dwa ekrany się nie zgadzają, przestaje być narzędziem.

### 9.4a Ślad GPS należy do OPERACJI (2026-08-31)

Trasa panelu 1.0 (`GET /admin/api/sessions/:uuid/track/:flight`) oddawała ślad **jednego
lotu**, wycinany z nagrania oknem start→lądowanie. Pochodziła sprzed issue #38 i była
jedynym powodem, dla którego karta śladu nie weszła do poziomu 3 od razu. Dziś model mówi
co innego: zapis GPS powstaje w JEDNYM ciągu od uruchomienia do wyłączenia silnika, więc
należy do operacji, a loty są jego odcinkami. Ujęcie per lot kazało administratorowi oglądać
dzień w kawałkach i gubiło wszystko, co działo się na ziemi.

Zmiana ma trzy części i żadna nie jest kosmetyczna:

1. **jedno zapytanie dla obu powierzchni** - `application/common/queries/sessionTrack.ts`.
   Telefon (`GET /me/sessions/:uuid/track`) dokłada nad nim cienką warstwę z bramką
   właściciela; panel woła je wprost na zdolności `panel.access`. Kopia tej samej
   geometrii po dwóch stronach rozjeżdżałaby się CICHO - obie mapy wyglądałyby poprawnie,
   tylko inaczej - a psuje to dokładnie tę rozmowę o TYM SAMYM locie, dla której ekran
   istnieje. Pilnuje tego test porównujący obie odpowiedzi wprost;
2. **stara trasa per lot USUNIĘTA** razem z `AdminFlightTrackQueries` i jej kontraktem.
   Nic jej nie wołało po przebudowie panelu, a jej istnienie było jedynym źródłem
   przekonania, że ślad jest własnością lotu;
3. **wyjątek od „z domeny tylko typy" - JEDEN, imienny**. `screens/logbook/trackChart.ts`
   importuje sześć WARTOŚCI (`airfieldsInView`, `boundsOf`, `fitBounds`, `scaleBar`,
   `toScreen`, od issue #75 także `trackPhaseRuns`) i tylko tyle - test architektury
   sprawdza zarówno listę plików, jak i listę importów. To nie jest liczenie faktów
   o locie: dystans, pułap i statystyki przychodzą policzone z serwera, a ten moduł
   przelicza stopnie na piksele (a `trackPhaseRuns` dzieli listę CZASÓW na przebiegi
   wg okien lotów z DTO - kopia tego podziału znaczyłaby, że kołowanie kończy się
   administratorowi w innym punkcie trasy niż pilotowi). Alternatywą była kopia
   tej matematyki w panelu, czyli ten sam lot narysowany administratorowi inaczej niż
   pilotowi. **Dopisanie kolejnej pozycji do listy jest decyzją produktową, nie refaktorem.**

**Kołowanie rysuje się inną linią niż lot** (issue #75 pkt 4): trasa przychodzi
z `mapPlot` w PRZEBIEGACH FAZ - loty pełną zieloną, kołowanie przerywaną szarą
(`--text-muted`), a legenda mapy dostała wiersz „Kołowanie". Fazy dzieli
`trackPhaseRuns` z domeny na oknach lotów z DTO sesji, bo koperta śladu niesie samą
geometrię (issue #47) - to ta sama konwencja i ten sam kod podziału, co ekran 14
telefonu i miniatura na 10.

Karta pokazuje mapę, profil pionowy i TRZY liczby (dystans, pułap, prędkość maksymalna).
Reszta statystyk z koperty - czasy pięciu faz, jakość trzymania wysokości, liczniki bramki
jakości - została pominięta świadomie: to materiał do strojenia progów detekcji, a nie
odpowiedź na pytanie, z którym się na ten ekran wchodzi. Tabeli surowych fixów nie ma ani
tutaj, ani w kopercie (issue #47). Legenda mapy opisuje RODZAJE znaczników, nie
poszczególne znaczniki - w panelu 1.0 dzień skokowy dawał legendę dłuższą od mapy.

Brak rysunku ma POWÓD i powody się nie zwijają do jednego: lot wpisany ręcznie nie miał
nagrania z definicji, a operacja bez nagrania to co innego. „Brak śladu" pokazane przy locie
z kartki byłoby kłamstwem o tym locie.

### 9.4b Unieważnienie wpisu (2026-08-31)

Zamówienie właściciela produktu: *„z poziomu admina powinienem mieć możliwość
w dowolnym momencie usunięcia operacji (cyklu silnika)"*. Zdarzenie `session_void` istniało
od 2026-08-30 po stronie pilota (okno 24 h od zdania); tu dostaje drugą drogę.

**Dziennik pozostaje modułem do CZYTANIA - to jedyny zapis, jaki w nim jest.** Stoi na
samym dole poziomu 3, za śladem GPS: do operacji wchodzi się, żeby ją przeczytać, a wycofanie
wpisu jest wyjściem awaryjnym. Konto bez `events.correct` nie widzi karty w ogóle (§3.3).

Sześć decyzji:

1. **`POST /sessions/:uuid/void`, nie `DELETE`** - nic nie znika. Powstaje nowy fakt
   („ten wpis został wycofany") razem z powodem i śladem w dzienniku audytu
   (`session.void`, z kompletem tożsamości wpisu - po wycofaniu żadna lista go
   nie pokazuje). `DELETE` obiecywałby usunięcie, którego system nie robi;
2. **osobna komenda, nie czwarta akcja korekty** - `corrections.ts` w całości mówi o CELU
   wewnątrz operacji (`targetUuid`, podgląd „przed → po"). Unieważnienie nie ma celu i nie
   ma czego pokazywać w podglądzie: skutkiem jest zniknięcie całego wpisu z rachunków;
3. **„w dowolnym momencie" znaczy też „w trakcie lotu"** - operacja nie musi być zdana.
   Kolizja z pilotem, który wciąż trzyma maszynę, jest OSTRZEŻENIEM
   (`ADMIN_EDIT_SESSION_ACTIVE`), nie odmową - ta sama decyzja, co przy korekcie
   (2026-08-07). Twarde reguły domeny obowiązują administratora tak samo jak pilota:
   operacja musi istnieć i nie może być już wycofana;
4. **powód jest WYMAGANY** - inaczej niż w telefonie, gdzie pilot wycofuje własny wpis
   i wie, co zrobił. Tu wycofuje się cudzy lot. Powód jedzie do zdarzenia (więc wraca
   na telefon pilota, §4.9), do dziennika audytu i na oś zdarzeń panelu;
5. **potwierdzenie NAZYWA wpis** - dzień, bieg silnika, pilot, loty, czas blokowy.
   Dwie operacje tej samej maszyny w jednej dobie różnią się wyłącznie godzinami, a wejście
   w operację bywa wklejonym linkiem. Fakty składa `voidFacts` z tego samego kształtu, który
   stoi w gridzie poziomu 2;
6. **karta arkusza powstaje od nowa, bez wycofanej operacji** - patrz niżej.

#### Trzy miejsca, w których `voided` nie działało

Wdrożenie odsłoniło, że status z 2026-08-30 nie docierał nigdzie poza kolumnę `sessions.status`:

- `toSessionRow` (`infrastructure/pg/sessionDbRow.ts`) zwijał wszystko, co nie jest
  `closed`, do `active`. Skutki: eksporter budował kartę Z wycofaną operacją, panel nie miał
  jak zapalić plakietki „unieważniona", a `activeClaim` widział maszynę jako zajętą
  BEZ KOŃCA - pilot, który wycofał własny wpis, blokował samolot reszcie klubu;
- `exportsRepo` zwijał go tak samo, więc gałąź „operacja wycofana nie czeka na eksport"
  w `exportState` była nieosiągalna (monitor pokazywał `waiting` w nieskończoność);
- `dayExporter` odsiewał wycofane operacje wyłącznie BRAMKAMI („musi być `closed`"), więc
  nie wyzwalały eksportu - ale przy karcie budowanej z innego powodu (druga zmiana tej
  maszyny) wchodziły do dokumentu klubu jak każda inna.

Wszystkie trzy naprawione. **Została jedna dziura, świadomie**: gdy wycofano JEDYNĄ operację
doby, karty nie ma z czego zbudować (`no_events`), więc zapisana wcześniej ZOSTAJE
w arkuszu z nieaktualną treścią. Wyczyszczenie jej wymaga decyzji, czego klub ma się
w tym miejscu dowiedzieć (pusta karta? adnotacja „wpis wycofany"?) - a zgadywanie treści
dokumentu klubu nie jest robotą eksportera.

Issue #75 odsłoniło CZWARTE miejsce: **agregaty poziomu 1** (`logRepo.byAircraft`).
`LEFT JOIN sessions` liczył unieważnione operacje do dni, startów, bloku i paliwa floty,
choć baner na poziomie 3 obiecuje „nie liczy się do sum dziennika". Naprawione tym samym
warunkiem, który odsiewa puste zapisy (§9.5).

### 9.5 Puste operacje nie wchodzą do dziennika (issue #75, 2026-09-02)

Zamówienie właściciela: *„Mogą wystąpić puste operacje, czyli nie zmienił się bieg
silnika oraz paliwo w zbiorniku. Takie wpisy to śmieci i nie powinny być traktowane
jako pełne operacje."*

**Pusty zapis** = zdany, bez biegu silnika, bez lotów, bez dolewek i z kompletem
odczytów RÓWNYCH przejęciu. Regułę definiuje domena (`operationSubstance.ts` -
ta sama, którą telefon filtruje swoje listy), a serwer ma jej lustro SQL
w `pg/substanceSql.ts` z testem krzyżowym. Skutki w panelu:

- **grid poziomu 2 i licznik strony** nie pokazują pustych zapisów wcale
  (filtr w `applyFilters`, więc obejmuje też `COUNT`);
- **agregaty poziomu 1** liczą bez nich (i bez unieważnionych - patrz §9.4b);
- **karta arkusza** buduje się bez nich (`dayExporter`, obok filtru `voided`);
- **adres bezpośredni działa dalej** (`byUuid` nie filtruje): rejestr widzi wszystko,
  jak przy unieważnieniu - poziom 3 otwarty z wklejonego linku pokaże zapis
  z osią zdarzeń i kreską zamiast sygnatury.

Zapis bez biegu, ale ZE zmianą odczytu albo dolewką, NIE jest pusty - to pełnoprawna
operacja z sygnaturą (§9.2) i wierszem w gridzie. Telefon ostrzega pilota przed pustym
zdaniem na ekranie 09C, więc puste zapisy powinny być rzadkością, nie regułą.

### 9.6 Czego w pierwszej wersji nie ma

- **sum pod gridem** - poziom 1 podaje je dla tego samego zakresu;
- **sortowania po każdej kolumnie** - serwer sortuje kursorem po czasie i tylko po nim;
  sortowanie w przeglądarce ustawiłoby wyłącznie wczytaną stronę;
- **eksportu do arkusza** - robi go serwer po swojemu (§4.7); drugi kanał to druga prawda
  o tych samych danych;
- **filtrów po pilocie i operacji** - trasa je umie, ale nie zamówiono ich, a każdy chip
  to kolejny stan w adresie.

## 10. Karta samolotu: normy z dokumentacji i stan początkowy (issue #66, 2026-09-01)

Zamówienie z issue #66: „Brakuje tego i dla pierwszych lotów gdzie nie ma jeszcze danych
nie ma jak wyliczyć normy i odchyleń. […] W panelu admina jak dodaję samolot to powinno
być pole w którym wpiszę startowy stan motogodzin, paliwa w zbiorniku i oleju."

Punkty 2 i 3 zgłoszenia (norma oleju, pojemność i minimum oleju) **były już wdrożone**
przy issue #60 - karta samolotu ma je od 2026-08-27. Dołożone są punkty 1 i 4.

### 10.1 To są DWA rodzaje liczb i dlatego dwie karty

| | **Zużycie z dokumentacji** | **Stan początkowy** |
|---|---|---|
| co opisuje | typ silnika | jedną chwilę tej maszyny |
| jak długo prawdziwe | póki silnik ten sam | do pierwszej zdanej operacji |
| pola | spalanie paliwa (L/h) · zużycie oleju (L/h) | motogodziny · paliwo · olej |
| zero | LITERÓWKA - odmowa | WARTOŚĆ (nowy silnik, puste zbiorniki) |

Zlanie ich w jedną sekcję byłoby pomyłką kategorii, a przy okazji zmusiłoby do jednej
reguły walidacji dla obu - czyli do odebrania klubowi możliwości wpisania maszyny prosto
z remontu (0 na liczniku).

**Norma oleju PRZENIOSŁA SIĘ** z karty „Olej" do karty „Zużycie z dokumentacji", obok
normy paliwa. W karcie oleju zostały zbiornik i minimum: one opisują maszynę na zawsze,
a obie normy są tym samym zdaniem powiedzianym o dwóch płynach - liczbą z instrukcji,
ważną DOPÓKI analityka nie policzy własnej z lotów.

### 10.2 Stan początkowy jest zerowym ogniwem łańcucha, nie konfiguracją

Nie jedzie na telefon jako osobne pole. Serwer składa z niego **przekazanie**
(`aircraftStateView.pickHandover`) i wysyła gotowe - dokładnie tak, jak składa je
z ostatniej zdanej operacji. Wchodzi WYŁĄCZNIE wtedy, gdy rejestr nie ma czym odpowiedzieć,
i tylko z kompletem pary (paliwo + licznik): połowa nie jest przekazaniem.

Rozpoznaje się je po `Handover.byPilotId === null` - **nikt tej maszyny nie przekazał**.
Telefon mówi wtedy „stan początkowy wpisany w panelu", a nie „przekazał J. Kowalski";
panel dostaje `reading.source: 'initial'` i tym samym wie, czy karta jeszcze cokolwiek
znaczy. Gdy nie znaczy, karta mówi to sama - polem, które przestało działać, a nadal
wygląda na czynne, nie da się nikim pokierować.

**Czasu pomiaru NIE MA i nie udajemy, że jest**: `at` seeda to `aircraft.updated_at`,
czyli chwila zapisu w panelu, i tak też jest podpisana („Wpis z …", nie „Stan z …").
To ta sama zasada, przez którą kontrakt floty nie ma `disabledAt` (§ kontrakt `fleet.ts`).

### 10.3 Cztery nowe odmowy, wszystkie w `domain/fleetGuards.ts`

- `fuel_norm_not_positive` - zero L/h nie jest stanem świata;
- `initial_negative` - licznik ani zbiornik nie schodzą pod zero (formularz tego nie
  sprawdza, bo parsery przyjmują same cyfry; reguła żyje na serwerze, gdzie JSON potrafi
  przynieść minus);
- `initial_fuel_over_capacity` / `initial_oil_over_capacity` - inwariant §3.4 wpisany
  ręką, więc bez ani jednego zdarzenia, które mogłoby go złapać później. Liczą się na
  stanie EFEKTYWNYM: obniżenie pojemności pod zapisany stan początkowy też odbija.

### 10.4 Licznik w formacie TEJ maszyny

Pole „Motogodziny" pokazuje wartość wg `mhFormat` jednostki (`1236:30` albo `1236.5`),
a przyjmuje OBA zapisy naraz (`parseMotoHours`) - administrator przepisuje liczbę
z tarczy i nie ma się zastanawiać, jak jednostka jest skonfigurowana. W danych
motogodziny są zawsze dziesiętne; to jest wyłącznie sposób zapisu.
