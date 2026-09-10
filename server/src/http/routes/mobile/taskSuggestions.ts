/**
 * UZ Aero (serwer) - trasa `GET /me/task-suggestions` (issue #14, ekran 02e).
 *
 * Cienka jak reszta `/me/*`: token → zapytanie → treść. Tożsamość WYŁĄCZNIE z tokenu
 * (wzorzec `prefs.ts`) - gdyby pilot mógł podać `picId` w zapytaniu, endpoint
 * podpowiadający notatki stałby się czytnikiem cudzych notatek.
 *
 * Pusta historia to `{ clients: [], notes: [] }` ze statusem 200, nie 404: nowy klub
 * i pierwszy dzień pilota są stanem normalnym, a błąd na ścieżce wygody zamieniłby
 * brak podpowiedzi w komunikat o awarii.
 *
 * Podpowiedzi KLUBU z tokenu (issue #99): kontrahent jednego klubu nie podpowiada się
 * w drugim, a notatki pilota z drugiego klubu zostają tam, gdzie powstały.
 */

import type { FastifyInstance } from 'fastify';

import type { TaskSuggestionQueries } from '../../../application/mobile/queries/taskSuggestions.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

export function registerTaskSuggestionRoutes(
  app: FastifyInstance,
  suggestions: TaskSuggestionQueries,
  gate: MemberGate,
): void {
  app.get('/me/task-suggestions', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    return reply.send(await suggestions.get(who.orgId, who.pilotId));
  });
}
