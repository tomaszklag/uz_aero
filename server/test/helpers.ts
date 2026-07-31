/**
 * UZ Aero (serwer) — wspólny zestaw testowy: PGlite + prawdziwe warstwy.
 *
 * PGlite to Postgres skompilowany do WASM, działający W PROCESIE testu — ten sam trik,
 * co `node:sqlite` w aplikacji: prawdziwy silnik (parser, planner, JSONB), zero Dockera
 * i zero atrap. Testy składają serwer z TYCH SAMYCH klas co produkcja; podmieniamy
 * wyłącznie bazę i zegar.
 *
 * Zegar jest sterowany ręcznie — bez tego testy wygasania tokenów musiałyby spać.
 */

import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import type { AdminAuditPort } from '../src/application/admin/ports.ts';
import type {
  Clock,
  Database,
  EventsStorePort,
  Queryable,
  SheetsPort,
} from '../src/application/common/ports.ts';
import { AdminCorrectionCommands } from '../src/application/admin/commands/corrections.ts';
import { AdminFlagCommands } from '../src/application/admin/commands/flags.ts';
import { AdminFlagQueries } from '../src/application/admin/queries/flags.ts';
import { AdminMeQueries } from '../src/application/admin/queries/me.ts';
import { AdminSessionQueries } from '../src/application/admin/queries/sessions.ts';
import { AuditedWrite } from '../src/application/admin/auditedWrite.ts';
import { AuthCommands } from '../src/application/common/commands/auth.ts';
import { IngestCommands } from '../src/application/mobile/commands/ingest.ts';
import { PrefsCommands } from '../src/application/mobile/commands/prefs.ts';
import { DayExporter } from '../src/application/common/export/dayExporter.ts';
import { ReferenceQueries } from '../src/application/mobile/queries/reference.ts';
import { SheetQueries } from '../src/application/common/queries/sheets.ts';
import { StateQueries } from '../src/application/mobile/queries/aircraftState.ts';
import { Hs256Tokens } from '../src/infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from '../src/infrastructure/auth/scryptHasher.ts';
import { PgAdminAuditRepo } from '../src/infrastructure/pg/admin/auditRepo.ts';
import { PgAdminFlagsRepo } from '../src/infrastructure/pg/admin/flagsRepo.ts';
import { PgAdminSessionsRepo } from '../src/infrastructure/pg/admin/sessionsRepo.ts';
import { PgEventsStore } from '../src/infrastructure/pg/common/eventsStore.ts';
import { PgExportLogRepo } from '../src/infrastructure/pg/common/exportLogRepo.ts';
import { PgFlagsRepo } from '../src/infrastructure/pg/common/flagsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { PgPilotPrefsRepo } from '../src/infrastructure/pg/mobile/pilotPrefsRepo.ts';
import { PgPilotsRepo } from '../src/infrastructure/pg/common/pilotsRepo.ts';
import { PgRefreshTokens } from '../src/infrastructure/pg/common/refreshTokensRepo.ts';
import { PgReferenceRepo } from '../src/infrastructure/pg/mobile/referenceRepo.ts';
import { PgAircraftConfigRepo } from '../src/infrastructure/pg/common/aircraftConfigRepo.ts';
import { PgSheets } from '../src/infrastructure/pg/common/sheetsRepo.ts';
import { FsTraceSink } from '../src/infrastructure/traces/fsTraceSink.ts';
import { seed } from '../src/infrastructure/pg/seed.ts';
import { buildServer } from '../src/http/server.ts';

export class TestClock implements Clock {
  constructor(private current = Date.UTC(2026, 5, 22, 8, 0, 0)) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

/**
 * Nagłówek CSRF wymagany przez KAŻDĄ mutację `/admin/api/*` (`src/http/adminCsrf.ts`).
 * Stoi tu, a nie w każdym teście z osobna, żeby zmiana nazwy nagłówka była jedną
 * poprawką, a nie polowaniem po plikach.
 */
export const ADMIN_CSRF_HEADERS = { 'x-uz-admin': '1' } as const;

export const TEST_SECRET = 'test-secret-o-dlugosci-co-najmniej-32-znakow';
export const TEST_PASSWORD = 'poprawne-haslo-testowe';
/** Celowo sztuczny host — nic tu nie nasłuchuje; testy przybijają PEŁNE URL-e kart. */
export const TEST_BASE_URL = 'http://uzaero.test';

/**
 * `audit` podmienia się z jednego powodu: żeby WYMUSIĆ awarię zapisu śladu i pokazać,
 * że skutek komendy cofa się razem z nim (`adminAudit.test.ts`). Poza tym testem
 * jedzie prawdziwy `PgAdminAuditRepo`, jak wszystko inne tutaj.
 *
 * `events` — z jednego, równie wąskiego powodu: `contract.test.ts` LICZY wywołania
 * `sessionEvents`, żeby przybić maszynowo regułę „listy panelu nie odtwarzają
 * projekcji ze strumienia". Dekorator opakowuje PRAWDZIWY adapter, więc test nadal
 * jedzie na prawdziwym SQL-u — podmieniamy obserwację, nie zachowanie.
 */
export async function testHarness(
  options: {
    sheets?: SheetsPort;
    audit?: AdminAuditPort;
    events?: (real: EventsStorePort) => EventsStorePort;
  } = {},
) {
  const pglite = new PGlite();
  // PGlite spełnia `Queryable` wprost, a transakcje ma własne (`transaction(cb)` daje
  // obiekt z `query`) — opakowanie dopasowuje tylko kształt do portu `Database`.
  const db: Database & { exec: (sql: string) => Promise<unknown> } = {
    query: (text, params) => pglite.query(text, params as never) as never,
    // Runner migracji szuka `exec` dla SQL-a wielopoleceniowego (patrz `migrate.ts`).
    exec: (sql) => pglite.exec(sql),
    transaction: (fn) => pglite.transaction((tx) => fn(tx as unknown as Queryable)) as never,
  };
  await migrate(db);
  await seed(db, new ScryptHasher(), { defaultPassword: TEST_PASSWORD });

  const clock = new TestClock();
  const tokens = new Hs256Tokens(TEST_SECRET, clock);
  const realEvents = new PgEventsStore();
  const events = options.events?.(realEvents) ?? realEvents;
  const sessions = new PgSessionsProjection();
  const flags = new PgFlagsRepo();
  const exportLog = new PgExportLogRepo();
  const pilots = new PgPilotsRepo(db);

  // Jak w produkcyjnym composition root: eksporter §4.7 jest domyślnie WŁĄCZONY
  // i pisze karty bazodanowym `PgSheets` — te same klasy co produkcja. Testy trybu
  // awarii/atrap podają własny `SheetsPort` przez `options.sheets`; odczyt
  // `GET /sheets/:tab` ZAWSZE czyta z bazy (atrapa pisze poza nią, więc trasa
  // odpowie 404 — zgodnie z prawdą).
  const pgSheets = new PgSheets(db, TEST_BASE_URL, clock);
  const exporter = new DayExporter(
    db,
    events,
    flags,
    exportLog,
    options.sheets ?? pgSheets,
    pilots,
    clock,
  );

  // Zrzut śladu (faza 5) — prawdziwy adapter plikowy na katalogu tymczasowym;
  // testy trasy zaglądają do NDJSON dokładnie tak, jak zrobi to skrypt replay.
  const tracesDir = mkdtempSync(join(tmpdir(), 'uzaero-traces-'));

  const aircraftConfig = new PgAircraftConfigRepo();
  const auditedWrite = new AuditedWrite(db, options.audit ?? new PgAdminAuditRepo(), clock);
  // Jeden adapter flag dla komend i zapytań — tak jak w produkcyjnym composition root.
  const adminFlagsRepo = new PgAdminFlagsRepo();

  const app = buildServer({
    auth: new AuthCommands(pilots, new PgRefreshTokens(db, clock), new ScryptHasher(), tokens, clock),
    reference: new ReferenceQueries(new PgReferenceRepo(db), db, sessions),
    ingest: new IngestCommands(db, events, sessions, flags, aircraftConfig, exporter),
    state: new StateQueries(db, events, sessions, flags, exportLog),
    sheets: new SheetQueries(pgSheets),
    traces: new FsTraceSink(tracesDir),
    prefs: new PrefsCommands(new PgPilotPrefsRepo(db)),
    tokens,
    adminFlags: new AdminFlagCommands(auditedWrite, adminFlagsRepo, exporter, clock),
    adminSessionQueries: new AdminSessionQueries(
      db,
      new PgAdminSessionsRepo(),
      events,
      adminFlagsRepo,
    ),
    adminFlagQueries: new AdminFlagQueries(db, adminFlagsRepo),
    adminMeQueries: new AdminMeQueries(pilots),
    // `randomUUID` jak w produkcji — uuid korekty testy czytają z odpowiedzi, więc
    // udawany generator nie kupiłby nic poza rozjazdem z composition rootem.
    adminCorrections: new AdminCorrectionCommands(
      auditedWrite,
      events,
      sessions,
      aircraftConfig,
      exporter,
      clock,
      randomUUID,
    ),
  });

  // `auditedWrite` i porty wychodzą na zewnątrz, żeby testy komend administracyjnych
  // wołanych POZA HTTP (przebudowa projekcji = CLI) składały je z tych samych klas.
  return { app, db, clock, tokens, tracesDir, auditedWrite, events, sessions };
}
