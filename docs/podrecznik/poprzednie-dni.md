# Poprzednie dni

> Operacje spoza dzisiejszej doby - na takich samych kafelkach jak na ekranie Mój dzień, w dwóch grupach: te, które możesz jeszcze poprawić, i te już zamknięte.

@screen 12-historia "Kafelki z terminem korekty"

## Dwie grupy

Ekran otwiera się z przycisku **POPRZEDNIE DNI** na ekranie [Mój dzień](moj-dzien). Kafelki dzielą się według okna korekty:

- **Możesz jeszcze poprawić** - operacje, dla których nie minęły 24 godziny od zdania samolotu. Kafelek ma niebieską ramkę, termin (`Korekta do 12 SIE 16:05`), odliczanie („zostało 4 h 12 min") i przycisk **OTWÓRZ I POPRAW**.
- **Zamknięte** - operacje po oknie. Przycisk mówi **ZOBACZ SZCZEGÓŁY**, a pod grupą stoi zdanie o tym, że można je oglądać, ale nie zmieniać: błąd zgłasza się administratorowi, a jego poprawka dopisze się jako korekta, bez kasowania pierwotnego zapisu.

## Kafelek operacji

Ten sam kształt, co na ekranie Mój dzień - różnią się dwie rzeczy: nagłówkiem jest data (`11 SIERPNIA 2026`), a pod kafelkiem może stać stopka z plakietkami.

- **Sygnatura** operacji, np. `SP-KLM/2026-08-11/TMK/2`, znak samolotu i godziny biegu silnika (`14:20 → 16:02 UTC`).
- **Trójka Loty · Blok · Lot** - liczba lotów, czas blokowy, czas w powietrzu.
- **RĘCZNIE** przy nagłówku, gdy operacja powstała jako [wpis lotu po fakcie](wpis-lotu-po-fakcie).
- **Zakończył administrator** - operacja, której nie zdałeś, a klub zamknął ją z panelu.
- **Plakietka zaległości** pojawia się tylko wtedy, gdy zapisy tej operacji jeszcze nie doszły do klubu: „Oczekuje na przesłanie · n" albo „W trakcie wysyłania · n". Wysłane operacje nie mają żadnej plakietki - to stan domyślny.

Tapnięcie kafelka otwiera [ekran operacji](operacja-i-korekty): w oknie korekty z możliwością edycji, po oknie w trybie podglądu.

@screen 10-statystyki "Operacja w oknie korekty" | 10b-rozliczenie-zamkniete "Operacja po oknie korekty"

## Jak to działa

Lista liczy się na telefonie, z Twojego lokalnego zapisu - dlatego wygląda tak samo z zasięgiem i bez. Kafelkiem jest **operacja, nie doba**: doba z dwiema operacjami daje dwie karty, rozróżnione godzinami biegu silnika. Do której doby należy operacja, rozstrzyga chwila uruchomienia silnika w czasie UTC (a przy zapisie bez biegu - chwila przejęcia), więc granica jest tu ta sama, co na ekranie Mój dzień i żadna operacja nie wpada w dziurę między ekranami. Z listy wypadają operacje unieważnione - przez Ciebie albo przez administratora - oraz zdania bez lotu, w których nic się nie zmieniło. Dzisiejszych operacji tu nie ma: stoją na ekranie Mój dzień, na identycznych kafelkach.

> **Dlaczego tak.** Kafelek opisuje jedną maszynę i jeden bieg silnika, bo tak wygląda rozliczenie: paliwo i motogodziny należą do samolotu, nie do pilota. Kafelek-doba nie miałby czego otworzyć, gdyby tego dnia latałeś dwiema maszynami. Więcej: [model operacji](model-operacji).

> **Założenie.** Podział na dwie grupy robi wyłącznie okno korekty. Przycisku edycji nie pokazujemy wyszarzonego - obiecywałby akcję, której reguły i tak nie dopuszczą; po oknie znika po prostu wejście w edycję. Więcej: [korekty i rejestr](korekty-i-rejestr).

## Częste problemy

@screen 01-moj-dzien "Dzisiejsze operacje na Mój dzień" | 01d-sync-stoi "Czerwona plakietka łączności"

- **Nie widzę wczorajszego wieczornego lotu** → doba liczy się w UTC od uruchomienia silnika. Latem lot uruchomiony po 02:00 czasu polskiego należy już do następnej doby, więc może stać na ekranie Mój dzień, a nie tutaj.
- **Kafelek ma tylko ZOBACZ SZCZEGÓŁY** → minęły 24 godziny od zdania samolotu. Poprawkę wprowadzi administrator - zgłoś ją w klubie; zapis pierwotny i tak zostanie w dokumentacji.
- **Plakietka „Oczekuje na przesłanie" nie znika** → zapisy tej operacji czekają w kolejce wysyłki. Wróć w zasięg; jeśli plakietka łączności w nagłówku jest czerwona, kolejka sama nie ruszy - patrz [praca bez zasięgu](praca-bez-zasiegu).
- **Lista jest pusta po reinstalacji albo na nowym telefonie** → operacje wracają z serwera przy pierwszym połączeniu. Daj aplikacji chwilę z zasięgiem albo użyj **SYNCHRONIZUJ TERAZ** w [ustawieniach](ustawienia).
- **Operacja zniknęła z listy** → została unieważniona: przez Ciebie w trybie edycji albo przez administratora. Zapis zostaje w dokumentacji klubu i widzi go administrator, ale przestaje się liczyć - wypada z sum, z historii i z dokumentów dnia.
