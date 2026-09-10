/**
 * Ninerdeck (serwer) - trasy KOLEJKI ZGŁOSZEŃ kodem klubu (`/admin/api/memberships*`;
 * mockupy `piloci-lista` - karta ZGŁOSZENIA, `piloci-zgloszenie` - decyzja;
 * `docs/wielofirmowosc.md` §8.3; issue #100, D2).
 *
 * Cienkie jak reszta repo: zod → komenda → status. Reguły przejść („tylko z `pending`")
 * i odmowy siedzą w komendzie i w `domain/accountGuards.ts`.
 *
 * ══ WSZYSTKO NA `accounts.manage` - TAKŻE ODCZYT ══
 * Inaczej niż lista członków, którą czyta każdy z wejściem do panelu: tu w wierszach
 * stoją adresy e-mail ludzi, których w klubie NIE MA, a decyzja o nich jest tą samą
 * władzą, co zakładanie kont. Ta sama reguła, którą issue #89 nałożyło na kolejkę
 * zgłoszeń rejestracyjnych (`docs/logowanie-google.md`).
 *
 * ══ ADRESEM JEST IDENTYFIKATOR OSOBY, NIE KODU ══
 * Kandydat kodu pilota jeszcze nie ma - dostaje go dopiero przy zatwierdzeniu - więc
 * jedynym adresem zgłoszenia jest `pilotId` (osoba powstała przy pierwszym logowaniu
 * Googlem, §4). Klub bierze się z sesji panelu, jak wszędzie.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { AdminMembershipCommands } from '../../../application/admin/commands/memberships.ts';
import type { AdminMembershipQueries } from '../../../application/admin/queries/memberships.ts';
import type { AdminMembershipDecision } from '../../../application/admin/contracts/memberships.ts';
import type { MembershipDecided } from '../../../application/admin/commands/memberships.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { accountToWire, pilotCode, pilotIdParams, pilotRole } from './pilotFields.ts';

/** Zatwierdzenie nadaje kod i rolę - oba WYMAGANE, bo aktywny ⟺ ma kod. */
const approveBody = z.object({ code: pilotCode, role: pilotRole });

/**
 * Powód odrzucenia jest WYMAGANY (min. 3 znaki po przycięciu).
 *
 * Nie jest formalnością: pilot czyta go na swoim telefonie (00D) i to jest jedyna
 * wiadomość, jaką dostaje. Sufit 500 znaków jak przy powodzie korekty - pole jest
 * zdaniem, nie listem.
 */
const rejectBody = z.object({ reason: z.string().trim().min(3).max(500) });

const decisionToWire = (decided: MembershipDecided): AdminMembershipDecision => ({
  pilotId: decided.pilotId,
  status: decided.status,
  decidedAt: decided.decidedAt?.toISOString() ?? null,
  rejectReason: decided.rejectReason,
});

export function registerAdminMembershipRoutes(
  app: FastifyInstance,
  memberships: AdminMembershipCommands,
  queries: AdminMembershipQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/memberships/pending', capability: 'accounts.manage' },
    async (_req, reply, actor) => reply.send(await queries.pending(actor.orgId)),
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/memberships/:id/approve', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotIdParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = approveBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await memberships.approve(actor, params.data.id, body.data);
      if (!outcome.ok) return refusal(reply, outcome);

      // Wpuszczony kandydat jest odtąd wierszem LISTY, nie kolejki - panel dostaje go
      // w kształcie, w jakim go pokaże.
      return reply.send({ pilot: accountToWire(outcome.result, new Date()) });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/memberships/:id/reject', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotIdParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = rejectBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await memberships.reject(actor, params.data.id, body.data.reason);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({ membership: decisionToWire(outcome.result) });
    },
  );

  adminRoute(
    app,
    gate,
    // COFNIĘCIE ODRZUCENIA - osobna trasa, nie `approve` na odrzuconym: zdjęcie cudzej
    // odmowy i wpuszczenie do klubu to dwie różne decyzje i każda ma własny ślad.
    { method: 'POST', url: '/memberships/:id/reopen', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const params = pilotIdParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await memberships.reopen(actor, params.data.id);
      if (!outcome.ok) return refusal(reply, outcome);

      return reply.send({ membership: decisionToWire(outcome.result) });
    },
  );
}

/**
 * Wariant odmowy → status i ciało. Jedno miejsce, bo trzy trasy odmawiają tak samo.
 *
 * **409 `wrong_status` niesie STAN.** Administrator z otwartą szufladą nie wie, że drugi
 * administrator rozstrzygnął to zgłoszenie minutę temu - „nie można" bez powiedzenia,
 * co się stało, wygląda jak awaria i kończy się pytaniem do nas, a nie odświeżeniem listy.
 */
function refusal(
  reply: FastifyReply,
  outcome: { reason: string; status?: string; field?: string; refusal?: string },
): unknown {
  if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
  if (outcome.reason === 'wrong_status') {
    return reply.code(409).send({ error: 'wrong_status', status: outcome.status });
  }
  if (outcome.reason === 'conflict') {
    return reply.code(409).send({ error: 'conflict', field: outcome.field });
  }
  return reply.code(409).send({ error: 'refused', reason: outcome.refusal });
}
