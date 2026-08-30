/**
 * UZ Aero (serwer) - LOG DNIA, poziom 1 (`GET /admin/api/log`).
 *
 * Cienka jak reszta repo: zod -> zapytanie -> status. Poziomu 2 i 3 nie ma tutaj i to
 * jest świadome - grid sesji jednej maszyny obsługuje `GET /sessions?aircraftId=…`,
 * a szczegóły `GET /sessions/:uuid`. Druga trasa oddająca te same wiersze pod inną
 * nazwą byłaby drugim miejscem, w którym trzeba pamiętać o kolumnach projekcji.
 *
 * `panel.access`, nie własna zdolność: to jest ODCZYT, a moduł czyta dokładnie to samo,
 * co lista dni panelu 1.0.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminLogQueries } from '../../../application/admin/queries/log.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

const rangeQuery = z.object({
  from: dayParam.optional(),
  to: dayParam.optional(),
});

export function registerAdminLogRoutes(
  app: FastifyInstance,
  log: AdminLogQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/log', capability: 'panel.access' },
    async (req, reply) => {
      const query = rangeQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await log.load({
        fromMs: query.data.from,
        // Górną granicę domykamy do końca doby - `do=2026-07-31` ma obejmować cały
        // 31 lipca, a nie jego północ. Ta sama funkcja, co w pozostałych trasach.
        toMs: endOfDay(query.data.to),
      });
      // Zakres odwrócony to nie awaria, tylko pytanie bez odpowiedzi - 400 z nazwanym
      // powodem, żeby panel mógł powiedzieć, co poprawić.
      if (!outcome.ok) return reply.code(400).send({ error: outcome.reason });

      return reply.send(outcome.report);
    },
  );
}
