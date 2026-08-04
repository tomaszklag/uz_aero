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
import { AdminExportCommands } from '../src/application/admin/commands/exports.ts';
import { AdminFlagCommands } from '../src/application/admin/commands/flags.ts';
import { AdminFleetCommands } from '../src/application/admin/commands/fleet.ts';
import { AdminMaintenanceCommands } from '../src/application/admin/commands/maintenance.ts';
import { AdminPilotCommands } from '../src/application/admin/commands/pilots.ts';
import { AdminAuditQueries } from '../src/application/admin/queries/audit.ts';
import { AdminCorrectionQueries } from '../src/application/admin/queries/corrections.ts';
import { AdminDashboardQueries } from '../src/application/admin/queries/dashboard.ts';
import { AdminEventQueries } from '../src/application/admin/queries/events.ts';
import { AdminExportQueries } from '../src/application/admin/queries/exports.ts';
import { AdminFlagQueries } from '../src/application/admin/queries/flags.ts';
import { AdminFleetQueries } from '../src/application/admin/queries/fleet.ts';
import { AdminMaintenanceQueries } from '../src/application/admin/queries/maintenance.ts';
import { AdminMeQueries } from '../src/application/admin/queries/me.ts';
import { AdminPilotQueries } from '../src/application/admin/queries/pilots.ts';
import { AdminSessionQueries } from '../src/application/admin/queries/sessions.ts';
import { AdminStatsQueries } from '../src/application/admin/queries/stats.ts';
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
import { generateStartPassword } from '../src/infrastructure/auth/startPassword.ts';
import { PgAdminAuditReadRepo } from '../src/infrastructure/pg/admin/auditReadRepo.ts';
import { PgAdminAuditRepo } from '../src/infrastructure/pg/admin/auditRepo.ts';
import { PgAdminDashboardRepo } from '../src/infrastructure/pg/admin/dashboardRepo.ts';
import { PgAdminEventsReadRepo } from '../src/infrastructure/pg/admin/eventsReadRepo.ts';
import { PgAdminEventsRepo } from '../src/infrastructure/pg/admin/eventsRepo.ts';
import { PgAdminExportsRepo } from '../src/infrastructure/pg/admin/exportsRepo.ts';
import { PgAdminFlagsRepo } from '../src/infrastructure/pg/admin/flagsRepo.ts';
import { PgAdminFleetRepo } from '../src/infrastructure/pg/admin/fleetRepo.ts';
import { PgAdminMaintenanceRepo } from '../src/infrastructure/pg/admin/maintenanceRepo.ts';
import { PgAdminPilotsRepo } from '../src/infrastructure/pg/admin/pilotsRepo.ts';
import { PgAdminRefreshTokensRepo } from '../src/infrastructure/pg/admin/refreshTokensRepo.ts';
import { PgAdminSessionsRepo } from '../src/infrastructure/pg/admin/sessionsRepo.ts';
import { PgAdminStatsRepo } from '../src/infrastructure/pg/admin/statsRepo.ts';
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
import { FsTraceSource } from '../src/infrastructure/traces/fsTraceSource.ts';
import { AdminFlightTrackQueries } from '../src/application/admin/queries/flightTrack.ts';
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
  // Konta mają DWA adaptery, jak w produkcji: logowanie czyta `PgPilotsRepo` (hash),
  // panel pisze `PgAdminPilotsRepo` (transakcja śladu audytu).
  const adminPilotsRepo = new PgAdminPilotsRepo();
  // Flota ma własny adapter obok `PgReferenceRepo` i `PgAircraftConfigRepo` — jak
  // w produkcyjnym composition root.
  const adminFleetRepo = new PgAdminFleetRepo();
  // Monitor eksportu ma własny adapter obok `PgExportLogRepo` — jak w produkcyjnym
  // composition root.
  const adminExportsRepo = new PgAdminExportsRepo();
  // Konserwacja (A11) — jeden adapter na dwie drogi (podgląd i zapis), jak w produkcji.
  const adminMaintenanceRepo = new PgAdminMaintenanceRepo();
  const hasher = new ScryptHasher();
  // Zapytania floty mają DWÓCH konsumentów (trasy `A07` i pulpit) — jak w produkcyjnym
  // composition root, więc stoją w zmiennej, a nie w literale.
  const adminFleetQueries = new AdminFleetQueries(db, adminFleetRepo, sessions, adminPilotsRepo);

  const app = buildServer({
    auth: new AuthCommands(pilots, new PgRefreshTokens(db, clock), hasher, tokens, clock),
    reference: new ReferenceQueries(new PgReferenceRepo(db), db, sessions),
    ingest: new IngestCommands(db, events, sessions, flags, aircraftConfig, exporter),
    state: new StateQueries(db, events, sessions, flags, exportLog),
    sheets: new SheetQueries(pgSheets),
    traces: new FsTraceSink(tracesDir),
    // Odczyt śladu wskazuje na TEN SAM katalog co zapis — dzięki temu test może wysłać
    // ślad przez `POST /traces` i przeczytać go przez trasę mapy, czyli przejść dokładnie
    // tę drogę, którą przechodzą dane w produkcji.
    adminFlightTrackQueries: new AdminFlightTrackQueries(db, events, new FsTraceSource(tracesDir)),
    prefs: new PrefsCommands(new PgPilotPrefsRepo(db)),
    tokens,
    // Brama tras panelu czyta konto przy KAŻDYM żądaniu; na tym opierają się przypadki
    // „deaktywacja odcina natychmiast" (`roles.test.ts`, `adminAccounts.test.ts`).
    pilots,
    adminFlags: new AdminFlagCommands(auditedWrite, adminFlagsRepo, exporter, clock),
    adminSessionQueries: new AdminSessionQueries(
      db,
      new PgAdminSessionsRepo(),
      events,
      adminFlagsRepo,
      new PgAdminEventsRepo(),
    ),
    adminFlagQueries: new AdminFlagQueries(db, adminFlagsRepo),
    adminMeQueries: new AdminMeQueries(pilots),
    // Konta (A06/A06a). Hasło startowe jedzie PRAWDZIWYM generatorem — testy czytają
    // wartość z odpowiedzi, a jeden z przypadków sprawdza właśnie to, że nie ma jej
    // nigdzie indziej (ani w `details` audytu, ani w bazie poza hashem).
    adminPilots: new AdminPilotCommands(
      auditedWrite,
      adminPilotsRepo,
      new PgAdminRefreshTokensRepo(),
      hasher,
      randomUUID,
      generateStartPassword,
      clock,
    ),
    adminPilotQueries: new AdminPilotQueries(db, adminPilotsRepo, clock),
    // Flota (A07/A07a) — `randomUUID` jak w produkcji: identyfikator jednostki testy
    // czytają z odpowiedzi, więc udawany generator kupiłby wyłącznie rozjazd
    // z composition rootem.
    adminFleet: new AdminFleetCommands(auditedWrite, adminFleetRepo, randomUUID),
    adminFleetQueries,
    // Eksporty (A05). Komenda ponowienia dostaje TEN SAM `exporter`, którym jedzie
    // ingest — także wtedy, gdy `options.sheets` podmienia arkusze na atrapę awarii.
    // Podgląd karty czyta ZAWSZE z bazy (`pgSheets`), tak jak `GET /sheets/:tab`.
    adminExports: new AdminExportCommands(auditedWrite, adminExportsRepo, exporter, clock),
    adminExportQueries: new AdminExportQueries(db, adminExportsRepo, pgSheets),
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
    adminCorrectionQueries: new AdminCorrectionQueries(
      db,
      events,
      new PgAdminEventsRepo(),
      aircraftConfig,
      clock,
    ),
    // Odczyt dziennika jedzie PRAWDZIWYM adapterem także wtedy, gdy `options.audit`
    // podmienia stronę zapisu na rzucającą: test „awaria audytu cofa skutek" ma
    // sprawdzać transakcję, a nie odbierać listę temu, co się faktycznie zapisało.
    adminAuditQueries: new AdminAuditQueries(db, new PgAdminAuditReadRepo()),
    // Rejestr zdarzeń (A04) — trzeci adapter nad `events`, jak w produkcyjnym
    // composition root: ingest, metadane karty dnia i lista śledcza to trzy różne
    // pytania. Jedzie tu PRAWDZIWY adapter także wtedy, gdy `options.events`
    // podmienia magazyn ingestu — rejestr czyta kolumny, nie strumień.
    adminEventQueries: new AdminEventQueries(db, new PgAdminEventsReadRepo()),
    // Pulpit (A01/A01a) — składany z TYCH SAMYCH zapytań i adapterów, co ekrany
    // docelowe. `events` jedzie tu przez dekorator z `options.events`, więc
    // `contract.test.ts` widzi także odczyty strumienia robione przez pulpit.
    // Konserwacja (A11) — PORÓWNANIE jedzie zapytaniem bez `AuditedWrite` (zero
    // zapisów, zero wpisów w dzienniku), NADPISANIE komendą przez bramę audytu.
    // `options.events` obejmuje obie drogi, więc `contract.test.ts` widzi odczyty
    // strumienia robione przez przebudowę.
    adminMaintenance: new AdminMaintenanceCommands(
      auditedWrite,
      adminMaintenanceRepo,
      events,
      sessions,
      clock,
    ),
    adminMaintenanceQueries: new AdminMaintenanceQueries(
      db,
      adminMaintenanceRepo,
      events,
      sessions,
      clock,
    ),
    adminDashboardQueries: new AdminDashboardQueries(
      db,
      adminFleetQueries,
      new PgAdminSessionsRepo(),
      adminFlagsRepo,
      adminExportsRepo,
      new PgAdminDashboardRepo(),
      events,
      adminPilotsRepo,
      clock,
    ),
    // Statystyki (A10) — jak w produkcyjnym composition root: czysty odczyt agregatów
    // kolumn projekcji, zegar rozstrzyga zakres domyślny.
    adminStatsQueries: new AdminStatsQueries(db, new PgAdminStatsRepo(), clock),
  });

  // `auditedWrite` i porty wychodzą na zewnątrz, żeby testy komend administracyjnych
  // wołanych POZA HTTP (przebudowa projekcji = CLI) składały je z tych samych klas.
  return { app, db, clock, tokens, tracesDir, auditedWrite, events, sessions };
}
