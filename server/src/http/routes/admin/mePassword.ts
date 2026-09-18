/**
 * Ninerdeck (serwer) - `PUT /admin/api/me/password`: hasło zalogowanego w PANELU
 * (`#/konto`, mockup `konto`; 2.1.0, `docs/logowanie-haslem.md` §5.3).
 *
 * `sessionRoute`, bo pyta o to SAMA SESJA, a nie moduł - i to obie jej odmiany:
 * administrator klubu i superadministrator bez klubu. Ta sama komenda, to samo ciało
 * i ta sama tabela odpowiedzi, co `PUT /me/password` telefonu (`routes/common/password.ts`);
 * różni je wyłącznie brama.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { PasswordCommands } from '../../../application/common/commands/passwords.ts';
import { changePasswordBody, sendChangeOutcome } from '../common/password.ts';
import { sessionRoute, type AdminGate } from './adminRoute.ts';

async function changePassword(
  passwords: PasswordCommands,
  req: FastifyRequest,
  reply: FastifyReply,
  pilotId: string,
  /** Sesja tej karty przeglądarki - JEDYNA, która przeżywa zmianę hasła (§5.3). */
  sessionId: string | null,
): Promise<unknown> {
  const parsed = changePasswordBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

  return sendChangeOutcome(
    reply,
    await passwords.change(pilotId, parsed.data.current ?? null, parsed.data.next, sessionId),
  );
}

export function registerAdminMePasswordRoutes(
  app: FastifyInstance,
  passwords: PasswordCommands,
  gate: AdminGate,
): void {
  sessionRoute(app, gate, { method: 'PUT', url: '/me/password' }, {
    org: (req, reply, actor) =>
      changePassword(passwords, req, reply, actor.pilotId, actor.sessionId),
    platform: (req, reply, actor) =>
      changePassword(passwords, req, reply, actor.pilotId, actor.sessionId),
  });
}
