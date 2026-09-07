# Kokpit

> Od uruchomienia do zatrzymania silnika telefon zapisuje sam kołowanie, starty i lądowania. Pilot ma pod ręką tankowanie, załadunek, zmianę załogi i przyciski ręczne na wypadek braku GPS.

@screen 04a-cockpit-ground "Przed uruchomieniem" | 05-cockpit-running "W locie" | 04-cockpit-ground "Po zatrzymaniu"

## Przed uruchomieniem silnika

Pasek górny pokazuje znak samolotu, lotnisko i zadanie; sygnatura operacji pojawi się w nim po uruchomieniu silnika. Kafelki na ziemi:

- **Tankowanie** - dolewka przed lotem ([tankowanie i olej](tankowanie-i-olej)).
- **Dolej olej** - kafelek pokazuje, ile oleju jest w silniku („W silniku 9,2 L": pomiar z przejęcia plus dolewki).
- **Załadunek** (tylko w dniu skokowym) - wejście skoczków na pokład, ze składem albo bez; skład wypełni potem arkusz zrzutu.
- **Zmiana załogi** - drugi pilot wchodzi albo schodzi. Dowódcy nie zmienia się w trakcie: nowy dowódca to zdanie samolotu i nowe przejęcie z jego telefonu.
- **Zdaj samolot · Nie lecisz? Zdanie bez lotu** - pogoda, usterka, próba silnika: maszyna wraca do klubu z powodem i opcjonalnym komentarzem.

Jeśli maszyna ma normę zużycia, nad logiem stoi pasek paliwa: ostatni odczyt i szacunek wystarczalności (np. „wystarczy na ~6 wyniesień do rezerwy 45 min") z podpisem, że decyduje paliwomierz.

**START ENGINE** wymaga **przytrzymania przez sekundę** - tak samo jak STOP ENGINE i przyciski ręczne. Przypadkowe tapnięcie niczego nie uruchomi.

## W locie

Po uruchomieniu silnika aplikacja wykrywa z GPS **kołowanie, start i lądowanie** i dopisuje je do osi operacji. W jednej operacji może być wiele lotów - także kręgi z touch and go, każdy liczony osobno. Duży wskaźnik na górze nazywa fazę (Engine idle, Taxi, Climb, Cruise, Descent) i liczy czas; pod nim stoją prędkość nad ziemią, wysokość, paliwo na pokładzie i czas lotu.

- **Wykryty start albo lądowanie najpierw pokazuje się jako komunikat z odliczaniem 5 sekund** i przyciskiem cofnięcia („COFNIJ - NIE BYŁO STARTU", „COFNIJ - TO PRZELOT"). Brak reakcji = zapis. Kołowanie zapisuje się od razu, bez odliczania.
- **Zrzut skoczków** (dzień skokowy) - przycisk w locie; arkusz podpowiada skład z załadunku, a wysokość bierze z GPS jako średnią z ostatnich 15 sekund. Skład jest opcjonalny, więc zapis zrzutu nigdy nie jest zablokowany.
- **Przyciski ręczne** - „Take off" i „Landing" z przytrzymania. Arkusz ogłasza typ zdarzenia w tytule i pozwala cofnąć godzinę przyciskami ±1 min, jeśli zauważyłeś je po fakcie.
- **Paliwo i olej po uruchomieniu to szacunki** - kafelki mówią „około" i odświeżają się co 5 minut na podstawie normy maszyny i czasu pracy silnika. Przed uruchomieniem pokazują odczyty.

Gdy GPS zamilknie na kilkanaście sekund, kokpit pokazuje baner „GPS: brak sygnału · autodetekcja wstrzymana", parametry zmieniają się w kreski, a start i lądowanie zapisuje się przyciskami. Zegary liczą dalej, a wysyłka danych działa - to awaria czujnika, nie łączności. Powrót sygnału gasi baner bez Twojego udziału.

@screen 05f-zdarzenie-reczne "Zdarzenie ręczne" | 05g-cockpit-no-gps "Bez sygnału GPS" | 05e-zrzut "Zapis zrzutu"

> **Wskazówka.** Przełącznik w prawym górnym rogu przełącza ciemny i jasny motyw - jasny jest na pełne słońce. Ustawień w kokpicie nie ma; są na ekranie Mój dzień.

## Jak to działa

Automat patrzy na kolejne odczyty GPS i odrzuca te, które nie zasługują na zaufanie (zła dokładność, nieprawdopodobny skok pozycji). Kołowanie rozpoznaje po tym, że samolot oddalił się od miejsca postoju o ponad 25 metrów. Start wymaga prędkości około 50 węzłów bez hamowania albo wzniesienia ponad 50 stóp nad poziom lotniska, utrzymanych przez kilka sekund; lądowanie - jednocześnie małej prędkości i wysokości blisko ziemi, poza ciasnym zakrętem, a w dniu skokowym dodatkowo w pobliżu pola. Poziom lotniska aplikacja bierze z wysokości GPS w chwili uruchomienia silnika, nie z mapy - dzięki temu błąd odbiornika skraca się w rachunku. Do rejestru trafia nie chwila potwierdzenia, lecz odszukana wstecz chwila oderwania albo przyziemienia; po każdym wykryciu automat na chwilę ślepnie, żeby dobieg nie udawał rozbiegu. Progi i pełny opis: [wykrywanie faz lotu](wykrywanie-faz-lotu).

> **Dlaczego tak.** Zdarzenie zapisuje się dopiero po odliczeniu, bo rejestru się nie kasuje - cofnięcie zapisu musiałoby być kolejną poprawką. Pięć sekund kosztuje mniej niż fałszywy start w dokumentach.

> **Założenie.** Bez wiarygodnej wysokości automat woli zmilczeć lądowanie niż je zmyślić. Brakujące zdarzenie dopisuje pilot - przyciskiem w locie albo poprawką po zatrzymaniu silnika.

## Po zatrzymaniu silnika

**STOP ENGINE** kończy bieg silnika i operację. Drugiego startu w tej operacji nie ma - kolejny lot to nowe przejęcie z ekranu Mój dzień. Na ziemi zostają: tankowanie, dolewka oleju, kafelek **Popraw dane operacji** (brakujące lądowanie, zły czas - zanim zatwierdzisz log) i główny przycisk **ZDAJ SAMOLOT** → [zdanie samolotu](zdanie-samolotu). Pod osią stoi stopka z sumami: blok, czas lotu, starty.

> **Dlaczego tak.** Operacja to dokładnie jeden bieg silnika. Każda jest domknięta odczytami z obu stron - przejęcia i zdania - więc rachunek paliwa i motogodzin ma zawsze pełne dane, a log zatwierdza się raz, przy zdaniu. Więcej: [model operacji](model-operacji).

## Z kokpitu nie ma wyjścia bokiem

Dopóki trzymasz samolot, przycisk wstecz i gest cofania nie prowadzą na Mój dzień - pokazują arkusz **TRZYMASZ SP-AXA** z wyborem: zostań albo zdaj samolot. Maszynę oddaje się wyłącznie przez zdanie, żeby żadna operacja nie została otwarta przez przypadek, a następny pilot zawsze dostał przekazanie. Jedyny wyjątek robi administrator: gdy zakończy albo unieważni Twoją operację z panelu, kokpit sam wraca na Mój dzień z banerem.

## Oś operacji

Pod wskaźnikiem stoi oś zdarzeń tej operacji: przejęcie z odczytami, tankowania i dolewki oleju, uruchomienie, kołowanie, każdy start i lądowanie z czasem lotu, zrzuty, wyłączenie. To ta sama oś, którą zobaczysz później na [ekranie operacji](operacja-i-korekty) - kokpit dokłada tylko wiersz „na żywo" z bieżącym czasem.

## Częste problemy

- **Nie wykryło startu albo lądowania** → w locie przytrzymaj „Take off" / „Landing" i cofnij godzinę w arkuszu, jeśli minęło kilka minut. Po zatrzymaniu silnika brakujące zdarzenie dopisze **Popraw dane operacji** → **DODAJ WPIS**.
- **Wykryło start, którego nie było** → tapnij COFNIJ w czasie odliczania. Po zapisie: **Popraw dane operacji**, ołówek przy wierszu, „tego nie było".
- **Baner „GPS: brak sygnału"** → zapisuj start i lądowanie przyciskami; sygnał zwykle wraca sam. Stan odbiornika sprawdzisz w [ustawieniach](ustawienia), w sekcji „Diagnostyka GPS".
- **Nie mogę wrócić na Mój dzień** → zdaj samolot: ZDAJ SAMOLOT po locie, „Zdanie bez lotu" przed uruchomieniem. Ustawienia i poprzednie dni wrócą po zdaniu.
- **Po STOP ENGINE nie ma START ENGINE** → to nie błąd: kolejny lot to nowe przejęcie. Zdaj samolot i rozpocznij lot jeszcze raz.
- **Kokpit sam wrócił na Mój dzień** → administrator zakończył albo unieważnił operację; baner mówi, która i dlaczego.
