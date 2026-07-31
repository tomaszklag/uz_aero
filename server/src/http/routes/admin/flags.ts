/**
 * UZ Aero (serwer) — trasy flag panelu (`/admin/api/flags*`, mockup `A03a-flaga.html`).
 *
 * Cienkie jak reszta repo: zod → komenda → status. Trasa nie zna ani transakcji,
 * ani audytu, ani reguły „kiedy re-eksport" — to wszystko jest w komendzie.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminFlagCommands, ResolveFlagResult } from '../../../application/admin/commands/flags.ts';
import type { AdminFlag } from '../../../application/admin/ports.ts';
import type { TokenService } from '../../../application/ports.ts';
import { adminRoute } from './adminRoute.ts';

const resolveParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Komentarz jest WYMAGANY (mockup A03a: „Komentarz — wymagany"), a `.trim()` przed
 * `.min(1)` znaczy, że spacje nie liczą się za uzasadnienie. Za pół roku nikt nie
 * pamięta, dlaczego nakładka sesji okazała się pozorna — pusty ślad jest wtedy
 * gorszy niż brak przycisku.
 */
const resolveBody = z.object({ note: z.string().trim().min(1).max(2000) });

const flagToWire = (flag: AdminFlag) => ({
  id: flag.id,
  type: flag.type,
  aircraftId: flag.aircraftId,
  sessionUuids: flag.sessionUuids,
  details: flag.details,
  status: flag.status,
  resolvedAt: flag.resolvedAt?.toISOString() ?? null,
  resolvedBy: flag.resolvedBy,
  resolutionNote: flag.resolutionNote,
});

const resultToWire = (result: ResolveFlagResult) => ({
  flagId: result.flagId,
  type: result.type,
  resolvedAt: result.resolvedAt.toISOString(),
  // Wynik eksportu jedzie w odpowiedzi, żeby panel mógł powiedzieć „arkusz
  // odblokowany · rewizja 1" zamiast samego „zapisano" — a przy fladze, która
  // eksportu nie blokowała, uczciwie pokazać pustą listę.
  exports: result.exports,
});

export function registerAdminFlagRoutes(
  app: FastifyInstance,
  flags: AdminFlagCommands,
  tokens: TokenService,
): void {
  adminRoute(
    app,
    tokens,
    { method: 'POST', url: '/flags/:id/resolve', capability: 'flags.resolve' },
    async (req, reply, actor) => {
      const params = resolveParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = resolveBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await flags.resolve(actor, params.data.id, body.data.note);
      if (!outcome.ok) {
        if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
        // 409, a nie 200 „i tak jest rozwiązana": drugi klikający ma zobaczyć, że
        // sprawę zamknął ktoś inny, i CZYIM komentarzem — inaczej dopisałby własne
        // uzasadnienie do decyzji, której nie podjął.
        return reply
          .code(409)
          .send({ error: 'already_resolved', flag: flagToWire(outcome.flag) });
      }

      return reply.send(resultToWire(outcome.result));
    },
  );
}
