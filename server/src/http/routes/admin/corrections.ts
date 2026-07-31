/**
 * UZ Aero (serwer) — trasa korekty administracyjnej (`/admin/api/sessions/:uuid/corrections`,
 * mockup `A02b-korekta.html`).
 *
 * Cienka jak reszta repo: zod → komenda → status. Trasa nie zna ani transakcji, ani
 * audytu, ani reguły „czym stemplujemy zdarzenie" — to wszystko jest w komendzie.
 *
 * **`POST`, nie `PATCH`, i na kolekcji `corrections`, nie na zdarzeniu.** Adres mówi
 * prawdę o operacji: powstaje NOWY zasób w sesji, a zdarzenie wskazane przez `targetUuid`
 * nie jest zmieniane. `PATCH /events/:uuid` opisywałby edycję, której w rejestrze
 * append-only nie ma i nigdy nie będzie.
 *
 * Zdolność `events.correct` ma administrator; szef wyszkolenia NIE (`domain/roles.ts`):
 * wyjaśnianie rozbieżności to inna odpowiedzialność niż pisanie w cudzym rejestrze.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EventCorrectionPayload } from '@uzaero/domain';

import type {
  AdminCorrectionCommands,
  CorrectionResult,
} from '../../../application/admin/commands/corrections.ts';
import type { TokenService } from '../../../application/common/ports.ts';
import { adminRoute } from './adminRoute.ts';

const correctionParams = z.object({ uuid: z.string().min(1).max(100) });

/**
 * Pola wspólne obu akcji. `reason` jest WYMAGANY, a `.trim()` przed `.min(1)` znaczy,
 * że spacje nie liczą się za uzasadnienie (A02b: „Bez powodu przycisk zapisu jest
 * nieaktywny"). Za rok to jedyna rzecz, która wyjaśni, dlaczego liczby dnia różnią się
 * od tego, co zapisał telefon — pusty ślad byłby wtedy gorszy niż brak przycisku.
 */
const correctionBase = z.object({
  targetUuid: z.string().min(1).max(100),
  reason: z.string().trim().min(1).max(2000),
});

/** Dokładnie dwie akcje — te same, które zna domena i pokazuje mockup. */
const correctionBody = z.discriminatedUnion('action', [
  correctionBase.extend({
    action: z.literal('retime'),
    newTime: z.number().int().nonnegative(),
  }),
  correctionBase.extend({ action: z.literal('void') }),
]);

const resultToWire = (result: CorrectionResult) => ({
  sessionUuid: result.sessionUuid,
  correctionUuid: result.correctionUuid,
  targetUuid: result.targetUuid,
  action: result.action,
  recordedAt: result.recordedAt.toISOString(),
  // `SessionState` jest bytem DOMENOWYM, więc jedzie bez własnego DTO (reguła granicy
  // typów, `docs/architektura-panelu-serwer.md` §1.2). Panel formatuje i nic nie liczy.
  state: result.state,
  // Wynik re-eksportu w odpowiedzi, żeby panel powiedział „arkusz · rewizja 3",
  // a nie samo „zapisano" — i uczciwie pokazał `null`, gdy eksport padł.
  reexport: result.reexport,
});

export function registerAdminCorrectionRoutes(
  app: FastifyInstance,
  corrections: AdminCorrectionCommands,
  tokens: TokenService,
): void {
  adminRoute(
    app,
    tokens,
    { method: 'POST', url: '/sessions/:uuid/corrections', capability: 'events.correct' },
    async (req, reply, actor) => {
      const params = correctionParams.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: 'bad_request' });

      const body = correctionBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });

      // Payload składamy jawnie zamiast rozsypywać resztę pól: `reason` NIE MA prawa
      // trafić do rejestru, a `...rest` na unii to konstrukcja, w której następne pole
      // formularza wchodzi tam samo, po cichu.
      const data = body.data;
      const correction: EventCorrectionPayload =
        data.action === 'retime'
          ? { targetUuid: data.targetUuid, action: 'retime', newTime: data.newTime }
          : { targetUuid: data.targetUuid, action: 'void' };

      const outcome = await corrections.correct(actor, {
        sessionUuid: params.data.uuid,
        correction,
        reason: data.reason,
      });

      if (!outcome.ok) {
        if (outcome.reason === 'session_not_found') {
          return reply.code(404).send({ error: 'not_found' });
        }
        // 400: nie ma czego poprawiać — dzień jest otwarty, więc pilot poprawia sam
        // na 04c. To wada ŻĄDANIA (panel nie powinien wystawić tu formularza).
        if (outcome.reason === 'day_open') return reply.code(400).send({ error: 'day_open' });
        // 422, a nie 400: żądanie jest poprawnie zbudowane, to DOMENA odmawia (cel
        // spoza sesji, cel niekorygowalny, czas z przyszłości). Panel ma pokazać
        // konkretny powód z listy naruszeń, a nie „popraw formularz".
        return reply.code(422).send({ error: 'rule_violation', violations: outcome.violations });
      }

      return reply.send(resultToWire(outcome.result));
    },
  );
}
