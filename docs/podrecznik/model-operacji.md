# Operacja, lot i doba pilota

> Operacja to jeden bieg silnika od przejęcia do zdania samolotu, lot to odcinek od startu do lądowania, a dzień pilota to lista operacji z jednej doby UTC - bez otwierania i zamykania czegokolwiek.

## Operacja = jeden bieg silnika

Operacja zaczyna się przejęciem samolotu (ROZPOCZNIJ LOT z odczytami paliwa, motogodzin i oleju) i kończy zdaniem (ZDAJ SAMOLOT z odczytami paliwa i motogodzin). W środku jest dokładnie jeden bieg silnika: START ENGINE → STOP ENGINE. Tankowanie mieści się w operacji przy zatrzymanym śmigle - przed uruchomieniem i po zatrzymaniu; drugiego pilota zmienia się tylko przed uruchomieniem, dowódcy nie zmienia się wcale.

@screen 02a-preflight "Odczyty przy przejęciu" | 05-cockpit-running "Bieg silnika w kokpicie" | 09b-zdaj-samolot "Odczyty przy zdaniu"

> **Założenie.** Operacja jest jednostką wszystkiego: zapisu, zatwierdzenia (zdanie), korekty (24 godziny od zdania), rozliczenia paliwa i motogodzin oraz wiersza w dzienniku klubu. Każda ma odczyty z obu stron, więc [łańcuch odczytów](lancuch-odczytow) i [norma zużycia](norma-zuzycia) mają z czego liczyć.

## Lot = od startu do lądowania

W jednej operacji może być wiele lotów: aplikacja wykrywa je z GPS, a każdy krąg z touch and go daje własną parę start → lądowanie. We wpisie lotu po fakcie kręgi podaje się liczbą przy lądowaniu. Trójka **Loty · Blok · Lot** na kafelku to liczba lotów, czas blokowy (od uruchomienia do wyłączenia silnika) i czas lotu (suma czasu w powietrzu).

@screen 10-statystyki "Loty na osi operacji"

## Po STOP ENGINE nie ma drugiego startu

Po zatrzymaniu silnika głównym przyciskiem kokpitu staje się **ZDAJ SAMOLOT**. Kolejny lot tą samą maszyną to nowe przejęcie - trzy kroki rozpoczęcia lotu z wartościami z Twojego zdania już wpisanymi. Z kokpitu nie ma wyjścia bokiem: maszynę oddaje się wyłącznie przez zdanie ([kokpit](kokpit)).

@screen 04-cockpit-ground "Hero ZDAJ SAMOLOT po zatrzymaniu"

> **Dlaczego tak.** Dzień skokowy to jeden bieg silnika z 8–12 lotami, czyli jedno przejęcie i jeden odczyt na końcu - nikt nie chodzi do licznika po każdym wyniesieniu. Drugi start w tej samej operacji rozbiłby ją na cykle bez odczytów pomiędzy, a odczyt na obu końcach każdej operacji daje ciągłość liczników i uczciwy rachunek zużycia.

## Doba pilota w UTC

Do pilota w danej dobie UTC przypisana jest lista operacji - i nic ponadto. Operacje na różnych maszynach leżą na jednej liście Mój dzień w kolejności czasu, a sumy doby to ta sama trójka. Operacja należy do doby, w której uruchomiono silnik (zapis bez biegu - do doby przejęcia), więc operacja z późnego wieczoru może stać pod inną datą niż w kalendarzu na ścianie. Po północy UTC operacje przechodzą do [poprzednich dni](poprzednie-dni).

@screen 01-moj-dzien "Lista operacji jednej doby" | 12-historia "Operacje spoza dzisiejszej doby"

> **Dlaczego nie ma „dnia służby".** Czas od meldunku do zamknięcia niczego nie mierzył, a wymagał deklaracji godziny, przycisku „Zamknij dzień" i osobnych reguł. Dzień zaczyna się pierwszą operacją i niczym się nie domyka; zdanie samolotu nie kończy dnia.

## Sygnatura operacji

Operacja ma nazwę, którą da się przeczytać przez telefon i wpisać w zgłoszenie: `SP-AXA/2026-09-05/TMK/1` - znak samolotu, doba UTC, kod dowódcy, numer operacji tego pilota w tej dobie. To ten sam numer, który Mój dzień pisze jako „OPERACJA 1". Sygnatura stoi na kafelkach, w nagłówku ekranu operacji, w pasku kokpitu po uruchomieniu silnika i w dzienniku panelu.

- **Liczy się przy każdym wyświetleniu**, jak czas blokowy: wpis po fakcie dopisany przed istniejącą operacją tej doby przenumerowuje ją, a numer zapisany na stałe wskazywałby po tym dwie operacje naraz.
- **Nie ma w niej godziny**: korekta czasu przesuwa uruchomienie o kilka minut, a sygnatura z godziną opisywałaby po korekcie inną operację niż przed.
- **Numeruje dobę pilota, nie samolotu**: telefon zna wszystkie operacje swojego pilota, a cudzych na tej maszynie nie ma - dlatego nazwa powstaje bez sieci. Jednoznaczność zapewnia kod pilota w środku.

## Zdanie bez lotu i puste zdania

Gdy silnik nie ruszył (pogoda, usterka, próba), samolot zdaje się w wariancie **bez lotu**: powód z listy i opcjonalny komentarz dla administratora.

| Zapis bez biegu silnika | Co się dzieje |
|---|---|
| zmieniony odczyt paliwa albo licznika, dolewka paliwa lub oleju | pełnoprawna operacja: numer, sygnatura, kafelek z godzinami zajęcia maszyny i trójką 0 · 0:00 · 0:00 |
| nic się nie zmieniło | pusty zapis: nie pokazuje go Mój dzień, Poprzednie dni, dziennik panelu ani karta dnia |

@screen 09c-zdaj-bez-lotu "Powód zdania bez lotu" | 10a-statystyki-zero "Rozliczenie bez ani jednego lotu"

> **Uwaga.** Ekran zdania ostrzega przed pustym zapisem („nic się nie zmieniło, więc nic nie zostanie zapisane"), ale nigdy nie blokuje - samolot trzeba oddać. Zapis zostaje w rejestrze, tylko nie liczy się do żadnej listy.

## Jak operacja trafia do klubu

Zdanie samolotu zatwierdza log operacji - niczego nie potwierdza się drugi raz. Zapis czeka w kolejce wysyłki i wychodzi, gdy tylko jest sieć; w panelu operacja pojawia się w [dzienniku](panel-dziennik): flota → maszyna → operacja z osią zdarzeń.

Po stronie klubu składa się też **karta dnia maszyny** - dokument jednej doby jednego samolotu, np. `2026-09-05_SP-AXA`. Operacje są jej wierszami (zmiany `S1`, `S2`… z kolumną Zadanie), dalej idą tabele lotów, paliwa, motogodzin i zrzutów. Kartę wyzwala zdanie i przebudowuje się ją przy każdym kolejnym zdaniu tej maszyny w tej dobie; operacja niezdana stoi w niej jako „w toku". Sygnatury w karcie nie ma: karta numeruje zmiany w dobie samolotu, sygnatura - operacje w dobie pilota.

> **Dlaczego karta jest dobą samolotu, a nie operacją.** Klub czyta dzień per samolot, nie per zmianę pilota - w typowym dniu skokowym jedną maszyną lata dwóch pilotów. Operacje unieważnione i puste do karty nie wchodzą.
