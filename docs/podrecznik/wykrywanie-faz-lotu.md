# Jak aplikacja wykrywa kołowanie, start i lądowanie

> Po START ENGINE telefon czyta odbiornik GPS i sam dopisuje do osi operacji kołowanie, każdy start i każde lądowanie. Uruchomienie i wyłączenie silnika zawsze zapisuje pilot - a gdy GPS zawiedzie, także starty i lądowania.

@screen 05-cockpit-running "Kokpit w locie" | 05g-cockpit-no-gps "Bez sygnału GPS" | 05f-zdarzenie-reczne "Zdarzenie ręczne"

## Trzy pytania

Automat odpowiada wyłącznie na trzy pytania: czy samolot **ruszył ze stanowiska** (kołowanie otwiera lot na osi, ale nie wyznacza żadnego czasu rozliczeniowego), czy **wystartował** (początek czasu lotu) i czy **wylądował** (koniec czasu lotu). START ENGINE i STOP ENGINE są zawsze ręczne, z przytrzymaniem przez sekundę - z nich liczy się czas blokowy. Napis fazy nad wskaźnikiem (Idle, Taxi, Climb, Cruise, Descent) to podpis dla oka, który niczego nie zapisuje.

## Co aplikacja mierzy

Z odbiornika GPS przychodzą pozycja, prędkość nad ziemią, wysokość, kurs i dokładność. Automat patrzy na okno ostatnich sekund, nie na pojedynczy odczyt: medianę prędkości, trend przyspieszenia (rozbieg przyspiesza, dobieg hamuje), przemieszczenie od stanowiska i tempo zakrętu. Odczyty pozytywnie złe odpadają na wejściu - dokładność w setkach metrów, prędkość spoza możliwości maszyny; brak pomiaru nie dyskwalifikuje, bo brak to nie zero. Wysokość liczy się **względem lotniska**, a elewację automat bierze z tego samego odbiornika w chwili START ENGINE - nigdy z katalogu lotnisk.

> **Dlaczego tak.** Wysokość odczytu i elewacja pola odejmują się od siebie, więc wspólny błąd odbiornika się skraca. Elewacja z mapy leży w innym układzie odniesienia i dawałaby stały błąd rzędu stu stóp: fałszywy start na postoju i lądowanie, które nigdy nie zapada.

## Pięć faz

- **Postój** - stanowisko to uśredniona pozycja z ostatnich kilkudziesięciu sekund, odporna na dryf odbiornika.
- **Kołowanie** - samolot oddalił się od stanowiska o kilkadziesiąt metrów (plus niepewność odczytu) i trzyma się tego kilka sekund. Prędkość jest tylko wsparciem: telefony często pokazują 0 kt przy wolnym ruchu, a przemieszczenie widać zawsze. Zapisuje się od razu, jako chwila zwolnienia hamulców.
- **Start** - prędkość nad ziemią powyżej progu rzędu kilkudziesięciu węzłów bez hamowania **albo** wzniesienie o kilkadziesiąt stóp nad lotnisko, utrzymane kilka sekund. Weto hamowania odróżnia dobieg po lądowaniu od rozbiegu; po starcie automat przez około minutę nie szuka kolejnej zmiany.
- **Lot** - automat wypatruje już tylko lądowania.
- **Lądowanie** - niska prędkość **i** niska wysokość nad lotniskiem **i** brak ciasnego zakrętu, utrzymane kilka sekund. Sam spadek prędkości to codzienność zakrętu; dopiero razem z wysokością znaczy „jestem na ziemi". Dobieg zapisuje się jako kołowanie.

> **Założenie.** Bez wysokości automat lądowania nie wykryje - milczy świadomie, bo zmyślone lądowanie kosztuje więcej niż jego brak. Brakujące lądowanie dopisuje pilot.

## „Czy" i „kiedy" to dwa pytania

Decyzja, **czy** coś się wydarzyło, zapada późno i na mocnych przesłankach; **kiedy** - tego automat szuka wstecz w zapisie ostatnich minut. Start to ostatnia chwila z kołami na ziemi, lądowanie - pierwsza chwila serii przy ziemi, kołowanie - ostatnia chwila przy stanowisku. Na oś trafia ta cofnięta godzina, więc czas na upewnienie się nie kosztuje dokładności w dokumentach.

Wykryty start i lądowanie pokazują się najpierw jako powiadomienie „Wykryto: Takeoff" z odliczaniem: brak reakcji przez kilka sekund to zapis, **COFNIJ** znaczy, że zapisu nie będzie. Kołowanie okna nie ma - błędny wpis dokłada wiersz, a nie psuje rozliczenia.

## Skoki mają jedno lotnisko

Rodzaj operacji z kroku 2 rozpoczęcia lotu steruje detekcją. Skoki startują i lądują na tym samym placu, więc formularz pyta o jedno lotnisko, a automat uznaje lądowanie tylko w promieniu kilku kilometrów od niego - „wolno i nisko" daleko od pola jest w dniu skokowym artefaktem. Przelot i egzamin mają parę skąd → dokąd i tej bramki nie mają: tam lądowanie gdzie indziej jest normą.

## Przyciski ręczne

Przycisk ręczny w pasku kokpitu jest zawsze widoczny i nazywa kolejne zdarzenie: **Taxi**, **Take off**, **Landing**. Wymaga przytrzymania przez sekundę; w arkuszu godzinę cofniesz o ±1 min albo wpiszesz z klawiatury, bo pilot orientuje się po fakcie. Zdarzenie ręczne wygląda na osi tak samo jak wykryte; skąd pochodzi, widzi klub w dzienniku.

## Gdy GPS zawiedzie

Po kilkunastu sekundach ciszy kokpit pokazuje baner „GPS: brak sygnału · autodetekcja wstrzymana". Timery liczą dalej z zegara, a sieć to osobna sprawa - zapisy wysyłają się normalnie.

- W locie start i lądowanie zapisujesz przyciskami ręcznymi.
- Po STOP ENGINE kafelek **Popraw dane operacji** → **DODAJ WPIS** dopisuje przegapione zdarzenia, zanim zdasz samolot.
- Lot bez telefonu wpisujesz przez **DODAJ LOT RĘCZNIE** - taki wpis nie ma śladu GPS. Przerwa w sygnale zostawia dziurę w śladzie.

## Zrzut skoczków

W dniu skokowym przycisk zrzutu w locie otwiera arkusz ze składem z załadunku do potwierdzenia. Wysokość podstawia GPS jako **średnią z ostatnich kilkunastu sekund** - pojedynczy odczyt niósł szum kilkudziesięciu stóp. Bez sygnału wysokość wpisujesz z wysokościomierza.

## Ślad po locie

Cały bieg silnika na mapie: kołowanie przerywaną szarą linią, loty pełną zieloną, znaczniki każdego startu i lądowania z godziną, do tego profil wysokości z przerwami na ziemi. Więcej: [ślad GPS](slad-gps).

## Progi są kalibrowane na nagraniach

Progi wyszły z rozumowania o fizyce czujników i są **do kalibracji na prawdziwych lotach**. Przy pracującym silniku telefon nagrywa surowe odczyty (także odrzucone), znaczniki wykryć i każde COFNIJ, a nagranie odtwarza się przez ten sam automat, który pracuje w telefonie. Barometr, akcelerometr i żyroskop są nagrywane, ale nie decydują - dopóki nie ma danych.

> **Wskazówka.** COFNIJ przy fałszywym wykryciu to najcenniejszy materiał do kalibracji - jedyny sposób, w jaki człowiek oznacza pomyłkę automatu. Używaj go zamiast poprawiać oś po locie.
