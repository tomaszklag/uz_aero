/**
 * UZ Aero (serwer) - `npm run rebuild-projections`: przebudowa projekcji `sessions`
 * ze strumienia zdarzeń (mockup `A11-konserwacja.html`).
 *
 * Wzorzec `seedCli.ts`: własna pula, walidacja env przez `zod`, jeden przebieg, koniec.
 * Ten skrypt jest MINI COMPOSITION ROOTEM - składa te same klasy co `index.ts`, tylko
 * bez serwera HTTP. Od 2026-08-02 panel woła TE SAME klasy trasami
 * `GET /admin/api/maintenance/projections/compare` i `POST …/projections/rebuild`;
 * ten plik zostaje jako droga awaryjna, bo przebudowa bywa potrzebna dokładnie wtedy,
 * gdy panel nie wstaje.
 *
 * ── Dwa kroki, nie jeden ────────────────────────────────────────────────────────
 * Domyślnie `dry_run`: przelicza i porównuje, NICZEGO nie zapisując - i od 2026-08-02
 * robi to ZAPYTANIE (`AdminMaintenanceQueries`), nie komenda. Porównanie nie zostawia
 * już wpisu w `admin_audit`, bo dziennik nadzoru nie może opisywać rzeczy, które się
 * nie wydarzyły. Zapis wymaga jawnego `REBUILD_MODE=write` **i** `REBUILD_REASON`, bo
 * nadpisanie wyrównuje liczby i tym samym kasuje jedyny ślad po tym, co je rozjechało.
 *
 * ── Kto to zrobił ───────────────────────────────────────────────────────────────
 * `REBUILD_ACTOR` musi wskazywać ISTNIEJĄCE konto - rola do dziennika audytu idzie
 * z konta, nie z env (`admin_audit.actor_role` ma być rolą Z CHWILI AKCJI). Wymyślona
 * tożsamość w dzienniku byłaby gorsza niż jej brak, a `ip` zostaje `null`, bo tu
 * naprawdę nie ma żądania HTTP.
 */

import { Pool } from 'pg';
import { z } from 'zod';

import { AdminMaintenanceCommands } from '../application/admin/commands/maintenance.ts';
import { AdminMaintenanceQueries } from '../application/admin/queries/maintenance.ts';
import { AuditedWrite } from '../application/admin/auditedWrite.ts';
import type { RebuildReport } from '../application/admin/contracts/maintenance.ts';
import { PgAdminAuditRepo } from '../infrastructure/pg/admin/auditRepo.ts';
import { PgAdminMaintenanceRepo } from '../infrastructure/pg/admin/maintenanceRepo.ts';
import { PgDatabase } from '../infrastructure/pg/database.ts';
import { PgEventsStore } from '../infrastructure/pg/common/eventsStore.ts';
import { PgPilotsRepo } from '../infrastructure/pg/common/pilotsRepo.ts';
import { PgSessionsProjection } from '../infrastructure/pg/common/sessionsProjection.ts';
import { migrate } from '../infrastructure/pg/migrate.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    /** Id konta wykonującego operację - trafia do `admin_audit.actor_pilot_id`. */
    REBUILD_ACTOR: z.string().min(1, 'REBUILD_ACTOR: id konta administratora'),
    REBUILD_MODE: z.enum(['dry_run', 'write']).default('dry_run'),
    REBUILD_REASON: z.string().optional(),
  })
  .parse(process.env);

const clock = { now: () => new Date() };
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = new PgDatabase(pool);

// Migracje przed przebudową i to jest kolejność, nie ozdoba: przebudowa jest sposobem
// wypełnienia kolumn, które właśnie dołożyła migracja (11: `operation`, `client`).
await migrate(db);

const pilots = new PgPilotsRepo(db);
const actor = await pilots.findById(env.REBUILD_ACTOR);
if (actor == null) {
  console.error(`REBUILD_ACTOR: nie ma konta o id ${env.REBUILD_ACTOR}.`);
  await pool.end();
  process.exit(1);
}

const maintenanceRepo = new PgAdminMaintenanceRepo();
const events = new PgEventsStore();
const sessions = new PgSessionsProjection();

// Dwie drogi, bo dwie natury operacji: porównanie jest ODCZYTEM (bez `AuditedWrite`,
// więc bez możliwości zapisu i bez wpisu w dzienniku), a nadpisanie idzie przez bramę
// audytu. Ocena różnic jest wspólna (`application/admin/projectionScan.ts`), więc
// dwie drogi nie mogą powiedzieć dwóch różnych rzeczy o tej samej bazie.
const queries = new AdminMaintenanceQueries(db, maintenanceRepo, events, sessions, clock);
const commands = new AdminMaintenanceCommands(
  new AuditedWrite(db, new PgAdminAuditRepo(), clock),
  maintenanceRepo,
  events,
  sessions,
  clock,
);

const outcome =
  env.REBUILD_MODE === 'write'
    ? await commands.rebuildProjections(
        { pilotId: actor.id, role: actor.role, ip: null },
        { reason: env.REBUILD_REASON },
      )
    : ({ ok: true, report: await queries.compareProjections() } as const);

await pool.end();

if (!outcome.ok) {
  if (outcome.reason === 'nothing_to_rebuild') {
    // Nie jest to awaria: projekcja się zgadza, więc zapis nie ma czego zapisać
    // i świadomie NIE zostawia wpisu w dzienniku. Kod 0, bo cron ma milczeć.
    console.log('\nProjekcja zgadza się ze strumieniem. Nic do nadpisania - bez wpisu w audycie.\n');
    process.exit(0);
  }
  console.error('REBUILD_REASON jest wymagany dla REBUILD_MODE=write (trafia do audytu).');
  process.exit(1);
}

report(outcome.report);
// Niezerowa różnica to INCYDENT - kod wyjścia mówi to samo, co tekst, żeby przebieg
// z crona nie przeszedł niezauważony.
process.exit(outcome.report.rowsDiffering > 0 ? 2 : 0);

function report(r: RebuildReport): void {
  const tryb = r.mode === 'dry_run' ? 'PORÓWNANIE (bez zapisu)' : 'ZAPIS';
  console.log(`\nPrzebudowa projekcji sessions - ${tryb}`);
  console.log(`  sesji w rejestrze:  ${r.sessions}`);
  console.log(`  wierszy różnych:    ${r.rowsDiffering}`);
  console.log(`  pól różnych:        ${r.fieldsDiffering}`);
  console.log(`  wierszy nadpisanych:${r.written}`);

  if (r.rowsDiffering === 0) {
    console.log('\nProjekcja zgadza się ze strumieniem. Nic do zrobienia.\n');
    return;
  }

  if (r.remaining > 0) {
    // Limit jest bezpiecznikiem, nie całością - i nie ma prawa być cichy. Bez tego
    // zdania przebieg z crona wyglądałby na komplet przy 1091 nietkniętych sesjach.
    const co = r.mode === 'write' ? 'NIE ZOSTAŁO nadpisanych' : 'nie mieści się w raporcie';
    console.log(`  ${co}: ${r.remaining} - uruchom ponownie, żeby dojść do reszty`);
  }

  console.log('\n  sesja                                 dzień       pole            w sessions → z przeliczenia');
  for (const diff of r.diffs) {
    const day = diff.day ?? '-         ';
    if (diff.missing) {
      console.log(`  ${diff.sessionUuid}  ${day}  BRAK WIERSZA W PROJEKCJI`);
      continue;
    }
    for (const field of diff.fields) {
      console.log(
        `  ${diff.sessionUuid}  ${day}  ${field.field.padEnd(14)}  ${String(field.stored)} → ${String(field.computed)}`,
      );
    }
  }

  console.log(
    [
      '',
      'UWAGA: różnica NIE jest sukcesem tej operacji - jest incydentem do zbadania.',
      'Projekcja jest odświeżana w tej samej transakcji, w której serwer przyjmuje',
      'zdarzenia, więc w normalnej pracy różnicy być NIE MOŻE. Wyjaśnienia są dwa:',
      '  • wydanie domeny zmieniło regułę liczenia - wtedy przebudowa jest tym,',
      '    czego trzeba (strumień jest nietknięty, przeliczy go nowy kod);',
      '  • albo coś zadziało się poza normalną pracą serwera: ręczny UPDATE, import,',
      '    odtworzenie z kopii zrobionej w połowie strumienia.',
      'Zapis wyrówna liczby i SKASUJE jedyny ślad po przyczynie. Najpierw audyt',
      '(admin_audit, daty wydań), dopiero potem REBUILD_MODE=write z uzasadnieniem.',
      '',
    ].join('\n'),
  );
}
