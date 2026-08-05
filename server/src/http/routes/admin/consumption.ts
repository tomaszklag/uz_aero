/**
 * UZ Aero (serwer) — trasa analityki zużycia (`GET /admin/api/fleet/:id/consumption`).
 *
 * ══ DLACZEGO POD `/fleet`, A NIE `/aircraft` ══
 * Mockup `A10a` pokazuje w pasku adresu `/admin/api/aircraft/:id/consumption`, ale
 * rodzina `/aircraft/*` w panelu NIE ISTNIEJE — flota siedzi pod `/fleet` (lista,
 * edycja jednostki). Drugi rzeczownik na ten sam zasób to dokładnie ten dryf, który
 * ten projekt tępi gdzie indziej, więc trasa idzie pod istniejący prefiks, a mockup
 * dostaje poprawioną etykietę.
 *
 * ══ ZDOLNOŚĆ: `panel.access` ══
 * Ekran jest wyłącznie do odczytu — zero komend, zero `AuditedWrite`. Szef wyszkolenia
 * jest naturalnym odbiorcą (norma zużycia to jego pytanie przy planowaniu), więc
 * istniejąca zdolność wejścia do panelu wystarcza; nowej nie wymyślamy. Ten sam
 * argument, co przy `/stats`.
 *
 * Odmowy: jednostka spoza floty → 404, zakres odwrócony → 400. Obie przychodzą
 * z zapytania jako WARIANT WYNIKU, nie wyjątek.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminConsumptionQueries } from '../../../application/admin/queries/consumption.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

const params = z.object({ id: z.string().min(1).max(100) });

const query = z.object({
  from: dayParam.optional(),
  to: dayParam.optional(),
});

export function registerAdminConsumptionRoutes(
  app: FastifyInstance,
  consumption: AdminConsumptionQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/fleet/:id/consumption', capability: 'panel.access' },
    async (req, reply) => {
      const path = params.safeParse(req.params);
      if (!path.success) return reply.code(400).send({ error: 'bad_request' });

      const search = query.safeParse(req.query);
      if (!search.success) return reply.code(400).send({ error: 'bad_request' });

      const { from, to } = search.data;
      // Górna granica jako koniec DNIA, nie jego początek (patrz `dayRange.ts`).
      const outcome = await consumption.load(path.data.id, { fromMs: from, toMs: endOfDay(to) });

      if (!outcome.ok) {
        return outcome.reason === 'no_aircraft'
          ? reply.code(404).send({ error: 'not_found' })
          : reply.code(400).send({ error: 'bad_range' });
      }

      return reply.send(outcome.report);
    },
  );
}
