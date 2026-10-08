# Dziennik

> Loty klubu na trzech poziomach: cała flota albo wszyscy piloci w wybranym okresie, potem operacje jednego samolotu albo jednej osoby, na końcu jedna operacja z przebiegiem i śladem. Z odpowiednim uprawnieniem poprawisz tu każdy wpis.

Dziennik otwiera uprawnienie **Podgląd klubu**, a poprawki - **Korekty w dzienniku** ([kto co widzi](uprawnienia)).

## Wybór okresu

Nad listą stoją pola „od → do" i gotowe okresy: **Dzisiaj**, **Weekend**, **30 dni**, **Ten miesiąc**, **Poprzedni miesiąc**. „Weekend" w sobotę i niedzielę oznacza bieżący weekend, a od poniedziałku - ten, który właśnie minął. Daty liczą się w UTC.

Wybrany okres zapisuje się w adresie strony - link wysłany koledze pokaże mu dokładnie ten sam widok.

## Samoloty albo piloci

Przełącznik nad listą pokazuje dziennik według **samolotów** („co latało") albo według **pilotów** („kto latał"). Obie strony liczą te same operacje, więc suma nalotu dowódców jest na obu taka sama.

**Do sum wchodzą tylko zdane operacje.** Operacja, która jeszcze trwa, nie dolicza się do nalotu - zamiast tego wiersz mówi wprost „leci teraz" albo „zajęty od …". Te same zasady liczenia mają [statystyki](panel-statystyki).

## Poziom 1 · flota

Lista wszystkich samolotów klubu w wybranym okresie - także tych, które nie latały. Kolumny: **Dni** pracy, **Starty**, czas pracy **silnika**, czas **w powietrzu**, zużyte **paliwo** i przyrost **motogodzin**. Kliknięcie w wiersz otwiera operacje tego samolotu.

- **Dzień liczy się raz**, nawet jeśli samolot miał tego dnia kilka operacji.
- **Paliwo bywa kreską.** Gdy choć jedna operacja z okresu nie ma odczytu końcowego, suma byłaby niepełna - dlatego zamiast niej stoi kreska.
- Operacje unieważnione i puste zapisy nie wchodzą do żadnej sumy.

@panel dziennik-flota "Cała flota w wybranym okresie"

## Poziom 1 · piloci

Wiersz na każdą osobę, która w okresie latała - jako dowódca albo drugi pilot. **Operacje**, **Loty**, **Blok** i **Lot** liczą się dowódcy, jak w książce lotów, a czas w prawym fotelu ma własną kolumnę **Drugi pilot**. Uczeń, który latał tylko jako drugi pilot, ma zera w nalocie i podpis „tylko jako drugi pilot". Wiersz mówi też, kto właśnie leci albo trzyma niezdany samolot.

Członkowie, którzy w okresie nie latali, są zwinięci w jeden wiersz pod listą, na przykład „+3 członków bez lotów w tym zakresie". Kliknięcie go rozwija.

> **Uwaga.** Kolumn **Blok** i **Drugi pilot** nie dodaje się do siebie: ta sama godzina lotu szkolnego jest w wierszu instruktora i w wierszu ucznia. Nalot floty to suma kolumny „Blok".

@panel dziennik-piloci "Dziennik według pilotów"

## Poziom 2 · operacje jednego samolotu albo jednej osoby

Operacje są pogrupowane dniami. Nagłówek dnia podaje sumy - liczbę operacji, lotów, czas blokowy i czas lotu - a operacje w toku osobno („· 1 w toku").

| Kolumna | Co pokazuje |
|---|---|
| **Operacja** | godziny pracy silnika i sygnatura; oznaczenie **ręcznie** przy wpisie po fakcie i oznaczenie rozjazdu, gdy operacja ma sprawę do sprawdzenia |
| **Lot** | pierwszy start → ostatnie lądowanie, i dokąd |
| **Loty** | liczba lotów w operacji |
| **Blok** | czas pracy silnika; kreska, dopóki silnik pracuje |
| **Pilot** albo **Samolot** | dowódca i drugi pilot - albo samolot i załoga |
| **Zadanie** | Skoki, Przelot, Egzamin, Lot tech., Inne |
| **Paliwo** | odczyt przy rozpoczęciu → przy zdaniu, i ile dolano |
| **Motogodziny** | licznik przy rozpoczęciu → przy zdaniu |
| **Olej do lotu** | stan oleju przy uruchomieniu silnika: pomiar i dolewka |

Brak odczytu to kreska, nigdy zero. Operacja, która jeszcze trwa, ma napis **w toku**. Unieważniony wpis zostaje na liście, przekreślony. Na stronie pilota lot w prawym fotelu ma oznaczenie „drugi pilot".

Jeśli w okresie jest więcej operacji, niż mieści lista, stopka o tym mówi - zawęź wtedy daty.

@panel dziennik-maszyna "Operacje jednego samolotu" | dziennik-pilot "Operacje jednej osoby"

## Poziom 3 · jedna operacja

W nagłówku stoją znaki samolotu, sygnatura i godziny pracy silnika, a obok stan: **ręcznie**, **w toku**, **unieważniona** albo **zakończona przez administratora**.

- **Przebieg operacji** - te same zdarzenia, które widzi pilot: rozpoczęcie z odczytami, zadanie, tankowania, uruchomienie, kołowanie, starty, lądowania, zrzuty, dolewki oleju, wyłączenie i zdanie. Godziny mają sekundy. Kolumna **Zapis** mówi, czy zdarzenie rozpoznała aplikacja, czy zapisał je pilot ręcznie. Poprawiona wartość ma oznaczenie **popr.** z historią zmian.
- **Szczegóły** - załoga, zadanie, klient, trasa, loty, paliwo, motogodziny i olej.
- **Ślad GPS** - mapa z kołowaniem i lotami, profil wysokości oraz dystans, pułap i największa prędkość.

Ścieżka nad tytułem („Dziennik / SP-AXA") prowadzi z powrotem do samolotu, a nazwiska pilotów - do ich operacji. Jeśli operacja ma otwarty rozjazd, nad przebiegiem stoi komunikat z linkiem do sprawy w [Do sprawdzenia](panel-do-sprawdzenia).

@panel dziennik-operacja "Jedna operacja: przebieg i ślad"

### Jak poprawić operację

1. Na stronie operacji kliknij **Popraw zdarzenia**. Strona przejdzie w tryb edycji.
2. Kliknij wiersz zdarzenia. Z boku otworzy się okno poprawki - dla startu, lądowania i kołowania godzina, dla rozpoczęcia i zdania odczyty, dla zrzutu godzina i skład, dla zadania drugi pilot i notatka.
3. Wpisz nową wartość i **powód** - jest wymagany, bo pilot zobaczy go w historii zmian. Okno pokazuje skutek przed zapisem: czas lotu, czas blokowy, bilans paliwa.
4. Zapisz. Gotowe poprawki zakończ przyciskiem **Zakończ edycję**.

- **Zdarzenie, którego nie było**, usuwasz ikoną kosza w nagłówku okna poprawki.
- **Brakujące zdarzenie** dopiszesz ostatnim wierszem przebiegu, **Dodaj wpis**: lądowanie, start, kołowanie, tankowanie, zrzut, załadunek albo dolewka oleju. Godzina musi pasować do przebiegu - na przykład lądowanie musi mieć wcześniejszy start, a tankowanie wypaść przy wyłączonym silniku.
- **Nad przebiegiem stoją te same ostrzeżenia, które widzi pilot** - na przykład lot bez lądowania - z podpowiedzią, jak je naprawić.
- **Gdy pilot wciąż leci albo może jeszcze sam poprawiać**, panel ostrzega, ale zapis jest możliwy. Zapisu nie da się zrobić tylko wtedy, gdy przeczy faktom - na przykład wyłączenie silnika przed uruchomieniem albo cofnięty licznik.

Po zapisie komunikat mówi, co się zmieniło i którą wersję dostała karta dnia. Pilot zobaczy poprawkę w aplikacji przy najbliższym połączeniu.

@panel dziennik-edycja "Tryb edycji i poprawka z podglądem skutku" | dziennik-dopisanie "Dopisanie brakującego zdarzenia"

### Zakończenie operacji

Operacja, której pilot nie zdał - telefon się rozładował, pilot odjechał - trzyma samolot jako zajęty. Karta **Zakończenie operacji** kończy ją z wymaganym powodem. Wybierasz przy tym, czy operacja zostaje w dzienniku (lot się odbył), czy od razu ją unieważnić (wpis powstał przez pomyłkę).

Po zakończeniu samolot jest wolny, a pilot dostaje w aplikacji komunikat z powodem. Zakończona operacja nie ma odczytów końcowych - aktualny stan samolotu wpisz w [karcie samolotu](panel-samoloty#poprawa-odczytow).

### Unieważnienie wpisu

Zakończoną operację możesz unieważnić - z wymaganym powodem. Przestaje się wtedy liczyć do nalotu, sum dziennika i karty dnia, znika z list w aplikacji pilota i przestaje zajmować samolot. Wpis zostaje w dzienniku, przekreślony, razem z powodem.

## Częste problemy

- **Samolot jest zajęty, a pilot go już nie zda** → otwórz jego operację i użyj **Zakończenia operacji**. Potem wpisz aktualny stan liczników w karcie samolotu.
- **Pilot zapisał lot, a w dzienniku go nie ma** → zapisy czekają w telefonie pilota, dopóki nie ma internetu. Poproś pilota o sprawdzenie oznaczenia łączności i przycisk **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji. Zdanie samolotu bez lotu i bez żadnej zmiany odczytów nie trafia do dziennika.
- **Odczyt przy zdaniu jednej operacji nie zgadza się z rozpoczęciem następnej** → ktoś tankował poza aplikacją, pomylił cyfrę albo operację zakończono bez odczytów. Taka różnica ma też sprawę w [Do sprawdzenia](panel-do-sprawdzenia). Popraw odczyt w konkretnej operacji albo dopisz tankowanie; aktualny stan samolotu ustawisz w jego karcie.
- **Operacji nie ma na liście, choć pilot ją widzi** → sprawdź wybrany okres (daty liczą się w UTC od uruchomienia silnika) i stopkę o skróconej liście.
