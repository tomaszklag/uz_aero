# Kalendarz w panelu

> Plan floty na dni dla każdego członka klubu: kto ma który samolot i kiedy, które samoloty są w serwisie, a także własna rezerwacja - zakładana tak samo jak w aplikacji.

## Plan floty

Wiersz na każdy samolot klubu, kolumna na każdy dzień wybranego okresu: **Ten tydzień**, **Dwa tygodnie** albo **Miesiąc**. W komórce stoją paski rezerwacji tego samolotu w tym dniu - z nazwiskiem pilota - oraz wyłączenia z użytku z powodem, na przykład „Przegląd 100 h".

| Wygląd paska | Znaczenie |
|---|---|
| zwykły | rezerwacja innego pilota |
| **zielony** | **Twoja** rezerwacja |
| przerywana ramka | rezerwacja czeka na zgodę - termin jest już zajęty |
| napis „Zlecenie · szuka załogi" | zlecenie lotu, w którym brakuje jeszcze pilota |
| bursztynowe ukośne pasy | samolot wyłączony z użytku (przegląd, usterka) |

Samolot poza służbą zostaje w planie z podpisem „poza służbą". Kliknięcie w pasek otwiera z boku jego kartę. Szczegóły cudzej rezerwacji - zadanie, trasę, notatkę - widzą tylko osoby z odpowiednimi uprawnieniami ([kto co widzi](uprawnienia)).

@panel kalendarz-flota "Plan floty na tydzień"

## Jak zarezerwować samolot

Rezerwację zaczniesz na dwa sposoby: przyciskiem **Zarezerwuj** nad planem albo kliknięciem w wolne miejsce przy samolocie w danym dniu - wtedy samolot i dzień będą już wybrane. Jeśli możesz zlecać loty, kliknięcie w wolne miejsce zapyta: **Zarezerwuj** czy **Zleć lot**.

Formularz ma dwa kroki, tak jak w aplikacji:

1. **Termin i samolot.** Wybierz samolot i dzień. Pod nimi widać pasek zajętości samolotu w tym dniu, od świtu do zmroku, z wolnymi godzinami. **Sugerowane godziny** proponują terminy, które najlepiej wypełniają dzień, z krótkim wyjaśnieniem - na przykład „tuż przed rezerwacją · A. Kowalski". Godziny wpisujesz w czasie klubu. Jeśli nachodzą na inną rezerwację, pod nimi pojawi się ostrzeżenie.
2. **Zadanie.** Rodzaj operacji, trasa, drugi pilot (wymagany, gdy samolot ma załogę dwuosobową), planowany czas lotu, paliwo i notatka. Przycisk mówi, co się stanie, na przykład **Zarezerwuj 11:00 → 13:00**.

Jeśli klub wymaga zgody na rezerwację, pod formularzem stoi, na czyją zgodę rezerwacja poczeka ([akceptacja rezerwacji](akceptacja-rezerwacji)).

@panel kalendarz-rezerwacja "Nowa rezerwacja z sugerowanymi godzinami"

Jeśli ktoś zajmie ten termin, zanim zapiszesz, formularz wróci do pierwszego kroku z informacją, co tam stoi. Przycisk obok wstawi najbliższy wolny termin tej samej długości, a zadanie i plan zostaną.

## Twoja rezerwacja

Karta Twojej rezerwacji ma dwie akcje:

- **Przesuń i popraw** - otwiera formularz z Twoim wpisem, dopóki termin się nie zaczął. Zmiana samolotu tworzy nową rezerwację. Jeśli klub wymaga zgody, zmiana godzin zaczyna akceptację od nowa - formularz mówi o tym przed zapisem.
- **Odwołaj rezerwację** - także taką, która już trwa. Drugi pilot dostanie wiadomość, a jeśli rezerwacja czekała na zgodę - osoby, które miały decydować, dostaną informację, że prośba została wycofana.

Rezerwacja odrzucona albo wygasła ma jedną akcję: **Zarezerwuj inny termin**. Zadanie i trasa przejdą do nowej rezerwacji.

@panel kalendarz-wpis "Karta rezerwacji"

## Zlecenie w kalendarzu

Zlecenie lotu stoi w planie jak rezerwacja, z napisem, kogo jeszcze brakuje. Kliknięcie otwiera jego kartę: osoba zlecająca może przejść do zlecenia albo je odwołać, a pilot przydzielony do fotela - otworzyć rozmowę albo zrezygnować. Więcej: [zlecenia w panelu](panel-zlecenia).

## Co mają osoby z dodatkowymi uprawnieniami

Nad planem mogą stać dodatkowe przyciski:

- **Ścieżka akceptacji** - kroki i osoby, które zatwierdzają rezerwacje (uprawnienie „Konta i kod klubu"),
- **Zarezerwuj za pilota** - rezerwacja na konto innego pilota (uprawnienie „Cudze rezerwacje"),
- **Wyłącz maszynę z użytku** - przegląd albo usterka na wybrane dni (uprawnienie „Flota"),
- **Zleć lot** - nowe zlecenie lotu (uprawnienie „Zlecanie lotów").

Osoba z uprawnieniem „Cudze rezerwacje" może też odwołać cudzą rezerwację - z wymaganym powodem. Pilot i drugi pilot dostaną wiadomość z tym powodem i nazwiskiem osoby, która odwołała. Kto akceptuje rezerwacje, widzi nad planem komunikat z liczbą spraw czekających na jego zgodę i przycisk **Rozpatrz**.

## Częste problemy

- **Nie ma przycisku „Zarezerwuj"** → panel jest otwarty w trybie opiekuna platformy, nie klubu. Przełącz klub w kolumnie po lewej.
- **Kliknięcie w dzień przy samolocie nic nie robi** → dzień minął, samolot jest poza służbą albo cały dzień zajmuje wyłączenie z użytku.
- **Samolotu nie da się wybrać** → jest poza służbą. Wróci, gdy administrator przywróci go w module Samoloty.
- **„Zarezerwuj" jest nieaktywny** → samolot wymaga drugiego pilota albo brakuje planowanego czasu lotu.
- **Po przesunięciu rezerwacja znowu czeka na zgodę** → tak ma być: zgoda dotyczyła poprzednich godzin.
