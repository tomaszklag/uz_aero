# UZ Aero — instrukcje dla Claude Code

## Nazwa aplikacji
Aplikacja nazywa się zawsze **UZ Aero** (mixed case w tekście, **UZ AERO** w nagłówkach display/Bebas Neue).
Stare nazwy — `e-Chronometraż`, `e-CHRONO`, `CHRONO` — są błędne, nigdy ich nie używaj.

## Projekt
Aplikacja Android (React Native + Expo) — elektroniczny system lotniczy dla pilotów.
Rejestruje: czasy blokowe, paliwo, starty/lądowania, eksportuje do Google Sheets.
Dokumentacja: `docs/_main.md.txt`

Stack: React Native + Expo · Zustand · expo-sqlite · expo-location · Google Sheets API v4

## Faza aktualna
**Faza 0 — Design** — statyczne HTML mockupy w `design/`
Nie piszemy kodu React Native dopóki design nie zostanie zatwierdzony.

## Design system (`design/*.html`)

### Kolory (zawsze używaj tych zmiennych CSS)
```css
--green: #2ECC71      /* silnik running, status OK, główny akcent */
--amber: #F39C12      /* paliwo, ostrzeżenia */
--red:   #E74C3C      /* stop engine, zakończenie, błędy */
--blue:  #3498DB      /* UTC, informacje */
--bg:    #0D0D0D      /* tło główne */
```

### Czcionki
- `Bebas Neue` — nagłówki display, timery duże, canvas labels
- `Archivo` — body text, etykiety, przyciski
- `JetBrains Mono` — cyfry timerów, kody ICAO, wartości GPS, kody pilotów

### Phone frame
Każdy mockup używa ramki telefonu 393×852px (iPhone 14 Pro) z `--phone-scale` do auto-skalowania.
Struktura: `.canvas-label` → `.phone` (z Dynamic Island `::before`) → `.nav-strip`

### Wzorzec formularzy
- Pola input: `background: var(--surface-raised)`, `border-radius: 12px`, focus = `var(--green-border)`
- Dropdowny jako lista kart do wyboru (nie natywny `<select>`) — widoczne opcje, zaznaczona = zielona obramówka
- Operacje/typy jako siatka kart z ikonami

## Screen flow (kolejność ekranów)
```
00-login → 01-splash → 02-preflight → 03-preflight-confirm
→ 04-cockpit-ground ⇄ 05-cockpit-running
→ 06-tankowanie / 07-zmiana-zalogi / 08-lista-reczna (akcje ground)
→ 09-end-of-day → 10-statystyki → 11-eksport
```

## Pilot i samolot — UX
- Pilot loguje się na ekranie `00-login.html` (wybór z listy lub PIN)
- Tożsamość pilota jest znana w całej sesji — NIE pytamy o kod pilota w formularzach
- Samolot wybieramy z listy zarejestrowanych jednostek (dropdown/lista kart), NIE pole tekstowe
- Rodzaj operacji — siatka kart z ikonami, NIE select

## Reguły przy zlecaniu agentom
Gdy tworzysz prompt dla agenta do tworzenia HTML mockupów, zawsze dołącz:
1. Pełne design tokeny CSS z `:root` (z sekcji wyżej)
2. Szablon phone frame (393×852px, `--phone-scale`, Dynamic Island)
3. Informację że aplikacja = UZ Aero
4. Linki nawigacyjne do sąsiednich ekranów w `nav-strip`
5. Nazwy plików do stworzenia i docelowy katalog `d:\uz_areo\design\`

## Czego unikać
- Nie dodawaj loadera/spinnera bez określonego celu (patrz: feedback do 01-splash)
- Nie używaj natywnego `<select>` — zawsze stylizowana lista kart
- Nie wpisuj hardcoded kolorów — tylko zmienne CSS
- Nie twórz nowych plików poza `design/` bez pytania
