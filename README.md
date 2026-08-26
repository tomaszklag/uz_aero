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

## Zasady

- Mockupy w `design/` są specyfikacją — ekran wdraża się 1:1 (`CLAUDE.md`).
- Architektura kodu i przepisy na nowe elementy: `docs/architektura-kodu.md`.
- Po zmianach w `app/`: `npx jest` i `npx tsc --noEmit` muszą przechodzić;
  w `server/` i `admin/`: `npx vitest run` i `npx tsc --noEmit`.
  Zmiana w `packages/*` dotyka wszystkich trzech — uruchom każdy zestaw.
- `admin/src/styles/tokens.css` jest GENEROWANY: po zmianie palety w `packages/tokens`
  uruchom `npm run tokens:css --workspace admin` (inaczej test zgodności świeci na czerwono).
