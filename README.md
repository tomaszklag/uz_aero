# UZ Aero

Elektroniczny chronometraż lotów: aplikacja Android (React Native + Expo), backend
(Fastify + PostgreSQL) i wspólna domena. Monorepo npm workspaces.

```
app/              aplikacja mobilna (Expo)
server/           backend (auth, sync zdarzeń, flagi)
packages/domain   wspólna domena — zdarzenia, reguły, projekcje
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
| `npm run db:up` | Postgres w Dockerze (tworzy kontener przy pierwszym razie) |
| `npm run db:down` | zatrzymanie bazy |
| `npm run seed` | migracje + konta pilotów (TMK/AKO/PWI/JSE/KRZ) i flota |
| `npm test` | wszystkie testy: aplikacja (Jest) + serwer (Vitest na PGlite) |
| `npm run typecheck` | TypeScript w całym repo |
| `npm run android` | przebudowa dev clienta (telefon po USB) — tylko po zmianie modułów natywnych |

Kolejność przy pracy z serwerem: `db:up` → `seed` (raz) → `server`.

Szybki sprawdzian serwera:

```bash
curl -s -X POST localhost:3000/auth/login -H "content-type: application/json" -d '{"login":"TMK","password":"test1234"}'
```

## Zasady

- Mockupy w `design/` są specyfikacją — ekran wdraża się 1:1 (`CLAUDE.md`).
- Architektura kodu i przepisy na nowe elementy: `docs/architektura-kodu.md`.
- Po zmianach w `app/`: `npx jest` i `npx tsc --noEmit` muszą przechodzić;
  w `server/`: `npm test` i `npm run typecheck`.
