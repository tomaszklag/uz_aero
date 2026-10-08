# Do sprawdzenia

> Jedno miejsce na wszystko, co wymaga reakcji administratora: rozjazdy między zapisami, karty dnia, które nie trafiły do arkusza, i operacje, których nikt nie zdał. Liczba przy nazwie modułu pojawia się tylko wtedy, gdy coś czeka.

Moduł otwiera uprawnienie **Podgląd klubu**. Rozjazdy zamyka się z uprawnieniem **Rozjazdy**, a karty dnia wysyła ponownie z uprawnieniem **Flota** ([kto co widzi](uprawnienia)).

## Lista spraw

Ekran ma trzy karty, każda z liczbą spraw w tytule:

- **Rozjazdy** - niezgodności między zapisami, na przykład inny stan paliwa przy rozpoczęciu lotu niż przy poprzednim zdaniu.
- **Karty dnia** - dni samolotu, których karta nie trafiła do arkusza klubu.
- **Operacje wiszące** - operacje bez zdania samolotu od ponad doby. Samolot stoi wtedy jako zajęty, a pilot najpewniej już odjechał.

Kliknięcie w sprawę prowadzi tam, gdzie da się ją załatwić. Karta bez spraw znika, a gdy nic nie czeka, ekran mówi to wprost.

@panel sprawdzenie-lista "Do sprawdzenia: trzy karty spraw"

## Rozjazdy

Rozjazd nie zatrzymuje zapisu - lot jest w dzienniku w całości - ale dostaje sprawę, którą ktoś w klubie powinien obejrzeć.

| Rozjazd | Co znaczy | Co zrobić |
|---|---|---|
| **Dwie operacje naraz** | samolot przejęto, zanim poprzednia operacja została zdana | zakończ wiszącą operację w dzienniku albo poczekaj na zdanie, potem zamknij sprawę. Zamknięcie wyśle kartę dnia do arkusza |
| **Pilot w dwóch maszynach** | dwie operacje jednego pilota nachodzą na siebie w czasie | sprawdź godziny obu operacji i popraw tę, która ma je błędne |
| **Luka w liczniku** | licznik przy rozpoczęciu lotu jest wyższy, niż zostawiło poprzednie zdanie | ktoś latał bez aplikacji albo odczyt jest za wysoki. Brakujący lot pilot dopisuje po fakcie, błędny odczyt poprawia się w operacji |
| **Cofnięty licznik** | licznik przy rozpoczęciu lotu jest niższy niż przy poprzednim zdaniu | błędnie odczytany licznik - popraw odczyt w operacji |
| **Rozjazd paliwa** | paliwo przy rozpoczęciu lotu różni się od zostawionego bardziej, niż pozwala dokładność paliwomierza | ktoś tankował poza aplikacją - dopisz tankowanie w operacji, która oddała samolot; błędny odczyt popraw |
| **Rozjazd zegara** | zegar telefonu pilota odbiega od czasu GPS | sprawdź godziny w przebiegu operacji i poproś pilota o włączenie automatycznego czasu w telefonie |

Kliknięcie **Rozstrzygnij** otwiera z boku ekranu okno sprawy z trzema częściami: **Co się nie zgadza** (liczby i operacje), **Co z tym zrobić** i **Rozstrzygnięcie** z wymaganą notatką, co ustalono. Zamknięcie sprawy nie zmienia żadnej liczby w dzienniku - poza jednym wyjątkiem: zamknięcie sprawy „Dwie operacje naraz" wysyła wstrzymaną kartę dnia do arkusza, a przycisk mówi o tym przed kliknięciem.

Otwarty rozjazd widać też w [dzienniku](panel-dziennik): oznaczeniem przy operacji i komunikatem na jej stronie.

@panel sprawdzenie-rozjazdy "Rozjazdy i okno sprawy"

## Karty dnia

Karta dnia to dokument jednego dnia jednego samolotu dla klubu, na przykład `2026-09-06_SP-AXA`. Jej wierszami są operacje z tego dnia. Lista pokazuje wiersz na każdą operację, z nazwą karty i stanem:

| Stan | Znaczenie |
|---|---|
| **W arkuszu** | karta jest w arkuszu klubu |
| **Bez karty** | samolot zdano, a karta nie trafiła do arkusza - to sprawa do sprawdzenia |
| **Wstrzymana rozjazdem** | kartę wstrzymuje sprawa „Dwie operacje naraz". Zamknij sprawę - karta pójdzie sama |
| **Czeka na zdanie** | operacja trwa; karta powstanie po zdaniu samolotu |
| **Unieważniona** | wpis został unieważniony |

Filtry nad listą zawężają ją do jednego stanu. **Wysłane ponownie** pokazuje karty, które po poprawce w operacji poszły do arkusza jeszcze raz - w nowej wersji. Kliknięcie w kartę otwiera z boku jej wersje, treść i **adres karty** z przyciskiem **Kopiuj**. Adres otwiera kartę bez logowania - możesz go dać skarbnikowi albo księgowości, ale tylko tym osobom, które mają widzieć karty klubu.

**Ponów eksport** wysyła kartę ponownie. Przy karcie, której brakuje, stoi w wierszu listy; kartę, która już jest w arkuszu, wyślesz ponownie z jej okna. Komunikat zawsze mówi, co się stało: karta poszła, nie mogła pójść (z powodem) albo arkusz nie odpowiedział i trzeba spróbować za chwilę.

@panel sprawdzenie-karty "Karty dnia"

## Operacje wiszące

Operacja bez zdania samolotu od ponad doby blokuje samolot w kalendarzu i na liście wyboru pilotów. Kliknięcie prowadzi na stronę operacji w dzienniku, gdzie karta **Zakończenie operacji** kończy ją z powodem ([dziennik](panel-dziennik#zakonczenie-operacji)). Po zakończeniu sprawa znika z listy.

## Częste problemy

- **Przy module jest liczba, a po wejściu karty są puste** → ktoś właśnie zamknął sprawy. Odśwież stronę.
- **Karta ma stan „Bez karty" od kilku dni** → kliknij **Ponów eksport**. Komunikat powie, czy karta poszła, a jeśli nie - co trzeba poprawić w operacji.
- **Nie widzę przycisku zamknięcia sprawy** → zamykanie rozjazdów wymaga uprawnienia **Rozjazdy**, a ponowne wysłanie karty - uprawnienia **Flota**.
