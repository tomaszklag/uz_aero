# Wydania Ninerdeck

<!--
Ten plik jest ŹRÓDŁEM strony „Wydania i zmiany" (/wydania/ na stronie Ninerdeck).
Piszemy go dla pilotów, testerów i klubów - językiem korzyści, bez nazw plików i identyfikatorów.

Format (świadomie wąski, parsuje go site/tools/render-changelog.mjs):
  ## <wersja> (build <numer>) · <data słownie>     - jedno wydanie, najnowsze na górze
  ## W przygotowaniu                                 - to, co weszło do kodu od ostatniego builda
  > jedno zdanie o wydaniu                           - opcjonalnie, tuż pod nagłówkiem
  ### Nowości / ### Poprawki / ### Dla testerów      - grupy
  - punkt (z **pogrubieniem**, `kodem`, [linkiem](url)); długi punkt wolno zawinąć -
    kontynuację wcina się dwiema spacjami i dokleja się do tego samego punktu

  ## Plan wydań                                      - moduł „Co dalej" na stronie (nie jest wydaniem)
  ### <wersja> · <termin>                            - kamień milowy, np. „1.1.0 · planowane na wrzesień 2026";
                                                       bez numeru wersji („Dalej") = koszyk bez terminu
  > jedno zdanie o kamieniu milowym                  - opcjonalnie
  - [x] punkt gotowy (już w kodzie) · [~] w toku · [ ] w planach
  Pierwszy kamień milowy = następne wydanie: jego wersja i termin trafiają na tablicę stanu
  i do nagłówka „W przygotowaniu".

Rytm: przy nowym buildzie produkcyjnym sekcja „W przygotowaniu" dostaje nagłówek
z wersją, buildem i datą (numer builda = appBuildVersion z EAS), a nad nią powstaje
pusta „W przygotowaniu"; z planu znika zrealizowany kamień milowy. Potem:
  node site/tools/update-download.mjs [--release]     - cel strony pobierania
  npm run site                                        - podgląd lokalny (site/dist)
  git commit -am "Wydanie <wersja> (<build>)" && git push
Strona buduje się razem z obrazem serwera, więc push do gałęzi wdrożeniowej publikuje
i aplikację, i changelog - osobnego repozytorium strony nie ma od 2026-09-07.
-->

Wersja aplikacji to `wersja (build)` - wersję podnosimy przy wydaniu, numer builda rośnie
z każdym buildem. Aktualną wersję i numer builda podaje strona pobierania.

## W przygotowaniu

## 4.0.0 (build 7) · 8 października 2026

> Zlecenia lotów: koordynator albo instruktor pyta pilotów o lot w aplikacji i w panelu, zamiast dzwonić do każdego po kolei. Do tego wiadomości na żywo i prostszy język w całej aplikacji.

### Nowości

- **Zlecenia lotów w aplikacji.** Koordynator albo instruktor wysyła zlecenie lotu - termin,
  samolot, zadanie i trasę - konkretnym pilotom albo grupie, na fotel dowódcy lub drugiego
  pilota. Na Pulpicie stoi karta „Zlecenia" z tym, co czeka na Twoją odpowiedź; na zleceniu
  odpowiadasz „Przyjmuję", „Mogę lecieć" albo „Nie mogę" (powód jest opcjonalny), a po
  „Nie mogę" możesz jeszcze zmienić zdanie. Lot, który dostajesz, staje się Twoją
  rezerwacją - z tej karty rezygnujesz z fotela.
- **Zlecenie wysyłasz z telefonu.** Osoba z uprawnieniem „Zlecanie lotów" tworzy zlecenie
  w trzech krokach: termin i samolot (jak przy rezerwacji, z podpowiedziami wolnych godzin),
  zadanie i trasa, załoga - dla każdego fotela „ja", „szukam" (konkretna osoba albo grupa)
  albo „brak". Na karcie zlecenia widzi, kto odczytał i kto odpowiedział, wybiera spośród
  chętnych, może przesunąć termin, usunąć osobę z adresatów, wysłać zlecenie ponownie albo
  powielić je na inny dzień.
- **Rozmowa przy każdym zleceniu.** Zlecający i każdy z adresatów mają własną rozmowę.
  Nowe wiadomości pojawiają się od razu i widać, czy zostały odczytane. Koordynatorzy lotów
  klubu mogą ją czytać, a rozmowa mówi o tym wprost.
- **Zlecenia w kalendarzu i w skrzynce.** Termin zlecenia, które szuka załogi, ma na osi
  własny pasek („Zlecenie · szuka dowódcy"), a osoba ze „Zlecaniem lotów" po tapnięciu
  w wolne miejsce wybiera „Zarezerwuj dla siebie" albo „Zleć lot". Nowe zlecenie, zmiana
  terminu (poprzedni przekreślony, z prośbą o nową odpowiedź), przydział, odwołanie
  i wiadomość w rozmowie mają w skrzynce własne wiersze, a zlecenia czekające na Ciebie -
  oznaczenie „Do odpowiedzi". Powiadomienie otwiera zlecenie albo od razu rozmowę.
- **Zlecenia w panelu klubu.** Kolumna panelu ma nowy moduł „Zlecenia" z dwiema listami:
  „Do mnie" (to, o co pytają Ciebie) i „Zlecone" (to, co zlecasz albo prowadzisz jako
  koordynator). Zlecenie wysyłasz z przeglądarki w tych samych trzech krokach, co
  w telefonie. Na karcie zlecenia widzisz, kto odczytał i kto odpowiedział, wybierasz
  spośród chętnych, zamieniasz osobę, usuwasz ją z adresatów, cofasz przydział, przesuwasz
  termin, wysyłasz przypomnienie albo powielasz zlecenie na inny dzień. Adresat odpowiada
  w panelu tak samo jak w aplikacji, a rozmowa ze zlecającym toczy się na żywo w obu
  miejscach naraz.
- **Zlecenia w kalendarzu panelu.** Zlecenie, które szuka załogi, stoi na osi własnym
  paskiem („Zlecenie · szuka dowódcy"), a kliknięcie w wolne miejsce daje osobie
  ze „Zlecaniem lotów" wybór „Zarezerwuj" albo „Zleć lot" - z samolotem i dniem tej
  komórki. Kliknięcie w pasek zlecenia pokazuje, kogo brakuje, i prowadzi do karty
  zlecenia; zlecający odwołuje je stamtąd, a pilot, który dostał lot, może z niego
  zrezygnować.
- **Grupy pilotów.** W module Piloci obok listy członków stoją grupy klubu (np. „Piloci
  An-2"): administrator układa skład, a zlecenie wysłane do grupy trafia do wszystkich
  jej członków.
- **Kolumna panelu w trzech grupach**: Loty (Dziennik, Do sprawdzenia, Statystyki),
  Planowanie (Kalendarz, Zlecenia) i Klub (Piloci, Samoloty).
- **Drugi pilot widzi swoje loty jak dowódca.** Najbliższa rezerwacja na Pulpicie i „Moje
  rezerwacje" liczą także loty, w których siedzisz w prawym fotelu - z nazwiskiem dowódcy.
- **Dzwonek i skrzynka w panelu.** W pasku górnym panelu klubu stoi dzwonek z liczbą nowych
  wiadomości - tych samych, co pod dzwonkiem na pulpicie telefonu: prośby o zgodę, decyzje
  w Twoich rezerwacjach, wiadomości o obserwowanych samolotach. Przeczytane w panelu jest
  przeczytane w telefonie. Nowa wiadomość pojawia się na kilka sekund w lewym dolnym rogu,
  a kliknięcie otwiera to, czego dotyczy.
- **Panel odświeża się sam.** Kalendarz z kolejką decyzji, dziennik i „Do sprawdzenia"
  pokazują zmiany z telefonów i z innych kart przeglądarki od razu, bez przeładowania strony.
- **Baner nowej wiadomości w aplikacji.** Gdy aplikacja jest otwarta, nowa wiadomość
  pojawia się na kilka sekund u góry ekranu - z tym samym zdaniem, co w skrzynce, i bez
  dźwięku. Tapnięcie otwiera to, czego dotyczy, a przesunięcie w górę chowa baner. Nie
  przerywa na ekranie sprawy, której dotyczy (ten się odświeża), ani w kokpicie.
- **Aplikacja odświeża się sama.** Kalendarz, karta rezerwacji, skrzynka z licznikiem przy
  dzwonku, karta samolotu i lista obserwowanych pokazują zmiany od razu, gdy ktoś coś
  zapisze - bez wychodzenia z ekranu. Ekran „Brak połączenia" znika sam, gdy wróci zasięg.
- **Cisza w locie.** Od rozpoczęcia lotu do zdania samolotu telefon pilota - i drugiego
  pilota - nie dzwoni i nie wyskakuje z powiadomieniami, także przy zgaszonym ekranie.
  Wiadomości czekają po cichu na liście powiadomień i w skrzynce.
- **Wiesz, dlaczego odwołano Twoją rezerwację.** Gdy administrator odwoła rezerwację
  w panelu, pilot i drugi pilot dostają wiadomość z powodem, a karta rezerwacji pokazuje go
  razem z nazwiskiem osoby, która odwołała. Drugi pilot dowiaduje się też, gdy rezerwację
  odwoła sam dowódca. Panel i aplikacja mówią to przed kliknięciem „Odwołaj".
- **Kokpit po polsku.** Przyciski i napisy kokpitu mówią po polsku: „URUCHOM SILNIK",
  „WYŁĄCZ", „Kołowanie", „Start", „Lądowanie", a fazy lotu - „Wznoszenie", „Lot poziomy",
  „Zniżanie".
- **Prostszy język w aplikacji i panelu.** „Dowódca" i „drugi pilot" zamiast PIC i Dual,
  „rozpoczęcie lotu" zamiast „przejęcia" samolotu, samolot wycofany z floty jest „poza
  służbą", a w panelu nadaje się „uprawnienia". Komunikaty o błędach mówią po ludzku,
  co się stało, a na końcu podają kod - do przekazania przy zgłoszeniu.
- **Podręcznik jako samouczek.** Dokumentacja prowadzi krok po kroku: jak coś zrobić i co
  zobaczysz na ekranie. Doszły strony o zleceniach lotów w aplikacji i w panelu oraz
  o karcie samolotu.

### Poprawki

- **Po zapisie rezerwacji otwiera się jej karta.** Po „Zarezerwuj" i „Zapisz" formularz
  wracał pusty do pierwszego kroku, choć rezerwacja była już zapisana - łatwo było uznać,
  że się nie udało.
- **„Przesuń i popraw" działa od razu.** Poprawiana rezerwacja zderzała się sama ze sobą,
  więc „Dalej" stało zablokowane, zanim cokolwiek się zmieniło, a karta samolotu pokazywała
  jej własny termin jako zajęty.
- **„Wstecz" na Pulpicie nie wraca już do skończonego lotu.** Powrót na Pulpit zostawiał
  pod spodem cały lot: „wstecz" otwierało zdany samolot, a po locie ręcznym wypełniony
  formularz, którego ponowny zapis dublował lot. „Jeszcze nie - wróć do kokpitu" i powrót
  z poprawki danych operacji wracają do tego samego kokpitu, zamiast otwierać drugi,
  a ekran operacji otwarty z karty samolotu wraca na kartę samolotu.
- **Nieudane odwołanie rezerwacji mówi o sobie w okienku odwołania** - do tej pory powód
  chował się pod okienkiem, a podpowiedź w polu powodu mówiła o GPS. Karta rezerwacji nie
  pokazuje też ciągu znaków zamiast nazwiska - gdy telefon nie zna osoby, stoi kreska.
- **Panel nie mówi „nic tu nie ma", zanim przyjdą dane.** Przy pierwszym wejściu w listę -
  pilotów, samolotów, dziennika czy spraw do sprawdzenia - potrafił na ułamek sekundy
  mignąć komunikat o pustej liście, a dopiero po nim właściwe wiersze. Teraz w tym czasie
  nie ma nic, a gdy odpowiedź się spóźnia, w miejscu listy widać, że trwa ładowanie.
  Tabela dziennika nie znika już na moment zaraz po wejściu, a karty w kolejce decyzji
  nie pojawiają się bez nazwisk.
- **„Obserwowane samoloty" podpisują maszyny nazwiskiem także u Akceptującego.** Członek
  bez „Podglądu klubu" widział przy maszynie samo „Zarezerwowana", bez osoby, która ją
  ma - teraz zdanie jest pełne, jak u administratora.
- **Moje konto nie każe „ustawić" hasła komuś, kto je ma.** Zaraz po wejściu karta hasła
  pokazywała przez chwilę wariant dla konta bez hasła. Teraz czeka na odczyt konta, a gdy
  ten się nie uda, mówi o tym na górze strony zamiast pokazywać zgadnięty formularz.
- **Dziennik samolotu mówi, że nie udało się wczytać floty**, zamiast bez końca
  pokazywać ładowanie.
- **Gdy coś się nie wczyta, panel mówi to wprost.** Komunikat brzmi „Nie udało się
  wczytać", a nie „Nie udało się zapisać", jak dotąd przy każdej liście, której nie
  udało się wczytać. Pod nim nie stoi już fałszywe „nie ma jeszcze żadnego pilota" ani
  niekończące się ładowanie. Lista wczytana wcześniej zostaje na ekranie.

### Dla testerów

- **Wersja 4.0.0 to nowy plik do zainstalowania** ze [strony pobierania](../pobierz/) -
  na istniejącą aplikację, bez odinstalowywania. Dane na telefonie zostają.

## 3.2.0 · 27 września 2026

> Rozbudowa panelu klubu: dziennik z osią pilotów i poprawkami operacji, „Do sprawdzenia", statystyki i rezerwacja z kalendarza w przeglądarce - bez nowej instalacji aplikacji.

### Nowości

- **Dziennik odpowiada też na pytanie „kto latał".** Nad tabelą stoi przełącznik osi:
  Samoloty (jak dotąd) albo Piloci - wiersz na członka klubu z dniami, operacjami, lotami,
  czasem blokowym i czasem w powietrzu z tego samego zakresu dat. Nalot liczy się dowódcy,
  a czas w prawym fotelu ma własną kolumnę „Drugi pilot" z własną sumą - tej samej
  godziny lotu szkolnego nie dodaje się do siebie z wiersza instruktora i ucznia.
  Członkowie bez lotów w zakresie są zwinięci w jeden wiersz pod listą i rozwijają się
  kliknięciem. Wiersz mówi też, kto trzyma maszynę albo właśnie leci.
- **Sumy dziennika liczą wyłącznie operacje zdane** - na obu osiach, w nagłówkach dób
  i w statystykach tak samo. Operacja w toku nie dokłada się do nalotu, dopóki samolot
  nie zostanie zdany; zamiast tego wiersz nazywa ją wprost („leci teraz", „1 w toku"),
  więc ten sam zakres dat daje jedną liczbę nalotu na każdym ekranie panelu.
- **Operacje maszyny i pilota pogrupowane dniami.** Doba jest nagłówkiem z sumami
  (operacje, loty, blok, lot - liczone za całą dobę, także gdy lista jest przycięta), operacje w toku są nazwane osobno, a czas trwania biegu silnika ma własną
  kolumnę. Strona pilota pokazuje jego loty w prawym fotelu jako zwykłe wiersze
  z oznaczeniem i piątą sumą doby.
- **Z operacji wychodzi się w dwie strony:** ścieżka nad tytułem prowadzi na oś maszyny, a nazwisko
  pilota i drugiego pilota - na oś tej osoby. Strona pilota ma własny adres z jego kodem,
  do wklejenia w rozmowie jak rejestracja.
- **Kolumna panelu ma sześć pozycji w stałej kolejności**: Dziennik, Do sprawdzenia,
  Kalendarz, Statystyki, Piloci, Samoloty - najpierw to, co się wydarzyło i co wymaga
  reakcji, potem to, co zaplanowane i ile tego było, na końcu konfiguracja klubu.
- **Podręcznik opisuje panel taki, jaki jest**: nowe strony „Do sprawdzenia"
  i „Statystyki", dziennik z dwiema osiami i trybem edycji, zużycie z lotów na karcie
  samolotu, zakresy uprawnień z nowymi ekranami.
- **Operację poprawia się w panelu.** Przycisk „Popraw zdarzenia" przełącza stronę
  operacji w tryb edycji pod własnym adresem: każdy wiersz osi ma ołówek i otwiera
  okno z poprawką czasu, odczytów albo składu zrzutu, z podglądem „przed → po",
  powodem (zobaczy go pilot w historii zmian) i historią
  dotychczasowych poprawek z nazwiskiem. Zdarzenie, którego nie było, unieważnia się
  koszem w linii tytułu. Nad osią stoją te same ostrzeżenia o niespójnościach, które
  pilot widzi na telefonie - lot bez lądowania, zdarzenie poza pracą silnika - z tym,
  czym się je naprawia.
- **Brakujący fakt da się dopisać z panelu.** Ostatni wiersz osi „Dodaj wpis" przyjmuje
  lądowanie, start, kołowanie, tankowanie, zrzut, załadunek albo dolewkę oleju z godziną
  i powodem; fakt ocenia się tak, jak wyglądała operacja w tej chwili (lądowanie musi
  mieć start, tankowanie stojący silnik), a podgląd mówi, który lot domyka i ile
  niespójności znika. Pilot zobaczy wpis na telefonie, a karta dnia dostaje nową wersję.
- **„Do sprawdzenia" - jedno miejsce na to, co wymaga reakcji.** Nowa pozycja w kolumnie
  panelu, druga po Dzienniku, z liczbą spraw wyłącznie wtedy, gdy coś czeka. Trzy karty:
  rozjazdy między zapisami (dwie operacje naraz, pilot w dwóch maszynach, luka albo
  cofnięcie licznika, rozjazd paliwa, rozjazd zegara), dni bez karty dnia
  i operacje, których nikt nie zdał od ponad doby. Każdy wiersz prowadzi tam, gdzie
  sprawę da się zamknąć; gdy nic nie czeka, ekran mówi to wprost.
- **Lista rozjazdów.** Do tej pory nieścisłości między zapisami nie były nigdzie widoczne.
  Teraz każda ma nazwę po polsku, liczby, których dotyczy, operacje z sygnaturami, zdanie
  o tym, czym się to naprawia, i notatkę rozstrzygnięcia, która zostaje przy sprawie.
  Sprawa „Dwie operacje naraz" mówi przed kliknięciem, że jej zamknięcie wyśle kartę dnia
  do arkusza. Otwarty rozjazd widać też przy operacji w dzienniku - oznaczeniem na liście
  i komunikatem na stronie operacji.
- **Karty dnia i eksport.** Stan karty każdej doby samolotu (w arkuszu, bez karty,
  wstrzymana rozjazdem, czeka na zdanie, unieważniona), kolejne wersje, treść karty tak, jak
  leży w arkuszu, adres karty do podania skarbnikowi (działa bez logowania) i ponowienie
  eksportu z odpowiedzią, co poszło albo dlaczego nie.

- **Statystyki klubu.** Nowa pozycja w kolumnie: nalot w wybranym zakresie dat jako
  pasek sum (operacje, dni lotne, loty, blok, lot, paliwo, przyrost licznika, piloci),
  słupki dzień po dniu i trzy tabele jednego zbioru operacji - samoloty, piloci, zadania -
  każda z wierszem „Razem". Szybkie zakresy: 30 dni, ten i poprzedni miesiąc, ten
  i poprzedni sezon. Podtytuł mówi, że liczą się operacje zdane, i ile trwa poza sumami.
- **Czas jako drugi pilot także w statystykach.** Tabela pilotów ma kolumnę „Drugi pilot"
  z własną sumą - uczeń bez ani jednej operacji jako dowódca ma swój wiersz z liczbą
  w tej kolumnie, a nalot dowódców sumuje się do nalotu floty co do minuty tak samo,
  jak w dzienniku.
- **Zużycie z lotów na karcie samolotu.** Gdy maszyna ma dość zapisanych operacji, jej
  karta w panelu pokazuje pasmo typowego zużycia zmierzone z lotów, stawki w locie
  i na ziemi, przeliczniki licznika motogodzin i trend z ostatniego miesiąca. Norma
  z dokumentacji stoi obok jako marker z odchyłką - to dwie różne liczby i karta nazywa,
  którą pokazuje. Młoda maszyna bez policzonej normy nie dostaje ani zer, ani zdania
  o braku danych - karty po prostu nie ma.
- **Rezerwujesz także z kalendarza w panelu - tak samo jak w aplikacji.** Każdy członek
  klubu ma w kalendarzu przycisk „Zarezerwuj", a wolne miejsce przy maszynie w danym dniu
  też otwiera rezerwację - z tą maszyną i tym dniem. Najpierw termin i samolot: pasek
  zajętości maszyny w wybranym dniu, wolne godziny słowami i sugerowane terminy z powodem
  („tuż przed rezerwacją · A. Kowalski"); potem zadanie, trasa, drugi pilot i plan lotu.
  Godziny wpisuje się w czasie klubu. Gdy ktoś zajął termin w międzyczasie, formularz
  wraca do godzin i podpowiada najbliższe wolne miejsce tej samej długości.
- **Twoje rezerwacje są na osi zielone**, a ich karta ma „Przesuń i popraw" i „Odwołaj" -
  bez pola powodu, bo to Twój plan. Klub ze ścieżką akceptacji mówi przed zapisem, na czyją
  zgodę rezerwacja zaczeka, a przy poprawce terminu - że dotychczasowe zgody przepadną.
- **Odwołanie rezerwacji czekającej na zgodę zawiadamia tych, których pytano.** Osoby
  z kroku, który miał zdecydować, dostają w skrzynce wiadomość, że prośba została
  wycofana - nie muszą już się nią zajmować.

### Poprawki

- **Brakujący fakt dopiszesz w telefonie także po zdaniu samolotu.** „Dodaj wpis" w trybie
  edycji operacji przyjmuje zgubione lądowanie, start, tankowanie czy dolewkę oleju przez
  całą dobę od zdania - do tej pory działał wyłącznie z kokpitu, zanim samolot został zdany.
  Godzinę faktu ocenia się tak, jak wyglądała wtedy operacja, a gdy nie da się jej przyjąć,
  przycisk mówi dlaczego, zanim go naciśniesz. Poprawka dotrze do telefonów aktualizacją
  w tle, bez nowej instalacji.
- **Odmowa dopisania mówi o tamtej chwili**, w telefonie i w panelu: „O tej godzinie
  pracował silnik - tankowanie wpisz przed uruchomieniem albo po wyłączeniu" zamiast rady
  z kokpitu, żeby wyłączyć silnik, który dawno stoi.
- **Statystyki i dziennik liczą ten sam nalot.** Statystyki pomijają odtąd puste zapisy
  (zdanie samolotu bez biegu, lotów i zmian odczytów), tak jak dziennik - ten sam zakres
  dat nie daje już dwóch sum na dwóch ekranach.
- **Polityka prywatności i regulamin nadążają za panelem.** Mówią, kto w klubie widzi
  dziennik, że nalot jest w panelu zestawiany także po osobach, że rezerwację składa się
  również w panelu, a brakujący fakt da się dopisać. Regulamin opisuje przy okazji
  logowanie hasłem, dołączanie kodem klubu i rezerwacje.

### Dla testerów

- **Nowego pliku instalować nie trzeba.** Panel zmienia się sam, a dwie poprawki
  w telefonie - dopisanie faktu po zdaniu samolotu i wiadomość „Prośba wycofana" w skrzynce -
  dotrą same aktualizacją w tle do aplikacji w wersji 3.1.0. Wchodzą przy **następnym
  uruchomieniu** aplikacji po pobraniu, nie od razu.
- Kto ma jeszcze wersję 3.0.0, aktualizacji w tle nie dostanie - potrzebuje pliku 3.1.0
  ze [strony pobierania](../pobierz/).

## 3.1.0 (build 6) · 26 września 2026

> Rezerwacja ze zgodą klubu, skrzynka i powiadomienia na telefon, karta i obserwowanie samolotu, panel dla każdego członka klubu.

### Nowości

- **Panel klubu otwiera się każdemu członkowi.** Logujesz się tym samym kontem, co do
  aplikacji, a o tym, co widzisz, decyduje Twój zakres uprawnień: każdy ma Moje konto
  i kalendarz floty (cudze rezerwacje widać w nim tak, jak w aplikacji - godziny, maszyna
  i pilot), a dziennik operacji, listę pilotów i karty samolotów otwiera zdolność
  „Podgląd klubu" (dawne „Wejście do panelu"). Adres bez dostępu nie odsyła po cichu -
  panel mówi, której zdolności brakuje i kto ją nadaje. Kto co widzi, opisuje nowa strona
  dokumentacji „Zakresy uprawnień: kto co widzi".
- **Klub może wymagać zgody na rezerwację.** Administrator układa ścieżkę: nadaje krokom
  nazwy („Mechanik", „Szef wyszkolenia"), ustala ich kolejność i dopisuje do każdego osoby,
  które mogą go zatwierdzić. Klub, który tego nie ustawi, pracuje dokładnie jak dotąd -
  rezerwacja potwierdza się od razu.
- **Kroki idą po kolei, a w kroku wystarczy zgoda jednej osoby z listy.** Przy odmowie
  na pierwszym kroku nikt dalszy nie jest fatygowany, a termin wraca do puli natychmiast.
- **Odmowa wymaga powodu**, który pilot przeczyta w aplikacji - bez niego „odrzucone"
  zostawia go z pytaniem, na które musiałby zadzwonić.
- **Zanim zdecydujesz, zobacz komu i czym.** Z karty sprawy - w panelu i w aplikacji -
  otwiera się podgląd pilota (ile latał na tej maszynie i kiedy ostatnio, nalot z 30
  i 90 dni, ostatnie loty, najbliższe rezerwacje z ostrzeżeniem, gdy nachodzą na
  rozpatrywany termin) oraz podgląd samolotu (liczniki z ostatniego odczytu, ostatnie
  30 dni, ostatnie loty, najbliższe terminy razem z przeglądami). Mechanik decydujący
  z telefonu widzi dokładnie to samo, co administrator przy biurku.
- **Zmiana ścieżki akceptacji porządkuje sprawy w toku.** Gdy klub zdejmie krok, rezerwacje,
  które mają już komplet pozostałych zgód, zostają potwierdzone od razu, a pilot dostaje
  wiadomość. Gdy krok dojdzie albo zmieni kolejność, osoby nowego kroku dostają prośbę
  o zgodę. Panel mówi po zapisie, ile rezerwacji to dotknęło.
- **Rezerwujący nie prosi sam siebie o zgodę**: kroki, na których stoi, przechodzą same,
  a w historii widać, że przeszły właśnie w ten sposób.
- **Rezerwacja czekająca na zgodę trzyma termin** - nikt inny nie zajmie go w międzyczasie.
- **Karta samolotu w aplikacji** - dla technika, koordynatora lotów i osób akceptujących
  rezerwacje: co dzieje się z maszyną teraz (kto ją ma, od kiedy, zgodnie z rezerwacją
  czy poza planem - albo że stoi, jest wyłączona z użytku lub zarezerwowana), liczniki
  z ostatniego odczytu, najbliższe terminy, wykresy motogodzin i paliwa z ostatnich
  90 dni z kursorem i przybliżeniem oraz historia wszystkich operacji tej maszyny.
  Otwiera się ze znaku maszyny w kalendarzu, z powiadomienia i z podglądu przy decyzji.
- **Obserwowanie samolotu.** Jeden przełącznik na karcie maszyny, w ustawieniach
  aplikacji albo w panelu na stronie Moje konto (cała flota z przełącznikami i stanem
  „teraz") - i telefon budzi, gdy lot zbliża się
  za godzinę, gdy silnik ruszył (z adnotacją, czy zgodnie z planem), gdy maszyna wróciła
  z odczytami, gdy przypomniany termin odwołano i gdy nikt nie odebrał zarezerwowanej
  maszyny. Wiadomość mówi czasem z rejestru, a gdy zapis dotarł później, dopisuje kiedy.
  Powiadomienie z klubu, który nie jest teraz aktywny, prowadzi do skrzynki z instrukcją,
  zamiast otwierać pustą kartę.
- **Skrzynka powiadomień**: prośba o zgodę, decyzja i wygaśnięcie terminu trafiają do
  pilota z historią, a powiadomienie na telefon jest tylko sygnałem, że coś przyszło.
- **Termin, którego nikt nie rozpatrzył, wygasa z chwilą swojego początku** i wraca do
  puli - maszyna nie stoi w sobotę zablokowana prośbą, o której wszyscy zapomnieli.
- **Panel: ścieżka akceptacji i kolejka decyzji.** Administrator układa kroki w minutę -
  nazwa, osoby, kolejność przestawiana chwytem - a ekran mówi od razu, gdy ktoś z kroku
  stracił prawo akceptacji. Kto akceptuje, widzi w kalendarzu baner z liczbą spraw
  czekających na jego zgodę i rozstrzyga je z jednego miejsca, z całym planem lotu przed
  oczami. Rezerwacja czekająca na zgodę stoi na osi floty z przerywaną ramką, a jej karta
  pokazuje historię decyzji: kto, kiedy i dlaczego. Klub, który akceptacji nie chce, nie
  widzi w panelu ani jednego dodatkowego kroku.
- **Skrzynka w telefonie i dzwonek na Pulpicie.** Prośby o zgodę, decyzje w Twojej sprawie
  i wygaśnięcia terminów czekają pod dzwonkiem obok ustawień; licznik przy nim zapala się
  tylko z nieprzeczytanymi. „Do decyzji" stoi przy sprawie, dopóki jej nie rozstrzygniesz -
  samo zerknięcie na listę niczego nie ucisza. Skrzynka wymaga zasięgu, jak cały kalendarz.
- **Decyzja z telefonu.** Kto akceptuje, widzi cały plan lotu - samolot, termin czasem
  klubu, pilota i drugiego pilota, zadanie, trasę, plan i notatkę - i zatwierdza jednym
  tapnięciem albo odmawia z powodem, który pilot przeczyta u siebie. Bez wchodzenia do panelu.
- **Karta rezerwacji mówi, na czym stoi sprawa.** Czeka na zgodę (z krokami ścieżki
  i od kiedy), doszedł krok, odrzucona z powodem, wygasła bez decyzji - każdy stan ma
  własny baner, a zamknięta rezerwacja prowadzi wprost do wyboru innego terminu.
  Rezerwacja czekająca traci zieleń także na Pulpicie: zielona obiecywałaby pewny lot.
- **Przesunięcie terminu zaczyna ścieżkę od nowa.** Zgoda dotyczyła konkretnego terminu,
  więc po poprawce osoby z pierwszego kroku dostają świeżą prośbę, a karta mówi o tym,
  zanim tapniesz „PRZESUŃ I POPRAW".
- **Powiadomienia na telefon.** Prośba o zgodę, decyzja w Twojej sprawie i wygaśnięcie
  terminu budzą telefon powiadomieniem, a tapnięcie w nie otwiera od razu właściwy ekran -
  także wtedy, gdy aplikacja była zamknięta. Powiadomienie jest tylko sygnałem: treść
  zawsze czeka w skrzynce, więc bez zgody na powiadomienia nic nie ginie. Aplikacja pyta
  o zgodę dopiero wtedy, gdy zaczyna Cię to dotyczyć - gdy akceptujesz cudze rezerwacje
  albo gdy Twoja rezerwacja czeka na zgodę.
- **Polityka prywatności opisuje rezerwacje i powiadomienia na telefon**: co zapisuje
  kalendarz i kto co z niego widzi, czym jest token powiadomień i dlaczego ginie razem
  z sesją logowania, kto pośredniczy w doręczeniu i co dostaje, jak powiadomienia wyłączyć -
  skrzynka w aplikacji działa wtedy bez zmian.
- **Uprawnienia nadaje się osobie, a nie roli.** Przy przyjęciu do klubu administrator wybiera
  gotowy zestaw - pilot, akceptujący, koordynator lotów, technik, administrator - albo zaznacza
  pojedyncze pozycje, na przykład samą zgodę na rezerwacje dla mechanika. Ta sama osoba może
  mieć w dwóch klubach dwa różne zakresy.
- **Konto zakłada się także z panelu.** „Załóż konto" pod kartą logowania pyta
  o imię i nazwisko oraz adres i wysyła ten sam link, co przy zapomnianym haśle - konto
  powstaje w chwili ustawienia hasła. Do klubu nadal wchodzi się kodem klubu w aplikacji,
  a dostęp do panelu nadaje administrator klubu; ekran mówi to wprost, gdy konto jeszcze
  klubu nie ma.

### Poprawki

- **„Nie pamiętam hasła" w panelu naprawdę wysyła list.** Od wydania 2.1.0 formularz
  w panelu potwierdzał wysyłkę, ale list nigdy nie wychodził - działała wyłącznie ta sama
  prośba złożona z telefonu albo link wysłany przez administratora z karty członka.

### Dla testerów

- **To wydanie wymaga zainstalowania nowego pliku ze [strony pobierania](../pobierz/).**
  Aktualizacja w tle nie wystarczy: powiadomienia na telefon potrzebują nowej wersji
  aplikacji. Dane z telefonu zostają na miejscu.
- Aplikacja zapyta o zgodę na powiadomienia dopiero przy pierwszej sprawie, która Cię
  dotyczy. Odmowa niczego nie wyłącza - skrzynka pod dzwonkiem działa tak samo.
- Ścieżkę akceptacji ustawia się w panelu; decyzję podejmuje się z telefonu albo z panelu,
  także bez dostępu do panelu - mechanik jest w klubie zwykłym pilotem.
- Administrator z uprawnieniem do cudzych rezerwacji może rozstrzygnąć każdy krok z karty
  rezerwacji w kalendarzu - to wyjście awaryjne, gdy krok stracił obsadę.
- Prawo akceptacji nadaje się osobie w zakresie uprawnień, niezależnie od reszty
  uprawnień panelu.
- Powiadomienia na telefon wymagają NOWEJ instalacji z pliku (wersja 3.1.0) - dochodzi
  moduł systemowy, którego aktualizacja w tle nie dowiezie. Do czasu skonfigurowania
  Firebase po stronie serwera powiadomienia po prostu nie przychodzą; skrzynka działa.

## 3.0.0 (build 5) · 22 września 2026

> Rezerwacja samolotu i kalendarz całej floty w telefonie: kto ma którą maszynę i kiedy, a lot zaczyna się z gotowej rezerwacji.

### Nowości

- **Nowy ekran startowy aplikacji i dolne zakładki: Pulpit · Kalendarz · Historia.**
  Pulpit odpowiada na dwa pytania - jak poszło dziś (sumy doby) i co masz przed sobą
  (najbliższa rezerwacja z odliczaniem). Historia zebrała wszystkie loty w jednym
  miejscu: dzień jest nagłówkiem, operacje zwartymi wierszami, a starsze czekają
  zwinięte, więc na ekran wchodzi ich około trzy razy więcej niż dotąd. W kokpicie
  zakładek nie ma - dopóki trzymasz samolot, nic nie wyprowadza Cię z niego bokiem.
- **Kalendarz floty w telefonie** - nowa zakładka pokazuje jedną dobę i wszystkie maszyny
  naraz, więc na pytanie „czym dziś polecę" odpowiada jedno spojrzenie. Godziny idą czasem
  klubu, a siatka obejmuje dzień lotny - od wschodu do zachodu słońca nad lotniskiem klubu,
  więc w czerwcu jest szersza niż w listopadzie. Maszyny wyłączone z użytku zostają
  widoczne razem z powodem. Przy kilkunastu samolotach da się zawęzić listę do tych, na
  których się lata - wybór zostaje na telefonie. Kalendarz wymaga połączenia i mówi to
  wprost, zamiast pokazywać pustą siatkę; z powrotem zasięgu wraca sam.
- **Rezerwacja samolotu z telefonu, w dwóch krokach.** Najpierw dzień, maszyna i godziny -
  przy każdym samolocie widać pasek zajętości i wypisane wolne pasma („wolne: 06:00-13:00"),
  a nad godzinami stoją gotowe propozycje terminu z powodem („tuż po rezerwacji · J. Nowak",
  „początek dnia"). Potem zadanie: rodzaj operacji, trasa, drugi pilot, planowany czas lotu,
  paliwo do zabrania i notatka - te same pytania, co przy rozpoczęciu lotu. Samolot
  wymagający załogi dwuosobowej nie przepuści rezerwacji bez drugiego pilota, a powód
  stoi w przycisku.
- **Zajęty termin mówi, kto go ma.** Jeśli ktoś zapisał się szybciej, gdy wypełniałeś
  formularz, ekran wraca do godzin i pisze, czyja to rezerwacja i od kiedy stoi - razem
  z gotowym skrótem do najbliższego wolnego pasma tej samej długości. Bez zasięgu
  rezerwacji się nie zapisze i aplikacja mówi to wprost: termin przydziela klub, a nie
  telefon.
- **Karta rezerwacji**: dzień, godziny czasu klubu z odliczaniem do startu, maszyna,
  zadanie, trasa, drugi pilot i plan lotu. Stamtąd termin się przesuwa („Przesuń
  i popraw" wraca do formularza z wypełnionymi polami) i odwołuje - z pytaniem, które
  nazywa konkretną rezerwację, i z miejscem na powód. Zmiana samolotu zakłada termin
  od nowa i zwalnia poprzedni dopiero wtedy, gdy nowy już stoi, żeby nie zostać
  z niczym.
- **Pulpit pokazuje najbliższą rezerwację** - godziny, maszynę, zadanie i odliczanie -
  a „ROZPOCZNIJ LOT" wypełnia nią pierwszy krok: samolot, zadanie, trasę i drugiego
  pilota. Dotyczy to terminu, który właśnie się zaczyna albo trwa; plan na przyszły
  tydzień zostaje planem. **Rezerwacja nigdy nie warunkuje lotu** - bez niej i bez
  zasięgu wszystko działa jak dotąd.
- **Ostrzeżenie o cudzym planie przy braniu maszyny**: jeśli ktoś ma ją zarezerwowaną
  na najbliższe godziny, pierwszy krok mówi kto i kiedy - ale nie zatrzymuje lotu.
- **Kalendarz floty w panelu klubu** - kto ma zaplanowany lot, na której maszynie i w które
  dni, w widoku na tydzień, dwa tygodnie albo miesiąc. Administrator zarezerwuje termin za
  pilota i wyłączy maszynę z użytku na czas przeglądu albo usterki - wtedy znika ona pilotom
  z kalendarza. Zajętości, które kolidują z wpisywanym terminem, widać jeszcze przed zapisem.
- **Karta klubu pyta o lotnisko macierzyste i strefę czasu.** Z lotniska liczy się doba
  lotna kalendarza, ze strefy - godziny. Dopóki lotniska nie ma, kalendarz stoi na
  06:00-21:00 i nic przez to nie przestaje działać; rezerwacja nie zależy od tego
  ustawienia.

### Dla testerów

- **To wydanie wymaga zainstalowania nowego pliku ze [strony pobierania](../pobierz/).**
  Aktualizacja w tle nie wystarczy, bo zmienia się numer wersji aplikacji - a to on wiąże
  telefon z wydaniem. Dane z telefonu zostają na miejscu.
- **Rezerwacja i kalendarz jako jedyne wymagają zasięgu.** Termin przydziela klub, więc
  rozstrzyga go serwer - dwa telefony nie zapiszą się na tę samą maszynę i tę samą
  godzinę. Reszta pracy w kabinie jest bez zmian: przejęcie, kokpit, zdanie samolotu
  i wpis po fakcie nadal nie pytają o sieć.
- **Kalendarz pokazuje godziny czasu klubu, nie UTC.** Log operacji zostaje w UTC -
  zmieniła się wyłącznie siatka kalendarza, bo rezerwacja jest umową między ludźmi
  o godzinie, a nie pomiarem.
- **Zanim zaczniecie, wpiszcie lotnisko macierzyste na karcie klubu** - bez niego doba
  lotna nie ma skąd wziąć wschodu i zachodu słońca.
- Na co zwrócić uwagę: czy podpowiedzi terminów trafiają w to, jak naprawdę układacie
  dzień; czy doba lotna nie jest za wąska dla lotów o zmierzchu; czy „ROZPOCZNIJ LOT"
  z rezerwacji wypełnia to, czego się spodziewacie.

## 2.1.0 (build 4) · 18 września 2026

> Logowanie e-mailem i hasłem obok konta Google - dla wspólnego tabletu w samolocie. Do tego własny adres Ninerdeck i lista urządzeń, z których każde da się wylogować zdalnie.

### Nowości

- **Własny adres Ninerdeck**: strona pod `ninerdeck.pl`, panel i aplikacja pod `app.ninerdeck.pl`. Adres nadany przez hosting przestaje obowiązywać.
- **Do panelu można wejść e-mailem i hasłem**, obok przycisku Google. To nie są dwa konta, tylko dwa sposoby, w jakie ta sama osoba potwierdza, że to ona - jedno i drugie kończy się tą samą sesją w tym samym klubie.
- **Zapomniane hasło odzyskuje się samodzielnie.** „Nie pamiętam hasła" pyta o adres i wysyła link ważny godzinę; hasło ustawia się na stronie z linku, na dowolnym urządzeniu - także na telefonie, na którym czyta się pocztę. Panel odpowiada zawsze tym samym zdaniem, także dla adresu, którego nie zna.
- **Nowe konto administratora klubu nie musi być kontem Google.** Przy zakładaniu klubu podaje się dowolny adres, a razem z klubem wychodzi na niego zaproszenie z linkiem do ustawienia hasła (ważne 72 godziny). Karta klubu mówi, kiedy list poszedł i jak długo jest ważny, i pozwala wysłać go ponownie, dopóki administrator nie wejdzie.
- **„Moje konto" w panelu** - pod nazwiskiem w pasku górnym. Można tam ustawić albo zmienić hasło i zobaczyć, na jakich urządzeniach jest się zalogowanym; każde da się wylogować osobno. Zmiana hasła wylogowuje pozostałe urządzenia, a okno, w którym się ją robi, zostaje.
- **Karta pilota pokazuje jego urządzenia i pozwala je wylogować** - pojedynczo albo wszystkie w tym klubie naraz. Widać przy niej, czym ten pilot się loguje i kiedy był ostatnio aktywny. **Zdalne wylogowanie nie kasuje danych z telefonu**: urządzenie przestaje wysyłać, a niewysłane zapisy czekają na nim do ponownego zalogowania.
- **Hasło pilota ustawia wyłącznie on sam.** Administrator klubu wysyła mu ten sam list, który pilot wysłałby sobie przez „Nie pamiętam hasła" - panel nie pokazuje ani linku, ani kodu nikomu, także administratorowi.
- **Do aplikacji można wejść hasłem - dla wspólnego tabletu w samolocie.** Loguje się kodem pilota albo adresem e-mail, a tablet pamięta kluby, z których go używano, więc następny pilot wpisuje same swoje trzy litery. Po wylogowaniu aplikacja od razu staje na formularzu hasła, bez dodatkowego tapnięcia. Na własnym telefonie Google zostaje pierwszą drogą, a hasło - drugim przyciskiem pod nim.
- **Hasło do aplikacji ustawia się w ustawieniach**, w nowej sekcji między PIN-em a kontem. Hasło nie zastępuje PIN-u: PIN otwiera ten telefon offline każdego dnia, hasło loguje tę samą osobę na cudzym urządzeniu.
- **Zapomniane hasło i zakładanie konta działają też z aplikacji.** Jedno i drugie kończy się linkiem wysłanym na adres - hasło ustawia się na stronie, na dowolnym urządzeniu. Konto założone tą drogą nie omija klubu: po zalogowaniu pilot trafia na pole kodu klubu, jak każdy inny.
- **Tablet z kilkoma klubami pozwala wybrać, w którym szukać kodu pilota** - osobnym ekranem z listą klubów, których na nim używano. Przy jednym klubie nie ma ani wyboru, ani wzmianki o nim.
- **Zdalne wylogowanie nie zabiera pilotowi dnia.** Telefon przestaje wysyłać i mówi o tym wprost - na ekranie PIN-u i w ustawieniach - ale PIN dalej otwiera aplikację, a zapisy czekają na niej do ponownego zalogowania tej samej osoby.
- **Wylogowanie z aplikacji kończy sesję także po stronie serwera**, zamiast zostawiać ją żywą przez kolejne tygodnie.

### Dla testerów

- **To wydanie wymaga zainstalowania nowego pliku ze strony pobierania.** Aktualizacja w tle nie wystarczy, bo zmienia się numer wersji aplikacji - a to on wiąże telefon z wydaniem. Dane z telefonu zostają na miejscu.
- Hasło ma minimum 12 znaków i żadnych wymogów co do rodzaju znaków - długość jest jedyną miarą. Wklejanie z menedżera haseł jest dozwolone, a przełącznik przy polu pokazuje wpisywane hasło.
- Lista urządzeń w panelu nazywa telefon modelem, systemem i wersją aplikacji („Android 14 · Pixel 7a · Ninerdeck 2.1.0"), a przeglądarkę - dwoma słowami z jej podpisu.
- Polityka prywatności opisuje teraz wszystkie dane, które opuszczają telefon - razem z zapisem surowych odczytów czujników, który służy do strojenia wykrywania startu i lądowania.

## 2.0.0 (build 3) · 16 września 2026

### Nowości

- **Aplikacja nazywa się Ninerdeck.** Nowa nazwa i nowy znak - monogram `9` - wchodzą wszędzie naraz: na ekran logowania, do panelu klubu, na stronę i na ikonę w telefonie. „UZ Aero" było nazwą roboczą; poza zmianą napisów i ikony nie zmienia się nic, czego pilot dotyka w locie.
- **Panel klubu w lżejszym stylu.** Nawigacja w kolumnie po lewej z nazwą klubu nad pozycjami, ścieżka nad nagłówkiem w dzienniku (flota → maszyna → operacja), tytuły i etykiety pisane jak na stronie, a nie jak na przyrządzie. Kolory bez zmian.
- **Jeden serwer obsługuje wiele klubów, a dane klubów są rozdzielone.** Każdy klub widzi wyłącznie swoje maszyny, pilotów, operacje i dokumenty - także wtedy, gdy ten sam pilot lata w dwóch klubach albo dwa kluby mają maszyny o tym samym znaku. Pilot podpisuje operacje kodem nadanym w danym klubie, a numeracja operacji w dobie biegnie w każdym klubie osobno.
- **Link do karty arkusza dostaje adres klubu i własny sekret.** Kartę otwiera się bez konta w aplikacji - wystarczy link, który serwer zapisał przy eksporcie - a zgadnięcie samej nazwy karty niczego już nie otwiera.
- **Do klubu dołącza się kodem klubu.** Klub ma jeden kod (w rodzaju `AZG-7K4M`), który administrator podaje pilotom dowolnym kanałem - z tablicy w hangarze, z grupy klubowej, z ręki. Pilot loguje się kontem Google, wpisuje kod i czeka na decyzję: administrator przyjmuje go z kodem pilota i rolą albo odmawia z powodem, który pilot czyta na swoim telefonie. Kod nie jest tajny i nikogo sam nie wpuszcza - wpuszcza człowiek. Nowy kod unieważnia stary od razu, a dołączanie kodem da się wyłączyć; złożone zgłoszenia zostają w kolejce.
- **Klub zakłada opiekun platformy** razem z jego pierwszym administratorem i kodem klubu, żeby klub miał od pierwszego dnia kogo pytać i co podawać pilotom. Klub da się wyłączyć - jego ludzie tracą dostęp od razu, a dziennik, flota i konta zostają.
- **Dopisywania pilota z panelu klubu już nie ma** - to była druga droga do klubu, obok kodu, i znikła razem z nią. Pilot, który odchodzi, ma wyłączane członkostwo: dostęp gaśnie natychmiast, a jego loty zostają w dzienniku i w dokumentach klubu.
- **Administrator dwóch klubów wybiera klub po zalogowaniu** i przechodzi między nimi bez logowania się od nowa. Nazwa klubu stoi na szczycie kolumny z lewej, więc przy każdym wklejonym linku widać, czyj to dziennik. Przy jednym klubie nic się nie zmienia - wyboru nie ma, bo nie ma z czego wybierać.
- **Pilot dwóch klubów przełącza klub w ustawieniach aplikacji.** Wybrany klub decyduje, jaką flotę i jakich drugich pilotów widać przy rozpoczęciu lotu; „Mój dzień" i „Poprzednie dni" pokazują za to operacje ze WSZYSTKICH klubów, a każdy kafelek mówi, w którym klubie odbyła się operacja. Przy jednym klubie sekcji nie ma - nie ma czego przełączać.
- **Zmiana klubu wymaga internetu i wysłanej kolejki**, i mówi o tym przy karcie klubu: zapisy powstałe w klubie wychodzą wyłącznie jego kluczem, więc najpierw jadą na serwer. Bez zasięgu pilot pracuje dalej w klubie, w którym jest - tak samo jak dotąd.
- **Do drugiego klubu dołącza się z ustawień, tym samym kodem klubu.** Zgłoszenie staje na liście klubów jako „czeka na zatwierdzenie", a pilot lata dalej tam, gdzie latał.
- **Pilot bez klubu wpisuje kod klubu na ekranie logowania.** Nieznany kod dostaje odpowiedź przy polu bez kasowania wpisu, odmowa administratora - powód i drugie wyjście („dołącz innym kodem"), a zbyt wiele prób pod rząd mówi, ile trzeba odczekać.

### Poprawki

- **Sygnatura operacji wróciła na kafelek „Mojego dnia".** Nazwa, którą operacja ma poza telefonem - ta sama, którą widzi administrator w panelu - stała dotąd wyłącznie na kartach „Poprzednich dni" i na ekranie rozliczenia, choć makieta rysuje ją na każdym kafelku. Teraz pilot czyta ją tam, gdzie patrzy najczęściej.

### Dla testerów

- **To wydanie jest NOWĄ INSTALACJĄ, nie aktualizacją.** Ninerdeck startuje na własnym serwerze i jako osobna aplikacja: instaluje się ją od nowa, loguje kontem Google i wpisuje kod klubu. Dotychczasowa aplikacja - stara nazwa i stara ikona - działa dalej ze swoim serwerem, dopóki wszyscy nie przejdą, ale **historia lotów z testów nie przenosi się**: klub wpisuje flotę od nowa, a piloci rejestrują się ponownie.
- **Zgłoszenia błędów z aplikacji trafiają do jednej kolejki dla całego serwera**, z nazwą klubu przy każdym zgłoszeniu. Obsługuje ją konto opiekuna platformy; administrator klubu tej zakładki nie ma - poprawki i tak wchodzą w kolejnym wydaniu aplikacji, więc decyzja o zgłoszeniu nie należy do klubu.
- **Zapisy do maszyny innego klubu nie blokują już wysyłki.** Telefon, który miał w kolejce zapis nie dla tego klubu, odkłada tylko ten jeden wpis i wysyła resztę.

## 1.1.0 (build 2) · 7 września 2026

> Wydanie otwierające testy z pilotami: logowanie kontem Google zamiast haseł, panel klubu 2.0 i porządki po pierwszych tygodniach testów. Wymaga ponownej instalacji aplikacji.

### Nowości

- **Logowanie kontem Google.** Hasła znikają z aplikacji i z panelu. Nowy pilot loguje się kontem Google, jego zgłoszenie trafia do panelu, a administrator zatwierdza je i nadaje kod pilota. Aplikacja sama zauważa decyzję - do tego czasu pokazuje ekran „czeka na zatwierdzenie". Codzienne wejście to nadal PIN, bez internetu.
- **Panel klubu 2.0.** Trzy moduły zamiast jedenastu ekranów: **Piloci**, **Samoloty** i **Dziennik** (flota w zakresie dat → operacje jednej maszyny → jedna operacja z osią zdarzeń i śladem GPS). Dziennik pokazuje wyłącznie odczyty z przyrządów; brak odczytu widać jako kreskę, nie jako zero.
- **Administrator kończy operację, której pilot nie zamknął**, i może wpisać z panelu nadrzędne odczyty maszyny (paliwo, olej, motogodziny) z komentarzem. Telefon pilota nie wyśle już zdania po decyzji administratora, a pilot dostaje o tym czytelny komunikat.
- **Nazwa operacji zamiast identyfikatora.** Każda operacja ma sygnaturę w rodzaju `SP-AXA/2026-09-05/AKO/1` (znak, doba, pilot, numer w dobie) - w aplikacji i w panelu.
- **Karta samolotu w panelu**: pojemność zbiorników, norma zużycia paliwa i oleju z dokumentacji, minimum oleju, format licznika i aktualny stan liczników przy zakładaniu maszyny. Aplikacja pilnuje tych wartości u każdego pilota.
- **Olej.** Pomiar przy przejęciu z podziałką i minimum, dolewka jako osobne zdarzenie (z kokpitu i przy przejęciu), karta „Olej" na logu operacji, oczekiwanie z normy w arkuszu pomiaru.
- **Wpis lotu po fakcie** przebudowany: data w kalendarzu, oś operacji zamiast dwóch list (lot i zrzuty w swoim miejscu), paliwo jako trzy liczby (zastane, dolane, zostało), podpowiedź odczytów z poprzedniej operacji tej maszyny, kręgi jako liczba przy lądowaniu.
- **Usunięcie całego wpisu** - z potwierdzeniem i powodem; zapis zostaje w rejestrze i widzi go administrator.
- **Dwa motywy: ciemny i jasny** (na pełne słońce) z przełącznikiem jasności w kokpicie. Ustawienia mają jedno wejście - na ekranie „Mój dzień".
- **Przytrzymanie 1 s** na zdarzeniach ręcznych, STOP i uruchomieniu silnika - koniec z przypadkowymi tapnięciami.
- **Tankowanie i zdanie samolotu**: szacunek „ile zostało" z normy maszyny, miarka stanu po tankowaniu, wpis dolewki z klawiatury z miejscami po przecinku, szlak „ile zastał · ile latał · ile mógł spalić" w arkuszu pomiaru.
- **Ikona aplikacji** ze znaku panelu (zielony samolot) - jedna marka na obu powierzchniach.

### Poprawki

- Wskaźnik łączności mówi o **sieci**, nie o kolejce: osobny stan „SYNC STOI", gdy serwer odmówił, a ponowienie z ręki zawsze zostawia ślad i czeka dłużej na uśpiony serwer.
- Puste zdania samolotu (bez lotu, bez zmian odczytów) znikają z list; zapis bez biegu, ale ze zmianą, dostaje numer i pojawia się na liście.
- Lot unieważniony przez administratora znika także z historii; sumy dziennika w panelu nie liczą operacji unieważnionych.
- Klawiatura arkusza nie kurczy ekranu pod spodem - koniec z „dwa razy DALEJ" na wpisie ręcznym.
- Akcenty jasnego motywu są kolorami, nie czernią: zieleń, bursztyn i czerwień dobrane rachunkiem pod kontrast na bieli.
- Arkusze korekty pytają o wartość, nie tłumaczą rejestru; korekta odczytu wygląda jak każda inna korekta.
- Powód blokady stoi w przycisku, nie pod nim; pusta flota to ostrzeżenie na cały ekran z drogą wyjścia; wyjście z formularza pyta o rezygnację tylko przy niepustym szkicu.
- Nagłówki i kafelki pokazują znak i sygnaturę, nigdy surowy identyfikator z panelu.
- Brak śladu GPS mówi jednym zdaniem z powodem, bez opowieści o przechowywaniu.

### Dla testerów

- To wydanie **wymaga ponownej instalacji** aplikacji ze [strony pobierania](../pobierz/) - logowanie Google to zmiana natywna, aktualizacja przez sieć jej nie wniesie.
- Serwer stawiamy z **pustą bazą**: konta z wcześniejszych testów nie przechodzą. Każdy loguje się kontem Google i czeka na zatwierdzenie przez administratora; flotę zakłada administrator w panelu.
- Uwagi z testów zgłaszacie przyciskiem w prawym górnym rogu każdego ekranu - zgłoszenie zabiera ze sobą kontekst (ekran, operacja, samolot, wersja) i wysyła się samo, gdy wróci zasięg. Trafia do modułu **Zgłoszenia** w panelu.
- Na co zwrócić uwagę: logowanie Google i ustawianie PIN-u, jasny motyw w słońcu, przytrzymanie 1 s na przyciskach kokpitu, wpis lotu po fakcie z podpowiedzią odczytów.
- **Strona, dokumentacja i panel klubu stoją pod jednym adresem.** Podręcznik, wydania i strona pobierania przeprowadziły się z osobnego serwisu na ten sam serwer, co panel - stare adresy warto podmienić w zakładkach.
- **Poprawki będą przychodzić same.** Od tego wydania aplikacja aktualizuje się w tle: pobiera zmianę, gdy ma zasięg, i włącza ją przy następnym uruchomieniu. Ponowna instalacja będzie potrzebna tylko przy większych zmianach - napiszemy o tym wprost w opisie wydania.
- **Mniej danych do pobrania na słabym łączu.** Strona, podręcznik, panel i odpowiedzi serwera jadą spakowane - panel klubu ładuje się ze 134 kB zamiast 425 kB, strona trzykrotnie lżej. Widać to najbardziej na jednej kresce zasięgu.

## 1.0.0 (build 1) · 26 sierpnia 2026

> Pierwsze wydanie testowe dla pilotów klubu: cały dzień lotny od przejęcia samolotu do zdania, także bez zasięgu.

### Co zawiera

- **Rozpoczęcie lotu w trzech krokach**: samolot i załoga, zadanie i trasa, liczniki - z odczytami z przekazania poprzedniego pilota do potwierdzenia z przyrządów.
- **Kokpit**: automatyczne wykrywanie kołowania, startu i lądowania z GPS, oś zdarzeń operacji, tankowanie, załadunek i zrzut skoczków w dniu skokowym, zmiana załogi; przyciski ręczne na wypadek braku GPS.
- **Zdanie samolotu** z obowiązkowymi odczytami paliwa i motogodzin - zatwierdza log całej operacji; wariant „bez lotu" z powodem.
- **Mój dzień** (operacje doby z sumami) i **Poprzednie dni**; ekran operacji z rachunkiem paliwa i motogodzin wobec normy maszyny, korekty własnych wpisów przez 24 godziny z historią zmian.
- **Wpis lotu po fakcie** w czterech krokach, z wieloma lotami w jednym biegu silnika.
- **Ślad GPS** całej operacji na mapie z profilem wysokości; wraca z serwera, więc jest też na nowym telefonie.
- **Offline-first**: zapis na telefonie, wysyłka w tle, wskaźnik kolejki; wejście PIN-em bez internetu. Logowanie loginem i hasłem (zmienia się w następnym wydaniu).
- **Panel administratora 1.0**: konta pilotów, flota, przegląd dni i operacji, skrzynka flag, korekty, eksporty kart dnia, audyt, statystyki i analityka zużycia.

## Plan wydań

<!-- Terminy są orientacyjne i zostają na stronie do potwierdzenia przez właściciela projektu. -->

### 5.0.0 · termin do ustalenia

> Aplikacja w sklepie Google Play.

- [ ] Instalacja i aktualizacje ze sklepu Google Play
- [ ] Logowanie dowolnym kontem Google
- [ ] Karta bezpieczeństwa danych w sklepie i usunięcie konta z poziomu aplikacji

### Układy na tablet

> Ekrany ułożone pod szeroki ekran - na tabletach z Androidem i na iPadzie.

- [ ] Własne układy aplikacji na tablet, w pionie i w poziomie
- [ ] Najpierw na tabletach z Androidem

### Aplikacja na iPhone

> Ninerdeck w App Store - na iPhone i iPad.

- [ ] Instalacja z App Store
- [ ] Logowanie kontem Apple, Google albo e-mailem i hasłem
- [ ] Zapis śladu lotu i powiadomienia także na iPhonie

### Piloci i ważność dokumentów

> Licencje, badania i uprawnienia pilotów z datami ważności - w panelu klubu i w aplikacji.

### Samoloty i przeglądy

> Przeglądy i terminy obsługi technicznej każdego samolotu floty.

### Wyważanie samolotu

> Masa i wyważenie samolotu przed lotem.

### Program szkolenia

> Program szkolenia w klubie: zadania ucznia i jego postęp.

### Ogłoszenia w klubie

> Komunikaty dla wszystkich członków klubu - w aplikacji i w panelu.

### Grupy dyskusyjne

> Rozmowy w grupach pilotów klubu.

### Dalej

- [ ] Kalibracja normy paliwa i motogodzin na danych z prawdziwych lotów
- [ ] Analityka oleju: zużycie między pomiarami i norma z lotów maszyny
- [ ] Eksport karty dnia do arkusza Google klubu
