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
 */

import type { FastifyInstance } from 'fastify';

import type { TaskSuggestionQueries } from '../../../application/mobile/queries/taskSuggestions.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { authorize } from '../../authorize.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';

export function registerTaskSuggestionRoutes(
  app: FastifyInstance,
  suggestions: TaskSuggestionQueries,
  tokens: TokenService,
): void {
  app.get('/me/task-suggestions', async (req, reply) => {
    const claims = authorize(tokens, tokenFromRequest(req));
    if (claims == null) return reply.code(401).send({ error: 'unauthorized' });

    return reply.send(await suggestions.get(claims.pilotId));
  });
}
