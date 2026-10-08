# Ślad GPS

> Cała operacja na mapie i na wykresie wysokości: kołowanie linią przerywaną, loty linią ciągłą, każdy start i lądowanie jako znacznik. Ślad jest przechowywany w klubie, więc zobaczysz go też na nowym telefonie.

@screen 14-slad "Ślad operacji"

## Jak otworzyć ślad

Na [ekranie operacji](operacja-i-korekty) tapnij miniaturę mapy w karcie „Przebieg operacji". Ślad otworzy się na całym ekranie.

## Mapa

Mapa pokazuje trasę od uruchomienia do wyłączenia silnika na tle siatki współrzędnych i pasów lotnisk.

- **Kołowanie** jest szarą linią przerywaną, **loty** - zieloną linią ciągłą.
- **Znaczniki** pokazują każdy start i lądowanie z godziną, na przykład „START 1 · 08:20", a także najwyższy punkt lotu („MAKS.") i zrzuty.
- **Podziałka** w lewym dolnym rogu mówi, jaką odległość zajmuje odcinek na mapie po przybliżeniu.

## Wykres wysokości

Pod mapą stoi wykres wysokości z GPS w czasie, z przerwami na pobyt na ziemi między lotami. Przesuwając palcem po wykresie, przesuwasz kursor - mapa pokazuje ten sam punkt trasy. Przybliżony fragment wykresu podświetla się na mapie.

| Gest | Działanie |
|---|---|
| jeden palec na wykresie | kursor na wykresie i na mapie |
| dwa palce | przybliżenie i przesunięcie |
| dwukrotne tapnięcie | powrót do całości |

@screen 14d-slad-kursor "Kursor na wykresie wysokości"

## Statystyki

Pod wykresami stoją liczby policzone z zapisu GPS:

- **Podsumowanie** - czas w powietrzu, liczba lotów, przebyta odległość i największa wysokość.
- **Prędkość i wznoszenie** - największa i średnia prędkość nad ziemią, największe i średnie wznoszenie oraz zniżanie.
- **Czasy faz** - ile trwało wznoszenie, lot poziomy, zniżanie, kołowanie i postój. Razem dają czas pracy silnika.
- **Utrzymanie wysokości** - w locie poziomym: jak bardzo zmieniała się wysokość.

Wysokość z GPS może się różnić od wskazania wysokościomierza.

## Gdy śladu nie ma

Ekran mówi jednym zdaniem dlaczego:

- **Bez zapisu GPS** - operacja została wpisana ręcznie, więc trasy nie ma.
- **Brak śladu** - klub nie ma nagrania tej operacji.
- **Nagranie czeka na wysyłkę** - jest na tym telefonie i pojawi się po synchronizacji.
- **Ślad niedostępny** - brak internetu. Wróć na ten ekran z zasięgiem.

Zamiast mapy ekran pokazuje wtedy to, co wiadomo o operacji: uruchomienie, wyłączenie, czas w powietrzu i loty z godzinami.

@screen 14b-slad-brak "Bez zapisu GPS" | 14c-slad-offline "Bez internetu"

## Częste problemy

- **Ekran mówi „Ślad niedostępny"** → telefon nie ma internetu - nagranie nie zginęło. Wróć w zasięg i otwórz ekran ponownie.
- **Ekran mówi „Nagranie czeka na wysyłkę"** → nagranie wyśle się samo przy najbliższej synchronizacji. Możesz ją przyspieszyć przyciskiem **SYNCHRONIZUJ TERAZ** w [ustawieniach](ustawienia).
- **Trasa urywa się albo ma przerwę** → w tym czasie telefon nie miał sygnału GPS. Kokpit pokazuje wtedy komunikat „GPS: brak sygnału", a starty i lądowania zapisuje się przyciskami.
- **Lot wpisany po fakcie nie ma śladu** → tak ma być - wpis ręczny nie ma nagrania trasy.
- **Powiadomienie „rejestracja lotu" nie znika** → w aplikacji silnik wciąż pracuje. Wyłącz go przyciskiem **WYŁĄCZ** w kokpicie i [zdaj samolot](zdanie-samolotu).
