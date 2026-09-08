# Panel klubu: wprowadzenie

> Panel to strona w przeglądarce dla administratora klubu: konta pilotów, karty samolotów, dziennik operacji i zgłoszenia z aplikacji. Loguje się do niego tym samym kontem Google, co do aplikacji pilota.

## Dostęp

Adres panelu klub dostaje przy wdrożeniu. Do panelu wchodzi się wyłącznie kontem Google - haseł nie ma ani tu, ani w aplikacji. Pierwszego administratora wskazuje się adresem e-mail przy wdrożeniu: loguje się tym kontem Google i zakłada resztę klubu. Kolejnych administratorów i pilotów prowadzi się w module [Piloci](panel-piloci).

Panel jest dla administratorów. Jeśli po wybraniu konta Google panel nie może wpuścić, mówi to jednym zdaniem:

| Co widzisz | Co to znaczy |
|---|---|
| „W klubie nie ma konta z tym adresem Google" | konto Google jest poprawne, ale w klubie nie ma konta z tym adresem - administrator musi je założyć albo wpisać ten adres w istniejącym koncie |
| „To konto nie ma dostępu do panelu" | konto istnieje, ale ma rolę pilota; panel go nie obejmuje |
| „To konto jest wyłączone" | konto wyłączono w module Piloci - kolejne próby nic nie zmienią, dopóki administrator go nie włączy |

Sesja panelu trwa osiem godzin od zalogowania; potem panel prosi o ponowne logowanie. Wyłączenie konta w module Piloci zrywa jego sesje od razu - w panelu i w aplikacji.

@panel 00-logowanie "Logowanie kontem Google"

## Moduły

Nawigacja to kolumna po lewej z czterema pozycjami; nad nimi stoi nazwa klubu, a pasek u góry niesie tylko znak i zalogowanego. Ekranem startowym jest Dziennik: konta i flotę zakłada się raz na sezon, dziennik ogląda się co tydzień.

| Moduł | Do czego |
|---|---|
| [**Dziennik**](panel-dziennik) | cała flota w zakresie dat → operacje jednej maszyny → jedna operacja z osią zdarzeń i śladem GPS; zakończenie operacji, której pilot nie zdał, i unieważnienie wpisu |
| [**Piloci**](panel-piloci) | kolejka zgłoszeń z aplikacji do zatwierdzenia, konta pilotów i administratorów, kody pilotów, wyłączanie kont |
| [**Samoloty**](panel-samoloty) | karta każdej maszyny: pojemności, normy zużycia z dokumentacji, minimum oleju, format licznika, aktualny stan; poprawa odczytów |
| **Zgłoszenia** | uwagi i błędy wysłane z aplikacji przez pilotów, razem z kontekstem ekranu, na którym powstały |

### Zgłoszenia

Moduł na czas testów z pilotami. Każdy ekran i arkusz aplikacji (poza logowaniem i PIN-em) ma w prawym górnym rogu przycisk zgłoszenia. Zgłoszenie zabiera ze sobą kontekst - ekran, operację (sygnaturę), samolot, zadanie, stan silnika, liczbę lotów, wersję aplikacji, model telefonu, stan łączności i kolejki wysyłki - i wychodzi z telefonu samo, gdy jest sieć; pilot widzi „zapisane", nie „wysłane", bo w chwili tapnięcia telefon nie wie, czy ma zasięg. W panelu lista pokazuje domyślnie robotę (**Do zrobienia** = nowe i w toku), a filtry z licznikami pozostałe statusy; wiersz otwiera kartę z opisem, obsługą i pełnym kontekstem. Cztery statusy: **Nowe → W toku → Rozwiązane / Odrzucone**. Odrzucenie wymaga komentarza, treści zgłoszenia nie zmienia nikt, kasowania nie ma - zgłoszenie nietrafione zamyka się odrzuceniem z powodem. Odpowiedzi do pilota z panelu nie ma: testy trwają krótko, a klub ma telefony.

@panel dziennik-flota "Dziennik · ekran startowy panelu"

@panel zgloszenia-lista "Zgłoszenia z aplikacji · widok Do zrobienia"

## Jak to działa

- **Jeden dziennik, dwie powierzchnie.** Aplikacja pilota i panel pracują na tym samym dzienniku operacji. To, co pilot zapisze na telefonie, dociera do klubu z najbliższym połączeniem; to, co zdecyduje administrator (zatwierdzenie konta, zakończenie operacji, unieważnienie, poprawa odczytów), telefon pobiera przy najbliższym połączeniu - zwykle w ciągu kwadransa, a od razu po **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji. Szczegóły: [synchronizacja](synchronizacja).
- **Flota i piloci jadą na telefony jako kopia.** Zmiana na karcie samolotu (pojemność, norma, minimum oleju, wyłączenie ze służby) i na koncie pilota dociera do aplikacji tą samą drogą, w tym samym rytmie. Telefon bez zasięgu pracuje na kopii z ostatniego połączenia.
- **Panel nie liczy niczego po swojemu.** Czas blokowy, sumy, sygnatura operacji, stan oleju „do lotu" - wszystko przychodzi policzone tym samym rachunkiem, który zasila aplikację pilota. Administrator i pilot patrzą na te same liczby, a rozmowa o locie ma jedną nazwę: sygnaturę.
- **Adres z paska przeglądarki jest kompletny.** Zakres dat dziennika, filtr listy, otwarta karta konta albo operacji - wszystko stoi w adresie, więc link wklejony koledze pokazuje dokładnie to samo. Maszynę w dzienniku adresuje się znakami rejestracyjnymi, nie identyfikatorem.
- **Brak uprawnień to brak przycisku.** Konto bez prawa do zmian widzi karty z plakietką „tylko podgląd", bez przycisków zapisu. Dziś obie role są proste: pilot nie wchodzi do panelu, administrator ma w nim wszystko; role pośrednie mogą dojść w kolejnych wydaniach.

## Zasady w całym panelu

- **Panel pokazuje odczyty, nie szacunki.** Brak odczytu widać jako kreskę, nigdy jako zero: `0 L` znaczy pusty zbiornik, kreska - „nikt nie zapisał". Normy zużycia i szacowany poziom oleju nie wchodzą do dziennika.
- **Administratora nie ogranicza okno korekty.** Pilot poprawia własne wpisy przez 24 godziny od zdania; administrator kończy i unieważnia operacje w dowolnej chwili - także operację w toku.
- **Nic nie znika z dziennika.** Unieważnienie, zakończenie administracyjne i poprawa odczytów dopisują nowy fakt z powodem; stary zapis zostaje widoczny.
- **Skutek akcji nieodwracalnej mówi się przed nią.** Wyłączenie konta, usunięcie, zakończenie, unieważnienie - każde pyta o potwierdzenie i w pytaniu nazywa, co się stanie z dostępem i z danymi.
- **Puste pole wymagane blokuje zapis samym brakiem**, a powód innej blokady stoi w samym przycisku („Najpierw wyłącz konto", „Ktoś ma teraz ten samolot").
- **Operację nazywa sygnatura** (`SP-AXA/2026-09-05/TMK/1`: znak, doba UTC, kod pilota, numer operacji tego pilota w dobie) - ta sama w aplikacji pilota, w dzienniku i w zgłoszeniach.

> **Dlaczego tak.** Administrator nigdy nie jest blokowany, bo w klubie to on jest ostatnią instancją: telefon, który padł w locie, pilot, który zapomniał zdać samolot, wpis otwarty przez pomyłkę - każda z tych sytuacji musi mieć wyjście, także wtedy, gdy pilot wciąż trzyma maszynę. Kolizja z pilotem (operacja w toku, otwarte okno korekty) jest więc ostrzeżeniem, nie odmową. Twarde reguły dziennika obowiązują za to obu tak samo: operacja musi istnieć, unieważnić da się ją tylko raz, a zakończenie bez odczytów nie udaje zdania.

> **Założenie.** Panel odpowiada, nie tłumaczy. Nie ma w nim stałych banerów ani kart wyjaśniających - zostały trzy rodzaje tekstu: podpowiedź pod polem („Znaki z kadłuba, np. SP-KLM."), komunikat po akcji („Konto Anny Wrzosek wyłączone.") i powód blokady. Wszystko, co opisuje budowę systemu, mieszka w tym podręczniku, nie na ekranie.

## Czego w tym wydaniu nie ma

Panel ma dziś cztery moduły. Ekrany znane z wcześniejszej wersji - pulpit, skrzynka rozjazdów (flag), eksporty kart, dziennik akcji administratorów, statystyki i analityka zużycia - nie są dostępne i wracają pojedynczo w kolejnych wydaniach. Rozjazdy łańcucha odczytów UZ Aero nadal wykrywa i zapisuje przy każdej wysyłce z telefonu, a każda decyzja administratora zostawia ślad w dzienniku akcji - brakuje wyłącznie ekranów do ich przeglądania.

Nie ma też korekty pojedynczych zdarzeń z panelu (godzina startu, odczyt paliwa, skład zrzutu). Pilot poprawia własne wpisy przez 24 godziny od zdania w aplikacji ([ekran operacji i korekty](operacja-i-korekty)); administrator ma dziś trzy narzędzia: zakończenie i unieważnienie operacji w [dzienniku](panel-dziennik) oraz poprawę odczytów maszyny w [karcie samolotu](panel-samoloty).

## Częste problemy

- **„Nie ma połączenia z serwerem" albo przycisk Google się nie pojawia** → przeglądarka nie dosięga klubu: sprawdź internet i adres panelu; jeśli problem trwa, skontaktuj się z osobą, która wdrażała UZ Aero.
- **„Sesja wygasła. Zaloguj się jeszcze raz" w środku pracy** → minęło osiem godzin od zalogowania. Zaloguj się ponownie i wróć do tego samego adresu - zakres dat i otwarta karta są w nim zapisane.
- **Zmiana z panelu nie dotarła na telefon pilota** → telefon pobiera dane klubu przy najbliższym połączeniu, zwykle w ciągu kwadransa; bez zasięgu pracuje na kopii. Pilot może ponaglić pobranie przyciskiem **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji.
- **Pilot chce wejść do panelu i widzi „To konto nie ma dostępu do panelu"** → ma rolę pilota. Rolę zmienia się w karcie konta w module Piloci; po zmianie loguje się do panelu jeszcze raz.
