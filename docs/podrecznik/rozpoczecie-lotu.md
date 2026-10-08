# Rozpoczęcie lotu

> Trzy kroki i jesteś w kokpicie: samolot i załoga, zadanie i trasa, liczniki. Wartości od poprzedniego pilota są już wpisane - Ty porównujesz je z przyrządami.

Rozpoczęcie lotu otwierasz przyciskiem **ROZPOCZNIJ LOT** na [Pulpicie](moj-dzien). Jeśli masz na tę godzinę [rezerwację](rezerwacja-samolotu), pierwszy krok jest już wypełniony samolotem, zadaniem, trasą i drugim pilotem z rezerwacji.

## Krok 1 · samolot i załoga

1. Wybierz samolot z listy floty klubu. Przy każdym samolocie widać jego stan: wolny, zajęty przez innego pilota („Prowadzi KRZ · od 07:10") albo wyłączony.
2. Wybierz drugiego pilota, jeśli lecisz z kimś. Jeśli samolot wymaga załogi dwuosobowej, przy nagłówku stoi „wymagany · załoga 2-os.", a bez drugiego pilota przycisk **DALEJ** powie, czego brakuje.
3. Tapnij **DALEJ**.

Jeśli wybrany samolot ma na najbliższe godziny cudzą rezerwację, nad formularzem pojawi się informacja, kto ją ma i na kiedy. To nie blokuje lotu.

@screen 02-preflight "Wybór samolotu i drugiego pilota" | 23a-rezerwacja-kolizja "Cudza rezerwacja na ten samolot"

### Samolot zajęty przez innego pilota

Zajęty samolot otwiera się w **podglądzie**: widzisz jego stan i dotychczasowy przebieg lotu, ale niczego nie zmienisz. Jeśli poprzedni pilot odjechał, nie zdając samolotu, tapnij **PRZEJMIJ SAMOLOT** i wpisz odczyty z przyrządów. Klub zobaczy dwie operacje naraz i wyjaśni to z poprzednim pilotem.

Na co dzień samolot przekazuje się przez [zdanie samolotu](zdanie-samolotu) - wtedy nic nie trzeba przejmować.

@screen 04b-cockpit-readonly "Podgląd zajętego samolotu"

## Krok 2 · zadanie i trasa

- **Rodzaj operacji**: Skoki, Przelot, Egzamin, Lot tech., Inne. Przy skokach podajesz jedno lotnisko, przy pozostałych - skąd i dokąd.
- **Lotniska** wybierasz po kodzie ICAO albo nazwie - lista działa bez internetu. Kod spoza listy też przejdzie, z oznaczeniem „spoza katalogu". Trasę możesz zostawić pustą.
- **Klient i notatka** są opcjonalne. W dniu skokowym dochodzi **domyślny skład skoczków**, który podpowie się przy każdym załadunku.

Formularz podpowiada dane z ostatniego dnia: rodzaj operacji i klienta - Twoje, trasę - tego samolotu. Sprawdź je przed przejściem dalej albo tapnij **Wyczyść formularz**.

@screen 02e-preflight-zadanie "Rodzaj operacji i klient" | 02f-preflight-lotnisko "Wybór lotniska"

## Krok 3 · liczniki

Na górze ekranu stoi, skąd pochodzą wpisane wartości:

- **z ostatniego przekazania** - kto i kiedy zdał samolot,
- **ze stanu początkowego** - dla samolotu, którego nikt jeszcze nie zdał, wpisanego przez administratora w panelu,
- **od administratora** - gdy poprawił odczyty w panelu.

Pod spodem jedna instrukcja: **zweryfikuj ilość paliwa w zbiornikach i aktualny stan licznika motogodzin.**

| Sekcja | Co robisz |
|---|---|
| **Paliwo** | Sprawdzasz stan w zbiornikach. W okienku widać, ile poprzedni pilot zastał, ile dolał, ile latał i ile według normy powinno zostać - porównaj to z paliwomierzem. |
| **Motogodziny** | Sprawdzasz licznik. Okienko podpowiada format tej maszyny: godziny i minuty albo zapis dziesiętny. |
| **Olej** | Mierzysz olej na bagnecie - to obowiązkowe - i wpisujesz ewentualną dolewkę. Podziałka pokazuje stan wobec zbiornika i minimum ([tankowanie i olej](tankowanie-i-olej)). |

**Przyrządy mają rację.** Jeśli odczyt różni się od przekazanego, aplikacja ostrzega, na przykład „Odczyt różni się od przekazanego o −30 L" - ale przyjmuje Twój odczyt. Różnicę wyjaśni klub. Zapisu nie da się zrobić tylko wtedy, gdy licznik motogodzin jest niższy niż przekazany albo paliwa jest więcej, niż mieszczą zbiorniki.

Bez internetu przy wartościach stoi data ostatniego pobrania („Dane z 21 CZE 17:30"). Gdy aplikacja nie ma żadnych danych, prosi: „Brak danych - wpisz z licznika".

@screen 02a-preflight "Paliwo, motogodziny i olej" | 02b-preflight-paliwo "Okienko odczytu paliwa" | 02c-preflight-motogodziny "Okienko odczytu motogodzin"

**ROZPOCZNIJ LOT** zapisuje odczyty i otwiera [kokpit](kokpit).

> **Uwaga.** Przycisk wstecz przy wypełnionym formularzu pyta, czy zrezygnować z lotu, i czyści wpisane dane. Pusty formularz zamyka się bez pytania.

@screen 02h-preflight-rezygnacja "Pytanie o rezygnację"

## Częste problemy

- **Lista samolotów jest pusta („BRAK SAMOLOTÓW")** → aplikacja nie pobrała jeszcze floty. Sprawdź internet - lista wróci sama. Jeśli sieć jest, a lista dalej jest pusta, administrator nie dodał jeszcze samolotów w panelu.
- **DALEJ jest nieaktywne** → samolot wymaga drugiego pilota. Wybierz go z listy.
- **ROZPOCZNIJ LOT jest nieaktywny** → przycisk mówi, czego brakuje: odczytów paliwa i motogodzin, pomiaru oleju albo licznik jest niższy niż przekazany.
- **Samolot jest zajęty, choć poprzedni pilot już poszedł** → otwórz podgląd, tapnij **PRZEJMIJ SAMOLOT** i wpisz odczyty z przyrządów. Poproś administratora, żeby zakończył tamtą operację w panelu.
- **Wartości przekazania są stare** → data przy wartości oznacza brak internetu. Wpisz to, co pokazują przyrządy.
