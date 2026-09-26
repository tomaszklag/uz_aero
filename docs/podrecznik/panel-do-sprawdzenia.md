# Do sprawdzenia

> Jedno miejsce na to, co wymaga reakcji administratora: rozjazdy między zapisami, doby bez karty w arkuszu i operacje, których nikt nie zdał. Liczba przy pozycji w kolumnie panelu stoi wyłącznie wtedy, gdy coś czeka.

## Lista spraw

Druga pozycja w kolumnie, zaraz po Dzienniku. Ekran odpowiada na jedno pytanie - „co wymaga mojej reakcji" - i składa się z trzech kart, każda z liczbą spraw w podpisie tytułu:

- **Rozjazdy** - nieścisłości między zapisami, które serwer wykrył przy przyjmowaniu zapisów z telefonów; dotąd zapisywał je, ale nie pokazywał nikomu;
- **Karty dnia** - doby samolotu, które nie mają karty w arkuszu, choć powinny;
- **Operacje wiszące** - operacje, których nikt nie zdał od ponad doby: maszyna stoi jako zajęta, a pilot najpewniej odjechał.

Wiersz sprawy jest linkiem tam, gdzie da się ją zamknąć: rozjazd otwiera skrzynkę rozjazdów, karta - monitor kart, operacja wisząca - jej stronę w dzienniku z kartą **Zakończenie operacji**. Karta bez spraw znika, a gdy nie czeka nic, ekran mówi to wprost zamiast pokazywać trzy puste ramki. Liczbę w kolumnie sumuje serwer z tych samych trzech źródeł, więc zgadza się z tym, co widać po wejściu.

@panel sprawdzenie-lista "Do sprawdzenia: trzy karty i liczby w podpisach"

## Rozjazdy

Serwer sprawdza każdy zapis z telefonu na tle sąsiednich operacji tej samej maszyny i tego samego pilota. Rozjazd nie zatrzymuje zapisu - lot wchodzi do dziennika w całości - tylko dostaje sprawę, którą ktoś w klubie ma obejrzeć. Sześć rodzajów, każdy nazwany po polsku, z liczbami, których dotyczy:

| Rozjazd | Co znaczy | Co z tym zrobić |
|---|---|---|
| **Dwie operacje naraz** | maszyna została przejęta, zanim poprzednia operacja została zdana | zakończ operację wiszącą w dzienniku albo poczekaj na zdanie samolotu, potem zamknij sprawę - **zamknięcie wyśle kartę doby do arkusza**, bo do tej pory ją wstrzymywało |
| **Pilot w dwóch maszynach** | dwie operacje jednego pilota nakładają się w czasie | sprawdź godziny przejęcia i zdania obu operacji i popraw tę, która ma je błędne |
| **Luka w liczniku** | przejęcie z licznikiem wyższym, niż zostawiło poprzednie zdanie | ktoś latał bez aplikacji albo odczyt jest zawyżony: lot bez aplikacji dopisuje pilot wpisem po fakcie, błędny odczyt poprawia się przy przejęciu albo przy zdaniu |
| **Cofnięty licznik** | przejęcie z licznikiem niższym niż poprzednie zdanie | źle odczytany licznik - popraw odczyt przy przejęciu albo przy zdaniu |
| **Rozjazd paliwa** | odczyt przy przejęciu różni się od przekazanego bardziej, niż pozwala tolerancja podziałki | tankowano poza aplikacją: dopisz tankowanie w operacji, która oddała samolot; błędny odczyt popraw przy przejęciu |
| **Rozjazd zegara** | zegar telefonu rozjechał się z czasem GPS o więcej niż próg | czasy operacji liczą się z GPS, więc sprawdź na osi zdarzeń zapisy bez pozycji; poproś pilota o włączenie czasu automatycznego w telefonie |

Skrzynka zawęża się chipami rodzaju (rodzaj stoi też w adresie, po polsku), a każda sprawa nazywa swoje operacje sygnaturami, pilotem i chwilami - nigdy wewnętrznym identyfikatorem. Szuflada sprawy ma trzy karty: **Co się nie zgadza** (liczby), **Co z tym zrobić** (zdanie z tabeli wyżej) i **Zamknięcie sprawy** z **wymaganą** notatką, co ustalono. Zamknięcie sprawy nie zmienia żadnej liczby - mówi tylko, że ktoś to sprawdził - poza jednym przypadkiem: sprawa „Dwie operacje naraz" trzyma kartę doby poza arkuszem, więc jej zamknięcie wysyła kartę, a przycisk nazywa oba skutki PRZED kliknięciem. Jeśli ktoś rozstrzygnął sprawę przed Tobą, panel mówi kto i kiedy, zamiast zamykać ją drugi raz.

Otwarty rozjazd widać też w [dzienniku](panel-dziennik): plakietką przy parze godzin na liście operacji (jest linkiem do sprawy), podpisem pod parą odczytów, której dotyczy, i banerem na stronie operacji.

@panel sprawdzenie-rozjazdy "Skrzynka rozjazdów: sześć rodzajów, szuflada z zamknięciem"

## Karty dnia

Karta dnia to dokument doby samolotu: jedna karta na (dobę, maszynę), operacje jako jej wiersze. Monitor pokazuje wiersz na operację z nazwą karty i stanem, który wnioskuje serwer:

| Stan | Znaczenie |
|---|---|
| **W arkuszu** | karta leży w arkuszu w bieżącej rewizji |
| **Bez karty** | operacja jest zdana, a karta nie powstała albo eksport nie doszedł - to jest sprawa do sprawdzenia |
| **Wstrzymana flagą** | kartę trzyma otwarty rozjazd „Dwie operacje naraz" - zamknij sprawę w skrzynce, karta pójdzie sama |
| **Czeka na zdanie** | operacja trwa; karta powstanie po zdaniu samolotu (wiszące dłużej niż dobę są podpisane bursztynem) |
| **Unieważniona** | wpis wycofany - karta nie ma czego nieść |

Chipy nad listą zawężają do stanów; **Rewizje** to osobny wymiar - karty wysłane więcej niż raz, bo korekta albo dopisany fakt zmieniły ich treść. Szuflada karty pokazuje **rewizje** (każda z chwilą; poprzednie nie znikają), **treść karty** tak, jak leży w arkuszu, oraz **adres karty** z przyciskiem „Kopiuj". Ten adres działa bez logowania - jest po to, żeby skarbnik albo księgowość dostali kartę bez konta w panelu - i dlatego zdanie obok mówi, komu go dawać: adres niesie klucz klubu, więc kto go ma, czyta karty klubu.

**Ponów eksport** stoi w wierszu wyłącznie przy karcie, której nie ma; kartę leżącą w arkuszu ponawia się z szuflady, po obejrzeniu, co w niej jest. Odpowiedź zawsze mówi, co się stało: karta poszła (z numerem rewizji), eksporter odmówił (z powodem - ponowienie tego nie naprawi), arkusz nie odpowiedział (spróbuj za chwilę, dane w dzienniku są kompletne) albo awaria po naszej stronie (zgłoś operatorowi z nazwą karty).

@panel sprawdzenie-karty "Karty dnia: stany, rewizje, adres karty"

## Operacje wiszące

Operacja trzymana od ponad doby bez zdania samolotu blokuje maszynę w kalendarzu i w wyborze pilotów. Wiersz prowadzi na stronę operacji w dzienniku, gdzie karta **Zakończenie operacji** kończy ją z powodem - jak dotąd ([dziennik](panel-dziennik#zakonczenie-operacji)). Po zakończeniu sprawa znika z listy sama.

## Jak to działa

- **Rozjazdy wykrywa serwer przy każdym zapisie z telefonu**, a nie osobny przebieg w nocy: sprawa pojawia się w skrzynce w chwili, gdy zapis dociera do klubu.
- **Sprawa opisuje fakty, nie sposób liczenia.** Liczby w karcie „Co się nie zgadza" są tymi, które serwer policzył przy przyjęciu zapisu; podpisy mówią, która operacja oddała, a która przejęła.
- **Zamknięta sprawa zostaje z notatką i nazwiskiem** w dzienniku akcji klubu. Ponowne otwarcie nie istnieje - nowy rozjazd na tej samej parze operacji byłby nową sprawą.
- **Liczba w kolumnie odświeża się co minutę** i w tle po każdej zmianie w panelu; zero i „jeszcze nie wiem" wyglądają tak samo, bo plakietka z zerem uczyłaby oko pomijać kolumnę.

## Dlaczego tak to działa

> **Dlaczego rozjazd nie zatrzymuje zapisu.** Telefon zapisuje fakty z kabiny i wysyła je, gdy jest sieć - często godziny po locie. Odrzucenie zapisu z powodu nieścisłości z sąsiednią operacją zostawiłoby lot poza dziennikiem, a pilot dowiedziałby się o tym w najgorszym miejscu. Dziennik przyjmuje więc wszystko, a nieścisłość dostaje sprawę: człowiek patrzy na dwie operacje naraz i decyduje, która ma rację.

> **Dlaczego notatka jest wymagana.** Za pół roku nikt nie pamięta, dlaczego rozjazd paliwa uznano za wyjaśniony. Zdanie „tankowano z beczki na polu, dopisane w operacji z 6 września" jest jedyną rzeczą, która z tej sprawy zostaje - i to ono ma stać w dzienniku akcji, nie samo „zamknięto".

> **Dlaczego karta czeka na zamknięcie sprawy „Dwie operacje naraz".** Karta doby jest dokumentem, który klub rozlicza; przy dwóch operacjach nakładających się w czasie nie wiadomo, która z nich ma prawdziwe godziny. Karta z błędnymi godzinami w arkuszu wymagałaby rewizji - więc czeka, aż ktoś spojrzy, a zamknięcie sprawy wysyła ją od razu.

## Częste problemy

- **„Do sprawdzenia" pokazuje liczbę, a po wejściu karty są puste** → odśwież stronę: liczba w kolumnie odświeża się co minutę, a ktoś mógł zamknąć sprawy przed chwilą.
- **Karta doby ma stan „Bez karty" od kilku dni** → kliknij **Ponów** w wierszu; odpowiedź mówi, czy poszła i dlaczego nie. Jeśli eksporter odmawia z powodem, powód wskazuje, co w operacji trzeba poprawić w [dzienniku](panel-dziennik).
- **Zamknąłem rozjazd, a przy operacji dalej stoi plakietka** → plakietka zostaje przy operacji, dopóki lista nie odczyta się na nowo; odśwież stronę dziennika. Zamknięta sprawa nie wraca.
- **Nie mam przycisku zamknięcia sprawy** → zamykanie rozjazdów daje zdolność **Uwagi serwera**; ponowienie eksportu - **Flota**. Bez nich sprawa jest do odczytu ([zakresy uprawnień](uprawnienia)).
