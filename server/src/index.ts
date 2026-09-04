/**
 * UZ Aero (serwer) - composition root.
 *
 * Jedyne miejsce, które zna WSZYSTKIE konkrety naraz: config z env, pulę Postgresa,
 * adaptery i złożenie ich w komendy/zapytania. Reszta kodu dostaje zależności
 * konstruktorem - dokładnie jak `bootstrap/` w aplikacji mobilnej.
 */

import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { z } from 'zod';

import { AdminCorrectionCommands } from './application/admin/commands/corrections.ts';
import { AdminSessionVoidCommands } from './application/admin/commands/sessionVoid.ts';
import { AdminSessionCloseCommands } from './application/admin/commands/sessionClose.ts';
import { AdminExportCommands } from './application/admin/commands/exports.ts';
import { AdminFlagCommands } from './application/admin/commands/flags.ts';
import { AdminFleetCommands } from './application/admin/commands/fleet.ts';
import { AdminAircraftReadingCommands } from './application/admin/commands/aircraftReadings.ts';
import { AdminBugReportCommands } from './application/admin/commands/bugReports.ts';
import { AdminMaintenanceCommands } from './application/admin/commands/maintenance.ts';
import { AdminPilotCommands } from './application/admin/commands/pilots.ts';
import { AdminAuditQueries } from './application/admin/queries/audit.ts';
import { AdminBugReportQueries } from './application/admin/queries/bugReports.ts';
import { AdminCorrectionQueries } from './application/admin/queries/corrections.ts';
import { AdminDashboardQueries } from './application/admin/queries/dashboard.ts';
import { AdminEventQueries } from './application/admin/queries/events.ts';
import { AdminExportQueries } from './application/admin/queries/exports.ts';
import { AdminFlagQueries } from './application/admin/queries/flags.ts';
import { AdminFleetQueries } from './application/admin/queries/fleet.ts';
import { AdminMaintenanceQueries } from './application/admin/queries/maintenance.ts';
import { AdminMeQueries } from './application/admin/queries/me.ts';
import { AdminPilotQueries } from './application/admin/queries/pilots.ts';
import { AdminSessionQueries } from './application/admin/queries/sessions.ts';
import { AdminConsumptionQueries } from './application/admin/queries/consumption.ts';
import { AdminLogQueries } from './application/admin/queries/log.ts';
import { AdminStatsQueries } from './application/admin/queries/stats.ts';
import { AuditedWrite } from './application/admin/auditedWrite.ts';
import { PgAircraftReadingsRepo } from './infrastructure/pg/common/aircraftReadingsRepo.ts';
import { PgBugReportsRepo } from './infrastructure/pg/common/bugReportsRepo.ts';
import { AuthCommands } from './application/common/commands/auth.ts';
import { IngestCommands } from './application/mobile/commands/ingest.ts';
import { BugReportCommands } from './application/mobile/commands/bugReports.ts';
import { PrefsCommands } from './application/mobile/commands/prefs.ts';
import { DayExporter } from './application/common/export/dayExporter.ts';
import { MyEventQueries } from './application/mobile/queries/myEvents.ts';
import { MySessionTrackQueries } from './application/mobile/queries/sessionTrack.ts';
import { ReferenceQueries } from './application/mobile/queries/reference.ts';
import { TaskSuggestionQueries } from './application/mobile/queries/taskSuggestions.ts';
import { SessionTrackQueries } from './application/common/queries/sessionTrack.ts';
import { SheetQueries } from './application/common/queries/sheets.ts';
import { StateQueries } from './application/mobile/queries/aircraftState.ts';
import { Hs256Tokens } from './infrastructure/auth/hs256Tokens.ts';
import { ScryptHasher } from './infrastructure/auth/scryptHasher.ts';
import { generateStartPassword } from './infrastructure/auth/startPassword.ts';
import { PgAdminAuditReadRepo } from './infrastructure/pg/admin/auditReadRepo.ts';
import { PgAdminAuditRepo } from './infrastructure/pg/admin/auditRepo.ts';
import { PgAdminDashboardRepo } from './infrastructure/pg/admin/dashboardRepo.ts';
import { PgAdminEventsReadRepo } from './infrastructure/pg/admin/eventsReadRepo.ts';
import { PgAdminEventsRepo } from './infrastructure/pg/admin/eventsRepo.ts';
import { PgAdminExportsRepo } from './infrastructure/pg/admin/exportsRepo.ts';
import { PgAdminFlagsRepo } from './infrastructure/pg/admin/flagsRepo.ts';
import { PgAdminFleetRepo } from './infrastructure/pg/admin/fleetRepo.ts';
import { PgAdminMaintenanceRepo } from './infrastructure/pg/admin/maintenanceRepo.ts';
import { PgAdminPilotsRepo } from './infrastructure/pg/admin/pilotsRepo.ts';
import { PgAdminRefreshTokensRepo } from './infrastructure/pg/admin/refreshTokensRepo.ts';
import { PgAdminSessionsRepo } from './infrastructure/pg/admin/sessionsRepo.ts';
import { PgAdminConsumptionRepo } from './infrastructure/pg/admin/consumptionRepo.ts';
import { PgAdminLogRepo } from './infrastructure/pg/admin/logRepo.ts';
import { PgAdminStatsRepo } from './infrastructure/pg/admin/statsRepo.ts';
import { PgAircraftConfigRepo } from './infrastructure/pg/common/aircraftConfigRepo.ts';
import { PgDatabase } from './infrastructure/pg/database.ts';
import { PgConsumptionNormRepo } from './infrastructure/pg/common/consumptionNormRepo.ts';
import { PgEventsStore } from './infrastructure/pg/common/eventsStore.ts';
import { PgExportLogRepo } from './infrastructure/pg/common/exportLogRepo.ts';
import { PgFlagsRepo } from './infrastructure/pg/common/flagsRepo.ts';
import { PgSessionsProjection } from './infrastructure/pg/common/sessionsProjection.ts';
import { migrate } from './infrastructure/pg/migrate.ts';
import { seed } from './infrastructure/pg/seed.ts';
import { PgPilotPrefsRepo } from './infrastructure/pg/mobile/pilotPrefsRepo.ts';
import { PgPilotsRepo } from './infrastructure/pg/common/pilotsRepo.ts';
import { PgRefreshTokens } from './infrastructure/pg/common/refreshTokensRepo.ts';
import { PgMyEventsRepo } from './infrastructure/pg/mobile/myEventsRepo.ts';
import { PgReferenceRepo } from './infrastructure/pg/mobile/referenceRepo.ts';
import { PgTaskSuggestionsRepo } from './infrastructure/pg/mobile/taskSuggestionsRepo.ts';
import { PgSheets } from './infrastructure/pg/common/sheetsRepo.ts';
import { FsPhaseTimeline } from './infrastructure/traces/fsPhaseTimeline.ts';
import { FsTraceSink } from './infrastructure/traces/fsTraceSink.ts';
import { FsTraceSource } from './infrastructure/traces/fsTraceSource.ts';
import { buildServer } from './http/server.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().positive().default(3000),
    /** Adres serwera widziany Z TELEFONU - baza linków do kart (`GET /sheets/:tab`). */
    PUBLIC_BASE_URL: z.string().url().optional(),
    /** Katalog zrzutu śladu kalibracyjnego (faza 5) - NDJSON per sesja. */
    TRACES_DIR: z.string().default('./traces'),
    /** `1` = serwer stoi ZA proxy TLS (Railway itp.) i wierzy `X-Forwarded-*`. */
    TRUST_PROXY: z.string().optional(),
    /**
     * Ustawione = serwer przy KAŻDYM starcie zapewnia konto `admin` (ten sam
     * idempotentny `seed()`, co `npm run seed`). Droga dla hostingu bez ręki na
     * konsoli (Railway): jedna zmienna w UI zamiast tunelu do bazy. Powtórny start
     * nie resetuje hasła ani `active` - dokłada najwyżej rolę admin (droga awaryjna).
     */
    SEED_PASSWORD: z.string().min(8, 'SEED_PASSWORD: minimum 8 znaków').optional(),
  })
  .parse(process.env);

const clock = { now: () => new Date() };
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = new PgDatabase(pool);

await migrate(db);

// Bootstrap konta administratora - patrz docblock SEED_PASSWORD w schemacie env.
if (env.SEED_PASSWORD != null) {
  await seed(db, new ScryptHasher(), { adminPassword: env.SEED_PASSWORD });
  console.log('Seed: konto administratora „admin" zapewnione (SEED_PASSWORD ustawione).');
}

const tokens = new Hs256Tokens(env.JWT_SECRET, clock);
const events = new PgEventsStore();
const sessions = new PgSessionsProjection();
// Norma zużycia (`aircraft_consumption`) - produkuje ją analityka panelu, konsumuje aplikacja
// pilota, więc port siedzi w `application/common/` i trafia do OBU stron: ingestu
// (przelicza po zamknięciu dnia) i `GET /reference` (oddaje telefonom).
const consumptionNorms = new PgConsumptionNormRepo();
// Osie faz pionowych: pliki poboczne przy śladach, liczone leniwie i unieważniane
// rozmiarem nagrania. Wchodzą i do analityki panelu, i do przeliczenia normy.
const phaseTimeline = new FsPhaseTimeline(env.TRACES_DIR, new FsTraceSource(env.TRACES_DIR));
const flags = new PgFlagsRepo();
const exportLog = new PgExportLogRepo();
const pilots = new PgPilotsRepo(db);

// Eksport §4.7 działa END-TO-END na adapterze bazodanowym: `day_close` → karta
// w `exported_sheets` → wpis w `export_log` → link w sync-status, serwowany pod
// `GET /sheets/:tab`. Adapter Google (konto serwisowe, zmienne `GOOGLE_*`
// w `.env.example`) będzie podmianą TEGO SAMEGO portu w tym miejscu.
// `PUBLIC_BASE_URL` = adres, pod którym telefony widzą serwer - linki do kart
// muszą być klikalne z telefonu, nie z localhosta serwera.
const sheets = new PgSheets(db, env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`, clock);
// Eksporter dostaje projekcję sesji, bo karta jest DOBĄ SAMOLOTU (§4.7): jej skład -
// które zmiany przejęły maszynę tego dnia i czy zostały zdane - czyta się z `sessions`,
// a nie ze strumienia. Strumień wchodzi dopiero per sesja, po tabelę lotów.
const exporter = new DayExporter(db, events, sessions, flags, exportLog, sheets, pilots, clock);

// Panel administracyjny. `AuditedWrite` jest JEDYNĄ drogą zapisu komend panelu -
// dlatego to ono, a nie `db`, wędruje do konstruktora `AdminFlagCommands`.
const auditedWrite = new AuditedWrite(db, new PgAdminAuditRepo(), clock);
const aircraftConfig = new PgAircraftConfigRepo();
// Strona ODCZYTU panelu dostaje `db` wprost - bramy `AuditedWrite` wymagają wyłącznie
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
// najważniejszym wierszem), więc ma własny adapter obok `PgExportLogRepo` - tamten
// obsługuje ścieżkę eksportu i `sync-status` telefonu, ten listy panelu.
const adminExportsRepo = new PgAdminExportsRepo();
// Konserwacja (A11) ma JEDEN adapter na dwie drogi: zapytania (porównanie projekcji,
// stan tokenów i schematu) i komendę (nadpisanie, czyszczenie). To jeden port i jeden
// powód istnienia - narzędzia serwisowe jednego ekranu - więc drugi adapter kupiłby
// wyłącznie okazję do rozjazdu między tym, co pokazuje podgląd, a tym, co zapisze zapis.
const adminMaintenanceRepo = new PgAdminMaintenanceRepo();
const hasher = new ScryptHasher();

// Zapytania floty stoją TU, a nie w literale niżej, bo mają DWÓCH konsumentów: trasy
// `A07` i pulpit. Pulpit dostaje całą klasę, nie jej adapter - to ona zna regułę wyboru
// claimu i przekazania (`application/common/aircraftStateView.ts`) oraz rozwiązuje próg
// flagi funkcją domeny. Drugie wyliczenie tych rzeczy na pulpicie dałoby dwie odpowiedzi
// na pytanie „kto trzyma ten samolot".
// Odczyty wpisane ręką administratora (issue #81) - JEDEN adapter dla obu powierzchni:
// `GET /reference` i karta samolotu w panelu liczą z niego to samo przekazanie.
const aircraftReadings = new PgAircraftReadingsRepo();
// Zgłoszenia błędów (issue #87) - JEDEN adapter dla obu powierzchni: telefon pisze,
// panel czyta i przestawia status. Druga kopia zapytania byłaby pierwszym miejscem,
// w którym lista zaczęłaby pokazywać co innego niż szuflada.
const bugReports = new PgBugReportsRepo();
const adminFleetQueries = new AdminFleetQueries(
  db,
  adminFleetRepo,
  sessions,
  adminPilotsRepo,
  aircraftReadings,
);

// Ślad sesji stoi TU z tego samego powodu: DWÓCH konsumentów, jedna geometria. Telefon
// dostaje go przez bramkę właściciela (`MySessionTrackQueries`), panel wprost - bo ślad
// jednego biegu silnika ma po obu stronach wyglądać identycznie (issue #38). Ten sam
// katalog nagrań i ten sam adapter odczytu: jedno nagranie, dwie powierzchnie, żadnej
// drugiej kopii.
const sessionTrack = new SessionTrackQueries(db, events, new FsTraceSource(env.TRACES_DIR));

const app = buildServer({
  auth: new AuthCommands(pilots, new PgRefreshTokens(db, clock), hasher, tokens, clock),
  reference: new ReferenceQueries(
    new PgReferenceRepo(db),
    db,
    sessions,
    consumptionNorms,
    events,
    aircraftReadings,
  ),
  ingest: new IngestCommands(db, events, sessions, flags, aircraftConfig, exporter, { events, norms: consumptionNorms, phases: phaseTimeline }, clock),
  // Droga POWROTNA outboxa (§4.9, issue #32) - własny adapter obok `PgEventsStore`,
  // bo to inne pytanie do tej samej tabeli: tamten czyta strumień JEDNEJ sesji przy
  // ingescie, ten stronicuje rejestr JEDNEGO PILOTA przez wszystkie jego sesje.
  myEvents: new MyEventQueries(db, new PgMyEventsRepo()),
  state: new StateQueries(db, events, sessions, flags, exportLog),
  sheets: new SheetQueries(sheets),
  traces: new FsTraceSink(env.TRACES_DIR),
  // Droga POWROTNA nagrania (issue #47) - telefon oddaje ślad i kasuje swoją kopię,
  // więc ekran 14 pobiera gotową geometrię stąd. Cienka warstwa nad wspólnym zapytaniem:
  // dokłada JEDNO zdanie o uprawnieniu („to nie jest twoja sesja") i nic poza tym.
  sessionTrack: new MySessionTrackQueries(sessionTrack),
  prefs: new PrefsCommands(new PgPilotPrefsRepo(db)),
  // Zgłoszenia z telefonu (issue #87) - bez transakcji i bez projekcji: zgłoszenie
  // opisuje aplikację, nie lot, więc nie ma czego uzgadniać z rejestrem.
  bugReports: new BugReportCommands(db, bugReports),
  // Podpowiedzi zadania dnia (issue #14) - własny adapter nad `sessions` obok
  // `PgSessionsProjection`, bo to inne pytanie: tamten czyta i pisze POJEDYNCZY wiersz
  // sesji, ten agreguje kolumny wielu wierszy w listę wartości do podpowiedzenia.
  taskSuggestions: new TaskSuggestionQueries(db, new PgTaskSuggestionsRepo()),
  tokens,
  // Brama tras panelu czyta konto przy KAŻDYM żądaniu - bez tego „Deaktywuj" na A06
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
  // Ślad sesji w dzienniku: okno biegu z rejestru, geometria z plików NDJSON. Ten sam
  // egzemplarz, z którego czyta telefon - patrz wyżej.
  adminSessionTrack: sessionTrack,
  adminFlagQueries: new AdminFlagQueries(db, adminFlagsRepo),
  // Sesja przeglądarkowa czyta konto tym samym adapterem co logowanie telefonu -
  // panel i telefon logują się do tej samej tabeli kont, bo to ci sami ludzie.
  adminMeQueries: new AdminMeQueries(pilots),
  // Konta (A06/A06a). Hasło startowe generuje SERWER - panel nigdy go nie wysyła,
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
  // Flota (A07/A07a). `randomUUID` jako identyfikator jednostki - rejestracja jest
  // etykietą, nie kluczem: zdarzenia wiążą się z `aircraft_id`, więc przemalowanie
  // znaków na kadłubie nie ma prawa oderwać samolotu od jego nalotu.
  adminFleet: new AdminFleetCommands(auditedWrite, adminFleetRepo, randomUUID),
  // Odczyty wpisane ręką administratora (issue #81) - osobna komenda i osobny wpis
  // audytu, bo to nie jest konfiguracja jednostki, tylko decyzja o jednej chwili.
  adminAircraftReadings: new AdminAircraftReadingCommands(
    auditedWrite,
    adminFleetRepo,
    aircraftReadings,
    clock,
  ),
  // Zapytania floty dostają projekcję sesji, bo claim i ostatni odczyt liczników są
  // REGUŁĄ (`application/common/aircraftStateView.ts`) - tą samą, którą `GET /reference`
  // liczy dla telefonu. Drugie wyliczenie w SQL-u panelu dałoby dwie odpowiedzi na
  // pytanie „kto trzyma ten samolot".
  adminFleetQueries,
  // Eksporty (A05). Komenda ponowienia woła TEGO SAMEGO `exporter`, którego używa
  // ingest i rozwiązanie flagi - ponowienie jest powtórzeniem tej samej operacji,
  // a nie jej wersją uprzywilejowaną, więc bramki §4.7 obowiązują ją tak samo.
  adminExports: new AdminExportCommands(auditedWrite, adminExportsRepo, exporter, clock),
  // Zapytania monitora dostają `SheetsReadPort`, bo podgląd karty w panelu czyta tę
  // samą treść, co `GET /sheets/:tab` z telefonu - inaczej panel pokazywałby drugą,
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
    // Flagi łańcucha (§4.5) - od issue #43 korekta `amend` potrafi ruszyć ich wejście,
    // więc komenda musi umieć je otworzyć tak samo jak ingest.
    flags,
    clock,
    randomUUID,
  ),
  // Unieważnienie CAŁEJ sesji (2026-08-31). Ten sam `exporter`, co korekta i ingest:
  // karta doby ma po wycofaniu wpisu powstać od nowa, bez niego. Flag łańcucha NIE
  // dostaje - wycofana sesja wypada z łańcucha MH sama, bo przestaje być `closed`.
  adminSessionVoid: new AdminSessionVoidCommands(
    auditedWrite,
    events,
    sessions,
    aircraftConfig,
    exporter,
    clock,
    randomUUID,
  ),
  // Zakończenie administracyjne operacji osieroconej (issue #81) - te same zależności,
  // co unieważnienie: zdarzenie do rejestru, projekcja, eksport karty PO commicie.
  adminSessionClose: new AdminSessionCloseCommands(
    auditedWrite,
    events,
    sessions,
    aircraftConfig,
    exporter,
    clock,
    randomUUID,
  ),
  // Podgląd korekty dostaje `db` wprost i NIE dostaje `AuditedWrite` - nie ma czym
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
  // Rejestr zdarzeń (A04). Trzeci adapter nad `events` obok magazynu ingestu
  // (`PgEventsStore`) i metadanych karty dnia (`PgAdminEventsRepo`) - bo trzecie jest
  // pytanie: lista śledcza z kursorem i licznikami. Ingest nie ma jak zregresować
  // od zmian w tym ekranie.
  adminEventQueries: new AdminEventQueries(db, new PgAdminEventsReadRepo()),
  // Pulpit (A01/A01a). Dostaje ZAPYTANIA innych ekranów, a nie ich adaptery - bo jego
  // treścią jest właśnie to, że każda liczba pochodzi z tego samego kodu, co ekran
  // docelowy. `events` jedzie osobno i wyłącznie po to, żeby policzyć stan silnika
  // jednostek z otwartą sesją; `PgAdminDashboardRepo` obsługuje puls rejestru.
  // Konserwacja (A11). Dwie drogi i to jest cała treść tego przekroju: PORÓWNANIE
  // projekcji jest zapytaniem (bez `AuditedWrite`, więc bez czym zapisać i bez wpisu
  // w dzienniku o akcji, której nie było), NADPISANIE - komendą przez bramę audytu.
  // Ocena różnic jest wspólna (`application/admin/projectionScan.ts`), więc podgląd
  // i zapis nie mogą powiedzieć dwóch różnych rzeczy o tej samej bazie.
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
  // Statystyki (A10) - czysty odczyt agregatów kolumn projekcji; zegar rozstrzyga
  // zakres domyślny „ostatnie 30 dni od dziś".
  adminStatsQueries: new AdminStatsQueries(db, new PgAdminStatsRepo(), clock),
  // Moduł „Zgłoszenia" (issue #87). Zapytania dostają `db` wprost (czysty odczyt),
  // komenda - bramę audytu: przestawienie statusu jest decyzją o CUDZYM zgłoszeniu.
  adminBugReportQueries: new AdminBugReportQueries(db, bugReports),
  adminBugReports: new AdminBugReportCommands(auditedWrite, bugReports, clock),
  adminLogQueries: new AdminLogQueries(db, new PgAdminLogRepo(), clock),
  // Analityka zużycia (A10a/A10b) - bierze TEN SAM magazyn zdarzeń, co reszta serwera:
  // strumienie sesji są jej wejściem, a licznik odczytów w `contract.test.ts` pilnuje,
  // że poza nią żadna lista po nie nie sięga.
  adminConsumptionQueries: new AdminConsumptionQueries(
    db,
    new PgAdminConsumptionRepo(),
    events,
    clock,
    phaseTimeline,
  ),
}, {
  trustProxy: env.TRUST_PROXY === '1',
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`UZ Aero server: http://localhost:${env.PORT}`);
