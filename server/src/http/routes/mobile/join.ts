/**
 * UZ Aero (serwer) - `POST /auth/join { code }`: dołączenie do klubu kodem
 * (wielofirmowość §3.8, §5; issue #100, ekrany 00E i 13A).
 *
 * Cienka jak reszta: zod → komenda → status. Tabela odpowiedzi jest w całości
 * wypisana w `docs/wielofirmowosc.md` §5:
 *  • `202` zgłoszenie czeka (także, gdy czekało już wcześniej - bez drugiego wiersza);
 *  • `403` odrzucono z powodem - ponowny kod decyzji nie obchodzi;
 *  • `409` już w klubie (`already_member`) albo członkostwo wyłączone (`membership_disabled`);
 *  • `404` kod nieznany = wyłączony = klub nieaktywny - jedna odpowiedź, nic się nie ujawnia;
 *  • `429` z `Retry-After` i `retryAfterSec` - ograniczenie tempa (10/osoba, 30/adres w 15 min).
 *
 * Przyjmuje token OSOBY (00E) albo token DOWOLNEGO klubu (13A: pilot klubu A dołącza
 * do B) - rozstrzyga `AuthCommands.identifyPerson`, nie ta trasa.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuthCommands } from '../../../application/common/commands/auth.ts';
import type { JoinCommands } from '../../../application/mobile/commands/join.ts';
import { tokenFromRequest } from '../../tokenFromRequest.ts';
import { membershipToWire } from '../common/auth.ts';

/**
 * Kod jak go wpisał pilot - z myślnikiem albo bez, małymi albo wielkimi literami;
 * normalizuje domena (`clubCode.ts`). Sufit chroni przed megabajtem, nie waliduje
 * kształtu: zły kształt dostaje to samo `404`, co kod nieznany.
 */
const joinBody = z.object({ code: z.string().trim().min(1).max(32) });

export function registerJoinRoutes(app: FastifyInstance, auth: AuthCommands, join: JoinCommands): void {
  app.post('/auth/join', async (req, reply) => {
    const parsed = joinBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const person = auth.identifyPerson(tokenFromRequest(req));
    if (person == null) return reply.code(401).send({ error: 'unauthorized' });

    // `req.ip` - za proxy TLS (Railway) prawdziwy adres, gdy `trustProxy` (patrz `ServerOptions`).
    const outcome = await join.joinByCode(person, parsed.data.code, req.ip ?? null);
    if (outcome.ok) {
      return reply.code(202).send({
        status: 'pending',
        org: outcome.org,
        memberships: outcome.clubs.memberships.map(membershipToWire),
      });
    }

    switch (outcome.reason) {
      case 'account_disabled':
        return reply.code(401).send({ error: 'account_disabled' });
      case 'rate_limited':
        return reply
          .header('Retry-After', String(outcome.retryAfterSec))
          .code(429)
          .send({ error: 'too_many_attempts', retryAfterSec: outcome.retryAfterSec });
      case 'unknown_code':
        return reply.code(404).send({ error: 'unknown_code' });
      case 'rejected':
        return reply.code(403).send({
          error: 'membership_rejected',
          org: outcome.org,
          rejectReason: outcome.rejectReason,
          decidedAt: outcome.decidedAt?.toISOString() ?? null,
        });
      case 'already_member':
        return reply.code(409).send({ error: 'already_member', org: outcome.org });
      case 'membership_disabled':
        return reply.code(409).send({ error: 'membership_disabled', org: outcome.org });
    }
  });
}
