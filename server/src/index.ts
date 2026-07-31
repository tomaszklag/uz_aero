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
import { AdminFlagCommands } from './application/admin/commands/flags.ts';
import { AuditedWrite } from './application/admin/auditedWrite.ts';
import { AuthCommands } from './application/commands/auth.ts';
import { IngestCommands } from './application/commands/ingest.ts';
import { PrefsCommands } from './application/commands/prefs.ts';
import { DayExporter } from './application/export/dayExporter.ts';
import { ReferenceQueries } from './application/queries/reference.ts';
import { SheetQueries } from './application/queries/sheets.ts';
import { StateQueries } from './application/queries/aircraftState.ts';
import { Hs256Tokens } from './infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from './infrastructure/auth/scryptHasher.ts';
import { PgAdminAuditRepo } from './infrastructure/pg/admin/auditRepo.ts';
import { PgAdminFlagsRepo } from './infrastructure/pg/admin/flagsRepo.ts';
import { PgAircraftConfigRepo } from './infrastructure/pg/aircraftConfigRepo.ts';
import { PgDatabase } from './infrastructure/pg/database.ts';
import { PgEventsStore } from './infrastructure/pg/eventsStore.ts';
import { PgExportLogRepo } from './infrastructure/pg/exportLogRepo.ts';
import { PgFlagsRepo } from './infrastructure/pg/flagsRepo.ts';
import { PgSessionsProjection } from './infrastructure/pg/sessionsProjection.ts';
import { migrate } from './infrastructure/pg/migrate.ts';
import { PgPilotPrefsRepo } from './infrastructure/pg/pilotPrefsRepo.ts';
import { PgPilotsRepo } from './infrastructure/pg/pilotsRepo.ts';
import { PgRefreshTokens } from './infrastructure/pg/refreshTokensRepo.ts';
import { PgReferenceRepo } from './infrastructure/pg/referenceRepo.ts';
import { PgSheets } from './infrastructure/pg/sheetsRepo.ts';
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

const app = buildServer({
  auth: new AuthCommands(pilots, new PgRefreshTokens(db, clock), new ScryptHasher(), tokens, clock),
  reference: new ReferenceQueries(new PgReferenceRepo(db), db, sessions),
  ingest: new IngestCommands(db, events, sessions, flags, aircraftConfig, exporter),
  state: new StateQueries(db, events, sessions, flags, exportLog),
  sheets: new SheetQueries(sheets),
  traces: new FsTraceSink(env.TRACES_DIR),
  prefs: new PrefsCommands(new PgPilotPrefsRepo(db)),
  tokens,
  adminFlags: new AdminFlagCommands(auditedWrite, new PgAdminFlagsRepo(), exporter, clock),
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
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`UZ Aero server: http://localhost:${env.PORT}`);
