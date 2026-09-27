# Statystyki

> Ile latał klub w wybranym zakresie dat: sumy w jednym pasku, nalot dzień po dniu i trzy tabele tego samego zbioru operacji - samoloty, piloci, zadania - każda z wierszem „Razem". Ta sama podstawa liczenia, co w dzienniku: operacje zamknięte.

## Zakres dat

Para pól „od → do" i szybkie zakresy: **30 dni**, **Ten miesiąc**, **Poprzedni miesiąc**, **Ten sezon**, **Poprzedni sezon**. Sezon liczy się jak rok kalendarzowy - od 1 stycznia do dziś, a poprzedni to cały ubiegły rok - bo tak rozlicza się nalot roczny. Zakres jedzie w adresie zawsze, także domyślny, więc link wklejony koledze pokazuje te same liczby.

Podtytuł strony nazywa podstawę liczenia: **operacje zamknięte w zakresie**, a obok liczbę operacji **w toku poza sumami**. Operacja, której pilot jeszcze nie zdał, nie dokłada się do nalotu na żadnym ekranie panelu - ani tu, ani w dzienniku - dopóki nie zostanie zdana.

## Razem

Osiem liczb w jednym pasku, bez kafli: **Operacje**, **Dni lotne** (z ilu dni zakresu), **Loty**, **Blok** (czas od uruchomienia do wyłączenia silnika), **Lot** (czas w powietrzu), **Paliwo** (zużyte według odczytów), **Δ MH** (przyrost licznika motogodzin w godzinach) i **Piloci** - ile osób latało w dowolnym fotelu, jako dowódca albo drugi pilot.

@panel statystyki "Statystyki: pasek sum, słupki i trzy tabele"

## Nalot dzień po dniu

Słupek na każdy dzień zakresu, wysokość względem najwyższego dnia; dzień bez lotów to prawdziwe zero - kreska u podstawy, nie dziura. Podpis pod wykresem nazywa najwyższy dzień i jego czas blokowy. Przy zakresie do dwóch tygodni podpisany jest każdy dzień, przy dłuższym co siódmy.

## Trzy tabele

Wszystkie trzy liczą te same operacje - różnią się tym, po czym je grupują. Każda kończy się wierszem **Razem**, który sumuje wyłącznie to, co da się zsumować.

**Samoloty** - wiersz na maszynę, która w zakresie latała: **Operacje**, **Dni**, **Loty**, **Blok**, **Lot**, **Paliwo**, **Śr. L/h** (średnie zużycie na godzinę pracy silnika), **Δ MH** i **Wykorzystanie** - w ilu dniach zakresu maszyna latała, w procentach. Paliwo bywa kreską z tym samym powodem, co w dzienniku: gdy choć jedna operacja nie ma bilansu, suma byłaby liczbą mniejszą od prawdy podaną jako prawda.

**Piloci** - wiersz na osobę, która latała w dowolnym fotelu: **Operacje**, **Loty**, **Blok** i **Lot** liczą się **dowódcy**, jak w książce lotów, a czas w prawym fotelu ma własną kolumnę **Drugi pilot** z własną sumą. Uczeń bez ani jednej operacji jako dowódca ma swój wiersz z zerami nalotu, liczbą w kolumnie „Drugi pilot" i podpisem „tylko jako drugi pilot". Kolumna **Samoloty** wymienia maszyny z obu foteli.

> **Uwaga.** Kolumn **Blok** i **Drugi pilot** nie dodaje się do siebie: tę samą godzinę lotu szkolnego niesie wiersz instruktora (jako dowódcy) i wiersz ucznia (jako drugiego pilota). Nalot floty to suma kolumny „Blok" - i zgadza się co do minuty z osią pilotów w dzienniku.

**Zadania** - wiersz na rodzaj operacji (Skoki, Przelot, Egzamin, Lot techniczny, Inne): **Operacje**, **Loty**, **Blok**, **Lot**, **Udział** w nalocie floty w procentach i **Samoloty**.

## Podstawa liczenia

Do sum wchodzą operacje **zamknięte** (zdane albo zakończone przez administratora), **nieunieważnione** i **niepuste** - zdanie samolotu bez biegu silnika, bez lotów i bez zmiany odczytów nie jest lotem i nie liczy się nigdzie. Operacje bez daty przejęcia (stare zapisy) podtytuł nazywa osobno. Loty to loty od startu do lądowania, tak samo jak kolumna „Loty" w dzienniku.

Gdy w zakresie nie ma ani jednej zamkniętej operacji, zamiast tabel z zerami stoi jedno zdanie i wskazówka, żeby zmienić zakres - tabela sum, w której każda liczba to zero, wyglądałaby jak awaria liczenia.

## Analityka zużycia

Statystyki mówią, ile klub latał. Ile maszyna **pali** - pasmo typowego zużycia zmierzone z jej lotów, stawki w locie i na ziemi, przeliczniki licznika - jest własnością maszyny i mieszka w jej karcie w module [Samoloty](panel-samoloty#zuzycie-z-lotow).

## Dlaczego tak to działa

> **Dlaczego bez kafli.** Osiem płytek z liczbami robiło z sum nagłówek gazety, a pytanie brzmi „ile" - odpowiada na nie pasek liczb w jednej linii, ten sam, którym karta śladu podaje dystans i pułap.

> **Dlaczego panel niczego nie liczy sam.** Każda liczba na tym ekranie - także średnie, udziały i wiersze „Razem" - przychodzi policzona przez serwer tym samym rachunkiem, który zasila dziennik. Gdyby panel dodawał cokolwiek po swojemu, dwa ekrany pokazywałyby dwie sumy tego samego nalotu, a pierwsza poprawka jednej z nich rozjechałaby je na stałe.

## Częste problemy

- **Statystyki i dziennik dają różne liczby** → sprawdź, czy patrzysz na ten sam zakres dat i tę samą oś. Przy tym samym zakresie nalot dowódców w obu jest równy co do minuty; różnica bierze się zwykle z operacji w toku, którą dziennik nazywa w wierszu („leci teraz"), a statystyki wyłącznie w podtytule.
- **Pilot ma zera, choć latał** → latał jako drugi pilot: jego czas stoi w kolumnie „Drugi pilot", a nalot dowódcy w wierszu instruktora.
- **„Żadnej zamkniętej operacji w tym zakresie"** → operacje z tych dni trwają albo są unieważnione; zmień zakres albo zajrzyj do [dziennika](panel-dziennik).
