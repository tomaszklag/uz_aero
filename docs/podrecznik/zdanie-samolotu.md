# Zdanie samolotu

> Zdanie kończy operację: odczyt paliwa i motogodzin jest obowiązkowy, bo zatwierdza log operacji i przekazuje maszynę następnemu pilotowi.

@screen 09b-zdaj-samolot "Zdanie po locie" | 09c-zdaj-bez-lotu "Zdanie bez lotu"

## Przegląd lotów

Na górze ekranu stoi podsumowanie operacji (Loty · Blok · Lot i godzina przejęcia), lista lotów z czasami z wykrywania oraz klamra silnika: uruchomienie → wyłączenie · blok. To ostatnia chwila na sprawdzenie, czy log się zgadza. Jeśli brakuje lądowania albo czas jest zły, tapnij **JESZCZE NIE - WRÓĆ DO KOKPITU** i popraw kafelkiem **Popraw dane operacji**; po zdaniu zostaje jeszcze [okno korekty](operacja-i-korekty) - 24 godziny.

## Odczyty przy zdaniu

- **Paliwo na pokładzie** - po biegu silnika pole startuje puste, a podpis podpowiada szacunek z normy maszyny („szacunek z normy: ~60 L"). W arkuszu stoi szlak: odczyt sprzed lotu, ile latano i ile według normy mogło się spalić, na końcu szacunek. Wpisz to, co pokazuje paliwomierz. Po wpisaniu podpis podsumowuje: przy przejęciu, tankowania, zużyte.
- **Motogodziny** - odczyt licznika w formacie maszyny; podpis pokazuje stan przy przejęciu i przyrost. Wartość niższa niż przy przejęciu jest blokadą z powodem: licznik nie cofa się sam.
- **Oleju przy zdaniu się nie mierzy** - bagnet tuż po locie kłamie. Olej zmierzy następny pilot przy przejęciu.

Arkusz odczytu ostrzega na miejscu, nad przyciskiem: odczyt przekracza pojemność zbiorników, po locie nie mogło zostać tyle paliwa, ile wpisujesz, albo wartość odbiega od tego, co zapisano wcześniej. Ostrzeżenie nie blokuje - przyrząd ma rację.

**ZDAJ I ZATWIERDŹ LOG** zapisuje zdanie i wraca na Mój dzień. Sygnaturę operacja ma od uruchomienia silnika; zdanie zamyka ją odczytami.

## Zdanie bez lotu

Gdy silnik nie ruszył (pogoda, usterka, zmiana planów), zdajesz samolot z kafelka „Zdaj samolot" w kokpicie przed uruchomieniem. Ekran pokazuje, jak długo maszyna była trzymana, liczniki „bez zmian" z ołówkami do poprawki i pyta o powód: **Pogoda**, **Usterka**, **Odwołane**, **Inne**. Komentarz jest opcjonalny, ale „usterka" bez słowa, która, jest dla klubu pytaniem - dopisz je.

> **Uwaga.** Zdanie bez lotu i bez żadnej zmiany odczytów nie tworzy operacji: ekran ostrzega przed zapisem, że nic nie zostanie zapisane i wpis nie pojawi się w Twoim dniu ani w panelu. Zmieniony odczyt paliwa lub licznika albo dolewka robią z zapisu operację - z numerem, sygnaturą i kafelkiem z godzinami zajęcia maszyny oraz trójką `0 · 0:00 · 0:00`.

## Jak to działa

Zdanie dopisuje do rejestru ostatni wpis operacji: odczyty końcowe. Ten wpis robi trzy rzeczy naraz. Zamyka rachunek Twojej operacji (odczyt przy przejęciu, tankowania, odczyt przy zdaniu - stąd zużycie i werdykt wobec normy), staje się przekazaniem dla następnego pilota (zobaczy Twoje liczby w kroku 3 z podpisem, kto i kiedy zdał) i jest ogniwem łańcucha motogodzin, po którym klub porządkuje operacje tej maszyny. Zatwierdzenia logu nie robi się osobno - jest nim właśnie zdanie, i od tej chwili liczy się okno korekty. Szacunek w podpisie to ostatni pewny odczyt pomniejszony o zużycie z normy za czas pracy silnika - z osobną stawką w locie i na ziemi, gdy klub ją ma. Więcej: [łańcuch odczytów](lancuch-odczytow), [norma zużycia](norma-zuzycia).

> **Dlaczego tak.** Odczyt przy zdaniu jest obowiązkowy, bo bez niego następny pilot nie wie, z czym startuje, a klub traci ogniwo łańcucha. Dzień skokowy na tym nie cierpi: dziesięć wyniesień to jeden bieg silnika, czyli jedno przejęcie i jeden odczyt na końcu.

> **Dlaczego tak.** Szacunek stoi w podpisie, nie w polu. Podstawiona liczba dałaby się zatwierdzić bez spojrzenia na paliwomierz - a wtedy w rejestrze byłby model, nie pomiar.

> **Założenie.** Zdanie samolotu nie kończy Twojego dnia - kolejna maszyna dopisze się do listy operacji. Zdanie nie ma też własnej godziny do poprawiania, bo od niego liczy się termin korekty.

## Co dzieje się po zdaniu

- Zapis czeka w kolejce i wychodzi do klubu, gdy tylko jest sieć - aplikację możesz zamknąć.
- Twoje odczyty stają się przekazaniem dla następnego pilota.
- Operacja stoi na Mój dzień z trójką Loty · Blok · Lot, a po północy UTC przechodzi do [poprzednich dni](poprzednie-dni). Przez 24 godziny poprawisz ją sam, potem robi to administrator.

## Częste problemy

- **ZDAJ I ZATWIERDŹ LOG jest nieaktywny** → w przycisku stoi powód: brak odczytu paliwa lub licznika, albo licznik niższy niż przy przejęciu - popraw odczyt.
- **W przeglądzie brakuje lądowania albo lot ma zły czas** → **JESZCZE NIE - WRÓĆ DO KOKPITU** → **Popraw dane operacji**. Zdanie zatwierdza log, więc lepiej poprawić przed nim - choć okno korekty zostaje.
- **Odjechałem od samolotu bez odczytów** → jeśli masz je w notatce albo na zdjęciu, zdaj z miejsca, w którym jesteś; czas blokowy liczy się z biegu silnika, nie z chwili zdania. Jeśli nie masz - poproś administratora o zakończenie operacji z panelu; do tego czasu maszyna jest dla innych zajęta.
- **Ekran ostrzega, że „nic nie zostanie zapisane"** → to zdanie bez lotu bez żadnej zmiany; jeśli coś jednak dolałeś albo odczyt jest inny, popraw go ołówkiem przy licznikach.
