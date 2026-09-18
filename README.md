# Ninerdeck

Elektroniczny chronometraż lotów: aplikacja Android (React Native + Expo), backend
(Fastify + PostgreSQL) i wspólna domena. Monorepo npm workspaces.

```
app/              aplikacja mobilna (Expo)
admin/            panel administracyjny (web: React + Vite)
server/           backend (auth, sync zdarzeń, flagi, API panelu)
packages/domain   wspólna domena - zdarzenia, reguły, projekcje
packages/tokens   tokeny designu (palety, skale, typografia, emiter zmiennych CSS)
packages/format   wspólne formatowanie liczb domeny na napisy
docs/             architektura systemu i kodu (i źródła podręcznika: docs/podrecznik/)
design/           mockupy HTML = specyfikacja ekranów
site/             strona publiczna: landing, pobieranie, wydania, dokumentacja
```

## Pierwsze uruchomienie

```bash
npm run setup
```

(instaluje zależności i tworzy `server/.env` z `server/.env.example` - wartości dev
możesz zostawić, na produkcji zmień `JWT_SECRET`, `GOOGLE_CLIENT_IDS` i `SEED_ADMIN_EMAIL`).

## Codzienna praca

| Polecenie | Co robi |
|---|---|
| `npm run app` | Metro bundler - telefon z dev clientem łapie go sam / QR |
| `npm run server` | backend na `http://localhost:3000` (watch) |
| `npm run admin` | panel na `http://localhost:5173/admin/` (proxy `/admin/api` → serwer; **wymaga uruchomionego serwera**) |
| `npm run site` | strona publiczna do `site/dist` (landing, wydania, podręcznik z żywymi ekranami) - otwórz `site/dist/index.html` albo wejdź na `http://localhost:3000/` przy uruchomionym serwerze |
| `npm run db:up` | Postgres w Dockerze (tworzy kontener przy pierwszym razie) |
| `npm run db:down` | zatrzymanie bazy |
| `npm run seed` | migracje + konto administratora (`admin`, BEZ hasła - podpina się kontem Google z `SEED_ADMIN_EMAIL`) |
| `npm test` | wszystkie testy: aplikacja (Jest) + serwer (Vitest na PGlite) |
| `npm run typecheck` | TypeScript w całym repo |
| `npm run android` | przebudowa dev clienta (telefon po USB) - tylko po zmianie modułów natywnych (ostatnio: `expo-task-manager` + plugin `expo-location` dla usługi GPS w tle, 2026-08-03) |

Kolejność przy pracy z serwerem: `db:up` → `seed` (raz) → `server`.

Seed zakłada wyłącznie konto administratora (issue #50 - przygotowanie testów
z pilotami): flotę i konta pilotów zakłada administrator w panelu (`npm run admin`,
ekrany A06/A07). Świeży świat = `docker rm -f ninerdeck-pg` → `db:up` → `seed`.
Dane demo zostały usunięte w całości; generator (`server/scripts/demo/`) jest
w historii gita, gdyby kiedyś wrócił temat syntetycznych danych do kalibracji.

Szybki sprawdzian serwera:

```bash
curl -s -X POST localhost:3000/auth/login -H "content-type: application/json" -d '{"login":"admin","password":"test1234"}'
```

## Wdrożenie: Railway

Jeden obraz Dockera (`Dockerfile` w korzeniu) niesie trzy rzeczy: **API**, **statyczny
build panelu** (`/admin/` - ten sam origin co API, więc ciasteczko `SameSite=Strict` działa
jak w dev za proxy Vite) i **stronę publiczną** pod `/` (landing, pobieranie, wydania,
dokumentacja; od 2026-09-07 - wcześniej GitHub Pages w osobnym repozytorium, patrz
`site/README.md`). Na produkcji strona stoi na WŁASNYM hoście (`ninerdeck.pl`), a panel
i API na drugim (`app.ninerdeck.pl`) - rozdział egzekwuje serwer
(`server/src/http/hostSplit.ts`, issue #124), bo dwie domeny wskazujące na jedną usługę
same niczego nie rozdzielają. Konfiguracja buildu i healthcheck: `railway.json`.

1. **Projekt**: railway.com → New Project → Deploy from GitHub repo (`uz_aero`).
   Railway wykryje `Dockerfile` przez `railway.json`.
2. **Postgres**: w projekcie „Create → Database → PostgreSQL".
3. **Zmienne serwisu** (zakładka Variables usługi z repo):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referencja do usługi Postgres),
   - `JWT_SECRET` = losowe ≥32 znaki,
   - `TRUST_PROXY` = `1` (serwer stoi za proxy TLS Railway; bez tego dziennik audytu
     widzi adres proxy zamiast człowieka),
   - `PUBLIC_BASE_URL` = `https://app.ninerdeck.pl` (adres panelu i API - baza linków do
     kart arkusza klikanych z telefonu; po kroku 5),
   - `PUBLIC_SITE_URL` = `https://ninerdeck.pl` (adres strony; włącza rozdział hostów.
     Bez niej wszystko stoi pod jednym hostem; z nią serwer NIE WSTANIE, gdy brakuje
     `PUBLIC_BASE_URL` albo oba adresy wskazują ten sam host),
   - `MAIL_PROVIDER` = `resend` (od 2.1.0 WYMAGANY - bez niego serwer nie wstaje): poczta
     wychodząca dla linków „ustaw hasło" (`docs/logowanie-haslem.md` §5.4). Wartość `log`
     drukuje list do logu serwera - dobre w dev, na produkcji byłoby tokenem linku poza
     pocztą,
   - `MAIL_API_KEY` i `MAIL_FROM` (np. `Ninerdeck <konto@ninerdeck.pl>`) - WYMAGANE przy
     `resend`, komplet albo serwer nie wstaje (krok 7),
   `TRACES_DIR` jest ustawiony w obrazie - nie podawaj go; build panelu i stronę serwer
   znajduje sam (ścieżki wbudowane w obraz).
4. **Wolumen na ślady GPS**: usługa → prawy przycisk → Attach Volume, mount path **`/data`**.
   Telefon kasuje nagranie po wysyłce (issue #47) - kopia na serwerze jest JEDYNĄ,
   bez wolumenu ginie przy każdym deployu.
5. **Domeny**: Settings → Public Networking → „+ Custom Domain" (port 3000) -
   `app.ninerdeck.pl` i `ninerdeck.pl`. Railway podaje dla każdej DWA rekordy DNS, CNAME
   i TXT, i wymaga obu. Apex `ninerdeck.pl` potrzebuje u dostawcy DNS CNAME flattening
   albo rekordu ALIAS (Railway nie daje rekordu A); gdy rejestrator tego nie ma -
   nameservery na Cloudflare (przy włączonym proxy SSL/TLS = **Full**, nie Full strict).
   Plan Hobby dopuszcza dwie domeny na usługę, czyli dokładnie te dwie - `www` odpada.
   Certyfikat wystawia się do godziny od propagacji DNS. Domenę wygenerowaną przez
   Railway można potem usunąć - kod jej nie potrzebuje.
6. **Logowanie Google** (`docs/logowanie-google.md`): w Google Cloud załóż projekt,
   ekran zgody OAuth i identyfikatory klienta - **Web** (panel + weryfikacja `aud`)
   oraz **Android** (package `com.ninerdeck.app` + odcisk SHA-1 z poświadczeń EAS).
   Wpisz je jako `GOOGLE_WEB_CLIENT_ID` (WYMAGANY - loguje się nim panel) i
   `GOOGLE_ANDROID_CLIENT_ID` (od builda aplikacji z Google); **bez pierwszego serwer
   nie wstanie** (pusty zbiór odbiorców przepuszczałby każdy token Google).
   Klient Web musi mieć origin panelu `https://app.ninerdeck.pl` w „Authorized JavaScript
   origins" - bez tego skrypt Google nie narysuje przycisku. Ekran zgody pyta o adres
   polityki prywatności i regulaminu - `https://ninerdeck.pl/prywatnosc.html`
   i `https://ninerdeck.pl/regulamin.html` - a `ninerdeck.pl` musi być na liście
   **Authorized domains**, co wymaga potwierdzenia własności w Search Console (właściwość
   „Domena", rekord TXT w DNS). To był argument za własną domeną: adres wygenerowany
   przez hosting trzeba by weryfikować plikiem, a przy każdej zmianie hostingu - od nowa.
7. **Poczta wychodząca** (Resend; issue #137) - bez niej nie działa „Nie pamiętam hasła",
   zaproszenie pierwszego administratora klubu ani rejestracja e-mailem, a serwer 2.1.0
   nie wstaje:
   1. resend.com → **Domains → Add Domain** → `ninerdeck.pl` (region EU - Irlandia).
      Resend wypisze rekordy dla poddomeny wysyłkowej (`send` - ścieżka zwrotna i SPF)
      oraz klucz DKIM (`resend._domainkey`). Kształt bierz Z JEGO EKRANU, nie stąd:
      dostawca przestawiał już infrastrukturę i raz podaje CNAME, raz parę MX + TXT.
   2. W Cloudflare (DNS domeny) dodaj je **dokładnie tak, jak podaje Resend**, z ikoną
      chmurki **DNS only** (proxy Cloudflare dotyczy HTTP i psułoby pocztę). Nazwy skracaj
      do części przed `ninerdeck.pl` - Cloudflare dokleja domenę sam (wklejenie pełnej
      nazwy daje `send.ninerdeck.pl.ninerdeck.pl`).
   3. Dołóż **DMARC**: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:<twój adres>`.
      `p=none` na start (samo raportowanie); zaostrzenie do `quarantine` dopiero, gdy
      raporty potwierdzą, że wysyłamy wyłącznie przez Resend.
   4. W Resend **Verify DNS Records** (zwykle minuty, do 72 h) → **API Keys → Create**,
      uprawnienie **Sending access**. Klucz widać RAZ - od razu do Railway.
   5. Zmienne usługi: `MAIL_PROVIDER=resend`, `MAIL_API_KEY=re_…`,
      `MAIL_FROM=Ninerdeck <konto@ninerdeck.pl>`.
   6. **Próba doręczenia**: po wdrożeniu „Nie pamiętam hasła" na własny adres - list ma
      wpaść do folderu głównego, nie do spamu. W Resend → Emails widać status doręczenia.
   Wariant awaryjny (weryfikacja domeny się opóźnia): Resend pozwala zweryfikować sam
   adres nadawcy - działa, ale dostarczalność jest gorsza i nie jest to stan do wydania.
8. **Seed konta `admin`**: dopisz `SEED_ADMIN_EMAIL` - ADRES KONTA GOOGLE administratora.
   Serwer przy starcie zapewni konto `admin` BEZ hasła, a Twoje pierwsze logowanie tym
   kontem Google je PODPINA (idempotentnie: powtórny start nie zrywa podpięcia, dokłada
   najwyżej rolę admin). Baza staje **od zera** (decyzja 2026-09-05), więc poza
   `admin` nie ma kont do przeniesienia: piloci zgłaszają się z aplikacji i czekają na
   zatwierdzenie w A06, a konto założone wcześniej w A06 z adresem Google pilota
   podpina się przy jego pierwszym logowaniu bez kolejki.
   Alternatywa bez redeployu (wymaga TCP Proxy na usłudze Postgres): lokalnie
   `$env:SEED_ADMIN_EMAIL='…'; $env:DATABASE_URL='<DATABASE_PUBLIC_URL>'; npm run seed`.
9. **Sprawdzian**: `https://app.ninerdeck.pl/health` → `{"ok":true}`; `https://ninerdeck.pl/`
   → strona (landing, `/pobierz/`, `/wydania/`, `/dokumentacja/`);
   `https://app.ninerdeck.pl/admin/` → logowanie panelu kontem Google z kroku 8. Rozdział
   hostów: `https://ninerdeck.pl/admin/` odsyła na host aplikacji, `https://app.ninerdeck.pl/`
   odsyła na `/admin/` (korzeń hosta aplikacji jest wejściem panelu),
   `https://app.ninerdeck.pl/pobierz/` odsyła na stronę, a `https://ninerdeck.pl/admin/api/me`
   odpowiada 404. Flotę i konta pilotów załóż w panelu.
10. **Aplikacja pilota**: adres serwera i klient Google stoją w `eas.json` →
    `build.production.env` (`EXPO_PUBLIC_API_URL=https://app.ninerdeck.pl`,
    `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` z kroku 6; czyta je
    `app/src/infrastructure/api/apiBaseUrl.ts`). To JEDYNE źródło tych wartości dla
    telefonów pilotów: build czyta je sam, a `npm run update:prod` wstrzykuje je do
    `eas update`, które pola `env` z `eas.json` nie zna (`app/scripts/eas-update.js`).
    Lokalny `app/.env` służy wyłącznie Metro w dev i do telefonów nie trafia.
    **Kolejne poprawki nie wymagają już builda**: od 1.1.0 aplikacja ma EAS Update, więc
    zmiany w JS (ekrany, reguły, `packages/*`) wypuszcza się przez `npm run update:prod`
    i docierają same przy następnym uruchomieniu. Nowy APK dopiero przy zmianie NATYWNEJ -
    szczegóły i pułapki w `CLAUDE.md`, sekcja o aktualizacjach OTA.
11. **Procedura awaryjna - hasło, gdy Google I poczta padły** (od 2.1.0,
    `docs/logowanie-haslem.md` §5.4, §8 pkt 12): z konsoli serwera (Railway → usługa → Shell,
    albo lokalnie z `DATABASE_URL` = `DATABASE_PUBLIC_URL` i `PUBLIC_BASE_URL`)
    `npm run seed -- --reset-link <e-mail osoby>` DRUKUJE na stdout link `/haslo/#…` ważny
    72 h - ten sam, który normalnie idzie pocztą. Przekaż go bezpiecznym kanałem; po
    ustawieniu hasła wszystkie dotychczasowe sesje tej osoby zostają wylogowane. W drugą
    stronę (zapomniane hasło superadministratora): „Nie pamiętam hasła" w panelu, Google
    z tym samym adresem albo ta sama komenda. Kodów jednorazowych do dyktowania NIE MA.

Koszt: plan Hobby (5 USD/mies. z wliczonym zużyciem) zwykle wystarcza na serwer + bazę
przy ruchu klubowym. Strona nie dokłada usługi ani buildu, ale jej transfer idzie odtąd
przez Railway - dlatego **APK zostaje na GitHub Releases** (`site/README.md`), a nie
w obrazie. Backup: rejestr jest append-only i jest jedynym źródłem - ustaw
w Railway backupy Postgresa albo cykliczne `pg_dump` po `DATABASE_PUBLIC_URL`.

## Zasady

- Mockupy w `design/` są specyfikacją - ekran wdraża się 1:1 (`CLAUDE.md`).
- Architektura kodu i przepisy na nowe elementy: `docs/architektura-kodu.md`.
- Po zmianach w `app/`: `npx jest` i `npx tsc --noEmit` muszą przechodzić;
  w `server/` i `admin/`: `npx vitest run` i `npx tsc --noEmit`.
  Zmiana w `packages/*` dotyka wszystkich trzech - uruchom każdy zestaw.
- `admin/src/styles/tokens.css` jest GENEROWANY: po zmianie palety w `packages/tokens`
  uruchom `npm run tokens:css --workspace admin` (inaczej test zgodności świeci na czerwono).
