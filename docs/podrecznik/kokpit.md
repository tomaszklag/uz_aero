# Kokpit

> Od uruchomienia do wyłączenia silnika telefon sam zapisuje kołowanie, starty i lądowania. Pod ręką masz tankowanie, załadunek, zmianę drugiego pilota i przyciski do ręcznego zapisu.

## Przed uruchomieniem silnika

Na górze ekranu stoją znaki samolotu, lotnisko i zadanie. Pod nimi kafelki:

- **Tankowanie** - dolewka paliwa przed lotem ([tankowanie i olej](tankowanie-i-olej)).
- **Dolej olej** - kafelek pokazuje, ile oleju jest w silniku, na przykład „W silniku 9,2 L".
- **Załadunek** - tylko w dniu skokowym: skoczkowie wchodzą na pokład. Skład możesz podać albo pominąć; jeśli go podasz, podpowie się przy zrzucie.
- **Zmiana załogi** - zmiana albo usunięcie drugiego pilota. Dowódcy w trakcie operacji się nie zmienia: nowy dowódca zaczyna własny lot na swoim telefonie, po zdaniu samolotu.
- **Zdaj samolot** - gdy jednak nie lecisz (pogoda, usterka, próba silnika). Podajesz powód i opcjonalny komentarz ([zdanie samolotu](zdanie-samolotu#zdanie-bez-lotu)).

Jeśli samolot ma normę zużycia, nad logiem stoi pasek paliwa z ostatnim odczytem i szacunkiem, na przykład „wystarczy na ~6 wyniesień do rezerwy 45 min". O ilości paliwa zawsze decyduje paliwomierz.

@screen 04a-cockpit-ground "Kokpit przed uruchomieniem" | 07-zmiana-zalogi "Zmiana drugiego pilota"

Aby uruchomić silnik, **przytrzymaj przycisk URUCHOM SILNIK przez sekundę**. Tak samo działają przycisk wyłączenia i przyciski ręcznego zapisu - przypadkowe tapnięcie niczego nie zapisze.

## W locie

Po uruchomieniu silnika aplikacja sama rozpoznaje **kołowanie, start i lądowanie** i dopisuje je do logu operacji. W jednej operacji może być wiele lotów - każdy krąg z touch and go liczy się jako osobny lot.

Duży napis na górze mówi, co się dzieje: **Silnik pracuje**, **Kołowanie**, **Wznoszenie**, **Lot poziomy**, **Zniżanie**. Pod nim stoją prędkość nad ziemią, wysokość, paliwo na pokładzie i czas lotu.

@screen 05-cockpit-running "Kokpit w locie" | 05a-cockpit-taxi "Kołowanie"

### Jak aplikacja rozpoznaje start i lądowanie

- **Kołowanie** - gdy samolot odjedzie kilkadziesiąt metrów od miejsca postoju. Zapisuje się od razu.
- **Start** - gdy samolot rozpędzi się do prędkości startowej albo wzniesie kilkadziesiąt stóp nad lotnisko.
- **Lądowanie** - gdy samolot jest jednocześnie wolny i nisko nad lotniskiem. W dniu skokowym aplikacja uznaje lądowanie tylko w pobliżu lotniska skoków.

Wykryty start albo lądowanie najpierw pokazuje komunikat „Wykryto: Start" z pięciosekundowym odliczaniem. Jeśli nic nie zrobisz, zdarzenie się zapisze. Jeśli to pomyłka, tapnij **COFNIJ - NIE BYŁO STARTU** (albo **COFNIJ - NIE BYŁO LĄDOWANIA** - na przykład przy niskim przelocie nad lotniskiem). Na osi zapisuje się godzina oderwania albo przyziemienia, a nie chwila komunikatu.

@screen 05b-cockpit-inflight-toast "Odliczanie po wykryciu startu" | 05c-cockpit-toast-ldg "Wykryte lądowanie"

### Ręczny zapis

Na dole ekranu zawsze stoi przycisk następnego zdarzenia: **Kołowanie**, **Start** albo **Lądowanie**. Przytrzymaj go przez sekundę, jeśli aplikacja nie rozpoznała zdarzenia. W okienku możesz cofnąć godzinę o minutę albo wpisać ją z klawiatury - przydaje się, gdy zauważasz to po fakcie.

### Zrzut skoczków

W dniu skokowym w locie poziomym aktywny jest przycisk **Zrzut**. Okienko podpowiada skład z załadunku do potwierdzenia albo poprawienia, a wysokość bierze z GPS. Skład nie jest obowiązkowy - zrzut zapiszesz zawsze.

@screen 05f-zdarzenie-reczne "Ręczny zapis startu" | 05e-zrzut "Zapis zrzutu"

### Paliwo i olej w trakcie lotu

Po uruchomieniu silnika ilość paliwa i oleju to szacunki - kafelki mówią „około" i odświeżają się co 5 minut według normy samolotu i czasu pracy silnika.

### Gdy zniknie sygnał GPS

Po kilkunastu sekundach bez sygnału kokpit pokazuje komunikat „GPS: brak sygnału", a prędkość i wysokość zamieniają się w kreski. Starty i lądowania zapisujesz wtedy przyciskiem. Czasy liczą się dalej, a zapisy wysyłają się normalnie. Gdy sygnał wróci, komunikat zniknie sam.

> **Wskazówka.** Ikona w prawym górnym rogu przełącza ekran między ciemnym a jasnym - jasny jest na pełne słońce.

## Po wyłączeniu silnika

Silnik wyłączasz, przytrzymując **WYŁĄCZ** - po wylądowaniu i zakończeniu dobiegu. Wyłączenie silnika kończy operację: drugiego uruchomienia w niej nie ma, a kolejny lot zaczniesz od nowa z Pulpitu, po zdaniu samolotu.

Na ziemi zostają:

- **ZDAJ SAMOLOT** - główny przycisk, prowadzi do [zdania samolotu](zdanie-samolotu),
- **Tankowanie** i **Dolej olej**,
- **Popraw dane operacji** - brakujące lądowanie, zła godzina - zanim zdasz samolot.

Pod logiem stoją sumy operacji: czas blokowy, czas lotu i liczba startów.

## Z kokpitu wychodzi się przez zdanie samolotu

Dopóki masz samolot, przycisk wstecz nie prowadzi na Pulpit. Pokazuje okienko **TRZYMASZ SP-AXA** z wyborem: **Zostań** albo **Zdaj samolot**. Dzięki temu żaden samolot nie zostanie przez przypadek bez zdania, a następny pilot zawsze dostanie odczyty.

Wyjątek: jeśli administrator zakończy albo unieważni Twoją operację w panelu, kokpit sam wróci na Pulpit z komunikatem.

@screen 04-cockpit-ground "Po wyłączeniu silnika" | 04d-wyjscie-z-kokpitu "Zostań albo zdaj samolot"


## Log operacji

Pod kafelkami stoi log tej operacji: rozpoczęcie z odczytami, tankowania i dolewki oleju, uruchomienie, kołowanie, każdy start i lądowanie z czasem lotu, zrzuty i wyłączenie. Ten sam przebieg zobaczysz później na [ekranie operacji](operacja-i-korekty).

## Częste problemy

- **Aplikacja nie rozpoznała startu albo lądowania** → przytrzymaj przycisk **Start** albo **Lądowanie** i w razie potrzeby cofnij godzinę w okienku. Po wyłączeniu silnika brakujące zdarzenie dopiszesz przez **Popraw dane operacji** → **DODAJ WPIS**.
- **Aplikacja zapisała start, którego nie było** → tapnij **COFNIJ** w czasie odliczania. Jeśli już się zapisał: **Popraw dane operacji**, ołówek przy wierszu i „tego nie było".
- **Komunikat „GPS: brak sygnału"** → zapisuj start i lądowanie przyciskami. Stan odbiornika sprawdzisz w [ustawieniach](ustawienia), w sekcji „Diagnostyka GPS".
- **Nie mogę wrócić na Pulpit** → zdaj samolot: po locie **ZDAJ SAMOLOT**, przed uruchomieniem kafelek **Zdaj samolot**.
- **Po wyłączeniu silnika nie ma URUCHOM SILNIK** → tak ma być. Zdaj samolot i rozpocznij nowy lot z Pulpitu.
- **Kokpit sam wrócił na Pulpit** → administrator zakończył albo unieważnił operację. Komunikat na Pulpicie mówi, którą i dlaczego.
