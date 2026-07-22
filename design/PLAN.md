# UZ Aero — plan wdrożenia architektury w mockupach

> Wynik audytu z 2026-07-22: przegląd 21 mockupów pod kątem przyjętej architektury
> offline-first (`docs/_main.md.txt` sekcje 4–6, `CLAUDE.md` sekcja "Offline-first").
> Kolejność bloków = kolejność użycia aplikacji (decyzja użytkownika).
> Ten plik jest checklistą roboczą — odhaczaj po wdrożeniu, usuń gdy wszystko zrobione.

## Jak pracujemy (definition of done każdego bloku)

1. Zmiana w mockupie zgodna z design tokenami i phone frame (patrz `CLAUDE.md`)
2. Nav-strip spięty z sąsiadami, nowe pliki dodane do `index.html`
3. Wpis w `ZMIANY.md` (co + DLACZEGO, z odwołaniem do sekcji architektury)

## Zasady wspólne (z architektury — obowiązują każdy ekran)

- **Stany świeżości danych z serwera:** `live` (bez adnotacji) / `cache` ("· z cache ·
  sync 21 JUN 17:30", amber) / `brak` ("brak danych — wpisz z licznika", amber)
- **SyncChip** `SYNC` / `OFFLINE · n` — jedyny globalny wskaźnik łączności
- **Dane sesji (lokalne)** — timery, log, liczniki — bez wariantów offline
- **Akcje wymagające sieci** — disabled z podanym powodem, nigdy cichy błąd
- **Liczniki fizyczne > serwer** — dane z serwera to podpowiedź

## Scenariusz danych (spójność między ekranami!)

| Element | Wartość |
|---------|---------|
| Dzień scenariusza | 22 JUNE 2026 · EPKK → EPWA · operacja: Skoki |
| PIC zalogowany | Tomasz Małkiewicz · TMK · login `tmalkiewicz` · tomasz@uzaero.pl |
| Dual | AKO |
| Samolot sesji | SP-AXA · Cessna 182 · 2019 · zbiorniki 330 L · MH w formacie **hh:mm** (1 234:30) |
| Samolot zajęty | SP-FGK · C182 2017 · aktywny PIC: KRZ od 07:10 |
| Samolot 2-osobowy | SP-ANK · An-2 1984 · 1700 L · wymaga Dual |
| Wyłączony ze służby | SP-KWA · C172 2021 |
| Poprzednik / przekazanie | J. Kowalski · 21 JUNE · 17:30 (= czas ostatniego synca cache) |

---

## Plan (w kolejności użycia aplikacji)

### ✅ 0. Logowanie — ZROBIONE 2026-07-22

- [x] `00-login.html` — przebudowa na odblokowanie PIN-em (profil lokalny, numpad
      interaktywny, biometria opcjonalna, linki do pełnego logowania)
- [x] `00a-login-full.html` (nowy) — pełny login: login + hasło **od administratora**
      (bez Google OAuth — decyzja odwrócona, patrz ZMIANY Iteracja 7; bez rejestracji),
      nota o wymogu internetu
- [x] `00b-login-offline.html` (nowy) — twarda granica: amber banner, disabled formularz
      z powodem, "Spróbuj ponownie", przekreślone wifi
- [x] `index.html` — karta 00 + karty 00A/00B; `ZMIANY.md` — Iteracja 7
- [x] Dokumentacja wyczyszczona z OAuth (`_main.md.txt`, `CLAUDE.md`)

### ✅ 1. 01-splash — ZROBIONE 2026-07-22

- [x] Stopka "Offline · GPS · Google Sheets" → "Offline-first · GPS · Auto-sync"
- [x] Linia odświeżania cache referencyjnego: kropka + "Dane referencyjne · sync 09:41"
      (online = świeży sync; wariant offline pokazywałby starą datę — stan `cache`)
- [x] Opis w index.html: "po odblokowaniu" + odświeżenie danych referencyjnych

### ✅ 2. 02-preflight — ZROBIONE 2026-07-22

- [x] Wariant **offline** jako osobny plik `02d-preflight-offline.html` (konwencja
      wariantów literowych): modal przejęcia offline — "Aktywny PIC · wg cache",
      "Łączność: brak — claim wyśle się po odzyskaniu sieci", liczniki jako prawda
- [x] Adnotacja `cache`: pasek "Dane z cache · SYNC 21 JUN 17:30" nad listą samolotów;
      tag claim "PIC: KRZ · wg cache 17:30"
- [x] Rozstrzygnięte: SyncChip TAK, na preflightcie w nagłówku (02 = SYNC zielony,
      02d = OFFLINE amber; wzorzec pill z 04a)

### 3. 02a-preflight — stany świeżości przekazania (największa luka systemowa)

- [ ] Stan `cache`: adnotacja przy FOB i MH ("· z cache · sync 21 JUN 17:30", amber)
- [ ] Stan `brak`: puste pole + "brak danych — wpisz z licznika" (licznik fizyczny
      przejmuje rolę źródła; breakdown przekazania znika)
- [ ] Forma: przełącznik stanów w mockupie albo osobne pliki wariantów — do decyzji

### 4. 04-cockpit-ground

- [ ] Dodać SyncChip (04a ma `SYNC`, 05 ma offline-badge — 04 nie ma nic; niespójność)
- [ ] Leftover scenariusza: `SP-MIW` → `SP-AXA` (linia ~302)

### 5. 04b-cockpit-readonly — NOWY ekran (sekcja 3.10)

- [ ] Banner "Podgląd · SP-AXA zajęty przez TMK od 08:00"
- [ ] Zero akcji zapisu (przyciski disabled z powodem lub ukryte); log i statystyki
      widoczne; dane z serwera z adnotacją świeżości
- [ ] Akcja "Przejmij" → flow przejęcia z 02
- [ ] Link z 02 (karta zajętego samolotu → "Podgląd") + index.html

### 6. 09-end-of-day — PRZEBUDOWA (nietknięty od iteracji 1)

- [ ] Sekcja odczytu **MH końcowych** (brak! — a `day_close` = FOB + MH; to ogniwo
      łańcucha MH, fundament scalania — sekcja 4.5); format hh:mm z konfiguracji SP-AXA
- [ ] Framing przekazania: "te wartości zobaczy następny pilot jako przekazanie"
- [ ] Warning "przygotowanie eksportu" → wysyłka do synchronizacji (eksport robi serwer;
      zakończenie dnia bez zasięgu jest poprawne — raport powstanie po syncu)
- [ ] Walidacja paliwa pojemnością (dopisek 330 L z konfiguracji)

### 7. 10-statystyki

- [ ] Leftover `SP-MIW` → `SP-AXA` (nagłówek, linia ~252)

### 8. 11-eksport (Synchronizacja)

- [ ] Sekcja flag serwera dotyczących sesji (wymaganie 3.9): stan pusty "Flagi: brak ✓"
      albo lista (np. `CLOCK_DRIFT` z opisem) — do wiadomości pilota, nie do rozwiązywania

### 9. Sprzątanie

- [ ] `docs/design-notes.md` — placeholder MH `1 234.5 h` → `1 234:30` (scenariusz hh:mm,
      linia ~78) + dopisać założenia logowania (model PIN) i stany świeżości
- [ ] Weryfikacja nawigacji: wszystkie pliki osiągalne z `index.html`, zero martwych
      linków (poprzedni audyt nawigacji: Iteracja 6)
- [ ] Commit po każdym większym bloku

---

## Zgodne z architekturą (audyt — bez zmian)

02b/02c (modale korekty — licznik jako prawda), 03 (Dual jest), 05 + 05a–d (dane lokalne
= zero wariantów offline, offline-badge z tooltipem jest), 06 (pojemność z konfiguracji),
07 (PIC/Dual + zmiana PIC = przelogowanie), 08 (lokalne), 05-themes.
