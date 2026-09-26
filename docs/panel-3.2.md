# Ninerdeck - rozbudowa panelu 2.0 (wydanie 3.2.0)

Dokument decyzji dla milestone **„Panel admina 3.2.0"** (plan: issue #123, termin
31 października 2026; kamień milowy założono jako „4.0.0" i przemianowano 22 września
2026 razem z decyzją o numerze wydania - §11). Epiki P-A…P-W (#182-#187) wskazują na
sekcje tego pliku; **komplet decyzji z §14 zapadł 22 września 2026**, więc P-A zaczyna
się od rysowania, nie od pytań.

Czytać razem z:
- **`docs/panel-2.0.md`** - reguły redakcyjne panelu, styl lekki, moduł Dziennik,
  dwa rodzaje sesji. Ten dokument NIE powtarza tamtych decyzji, tylko je stosuje.
- **`docs/architektura-panelu-frontend.md`** - warstwy panelu, kierunek zależności,
  klucze zapytań, filtry w adresie.
- **`docs/architektura-panelu-serwer.md`** - warstwy serwera, strażnicy wielofirmowości.
- **`CLAUDE.md`**, sekcje „Styl lekki panelu" i „Browser frame" - rama, z której startuje
  każda nowa makieta.

---

## 0. Skąd to się wzięło

Zamówienie właściciela (issue #123, 15 września 2026):

> Obecnie brakuje lepszego wyświetlania danych, które zbiera aplikacja na panelu admina.
> Admin powinien móc: zarządzać flotą, zarządzać pilotami, zarządzać rezerwacjami,
> zarządzać sesjami użytkowników, mieć listę operacji dla każdego samolotu, dodatkowo
> mieć listę operacji dla każdego użytkownika - obydwie listy są ze sobą powiązane
> i powinny wyraźnie być pogrupowane dniami, edytować przesłane zdarzenia, reagować
> na nieścisłości, mieć wgląd do statystyk i analityki. Ignorujemy pierwszą wersję
> panelu. Rozbudowujemy wersję 2. Należy na nowo zbierać wymagania i design tak jak
> to już zaczęliśmy robić w wersji 2.

Panel 2.0 (30 sierpnia 2026) zwęził się do dwóch modułów **świadomie i wyłącznie jako
decyzja o kolejności**: klub zaczyna od kont i floty, bo bez nich aplikacja pilota nie ma
czego pokazać (`docs/panel-2.0.md` §1). Od tamtej pory doszły Dziennik, Kalendarz,
Organizacje i Zgłoszenia, a produkt urósł o wielofirmowość, logowanie hasłem
i rezerwacje. Ten milestone domyka listę z zamówienia.

**Ostatnie zdanie zamówienia jest twarde i obowiązuje każdy epik**: nie odzyskujemy
ekranów panelu 1.0 z historii gita „jak stały". `design/admin/` (23 pliki) zostaje
ARCHIWUM i nie jest specyfikacją. Każdy ekran powstaje od nowa: najpierw wymagania, potem
makieta z `design/panel/SZABLON.html`, potem kod (§15, wariant odrzucony pierwszy).

---

## 1. Zakres

### 1.1 Cztery z ośmiu punktów zamówienia są już dowiezione

Issue powstało przed wydaniami 2.1.0 i 3.0.0, więc część listy zamknęły tamte epiki -
planowanie zaczyna się od odjęcia tego, co istnieje:

| Punkt zamówienia | Stan na 22 września 2026 |
|---|---|
| zarządzać flotą | **jest** - moduł Samoloty (2.0; normy i stan początkowy #66, odczyty administratora #81) |
| zarządzać pilotami | **jest** - moduł Piloci (kolejka zgłoszeń, kod klubu, role); otwarta luka „konto z panelu" to issue #180 w 3.1.0 |
| zarządzać rezerwacjami | **jest** - moduł Kalendarz (3.0.0, epik R-D); kolejka akceptacji dochodzi w 3.1.0 (#165) |
| zarządzać sesjami użytkowników | **jest** - sesje logowania w karcie członka i `#/konto` (2.1.0, epik H-D) |

Ostatnia pozycja wymagała interpretacji, bo „sesja" ma w tym projekcie dwa znaczenia
(operacja lotnicza i sesja logowania). **Potwierdzone przez właściciela 22 września 2026:
chodziło o sesje LOGOWANIA, punkt jest zamknięty** (§14 pkt 1).

### 1.2 Co zostaje do zrobienia

Cztery dziury z zamówienia plus dwie pozycje, które właściciel zapisał wcześniej
w `docs/CHANGELOG.md` („Dalej": *panel: pulpit floty, statystyki, analityka zużycia,
skrzynka rozjazdów i eksporty kart dnia w nowym stylu*):

1. **operacje per pilot i grupowanie dniami** - dziennik ma dziś wyłącznie oś MASZYNY
   (trzy poziomy) i płaski grid sortowany czasem (§4);
2. **edycja przesłanych zdarzeń** - panel 2.0 nie ma ani jednego ekranu korekty, choć
   serwer ma komplet tras do POPRAWIANIA; dopisania brakującego faktu trasy nie ma
   i ją dostanie (§5);
3. **reagowanie na nieścisłości** - flag **nie widzi dziś nikt**: telefon je stracił przy
   issue #82 z uzasadnieniem „rozstrzyga je panel", a panel ich nie pokazuje (§6);
4. **eksporty kart dnia** - dziennik eksportu i ponowienie bez klienta (§7);
5. **statystyki i analityka zużycia** - `/stats` i `/fleet/:id/consumption` bez klienta (§8);
6. **pulpit** - wraca wyłącznie jako „Do sprawdzenia", nie jako kafle z licznikami (§9).

**Uzupełnienie 2026-09-25 - dochodzi zgłoszenie #205 „Obserwowanie samolotu"** (decyzja
właściciela: wydanie razem z 3.2.0). To jedyna część tego milestone'u dotykająca APLIKACJI
PILOTA: karta maszyny w telefonie z wykresami motogodzin i paliwa, obserwowanie
i pięć powiadomień o lotach maszyny, nowa zdolność `fleet.watch`. Dokument decyzji,
model, etapy O-A…O-D i to, co zmienia w §10-§12: **`docs/obserwowanie-samolotu.md`**.

### 1.3 Świadomie poza zakresem

- **konserwacja** (`/admin/api/maintenance/*`: przebudowa projekcji, czyszczenie refreshy,
  wersja schematu) - narzędzia operatora, nie klubu. Woła się je dziś z konsoli i to
  wystarcza; ekran dla czynności wykonywanej raz na pół roku byłby pozycją w kolumnie,
  która uczy oko ją pomijać;
- **adapter Google Sheets** - karta arkusza żyje w bazie i pod adresem `/sheets/…`;
  podmiana portu `SheetsPort` na prawdziwy arkusz klubu to osobna decyzja
  (`docs/_main.md.txt` §4.7), niezależna od tego, czy panel pokazuje dziennik eksportu;
- **zakładanie konta z panelu** - issue #180, milestone 3.1.0. Jeśli wejdzie wcześniej,
  ta rozbudowa nic z tym nie robi;
- **moduł Organizacje i Zgłoszenia** - należą do platformy i ten milestone ich nie tyka;
- **progi analityki** - stroi je `server/scripts/consumptionReplay.ts` na prawdziwych
  danych, nie ekran (`docs/_main.md.txt` §3.6b).

---

## 2. Rzecz, która przesądza o koszcie: serwer jest gotowy

Wszystkie trasy panelu 1.0 **są zarejestrowane i żyją** - panel 2.0 po prostu przestał je
wołać (`docs/panel-2.0.md` §1: „API serwera nie zmieniło się ani o jedną trasę"). Co
więcej, przeszły epik C wielofirmowości, więc są klubowe i każda ma przypadek
w `server/test/tenantIsolation.test.ts`:

| Trasa | Zdolność | Ekran rozbudowy |
|---|---|---|
| `GET /sessions` (filtry `aircraftId`, **`pilotId`**, `status`, `flagged`, `exported`) | `panel.access` | §4 dziennik, obie osie |
| `GET /log` | `panel.access` | §4 poziom 1, oś maszyn |
| `GET /stats` (wiersze per maszyna **i per pilot**) | `panel.access` | §4 oś pilotów, §8 statystyki |
| `POST /sessions/:uuid/corrections` + `/preview` | `events.correct` | §5 korekty |
| `GET /audit` | `audit.read` | §5 historia zmian |
| `GET /flags`, `POST /flags/:id/resolve` | `panel.access` / `flags.resolve` | §6 rozjazdy |
| `GET /exports`, `/exports/:uuid`, `/exports/:uuid/sheet`, `POST /exports/:uuid/retry` | `panel.access` / `fleet.manage` | §7 eksporty |
| `GET /fleet/:id/consumption` | `panel.access` | §8 analityka |
| `GET /dashboard` | `panel.access` | §9 „Do sprawdzenia" |
| `GET /events` | `panel.access` | rejestr surowy - do decyzji, §14 pkt 6 |

**Konsekwencja dla planu: ta rozbudowa to w przeważającej części makiety i frontend.**
Cienkie plastry serwera wolno dokładać (precedens: epik H-D niósł trzy pola, H-E jedną
trasę), ale każdy nowy odczyt płaci za obu strażników epiku C - przypadek
w `tenantIsolation.test.ts` i `org_id` widoczny w metodzie adaptera
(`architecture.test.ts`).

**Jedno miejsce jest wyjątkiem i to jest decyzja właściciela z 22 września 2026**:
dopisanie brakującego zdarzenia z panelu (§5.4) trasy nie ma i musi ją dostać. To
JEDYNA nowa droga zapisu w tym milestone - wszystkie pozostałe epiki czytają.

**Pułapka, o której trzeba pamiętać przy każdym epiku**: te trasy pisano pod makiety 1.0,
czyli pod inne pytania. Kontrakt, który „prawie" pasuje, jest gorszy niż cienki plaster:
ekran naginany do cudzej odpowiedzi kończy się arytmetyką w widoku, a tej zabrania
`admin/test/architecture.test.ts`.

---

## 3. Nawigacja: sześć pozycji i ekran startowy

Kolumna klubu ma dziś cztery pozycje (Dziennik, Piloci, Samoloty, Kalendarz). Dochodzą
dwie: **Do sprawdzenia** (§9) i **Statystyki** (§8) - analityka zużycia pozycji nie
dostaje, bo jest własnością maszyny i mieszka w szufladzie samolotu.

Trzy ograniczenia z `admin/src/ui/shell/nav.ts`, których nie wolno naruszyć:

1. **kolejność tablicy JEST ekranem startowym** - `homeFor` bierze pierwszą dostępną
   pozycję. Dziennik zostaje pierwszy;
2. **grupy mają sens od siedmiu pozycji w górę** - przy sześciu lista zostaje płaska;
   pierwszy siódmy moduł wraca do tej decyzji;
3. **pozycja należy do zdolności** - moduł bez prawa wejścia nie jest wyszarzony, tylko
   go nie ma.

Kolejność (rozstrzygnięta 22 września 2026, §14 pkt 7; makiety P-A 25 września): **Dziennik ·
Do sprawdzenia · Kalendarz · Statystyki · Piloci · Samoloty** - najpierw to, co się wydarzyło
i co wymaga reakcji, potem to, co zaplanowane i ile tego było, na końcu konfiguracja klubu,
którą rusza się raz na sezon. Ikony: skrzynka (Do sprawdzenia) i słupki (Statystyki);
klasa plakietki `.nav-count` w `shell.css`.

**Plakietka z liczbą przy „Do sprawdzenia" pojawia się WYŁĄCZNIE przy niezerowej liczbie** -
to jest reguła SyncChipa z issue #12 zastosowana do kolumny: stan domyślny („nic nie
czeka") nie dostaje ozdoby, bo licznik świecący zawsze uczy oko pomijać to miejsce.

---

## 4. Dziennik: druga oś i grupowanie dniami

### 4.1 Dwie osie odpowiadają na dwa pytania o ten sam zakres

Poziom 1 dziennika pokazuje dziś flotę w zakresie dat. Zamówienie chce drugiej listy -
operacji pilota - i mówi wprost, że **obie są ze sobą powiązane**. To nie jest drugi moduł:
to ta sama doba, te same operacje i dwa pytania („czym latano" i „kto latał"), więc jest to
PRZEŁĄCZNIK OSI na poziomie 1, a nie druga pozycja w kolumnie.

- poziom 1, oś maszyn: jak dziś (`GET /log`);
- poziom 1, oś pilotów: wiersz na pilota z tymi samymi wielkościami, co kafelek operacji
  (Operacje · Loty · Blok · Lot) - dane ma już `GET /stats` (`AdminStatsPilotRow`);
- poziom 2 obu osi: operacje pogrupowane dniami (§4.3);
- poziom 3: jedna operacja - **z dwoma wyjściami**, do osi maszyny i do osi pilota. Tym
  „powiązaniem list" jest link w obie strony, a nie trzecia lista.

### 4.2 Adres osi pilota: pierwszy segment jest już zajęty

`#/dziennik/:reg` bierze dziś cały pierwszy segment, więc `#/dziennik/BNO` byłoby
odróżnialne od rejestracji wyłącznie heurystyką po kształcie napisu - a heurystyka
w adresie to pułapka, która odzywa się przy pierwszym klubie ze znakiem spoza wzorca.

Propozycja: **`#/dziennik/pilot/:code`** (segment statyczny wygrywa w routerze
z dynamicznym, a „pilot" nigdy nie będzie znakiem rejestracyjnym) i operacja z tej osi
prowadząca do istniejącego `#/dziennik/:reg/:uuid`, bo operacja ma dokładnie jedną maszynę.
Kod pilota jest jedyny w klubie i czytelny, więc nadaje się do wklejenia w rozmowie - tak
samo jak rejestracja (`docs/panel-2.0.md` §9.1). **Do potwierdzenia w §14 pkt 2.**

### 4.3 Doba jest NAGŁÓWKIEM, nie kolumną

Grupowanie dniami znaczy nagłówek doby (data + sumy doby: Operacje · Loty · Blok · Lot)
i operacje jako jego wiersze. Kolumna z datą przy każdym wierszu **znika** - powtarzałaby
nagłówek stojący centymetr wyżej. To ten sam kształt, który dostała historia w aplikacji
pilota przy 3.0.0 (makieta `24`), i to jest zamierzone: jedna rzecz ma w produkcie jeden
kształt (issue #42).

Godzina zostaje przy operacji, bo dwie zmiany jednej maszyny w dobie różnią się wyłącznie
godzinami (`docs/panel-2.0.md` §9.2).

### 4.4 Sumy doby liczy SERWER, bo strona potrafi rozciąć dobę

Grid jedzie kursorem po czasie z limitem 50, więc strona może skończyć się w środku doby.
Gdyby sumy doby liczyła przeglądarka z wczytanych wierszy, pierwsza strona pokazałaby sumę
POŁOWY doby jako sumę doby - i nikt by tego nie zauważył, bo liczba wygląda poprawnie.

Stąd cienki plaster serwera w P-B: **sumy doby przychodzą z odpowiedzi**, a nie z wierszy.
**Rozstrzygnięte w P-A (25 września 2026): JEDNA odpowiedź** - rozszerzone `GET /sessions`
niesie nagłówki dób obok wierszy (wzorzec `GET /bookings`, które oddaje granice dób razem
z zajętością). Dwie trasy oznaczałyby dwa momenty w czasie i sumy niepasujące do wierszy
pod nimi. Makieta L2 pokazuje dobę przeciętą stroną: nagłówek dalej mówi prawdę o całej
dobie, a stopka „Pokazano 50 z 214" stoi pod nią.

### 4.5 Jedna podstawa liczenia dla dziennika i statystyk

**Znalezione przy planowaniu i do naprawy:** `logRepo` pomija operacje unieważnione
(`status <> 'voided'`) **i puste** (`emptySessionSql`, `docs/panel-2.0.md` §9.5), a
`statsRepo` filtruje wyłącznie `status = 'closed'` - czyli **liczy puste operacje**.
Ten sam zakres dat dałby po tej rozbudowie dwie różne sumy na dwóch ekranach panelu,
a po dołożeniu osi pilota także w dwóch osiach JEDNEGO ekranu (§4.1).

Rekomendacja: dołożyć filtr pustych do `statsRepo` - puste zapisy są śmieciem z definicji
właściciela i nie mają czego wnosić do nalotu. Różnica „statystyki liczą tylko zamknięte,
dziennik także trwające" zostaje i jest poprawna, ale ekran musi ją nazwać.
**Do potwierdzenia w §14 pkt 3.**

**Rozstrzygnięte przy P-B (26 września 2026, decyzja właściciela - §16):** różnica NIE
zostaje. Dziennik liczy odtąd na obu osiach wyłącznie operacje ZDANE, tak jak statystyki
i nagłówki dób; operacja w toku jest wszędzie NAZWANA osobno („leci teraz", „· 1 w toku"),
nigdy sumowana. Jedna podstawa liczenia znaczy jedną liczbę nalotu na wszystkich ekranach
panelu dla tego samego zakresu.

---

## 5. Edycja przesłanych zdarzeń

### 5.1 Co serwer już umie

`POST /admin/api/sessions/:uuid/corrections` (zdolność `events.correct`) przyjmuje trzy
akcje - `retime`, `amend` (biała lista pól per typ celu), `void` - a bliźniacza trasa
`/preview` oddaje podgląd „przed → po" wraz z ostrzeżeniami. Do tego istnieją już
`POST /sessions/:uuid/void` (unieważnienie całej operacji) i `/close` (zakończenie
operacji osieroconej) - **i te dwa panel 2.0 ma**. Brakuje wyłącznie korekty pojedynczego
zdarzenia.

Trzy reguły serwera, których panel nie ma prawa obejść:

1. **rejestr zostaje append-only** - korekta DOPISUJE `event_correction`, oryginał zostaje
   na osi na zawsze;
2. **zdarzenie stempluje się PIC-em operacji, nie administratorem** - na pytanie „kto to
   zrobił" odpowiada audyt i `source_device`, nie `pic_id`;
3. **powód korekty idzie do AUDYTU, nie do zdarzenia** - rejestr opisuje lot, a nie
   motywację człowieka przy biurku. W panelu powód jest **wymagany** (inaczej niż
   w telefonie, gdzie pilot poprawia własny wpis - ta sama asymetria, co przy
   unieważnieniu operacji, `docs/panel-2.0.md` §9.4b).

### 5.2 Administrator nie jest NIGDY blokowany

Decyzja z 7 sierpnia 2026 (etap D wielofirmowości i `docs/panel-2.0.md`): kolizja z pracą
pilota (`ADMIN_EDIT_SESSION_ACTIVE`, `ADMIN_EDIT_PILOT_WINDOW_OPEN`) jest **ostrzeżeniem
w banerze nad formularzem**, nigdy odmową. Panel 1.0 miał w `correctionWarnings.ts`
świadomie ZERO pola, z którego dałoby się wyprowadzić wyszarzenie przycisku - inaczej
bramka wraca tylnymi drzwiami. Nowy ekran dziedziczy tę regułę.

### 5.3 Panel mówi słownikiem telefonu

Oś operacji w panelu i oś w aplikacji pilota opisują ten sam bieg silnika, więc nazwy
wierszy („Uruchomienie", „Kołowanie", „Start", „Lądowanie", „Wyłączenie"), plakietka
„popr." przy poprawionej wartości i arkusze korekty mają wyglądać jak rodzina, a nie jak
dwa produkty. Wzorzec: ekrany `10D`–`10I` aplikacji (issue #43) przełożone na styl lekki
panelu - **przełożone, nie przepisane 1:1**: panel ma mysz, szufladę i miejsce, więc
arkusz telefonu bywa tam kartą.

### 5.4 Dopisanie brakującego faktu: TAK, nową trasą (decyzja 2026-09-22)

Telefon umie **dopisać brakujący fakt** (arkusz `10H`: lądowanie, tankowanie, zrzut,
dolewka oleju), bo pilot jest piszącym swojego rejestru - ale wyłącznie w oknie 24 h od
zdania maszyny. Po oknie nie umie tego nikt: korekta poprawia zdarzenie ISTNIEJĄCE,
a brakującego lądowania nie da się poprawić, bo go nie ma.

**Właściciel rozstrzygnął 22 września 2026: administrator dopisuje.** To jedyna nowa
droga zapisu w tym milestone i ma zachowywać się jak młodsza siostra korekty, a nie jak
drugi ingest:

- **ta sama zdolność, co korekta** (`events.correct`) - to jest ta sama władza: pisanie
  w cudzym rejestrze. Nowej zdolności nie dokładamy (§10);
- **ta sama maszyneria w jednej transakcji, co `commands/corrections.ts`**: blokada
  operacji, dopisanie zdarzenia, `projectSession` na nowo, `upsert` wiersza projekcji,
  przeliczenie flag łańcucha tym samym `chainFlags`, co ingest, ponowny eksport karty
  dnia i wpis audytu. Ekran pokazujący dopisany wpis, którego nie widzą sumy ani karta
  arkusza, byłby gorszy niż brak tej funkcji;
- **zdarzenie stempluje się PIC-em operacji, nie administratorem** - inaczej wywraca się
  „jeden piszący" (`WRITER_MISMATCH`) i fałszuje się atrybucja nalotu. Na pytanie „kto to
  zrobił" odpowiada audyt (`event.add`, obok istniejącego `event.correct`)
  i `source_device`;
- **twarde reguły domeny obowiązują identycznie** (`checkAppend` z uprawnieniem
  `'administrative'`, `writeAuthority.test.ts`): lądowanie bez startu, zrzut na ziemi czy
  tankowanie przy pracującym silniku odbijają się tak samo, jak odbiłyby się telefonowi;
- **biała lista typów jest WĄSKA** - to, co telefon oferuje na `10H`: start, lądowanie,
  tankowanie, zrzut, dolewka oleju, załadunek. **Uruchomienia i wyłączenia silnika na niej
  NIE MA**, bo wyznaczają kopertę operacji, a dopisanie ich z panelu znaczyłoby stworzenie
  biegu silnika, którego nikt nie widział. Poza listą stoją z tego samego powodu
  `session_claim`, `preflight_confirm` i `day_close` (tożsamość operacji i końce łańcucha
  motogodzin);
- **powód WYMAGANY**, jak przy korekcie, i idzie do audytu, nie do zdarzenia;
- **pilot to zobaczy** - `GET /me/events` dosyła zapisy administratora na telefon
  (issue #32), więc dopisany fakt wchodzi na jego oś tą samą drogą, co korekta. To nie
  jest skutek uboczny, tylko warunek: wpis, o którym pilot nigdy się nie dowie, jest
  w dzienniku lotniczym wadą.

Ryzyko nazwane wprost: to pierwsza droga, którą do rejestru trafia fakt niezaobserwowany
ani przez telefon, ani przez przyrząd. Stąd wąska biała lista, wymagany powód i ślad
w audycie - a nie stąd, że tak ładniej.

---

## 6. Rozjazdy: flagi, których dziś nie widzi nikt

Serwer wystawia sześć rodzajów flag przy przyjmowaniu zapisów: `mh_gap`, `mh_regression`,
`aircraft_overlap`, `pilot_overlap`, `fuel_mismatch`, `clock_drift`. Zasada
z `docs/_main.md.txt` §4.5 brzmi „serwer nie odrzuca, flaguje" - a flaga jest zdaniem
skierowanym **do administratora**.

**Dziś nie czyta ich nikt.** Issue #82 zdjęło „uwagi serwera" z aplikacji pilota
z uzasadnieniem, które było słuszne („pilot dostawał listę rzeczy, których nie naprawi -
rozstrzyga je panel"), tyle że panel 2.0 skrzynki flag nie ma. Ta dziura jest najmocniejszym
argumentem za tym epikiem: system od miesięcy wykrywa nieścisłości i mówi o nich w próżnię.

Zakres ekranu:

- **lista** z filtrem statusu i rodzaju, porządek `(status, created_at DESC)` - indeks
  istnieje od 1.0;
- **rozstrzygnięcie z notatką** (`flags.resolve`); notatka idzie do audytu, tą samą granicą,
  co powód korekty;
- **`aircraft_overlap` jest bramką karty arkusza** (`EXPORT_BLOCKING_FLAG_TYPES`), więc jej
  zamknięcie wywołuje re-eksport - ekran musi to powiedzieć PRZED kliknięciem, bo to jedyna
  flaga, której rozstrzygnięcie zmienia dokument klubu;
- **plakietka flagi na poziomie 2 i 3 dziennika** - flaga opisuje operację, więc ma stać
  przy niej, a nie wyłącznie w osobnej skrzynce;
- **`pilot_overlap` nie dotyka arkusza** - to anomalia grafiku. Dwie różne patologie
  rozdzielono 7 sierpnia 2026 i ekran nie ma prawa ich zlewać.

Reguła redakcyjna: flaga mówi, CO jest nie tak i CO z tym zrobić. Nie opisuje wnętrza
ingestu ani tego, jak liczy się łańcuch motogodzin (kategoria przypisów wyrzuconych
z aplikacji przy issue #43 i #72).

---

## 7. Eksporty kart dnia

Karta arkusza to **doba SAMOLOTU** (etap D3 przebudowy flow): jeden dokument na parę
(doba, maszyna), operacje jako jego bloki. Dziennik eksportu jest append-only i w tym jest
jego wartość - po nim, i tylko po nim, da się odpowiedzieć na pytanie „co widział skarbnik
klubu, kiedy zamykał miesiąc".

Zakres ekranu: stan karty (`ok` / `missing` / `failed` / `impossible` dla operacji
unieważnionej), ponowienie (`fleet.manage`), link do karty i podgląd treści
(`GET /exports/:uuid/sheet`).

Dwie rzeczy do sprawdzenia w P-D:

1. **link do karty jest BEZWZGLĘDNY** - `dayExporter` zapisuje `sheetUrl` złożony
   z `PUBLIC_BASE_URL`, a domena zmieniła się przy issue #124. Karty wyeksportowane przed
   przeniesieniem niosą stary host; ekran ma pokazywać adres, który działa;
2. **adres karty ma od epiku C slug klubu i sekret** (`/sheets/<slug>/<tab>?k=…`) - trasa
   nie ma sesji i to jest jej sens (skarbnik bez konta), więc panel pokazuje ten link
   świadomie, a nie „przy okazji".

---

## 8. Statystyki i analityka zużycia

**Statystyki** (`GET /stats`) to nalot w zakresie dat: sumy, wiersze per maszyna i per
pilot, liczba operacji otwartych. Moduł ma jedno zadanie - odpowiedzieć na „ile tego było
w tym sezonie" - i dzieli zakres dat z dziennikiem (§4.5: ta sama podstawa liczenia).

**Analityka zużycia** (`GET /fleet/:id/consumption`) jest własnością MASZYNY, więc nie
dostaje pozycji w kolumnie - wchodzi jako karta w szufladzie samolotu, obok norm i stanu
bieżącego. Treść: pasmo zużycia z lotów tej maszyny, stawki fazowe, przelicznik
motogodzin, liczba obserwacji.

Trzy reguły redakcyjne, wszystkie już rozstrzygnięte gdzie indziej i tu tylko stosowane:

- **brak danych = milczenie** (issue #69): młoda maszyna nie ma policzonej normy i ekran
  wtedy o normie NIE PISZE. Zero w miejscu pomiaru jest kłamstwem, a zdanie „nie ma jeszcze
  danych" opisuje wnętrze analityki komuś, kto nic z tym nie zrobi;
- **norma wyliczona z lotów i norma z dokumentacji to dwie różne liczby** (issue #66)
  i ekran nazywa, którą pokazuje - pasmo z dokumentacji jest ZADEKLAROWANE, nie zmierzone;
- **panel nie liczy po swojemu** - z `@ninerdeck/domain` wolno brać wyłącznie typy, a sumy
  przychodzą policzone (`admin/test/architecture.test.ts`).

---

## 9. Pulpit wraca jako „Do sprawdzenia", nie jako kafle

Panel 1.0 miał pulpit z licznikami i panel 2.0 wyrzucił go świadomie („bez kafli
z licznikami"). Nie wracamy do tamtego ekranu - wraca jego jedyna użyteczna część.

`GET /dashboard` oddaje już dokładnie to, czego potrzeba: `attention` z trzema źródłami -
**flagi otwarte**, **nieudane eksporty** i **operacje wiszące** (przejęte, niezdane, poza
oknem korekty). To jest jeden moduł z jednym pytaniem: **co wymaga mojej reakcji**.

- **nie jest ekranem startowym** - Dziennik zostaje pierwszy (§3). Pulpit jako ekran wejścia
  każe przeczytać podsumowanie każdemu, kto przyszedł po jedną rzecz;
- **liczniki są podpisami pozycji, nie kaflami** - „3 rozjazdy", a nie sześć płytek
  z liczbami, z których pięć zawsze pokazuje zero;
- **każda pozycja jest linkiem do miejsca, w którym da się z tym coś zrobić** - lista, która
  wyłącznie informuje, jest czwartą kopią tych samych danych;
- **stan pusty jest DOBRĄ wiadomością** i tak ma wyglądać - bez ostrzeżeń i bez zer.

Skrzynka flag (§6) i dziennik eksportu (§7) są ekranami TEGO modułu, a nie trzema
pozycjami w kolumnie: to trzy odpowiedzi na jedno pytanie.

---

## 10. Uprawnienia: ani jednej nowej zdolności

Komplet potrzebnych zdolności istnieje i wszystkie ma rola `admin`: `panel.access`
(dziennik, statystyki, analityka, pulpit), `events.correct` (korekty), `flags.resolve`
(rozjazdy), `fleet.manage` (ponowienie eksportu), `audit.read` (historia zmian). Role
zostają dwie (`admin`, `pilot` - `docs/panel-2.0.md` §3.2a).

Zdolność dokłada się wtedy, gdy pojawia się nowy ZASÓB albo nowa oś władzy
(`reservations.manage` przy rezerwacjach) - a tu żaden z tych dwóch warunków nie zachodzi.

> **UZUPEŁNIENIE PO ISSUE #216 (2026-09-25, „panel dla wszystkich" - `docs/uprawnienia.md`
> §13).** Ról nie ma od 3.1.0 (epik #197), a do panelu wchodzi odtąd KAŻDY aktywny członek:
> `panel.access` jest „Podglądem klubu" (dziennik, piloci, samoloty do odczytu), kalendarz
> i Moje konto ma każdy. Każdy nowy ekran tego planu - pulpit „Do sprawdzenia", rozjazdy,
> eksporty, statystyki, edycja zdarzeń - dostaje przez to DWA pytania zamiast jednego:
> którą zdolnością bramkować odczyt (domyślnie `panel.access`) i czy trasa ma `RequireCapability`
> z ekranem „Brak dostępu" (ma - każda trasa modułu). **Do tego epiku dochodzi jeden punkt
> spoza planu, odłożony tu decyzją właściciela:** WŁASNA REZERWACJA Z PANELU. Pilot z pustym
> zakresem widzi dziś kalendarz w panelu, ale rezerwuje wyłącznie w aplikacji („Zarezerwuj
> za pilota" stoi na `reservations.manage`). Formularz jak 22/22A z telefonu (termin
> i maszyna, potem zadanie), sugestie slotów z `GET /bookings/suggestions`, zapis na trasę
> telefonu albo nową trasę panelu bez zdolności - do rozstrzygnięcia w P-A.

**Uzupełnienie 2026-09-25: JEDNA nowa zdolność jednak dochodzi - `fleet.watch`** ze
zgłoszenia #205 (`docs/obserwowanie-samolotu.md` §3), bo dołączyło ono do tego wydania.
Zdanie wyżej zostaje prawdziwe dla sześciu epików panelu: obserwowanie jest nowym
RODZAJEM dostępu do floty (patrzeć i być budzonym, nie zarządzać), czyli dokładnie tym
warunkiem, o którym mówi akapit. Katalog panelu i opisy zestawów zmienia epik O-D;
migracja 15 to sam DDL, bez backfillu zestawów (tamże §3.2 - decyzja właściciela
2026-09-25: baza nie ma jeszcze prawdziwych klubów).

---

## 11. Wydanie: panel jedzie bez APK i PRZED Google Play

**Decyzja właściciela z 22 września 2026.** Panel wychodzi jako osobne wydanie, nie czeka
na sklep.

Uzasadnienie: panel i serwer wdrażają się jednym obrazem na Railway, a **aplikacji pilota
ten milestone nie rusza w ogóle** - nie ma więc ani nowego APK, ani aktualizacji OTA.
Publikacja w Google Play (milestone „Google Play i własna domena 4.0.0", issue #104 i #105)
zależy od rzeczy, które nie zależą od tempa pracy: konta organizacji, weryfikacji firmy
D-U-N-S (do 30 dni) i karty bezpieczeństwa danych. Wiązanie panelu z tym terminem
przesuwałoby gotowy panel o tygodnie.

Konsekwencje, które musi obsłużyć epik P-W:

- **numer wydania: 3.2.0** (potwierdzone 22 września 2026), a kamień milowy przemianowany
  na „Panel admina 3.2.0". Numer 4.0.0 zostaje wyłącznie dla publikacji w sklepie, więc
  nazwa kamienia milowego zgadza się z tym, co pokaże strona wydań;
- **`app/app.json` NIE ROŚNIE** - reguła z `CLAUDE.md` jest twarda: `version` podnosi się
  wyłącznie przy nowym APK, bo przy `runtimeVersion: appVersion` numer wersji jest kluczem
  aktualizacji i podbicie go bez builda osierociłoby wszystkie zainstalowane aplikacje;
- **changelog potrzebuje drugiego wzorca nagłówka** - `splitTitle`
  w `site/tools/render-changelog.mjs` rozpoznaje `## <wersja> (build <N>) · <data>`,
  a przy braku `(build N)` wkłada cały tytuł w miejsce wersji. Wydanie bez binarki to
  pierwszy taki przypadek w historii projektu;
- **migracja** - dziś żadnej nie przewidujemy, a gdyby doszła, jest wyłącznie addytywna
  (produkcja żyje od 16 września 2026). Środowiska staging NIE MA: postawione i wycofane
  2026-09-22 (`CLAUDE.md`, „Staging ODRZUCONY"), więc pierwszy przebieg migracji dzieje
  się na produkcji - to jest znana cena, nie przeoczenie;
- **podręcznik** - strony panelu w `docs/podrecznik/` osadzają makiety dyrektywą `@panel`,
  więc każdy nowy ekran ma stronę albo akapit. Reguła „zmiana ekranu w PR = zmiana strony
  podręcznika" obowiązuje każdy epik, nie tylko wydaniowy.

**Uzupełnienie 2026-09-26 - akapit niżej jest NIEAKTUALNY**: obserwowanie wyszło
w 3.1.0 razem z nowym APK (decyzja właściciela przy gałęzi wydaniowej - kod był już na
`develop`), więc 3.2.0 wraca do zdania „aplikacji pilota nie rusza". Migracja 15 weszła
na produkcję z 3.1.0; `fleet.watch` jest w katalogu od 3.1.0.

**Uzupełnienie 2026-09-25 - aplikacja pilota JEDNAK dostaje aktualizację, ale OTA:**
zgłoszenie #205 (`docs/obserwowanie-samolotu.md`) dołączyło do 3.2.0 i niesie ekran karty
maszyny, wykresy i pięć powiadomień w telefonie. Modułu natywnego nie rusza, więc jedzie
`npm run update:prod` na runtime 3.1.0 **bez podbicia `version`** - zdanie o `app.json`
wyżej zostaje w mocy. Kolejność wdrożenia: serwer z migracją 15 i panel PRZED OTA; telefony
na 3.0.0 nic nie dostają, bo i tak potrzebują APK 3.1.0. Migracja 15 jest addytywna
(§4 tamtego dokumentu), więc punkt o migracji wyżej dostaje pierwszy realny przypadek.

---

## 12. Etapy i kolejność realizacji

```
P-A projekt i makiety ──┬─► P-B dziennik: oś pilota + doby ──► P-C korekty zdarzeń ──┐
    (blokuje wszystko)  ├─► P-D do sprawdzenia: rozjazdy i eksporty ─────────────────┼─► P-W wydanie
                        └─► P-E statystyki i analityka zużycia ────────────────────── ┘
```

1. **P-A - projekt i makiety** (design-first, blokuje resztę): makiety wszystkich nowych
   ekranów w `design/panel/` z kopii `SZABLON.html`, nowe komponenty
   w `admin/src/styles/components/` i `npm run panel:css`. Decyzje z §14 zapadły
   22 września 2026, więc epik zaczyna się od rysowania.
2. **P-B - dziennik**: druga oś, doby jako nagłówki, sumy doby z serwera, powiązanie list.
3. **P-C - korekty i dopisywanie**: tryb edycji na osi operacji, podgląd „przed → po",
   historia zmian z audytu **oraz nowa trasa dopisania brakującego zdarzenia** (§5.4) -
   jedyna nowa droga zapisu w tym milestone. **Po P-B**, bo oba epiki dotykają poziomu 3.
4. **P-D - do sprawdzenia**: moduł z trzema źródłami (flagi, eksporty, operacje wiszące).
   Może iść równolegle z P-B.
5. **P-E - statystyki i analityka**: moduł statystyk i karta analityki w szufladzie
   samolotu. Może iść równolegle; zależy od §4.5 (jedna podstawa liczenia).
6. **P-W - wydanie**: changelog, podręcznik, przegląd bezpieczeństwa, wdrożenie.
7. **O-A…O-D - obserwowanie samolotu** (uzupełnienie 2026-09-25, zgłoszenie #205):
   makiety telefonu → serwer (migracja 15, powiadomienia, karta) → aplikacja → katalog
   zdolności w panelu. Niezależne od P-A…P-E; wchodzą do P-W jako OTA aplikacji.
   Etapy i zależności: `docs/obserwowanie-samolotu.md` §9.

| Epik | Issue |
|---|---|
| P-A projekt i makiety | #182 |
| P-B dziennik: oś pilota i doby | #183 |
| P-C edycja przesłanych zdarzeń | #184 |
| P-D do sprawdzenia: rozjazdy i eksporty | #185 |
| P-E statystyki i analityka zużycia | #186 |
| P-W wydanie 3.2.0 | #187 |
| O-A obserwowanie: makiety telefonu i zakres w panelu | #219 (zgłoszenie nadrzędne #205) |
| O-B obserwowanie: serwer - migracja 15, powiadomienia, karta maszyny | #220 |
| O-C obserwowanie: aplikacja - karta 27, wykresy z gestami, skrzynka | #221 |
| O-D obserwowanie: panel - `fleet.watch` w katalogu i zestawach | #222 |

---

## 13. Ryzyka

| # | Ryzyko | Co z nim robimy |
|---|---|---|
| R1 | **Termin 31 października** wobec sześciu epików | Tempo poprzednich wydań na to pozwala (2.0.0: 10 epików w 7 dni, 3.0.0: 7 epików), a serwer jest gotowy (§2). Panel nie potrzebuje APK, więc nie ma ryzyka sklepu ani reinstalacji |
| R2 | **Rozjazd `/log` i `/stats`** - dwie sumy dla jednego zakresu (§4.5) | Rozstrzygnąć w P-A, naprawić w P-B albo P-E; test krzyżowy na obu drogach |
| R3 | **Kontrakty pisane pod makiety 1.0** | Przy każdym epiku sprawdzić, czy trasa odpowiada na TO pytanie; cienki plaster serwera jest tańszy niż ekran naginany do cudzej odpowiedzi |
| R4 | **Makiet jest realnie 8-12** i to jest praca, nie formalność | Cała w P-A, przed kodem; inwentarz komponentów w `SZABLON.html` rośnie razem z nimi |
| R5 | **Doba rozcięta stroną** (§4.4) | Sumy doby liczy serwer; test na dobę przeciętą granicą strony |
| R6 | **Kolumna rośnie do sześciu pozycji** (§3) | Lista zostaje płaska; siódmy moduł wraca do decyzji o grupach |
| R7 | **Nowe odczyty a izolacja klubów** | Każda nowa trasa płaci za obu strażników epiku C - inaczej `tenantIsolation.test.ts` nie przejdzie i to jest zamierzone |
| R8 | **Dopisywanie zdarzeń z panelu** (§5.4) - pierwsza droga, którą do rejestru trafia fakt niezaobserwowany przez telefon | Wąska biała lista typów, powód wymagany, audyt `event.add`, te same twarde reguły domeny (`writeAuthority.test.ts`) i ta sama przebudowa projekcji oraz flag, co przy korekcie |

---

## 14. Decyzje podjęte 22 września 2026

Komplet siedmiu punktów rozstrzygnięty PRZED startem P-A; nic nie zostaje otwarte.

1. **„Zarządzać sesjami użytkowników" = sesje LOGOWANIA** (właściciel). Punkt zamknęło
   wydanie 2.1.0: lista urządzeń członka, „ostatnio aktywny", zdalne wylogowanie
   i `#/konto`.
2. **Adres osi pilota: `#/dziennik/pilot/:code`** - segment statyczny wygrywa w routerze
   z `:reg`, a „pilot" nigdy nie będzie znakiem rejestracyjnym.
3. **Jedna podstawa liczenia: filtr pustych operacji wchodzi do `statsRepo`** (§4.5).
   Rozjazd dotyczy wyłącznie LICZNIKA operacji i liczby dni aktywnych - pusta operacja
   nie ma biegu silnika ani lotów, więc do bloku i nalotu wnosi zero. Dwie różne liczby
   operacji za ten sam tydzień na dwóch ekranach jednego panelu są jednak nie do obrony.
4. **Administrator DOPISUJE brakujące zdarzenie** (właściciel) - nowa trasa serwera na
   istniejącej zdolności `events.correct`; granice i reguły w §5.4, ryzyko jako R8.
5. **Numer wydania 3.2.0, kamień milowy przemianowany** (właściciel); 4.0.0 zostaje dla
   publikacji w sklepie (§11).
6. **Surowy rejestr zdarzeń (`A04`) NIE wraca w tym wydaniu** (właściciel) - oś operacji
   na poziomie 3 odpowiada na to samo pytanie językiem człowieka, a trasa `GET /events`
   zostaje i da się ją dołożyć później bez przebudowy.
7. **Kolejność kolumny**: Dziennik · Do sprawdzenia · Kalendarz · Statystyki · Piloci ·
   Samoloty (§3).

---
## 15. Odrzucone warianty - nie wracać

- **odzyskanie ekranów panelu 1.0 z historii gita** - zamówienie mówi wprost: rozbudowujemy
  wersję 2, wymagania i design zbieramy na nowo. Tamte ekrany powstały przed pivotem
  „operacja = jeden bieg silnika", przed wielofirmowością i przed stylem lekkim;
- **pulpit jako ekran startowy z kaflami liczników** - odrzucony w 2.0 i odrzucony ponownie
  (§9);
- **osobna pozycja w kolumnie dla analityki zużycia** - analityka jest własnością maszyny
  i mieszka w jej szufladzie (§8);
- **sortowanie po każdej kolumnie gridu** - serwer sortuje kursorem po czasie i tylko po nim;
  sortowanie w przeglądarce ustawiłoby wyłącznie wczytaną stronę, czyli kłamałoby o całości
  (`docs/panel-2.0.md` §9.6);
- **eksport danych z panelu drugim kanałem** (CSV, arkusz „po swojemu") - druga prawda
  o tych samych danych; karta dnia jest dokumentem klubu i robi ją serwer;
- **wejście superadministratora w dane klubu** - rozstrzygnięte przy issue #101 i ten
  milestone tego nie zmienia;
- **wyszarzony przycisk zamiast braku akcji** - bramka bez powodu wraca tylnymi drzwiami
  (§5.2).

---

## 16. Odstępstwa wobec planu - gdzie ich szukać

| Epik | Odstępstwo | Sekcja |
|---|---|---|
| P-A | Baner niespójności operacji (`rules/consistency.ts`) w trybie edycji wymaga cienkiego plastra serwera - panelowi wolno brać z domeny wyłącznie typy. **Rozstrzygnięte 26 września: serwer przysyła wynik razem z operacją** | §17 pkt 6, §17.1 |
| P-A | Loty jako drugi pilot na osi pilotów. **Rozstrzygnięte 26 września: WŁASNA KOLUMNA i własna suma** (wariant B), także w tabeli pilotów statystyk - `GET /log?os=piloci` i `GET /stats.pilots` niosą czas w prawym fotelu osobno | §17 pkt 3, §17.1 |
| P-A | Oś pilotów na poziomie 1. **Rozstrzygnięte 26 września: lista tych, którzy latali (dowódca ALBO drugi pilot) + LICZBA zwiniętych członków bez lotów**, rozwijana na żądaniu - plaster w `GET /log` (nie jest samym `GET /stats.pilots`) | §17 pkt 2, §17.1 |
| P-B | **Sumy OBU osi liczą wyłącznie operacje ZDANE; operacja w toku jest nazwana osobno** (decyzja właściciela 2026-09-26, w dwóch turach: najpierw oś pilotów, potem „obie osie tylko zamknięte"). Pierwsza wersja P-B liczyła operację w toku na obu osiach „tym, co już zapisała" (reguła osi maszyn z 2.0: inaczej dzisiejszy dzień byłby pusty do wieczora) - właściciel potwierdził kanwy makiet (`dziennik-flota`, L1b: „suma nie obejmuje operacji w toku") i §4.5: JEDNA podstawa liczenia dla obu osi, nagłówków dób i statystyk. Dzisiejszy dzień nie jest pusty, bo wiersz mówi „leci teraz" (`openSessions`), nagłówek doby „· n w toku", a podtytuł karty pilota „· 1 w toku". Osoba z samą operacją w toku stoi na liście z zerami (nie wśród zwiniętych); równość sum obu osi zostaje treścią testu | §4.1, §4.4, §4.5 |
| P-B | **Sygnał „trzyma SP-KLM od 06 WRZ 08:15" zamiast „nie zdała …"**: czasownika w czasie przeszłym nie da się odmienić bez płci (reguła z 3.1.0 - rozstrzygnięcia rzeczownikiem), a „trzyma" brzmi tak samo dla każdego. Operacja w toku dowódcy jedzie w wierszu NIEZALEŻNIE od zakresu, bo mówi o teraz. Makieta poprawiona | §4.1 |
| P-B | **Podtytuł poziomu 2 osi pilota bez zestawu uprawnień** („· pilot ·" z makiety): słownik klubu, z którego ekran zna osobę, zestawu nie niesie, a zestaw jest sprawą modułu Piloci - stoi tam pod „Karta członka". Liczby zakresu w podtytule idą z wiersza osi pilotów tego samego zakresu (`GET /log?os=piloci`), nie z sumowania nagłówków dób w przeglądarce. Makieta poprawiona | §4.1 |
| P-B | **Doba nagłówka liczy się po chwili PRZEJĘCIA** (`claim_time`), po tej samej osi, co kursor i zakres - żeby strona rozcinała dobę na dwie sąsiednie części. Doba sygnatury (kotwica uruchomienia silnika) bywa inna dla biegu zaczętego po północy; sygnatura stoi w wierszu, więc rozjazd jest widoczny | §4.3, §4.4 |
| P-B | **Kolumna „Drugi pilot" w tabeli pilotów STATYSTYK zostaje na P-E** (§17.1 pkt 1 nazywa oba epiki): P-B naprawił wyłącznie podstawę liczenia (§4.5 - puste zapisy poza sumami `GET /stats`), bo przebudowa ekranu statystyk jest treścią P-E | §4.5, §17.1 |

---

## 17. Decyzje makiet P-A (25 września 2026)

Makiety powstały z kopii `SZABLON.html` i stoją w `design/panel/` (spis w `index.html`,
inwentarz nowych komponentów w szablonie). Rozstrzygnięcia, które makiety wniosły ponad
§14 - każde da się obejrzeć na kanwie odpowiedniego pliku:

1. **Oś na poziomie 1 to SEGMENT, nie para chipów** (`.seg`, `dziennik-flota` / `dziennik-piloci`):
   chip zawęża listę, oś rozstrzyga pytanie - dokładnie jedna jest zawsze włączona. Stoi
   PRZED zakresem dat; adres `?os=piloci`, oś maszyn domyślna i nieobecna w adresie.
2. **Oś pilotów (L1b) = ci, którzy w zakresie latali, plus ZWINIĘCI członkowie bez
   lotów** (rozstrzygnięte 26 września - patrz §17.1 pkt 3; do 26 września makieta
   pokazywała wszystkich z zerami). Kolumny: Dni · Operacje · Loty · Blok · Lot ·
   Drugi pilot · Samoloty. Sumy kolumn DOWÓDCY obu osi dla tego samego zakresu są równe
   co do minuty (test dla P-B) i liczą wyłącznie operacje ZDANE - operacja w toku jest
   w wierszu nazwana („leci teraz"), nie sumowana (decyzja właściciela 26 września, §16).
3. **Nalot liczy się dowódcy; czas jako drugi pilot ma WŁASNĄ KOLUMNĘ i własną sumę**
   (rozstrzygnięte 26 września - §17.1 pkt 1; do 26 września: podpis poza sumami).
   Na L1b kolumna „Drugi pilot" z podpisem liczby operacji, na L2b wiersz `tr.as-dual`
   pełnym tonem z plakietką „Drugi pilot" i PIĄTA suma w nagłówku doby. Uczeń bez ani
   jednej operacji jako dowódca ma zera w nalocie i liczbę w swojej kolumnie.
4. **Doba nagłówkiem (L2, L2b)**: `<tbody class="day">` na dobę, nagłówek z datą, dniem
   tygodnia i sumami Operacje · Loty · Blok · Lot; pierwsza komórka wiersza = para godzin
   biegu silnika + sygnatura (kształt kafelka z telefonu), a czas trwania biegu ma własną
   kolumnę „Blok". Operacja w toku i wpis unieważniony poza sumami („· 1 w toku").
5. **Tryb edycji ma WŁASNY ADRES** (`…/edycja`), żeby dało się go wkleić w rozmowie
   („popraw to"); wejście = „Popraw zdarzenia" w nagłówku L3 (zdolność `events.correct`,
   bez niej przycisku nie ma). Korekta to szuflada (`.drawer`), unieważnienie zdarzenia to
   kosz w linii tytułu szuflady, dopisanie - ostatni wiersz osi (`tr.axis-add`).
6. **Baner niespójności nad osią w trybie edycji** (jak 10D w telefonie) - serwer przysyła
   wynik `rules/consistency.ts` razem z operacją (plaster P-C; rozstrzygnięte 26 września,
   §17.1 pkt 2).
7. **Skrzynka rozjazdów mówi po polsku**: Dwie operacje naraz · Pilot w dwóch maszynach ·
   Luka w liczniku · Cofnięty licznik · Rozjazd paliwa · Rozjazd zegara; kody serwera nie
   wychodzą na ekran. Notatka rozstrzygnięcia jest WYMAGANA (jak powód korekty); dla
   `aircraft_overlap` baner o re-eksporcie karty stoi PRZED przyciskiem. Chipy bez liczb -
   liczby w podtytule strony.
8. **Plakietka kolumny = suma trzech źródeł `attention`** (flagi otwarte + karty `missing`
   + operacje wiszące), wyłącznie przy niezerowej. Karta bez spraw na D1 ZNIKA, nie zostaje
   z zerem.
9. **Karty dnia (D3)**: wiersz = operacja, nazwa wiersza = karta (doba samolotu); stany
   po polsku (W arkuszu / Bez karty / Wstrzymana flagą / Czeka na zdanie / Unieważniona);
   adres karty ze slugiem i sekretem pokazany świadomie, z jednym zdaniem komu go dawać.
10. **Statystyki bez kafli**: sumy jako pasek faktów (`.track-facts` z karty śladu),
    słupki „dzień po dniu" i tabele z wierszem `tfoot`; podtytuł nazywa podstawę liczenia
    („operacje zamknięte · n w toku poza sumami").
11. **Analityka zużycia = karta „Zużycie z lotów" w szufladzie samolotu** (S2c): pasmo
    P10–P90 jako wypełnienie, norma z dokumentacji jako marker; bez opublikowanego modelu
    karty NIE MA wcale; wiersz „Motogodziny" gaśnie osobno.
12. **Nowe komponenty** (`admin/src/styles/components/`): `.nav-count` (shell), `.seg`
    (filters), `tr.day-row` i `tr.fold-row` (logbook), `tfoot` (table), `corrections.css`, `attention.css`,
    `stats.css`; wszystkie w inwentarzu `SZABLON.html`, `panel.css` przegenerowany.

### 17.1 Rozstrzygnięcia właściciela (26 września 2026)

Trzy pytania, które makiety P-A zostawiły otwarte, zadane pojedynczo i rozstrzygnięte
na zestawieniu wariantów narysowanych na prawdziwym `panel.css`. Każde ma konsekwencję
dla kontraktu serwera, więc stoją tu razem z nią:

1. **Loty jako drugi pilot: WŁASNA KOLUMNA i własna suma** (spośród: podpis poza sumami /
   własna kolumna / wcale). Nalot liczy się dowódcy jak dotąd (książka lotów, §4.5), ale
   czas w prawym fotelu nie jest podpisem - jest liczbą, którą klub szkolący czyta
   wprost. Wiersz drugiego pilota na poziomie 2 jest zwykłym wierszem z plakietką,
   a doba z takim lotem dostaje piątą sumę po separatorze. **Kolumn „Blok" i „Drugi
   pilot" nie wolno dodać do siebie**: tę samą godzinę lotu szkolnego niesie wiersz
   instruktora i ucznia - i to jest zdanie, które ma stać w podręczniku. Ta sama kolumna
   wchodzi do tabeli pilotów w STATYSTYKACH, z wierszem ucznia bez operacji jako dowódca
   (jedna podstawa liczenia, §4.5); fakt „Piloci" w pasku sum liczy ludzi, którzy latali
   w dowolnym fotelu. Konsekwencja dla P-B i P-E: wiersz pilota w `GET /log?os=piloci`
   i w `GET /stats` niesie `dual: { operations, blockMs }`, nagłówek doby na osi pilota
   `dualBlockMs` (`null` bez takiego lotu - piąta suma nie rysuje się z zera); `Dni`
   liczy dni z JAKIMKOLWIEK lotem.
2. **Baner niespójności w trybie edycji: te same zdania, co na telefonie** (spośród:
   z serwera / panel liczy sam / bez banera). Administrator otwiera operację, żeby ją
   naprawić, i ma od razu wiedzieć, CO jest niekompletne i CZYM to naprawić - a lista
   sprawdzeń ma być jedna dla pilota i administratora. Konsekwencja dla P-C: odpowiedź
   o operacji (`GET /admin/api/sessions/:uuid`) niesie `consistency` - wynik
   `rules/consistency.ts` (kod, zdarzenie, którego dotyczy); panel wyłącznie nazywa po
   polsku, jak rozjazdy. Trzeci imienny wyjątek od „panel bierze z domeny tylko typy"
   NIE powstaje.
3. **Lista pilotów: ci, którzy latali, plus zwinięci członkowie bez lotów** (spośród:
   wszyscy z zerami / zwinięci / tylko latający). Odpowiedź na „kto nie latał w tym
   miesiącu" zostaje na ekranie (liczba w napisie wiersza zwinięcia, rozwinięcie
   kliknięciem), a klub z 60 członkami nie dostaje 45 wierszy zer. „Latał" znaczy: jako
   dowódca ALBO drugi pilot. Konsekwencja dla P-B: `GET /log?os=piloci` oddaje wiersze
   latających i `idle: { count, members?: [...] }` - lista zwiniętych dojeżdża na żądanie
   (`&idle=1`), bo zwykle nikt jej nie rozwija; wiersz zwinięcia nie dostaje plamki
   skeletonu, bo czeka na liczbę. Członkowie wyłączeni nie liczą się do zwiniętych.

