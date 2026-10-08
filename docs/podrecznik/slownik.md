# Słownik pojęć

> Słowa, których używa aplikacja i panel - w znaczeniu, jakie mają w Ninerdeck.

## Operacja i lot

- **Operacja** - jedno uruchomienie silnika: od rozpoczęcia lotu do zdania samolotu. W jednej operacji może być wiele lotów. Po wyłączeniu silnika operacja się kończy - kolejny lot to nowa operacja.
- **Lot** - od startu do lądowania. Aplikacja rozpoznaje loty z GPS.
- **Kręgi (touch and go)** - przyziemienie i od razu kolejny start. W kokpicie każdy krąg to osobny lot; we wpisie po fakcie podaje się liczbę kręgów przy lądowaniu.
- **Rozpoczęcie lotu** - trzy kroki przed lotem: samolot i załoga, zadanie i trasa, liczniki. Kończy je przycisk **ROZPOCZNIJ LOT**.
- **Przejęcie samolotu** - wzięcie samolotu, którego inny pilot nie zdał, przyciskiem **PRZEJMIJ SAMOLOT** w podglądzie.
- **Zdanie samolotu** - koniec operacji z obowiązkowym odczytem paliwa i motogodzin. Zatwierdza zapis lotu i przekazuje samolot następnemu pilotowi.
- **Zdanie bez lotu** - zdanie samolotu, gdy silnik nie ruszył: z powodem (pogoda, usterka, odwołane, inne) i opcjonalnym komentarzem. Jeśli nic się nie zmieniło, nic się nie zapisuje.
- **Dowódca i drugi pilot** - dwa fotele w operacji. Dowódcy nie zmienia się w trakcie operacji; drugiego pilota można zmienić przed uruchomieniem silnika.
- **Zadanie** - rodzaj operacji: Skoki, Przelot, Egzamin, Lot techniczny, Inne. Przy skokach podaje się jedno lotnisko, przy pozostałych - skąd i dokąd.
- **Dzień skokowy** - operacja z zadaniem Skoki: jedno lotnisko, załadunki i zrzuty, zwykle kilka lub kilkanaście lotów w jednej operacji.
- **Załadunek** - wejście skoczków na pokład przed startem. Skład jest opcjonalny i podpowiada się przy zrzucie.
- **Zrzut** - wyniesienie skoczków w locie: skład i wysokość z GPS.
- **Wpis lotu po fakcie** - lot wpisany z pamięci albo z kartki, w czterech krokach. Ma oznaczenie **RĘCZNIE** i nie ma śladu na mapie.

## Czas

- **Czas blokowy (blok)** - czas od uruchomienia do wyłączenia silnika.
- **Czas lotu** - suma czasu w powietrzu wszystkich lotów operacji.
- **Loty · Blok · Lot** - trzy liczby przy operacji i w sumach dnia: liczba lotów, czas blokowy i czas lotu.
- **Doba UTC** - dzień w Ninerdeck zaczyna się o północy UTC. Operacja należy do doby, w której uruchomiono silnik.
- **UTC** - czas uniwersalny, w którym zapisuje się godziny lotów. Czas lokalny pojawia się jako podpowiedź przy wpisywanej godzinie.
- **Czas klubu** - strefa czasowa lotniska klubu. W niej podaje się godziny rezerwacji i zleceń.

## Rezerwacje i zlecenia

- **Rezerwacja** - zajęcie samolotu na określone godziny. Nie jest potrzebna do lotu.
- **Wyłączenie z użytku** - samolot niedostępny przez kilka godzin albo dni: przegląd, usterka. Ustawia je administrator w kalendarzu.
- **Sugerowane godziny** - propozycje terminów, które dobrze wypełniają dzień samolotu.
- **Ścieżka akceptacji** - kolejne kroki, w których wskazane osoby zatwierdzają rezerwację. W każdym kroku wystarczy zgoda jednej osoby. Klub bez ścieżki potwierdza rezerwacje od razu.
- **Zlecenie lotu** - termin i samolot wysłane przez koordynatora albo instruktora do wybranych pilotów, którzy odpowiadają na nie z telefonu. Po przyjęciu lot staje się rezerwacją pilota.
- **Adresat** - osoba, do której wysłano zlecenie: imiennie, przez grupę albo przez wspólną listę.
- **Wspólna lista** - zlecenie wysłane jednej liście osób na wszystkie szukane fotele naraz. Adresaci potwierdzają termin, a fotele przydziela osoba zlecająca.
- **Termin do potwierdzenia** - zlecenie, w którym adresat potwierdza sam termin, a fotel wybiera mu osoba zlecająca.
- **Grupa pilotów** - lista członków klubu, na przykład „Instruktorzy", do której wysyła się zlecenia. Grupy zakłada administrator w module Piloci.

## Samolot, paliwo i liczniki

- **Motogodziny (MH)** - licznik pracy silnika. Format licznika: dziesiętny (`3907.8`) albo godziny i minuty (`3907:48`).
- **Przekazanie** - odczyty paliwa i motogodzin z ostatniego zdania samolotu. Następny pilot widzi je przy rozpoczęciu lotu i porównuje z przyrządami.
- **Ciągłość odczytów** - zasada, że ile paliwa i motogodzin zostawił jeden pilot, tyle powinien zastać następny. Różnica jest ostrzeżeniem dla pilota i sprawą do wyjaśnienia dla klubu.
- **Stan początkowy** - licznik, paliwo i olej wpisane przez administratora przy dodawaniu samolotu. Pierwszy pilot zaczyna od tych wartości.
- **Poprawa odczytów** - nowy stan licznika, paliwa i oleju wpisany przez administratora z komentarzem, gdy dziennik nie zgadza się z rzeczywistością.
- **Minimum oleju** - najmniejsza ilość oleju przed lotem, ustawiona w karcie samolotu.
- **Norma zużycia** - oczekiwane zużycie paliwa i przyrost motogodzin samolotu: na początku z dokumentacji, z czasem wyliczone z lotów tego samolotu.
- **Ocena wobec normy** - oznaczenie **✓ W NORMIE**, **↑ POWYŻEJ NORMY** albo **↓ PONIŻEJ NORMY** przy paliwie i motogodzinach operacji. Niczego nie blokuje.
- **Szacunek z normy** - podpowiedź, ile paliwa albo oleju powinno zostać, liczona z normy i czasu pracy silnika. Wpisujesz zawsze to, co pokazuje przyrząd.
- **Poza służbą** - samolot trwale wycofany przez klub. Nie ma go na liście wyboru, ale jego loty zostają w dzienniku.
- **Karta samolotu** - w aplikacji: stan samolotu, liczniki, terminy i historia lotów dla osób z uprawnieniem „Obserwowanie samolotów". W panelu: ustawienia samolotu - pojemności, normy, format licznika.
- **Obserwowanie samolotu** - włączone na karcie samolotu daje powiadomienia o jego lotach.

## Zapis i poprawki

- **Sygnatura operacji** - nazwa operacji, na przykład `SP-AXA/2026-09-05/AKO/1`: znaki samolotu, data (doba UTC), kod dowódcy i numer operacji tego dowódcy w tej dobie.
- **Kod pilota** - krótki kod, na przykład `AKO`, nadany przez klub. Podpisuje operacje i stoi w sygnaturze.
- **Czas na poprawki** - 24 godziny od zdania samolotu, w których pilot poprawia własne wpisy. Później poprawki wprowadza administrator.
- **Oznaczenie „popr."** - znak przy poprawionej wartości. Tapnięcie otwiera historię zmian: co było, co jest, kto zmienił i dlaczego.
- **Usunięcie wpisu** - pilot usuwa całą operację w trybie edycji, na przykład gdy lot jest wpisany dwa razy. Wpis przestaje się liczyć, ale administrator nadal go widzi.
- **Unieważnienie** - to samo z panelu: administrator wycofuje operację z wymaganym powodem.
- **Zakończenie przez administratora** - zakończenie w panelu operacji, której pilot nie zdał. Zwalnia samolot i liczy się do nalotu, ale nie ma odczytów końcowych.
- **Ślad GPS** - zapis trasy całej operacji: mapa, wykres wysokości i statystyki.
- **Rozjazd** - niezgodność między zapisami, na przykład inne paliwo przy rozpoczęciu lotu niż przy poprzednim zdaniu. Trafia do modułu „Do sprawdzenia" w panelu.
- **Karta dnia** - dokument jednego dnia jednego samolotu dla klubu, z operacjami, lotami, paliwem i motogodzinami.

## Łączność

- **Kolejka wysyłki** - zapisy, które czekają w telefonie na wysłanie do klubu.
- **OFFLINE · n** - bursztynowe oznaczenie: n zapisów czeka, bo ostatnia próba wysyłki nie dotarła do klubu. Wyślą się same, gdy wróci zasięg.
- **SYNC STOI · n** - czerwone oznaczenie: internet jest, ale wysyłka stoi i sama nie ruszy. Komunikat po tapnięciu mówi, co zrobić.
- **Link do ustawienia hasła** - jednorazowy link wysłany e-mailem, ważny godzinę (zaproszenie pierwszego administratora - trzy doby).
- **Wspólny tablet** - urządzenie w samolocie używane przez kilku pilotów. Loguje się na nim hasłem, adresem e-mail albo kodem pilota.
- **Zgłoszenie błędu** - opis problemu wysłany przyciskiem z prawego górnego rogu ekranu, razem z informacją o ekranie i wersji aplikacji.

## Panel klubu

- **Panel klubu** - strona w przeglądarce dla członków klubu. Każdy ma w niej kalendarz, zlecenia i Moje konto, a uprawnienia otwierają kolejne moduły.
- **Uprawnienie** - prawo do konkretnej części panelu albo aplikacji, na przykład „Podgląd klubu" albo „Zlecanie lotów". Nadaje je administrator klubu.
- **Zestaw uprawnień** - gotowy zbiór uprawnień: Pilot, Akceptujący, Koordynator lotów, Technik, Administrator.
- **Administrator** - członek klubu z pełnym zestawem uprawnień.
- **Opiekun platformy** - osoba spoza klubów, która zakłada kluby i prowadzi zgłoszenia błędów z aplikacji.
- **Kod klubu** - siedem znaków, na przykład `AZG-7K4M`, którymi pilot zgłasza się do klubu.
- **Zgłoszenie do klubu** - prośba o przyjęcie, która powstaje po wpisaniu kodu klubu. Rozpatruje ją administrator.
