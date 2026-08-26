# UZ Aero

Elektroniczny chronometraż lotów: aplikacja Android (React Native + Expo), backend
(Fastify + PostgreSQL) i wspólna domena. Monorepo npm workspaces.

```
app/              aplikacja mobilna (Expo)
admin/            panel administracyjny (web: React + Vite)
server/           backend (auth, sync zdarzeń, flagi, API panelu)
packages/domain   wspólna domena — zdarzenia, reguły, projekcje
packages/tokens   tokeny designu (palety, skale, typografia, emiter zmiennych CSS)
packages/format   wspólne formatowanie liczb domeny na napisy
docs/             architektura systemu i kodu
design/           mockupy HTML = specyfikacja ekranów
```

## Pierwsze uruchomienie

```bash
npm run setup
```

(instaluje zależności i tworzy `server/.env` z `server/.env.example` — wartości dev
możesz zostawić, na produkcji zmień `JWT_SECRET` i `SEED_PASSWORD`).

## Codzienna praca

| Polecenie | Co robi |
|---|---|
| `npm run app` | Metro bundler — telefon z dev clientem łapie go sam / QR |
| `npm run server` | backend na `http://localhost:3000` (watch) |
| `npm run admin` | panel na `http://localhost:5173/admin/` (proxy `/admin/api` → serwer; **wymaga uruchomionego serwera**) |
| `npm run db:up` | Postgres w Dockerze (tworzy kontener przy pierwszym razie) |
| `npm run db:down` | zatrzymanie bazy |
| `npm run seed` | migracje + konto administratora (login `admin`, hasło z `SEED_PASSWORD`) |
| `npm test` | wszystkie testy: aplikacja (Jest) + serwer (Vitest na PGlite) |
| `npm run typecheck` | TypeScript w całym repo |
| `npm run android` | przebudowa dev clienta (telefon po USB) — tylko po zmianie modułów natywnych (ostatnio: `expo-task-manager` + plugin `expo-location` dla usługi GPS w tle, 2026-08-03) |

Kolejność przy pracy z serwerem: `db:up` → `seed` (raz) → `server`.

Seed zakłada wyłącznie konto administratora (issue #50 — przygotowanie testów
z pilotami): flotę i konta pilotów zakłada administrator w panelu (`npm run admin`,
ekrany A06/A07). Świeży świat = `docker rm -f uzaero-pg` → `db:up` → `seed`.
Dane demo zostały usunięte w całości; generator (`server/scripts/demo/`) jest
w historii gita, gdyby kiedyś wrócił temat syntetycznych danych do kalibracji.

Szybki sprawdzian serwera:

```bash
curl -s -X POST localhost:3000/auth/login -H "content-type: application/json" -d '{"login":"admin","password":"test1234"}'
```

## Wdrożenie: Railway

Jeden obraz Dockera (`Dockerfile` w korzeniu) niesie API **i statyczny build panelu**
(`/admin/` — ten sam origin, więc ciasteczko `SameSite=Strict` działa jak w dev za proxy
Vite). Konfiguracja buildu i healthcheck: `railway.json`.

1. **Projekt**: railway.com → New Project → Deploy from GitHub repo (`uz_aero`).
   Railway wykryje `Dockerfile` przez `railway.json`.
2. **Postgres**: w projekcie „Create → Database → PostgreSQL".
3. **Zmienne serwisu** (zakładka Variables usługi z repo):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referencja do usługi Postgres),
   - `JWT_SECRET` = losowe ≥32 znaki,
   - `TRUST_PROXY` = `1` (serwer stoi za proxy TLS Railway; bez tego dziennik audytu
     widzi adres proxy zamiast człowieka),
   - `PUBLIC_BASE_URL` = `https://<domena-uslugi>` (po kroku 5 — linki do kart arkusza
     klikane z telefonu).
   `ADMIN_DIST_DIR` i `TRACES_DIR` są ustawione w obrazie — nie podawaj ich.
4. **Wolumen na ślady GPS**: usługa → prawy przycisk → Attach Volume, mount path **`/data`**.
   Telefon kasuje nagranie po wysyłce (issue #47) — kopia na serwerze jest JEDYNĄ,
   bez wolumenu ginie przy każdym deployu.
5. **Domena**: Settings → Networking → Generate Domain (port 3000). Wpisz ją w
   `PUBLIC_BASE_URL` (krok 3).
6. **Seed** (raz, z własnego komputera): w usłudze Postgres skopiuj publiczny
   `DATABASE_PUBLIC_URL` i uruchom w `server/`:
   `SEED_PASSWORD=<mocne-haslo> DATABASE_URL=<DATABASE_PUBLIC_URL> npm run seed`
   (PowerShell: `$env:SEED_PASSWORD='…'; $env:DATABASE_URL='…'; npm run seed`).
   Migracje i tak wykonują się przy starcie serwera; seed dokłada konto `admin`.
7. **Sprawdzian**: `https://<domena>/health` → `{"ok":true}`, `https://<domena>/admin/`
   → logowanie panelu (`admin` + hasło z kroku 6). Flotę i konta pilotów załóż w A07/A06.
8. **Aplikacja pilota**: build EAS z adresem serwera —
   `EXPO_PUBLIC_API_URL=https://<domena>` (patrz `app/src/infrastructure/api/apiBaseUrl.ts`).

Koszt: plan Hobby (5 USD/mies. z wliczonym zużyciem) zwykle wystarcza na serwer + bazę
przy ruchu klubowym. Backup: rejestr jest append-only i jest jedynym źródłem — ustaw
w Railway backupy Postgresa albo cykliczne `pg_dump` po `DATABASE_PUBLIC_URL`.

## Zasady

- Mockupy w `design/` są specyfikacją — ekran wdraża się 1:1 (`CLAUDE.md`).
- Architektura kodu i przepisy na nowe elementy: `docs/architektura-kodu.md`.
- Po zmianach w `app/`: `npx jest` i `npx tsc --noEmit` muszą przechodzić;
  w `server/` i `admin/`: `npx vitest run` i `npx tsc --noEmit`.
  Zmiana w `packages/*` dotyka wszystkich trzech — uruchom każdy zestaw.
- `admin/src/styles/tokens.css` jest GENEROWANY: po zmianie palety w `packages/tokens`
  uruchom `npm run tokens:css --workspace admin` (inaczej test zgodności świeci na czerwono).
