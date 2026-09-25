# Słownik pojęć

> Słowa, którymi mówi aplikacja i panel - w tym znaczeniu, w jakim używa ich Ninerdeck. Układ jest tematyczny: od operacji przez liczniki po panel klubu.

## Operacja i lot

- **Operacja** - jeden bieg silnika: od przejęcia samolotu przez pilota do jego zdania. W operacji może być wiele lotów. Jednostka zapisu, zatwierdzenia, korekty i rozliczenia - i wiersz w dzienniku klubu.
- **Lot** - od startu do lądowania. Aplikacja wykrywa loty z GPS; w jednej operacji jest ich tyle, ile razy maszyna oderwała się od ziemi.
- **Kręgi (touch and go)** - przyziemienia z natychmiastowym startem w jednym locie. W locie na żywo każdy krąg daje własną parę start → lądowanie; we wpisie po fakcie podaje się ich liczbę przy lądowaniu.
- **Przejęcie** - rozpoczęcie operacji: pilot bierze samolot z odczytami paliwa, motogodzin i oleju. Słowa „przejęcie" używamy tam, gdzie maszynę odbiera się innemu pilotowi; na wolnym samolocie po prostu „rozpoczynasz lot".
- **Zdanie samolotu** - zakończenie operacji z obowiązkowym odczytem paliwa i motogodzin. Zatwierdza log operacji i staje się przekazaniem dla następnego pilota.
- **Zdanie bez lotu** - zdanie samolotu, gdy silnik nie pracował: pogoda, usterka, próba silnika. Ma powód z listy i opcjonalny komentarz.
- **Pusty zapis** - operacja zdana bez biegu silnika, bez dolewek i z odczytami równymi przejęciu. Nie pokazuje jej żadna lista ani karta dnia; sam zapis zostaje w rejestrze.
- **PIC / Dual** - dowódca statku powietrznego (pilot prowadzący operację) i drugi pilot. Dowódcy nie zmienia się w trakcie operacji.
- **Zadanie** - rodzaj operacji: Skoki, Przelot, Egzamin, Lot techniczny, Inne. Skoki mają jedno lotnisko, pozostałe parę skąd → dokąd.
- **Dzień skokowy** - operacja z zadaniem Skoki: jedno lotnisko, załadunek i zrzuty, zwykle kilka do kilkunastu lotów w jednym biegu silnika.
- **Załadunek** - znacznik wejścia skoczków na pokład przed startem; skład jest opcjonalny i wypełnia potem okienko zrzutu.
- **Zrzut** - wyniesienie skoczków w locie: skład i wysokość, którą aplikacja podstawia z GPS.
- **Wpis lotu po fakcie** - lot wpisany z pamięci albo z kartki, w czterech krokach; dostaje oznaczenie **RĘCZNIE** i nie ma śladu GPS.

## Czas

- **Blok (czas blokowy)** - czas od uruchomienia do wyłączenia silnika.
- **Czas lotu** - suma czasu w powietrzu wszystkich lotów operacji.
- **Loty · Blok · Lot** - trójka na kafelku operacji i w sumach dnia: liczba lotów, czas blokowy, czas lotu.
- **Doba UTC** - jednostka dnia w całym produkcie. Operacja należy do doby, w której uruchomiono silnik, więc lot z późnego wieczoru bywa pod inną datą niż w kalendarzu na ścianie.
- **UTC** - czas uniwersalny, domyślny wszędzie. Czas nieoznaczony jest czasem UTC; czas lokalny pojawia się tylko jako podpis przy wpisywanej godzinie.

## Rezerwacje i kalendarz

> **Uwaga.** Rezerwacje i kalendarz floty wchodzą w wydaniu 3.0.0. W aplikacji, którą piloci mają dziś na telefonach, tych ekranów jeszcze nie ma - hasła poniżej opisują, jak to będzie działać. Kiedy: [wydania i zmiany](~/wydania/).

- **Rezerwacja** - zajęcie samolotu na konkretne godziny. Opisuje PLAN, a nie fakt: lot
  zapisuje się osobno, w rejestrze operacji. Rezerwacja niczego nie warunkuje - można
  polecieć bez niej, także bez zasięgu.
- **Zajętość** - wszystko, co stoi w kalendarzu maszyny: rezerwacje pilotów i wyłączenia
  z użytku. Dwa rodzaje jednego wpisu, dlatego nie da się zarezerwować maszyny, która
  w tym czasie jest na przeglądzie.
- **Wyłączenie z użytku** - maszyna niedostępna w danym okresie: przegląd, usterka, inny
  powód. Wpisuje je administrator w panelu; w kalendarzu widać ją jako pasmo w skos.
- **Slot** - pasmo czasu, na które da się zarezerwować maszynę. Aplikacja podpowiada
  sloty przylegające do istniejących zajętości, żeby nie zostawiać dziur zbyt krótkich
  na jakikolwiek lot.
- **Czas klubu** - strefa czasowa, w której liczy się kalendarz. Rezerwacja jest umową
  między ludźmi o godzinie, więc mówi czasem lotniska, a nie UTC; rejestr operacji
  zostaje w UTC bez zmian. Gdy telefon ma inną strefę niż klub, przy godzinie staje
  drobna adnotacja z czasem lokalnym.
- **Okno doby lotnej** - godziny, w których klub lata; poza nimi kalendarz nie proponuje
  slotów.
- **Ścieżka akceptacji** *(3.1.0)* - kolejność osób, które muszą zgodzić się na
  rezerwację, zanim stanie się potwierdzona. Klub bez ścieżki nie zatwierdza niczego -
  rezerwacja jest gotowa od razu. Odrzucenie wymaga powodu, a pilot czyta go w aplikacji.
- **Obserwowanie samolotu** *(3.2.0, w przygotowaniu)* - włącza się na karcie maszyny
  w aplikacji; ma je osoba z uprawnieniem „Obserwowanie samolotów" (technik,
  koordynator lotów, akceptujący rezerwacje). Daje powiadomienia o tej maszynie: lot
  za godzinę, odwołany termin, uruchomienie silnika, zdanie z odczytami, nieodebrana
  rezerwacja. Godzina w wiadomości jest godziną zapisu z telefonu pilota, nie chwilą,
  w której wiadomość dotarła - telefon bez zasięgu dosyła zapisy później.

## Liczniki, paliwo i olej

- **Motogodziny (MH)** - licznik pracy silnika maszyny. Odczyt przy przejęciu i przy zdaniu tworzy łańcuch: ile jeden pilot zostawił, tyle następny powinien zastać.
- **Format licznika** - sposób, w jaki jednostka wyświetla motogodziny: dziesiętnie (`3907.8`) albo godzinami i minutami (`3907:48`). Ustawia go klub w karcie samolotu.
- **Łańcuch odczytów** - ciągłość paliwa i motogodzin między kolejnymi operacjami tej samej maszyny. Rozjazd jest ostrzeżeniem dla pilota i sygnałem dla klubu, nigdy blokadą.
- **Przekazanie** - odczyty z ostatniego zdania samolotu (kto, kiedy, ile), które następny pilot widzi przy rozpoczęciu lotu.
- **Stan początkowy (aktualny stan)** - licznik, paliwo i olej wpisane w karcie samolotu przy zakładaniu maszyny. Jest pierwszym ogniwem łańcucha, dopóki maszyny nikt nie przekazał; potem pola pokazują ostatni odczyt z dziennika.
- **Poprawa odczytów** - wpisanie przez administratora nadrzędnego stanu licznika, paliwa i oleju, z wymaganym komentarzem. Wchodzi do łańcucha jako punkt wyjścia dla następnego pilota, ale nie zmienia zapisów żadnej operacji.
- **Minimum oleju** - poziom przed lotem zadeklarowany w karcie samolotu; aplikacja pokazuje go jako kreskę na podziałce i ostrzega przy zejściu poniżej.
- **Dolewka oleju** - osobny zapis o dolanym oleju, z okienka przejęcia albo z kokpitu. Olej mierzy się tylko przy przejęciu, więc zużycie liczy się od pomiaru do pomiaru, przez wiele operacji.

## Norma i werdykty

- **Norma zużycia** - oczekiwane zużycie paliwa i przyrost licznika dla maszyny: z dokumentacji, a gdy jest dość lotów - wyliczone z lotów tego egzemplarza.
- **Norma z dokumentacji** - liczba z instrukcji użytkowania wpisana w karcie samolotu, w litrach na godzinę pracy silnika. Działa od pierwszego lotu i ustępuje normie wyliczonej, gdy ta się pojawi.
- **Pasmo normy** - widełki wokół oczekiwania, w których zużycie uchodzi za normalne. Przy normie z dokumentacji jest zadeklarowane (instrukcja podaje punkt, nie rozrzut); przy normie z lotów - zmierzone na historii tej maszyny.
- **Szacunek z normy** - podpowiedź „ile zostało", liczona z normy i czasu pracy silnika: w kokpicie po uruchomieniu, przy tankowaniu i przy zdaniu samolotu. Nigdy nie wchodzi do pola sama - wpisujesz to, co pokazuje przyrząd.
- **Werdykt** - oznaczenie na rachunku paliwa albo motogodzin: czy zużycie tej operacji mieści się w paśmie. Tapnięcie otwiera rachunek. Niczego nie blokuje i nie zmienia.

## Zapis, korekty i nazwy

- **Sygnatura operacji** - nazwa operacji w rodzaju `SP-AXA/2026-09-05/AKO/1`: znak samolotu, doba UTC, kod pilota, numer operacji tego pilota w dobie.
- **Kod pilota** - krótki kod (np. `AKO`) nadany w panelu przy zakładaniu konta; podpisuje operacje i stoi w sygnaturze.
- **Czas na poprawki** - 24 godziny od zdania samolotu, w których pilot poprawia własne wpisy. Potem operacja jest w podglądzie, a poprawia administrator.
- **Korekta** - poprawka godziny, odczytu, składu zrzutu, notatki albo drugiego pilota, z opcjonalnym powodem. Nie nadpisuje historii - dopisuje się do niej.
- **Oznaczenie „popr."** - znak przy wartości, która nie jest tym, co zapisał przyrząd albo pilot za pierwszym razem. Tapnięcie otwiera historię zmian: „było → jest", z autorem, godziną i powodem.
- **Podgląd po terminie** - ten sam ekran operacji po upływie 24 godzin: bez edycji, ale z pełnym rachunkiem, śladem i historią zmian. Upływ terminu odbiera prawo do zmiany danych, nie do ich zrozumienia.
- **Unieważnienie** - wycofanie całej operacji z list i sum; zapis zostaje razem z powodem. Robi to pilot w oknie korekty albo administrator z panelu, gdzie powód jest wymagany.
- **Zakończenie administracyjne** - zakończenie z panelu operacji, której pilot nie zdał: z powodem, bez odczytów. Zwalnia maszynę i liczy się do nalotu, ale nie jest ogniwem łańcucha odczytów.
- **Ślad** - zapis GPS całej operacji: mapa z kołowaniem i lotami, profil wysokości i statystyki. Wraca z serwera, więc wymaga zasięgu.
- **Profil wysokości** - wykres wysokości w czasie pod mapą śladu, z przerwami na czas spędzony na ziemi między lotami. Wysokość pochodzi z GPS i potrafi różnić się od wysokościomierza.

## Sieć i dane

- **Kolejka wysyłki** - zapisy czekające na telefonie na wysłanie do klubu. Wskaźnik **OFFLINE · n** pokazuje ich liczbę, gdy ostatnia próba nie dotarła.
- **SYNC STOI** - czerwony wskaźnik: serwer odpowiedział i odmówił, wygasła sesja albo administrator ją zakończył, więc kolejka sama nie ruszy. Zapisy zostają nietknięte na telefonie.
- **Link ustawienia hasła** - jednorazowy adres przysłany e-mailem, ważny godzinę (zaproszenie do klubu - trzy doby). Otwiera stronę, na której ustawia się hasło; działa na dowolnym urządzeniu i po użyciu przestaje działać. Każdy nowy link unieważnia poprzedni.
- **Sesja logowania** - jedno zalogowane urządzenie: model albo przeglądarka, czym się zalogowano, od kiedy i kiedy było ostatnio aktywne. Swoje widzisz w panelu na „Moje konto", administrator widzi Twoje w swoim klubie; każdą da się wylogować osobno.
- **Wspólny tablet** - urządzenie w samolocie używane przez kilku pilotów. Loguje się na nim hasłem (kodem pilota albo adresem), bo konta Google nie dodaje się do cudzego sprzętu. Tablet pamięta kluby, z których na nim logowano - nie pamięta osób.
- **Dane referencyjne** - kopia floty, pilotów i przekazania pobrana z panelu na telefon. Bez sieci aplikacja pracuje na niej, z adnotacją o dacie ostatniego połączenia.
- **Zgłoszenie z aplikacji** - uwaga albo błąd wysłany przyciskiem z rogu ekranu, razem z kontekstem: ekran, operacja, samolot, wersja aplikacji.

## Panel klubu

- **Panel klubu** - strona w przeglądarce dla administratora: piloci, samoloty, dziennik i zgłoszenia.
- **Administrator** - potocznie: członek klubu z pełnym zakresem uprawnień, czyli z panelem. Uprawnienia nadaje się jednak POJEDYNCZO (zob. **zakres uprawnień**), więc „administrator" jest nazwą zestawu, a nie osobnym bytem w systemie.
- **Zakres uprawnień** - zbiór zdolności nadanych członkowi W TYM klubie: wejście do panelu, flota, akceptacja rezerwacji i tak dalej. Należy do członkostwa, więc w dwóch klubach ta sama osoba może mieć dwa różne zakresy.
- **Rola** - to, co konto otwiera: pilot albo administrator. Nadaje ją klub przy zakładaniu konta i zmienia w karcie konta.
- **Sesja panelu** - zalogowanie w przeglądarce; wygasa po ośmiu godzinach i panel prosi o ponowne logowanie. Wyłączenie konta zrywa ją od razu.
- **Kolejka zgłoszeń** - lista osób, które zalogowały się kontem Google nieznanym klubowi i czekają na decyzję. Stoi nad listą pilotów tylko wtedy, gdy ktoś w niej jest.
- **Karta samolotu** - konfiguracja jednej maszyny w panelu: pojemności, normy z dokumentacji, minimum oleju, format licznika, wymóg drugiego pilota, stan służby i aktualny stan.
- **Karta dnia maszyny** - dokument doby jednego samolotu dla klubu: operacje jako wiersze z odczytami, czasami i lotami.
