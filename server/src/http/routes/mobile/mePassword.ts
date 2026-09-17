/**
 * Ninerdeck (serwer) - `PUT /me/password`: ustawienie albo zmiana hasła z ustawień
 * telefonu (ekran 13, arkusz 13B; 2.1.0, `docs/logowanie-haslem.md` §5.3).
 *
 * Trasa TELEFONU za bramą członkostwa (`memberFromRequest`): hasło ustawia osoba, która
 * już weszła do klubu - to jest droga „ustaw hasło do logowania na wspólnym tablecie".
 * Osoba bez klubu (token osoby) hasła stąd nie ustawi; jej drogą jest link z e-maila.
 *
 * Ciało i tabela odpowiedzi są WSPÓLNE z panelem (`routes/common/password.ts`):
 * `204` / `401 invalid_credentials` / `409 email_required` / `400 weak_password { reason }`
 * / `429` z `Retry-After`.
 */

import type { FastifyInstance } from 'fastify';

import type { PasswordCommands } from '../../../application/common/commands/passwords.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';
import { changePasswordBody, sendChangeOutcome } from '../common/password.ts';

export function registerMePasswordRoutes(
  app: FastifyInstance,
  passwords: PasswordCommands,
  gate: MemberGate,
): void {
  app.put('/me/password', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = changePasswordBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    return sendChangeOutcome(
      reply,
      await passwords.change(who.pilotId, parsed.data.current ?? null, parsed.data.next),
    );
  });
}
