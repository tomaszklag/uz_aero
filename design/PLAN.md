# UZ Aero — plan wdrożenia architektury w mockupach

> Wynik audytu z 2026-07-22: przegląd 21 mockupów pod kątem przyjętej architektury
> offline-first (`docs/_main.md.txt` sekcje 4–6, `CLAUDE.md` sekcja "Offline-first").
> Kolejność bloków = kolejność użycia aplikacji (decyzja użytkownika).
> Ten plik jest checklistą roboczą — odhaczaj po wdrożeniu, usuń gdy wszystko zrobione.

## Jak pracujemy (definition of done każdego bloku)

1. Zmiana w mockupie zgodna z design tokenami i phone frame (patrz `CLAUDE.md`)
2. Nav-strip spięty z sąsiadami, nowe pliki dodane do `index.html`
3. Ekran mający warianty dostaje **panel „Warianty tego ekranu"** na canvasie (pod
   telefonem): linki do całej rodziny + opis KIEDY dany wariant się wyświetla;
   bieżący oznaczony „ten ekran" (wzorzec: 00 / 02)
4. Wpis w `ZMIANY.md` (co + DLACZEGO, z odwołaniem do sekcji architektury)
5. **STOP — weryfikacja użytkownika.** Commit dopiero po jego akceptacji, nigdy automatycznie.

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

### ✅ 3. 02a-preflight — stany świeżości przekazania — ZROBIONE 2026-07-22

- [x] Stan `cache`: chip OFFLINE + amber adnotacja "Z cache · sync 21 JUN 17:30" przy FOB i MH
- [x] Stan `brak`: "— —" + "brak danych — wpisz z licznika", przycisk "Wpisz odczyt",
      breakdown/poświadczenie ukryte, amber box o łańcuchu, DALEJ disabled z powodem
- [x] Rozstrzygnięte: **przełącznik stanów na canvasie** (Live/Cache/Brak) w jednym pliku;
      konfiguracja samolotu (pojemność, format MH) widoczna we wszystkich stanach

### ✅ 4. 04-cockpit-ground — ZROBIONE 2026-07-22

- [x] SyncChip w app-barze; leftover `SP-MIW` → `SP-AXA`
- [x] Spójność scenariusza: tankowanie +48 L (112→160), karta Tankowanie "112→160"
- [x] "Statystyki + eksport" → "+ synchronizacja" (04 i 04a); panele wariantów 04A/04/04B

### ✅ 5. 04b-cockpit-readonly — ZROBIONE 2026-07-22 (nowy ekran)

- [x] Niebieski banner "PODGLĄD — TYLKO ODCZYT" (SP-FGK prowadzi KRZ · claim od 07:10;
      dane z serwera · sync · ostatnia aktywność)
- [x] Zero zapisu: log KRZ bez kolumny edycji, akcje disabled z powodem (single-writer)
- [x] "PRZEJMIJ SAMOLOT" → flow przejęcia w 02; karta w index + nav + panele rodziny
- [ ] (opcjonalnie, przy następnym dotknięciu 02): link "Podgląd" z karty zajętego samolotu

### ✅ 6. 09-end-of-day — ZROBIONE 2026-07-22

- [x] Sekcja "Motogodziny końcowe": 1 238:12 MH · hh:mm z konfiguracji · Δ +3:42 = block time
- [x] Zielony box przekazania (łańcuch MH — sekcja 4.5)
- [x] Warning: wysyłka do synchronizacji zamiast "eksportu"; offline niczego nie blokuje
- [x] Walidacja paliwa ≤ 330 L z konfiguracji; chip SYNC w nagłówku

### ✅ 7. 10-statystyki — ZROBIONE 2026-07-22

- [x] Leftover `SP-MIW` → `SP-AXA`

### ✅ 8. 11-synchronizacja — ZROBIONE 2026-07-22

- [x] Karta "Flagi serwera · brak ✓" z typami flag i zasadą "rozwiązuje administrator";
      tytuł i nav "Eksport" → "Synchronizacja"

### 9. Sprzątanie

- [ ] `docs/design-notes.md` — placeholder MH `1 234.5 h` → `1 234:30` (scenariusz hh:mm,
      linia ~78) + dopisać założenia logowania (model PIN) i stany świeżości
- [ ] Weryfikacja nawigacji: wszystkie pliki osiągalne z `index.html`, zero martwych
      linków (poprzedni audyt nawigacji: Iteracja 6)
- [ ] Retrofit panelu „Warianty tego ekranu" na pozostałą rodzinę: 05+05A–D
      (02A–C i 04/04A/04B — zrobione)
- [ ] Spójność czasów lotów między ekranami: log 04 (T/O 08:25 / 09:35 / 11:28)
      vs tabela 11 (08:25 / 10:17 / 12:44 / 14:10 / 15:20) — ujednolicić oś czasu
      dnia scenariusza (04 = stan na 12:28, 11 = koniec dnia; cykle muszą się zgadzać)
- [ ] Commit po każdym większym bloku — zawsze PO weryfikacji użytkownika

---

## Zgodne z architekturą (audyt — bez zmian)

02b/02c (modale korekty — licznik jako prawda), 03 (Dual jest), 05 + 05a–d (dane lokalne
= zero wariantów offline, offline-badge z tooltipem jest), 06 (pojemność z konfiguracji),
07 (PIC/Dual + zmiana PIC = przelogowanie), 08 (lokalne), 05-themes.
