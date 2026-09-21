# Pulpit

> Ekran, który widzisz po uruchomieniu aplikacji: jak poszło dziś, co masz przed sobą i dwa przyciski, którymi zaczynasz lot.

Aplikacja ma trzy zakładki na dole ekranu - **Pulpit**, [Kalendarz](rezerwacja-samolotu) i [Historia](poprzednie-dni). Pulpit odpowiada na dwa pytania: jak poszło dziś i co masz zaplanowane.

> **Uwaga.** Trzy zakładki zastąpiły ekran „Mój dzień" z listą operacji w wydaniu 3.0.0. Jeśli Twoja aplikacja wygląda jeszcze inaczej, zaktualizuje się sama przy najbliższym uruchomieniu z zasięgiem.

## Co widać

- **Mój dzień** - sumy dzisiejszej doby w trójce **Loty · Blok · Lot** (liczba lotów, czas blokowy, czas w powietrzu), a nad nimi ile operacji i na czym, np. „2 operacje · SP-AXA, SP-BKL". Karta jest wejściem: **OPERACJE DNIA** otwiera Historię, gdzie poprawia się dzisiejszy lot. Przed pierwszym lotem karta kurczy się do jednej linijki „dziś bez lotów" - nigdy do trzech zer.
- **Twoja rezerwacja** - najbliższy zarezerwowany termin z odliczaniem („ZA 1 H 15 MIN"), godzinami czasu klubu, maszyną, zadaniem, trasą i drugim pilotem. Tapnięcie otwiera [kartę rezerwacji](rezerwacja-samolotu). Bez rezerwacji karty nie ma wcale.
- **ROZPOCZNIJ LOT** - zawsze zielony i zawsze w tym samym miejscu. Prowadzi do [rozpoczęcia lotu](rozpoczecie-lotu); jeśli masz rezerwację na teraz, pod przyciskiem stoi podpis, czym wypełni się pierwszy krok.
- **DODAJ LOT RĘCZNIE** - [wpis lotu po fakcie](wpis-lotu-po-fakcie), dostępny także przed pierwszym lotem.
- **Zębatka** w prawym górnym rogu - [ustawienia](ustawienia). To jedyne wejście do ustawień w aplikacji. Obok niej, na czas testów, stoi przycisk zgłoszenia błędu - ten sam na każdym ekranie i w każdym okienku.

@screen 20-pulpit "Dzień z rezerwacją" | 20a-pulpit-bez-rezerwacji "Przed pierwszym lotem, bez planu"

## Jak to działa

Sumy liczą się na telefonie, z lokalnego rejestru - ekran nigdy nie pyta o nie serwera, więc wyglądają tak samo z zasięgiem i bez. Do dzisiejszej doby należą operacje, w których uruchomiono silnik między północą a północą UTC; operacja bez biegu silnika (zdanie ze zmienionym odczytem albo z dolewką) liczy się według godziny przejęcia. Sumy pomijają operacje unieważnione i „puste" zdania bez lotu, w których nic się nie zmieniło. Po reinstalacji albo na nowym telefonie operacje wracają z serwera przy pierwszym połączeniu; do tego czasu ekran nie pisze „dziś bez lotów", żeby nie wyglądało to na utratę danych.

Karta rezerwacji jest jedyną rzeczą na tym ekranie, która potrzebuje sieci. Bez zasięgu po prostu jej nie ma - reszta Pulpitu działa bez zmian. Więcej: [rezerwacja samolotu](rezerwacja-samolotu).

## Doba liczy się w UTC

Wszystkie czasy zapisu w Ninerdeck są w UTC - w logu operacji, przy startach i lądowaniach, na karcie dnia. Doba zaczyna się o północy UTC, a operacja należy do doby, w której uruchomiono silnik. Operacja z późnego wieczoru może więc stać pod inną datą niż w kalendarzu na ścianie.

Wyjątkiem są godziny rezerwacji: te idą czasem klubu, bo opisują umowę między ludźmi, a nie pomiar. Dlatego karta rezerwacji ma przy nich podpis „czas klubu".

## Wskaźnik łączności

Gdy wszystko jest wysłane, na ekranie **nie ma żadnego oznaczenia** - i tak wygląda dzień, w którym wszystko doszło do klubu. Oznaczenie pojawia się tylko wtedy, gdy coś czeka:

- **OFFLINE · n** (bursztyn) - ostatnia próba wysyłki nie dotarła do serwera, n zapisów czeka w kolejce. Przejdzie samo, gdy wróci zasięg.
- **SYNC STOI · n** (czerwony) - serwer odmówił albo sesja wygasła. Samo nie ruszy; tapnij oznaczenie, żeby zobaczyć powód i co zrobić.

Tapnięcie oznaczenia otwiera okienko z kolejką, ostatnią próbą, ostatnią udaną synchronizacją i przyciskiem **PONÓW PRÓBĘ**. Więcej: [praca bez zasięgu](praca-bez-zasiegu).

@screen 20c-pulpit-offline "Okienko synchronizacji po tapnięciu" | 20d-pulpit-sync-stoi "Czerwony stan SYNC STOI"

## Komunikaty od administratora

Jeśli administrator zakończył albo unieważnił Twoją operację z panelu, na ekranie stoi bursztynowy baner: która operacja, z jakiego powodu i co stało się z Twoimi zapisami (np. „2 zapisy z tego telefonu do tej operacji nie wyjdą na serwer"). Znika po tapnięciu **ROZUMIEM**.

## Dlaczego tak to działa

> **Dlaczego na Pulpicie nie ma listy operacji.** Ekran startowy pokazuje to, czego nie ma nigdzie indziej: wynik dnia i najbliższy plan. Przebieg pojedynczej operacji jest pytaniem zadawanym rzadziej i ma własną zakładkę - a dzisiejszy lot poprawia się tam, gdzie leżą wszystkie pozostałe, zamiast w dwóch miejscach naraz.

> **Dlaczego przed pierwszym lotem nie ma trzech zer.** Zero znaczyłoby zmierzony wynik, a nie brak pomiaru. Skrócona karta mówi to samo krócej i nie spycha rezerwacji poza pierwszy ekran - a rano to ona jest najbardziej potrzebna.

> **Dlaczego dzień pilota nie ma początku ani końca.** Dzień to lista operacji i nic ponadto. Niczego się nie otwiera ani nie zamyka - zaczyna się pierwszą operacją, a zdanie samolotu go nie kończy: kolejna maszyna po prostu dopisze się do listy. Więcej: [model operacji](model-operacji).

## Częste problemy

- **Nie widzę dzisiejszego lotu, żeby go poprawić** → kafelki operacji są w zakładce [Historia](poprzednie-dni), razem z dniami wcześniejszymi. Karta „Mój dzień" prowadzi tam przyciskiem **OPERACJE DNIA**.
- **Nie ma karty rezerwacji, choć mam zarezerwowany termin** → karta potrzebuje połączenia, a kalendarz nie jest przechowywany na telefonie. Wróć na ekran z zasięgiem.
- **Sumy pokazują mniej, niż latałem** → sprawdź, czy operacja nie została unieważniona przez administratora; baner nad kartą powie, która i dlaczego.
