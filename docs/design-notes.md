# UZ Aero — notatki projektowe

## Przepływ ekranów (screen flow)

```
00-login (odblokowanie PIN · warianty: 00a pełny login, 00b offline bez profilu)
  → 01-splash             (odświeżenie cache referencyjnego — adnotacja "dane referencyjne · sync")
  → 02-preflight          (krok 1/3 — samolot, operacja, trasa, czas służby; wariant offline: 02d)
  → 02a-preflight         (krok 2/3 — paliwo, motogodziny)
    02b-preflight-paliwo    (modal: korekta paliwa — wizualizacja)
    02c-preflight-moto      (modal: korekta MH — wizualizacja)
  → 03-preflight-confirm  (krok 3/3 — podsumowanie i potwierdzenie)
  → 04a-cockpit-ground    (start dnia, brak lotów)

Cockpit cycle (powtarzalny):
  04a / 04-cockpit-ground   (silnik OFF — start dnia / w trakcie dnia)
    ↓ Start engine
  05a-cockpit-taxi          (silnik ON — kołowanie przed T/O)
    ↓ autodetect T/O
  05b-cockpit-inflight-toast  (w locie · toast: Wykryto Takeoff)
    ↓ toast potwierdzony
  05-cockpit-running        (w locie — fazy GPS, log zdarzeń)
    ↓ autodetect LDG
  05c-cockpit-toast-ldg     (rollout · toast: Wykryto Landing)
    ↓ toast potwierdzony
  05d-cockpit-taxi-post     (kołowanie po lądowaniu — Lot N ukończony)
    ↓ kolejny T/O → 05b  /  Stop engine → 04

  → 06-tankowanie
  → 07-zmiana-zalogi
  → 08-lista-reczna
  → 09-end-of-day
  → 10-statystyki
  → 11-eksport
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

### Stepper 3-krokowy
- Krok 1: samolot, rodzaj operacji, trasa (ICAO), czas meldowania
- Krok 2: paliwo na pokładzie, motogodziny
- Krok 3: podsumowanie tylko do odczytu + przycisk "Potwierdź i zacznij dzień"

### Czas meldowania (duty start)
- Wyświetlany jako **UTC primary** (duża czcionka mono), LT secondary (mała, po prawej)
- Domyślnie pobierany z systemu, edytowalny (ołówek)
- Data wyświetlana jako badge poniżej (`22 JUNE 2026`)

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
Dane na ekranie 03 (potwierdzenie) muszą zgadzać się z danymi z kroków 1 i 2:
- Samolot: SP-AXA (Cessna 182 · 2019)
- Pilot: T. Małkiewicz
- Meldunek: 06:00 UTC
- Paliwo: 150 L
- Motogodziny: 1 234:30 MH (format hh:mm z konfiguracji SP-AXA)

---

## Cockpit Ground — założenia

### Dwa warianty ekranu
- `04a-cockpit-ground` — **start dnia**: log pusty, duty time świeży (00:0x), START ENGINE prominentny
- `04-cockpit-ground` — **w trakcie dnia**: log z historią cykli, akcje ground dostępne

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

### Kanoniczna oś czasu dnia 22 JUNE (spójność ekranów 04 / 09 / 10 / 11)

- Cykl 1: start **08:12** (MH 1 234:30 · 150 L) · T/O 08:25 → LDG 09:18 (0:53) ·
  T/O 09:35 → LDG 10:22 (0:47) · stop **10:34** (blok 2:22 · MH 1 236:52 · 112 L)
- Tankowanie **10:48**: +48 L → 160 L
- Cykl 2: start **11:15** · T/O 11:28 → LDG 12:15 (0:47) · stop **12:28**
  (blok 1:13 · MH 1 238:05 · 141 L) — *ekran 04 = stan tuż po tym cyklu*
- Cykl 3: start **13:55** · T/O 14:10 → LDG 15:02 (0:52, wpis ręczny) ·
  T/O 15:20 → LDG 16:08 (0:48) · stop **16:20** (blok 2:25 · MH 1 240:30)
- **Dzień:** 5 lotów · block 6:00 · duty 08:00→16:45 LT (8:45) ·
  paliwo 150 +48 −116 = 82 L · MH 1 234:30 → **1 240:30** (przekazanie dla następnego)
