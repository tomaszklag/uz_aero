/**
 * UZ Aero (serwer) — złożenie warstwy HTTP (Fastify).
 *
 * Trasy mieszkają w `routes/` per zasób; ten plik tylko je rejestruje. Zależności
 * przychodzą z zewnątrz (composition root w `index.ts`, testy składają własne
 * z PGlite) — warstwa HTTP nie tworzy niczego sama.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import type { AuthCommands } from '../application/commands/auth.ts';
import type { IngestCommands } from '../application/commands/ingest.ts';
import type { ReferenceQueries } from '../application/queries/reference.ts';
import type { StateQueries } from '../application/queries/aircraftState.ts';
import type { TokenService } from '../application/ports.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerEventsRoutes } from './routes/events.ts';
import { registerReferenceRoutes } from './routes/reference.ts';
import { registerStateRoutes } from './routes/state.ts';

export interface ServerDeps {
  auth: AuthCommands;
  reference: ReferenceQueries;
  ingest: IngestCommands;
  state: StateQueries;
  tokens: TokenService;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  registerAuthRoutes(app, deps.auth);
  registerReferenceRoutes(app, deps.reference, deps.tokens);
  registerEventsRoutes(app, deps.ingest, deps.tokens);
  registerStateRoutes(app, deps.state, deps.tokens);

  app.get('/health', async () => ({ ok: true }));

  return app;
}
