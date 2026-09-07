# Łańcuch odczytów: paliwo i motogodziny między pilotami

> Odczyty przy przejęciu i zdaniu samolotu układają się w łańcuch: ile jeden pilot zostawił, tyle następny powinien zastać. Rozjazd jest ostrzeżeniem dla pilota i sygnałem dla klubu - nigdy blokadą.

## Ogniwa

Każda operacja ma odczyty z obu stron. Przy przejęciu pilot potwierdza paliwo i licznik motogodzin z przekazania (albo wpisuje własne) i mierzy olej; przy zdaniu wpisuje paliwo i licznik - obowiązkowo. Zdanie jednego pilota jest przekazaniem dla następnego. Łańcuch jest osią **samolotu**: nie zależy od tego, kto lata ani w jakiej dobie.

@screen 02a-preflight "Odczyty przy przejęciu" | 09b-zdaj-samolot "Odczyty przy zdaniu"

> **Dlaczego odczyt przy zdaniu jest obowiązkowy.** To on zatwierdza log operacji, staje się przekazaniem dla następnego pilota i ogniwem łańcucha; bez niego następny musiałby zgadywać, a [norma zużycia](norma-zuzycia) nie miałaby z czego liczyć. Odczyt jest jeden na operację - także w dniu skokowym z dziesięcioma lotami.

## Przekazanie przy rozpoczęciu lotu

W kroku 3 rozpoczęcia lotu na górze stoi, skąd pochodzą liczby - „Wartości z ostatniego przekazania · SP-AXA przekazał J. Kowalski" - i jedna instrukcja: zweryfikuj ilość paliwa w zbiornikach i aktualny stan licznika motogodzin. Arkusz paliwa pokazuje **szlak**: ile poprzednik zastał, ile dolał, ile latał („J. Kowalski latał · 1h 30min") i ile według normy powinno zostać („Szacunkowo zostało ~X L"). To krzyżowa kontrola przekazania: łapie literówkę w odczycie zdania albo tankowanie poza aplikacją.

Przekazanie to dane z klubu, więc ma trzy stany: **na żywo** (bez adnotacji), **z ostatniego połączenia** (bursztynowe „Ostatnie pobrane · 21 CZE 17:30" przy wartości) i **brak** - wtedy Twoje odczyty rozpoczynają nowe ogniwo.

@screen 02b-preflight-paliwo "Szlak paliwa w arkuszu" | 02c-preflight-motogodziny "Arkusz odczytu motogodzin" | 02d-preflight-offline "Wartości z ostatniego połączenia"

## Pierwsze ogniwo: stan wpisany w panelu

Maszyna, której nikt jeszcze nie przekazał, ma w karcie samolotu „Aktualny stan" wpisany przez administratora. Wchodzi on do łańcucha tylko wtedy, gdy dziennik nie ma czym odpowiedzieć, i tylko z kompletem pary paliwo + licznik. Pilot widzi baner „Stan początkowy z panelu" zamiast nazwiska poprzednika, a stempel mówi „Wpis z …", nie „Stan z …" - chwili pomiaru nikt nie zna.

## Odczyty administratora

Gdy dziennik rozjechał się z rzeczywistością, administrator wpisuje w karcie samolotu **nadrzędne odczyty** paliwa, licznika i opcjonalnie oleju - z wymaganym komentarzem. Wpis staje się konkurentem ostatniego zdania: przekazaniem zostaje ten, kto stoi **dalej w łańcuchu** (wyższy licznik; przy remisie późniejszy). Kolejne zdanie z wyższym licznikiem wypiera wpis samo. Pilot widzi „Odczyty wpisał administrator"; rejestr operacji się nie zmienia.

> **Założenie.** Osią porządku jest licznik motogodzin: rośnie tylko w jedną stronę, niezależnie od zegarów telefonów i sieci. Dlatego cofnięty licznik jest jedyną rzeczą, którą łańcuch blokuje twardo.

## Rozjazd ostrzega, nie blokuje

Odczyt inny niż przekazanie daje ostrzeżenie w obie strony, np. „Odczyt różni się od przekazanego o −30 L. Sprawdź stan zbiorników." Tolerancja to podziałka przyrządów: około 6 litrów i 0,1 motogodziny. Blokują wyłącznie stany fizycznie niemożliwe: licznik cofnięty względem przejęcia i paliwo ponad pojemność zbiorników.

> **Uwaga.** Paliwomierz i licznik mają rację, a serwer tylko podpowiada. Ktoś mógł dolać poza aplikacją albo pomylić cyfrę - różnicę wyjaśnia klub, nie blokada w kokpicie.

## Olej idzie własną osią

Olej mierzy się przy **przejęciu** (obowiązkowo), a przy zdaniu - nie: bagnet tuż po locie kłamie. Dolewki są osobnymi zdarzeniami (w arkuszu przejęcia albo z kokpitu), a zużycie liczy się od pomiaru do pomiaru, przez wiele operacji. Arkusz podpowiada: „Ostatni pomiar · 21 CZERWCA 07:02 - J. Kowalski", „Latano · 4:00 MH" i ile oleju powinno zostać według normy. Ostrzeżenie pada tylko wtedy, gdy oleju **przybyło** bez zapisanej dolewki - ubytek jest normalnym zużyciem.

@screen 02i-preflight-olej "Pomiar oleju poniżej minimum"

## Wpis lotu po fakcie

Wpis po fakcie pyta o chwilę z przeszłości, więc podpowiada zastane paliwo i licznik z operacji **poprzedzającej** na tej maszynie - z podpisem przy polu („z poprzedniego lotu · AKO") i tylko w pole puste. Odczytów po locie nie podstawia nikt: na nie odpowiada pilot. Ostrzeżenia patrzą w obie strony łańcucha: „Paliwo nie zgadza się z następnym lotem - następny pilot zastał 92 L, a wpis kończy na 76 L." Ta podpowiedź wymaga sieci; bez niej ekran o ciągłości milczy, a wpis zapisuje się jak zwykle.

@screen 15c-reczny-liczniki "Podpowiedź z poprzedniej operacji"

## Co widzi administrator

W dzienniku każda operacja ma paliwo i licznik przejęcie → zdanie w jednej komórce, obok dolewkę i olej; brak odczytu to kreska, nigdy zero. Rozjazd widać, zestawiając zdanie jednej operacji z przejęciem następnej. Operacja zakończona z panelu bez odczytów nie jest ogniwem łańcucha. Naprawa ma dwie drogi: korekta odczytu w operacji (z powodem i historią zmian) albo nadrzędne odczyty w [karcie samolotu](panel-samoloty).
