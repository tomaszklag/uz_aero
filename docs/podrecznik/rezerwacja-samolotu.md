# Rezerwacja samolotu

> Kalendarz floty na jedną dobę, rezerwacja terminu w dwóch krokach i wejście w lot z tego, co zaplanowałeś.

> **Uwaga.** Kalendarz i rezerwacje wchodzą w wydaniu 3.0.0. Jeśli Twoja aplikacja nie ma jeszcze paska zakładek na dole ekranu, zaktualizuje się sama przy najbliższym uruchomieniu z zasięgiem.

## Kalendarz floty

Zakładka **Kalendarz** pokazuje jedną dobę i wszystkie maszyny klubu naraz - na pytanie „czym dziś polecę" odpowiada jedno spojrzenie.

- **Pasek dni** u góry: dwa tygodnie do przodu, dzisiejszy dzień pierwszy. Kropka przy dniu oznacza, że masz w nim swoją rezerwację. Ikona kalendarza na końcu paska otwiera miesiąc, jeśli planujesz dalej niż dwa tygodnie.
- **Oś** - wiersz na maszynę, pasek na każdą zajętość. Pasek podpisany jest nazwiskiem pilota, a maszyna wyłączona z użytku ma pasek z powodem („Przegląd 100 h").
- **Godziny** idą czasem klubu, a siatka obejmuje dobę lotną - od świtu do zmroku nad lotniskiem macierzystym. W czerwcu jest szersza niż w listopadzie, bo tyle naprawdę trwa dzień.
- **Filtr** przy nagłówku doby zawęża oś do maszyn, na których latasz. Wybór zostaje na telefonie i nie dotyczy nikogo innego; maszyna dokupiona przez klub pojawia się na osi sama.
- **Twoje rezerwacje** w tej dobie stoją listą pod osią - godziny, znak maszyny i to, co wypełniłeś.

Tapnięcie w pasek otwiera szczegóły tej rezerwacji. Tapnięcie w **wolne pasmo** otwiera formularz z tą maszyną i podsuwa terminy blisko godziny, w którą wycelowałeś.

@screen 21-kalendarz "Doba całej floty" | 21d-kalendarz-filtr "Oś zawężona filtrem" | 21c-kalendarz-pusty "Doba bez zajętości"

## Jak zarezerwować

Formularz ma dwa kroki i zaczyna się od tego, o co konkurują piloci.

**Krok 1 - kiedy i czym.** Wybierz dzień, samolot i godziny. Każda karta samolotu pokazuje jego pasek zajętości i wypisane wolne pasma („wolne: 06:00-13:00 · 16:00-21:00"), więc widać od razu, co da się wziąć. Nad godzinami stoją gotowe propozycje z powodem - „tuż po rezerwacji · J. Nowak", „początek dnia" - i wystarczy w nie tapnąć. Możesz też ustawić dowolne własne godziny.

**Krok 2 - co to za lot.** Rodzaj operacji, trasa, drugi pilot, planowany czas lotu, paliwo do zabrania i notatka. Te same pytania i te same kontrolki, co przy [rozpoczęciu lotu](rozpoczecie-lotu). Samolot wymagający załogi dwuosobowej nie przepuści rezerwacji bez drugiego pilota - powód stoi w przycisku.

@screen 22-rezerwacja "Krok 1 · termin i maszyna" | 22a-rezerwacja-zadanie "Krok 2 · zadanie i plan" | 22b-rezerwacja-czas "Okienko godziny"

> **Uwaga.** Termin potwierdza serwer, nie telefon. Jeśli ktoś zajął go, gdy wypełniałeś formularz, wrócisz do kroku 1 z informacją, kto go ma i od kiedy - razem ze skrótem do najbliższego wolnego pasma tej samej długości.

@screen 22c-rezerwacja-zajete "Termin zajęty w międzyczasie"

## Twoja rezerwacja

Karta rezerwacji pokazuje termin jako pierwszą rzecz na ekranie: dzień, godziny czasem klubu, długość i odliczanie („ZA 1 H 15 MIN"). Pod nim maszyna, zadanie, trasa i drugi pilot, a niżej plan lotu - czas, paliwo i notatka.

- **PRZESUŃ I POPRAW** wraca do formularza z wypełnionymi polami. Zmienisz godziny, zadanie, trasę i plan.
- **ODWOŁAJ REZERWACJĘ** zwalnia termin - z pytaniem, które nazywa konkretny wpis, i z miejscem na powód. Powód jest dobrowolny, ale to po nim kolega pozna, czemu slot się zwolnił.

Rezerwacji, która już trwa, nie da się przesunąć - można ją tylko oddać. Cudzej nie da się ani jedno, ani drugie.

@screen 23-rezerwacja-szczegoly "Karta rezerwacji"

## Wejście w lot z rezerwacji

Osobnego przycisku przy rezerwacji nie ma. **ROZPOCZNIJ LOT** stoi tam, gdzie zawsze, i robi to samo, co zawsze - tyle że wypełnia pierwszy krok tym, co zaplanowałeś: maszyną, zadaniem, trasą i drugim pilotem. Wystarczy sprawdzić i iść dalej.

Dotyczy to terminu, który właśnie się zaczyna albo trwa. Plan na przyszły weekend zostaje planem i formularza nie wypełnia.

Jeśli bierzesz maszynę, którą na najbliższe godziny ma zarezerwowaną ktoś inny, pierwszy krok powie Ci kto i kiedy - i na tym koniec. **Rezerwacja nigdy nie blokuje lotu.**

@screen 23a-rezerwacja-kolizja "Cudzy plan na tę maszynę"

## Rezerwacja wymaga zasięgu

To jedyna część aplikacji, która bez połączenia nie działa - i mówi to wprost, zamiast pokazywać pustą siatkę.

- **Kalendarz bez sieci** pokazuje kartę „BRAK POŁĄCZENIA" i wraca sam, gdy zasięg wróci. Przycisku ponowienia nie ma, bo nie ma czego naciskać.
- **Zapisu i odwołania nie da się zrobić** bez połączenia: termin przydziela serwer, więc telefon nie ma jak sprawdzić, czy jest jeszcze wolny.
- **Karty najbliższej rezerwacji nie ma** na pulpicie, kroki rozpoczęcia lotu nie wypełnią się planem, a ostrzeżenie o cudzym terminie nie padnie.

Wszystko pozostałe działa jak zawsze: **lot rozpoczniesz, poprowadzisz i zdasz bez zasięgu**, dokładnie tak jak przed rezerwacjami.

@screen 21b-kalendarz-offline "Kalendarz bez połączenia"

## Obserwowanie samolotu (3.2.0, w przygotowaniu)

> **W przygotowaniu.** Ta część jest zaprojektowana, ale jeszcze nie ma jej w aplikacji. Wejdzie z wydaniem 3.2.0 jako aktualizacja w tle, bez nowej instalacji; szczegóły mogą się jeszcze zmienić.

Technik przygotowujący maszynę i koordynator lotów mają dziś wobec samolotu wyłącznie narzędzia decyzji: zgodę na rezerwację i wyłączenie z użytku. Nikt nie dowiaduje się, że maszyna właśnie wróciła z lotu i można ją tankować, ani że za godzinę ktoś ją bierze. To zmienia **karta samolotu** i **obserwowanie**.

**Karta samolotu** otwiera się z kalendarza - tapnięciem w znak maszyny po lewej stronie osi - oraz z powiadomienia. Widzi ją osoba z uprawnieniem „Obserwowanie samolotów" (zestawy „Akceptujący", „Koordynator lotów", „Technik" i administrator). Na karcie stoją:

- **co dzieje się teraz**: wolna, w locie (kto i od której), przejęta, po locie i jeszcze nie zdana, wyłączona z użytku (z powodem i do kiedy) albo zarezerwowana;
- **liczniki** paliwa, motogodzin i oleju z ostatniego odczytu, z podpisem, skąd pochodzą;
- **najbliższe terminy** razem z wyłączeniami z użytku;
- **wykresy** motogodzin i paliwa z ostatnich 90 dni - z kursorem i przybliżeniem, jak profil śladu GPS - oraz sumy z 30 i 90 dni;
- **historia lotów tej maszyny** - kto, kiedy, ile, a w drugiej linii odczyty przy przejęciu i zdaniu; starsze doładowują się przyciskiem.

@screen 27-samolot "Karta maszyny · w locie, obserwowana" | 27b-samolot-wylaczona "Wyłączona z użytku na przegląd"

**Obserwowanie** to jeden przełącznik na karcie. Włączone, daje pięć rodzajów wiadomości w skrzynce powiadomień aplikacji (dzwonek na pulpicie) i powiadomienie na telefon:

1. **zbliża się lot** - godzinę przed potwierdzoną rezerwacją;
2. **odwołany termin** - wyłącznie taki, o którym już przypomniano; termin odwołany wcześniej nikogo nie budzi, bo nikt na niego nie czekał;
3. **uruchomienie silnika** - z adnotacją, czy lot odbywa się zgodnie z rezerwacją, czy poza planem;
4. **maszyna zdana** - z odczytami paliwa i licznika, czasem uruchomienia i wyłączenia, liczbą lotów;
5. **nikt nie odebrał** - zarezerwowana maszyna stała godzinę bez przejęcia i termin wrócił do puli.

O własnym działaniu nikt nie dostaje wiadomości: pilot, który sam uruchomił silnik albo sam odwołał termin, nie jest o tym budzony. Wpis lotu po fakcie nie rodzi powiadomień - opisuje przeszłość, nie to, co dzieje się z maszyną teraz.

**Co obserwujesz, widzisz w jednym miejscu**: w [ustawieniach](ustawienia) sekcja „Obserwowane samoloty" pokazuje całą flotę klubu z przełącznikiem przy każdej maszynie i jej stanem w tej chwili - tam włączasz i wyłączasz obserwowanie kilku maszyn naraz, bez otwierania każdej karty. Ta sama lista stoi w panelu klubu, w Moim koncie.

@screen 13c-ustawienia-obserwowane "Ustawienia · obserwowane samoloty"

> **Uwaga.** Godzina w wiadomości o uruchomieniu i zdaniu jest godziną z zapisu na telefonie pilota, nie chwilą, w której wiadomość dotarła. Telefon bez zasięgu dosyła zapisy później - czasem po godzinach - i wtedy wiadomość mówi to wprost („zapis dotarł 09:40"). Jeśli uruchomienie i zdanie dotarły w jednej paczce, przychodzi tylko wiadomość o zdaniu.

Karta samolotu, jak cały moduł rezerwacji, wymaga zasięgu: pokazuje cudze loty i terminy, których telefon nie ma u siebie.

## Dlaczego tak to działa

> **Dlaczego rezerwacja wymaga zasięgu, a lot nie.** Zapis lotu opisuje to, co się wydarzyło, i nikt poza Tobą tego nie odtworzy - dlatego czeka na telefonie do najbliższego zasięgu. Rezerwacja to umowa między ludźmi o termin, o który konkuruje kilka osób; ktoś musi rozstrzygnąć, kto był pierwszy, a tego nie da się zrobić na dwóch telefonach naraz. Rezerwuje się zwykle w domu, przy zasięgu - a przy samolocie liczy się lot, nie plan.

> **Dlaczego godziny są czasem klubu, a nie UTC.** Reszta aplikacji mówi w UTC, bo opisuje pomiary. Rezerwacja to umowa: nikt nie mówi „lecę o 07:00 UTC", tylko „w sobotę o dziewiątej". Samolot stoi w jednym miejscu na ziemi, więc siatka znaczy to samo dla wszystkich - także dla pilota, który rezerwuje z wakacji.

> **Dlaczego zmiana samolotu zakłada rezerwację od nowa.** Termin należy do konkretnego egzemplarza - przeniesienie go na inny to po prostu inna rezerwacja. Aplikacja najpierw zakłada nową, a dopiero po jej potwierdzeniu zwalnia starą, żebyś przy zajętym terminie nie został bez żadnej.

> **Dlaczego cudzy plan nie blokuje lotu.** Kolega mógł odpuścić, zamienić się albo nie dojechać, a maszyna stoi wolna. Blokada kazałaby Ci szukać administratora zamiast lecieć; ostrzeżenie mówi, z kim się dogadać.

## Częste problemy

- **Kalendarz pokazuje „BRAK POŁĄCZENIA"** → to nie awaria: cały moduł rezerwacji potrzebuje sieci. Ekran wraca sam, gdy zasięg wróci.
- **„ZAREZERWUJ" jest nieaktywne** → powód stoi w przycisku: wybierz rodzaj operacji, uzupełnij trasę, wskaż drugiego pilota albo podaj planowany czas lotu.
- **Termin zajęto, choć przed chwilą był wolny** → ktoś zapisał go szybciej. Skrót w komunikacie prowadzi do najbliższego wolnego pasma tej samej długości.
- **Na osi nie widzę swojego samolotu** → sprawdź filtr przy nagłówku doby; zawęża oś do wybranych maszyn. Maszyna wyłączona z użytku zostaje widoczna z powodem.
- **Kalendarz kończy się o 21:00, choć w czerwcu jest jasno dłużej** → klub nie ma jeszcze wpisanego lotniska macierzystego, więc doba lotna nie ma skąd wziąć świtu i zmroku. Wpisuje je opiekun platformy na karcie klubu; do tego czasu siatka stoi na stałych godzinach i nic poza tym nie przestaje działać.
- **Nie mogę przesunąć rezerwacji** → termin już trwa. Można go oddać, ale nie przenieść w przeszłość.
- **Rezerwacja zniknęła, choć jej nie odwoływałem** → slot zwalnia się sam godzinę po terminie, jeśli nikt nie wziął maszyny. Zarezerwuj ponownie albo weź samolot i leć - rezerwacja nie jest do tego potrzebna.
