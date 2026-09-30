/**
 * Ninerdeck (serwer) - trasy ZLECEŃ i ROZMÓW panelu (4.0.0, issue #245;
 * `docs/zlecenia.md` §13, §15).
 *
 * Te same punkty końcowe, co w telefonie (`common/orderEndpoints.ts`), pod prefiksem
 * `/admin/api` i za bramą sesji klubu. Zdolność trasy to `null` - moduł „Zlecenia" widzi
 * każdy członek klubu (§15), a o prawie do konkretnego zlecenia rozstrzyga komenda:
 * prowadzący, adresat albo 404.
 */

import type { FastifyInstance } from 'fastify';

import { orderActorOf } from '../../../application/common/orderAccess.ts';
import type { BookingOrderQueries } from '../../../application/common/queries/bookingOrders.ts';
import { orderEndpoints, type OrderDeps } from '../common/orderEndpoints.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { bookingWire, viewerOf } from './bookingWire.ts';

export function registerAdminOrderRoutes(
  app: FastifyInstance,
  deps: OrderDeps,
  bookingOrders: BookingOrderQueries,
  gate: AdminGate,
): void {
  const endpoints = orderEndpoints(deps, {
    // Kolizja w kształcie panelu - ta sama reguła widza, co w kalendarzu panelu; bywa
    // zleceniem i wtedy mówi, kogo brakuje (§16 pkt 3).
    takenWire: async (row, ctx) =>
      bookingWire(
        row,
        viewerOf({ pilotId: ctx.actor.pilotId, capabilities: ctx.capabilities }),
        await bookingOrders.of(ctx.orgId, ctx.actor, [row]),
      ),
  });

  for (const endpoint of endpoints) {
    adminRoute(app, gate, { method: endpoint.method, url: endpoint.url, capability: null }, async (req, reply, actor) => {
      const result = await endpoint.handle(
        { orgId: actor.orgId, actor: orderActorOf(actor.pilotId, actor.capabilities), capabilities: actor.capabilities },
        req,
      );
      return result.body === undefined ? reply.code(result.status).send() : reply.code(result.status).send(result.body);
    });
  }
}
