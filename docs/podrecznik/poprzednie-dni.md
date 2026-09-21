# Historia

> Wszystkie Twoje operacje - dzisiejsze i wcześniejsze: dzień nagłówkiem, loty zwartymi wierszami, starsze zwinięte pod przyciskiem.

@screen 24-historia "Dzień nagłówkiem, operacje wierszami" | 24a-historia-rozwinieta "Archiwum po rozwinięciu"

## Co widać

Zakładka **Historia** to trzecia pozycja paska na dole ekranu. Otwiera się na tym, co można jeszcze poprawić - starsze dni czekają zwinięte.

- **Nagłówek dnia** z datą, np. `11 SIERPNIA 2026`. Data pada raz, nad wszystkimi operacjami tego dnia.
- **Wiersz operacji** - godziny biegu silnika, znak samolotu i trójka liczb **Loty · Blok · Lot** bez etykiet: ich kolejność jest w aplikacji stała.
- **Suma dnia** pojawia się dopiero wtedy, gdy tego dnia latałeś kilka razy - przy jednej operacji powtarzałaby jej własne liczby.
- **Ikona po prawej** mówi, co się stanie po tapnięciu: **ołówek** - trwa jeszcze czas na poprawki, **oko** - operację można już tylko obejrzeć.
- **POKAŻ STARSZE** rozwija archiwum. Zwija się przy każdym wejściu: „co mogę poprawić" pytasz codziennie, a „co latałem w maju" - raz na jakiś czas.

Oznaczenia przy wierszu pojawiają się tylko wtedy, gdy coś znaczą: **RĘCZNIE** przy [wpisie lotu po fakcie](wpis-lotu-po-fakcie), **Zakończył administrator** przy operacji zamkniętej z panelu, a przy zapisach, które jeszcze nie doszły do klubu - „Oczekuje na przesłanie · n".

Tapnięcie wiersza otwiera [ekran operacji](operacja-i-korekty): w czasie na poprawki z możliwością edycji, po terminie w trybie podglądu.

@screen 10-statystyki "Operacja w czasie na poprawki" | 10b-rozliczenie-zamkniete "Operacja po terminie"

## Jak to działa

Lista liczy się na telefonie, z Twojego lokalnego zapisu - dlatego wygląda tak samo z zasięgiem i bez. Wierszem jest **operacja, nie doba**: dzień z dwiema operacjami ma dwa wiersze, rozróżnione godzinami biegu silnika. Do której doby należy operacja, rozstrzyga chwila uruchomienia silnika w czasie UTC, a przy zapisie bez biegu - chwila przejęcia. Z listy wypadają operacje unieważnione - przez Ciebie albo przez administratora - oraz zdania bez lotu, w których nic się nie zmieniło.

Czas na poprawki to 24 godziny od zdania samolotu i liczy się osobno dla każdej operacji. Po jego upływie wiersz zostaje, ale otwiera się już tylko do oglądania.

## Dlaczego tak to działa

> **Dlaczego dzisiejsze loty są tutaj, a nie na Pulpicie.** Poprawia się je w jednym miejscu - tym samym, w którym leżą wszystkie pozostałe. Dwie listy tych samych operacji znaczyłyby dwa miejsca do sprawdzenia i dwa, które mogą się rozjechać.

> **Dlaczego wiersz to jedna operacja, a nie cały dzień.** Wiersz opisuje jedną maszynę i jeden bieg silnika, bo tak wygląda rozliczenie: paliwo i motogodziny należą do samolotu, nie do pilota. Wiersz-doba nie miałby czego otworzyć, gdybyś tego dnia latał dwiema maszynami. Więcej: [model operacji](model-operacji).

> **Dlaczego starsze loty otwierają się tylko do podglądu.** O tym, co widzisz, rozstrzyga wyłącznie czas na poprawki. Przycisku edycji nie pokazujemy wyszarzonego - obiecywałby akcję, której reguły i tak nie dopuszczą; po terminie znika po prostu wejście w edycję. Więcej: [korekty i rejestr](korekty-i-rejestr).

## Częste problemy

- **Nie widzę wczorajszego wieczornego lotu** → doba liczy się w UTC od uruchomienia silnika. Latem lot uruchomiony po 02:00 czasu polskiego należy już do następnej doby i stoi pod jutrzejszą datą.
- **Wiersz ma ikonę oka zamiast ołówka** → minęły 24 godziny od zdania samolotu. Poprawkę wprowadzi administrator - zgłoś ją w klubie; zapis pierwotny i tak zostanie w dokumentacji.
- **Oznaczenie „Oczekuje na przesłanie" nie znika** → zapisy tej operacji czekają w kolejce wysyłki. Wróć w zasięg; jeśli oznaczenie łączności na Pulpicie jest czerwone, kolejka sama nie ruszy - patrz [praca bez zasięgu](praca-bez-zasiegu).
- **Lista jest pusta po reinstalacji albo na nowym telefonie** → operacje wracają z serwera przy pierwszym połączeniu. Daj aplikacji chwilę z zasięgiem albo użyj **SYNCHRONIZUJ TERAZ** w [ustawieniach](ustawienia).
- **Operacja zniknęła z listy** → została unieważniona: przez Ciebie w trybie edycji albo przez administratora. Zapis zostaje w dokumentacji klubu i widzi go administrator, ale przestaje się liczyć - wypada z sum, z historii i z dokumentów dnia.
