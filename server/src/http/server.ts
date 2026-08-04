/**
 * UZ Aero (serwer) — złożenie warstwy HTTP (Fastify).
 *
 * Trasy mieszkają w `routes/` per zasób; ten plik tylko je rejestruje. Zależności
 * przychodzą z zewnątrz (composition root w `index.ts`, testy składają własne
 * z PGlite) — warstwa HTTP nie tworzy niczego sama.
 */

import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';

import type { AdminCorrectionCommands } from '../application/admin/commands/corrections.ts';
import type { AdminExportCommands } from '../application/admin/commands/exports.ts';
import type { AdminFlagCommands } from '../application/admin/commands/flags.ts';
import type { AdminFleetCommands } from '../application/admin/commands/fleet.ts';
import type { AdminMaintenanceCommands } from '../application/admin/commands/maintenance.ts';
import type { AdminPilotCommands } from '../application/admin/commands/pilots.ts';
import type { AdminAuditQueries } from '../application/admin/queries/audit.ts';
import type { AdminCorrectionQueries } from '../application/admin/queries/corrections.ts';
import type { AdminDashboardQueries } from '../application/admin/queries/dashboard.ts';
import type { AdminEventQueries } from '../application/admin/queries/events.ts';
import type { AdminExportQueries } from '../application/admin/queries/exports.ts';
import type { AdminFlagQueries } from '../application/admin/queries/flags.ts';
import type { AdminFleetQueries } from '../application/admin/queries/fleet.ts';
import type { AdminMaintenanceQueries } from '../application/admin/queries/maintenance.ts';
import type { AdminMeQueries } from '../application/admin/queries/me.ts';
import type { AdminPilotQueries } from '../application/admin/queries/pilots.ts';
import type { AdminFlightTrackQueries } from '../application/admin/queries/flightTrack.ts';
import type { AdminSessionQueries } from '../application/admin/queries/sessions.ts';
import type { AdminStatsQueries } from '../application/admin/queries/stats.ts';
import type { AuthCommands } from '../application/common/commands/auth.ts';
import type { IngestCommands } from '../application/mobile/commands/ingest.ts';
import type { PrefsCommands } from '../application/mobile/commands/prefs.ts';
import type { ReferenceQueries } from '../application/mobile/queries/reference.ts';
import type { SheetQueries } from '../application/common/queries/sheets.ts';
import type { StateQueries } from '../application/mobile/queries/aircraftState.ts';
import type { PilotsPort, TokenService, TraceSinkPort } from '../application/common/ports.ts';
import { registerAdminCsrfGuard } from './adminCsrf.ts';
import type { AdminGate } from './routes/admin/adminRoute.ts';
import { registerAdminAuditRoutes } from './routes/admin/audit.ts';
import { registerAdminAuthRoutes } from './routes/admin/auth.ts';
import { registerAdminCorrectionRoutes } from './routes/admin/corrections.ts';
import { registerAdminDashboardRoutes } from './routes/admin/dashboard.ts';
import { registerAdminEventRoutes } from './routes/admin/events.ts';
import { registerAdminExportRoutes } from './routes/admin/exports.ts';
import { registerAdminFlagRoutes } from './routes/admin/flags.ts';
import { registerAdminFleetRoutes } from './routes/admin/fleet.ts';
import { registerAdminMaintenanceRoutes } from './routes/admin/maintenance.ts';
import { registerAdminMeRoutes } from './routes/admin/me.ts';
import { registerAdminPilotRoutes } from './routes/admin/pilots.ts';
import { registerAdminSessionRoutes } from './routes/admin/sessions.ts';
import { registerAdminStatsRoutes } from './routes/admin/stats.ts';
import { registerAdminTrackRoutes } from './routes/admin/tracks.ts';
import { registerAuthRoutes } from './routes/common/auth.ts';
import { registerEventsRoutes } from './routes/mobile/events.ts';
import { registerPrefsRoutes } from './routes/mobile/prefs.ts';
import { registerReferenceRoutes } from './routes/mobile/reference.ts';
import { registerSheetsRoutes } from './routes/common/sheets.ts';
import { registerStateRoutes } from './routes/mobile/state.ts';
import { registerTracesRoutes } from './routes/mobile/traces.ts';

export interface ServerDeps {
  auth: AuthCommands;
  reference: ReferenceQueries;
  ingest: IngestCommands;
  state: StateQueries;
  sheets: SheetQueries;
  traces: TraceSinkPort;
  prefs: PrefsCommands;
  tokens: TokenService;
  /**
   * Konta — czytane przy KAŻDYM żądaniu panelu, żeby deaktywacja i odebranie roli
   * działały natychmiast, a nie po wygaśnięciu 8-godzinnej sesji (`http/authorize.ts`).
   * Ten sam port, którym loguje się telefon: jedna tabela kont, bo to ci sami ludzie.
   */
  pilots: PilotsPort;
  /** Komendy panelu administracyjnego (`/admin/api/*`) — patrz `routes/admin/`. */
  adminFlags: AdminFlagCommands;
  adminCorrections: AdminCorrectionCommands;
  adminPilots: AdminPilotCommands;
  /**
   * Konfiguracja floty (`A07`, `A07a`) — jedyna droga zmiany WEJŚĆ REGUŁ §4.5:
   * pojemności zbiorników (próg `FUEL_MISMATCH`), formatu motogodzin, wymogu Duala
   * i stanu służby. Zmiana wychodzi do telefonów wyłącznie przez ETag `GET /reference`.
   */
  adminFleet: AdminFleetCommands;
  /**
   * Ręczne ponowienie eksportu karty dnia (`A05`) — jedyna droga, którą człowiek może
   * dopchnąć do arkusza dzień, którego automat nie dowiózł. Bramek eksportera NIE omija.
   */
  adminExports: AdminExportCommands;
  /**
   * Operacje serwisowe (`A11`) — NADPISANIE projekcji `sessions` przeliczonej ze
   * strumienia i sprzątanie WYGASŁYCH refresh tokenów. Jedyna komenda panelu, która
   * cokolwiek kasuje; rejestru `events` nie dotyka ani jedna z dwóch operacji.
   */
  adminMaintenance: AdminMaintenanceCommands;
  /** Strona ODCZYTU panelu — uproszczony CQRS: komendy wyżej, zapytania tutaj. */
  adminSessionQueries: AdminSessionQueries;
  /** Ślad lotu (`A02c`) — rejestr wyznacza okno, pliki NDJSON dają geometrię. */
  adminFlightTrackQueries: AdminFlightTrackQueries;
  adminFlagQueries: AdminFlagQueries;
  adminMeQueries: AdminMeQueries;
  adminPilotQueries: AdminPilotQueries;
  adminFleetQueries: AdminFleetQueries;
  /** Monitor eksportu (`A05`) — lista dni od strony arkusza, historia rewizji, podgląd karty. */
  adminExportQueries: AdminExportQueries;
  /** Podgląd „przed → po" korekty (`A02b`) — zapytanie, nie komenda: nic nie zapisuje. */
  adminCorrectionQueries: AdminCorrectionQueries;
  /** Dziennik audytu (`A09`) — WYŁĄCZNIE odczyt; zapisuje go `AuditedWrite`. */
  adminAuditQueries: AdminAuditQueries;
  /**
   * Rejestr zdarzeń (`A04`) — jedyne zapytanie panelu czytające SUROWY strumień zamiast
   * projekcji. Wyłącznie odczyt: `events` jest append-only i żadna trasa tego nie zmienia.
   */
  adminEventQueries: AdminEventQueries;
  /**
   * Pulpit (`A01`, `A01a`) — jedyne zapytanie panelu, które AGREGUJE inne: liczniki
   * kafli, kolejka „wymaga uwagi" i puls rejestru pochodzą z tych samych zapytań,
   * co ekrany docelowe. Kafel jest przejściem, więc jego liczba ma być obietnicą.
   */
  adminDashboardQueries: AdminDashboardQueries;
  /**
   * Statystyki floty i pilotów (`A10`) — wyłącznie odczyt: agregaty kolumn projekcji
   * `sessions` w zakresie dat, trzy ujęcia jednego zbioru dni w jednej odpowiedzi.
   */
  adminStatsQueries: AdminStatsQueries;
  /**
   * Odczytowa strona konserwacji (`A11`): PORÓWNANIE projekcji bez zapisu, stan tabeli
   * refresh tokenów i stan schematu. Bez `AuditedWrite`, więc bez czym zapisać —
   * podgląd różnic nie ma prawa dopisywać do dziennika akcji, które się nie wydarzyły.
   */
  adminMaintenanceQueries: AdminMaintenanceQueries;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // Ciasteczka: potrzebuje ich WYŁĄCZNIE sesja panelu, ale wtyczka musi stać przed
  // trasami, bo dokłada `req.cookies` czytane przez `tokenFromRequest`. Bez podpisu
  // ciasteczek (`secret`) — wartością jest podpisany JWT, więc drugi podpis nad
  // podpisem nie odpowiadałby na żadne pytanie.
  app.register(cookie);
  registerAdminCsrfGuard(app);

  registerAuthRoutes(app, deps.auth);
  registerReferenceRoutes(app, deps.reference, deps.tokens);
  registerEventsRoutes(app, deps.ingest, deps.tokens);
  registerStateRoutes(app, deps.state, deps.tokens);
  registerSheetsRoutes(app, deps.sheets, deps.tokens);
  registerTracesRoutes(app, deps.traces, deps.tokens);
  registerPrefsRoutes(app, deps.prefs, deps.tokens);

  // Panel administracyjny — trasy per zasób, tak samo jak wyżej; prefiks `/admin/api`
  // pilnuje `adminRoute`, żeby nie rozjechał się między plikami.
  //
  // BRAMA jest jedna i składa się TUTAJ: token weryfikuje `tokens`, a rolę i aktywność
  // konta czyta `pilots` przy każdym żądaniu (`http/authorize.ts`). Gdyby któraś trasa
  // dostała samo `tokens`, deaktywacja działałaby na niej dopiero po 8 godzinach —
  // i nikt by tego nie zauważył, bo wyglądałoby to jak działający panel.
  const gate: AdminGate = { tokens: deps.tokens, accounts: deps.pilots };

  registerAdminAuthRoutes(app, deps.auth);
  registerAdminMeRoutes(app, deps.adminMeQueries, gate);
  registerAdminFlagRoutes(app, deps.adminFlags, deps.adminFlagQueries, gate);
  registerAdminCorrectionRoutes(app, deps.adminCorrections, deps.adminCorrectionQueries, gate);
  registerAdminSessionRoutes(app, deps.adminSessionQueries, gate);
  registerAdminTrackRoutes(app, deps.adminFlightTrackQueries, gate);
  registerAdminAuditRoutes(app, deps.adminAuditQueries, gate);
  registerAdminPilotRoutes(app, deps.adminPilots, deps.adminPilotQueries, gate);
  registerAdminFleetRoutes(app, deps.adminFleet, deps.adminFleetQueries, gate);
  registerAdminExportRoutes(app, deps.adminExportQueries, deps.adminExports, gate);
  registerAdminEventRoutes(app, deps.adminEventQueries, gate);
  registerAdminDashboardRoutes(app, deps.adminDashboardQueries, gate);
  registerAdminStatsRoutes(app, deps.adminStatsQueries, gate);
  registerAdminMaintenanceRoutes(app, deps.adminMaintenanceQueries, deps.adminMaintenance, gate);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
