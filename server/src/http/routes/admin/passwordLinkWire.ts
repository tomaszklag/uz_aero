/**
 * Ninerdeck (serwer) - odmowy wysyłki linku „ustaw hasło" na drucie (2.1.0, §5.4).
 * Jedno miejsce, bo dwie trasy (członek klubu, zaproszenie administratora klubu) kończą
 * się tą samą tabelą: `404 not_found` (cudzy pilot jest nieistniejący), `409 email_required`
 * (tu wolno powiedzieć wprost - pyta zalogowany administrator), `502 mail_failed`
 * (token jest, list nie doszedł - „Wyślij ponownie" wyda nowy).
 */

import type { FastifyReply } from 'fastify';

export function passwordLinkRefusal(
  reply: FastifyReply,
  reason: 'not_found' | 'email_required' | 'mail_failed',
): unknown {
  switch (reason) {
    case 'not_found':
      return reply.code(404).send({ error: 'not_found' });
    case 'email_required':
      return reply.code(409).send({ error: 'email_required' });
    case 'mail_failed':
      return reply.code(502).send({ error: 'mail_failed' });
  }
}
