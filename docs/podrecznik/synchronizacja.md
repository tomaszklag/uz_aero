# Synchronizacja: jak zapisy trafiają do klubu

> Każde zdarzenie zapisuje się na telefonie w chwili, gdy zachodzi, a do klubu wychodzi w tle, gdy jest sieć. Ta strona tłumaczy, co dzieje się między tapnięciem w kokpicie a dziennikiem w panelu - i dlaczego brak zasięgu niczego nie zatrzymuje.

## Zapis powstaje na telefonie

Uruchomienie silnika, wykryty start, odczyt przy zdaniu, korekta - każde z nich jest zdarzeniem, które telefon zapisuje od razu, z czasem z własnego zegara i z GPS, jeśli ma pozycję. Mój dzień, Poprzednie dni i ekran operacji liczą się wyłącznie z tego lokalnego zapisu, dlatego są zawsze aktualne i nie czekają na serwer. Rejestr dopisuje, nie nadpisuje ([korekty i rejestr](korekty-i-rejestr)).

@screen 05-cockpit-running "Zdarzenie powstaje w kokpicie" | 10-statystyki "Oś zdarzeń operacji"

> **Założenie.** Dlaczego sieć jest okazją, nie warunkiem. Lądowisko w polu, hangar bez wi-fi, kabina w locie: aplikacja pracuje tam, gdzie zasięgu bywa najmniej, a fakt lotu jest cenniejszy niż natychmiastowe potwierdzenie z serwera. Sieć jest więc chwilą, w której telefon oddaje klubowi to, co ma. Warunkiem zostaje tylko to, czego bez sieci nie da się zrobić uczciwie: pierwsze logowanie (potwierdzenie tożsamości) i obejrzenie [śladu GPS](slad-gps), który wraca z serwera.

> **Założenie.** Jeden telefon, jeden pilot: zapisy operacji powstają wyłącznie na telefonie dowódcy, a pozostali piloci widzą zajęty samolot tylko w podglądzie. Dlatego jednego dnia lotnego nie prowadzi się na dwóch telefonach.

## Kolejka wysyłki

Zdarzenia, których klub jeszcze nie dostał, tworzą kolejkę. Wysyła się sama, paczkami: po odzyskaniu sieci i co jakiś czas w tle. Serwer rozpoznaje zapis, który już ma, więc paczka wysłana dwa razy niczego nie dubluje. Serwer nie odrzuca faktów z terenu: zapis, który nie zgadza się z resztą dziennika (nakładające się operacje, cofnięty licznik), oznacza dla administratora, zamiast blokować pilota. Na końcu każdej wysyłki tą samą drogą wychodzą nagranie śladu GPS (telefon kasuje kopię po potwierdzeniu) i zgłoszenia z aplikacji.

@screen 12-historia "Plakietka zaległości na kafelku"

## Wskaźnik łączności

Plakietka w nagłówku pojawia się tylko wtedy, gdy coś stoi - stan „wszystko wysłane" nie dostaje żadnego znaku.

| Plakietka | Co znaczy | Co dalej |
|---|---|---|
| brak plakietki | kolejka pusta albo wyjdzie przy najbliższej okazji | nic |
| **OFFLINE · n** (bursztyn) | ostatnia próba nie dotarła do serwera; n zdarzeń czeka | nic - przejdzie samo z zasięgiem |
| **SYNC STOI · n** (czerwony) | serwer odpowiedział i odmówił albo wygasła sesja; kolejka sama nie ruszy | tapnij plakietkę i zrób to, co mówi baner |

@screen 01c-moj-dzien-offline "OFFLINE · kolejka czeka" | 01d-sync-stoi "SYNC STOI · serwer odmówił"

> **Dlaczego tak.** Bursztyn znaczy w UZ Aero „poczekaj, samo przejdzie", więc odmowy serwera nie wolno nazwać „offline": sieć jest, a kolejka mimo to stoi. Czerwony baner nazywa powód, uspokaja („Twoje zapisy są bezpieczne w telefonie"), podaje kod odmowy do przeczytania administratorowi i kończy się drogą wyjścia: przy odmowie „Zgłoś to administratorowi", przy wygasłej sesji „Zaloguj się ponownie".

### Arkusz pod plakietką

Tapnięcie otwiera arkusz „Synchronizacja": liczba zdarzeń w kolejce, **Ostatnia próba** z godziną i wynikiem („wysłano 3", „brak sieci", „odrzucone", „sesja wygasła"), **Ostatnia udana synchronizacja** i wiek danych referencyjnych. **PONÓW PRÓBĘ** robi to samo, co **SYNCHRONIZUJ TERAZ** w [ustawieniach](ustawienia): dopycha kolejkę oraz pobiera dane z panelu i decyzje administratora bez czekania na zwykły odstęp. Ponowienie z ręki czeka na odpowiedź do pół minuty zamiast kilku sekund, bo uśpiony serwer potrzebuje chwili na obudzenie, a pilot stoi i patrzy. Każda próba, także nieudana, zostawia ślad w wierszu „Ostatnia próba"; po udanej arkusz zostaje otwarty ze zdaniem „Wysłano n".

@screen 13-ustawienia "Ten sam przycisk w ustawieniach"

## Drugi kierunek: z klubu na telefon

Przy każdym kontakcie z serwerem telefon także pobiera:

- **własne zapisy** - po czyszczeniu danych aplikacji, reinstalacji albo na nowym telefonie rejestr odbudowuje się z tego, co klub już dostał. Odbudowa zasila rejestr, nie ekran: Mój dzień dalej liczy się z telefonu, tylko do pierwszego pobrania nie pokazuje stanu „dziś bez lotów". Operacja trwająca w chwili awarii nie wraca jako bieżąca - maszynę bierze się ponownie zwykłym **ROZPOCZNIJ LOT**;
- **decyzje administratora** - zakończenie operacji, unieważnienie wpisu i poprawa odczytów maszyny. Zanim telefon wyśle zaległości, pyta o nie serwer. Jeśli administrator zakończył albo unieważnił operację, którą właśnie prowadzisz, kokpit wraca na Mój dzień, a zaległe zapisy tej operacji nie wychodzą: baner z przyciskiem **ROZUMIEM** mówi, która to operacja, z jakim powodem i ile zapisów zostanie tylko na telefonie;
- **dane referencyjne** - flota, piloci i przekazanie z ostatniego zdania, odświeżane w tle nie częściej niż co kwadrans, na żądanie od razu. Bez sieci aplikacja pracuje na kopii z bursztynową adnotacją „Ostatnie pobrane" i datą przy wartości; pusta flota nie czeka na kwadrans.

@screen 02d-preflight-offline "Dane z ostatniego połączenia"

> **Uwaga.** Odbudowa przywraca to, co klub już ma. Zapisy, które stały jeszcze w kolejce, nie mają skąd wrócić - dlatego wylogowanie jest zablokowane, dopóki kolejka nie jest pusta.

## Wygasła sesja to nie wylogowanie

Sesja z serwerem służy wyłącznie do rozmowy z nim. Praca na telefonie jej nie potrzebuje, a aplikacja nigdy sama nie wyrzuca do ekranu logowania - wygasła sesja odświeża się przy najbliższej sieci. Gdy się to nie uda, kolejka stoi z plakietką **SYNC STOI** i prośbą o ponowne zalogowanie; zapisy czekają nietknięte. Więcej: [konta i bezpieczeństwo](konta-i-bezpieczenstwo); dzień bez zasięgu krok po kroku: [praca bez zasięgu](praca-bez-zasiegu).
