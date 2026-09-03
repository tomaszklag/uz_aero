/**
 * UZ Aero (serwer) - trasa ZAKOŃCZENIA ADMINISTRACYJNEGO operacji
 * (`POST /admin/api/sessions/:uuid/close`, issue #81).
 *
 * Cienka jak `sessionVoid.ts`: zod → komenda → status. Osobny plik z tych samych
 * powodów, co tamten: to inny zasób niż korekta (nie ma celu wewnątrz operacji) i inna
 * zdolność niż odczyt dziennika (`events.correct` - pisze w cudzym rejestrze).
 *
 * `void` w ciele to PRZEŁĄCZNIK, nie osobna trasa: „zakończ i od razu unieważnij" jest
 * jedną decyzją administratora podejmowaną w jednym miejscu, a rejestr i tak dostaje
 * dwa fakty (komenda). Dwie trasy kazałyby panelowi wołać je po kolei i radzić sobie
 * z sukcesem pierwszej przy odmowie drugiej.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type {
  AdminSessionCloseCommands,
  SessionCloseResult,
} from '../../../application/admin/commands/sessionClose.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const params = z.object({ uuid: z.string().min(1).max(100) });

/** Powód WYMAGANY (zamyka się cudzy lot) - jak przy unieważnieniu; spacje się nie liczą. */
const body = z.object({
  reason: z.string().trim().min(1).max(2000),
  void: z.boolean().default(false),
});

const resultToWire = (result: SessionCloseResult) => ({
  sessionUuid: result.sessionUuid,
  closeUuid: result.closeUuid,
  voidUuid: result.voidUuid,
  recordedAt: result.recordedAt.toISOString(),
  state: result.state,
  warnings: result.warnings,
  reexport: result.reexport,
});

export function registerAdminSessionCloseRoutes(
  app: FastifyInstance,
  sessionClose: AdminSessionCloseCommands,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/sessions/:uuid/close', capability: 'events.correct' },
    async (req, reply, actor) => {
      const p = params.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });

      const b = body.safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await sessionClose.closeSession(actor, {
        sessionUuid: p.data.uuid,
        reason: b.data.reason,
        void: b.data.void,
      });

      if (!outcome.ok) {
        if (outcome.reason === 'session_not_found') {
          return reply.code(404).send({ error: 'not_found' });
        }
        // 422: żądanie poprawne, DOMENA odmawia (operacja już zakończona / już wycofana).
        return reply.code(422).send({ error: 'rule_violation', violations: outcome.violations });
      }

      return reply.send(resultToWire(outcome.result));
    },
  );
}
