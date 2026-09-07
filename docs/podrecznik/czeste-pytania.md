# Częste pytania

> Krótkie odpowiedzi na pytania, które padają najczęściej w pierwszych tygodniach z UZ Aero - pilota i administratora klubu.

## Logowanie i konto

### Jak założyć konto?

W aplikacji jest jeden przycisk: **Kontynuuj z Google**. Jeśli klub nie zna Twojego adresu, powstaje zgłoszenie, a administrator zatwierdza je, nadając Ci kod pilota - do tej chwili aplikacja pokazuje ekran oczekiwania i sprawdza stan sama. Potem codziennym wejściem jest PIN, a **Nie pamiętam PIN** pod klawiaturą oznacza ponowne logowanie kontem Google, czyli internet. Krok po kroku: [pierwsze logowanie](pierwsze-logowanie).

### Zgłoszenie zostało odrzucone. Co dalej?

Na ekranie stoi powód napisany przez administratora - to on mówi, co zrobić. Najczęściej chodzi o konto prywatne zamiast klubowego: wyjdź przez **Zaloguj innym kontem** i spróbuj właściwym adresem. Ponowne zgłoszenie tym samym kontem trafi na tę samą decyzję.

### Czy mogę latać na drugim telefonie?

Możesz zalogować się na innym telefonie (wymaga internetu), ale zapisy powstają na tym telefonie, na którym latasz, i to on musi je wysłać. Nie prowadź jednego dnia lotnego na dwóch telefonach naraz. Więcej: [synchronizacja](synchronizacja).

### Kto widzi moje dane?

Klub, w którym latasz: administrator widzi w panelu dziennik operacji, ślady i zgłoszenia z aplikacji. Z konta Google aplikacja bierze imię i adres e-mail - do założenia i rozpoznania konta. Szczegóły: [konta i bezpieczeństwo](konta-i-bezpieczenstwo) oraz [polityka prywatności](~/prywatnosc.html).

## Dzień lotny

### Czym różni się lot od operacji?

Operacja to jeden bieg silnika: od przejęcia samolotu do jego zdania. Lot to odcinek od startu do lądowania - w jednej operacji może ich być wiele, także kręgi. Pełny model: [operacja, lot i doba pilota](model-operacji).

### Zgasiłem silnik, a chcę lecieć jeszcze raz

Po STOP ENGINE drugiego uruchomienia w tej samej operacji nie ma - głównym przyciskiem kokpitu staje się **ZDAJ SAMOLOT**. Kolejny lot to nowe przejęcie: trzy kroki z Twoimi własnymi odczytami już wpisanymi. Dzięki temu każda operacja ma odczyty z obu stron ([kokpit](kokpit)).

### Aplikacja nie wykryła startu albo lądowania

W locie użyj przycisku ręcznego w kokpicie - wymaga przytrzymania przez sekundę. Po zatrzymaniu silnika, jeszcze przed zdaniem, kafelek **Popraw dane operacji** pozwala dopisać brakujące zdarzenie; po zdaniu robi to **DODAJ WPIS** w trybie edycji. Jak działa automat: [wykrywanie faz lotu](wykrywanie-faz-lotu).

### Skąd aplikacja wie, ile paliwa jest w samolocie?

Z ostatniego zdania samolotu - poprzedni pilot wpisał odczyt, który staje się Twoim przekazaniem - a po biegu silnika liczy szacunek z normy maszyny. Podpowiedź jest podpowiedzią: paliwomierz ma rację i to jego odczyt wpisujesz. Więcej: [łańcuch odczytów](lancuch-odczytow).

### Nie poleciałem - pogoda. Zdawać samolot?

Tak. Zdanie ma wariant **bez lotu**: powód z listy i opcjonalny komentarz dla administratora. Jeśli nic się nie zmieniło - żadnego biegu silnika, dolewki ani innego odczytu - ekran uprzedzi, że taki zapis nigdzie nie trafi, ale zdania nie zablokuje: maszynę trzeba oddać ([zdanie samolotu](zdanie-samolotu)).

## Po locie

### Wpisałem złą liczbę przy zdaniu. Da się poprawić?

Tak, przez 24 godziny od zdania: kafelek operacji → **EDYTUJ DANE** → ołówek przy wierszu „Zdanie" → nowa wartość i opcjonalny powód. Stara liczba nie ginie - przy poprawionej staje plakietka **popr.** z całą historią zmian. Więcej: [ekran operacji i korekty](operacja-i-korekty).

### Minęły 24 godziny, a liczba jest zła

Ekran operacji otwiera się wtedy w podglądzie: bez **EDYTUJ DANE**, ale z pełnym rachunkiem i historią zmian. Poprawkę zgłoś administratorowi - jego okna korekty nic nie zamyka ([korekty i rejestr](korekty-i-rejestr)).

### Odjechałem, a samolotu nie zdałem. Co teraz?

Jeśli masz odczyty paliwa i motogodzin (zdjęcie, notatka), zdaj samolot z miejsca, w którym jesteś - czas blokowy liczy się z biegu silnika, nie z chwili zdania. Jeśli odczytów nie masz, poproś administratora o zakończenie operacji z panelu; do zdania albo zakończenia maszyna jest dla innych pilotów zajęta.

### Dlaczego wczorajszy wieczorny lot stoi pod dzisiejszą datą?

Bo doba w UZ Aero liczy się w UTC, a operacja należy do doby, w której uruchomiono silnik. Latem lot po godzinie 02:00 czasu polskiego jest już w następnej dobie UTC, a lot o 01:30 - w poprzedniej ([model operacji](model-operacji)).

### Nie widzę śladu na mapie

Ślad wraca z serwera, więc jako jedyna rzecz po locie wymaga zasięgu. Ekran nie zwija powodów do jednego: mówi, czy chodzi o lot wpisany po fakcie, o nagranie czekające jeszcze w kolejce, o brak nagrania, czy o brak sieci. Więcej: [ślad GPS](slad-gps).

### Jak wpisać lot, którego nie było na telefonie?

Na Moim dniu stoi **DODAJ LOT RĘCZNIE** - cztery kroki: data i samolot, zadanie, czasy i loty, liczniki. Kręgi podaje się liczbą przy lądowaniu, a nie parami godzin. Taki wpis nie ma śladu GPS i niesie plakietkę **RĘCZNIE**: [wpis lotu po fakcie](wpis-lotu-po-fakcie).

## Bez zasięgu

### Czy aplikacja działa bez internetu?

Tak - wszystko, co dotyczy lotu, działa bez sieci: wejście PIN-em, rozpoczęcie lotu, kokpit, zdanie samolotu, korekty. Zapisy czekają w kolejce i wychodzą same, gdy wróci zasięg. Sieci wymagają tylko pierwsze logowanie, wylogowanie i ślad GPS na mapie. Więcej: [praca bez zasięgu](praca-bez-zasiegu).

### Co znaczy czerwone „SYNC STOI"?

Serwer odpowiedział i odmówił przyjęcia zapisów albo wygasła sesja - kolejka sama nie ruszy. Tapnij plakietkę: baner nazywa powód, podaje kod odmowy dla administratora i drogę wyjścia. Twoje zapisy są bezpieczne na telefonie. Bursztynowe **OFFLINE · n** znaczy co innego: ostatnia próba nie dotarła i przejdzie sama, gdy wróci zasięg ([synchronizacja](synchronizacja)).

### Nie mogę się wylogować

Wylogowanie jest zablokowane, dopóki kolejka wysyłki nie jest pusta - zapisy, które nie doszły do klubu, istnieją tylko na tym telefonie i przepadłyby razem z profilem. Znajdź zasięg, poczekaj, aż plakietka zgaśnie, i spróbuj jeszcze raz ([konta i bezpieczeństwo](konta-i-bezpieczenstwo)).

## Panel klubu

### Jak wpuścić nowego pilota?

W module [Piloci](panel-piloci) nad listą stoi kolejka zgłoszeń - **Rozpatrz**, kod pilota, rola, **Zatwierdź i załóż konto**. Znanego pilota można też dopisać zawczasu, razem z adresem jego konta Google: pierwsze logowanie podepnie się wtedy bez kolejki. Odrzucenie wymaga powodu, bo pilot czyta go na swoim ekranie.

### Samolot jest zajęty przez pilota, który go nie zdał

Otwórz tę operację w [dzienniku](panel-dziennik) i użyj **Zakończenia operacji** z powodem - maszyna zwolni się od razu, a pilot dostanie na telefonie baner z wyjaśnieniem. Zakończona tak operacja nie ma odczytów końcowych, więc aktualny stan licznika, paliwa i oleju wpisz potem w [karcie samolotu](panel-samoloty).

### Czy mogę poprawić godzinę startu z panelu?

W tym wydaniu nie: panel ma dwa wyjścia awaryjne - zakończenie operacji i unieważnienie wpisu. Pojedyncze zdarzenia i odczyty poprawia pilot w aplikacji przez 24 godziny od zdania; stan maszyny na teraz ustawia **Popraw odczyty** w karcie samolotu ([korekty i rejestr](korekty-i-rejestr)).

### Mam uwagę do aplikacji. Gdzie ją zgłosić?

Przyciskiem w prawym górnym rogu ekranu albo arkusza - zgłoszenie zabiera ze sobą kontekst (ekran, operacja, samolot, wersja aplikacji) i wysyła się samo, gdy jest sieć. Administrator czyta je w module Zgłoszenia w [panelu](panel-wprowadzenie) i nadaje im status.
