/**
 * UZ Aero (serwer) - trasa unieważnienia całej sesji
 * (`POST /admin/api/sessions/:uuid/void`).
 *
 * Cienka jak reszta repo: zod → komenda → status.
 *
 * ══ DLACZEGO OSOBNY PLIK, A NIE `corrections.ts` ══
 * Bo to inny zasób i inny słownik. `corrections.ts` obsługuje `/sessions/:uuid/corrections`
 * i całą swoją treścią mówi o CELU wewnątrz sesji (`targetUuid`, trzy akcje, podgląd
 * „przed → po"). Unieważnienie nie ma celu, nie ma akcji do wyboru i nie ma czego
 * pokazywać w podglądzie: skutkiem jest zniknięcie CAŁEGO wpisu z rachunków. Wciągnięcie
 * go tam kosztowałoby czwarty wariant unii, który nie użyłby ani jednego pola pozostałych.
 *
 * ══ DLACZEGO NIE W `sessions.ts` ══
 * Bo tamten plik czyta się zdolnością `panel.access` (administrator i szef wyszkolenia),
 * a tu piszemy w cudzym rejestrze - to `events.correct`, czyli sam administrator
 * (`domain/roles.ts`). Ta sama granica, którą nagłówek `sessions.ts` deklaruje wprost.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type {
  AdminSessionVoidCommands,
  SessionVoidResult,
} from '../../../application/admin/commands/sessionVoid.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const params = z.object({ uuid: z.string().min(1).max(100) });

/**
 * `reason` jest WYMAGANY, a `.trim()` przed `.min(1)` znaczy, że spacje nie liczą się
 * za uzasadnienie - dokładnie jak przy korekcie administratora.
 *
 * W telefonie ten sam powód jest OPCJONALNY i nie jest to niekonsekwencja: pilot
 * wycofuje WŁASNY wpis i wie, co zrobił. Tu wycofuje się cudzy lot, a powód jest
 * jedyną rzeczą, która za rok wyjaśni, czemu w rejestrze stoi sesja, której nikt
 * nie liczy.
 */
const body = z.object({ reason: z.string().trim().min(1).max(2000) });

const resultToWire = (result: SessionVoidResult) => ({
  sessionUuid: result.sessionUuid,
  voidUuid: result.voidUuid,
  recordedAt: result.recordedAt.toISOString(),
  // `SessionState` jest bytem DOMENOWYM, więc jedzie bez własnego DTO (reguła granicy
  // typów, `docs/architektura-panelu-serwer.md` §1.2). Panel formatuje i nic nie liczy.
  state: result.state,
  // Kolizje z pilotem jadą w odpowiedzi POZYTYWNEJ: wpis jest już wycofany, a panel ma
  // powiedzieć, w co administrator wszedł.
  warnings: result.warnings,
  // Wynik przebudowy karty arkusza - uczciwie `null`, gdy eksport padł.
  reexport: result.reexport,
});

export function registerAdminSessionVoidRoutes(
  app: FastifyInstance,
  sessionVoid: AdminSessionVoidCommands,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/sessions/:uuid/void', capability: 'events.correct' },
    async (req, reply, actor) => {
      const p = params.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });

      const b = body.safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await sessionVoid.voidSession(actor, {
        sessionUuid: p.data.uuid,
        reason: b.data.reason,
      });

      if (!outcome.ok) {
        if (outcome.reason === 'session_not_found') {
          return reply.code(404).send({ error: 'not_found' });
        }
        // 422, a nie 400: żądanie jest poprawnie zbudowane, to DOMENA odmawia (sesja
        // już wycofana, sesja bez przejęcia). Panel pokazuje konkretny powód z listy,
        // a nie „popraw formularz".
        return reply.code(422).send({ error: 'rule_violation', violations: outcome.violations });
      }

      return reply.send(resultToWire(outcome.result));
    },
  );
}
