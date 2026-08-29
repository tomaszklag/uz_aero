/**
 * UZ Aero (serwer) - trasa statystyk (`GET /admin/api/stats`, mockup `A10`).
 *
 * Cienka jak reszta: zod → zapytanie → status. Trasa nie zna ani SQL-a, ani reguły
 * „tylko dni zamknięte" - tłumaczy wyłącznie query string na filtr.
 *
 * ══ ZDOLNOŚĆ: `panel.access` ══
 * Mockup nie zastrzega statystyk dla administratora, a szef wyszkolenia jest ich
 * głównym odbiorcą (nalot per pilot to jego codzienne pytanie). Ekran jest WYŁĄCZNIE
 * do odczytu - zero komend, zero `AuditedWrite` - więc istniejąca zdolność wejścia
 * do panelu wystarcza; nowej nie wymyślamy.
 *
 * Zakres dat jedzie wspólnym parserem `dayRange.ts` (walidacja round-trip - data
 * przewinięta w kalendarzu to 400, nie cicho inny miesiąc), a górna granica jest
 * domykana do KOŃCA doby. Zakres odwrócony (`from > to`) to wada żądania: raport
 * o okresie, który nie istnieje, nie ma poprawnej odpowiedzi, więc 400 zamiast
 * wiarygodnie wyglądających zer. Guard mieszka w ZAPYTANIU (`rangeFrom`), nie tu -
 * dopiero po rozstrzygnięciu domyślnych widać odwrócenie jednostronne (`?from=`
 * z przyszłości bez `to`), bo drugą granicę domyka zegar serwera.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminStatsQueries } from '../../../application/admin/queries/stats.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { dayParam, endOfDay } from './dayRange.ts';

const statsQuery = z.object({
  from: dayParam.optional(),
  to: dayParam.optional(),
});

export function registerAdminStatsRoutes(
  app: FastifyInstance,
  stats: AdminStatsQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/stats', capability: 'panel.access' },
    async (req, reply) => {
      const query = statsQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const { from, to } = query.data;
      // Górna granica jako koniec DNIA, nie jego początek (patrz `dayRange.ts`).
      const outcome = await stats.load({ fromMs: from, toMs: endOfDay(to) });
      if (!outcome.ok) return reply.code(400).send({ error: 'bad_range' });

      return reply.send(outcome.report);
    },
  );
}
