# Statystyki

> Ile latał klub w wybranym okresie: sumy w jednym pasku, nalot dzień po dniu i trzy tabele - według samolotów, pilotów i zadań.

Statystyki otwiera uprawnienie **Podgląd klubu** ([kto co widzi](uprawnienia)).

## Wybór okresu

Pola „od → do" i gotowe okresy: **30 dni**, **Ten miesiąc**, **Poprzedni miesiąc**, **Ten sezon** i **Poprzedni sezon**. Sezon to rok kalendarzowy: od 1 stycznia do dziś, a poprzedni sezon - cały ubiegły rok. Wybrany okres zapisuje się w adresie strony.

Pod tytułem stoi, co wchodzi do sum: **operacje zamknięte w wybranym okresie**. Operacje, które jeszcze trwają, są wymienione osobno i nie wchodzą do sum - tak samo jak w [dzienniku](panel-dziennik).

## Sumy

Jeden pasek z ośmioma liczbami: **Operacje**, **Dni lotne** (z ilu dni okresu), **Loty**, **Blok** (czas pracy silnika), **Lot** (czas w powietrzu), **Paliwo** (zużyte według odczytów), **Δ MH** (przyrost motogodzin w godzinach) i **Piloci** - ile osób latało jako dowódca albo drugi pilot.

@panel statystyki "Statystyki: sumy, wykres i tabele"

## Nalot dzień po dniu

Słupek na każdy dzień okresu. Dzień bez lotów ma kreskę przy podstawie. Podpis pod wykresem wskazuje dzień z największym nalotem.

## Trzy tabele

Wszystkie trzy liczą te same operacje - różnią się tylko podziałem. Każda kończy się wierszem **Razem**.

- **Samoloty** - operacje, dni, loty, blok, lot, paliwo, średnie zużycie na godzinę pracy silnika, przyrost motogodzin i **wykorzystanie**, czyli w ilu dniach okresu samolot latał.
- **Piloci** - operacje, loty, blok i lot liczą się dowódcy, jak w książce lotów. Czas w prawym fotelu ma osobną kolumnę **Drugi pilot**. Uczeń, który latał tylko jako drugi pilot, ma zera w nalocie i podpis „tylko jako drugi pilot".
- **Zadania** - Skoki, Przelot, Egzamin, Lot techniczny, Inne: operacje, loty, blok, lot, udział w nalocie floty i samoloty.

> **Uwaga.** Kolumn **Blok** i **Drugi pilot** nie dodaje się do siebie: ta sama godzina lotu szkolnego jest w wierszu instruktora i w wierszu ucznia. Nalot floty to suma kolumny „Blok".

Paliwo bywa kreską, jeśli choć jedna operacja z okresu nie ma odczytu końcowego - suma byłaby wtedy niepełna. Jeśli w okresie nie ma ani jednej zamkniętej operacji, zamiast tabel stoi informacja, żeby zmienić okres.

## Zużycie paliwa samolotu

Ile pali konkretny samolot - jego zmierzone zużycie i porównanie z dokumentacją - znajdziesz w karcie samolotu, w module [Samoloty](panel-samoloty#zuzycie-z-lotow).

## Częste problemy

- **Statystyki i dziennik pokazują różne liczby** → sprawdź, czy okres jest ten sam. Różnicę daje zwykle operacja w toku: dziennik pokazuje ją w wierszu, a statystyki tylko pod tytułem.
- **Pilot ma zera, choć latał** → latał jako drugi pilot. Jego czas jest w kolumnie „Drugi pilot", a nalot dowódcy - w wierszu instruktora.
- **„Żadnej zamkniętej operacji w tym zakresie"** → operacje z tych dni jeszcze trwają albo zostały unieważnione. Zmień okres albo zajrzyj do [dziennika](panel-dziennik).
