# Ekran operacji i poprawki

> Każda operacja ma swój ekran: przebieg lotu, ślad na mapie oraz rozliczenie paliwa i motogodzin. Przez 24 godziny od zdania samolotu możesz poprawić własne wpisy.

@screen 10-statystyki "Ekran operacji"

## Jak otworzyć ekran operacji

- **Z Historii** - tapnij wiersz operacji, dzisiejszej albo wcześniejszej.
- **Z kokpitu, po wyłączeniu silnika** - kafelek **Popraw dane operacji**. Stamtąd wracasz do kokpitu, bo samolot jest wciąż u Ciebie.

W nagłówku stoi **sygnatura** operacji, na przykład `SP-AXA/2026-09-05/AKO/1`: znaki samolotu, data (doba UTC), kod dowódcy i numer operacji tego dowódcy w tej dobie. Pod tą nazwą operację znajdziesz w aplikacji i w panelu klubu - podawaj ją w rozmowie z administratorem.

## Co jest na ekranie

- **Komunikat o czasie na poprawki** - do kiedy możesz poprawiać dane. Po tym terminie stoi tu informacja, że poprawki wprowadza administrator.
- **Przebieg operacji** - miniatura śladu na mapie (tapnięcie otwiera [pełny ślad](slad-gps)) i lista zdarzeń: rozpoczęcie z odczytami, tankowania i dolewki oleju, uruchomienie, kołowanie, starty i lądowania z czasem lotu, zrzuty, wyłączenie i zdanie. Pod listą stoją sumy: czas blokowy, czas lotu, liczba startów i lotnisko.
- **Paliwo** i **Motogodziny** - odczyt przy rozpoczęciu, dolane, odczyt przy zdaniu i zużycie, z oceną wobec normy samolotu (opis niżej).
- **Olej** - pomiar przy rozpoczęciu, dolewki i stan po dolewkach.
- **Zrzuty** - w dniu skokowym: wyniesienia, liczba skoczków i średnia wysokość.
- **Załoga** - dowódca i drugi pilot.
- **Notatki** - jeśli zostały wpisane.

## Ocena zużycia wobec normy

Przy paliwie i motogodzinach stoi oznaczenie **✓ W NORMIE** albo bursztynowe **↑ POWYŻEJ NORMY** / **↓ PONIŻEJ NORMY**. Tapnięcie otwiera wyliczenie: ile zużyto, ile oczekiwano i skąd wzięła się norma.

- **Skąd norma.** Na początku to wartość z dokumentacji samolotu, wpisana przez klub. Gdy samolot ma za sobą wystarczająco dużo lotów, aplikacja liczy normę z jego własnych lotów - wtedy pokazuje też, o ile różni się ona od dokumentacji.
- **Norma dla tej operacji.** Oczekiwane zużycie liczy się osobno dla czasu w powietrzu i czasu na ziemi, na przykład „1:16 lotu × 20 L/h + 0:27 ziemi × 8 L/h ≈ 29 L". Dzięki temu długie kołowanie nie zaniża oceny.
- **Ocena niczego nie blokuje.** „Powyżej normy" to sygnał do sprawdzenia: czy odczyt jest dobry, czy ktoś nie dolał paliwa poza aplikacją, czy kołowanie nie trwało wyjątkowo długo.

Jeśli samolot nie ma normy, ocena się nie pojawia. Olej nie ma oceny - mierzy się go tylko przy rozpoczęciu lotu, więc zużycia jednej operacji nie da się policzyć.

@screen 10c-norma-detale "Wyliczenie normy"

## Jak poprawić dane

Na dole ekranu tapnij **EDYTUJ DANE**. Ten sam ekran przechodzi w tryb edycji:

- przy każdym wierszu przebiegu pojawia się ołówek - tapnij wiersz, żeby go poprawić,
- na końcu listy pojawia się **DODAJ WPIS** - do dopisania brakującego zdarzenia,
- na górze stoją wykryte niezgodności, na przykład „Lot 2 nie ma lądowania", z podpowiedzią, jak je naprawić.

Gdy skończysz, tapnij **ZAKOŃCZ EDYCJĘ**. Poprawki zapisują się od razu.

@screen 10d-edycja "Tryb edycji" | 10e-korekta-zdarzenia "Poprawka godziny" | 10f-korekta-odczytu "Poprawka odczytów"

| Co poprawiasz | Jak |
|---|---|
| uruchomienie, kołowanie, start, lądowanie, wyłączenie | godzina - przyciskami o minutę albo z klawiatury; zdarzenie, którego nie było, usuwasz przyciskiem „tego nie było" |
| odczyty przy rozpoczęciu i zdaniu | paliwo i motogodziny, a przy rozpoczęciu także olej |
| zrzut | godzina i skład skoczków |
| godzina rozpoczęcia | cofnięcie to zwykła poprawka; przesunięcie na później niż uruchomienie silnika przesuwa cały lot - ekran mówi o tym przed zapisem |
| notatka, drugi pilot | w tym samym okienku, w którym powstały; zmiana drugiego pilota dotyczy całej operacji |
| tankowanie, dolewka oleju | usuń wpis i dodaj go od nowa - stan przed, dolewka i stan po muszą do siebie pasować |
| brakujące zdarzenie | **DODAJ WPIS**: start, lądowanie, kołowanie, tankowanie, dolewka oleju, a w dniu skokowym także zrzut i załadunek. Jeśli godzina nie pasuje do przebiegu - na przykład lądowanie bez wcześniejszego startu albo tankowanie przy pracującym silniku - przycisk powie dlaczego |

Do każdej poprawki możesz dopisać powód. Nie jest obowiązkowy, ale dzięki niemu administrator wie, dlaczego liczba się zmieniła. Dowódcy nie da się zmienić - inny dowódca to zdanie samolotu i nowy lot.


## Historia zmian

Poprawiona wartość ma oznaczenie **popr.** - także po upływie czasu na poprawki. Tapnięcie otwiera historię zmian: kiedy, co było, co jest, kto zmienił (Ty albo administrator) i z jakim powodem. Pierwotna wartość nie znika - zostaje w historii.

@screen 10h-dodaj-wpis "Dopisanie brakującego zdarzenia" | 10i-historia-zmian "Historia zmian"

## Usunięcie całego wpisu

Na samym dole trybu edycji stoi czerwony przycisk **USUŃ CAŁY WPIS** - na przykład gdy ten sam lot jest wpisany dwa razy. Okienko pokazuje, którą operację usuwasz, i prosi o potwierdzenie; powód możesz dopisać. Usunięty wpis znika z Twojego dnia, z Historii i z sum, a samolot przestaje być zajęty. Administrator klubu nadal go widzi - razem z powodem.


## Po 24 godzinach

24 godziny od zdania samolotu ekran operacji otwiera się już tylko do podglądu - bez **EDYTUJ DANE**. Wyliczenie normy i historia zmian dalej się otwierają. Jeśli coś trzeba poprawić, zgłoś to administratorowi: poprawi to w panelu, a poprawka pojawi się w historii zmian, z jego nazwiskiem.

Jeśli administrator zakończył Twoją operację w panelu, czas na poprawki kończy się od razu.

@screen 10l-usun-sesje "Usunięcie całego wpisu" | 10b-rozliczenie-zamkniete "Podgląd po 24 godzinach"

## Częste problemy

- **Nie ma przycisku EDYTUJ DANE** → minęły 24 godziny od zdania albo operację zakończył administrator. Zgłoś poprawkę w klubie.
- **Po poprawieniu godziny rozpoczęcia przesunął się cały lot** → tak działa przesunięcie na później niż uruchomienie silnika: wszystkie zdarzenia przesuwają się razem, a czasy trwania się nie zmieniają. Ekran mówi o tym przed zapisem.
- **Zniknęła ocena normy** → w przebiegu jest niezgodność, na przykład lot bez lądowania. Napraw ją - ocena wróci sama.
- **Chcę poprawić tankowanie** → tankowania nie zmienia się w miejscu: usuń wpis („tego nie było") i dodaj go od nowa przez **DODAJ WPIS**.
- **Wpis został usunięty przez pomyłkę** → zgłoś to administratorowi - wpis nie zniknął z klubu, przestał się tylko liczyć.
