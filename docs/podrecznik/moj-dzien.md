# Mój dzień

> Ekran domowy aplikacji: lista Twoich operacji z dzisiejszej doby z sumami, wejście w nowy lot, wpis lotu po fakcie i poprzednie dni.

@screen 01-moj-dzien "Mój dzień z operacjami" | 01a-moj-dzien-pusty "Dzień bez lotów"

## Co widać

- **Nagłówek** z Twoim kodem pilota i dzisiejszą datą, np. `TMK · 06 SIE 2026`.
- **Kafelek operacji** - numer operacji w dobie (OPERACJA 1, 2, 3…), jej sygnatura, np. `SP-AXA/2026-08-06/TMK/1`, godziny uruchomienia i wyłączenia silnika oraz trójka **Loty · Blok · Lot** (liczba lotów, czas blokowy, czas w powietrzu). Lot wpisany po fakcie ma plakietkę **RĘCZNIE**, operacja zakończona z panelu - „Zakończył administrator". **OTWÓRZ I POPRAW** albo tapnięcie w kafelek otwiera [ekran operacji](operacja-i-korekty).
- **Sumy doby** w tej samej trójce, pod listą; przy kilku maszynach stoi dopisek, np. „2 samoloty".
- **ROZPOCZNIJ LOT** - zawsze zielony i zawsze w tym samym miejscu, pod logiem dnia, przez cały dzień. Prowadzi do [rozpoczęcia lotu](rozpoczecie-lotu).
- **DODAJ LOT RĘCZNIE** - [wpis lotu po fakcie](wpis-lotu-po-fakcie), dostępny także przy pustym dniu.
- **POPRZEDNIE DNI** - operacje spoza dzisiejszej doby ([więcej](poprzednie-dni)); plakietka na przycisku mówi, że jakąś operację z ostatnich dni można jeszcze poprawić.
- **Zębatka** w prawym górnym rogu - [ustawienia](ustawienia). To jedyne wejście do ustawień w aplikacji. Obok niej, na czas testów, stoi przycisk zgłoszenia błędu - ten sam na każdym ekranie i w każdym arkuszu.

Pusty dzień pokazuje kartę „DZIŚ BEZ LOTÓW" i kreski zamiast sum - nigdy zera.

## Jak to działa

Lista liczy się na telefonie, z lokalnego rejestru - ekran nigdy nie pyta o nią serwera, więc wygląda tak samo z zasięgiem i bez. Do dzisiejszej doby należą operacje, w których uruchomiono silnik między północą a północą UTC; operacja bez biegu silnika (zdanie ze zmienionym odczytem albo z dolewką) liczy się według godziny przejęcia. Numer na kafelku to kolejność uruchomień w Twojej dobie i ten sam numer stoi w sygnaturze - dlatego operacje numerują się po pilocie, nie po samolocie. Lista pomija operacje unieważnione i „puste" zdania bez lotu, w których nic się nie zmieniło. Po reinstalacji albo na nowym telefonie operacje wracają z serwera przy pierwszym połączeniu; do tego czasu ekran nie pisze „DZIŚ BEZ LOTÓW", żeby nie wyglądało to na utratę danych.

> **Założenie.** Dzień pilota to lista operacji i nic ponadto. Niczego się nie otwiera ani nie zamyka - dzień zaczyna się pierwszą operacją, a zdanie samolotu go nie kończy: kolejna maszyna dopisze się do listy. Więcej: [model operacji](model-operacji).

## Doba liczy się w UTC

Wszystkie czasy w UZ Aero są w UTC - w logu operacji, przy startach i lądowaniach, na karcie dnia. Doba zaczyna się o północy UTC, a operacja należy do doby, w której uruchomiono silnik. Operacja z późnego wieczoru może więc stać na liście pod inną datą niż w kalendarzu na ścianie.

> **Dlaczego tak.** Jedna godzina dla pilota, panelu i karty dnia - bez przeliczania stref i bez skoku przy zmianie czasu. Czas lokalny pojawia się tylko jako podpis przy wpisywanej godzinie.

## Wskaźnik łączności

Gdy wszystko jest wysłane, na ekranie **nie ma żadnej plakietki** - to stan domyślny. Plakietka pojawia się tylko wtedy, gdy coś czeka:

- **OFFLINE · n** (bursztyn) - ostatnia próba wysyłki nie dotarła do serwera, n zapisów czeka w kolejce. Przejdzie samo, gdy wróci zasięg.
- **SYNC STOI · n** (czerwony) - serwer odmówił albo sesja wygasła. Samo nie ruszy; tapnij plakietkę, żeby zobaczyć powód i co zrobić.

Tapnięcie plakietki otwiera arkusz z kolejką, ostatnią próbą, ostatnią udaną synchronizacją i przyciskiem **PONÓW PRÓBĘ**. Więcej: [praca bez zasięgu](praca-bez-zasiegu).

## Komunikaty od administratora

Jeśli administrator zakończył albo unieważnił Twoją operację z panelu, na ekranie stoi bursztynowy baner: która operacja, z jakiego powodu i co stało się z Twoimi zapisami (np. „2 zapisy z tego telefonu do tej operacji nie wyjdą na serwer"). Znika po tapnięciu **ROZUMIEM**. Operacja zakończona przez administratora zostaje na liście z plakietką; unieważniona znika z listy i z sum.

## Częste problemy

- **Wczorajszy wieczorny lot stoi pod dzisiejszą datą (albo dzisiejszy pod wczorajszą)** → doba liczy się w UTC od uruchomienia silnika. Latem lot uruchomiony po 02:00 czasu polskiego należy już do następnej doby UTC. Operacji, której nie ma na liście, szukaj w „Poprzednich dniach".
- **Operacja zniknęła z listy** → sprawdź baner od administratora (unieważnienie) albo czy nie było to zdanie bez lotu bez żadnej zmiany odczytów - takiego zapisu aplikacja nie pokazuje, o czym ostrzegała przed zdaniem.
- **Po reinstalacji lista jest pusta** → operacje wracają z serwera przy pierwszym połączeniu; daj aplikacji chwilę z zasięgiem albo użyj **SYNCHRONIZUJ TERAZ** w ustawieniach.
- **Nie widzę zębatki** → jesteś w kokpicie; ustawienia są tylko na tym ekranie, a kokpit ma w tym miejscu przełącznik jasności.
