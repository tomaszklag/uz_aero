/**
 * UZ Aero — DANE DEMO NA DZIAŁAJĄCYM SERWERZE (tylko środowisko testowe).
 *
 *   npm run db:up          # Postgres w Dockerze
 *   npm run seed           # migracje + flota i konta (`infrastructure/pg/seed.ts`)
 *   npm run server         # serwer musi DZIAŁAĆ — ten skrypt jest jego klientem
 *   npm run seed:demo      # cztery tygodnie ruchu klubu
 *
 * Skrypt nie dotyka bazy. Wysyła paczki zdarzeń przez `POST /events` i klika w panel
 * przez `/admin/api/*` — czyli robi dokładnie to, co telefony i administrator, a
 * `sessions`, `flags`, `export_log` i `exported_sheets` powstają z produkcyjnego kodu.
 * Uzasadnienie i mapa scenariusza: `scripts/demo/scenario.ts`.
 *
 * ══ NICZEGO NIE KASUJE ══
 * Identyfikatory zdarzeń są stałe (`demo-axa-20260714-pwi-07-takeoff`), więc powtórny
 * bieg wraca jako `duplicates` — bez dubli i bez `TRUNCATE`. Czystą bazę robi się
 * usunięciem kontenera (`npm run db:down`, `docker rm uzaero-pg`), a nie tym skryptem:
 * kasowanie cudzych danych nie ma prawa być skutkiem ubocznym seeda.
 *
 * ══ CZEGO TE DANE NIE ODDAJĄ ══
 * `events.received_at` to chwila PRZYJĘCIA paczki, więc cały scenariusz ląduje na
 * serwerze „teraz", choć opisuje cztery tygodnie wstecz. Histogram pulsu na `A01`
 * (dwanaście godzin wstecz) pokaże jeden słupek, a rejestr `A04` sortowany po czasie
 * przyjęcia — jeden blok. To nie jest usterka do obejścia: kolumnę wypełnia baza przy
 * `INSERT`, a rejestr jest append-only, więc jedynym sposobem na rozłożenie tych
 * znaczników byłoby ominięcie ingestu — czyli utrata wszystkiego, po co ten seed jedzie
 * przez API. Sesje, wzloty, flagi i karty mają daty prawdziwe.
 */

import { z } from 'zod';

import { DemoClient } from './demo/demoClient.ts';
import { runScenario } from './demo/runScenario.ts';
import { buildScenario } from './demo/scenario.ts';

const env = z
  .object({
    /**
     * Adres DZIAŁAJĄCEGO serwera. Domyślnie localhost — a wszystko poza nim wymaga
     * `--allow-remote`, bo seed pisze do rejestru append-only: pomyłka w adresie zostaje
     * w cudzej bazie na zawsze i nie da się jej cofnąć.
     */
    DEMO_BASE_URL: z.string().url().default('http://localhost:3000'),
    /** To samo hasło, którym `npm run seed` założył konta. */
    SEED_PASSWORD: z.string().min(8, 'SEED_PASSWORD: minimum 8 znaków'),
  })
  .parse(process.env);

const allowRemote = process.argv.includes('--allow-remote');
const host = new URL(env.DEMO_BASE_URL).hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';

if (!isLocal && !allowRemote) {
  console.error(
    `Odmawiam: ${env.DEMO_BASE_URL} nie jest localhostem.\n` +
      'Dane demo są nieusuwalne (rejestr append-only), więc adres spoza maszyny\n' +
      'wymaga jawnego `npm run seed:demo -- --allow-remote`.',
  );
  process.exit(1);
}

const scenario = buildScenario(Date.now());
const client = new DemoClient(env.DEMO_BASE_URL, env.SEED_PASSWORD);

console.log(`UZ Aero — dane demo → ${env.DEMO_BASE_URL}`);
const summary = await runScenario(client, scenario, (message) => console.log(message));

console.log(
  `\nGotowe: ${summary.batches} paczek, przyjęto ${summary.accepted} zdarzeń` +
    (summary.duplicates > 0 ? `, duplikatów ${summary.duplicates} (powtórny bieg)` : '') +
    `, akcji panelu ${summary.adminActions}.`,
);
for (const skipped of summary.skipped) console.log(`Pominięto: ${skipped}`);
console.log('Panel: npm run admin → zaloguj się jako TMK (admin) albo AKO (szef wyszkolenia).');
