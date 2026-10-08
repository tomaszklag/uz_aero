# Samoloty

> Karta każdego samolotu klubu: pojemności, normy zużycia z dokumentacji, minimum oleju, format licznika i aktualny stan. Tu sprawdzisz też, ile samolot naprawdę zużywa paliwa.

Moduł otwiera uprawnienie **Podgląd klubu**, a zmiany w kartach - **Flota** ([kto co widzi](uprawnienia)).

## Lista samolotów

Kolumny: znaki z typem, rok produkcji, pojemność zbiorników, format licznika, wymóg drugiego pilota i stan - **W służbie** albo **Poza służbą**. Wyszukiwarka znajduje samolot po znakach i typie, a filtr pokazuje tylko samoloty w służbie.

Jeśli samolot jest poza służbą, a ktoś wciąż nim leci, wiersz mówi o tym wprost. Bieżący stan floty - kto ma który samolot i co pokazują liczniki - znajdziesz w [dzienniku](panel-dziennik).

@panel samoloty-lista "Lista samolotów klubu"

## Jak dodać albo zmienić samolot

Kliknij **Dodaj samolot** albo **Edytuj** przy samolocie. Karta ma sekcje:

| Sekcja | Pola |
|---|---|
| **Samolot** | znaki rejestracyjne, typ, rok produkcji (opcjonalny) |
| **Ustawienia dla pilota** | drugi pilot - nieobowiązkowy albo wymagany; stan - w służbie albo poza służbą |
| **Paliwo** | pojemność zbiorników, zużycie z dokumentacji, aktualny stan |
| **Olej** | zbiornik, minimum przed lotem, zużycie z dokumentacji, aktualny stan |
| **Motogodziny** | format licznika, aktualny stan |

Pojemności, minimum oleju i obie normy zużycia są wymagane. Normy podajesz w litrach na godzinę pracy silnika. Format licznika mówi, jak samolot pokazuje motogodziny: dziesiętnie (`3907.8`) albo w godzinach i minutach (`3907:48`) - w polach karty możesz wpisać oba zapisy.

> **Uwaga.** Gdy samolot wymaga drugiego pilota, aplikacja nie pozwoli rozpocząć na nim lotu ani wpisać lotu po fakcie bez drugiego pilota.

@panel samoloty-karta "Karta samolotu"

## Aktualny stan

Zakładając samolot, wpisz to, co pokazują przyrządy: licznik motogodzin, paliwo i olej. Pierwszy pilot zobaczy te liczby przy rozpoczęciu lotu jako stan początkowy. Po pierwszym zdaniu samolotu stan prowadzi już dziennik: pola „Aktualny stan" pokazują wtedy ostatni odczyt z informacją, skąd pochodzi, i nie da się ich zmienić w karcie.

## Poprawa odczytów

Gdy stan w dzienniku nie zgadza się z rzeczywistością - na przykład po zakończeniu operacji bez odczytów, tankowaniu poza aplikacją albo remoncie - użyj **Popraw odczyty** w karcie samolotu. Wpisz aktualny stan licznika, paliwa i opcjonalnie oleju oraz komentarz, skąd te liczby.

Następny pilot zobaczy je przy rozpoczęciu lotu z dopiskiem „odczyty wpisał administrator". Poprawa odczytów nie zmienia zapisów żadnej operacji - błąd w konkretnym locie poprawia się w [dzienniku](panel-dziennik).

## Norma z dokumentacji

Zużycie wpisane w karcie działa od pierwszego lotu. Aplikacja liczy z niego szacunek „ile zostało" i ocenę, czy zużycie w operacji mieści się w normie - z marginesem około 15% w obie strony. Gdy samolot ma za sobą wystarczająco dużo lotów, aplikacja liczy normę z jego własnych lotów i ta norma ma pierwszeństwo, a dokumentacja zostaje do porównania.

## Zużycie z lotów

Gdy samolot ma wystarczająco dużo lotów z odczytami paliwa, jego karta dostaje część **Zużycie z lotów**. W tytule stoi, z ilu operacji i od kiedy liczono.

- **Pasmo zużycia** - przedział, w którym mieści się 80% operacji tego samolotu, w litrach na godzinę pracy silnika.
- **Z dokumentacji** - norma z sekcji Paliwo, zaznaczona na tym samym pasku, i różnica między zużyciem zmierzonym a dokumentacją, na przykład „z lotów +3%".
- **W locie / na ziemi** - osobne stawki dla czasu w powietrzu i na ziemi. Z nich aplikacja liczy oczekiwane zużycie dla każdej operacji.
- **Motogodziny** - o ile rośnie licznik na godzinę lotu i na godzinę na ziemi, z rozpoznanym rodzajem licznika.
- **Obserwacje** i **Ostatni miesiąc** - na ilu pomiarach opiera się wynik i jak wygląda zużycie z ostatnich tygodni.

Młody samolot, który ma jeszcze za mało lotów, tej części nie ma.

## Wyłączenie i usunięcie

Samolotu wycofanego z klubu nie usuwa się, tylko ustawia **Poza służbą**. Znika wtedy pilotom z listy samolotów, a jego dziennik zostaje. Nie da się tego zrobić, gdy ktoś właśnie ma ten samolot - przycisk mówi wtedy „Ktoś ma teraz ten samolot". Samolot można usunąć na stałe dopiero wtedy, gdy jest poza służbą i nie ma ani jednego zapisanego lotu.

Krótką niedostępność - przegląd albo usterkę na kilka dni - ustawia się inaczej: w [kalendarzu](panel-kalendarz), przyciskiem **Wyłącz maszynę z użytku**.

## Częste problemy

- **„Ktoś ma teraz ten samolot" przy zmianie stanu** → samolot ma niezdaną operację. Poczekaj, aż pilot go zda, albo zakończ operację w [dzienniku](panel-dziennik).
- **Nie da się zapisać drobnej zmiany na starszym samolocie** → brakuje wymaganego pola w sekcji Paliwo, Olej albo Motogodziny. Uzupełnij je.
- **Pola „Aktualny stan" są szare** → stan prowadzi już dziennik. Do zmiany służy **Popraw odczyty**.
- **Pilot widzi w aplikacji inne liczby niż karta** → telefon pobiera dane klubu przy najbliższym połączeniu. Pilot może to przyspieszyć przyciskiem **SYNCHRONIZUJ TERAZ** w ustawieniach aplikacji.
