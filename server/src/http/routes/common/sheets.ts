/**
 * UZ Aero (serwer) - trasy kart arkusza: `GET /sheets/:slug/:tab?k=…` i `GET /sheets/:tab`
 * (§4.7; adres z klubem - wielofirmowość §3.7, issue #99 C5).
 *
 * Cel linków `export_log.sheet_url` i pudełka arkusza na ekranie 11 - dopóki karty
 * mieszkają w naszej bazie (bazodanowy adapter `SheetsPort`), to tu się je czyta.
 *
 * ══ DWA ADRESY, DWA POŚWIADCZENIA ══
 * **`/sheets/<slug>/<tab>?k=<sekret>`** - adres, który serwer wpisuje do dziennika
 * eksportu od 2.0.0. Poświadczeniem jest SEKRET KLUBU w zapytaniu, nie sesja: link
 * ma otworzyć kartę skarbnikowi bez konta w aplikacji, a karta jest dokumentem klubu
 * i klub decyduje, komu daje adres. Każda rozbieżność (slug, sekret, nazwa karty)
 * kończy się tym samym 404 - odpowiedź nie mówi, który element był zły.
 *
 * **`/sheets/<tab>`** - adres sprzed 2.0.0, zostaje dla linków zapisanych w `export_log`
 * przed migracją 8: czyta kartę W KLUBIE Z TOKENU, więc wymaga zalogowanego członka
 * i ta sama nazwa w cudzym klubie jest dla niego nieistniejąca.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { SheetQueries } from '../../../application/common/queries/sheets.ts';
import type { StoredDaySheet } from '../../../application/common/ports.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

const addressParams = z.object({
  slug: z.string().min(1).max(60),
  tab: z.string().min(1).max(100),
});

/** Sekret klubu jest zapisem szesnastkowym uuid-a (32 znaki) - dłuższy napis to nie adres. */
const addressQuery = z.object({ k: z.string().min(1).max(64) });

const toWire = (sheet: StoredDaySheet) => ({
  tab: sheet.tab,
  rows: sheet.rows,
  updatedAt: sheet.updatedAt.toISOString(),
});

export function registerSheetsRoutes(
  app: FastifyInstance,
  sheets: SheetQueries,
  gate: MemberGate,
): void {
  app.get('/sheets/:slug/:tab', async (req, reply) => {
    const params = addressParams.safeParse(req.params);
    const query = addressQuery.safeParse(req.query);
    // Brak sekretu nie jest 401: trasa nie ma sesji, którą dałoby się odnowić, a 404
    // jest odpowiedzią na każdy adres, który nie prowadzi do karty.
    if (!params.success || !query.success) return reply.code(404).send({ error: 'not_found' });

    const sheet = await sheets.byAddress(params.data.slug, params.data.tab, query.data.k);
    if (sheet == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(toWire(sheet));
  });

  app.get('/sheets/:tab', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    const { tab } = req.params as { tab: string };
    const sheet = await sheets.get(who.orgId, tab);
    if (sheet == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(toWire(sheet));
  });
}
