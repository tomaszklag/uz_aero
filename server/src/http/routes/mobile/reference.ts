/**
 * UZ Aero (serwer) — trasa `GET /reference` (§4.6, §4.8).
 *
 * ETag/304: flota zmienia się kilka razy w sezonie, a telefony odpytują przy każdym
 * starcie — zgodny znacznik oszczędza pełnej odpowiedzi na łączu, które w terenie
 * bywa najdroższym zasobem.
 */

import type { FastifyInstance } from 'fastify';

import type { ReferenceQueries } from '../../../application/mobile/queries/reference.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { authorize } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

export function registerReferenceRoutes(
  app: FastifyInstance,
  reference: ReferenceQueries,
  tokens: TokenService,
): void {
  app.get('/reference', async (req, reply) => {
    if (authorize(tokens, tokenFromRequest(req)) == null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const view = await reference.get();
    if (req.headers['if-none-match'] === view.etag) {
      return reply.code(304).header('etag', view.etag).send();
    }
    return reply.header('etag', view.etag).send({
      aircraft: view.snapshot.aircraft,
      pilots: view.snapshot.pilots,
      updatedAt: view.snapshot.updatedAt?.toISOString() ?? null,
    });
  });
}
