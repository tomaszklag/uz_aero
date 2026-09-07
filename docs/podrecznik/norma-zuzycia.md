# Norma zużycia i werdykty

> Norma mówi, ile paliwa i motogodzin powinna była kosztować konkretna operacja. Bierze się z dokumentacji jednostki, a gdy maszyna ma dość lotów - z jej własnych lotów. Werdykt poza pasmem to bursztynowa informacja, nie oskarżenie.

@screen 10-statystyki "Rachunek z werdyktem" | 10c-norma-detale "Arkusz „jak to policzone”"

## Skąd bierze się norma

**Z dokumentacji jednostki.** W karcie samolotu w panelu administrator wpisuje zużycie paliwa i oleju w litrach na godzinę pracy silnika. Ta norma działa od pierwszego lotu. Jej pasmo jest **zadeklarowane** - ±15% wokół wartości - a nie zmierzone: instrukcja podaje punkt, nie rozrzut.

> **Dlaczego ±15%.** Tyle mniej więcej dzieli spalanie w przelocie od spalania w dniu z długim kołowaniem, a norma z dokumentacji nie rozdziela faz. Węższe pasmo zapalałoby werdykt przy każdej operacji o innej mieszance ziemi i powietrza - mówiłoby o zadaniu, nie o maszynie.

**Z lotów tej maszyny.** Odcinki między kolejnymi odczytami paliwa z ostatnich 90 dni składają się w model z osobną stawką w powietrzu i na ziemi. Model publikuje się dopiero przy dostatecznej liczbie odcinków i godzin pracy silnika - poniżej progu nie ma stawki „wstępnej", bo liczba wygląda na pomiar, a nim nie jest. Gdy dane nie rozdzielają faz (dzień skokowy ma zawsze tę samą proporcję), zostaje jedna stawka na godzinę pracy silnika. Wyliczona norma **wygrywa** z wpisaną; dokumentacja zostaje wartością odniesienia.

> **Założenie.** Model opisuje ten egzemplarz, dokumentacja - typ. Pasmo modelu to zakres, w którym mieści się 80% rzeczywistych operacji tej maszyny, z podłogą z podziałki przyrządu: 6 litrów i 0,1 motogodziny.

## Motogodziny mają własny przelicznik

Przyrost licznika nie równa się czasowi blokowemu i nie ma prawa się równać. Licznik godzinowy (Hobbs) chodzi z zegarem 1:1; obrotomierzowy zlicza obroty silnika, więc na wolnych obrotach na ziemi przyrasta wolniej. Typu licznika nikt nie konfiguruje - aplikacja rozpoznaje go z danych po kilku zamkniętych dniach. Format zapisu na karcie samolotu mówi tylko, jak licznik wyświetla wartość.

## Oczekiwanie liczy się per operacja

Paliwo i motogodziny liczą się tym samym równaniem: **stawka w locie × czas lotu + stawka na ziemi × czas na ziemi**. Arkusz pokazuje to wprost: „1:16 lotu × 20 L/h + 0:27 ziemi × 8 L/h ≈ 29 L".

> **Dlaczego per operacja.** Porównanie średniego zużycia na godzinę z pasmem maszyny dawało „poniżej normy" każdej operacji z długim kołowaniem - bez żadnego powodu poza proporcją ziemi do powietrza. Pasmo liczy się dla tej mieszanki faz, nie dla średniej operacji samolotu.

## Werdykt i arkusz

Na ekranie operacji karty Paliwo i Motogodziny kończy plakietka: **✓ W NORMIE** albo bursztynowe **↑ POWYŻEJ NORMY** / **↓ PONIŻEJ NORMY**. Tapnięcie otwiera arkusz „jak to policzone": zużyte w tej operacji, oczekiwane pasmo, średnia tej operacji, norma w locie i na ziemi oraz **Podstawa** z wiekiem normy („90 dni · Ostatnie pobrane · 05 SIE 17:30"). Przy normie z dokumentacji arkusz mówi wprost, że pasmo pochodzi z dokumentacji jednostki, a nie z lotów tej maszyny; gdy model już jest, dokłada wiersze „Z dokumentacji" i „Odchyłka od dokumentacji" - dla tej operacji i dla normy maszyny. Ten sam rachunek stoi w kroku 4 [wpisu lotu po fakcie](wpis-lotu-po-fakcie), zanim cokolwiek zapiszesz.

Bez normy karta milczy - nie ma plakietki ani zdania o jej braku. Jedyny wyjątek to „silnik nie pracował".

> **Uwaga.** Werdykt niczego nie blokuje i nie zmienia: paliwomierz i licznik mają rację, model tylko pyta. „Powyżej normy" przy normie z dokumentacji znaczy „powyżej tego, co obiecuje producent", a nie „powyżej tego, co ten egzemplarz zwykle pokazuje".

## Szacunek „ile zostało"

Ta sama norma daje szacunki tam, gdzie odczytu jeszcze nie ma:

- **Kokpit** - po uruchomieniu silnika litry są szacunkiem („Na pokładzie około 141 L"), odświeżanym co 5 minut. Pasek wystarczalności („wystarczy na ~7 wyniesień do rezerwy 45 min") pojawia się tylko przy normie z lotów ze stawką w locie - stawka z dokumentacji zaniżałaby rezerwę.
- **Tankowanie i zdanie samolotu** - po biegu silnika pole paliwa startuje puste, a podpis podpowiada „szacunek z normy: ~60 L"; arkusz pokazuje szlak: ostatni odczyt, ile latano, ile mogło się spalić.
- **Przejęcie** - zielone ogniwo „Szacunkowo zostało ~X L" liczone z historii przekazania.

> **Założenie.** Szacunek nigdy nie wchodzi do pola sam - wpisujesz to, co pokazuje paliwomierz. Podstawiona liczba dałaby się zatwierdzić bez patrzenia na przyrząd.

## Olej: oczekiwanie bez werdyktu

Norma oleju daje oczekiwanie **między pomiarami**: arkusz pomiaru przy przejęciu pokazuje „Ostatni pomiar", „Latano · 4:00 MH" i „na bagnecie oczekuj ≈ 10,1 L", a kokpit „W silniku około 9,1 L". Werdyktu per operacja nie ma - oleju nie mierzy się przy zdaniu, więc zużycia jednej operacji nie da się policzyć; karta Olej na ekranie operacji to rachunek bez plakietki.

## Norma jest do kalibracji

Progi modelu - długość odcinka, liczba odcinków, szerokość pasm - wyszły z rozumowania o dokładności paliwomierza, nie z danych. Kalibruje się je na prawdziwej historii z testów, nie w dyskusji. Pierwsze przebiegi pokazały, że rozdział ziemia/powietrze wychodzi tylko na maszynie o różnorodnym ruchu (egzaminy, przeloty, próby silnika), a nigdy na samych skokach.

> **Wskazówka.** Werdykt poza pasmem to pytanie, nie zarzut: sprawdź odczyt, dolewkę poza aplikacją i czas kołowania. Dziennik klubu pokazuje wyłącznie odczyty - szacunki i werdykty zostają w aplikacji.
