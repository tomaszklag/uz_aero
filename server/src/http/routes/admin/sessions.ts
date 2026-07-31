/**
 * UZ Aero (serwer) — trasy dni lotnych panelu (`GET /admin/api/sessions*`,
 * mockupy `A02-dni.html` i `A02a-dzien.html`).
 *
 * Cienkie jak reszta repo: zod → zapytanie → status. Trasa nie zna ani SQL-a, ani
 * porządku listy, ani tego, jak liczą się dni — tłumaczy wyłącznie query string na
 * filtr i wynik na kod HTTP.
 *
 * Zdolność `panel.access`: odczyt dni ma administrator i szef wyszkolenia. Korekta,
 * czyli jedyna operacja PISZĄCA na tym zasobie, mieszka w `corrections.ts` i wymaga
 * `events.correct` — pisanie w cudzym rejestrze to inna odpowiedzialność niż czytanie.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OPERATION_TYPES } from '@uzaero/domain';

import type { AdminSessionQueries } from '../../../application/admin/queries/sessions.ts';
import { PAGE_LIMIT_MAX, type SessionListFilter } from '../../../application/admin/ports.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { adminRoute } from './adminRoute.ts';

/**
 * Dzień jako `YYYY-MM-DD` w UTC — panel filtruje po DNIACH, nie po stemplach, bo tak
 * wygląda kalendarz na A02. Zakres jest obustronnie DOMKNIĘTY: `do=2026-07-31` obejmuje
 * cały 31 lipca do 23:59:59.999 UTC, inaczej „od 25 do 31" gubiłoby ostatni dzień —
 * najbardziej nieoczywisty możliwy sposób na zgubienie danych w narzędziu nadzoru.
 */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'oczekiwano daty YYYY-MM-DD (UTC)')
  .transform((value) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  });

const DAY_MS = 24 * 60 * 60 * 1000;

const listQuery = z.object({
  from: day.optional(),
  to: day.optional(),
  aircraftId: z.string().min(1).max(50).optional(),
  pilotId: z.string().min(1).max(50).optional(),
  status: z.enum(['active', 'closed']).optional(),
  operation: z.enum(OPERATION_TYPES).optional(),
  // `z.coerce.boolean()` jest tu pułapką: uznaje KAŻDY niepusty napis za `true`,
  // więc `?flagged=false` filtrowałoby dni Z flagą. Enum mówi to wprost.
  flagged: z.enum(['true', 'false']).optional(),
  exported: z.enum(['true', 'false']).optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().positive().max(PAGE_LIMIT_MAX).default(50),
  cursor: z.string().min(1).max(500).optional(),
});

const detailParams = z.object({ uuid: z.string().min(1).max(100) });

const asBoolean = (value: 'true' | 'false' | undefined): boolean | undefined =>
  value === undefined ? undefined : value === 'true';

export function registerAdminSessionRoutes(
  app: FastifyInstance,
  sessions: AdminSessionQueries,
  tokens: TokenService,
): void {
  adminRoute(
    app,
    tokens,
    { method: 'GET', url: '/sessions', capability: 'panel.access' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      const filter: SessionListFilter = {
        fromMs: q.from,
        // Górna granica jako koniec DNIA, nie jego początek (patrz komentarz przy `day`).
        toMs: q.to === undefined ? undefined : q.to + DAY_MS - 1,
        aircraftId: q.aircraftId,
        pilotId: q.pilotId,
        status: q.status,
        operation: q.operation,
        flagged: asBoolean(q.flagged),
        exported: asBoolean(q.exported),
        cursor: q.cursor,
        direction: q.sort,
        limit: q.limit,
      };

      const outcome = await sessions.list(filter);
      // 400, nie 500: kursor przychodzi z zewnątrz, więc jego uszkodzenie jest wadą
      // żądania. Milczące zaczęcie od pierwszej strony byłoby gorsze — panel
      // pokazałby początek listy, sądząc, że przewinął dalej.
      if (!outcome.ok) return reply.code(400).send({ error: 'bad_cursor' });

      return reply.send(outcome.page);
    },
  );

  adminRoute(
    app,
    tokens,
    { method: 'GET', url: '/sessions/:uuid', capability: 'panel.access' },
    async (req, reply) => {
      const params = detailParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const detail = await sessions.detail(params.data.uuid);
      if (detail == null) return reply.code(404).send({ error: 'not_found' });

      return reply.send(detail);
    },
  );
}
