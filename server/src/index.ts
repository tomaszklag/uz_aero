/**
 * Ninerdeck (serwer) - composition root.
 *
 * Jedyne miejsce, które zna WSZYSTKIE konkrety naraz: config z env, pulę Postgresa,
 * adaptery i złożenie ich w komendy/zapytania. Reszta kodu dostaje zależności
 * konstruktorem - dokładnie jak `bootstrap/` w aplikacji mobilnej.
 */

import { randomBytes, randomUUID } from 'node:crypto';

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
import { AdminClubCodeCommands } from './application/admin/commands/clubCode.ts';
import { AdminMembershipCommands } from './application/admin/commands/memberships.ts';
import { PlatformOrganizationCommands } from './application/admin/commands/organizations.ts';
import { AdminMaintenanceCommands } from './application/admin/commands/maintenance.ts';
import { AdminPilotCommands } from './application/admin/commands/pilots.ts';
import { AdminAuditQueries } from './application/admin/queries/audit.ts';
import { AdminBugReportQueries } from './application/admin/queries/bugReports.ts';
import { AdminClubCodeQueries } from './application/admin/queries/clubCode.ts';
import { AdminLoginSessionQueries } from './application/admin/queries/loginSessions.ts';
import { AdminLoginSessionCommands } from './application/admin/commands/loginSessions.ts';
import { AdminMembershipQueries } from './application/admin/queries/memberships.ts';
import { PlatformOrganizationQueries } from './application/admin/queries/organizations.ts';
import { AdminCorrectionQueries } from './application/admin/queries/corrections.ts';
import { AdminDashboardQueries } from './application/admin/queries/dashboard.ts';
import { AdminEventQueries } from './application/admin/queries/events.ts';
import { AdminExportQueries } from './application/admin/queries/exports.ts';
import { AdminFlagQueries } from './application/admin/queries/flags.ts';
import { AdminFleetQueries } from './application/admin/queries/fleet.ts';
import { AdminMaintenanceQueries } from './application/admin/queries/maintenance.ts';
import { AdminMeQueries } from './application/admin/queries/me.ts';
import { AccountQuery } from './application/common/queries/account.ts';
import { AdminPilotQueries } from './application/admin/queries/pilots.ts';
import { AdminSessionQueries } from './application/admin/queries/sessions.ts';
import { AdminConsumptionQueries } from './application/admin/queries/consumption.ts';
import { AdminLogQueries } from './application/admin/queries/log.ts';
import { AdminStatsQueries } from './application/admin/queries/stats.ts';
import { AuditedWrite } from './application/admin/auditedWrite.ts';
import { PgAircraftReadingsRepo } from './infrastructure/pg/common/aircraftReadingsRepo.ts';
import { BookingReleaseJob } from './application/common/commands/bookingRelease.ts';
import { ApprovalFlow } from './application/common/commands/approvals.ts';
import { ApprovalStepsCommands } from './application/admin/commands/approvalSteps.ts';
import { Notifier } from './application/common/notify/notifier.ts';
import { NotificationQueries } from './application/mobile/queries/notifications.ts';
import { PgApprovalStepsRepo } from './infrastructure/pg/common/approvalStepsRepo.ts';
import { PgBookingApprovalsRepo } from './infrastructure/pg/common/bookingApprovalsRepo.ts';
import { PgNotificationsRepo } from './infrastructure/pg/common/notificationsRepo.ts';
import { PgPushTokensRepo } from './infrastructure/pg/common/pushTokensRepo.ts';
import { ExpoPush } from './infrastructure/push/expoPush.ts';
import { LogPush } from './infrastructure/push/logPush.ts';
import { PgBookingsRepo } from './infrastructure/pg/common/bookingsRepo.ts';
import { PgClubSettingsRepo } from './infrastructure/pg/common/clubSettingsRepo.ts';
import { BookingQueries } from './application/common/queries/bookings.ts';
import { DecisionPreviewQueries } from './application/common/queries/decisionPreview.ts';
import { BookingCommands } from './application/mobile/commands/bookings.ts';
import { AdminBookingCommands } from './application/admin/commands/bookings.ts';
import { PgBugReportsRepo } from './infrastructure/pg/common/bugReportsRepo.ts';
import { AuthCommands } from './application/common/commands/auth.ts';
import { IngestCommands } from './application/mobile/commands/ingest.ts';
import { BugReportCommands } from './application/mobile/commands/bugReports.ts';
import { AttemptLimiter } from './application/common/attemptLimiter.ts';
import { JOIN_WINDOW_MS, JoinCommands } from './application/mobile/commands/join.ts';
import { PrefsCommands } from './application/mobile/commands/prefs.ts';
import { TraceCommands } from './application/mobile/commands/traces.ts';
import { DayExporter } from './application/common/export/dayExporter.ts';
import { MyEventQueries } from './application/mobile/queries/myEvents.ts';
import { MySessionTrackQueries } from './application/mobile/queries/sessionTrack.ts';
import { ReferenceQueries } from './application/mobile/queries/reference.ts';
import { TaskSuggestionQueries } from './application/mobile/queries/taskSuggestions.ts';
import { SessionTrackQueries } from './application/common/queries/sessionTrack.ts';
import { SheetQueries } from './application/common/queries/sheets.ts';
import { StateQueries } from './application/mobile/queries/aircraftState.ts';
import { ORG_SLUG_PATTERN } from './domain/organizations.ts';
import { GoogleIdTokens } from './infrastructure/auth/googleIdTokens.ts';
import { BaseUrlPasswordLinks } from './infrastructure/auth/resetLinks.ts';
import { ScryptHasher } from './infrastructure/auth/scryptHasher.ts';
import { LogMail } from './infrastructure/mail/logMail.ts';
import { ResendMail } from './infrastructure/mail/resendMail.ts';
import { PgPasswordCredentialsRepo } from './infrastructure/pg/common/passwordCredentialsRepo.ts';
import { PgPasswordResetTokensRepo } from './infrastructure/pg/common/passwordResetTokensRepo.ts';
import { AdminPasswordLinkCommands } from './application/admin/commands/passwordLinks.ts';
import { PASSWORD_WINDOW_MS, PasswordCommands } from './application/common/commands/passwords.ts';
import { Hs256Tokens } from './infrastructure/auth/hs256Tokens.ts';
import { PgAdminAuditReadRepo } from './infrastructure/pg/admin/auditReadRepo.ts';
import { PgClubCodeRepo } from './infrastructure/pg/admin/clubCodeRepo.ts';
import { PgOrganizationsRepo } from './infrastructure/pg/admin/organizationsRepo.ts';
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
import { PgClubJoinRepo } from './infrastructure/pg/mobile/clubJoinRepo.ts';
import { PgPilotPrefsRepo } from './infrastructure/pg/mobile/pilotPrefsRepo.ts';
import { PgExternalIdentitiesRepo } from './infrastructure/pg/common/externalIdentitiesRepo.ts';
import { PgPilotsRepo } from './infrastructure/pg/common/pilotsRepo.ts';
import { PgRefreshTokens } from './infrastructure/pg/common/refreshTokensRepo.ts';
import { PgLoginSessions } from './infrastructure/pg/common/loginSessionsRepo.ts';
import { LastSeenThrottle } from './application/common/lastSeenThrottle.ts';
import { PgMyEventsRepo } from './infrastructure/pg/mobile/myEventsRepo.ts';
import { PgReferenceRepo } from './infrastructure/pg/mobile/referenceRepo.ts';
import { PgTaskSuggestionsRepo } from './infrastructure/pg/mobile/taskSuggestionsRepo.ts';
import { PgSheets } from './infrastructure/pg/common/sheetsRepo.ts';
import { FsPhaseTimeline } from './infrastructure/traces/fsPhaseTimeline.ts';
import { FsTraceSink } from './infrastructure/traces/fsTraceSink.ts';
import { FsTraceSource } from './infrastructure/traces/fsTraceSource.ts';
import { hostSplitFrom } from './http/hostSplit.ts';
import { buildServer } from './http/server.ts';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().positive().default(3000),
    /**
     * Adres PANELU I API widziany z zewnątrz (produkcja: `https://app.ninerdeck.pl`) -
     * baza linków do kart arkusza klikanych z telefonu, a przy rozdziale hostów także
     * cel przekierowania `/admin` z hosta strony.
     */
    PUBLIC_BASE_URL: z.string().url().optional(),
    /**
     * Adres STRONY PUBLICZNEJ, gdy stoi na innym hoście niż panel i API (produkcja:
     * `https://ninerdeck.pl`; issue #124). Włącza rozdział hostów (`http/hostSplit.ts`):
     * strona wyłącznie tu, panel i API wyłącznie pod `PUBLIC_BASE_URL`. Nieustawiona =
     * jeden host dla wszystkiego (dev, usługa bez własnej domeny). Relację obu adresów
     * sprawdza `hostSplitFrom` niżej i to ona odmawia startu przy połowicznej konfiguracji.
     */
    PUBLIC_SITE_URL: z.string().url().optional(),
    /** Katalog zrzutu śladu kalibracyjnego (faza 5) - NDJSON per sesja. */
    TRACES_DIR: z.string().default('./traces'),
    /** `1` = serwer stoi ZA proxy TLS (Railway itp.) i wierzy `X-Forwarded-*`. */
    TRUST_PROXY: z.string().optional(),
    /**
     * `0` = zadanie okresowe zwalniania slotów NIE RUSZA (3.0.0, §4.1). Domyślnie
     * chodzi: rezerwacja, po którą nikt nie przyszedł, ma oddać maszynę sama.
     * Wyłącznik istnieje dla stagingu i dla awarii - przebieg zmienia dane w tle,
     * więc musi dać się zatrzymać bez wdrożenia nowej wersji.
     */
    BOOKING_RELEASE: z.string().optional(),
    /**
     * Ustawione = serwer przy KAŻDYM starcie zapewnia konto `admin` (ten sam
     * idempotentny `seed()`, co `npm run seed`). Droga dla hostingu bez ręki na
     * konsoli (Railway): jedna zmienna w UI zamiast tunelu do bazy.
     *
     * Wartością jest ADRES KONTA GOOGLE administratora - pierwsze logowanie tym kontem
     * podpina je do wiersza `admin` (`docs/logowanie-google.md` §6) i to jest cały
     * bootstrap dostępu do panelu.
     */
    SEED_ADMIN_EMAIL: z.string().email().optional(),
    /**
     * Klub DOMYŚLNY dla backfillu migracji 8 (wielofirmowość, `docs/wielofirmowosc.md`
     * §10): baza z danymi jednego klubu sprzed 2.0.0 dostaje przy tej migracji wiersz
     * `organizations` o tej nazwie i slugu, a każdy istniejący wiersz - jego `org_id`.
     * Wymagane WYŁĄCZNIE na takiej bazie (runner odmówi startu bez nich); świeża baza
     * i baza już zmigrowana ich nie czytają. Slug wchodzi do adresów kart arkusza
     * i nie zmienia się już nigdy - stąd walidacja kształtu, a nie tylko obecności.
     */
    SEED_ORG_NAME: z.string().trim().min(1).optional(),
    SEED_ORG_SLUG: z.string().regex(ORG_SLUG_PATTERN).optional(),
    /**
     * NASZE identyfikatory klienta Google - kontrola oddzielająca „ktoś zalogował się
     * do Ninerdeck" od „ktoś ma dowolny token Google" (`aud` w weryfikacji tokenu).
     *
     * **Web jest WYMAGANY**: to nim loguje się panel i to jego panel pobiera z serwera,
     * żeby narysować przycisk (`GET /admin/api/auth/google-client`). Android jest
     * opcjonalny do czasu builda aplikacji z Google - bez niego telefon się nie zaloguje,
     * ale serwer wstaje i panel działa. Dwie zmienne zamiast listy po przecinku, bo
     * jedna z nich ma ROLĘ (jedzie do panelu), a pozycja na liście roli nie niesie.
     */
    GOOGLE_WEB_CLIENT_ID: z.string().min(1),
    GOOGLE_ANDROID_CLIENT_ID: z.string().min(1).optional(),
    /**
     * POCZTA WYCHODZĄCA - WYMAGANA od 2.1.0 (`docs/logowanie-haslem.md` §5.4): „Nie pamiętam
     * hasła", które po cichu nic nie wysyła, jest gorsze niż serwer, który nie wstał.
     * `log` drukuje list do konsoli (dev; link da się kliknąć z terminala i NIE nadaje
     * się na produkcję), `resend` wysyła naprawdę (`infrastructure/mail/resendMail.ts`).
     */
    MAIL_PROVIDER: z.enum(['log', 'resend']),
    /**
     * Klucz API dostawcy i nadawca (`Ninerdeck <konto@ninerdeck.pl>`) - WYMAGANE przy
     * `MAIL_PROVIDER=resend`, nieczytane przy `log`. Wymóg jest WARUNKOWY, bo to samo
     * `.env` obsługuje dev bez konta u dostawcy i produkcję, która bez tych dwóch
     * wartości nie wyśle ani jednego linku „ustaw hasło" (zadanie właściciela #137).
     */
    MAIL_API_KEY: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(1).optional(),
    /**
     * BUDZIK POWIADOMIEŃ (3.1.0, `docs/rezerwacje.md` §12.3) - NIEWYMAGANY, domyślnie
     * `log`. To jest świadoma różnica wobec `MAIL_PROVIDER`: poczta MUSI być, bo „Nie
     * pamiętam hasła", które po cichu nic nie wysyła, zostawia człowieka bez drogi do
     * konta. Push jest tylko budzikiem - bez niego prośba o zgodę nadal czeka
     * w skrzynce, kompletna i z historią, a serwer, który nie wstaje przez brak
     * budzika, kosztowałby więcej niż budzik, który nie dzwoni.
     */
    PUSH_PROVIDER: z.enum(['log', 'expo']).default('log'),
    /**
     * Token dostępu z konsoli Expo - OPCJONALNY także przy `PUSH_PROVIDER=expo`:
     * dostawca przyjmuje wysyłkę bez niego, a z nim odrzuca żądania spoza konta.
     * Stąd brak warunkowego wymogu, który stoi przy `MAIL_API_KEY`.
     */
    PUSH_ACCESS_TOKEN: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    // Konfiguracja POŁOWICZNA ma zatrzymać START, a nie pierwszy reset hasła o 22:00:
    // adapter bez klucza albo bez nadawcy nie wyśle niczego, a odkryłoby się to dopiero
    // wtedy, gdy ktoś zapomni hasła. Ta sama zasada, co przy rozdziale hostów niżej.
    if (value.MAIL_PROVIDER !== 'resend') return;
    for (const key of ['MAIL_API_KEY', 'MAIL_FROM'] as const) {
      if (value[key] == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} jest wymagany przy MAIL_PROVIDER=resend`,
        });
      }
    }
  })
  .parse(process.env);

const clock = { now: () => new Date() };
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = new PgDatabase(pool);

await migrate(db, undefined, {
  seedOrg:
    env.SEED_ORG_NAME != null && env.SEED_ORG_SLUG != null
      ? { name: env.SEED_ORG_NAME, slug: env.SEED_ORG_SLUG }
      : null,
});

// Bootstrap konta superadministratora - patrz docblock SEED_ADMIN_EMAIL w schemacie env.
if (env.SEED_ADMIN_EMAIL != null) {
  await seed(db, { adminEmail: env.SEED_ADMIN_EMAIL });
  console.log(
    `Seed: konto superadministratora „admin" czeka na podpięcie konta Google ${env.SEED_ADMIN_EMAIL}.`,
  );
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
// Tożsamości zewnętrzne (logowanie Google). JEDEN adapter dla ścieżki logowania;
// decyzje administratora o zgłoszeniach mają własny, w transakcji audytu - ta sama
// zasada, co przy kontach (`PgPilotsRepo` czyta, `PgAdminPilotsRepo` pisze).
const identities = new PgExternalIdentitiesRepo(db);
const refreshTokens = new PgRefreshTokens(db, clock);
const loginSessions = new PgLoginSessions(db, clock);
// Przepustnica stempla „ostatnio aktywny" - JEDEN egzemplarz, wspólny dla obu bram.
const lastSeen = new LastSeenThrottle();

// Hasło jako DRUGA metoda logowania (2.1.0, issue #132). Jeden licznik prób dla logowania,
// zmiany hasła i wysyłki linku - klucze rozróżnia przedrostek; jeden skrót (scrypt N=2¹⁷)
// i jedna poczta. `MAIL_PROVIDER=log` jest adapterem DEV: list ląduje w konsoli serwera.
const publicBaseUrl = env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`;
const passwordHasher = new ScryptHasher();
const passwordCredentials = new PgPasswordCredentialsRepo(db);
const passwordLimiter = new AttemptLimiter(clock, PASSWORD_WINDOW_MS);
// Czym osoba może się zalogować (2.1.0, §5.3) - JEDNO zapytanie dla panelu (`#/konto`)
// i telefonu (ustawienia, sekcja „Hasło"): obie powierzchnie pytają o to samo, bo
// obecność hasła rozstrzyga u nich napis „Ustaw" kontra „Zmień".
const accountQuery = new AccountQuery(pilots, identities, passwordCredentials);
// Wybór adaptera poczty jest JAWNY i tylko tutaj: `log` drukuje token linku do konsoli,
// więc nie ma prawa włączyć się sam z braku innej konfiguracji (`logMail.ts`).
const mail =
  env.MAIL_PROVIDER === 'resend'
    ? new ResendMail(env.MAIL_API_KEY ?? '', env.MAIL_FROM ?? '')
    : new LogMail();
const passwords = new PasswordCommands(
  db,
  pilots,
  passwordCredentials,
  new PgPasswordResetTokensRepo(db),
  refreshTokens,
  passwordHasher,
  mail,
  new BaseUrlPasswordLinks(publicBaseUrl),
  passwordLimiter,
  clock,
  randomUUID,
  loginSessions,
);

// Eksport §4.7 działa END-TO-END na adapterze bazodanowym: `day_close` → karta
// w `exported_sheets` → wpis w `export_log` → link w sync-status, serwowany pod
// `GET /sheets/:tab`. Adapter Google (konto serwisowe, zmienne `GOOGLE_*`
// w `.env.example`) będzie podmianą TEGO SAMEGO portu w tym miejscu.
// `PUBLIC_BASE_URL` = adres panelu i API widziany z zewnątrz - linki do kart muszą być
// klikalne z telefonu, nie z localhosta serwera. Przy rozdziale hostów (issue #124) to
// jest host APLIKACJI, nie strony: trasa `/sheets/…` na hoście strony nie istnieje.
const sheets = new PgSheets(db, publicBaseUrl, clock);
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
// Kod klubu i moduł Organizacje mają własne adaptery tej samej tabeli `organizations`
// i to jest ta sama decyzja, co przy kontach: inna władza, inne pytanie. Pierwszy
// należy do panelu KLUBU (klub prowadzi swoją drogę dołączania, `accounts.manage`),
// drugi do PLATFORMY (superadministrator zakłada i wyłącza kluby, `platform.manage`).
const clubCodeRepo = new PgClubCodeRepo();
const organizationsRepo = new PgOrganizationsRepo();
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
// Zajętość maszyny (3.0.0) - JEDEN adapter dla obu powierzchni: kalendarz telefonu
// i kalendarz panelu mają rysować tę samą sobotę, więc czytają jednym zapytaniem.
const bookingsRepo = new PgBookingsRepo();
const clubSettings = new PgClubSettingsRepo();
// Okno kalendarza jest wspólne, więc składamy je RAZ i podajemy obu stronom.
const calendar = new BookingQueries(db, bookingsRepo, clubSettings, clock);
// BUDZIK: wybór adaptera jest jawny, ale BRAK KONFIGURACJI znaczy `log` - inaczej niż
// przy poczcie (§12.3). Poczta musi być, bo „Nie pamiętam hasła" bez niej zostawia
// człowieka bez drogi do konta; push jest budzikiem, a bez niego prośba o zgodę nadal
// czeka w skrzynce, kompletna i z historią. Serwer, który nie wstaje przez brak
// budzika, kosztuje więcej niż budzik, który nie dzwoni.
const push = env.PUSH_PROVIDER === 'expo' ? new ExpoPush(env.PUSH_ACCESS_TOKEN ?? '') : new LogPush();
// Ścieżka akceptacji rezerwacji (3.1.0, issue #164). Adaptery są WSPÓLNE dla obu
// powierzchni: ścieżkę układa panel, a klika po niej telefon - druga kopia zapytania
// byłaby pierwszym miejscem, w którym decyzja zobaczyłaby inną listę osób niż panel.
const approvalStepsRepo = new PgApprovalStepsRepo();
const bookingApprovalsRepo = new PgBookingApprovalsRepo();
const notificationsRepo = new PgNotificationsRepo();
const pushTokensRepo = new PgPushTokensRepo();
const notifier = new Notifier(db, notificationsRepo, pushTokensRepo, push, randomUUID);
const approvals = new ApprovalFlow(
  db,
  approvalStepsRepo,
  bookingApprovalsRepo,
  bookingsRepo,
  notifier,
  clock,
);
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

const app = await buildServer({
  // Logowanie (2026-09-04): tożsamość dowodzi podpisany token Google, a `identities`
  // rozstrzyga, czy stoi za nim KONTO. `GoogleIdTokens` jest portem, więc testy
  // podstawiają weryfikator z kluczem w procesie zamiast chodzić do Google.
  auth: new AuthCommands(
    pilots,
    refreshTokens,
    identities,
    new GoogleIdTokens(
      { panel: env.GOOGLE_WEB_CLIENT_ID, mobile: env.GOOGLE_ANDROID_CLIENT_ID ?? null },
      clock,
    ),
    tokens,
    clock,
    // Identyfikator NOWEJ osoby przy pierwszym logowaniu (wielofirmowość §4).
    randomUUID,
    { credentials: passwordCredentials, hasher: passwordHasher, limiter: passwordLimiter },
    loginSessions,
    db,
  ),
  passwords,
  loginSessions,
  lastSeen,
  clock,
  // Link „ustaw hasło" z panelu - ta sama brama audytu, te same adaptery członków
  // i klubów, co reszta panelu, plus wspólna komenda hasła (jeden list, jeden token).
  adminPasswordLinks: new AdminPasswordLinkCommands(
    auditedWrite,
    adminPilotsRepo,
    organizationsRepo,
    passwords,
  ),
  googleAndroidClientId: env.GOOGLE_ANDROID_CLIENT_ID ?? null,
  // Dołączanie kodem klubu (§3.8): adapter z własnym uchwytem do bazy (pilot pisze sam,
  // poza audytem) i licznik prób w pamięci procesu - instancja jest jedna (§8.8).
  join: new JoinCommands(
    pilots,
    new PgClubJoinRepo(db),
    new AttemptLimiter(clock, JOIN_WINDOW_MS),
    clock,
  ),
  reference: new ReferenceQueries(
    new PgReferenceRepo(db),
    db,
    sessions,
    consumptionNorms,
    events,
    aircraftReadings,
  ),
  ingest: new IngestCommands(db, events, sessions, flags, aircraftConfig, exporter, { events, norms: consumptionNorms, phases: phaseTimeline }, clock, bookingsRepo),
  // Droga POWROTNA outboxa (§4.9, issue #32) - własny adapter obok `PgEventsStore`,
  // bo to inne pytanie do tej samej tabeli: tamten czyta strumień JEDNEJ sesji przy
  // ingescie, ten stronicuje rejestr JEDNEGO PILOTA przez wszystkie jego sesje.
  myEvents: new MyEventQueries(db, new PgMyEventsRepo()),
  // Stan maszyny pyta rejestr floty o KLUB maszyny (issue #99): cudza jest 404, nie pusta.
  state: new StateQueries(db, events, sessions, flags, exportLog, aircraftConfig),
  sheets: new SheetQueries(sheets),
  // Ślad kalibracyjny przechodzi przez komendę: sesja z paczki musi należeć do klubu
  // i pilota z tokenu (issue #99), zanim adapter plikowy cokolwiek dopisze.
  traces: new TraceCommands(db, sessions, new FsTraceSink(env.TRACES_DIR)),
  // Droga POWROTNA nagrania (issue #47) - telefon oddaje ślad i kasuje swoją kopię,
  // więc ekran 14 pobiera gotową geometrię stąd. Cienka warstwa nad wspólnym zapytaniem:
  // dokłada JEDNO zdanie o uprawnieniu („to nie jest twoja sesja") i nic poza tym.
  sessionTrack: new MySessionTrackQueries(sessionTrack),
  prefs: new PrefsCommands(new PgPilotPrefsRepo(db)),
  // Zgłoszenia z telefonu (issue #87) - bez transakcji i bez projekcji: zgłoszenie
  // opisuje aplikację, nie lot, więc nie ma czego uzgadniać z rejestrem.
  bugReports: new BugReportCommands(db, bugReports),
  // Rezerwacje pilota - zapis wymaga sieci (§2.2), stan służby maszyny czyta
  // `aircraftConfig`, bo wyłączenie ze służby nie ma terminu i baza o nim nie wie.
  bookings: new BookingCommands(db, bookingsRepo, aircraftConfig, clock, approvals, notifier),
  calendar,
  approvals,
  notifications: new NotificationQueries(db, notificationsRepo, pushTokensRepo, clock),
  // Podgląd pilota i samolotu przy decyzji (issue #206): jeden widok dla telefonu
  // i panelu, składany z TYCH SAMYCH adapterów, którymi czytają kalendarz, dziennik
  // i kartę samolotu - nowe pytanie do istniejących wierszy, nie nowe dane.
  previews: new DecisionPreviewQueries(
    db,
    bookingsRepo,
    sessions,
    pilots,
    new PgReferenceRepo(db),
    aircraftReadings,
    clubSettings,
    clock,
  ),
  adminApprovalSteps: new ApprovalStepsCommands(
    auditedWrite,
    approvalStepsRepo,
    adminPilotsRepo,
    approvals,
    notifier,
    randomUUID,
    clock,
  ),
  // Podpowiedzi zadania dnia (issue #14) - własny adapter nad `sessions` obok
  // `PgSessionsProjection`, bo to inne pytanie: tamten czyta i pisze POJEDYNCZY wiersz
  // sesji, ten agreguje kolumny wielu wierszy w listę wartości do podpowiedzenia.
  taskSuggestions: new TaskSuggestionQueries(db, new PgTaskSuggestionsRepo()),
  // Identyfikator klienta Google WEB - panel pobiera go z serwera, żeby narysować przycisk.
  googleWebClientId: env.GOOGLE_WEB_CLIENT_ID,
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
  adminMeQueries: new AdminMeQueries(pilots, accountQuery),
  // Czym osoba może się zalogować - JEDEN egzemplarz dla obu powierzchni (2.1.0):
  // panel czyta go przez `AdminMeQueries.account`, telefon trasą `GET /me/account`.
  accounts: accountQuery,
  // Konta (A06/A06a). Po wejściu Google konto nie dostaje żadnego poświadczenia:
  // dostęp daje dopiero podpięcie konta Google o wpisanym tu adresie e-mail.
  adminPilots: new AdminPilotCommands(
    auditedWrite,
    adminPilotsRepo,
    new PgAdminRefreshTokensRepo(),
    loginSessions,
    randomUUID,
    clock,
  ),
  adminPilotQueries: new AdminPilotQueries(db, adminPilotsRepo, clock),
  // Decyzje o zgłoszeniach kodem klubu (issue #100): ten sam adapter członkostw, co
  // lista - kolejka i lista czytają jedną tabelę, a rozdziela je stan wiersza.
  adminMemberships: new AdminMembershipCommands(auditedWrite, adminPilotsRepo, clock),
  adminMembershipQueries: new AdminMembershipQueries(db, adminPilotsRepo),
  // Kod klubu: `randomBytes` jako funkcja, nie port - losowość nie jest domeną, a kod
  // musi być nieprzewidywalny, bo wisi w hangarze przez cały sezon.
  adminClubCode: new AdminClubCodeCommands(auditedWrite, clubCodeRepo, randomBytes, clock),
  adminLoginSessionQueries: new AdminLoginSessionQueries(db, loginSessions),
  adminLoginSessions: new AdminLoginSessionCommands(
    auditedWrite,
    adminPilotsRepo,
    loginSessions,
    clock,
  ),
  adminClubCodeQueries: new AdminClubCodeQueries(db, clubCodeRepo),
  // Moduł Organizacje - jedyna komenda panelu działająca POZA klubem (`PlatformActor`,
  // wpis audytu z pustym `org_id`). Zakłada klub razem z pierwszym administratorem,
  // bo klub bez niego nie ma jak zacząć (§8.1).
  platformOrganizations: new PlatformOrganizationCommands(
    auditedWrite,
    organizationsRepo,
    randomUUID,
    randomBytes,
    clock,
  ),
  platformOrganizationQueries: new PlatformOrganizationQueries(db, organizationsRepo),
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
  // Kalendarz panelu - przez bramę audytu: rezerwacja za pilota, odwołanie cudzej
  // i wyłączenie maszyny z użytku to trzy decyzje o cudzych sprawach.
  adminBookings: new AdminBookingCommands(auditedWrite, bookingsRepo, aircraftConfig, clock),
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
  // Rozdział hostów strona ↔ panel+API (issue #124). Rzuca - czyli serwer nie wstaje -
  // gdy `PUBLIC_SITE_URL` stoi bez `PUBLIC_BASE_URL` albo oba wskazują ten sam host.
  hostSplit: hostSplitFrom(env.PUBLIC_SITE_URL, env.PUBLIC_BASE_URL),
});

// Zwalnianie slotów (§4.1) - PIERWSZY wątek okresowy w tym serwerze. Startuje po
// `listen`, bo jest porządkowaniem kalendarza, a nie warunkiem przyjmowania żądań.
if (env.BOOKING_RELEASE !== '0') {
  new BookingReleaseJob(db, bookingsRepo, sessions, clock, notifier).start();
}

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`Ninerdeck server: http://localhost:${env.PORT}`);
