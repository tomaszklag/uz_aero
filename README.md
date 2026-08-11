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

Cztery tygodnie historii: **51 sesji na czterech samolotach, ~1400 zdarzeń**, z czego
flagę niesie 7 (~14%) — patologie są MNIEJSZOŚCIĄ, bo skrzynka pełna zawsze przestaje być
czytana. W tle zwykłe dni klubu: dni skokowe po 4–9 wzlotów, egzaminy, przeloty, próba
silnika bez startu. Poza tym po jednym egzemplarzu każdego typu flagi z §4.5, dzień bez
karty arkusza (zablokowany nakładką), doba z dwiema zmianami jednej maszyny, zetknięcie
sesji co do minuty, dwie sesje bez wzlotu z podanym powodem (09C), korekta administracyjna
po oknie 24 h, ślad w dzienniku audytu, konto wyłączone (JSE) i **jedna sesja otwarta DZIŚ**
na SP-FGK (KRZ) — po to, żeby telefon miał co przejmować na ekranie 02. Mapa scenariusza:
`server/scripts/demo/scenario.ts`.

> Scenariusz jest w modelu po przebudowie flow (`docs/_main.md.txt` §3.6a): sesja samolotu
> jest krótka i niesie TABLICĘ wzlotów, payloady nie niosą klamry służby, a `leg_close` ma
> opcjonalny odczyt liczników (164 wzloty, 88 z odczytem). To był warunek wstępny kalibracji
> progów analityki (§3.6b) — `consumptionReplay.ts` ma od 2026-08-08 na czym pracować.

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
