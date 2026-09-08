---
name: wydanie
description: Przeprowadza wydanie UZ Aero - rozstrzyga, czy wystarczy aktualizacja OTA, czy trzeba nowy APK, podnosi wersję, przepisuje changelog, publikuje APK na stronie pobierania i domyka merge do main. Używaj tego skilla ZAWSZE, gdy pada „wydanie", „nowa wersja", „podnieś wersję", „wypuść to", „zbuduj APK", „build produkcyjny", „aktualizacja OTA", „eas update", „nowy build dla testerów", a także gdy trzeba zaktualizować docs/CHANGELOG.md albo link do pobrania - również wtedy, gdy użytkownik nie nazywa tego wydaniem, tylko prosi o „wypuszczenie poprawki do pilotów".
---

# Wydanie UZ Aero

Wydanie w tym projekcie ma **dwie zupełnie różne postacie**, a pomylenie ich jest
najdroższym błędem w całej procedurze: niepotrzebny APK kosztuje wszystkich testerów
ręczną reinstalację, a aktualizacja OTA wypuszczona zamiast builda po prostu do nich
nie dojedzie — i nikt tego nie zauważy.

Zacznij więc od rozstrzygnięcia, a nie od podnoszenia wersji.

## Gałęzie: skąd wolno wydawać (obieg od 2026-09-08)

```
feature-… → develop → ninerdeck_x_x_x → main        (wydanie planowe)
hotfix-…  → main → develop                          (poprawka dla obecnych telefonów)
```

- **`develop` to gałąź integracyjna**, a od milestone „Wielofirmowość + SaaS" leży na niej
  niedokończona praca nad kolejną wersją. **Nigdy nie buduj APK ani nie wysyłaj OTA
  z `develop`** - wypuściłbyś pilotom pół przebudowy.
- **`ninerdeck_x_x_x` to gałąź wydaniowa**: dostaje zawartość `develop`, gdy zakres jest
  domknięty, i od tej chwili przyjmuje wyłącznie stabilizację (podbicie wersji, changelog,
  poprawki z testów wydania). Build produkcyjny robi się z NIEJ, po commicie z wersją.
- **`main` = produkcja**: merge gałęzi wydaniowej do `main` wdraża serwer, panel i stronę
  (Railway) i domyka wydanie. Zaraz po nim zmerguj `main` → `develop`, żeby poprawki ze
  stabilizacji nie zginęły.
- **Poprawka dla telefonów, które JUŻ mają aplikację**, nie może przejść przez `develop`.
  Jedzie gałęzią `hotfix-…` odciętą od `main`, wraca do `main` PR-em, wychodzi jako OTA
  (ścieżka A) z checkoutu `main`, a potem `main` merguje się do `develop`.
- Sprawdzenie na początku każdego wydania: `git branch --show-current`. Jeśli stoisz na
  `develop`, zatrzymaj się i zapytaj, czy to wydanie planowe (wtedy gałąź wydaniowa)
  czy hotfix (wtedy gałąź od `main`).

Nazwa gałęzi wydaniowej niesie numer wersji z podkreśleniami; numer i termin podaje
właściciel projektu, jak w planie wydań. **Gałęzie wydaniowe zostają po wydaniu** jako
zapis każdej wersji, nie kasuje się ich: `ninerdeck_1_0_0` = pierwsze wydanie (stan
`main` z 2026-09-08, binarka „1.1.0 (build 2)"), `ninerdeck_2_0_0` = gałąź milestone
„Wielofirmowość + SaaS 2.0.0". Gałąź milestone wolno założyć na początku prac; treść
z `develop` dostaje przy stabilizacji.

## Krok 0: OTA czy nowy APK?

Przejrzyj, co weszło od ostatniego wydania (`git log --oneline origin/main..HEAD`
z gałęzi wydaniowej albo hotfixu) i odpowiedz na JEDNO pytanie: czy zmieniła się
warstwa natywna.

| Co się zmieniło | Droga |
| --- | --- |
| Ekrany, teksty, arkusze, reguły domeny, `packages/*` | **OTA** |
| `EXPO_PUBLIC_*`, np. adres API | **OTA** — te zmienne są wkompilowane w bundle, a `eas update` buduje nowy |
| Nowy pakiet `expo-*` albo `react-native-*` | **APK** |
| `app.json`: uprawnienia, `scheme`, `package`, `plugins`, ikony | **APK** |
| Podbicie SDK Expo albo React Native | **APK** |

Reguła kciuka: jeśli zmiana dotyka czegokolwiek, co prebuild wpisuje do projektu
natywnego, to APK. W razie wątpliwości wybierz APK — zła OTA jest niewidoczna,
a niepotrzebny APK tylko kosztuje.

**Serwer, panel i strona nie są częścią tej decyzji.** Jadą własnym torem: push do
`main` przebudowuje obraz na Railway, aplikacji pilota to nie dotyka.

---

## Ścieżka A: aktualizacja OTA

Najkrótsza droga i domyślna po rozpoczęciu testów z pilotami.

1. Sprawdzenia: w `app/` `npx jest` i `npx tsc --noEmit`. Jeśli ruszałeś `packages/*`,
   dołóż `npx vitest run` i `npx tsc --noEmit` w `server/` oraz `admin/`.
2. Dopisz punkt do sekcji `## W przygotowaniu` w `docs/CHANGELOG.md` — językiem korzyści
   dla pilota, nie opisem commita (patrz „Changelog" niżej).
3. Zacommituj i doprowadź zmianę do `main`: hotfix PR-em `hotfix-…` → `main`, wydanie
   planowe przez gałąź wydaniową → `main` (sekcja „Gałęzie" wyżej).
4. Z checkoutu `main` (`git checkout main && git pull`):
   `npm run update:prod -- -m "krótki opis zmiany"`
5. Zmerguj `main` → `develop`.

OTA pakuje **lokalne drzewo** jak build, więc wysłana z `develop` zaniosłaby pilotom
niedokończoną pracę nad następną wersją - i to bez reinstalacji, przy następnym
uruchomieniu. Dlatego krok 4 stoi na `main`, nie „gdziekolwiek, byle zacommitowane".

Aktualizacja dociera do telefonów o **tym samym numerze wersji**
(`runtimeVersion: appVersion`, czyli `version` z `app/app.json`). Pobiera się w tle
i wchodzi przy **następnym uruchomieniu** aplikacji — nie natychmiast, i tak ma być:
start nigdy nie czeka na sieć.

**Przy ścieżce OTA nie podnoś `version`.** Numer wersji jest kluczem aktualizacji, więc
podbity bez nowego APK wysłałby ją do wersji, której nikt nie ma na telefonie.

Powiedz to użytkownikowi wprost. Inaczej sprawdzi telefon od razu, nie zobaczy zmiany
i uzna, że wydanie nie zadziałało.

**Jeśli OTA nie dochodzi do części telefonów**, prawie zawsze mają starszą binarkę
o innym numerze wersji. To zachowanie poprawne, nie usterka: aktualizacja należy do
linii APK, dla której powstała. Wtedy ścieżka B.

---

## Ścieżka B: nowy APK

Dłuższa, wymaga uwagi w czterech miejscach. Kolejność ma znaczenie.

Stań na gałęzi wydaniowej (`ninerdeck_x_x_x`) z wmergowanym `develop`, albo na gałęzi
hotfixu od `main`, jeśli APK jest poprawką dla obecnej linii. Nie na `develop`.

### 1. Podnieś wersję

```bash
node .claude/skills/wydanie/scripts/bump-release.mjs --dry-run
```

Skrypt bierze numer następnego wydania z **pierwszego kamienia milowego** sekcji
`## Plan wydań` w `docs/CHANGELOG.md` i pokazuje, co zmieni. Bez `--dry-run` wykonuje:

- `app/app.json` — `version` na numer z planu, `android.versionCode` +1
- `docs/CHANGELOG.md` — `## W przygotowaniu` staje się `## <wersja> (build <N>) · <data>`,
  nad nią powstaje nowa pusta `## W przygotowaniu`, a zrealizowany kamień milowy znika z planu

`versionCode` **musi** rosnąć: `appVersionSource` w `eas.json` to `local`, więc EAS czyta
numer builda wprost z `app.json`, a „build N" w changelogu i na stronie pobierania to
właśnie ta liczba. Dwa buildy o tym samym numerze są nierozróżnialne w zgłoszeniach
błędów — a to jedyne, co masz, gdy pilot przyśle uwagę z terenu.

Numer wersji **bierze się z planu, nie z głowy**. Jeśli plan jest pusty albo pierwszy
kamień milowy nie pasuje do tego wydania, zapytaj użytkownika — numery i terminy podaje
właściciel projektu.

### 2. Sprawdź SHA-1, zanim spalisz kwadrans

```bash
cd app && npx eas-cli credentials
```

Android → profil `production` → Keystore → **SHA-1 Fingerprint**. Musi zgadzać się
z klientem **Android** w Google Cloud (przy pakiecie `com.tomekklag.uzaero`).

To jedyna rzecz w tej procedurze, która psuje się cicho: build przechodzi, APK się
instaluje, a logowanie Google odbija dopiero na telefonie pilota. Klient OAuth wiąże
JEDEN pakiet z JEDNYM odciskiem, więc rozjazd nie naprawi się sam.

### 3. Zbuduj i opublikuj

```bash
npm run build:prod
```

EAS pakuje **lokalne drzewo**, nie gałąź — zacommituj przed buildem, inaczej łatwo
zbudować stan sprzed podbicia wersji. Z tego samego powodu sprawdź `git branch
--show-current`: drzewo z `develop` zbuduje się równie chętnie, tylko z niewłaściwą
zawartością. Kilkanaście minut.

Gdy build ma status **finished**:

```bash
node site/tools/update-download.mjs --release
```

Skrypt szuka skończonego builda produkcyjnego (bez niego rzuci błędem), ściąga APK,
publikuje jako GitHub Release `android-v<wersja>-<build>` w `tomaszklag/uz_aero`
i przepisuje `site/src/pobierz/index.html` na trwały adres
`releases/latest/download/uzaero.apk`.

**Flaga `--release` nie jest w praktyce opcjonalna.** Bez niej strona kieruje wprost na
artefakt EAS, a te wygasają po kilku tygodniach — build z 16 sierpnia 2026 zwracał 404
już 6 września i strona pobierania była martwa, nie dając po sobie znaku.

### 4. Wypuść stronę

```bash
npm run site
```

Obejrzyj `site/dist/wydania/index.html`, zacommituj (podbicie wersji, changelog, nowy
link) na gałęzi wydaniowej i zmerguj ją do `main` PR-em; przy hotfixie - gałąź hotfixu
do `main`. Po merge: `main` → `develop`, żeby podbita wersja, changelog i link do
pobrania wróciły na gałąź integracyjną - inaczej następne wydanie zacznie się od
starego numeru i nadpisze changelog.

**Dopiero merge publikuje stronę pobierania.** Strona jedzie w obrazie serwera, więc sam
GitHub Release jej nie zmienia — `/pobierz/` pokaże nowy plik po przebudowie na Railway.
To najczęstsze zaskoczenie w tej procedurze: APK istnieje, a link prowadzi do starego.

Po wdrożeniu sprawdź: `/health`, `/`, `/pobierz/`, `/wydania/`, `/dokumentacja/`, `/admin/`.

---

## Changelog

`docs/CHANGELOG.md` jest **źródłem strony wydań** — renderuje go
`site/tools/render-changelog.mjs`, a format jest świadomie wąski. Piszesz dla pilotów,
testerów i klubów: językiem korzyści, bez nazw plików, identyfikatorów i numerów issue.

```
## W przygotowaniu          ← to, co weszło do kodu od ostatniego builda
> jedno zdanie o wydaniu    ← opcjonalnie, tuż pod nagłówkiem
### Nowości / ### Poprawki / ### Dla testerów
- punkt (**pogrubienie**, `kod`, [link](url))

## Plan wydań               ← moduł „Co dalej", nie jest wydaniem
### 1.2.0 · po pierwszych tygodniach testów
- [x] gotowe · [~] w toku · [ ] w planach
```

Sekcja `## W przygotowaniu` rośnie razem z PR-ami — każda zmiana widoczna dla użytkownika
dopisuje punkt. Przy wydaniu dostaje nagłówek z wersją i datą.

**„Dla testerów" jest miejscem na ostrzeżenia**: czy wydanie wymaga ponownej instalacji,
co przestaje działać, na co zwrócić uwagę. Przy nowym APK napisz tam wprost, że trzeba
przeinstalować — pilot nie ma skąd tego wiedzieć.

---

## Pułapki, które już raz kosztowały

- **Build albo OTA z `develop` wysyła pilotom niedokończoną wersję.** Do 2026-09-08
  `develop` był stanem gotowym do wydania i procedura kończyła się merge `develop` →
  `main`; odkąd leży na nim przebudowa wielofirmowa, wydanie idzie przez gałąź wydaniową,
  a poprawki dla obecnych telefonów przez hotfix od `main` (sekcja „Gałęzie").
- **Serwer nie wstanie bez `GOOGLE_WEB_CLIENT_ID`** (walidacja `z.string().min(1)`
  w `server/src/index.ts`). Jeśli wydanie dotyka Railway, a zmiennej nie ma, padnie
  wszystko naraz: strona, panel i API.
- **Testerzy muszą być na liście Test users** w ekranie zgody Google. W trybie Testing
  nikt spoza listy nie zaloguje się ani w aplikacji, ani w panelu.
- **Zgłoszenia błędów niosą `updateId`**, więc po aktualizacji OTA da się rozpoznać, która
  wersja JS naprawdę działała. Wersja binarki („1.1.0 (build 2)") już tego nie rozstrzyga.
- **Moduł natywny dołożony bez nowego APK wywraca stare telefony.** `runtimeVersion`
  to `appVersion`, więc nic nie sprawdza tego za Ciebie: aktualizacja pójdzie do
  wszystkich aplikacji o tym numerze wersji, także tych bez nowego kodu natywnego.
  Dlatego decyzja z kroku 0 jest pierwsza, a nie ostatnia.
- **Polityka `fingerprint` była próbowana i nie działa w tym monorepo** (2026-09-07):
  odcisk powstaje w 180 ze 190 źródeł z hoistowanego `node_modules` czterech
  workspace'ów, serwer EAS odtwarza go inaczej i build pada na „Runtime version
  calculated on local machine not equal to runtime version calculated during build".
  Nie wracaj do niej bez rozwiązania tamtego problemu.

## Czego ten skill nie robi

Nie wdraża serwera ani panelu — to osobny tor (`main` → Railway), opisany w README
w sekcji „Wdrożenie: Railway". Jeśli pytanie dotyczy zmiennych środowiskowych, bazy
produkcyjnej albo konfiguracji Google Cloud, odeślij tam zamiast improwizować.
