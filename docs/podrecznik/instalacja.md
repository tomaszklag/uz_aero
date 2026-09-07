# Instalacja i aktualizacje

> Aplikacja pilota to plik APK na Androida, instalowany bezpośrednio - bez sklepu Play. Nowa wersja pojawia się zawsze pod tym samym adresem.

## Pobranie i instalacja

1. Na telefonie otwórz [stronę pobierania](~/pobierz/) i tapnij **Pobierz na Androida**. Strona podaje aktualną wersję i numer wydania, na przykład `1.0.0 (build 1)`.
2. Otwórz pobrany plik. Android zapyta o zgodę na instalowanie aplikacji spoza sklepu Play dla tego źródła (przeglądarka albo menedżer plików) - zezwól.
3. Uruchom UZ Aero i przejdź do [pierwszego logowania](pierwsze-logowanie).

@screen 00a-login-full "Pierwszy ekran po instalacji"

> **Wskazówka.** Do pierwszego logowania i do wysyłki danych potrzebny jest internet. Do samego latania - nie. Zaloguj się przy sieci (hangar, dom), zanim pojedziesz w teren.

## Zgody, o które prosi aplikacja

- **Lokalizacja** - aplikacja poprosi o nią przy rozpoczęciu lotu. Bez niej kokpit nie wykryje kołowania, startów ani lądowań i nie powstanie ślad na mapie. Wystarcza zgoda „podczas używania aplikacji".
- **Powiadomienia** - podczas pracy silnika Android pokazuje powiadomienie „UZ Aero - rejestracja lotu". To ono utrzymuje zapis śladu przy wygaszonym ekranie i gaśnie samo po zatrzymaniu silnika.

@screen 05g-cockpit-no-gps "Kokpit bez sygnału GPS" | 05f-zdarzenie-reczne "Ręczny zapis startu"

> **Dlaczego tak.** Aplikacja nie prosi o dostęp do lokalizacji „w tle". Zapis przy wygaszonym ekranie utrzymuje właśnie to widoczne powiadomienie - pilot ma widzieć, że telefon nagrywa, a nie domyślać się tego. Nagrywanie w tle działa wyłącznie w czasie pracy silnika; po jego zatrzymaniu powiadomienie gaśnie samo.

## Aktualizacja

Aktualizacja to instalacja nowego pliku z tej samej [strony pobierania](~/pobierz/) - na istniejącą aplikację, bez odinstalowywania. Dane na telefonie zostają: profil, PIN, zapis operacji i kolejka wysyłki. O nowych wersjach informuje strona [wydania i zmiany](~/wydania/); tam też stoi, kiedy aktualizacja wymaga czegoś więcej, na przykład ponownego zalogowania. Wersję, którą masz, podaje sekcja „O aplikacji" w [ustawieniach](ustawienia).

@screen 13-ustawienia "Wersja w sekcji O aplikacji"

## Jak to działa

Aplikacja trzyma na telefonie własny zapis Twoich operacji i wysyła go do klubu w tle. Nowa wersja instaluje się na ten sam zapis, więc nic z niego nie ginie - także wtedy, gdy w kolejce czekają niewysłane zdarzenia. Gdy aplikację odinstalujesz albo wyczyścisz jej dane, zapis na telefonie znika, ale to, co zdążyło dojść do klubu, wraca po ponownym zalogowaniu: aplikacja pobiera komplet Twoich operacji przy pierwszym połączeniu. Ślady GPS i tak ogląda się z serwera, więc wracają zawsze. Nie wracają tylko te zdarzenia, które nie zdążyły wyjść z kolejki wysyłki - ich jedynym egzemplarzem był stary telefon. Więcej: [synchronizacja](synchronizacja).

> **Uwaga.** Przed odinstalowaniem albo zmianą telefonu sprawdź, czy kolejka wysyłki jest pusta: brak plakietki łączności w nagłówku i wiersz „Kolejka wysyłki · pusta" w [ustawieniach](ustawienia).

@screen 01c-moj-dzien-offline "Kolejka wysyłki przed zmianą telefonu"

## Wymagania

- Telefon z Androidem i konto Google - służy do pierwszego logowania; haseł w UZ Aero nie ma.
- Zgoda na dostęp do lokalizacji i na powiadomienia.
- Internet przy pierwszym logowaniu i do wysyłki danych - nie w locie.

> **Założenie.** Brak GPS nie blokuje pracy: kokpit ma przyciski ręczne do startu i lądowania, a lot można też [wpisać po fakcie](wpis-lotu-po-fakcie). Bez GPS nie powstanie tylko ślad na mapie i trzeba samemu zapisać starty i lądowania.

## Częste problemy

- **Android nie pozwala zainstalować pliku** → w komunikacie systemowym zezwól tej aplikacji (przeglądarce albo menedżerowi plików) na instalowanie aplikacji z nieznanych źródeł i otwórz plik jeszcze raz.
- **Po tapnięciu „Kontynuuj z Google" aplikacja mówi, że ta wersja nie ma skonfigurowanego logowania** → zainstaluj aktualny plik ze strony pobierania; jeśli to nie pomaga, zgłoś administratorowi.
- **Po ponownej instalacji aplikacja prosi o logowanie Google zamiast PIN-u** → to normalne: profil był w starej instalacji. Zaloguj się (wymaga internetu), ustaw PIN, a operacje wrócą z serwera przy pierwszym połączeniu.
- **Kokpit nie wykrywa startów, a diagnostyka pokazuje brak uprawnień** → zgoda na lokalizację została cofnięta w ustawieniach Androida. Przywróć ją; do tego czasu starty i lądowania zapisuj przyciskami.
- **Powiadomienie „rejestracja lotu" nie znika** → w aplikacji silnik jest wciąż uruchomiony. Zamknij bieg przyciskiem **STOP ENGINE** i [zdaj samolot](zdanie-samolotu).
- **Nie wiem, którą wersję mam** → sekcja „O aplikacji" w [ustawieniach](ustawienia) podaje wersję; porównaj ją ze stroną pobierania.
