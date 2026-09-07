# Korekty, historia zmian i rejestr, który nic nie gubi

> Rejestr UZ Aero dopisuje, nigdy nie nadpisuje: korekta to nowy wpis obok starego, z autorem, godziną i powodem. Pilot poprawia własne zapisy przez 24 godziny od zdania samolotu, a administratora nie ogranicza żadne okno - twarde reguły obowiązują obu tak samo.

## Rejestr dopisuje, nie nadpisuje

Poprawiona godzina lądowania nie zastępuje tej, którą wykrył GPS - staje obok niej jako nowy wpis. Ekran pokazuje wartość aktualną z plakietką **popr.**, także w podglądzie po oknie. Tapnięcie w plakietkę otwiera historię zmian: od najnowszej do zapisu pierwotnego, każda jako para „było → jest", z autorem (Ty albo administrator), godziną i powodem - albo adnotacją „bez powodu". Unieważnienie zdarzenia („tego lądowania nie było") jest takim samym wpisem i kolejna poprawka może je przywrócić.

@screen 10i-historia-zmian "Kolejne wersje jednej wartości"

> **Założenie.** Dlaczego nic nie ginie. Dziennik lotów jest dokumentem klubu: administrator ma widzieć nie tylko, ile wynosi liczba, ale też że ktoś ją zmienił, kiedy i dlaczego. Wartość nadpisana nie zostawia śladu; dopisana zostawia całą drogę do siebie.

## Okno korekty: 24 godziny od zdania

Zdanie samolotu z odczytami zatwierdza log operacji. Od tej chwili przez dobę **EDYTUJ DANE** na ekranie operacji włącza tryb edycji: ołówek przy każdym wierszu osi, **DODAJ WPIS** na jej końcu, a na górze wykryte niespójności (lot bez lądowania, zrzut zapisany na ziemi) z podpowiedzią, czym je naprawić - ostrzegają, nie blokują. Przed zdaniem to samo robi kafelek **Popraw dane operacji** w kokpicie, bo log trzeba móc naprawić, zanim zdanie go zatwierdzi. Krok po kroku: [ekran operacji i korekty](operacja-i-korekty).

Po oknie ekran otwiera się w podglądzie: bez **EDYTUJ DANE**, z banerem „Minęły 24 godziny od zdania samolotu". Historia zmian i arkusz normy nadal się otwierają - zamknięte okno odbiera prawo do zmiany danych, nie do ich zrozumienia. Poprawkę wprowadza wtedy administrator, więc zgłoś ją klubowi. Zakończenie operacji przez administratora zamyka okno od razu.

@screen 10d-edycja "Tryb edycji z ołówkami" | 10b-rozliczenie-zamkniete "Podgląd po oknie"

> **Dlaczego tak.** Okno liczy się od zdania, bo zdanie jest chwilą zatwierdzenia. Dlatego godziny zdania nie da się poprawić (przesuwałoby to własny termin), a samego zdania unieważnić - rozbiłoby operację w pół i zabrało następnemu pilotowi przekazanie.

## Co wolno poprawić i jak

| Co | Jak |
|---|---|
| uruchomienie, kołowanie, start, lądowanie, wyłączenie | godzina (co minutę albo z klawiatury) lub „tego nie było" |
| odczyty przy przejęciu i zdaniu | paliwo i motogodziny; przy przejęciu także olej |
| godzina przejęcia | w tył zwykła poprawka; w przód, za uruchomienie, przesuwa cały bieg (czasy trwania bez zmian) - ekran zapowiada to przed zapisem i odmawia, gdy bieg wyszedłby poza zdanie |
| zrzut | godzina i skład; wysokość zostaje z GPS |
| tankowanie, dolewka oleju | unieważnienie i dopisanie na nowo - to trzy liczby, które muszą się zgadzać |
| notatka, drugi pilot | ten sam arkusz, w którym powstały; pusta notatka znika, drugi pilot zmienia się dla całej operacji wstecz |
| brakujący fakt | **DODAJ WPIS**: start, lądowanie, kołowanie, zrzut, załadunek, tankowanie |

Powód korekty jest u pilota opcjonalny: wymagany byłby tarciem, a bez niego administrator patrzący na zmienioną liczbę nie ma jak dowiedzieć się dlaczego. Trafia do historii zmian i do panelu.

@screen 10e-korekta-zdarzenia "Korekta czasu zdarzenia" | 10f-korekta-odczytu "Korekta odczytów" | 10h-dodaj-wpis "Dopisanie brakującego faktu"

## Czego nie da się zmienić

- **Dowódcy** - inny dowódca to zdanie samolotu i nowe przejęcie, nie korekta.
- **Godziny zdania i faktu zdania** - patrz wyżej.
- **Wysokości zrzutu** - to odczyt z GPS.
- **Uruchomienia i wyłączenia silnika przez DODAJ WPIS** - zapisuje je kokpit; poprawić można tylko ich godzinę.

## Twarde reguły - te same dla pilota i administratora

Są zapisy, których rejestr nie przyjmie od nikogo: wyłączenie silnika przed uruchomieniem, cofnięty licznik motogodzin, paliwo, którego przybyło bez dolewki (ponad tolerancję przyrządu), odczyt ponad pojemność zbiorników, dolewka przy pracującym silniku, bieg przesunięty poza zdanie. Aplikacja i panel mówią wtedy powód przy przycisku i nie zapisują nic. Wszystko, co jest oceną danych - werdykt normy, rozjazd z sąsiednią operacją - ostrzega, nigdy nie blokuje: paliwomierz i licznik mają rację.

@screen 15g-reczny-czas-kolejnosc "Powód blokady w przycisku"

## Usunięcie całego wpisu

Na samym dole trybu edycji stoi obramowany czerwony **USUŃ CAŁY WPIS**. Arkusz nazywa operację (sygnatura, bieg silnika, Loty · blok · lot), pyta o opcjonalny powód i mówi: „Wpis zniknie z Twojego dnia, z historii i z sum. Zapis zostaje w rejestrze i widzi go administrator". Unieważniona operacja przestaje się liczyć, nie trzyma samolotu jako zajętego i nie jest ogniwem łańcucha odczytów.

@screen 10l-usun-sesje "Potwierdzenie usunięcia wpisu"

## Co może administrator

Administratora nie ogranicza okno korekty: kolizja z operacją w toku albo z otwartym oknem pilota jest dla niego ostrzeżeniem, nie odmową. W tym wydaniu ma w [dzienniku](panel-dziennik) i na [karcie samolotu](panel-samoloty) trzy narzędzia:

- **Zakończenie operacji**, której pilot nie zdał (telefon padł, został w kabinie) - z powodem, bez odczytów, opcjonalnie z unieważnieniem w tym samym ruchu. Operacja liczy się do nalotu, ale nie staje się przekazaniem, a telefon nie wyśle już jej zdania: pilot dostaje na Mój dzień baner z przyciskiem **ROZUMIEM**.
- **Unieważnienie wpisu** - z powodem WYMAGANYM, inaczej niż u pilota: pilot wycofuje własny lot, administrator cudzy.
- **Poprawa odczytów maszyny** na karcie samolotu, z wymaganym komentarzem. Staje się przekazaniem dla następnego pilota, ale nie zmienia ani jednego zapisu operacji.

Każda z tych decyzji wraca na telefon pilota przy najbliższym połączeniu. Poprawek pojedynczych zdarzeń - godziny startu, odczytu paliwa, składu zrzutu - administrator z panelu dziś nie wprowadza: robi to pilot w swoim oknie, a po nim błąd zgłasza się do klubu i zostaje w dokumentacji jako fakt. Ekran korekt wraca w kolejnym wydaniu panelu.

> **Dlaczego tak.** Administrator nie jest nigdy blokowany, bo to on odpowiada za dziennik i rozstrzyga, gdy pilot już nie może. Zamiast odmowy dostaje ostrzeżenie - a rejestr i tak zapamięta, kto i kiedy zmienił liczbę.
