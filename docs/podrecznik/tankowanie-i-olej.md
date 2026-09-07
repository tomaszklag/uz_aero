# Tankowanie i olej

> Tankowanie zapisuje się w kokpicie przy zatrzymanym śmigle: przed uruchomieniem albo po zatrzymaniu silnika. Olej mierzy się przy przejęciu, a dolewkę zapisuje osobno.

@screen 06-tankowanie "Tankowanie" | 02i-preflight-olej "Pomiar oleju przy przejęciu"

## Tankowanie

Ekran tankowania ma trzy części:

1. **Paliwo na pokładzie przed tankowaniem.** Jeśli samolot nie latał od ostatniego odczytu (tankowanie przed lotem - najczęstszy przypadek), wartość jest już wpisana z przekazania potwierdzonego przy przejęciu. Jeśli latał, pole jest puste i wymaga pomiaru z paliwomierza; podpis podpowiada szacunek („szacunek z normy samolotu: ~112 L"), a arkusz pomiaru pokazuje szlak: ile miał, ile latał, ile mógł spalić, ile powinno zostać.
2. **Dolano** - litry z dystrybutora, przyciskami po pełnym litrze albo z klawiatury z miejscami po przecinku (np. `48,7`). Miejsca po przecinku zostają w rachunku. Podpis mówi, ile mieści się do pełna i jaką pojemność mają zbiorniki.
3. **Stan po tankowaniu** z miarką na tle pojemności zbiorników: szarym to, co było, bursztynem to, co dolano. Stan ponad pojemność blokuje zapis z powodem.

Po pomiarze paliwa ekran pokazuje pod kartą **rzeczywiste zużycie** od ostatniego odczytu: odczyt odniesienia, czas pracy silnika, litry, średnią na godzinę i werdykt wobec normy maszyny - kontrolę wiarygodności liczby wyżej. Bez pomiaru, bez normy albo bez pracy silnika rachunku nie ma: aplikacja nie zgaduje.

> **Uwaga.** Tankowanie przy pracującym silniku jest niemożliwe - przycisk mówi to wprost. Dolewa się przy zatrzymanym śmigle; to samo dotyczy dolewki oleju.

> **Dlaczego tak.** Po locie pole „przed tankowaniem" jest puste, choć aplikacja umie policzyć szacunek. Podstawiona liczba dałaby się zatwierdzić bez spojrzenia na paliwomierz, a rachunek zużycia ma liczyć się z pomiaru - nie z modelu.

## Olej

- **Pomiar przy przejęciu jest obowiązkowy** (krok 3 rozpoczęcia lotu; we [wpisie po fakcie](wpis-lotu-po-fakcie) - opcjonalny). Sekcja pokazuje stan w silniku dużą liczbą i podziałkę wobec zbiornika; bursztynowa kreska to minimum przed lotem z karty samolotu. Pod minimum sekcja ostrzega („dolej przed lotem") - nie blokuje.
- **Dolewka** to osobne zdarzenie: przy przejęciu (w tym samym arkuszu co pomiar, pole „Dolano") albo z kokpitu kafelkiem **Dolej olej**. Dolewka ma własny wiersz na osi operacji („Dolewka oleju · +0,5 L") i poprawia się jak tankowanie: przez unieważnienie i dopisanie.
- **Szlak w arkuszu**: ostatni pomiar (kto, kiedy, przy jakim liczniku), ile motogodzin od tego czasu latano i ile oleju według normy powinno być na bagnecie. Odczyt wyraźnie niższy od oczekiwania dostaje ostrzeżenie: sprawdź, czy silnik nie traci oleju.
- **Przy zdaniu samolotu oleju się nie mierzy** - odczyt tuż po locie nie jest wiarygodny.

W kokpicie kafelek **Dolej olej** pokazuje, ile oleju jest w silniku (pomiar plus dolewki); po uruchomieniu silnika - z dopiskiem „około", odświeżanym co 5 minut.

## Jak to działa

Paliwo liczy się między odczytami. Każdy odczyt paliwomierza (przejęcie, pomiar przed tankowaniem, zdanie) i każde tankowanie (stan przed, dolano, stan po) jest punktem na osi paliwa tej maszyny; między dwoma punktami aplikacja zna czas pracy silnika, więc umie policzyć średnie zużycie i porównać je z normą. Szacunek „ile zostało" to ostatni pewny odczyt pomniejszony o zużycie z normy za czas pracy silnika - podpowiedź, nie pomiar. Olej idzie własną osią: od pomiaru do pomiaru, przez wiele operacji, bo bagnet tuż po locie kłamie. Oczekiwanie na bagnecie to ostatni pomiar plus dolewki minus norma oleju pomnożona przez motogodziny od tego pomiaru. Więcej: [norma zużycia](norma-zuzycia), [łańcuch odczytów](lancuch-odczytow).

> **Założenie.** Oleju nie mierzy się po locie, bo poziom na bagnecie ustala się dopiero po ostygnięciu silnika. Dlatego zużycie oleju jednej operacji nie ma werdyktu - ma go dopiero odcinek od pomiaru do pomiaru.

> **Wskazówka.** Tankowanie zapomniane w kokpicie dopiszesz później: na ekranie operacji **EDYTUJ DANE** → **DODAJ WPIS** → Tankowanie (stan przed i dolano; stan po liczy się sam).

## Częste problemy

- **ZAPISZ TANKOWANIE jest nieaktywny** → w przycisku stoi powód: wpisz stan paliwa w zbiornikach (po locie pole jest puste), ustaw ilość dolanego paliwa, albo stan po tankowaniu przekracza pojemność zbiorników.
- **Pole „przed tankowaniem" jest puste, choć przed chwilą podałem odczyt** → od tego odczytu silnik pracował, więc liczba jest już nieaktualna. Odczytaj paliwomierz jeszcze raz; szacunek w podpisie mówi, czego się spodziewać.
- **Pomiar oleju jest poniżej minimum** → to ostrzeżenie, nie blokada: dolej i wpisz dolewkę w tym samym arkuszu. Stan po dolewce liczy się sam.
- **Kafelek mówi „W silniku około"** → po uruchomieniu silnika to szacunek; dokładną liczbę da dopiero następny pomiar przy przejęciu.
