# Kalendarz w panelu

> Plan floty na dni, dla każdego członka klubu: kto ma którą maszynę i kiedy, które maszyny stoją w serwisie - i własna rezerwacja zakładana tak samo, jak w aplikacji. Rezerwujesz z telefonu albo z panelu; to ten sam termin, ta sama ścieżka akceptacji i te same wiadomości.

## Oś floty

Wiersz na każdą maszynę klubu, kolumna na każdy dzień wybranego zakresu: **Ten tydzień**, **Dwa tygodnie** albo **Miesiąc**. W komórce stoją paski zajętości tej maszyny w tym dniu, od rana: rezerwacja nazwiskiem pilota, wyłączenie z użytku swoim powodem („Przegląd 100 h"). Panel patrzy szerzej niż aplikacja - tam osią jest jedna doba całej floty, tu tydzień albo miesiąc - ale to ten sam plan klubu.

| Wygląd paska | Znaczy |
| --- | --- |
| zwykły | rezerwacja innego pilota |
| **zielony** | **Twoja** rezerwacja |
| przerywana ramka | rezerwacja czeka na zgodę - termin jest już zajęty, zgody jeszcze nie ma |
| w skos, bursztynowy | maszyna wyłączona z użytku (przegląd, usterka) |

Maszyna wyłączona ze służby zostaje w osi z podpisem „poza służbą" - odpowiedź na „czemu nie ma czym latać" ma być widoczna, a nie schowana. Kliknięcie w pasek otwiera jego kartę; cudza rezerwacja pokazuje Ci tyle, ile pasek w aplikacji: kto, czym i kiedy ([zakresy uprawnień](uprawnienia)).

@panel kalendarz-flota "Oś floty: maszyny na dni, Twoje rezerwacje zielone"

## Jak zarezerwować

Są dwa wejścia. Przycisk **Zarezerwuj** nad osią otwiera pusty formularz, a kliknięcie w **wolne miejsce przy maszynie w danym dniu** - formularz z tą maszyną i tym dniem. Wolne miejsce nie rysuje niczego, dopóki nie najedziesz na nie myszą; w dniach minionych, przy maszynie poza służbą i w dniu zajętym w całości przeglądem po prostu nie reaguje.

Formularz ma dwa kroki, jak w aplikacji.

1. **Termin i maszyna.** Samolot z listy i dzień. Pod nimi **pasek zajętości** tej maszyny w wybranym dniu - od świtu do zmroku na lotnisku klubu - z wolnymi godzinami wypisanymi słowami, a Twój termin rysuje się na nim zielenią. **Sugerowane godziny** proponują terminy, które najlepiej upakowują dzień, i mówią dlaczego („tuż przed rezerwacją · A. Kowalski", „początek dnia"); kliknięcie przestawia godziny. Godziny wpisuje się **w czasie klubu**. Gdy wybrane godziny nachodzą na coś, co już stoi, zdanie pod nimi mówi to bursztynem - ale nie blokuje, bo o terminie rozstrzyga serwer w chwili zapisu.
2. **Zadanie.** Rodzaj operacji, trasa (przy skokach jedno lotnisko), drugi pilot (wymagany przy maszynie z załogą dwuosobową - mówi o tym plakietka przy polu), planowany czas lotu, opcjonalnie paliwo do zabrania i notatka. Pod planem formularz liczy, ile z terminu zostaje na obsługę. Przycisk mówi, co się stanie: **Zarezerwuj 11:00 → 13:00**.

Jeśli klub ma [ścieżkę akceptacji](akceptacja-rezerwacji), stopka formularza mówi przed zapisem, na czyją zgodę rezerwacja zaczeka („Zaczeka na zgodę: Mechanik"). Kroki, na których stoisz sam, przechodzą same. W klubie bez ścieżki rezerwacja potwierdza się od razu.

@panel kalendarz-rezerwacja "Nowa rezerwacja: pasek zajętości doby i sugerowane godziny"

## Gdy ktoś był pierwszy

Termin zajmuje ten, kto zapisze pierwszy - rozstrzyga serwer, nie formularz. Jeśli w czasie wypełniania ktoś zajął te godziny, formularz wraca do kroku z terminem i mówi, co tam stoi i od kiedy („weszła 3 min temu" znaczy, że ktoś był szybszy), a przycisk przy tym zdaniu wstawia **najbliższe wolne miejsce tej samej długości**. Wpisane zadanie, trasa i plan zostają.

Zamknięcie formularza z wpisanymi godzinami albo zadaniem pyta, czy porzucić rezerwację - pusty formularz zamyka się bez pytania.

## Twoja rezerwacja

Karta Twojej rezerwacji ma dwie akcje, jak w aplikacji:

- **Przesuń i popraw** - wraca do formularza z Twoim wpisem; możliwe, dopóki termin się nie zaczął. Poprawka zmienia tylko to, co zmieniłeś. **Inna maszyna to nowa rezerwacja**: zapis zakłada nowy termin i dopiero wtedy odwołuje stary. W klubie ze ścieżką akceptacji **zmiana godzin czyści dotychczasowe zgody** - zgoda dotyczyła konkretnego terminu - i formularz mówi to przed zapisem. Zadanie, trasę i notatkę poprawiasz bez tego.
- **Odwołaj rezerwację** - także taką, która już trwa (nie polecisz, oddajesz termin). Bez pola powodu: to Twój plan i nie ma komu go tłumaczyć. Termin zwalnia się natychmiast. Jeśli lecisz z drugim pilotem, dostaje on wiadomość o odwołaniu. Jeśli rezerwacja czekała na zgodę, osoby z kroku, który miał decydować, dostają wiadomość, że prośba została wycofana. Karta mówi to wszystko nad przyciskiem, zanim go klikniesz.

Rezerwacja odrzucona albo wygasła ma jedno wyjście: **Zarezerwuj inny termin** - zadanie i trasa przechodzą do nowej rezerwacji, termin nie, bo to on przepadł.

@panel kalendarz-wpis "Karta rezerwacji: Twoja, cudza i wyłączenie z użytku"

## Co ma w kalendarzu administrator

Z odpowiednimi uprawnieniami nad osią dochodzą trzy przyciski wyciszone obok **Zarezerwuj**: **Ścieżka akceptacji** (kroki i osoby, [akceptacja rezerwacji](akceptacja-rezerwacji)), **Zarezerwuj za pilota** (rezerwacja na konto innego pilota, bez sugestii - wpisuje się konkretny termin) i **Wyłącz maszynę z użytku** (przegląd albo usterka na wybrane dni). Karta cudzej rezerwacji ma wtedy odwołanie z **wymaganym powodem** - pilot i drugi pilot dostają go w wiadomości i widzą na karcie rezerwacji w aplikacji, razem z Twoim nazwiskiem. Jeśli sam siedzisz w którymś fotelu, wiadomości o własnym odwołaniu nie dostajesz. Kto akceptuje rezerwacje, widzi nad osią baner z liczbą spraw czekających na jego zgodę.

## Dlaczego tak to działa

> **Dlaczego rezerwacja wymaga połączenia.** Termin jest przedmiotem konkurencji: dwóch pilotów chce tej samej soboty, a rozstrzygnąć może tylko ten, kto widzi obu. Zapis bez połączenia mówiłby „zarezerwowane" i odmawiał po powrocie sieci - dlatego panel i aplikacja zapisują od razu na serwerze.

> **Dlaczego godziny są w czasie klubu.** Rezerwacja jest umową między ludźmi o godzinie na lotnisku. Administrator siedzący w innej strefie wpisuje „9:00" i ma to znaczyć dziewiątą na płycie, a nie u niego.

> **Dlaczego kolizja widoczna na pasku nie blokuje.** Pasek pokazuje stan z chwili otwarcia formularza, a ktoś mógł w międzyczasie odwołać rezerwację. Blokada na podstawie starego obrazu zabrałaby wolny termin - rozstrzyga zapis, a przy odmowie formularz mówi, co zrobić dalej.

## Częste problemy

- **Nie widzę przycisku „Zarezerwuj"** → panel otwarty w zakresie platformy, nie klubu - przełącz klub w kolumnie po lewej.
- **Kliknięcie w dzień przy maszynie nic nie robi** → dzień minął, maszyna jest poza służbą albo cały dzień zajmuje wyłączenie z użytku.
- **Maszyny nie da się wybrać z listy** → jest wyłączona ze służby; wraca do listy, gdy administrator przywróci ją w module Samoloty.
- **„Zarezerwuj" jest nieaktywny, choć wszystko wpisane** → maszyna wymaga drugiego pilota (plakietka przy polu) albo brakuje planowanego czasu lotu.
- **Po przesunięciu rezerwacja znowu czeka na zgodę** → tak działa ścieżka akceptacji: zgoda dotyczyła poprzednich godzin.
