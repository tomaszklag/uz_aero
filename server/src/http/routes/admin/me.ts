/**
 * UZ Aero (serwer) — `GET /admin/api/me`: kto jest zalogowany w panelu.
 *
 * Istnieje wyłącznie dlatego, że ciasteczko sesji jest `HttpOnly`: po odświeżeniu
 * karty panel nie ma jak odczytać własnej tożsamości i musi o nią zapytać.
 *
 * Zdolność `panel.access` — czyli ta sama brama, co przy wydaniu sesji. Konto, które
 * straciło rolę, dostanie tu 403 z podanym powodem i panel pokaże ekran „brak
 * uprawnień" zamiast pustego shellu.
 */

import type { FastifyInstance } from 'fastify';

import type { AdminMeQueries } from '../../../application/admin/queries/me.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { adminRoute } from './adminRoute.ts';
import { panelSessionToWire } from './auth.ts';

export function registerAdminMeRoutes(
  app: FastifyInstance,
  me: AdminMeQueries,
  tokens: TokenService,
): void {
  adminRoute(
    app,
    tokens,
    { method: 'GET', url: '/me', capability: 'panel.access' },
    async (_req, reply, actor) => {
      const pilot = await me.get(actor.pilotId);
      // Token ważny, konto skasowane albo wyłączone → 401, nie 404: pytanie brzmi
      // „kim jestem", a odpowiedź „nikim" znaczy dla panelu dokładnie „zaloguj się".
      if (pilot == null) return reply.code(401).send({ error: 'unauthorized' });

      return reply.send(panelSessionToWire(pilot));
    },
  );
}
