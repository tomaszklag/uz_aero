/**
 * UZ Aero (serwer) — trasy stanu floty: `GET /aircraft/:id/state`
 * i `GET /sessions/:uuid/sync-status` (§4.6).
 *
 * Oba czyste odczyty projekcji — telefon odpytuje je przy starcie, po opróżnieniu
 * outboxa i na ekranach stanu floty (preflight, read-only, ekran 11). Pushów nie ma
 * z decyzji, nie z lenistwa.
 */

import type { FastifyInstance } from 'fastify';

import type { StateQueries } from '../../../application/mobile/queries/aircraftState.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { authorize } from '../../authorize.ts';

export function registerStateRoutes(
  app: FastifyInstance,
  state: StateQueries,
  tokens: TokenService,
): void {
  app.get('/aircraft/:id/state', async (req, reply) => {
    if (authorize(tokens, req.headers.authorization) == null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id } = req.params as { id: string };
    return reply.send(await state.aircraftState(id));
  });

  app.get('/sessions/:uuid/sync-status', async (req, reply) => {
    if (authorize(tokens, req.headers.authorization) == null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { uuid } = req.params as { uuid: string };
    return reply.send(await state.syncStatus(uuid));
  });
}
