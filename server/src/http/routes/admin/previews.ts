/**
 * Ninerdeck (serwer) - PODGLĄD PILOTA I SAMOLOTU z panelu (3.1.0, issue #206;
 * szuflada K6/K6a nad kolejką decyzji). Ten sam widok i ten sam kształt na drucie,
 * co trasy telefonu (`mobile/previews.ts`) - różni się wyłącznie bramą.
 *
 * Deklaracja stoi na `panel.access`, a rozstrzygnięcie („approve ALBO manage")
 * w handlerze - `adminRoute` zna jedną zdolność, a alternatywa nie jest żadną z nich.
 * To ten sam rachunek, co przy decyzji z panelu (`admin/approvals.ts`).
 */

import type { FastifyInstance } from 'fastify';

import type { DecisionPreviewQueries } from '../../../application/common/queries/decisionPreview.ts';
import { can } from '../../../domain/roles.ts';
import { aircraftPreviewWire, pilotPreviewWire } from '../common/previewWire.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

export function registerAdminPreviewRoutes(
  app: FastifyInstance,
  previews: DecisionPreviewQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    // `null` (issue #216): o prawie do podglądu rozstrzyga para zdolności niżej, jak przy decyzji.
    { method: 'GET', url: '/bookings/:id/preview/pilot/:pilotId', capability: null },
    async (req, reply, actor) => {
      const approves = can(actor.capabilities, 'reservations.approve');
      const manages = can(actor.capabilities, 'reservations.manage');
      if (!approves && !manages) {
        return reply.code(403).send({ error: 'forbidden', required: 'reservations.approve' });
      }
      const { id, pilotId } = req.params as { id: string; pilotId: string };
      const view = await previews.pilot(actor.orgId, id, pilotId);
      if (view == null) return reply.code(404).send({ error: 'not_found' });
      return reply.send(pilotPreviewWire(view));
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/bookings/:id/preview/aircraft', capability: null },
    async (req, reply, actor) => {
      const approves = can(actor.capabilities, 'reservations.approve');
      const manages = can(actor.capabilities, 'reservations.manage');
      if (!approves && !manages) {
        return reply.code(403).send({ error: 'forbidden', required: 'reservations.approve' });
      }
      const { id } = req.params as { id: string };
      const view = await previews.aircraft(actor.orgId, id);
      if (view == null) return reply.code(404).send({ error: 'not_found' });
      return reply.send(aircraftPreviewWire(view));
    },
  );
}
