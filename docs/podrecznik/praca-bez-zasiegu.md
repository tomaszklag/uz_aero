# Praca bez zasięgu

> Brak sieci nigdy nie blokuje pracy pilota. Wszystko zapisuje się na telefonie i wychodzi do klubu samo, gdy wróci zasięg. Sieć jest okazją do wysyłki, nie warunkiem.

@screen 01c-moj-dzien-offline "Bez sieci · kolejka czeka" | 01d-sync-stoi "Serwer odmówił"

## Co działa bez internetu

Wszystko, co dotyczy operacji: wejście PIN-em, rozpoczęcie lotu, kokpit z wykrywaniem startów i lądowań, tankowanie i olej, zdanie samolotu, wpis lotu po fakcie, korekty, Mój dzień i Poprzednie dni. Norma zużycia, werdykty i sygnatura operacji też liczą się na telefonie - z Twojego lokalnego zapisu, bez pytania serwera o cokolwiek.

## Co wymaga sieci

- **Pierwsze logowanie** i logowanie po „Nie pamiętam PIN" - to jedyny moment, w którym telefon musi potwierdzić, kim jesteś.
- **Wylogowanie** - i dopiero wtedy, gdy kolejka wysyłki jest pusta.
- **Ślad GPS na mapie** - wraca z serwera ([więcej](slad-gps)).
- **Świeże dane z klubu**: lista floty i pilotów, przekazanie z ostatniego zdania cudzej operacji, podpowiedzi odczytów we wpisie po fakcie. Bez sieci aplikacja pracuje na kopii z ostatniego połączenia i mówi o tym przy samej wartości - bursztynową adnotacją **Ostatnie pobrane** z datą. Gdy nie ma nawet kopii, pisze „Brak danych - wpisz z licznika".

Żadna z tych rzeczy nie zatrzymuje lotu. Odczyty z przyrządów są ważniejsze od podpowiedzi, a rozjazd z przekazaniem jest ostrzeżeniem, nie blokadą - patrz [łańcuch odczytów](lancuch-odczytow).

## Wskaźnik łączności

Plakietka w nagłówku istnieje tylko wtedy, gdy coś stoi. Stan „wszystko wysłane" nie dostaje żadnego znaku - świecąca cały czas plakietka uczyłaby oko pomijać ten róg ekranu.

| Plakietka | Znaczenie | Co zrobić |
|---|---|---|
| brak plakietki | wszystko wysłane albo wyjdzie przy najbliższej okazji | nic |
| **OFFLINE · n** (bursztyn) | ostatnia próba wysyłki nie dotarła do serwera; n zapisów czeka | nic - przejdzie samo z zasięgiem |
| **SYNC STOI · n** (czerwony) | serwer odpowiedział i odmówił albo wygasła sesja; kolejka sama nie ruszy | tapnij plakietkę: baner nazywa powód, podaje kod dla administratora i drogę wyjścia |

Tapnięcie otwiera arkusz „Synchronizacja": ile zapisów czeka w kolejce, **Ostatnia próba** z godziną i wynikiem („brak sieci", „odrzucone"), **Ostatnia udana synchronizacja**, wiek danych pobranych z panelu oraz przycisk **PONÓW PRÓBĘ**. Ponowienie robi to samo, co **SYNCHRONIZUJ TERAZ** w [ustawieniach](ustawienia).

> **Dlaczego tak.** „OFFLINE" znaczy wynik ostatniej próby, a nie samą obecność zapisów w kolejce. Bursztyn mówi w tej aplikacji „poczekaj, samo przejdzie", więc odmowy serwera nie wolno tak nazwać: sieć wtedy jest, a kolejka mimo to stoi i sama nie ruszy. Dlatego ten stan ma osobny, czerwony kolor.

## Ponowienie z ręki czeka dłużej

Wysyłka w tle rezygnuje po kilku sekundach - przy słabym zasięgu lepiej szybko powiedzieć „offline" i wrócić za chwilę. **PONÓW PRÓBĘ** czeka nawet pół minuty, bo sięgasz po nie dokładnie wtedy, gdy długo nic nie szło, a serwer klubu potrzebuje chwili na obudzenie. Każda próba, także nieudana, zmienia wiersz **Ostatnia próba** - żeby dało się odróżnić przycisk, który nic nie zrobił, od próby, która się nie powiodła. Po udanej wysyłce arkusz zostaje otwarty ze zdaniem o tym, ile zapisów poszło.

## Decyzje administratora docierają przy pierwszym połączeniu

Zanim telefon wyśle zaległe zapisy, **pyta klub o decyzje z panelu**. Jeśli administrator zakończył albo unieważnił operację, którą właśnie prowadzisz, kokpit sam wraca na Mój dzień, a zaległe zapisy tej operacji nie wychodzą - baner z przyciskiem **ROZUMIEM** mówi, która to operacja, z jakiego powodu i ile zapisów zostanie tylko na telefonie.

## Jak to działa

Każde zdarzenie - przejęcie, uruchomienie silnika, wykryty start, tankowanie, zdanie, korekta - zapisuje się na telefonie w chwili, gdy zachodzi, i od razu liczy się do wszystkiego, co widzisz na ekranie. Zapisy, których klub jeszcze nie dostał, tworzą kolejkę: wysyła się sama, paczkami, po odzyskaniu sieci i co jakiś czas w tle. Paczka wysłana dwa razy niczego nie dubluje, bo serwer rozpoznaje zapis, który już ma. Klub nie odrzuca faktów z terenu - wpis, który nie zgadza się z resztą dziennika, dostaje oznaczenie do wyjaśnienia dla administratora, zamiast blokować pilota. Tą samą drogą, na końcu każdej wysyłki, wychodzą nagrania śladu i zgłoszenia z aplikacji. W drugą stronę telefon pobiera własne zapisy (po reinstalacji albo na nowym telefonie), decyzje administratora i dane referencyjne. Mechanizm w całości: [synchronizacja](synchronizacja).

> **Założenie.** Jeden telefon, jeden pilot. Zapisy Twojego dnia powstają na tym telefonie, na którym latasz - to on jest ich źródłem, dopóki nie wyśle ich do klubu. Dlatego jednego dnia lotnego nie prowadzi się na dwóch telefonach, a wylogowanie jest zablokowane przy niepustej kolejce: to, co jeszcze nie doszło, nie ma skąd wrócić.

## Częste problemy

- **Plakietka mówi OFFLINE, choć mam zasięg** → ostatnia próba nie doszła; bywa tak przy słabym połączeniu albo gdy serwer klubu dopiero się budzi. Tapnij plakietkę i **PONÓW PRÓBĘ** - to ponowienie czeka dłużej niż wysyłka w tle.
- **Czerwone SYNC STOI** → serwer odpowiedział i odmówił albo trzeba zalogować się ponownie. Twoje zapisy są bezpieczne na telefonie. Zrób to, co mówi baner; przy odmowie przekaż administratorowi kod, który w nim stoi.
- **Tapnąłem PONÓW PRÓBĘ i nic się nie zmieniło** → sprawdź wiersz **Ostatnia próba**: jeśli ma świeżą godzinę i wynik, przycisk zadziałał, a próba się nie powiodła.
- **Zmieniam telefon albo odinstalowuję aplikację** → najpierw doprowadź kolejkę do stanu pustego. Zapisy, które nie zdążyły wyjść, istnieją wyłącznie na starym telefonie.
- **Bez sieci nie widzę śladu lotu** → to jedyna rzecz, która do obejrzenia wymaga połączenia. Czasy, loty i rozliczenie operacji widać mimo to.
