# Dziennik

> Trzy poziomy: flota w zakresie dat → operacje jednej maszyny → jedna operacja z osią zdarzeń i śladem GPS. W dzienniku stoją wyłącznie odczyty; brak odczytu jest kreską, nigdy zerem.

## Zakres dat

Nad każdą listą stoi para pól „od → do" i szybkie zakresy: **Dzisiaj**, **Weekend**, **30 dni**, **Ten miesiąc**, **Poprzedni miesiąc**. Weekend znaczy trwający, gdy jest sobota albo niedziela, a od poniedziałku - ten, który właśnie minął: klub lata w weekend i rozlicza go w tygodniu.

Wszystko liczy się w dobach UTC, jak reszta produktu, a zakres jedzie w adresie zawsze - także domyślny. Dzięki temu link z paska przeglądarki pokazuje dokładnie to samo, co widzisz.

## Poziom 1 · flota

Wszystkie maszyny klubu w wybranym zakresie, także te, które nie latały: wiersz zer jest odpowiedzią, po którą się przyszło („czy ta maszyna w ogóle ruszyła w sierpniu"). Kolumny: **dni** pracy, **starty**, czas pracy **silnika**, czas **w powietrzu**, zużyte **paliwo** i przyrost **motogodzin**. Maszyna, na której ktoś właśnie lata, ma o tym adnotację przy znakach. Wiersz prowadzi do poziomu 2.

- **Dni liczą się po dobie przejęcia**, nie po liczbie operacji: dwie zmiany jednego dnia to jeden dzień pracy maszyny.
- **Kolumna paliwa bywa kreską i to nie jest usterka.** Gdy choć jedna operacja zakresu nie ma bilansu - trwa albo nie ma odczytu końcowego - suma byłaby liczbą mniejszą od prawdy podaną jako prawda. Motogodziny sumują się mimo to, bo mają własny bilans.
- Operacje unieważnione i puste zapisy nie liczą się do żadnej z tych sum.

## Poziom 2 · operacje jednej maszyny

W adresie stoi rejestracja, nie wewnętrzny numer - `SP-KLM` człowiek przeczyta przez telefon i wpisze z pamięci. Kolumn jest dziewięć i każda odpowiada na jedno pytanie, zamiast wypisywać pojedynczą liczbę:

| Kolumna | Co niesie |
|---|---|
| **Operacja** | data, a pod nią sygnatura; plakietka **ręcznie** przy wpisie po fakcie |
| **Bieg silnika** | uruchomienie → wyłączenie, druga linia mówi, jak długo |
| **Lot** | pierwszy start → ostatnie lądowanie, druga linia mówi, dokąd |
| **Loty** | ile lotów w tej operacji |
| **Pilot** | dowódca, pod nim drugi pilot |
| **Zadanie** | Skoki, Przelot, Egzamin, Lot tech., Inne |
| **Paliwo** | odczyt przy przejęciu → przy zdaniu, druga linia mówi, ile dolano |
| **Motogodziny** | licznik przy przejęciu → przy zdaniu, w formacie tej maszyny |
| **Olej do lotu** | stan, z którym ruszył silnik; pod nim pomiar i dolewka |

Para stoi w jednej komórce, bo jest jednym pytaniem: godzina uruchomienia bez godziny wyłączenia nie odpowiada na nic. Przy parze bez jednej strony kreska zostaje przy strzałce, więc widać, którego odczytu brakuje. Operacja jeszcze trwająca mówi **w toku** - to nie jest brak odczytu, tylko fakt, że jeszcze nie nastąpił. Wpis unieważniony zostaje w liście, przekreślony. Olej pary nie ma i mieć nie może: przy zdaniu samolotu się go nie mierzy, bo bagnet tuż po locie kłamie ([łańcuch odczytów](lancuch-odczytow)).

Gdy zakres obejmuje więcej operacji, niż lista pokazuje, stopka mówi to wprost i prosi o zawężenie dat - lista ucięta po cichu wyglądałaby jak komplet.

## Poziom 3 · jedna operacja

Nagłówek niesie znaki, sygnaturę i godziny biegu silnika, a obok stan wpisu: **ręcznie**, **w toku**, **unieważniona** albo **zakończona przez administratora**. Dwa ostatnie dokłada baner, który mówi, co z tego wynika dla rachunków klubu.

- **Log zdarzeń** - ten sam przebieg, który widzi pilot: przejęcie z odczytami, zadanie, tankowania, uruchomienie, kołowanie, starty, lądowania, zrzuty, dolewki oleju, wyłączenie, zdanie. Czasy z sekundami, bo to jedyne miejsce, gdzie różnica sekund rozstrzyga, o które zdarzenie chodzi. Kolumna **Zapis** mówi, czy zdarzenie wykrył automat, czy zapisał je pilot ręcznie. Poprawiona godzina jest przekreślona, a pod nią stoi nowa; korekta administratora jest podpisana; zdarzenie unieważnione zostaje przekreślone w wierszu.
- **Szczegóły** - pilot i drugi pilot, zadanie, klient, trasa, liczba lotów, starty i lądowania, paliwo z dolewką, motogodziny i trzy liczby oleju: pomiar przed lotem, dolewka i stan do lotu.
- **Ślad GPS** - cały bieg silnika na mapie: kołowanie przerywaną szarą linią, loty pełną zieloną, znaczniki startów i lądowań. Pod mapą trzy liczby (dystans, pułap, prędkość maksymalna) i profil wysokości z przerwami na czas na ziemi. Brak rysunku ma powód i powody się nie zwijają do jednego: lot wpisany po fakcie nie miał nagrania z definicji, a operacja bez nagrania to co innego.

Poprawek pojedynczych zdarzeń - godziny startu, odczytu, składu zrzutu - **nie robi się dziś z panelu**. Robi je pilot w aplikacji przez 24 godziny od zdania ([korekty i rejestr](korekty-i-rejestr)); panel ma dwa wyjścia awaryjne, oba na dole ekranu operacji.

### Zakończenie operacji

Operacja, której pilot nie zdał - telefon padł, został w kabinie, pilot odjechał - trzyma maszynę jako zajętą i nie kończy się sama. Karta **Zakończenie operacji** kończy ją z wymaganym powodem i jednym wyborem: zostawić w dzienniku (lot był prawdziwy) albo od razu unieważnić (wpis otwarty przez pomyłkę). Potwierdzenie nazywa konkretny wpis, bo dwie operacje tej samej maszyny w jednej dobie różnią się wyłącznie godzinami.

Po zakończeniu maszyna jest wolna, a pilot dostaje na telefonie baner z powodem. Zaległych zapisów tej operacji jego telefon już nie wyśle i nie naniesie w niej poprawek.

> **Dlaczego zakończenie nie udaje zdania.** Zdanie samolotu niesie obowiązkowe odczyty paliwa i licznika - to one są przekazaniem dla następnego pilota. Administrator przy biurku nie wie, co pokazują przyrządy, a wpisanie zmyślonych liczb byłoby najgorszą rzeczą, jaką można zrobić dziennikowi. Zakończona operacja liczy się więc do nalotu i do sum, ale **nie jest ogniwem łańcucha**: aktualny stan maszyny wpisuje się osobno, w [karcie samolotu](panel-samoloty).

### Unieważnienie wpisu

Operację zakończoną można wycofać - z **wymaganym** powodem. Przestaje się liczyć do nalotu pilota, do sum dziennika i do karty dnia maszyny, znika z list w aplikacji pilota i przestaje trzymać samolot. Sam zapis zostaje razem z powodem.

> **Dlaczego powód jest tu wymagany, a w telefonie nie.** W aplikacji pilot wycofuje własny wpis i wie, co zrobił. Z panelu wycofuje się cudzy lot: powód czyta pilot na swoim telefonie, stoi na osi zdarzeń i zostaje w klubie. Nic przy tym nie znika - powstaje nowy fakt („ten wpis został wycofany"), bo dziennik lotów ma pokazywać, że lot był i że go wycofano.

> **Założenie.** W dzienniku stoją wyłącznie wartości zmierzone albo policzone z faktów - liczba lotów, czas trwania biegu, suma pomiaru i dolewki. Normy zużycia, szacunki „ile powinno zostać" i werdykty nie wchodzą tu ani teraz, ani później: to jest narzędzie nadzoru, a nie druga opinia o cudzym locie. Dlatego `0 L` znaczy pusty zbiornik, a kreska - „nikt tego nie zapisał".

## Częste problemy

- **Samolot jest zajęty, a pilot już go nie zda** → otwórz jego operację (poziom 2 → **Szczegóły**) i użyj **Zakończenia operacji**. Potem wpisz aktualny stan licznika, paliwa i oleju w karcie samolotu - zakończona operacja nie przekazuje maszyny nikomu.
- **Pilot mówi, że zapisał lot, a w dzienniku go nie ma** → zapisy powstają na telefonie i czekają tam, dopóki nie ma sieci. Poproś o zajrzenie do ustawień aplikacji: wskaźnik przy nagłówku i **SYNCHRONIZUJ TERAZ** mówią, czy kolejka stoi. Jeśli pilot zdał maszynę, nic nie zmieniając i nie uruchamiając silnika, taki pusty zapis nie wchodzi do dziennika w ogóle ([model operacji](model-operacji)).
- **Odczyt zdania jednej operacji nie zgadza się z przejęciem następnej** → ktoś tankował poza aplikacją, pomylił cyfrę albo operacja została zakończona bez odczytów. Poprawkę w konkretnej operacji nanosi pilot w oknie 24 godzin; stan maszyny na teraz ustawia **Popraw odczyty** w [karcie samolotu](panel-samoloty), z komentarzem.
- **Operacji nie ma na liście, choć pilot pokazuje ją na telefonie** → sprawdź zakres dat (doba liczy się w UTC od uruchomienia silnika) i stopkę o przyciętej liście. Wpis unieważniony zostaje w liście przekreślony; pusty zapis nie pojawi się wcale, ale link do niego nadal otworzy poziom 3.
