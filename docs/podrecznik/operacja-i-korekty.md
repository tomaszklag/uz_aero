# Ekran operacji i korekty

> Każda operacja ma swój ekran: oś zdarzeń, ślad, rachunek paliwa i motogodzin wobec normy maszyny. Przez 24 godziny od zdania pilot poprawia własne wpisy; potem decyduje klub.

@screen 10-statystyki "Ekran operacji"

## Jak tu wejść

- **Kafelkiem operacji** na ekranie [Mój dzień](moj-dzien) albo w [poprzednich dniach](poprzednie-dni).
- **Z kokpitu, po zatrzymaniu silnika** - kafelkiem **Popraw dane operacji**. To jedyne wejście przed zdaniem samolotu i wraca stamtąd do kokpitu, bo maszyna zostaje w Twoich rękach.

Nagłówek nosi **sygnaturę** operacji, np. `SP-AXA/2026-09-05/TMK/1` - znak samolotu, doba UTC, kod pilota i numer operacji w Twojej dobie. Tak nazywa się tę operację w aplikacji, w panelu klubu i w rozmowie z administratorem. Obok sygnatury stoi plakietka trybu albo pochodzenia wpisu: **RĘCZNIE**, **EDYCJA**, **Podgląd**.

## Co zawiera

- **Baner okna korekty** na samej górze: do zdania samolotu poprawiasz bez limitu, po zdaniu masz 24 godziny (z podaną godziną, do której), a po oknie stoi tu bursztynowa informacja, że korektę wprowadza już administrator.
- **Przebieg operacji** - miniatura śladu (wejście w [pełny ślad](slad-gps)) i pod nią oś zdarzeń: przejęcie z odczytami paliwa, licznika i oleju, tankowania i dolewki oleju, uruchomienie, kołowanie, każdy start i lądowanie z czasem lotu, zrzuty, wyłączenie, zdanie. Stopka sumuje blok, czas lotu, starty i podaje lotnisko.
- **Paliwo, Motogodziny, Olej** - rachunek operacji: odczyt przy przejęciu, dolane, odczyt przy zdaniu, zużycie. Plakietka werdyktu mówi, czy zużycie mieści się w [normie maszyny](norma-zuzycia); tapnięcie otwiera arkusz „jak to policzone". Olej jest bez werdyktu - mierzy się go od pomiaru do pomiaru, więc zużycia jednej operacji nie da się policzyć.
- **Zrzuty** (dzień skokowy) - wyniesienia i liczba skoczków, typy skoków, średnia wysokość i klient.
- **Załoga** - dowódca i drugi pilot.
- **Notatki** - notatka z zadania i uwagi wpisów po fakcie; karta istnieje tylko wtedy, gdy coś w niej jest.

## Okno korekty: 24 godziny od zdania

Przycisk **EDYTUJ DANE** przełącza ten sam ekran w tryb edycji: każdy wiersz osi staje się celem dotknięcia z ołówkiem, na końcu osi dochodzi **DODAJ WPIS**, a na górze - wykryte niespójności („Lot 2 nie ma lądowania", „Zrzut zapisany na ziemi") z podpowiedzią, czym je naprawić. Ostrzegają, nigdy nie blokują. Wyjście z trybu to **ZAKOŃCZ EDYCJĘ**.

@screen 10d-edycja "Tryb edycji" | 10e-korekta-zdarzenia "Arkusz korekty czasu" | 10f-korekta-odczytu "Korekta odczytów"

| Co poprawiasz | Jak |
|---|---|
| uruchomienie, kołowanie, start, lądowanie, wyłączenie | godzina (co minutę albo z klawiatury) oraz „tego nie było" |
| odczyty przy przejęciu i zdaniu | paliwo i motogodziny; przy przejęciu także olej |
| zrzut | godzina i skład; wysokość zostaje odczytem z GPS |
| godzina przejęcia | w tył to zwykła poprawka; w przód, za uruchomienie silnika, przesuwa cały bieg - ekran zapowiada to przed zapisem |
| notatka, drugi pilot | ten sam arkusz, w którym powstały; drugi pilot zmienia się dla całej operacji wstecz |
| tankowanie, dolewka oleju | przez unieważnienie i dopisanie na nowo - to trójka liczb, która musi się zgadzać |
| brakujący fakt | **DODAJ WPIS**: start, lądowanie, kołowanie, tankowanie, dolewka oleju, a w dniu skokowym także zrzut i załadunek |

Powód korekty jest opcjonalny, ale to jedyne, z czego administrator dowie się, dlaczego liczba się zmieniła. Dowódcy nie da się zmienić w ogóle - to zdanie samolotu i nowe przejęcie, nie korekta.

@screen 10g-korekta-zrzutu "Korekta zrzutu" | 10h-dodaj-wpis "Dopisanie brakującego faktu" | 10j-korekta-zalogi "Zmiana drugiego pilota"

## Historia zmian

Poprawiona wartość nosi plakietkę **popr.** - w obu trybach, także w podglądzie po oknie. Tapnięcie otwiera historię: kiedy, co było i co jest, kto zmienił (Ty albo administrator) i z jakim powodem. Zapis się dopisuje, nie nadpisuje - pierwotna wartość zostaje w dokumentacji klubu.

@screen 10i-historia-zmian "Kolejne wersje wartości" | 10k-korekta-notatki "Notatka z wejściem w historię"

## Usunięcie całego wpisu

Na samym dole trybu edycji, za wszystkim, stoi obramowany czerwony **USUŃ CAŁY WPIS**. Arkusz nazywa konkretną operację - sygnatura, godziny biegu silnika, Loty · Blok · Lot - i pyta o potwierdzenie; powód jest opcjonalny. Operacja przestaje się liczyć: wypada z Twojego dnia, z historii i z sum, przestaje trzymać samolot jako zajęty i nie jest już ogniwem łańcucha odczytów. Jej zapis zostaje w dokumentacji i widzi go administrator.

@screen 10l-usun-sesje "Potwierdzenie usunięcia wpisu"

## Jak to działa

Ekran nie przechowuje żadnych liczb - przelicza je za każdym razem z zapisu na telefonie, dlatego działa bez sieci i pokazuje skutek poprawki natychmiast. Korekta nie zmienia istniejącego wpisu: dopisuje obok niego nowy, z autorem, godziną i powodem, a ekran pokazuje wartość aktualną. Twarde reguły obowiązują tu tak samo, jak w kokpicie - wyłączenie przed uruchomieniem, cofnięty licznik czy paliwo, którego przybyło bez dolewki, są odmawiane z powodem przy przycisku. Wszystko, co jest tylko oceną danych - werdykt normy, rozjazd z sąsiednią operacją - ostrzega. Decyzje administratora (zakończenie operacji, unieważnienie wpisu) wracają na telefon przy najbliższym połączeniu i widać je na tym samym ekranie. Mechanizm w całości: [korekty i rejestr](korekty-i-rejestr).

> **Dlaczego tak.** Okno liczy się od zdania samolotu, bo to ono zatwierdza log operacji. Z tego samego powodu godziny zdania nie da się poprawić - przesuwałaby własny termin - a samego zdania unieważnić: rozbiłoby operację w pół i zabrało następnemu pilotowi przekazanie.

> **Założenie.** W trybie odczytu na osi nie ma ani jednego ołówka. Korekta ma jedne drzwi - **EDYTUJ DANE** - a kilkanaście identycznych celów w jednej kolumnie czytałoby się jak szum. Jedynym celem dotknięcia w tym trybie jest plakietka **popr.**, bo historia zmian niczego nie zapisuje.

## Częste problemy

- **Nie ma przycisku EDYTUJ DANE** → minęły 24 godziny od zdania albo operację zakończył administrator. Ekran jest wtedy podglądem; poprawkę zgłoś w klubie. Arkusz normy i historia zmian otwierają się nadal.
- **Poprawiłem godzinę przejęcia i przesunął się cały bieg** → tak działa przesunięcie w przód, za uruchomienie silnika: czasy trwania zostają, przesuwa się wszystko. Ekran mówi o tym przed zapisem, a bieg, który wyszedłby poza zdanie samolotu, jest odmawiany z powodem.
- **Zniknął werdykt normy** → log ma niespójność (np. lot bez lądowania). Napraw ją - werdykt wróci sam, gdy rachunek znów będzie miał komplet danych.
- **Chcę poprawić tankowanie** → tankowania nie zmienia się w miejscu: unieważnij wpis na osi i dopisz go jeszcze raz przez **DODAJ WPIS**, bo stan przed, dolane i stan po muszą się zgadzać.
- **Usunąłem wpis przez pomyłkę** → zapis nie zniknął z dokumentacji, tylko przestał się liczyć. Zgłoś to administratorowi.
