# Dziennik

> Trzy poziomy i dwie osie: flota albo piloci w zakresie dat → operacje jednej maszyny albo jednej osoby, pogrupowane dniami → jedna operacja z osią zdarzeń, śladem GPS i trybem edycji. W dzienniku stoją wyłącznie odczyty; brak odczytu jest kreską, nigdy zerem.

## Zakres dat

Nad każdą listą stoi para pól „od → do" i szybkie zakresy: **Dzisiaj**, **Weekend**, **30 dni**, **Ten miesiąc**, **Poprzedni miesiąc**. Weekend znaczy trwający, gdy jest sobota albo niedziela, a od poniedziałku - ten, który właśnie minął: klub lata w weekend i rozlicza go w tygodniu.

Wszystko liczy się w dobach UTC, jak reszta produktu, a zakres jedzie w adresie zawsze - także domyślny. Dzięki temu link z paska przeglądarki pokazuje dokładnie to samo, co widzisz.

## Dwie osie: Samoloty i Piloci

Nad listą stoi przełącznik osi. **Samoloty** odpowiadają na „co latało", **Piloci** na „kto latał" - o ten sam zakres dat i ten sam zbiór operacji, więc sumy nalotu dowódców na obu osiach są równe co do minuty. Oś maszyn jest domyślna; oś pilotów stoi w adresie, żeby link do niej dało się wkleić.

**Sumy na obu osiach liczą wyłącznie operacje zdane.** Operacja w toku nie dokłada się do nalotu, dopóki samolot nie zostanie zdany - zamiast tego wiersz nazywa ją wprost („leci teraz", „trzyma SP-KLM od …"), nagłówek doby mówi „· 1 w toku", a maszyna albo osoba z samą operacją w toku stoi na liście z zerami. Ta sama podstawa liczenia obowiązuje w [statystykach](panel-statystyki).

## Poziom 1 · flota

Wszystkie maszyny klubu w wybranym zakresie, także te, które nie latały: wiersz zer jest odpowiedzią, po którą się przyszło („czy ta maszyna w ogóle ruszyła w sierpniu"). Kolumny: **dni** pracy, **starty**, czas pracy **silnika**, czas **w powietrzu**, zużyte **paliwo** i przyrost **motogodzin**. Maszyna, na której ktoś właśnie lata, ma o tym adnotację przy znakach. Wiersz prowadzi do poziomu 2.

- **Dni liczą się po dobie przejęcia**, nie po liczbie operacji: dwie zmiany jednego dnia to jeden dzień pracy maszyny.
- **Kolumna paliwa bywa kreską i to nie jest usterka.** Gdy choć jedna operacja zakresu nie ma bilansu - trwa albo nie ma odczytu końcowego - suma byłaby liczbą mniejszą od prawdy podaną jako prawda. Motogodziny sumują się mimo to, bo mają własny bilans.
- Operacje unieważnione i puste zapisy nie liczą się do żadnej z tych sum.

@panel dziennik-flota "Poziom 1 · cała flota w zakresie dat"

## Poziom 1 · piloci

Wiersz na osobę, która w zakresie latała - jako dowódca **albo** drugi pilot: **Dni** (z jakimkolwiek lotem), **Operacje**, **Loty**, **Blok** i **Lot** liczą się dowódcy, jak w książce lotów, a czas w prawym fotelu ma własną kolumnę **Drugi pilot** z własną sumą. Uczeń bez ani jednej operacji jako dowódca ma wiersz z zerami nalotu, liczbą w kolumnie „Drugi pilot" i podpisem „tylko jako drugi pilot". **Samoloty** wymienia maszyny z obu foteli. Wiersz mówi też, kto właśnie leci albo trzyma maszynę nieoddaną - niezależnie od zakresu dat, bo to jest o teraz.

Członkowie bez lotów w zakresie są zwinięci w jeden wiersz pod listą z liczbą w napisie („+3 członków bez lotów w tym zakresie") i rozwijają się kliknięciem - klub z sześćdziesięcioma członkami nie dostaje czterdziestu pięciu wierszy zer, a odpowiedź na „kto nie latał w tym miesiącu" zostaje na ekranie. Członek wyłączony, który w zakresie latał, zostaje na liście z podpisem „członkostwo wyłączone".

> **Uwaga.** Kolumn **Blok** i **Drugi pilot** nie dodaje się do siebie: tę samą godzinę lotu szkolnego niesie wiersz instruktora i wiersz ucznia. Nalot floty to suma kolumny „Blok".

@panel dziennik-piloci "Poziom 1 · oś pilotów ze zwiniętymi bez lotów"

## Poziom 2 · operacje jednej maszyny albo jednej osoby

W adresie stoi rejestracja albo kod pilota, nie wewnętrzny numer - `SP-KLM` i `AKO` człowiek przeczyta przez telefon i wpisze z pamięci. **Doba jest nagłówkiem, nie kolumną**: operacje grupują się dniami, a nagłówek doby niesie sumy (operacje, loty, blok, lot) policzone przez serwer nad całą dobą - także wtedy, gdy lista jest przycięta i doba rozcina się na dwie strony. Operacje w toku nagłówek nazywa osobno („· 1 w toku"); doba z lotem w prawym fotelu dostaje piątą sumę po separatorze („· 2:12 drugi pilot"). Kolumny obu stron różnią się dokładnie jedną - Pilot na osi maszyny, Samolot na osi osoby:

| Kolumna | Co pokazuje |
|---|---|
| **Operacja** | godziny biegu silnika (uruchomienie → wyłączenie), pod nimi sygnatura; oznaczenie **ręcznie** przy wpisie po fakcie, plakietka rozjazdu, gdy operacja ma otwartą sprawę |
| **Lot** | pierwszy start → ostatnie lądowanie, druga linia mówi, dokąd |
| **Loty** | ile lotów w tej operacji |
| **Blok** | ile trwał bieg silnika; kreska, dopóki śmigło pracuje |
| **Pilot** / **Samolot** | dowódca, pod nim drugi pilot - albo maszyna, pod nią załoga („z A. Kowal", „dowódca B. Nowak") |
| **Zadanie** | Skoki, Przelot, Egzamin, Lot tech., Inne |
| **Paliwo** | odczyt przy przejęciu → przy zdaniu, druga linia mówi, ile dolano; podpis bursztynem, gdy sprawa dotyczy tej pary |
| **Motogodziny** | licznik przy przejęciu → przy zdaniu, w formacie tej maszyny |
| **Olej do lotu** | stan, z którym ruszył silnik; pod nim pomiar i dolewka |

Na stronie pilota lot w prawym fotelu jest zwykłym wierszem z plakietką „drugi pilot" - pełnym tonem, bo to jego lot, tylko nie jego nalot. Para stoi w jednej komórce, bo jest jednym pytaniem: godzina uruchomienia bez godziny wyłączenia nie odpowiada na nic. Przy parze bez jednej strony kreska zostaje przy strzałce, więc widać, którego odczytu brakuje. Operacja jeszcze trwająca mówi **w toku** - to nie jest brak odczytu, tylko fakt, że jeszcze nie nastąpił. Wpis unieważniony zostaje w liście, przekreślony. Olej pary nie ma i mieć nie może: przy zdaniu samolotu się go nie mierzy, bo bagnet tuż po locie kłamie ([łańcuch odczytów](lancuch-odczytow)).

Gdy zakres obejmuje więcej operacji, niż lista pokazuje, stopka mówi to wprost i prosi o zawężenie dat - lista ucięta po cichu wyglądałaby jak komplet.

@panel dziennik-maszyna "Poziom 2 · operacje jednej maszyny, dniami" | dziennik-pilot "Poziom 2 · operacje jednej osoby, z lotem w prawym fotelu"

## Poziom 3 · jedna operacja

W nagłówku stoją znaki, sygnatura i godziny biegu silnika, a obok stan wpisu: **ręcznie**, **w toku**, **unieważniona** albo **zakończona przez administratora**. Dwa ostatnie dokłada baner, który mówi, co z tego wynika dla rachunków klubu.

- **Log zdarzeń** - ten sam przebieg, który widzi pilot: przejęcie z odczytami, zadanie, tankowania, uruchomienie, kołowanie, starty, lądowania, zrzuty, dolewki oleju, wyłączenie, zdanie. Czasy z sekundami, bo to jedyne miejsce, gdzie różnica sekund rozstrzyga, o które zdarzenie chodzi. Kolumna **Zapis** mówi, czy zdarzenie wykrył automat, czy zapisał je pilot ręcznie. Poprawiona godzina jest przekreślona, a pod nią stoi nowa; korekta administratora jest podpisana; zdarzenie unieważnione zostaje przekreślone w wierszu.
- **Szczegóły** - pilot i drugi pilot, zadanie, klient, trasa, liczba lotów, starty i lądowania, paliwo z dolewką, motogodziny i trzy liczby oleju: pomiar przed lotem, dolewka i stan do lotu.
- **Ślad GPS** - cały bieg silnika na mapie: kołowanie przerywaną szarą linią, loty pełną zieloną, znaczniki startów i lądowań. Pod mapą trzy liczby (dystans, pułap, prędkość maksymalna) i profil wysokości z przerwami na czas na ziemi. Brak rysunku ma powód i powody się nie zwijają do jednego: lot wpisany po fakcie nie miał nagrania z definicji, a operacja bez nagrania to co innego.

Z operacji wychodzi się w dwie strony: okruszki prowadzą na oś maszyny, a nazwisko pilota i drugiego pilota - na oś tej osoby. Otwarty rozjazd tej operacji stoi banerem nad osią z linkiem do sprawy w [Do sprawdzenia](panel-do-sprawdzenia).

### Tryb edycji: korekty i dopisywanie

Pilot poprawia własne wpisy w aplikacji przez 24 godziny od zdania ([korekty i rejestr](korekty-i-rejestr)). Administrator ze zdolnością **Korekty w dzienniku** poprawia je z panelu w dowolnej chwili: przycisk **Popraw zdarzenia** w nagłówku przełącza stronę operacji w tryb edycji pod własnym adresem (do wklejenia w rozmowie), a **Zakończ edycję** wraca do odczytu bez zapisywania czegokolwiek - to odnośnik, nie przycisk zapisu.

- **Każdy wiersz osi ma ołówek** i otwiera szufladę właściwą dla swojego zdarzenia: godzina przy starcie, lądowaniu, kołowaniu i uruchomieniu; odczyty paliwa i licznika przy przejęciu i zdaniu; czas i skład (tandem, AFF, solo) przy zrzucie; drugi pilot i notatka przy zadaniu. Korekta i unieważnienie nie mają ołówka - poprawia się zdarzenie, nie poprawkę.
- **Podgląd „przed → po" liczy serwer** i pokazuje go w szufladzie, zanim zapiszesz: czas lotu, blok, bilans paliwa, i którą rewizję dostanie karta dnia. **Powód jest wymagany** - pilot przeczyta go w historii zmian na telefonie, a klub w dzienniku akcji.
- **Kolizja z pilotem jest ostrzeżeniem, nie odmową**: operacja w toku albo trwający czas pilota na poprawki dają bursztynowy baner nad formularzem („Twoja korekta zapisze się mimo to"). Odmowy reguł dziennika - wyłączenie przed uruchomieniem, cofnięty licznik - blokują zapis czerwonym banerem, tak samo jak pilotowi.
- **Zdarzenie, którego nie było, unieważnia kosz w linii tytułu szuflady.** Poprawiona wartość dostaje plakietkę „popr." w obu trybach, a szuflada pokazuje historię dotychczasowych poprawek z nazwiskiem i powodem; zapis pierwotny stoi jako ostatnia kropka.
- **Nad osią stoją te same ostrzeżenia o niespójnościach, które pilot widzi na telefonie** - lot bez lądowania, zdarzenie poza pracą silnika - z tym, czym się je naprawia. Wiersz, którego dotyczą, jest podświetlony.
- **Brakujący fakt dopisuje ostatni wiersz osi „Dodaj wpis"**: lądowanie, start, kołowanie, tankowanie (stan przed i dolano - stan po liczy serwer), zrzut, załadunek albo dolewka oleju, z godziną i powodem. Fakt ocenia się tak, jak wyglądała operacja **w tej chwili** - lądowanie musi mieć start, tankowanie stojący silnik, fakt po zdaniu należy już do następnej operacji - a podgląd mówi, który lot domyka i ile niespójności znika. Uruchomienia i wyłączenia silnika dopisać się nie da: to granice operacji.

Po zapisie baner nad osią mówi, co zapisano i którą rewizję dostała karta dnia; pilot zobaczy zmianę na telefonie przy najbliższym połączeniu. Dwa wyjścia awaryjne - zakończenie i unieważnienie - zostają na dole ekranu operacji.

@panel dziennik-edycja "Tryb edycji: ołówki, szuflada korekty z podglądem" | dziennik-dopisanie "Dopisanie brakującego faktu z osi"

### Zakończenie operacji

Operacja, której pilot nie zdał - telefon padł, został w kabinie, pilot odjechał - trzyma maszynę jako zajętą i nie kończy się sama. Karta **Zakończenie operacji** kończy ją z wymaganym powodem i jednym wyborem: zostawić w dzienniku (lot był prawdziwy) albo od razu unieważnić (wpis otwarty przez pomyłkę). Potwierdzenie nazywa konkretny wpis, bo dwie operacje tej samej maszyny w jednej dobie różnią się wyłącznie godzinami.

Po zakończeniu maszyna jest wolna, a pilot dostaje na telefonie baner z powodem. Zaległych zapisów tej operacji jego telefon już nie wyśle i nie naniesie w niej poprawek.

### Unieważnienie wpisu

Operację zakończoną można wycofać - z **wymaganym** powodem. Przestaje się liczyć do nalotu pilota, do sum dziennika i do karty dnia maszyny, znika z list w aplikacji pilota i przestaje trzymać samolot. Sam zapis zostaje razem z powodem.

@panel dziennik-operacja "Poziom 3 · oś zdarzeń i ślad"

## Dlaczego tak to działa

> **Dlaczego zakończenie nie udaje zdania.** Zdanie samolotu wymaga odczytów paliwa i licznika - to one są przekazaniem dla następnego pilota. Administrator przy biurku nie wie, co pokazują przyrządy, a wpisanie zmyślonych liczb byłoby najgorszą rzeczą, jaką można zrobić dziennikowi. Zakończona operacja liczy się więc do nalotu i do sum, ale **nie jest ogniwem łańcucha**: aktualny stan maszyny wpisuje się osobno, w [karcie samolotu](panel-samoloty).

> **Dlaczego powód jest tu wymagany, a w telefonie nie.** W aplikacji pilot wycofuje własny wpis i wie, co zrobił. Z panelu wycofuje się cudzy lot: powód czyta pilot na swoim telefonie, stoi na osi zdarzeń i zostaje w klubie. Nic przy tym nie znika - powstaje nowy fakt („ten wpis został wycofany"), bo dziennik lotów ma pokazywać, że lot był i że go wycofano.

> **Dlaczego dziennik nie pokazuje szacunków.** W dzienniku stoją wyłącznie wartości zmierzone albo policzone z faktów - liczba lotów, czas trwania biegu, suma pomiaru i dolewki. Normy zużycia, szacunki „ile powinno zostać" i werdykty nie wchodzą tu ani teraz, ani później: to jest narzędzie nadzoru, a nie druga opinia o cudzym locie. Dlatego `0 L` znaczy pusty zbiornik, a kreska - „nikt tego nie zapisał".

## Częste problemy

- **Samolot jest zajęty, a pilot już go nie zda** → otwórz jego operację (poziom 2 → **Szczegóły**) i użyj **Zakończenia operacji**. Potem wpisz aktualny stan licznika, paliwa i oleju w karcie samolotu - zakończona operacja nie przekazuje maszyny nikomu.
- **Pilot mówi, że zapisał lot, a w dzienniku go nie ma** → zapisy powstają na telefonie i czekają tam, dopóki nie ma sieci. Poproś o zajrzenie do ustawień aplikacji: wskaźnik przy nagłówku i **SYNCHRONIZUJ TERAZ** mówią, czy kolejka stoi. Jeśli pilot zdał maszynę, nic nie zmieniając i nie uruchamiając silnika, taki pusty zapis nie wchodzi do dziennika w ogóle ([model operacji](model-operacji)).
- **Odczyt zdania jednej operacji nie zgadza się z przejęciem następnej** → ktoś tankował poza aplikacją, pomylił cyfrę albo operacja została zakończona bez odczytów; taki rozjazd ma też sprawę w [Do sprawdzenia](panel-do-sprawdzenia). Poprawkę w konkretnej operacji nanosi pilot w oknie 24 godzin albo administrator w trybie edycji (błędny odczyt - korekta przy przejęciu lub zdaniu; tankowanie poza aplikacją - **Dodaj wpis**); stan maszyny na teraz ustawia **Popraw odczyty** w [karcie samolotu](panel-samoloty), z komentarzem.
- **Operacji nie ma na liście, choć pilot pokazuje ją na telefonie** → sprawdź zakres dat (doba liczy się w UTC od uruchomienia silnika) i stopkę o przyciętej liście. Wpis unieważniony zostaje w liście przekreślony; pusty zapis nie pojawi się wcale, ale link do niego nadal otworzy poziom 3.
