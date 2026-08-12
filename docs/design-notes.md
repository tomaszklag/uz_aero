# UZ Aero — notatki projektowe

> Ten dokument dotyczy **aplikacji pilota** (`design/*.html`, ramka telefonu).
> Panel administracyjny to osobna powierzchnia w `design/admin/` (ramka okna 1440×900,
> te same tokeny) — jego decyzje projektowe opisuje `design/admin/ANALIZA.md`,
> a zmiany `design/ZMIANY.md` pod datą 2026-07-31.

## Przepływ ekranów (screen flow)

> **Przebudowany 2026-08-06** (`_main.md.txt` §3.6a), a **2026-08-11 (issue #23) klamra
> służby znikła w całości**: dzień pilota to lista sesji — niczego się nie otwiera ani
> nie zamyka. Wszystko wraca do `01`, jednostką potwierdzenia jest sesja.

```
00-login (odblokowanie PIN · warianty: 00a pełny login, 00b offline bez profilu)
  → 01-moj-dzien          EKRAN DOMOWY — płaski log sesji dnia (oś czasu, rejestracja
                          jako informacja wiersza; warianty: 01a zero sesji,
                          01c offline + arkusz szczegółów synchronizacji)

Nowy lot (trzy kroki, kilka sekund — nie otwiera doby):
  → 02-preflight          (krok 1/3 — samolot i Dual; wariant offline: 02d)
  → 02e-preflight-zadanie (krok 2/3 — operacja, trasa, klient, notatka; arkusz lotnisk: 02f)
  → 02a-preflight         (krok 3/3 — paliwo i motogodziny; „ROZPOCZNIJ LOT")
    02b-preflight-paliwo    (modal: korekta paliwa — wizualizacja)
    02c-preflight-moto      (modal: korekta MH — wizualizacja)
  → 04a-cockpit-ground    (świeżo przejęty samolot, log pusty)

Cockpit cycle (jeden bieg silnika na sesję):
  04a / 04-cockpit-ground   (silnik OFF — przed uruchomieniem / po zatrzymaniu: hero ZDAJ SAMOLOT)
  04b-cockpit-readonly      (podgląd cudzego samolotu — zajęty przez innego PIC)
    ↓ Start engine
  05a-cockpit-taxi          (silnik ON — kołowanie przed T/O)
    ↓ autodetect T/O
  05b-cockpit-inflight-toast  (w locie · toast: Wykryto Takeoff)
    ↓ toast potwierdzony
  05-cockpit-running        (w locie — fazy GPS, log zdarzeń; 05g: brak GPS)
    ↓ autodetect LDG
  05c-cockpit-toast-ldg     (rollout · toast: Wykryto Landing)
    ↓ toast potwierdzony
  05d-cockpit-taxi-post     (kołowanie po lądowaniu — lot N ukończony)
    ↓ kolejny T/O → 05b  /  Stop engine → 04 (hero ZDAJ SAMOLOT)

  akcje ground: 04a (przed startem) → 06-tankowanie · 07-zmiana-zalogi;
                04 (po zatrzymaniu) → 06-tankowanie · 08-lista-reczna

Zdanie samolotu (model 2026-08-10 — sesja = jeden bieg silnika; ekrany 09 i 09a USUNIĘTE):
  STOP ENGINE → 04 (hero ZDAJ SAMOLOT — drugiego startu nie ma) ↓
  09b-zdaj-samolot          (przegląd lotów sesji + odczyt WYMAGANY — przekazanie,
                             ogniwo łańcucha MH i ZATWIERDZENIE logu sesji;
                             09c — zdanie bez lotu: pogoda, usterka)
  → 01-moj-dzien            kolejna sesja dopisuje się do listy dnia;
                            z 01 także [15] ręczny wpis CAŁEGO lotu po fakcie

Odnogi pod 01 (nie etapy dnia):
  10-statystyki  SESJA: ślad całego biegu silnika ze znacznikami startów i lądowań,
                 oś czasu (przejęcie → uruchomienie → starty, zrzuty, lądowania →
                 wyłączenie → zdanie), rachunki paliwa i motogodzin na tle normy
                 fazowej. Wejście OŁÓWKIEM wiersza logu na 01 albo kartą sesji
                 w historii (10a — bez lotu, 10b — po oknie korekty, tylko odczyt);
                 niczego się tu nie zatwierdza: zdanie samolotu już potwierdziło dane
    → 14-slad    pełny ślad pod miniaturą: trasa, profil pionowy z przerwą na ziemi,
                 log punktów (14b — stan zabezpieczający, gdy zapis zniknął).
                 Issue #38: ekran 16 usunięty — zapis GPS powstaje w JEDNYM ciągu,
                 więc ślad opisuje SESJĘ, a loty są na nim znacznikami
  12-historia    poprzednie dni pilota (sesje spoza dzisiejszej doby), okno korekty 24 h
  13-ustawienia  motyw · PIN · konto · synchronizacja (kolejka, uwagi serwera,
                 awaryjny sync — dawny ekran 11) · diagnostyka GPS
```

---

## Preflight — założenia

### Tożsamość pilota i samolotu
- Pilot loguje się raz na ekranie `00-login` — tożsamość znana przez całą sesję
- Logowanie = jednorazowe provisioning (online; konto zakłada administrator, bez Google OAuth);
  codzienne wejście = odblokowanie PIN-em offline; wygasły token nie wylogowuje
  (szczegóły: `docs/_main.md.txt` sekcja 3.0)
- Nigdzie w formularzach nie pytamy ponownie o kod pilota
- Samolot wybieramy z listy zarejestrowanych jednostek (karty do wyboru, nie `<select>`)
- Samolot może być **wyłączony ze służby** — oznaczony tagiem "Wyłączony", niedostępny do wyboru (`disabled`)

### Stepper 3-krokowy (od 2026-08-06; wcześniej 4 kroki)
- Krok 1 (02) — **czym i z kim**: samolot (z przejęciem po innym PIC), drugi pilot
- Krok 2 (02E) — **co teraz robimy**: rodzaj operacji, trasa (ICAO), klient, notatka
- Krok 3 (02A) — paliwo na pokładzie, motogodziny + CTA „ROZPOCZNIJ LOT"

**Co zniknęło i dlaczego** (przebudowa flow, `_main.md.txt` §3.6a):
- **czas meldowania z kroku 1** — pytanie „od kiedy jesteś na służbie" stało między pilotem
  a samolotem, a mierzyło wielkość, której model już nie zna: klamra służby została
  usunięta w całości (issue #23) — dzień pilota to lista sesji i nie ma godziny, którą
  trzeba by deklarować. Rozpoczęcie lotu ma trwać kilka sekund, nie otwierać doby
- **krok 4 (ekran 03, podsumowanie)** — powtarzał to, co pilot wpisał sekundę wcześniej,
  i był czwartym tapnięciem w drodze do samolotu. Odczyty z kroku 3 SĄ potwierdzeniem

Podział 1 ↔ 2 idzie po NATURZE pytań: krok 1 to wybory z list, krok 2 to opis zadania.
Powód wydzielenia: krok 1 był najdłuższym formularzem aplikacji i rósł dalej — lista
floty i lista pilotów przybierają z każdym samolotem i każdym nowym kontem, a przejęcie
samolotu (najcięższa decyzja preflightu) lądowało nad polem „Oznaczenie klienta".

**Krok 2 pamięta ostatni dzień** i to jest warunek jego sensu, nie udogodnienie: żadne
z jego pól nie blokuje przejścia dalej (operacja ma wartość domyślną, trasa i klient są
opcjonalne), więc bez pamięci byłby codziennym tapnięciem w pusty formularz. Zakresy:
operacja i klient **per pilot**, trasa **per samolot** (`TaskMemoryStore`). Podpowiedź
ustępuje bez pytania — pierwsza zmiana któregokolwiek pola wyłącza ją do końca preflightu.

### Klamra służby — USUNIĘTA (issue #23, 2026-08-11)

Sekcja „Służba" na 01 (meldunek / koniec służby / „Zamknij dzień") istniała między
2026-08-06 a 2026-08-11 i została usunięta W CAŁOŚCI, razem z modelem: do pilota
w danym dniu przypisana jest lista sesji i nie ma sensu opakowywać jej w klamrę
„od meldunku do zamknięcia" — ta wielkość niczego nie mierzyła. Ekran 01 pokazuje
płaski log sesji (oś czasu; rejestracja jest informacją wiersza, nie osią grupowania)
i dwie sumy: **Blok** i **Loty**. Edu-baner tłumaczący regułę klamry odszedł razem
z regułą. Dnia się nie otwiera i nie zamyka — zaczyna się pierwszą sesją.

### Strefa czasowa — reguła nadrzędna

**UTC jest domyślnym czasem w całej aplikacji.** Wszystkie czasy zdarzeń (log samolotu,
sesje dnia, T/O, LDG, tankowanie, start/stop silnika, arkusz w eksporcie) są w UTC —
czas nieoznaczony = UTC.
LT nie pojawia się już nigdzie: jedynym miejscem był meldunek klamry służby na `01`,
usunięty razem z klamrą (issue #23).
Logi i tabele mają jawny marker („Log SP-AXA · UTC", „Log dnia · czasy UTC"),
żeby nie było wątpliwości.

### Nagłówek ekranu i SyncChip (issue #23, 2026-08-11)

**Jeden wzorzec nagłówka dla całej aplikacji**: tytuł i podtytuł wyrównane DO LEWEJ,
ustawienia (zębatka) zawsze PO PRAWEJ. Ekran 01 miał zębatkę po lewej i tytuł na środku —
był jedynym wyjątkiem i przestał nim być. Ekrany z powrotem („Wróć") zachowują swój
układ kroków formularza; reguła dotyczy ekranów bez powrotu.

**SyncChip = sam pill.** Offline rysuje wyłącznie `OFFLINE · n` (amber); stempla
„SYNC HH:MM" pod pillem ani stopki „Dane referencyjne · sync" na ekranie NIE MA.
Tapnięcie pilla otwiera **arkusz szczegółów synchronizacji** (wzorzec: `01c`):
stan kolejki, ostatnia udana synchronizacja, wiek danych referencyjnych. Arkusz jest
informacyjny — bez przycisku „wyślij teraz", bo outbox wysyła sam (§4.1), a przycisk-atrapa
uczyłby, że trzeba pomagać. Online chip nie rysuje nic (issue #12) — bez zmian.
Wzorzec obowiązuje KAŻDY ekran z SyncChipem, nie tylko 01.

### Paliwo na pokładzie
- Wartość pochodzi z **przekazania przez poprzednika** na końcu jego zmiany — nie jest szacunkiem
- Wyświetlana jako read-only z breakdownem kontekstowym:
  - Po tankowaniu (data, godzina, wartość)
  - Spalone (czas lotu, wartość)
  - Śr. zużycie (ost. lot) w L/h
  - Przekazano przez (imię, data, godzina)
- Pilot może intentionally **korygować** wartość przyciskiem "Koryguj" → bottom sheet modal
- Modal pokazuje: pole wprowadzania, wartość referencyjną "Przekazane przez poprzednika", ostrzeżenie o rozbieżności jeśli różnica > próg
- Korekta jest świadoma — nie edytowalny input, tylko przez modal

### Motogodziny
- Ta sama zasada co paliwo — wartość od poprzednika
- Breakdown: poprzedni odczyt (data/godzina), loty zegarowe, śr. MH/h lotu, kto przekazał
- Również z przyciskiem "Koryguj" i modalem z ostrzeżeniem o rozbieżności

### Wartości formularza — spójność danych
Ekranu 03 nie ma (usunięty 2026-08-06), więc spójności pilnujemy między krokami 1–3
a kokpitem, do którego prowadzi „ROZPOCZNIJ LOT":
- Samolot: SP-AXA (Cessna 182 · 2019)
- Pilot: T. Małkiewicz
- Paliwo: 150 L
- Motogodziny: 1 234:30 MH (format hh:mm z konfiguracji SP-AXA)
- Godzina przejęcia: **08:04 UTC** — ta sama na 04A („Twój od 08:04"), na 04 i w rozliczeniu
  sesji na 10. Log samolotu nie może zaczynać się przed tą godziną

---

## Cockpit Ground — założenia

### Dwa warianty ekranu
- `04a-cockpit-ground` — **świeżo przejęty samolot**: log pusty, START ENGINE prominentny. NIE „start dnia" — dzień pilota mógł zacząć się wcześniej, na innej maszynie. Paska sesji tu NIE MA (2026-08-10): przy zerze wzlotów mówił „jeszcze żadnego wzlotu" jako trzecia deklaracja braku na jednym ekranie, a jego link „Mój dzień →" był jedyną drogą powrotną z kokpitu — a tej nie ma być, bo samolot oddaje się przez 09b
- `04b-cockpit-readonly` — **podgląd cudzego samolotu** (single-writer): banner „tylko odczyt",
  log i stan z serwera, akcje disabled z podanym powodem, przycisk „Przejmij" → flow w 02
- `04-cockpit-ground` — **w trakcie dnia**: log z historią cykli, akcje ground dostępne
- `04d-wyjscie-z-kokpitu` — **blokada „wstecz"** (2026-08-10): kokpit jest stanem modalnym, więc przycisk sprzętowy i gest cofania nie zdejmują ekranu, dopóki maszyna jest w rękach pilota. Arkusz mówi, co go trzyma, i prowadzi na 09b — sama odmowa bez komunikatu łamałaby „nigdy cichy błąd", bo martwy przycisk czyta się jak zawieszona aplikacja. „Wstecz" po raz drugi i tapnięcie w tło zostawiają pilota w kokpicie, więc bezpieczne wyjście jest domyślne
- **Paliwo mówimy RAZ** (2026-08-10): pasek „Paliwo · ostatni odczyt" stoi na 04 wyłącznie wtedy, gdy samolot ma normę zużycia — wtedy jest przyrządem (FOB + „wystarczy na ~6 wyniesień do rezerwy" + ton ostrzeżenia + adnotacja „decyduje paliwomierz"). Bez normy zostawała sama liczba, ta sama co w kafelku „Tankowanie", więc paska NIE MA, a litry przechodzą do kafelka. Podpis kafelka jest przez to KOMPLEMENTARNY: z paskiem „Dolej i zapisz odczyt" / „Dolane dziś: 45 L", bez paska „Na pokładzie: 141 L" (po dolewce obie liczby — inaczej FOB znika z ekranu)

### "Zakończ dzień" — dostępność
- Dostępny **zawsze** od momentu rozpoczęcia dnia
- Nie blokujemy nawet gdy brak lotów — pilot mógł tylko zatankować i zakończyć

### Akcje ground (siatka 2×2)
- Tankowanie (amber) — dostępne zawsze, pokazuje bieżący stan paliwa lub historię
- Zmiana załogi — zawsze dostępna
- Lista ręczna — zawsze dostępna (fallback GPS)
- Zakończ dzień (red) — zawsze dostępny

---

## Cockpit Running — założenia

### Phase hero jako główny widget
- Aktualny stan lotu (Climb, Cruise, Descent, Landing, Taxi, Engine Idle) wyświetlany dużą czcionką Bebas Neue (~54px)
- Ikonka samolotu SVG obrócona CSS `transform: rotate()` oddaje fazę (pochylenie)
- Kolorowanie fazą: air = niebieski, active/ground = zielony, warn = amber
- Block time zdegradowany do małego chipa w nagłówku hero (mono, wtórny)

### Stany lotu do wykrywania
Engine Idle → Taxi → Takeoff → Climb → Cruise → Descent → Landing → Taxi → Engine Idle

### GPS param grid (2×2)
- Ground Speed (KT), Altitude (FT), Fuel on Board (L, amber), Flight Time (zielony)

### Log zdarzeń
- Separatory `.flight-sep` z numerem lotu ("Lot 1", "Lot 2", …) między parami T/O-LDG
- Ikony zdarzeń: play (start engine), stop-square (stop engine) — kolorowe (zielony/czerwony)
- T/O i LDG: małe neutralne kropki `.log-dot-sm` — bez kolorowania, bez ikon
- Ostatni wpis "In flight…" z żywą pulsującą kropką i odliczającym timerem

### Autodetect zdarzeń
- System **automatycznie** wykrywa i loguje: Taxi, Takeoff, Landing na podstawie GPS/akcelerometru
- Pilot **nie musi** potwierdzać zdarzeń przyciskiem
- Przyciski T/O / Land / Taxi są dostępne jako **manualna korekta** gdy autodetect się pomyli
- Dwa scenariusze korekty: (1) system zapisał zdarzenie którego nie było → pilot usuwa, (2) system nie wykrył zdarzenia → pilot dodaje ręcznie

### Akcja kończąca ekran — koniec treści, przy krótkiej treści dół ekranu

Reguła z 2026-07-30, obowiązuje każdy ekran z przyciskiem prowadzącym dalej („DALEJ",
„ZAPISZ…", para z 03, „ZATWIERDŹ → SYNC"):

- formularz **dłuższy niż ekran** — przycisk stoi pod ostatnim polem i dojeżdża się do
  niego przewijaniem. Pilot widzi po drodze wszystko, co za chwilę potwierdzi, a pasek
  przyklejony na stałe zasłaniałby w tym czasie treść i zabierał wysokość;
- formularz **krótszy** — przycisk nie zawisa w połowie ekranu z pustką pod spodem,
  tylko schodzi do dolnej krawędzi, gdzie czeka go kciuk trzymający telefon.

W implementacji to jeden slot: `Screen footer={…}` (rozpychacz `flex: 1` w treści
rozciągniętej do pełnej wysokości). Ekran nie mierzy niczego i nie ma warunków —
to samo drzewo zachowuje się poprawnie w obu przypadkach. Ekrany z własnym paddingiem
(`padded={false}`: 08, 09, 10) nakładają go również na stopkę.

### Przyciski akcji — korekta manualna
- Widoczne **zawsze** — pilot lepiej wie w jakim stanie jest samolot niż system
- Mniej prominentne niż primary CTA (secondary/ghost style)
- Obsługują oba scenariusze korekty:
  - Zdarzenie zapisane błędnie → pilot usuwa z logu (edit w wierszu)
  - Zdarzenie niewykryte → pilot dodaje ręcznie przyciskiem
- **STOP ENGINE** — jedyna akcja którą pilot zawsze inicjuje ręcznie (pozostaje prominentny)
- **Zrzut (Drop)** — inicjowany ręcznie, tylko przy operacji skoki

### Toast autodetect
- Gdy system wykryje zdarzenie (T/O, LDG, Taxi), pokazuje powiadomienie z odliczaniem
- Format: "Wykryto: Takeoff ✓  [Cofnij]  5…"
- Pilot ma ~5 sekund na odrzucenie — brak akcji = zdarzenie zostaje zapisane
- Po upływie czasu toast znika, wpis pojawia się w logu
- "Cofnij" anuluje zdarzenie bez zapisywania

---

## Design system — tokeny

```css
--green:  #2ECC71   /* silnik running, status OK, główny akcent */
--amber:  #F39C12   /* paliwo, ostrzeżenia */
--red:    #E74C3C   /* stop engine, zakończenie, błędy */
--blue:   #3498DB   /* UTC, informacje, faza "air" */
--bg:     #0D0D0D   /* tło główne */
```

Czcionki: `Bebas Neue` (display/timery) · `Archivo` (body) · `JetBrains Mono` (cyfry, kody, wartości)

---

## Banery i info-boksy — trzy typy, jeden zamykalny

Nie każdy baner jest równy. Zanim dodasz baner, sklasyfikuj go — od tego zależy, czy
wolno go zamknąć:

- **Typ A — żywy status** (offline / dane z cache, „tylko odczyt", odliczanie okna korekty,
  „flagi: nieznane"). To przyrząd, nie onboarding. **Nigdy zamykalny** — ukrycie go = ukrycie
  stanu, którego pilot potrzebuje przy każdym spojrzeniu.
- **Typ B — ostrzeżenie warunkowe** (rozbieżność paliwa/MH, „An-2 wymaga załogi 2-os.",
  „zakończenie nieodwracalne"). Pojawia się i znika **z warunkiem**; nie zamyka się ręcznie.
- **Typ C — pouczający, jednorazowy** (np. „korekta nie kasuje historii", „dlaczego dwie
  sekcje", „wpis ręczny — co znaczy"). Pomocny za pierwszym razem, szum potem. **Zamykalny.**

### Wzorzec zamykalnego banera (Typ C)

- `×` (32 px) na banerze → baner znika, w jego miejscu pojawia się mini-chip `(?)` z krótką
  etykietą; klik `(?)` przywraca baner. Kolor chipu = akcent banera (niebieski/zielony).
- **Stan „schowany" zapamiętany NA STAŁE per pilot** (localStorage / profil) — to sedno.
  Baner nie wraca rozwinięty co sesję; `(?)` to rzadka furtka, nie powtarzalny obowiązek.
  Dzień 1 uczy pełnymi banerami, dzień 3 to czysty ekran z dyskretnymi `(?)`.
- Klasy: `.edu-dismiss` (× na banerze), `.edu-mini` (chip `(?)`); funkcje `eduCollapse(id)` /
  `eduExpand(id)`. Wdrożone: 04c, 05f, 07, 09.
- Wyjątek: instrukcje **rzadkich** akcji (np. 3-kroki przekazania) zostają — przy rzadkim
  użyciu pilot i tak zapomina, więc coaching wciąż pomaga.

## Stan ładowania — skeleton, nigdy spinner (issue #33)

Pełna specyfikacja z inwentarzem rozmiarów i siedmioma regułami: **`design/LOADERY.html`**.
Skrót, który wystarcza przy projektowaniu ekranu:

- ekran czekający na dane rysuje **plamki w geometrii docelowej** (`.skel`), więc po
  nadejściu danych nic się nie przesuwa. Spinnera na cały ekran nie ma nigdzie — ta sama
  reguła, co w panelu (`architektura-panelu-frontend.md` §3.2);
- plamka należy się temu, co **na pewno przyjdzie**. Element opcjonalny (plakietka okna
  korekty) miejsca nie rezerwuje; gdy warianty różnią się kształtem, skeleton obiecuje ich
  część wspólną;
- **co znamy lokalnie, nie czeka** — nagłówek, tytuł karty i statyczne wejścia nawigacyjne
  rysują się od pierwszej klatki. Skeleton opisuje czekanie NA DANE, a nie „ekran się otwiera";
- **skeleton ≠ stan pusty** i **skeleton ≠ triada świeżości**. „Brak wyników" wolno napisać
  dopiero, gdy wiadomo, że jest pusto; dane z serwera mają swoje `live`/`cache`/`brak`,
  a akcja bez sieci — `disabled` z podanym powodem;
- pojawia się po **180 ms** czekania i zostaje co najmniej **420 ms**: prawie każdy odczyt
  w tej aplikacji jest lokalny i kończy się przed progiem, więc na co dzień plamek nie widać;
- **puls przezroczystości 1 → 0.45 / 1400 ms, wspólny dla całego ekranu** (nie shimmer —
  aplikacja jest RN bez modułu do gradientów; rozjechane fazy czyta się jak migotanie);
- skeleton nie jest interaktywny, a czytnik ekranu dostaje jedno „Ładowanie" na blok.

## UX rules — co unikamy

- Nie używamy natywnego `<select>` — zawsze stylizowana lista kart
- Nie wpisujemy hardcoded kolorów — tylko zmienne CSS
- Nie pytamy pilota o dane które już podał (samolot, pilot, operacja)
- Nie blokujemy akcji bez wyraźnego powodu biznesowego
- Pola read-only nie wyglądają jak edytowalne inputy
- Korekta danych krytycznych (paliwo, MH) musi być **intentional** — przez modal z potwierdzeniem

---

## Placeholdery / dane przykładowe

- Pilot: Tomasz Małkiewicz / kod TMK
- Samolot: SP-AXA (Cessna 182 · 2019), SP-FGK (Cessna 182 · 2017), SP-KWA (Cessna 172 · 2021, wyłączony)
- Baza: EPKK → EPWA
- Operacja: Skoki
- Paliwo przekazane: 150 L (po tankowaniu 185 L, spalone 35 L, śr. 17.5 L/h)
- Motogodziny: 1 234:30 MH — hh:mm z konfiguracji SP-AXA (poprzedni odczyt 1 230:30, loty zegarowe 4:00)
- Poprzednia zmiana: J. Kowalski · 21 JUNE · 17:30 (= czas synca cache w wariantach offline)
- Samolot zajęty: SP-FGK · aktywny PIC: KRZ od 07:10 (scenariusz przejęcia w 02 i podglądu 04B)

### Kanoniczna oś czasu dnia 22 JUNE — 6 lotów (operacja Skoki)

> Dzień skokowy = 3 cykle silnika, 6 krótkich lotów z zrzutami. Cykle 1–2 (rano)
> pokazuje ekran 04; cykl 3 (popołudnie) to rodzina 05 (kokpit w locie).
> Spójność: ekrany 04 / 05* / 09 / 10 / 11 muszą używać tych samych wartości.

- **Cykl 1** (rano): start **08:12** (MH 1 234:30 · 150 L) · Lot 1: T/O 08:25 → LDG 09:18
  (0:53) · Lot 2: T/O 09:35 → LDG 10:22 (0:47) · stop **10:34** (blok 2:22 · MH 1 236:52 · 112 L)
- **Tankowanie 10:48**: 112 +48 → 160 L (ekran 06)
- **Cykl 2** (przedpołudnie): start **11:15** · Lot 3: T/O 11:28 → LDG 12:15 (0:47) ·
  stop **12:28** (blok 1:13 · MH 1 238:05 · 141 L) — *ekran 04 = stan tuż po tym cyklu*
- **Cykl 3** (popołudnie = rodzina 05): start **13:10** (MH 1 238:05 · 141 L) ·
  Lot 4: T/O 13:24, zrzut 13:48 → LDG 14:08 (0:44 · FOB ~123) ·
  Lot 5: T/O 14:21, zrzut 14:42 → LDG 15:03 (0:42 · FOB ~105, wpis ręczny) ·
  Lot 6: T/O 15:17, zrzut 15:45 → LDG 16:10 (0:53 · FOB ~90) · stop ~**16:14**
  (blok 3:04 · MH 1 241:09 · 88 L)
- **Dzień:** 6 lotów · block **6:39** · duty 08:00→16:45 UTC (8:45) ·
  paliwo 150 +48 −110 = **88 L** · MH 1 234:30 → **1 241:09** (przekazanie dla następnego) ·
  śr. zużycie ~17 L/h · St/Ld 6/6

> Uwaga: paliwo maleje monotonicznie w każdym cyklu (inwariant — nie może rosnąć bez
> tankowania). Rodzina 05: start 141 → Lot 4 ~123 → Lot 5 ~105 → Lot 6 in-flight ~92
> → LDG ~90 → stop 88. MH monotoniczne rosnące na całej osi.
