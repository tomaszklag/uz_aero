/**
 * Ninerdeck (serwer) - PODGLĄD PILOTA I SAMOLOTU z telefonu (3.1.0, issue #206;
 * ekrany 26A/26B). Ten sam widok, co szuflada w panelu (`admin/previews.ts`):
 * różni się wyłącznie bramą.
 *
 * ══ CAŁY TEN MODUŁ WYMAGA SIECI ══ (§12.1) - jak skrzynka i decyzja. Cache'u nie ma.
 *
 * ══ KTO PYTA ══
 * Osoba ze zdolnością `reservations.approve` ALBO `reservations.manage` - dokładnie
 * ten sam warunek, co przy decyzji: podgląd istnieje po to, żeby decyzja miała na czym
 * stanąć, więc kto może ją podjąć, ten może zajrzeć. Członek klubu bez żadnej z nich
 * dostaje 403 - istnienia sprawy nie ujawnia to nikomu, bo okno kalendarza pokazuje
 * ją każdemu w klubie i tak.
 *
 * ══ CUDZA SPRAWA I OSOBA SPOZA SPRAWY: 404 ══
 * Sprawa innego klubu nie istnieje (epik C); pilot, który nie stoi na tej rezerwacji,
 * też nie - inaczej trasa byłaby wyszukiwarką nalotu dowolnego członka klubu.
 */

import type { FastifyInstance } from 'fastify';

import type { DecisionPreviewQueries } from '../../../application/common/queries/decisionPreview.ts';
import type { MembershipAuthSnapshot } from '../../../application/common/ports.ts';
import { can } from '../../../domain/roles.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';
import { aircraftPreviewWire, pilotPreviewWire } from '../common/previewWire.ts';

function mayPreview(who: MembershipAuthSnapshot): boolean {
  return (
    can(who.capabilities, 'reservations.approve') || can(who.capabilities, 'reservations.manage')
  );
}

export function registerPreviewRoutes(
  app: FastifyInstance,
  previews: DecisionPreviewQueries,
  gate: MemberGate,
): void {
  app.get<{ Params: { id: string; pilotId: string } }>(
    '/bookings/:id/preview/pilot/:pilotId',
    async (req, reply) => {
      const who = await memberFromRequest(gate, req);
      if (who == null) return reply.code(401).send({ error: 'unauthorized' });
      if (!mayPreview(who)) {
        return reply.code(403).send({ error: 'forbidden', required: 'reservations.approve' });
      }

      const view = await previews.pilot(who.orgId, req.params.id, req.params.pilotId);
      if (view == null) return reply.code(404).send({ error: 'not_found' });
      return reply.send(pilotPreviewWire(view));
    },
  );

  app.get<{ Params: { id: string } }>('/bookings/:id/preview/aircraft', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    if (!mayPreview(who)) {
      return reply.code(403).send({ error: 'forbidden', required: 'reservations.approve' });
    }

    const view = await previews.aircraft(who.orgId, req.params.id);
    if (view == null) return reply.code(404).send({ error: 'not_found' });
    // Bit „ma kartę maszyny" (obserwowanie samolotu) - stopka 26B „Pokaż kartę samolotu"
    // istnieje wyłącznie z `fleet.watch`. Mówi o PATRZĄCYM, nie o sprawie, więc panel
    // (który ma własną stopkę „Pokaż w dzienniku") go nie dostaje.
    return reply.send({
      ...aircraftPreviewWire(view),
      viewer: { watch: can(who.capabilities, 'fleet.watch') },
    });
  });
}
