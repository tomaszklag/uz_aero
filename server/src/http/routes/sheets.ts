/**
 * UZ Aero (serwer) — trasa `GET /sheets/:tab` (§4.7).
 *
 * Cel linków `export_log.sheet_url` i pudełka arkusza na ekranie 11 — dopóki karty
 * mieszkają w naszej bazie (bazodanowy adapter `SheetsPort`), to tu się je czyta.
 * Autoryzacja Bearer jak na pozostałych trasach: karta to dokument klubu,
 * nie strona publiczna.
 */

import type { FastifyInstance } from 'fastify';

import type { SheetQueries } from '../../application/queries/sheets.ts';
import type { TokenService } from '../../application/ports.ts';
import { authorize } from '../authorize.ts';

export function registerSheetsRoutes(
  app: FastifyInstance,
  sheets: SheetQueries,
  tokens: TokenService,
): void {
  app.get('/sheets/:tab', async (req, reply) => {
    if (authorize(tokens, req.headers.authorization) == null) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { tab } = req.params as { tab: string };
    const sheet = await sheets.get(tab);
    if (sheet == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send({
      tab: sheet.tab,
      rows: sheet.rows,
      updatedAt: sheet.updatedAt.toISOString(),
    });
  });
}
