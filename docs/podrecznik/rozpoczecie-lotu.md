# Rozpoczęcie lotu

> Trzy kroki i jesteś w kokpicie: samolot i załoga, zadanie i trasa, liczniki. Wartości z ostatniego przekazania są już wpisane - Ty porównujesz je z przyrządami.

## Krok 1 · samolot i załoga

Wybierz samolot z listy floty klubu. Karta maszyny mówi, w jakim jest stanie: wolna, prowadzona przez innego pilota („Prowadzi PIC: KRZ · od 07:10") albo wyłączona ze służby. Jeśli maszyna wymaga załogi dwuosobowej, przy nagłówku stoi plakietka „wymagany · załoga 2-os.", a bez wybranego drugiego pilota przycisk **DALEJ** mówi dlaczego. W pozostałych przypadkach drugi pilot (Dual) jest opcjonalny; raz wybrany, zostaje także po zmianie samolotu.

@screen 02-preflight "Lista floty z Dualem"

> **Wskazówka.** Lista samolotów pochodzi z panelu klubu. Pusta lista to ostrzeżenie na cały ekran „BRAK SAMOLOTÓW" z drogą wyjścia - aplikacja sama dopytuje o flotę, gdy tylko ma sieć, a formularz wraca bez Twojego udziału.

Samolot zajęty przez innego pilota otwiera się w **podglądzie**: jego log z serwera, bez możliwości zapisu, z przyciskiem **PRZEJMIJ SAMOLOT**. Przejęcie cudzej maszyny jest sytuacją awaryjną (poprzednik odjechał bez zdania): aplikacja ostrzega, że tamten może mieć niewysłane dane, a nakładające się operacje klub zobaczy jako sprawę do wyjaśnienia. Na co dzień samolot oddaje się przez zdanie.

@screen 04b-cockpit-readonly "Podgląd zajętego samolotu" | 02g-preflight-brak-floty "Pusta flota"

## Krok 2 · zadanie i trasa

- **Rodzaj operacji**: Skoki, Przelot, Egzamin, Lot tech., Inne. Skoki mają jedno lotnisko (start i lądowanie na tym samym placu), pozostałe operacje parę: skąd → dokąd.
- **Lotniska** wybiera się z katalogu w telefonie po kodzie ICAO albo nazwie - działa bez sieci. Kod spoza katalogu też wchodzi, z plakietką „spoza katalogu" (zapisze się sam kod, bez nazwy). Trasę można zostawić pustą.
- **Klient i notatka** - opcjonalne. W dniu skokowym dochodzi **domyślny skład skoczków**, który podstawi się przy każdym załadunku.
- Formularz podpowiada wartości z ostatniego dnia: rodzaj operacji i klienta - Twoje, trasę - tego samolotu. Sprawdź je, zanim pójdziesz dalej; **Wyczyść formularz** zaczyna od zera.

@screen 02e-preflight-zadanie "Rodzaj operacji i klient" | 02f-preflight-lotnisko "Arkusz wyboru lotniska"

> **Dlaczego tak.** Rodzaj operacji wyznacza nie tylko pola trasy: w dniu skokowym kokpit dostaje załadunek i zrzut, a wykrywanie lądowania spodziewa się powrotu na to samo pole. Ten sam wybór ustawia formularz i automat.

## Krok 3 · liczniki

Na górze ekranu stoi, skąd pochodzą wartości: **z ostatniego przekazania** (kto i kiedy zdał samolot), **ze stanu wpisanego w panelu** dla maszyny, której nikt jeszcze nie przekazał, albo z odczytów wpisanych przez administratora. Instrukcja jest jedna: zweryfikuj ilość paliwa w zbiornikach i aktualny stan licznika motogodzin.

| Sekcja | Co wpisujesz |
|---|---|
| **Paliwo** | Stan w zbiornikach. W arkuszu stoi szlak przekazania: ile poprzednik zastał, ile dolał, ile latał i ile według normy powinno zostać - do porównania z paliwomierzem. |
| **Motogodziny** | Odczyt licznika w formacie tej maszyny (podaje go arkusz: `hh:mm` albo dziesiętny). Licznik niższy niż przekazany blokuje przejście z podanym powodem. |
| **Olej** | Pomiar na bagnecie - obowiązkowy - i ewentualna dolewka. Podziałka pokazuje stan wobec zbiornika i minimum. Szczegóły: [tankowanie i olej](tankowanie-i-olej). |

Odczyty z przyrządów są ważniejsze niż podpowiedź. Rozjazd z przekazaniem to **ostrzeżenie** („Odczyt różni się od przekazanego o −30 L"), nie blokada: paliwomierz i licznik mają rację, a różnicę wyjaśni później klub. Bez sieci wartości przekazania mają adnotację „Ostatnie pobrane" z datą ostatniego połączenia; gdy aplikacja nie ma nic - „Brak danych - wpisz z licznika".

@screen 02a-preflight "Paliwo, motogodziny i olej" | 02b-preflight-paliwo "Szlak przekazania w arkuszu" | 02c-preflight-motogodziny "Arkusz odczytu motogodzin"

**ROZPOCZNIJ LOT** zapisuje przejęcie z odczytami i prowadzi wprost do [kokpitu](kokpit). Ekranu podsumowania nie ma - wszystko, co wpisałeś, stoi w kokpicie na osi operacji.

## Jak to działa

Przekazanie to odczyty z ostatniego zdania tej maszyny - albo, gdy nikt jej jeszcze nie zdał, stan wpisany w panelu. Z siecią aplikacja pobiera je na żywo przy wejściu w krok 3; bez sieci pracuje na kopii z ostatniego połączenia i mówi o tym adnotacją z datą. Twoje odczyty przy przejęciu stają się kolejnym ogniwem łańcucha tej maszyny: paliwo i licznik od zdania poprzednika do Twojego przejęcia powinny się zgadzać, a różnica jest sygnałem - o literówce, o tankowaniu poza aplikacją albo o locie, którego nikt nie zapisał. Przejęcie zapisuje się na telefonie natychmiast, bez pytania serwera o zgodę; gdyby dwa telefony wzięły tę samą maszynę, klub dostanie to jako sprawę do wyjaśnienia, a nie Ty jako blokadę. Więcej: [łańcuch odczytów](lancuch-odczytow), [norma zużycia](norma-zuzycia).

> **Założenie.** Rozpoczęcie lotu ma trwać sekundy. Dlatego są trzy kroki, trasę wolno zostawić pustą, a formularz podpowiada wartości z wczoraj - fakt lotu jest cenniejszy niż kompletność formularza.

> **Uwaga.** Wyjście z formularza przyciskiem wstecz przy wypełnionych polach pyta o rezygnację i czyści szkic; pusty formularz wychodzi bez pytania.

@screen 02h-preflight-rezygnacja "Pytanie o rezygnację" | 02d-preflight-offline "Wartości z ostatniego połączenia"

## Częste problemy

- **Lista samolotów jest pusta („BRAK SAMOLOTÓW")** → telefon nie pobrał jeszcze floty: sprawdź połączenie. Jeśli sieć jest, a lista nie wraca, administrator nie dodał jeszcze samolotów w panelu.
- **DALEJ jest nieaktywne** → powód stoi w przycisku: ten samolot wymaga drugiego pilota. Wybierz Duala z listy.
- **ROZPOCZNIJ LOT jest nieaktywny** → w przycisku stoi jedno z trzech: wprowadź odczyty paliwa i motogodzin, zmierz olej i wpisz pomiar, albo licznik jest niższy niż przekazany - popraw odczyt.
- **Samolot jest „zajęty", choć poprzedni pilot dawno poszedł do domu** → otwórz podgląd i **PRZEJMIJ SAMOLOT**; wpisz odczyty z przyrządów. Poproś administratora o zakończenie tamtej operacji z panelu.
- **Wartości przekazania są stare** → adnotacja „Ostatnie pobrane" z datą oznacza brak sieci. Wpisz odczyty z przyrządów - to one się liczą.
