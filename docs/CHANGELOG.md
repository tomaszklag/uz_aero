# Wydania UZ Aero

<!--
Ten plik jest ŹRÓDŁEM strony „Wydania i zmiany" (/wydania/ na stronie UZ Aero).
Piszemy go dla pilotów, testerów i klubów - językiem korzyści, bez nazw plików i identyfikatorów.

Format (świadomie wąski, parsuje go site/tools/render-changelog.mjs):
  ## <wersja> (build <numer>) · <data słownie>     - jedno wydanie, najnowsze na górze
  ## W przygotowaniu                                 - to, co weszło do kodu od ostatniego builda
  > jedno zdanie o wydaniu                           - opcjonalnie, tuż pod nagłówkiem
  ### Nowości / ### Poprawki / ### Dla testerów      - grupy
  - punkt (z **pogrubieniem**, `kodem`, [linkiem](url))

  ## Plan wydań                                      - moduł „Co dalej" na stronie (nie jest wydaniem)
  ### <wersja> · <termin>                            - kamień milowy, np. „1.1.0 · planowane na wrzesień 2026";
                                                       bez numeru wersji („Dalej") = koszyk bez terminu
  > jedno zdanie o kamieniu milowym                  - opcjonalnie
  - [x] punkt gotowy (już w kodzie) · [~] w toku · [ ] w planach
  Pierwszy kamień milowy = następne wydanie: jego wersja i termin trafiają na tablicę stanu
  i do nagłówka „W przygotowaniu".

Rytm: przy nowym buildzie produkcyjnym sekcja „W przygotowaniu" dostaje nagłówek
z wersją, buildem i datą (numer builda = appBuildVersion z EAS), a nad nią powstaje
pusta „W przygotowaniu"; z planu znika zrealizowany kamień milowy. Potem:
  node site/tools/update-download.mjs [--release]     - cel strony pobierania
  npm run site                                        - podgląd lokalny (site/dist)
  git commit -am "Wydanie <wersja> (<build>)" && git push
Strona buduje się razem z obrazem serwera, więc push do gałęzi wdrożeniowej publikuje
i aplikację, i changelog - osobnego repozytorium strony nie ma od 2026-09-07.
-->

Wersja aplikacji to `wersja (build)` - wersję podnosimy przy wydaniu, numer builda rośnie
z każdym buildem. Aktualną wersję i numer builda podaje strona pobierania.

## W przygotowaniu

> Następne wydanie testowe: logowanie kontem Google zamiast haseł, panel klubu 2.0 i porządki po pierwszych tygodniach testów. Wymaga ponownej instalacji aplikacji.

### Nowości

- **Logowanie kontem Google.** Hasła znikają z aplikacji i z panelu. Nowy pilot loguje się kontem Google, jego zgłoszenie trafia do panelu, a administrator zatwierdza je i nadaje kod pilota. Aplikacja sama zauważa decyzję - do tego czasu pokazuje ekran „czeka na zatwierdzenie". Codzienne wejście to nadal PIN, bez internetu.
- **Panel klubu 2.0.** Trzy moduły zamiast jedenastu ekranów: **Piloci**, **Samoloty** i **Dziennik** (flota w zakresie dat → operacje jednej maszyny → jedna operacja z osią zdarzeń i śladem GPS). Dziennik pokazuje wyłącznie odczyty z przyrządów; brak odczytu widać jako kreskę, nie jako zero.
- **Administrator kończy operację, której pilot nie zamknął**, i może wpisać z panelu nadrzędne odczyty maszyny (paliwo, olej, motogodziny) z komentarzem. Telefon pilota nie wyśle już zdania po decyzji administratora, a pilot dostaje o tym czytelny komunikat.
- **Nazwa operacji zamiast identyfikatora.** Każda operacja ma sygnaturę w rodzaju `SP-AXA/2026-09-05/TMK/1` (znak, doba, pilot, numer w dobie) - w aplikacji i w panelu.
- **Karta samolotu w panelu**: pojemność zbiorników, norma zużycia paliwa i oleju z dokumentacji, minimum oleju, format licznika i aktualny stan liczników przy zakładaniu maszyny. Aplikacja pilnuje tych wartości u każdego pilota.
- **Olej.** Pomiar przy przejęciu z podziałką i minimum, dolewka jako osobne zdarzenie (z kokpitu i przy przejęciu), karta „Olej" na logu operacji, oczekiwanie z normy w arkuszu pomiaru.
- **Wpis lotu po fakcie** przebudowany: data w kalendarzu, oś operacji zamiast dwóch list (lot i zrzuty w swoim miejscu), paliwo jako trzy liczby (zastane, dolane, zostało), podpowiedź odczytów z poprzedniej operacji tej maszyny, kręgi jako liczba przy lądowaniu.
- **Usunięcie całego wpisu** - z potwierdzeniem i powodem; zapis zostaje w rejestrze i widzi go administrator.
- **Dwa motywy: ciemny i jasny** (na pełne słońce) z przełącznikiem jasności w kokpicie. Ustawienia mają jedno wejście - na ekranie „Mój dzień".
- **Przytrzymanie 1 s** na zdarzeniach ręcznych, STOP i uruchomieniu silnika - koniec z przypadkowymi tapnięciami.
- **Tankowanie i zdanie samolotu**: szacunek „ile zostało" z normy maszyny, miarka stanu po tankowaniu, wpis dolewki z klawiatury z miejscami po przecinku, szlak „ile zastał · ile latał · ile mógł spalić" w arkuszu pomiaru.
- **Ikona aplikacji** ze znaku panelu (zielony samolot) - jedna marka na obu powierzchniach.

### Poprawki

- Wskaźnik łączności mówi o **sieci**, nie o kolejce: osobny stan „SYNC STOI", gdy serwer odmówił, a ponowienie z ręki zawsze zostawia ślad i czeka dłużej na uśpiony serwer.
- Puste zdania samolotu (bez lotu, bez zmian odczytów) znikają z list; zapis bez biegu, ale ze zmianą, dostaje numer i pojawia się na liście.
- Lot unieważniony przez administratora znika także z historii; sumy dziennika w panelu nie liczą operacji unieważnionych.
- Klawiatura arkusza nie kurczy ekranu pod spodem - koniec z „dwa razy DALEJ" na wpisie ręcznym.
- Akcenty jasnego motywu są kolorami, nie czernią: zieleń, bursztyn i czerwień dobrane rachunkiem pod kontrast na bieli.
- Arkusze korekty pytają o wartość, nie tłumaczą rejestru; korekta odczytu wygląda jak każda inna korekta.
- Powód blokady stoi w przycisku, nie pod nim; pusta flota to ostrzeżenie na cały ekran z drogą wyjścia; wyjście z formularza pyta o rezygnację tylko przy niepustym szkicu.
- Nagłówki i kafelki pokazują znak i sygnaturę, nigdy surowy identyfikator z panelu.
- Brak śladu GPS mówi jednym zdaniem z powodem, bez opowieści o przechowywaniu.

### Dla testerów

- To wydanie **wymaga ponownej instalacji** aplikacji ze [strony pobierania](../pobierz/) - logowanie Google to zmiana natywna, aktualizacja przez sieć jej nie wniesie.
- Serwer stawiamy z **pustą bazą**: konta z wcześniejszych testów nie przechodzą. Każdy loguje się kontem Google i czeka na zatwierdzenie przez administratora; flotę zakłada administrator w panelu.
- Uwagi z testów zgłaszacie przyciskiem w prawym górnym rogu każdego ekranu - zgłoszenie zabiera ze sobą kontekst (ekran, operacja, samolot, wersja) i wysyła się samo, gdy wróci zasięg. Trafia do modułu **Zgłoszenia** w panelu.
- Na co zwrócić uwagę: logowanie Google i ustawianie PIN-u, jasny motyw w słońcu, przytrzymanie 1 s na przyciskach kokpitu, wpis lotu po fakcie z podpowiedzią odczytów.
- **Strona, dokumentacja i panel klubu stoją pod jednym adresem.** Podręcznik, wydania i strona pobierania przeprowadziły się z osobnego serwisu na ten sam serwer, co panel - stare adresy warto podmienić w zakładkach.
- **Poprawki będą przychodzić same.** Od tego wydania aplikacja aktualizuje się w tle: pobiera zmianę, gdy ma zasięg, i włącza ją przy następnym uruchomieniu. Ponowna instalacja będzie potrzebna tylko przy większych zmianach - napiszemy o tym wprost w opisie wydania.
- **Mniej danych do pobrania na słabym łączu.** Strona, podręcznik, panel i odpowiedzi serwera jadą spakowane - panel klubu ładuje się ze 134 kB zamiast 425 kB, strona trzykrotnie lżej. Widać to najbardziej na jednej kresce zasięgu.

## 1.0.0 (build 1) · 26 sierpnia 2026

> Pierwsze wydanie testowe dla pilotów klubu: cały dzień lotny od przejęcia samolotu do zdania, także bez zasięgu.

### Co zawiera

- **Rozpoczęcie lotu w trzech krokach**: samolot i załoga, zadanie i trasa, liczniki - z odczytami z przekazania poprzedniego pilota do potwierdzenia z przyrządów.
- **Kokpit**: automatyczne wykrywanie kołowania, startu i lądowania z GPS, oś zdarzeń operacji, tankowanie, załadunek i zrzut skoczków w dniu skokowym, zmiana załogi; przyciski ręczne na wypadek braku GPS.
- **Zdanie samolotu** z obowiązkowymi odczytami paliwa i motogodzin - zatwierdza log całej operacji; wariant „bez lotu" z powodem.
- **Mój dzień** (operacje doby z sumami) i **Poprzednie dni**; ekran operacji z rachunkiem paliwa i motogodzin wobec normy maszyny, korekty własnych wpisów przez 24 godziny z historią zmian.
- **Wpis lotu po fakcie** w czterech krokach, z wieloma lotami w jednym biegu silnika.
- **Ślad GPS** całej operacji na mapie z profilem wysokości; wraca z serwera, więc jest też na nowym telefonie.
- **Offline-first**: zapis na telefonie, wysyłka w tle, wskaźnik kolejki; wejście PIN-em bez internetu. Logowanie loginem i hasłem (zmienia się w następnym wydaniu).
- **Panel administratora 1.0**: konta pilotów, flota, przegląd dni i operacji, skrzynka flag, korekty, eksporty kart dnia, audyt, statystyki i analityka zużycia.

## Plan wydań

<!-- Terminy są orientacyjne i zostają na stronie do potwierdzenia przez właściciela projektu. -->

### 1.1.0 · planowane na wrzesień 2026

> Wydanie otwierające testy z pilotami: logowanie kontem Google w produkcji, panel klubu 2.0 i świeży build aplikacji na czystym serwerze.

- [x] Logowanie kontem Google i zatwierdzanie kont w panelu
- [x] Panel klubu 2.0: Piloci, Samoloty, Dziennik
- [x] Olej, wpis lotu po fakcie na osi operacji, dwa motywy
- [~] Publikacja aplikacji u Google - logowanie dowolnym kontem, bez listy testerów
- [ ] Wersja i numer builda w „O aplikacji"
- [ ] Nowy build i serwer z pustą bazą - start testów z pilotami

### 1.2.0 · po pierwszych tygodniach testów

> Poprawki z testów i kalibracja normy zużycia na prawdziwych lotach.

- [ ] Kalibracja progów normy paliwa i motogodzin na danych z testów
- [ ] Analityka oleju: zużycie między pomiarami i norma z lotów maszyny
- [ ] Panel: pulpit floty, skrzynka flag i eksporty kart dnia w regułach 2.0
- [ ] Poprawki zgłoszone przez pilotów w testach

### Dalej

- [ ] Eksport karty dnia do arkusza Google klubu
- [ ] Statystyki i analityka floty w panelu 2.0
- [ ] Wdrożenie produkcyjne po sezonie testowym
