/**
 * UZ Aero (serwer) - wspólny zestaw testowy: PGlite + prawdziwe warstwy.
 *
 * PGlite to Postgres skompilowany do WASM, działający W PROCESIE testu - ten sam trik,
 * co `node:sqlite` w aplikacji: prawdziwy silnik (parser, planner, JSONB), zero Dockera
 * i zero atrap. Testy składają serwer z TYCH SAMYCH klas co produkcja; podmieniamy
 * wyłącznie bazę i zegar.
 *
 * Zegar jest sterowany ręcznie - bez tego testy wygasania tokenów musiałyby spać.
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
import { AdminConsumptionQueries } from '../src/application/admin/queries/consumption.ts';
import { AdminLogQueries } from '../src/application/admin/queries/log.ts';
import { AdminStatsQueries } from '../src/application/admin/queries/stats.ts';
import { AuditedWrite } from '../src/application/admin/auditedWrite.ts';
import { AuthCommands } from '../src/application/common/commands/auth.ts';
import { IngestCommands } from '../src/application/mobile/commands/ingest.ts';
import { PrefsCommands } from '../src/application/mobile/commands/prefs.ts';
import { DayExporter } from '../src/application/common/export/dayExporter.ts';
import { MyEventQueries } from '../src/application/mobile/queries/myEvents.ts';
import { MySessionTrackQueries } from '../src/application/mobile/queries/sessionTrack.ts';
import { ReferenceQueries } from '../src/application/mobile/queries/reference.ts';
import { TaskSuggestionQueries } from '../src/application/mobile/queries/taskSuggestions.ts';
import { SessionTrackQueries } from '../src/application/common/queries/sessionTrack.ts';
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
import { PgAdminConsumptionRepo } from '../src/infrastructure/pg/admin/consumptionRepo.ts';
import { PgAdminLogRepo } from '../src/infrastructure/pg/admin/logRepo.ts';
import { PgAdminStatsRepo } from '../src/infrastructure/pg/admin/statsRepo.ts';
import { FsPhaseTimeline } from '../src/infrastructure/traces/fsPhaseTimeline.ts';
import { PgConsumptionNormRepo } from '../src/infrastructure/pg/common/consumptionNormRepo.ts';
import { PgEventsStore } from '../src/infrastructure/pg/common/eventsStore.ts';
import { PgExportLogRepo } from '../src/infrastructure/pg/common/exportLogRepo.ts';
import { PgFlagsRepo } from '../src/infrastructure/pg/common/flagsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { PgPilotPrefsRepo } from '../src/infrastructure/pg/mobile/pilotPrefsRepo.ts';
import { PgPilotsRepo } from '../src/infrastructure/pg/common/pilotsRepo.ts';
import { PgRefreshTokens } from '../src/infrastructure/pg/common/refreshTokensRepo.ts';
import { PgMyEventsRepo } from '../src/infrastructure/pg/mobile/myEventsRepo.ts';
import { PgReferenceRepo } from '../src/infrastructure/pg/mobile/referenceRepo.ts';
import { PgTaskSuggestionsRepo } from '../src/infrastructure/pg/mobile/taskSuggestionsRepo.ts';
import { PgAircraftConfigRepo } from '../src/infrastructure/pg/common/aircraftConfigRepo.ts';
import { PgSheets } from '../src/infrastructure/pg/common/sheetsRepo.ts';
import { FsTraceSink } from '../src/infrastructure/traces/fsTraceSink.ts';
import { FsTraceSource } from '../src/infrastructure/traces/fsTraceSource.ts';
import { buildServer } from '../src/http/server.ts';
import { seedTestWorld } from './testWorld.ts';

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
/** Celowo sztuczny host - nic tu nie nasłuchuje; testy przybijają PEŁNE URL-e kart. */
export const TEST_BASE_URL = 'http://uzaero.test';

/**
 * `audit` podmienia się z jednego powodu: żeby WYMUSIĆ awarię zapisu śladu i pokazać,
 * że skutek komendy cofa się razem z nim (`adminAudit.test.ts`). Poza tym testem
 * jedzie prawdziwy `PgAdminAuditRepo`, jak wszystko inne tutaj.
 *
 * `events` - z jednego, równie wąskiego powodu: `contract.test.ts` LICZY wywołania
 * `sessionEvents`, żeby przybić maszynowo regułę „listy panelu nie odtwarzają
 * projekcji ze strumienia". Dekorator opakowuje PRAWDZIWY adapter, więc test nadal
 * jedzie na prawdziwym SQL-u - podmieniamy obserwację, nie zachowanie.
 */
export async function testHarness(
  options: {
    sheets?: SheetsPort;
    audit?: AdminAuditPort;
    events?: (real: EventsStorePort) => EventsStorePort;
    /**
     * Podmiana katalogu buildu panelu - wyłącznie `adminStatic.test.ts`. Bez podmiany
     * rejestracja (bezwarunkowa od 2026-08-26) wskazuje realne `admin/dist`, którego
     * w testach zwykle nie ma → `/admin/` odpowiada 404 i żaden test na tym nie polega.
     */
    adminDistDir?: string;
  } = {},
) {
  const pglite = new PGlite();
  // PGlite spełnia `Queryable` wprost, a transakcje ma własne (`transaction(cb)` daje
  // obiekt z `query`) - opakowanie dopasowuje tylko kształt do portu `Database`.
  const db: Database & { exec: (sql: string) => Promise<unknown> } = {
    query: (text, params) => pglite.query(text, params as never) as never,
    // Runner migracji szuka `exec` dla SQL-a wielopoleceniowego (patrz `migrate.ts`).
    exec: (sql) => pglite.exec(sql),
    transaction: (fn) => pglite.transaction((tx) => fn(tx as unknown as Queryable)) as never,
  };
  await migrate(db);
  // Świat referencyjny testów (dawny produkcyjny seed) - produkcyjny `seed()` stawia
  // od issue #50 wyłącznie konto administratora i ma własny `seed.test.ts`.
  await seedTestWorld(db, new ScryptHasher(), TEST_PASSWORD);

  const clock = new TestClock();
  const tokens = new Hs256Tokens(TEST_SECRET, clock);
  const realEvents = new PgEventsStore();
  const events = options.events?.(realEvents) ?? realEvents;
  const sessions = new PgSessionsProjection();
  const consumptionNorms = new PgConsumptionNormRepo();
  const flags = new PgFlagsRepo();
  const exportLog = new PgExportLogRepo();
  const pilots = new PgPilotsRepo(db);

  // Jak w produkcyjnym composition root: eksporter §4.7 jest domyślnie WŁĄCZONY
  // i pisze karty bazodanowym `PgSheets` - te same klasy co produkcja. Testy trybu
  // awarii/atrap podają własny `SheetsPort` przez `options.sheets`; odczyt
  // `GET /sheets/:tab` ZAWSZE czyta z bazy (atrapa pisze poza nią, więc trasa
  // odpowie 404 - zgodnie z prawdą).
  const pgSheets = new PgSheets(db, TEST_BASE_URL, clock);
  const exporter = new DayExporter(
    db,
    events,
    sessions,
    flags,
    exportLog,
    options.sheets ?? pgSheets,
    pilots,
    clock,
  );

  // Zrzut śladu (faza 5) - prawdziwy adapter plikowy na katalogu tymczasowym;
  // testy trasy zaglądają do NDJSON dokładnie tak, jak zrobi to skrypt replay.
  const tracesDir = mkdtempSync(join(tmpdir(), 'uzaero-traces-'));
  // Osie faz pionowych czytają ślady z TEGO SAMEGO katalogu, co ich zapis - pliki
  // poboczne lądują obok nagrań i znikają razem z katalogiem tymczasowym testu.
  const phaseTimeline = new FsPhaseTimeline(tracesDir, new FsTraceSource(tracesDir));

  const aircraftConfig = new PgAircraftConfigRepo();
  const auditedWrite = new AuditedWrite(db, options.audit ?? new PgAdminAuditRepo(), clock);
  // Jeden adapter flag dla komend i zapytań - tak jak w produkcyjnym composition root.
  const adminFlagsRepo = new PgAdminFlagsRepo();
  // Konta mają DWA adaptery, jak w produkcji: logowanie czyta `PgPilotsRepo` (hash),
  // panel pisze `PgAdminPilotsRepo` (transakcja śladu audytu).
  const adminPilotsRepo = new PgAdminPilotsRepo();
  // Flota ma własny adapter obok `PgReferenceRepo` i `PgAircraftConfigRepo` - jak
  // w produkcyjnym composition root.
  const adminFleetRepo = new PgAdminFleetRepo();
  // Monitor eksportu ma własny adapter obok `PgExportLogRepo` - jak w produkcyjnym
  // composition root.
  const adminExportsRepo = new PgAdminExportsRepo();
  // Konserwacja (A11) - jeden adapter na dwie drogi (podgląd i zapis), jak w produkcji.
  const adminMaintenanceRepo = new PgAdminMaintenanceRepo();
  const hasher = new ScryptHasher();
  // Zapytania floty mają DWÓCH konsumentów (trasy `A07` i pulpit) - jak w produkcyjnym
  // composition root, więc stoją w zmiennej, a nie w literale.
  const adminFleetQueries = new AdminFleetQueries(db, adminFleetRepo, sessions, adminPilotsRepo);
  // Ślad sesji też ma DWÓCH konsumentów (telefon i panel) i w produkcji jest jednym
  // egzemplarzem - odczyt wskazuje na TEN SAM katalog co zapis, więc test wysyła nagranie
  // przez `POST /traces` i odbiera je obiema trasami, czyli przechodzi drogę produkcyjną.
  const sessionTrack = new SessionTrackQueries(db, events, new FsTraceSource(tracesDir));

  const app = buildServer({
    auth: new AuthCommands(pilots, new PgRefreshTokens(db, clock), hasher, tokens, clock),
    reference: new ReferenceQueries(new PgReferenceRepo(db), db, sessions, consumptionNorms),
    ingest: new IngestCommands(db, events, sessions, flags, aircraftConfig, exporter, { events, norms: consumptionNorms, phases: phaseTimeline }, clock),
    // Odtworzenie rejestru telefonu (§4.9, issue #32) - prawdziwy adapter, więc test
    // wysyła zdarzenia przez `POST /events` i odbiera je przez `GET /me/events`,
    // czyli przechodzi dokładnie drogę telefonu po czyszczeniu pamięci.
    myEvents: new MyEventQueries(db, new PgMyEventsRepo()),
    state: new StateQueries(db, events, sessions, flags, exportLog),
    sheets: new SheetQueries(pgSheets),
    traces: new FsTraceSink(tracesDir),
    // Droga POWROTNA nagrania (issue #47) - ten sam katalog co zapis, więc test wysyła
    // ślad przez `POST /traces` i odbiera go przez `GET /me/sessions/:uuid/track`,
    // czyli przechodzi dokładnie drogę telefonu po skasowaniu lokalnej kopii.
    sessionTrack: new MySessionTrackQueries(sessionTrack),
    // Ten sam egzemplarz, co dla telefonu - w produkcji też jest jeden (`src/index.ts`),
    // więc test nie ma jak przeoczyć rozjazdu między mapą pilota a mapą administratora.
    adminSessionTrack: sessionTrack,
    prefs: new PrefsCommands(new PgPilotPrefsRepo(db)),
    // Podpowiedzi zadania dnia (issue #14) - PRAWDZIWY adapter nad projekcją, jak
    // w produkcyjnym composition root: test wysyła preflighty przez `POST /events`
    // i czyta podpowiedzi tą samą drogą, którą przejdą dane telefonu.
    taskSuggestions: new TaskSuggestionQueries(db, new PgTaskSuggestionsRepo()),
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
    // Konta (A06/A06a). Hasło startowe jedzie PRAWDZIWYM generatorem - testy czytają
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
    // Flota (A07/A07a) - `randomUUID` jak w produkcji: identyfikator jednostki testy
    // czytają z odpowiedzi, więc udawany generator kupiłby wyłącznie rozjazd
    // z composition rootem.
    adminFleet: new AdminFleetCommands(auditedWrite, adminFleetRepo, randomUUID),
    adminFleetQueries,
    // Eksporty (A05). Komenda ponowienia dostaje TEN SAM `exporter`, którym jedzie
    // ingest - także wtedy, gdy `options.sheets` podmienia arkusze na atrapę awarii.
    // Podgląd karty czyta ZAWSZE z bazy (`pgSheets`), tak jak `GET /sheets/:tab`.
    adminExports: new AdminExportCommands(auditedWrite, adminExportsRepo, exporter, clock),
    adminExportQueries: new AdminExportQueries(db, adminExportsRepo, pgSheets),
    // `randomUUID` jak w produkcji - uuid korekty testy czytają z odpowiedzi, więc
    // udawany generator nie kupiłby nic poza rozjazdem z composition rootem.
    adminCorrections: new AdminCorrectionCommands(
      auditedWrite,
      events,
      sessions,
      aircraftConfig,
      exporter,
      flags,
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
    // Rejestr zdarzeń (A04) - trzeci adapter nad `events`, jak w produkcyjnym
    // composition root: ingest, metadane karty dnia i lista śledcza to trzy różne
    // pytania. Jedzie tu PRAWDZIWY adapter także wtedy, gdy `options.events`
    // podmienia magazyn ingestu - rejestr czyta kolumny, nie strumień.
    adminEventQueries: new AdminEventQueries(db, new PgAdminEventsReadRepo()),
    // Pulpit (A01/A01a) - składany z TYCH SAMYCH zapytań i adapterów, co ekrany
    // docelowe. `events` jedzie tu przez dekorator z `options.events`, więc
    // `contract.test.ts` widzi także odczyty strumienia robione przez pulpit.
    // Konserwacja (A11) - PORÓWNANIE jedzie zapytaniem bez `AuditedWrite` (zero
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
    // Statystyki (A10) - jak w produkcyjnym composition root: czysty odczyt agregatów
    // kolumn projekcji, zegar rozstrzyga zakres domyślny.
    adminStatsQueries: new AdminStatsQueries(db, new PgAdminStatsRepo(), clock),
    adminLogQueries: new AdminLogQueries(db, new PgAdminLogRepo(), clock),
    // Analityka zużycia (A10a/A10b) - dostaje TEN SAM `events`, co reszta harnessu,
    // więc dekorator liczący odczyty strumienia widzi też jej wywołania.
    adminConsumptionQueries: new AdminConsumptionQueries(
      db,
      new PgAdminConsumptionRepo(),
      events,
      clock,
      phaseTimeline,
    ),
    // Dziennik żądań na konsoli zgaszony: kilkaset linii na przebieg zakryłoby to,
    // po co czyta się wynik testów. Sam format ma własny test jednostkowy.
  }, { requestLog: false, adminDistDir: options.adminDistDir });

  // `auditedWrite` i porty wychodzą na zewnątrz, żeby testy komend administracyjnych
  // wołanych POZA HTTP (przebudowa projekcji = CLI) składały je z tych samych klas.
  return { app, db, clock, tokens, tracesDir, auditedWrite, events, sessions };
}
