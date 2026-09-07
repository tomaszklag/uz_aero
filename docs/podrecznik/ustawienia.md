# Ustawienia

> Wejście do ustawień jest jedno: zębatka na ekranie Mój dzień. Kokpit ma w tym miejscu przełącznik jasności.

@screen 13-ustawienia "Ustawienia"

## Co gdzie stoi

| Sekcja | Co zawiera |
|---|---|
| **Motyw wyświetlacza** | Dwie pozycje obok siebie: **Ciemny** (domyślny) i **Jasny** - na pełne słońce. To samo przełącza ikona w prawym górnym rogu kokpitu. |
| **Synchronizacja** | Stan kolejki wysyłki („pusta" albo „3 zdarzenia czeka"), godzina ostatniej synchronizacji i przycisk **SYNCHRONIZUJ TERAZ**. |
| **Diagnostyka GPS** | Stan odbiornika, godzina i wiek ostatniego odczytu, dokładność w metrach, pozycja, licznik nagranych punktów śladu oraz **Odśwież**. |
| **O aplikacji** | Wersja aplikacji - do porównania ze [stroną pobierania](~/pobierz/). |
| **Bezpieczeństwo** | **Zmień PIN**: najpierw obecny, potem nowy. Po zmianie stary PIN przestaje działać od razu. |
| **Konto** | Twoje imię i kod pilota oraz **Wyloguj i zmień konto** - na samym końcu ekranu. |

## Synchronizacja

Wysyłka działa sama w tle, więc ten przycisk jest ponagleniem na wypadek, gdy coś stoi dłużej, niż powinno. **SYNCHRONIZUJ TERAZ** popycha kolejkę i w tej samej chwili pyta klub o świeże dane: flotę, pilotów, przekazania samolotów i decyzje administratora. Bez połączenia przycisk jest nieaktywny, a powód stoi w nim samym.

Wiersz **Ostatnia synchronizacja** to godzina ostatniego udanego kontaktu z klubem - w którąkolwiek stronę. Poza dzisiejszą dobą UTC dochodzi do niej data, bo sama godzina przy stemplu sprzed dwóch dni niczego nie mówi.

> **Wskazówka.** Liczba zapisów w kolejce i wiek danych pobranych z panelu stoją w arkuszu pod plakietką łączności w nagłówku, nie na tym ekranie. Więcej: [praca bez zasięgu](praca-bez-zasiegu).

## Diagnostyka GPS

Sekcja czyta odbiornik telefonu wprost i z siecią nie ma nic wspólnego. Zaglądasz tu wtedy, gdy kokpit przestał wykrywać starty i lądowania: **Status** mówi, czy jest ustalona pozycja (`FIX`), czy odbiornik milczy, czy aplikacja w ogóle nie dostała zgody na lokalizację. **Dokładność** poniżej kilkunastu metrów to normalna praca; **Ostatni fix** starszy niż kilkanaście sekund oznacza, że wykrywanie faz jest wstrzymane i start z lądowaniem trzeba zapisać przyciskami. Więcej: [wykrywanie faz lotu](wykrywanie-faz-lotu).

## PIN i konto

Obie sekcje dotyczą dostępu do aplikacji i dlatego stoją razem, na końcu. PIN zmienia się bez internetu - sprawdza go telefon. Wylogowanie internetu wymaga, bo ponowne wejście to logowanie kontem Google, a konta zakłada administrator klubu. Więcej: [pierwsze logowanie](pierwsze-logowanie).

> **Dlaczego tak.** Wylogowanie jest zablokowane, dopóki w kolejce czeka choć jeden zapis. Niewysłane zapisy dnia istnieją wyłącznie na tym telefonie - wylogowanie zostawiłoby je bez właściciela. Wróć do zasięgu: wyślą się same i przycisk odblokuje się sam.

## Jak to działa

Cały ekran pracuje na tym, co telefon ma u siebie: wybór motywu, PIN i stan odbiornika GPS nie potrzebują serwera ani przez chwilę. Motyw jest preferencją pilota, więc zapisuje się w Twoim profilu i wraca po zalogowaniu na innym telefonie. Godzina synchronizacji jest jedna, choć mechanizm ma dwa kierunki - wysyłkę zapisów i pobranie danych z panelu; ekran pokazuje ten późniejszy, bo pytanie brzmi „od kiedy nie mam kontaktu z klubem", a nie „który kierunek zadziałał". Jedyną akcją, która wymaga sieci, jest wylogowanie. Mechanizm w całości: [synchronizacja](synchronizacja).

> **Założenie.** W ustawieniach nie ma nic, co dotyczy bieżącej operacji - samolotu, trasy ani lotów. To są dane dnia lotnego i mieszkają w kokpicie oraz na ekranie Mój dzień.

> **Wskazówka.** Zgłoszenia błędu nie szukaj w ustawieniach. Na czas testów z pilotami przycisk stoi w prawym górnym rogu każdego ekranu i każdego arkusza - poza ekranem logowania i PIN-em.

## Częste problemy

- **SYNCHRONIZUJ TERAZ jest nieaktywny** → telefon nie ma połączenia; powód stoi w przycisku. Synchronizacja ruszy sama, gdy wróci zasięg.
- **„Ostatnia synchronizacja" pokazuje godzinę sprzed wielu godzin** → tyle czasu telefon nie rozmawiał z klubem. Jeśli sieć jest, tapnij **SYNCHRONIZUJ TERAZ**; jeśli kolejka nadal stoi, sprawdź plakietkę łączności w nagłówku.
- **Diagnostyka pokazuje brak uprawnień do lokalizacji** → zgoda została cofnięta w ustawieniach Androida. Przywróć ją; do tego czasu starty i lądowania zapisuj przyciskami w kokpicie.
- **Wyloguj i zmień konto jest nieaktywne** → w kolejce czekają zapisy. Wróć do zasięgu i poczekaj, aż plakietka łączności zniknie.
- **Nie widzę zębatki** → jesteś w kokpicie. Ustawienia mają jedno wejście - ekran Mój dzień; w kokpicie w tym samym rogu stoi przełącznik jasności.
