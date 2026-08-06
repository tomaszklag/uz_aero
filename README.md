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
| `npm run seed` | migracje + konta pilotów (TMK/AKO/PWI/JSE/KRZ) i flota |
| `npm run seed:demo` | trzy tygodnie ruchu klubu na **działającym** serwerze (patrz niżej) |
| `npm test` | wszystkie testy: aplikacja (Jest) + serwer (Vitest na PGlite) |
| `npm run typecheck` | TypeScript w całym repo |
| `npm run android` | przebudowa dev clienta (telefon po USB) — tylko po zmianie modułów natywnych (ostatnio: `expo-task-manager` + plugin `expo-location` dla usługi GPS w tle, 2026-08-03) |

Kolejność przy pracy z serwerem: `db:up` → `seed` (raz) → `server`.

Szybki sprawdzian serwera:

```bash
curl -s -X POST localhost:3000/auth/login -H "content-type: application/json" -d '{"login":"TMK","password":"test1234"}'
```

## Dane demo (tylko środowisko testowe)

`npm run seed` daje flotę i konta, ale panel jest po nim PUSTY — nie ma ani jednego dnia
lotnego. Ruch klubu dokłada osobne polecenie, uruchamiane przy **działającym** serwerze:

```bash
npm run seed:demo
```

Trzy tygodnie historii: ~35 dni lotnych na czterech samolotach, po jednym egzemplarzu
każdego typu flagi z §4.5, dzień bez karty arkusza (zablokowany nakładką), dzień
nadpisany przez drugą zmianę, korekta administracyjna po oknie 24 h, ślad w dzienniku
audytu, konto wyłączone (JSE) i **jeden dzień otwarty DZIŚ** na SP-FGK (KRZ) — po to,
żeby telefon miał co przejmować na ekranie 02. Mapa scenariusza: `server/scripts/demo/scenario.ts`.

> ⚠ **Scenariusz demo generuje dane w modelu sprzed 2026-08-06** — jeden dzień = jedna sesja
> samolotu, `preflight_confirm` z `dutyStart`, `day_close` jako koniec pracy. Po przebudowie
> flow (`docs/_main.md.txt` §3.6a) potrzebne będą dane w nowym kształcie: krótkie sesje,
> kilka maszyn w jednej służbie pilota, wzloty z opcjonalnym odczytem liczników. To warunek
> wstępny dla `consumptionReplay.ts` — bez nich nie da się skalibrować progów analityki
> pod nowy model (§3.6b). Zadanie etapu B.

Skrypt nie dotyka bazy: wysyła paczki przez `POST /events` i klika w panel przez
`/admin/api/*`, więc `sessions`, `flags` i karty arkusza powstają z produkcyjnego kodu.
Identyfikatory zdarzeń są stałe (`demo-…`), więc powtórny bieg wraca jako `duplicates` —
nic się nie dubluje i **nic nie jest kasowane**. Czystą bazę robi się usunięciem
kontenera (`npm run db:down` + `docker rm uzaero-pg`), nie tym skryptem. Adres inny niż
localhost wymaga jawnego `npm run seed:demo -- --allow-remote`.

Kolejność: `db:up` → `seed` → `server` → `seed:demo` → `admin`.

## Zasady

- Mockupy w `design/` są specyfikacją — ekran wdraża się 1:1 (`CLAUDE.md`).
- Architektura kodu i przepisy na nowe elementy: `docs/architektura-kodu.md`.
- Po zmianach w `app/`: `npx jest` i `npx tsc --noEmit` muszą przechodzić;
  w `server/` i `admin/`: `npx vitest run` i `npx tsc --noEmit`.
  Zmiana w `packages/*` dotyka wszystkich trzech — uruchom każdy zestaw.
- `admin/src/styles/tokens.css` jest GENEROWANY: po zmianie palety w `packages/tokens`
  uruchom `npm run tokens:css --workspace admin` (inaczej test zgodności świeci na czerwono).
