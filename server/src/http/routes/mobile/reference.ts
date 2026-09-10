/**
 * UZ Aero (serwer) - trasa `GET /reference` (§4.6, §4.8).
 *
 * ETag/304: flota zmienia się kilka razy w sezonie, a telefony odpytują przy każdym
 * starcie - zgodny znacznik oszczędza pełnej odpowiedzi na łączu, które w terenie
 * bywa najdroższym zasobem.
 */

import type { FastifyInstance } from 'fastify';

import type { ReferenceQueries } from '../../../application/mobile/queries/reference.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

export function registerReferenceRoutes(
  app: FastifyInstance,
  reference: ReferenceQueries,
  gate: MemberGate,
): void {
  app.get('/reference', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    // Migawka KLUBU z tokenu (wielofirmowość §7.1) - flota i członkowie aktywnego klubu.
    const view = await reference.get(who.orgId);
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
