/**
 * Ninerdeck (serwer) - trasy stanu floty: `GET /aircraft/:id/state`
 * i `GET /sessions/:uuid/sync-status` (§4.6).
 *
 * Oba czyste odczyty projekcji - telefon odpytuje je przy starcie, po opróżnieniu
 * outboxa i na ekranach stanu floty (preflight, read-only, ekran 11). Pushów nie ma
 * z decyzji, nie z lenistwa.
 *
 * Klub przychodzi z tokenu (issue #99): maszyna cudzego klubu jest dla pytającego
 * NIEISTNIEJĄCA (404), a cudza sesja w `sync-status` wygląda jak nieznana serwerowi.
 */

import type { FastifyInstance } from 'fastify';

import type { StateQueries } from '../../../application/mobile/queries/aircraftState.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

export function registerStateRoutes(
  app: FastifyInstance,
  state: StateQueries,
  gate: MemberGate,
): void {
  app.get('/aircraft/:id/state', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const { id } = req.params as { id: string };
    const view = await state.aircraftState(who.orgId, id);
    if (view == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(view);
  });

  /**
   * Ciągłość odczytów wokół chwili (paliwo, motogodziny, olej) `at` (issue #62, piąta tura) - czym maszyna została
   * zdana PRZED tym lotem i co zastał ten, kto ją przejął PO nim.
   *
   * Materiał podpowiedzi wpisu ręcznego: lot sprzed tygodnia opisuje maszynę, którą
   * między tamtym dniem a dziś latał ktoś inny, więc `handover` z `/reference` (jeden
   * punkt: „ile jest teraz") na to pytanie nie odpowiada.
   *
   * Bez `at` odmawiamy zamiast zgadywać „teraz": chwila jest CAŁYM pytaniem tej trasy,
   * a domyślne „teraz" dałoby odpowiedź poprawną formalnie i nie na temat.
   */
  app.get('/aircraft/:id/readings-chain', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const { id } = req.params as { id: string };
    const query = req.query as { at?: string; except?: string };
    /* `Number('')` daje 0, czyli rok 1970 - poprawną liczbę i całkiem nie tę chwilę,
       o którą pytano. Pusty parametr jest brakiem pytania, nie pytaniem o epokę. */
    const at = query.at != null && query.at !== '' ? Number(query.at) : Number.NaN;
    if (!Number.isFinite(at)) {
      return reply.code(400).send({ error: 'bad_at' });
    }
    const chain = await state.readingsChain(who.orgId, id, at, query.except);
    if (chain == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(chain);
  });

  app.get('/sessions/:uuid/sync-status', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const { uuid } = req.params as { uuid: string };
    return reply.send(await state.syncStatus(who.orgId, uuid));
  });
}
