/**
 * UZ Aero (serwer) — `npm run db:demo`: kontener + seed + świat demo, BEZ kasowania.
 *
 * Jedno polecenie zamiast czterech kroków ręcznych: dopilnowuje kontenera Postgresa
 * (startuje istniejący albo stawia nowy), robi seed (migracje + flota + konta),
 * przepuszcza scenariusz demo przez DZIAŁAJĄCY serwer — dokładnie tym samym torem,
 * którym pisze telefon (`POST /events` → ingest → projekcje → flagi) — i na koniec
 * puszcza `consumptionReplay` po świeżych danych (raport read-only do oceny progów
 * analityki; `npm run db:demo -- SP-AXA` zawęża go do jednej maszyny).
 *
 * ══ NICZEGO NIE KASUJE — kasowanie jest decyzją ręczną (2026-08-10) ══
 * Świeży świat wymaga świeżej bazy, ale zdjęcie starej robisz sam:
 *
 *     docker rm -f uzaero-pg
 *
 * …i dopiero potem `npm run db:demo`. Na ISTNIEJĄCEJ bazie skrypt jest bezpieczny
 * i jałowy tam, gdzie już był: migracje są idempotentne, seed robi upsert, a paczki
 * scenariusza wracają jako `duplicates` (stałe uuid zdarzeń). Uwaga praktyczna:
 * na bazie sprzed pivotu 2026-08-10 duplikaty NIE podmienią starych sesji — po to
 * właśnie jest ręczne `docker rm` przed biegiem.
 *
 * ══ DWA BEZPIECZNIKI (skrypt pisze do bazy i rejestru) ══
 *  1. `DATABASE_URL` musi wskazywać kontener, którym ten skrypt zarządza
 *     (localhost:5432, baza `uzaero`) — inaczej seedowałby jedną bazę,
 *     a kontener stawiał obok drugiej;
 *  2. `DEMO_BASE_URL` musi być localhostem — rejestr jest append-only, więc
 *     scenariusz wysłany pod zły adres zostaje w cudzej bazie na zawsze.
 *     (Zdalny seed istnieje osobno: `npm run seed:demo -- --allow-remote`.)
 *
 * ══ SERWER: ZASTANY ALBO WBUDOWANY ══
 * Jeśli pod `DEMO_BASE_URL` już coś odpowiada na `/health` (deweloperski
 * `npm run server`), scenariusz jedzie przez NIEGO — pula pg otwiera połączenia
 * per zapytanie, więc świeżo postawiony kontener pod działającym serwerem jest
 * legalny (stare połączenia zdążą wypisać błąd w jego logu; to szum, nie awaria).
 * Gdy nikt nie słucha, skrypt IMPORTUJE `src/index.ts` i serwer wstaje w tym samym
 * procesie — a kończy się razem z nim przez jawne `process.exit(0)`.
 */

import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import { z } from 'zod';

import { ScryptHasher } from '../src/infrastructure/auth/scryptHasher.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { seed } from '../src/infrastructure/pg/seed.ts';
import { DemoClient } from './demo/demoClient.ts';
import { runScenario } from './demo/runScenario.ts';
import { buildScenario } from './demo/scenario.ts';

// ── konfiguracja i bezpieczniki ──────────────────────────────────────────────

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    SEED_PASSWORD: z.string().min(8, 'SEED_PASSWORD: minimum 8 znaków'),
    DEMO_BASE_URL: z.string().url().default('http://localhost:3000'),
  })
  .parse(process.env);

/** Parametry kontenera — DOKŁADNIE te z `npm run db:up` w korzeniu repo. */
const CONTAINER = 'uzaero-pg';
const IMAGE = 'postgres:16';
const RUN_ARGS = `--name ${CONTAINER} -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=uzaero -p 5432:5432 -d ${IMAGE}`;

const dbUrl = new URL(env.DATABASE_URL);
const demoUrl = new URL(env.DEMO_BASE_URL);
const isLocalHost = (host: string): boolean =>
  host === 'localhost' || host === '127.0.0.1' || host === '::1';

if (
  !isLocalHost(dbUrl.hostname) ||
  (dbUrl.port !== '' && dbUrl.port !== '5432') ||
  dbUrl.pathname !== '/uzaero'
) {
  console.error(
    `Odmawiam: DATABASE_URL (${env.DATABASE_URL}) nie wskazuje kontenera, którym zarządzam\n` +
      `(localhost:5432, baza uzaero). Kontener stanąłby obok bazy, do której piszę.`,
  );
  process.exit(1);
}
if (!isLocalHost(demoUrl.hostname)) {
  console.error(
    `Odmawiam: DEMO_BASE_URL (${env.DEMO_BASE_URL}) nie jest localhostem.\n` +
      'Do zdalnego seeda służy `npm run seed:demo -- --allow-remote`.',
  );
  process.exit(1);
}

// ── docker: dopilnuj kontenera (start istniejącego ALBO nowy — zero kasowania) ──

try {
  execSync('docker --version', { stdio: 'ignore' });
} catch {
  console.error('Nie znajduję polecenia `docker` — uruchom Docker Desktop i spróbuj znowu.');
  process.exit(1);
}

try {
  execSync(`docker start ${CONTAINER}`, { stdio: 'ignore' });
  console.log(`▸ kontener ${CONTAINER} wystartowany (istniał — dane zostają;`);
  console.log('  świeży świat = ręczne `docker rm -f uzaero-pg` PRZED tym skryptem)');
} catch {
  console.log(`▸ stawiam ${IMAGE} jako ${CONTAINER}…`);
  execSync(`docker run ${RUN_ARGS}`, { stdio: 'inherit' });
}

// Postgres w kontenerze wstaje z opóźnieniem (initdb przy pierwszym starcie) —
// czekamy na PIERWSZE UDANE zapytanie, a nie na sam start procesu.
console.log('▸ czekam na gotowość bazy…');
const pool = new Pool({ connectionString: env.DATABASE_URL });
const deadline = Date.now() + 90_000;
for (;;) {
  try {
    await pool.query('SELECT 1');
    break;
  } catch (error) {
    if (Date.now() > deadline) {
      console.error('Baza nie wstała w 90 s:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
    await sleep(1_000);
  }
}

// ── seed: migracje + flota + konta (to samo, co `npm run seed`) ──────────────

console.log('▸ seed: schemat + flota + konta pilotów…');
await migrate(pool);
await seed(pool, new ScryptHasher(), { defaultPassword: env.SEED_PASSWORD });
await pool.end();

// ── serwer: zastany albo wbudowany ───────────────────────────────────────────

if (await healthy()) {
  console.log(`▸ serwer już działa na ${env.DEMO_BASE_URL} — jadę przez niego`);
} else {
  console.log('▸ nikt nie słucha — startuję serwer w tym procesie…');
  // Import ma skutek uboczny (migrate + listen) i o to chodzi: serwer żyje dokładnie
  // tak długo, jak ten skrypt. `migrate` drugi raz jest jałowy (idempotentny runner).
  await import('../src/index.ts');
  const bootDeadline = Date.now() + 30_000;
  while (!(await healthy())) {
    if (Date.now() > bootDeadline) {
      console.error('Serwer nie odpowiedział na /health w 30 s.');
      process.exit(1);
    }
    await sleep(500);
  }
}

// ── scenariusz demo — ten sam kod, co `npm run seed:demo` ────────────────────

console.log(`▸ scenariusz demo → ${env.DEMO_BASE_URL}`);
const scenario = buildScenario(Date.now());
const client = new DemoClient(env.DEMO_BASE_URL, env.SEED_PASSWORD);
const summary = await runScenario(client, scenario, (message) => console.log(message));

console.log(
  `\nŚwiat postawiony: ${summary.batches} paczek, przyjęto ${summary.accepted} zdarzeń` +
    (summary.duplicates > 0 ? `, duplikatów ${summary.duplicates} (powtórny bieg)` : '') +
    '.',
);

// ── raport analityki na świeżych danych (read-only) ──────────────────────────
// Ten sam kod, co `scripts/consumptionReplay.ts` odpalony ręcznie: import wykonuje
// skrypt w tym procesie, a wynik to RAPORT do oceny progów `consumption/policy.ts`
// (rozkład interwałów, powody odrzuceń, rozdział ziemia/lot). Niczego nie zapisuje;
// sama kalibracja progów to osobna decyzja z tym raportem w ręku, nigdy dyskusja.
// Bonus: `npm run db:demo -- SP-AXA` zawęża raport do jednej maszyny (argv przechodzi).
console.log('\n▸ przebieg analityki zużycia na świeżych danych…\n');
await import('./consumptionReplay.ts');

// Jawne wyjście, bo wbudowany serwer trzyma pętlę zdarzeń przy życiu.
process.exit(0);

// ── drobiazgi ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(new URL('/health', env.DEMO_BASE_URL), {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
