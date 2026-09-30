/**
 * Ninerdeck (serwer) - trasy ZLECEŃ, ROZMÓW i GRUP dla telefonu (4.0.0, issue #245;
 * `docs/zlecenia.md` §13).
 *
 * Handlery mieszkają we wspólnej tablicy (`common/orderEndpoints.ts`) - ten plik tylko
 * przepuszcza je przez bramę telefonu: token klubu i członkostwo czytane przy każdym
 * żądaniu. Klub i osoba WYŁĄCZNIE z tej bramy, nigdy z ciała.
 *
 * `GET /groups` jest tu osobno, bo prawo odczytu grup różni się między powierzchniami:
 * telefon pokazuje je zlecającemu jako adresatów, więc wymaga „Zlecania lotów" (§9);
 * panel dopuszcza też „Podgląd klubu".
 */

import type { FastifyInstance } from 'fastify';

import { orderActorOf } from '../../../application/common/orderAccess.ts';
import type { BookingOrderQueries } from '../../../application/common/queries/bookingOrders.ts';
import type { MemberGroupQueries } from '../../../application/common/queries/memberGroups.ts';
import { can } from '../../../domain/roles.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';
import { groupWire } from '../common/groupWire.ts';
import { orderEndpoints, type OrderDeps } from '../common/orderEndpoints.ts';
import { bookingWire } from './bookings.ts';

export function registerOrderRoutes(
  app: FastifyInstance,
  deps: OrderDeps,
  groups: MemberGroupQueries,
  bookingOrders: BookingOrderQueries,
  gate: MemberGate,
): void {
  const endpoints = orderEndpoints(deps, {
    // Kolizja w kształcie telefonu: cudza zajętość pyta, KTO PATRZY (`bookingWire`),
    // a bywa zleceniem - wtedy mówi, kogo brakuje (§16 pkt 3).
    takenWire: async (row, ctx) =>
      bookingWire(
        row,
        { pilotId: ctx.actor.pilotId, approves: can(ctx.capabilities, 'reservations.approve') },
        await bookingOrders.of(ctx.orgId, ctx.actor, [row]),
      ),
  });

  for (const endpoint of endpoints) {
    app.route({
      method: endpoint.method,
      url: endpoint.url,
      handler: async (req, reply) => {
        const who = await memberFromRequest(gate, req);
        if (who == null) return reply.code(401).send({ error: 'unauthorized' });
        const result = await endpoint.handle(
          { orgId: who.orgId, actor: orderActorOf(who.pilotId, who.capabilities), capabilities: who.capabilities },
          req,
        );
        return result.body === undefined ? reply.code(result.status).send() : reply.code(result.status).send(result.body);
      },
    });
  }

  app.get('/groups', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    // `403`, a nie `404`: grupy należą do klubu, w którym ta osoba jest - nie ma tu
    // cudzego zasobu do ukrywania, jest brak prawa do adresowania zleceń.
    if (!can(who.capabilities, 'orders.create')) return reply.code(403).send({ error: 'forbidden' });
    return reply.send({ groups: (await groups.list(who.orgId)).map(groupWire) });
  });
}
