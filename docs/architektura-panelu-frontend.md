# UZ Aero — architektura frontendu panelu i wspólnej biblioteki

> Dotyczy fazy 7 (panel administracyjny, web). Wejście: `design/admin/` (20 ekranów,
> `SZABLON.html`, `ANALIZA.md`), `docs/architektura-kodu.md` (warstwy, granulacja plików,
> testy jako egzekucja reguł), `CLAUDE.md` (design system, zakazy).
> Ten dokument **rozstrzyga** — przy każdym rozwidleniu jedna rekomendacja i jawne
> „czego NIE robimy". Nie jest planem prac; kolejność wdrażania jest w §10.
>
> Wersja 1.0 — 2026-07-31.

---

## 0. Rozstrzygnięcia w jednym miejscu

| # | Pytanie | Rozstrzygnięcie | Gdzie |
|---|---|---|---|
| 1 | Wspólna biblioteka DS — jeden pakiet czy dwa? | **Dwa pakiety, oba nie-wizualne: `@uzaero/tokens` i `@uzaero/format`. Zero pakietów z komponentami.** | §1 |
| 2 | Komponenty wspólne RN ↔ web? | **Nie.** Komponenty per platforma; wspólne są wartości, funkcje i decyzje — nie widgety | §1.1–1.2 |
| 3 | Pięć motywów w panelu? | **Nie.** Panel emituje jeden motyw (`night`); generator zostaje parametryczny | §1.6 |
| 4 | Kierunek źródła prawdy `05-themes.html` ↔ `tokens.ts` | **Ręcznie, jak dziś — design prowadzi, kod idzie za nim; równość przybija TEST**, nie generator | §1.7 |
| 5 | Gdzie mieszka `format.ts` | `packages/format`, konsumowany przez `app/`, `admin/` **i `server/`** (dziś ma ręczną kopię) | §1.8, §6 |
| 6 | Warstwy panelu | `screens/ → queries/ → api/`; `components/` nie zna żadnej z nich; czyste moduły ekranu obok ekranu | §2 |
| 7 | TanStack Query bez globalnego store'u | **Potwierdzone**, z jednym warunkiem: filtry list żyją w URL-u, nie w stanie | §4 |
| 8 | Typy | `@uzaero/domain` **tylko jako typy**; koperty HTTP jako własne DTO w `admin/src/api/dto.ts`; **nigdy import z `server/src`** | §5 |
| 9 | „Panel nie liczy po swojemu" | Egzekucja: zakaz importów wartościowych z domeny + jedno miejsce z `fetch` + kontrakt serwera | §5.3 |
| 10 | Routing | **Hash (`#/dni/<uuid>`)** — zero fallbacku SPA na serwerze | §7, §9 |
| 11 | Rozjazd mockup ↔ komponent | **Mockup wygrywa zawsze.** Wykrywa: test tokenów + test inwentarza klas | §3.3 |
| 12 | Testy panelu | vitest + jsdom; cztery rodziny, zero powielania testów serwera | §8 |

---

## 1. Wspólna biblioteka: co dokładnie, ile pakietów

### 1.1 Twarda przeszkoda, od której trzeba zacząć

Aplikacja pilota to **React Native**, panel to **web**. To nie jest różnica stylistyczna:

- RN nie ma CSS ani kaskady; ma `StyleSheet.create` i płaskie obiekty stylów.
- Web nie ma `StyleSheet`, `View`, `Pressable`, `hitSlop` ani `accessibilityRole`.
- **Telefon nie ma `:hover`.** To nie jest teoria — `packages`-owy kandydat `tokens.ts`
  niesie dziś komentarz przy `paperColors.surfaceHover`: *„05-themes.html nie nadpisuje
  `--surface-hover` w motywach jasnych, bo na webie to stan `:hover`, którego na telefonie
  nie ma"*. Ten sam token znaczy co innego po obu stronach.
- Wymagania są rozłączne. `ActionButton` w aplikacji ma **przytrzymanie 2 s**, cel dotykowy
  ≥ 44 px i widoczny powód blokady, bo pilot pracuje w rękawicach i w wibracjach
  (`docs/architektura-kodu.md` §2). `.btn` z `SZABLON.html` to `min-height:36px` i `:hover`.
  Wspólny komponent musiałby być sumą tych dwóch, czyli nie służyć żadnemu.

Materiał dowodowy z tego repo, nie z ogólnej wiedzy: `app/src/ui/components/status/StatusChip.tsx`
ma 73 linie i po odjęciu `View`/`StyleSheet`/`useTheme`/`accessibilityRole` zostaje
**decyzja** („chip to mono 9 px / ls 2 / wersaliki, kropka w tonie akcentu"). Webowy
odpowiednik tej samej decyzji to cztery linie `.pill` w `SZABLON.html`. Wspólny jest
**opis**, nie implementacja — a opisu nie da się zapakować w komponent.

Inwentarze też się nie pokrywają. Aplikacja ma ~75 komponentów DS napędzanych kokpitem
(`PhaseHero`, `Numpad`, `DetectToast`, `CorrectionSheet`, geometria klawiatury Androida).
Panel ma 126 klas CSS napędzanych back-offisem (tabela, filtry, szuflada, oś zdarzeń, stany
puste). Wspólne z nazwy są cztery pojęcia (`banner`, `card`, `pill`/chip, `kv`) — i każde
z nich ma po obu stronach inne wymagania.

**`react-native-web` odrzucamy wprost.** Wciągnąłby założenia builda Metro/Expo do
back-office'u o 20 ekranach, dołożył kilkaset kB do narzędzia dla dwóch osób przy biurku
i — co ważniejsze — **nie umiałby wyrenderować `SZABLON.html`**, czyli zatwierdzonej
specyfikacji. Panel musi wyglądać jak plik HTML, który właściciel produktu zaakceptował;
warstwa emulująca CSS w JS to najkrótsza droga do „prawie tak samo".

### 1.2 Trzy warianty i rekomendacja

| Wariant | Ocena |
|---|---|
| **(a)** wspólne wyłącznie tokeny (`packages/tokens`) + komponenty per platforma | Kierunek dobry, ale **za wąsko**: zostawia zduplikowane formatowanie liczb, które już dziś rozjechało się między aplikacją a serwerem (§1.8) |
| **(b)** tokeny + komponenty webowe w jednym pakiecie używanym tylko przez panel | **Odrzucone.** Pakiet z jednym konsumentem to koszt bez zysku — dokładnie kryterium z `architektura-kodu.md` §6. Wersjonowanie, drugi `package.json`, druga ścieżka importu i granica, której nikt nie przekracza. Komponenty webowe mieszkają w `admin/src/ui/components/` i awansują do pakietu **dopiero gdy pojawi się drugi konsument** (a nie pojawi się: „wielu klubów nie robimy", ANALIZA §7) |
| **(c)** komponenty cross-platform | **Odrzucone** — argumenty w §1.1. Koszt abstrakcji ponosi się od pierwszego dnia, zysk jest hipotetyczny |

**Rekomendacja: (a) rozszerzone o drugi pakiet nie-wizualny.**

```
packages/domain     @uzaero/domain   — istnieje: zdarzenia, reguły, projekcje, detekcja
packages/tokens     @uzaero/tokens   — NOWY: wartości designu + emiter zmiennych CSS
packages/format     @uzaero/format   — NOWY: prezentacja liczb domeny (czas, MH, litry, liczebniki)
app/                RN — komponenty własne (ui/components/, ~75 plików)
admin/              web — komponenty własne (src/ui/components/, ~24 pliki)
```

Reguła, która to porządkuje i którą warto zapisać w `CLAUDE.md`:
**wspólne jest to, co nie ma powierzchni** — wartości, czyste funkcje, typy i decyzje.
Wszystko, co się renderuje, jest własnością platformy.

### 1.3 Co trafia do `packages/tokens`, a co nie

Zawartość to dzisiejszy `app/src/ui/theme/tokens.ts` (419 linii) rozbity zgodnie z regułą
granulacji („jedna odpowiedzialność = jeden plik", `architektura-kodu.md` §0):

```
packages/tokens/
  package.json          @uzaero/tokens · private · main/types = src/index.ts · zero zależności
  src/index.ts          barrel
  src/themeColors.ts    interface ThemeColors (+ docblocki `overlay`/`selection` przenoszone 1:1)
  src/colors/night.ts   \
  src/colors/paper.ts    | pięć motywów, każdy w swoim pliku; spread z `night` zostaje,
  src/colors/solar.ts    | bo odwzorowuje kaskadę CSS z 05-themes.html
  src/colors/sky.ts      |
  src/colors/amber.ts   /
  src/scales.ts         spacing, radius (z komentarzem o normalizacji 13→14)
  src/typography.ts     fontFamilyNative, fontFamilyCss, TypographyToken, typography
  src/theme.ts          Theme, makeTheme, THEMES, THEME_ORDER, THEME_LABELS, DEFAULT_THEME
  src/tone.ts           toneColors(theme, tone) — dziś app/src/ui/components/tone.ts
  src/css.ts            themeCssVars(theme): string — emiter dla weba
```

**`tone.ts` przenosimy** (dziś `app/src/ui/components/tone.ts`): to czysta funkcja
`Theme × Tone → {accent, muted, border}` bez importu RN, a panel potrzebuje dokładnie
tego samego odwzorowania dla `.pill.green/.amber/.red/.blue/.dim`, `.banner.*`
i `.tile-val.*`. Drugi konsument istnieje — więc awans jest uzasadniony.

**Czego w `packages/tokens` NIE MA i dlaczego:**

| Nie wchodzi | Powód |
|---|---|
| `ThemeProvider.tsx` | React + AsyncStorage + `useAuthStore` + `ThemePrefsSync`. To polityka *aplikacji* („motyw jest preferencją pilota i wędruje między urządzeniami"), nie wartość designu. Zostaje w `app/src/ui/theme/` |
| `--sidebar-w`, `--topbar-h` | Wymiary ramy **panelu** (`SZABLON.html`). Telefon nie ma sidebara. Mieszkają w `admin/src/styles/layout.css` — linia jest ostra: tokeny = wartości produktu, wymiary ramy = własność powierzchni |
| `--phone-scale` / `--app-scale` | Skalowanie **mockupu na canvasie**, nie produktu. W realnym panelu nie istnieje |
| jakikolwiek komponent | §1.1 |

**Jedyny prawdziwy szew: rodziny czcionek.** Dziś `typography.display.fontFamily`
to `'BebasNeue_400Regular'` — nazwa eksportu z `@expo-google-fonts`, bezużyteczna
w CSS-ie. Rozwiązanie bez regresu: pakiet eksportuje **dwie mapy**,

```ts
export const fontFamilyNative = { display: 'BebasNeue_400Regular', /* … */ } as const;   // dziś `fontFamily`
export const fontFamilyCss    = { display: "'Bebas Neue', sans-serif", /* … */ } as const;
export const fontFamily = fontFamilyNative;   // alias zgodności — app/ nie zmienia ani linii
```

a `typography` zostaje **dokładnie taka jak dziś** (nazwy RN). Emiter CSS tłumaczy nazwę
rodziny na stos przy wypisywaniu zmiennych. Szew jest w jednym pliku (`src/css.ts`)
i widać go gołym okiem — to lepsze niż „semantyczny klucz rodziny", który wymusiłby
zmianę w każdym miejscu, gdzie aplikacja dziś podaje `fontFamily` wprost do stylu RN.

### 1.4 Jak `app/` konsumuje tokeny bez regresu

Mechanizm jest **już sprawdzony w produkcji** — tak działa `@uzaero/domain`:

```
app/src/domain/index.ts    →  export * from '@uzaero/domain';   (shim zgodności, faza 2)
```

Powtarzamy go dla tokenów:

```
app/src/ui/theme/tokens.ts  →  export * from '@uzaero/tokens';
app/src/ui/theme/index.ts   →  bez zmian (export * from './tokens'; export * from './ThemeProvider';)
app/src/ui/components/tone.ts → export { toneColors, type Tone, type ToneColors } from '@uzaero/tokens';
```

Skutek: **85 plików importujących `ui/theme` i 86 wywołań `useTheme()` nie zmienia się
ani o znak.** Zero ryzyka regresu wizualnego, bo wartości są przeniesione, a nie
przepisane; przegląd diffa to „plik przeniesiony + shim".

Trzy rzeczy, o które trzeba zadbać przy przenoszeniu:

1. **Jest transformuje pakiet warsztatowy, mimo `transformIgnorePatterns`** — bo Jest
   rozwiązuje symlink npm workspaces do prawdziwej ścieżki `packages/tokens/src/**`, która
   nie zawiera `/node_modules/`. Tak samo działa dziś `@uzaero/domain`. Gdyby ktoś
   „naprawiał" to `transformIgnorePatterns`, popsuje coś, co działa.
2. **`architecture.test.ts` dostaje pozycję**: `@uzaero/tokens` na liście dozwolonych
   importów `ui/`, i **zakaz** importu tego pakietu w `domain/`, `application/`
   i `infrastructure/` — tokeny to warstwa UI i nie wolno im wyciec w głąb.
3. `package.json` pakietu kopiujemy z `packages/domain` (`private`, `type: module`,
   `main`/`types` na `src/index.ts`, `sideEffects: false`). **Bez kroku builda** — cała
   reszta repo konsumuje TypeScript wprost i to działa pod Metro, Jest, tsx i Vite.

### 1.5 Web: tokeny → zmienne CSS

Emiter w `packages/tokens/src/css.ts`, konwencja nazw **camelCase → `--kebab-case`**,
dobrana tak, żeby wychodziły dokładnie nazwy z `SZABLON.html`
(`surfaceRaised → --surface-raised`, `textPrimary → --text-primary`,
`greenMuted → --green-muted`):

```ts
export function themeCssVars(theme: Theme): string;   // "  --bg: #0D0D0D;\n  --bg-tint: …"
export function themeCssBlock(theme: Theme, selector = ':root'): string;
```

**Emitujemy komplet, także tokeny, których `SZABLON.html` dziś nie ma**
(`--green-hover`, `--amber-glow`, `--red-glow`, `--overlay`, `--selection`).
Brakująca zmienna to najkrótsza droga do wpisania hexa na sztywno — a to zakaz
z `CLAUDE.md`.

**Sposób użycia: generowanie w czasie builda, plik commitowany.**

```
packages/tokens/scripts/emitCss.ts   →  admin/src/styles/tokens.css   (nagłówek: „PLIK GENEROWANY")
admin/test/tokens.generated.test.ts  →  zawartość pliku == themeCssBlock(THEMES.night)
```

Dlaczego nie wstrzykiwanie w runtime (`document.documentElement.style.setProperty`):
panel ma **jeden** motyw (§1.6), więc runtime dawałby wyłącznie migotanie przed
pierwszym paintem i zależność stylu od wykonania JS. Plik statyczny jest tańszy,
widoczny w przeglądzie kodu i działa, zanim cokolwiek się wykona.

### 1.6 Co się dzieje z pięcioma motywami

**Panel dziedziczy wartości, nie dziedziczy wielomotywowości.** Decyzja jest już podjęta
(ANALIZA §7: *„Pięć motywów aplikacji istnieje dla kokpitu w słońcu. Panel ma jeden motyw —
ciemny, zgodny z tokenami"*) i ma dobre uzasadnienie: motywy jasne i NVG rozwiązują problem
czytelności ekranu telefonu w słońcu i nocą w kabinie. Administrator siedzi przy biurku.

Konsekwencje w kodzie, jawnie:

- `admin/src/styles/tokens.css` zawiera **jeden blok `:root`** z motywu `night`.
- **Nie ma** atrybutu `data-theme`, przełącznika, drugiego zestawu CSS ani `isLight` w panelu.
- Emiter zostaje **parametryczny** (`themeCssBlock(theme, selector)`), bo to nie kosztuje nic:
  gdyby kiedyś panel dostał drugi motyw, jest to jeden dodatkowy blok, a nie przepisanie CSS-u.
  **Nie budujemy przełącznika „na zapas"** — to ten sam koszt bez zysku co tenancy.
- `borderWidth 1.5` z motywów jasnych panelu nie dotyczy; `night.borderWidth = 1` zgadza się
  z `1px` w `SZABLON.html`.

### 1.7 Łańcuch źródła prawdy: `05-themes.html` ↔ `tokens.ts` ↔ `SZABLON.html`

Stan faktyczny: **trzy kopie tych samych wartości**, wszystkie robione ręcznie.
`design/05-themes.html` (`:root` + cztery `[data-theme]`) → `tokens.ts` (docblock mówi
wprost: *„Wartości są SKOPIOWANE z pliku — nie wymyślone"*) → `design/admin/SZABLON.html`
`:root` → i dalej **20 kopii `<head>`** w plikach `A*.html`, bo taka jest reguła z `CLAUDE.md`.
Razem 21 miejsc z literalnymi hexami po stronie designu.

Rozważone kierunki:

| Kierunek | Werdykt |
|---|---|
| Generować `tokens.ts` z HTML-a (HTML źródłem) | **Nie.** Parser CSS-a z pliku, który zawiera też reguły per motyw bez odpowiednika w tokenach (`.phone[data-theme="paper"] .phase-hero-name.active { text-shadow: none }`). Generator musiałby je ignorować, czyli źródło prawdy byłoby „HTML, ale tylko fragment" |
| Generować HTML z `tokens.ts` (kod źródłem) | **Nie.** Mockup jest **zatwierdzoną specyfikacją**, którą czyta i akceptuje właściciel produktu. Artefakt generowany przestaje być specyfikacją — nikt nie recenzuje wyjścia builda. Do tego generowanie `SZABLON.html` i tak nie zaktualizuje 20 kopii `<head>` |
| Zostawić ręcznie **i przybić testem** | **TAK** |

**Rekomendacja: kierunek autorstwa zostaje bez zmian — człowiek zmienia mockup, potem
przenosi wartość do `packages/tokens`. Równości pilnuje test, nie dyscyplina.**

```
packages/tokens/test/mockupTokens.test.ts   (uruchamiany z admin/ przez vitest)
  · czyta design/05-themes.html: :root == THEMES.night, [data-theme="X"] == THEMES.X (tylko nadpisane)
  · czyta design/admin/SZABLON.html i wszystkie design/admin/A*.html: każdy :root == THEMES.night
  · test kontrolny: skaner faktycznie znalazł pliki i zmienne (inaczej przejdzie na pustym zbiorze)
```

To jest dokładnie doktryna tego repo — `sqliteSchema.test.ts`, `test/contract.test.ts`,
`architecture.test.ts`: *„Dokument może się zdezaktualizować; test nie"*. Rozjazd staje się
czerwonym testem w tym samym commicie, w OBIE strony, bez czynienia z żadnego artefaktu
wyjścia builda.

Odrzucone po drodze: wyciągnięcie tokenów do `design/admin/_tokens.css` linkowanego przez
`A*.html`. Łamie regułę „kopiuj `<head>` w całości" i odbiera mockupom samodzielność —
a mockupy otwiera się jako pliki z dysku, także przez osoby spoza repo.

### 1.8 Drugi wspólny pakiet: `packages/format`

To nie jest propozycja „na zapas" — **duplikat już istnieje i już się rozjechał**.

`server/src/application/common/export/daySheetContent.ts` ma ręczne kopie funkcji z
`app/src/ui/format.ts`, z docblockami przyznającymi to wprost — „lustro `timeUtc`
z app/src/ui/format.ts", „lustro `motoHours` z app/src/ui/format.ts".
A rozjazd jest już w kodzie:

```
app/src/ui/format.ts        duration(ms)  →  "6:39"      (ekran 10, mockupy 09/10/11)
server/…/daySheetContent.ts hhmm(ms)      →  "06:39"     (karta arkusza, §4.7)
```

Ta sama wielkość (block time kanonicznego dnia), dwa zapisy — mimo że §4.7 mówi, że
treść karty **jest** treścią ekranów 10/11. Panel byłby **trzecią** kopią i pierwszym
miejscem, gdzie różnicę widać na jednym ekranie: A02 pokazuje kolumnę „Block", a A05
podgląd karty arkusza tego samego dnia.

**Zawartość `packages/format`:** cała dzisiejsza `app/src/ui/format.ts`. Moduł jest już
RN-free — jedyny import to `import type { EpochMillis } from '../domain'`. Przenosimy
w całości (`timeUtc`, `timeLocal`, `dateUtcLong`, `duration`, `durationLong`, `motoHours`,
`parseMotoHours`, `parseLitres`, `maskTimeUtcInput`, `parseTimeUtcOnDay`, `shortName`,
`litres`, `plural`, `eventsCount`, `formatLatLon`), bez dzielenia po konsumentach —
to jedna odpowiedzialność („liczby domeny → napisy"), a dzielenie jej wg tego, kto
akurat czego używa, jest tą samą spekulacją, którą repo odrzuca przy portach.

`app/src/ui/format.ts` zostaje jako shim (`export * from '@uzaero/format';`) — 24 pliki
importujące bez zmian. Serwer usuwa swoje lustra i importuje pakiet.

**Dlaczego nie do `@uzaero/domain`:** domena ma docblock stawiający tę granicę
(*„Formatowanie na LT/UTC do wyświetlenia robi warstwa UI — nie ten moduł"*), a
`maskTimeUtcInput` i `parseMotoHours` to obsługa **wpisu z klawiatury** — nie ma powodu,
by pakiet, od którego zależy ingest serwera, wiedział cokolwiek o maskach pól. Osobny
pakiet trzyma linię widoczną. Zależność `@uzaero/format → @uzaero/domain` (jeden typ
`EpochMillis`) jest jednokierunkowa i w porządku.

**Testy jadą z kodem, ale runner zostaje:** `app/src/__tests__/format.test.ts` zostaje
tam, gdzie jest (Jest już go uruchamia przez shim, zero nowej infrastruktury — tak samo
`@uzaero/domain` nie ma własnego runnera i jest testowany z obu stron). Po stronie serwera
dochodzi asercja w `test/export.test.ts`, że komórki karty powstają z **funkcji pakietu**,
a nie z lokalnej kopii.

---

## 2. Drzewo katalogów panelu i kierunek zależności

Panel dostaje własny workspace `admin/` (`@uzaero/admin`), dopisany do `workspaces`
w głównym `package.json` — jak przewiduje ANALIZA §8.

```
admin/
  package.json          @uzaero/admin · private
  index.html            wejście Vite (<div id="root">)
  vite.config.ts        base:'/admin/' · proxy /admin/* → localhost:PORT w dev
  tsconfig.json         strict + noUncheckedIndexedAccess (jak server/)
  public/fonts/         Bebas Neue · Archivo · JetBrains Mono (woff2) — patrz §9
  src/
    main.tsx            COMPOSITION ROOT: QueryClient, HashRouter, SessionProvider, <App/>
    routes.tsx          mapa tras → ekrany (deep linki, §7)

    api/                ── JEDYNE miejsce z fetch ──────────────────────────────
      httpClient.ts     fetch + nagłówek CSRF na mutacjach + 401/403 → typowane wyjątki
      dto.ts            koperty odpowiedzi (§5.2)
      sessions.ts       listSessions · getSession · postCorrection
      flags.ts          listFlags · getFlag · resolveFlag
      events.ts         listEvents
      exports.ts        listExports · retryExport
      pilots.ts · fleet.ts · stats.ts · audit.ts · maintenance.ts · me.ts
                        (jeden plik = jeden zasób = jeden prefiks trasy — jak server/src/http/routes/)

    queries/            ── klucze i hooki TanStack ──────────────────────────────
      keys.ts           JEDNO miejsce z kształtem kluczy (§4.2)
      client.ts         QueryClient + domyślne (staleTime, refetchOnWindowFocus, retry)
      useSessions.ts · useFlags.ts · useResolveFlag.ts · …
                        mutacja deklaruje SWOJE unieważnienia tutaj, nie na ekranie

    screens/            ── jeden katalog na ekran A* ────────────────────────────
      dni/
        DniScreen.tsx       widok: układ + komponenty; zero arytmetyki
        dniFilters.ts       CZYSTY: filtry ↔ query string (testowany w Node)
        dniRows.ts          CZYSTY: DTO → wiersze tabeli (plakietki, „—" zamiast zera)
      dzien/
        DzienScreen.tsx
        dzienTimeline.ts    CZYSTY: zdarzenia → wiersze osi (kolejność, voided, metoda)
      flagi/ · zdarzenia/ · eksporty/ · statystyki/ · piloci/ · flota/ · progi/ · audyt/ · konserwacja/ · login/

    ui/
      components/       DESIGN SYSTEM PANELU — 1:1 z SZABLON.html (§3)
        Button.tsx · Card.tsx · Tile.tsx · DataTable.tsx · Pill.tsx · Banner.tsx
        Drawer.tsx · KeyValue.tsx · Timeline.tsx · EmptyState.tsx · Skeleton.tsx
        NoAccess.tsx · Field.tsx · TextInput.tsx · OptionList.tsx · FilterBar.tsx
        SearchInput.tsx · FilterChip.tsx · PageHead.tsx · Columns.tsx · index.ts
      shell/            rama aplikacji (nie ekran)
        AppShell.tsx · Sidebar.tsx · NavItem.tsx · navItems.ts · Topbar.tsx
        Breadcrumbs.tsx · UtcClock.tsx · WhoBox.tsx

    auth/
      SessionProvider.tsx   tożsamość + rola z GET /admin/me (cienko nad Query, §4.3)
      can.ts                CZYSTY: capability → boolean + POWÓD odmowy do UI

    styles/
      tokens.css        GENEROWANY z @uzaero/tokens (§1.5)
      base.css          reset, @font-face, scrollbary, :focus-visible
      layout.css        --sidebar-w/--topbar-h, .shell/.main/.content
      components/*.css  jeden plik na komponent, klasy 1:1 z SZABLON

  test/
    architecture.test.ts · tokens.generated.test.ts · classInventory.test.ts
    (testy modułów czystych leżą przy nich: screens/days/daysFilters.test.ts)
```

### 2.1 Kierunek zależności

```
        screens/          ekrany: układ + spięcie danych z komponentami
         │      \
         │       \  wywołuje
         ▼        ▼
     queries/    ui/components/     (komponent NIE zna queries/ ani api/)
         │  wywołuje
         ▼
       api/                          (jedyne miejsce z fetch; NIE zna Reacta)
         │
         ▼
   @uzaero/domain (TYLKO typy) · @uzaero/format · @uzaero/tokens
```

| Warstwa | Katalog | Czego NIE wolno importować |
|---|---|---|
| Ekrany | `src/screens/` | — (spina wszystko, ale patrz reguła modułów czystych niżej) |
| Zapytania | `src/queries/` | `screens/`, `ui/` |
| API | `src/api/` | React, `queries/`, `screens/`, `ui/` |
| Komponenty | `src/ui/` | `api/`, `queries/`, `screens/` |
| Moduły czyste | `src/screens/**/*.ts` (bez `.tsx`) | React, `queries/`, `api/` |

Kierunek jest ten sam co w `app/` i `server/`: **do środka**, a to, co najbardziej stabilne
(tokeny, formaty, typy domeny), leży najgłębiej i nie zna niczego nad sobą.

### 2.2 Jak nie wpuścić logiki do komponentów — konkretny mechanizm

W `app/` robi to zwyczaj wynoszenia logiki do czystych modułów obok ekranu:
`screens/statsDay.ts`, `screens/cockpitLog.ts`, `screens/historyDays.ts`,
`screens/claimMode.ts`, `screens/gpsLoss.ts` — każdy z własnym testem w Node, bez UI.
Odpowiednik w panelu, dosłowny:

**Reguła: ekran to `*.tsx` bez arytmetyki. Każda decyzja o treści — mapowanie DTO
na wiersz, wybór plakietki, złożenie napisu, grupowanie osi zdarzeń, translacja filtrów
na query string — mieszka w `*.ts` obok, jest czysta i ma test.**

Egzekucja, trzy warstwy (kolejność = malejąca siła):

1. **`admin/test/architecture.test.ts`** — kopia mechanizmu z
   `app/src/__tests__/architecture.test.ts` (skan plików + regex importów + **test kontrolny**,
   że skaner faktycznie coś widzi). Pilnuje tabeli z §2.1, a dodatkowo:
   - `src/ui/**` nie importuje `api/` ani `queries/` — komponent dostaje dane propsami;
   - `fetch(` występuje wyłącznie w `src/api/httpClient.ts`;
   - `screens/**/*.ts` (moduły czyste) nie importują `react`.
2. **Zakaz importów wartościowych z `@uzaero/domain`** (dozwolone tylko `import type`) —
   szczegóły i uzasadnienie w §5.3. Skutek uboczny jest tu najważniejszy: skoro panel
   nie może wywołać `projectSession`, to nie może przeliczyć niczego po swojemu.
3. **Zakaz `toFixed` / `Math.round` / `Math.floor` / `Intl.NumberFormat`
   w `src/ui/**` i w `*.tsx`** — arytmetyka ma prawo istnieć wyłącznie w module czystym
   z testem obok albo w `@uzaero/format`. To najtańszy sposób złapania momentu,
   w którym „panel zaczyna liczyć po swojemu": zaczyna się od zaokrąglenia.

### 2.3 `.tsx` eksportuje wyłącznie komponenty

Reguła narzędziowa, nie estetyczna — i jedyna w tym dokumencie, której koszt widać
w pracy człowieka, a nie w testach ani w buildzie.

**Fast Refresh podmienia moduł w miejscu tylko wtedy, gdy WSZYSTKIE jego eksporty są
komponentami.** Jeden eksport obok — hook, stała, tablica — i Vite odrzuca cały moduł
jako granicę odświeżania, po czym unieważnienie idzie w górę drzewa importów aż do
`main.tsx`, który niczego nie przyjmuje. Kończy się to przeładowaniem CAŁEJ strony:
utratą stanu ekranu i ponownym `GET /me` przy każdym zapisie pliku.

Tak było z `auth/SessionProvider.tsx`, dopóki eksportował komponent razem z hookiem:

```
[vite] hmr invalidate /src/auth/SessionProvider.tsx:
Could not Fast Refresh ("useSessionState" export is incompatible)
[vite] page reload src/auth/SessionProvider.tsx
```

Stąd podział: `auth/sessionContext.ts` trzyma kontekst i `useSessionState`,
`auth/SessionProvider.tsx` — sam komponent. **Tożsamość kontekstu MUSI mieszkać poza
granicą odświeżania**: gdyby `createContext` re-ewaluowało się razem z komponentami,
zamontowany provider i świeżo odświeżony konsument patrzyłyby na dwa różne obiekty,
a `useContext` zwróciłby `null` — czyli „wylogowanie" bez wylogowania.

Dwa udokumentowane wyjątki, oba świadome: `routes.tsx` i `ui/shell/navItems.tsx` to
tablice konfiguracji zawierające JSX (elementy tras, ikony pozycji). Komponentami nie
są i odświeżyć się nie mogą — pełne przeładowanie po edycji mapy tras albo nawigacji
jest tu zachowaniem poprawnym, bo zmienia się szkielet aplikacji, a nie ciało komponentu.

Egzekwuje `admin/test/architecture.test.ts` („plik .tsx eksportuje WYŁĄCZNIE komponenty"):
w `.tsx` każdy eksport musi być `export function` z wielkiej litery. `export const`
bywa komponentem (`memo`, `forwardRef`), ale w panelu nie ma ani jednego takiego, więc
reguła zostaje wąska i czytelna — a gdyby taki się pojawił, test wymusi rozmowę.

---

## 3. Z 20 mockupów na komponenty, bez utraty reguły „wdrażamy 1:1"

### 3.1 Punkt wyjścia jest lepszy, niż się wydaje

Zmierzone na plikach: `SZABLON.html` definiuje **126 klas**. Z 20 ekranów `A*.html`
**osiemnaście używa wyłącznie klas szablonu**. Własne klasy dokładają dwa pliki:
`A01-pulpit.html` (+27: `.fleet-row`, `.todo-row`, `.spark`, `.fresh-*`) i `A08-progi.html`
(+16: `.thr-*`, `.diff-*`, `.proof`). Żaden plik nie używa klasy, której nie definiuje.

Czyli: **`SZABLON.html` naprawdę jest inwentarzem komponentów, a rozjazd wynosi 43 klasy
w dwóch plikach** — i jest to rozjazd wobec reguły z `CLAUDE.md` („Nowy komponent
dokładamy do szablonu, nie do pojedynczego ekranu"), którą trzeba domknąć **przed**
implementacją, nie w jej trakcie (§11 pkt 3).

### 3.2 Mapowanie klas na komponenty

Z 126 klas powstają **24 komponenty + 8 elementów ramy (`shell/`)**; reszta to modyfikatory
(`.on`, `.selected`, `.voided`, `.locked`, `.green`) i klasy wyłącznie mockupowe.

| Klasy z `SZABLON.html` | Komponent | Uwagi do API |
|---|---|---|
| `.btn` `.primary` `.ghost` `.danger` `.sm` `.disabled` | `Button` | `variant`, `size`, `disabled` **z powodem** (wzorzec `ActionButton`: powód jest widocznym tekstem, nie tooltipem) |
| `.card` `.card-title` `.spacer` | `Card` | `title`, `actions` (slot po prawej) |
| `.tiles` `.tile` `.tile-key/-val/-note` | `TileGrid` + `Tile` | `tone`, `unit` (renderowane jako `<small>`) |
| `.filters` `.search` `.chip` `.chip.on` | `FilterBar` · `SearchInput` · `FilterChip` | stan filtrów przychodzi z URL-a (§4.4) |
| `.table-wrap` `table` `thead th.sortable/.num` `td.num/.mono/.dim` `.cell-strong` `.cell-sub` `.reg` `.row-actions` `tr.clickable` | `DataTable` | kolumny **deklaratywnie**: `{key, header, align:'num', sortable, render}`; wiersz z `href` (§7) |
| `.pill` + `.green/.amber/.red/.blue/.dim` + `.dot.live` | `Pill` | `tone` z `toneColors`, `dot`, `live` |
| `.banner` + `.status/.warn/.danger/.ok` | `Banner` | trzy typy z `design-notes.md` + `ok`; ikona z tonu, **nigdy** z propsa |
| `.field` `.label` `.input` `.input.mono` `.hint` | `Field` + `TextInput` | `mono` dla kodów/UUID |
| `.opt-list` `.opt.selected` `.opt-body/-name/-desc/-check` `.opt-grid` | `OptionList` · `OptionGrid` | **jedyny dozwolony „select"** (zakaz z `CLAUDE.md`) |
| `.empty` `.empty-icon/-title/-note` | `EmptyState` | `title`, `note`, `action` |
| `.skel` | `Skeleton` · `SkeletonRows` | nigdy spinner na całą stronę |
| `.no-access` | `NoAccess` | dostaje **wymaganą zdolność** i wypisuje, kogo prosić |
| `.drawer` `.drawer-scrim/-head/-title/-sub/-body/-foot` `.x-btn` | `Drawer` | Esc, przywrócenie fokusu, akcje w stopce |
| `.kv` `.kv-k` `.kv-v` + tony | `KeyValueList` + `KeyValue` | wartość zawsze mono (reguła tabel) |
| `.tl` `.tl-row.voided` `.tl-time/-rail/-dot/-name/-meta` | `Timeline` + `TimelineRow` | `voided` = przekreślone, **nie** ukryte |
| `.cols` `.cols.even` | `Columns` | `1fr 380px` / `1fr 1fr` |
| `.page-head` `.page-title/-sub/-actions` | `PageHead` | — |
| `.sidebar` `.brand*` `.side-nav` `.nav-group` `.nav-item.active/.locked` `.nav-count` | `shell/Sidebar` + `NavItem` | `locked` **widoczny** z powodem — reguła „disabled z podanym powodem" |
| `.topbar` `.crumbs` `.topbar-right` `.utc-clock` | `shell/Topbar` · `Breadcrumbs` · `UtcClock` | zegar UTC, LT nie występuje w panelu w ogóle |
| `.who` `.who-avatar/-body/-name/-role` | `shell/WhoBox` | — |
| `.shell` `.main` `.content` | `shell/AppShell` | `.content > * { flex-shrink:0 }` — komentarz z szablonu przenosimy razem z regułą |
| `.browser` `.chrome*` `.canvas-label` `.film-strip` `.slug` `.canvas-meta` `.variants-panel` `.vp-*` `.nav-strip` `.demo-note` | **nie stają się niczym** | To rama mockupu na canvasie. Panel jest tą przeglądarką, a nie jej obrazkiem |

**Klasy CSS zostają dosłowne.** Komponent `Pill` renderuje `class="pill green"`, a nie
zahaszowaną nazwę z CSS Modules. Powód nie jest estetyczny: dopóki nazwa klasy jest ta sama
po obu stronach, **grep po `pill` znajduje jednocześnie mockup i komponent**, a recenzent
może porównać DOM z plikiem HTML linia w linię. CSS Modules, Tailwind i styled-components
tę własność kasują — a to ona jest technicznym znaczeniem reguły „wdrażamy 1:1".
Ryzyko kolizji globalnych zamyka `classInventory.test.ts` (§3.3) plus reguła „jedna klasa
zdefiniowana w dokładnie jednym pliku CSS".

### 3.3 Gdy mockup i komponent się rozjadą

**Kto wygrywa: mockup. Zawsze i bez wyjątku.** `CLAUDE.md` nie zostawia tu marginesu:
*„Wątpliwość do mockupu = rozmowa przed implementacją, nie cicha zmiana w kodzie"*.
Panel niczego w tej zasadzie nie zmienia — zmienia tylko to, że rozjazd trzeba umieć **wykryć**,
bo 20 plików × 126 klas to za dużo na oko.

Trzy detektory, wszystkie wykonywalne:

1. **`tokens.generated.test.ts`** — `admin/src/styles/tokens.css` == `themeCssBlock(THEMES.night)`.
   Łapie dryf kolorów w kodzie.
2. **`mockupTokens.test.ts`** (§1.7) — zmienne w `design/**/*.html` == `THEMES`.
   Łapie dryf kolorów w designie.
3. **`classInventory.test.ts`** — zbiór klas zdefiniowanych w `admin/src/styles/components/*.css`
   == zbiór klas z `<style>` w `design/admin/SZABLON.html` **minus** lista klas ramy mockupu
   (spisana jawnie w teście, z komentarzem dlaczego każda tam jest).
   - Klasa dodana do mockupu, a nieobecna w panelu → czerwony test. To jest „ekran
     zaimplementowany z pominięciem sekcji", złapany maszynowo.
   - Komponent wymyślony w kodzie bez mockupu → też czerwony. To jest „upraszczam sobie ekran",
     złapane z drugiej strony.

Procedura przy rozjeździe (do `architektura-kodu.md` §7 jako przepis „Nowy ekran panelu"):

1. Otwórz `design/admin/A0x.html` obok edytora i przejdź **sekcja po sekcji**.
2. Brakuje wzorca w bibliotece → **dodaj komponent**, nie upraszczaj ekranu.
3. Mockup wygląda na błędny → **rozmowa**, potem poprawka mockupu, potem kod.
4. Poprawka wizualna wychodzi z implementacji → wraca do `SZABLON.html` **w tym samym commicie**,
   inaczej test inwentarza świeci na czerwono i słusznie.

---

## 4. Warstwa danych

### 4.1 TanStack Query bez globalnego store'u — potwierdzone

Propozycja z ANALIZA §8 jest trafna i ją **potwierdzam**, z uzasadnieniem mocniejszym niż
tam podane: aplikacja pilota ma Zustanda, bo trzyma **projekcję dnia liczoną lokalnie ze
strumienia zdarzeń** i musi działać offline. Panel nie ma ani jednego, ani drugiego —
ANALIZA §7 wprost wyklucza tryb offline panelu (*„Brak sieci w panelu wolno pokazać jako
blokadę — i to jedyne miejsce w systemie, gdzie wolno"*). Serwer jest jedynym źródłem
prawdy, więc **cały stan panelu to cache odpowiedzi HTTP**, a to jest dokładnie problem,
który Query rozwiązuje.

Kandydaci na stan globalny i co się z nimi dzieje:

| Kandydat | Rozstrzygnięcie |
|---|---|
| Filtry list (daty, samolot, pilot, chipy) | **URL**, nie store (§4.4) |
| Tożsamość i rola | zapytanie `['me']` ze `staleTime: Infinity`; `SessionProvider` to cienka wygoda nad cache'em, nie drugie źródło |
| Otwarta szuflada | parametr trasy (`#/flagi/14`) — szuflada jest deep-linkowalna, więc nie jest stanem |
| Sortowanie tabeli | URL, razem z filtrami |
| Toasty / wynik ostatniej mutacji | stan lokalny ekranu; nie przeżywa nawigacji i nie powinien |

Po tym podziale **nie zostaje nic**, co uzasadniałoby Zustanda. Nie dokładamy go.

### 4.2 Klucze

Jedno miejsce, hierarchicznie, żeby unieważnianie prefiksem było jednolinijkowe:

```ts
// admin/src/queries/keys.ts
export const keys = {
  me:        ['me'] as const,
  dashboard: ['dashboard'] as const,
  sessions:  { all: ['sessions'] as const,
               list: (f: SessionFilter) => ['sessions', 'list', f] as const,
               detail: (uuid: string)   => ['sessions', 'detail', uuid] as const },
  flags:     { all: ['flags'] as const,
               list: (f: FlagFilter)    => ['flags', 'list', f] as const,
               detail: (id: number)     => ['flags', 'detail', id] as const },
  exports:   { all: ['exports'] as const, list: (f: ExportFilter) => ['exports','list',f] as const },
  // …
};
```

### 4.3 Unieważnianie po mutacji dotykającej dwóch widoków

Przypadek wzorcowy jest realny: **rozwiązanie flagi** zmienia skrzynkę flag **oraz**
status eksportu karty dnia, bo `resolve` musi pociągnąć re-eksport (`ANALIZA` §5 poz. 10,
`architektura-kodu.md` §0: *„inaczej odblokowanie flagi nie odblokuje arkusza"*). Dodatkowo
zmienia licznik `[7]` przy pozycji „Flagi" w sidebarze.

**Rozstrzygnięcie — trzy reguły, w tej kolejności:**

1. **Serwer zwraca SKUTEK, nie `204`.**
   `POST /admin/flags/:id/resolve` → `{ flag: FlagRecord, sessions: SessionRow[], export: { revision, url, at } | null }`.
   To nie jest wygoda frontu, tylko konsekwencja `ANALIZA` §6 ryzyko 2: *„odpowiedź niesie
   numer nowej rewizji — UI mówi »arkusz zaktualizowany · rewizja 3«, nie »zapisano«"*.
   Bez tego panel musiałby **zgadnąć**, co się stało, albo dopytać drugim żądaniem.
2. **Encje, które przyszły w odpowiedzi — `setQueryData`. Listy — `invalidateQueries`.**
   Detale (`flags.detail`, `sessions.detail`) dostają dane wprost, bez dodatkowego ruchu
   i bez migotania. Listy mogą zmienić **skład** (flaga wypada ze skrzynki, dzień znika
   z „bez arkusza"), a składu nie wolno symulować na kliencie — to jest ten moment, w którym
   panel zaczyna pokazywać liczby, których serwer nie wysłał.
3. **`['dashboard']` unieważnia KAŻDA mutacja panelu.** Jeden mały endpoint, a alternatywą
   jest plakietka „7 flag" kłamiąca po rozwiązaniu flagi — czyli dokładnie ten rodzaj
   cichego rozjazdu, który panel ma wykrywać, a nie produkować.

```ts
// admin/src/queries/useResolveFlag.ts — mutacja deklaruje swoje unieważnienia TUTAJ
export function useResolveFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ResolveFlagInput) => flagsApi.resolve(v),
    onSuccess: (res) => {
      qc.setQueryData(keys.flags.detail(res.flag.id), res.flag);
      for (const s of res.sessions) qc.setQueryData(keys.sessions.detail(s.uuid), s);
      qc.invalidateQueries({ queryKey: keys.flags.all });     // skrzynka: skład się zmienił
      qc.invalidateQueries({ queryKey: keys.exports.all });   // eksport: doszła rewizja
      qc.invalidateQueries({ queryKey: keys.sessions.all });  // listy dni: kolumna „Arkusz"
      qc.invalidateQueries({ queryKey: keys.dashboard });      // liczniki sidebara
    },
  });
}
```

**Czego NIE robimy:**

- **Nie ręczymy w cache'u list** (`setQueryData` na `['flags','list',…]`, żeby „od razu było
  widać"). Wymaga powtórzenia serwerowej logiki filtrowania i sortowania po stronie klienta —
  po pierwszym filtrze różnica jest gwarantowana.
- **Nie robimy aktualizacji optymistycznych.** Serwer używa optymistycznej współbieżności
  (`ANALIZA` §6 ryzyko 10: `resolve` na fladze już rozwiązanej → `409` z aktualnym stanem
  i komunikatem „rozwiązał już X o HH:MM"). Optymistyczny UI musiałby się z tego wycofywać
  i tłumaczyć — dla dwóch osób przy biurku to koszt bez zysku. Przycisk pokazuje stan zajęty,
  UI przyjmuje odpowiedź serwera.
- **Nie wołamy `invalidateQueries` z ekranu.** Dwa ekrany wołające tę samą mutację nie mogą
  pamiętać dwóch różnych list — to ta sama zasada, co „ekran nie definiuje własnych kart".

### 4.4 Filtry w URL-u, nie w stanie

`ANALIZA` §3 nazywa deep linki podstawowym scenariuszem współpracy („wklej mi link do tego
dnia"). Filtr trzymany w Zustandzie albo w `useState` to filtr, którego nie da się wkleić,
i lista, która gubi się po `F5`. Dlatego: **`useSearchParams` jest magazynem filtrów**,
a `screens/days/daysFilters.ts` (moduł czysty, testowany) tłumaczy query string na obiekt
filtra i z powrotem. Bonus, który wychodzi za darmo: klucz zapytania `keys.sessions.list(f)`
jest funkcją tego samego obiektu, więc powrót „wstecz" trafia w cache.

### 4.5 Ustawienia domyślne QueryClienta

```
staleTime: 30_000            back-office czyta te same dane w seriach; 30 s wycina burzę żądań
refetchOnWindowFocus: true    karta panelu bywa otwarta cały dzień — po powrocie chcemy prawdy
retry: (n, e) => n < 2 && !isHttpError(e)   4xx nie powtarzamy (403 nie naprawi się samo)
```

Błąd sieci **wolno** pokazać jako blokadę — to jedyne miejsce w systemie, gdzie wolno
(`ANALIZA` §7). Baner `danger` nad treścią z przyciskiem „Ponów", dane zostają w ostatnim
znanym stanie z adnotacją wieku.

---

## 5. Typy: co skąd

### 5.1 `@uzaero/domain` — TAK, ale wyłącznie jako typy

Panel importuje: `EventType`, `EventPayloadMap`, `SessionState`, `Handover`, `MhFormat`,
`Aircraft`, `Pilot`, `ServiceStatus`, kody naruszeń oraz — po przeniesieniu, §11 pkt 6 —
`PilotRole` i `Capability`.

```ts
import type { SessionState, MhFormat } from '@uzaero/domain';   // OK
import { projectSession } from '@uzaero/domain';                // ZAKAZANE (test architektury)
```

Zakaz importów wartościowych ma jeden konkretny cel: **odciąć panelowi możliwość liczenia**.
Skoro `projectSession` jest nieosiągalne, jedynym źródłem liczby jest odpowiedź serwera.
Wyjątki (np. listy stałych do zbudowania filtra, `CORRECTION_EVENT_TYPES`) dopisujemy
do allowlisty w teście **imiennie, z komentarzem** — inaczej wyjątek zjada regułę.

### 5.2 Koperty HTTP — własne DTO, w `admin/src/api/dto.ts`

`{items, nextCursor}`, wiersz listy dni z doklejonym `reg`/`picName`/`exportRevision`/`lastSyncAt`,
kształt odpowiedzi `resolve` — to **prezentacja projekcji przez konkretną trasę**, nie domena.
Zmienia się razem z endpointem. Wrzucenie tego do `packages/domain` uczyniłoby domenę
zależną od kształtów HTTP — dokładnie odwrotnie niż jest dziś.

**Nigdy nie importujemy z `server/src`.** Serwer to workspace z `type: module`, rozszerzeniami
`.ts` w importach (`moduleResolution: Bundler`, `allowImportingTsExtensions`), typami Fastify
i `pg`. Import z niego wciągnąłby typy Node'a do bundla przeglądarki i związał panel
z wewnętrznym podziałem warstw serwera — czyli z rzeczą, którą całe repo trzyma za granicą.

**Ochrona przed rozjazdem DTO w v1:** testy tras po stronie serwera (`server/test/*.test.ts`
na PGlite przez `app.inject`) przybijają kształt odpowiedzi — tak jak dziś robi to
`contract.test.ts`. Klient waliduje **wąsko**, w `httpClient.ts`: że przyszedł JSON,
że lista jest listą, że `nextCursor` jest stringiem albo `null` — czyli tyle, żeby błąd
kontraktu wywalił się głośno przy odpowiedzi, a nie po cichu przy renderze.

**Czego NIE robimy w v1:** pakietu `packages/contracts` ze schematami zod współdzielonymi
przez serwer i panel. Jedna para konsumentów, dodatkowy pakiet i kolejność builda — a repo
odrzuca „mappery DTO ↔ domena w obie strony" z tego samego powodu (§6). **Wyzwalacz do
zmiany decyzji, zapisany jawnie: jeśli rozjazd DTO zepsuje panel dwa razy, promujemy
schematy odpowiedzi do `packages/contracts` i panel parsuje nimi wejście.**

### 5.3 „Liczby pochodzą z `projectSession`" — jak to wyegzekwować

Cztery mechanizmy, żaden nie jest apelem o staranność:

1. **Zakaz importów wartościowych z domeny** (§5.1) — panel nie ma czym policzyć.
2. **Jedno miejsce z `fetch`** (`api/httpClient.ts`, test architektury) — liczby wchodzą
   jednymi drzwiami.
3. **Kontrakt po stronie serwera**: `server/test/contract.test.ts` już dziś wymaga, żeby
   wiersz `sessions` **odtwarzał** liczby `projectSession`, a nie liczył własne. Każdy nowy
   endpoint `/admin/*` zwracający liczby (statystyki floty i pilotów, pulpit) dopisuje się
   do tego testu — `ANALIZA` §5 poz. 13 stawia ten sam warunek.
4. **Zakaz arytmetyki w warstwie widoku** (§2.2 pkt 3). „Panel liczy po swojemu" prawie
   nigdy nie zaczyna się od `SELECT SUM` w kodzie frontu — zaczyna się od `toFixed(1)`
   w komórce tabeli i sumy trzech pól „na szybko" w JSX-ie.

---

## 6. Formaty — gdzie mieszka ten kod

**Odpowiedź: `packages/format` (`@uzaero/format`).** Pełne uzasadnienie i zawartość: §1.8.

Trzy konsekwencje warte powtórzenia w tym miejscu:

- Panel formatuje **tym samym kodem**, co ekran 10 telefonu i co karta arkusza — więc
  A02 („Block"), A05 (podgląd karty) i ekran 10 pilota nie mogą się różnić zapisem
  tej samej wielkości.
- MH formatuje się **wg konfiguracji samolotu** (`mh_format`), więc DTO listy dni musi
  nieść `mhFormat` per wiersz. Bez tego panel albo zgadnie, albo pokaże `1234.5`
  tam, gdzie licznik w kabinie pokazuje `1234:30` (§5.4 wymagań).
- **Jest do rozstrzygnięcia jedna rzecz merytoryczna**: `6:39` (aplikacja) czy `06:39`
  (arkusz). Kod może mieć obie funkcje, ale kolumna „Block" w panelu musi wybrać jedną
  i musi to być ta sama, którą widzi pilot i którą czyta klub w arkuszu (§11 pkt 1).

---

## 7. Dostępność i gęstość — co jest wymagane w v1

Panel jest narzędziem biurkowym: rama 1440×900, minimum 1280 px, bez responsywności
mobilnej i bez i18n (`ANALIZA` §7 — obie decyzje przyjęte, nie podważam).

**Wymagane w v1:**

| Rzecz | Zakres w v1 | Dlaczego akurat tyle |
|---|---|---|
| **Deep linki** | Tak, wszystkie: `#/dni/<uuid>`, `#/flagi/14`, `#/zdarzenia?uuid=…`, filtry list w query stringu | `ANALIZA` §3 nazywa to podstawowym scenariuszem współpracy; a filtry w URL-u są jednocześnie odpowiedzią na „gdzie mieszka stan filtrów" (§4.4) |
| **Routing hash** | `HashRouter` | Zero fallbacku SPA po stronie serwera (§9). Design już to zakłada — przykłady w `ANALIZA` są pisane z `#`. Przejście na history API zostaje możliwe i kosztuje `basename` + jedną trasę na serwerze; **nie robimy tego na zapas** |
| **Klawiatura w tabeli** | Wiersz klikalny **plus** prawdziwy `<a href>` w pierwszej komórce | `tr.clickable` z mockupu sam w sobie jest niedostępny z klawiatury i uniemożliwia „kopiuj adres linku" — czyli psuje ten sam scenariusz deep linków, dla którego panel istnieje |
| **`Esc` zamyka szufladę, fokus wraca do wiersza** | Tak | Szuflada istnieje po to, żeby nie tracić kontekstu listy (`ANALIZA` §3). Bez powrotu fokusu traci go użytkownik klawiatury |
| **`/` ustawia fokus w wyszukiwarce** | Tak | Jeden skrót, odkrywalny z placeholdera |
| **`:focus-visible`** | Tak — **brakuje w `SZABLON.html`**, więc dochodzi do szablonu razem z pierwszym ekranem | Panel jest nawigowany klawiaturą (tabele, filtry, formularze), a szablon ma dziś tylko `:focus-within` na `.search` i `.input:focus` |
| **Sortowanie kolumn** | Tak — `th.sortable` jest w szablonie, stan sortowania w URL-u | — |
| **Payload zdarzeń jako TEKST** | Tak, i to jest test bezpieczeństwa (§8) | `ANALIZA` §6 ryzyko 11: payloady to JSON z telefonu z dowolnymi stringami (`notes`, `client`) |

**Świadomie NIE w v1:** paleta poleceń / skróty wielotonowe (nikt ich nie odkryje przy
rytmie „kilka minut rano"), wirtualizacja tabel (paginacja kursorowa jest po stronie
serwera; przy kilkuset wierszach wirtualizacja to komplikacja bez zysku), tryb ciemny/jasny
(§1.6), własne zarządzanie fokusem poza szufladą.

**Znalezisko do rozstrzygnięcia — kontrast `--text-muted`.** Wartość `#7A7A7A` daje wobec
`--bg #0D0D0D` kontrast **4,49:1** (ledwo AA), ale wobec `--surface #141414` — **4,29:1**,
a wobec `--surface-raised #1A1A1A` — **4,05:1**, czyli poniżej progu AA dla tekstu
o normalnym rozmiarze. W panelu tym kolorem pisane są `.cell-sub`, `.tl-meta`, `.kv-k`,
`.label`, `.tile-key` i `.empty-note` — czyli **treść**, nie ozdoba, przy rozmiarach
8,5–9 px i prawie zawsze na `--surface`/`--surface-raised`. Próg AA na `--surface` wypada
przy `#7E7E7E`; komfortowy zapas daje `#8A8A8A` (5,34:1 na `--surface`, 5,04:1 na
`--surface-raised`). Token jest wspólny z telefonem, więc **to decyzja człowieka**, nie
poprawka przy okazji (§11 pkt 2).

---

## 8. Testy: co, czym i czego NIE dublujemy

Podział wg tego, **kto jest właścicielem ryzyka**.

**Serwer (vitest + PGlite + `app.inject`) — i tylko serwer:** rola i rozróżnienie 401/403,
brak trasy robiącej `UPDATE`/`DELETE` na `events` (test architektury po stronie serwera,
`ANALIZA` §6 ryzyko 1), audyt zapisany w tej samej transakcji co zmiana, zgodność liczb
z `projectSession`, paginacja kursorowa, re-eksport po `resolve`, `409` przy wyścigu.
**Panel nie testuje żadnej z tych rzeczy** — testowanie autoryzacji przez UI sprawdza atrapę,
a nie serwer.

**Panel (vitest + jsdom + Testing Library) — cztery rodziny i nic poza nimi:**

| Rodzina | Zawartość | Dlaczego to jest wartościowe |
|---|---|---|
| **Granice warstw** | `admin/test/architecture.test.ts` — tabela z §2.1 + reguły z §2.2, z testem kontrolnym skanera | Reguła bez egzekucji jest życzeniem — doktryna z `architektura-kodu.md` §2 |
| **Moduły czyste ekranów** | `dniFilters` (filtry ↔ query string, w obie strony), `dniRows` (DTO → wiersz, „—" zamiast zera przy dniu otwartym), `dzienTimeline` (kolejność, `voided`, metoda), `can` (zdolność → dostęp + powód) | **Tu leży większość testów panelu, z założenia** — dokładnie jak `statsDay.test.ts`/`cockpitLog.test.ts`/`historyDays.test.ts` w aplikacji. Node, bez DOM, bez sieci |
| **Kontrakt z mockupem** | `tokens.generated.test.ts`, `mockupTokens.test.ts`, `classInventory.test.ts` (§3.3) | Wykonywalna postać reguły „wdrażamy 1:1" |
| **Zachowanie komponentów o realnym ryzyku** | `Drawer` (Esc, powrót fokusu), `DataTable` (sort + link osiągalny z klawiatury), `NavItem.locked` (nieklikalny, **z powodem**), `Banner`/`Timeline` (**payload renderowany jako tekst, nigdy jako HTML**) | Cztery zachowania, których serwer nie może wymusić. Ostatnie jest testem bezpieczeństwa |

**Czego świadomie nie ma:** testów hooków Query na zamockowanym `fetch` (sprawdzają mock),
testów migawkowych ekranów (utrwalają DOM, a specyfikacją jest mockup — pokrywa go rodzina 3),
e2e/Playwright w v1 (dwie osoby, 20 ekranów; dokładamy dopiero, gdy regresja ucieknie przez
wszystkie cztery rodziny — wtedy jako trzy ścieżki, nie jako pakiet).

**Runner: vitest**, nie jest. Serwer już go używa, panel jest zwykłym TS/DOM-em, a jest
w `app/` istnieje z powodów RN, których tu nie ma.

---

## 9. Build i deploy pod `/admin`

Statyczny build serwowany przez `@fastify/static` z tego samego kontenera (`ANALIZA` §5 poz. 18).
Konsekwencje, których nie widać z tego zdania:

- **`base: '/admin/'` w `vite.config.ts`.** Bez tego wszystkie zasoby wskazują `/assets/*`
  i dostają 404 pod podścieżką. To najczęstsza awaria tego wariantu deployu.
- **Wyjście: `admin/dist`, serwer wskazuje na nie przez env `ADMIN_DIST_DIR`.**
  Serwer nie trzyma artefaktów cudzego workspace'u w swoim drzewie; obraz Dockera kopiuje
  jeden katalog. `@fastify/static` z `prefix: '/admin/'`.
- **Hash routing = brak fallbacku SPA.** Serwer obsługuje dokładnie `GET /admin/` (index.html)
  i `/admin/assets/*`. Fallback typu „wszystko pod `/admin/*` → index.html" musiałby uważać,
  żeby nie przesłonić zasobów i nie połknąć 404 z API — to realne źródło błędów, którego
  za jeden znak `#` w URL-u po prostu nie kupujemy.
- **Cache: zasoby `immutable`, `index.html` bez cache'u.** Vite hashuje nazwy plików,
  więc `/admin/assets/*` dostaje `Cache-Control: public, max-age=31536000, immutable`,
  a `/admin/index.html` — `no-cache`. Bez tego administrator po wdrożeniu siedzi na starym
  bundlu i zgłasza błędy z wersji, która już nie istnieje.
- **Zero konfiguracji CORS i zero `API_BASE_URL` w panelu.** Ten sam origin ⇒ ścieżki
  względne (`fetch('/admin/sessions?…')`), ciasteczko `HttpOnly; Secure; SameSite=Strict`
  działa bez `SameSite=None`. To jest cała przewaga tego wariantu i nie wolno jej zmarnować
  własnym `apiBaseUrl` (w `app/` ten plik istnieje właśnie dlatego, że telefon jest **innym**
  originem).
- **Dev: `server.proxy` w Vite** dla `/admin/*` na port serwera. Inaczej pierwszego dnia ktoś
  zobaczy CORS w devie i „naprawi" go, dokładając CORS do serwera — a to pojedzie na produkcję.
- **CSRF: własny nagłówek na mutacjach** (np. `X-UZ-Admin: 1`), wymagany przez trasy `/admin/*`
  przy metodach innych niż `GET`. Nagłówka niestandardowego nie da się wysłać cross-origin bez
  preflightu, więc razem z `SameSite=Strict` to wystarczy; tabeli tokenów CSRF nie zakładamy.
- **CSP `default-src 'self'`.** Panel renderuje payloady zdarzeń pochodzące z telefonów; build
  Vite nie potrzebuje `unsafe-inline`, więc nagłówek jest tani i zamyka klasę eskalacji XSS.
- **Fonty self-hostowane** (`admin/public/fonts/*.woff2` + `@font-face` w `base.css`).
  Mockupy ciągną Google Fonts z CDN, ale panel bywa uruchamiany w sieci klubowej: brak
  `JetBrains Mono` to inna szerokość każdej kolumny liczbowej, czyli **zmiana układu tabel**,
  a nie kosmetyka. Aplikacja bundluje fonty przez `@expo-google-fonts` — to samo rozstrzygnięcie.

---

## 10. Kolejność wdrażania

Każdy krok zakłada poprzednie. Kroki 1–2 są niewidoczne dla użytkownika i odblokowują resztę.

| # | Krok | Warunek wejścia / uwaga |
|---|---|---|
| 0 | **Serwer: sesja przeglądarkowa + `GET /admin/me` + tabela audytu** (`ANALIZA` §5 poz. 3–4; rola z poz. 1–2 jest **zrobiona**) | Bez tego panel nie ma się czym zalogować. Razem z tym: rate-limit na `/auth/*` (poz. 16 — priorytet podniesiony właśnie przez panel) |
| 1 | **`packages/tokens`**: przeniesienie `tokens.ts` + `tone.ts`, shimy w `app/`, `themeCssVars`, `tokens.css`, `tokens.generated.test.ts`, `mockupTokens.test.ts` | Zero zmian wizualnych w aplikacji; `npx jest` i `npx tsc --noEmit` w `app/` muszą przejść bez zmian w 85 plikach |
| 2 | **`packages/format`**: przeniesienie, shim w `app/`, **usunięcie luster z `daySheetContent.ts`** | Wymaga decyzji `6:39` vs `06:39` (§11 pkt 1) — inaczej przenosimy rozjazd zamiast go zamknąć |
| 3 | **Szkielet `admin/`**: workspace, Vite (`base`, proxy), `HashRouter`, `AppShell`/`Sidebar`/`Topbar` z `SZABLON.html`, logowanie (A00/A00a), `NoAccess`, `architecture.test.ts`, `classInventory.test.ts` | Pierwszy wdrażalny artefakt: rama, logowanie i pusty pulpit. Sidebar od tej chwili identyczny wszędzie |
| 4 | **Biblioteka komponentów panelu** — 24 komponenty, dokładane paczkami pod dwa pierwsze ekrany, nie „na zapas" | Każdy komponent = plik `.tsx` + plik `.css` o tych samych klasach co szablon |
| 5 | **A02 dni + A02a dzień (tylko odczyt)** | Najcięższa ścieżka odczytu: `DataTable`, `Timeline`, `KeyValue`, paginacja kursorowa, reguły typowania i formatów w praktyce. Wymaga serwera poz. 8 i 14 |
| 6 | **A03 flagi + A03a flaga + `resolve`** — pierwsza mutacja | Wzorzec unieważniania z §4.3 i ślad audytowy; wymaga serwera poz. 10 |
| 7 | **A01 pulpit + A01a cisza** | Po listach, bo pulpit do nich linkuje; wcześniej musi zapaść decyzja o 27 klasach własnych (§11 pkt 3) |
| 8 | **A04 zdarzenia · A05 eksporty · A06/A06a konta · A07/A07a flota · A09 audyt · A10 statystyki** | Kolejność wg §5 ANALIZA; statystyki dopiero po rozszerzeniu `contract.test.ts` o nowe endpointy |
| 9 | **A02b korekta administracyjna** | Najcięższa operacja (`ANALIZA` §5 poz. 7, wycena L) i jedyna zmieniająca liczby dokumentu klubu — po tym, jak reszta panelu jest sprawdzona w boju |
| 10 | **A08 progi · A11 konserwacja** | Zależą od pozycji serwera 14/15/19; A08 jest w większości odczytem |

---

## 11. Do decyzji człowieka

1. **`6:39` czy `06:39`?** Block time ma dziś dwa zapisy: `duration()` w aplikacji
   (mockupy 09/10/11) i `hhmm()` w `daySheetContent.ts` (karta arkusza, która wg §4.7
   *jest* treścią tych ekranów). Panel będzie pokazywał obie wielkości na sąsiednich
   ekranach. Trzeba wskazać kanon przed krokiem 2 — i przyjąć, że karty wyeksportowane
   wcześniej mają ten drugi zapis.
2. **Podnieść `--text-muted` z `#7A7A7A`?** Na `--surface` daje 4,29:1, na `--surface-raised`
   4,05:1 — poniżej AA dla tekstu 8,5–9 px, którym w panelu pisana jest treść (`.cell-sub`,
   `.tl-meta`, `.kv-k`, `.label`). Próg AA to `#7E7E7E`, zapas `#8A8A8A`. **Token jest wspólny
   z telefonem**, więc zmiana dotyka też kokpitu — stąd decyzja, a nie poprawka.
3. **Co z 43 klasami własnymi w `A01-pulpit.html` (+27) i `A08-progi.html` (+16)?**
   Awansować do `SZABLON.html` (i wtedy stają się komponentami biblioteki), czy uznać za
   lokalne dla ekranu (i wtedy `classInventory.test.ts` dostaje jawną, uzasadnioną listę
   wyjątków)? Reguła z `CLAUDE.md` mówi „do szablonu"; te dwa pliki jej dziś nie spełniają.
4. **Format pozycji GPS w panelu.** Oś zdarzeń w mockupach pokazuje stopnie dziesiętne
   (`52.1834 N · 21.0442 E`), a aplikacja pokazuje DDM (`50°04.7'N 019°47.1'E`,
   `formatLatLon`) — bo taki format mają mapy i GPS-y pokładowe. Jeden produkt, dwa zapisy
   tej samej pozycji.
5. **Hash czy history API w routingu.** Rekomendacja: hash (zero fallbacku po stronie serwera,
   design już tak pisze linki). Jeśli estetyka adresu ma znaczenie dla właściciela produktu,
   koszt zmiany to `basename` + jedna trasa — ale decyzja powinna zapaść przed krokiem 3,
   bo potem migrują wszystkie wklejone linki.
6. **Czy `server/src/domain/roles.ts` przenosimy do `@uzaero/domain`?** Panel potrzebuje typu
   `Capability`, żeby wyszarzać pozycje nawigacji z podanym powodem. Wariant minimalny:
   `GET /admin/me` zwraca listę zdolności, a panel porównuje stringi (brak typowania).
   Wariant czysty: mapa ról przenosi się do wspólnej domeny (jest czysta, zero zależności),
   serwer **zostaje jedynym egzekutorem**, panel dostaje typ. Rekomendacja: wariant czysty.
7. **Potwierdzenie: panel na jednym motywie.** Wynika z `ANALIZA` §7 i tak to projektuję
   (§1.6), ale to bezpośrednia odpowiedź na pytanie „co się dzieje z pięcioma motywami" —
   warto, żeby padło wprost, bo od tego zależy, czy `admin/src/styles` ma jeden blok `:root`,
   czy pięć.

---

*Aktualizuj przy zmianie granic warstw panelu, zawartości pakietów wspólnych albo reguł
z §3.3. Reszta jest opisana testami.*
