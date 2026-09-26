/**
 * Ninerdeck (serwer) - LOG DNIA, poziom 1 (`GET /admin/api/log`).
 *
 * Cienka jak reszta repo: zod -> zapytanie -> status. Poziomu 2 i 3 nie ma tutaj i to
 * jest świadome - grid sesji jednej maszyny obsługuje `GET /sessions?aircraftId=…`,
 * a szczegóły `GET /sessions/:uuid`. Druga trasa oddająca te same wiersze pod inną
 * nazwą byłaby drugim miejscem, w którym trzeba pamiętać o kolumnach projekcji.
 *
 * `panel.access`, nie własna zdolność: to jest ODCZYT, a moduł czyta dokładnie to samo,
 * co lista dni panelu 1.0.
 *
 * ══ DRUGA OŚ POD TYM SAMYM ADRESEM (3.2.0, `docs/panel-3.2.md` §4.1) ══
 * `?os=piloci` przełącza oś, a nie moduł: ten sam zakres, ten sam zbiór operacji,
 * inne pytanie („kto latał" zamiast „czym latano"). Osobna trasa `/log/pilots`
 * sugerowałaby drugi raport o innym zakresie - a równość sum obu osi jest treścią
 * testu. `&idle=1` dokłada LISTĘ członków bez lotów; sama liczba jedzie zawsze.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminLogQueries } from '../../../application/admin/queries/log.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

const rangeQuery = z.object({
  from: dayParam.optional(),
  to: dayParam.optional(),
  /** Oś maszyn jest domyślna i nie stoi w adresie; wartość spoza słownika to 400. */
  os: z.enum(['piloci']).optional(),
  idle: z.enum(['1']).optional(),
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
    async (req, reply, actor) => {
      const query = rangeQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const range = {
        fromMs: query.data.from,
        // Górną granicę domykamy do końca doby - `do=2026-07-31` ma obejmować cały
        // 31 lipca, a nie jego północ. Ta sama funkcja, co w pozostałych trasach.
        toMs: endOfDay(query.data.to),
      };
      const outcome =
        query.data.os === 'piloci'
          ? await log.loadPilots(actor.orgId, { ...range, includeIdle: query.data.idle === '1' })
          : await log.load(actor.orgId, range);
      // Zakres odwrócony to nie awaria, tylko pytanie bez odpowiedzi - 400 z nazwanym
      // powodem, żeby panel mógł powiedzieć, co poprawić.
      if (!outcome.ok) return reply.code(400).send({ error: outcome.reason });

      return reply.send(outcome.report);
    },
  );
}
