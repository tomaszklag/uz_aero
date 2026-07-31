/**
 * UZ Aero (serwer) — złożenie warstwy HTTP (Fastify).
 *
 * Trasy mieszkają w `routes/` per zasób; ten plik tylko je rejestruje. Zależności
 * przychodzą z zewnątrz (composition root w `index.ts`, testy składają własne
 * z PGlite) — warstwa HTTP nie tworzy niczego sama.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import type { AdminCorrectionCommands } from '../application/admin/commands/corrections.ts';
import type { AdminFlagCommands } from '../application/admin/commands/flags.ts';
import type { AdminFlagQueries } from '../application/admin/queries/flags.ts';
import type { AdminSessionQueries } from '../application/admin/queries/sessions.ts';
import type { AuthCommands } from '../application/common/commands/auth.ts';
import type { IngestCommands } from '../application/mobile/commands/ingest.ts';
import type { PrefsCommands } from '../application/mobile/commands/prefs.ts';
import type { ReferenceQueries } from '../application/mobile/queries/reference.ts';
import type { SheetQueries } from '../application/common/queries/sheets.ts';
import type { StateQueries } from '../application/mobile/queries/aircraftState.ts';
import type { TokenService, TraceSinkPort } from '../application/common/ports.ts';
import { registerAdminCorrectionRoutes } from './routes/admin/corrections.ts';
import { registerAdminFlagRoutes } from './routes/admin/flags.ts';
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
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  registerAuthRoutes(app, deps.auth);
  registerReferenceRoutes(app, deps.reference, deps.tokens);
  registerEventsRoutes(app, deps.ingest, deps.tokens);
  registerStateRoutes(app, deps.state, deps.tokens);
  registerSheetsRoutes(app, deps.sheets, deps.tokens);
  registerTracesRoutes(app, deps.traces, deps.tokens);
  registerPrefsRoutes(app, deps.prefs, deps.tokens);

  // Panel administracyjny — trasy per zasób, tak samo jak wyżej; prefiks `/admin/api`
  // pilnuje `adminRoute`, żeby nie rozjechał się między plikami.
  registerAdminFlagRoutes(app, deps.adminFlags, deps.adminFlagQueries, deps.tokens);
  registerAdminCorrectionRoutes(app, deps.adminCorrections, deps.tokens);
  registerAdminSessionRoutes(app, deps.adminSessionQueries, deps.tokens);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
