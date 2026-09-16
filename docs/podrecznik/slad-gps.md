# Ślad GPS

> Cała operacja na mapie i na profilu wysokości: kołowanie przerywaną linią, loty pełną, wszystkie starty i lądowania jako znaczniki. Ślad wraca z serwera, więc jest też po reinstalacji i na nowym telefonie.

@screen 14-slad "Ślad operacji"

## Jak tu wejść

Wejście jest jedno: **miniatura śladu na [ekranie operacji](operacja-i-korekty)**, w karcie „Przebieg operacji" nad osią zdarzeń. Tapnięcie otwiera pełny ekran. Z list operacji - Mój dzień i Poprzednie dni - w ślad się nie wchodzi: najpierw wybiera się operację, potem jej trasę.

@screen 10-statystyki "Miniatura śladu przy osi"

## Mapa

Trasa całego biegu silnika na tle siatki współrzędnych i pasów lotnisk z katalogu w telefonie. Mapa nie pobiera żadnych podkładów z sieci - rysuje się w całości z zapisu.

- **Kołowanie jest szarą linią przerywaną, loty pełną zieloną.** Podział bierze się z zapisanych czasów startów i lądowań, więc to samo rozróżnienie widać na miniaturze i w dzienniku klubu.
- **Znaczniki** pokazują każdy start i lądowanie z godziną (`T/O 1 · 08:20`) oraz najwyższy punkt lotu. Maksimum bliskie innego znacznika dopisuje się do jego podpisu, zamiast stawiać drugi punkt w tym samym miejscu.
- **Podziałka odległości** w lewym dolnym rogu mówi, jak mocno mapa jest przybliżona - zamiast krotności powiększenia, której nikt nie czyta w metrach.

Nagłówek karty podaje zakres zapisu: od uruchomienia do wyłączenia silnika.

## Profil wysokości

Wysokość z GPS w czasie, w stopach, z przerwami na ziemi między lotami. Jeden palec na profilu prowadzi **kursor**, a mapa pokazuje ten sam punkt trasy. Przybliżenie profilu działa tylko w osi czasu - to ona rozdziela zdarzenia leżące na sobie - i **podświetla na mapie oglądany fragment**, zamiast przestawiać jej kadr. Siatka pionowa to dokładnie jeden krok podziałki czasu („2 min", „15 min"), więc kratka jest odczytem, a nie tłem.

| Gest | Działanie |
|---|---|
| jeden palec na profilu | kursor na obu wykresach |
| dwa palce | przybliżenie i przesunięcie (mapa w obu osiach, profil tylko w czasie) |
| dwuklik | powrót do całości |

@screen 14d-slad-kursor "Kursor na profilu wysokości"

> **Dlaczego tak.** Kursor prowadzi się wyłącznie na profilu, bo pytanie „co się działo o tej godzinie" ma sens tylko na osi czasu. Mapa osi czasu nie ma: nad polem skoków ten sam punkt trasy to pięć różnych przelotów, więc dotknięcie mapy musiałoby zgadywać, o który chodzi.

## Statystyki

Pod wykresami, z zapisu GPS - każdy blok gaśnie osobno, gdy nie ma z czego go policzyć:

- **Podsumowanie** - czas w powietrzu z liczbą lotów, dystans w milach morskich, największa wysokość.
- **Prędkość i pion** - największa i średnia prędkość nad ziemią, największe i średnie wznoszenie oraz zniżanie.
- **Czasy faz** - pasek proporcji: wznoszenie, przelot, zniżanie, kołowanie, postój. Suma to bieg silnika.
- **Trzymanie wysokości** - w locie poziomym: pasmo wahań, jaka część czasu zmieściła się w ±100 stóp i najdłuższy równy odcinek.

## Gdy śladu nie ma

Ekran mówi jednym zdaniem dlaczego, bo cztery powody znaczą co innego:

- **Bez zapisu GPS** - operacja została wpisana po fakcie. Ta trasa nie istnieje i nie powstanie; w takiej operacji nie ma nawet wejścia w ślad.
- **Brak śladu** - klub nie ma nagrania tej operacji.
- **Nagranie czeka na wysyłkę** - jest na tym telefonie i pojawi się po synchronizacji.
- **Ślad niedostępny** - nagranie jest u klubu, brakuje tylko drogi do niego. Wróć na ten ekran z zasięgiem.

Zamiast pustej mapy ekran pokazuje wtedy **co mimo wszystko wiadomo o operacji**: uruchomienie, wyłączenie, czas w powietrzu i loty z godzinami. Te liczby biorą się z zapisu na telefonie, nie z nagrania.

@screen 14b-slad-brak "Bez zapisu GPS" | 14c-slad-offline "Bez zasięgu"

## Jak to działa

Telefon nagrywa pozycję co sekundę przez cały bieg silnika - także przy wygaszonym ekranie, dlatego Android pokazuje wtedy powiadomienie „Ninerdeck - rejestracja lotu". Po zakończeniu nagranie wychodzi do klubu na końcu najbliższej wysyłki, a telefon kasuje swoją kopię. Ekran śladu pobiera więc gotową geometrię z serwera - i to jedyne miejsce w aplikacji, które do działania potrzebuje sieci. Sama koperta niesie wyłącznie rysunek: linię, profil i statystyki. Rejestracja, loty, czasy i rozliczenie liczą się dalej z zapisu na telefonie, dlatego stan „bez zasięgu" pokazuje komplet godzin i mówi wprost, że brakuje samego rysunku. Trasa jest przed wysłaniem upraszczana, ale statystyki liczą się przed uproszczeniem - żeby „największe wznoszenie" nie zależało od dokładności rysowania.

> **Dlaczego tak.** Ślad jest jedynym świadomym wyjątkiem od zasady „wszystko działa bez sieci", bo jest materiałem do oglądania po locie, a nie przyrządem w locie. Nagranie trzymane na telefonie znikałoby przy reinstalacji i nie byłoby go na nowym telefonie; oddane klubowi zostaje na stałe.

> **Założenie.** Ślad należy do **operacji**, nie do pojedynczego lotu: zapis powstaje w jednym ciągu, od uruchomienia do zatrzymania silnika, a loty są jego odcinkami. Dlatego jeden ekran pokazuje wszystkie starty i lądowania jednego biegu.

## Częste problemy

@screen 05g-cockpit-no-gps "Brak sygnału w kokpicie"

- **Ekran mówi „Ślad niedostępny"** → to brak zasięgu, nie brak nagrania. Wróć w zasięg i otwórz ekran jeszcze raz.
- **Ekran mówi „Nagranie czeka na wysyłkę"** → nagranie jest na tym telefonie. Wyjdzie samo z najbliższą synchronizacją; ponaglisz je przyciskiem **SYNCHRONIZUJ TERAZ** w [ustawieniach](ustawienia).
- **Trasa urywa się albo ma dziurę** → tyle trwała cisza odbiornika. W kokpicie widać to jako baner o braku sygnału; starty i lądowania zapisuje się wtedy przyciskami, a rysunek zostaje niepełny. Więcej: [wykrywanie faz lotu](wykrywanie-faz-lotu).
- **Operacja nie ma w ogóle sekcji ze śladem** → to wpis lotu po fakcie. Trasy nie było, więc nie ma czego pokazać; mówi o tym plakietka **RĘCZNIE** w nagłówku operacji.
- **Powiadomienie o rejestracji lotu nie znika** → silnik jest wciąż uruchomiony w aplikacji. Zapis zamyka **STOP ENGINE**, a maszynę oddaje [zdanie samolotu](zdanie-samolotu).
