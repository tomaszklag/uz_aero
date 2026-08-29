# UZ Aero - plan wdrożenia architektury w mockupach

> ## ⚠ HISTORYCZNY (2026-08-07)
>
> Ta checklista dotyczy audytu z 2026-07-22 i została odhaczona w całości. Opisuje
> mockupy **sprzed przebudowy flow z 2026-08-06** - wymienia ekrany, których już nie ma
> (`01-splash`, `03-preflight-confirm`, `09-end-of-day`) i zadania sformułowane w modelu,
> w którym dzień służby był kontenerem na loty. Zostaje jako zapis rozumowania.
>
> Aktualne reguły designu: `CLAUDE.md`. Aktualny flow: `docs/design-notes.md`
> i `docs/_main.md.txt` §7. Changelog zmian: `design/ZMIANY.md`.

> Wynik audytu z 2026-07-22: przegląd 21 mockupów pod kątem przyjętej architektury
> offline-first (`docs/_main.md.txt` sekcje 4–6, `CLAUDE.md` sekcja "Offline-first").
> Kolejność bloków = kolejność użycia aplikacji (decyzja użytkownika).
> Ten plik jest checklistą roboczą - odhaczaj po wdrożeniu, usuń gdy wszystko zrobione.

## Jak pracujemy (definition of done każdego bloku)

1. Zmiana w mockupie zgodna z design tokenami i phone frame (patrz `CLAUDE.md`)
2. Nav-strip spięty z sąsiadami, nowe pliki dodane do `index.html`
3. Ekran mający warianty dostaje **panel „Warianty tego ekranu"** na canvasie (pod
   telefonem): linki do całej rodziny + opis KIEDY dany wariant się wyświetla;
   bieżący oznaczony „ten ekran" (wzorzec: 00 / 02)
4. Wpis w `ZMIANY.md` (co + DLACZEGO, z odwołaniem do sekcji architektury)
5. **STOP - weryfikacja użytkownika.** Commit dopiero po jego akceptacji, nigdy automatycznie.

## Zasady wspólne (z architektury - obowiązują każdy ekran)

- **Stany świeżości danych z serwera:** `live` (bez adnotacji) / `cache` ("· z cache ·
  sync 21 JUN 17:30", amber) / `brak` ("brak danych - wpisz z licznika", amber)
- **SyncChip** `SYNC` / `OFFLINE · n` - jedyny globalny wskaźnik łączności
- **Dane sesji (lokalne)** - timery, log, liczniki - bez wariantów offline
- **Akcje wymagające sieci** - disabled z podanym powodem, nigdy cichy błąd
- **Liczniki fizyczne > serwer** - dane z serwera to podpowiedź

## Scenariusz danych (spójność między ekranami!)

| Element | Wartość |
|---------|---------|
| Dzień scenariusza | 22 JUNE 2026 · EPKK · operacja: Skoki (skoki startują i lądują na tym samym lotnisku - jeden kod ICAO, nie para; issue #13) |
| PIC zalogowany | Tomasz Małkiewicz · TMK · login `tmalkiewicz` · tomasz@uzaero.pl |
| Dual | AKO |
| Samolot sesji | SP-AXA · Cessna 182 · 2019 · zbiorniki 330 L · MH w formacie **hh:mm** (1 234:30) |
| Samolot zajęty | SP-FGK · C182 2017 · aktywny PIC: KRZ od 07:10 |
| Samolot 2-osobowy | SP-ANK · An-2 1984 · 1700 L · wymaga Dual |
| Wyłączony ze służby | SP-KWA · C172 2021 |
| Poprzednik / przekazanie | J. Kowalski · 21 JUNE · 17:30 (= czas ostatniego synca cache) |

---

## Plan (w kolejności użycia aplikacji)

### ✅ 0. Logowanie - ZROBIONE 2026-07-22

- [x] `00-login.html` - przebudowa na odblokowanie PIN-em (profil lokalny, numpad
      interaktywny, biometria opcjonalna, linki do pełnego logowania)
- [x] `00a-login-full.html` (nowy) - pełny login: login + hasło **od administratora**
      (bez Google OAuth - decyzja odwrócona, patrz ZMIANY Iteracja 7; bez rejestracji),
      nota o wymogu internetu
- [x] `00b-login-offline.html` (nowy) - twarda granica: amber banner, disabled formularz
      z powodem, "Spróbuj ponownie", przekreślone wifi
- [x] `index.html` - karta 00 + karty 00A/00B; `ZMIANY.md` - Iteracja 7
- [x] Dokumentacja wyczyszczona z OAuth (`_main.md.txt`, `CLAUDE.md`)

### ✅ 1. 01-splash - ZROBIONE 2026-07-22

- [x] Stopka "Offline · GPS · Google Sheets" → "Offline-first · GPS · Auto-sync"
- [x] Linia odświeżania cache referencyjnego: kropka + "Dane referencyjne · sync 09:41"
      (online = świeży sync; wariant offline pokazywałby starą datę - stan `cache`)
- [x] Opis w index.html: "po odblokowaniu" + odświeżenie danych referencyjnych

### ✅ 2. 02-preflight - ZROBIONE 2026-07-22

- [x] Wariant **offline** jako osobny plik `02d-preflight-offline.html` (konwencja
      wariantów literowych): modal przejęcia offline - "Aktywny PIC · wg cache",
      "Łączność: brak - claim wyśle się po odzyskaniu sieci", liczniki jako prawda
- [x] Adnotacja `cache`: pasek "Dane z cache · SYNC 21 JUN 17:30" nad listą samolotów;
      tag claim "PIC: KRZ · wg cache 17:30"
- [x] Rozstrzygnięte: SyncChip TAK, na preflightcie w nagłówku (02 = SYNC zielony,
      02d = OFFLINE amber; wzorzec pill z 04a)

### ✅ 3. 02a-preflight - stany świeżości przekazania - ZROBIONE 2026-07-22

- [x] Stan `cache`: chip OFFLINE + amber adnotacja "Z cache · sync 21 JUN 17:30" przy FOB i MH
- [x] Stan `brak`: "- -" + "brak danych - wpisz z licznika", przycisk "Wpisz odczyt",
      breakdown/poświadczenie ukryte, amber box o łańcuchu, DALEJ disabled z powodem
- [x] Rozstrzygnięte: **przełącznik stanów na canvasie** (Live/Cache/Brak) w jednym pliku;
      konfiguracja samolotu (pojemność, format MH) widoczna we wszystkich stanach

### ✅ 4. 04-cockpit-ground - ZROBIONE 2026-07-22

- [x] SyncChip w app-barze; leftover `SP-MIW` → `SP-AXA`
- [x] Spójność scenariusza: tankowanie +48 L (112→160), karta Tankowanie "112→160"
- [x] "Statystyki + eksport" → "+ synchronizacja" (04 i 04a); panele wariantów 04A/04/04B

### ✅ 5. 04b-cockpit-readonly - ZROBIONE 2026-07-22 (nowy ekran)

- [x] Niebieski banner "PODGLĄD - TYLKO ODCZYT" (SP-FGK prowadzi KRZ · claim od 07:10;
      dane z serwera · sync · ostatnia aktywność)
- [x] Zero zapisu: log KRZ bez kolumny edycji, akcje disabled z powodem (single-writer)
- [x] "PRZEJMIJ SAMOLOT" → flow przejęcia w 02; karta w index + nav + panele rodziny
- [ ] (opcjonalnie, przy następnym dotknięciu 02): link "Podgląd" z karty zajętego samolotu

### ✅ 6. 09-end-of-day - ZROBIONE 2026-07-22

- [x] Sekcja "Motogodziny końcowe": 1 238:12 MH · hh:mm z konfiguracji · Δ +3:42 = block time
- [x] Zielony box przekazania (łańcuch MH - sekcja 4.5)
- [x] Warning: wysyłka do synchronizacji zamiast "eksportu"; offline niczego nie blokuje
- [x] Walidacja paliwa ≤ 330 L z konfiguracji; chip SYNC w nagłówku

### ✅ 7. 10-statystyki - ZROBIONE 2026-07-22

- [x] Leftover `SP-MIW` → `SP-AXA`

### ✅ 8. 11-synchronizacja - ZROBIONE 2026-07-22

- [x] Karta "Flagi serwera · brak ✓" z typami flag i zasadą "rozwiązuje administrator";
      tytuł i nav "Eksport" → "Synchronizacja"

### ✅ 9. Sprzątanie - ZROBIONE 2026-07-22

- [x] `docs/design-notes.md` - MH `1 234.5 h` → `1 234:30`; założenia logowania (PIN/
      provisioning); kanoniczna oś czasu dnia 22 JUNE
- [x] Weryfikacja nawigacji: zero martwych linków, wszystkie pliki w `index.html`
- [x] Panel/tooltipy wariantów rodziny 05 (state-sidebar z opisem "kiedy który")
- [x] Spójność osi czasu 04/09/10/11 wyrównana do design-notes; naprawiona regresja MH w 05
- [x] Link „Podgląd" z karty zajętego samolotu (02, 02d) → 04B

### Audyt niezależny - 2026-07-22 (zlecony agentowi)

- [x] Werdykt: zero 🔴 (inwarianty architektury trzymają). Klaster 🟡 scenariusza poprawiony:
      02a/02c poprzednik J. Kowalski + terminologia „przekazane"; 06/08 tankowanie +48;
      04 duty 04:34; 09 estymata ~84; 02b/02c badge 2/3; 11 usunięte kolory Google
- [ ] 🟢 pozostawione świadomie: 04a „06:00 UTC" vs 04 „08:00 LT" (obie poprawne, różna
      konwencja); 03 bez SyncChip (tylko dane lokalne); separator tysięcy MH (spacja vs brak
      w chipach logów); index „v0.1" vs docs v0.2

### Follow-up (poza pierwszym przejściem)

- [x] Wyrównanie rodziny 05 do osi - ZROBIONE (decyzja: dzień 6 lotów, realizm skoków).
      Naprawione paliwo rosnące w locie; cykl 3 = 3 loty; 09/10/11 przeliczone na 6 lotów;
      design-notes zaktualizowany. Cykle 1–2 (04) bez zmian
- [x] Panel „Warianty" na 06/07/08 - **nie dotyczy**: pojedyncze ekrany akcji bez rodziny
      wariantów (nie ma rodzeństwa do zlinkowania)
- [x] Drobne 🟢 z audytu - ZROBIONE: 04 meldunek → „06:00 UTC" (spójnie z 04a); SyncChip
      na 03; separator MH ujednolicony w 12 chipach; index → v0.2.
      Zostawione świadomie: 04b „07:10 LT" (inna sesja, spójna z claim w 02)

---

## Audyt trzech specjalistów (2026-07-23) - blokery i backlog

### ✅ Blokery - ZROBIONE

- [x] **STOP ENGINE** w 6 ekranach rodziny 05 (aktywny na ziemi 05a/05d → 04,
      disabled z powodem w locie 05/05b/05c). Wymaganie 3.2 spełnione
- [x] **04c-korekta-zdarzenia** (nowy) - edycja czasu + „tego lądowania nie było",
      append-only (nie kasuje historii); 14 martwych ikonek w 04 ożywionych
- [x] **07-zmiana-załogi** - rozdzielone: A) Dual lokalny (karty pilotów, offline OK)
      B) przekazanie samolotu bez pola „nowy PIC" → 04b jako stan terminalny
- [x] Poprawki danych: FOB w siatce GPS 05a/05b/05d; „Zużyte 116" → 110 w 10

### ✅ Domknięcie offline-first - ZROBIONE 2026-07-23

- [x] `11a-sync-offline` (nowy) - licznik 35/47, sync disabled z powodem, flagi „nieznane"
      zamiast kłamliwego „brak ✓", arkusz „jeszcze nie powstał", kolejka z ostrzeżeniem
- [x] `04b-cockpit-readonly` - przełącznik stanów live/cache; offline „Przejmij" → 02d
- [x] SyncChip na `05a`–`05d` z rosnącym licznikiem outboxa; ujednolicony wzorzec `Offline · n`
- [x] Ochrona wylogowania przy niepustym outboxie (00-login)
- [x] `02a` - świeżość odspawana od łączności (stan `brak` ≠ offline)

**Wynik: offline-first obowiązuje na wszystkich widokach.** Jedyny wyjątek to pierwsze
logowanie / zapomniany PIN (00a/00b) - świadomie zaakceptowana twarda granica z 3.0,
obsłużona disabled-z-powodem i instrukcją proceduralną.

### ✅ Degradacja sensorów (osobny temat, nie sieć) - ZROBIONE 2026-07-28

- [x] Stan „GPS: brak sygnału" - **`05g-cockpit-no-gps` (nowy)**: czerwony baner Typ A
      („autodetekcja wstrzymana" + wiek fixa), parametry GPS „- -", wejścia ręczne
      (05F + link do 08) przejmują robotę autodetekcji; timery/log liczą z zegara.
      SyncChip celowo zielony SYNC przy martwym GPS - rozdzielenie osi czujnik/sieć
      pokazane wprost. 05G w state-sidebarach całej rodziny 05 i panelach 05e/05f

### ✅ Decyzje biznesowe - ROZSTRZYGNIĘTE 2026-07-23

- [x] **Rozliczanie zrzutów → pełne**: `05e-zrzut` (trzy steppery pod rękawice), chipy
      w logu z liczbą skoczków, karta rozliczeniowa w 10, wiersz w 11/11a, klient wypełniony
- [x] **Korekta po `day_close` → okno 24 h** bez akceptacji admina: pasek w 10, poprawione
      ostrzeżenie w 09, ołówki prowadzą do 04c
- [x] **Dwa samoloty w dniu → jeden samolot = jeden dzień** (świadomy trade-off, w logu decyzji)
- [x] **„Przerwa" w duty → usunięta** (przełącznik bez konsekwencji + martwy CSS)
- [ ] **Panel administratora** - zakłada konta, resetuje hasła, rozwiązuje flagi, nanosi
      korekty po oknie 24 h. Niezaprojektowana połowa systemu; do rozstrzygnięcia, czy
      wchodzi w fazę 0 (mockupy), czy dopiero po backendzie

### ✅ Naprawy po studium przypadku i analizie użyteczności - ZROBIONE 2026-07-24

- [x] **Regresja 07** - przekazanie idzie przez `09` (odczyty końcowe), nie prosto do `04b`
- [x] **05f-zdarzenie-reczne** (nowy) + ożywione T/O i LAND w 6 plikach rodziny 05
- [x] **Toast odwrócony** - duży „COFNIJ" + licznik zamiast zbędnego „Potwierdź"
- [x] **Cele korekty ≥ 44 px** (log-edit, edit-btn, koryguj-btn) i pełny kontrast
- [x] **Kontrast**: `--text-muted` #444444 → #7A7A7A (29 plików) + korekta w 4 motywach;
      `.param-label` 8 → 10 px
- [x] **12-historia** (nowy) + wejście z `01-splash` - okno korekty 24 h ma wreszcie drzwi

### Backlog UX z audytu (niższy priorytet)

- [x] Formularz dodawania wpisu w `08` + kolumna „Uwagi" (3.8) - ZROBIONE 2026-07-28:
      arkusz „Nowy wpis ręczny" (4 czasy ze stepperami ±1 min + uwagi, wzorzec 04c/05f),
      oba przyciski ożywione, zapis → grupa RĘCZNIE w rejestrze; uwagi jako stopka
      każdej grupy (puste = „-"). Bez panelu wariantów (pojedynczy ekran, jak niżej)
- [x] Semantyka toasta odwrócona - zrobione już 2026-07-24 (sekcja „Naprawy po studium
      przypadku": duży amber COFNIJ + licznik); wpis w backlogu był zdublowany
- [x] Ekran ustawień - ZROBIONE 2026-07-28: **`13-ustawienia` (nowy)** - motyw (5 kart
      ze swatchami), zmiana PIN offline (arkusz z numpadem, 2 kroki), konto z ochroną
      wylogowania (.outbox-guard, disabled z powodem, nota o internecie), diagnostyka
      GPS (fix/wiek/dokładność/pozycja + Odśwież), o aplikacji (wersja + stempel danych
      referencyjnych). 8 zębatek (04, 04a, 05, 05a–05d, 05-themes) podpiętych
- [x] Wznowienie sesji po ubiciu aplikacji - ZROBIONE 2026-07-28 W APLIKACJI, bez
      wariantu mockupu: otwarta sesja z `session_meta` (§5.2) wraca po odblokowaniu
      PROSTO do kokpitu (routing `ResumeGate` w `App.tsx`), więc splash z przyciskiem
      „wróć do dnia" nie ma kiedy się pokazać - 01 pojawia się wyłącznie bez otwartego
      dnia. Prostsze niż wariant ekranu i bez ryzyka rozwidlenia dnia drugą sesją
- [x] Stan zerowy w 09/10 - ZROBIONE 2026-07-28: **`09a` + `10a` (nowe)** - uczciwe zera,
      „Żaden lot nie został zapisany", odczyty końcowe nadal wymagane (łańcuch 4.5
      obowiązuje też bez lotów), zrzuty 0 z operacją; panele wariantów na 09/09a i 10/10a.
      Historia / poprzednie dni: wejście istnieje od 2026-07-24 (`12-historia`)
- [ ] Zgłoszenie usterki technicznej (`defect_report`)
- [ ] Trasa per lot zamiast per dzień (dzień skokowy to 6× EPKK → EPKK)

---

## Zgodne z architekturą (audyt - bez zmian)

02b/02c (modale korekty - licznik jako prawda), 03 (Dual jest), 05 + 05a–d (dane lokalne
= zero wariantów offline, offline-badge z tooltipem jest), 06 (pojemność z konfiguracji),
07 (PIC/Dual + zmiana PIC = przelogowanie), 08 (lokalne), 05-themes.
