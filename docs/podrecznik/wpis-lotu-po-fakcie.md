# Wpis lotu po fakcie

> Lot odbyty bez telefonu wpisuje się w czterech krokach - o to samo, o co pyta zapis automatyczny: data i samolot, zadanie, czasy na osi operacji, liczniki.

@screen 15-reczny-lot "Krok 1 · data i samolot" | 15b-reczny-czasy "Krok 3 · oś operacji" | 15c-reczny-liczniki "Krok 4 · liczniki"

Wejście jest jedno: **DODAJ LOT RĘCZNIE** na ekranie [Mój dzień](moj-dzien) - także wtedy, gdy dzień jest jeszcze pusty. Ekran nazywa się „Lot ręczny" i prowadzi przez cztery kroki; ostatni kończy przycisk **ZAPISZ LOT**.

## Krok 1 · data, samolot, załoga

Data jest pierwszym pytaniem - kalendarz miesięczny ze skrótami **Wczoraj** i **Dzisiaj**, bez dni przyszłych. Doba liczy się od uruchomienia silnika w czasie UTC, a zmiana daty przesuwa razem z nią wpisane już godziny. Samolot wybiera się z listy floty klubu; drugi pilot (Dual) jest opcjonalny, chyba że maszyna wymaga załogi dwuosobowej - wtedy powód blokady stoi w przycisku **DALEJ**.

## Krok 2 · zadanie

Rodzaj operacji, lotniska, klient i notatka - te same pola, co przy rozpoczęciu lotu. **Trasa jest tu wymagana**: przy skokach jedno lotnisko, przy pozostałych operacjach para skąd → dokąd. Klient i notatka są opcjonalne i mówi to plakietka przy ich nagłówkach.

> **Dlaczego tak.** Przy rozpoczęciu lotu trasę wolno zostawić pustą, bo start silnika ma trwać sekundy. Wpis po fakcie opisuje lot, który **już się odbył** - „jeszcze nie wiem, dokąd" tu nie istnieje.

@screen 15a-reczny-zadanie "Krok 2 · zadanie" | 15e-reczny-data "Kalendarz daty lotu"

## Krok 3 · przebieg operacji

Oś zaczyna się od dwóch pustych wierszy: **uruchomienie** i **wyłączenie** silnika. Tapnięcie w wiersz otwiera arkusz godziny - wpis z klawiatury (kropka i przecinek znaczą dwukropek, więc `8.30` to `08:30`) albo przyciski ±1 min; przy etykiecie stoi czas lokalny.

- **DODAJ LOT** pojawia się dopiero wtedy, gdy oba końce biegu mają godzinę. Pierwszy lot dostaje granice całego biegu, każdy kolejny zaczyna się od ostatniego lądowania.
- **Kręgi (touch and go)** wpisuje się liczbą przy lądowaniu, a podpis mówi, ile z tego wychodzi lądowań. Nie trzeba wpisywać pięciu par godzin.
- **Zrzuty** (dzień skokowy) stoją między startem a lądowaniem swojego lotu i noszą jego numer; kolejny dziedziczy skład i wysokość po poprzednim. Zrzut poza wszystkimi lotami dostaje ostrzeżenie - popraw godzinę albo dopisz lot, w którym się odbył.
- **Stopka z sumami Loty · Blok · Lot** liczy się na żywo.

Bieg bez ani jednego lotu (uruchomiłem, wyłączyłem, nie poleciałem) da się zapisać - ekran tylko ostrzega. Tak samo dzień skokowy bez zrzutu: składu i wysokości wyniesienia nie odtworzy nikt poza pilotem, który leciał.

> **Dlaczego tak.** Kręgi to jedna liczba, a nie pięć wymyślonych par godzin: rozdzielone na równe odcinki wyglądałyby na osi jak zapisane fakty. To świadoma cena - ten sam dzień zapisany automatem da pięć lotów, a skrótem jeden lot i pięć lądowań.

## Krok 4 · liczniki

- **Paliwo to trzy liczby**: zastane, dolane, po locie. Godzin się nie podaje - wynikają z chwili uruchomienia i wyłączenia silnika, a dolewkę zapisuje się przy zatrzymanym śmigle.
- **Motogodziny** z obu stron biegu: przed uruchomieniem i po locie.
- **Olej** jest tu opcjonalny (inaczej niż przy przejęciu na żywo): pomiar z bagnetu i ewentualna dolewka.
- **Zastane paliwo i licznik podpowiada operacja poprzedzająca** na tej maszynie - z podpisem, skąd liczba pochodzi (`z poprzedniego lotu · AKO`). Podpowiedź można nadpisać, a odczytów po locie nie podpowiada nic: to na nie odpowiadasz.
- **Karty pokazują werdykt wobec normy** maszyny od razu; tapnięcie w plakietkę otwiera rachunek. Więcej: [norma zużycia](norma-zuzycia).

## Co blokuje, a co tylko ostrzega

| Blokuje (z powodem w przycisku) | Ostrzega (można zapisać) |
|---|---|
| lądowanie przed startem, loty nachodzące na siebie | bieg bez lotu, dzień skokowy bez zrzutu |
| lot wypadający poza biegiem silnika | zrzut poza wszystkimi lotami |
| cofnięty licznik motogodzin | rozjazd odczytów z sąsiednią operacją tej maszyny |
| paliwa po locie więcej niż zastane plus dolane | zużycie poza normą maszyny |
| stan ponad pojemność zbiorników | nakładanie się czasów z Twoją inną operacją |

## Jak to działa

Wpis nie jest osobnym rodzajem dokumentu - aplikacja składa z niego dokładnie takie same zapisy, jakie powstałyby w kokpicie: przejęcie z odczytami, tankowanie, uruchomienie, każdy start i lądowanie, zrzuty, wyłączenie i zdanie samolotu. Cały przebieg sprawdzany jest **w całości przed zapisem** - albo zapisuje się wszystko, albo nic - i dlatego blokada mówi o problemie już w formularzu, zamiast odmówić po tapnięciu w **ZAPISZ LOT**. Ostrzeżenia liczą się bez sieci: kolizje z Twoimi własnymi operacjami biorą się z zapisu na telefonie, a łańcuch paliwa i licznika z kopii z ostatniego połączenia, z adnotacją o jej wieku. Połączenia potrzebuje jedno: podpowiedź „z poprzedniego lotu", bo pyta klub o sąsiada tej maszyny w tej konkretnej chwili. Gotowa operacja niesie plakietkę **RĘCZNIE** na kafelku i w nagłówku [ekranu operacji](operacja-i-korekty).

> **Założenie.** Ostrzeżenia nigdy nie blokują zapisu. Pilot wpisujący lot z kartki tydzień później często ma dane niepełne, a lot z jedną niepewną liczbą jest wart więcej niż lot, którego w dokumentacji nie ma wcale.

> **Uwaga.** Wstecz z pierwszego kroku przy wypełnionym formularzu pyta o rezygnację i czyści szkic; z kolejnych cofa o jeden krok. Przycisk sprzętowy i gest cofania robią to samo, co strzałka w nagłówku.

## Częste problemy

- **DALEJ jest nieaktywne** → powód stoi w samym przycisku i zmienia się z krokiem: wybierz samolot albo drugiego pilota, wskaż lotnisko, wpisz godziny biegu, uzupełnij odczyty.
- **Nie widzę DODAJ LOT** → oba końce biegu silnika muszą mieć godzinę. To brak akcji, nie wyszarzony przycisk.
- **Pole „Zastane" jest puste i nic nie podpowiada** → telefon nie miał połączenia albo to pierwszy lot tej maszyny. Wpisz to, co pokazywały przyrządy; zgadywanie zepsułoby [łańcuch odczytów](lancuch-odczytow) następnemu pilotowi.
- **Ostrzeżenie „nie zgadza się z następnym lotem"** → wpis nie pasuje do sąsiedniej operacji tej maszyny. Jeśli tak pokazywały przyrządy - zapisz; rozstrzygnie klub.
- **„Czasy zachodzą na Twoją operację…"** → według zapisu byłeś wtedy na innej maszynie. Popraw godziny albo zapisz świadomie, jeśli błędny jest tamten wpis.
- **Zapisałem lot, którego nie było** → otwórz operację, **EDYTUJ DANE**, usunięcie całego wpisu na dole ekranu.
