/**
 * UZ Aero (serwer) — composition root.
 *
 * Jedyne miejsce, które zna WSZYSTKIE konkrety naraz: config z env, pulę Postgresa,
 * adaptery i złożenie ich w komendy/zapytania. Reszta kodu dostaje zależności
 * konstruktorem — dokładnie jak `bootstrap/` w aplikacji mobilnej.
 */

import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { z } from 'zod';

import { AdminCorrectionCommands } from './application/admin/commands/corrections.ts';
import { AdminExportCommands } from './application/admin/commands/exports.ts';
import { AdminFlagCommands } from './application/admin/commands/flags.ts';
import { AdminFleetCommands } from './application/admin/commands/fleet.ts';
import { AdminPilotCommands } from './application/admin/commands/pilots.ts';
import { AdminAuditQueries } from './application/admin/queries/audit.ts';
import { AdminCorrectionQueries } from './application/admin/queries/corrections.ts';
import { AdminExportQueries } from './application/admin/queries/exports.ts';
import { AdminFlagQueries } from './application/admin/queries/flags.ts';
import { AdminFleetQueries } from './application/admin/queries/fleet.ts';
import { AdminMeQueries } from './application/admin/queries/me.ts';
import { AdminPilotQueries } from './application/admin/queries/pilots.ts';
import { AdminSessionQueries } from './application/admin/queries/sessions.ts';
import { AuditedWrite } from './application/admin/auditedWrite.ts';
import { AuthCommands } from './application/common/commands/auth.ts';
import { IngestCommands } from './application/mobile/commands/ingest.ts';
import { PrefsCommands } from './application/mobile/commands/prefs.ts';
import { DayExporter } from './application/common/export/dayExporter.ts';
import { ReferenceQueries } from './application/mobile/queries/reference.ts';
import { SheetQueries } from './application/common/queries/sheets.ts';
import { StateQueries } from './application/mobile/queries/aircraftState.ts';
import { Hs256Tokens } from './infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from './infrastructure/auth/scryptHasher.ts';
import { generateStartPassword } from './infrastructure/auth/startPassword.ts';
import { PgAdminAuditReadRepo } from './infrastructure/pg/admin/auditReadRepo.ts';
import { PgAdminAuditRepo } from './infrastructure/pg/admin/auditRepo.ts';
import { PgAdminEventsRepo } from './infrastructure/pg/admin/eventsRepo.ts';
import { PgAdminExportsRepo } from './infrastructure/pg/admin/exportsRepo.ts';
import { PgAdminFlagsRepo } from './infrastructure/pg/admin/flagsRepo.ts';
import { PgAdminFleetRepo } from './infrastructure/pg/admin/fleetRepo.ts';
import { PgAdminPilotsRepo } from './infrastructure/pg/admin/pilotsRepo.ts';
import { PgAdminRefreshTokensRepo } from './infrastructure/pg/admin/refreshTokensRepo.ts';
import { PgAdminSessionsRepo } from './infrastructure/pg/admin/sessionsRepo.ts';
import { PgAircraftConfigRepo } from './infrastructure/pg/common/aircraftConfigRepo.ts';
import { PgDatabase } from './infrastructure/pg/database.ts';
import { PgEventsStore } from './infrastructure/pg/common/eventsStore.ts';
import { PgExportLogRepo } from './infrastructure/pg/common/exportLogRepo.ts';
import { PgFlagsRepo } from './infrastructure/pg/common/flagsRepo.ts';
import { PgSessionsProjection } from './infrastructure/pg/common/sessionsProjection.ts';
import { migrate } from './infrastructure/pg/migrate.ts';
import { PgPilotPrefsRepo } from './infrastructure/pg/mobile/pilotPrefsRepo.ts';
import { PgPilotsRepo } from './infrastructure/pg/common/pilotsRepo.ts';
import { PgRefreshTokens } from './infrastructure/pg/common/refreshTokensRepo.ts';
import { PgReferenceRepo } from './infrastructure/pg/mobile/referenceRepo.ts';
import { PgSheets } from './infrastructure/pg/common/sheetsRepo.ts';
import { FsTraceSink } from './infrastructure/traces/fsTraceSink.ts';
import { buildServer } from './http/server.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().positive().default(3000),
    /** Adres serwera widziany Z TELEFONU — baza linków do kart (`GET /sheets/:tab`). */
    PUBLIC_BASE_URL: z.string().url().optional(),
    /** Katalog zrzutu śladu kalibracyjnego (faza 5) — NDJSON per sesja. */
    TRACES_DIR: z.string().default('./traces'),
  })
  .parse(process.env);

const clock = { now: () => new Date() };
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = new PgDatabase(pool);

await migrate(db);

const tokens = new Hs256Tokens(env.JWT_SECRET, clock);
const events = new PgEventsStore();
const sessions = new PgSessionsProjection();
const flags = new PgFlagsRepo();
const exportLog = new PgExportLogRepo();
const pilots = new PgPilotsRepo(db);

// Eksport §4.7 działa END-TO-END na adapterze bazodanowym: `day_close` → karta
// w `exported_sheets` → wpis w `export_log` → link w sync-status, serwowany pod
// `GET /sheets/:tab`. Adapter Google (konto serwisowe, zmienne `GOOGLE_*`
// w `.env.example`) będzie podmianą TEGO SAMEGO portu w tym miejscu.
// `PUBLIC_BASE_URL` = adres, pod którym telefony widzą serwer — linki do kart
// muszą być klikalne z telefonu, nie z localhosta serwera.
const sheets = new PgSheets(db, env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`, clock);
const exporter = new DayExporter(db, events, flags, exportLog, sheets, pilots, clock);

// Panel administracyjny. `AuditedWrite` jest JEDYNĄ drogą zapisu komend panelu —
// dlatego to ono, a nie `db`, wędruje do konstruktora `AdminFlagCommands`.
const auditedWrite = new AuditedWrite(db, new PgAdminAuditRepo(), clock);
const aircraftConfig = new PgAircraftConfigRepo();
// Strona ODCZYTU panelu dostaje `db` wprost — bramy `AuditedWrite` wymagają wyłącznie
// komendy, bo tylko one zapisują. Adapter flag jest WSPÓLNY dla zapytań i komend:
// to jeden port, jeden adapter, dwa powody wołania.
const adminFlagsRepo = new PgAdminFlagsRepo();
// Konta mają DWA adaptery i to jest ta sama decyzja, co przy flagach: logowanie czyta
// `PgPilotsRepo` (hash, własny uchwyt do bazy), panel pisze `PgAdminPilotsRepo`
// (transakcja śladu audytu). Ścieżka logowania nie ma jak zregresować od panelu kont.
const adminPilotsRepo = new PgAdminPilotsRepo();
// Flota ma TRZECI adapter tej samej tabeli i to jest ta sama decyzja, co przy kontach:
// `PgReferenceRepo` buduje migawkę pod cache telefonów, `PgAircraftConfigRepo` oddaje
// jedną liczbę w transakcji ingestu, a ten pisze konfigurację w transakcji audytu.
const adminFleetRepo = new PgAdminFleetRepo();
// Monitor eksportu (A05) czyta projekcję OD STRONY ARKUSZA (dzień bez karty jest jego
// najważniejszym wierszem), więc ma własny adapter obok `PgExportLogRepo` — tamten
// obsługuje ścieżkę eksportu i `sync-status` telefonu, ten listy panelu.
const adminExportsRepo = new PgAdminExportsRepo();
const hasher = new ScryptHasher();

const app = buildServer({
  auth: new AuthCommands(pilots, new PgRefreshTokens(db, clock), hasher, tokens, clock),
  reference: new ReferenceQueries(new PgReferenceRepo(db), db, sessions),
  ingest: new IngestCommands(db, events, sessions, flags, aircraftConfig, exporter),
  state: new StateQueries(db, events, sessions, flags, exportLog),
  sheets: new SheetQueries(sheets),
  traces: new FsTraceSink(env.TRACES_DIR),
  prefs: new PrefsCommands(new PgPilotPrefsRepo(db)),
  tokens,
  // Brama tras panelu czyta konto przy KAŻDYM żądaniu — bez tego „Deaktywuj" na A06
  // odcinałby dostęp dopiero po wygaśnięciu 8-godzinnej sesji (`http/authorize.ts`).
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
  // Sesja przeglądarkowa czyta konto tym samym adapterem co logowanie telefonu —
  // panel i telefon logują się do tej samej tabeli kont, bo to ci sami ludzie.
  adminMeQueries: new AdminMeQueries(pilots),
  // Konta (A06/A06a). Hasło startowe generuje SERWER — panel nigdy go nie wysyła,
  // a wartość opuszcza system dokładnie raz, w odpowiedzi na akcję, która ją wytworzyła.
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
  // Flota (A07/A07a). `randomUUID` jako identyfikator jednostki — rejestracja jest
  // etykietą, nie kluczem: zdarzenia wiążą się z `aircraft_id`, więc przemalowanie
  // znaków na kadłubie nie ma prawa oderwać samolotu od jego nalotu.
  adminFleet: new AdminFleetCommands(auditedWrite, adminFleetRepo, randomUUID),
  // Zapytania floty dostają projekcję sesji, bo claim i ostatni odczyt liczników są
  // REGUŁĄ (`application/common/aircraftStateView.ts`) — tą samą, którą `GET /reference`
  // liczy dla telefonu. Drugie wyliczenie w SQL-u panelu dałoby dwie odpowiedzi na
  // pytanie „kto trzyma ten samolot".
  adminFleetQueries: new AdminFleetQueries(db, adminFleetRepo, sessions, adminPilotsRepo),
  // Eksporty (A05). Komenda ponowienia woła TEGO SAMEGO `exporter`, którego używa
  // ingest i rozwiązanie flagi — ponowienie jest powtórzeniem tej samej operacji,
  // a nie jej wersją uprzywilejowaną, więc bramki §4.7 obowiązują ją tak samo.
  adminExports: new AdminExportCommands(auditedWrite, adminExportsRepo, exporter, clock),
  // Zapytania monitora dostają `SheetsReadPort`, bo podgląd karty w panelu czyta tę
  // samą treść, co `GET /sheets/:tab` z telefonu — inaczej panel pokazywałby drugą,
  // własną wersję dokumentu klubu.
  adminExportQueries: new AdminExportQueries(db, adminExportsRepo, sheets),
  // Uuid korekty jest FUNKCJĄ, nie portem: nie ma tu adaptera do podmiany, a port
  // bez drugiej implementacji to koszt bez zysku (`commands/corrections.ts`).
  adminCorrections: new AdminCorrectionCommands(
    auditedWrite,
    events,
    sessions,
    aircraftConfig,
    exporter,
    clock,
    randomUUID,
  ),
  // Podgląd korekty dostaje `db` wprost i NIE dostaje `AuditedWrite` — nie ma czym
  // zapisać, bo nie ma czego zapisywać (`queries/corrections.ts`).
  adminCorrectionQueries: new AdminCorrectionQueries(
    db,
    events,
    new PgAdminEventsRepo(),
    aircraftConfig,
    clock,
  ),
  // Dziennik audytu ma DWA adaptery i to jest celowe: zapis (`PgAdminAuditRepo`)
  // wędruje do bramy `AuditedWrite`, odczyt (`PgAdminAuditReadRepo`) do zapytań.
  // Brama, która przy okazji umie czytać listy, przestaje być bramą.
  adminAuditQueries: new AdminAuditQueries(db, new PgAdminAuditReadRepo()),
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`UZ Aero server: http://localhost:${env.PORT}`);
