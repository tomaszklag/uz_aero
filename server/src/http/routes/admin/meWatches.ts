/**
 * Ninerdeck (serwer) - OBSERWOWANE SAMOLOTY zalogowanego w panelu (3.2.0, issue #205,
 * decyzja 12; makieta `konto`, karta „Obserwowane samoloty";
 * `docs/obserwowanie-samolotu.md` §6.6, §7.2).
 *
 * Trasy siedzą pod `/me/`, obok sesji i konta, bo pytają o OSOBĘ patrzącą, nie o klub:
 * lista jest tą samą listą, którą telefon pokazuje w sekcji 13C, a przełącznik zapisuje
 * to samo ustawienie. Zdolność `fleet.watch`, jak w telefonie; cudza maszyna to 404
 * (epik C). BEZ wpisu w `admin_audit` - ustawienie osoby o sobie, jak motyw i PIN,
 * a nie decyzja o kimś; dlatego komenda jest wspólna (`common/`) i idzie poza
 * `AuditedWrite` świadomie.
 *
 * Czego panel NIE dostaje: listy obserwujących na karcie samolotu w module Samoloty -
 * pytanie administratora o cudze ustawienia, wraca, gdy ktoś o nie poprosi.
 */

import type { FastifyInstance } from 'fastify';

import type { AircraftWatchCommands } from '../../../application/common/commands/aircraftWatch.ts';
import type { AircraftCardQueries } from '../../../application/common/queries/aircraftCard.ts';
import { watchListWire } from '../common/aircraftWatchWire.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

export function registerAdminMeWatchRoutes(
  app: FastifyInstance,
  cards: AircraftCardQueries,
  watch: AircraftWatchCommands,
  gate: AdminGate,
): void {
  adminRoute(app, gate, { method: 'GET', url: '/me/watches', capability: 'fleet.watch' }, async (_req, reply, actor) => {
    const view = await cards.watchList(actor.orgId, actor.pilotId);
    if (view == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(watchListWire(view));
  });

  adminRoute(
    app,
    gate,
    { method: 'PUT', url: '/me/watches/:aircraftId', capability: 'fleet.watch' },
    async (req, reply, actor) => {
      const { aircraftId } = req.params as { aircraftId: string };
      const ok = await watch.watch(actor.orgId, actor.pilotId, aircraftId);
      if (!ok) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'DELETE', url: '/me/watches/:aircraftId', capability: 'fleet.watch' },
    async (req, reply, actor) => {
      const { aircraftId } = req.params as { aircraftId: string };
      const ok = await watch.unwatch(actor.orgId, actor.pilotId, aircraftId);
      if (!ok) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );
}
