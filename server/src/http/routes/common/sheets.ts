/**
 * UZ Aero (serwer) - trasa `GET /sheets/:tab` (§4.7).
 *
 * Cel linków `export_log.sheet_url` i pudełka arkusza na ekranie 11 - dopóki karty
 * mieszkają w naszej bazie (bazodanowy adapter `SheetsPort`), to tu się je czyta.
 * Autoryzacja Bearer jak na pozostałych trasach: karta to dokument klubu,
 * nie strona publiczna.
 */

import type { FastifyInstance } from 'fastify';

import type { SheetQueries } from '../../../application/common/queries/sheets.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { authorize } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

export function registerSheetsRoutes(
  app: FastifyInstance,
  sheets: SheetQueries,
  tokens: TokenService,
): void {
  app.get('/sheets/:tab', async (req, reply) => {
    const who = authorize(tokens, tokenFromRequest(req));
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    const { tab } = req.params as { tab: string };
    // Karta KLUBU z tokenu: ta sama nazwa w cudzym klubie jest dla czytającego
    // nieistniejąca (wielofirmowość §3.7; adres ze slugiem dochodzi w epiku C).
    const sheet = await sheets.get(who.orgId, tab);
    if (sheet == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send({
      tab: sheet.tab,
      rows: sheet.rows,
      updatedAt: sheet.updatedAt.toISOString(),
    });
  });
}
