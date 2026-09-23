/**
 * Ninerdeck (serwer) - ŚCIEŻKA AKCEPTACJI KLUBU w panelu (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §11.2).
 *
 * Dwie trasy i JEDNA zdolność - `accounts.manage`, bo ścieżka jest rozdaniem władzy:
 * mówi, czyja zgoda jest potrzebna, żeby ktokolwiek w klubie poleciał. To bliżej kont
 * niż kalendarza, więc `reservations.manage` (władza nad czyimś PLANEM) byłaby tu
 * pomyłką kategorii.
 *
 * Odczyt idzie na TEJ SAMEJ zdolności co zapis, choć niczego nie ujawnia poza nazwiskami
 * obsady - ale to jest dokładnie treść, o którą chodzi: kto ma prawo zablokować cudzy
 * lot. Ta sama zasada, która trzyma kolejkę zgłoszeń i kod klubu na `accounts.manage`,
 * a nie na `panel.access`.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ApprovalStepsCommands } from '../../../application/admin/commands/approvalSteps.ts';
import type { ApprovalFlow } from '../../../application/common/commands/approvals.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const LABEL_MAX = 60;

/**
 * Zamówienie: CAŁA ścieżka, nie pojedynczy krok. Kolejność w tablicy JEST kolejnością
 * pytania - numerów pozycji w ciele nie ma, bo dwa źródła kolejności (indeks i pole)
 * rozjeżdżają się przy pierwszym przestawieniu i nikt nie wie, które wygrywa.
 *
 * Sufit długości ścieżki: więcej niż dziesięć kroków znaczy, że klub opisał procedurę,
 * a nie akceptację - a każdy krok to jedna osoba więcej, która musi kliknąć, zanim
 * ktokolwiek poleci.
 */
const steps = z.object({
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(100).nullable().optional(),
        label: z.string().trim().min(1).max(LABEL_MAX),
        memberIds: z.array(z.string().min(1).max(100)).max(50),
      }),
    )
    .max(10),
});

export function registerApprovalStepRoutes(
  app: FastifyInstance,
  commands: ApprovalStepsCommands,
  approvals: ApprovalFlow,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/approval-steps', capability: 'accounts.manage' },
    async (_req, reply, actor) => {
      // Pusta lista NIE JEST brakiem konfiguracji do naprawienia: to stan domyślny
      // każdego klubu i znaczy „rezerwacja potwierdza się od razu" (§11.1).
      return reply.send({ steps: await approvals.path(actor.orgId) });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'PUT', url: '/approval-steps', capability: 'accounts.manage' },
    async (req, reply, actor) => {
      const parsed = steps.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await commands.replace(actor, parsed.data.steps);
      // Odmowy niosą NAZWĘ KROKU, a nie jego numer: ekran pokazuje listę, w której
      // numer i tak nie stoi, a „krok «Mechanik» nie ma ani jednej osoby" wskazuje
      // wiersz do poprawienia bez liczenia od góry.
      if (!outcome.ok) {
        return reply.code(400).send({ error: outcome.reason, stepLabel: outcome.stepLabel });
      }
      return reply.send({ steps: outcome.steps });
    },
  );
}
