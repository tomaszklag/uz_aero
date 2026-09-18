/**
 * Ninerdeck (serwer) - trasy SESJI LOGOWANIA w panelu (2.1.0, issue #133; §5.6;
 * mockupy `piloci-konto` i `konto`).
 *
 * Dwa zakresy i dwie różne zdolności, bo to dwa różne pytania:
 *  • `/me/sessions` - „gdzie JA jestem zalogowany". Odpowiada OBU rodzajom sesji panelu
 *    (`sessionRoute`), bo pyta o osobę, a nie o klub; superadministrator ma je tak samo;
 *  • `/pilots/:id/sessions` - „jakie urządzenia ma TEN CZŁONEK w moim klubie". To już
 *    władza nad kimś, więc `accounts.manage` i wpis w dzienniku.
 *
 * Nazwa modułu mówi `loginSessions`, a nie `sessions`, i to nie jest ozdoba: `sessions`
 * w tym projekcie znaczy OPERACJĘ LOTNICZĄ (`routes/admin/sessions.ts`). Dwa różne byty
 * pod jedną nazwą w jednym katalogu skończyłyby się pomyłką przy pierwszym grepie.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands } from '../../../application/common/commands/auth.ts';
import type { AdminLoginSessionCommands } from '../../../application/admin/commands/loginSessions.ts';
import type { AdminLoginSessionQueries } from '../../../application/admin/queries/loginSessions.ts';
import { adminRoute, sessionRoute, type AdminGate } from './adminRoute.ts';

const pilotParams = z.object({ id: z.string().min(1).max(100) });
const sessionParams = z.object({ sid: z.string().min(1).max(100) });
const memberSessionParams = pilotParams.merge(sessionParams);

export function registerAdminLoginSessionRoutes(
  app: FastifyInstance,
  queries: AdminLoginSessionQueries,
  commands: AdminLoginSessionCommands,
  auth: AuthCommands,
  gate: AdminGate,
): void {
  sessionRoute(app, gate, { method: 'GET', url: '/me/sessions' }, {
    org: async (_req, reply, actor) =>
      reply.send(await queries.mine(actor.pilotId, actor.sessionId)),
    platform: async (_req, reply, actor) =>
      reply.send(await queries.mine(actor.pilotId, actor.sessionId)),
  });

  /**
   * `404` obejmuje też próbę wyłączenia sesji BIEŻĄCEJ - z tego samego powodu, co cudzej:
   * to żądanie o coś, czego ta trasa nie robi. Wylogowanie siebie ma własną trasę.
   */
  sessionRoute(app, gate, { method: 'DELETE', url: '/me/sessions/:sid' }, {
    org: async (req, reply, actor) => {
      const params = sessionParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });
      const done = await auth.revokeOwnSession(actor.pilotId, params.data.sid, actor.sessionId);
      return done ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
    },
    platform: async (req, reply, actor) => {
      const params = sessionParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });
      const done = await auth.revokeOwnSession(actor.pilotId, params.data.sid, actor.sessionId);
      return done ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
    },
  });

  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/pilots/:id/sessions', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });
      return reply.send(await queries.ofMember(actor.orgId, params.data.id));
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'DELETE', url: '/pilots/:id/sessions/:sid', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = memberSessionParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await commands.revoke(actor, params.data.id, params.data.sid);
      return outcome.ok ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/pilots/:id/sessions/revoke-all', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await commands.revokeAll(actor, params.data.id);
      // Liczba wraca do panelu, bo jest jedyną odpowiedzią na „co się właśnie stało":
      // zero znaczy „nie było czego wylogować", a nie „nie udało się".
      return outcome.ok
        ? reply.send({ revoked: outcome.revoked })
        : reply.code(404).send({ error: 'not_found' });
    },
  );
}
