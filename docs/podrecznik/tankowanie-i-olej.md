# Tankowanie i olej

> Tankowanie zapisujesz w kokpicie przy zatrzymanym silniku - przed uruchomieniem albo po wyłączeniu. Olej mierzysz przy rozpoczęciu lotu, a dolewkę zapisujesz osobno.

## Jak zapisać tankowanie

W kokpicie tapnij kafelek **Tankowanie**. Ekran ma trzy części:

1. **FOB przed tankowaniem** - paliwo na pokładzie przed dolaniem.
   - Jeśli samolot nie latał od ostatniego odczytu - najczęściej przy tankowaniu przed lotem - wartość jest już wpisana.
   - Jeśli latał, pole jest puste: odczytaj paliwomierz i wpisz wynik. Podpis podpowiada szacunek, na przykład „szacunek z normy samolotu: ~112 L", a okienko pokazuje, ile było, ile latano i ile mogło się spalić.
2. **Dolano** - litry z dystrybutora. Przyciski zmieniają wartość o pełny litr, a z klawiatury wpiszesz też części litra, na przykład `48,7`. Podpis mówi, ile zmieści się do pełna.
3. **Stan po tankowaniu** z miarką na tle pojemności zbiorników: szarym to, co było, bursztynem to, co dolano.

**ZAPISZ TANKOWANIE** zapisuje dolewkę. Jeśli czegoś brakuje albo paliwa byłoby więcej, niż mieszczą zbiorniki, przycisk powie dlaczego.

Po wpisaniu pomiaru pod kartą pojawia się **rzeczywiste zużycie** od ostatniego odczytu: czas pracy silnika, zużyte litry, średnia na godzinę i ocena wobec normy samolotu.

@screen 06-tankowanie "Tankowanie" | 02b-preflight-paliwo "Okienko odczytu paliwa"

> **Uwaga.** Przy pracującym silniku tankowania nie zapiszesz - paliwo i olej dolewa się przy zatrzymanym śmigle.

## Olej

- **Pomiar przy rozpoczęciu lotu jest obowiązkowy.** W kroku 3 rozpoczęcia lotu mierzysz olej na bagnecie. Sekcja pokazuje stan w silniku i podziałkę wobec zbiornika; bursztynowa kreska to minimum przed lotem. Pod minimum aplikacja ostrzega „dolej przed lotem", ale nie blokuje lotu.
- **Dolewkę zapisujesz osobno** - w tym samym okienku co pomiar (pole „Dolano") albo z kokpitu kafelkiem **Dolej olej**. Dolewka ma własny wiersz w logu operacji.
- **Okienko pomiaru podpowiada**: ostatni pomiar (kto, kiedy, przy jakim liczniku), ile motogodzin od tego czasu latano i ile oleju powinno być na bagnecie według normy. Gdy odczyt jest wyraźnie niższy, okienko radzi sprawdzić, czy silnik nie traci oleju.
- **Przy zdaniu samolotu oleju się nie mierzy** - tuż po locie odczyt z bagnetu nie jest wiarygodny.

W kokpicie kafelek **Dolej olej** pokazuje, ile oleju jest w silniku. Po uruchomieniu silnika to szacunek z dopiskiem „około", odświeżany co 5 minut.

@screen 02i-preflight-olej "Pomiar oleju poniżej minimum" | 04a-cockpit-ground "Kafelek Dolej olej w kokpicie"

## Zapomniane tankowanie

Tankowanie, którego nie zapisano w kokpicie, dopiszesz później: na ekranie operacji **EDYTUJ DANE** → **DODAJ WPIS** → **Tankowanie**. Podajesz stan przed tankowaniem i ile dolano - stan po tankowaniu policzy się sam.

@screen 10h-dodaj-wpis "Dopisanie tankowania"

## Częste problemy

- **ZAPISZ TANKOWANIE jest nieaktywny** → przycisk mówi, czego brakuje: stanu paliwa w zbiornikach (po locie pole jest puste) albo ilości dolanego paliwa. Może też być tak, że po tankowaniu paliwa byłoby więcej, niż mieszczą zbiorniki.
- **Pole przed tankowaniem jest puste, choć niedawno był odczyt** → od tego odczytu silnik pracował, więc liczba jest już nieaktualna. Odczytaj paliwomierz jeszcze raz - podpis podpowiada, czego się spodziewać.
- **Pomiar oleju jest poniżej minimum** → to ostrzeżenie, nie blokada. Dolej olej i wpisz dolewkę w tym samym okienku.
- **Kafelek mówi „W silniku około…"** → po uruchomieniu silnika to szacunek. Dokładną wartość da następny pomiar przy rozpoczęciu lotu.
