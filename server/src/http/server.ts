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
import type { AdminFlagCommands } from '../application/admin/commands/flags.ts';
import type { AdminAuditQueries } from '../application/admin/queries/audit.ts';
import type { AdminCorrectionQueries } from '../application/admin/queries/corrections.ts';
import type { AdminFlagQueries } from '../application/admin/queries/flags.ts';
import type { AdminMeQueries } from '../application/admin/queries/me.ts';
import type { AdminSessionQueries } from '../application/admin/queries/sessions.ts';
import type { AuthCommands } from '../application/common/commands/auth.ts';
import type { IngestCommands } from '../application/mobile/commands/ingest.ts';
import type { PrefsCommands } from '../application/mobile/commands/prefs.ts';
import type { ReferenceQueries } from '../application/mobile/queries/reference.ts';
import type { SheetQueries } from '../application/common/queries/sheets.ts';
import type { StateQueries } from '../application/mobile/queries/aircraftState.ts';
import type { TokenService, TraceSinkPort } from '../application/common/ports.ts';
import { registerAdminCsrfGuard } from './adminCsrf.ts';
import { registerAdminAuditRoutes } from './routes/admin/audit.ts';
import { registerAdminAuthRoutes } from './routes/admin/auth.ts';
import { registerAdminCorrectionRoutes } from './routes/admin/corrections.ts';
import { registerAdminFlagRoutes } from './routes/admin/flags.ts';
import { registerAdminMeRoutes } from './routes/admin/me.ts';
import { registerAdminSessionRoutes } from './routes/admin/sessions.ts';
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
  /** Komendy panelu administracyjnego (`/admin/api/*`) — patrz `routes/admin/`. */
  adminFlags: AdminFlagCommands;
  adminCorrections: AdminCorrectionCommands;
  /** Strona ODCZYTU panelu — uproszczony CQRS: komendy wyżej, zapytania tutaj. */
  adminSessionQueries: AdminSessionQueries;
  adminFlagQueries: AdminFlagQueries;
  adminMeQueries: AdminMeQueries;
  /** Podgląd „przed → po" korekty (`A02b`) — zapytanie, nie komenda: nic nie zapisuje. */
  adminCorrectionQueries: AdminCorrectionQueries;
  /** Dziennik audytu (`A09`) — WYŁĄCZNIE odczyt; zapisuje go `AuditedWrite`. */
  adminAuditQueries: AdminAuditQueries;
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
  registerAdminAuthRoutes(app, deps.auth);
  registerAdminMeRoutes(app, deps.adminMeQueries, deps.tokens);
  registerAdminFlagRoutes(app, deps.adminFlags, deps.adminFlagQueries, deps.tokens);
  registerAdminCorrectionRoutes(
    app,
    deps.adminCorrections,
    deps.adminCorrectionQueries,
    deps.tokens,
  );
  registerAdminSessionRoutes(app, deps.adminSessionQueries, deps.tokens);
  registerAdminAuditRoutes(app, deps.adminAuditQueries, deps.tokens);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
