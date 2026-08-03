/**
 * UZ Aero (serwer) — trasy flag panelu (`/admin/api/flags*`, mockup `A03a-flaga.html`).
 *
 * Cienkie jak reszta repo: zod → komenda → status. Trasa nie zna ani transakcji,
 * ani audytu, ani reguły „kiedy re-eksport" — to wszystko jest w komendzie.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FLAG_TYPES } from '@uzaero/domain';

import type { AdminFlagCommands, ResolveFlagResult } from '../../../application/admin/commands/flags.ts';
import type { AdminFlagQueries } from '../../../application/admin/queries/flags.ts';
import { PAGE_LIMIT_MAX, type AdminFlag } from '../../../application/admin/ports.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const resolveParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Filtry skrzynki (`A03`). Wszystkie opcjonalne — brak filtra znaczy „pokaż wszystko",
 * a nie „pokaż otwarte": domyślne zawężenie w API byłoby niewidoczną regułą, o której
 * panel musiałby wiedzieć, żeby zrozumieć swoje własne liczniki. Domyślny chip
 * „Otwarte · 7" ustawia panel, jawnie.
 *
 * Zakres dat jako epoch ms — filtruje po `created_at` flagi, czyli po chwili WYKRYCIA
 * rozbieżności, a nie po dniu lotnym, którego dotyczy (jedna flaga potrafi spinać dwa dni).
 */
const listQuery = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  type: z.enum(FLAG_TYPES).optional(),
  aircraftId: z.string().min(1).max(50).optional(),
  sessionUuid: z.string().min(1).max(100).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(PAGE_LIMIT_MAX).default(100),
});

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
  queries: AdminFlagQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    // `panel.access`, nie `flags.resolve`: skrzynkę CZYTA każdy, kto ma wejście do
    // panelu — zamyka sprawę węższa zdolność, i to jest cały podział.
    { method: 'GET', url: '/flags', capability: 'panel.access' },
    async (req, reply) => {
      const query = listQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'bad_request' });

      const q = query.data;
      return reply.send(
        await queries.list({
          status: q.status,
          type: q.type,
          aircraftId: q.aircraftId,
          sessionUuid: q.sessionUuid,
          fromMs: q.from,
          toMs: q.to,
          limit: q.limit,
        }),
      );
    },
  );

  adminRoute(
    app,
    gate,
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
