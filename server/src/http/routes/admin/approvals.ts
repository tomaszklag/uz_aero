/**
 * Ninerdeck (serwer) - KOLEJKA DECYZJI i DECYZJA Z PANELU (milestone 3.1.0, issue #165;
 * `docs/rezerwacje.md` §11).
 *
 * Epik R-G dał decyzji JEDNĄ trasę - telefonu - bo osobą kroku bywa zwykły pilot bez
 * wejścia do panelu (§11.2). Panel dostaje drugą z tego samego rdzenia
 * (`ApprovalFlow.decide`) i z tego samego rejestru: decyzja z biurka i decyzja z telefonu
 * są TĄ SAMĄ decyzją, więc mają jeden zapis - append-only `booking_approvals`.
 *
 * ══ BEZ WPISU W DZIENNIKU AUDYTU ══
 * (decyzja właściciela 2026-09-23). `admin_audit` opisuje akcje, które istnieją
 * WYŁĄCZNIE w panelu; decyzja istnieje na obu powierzchniach i ma rejestr bogatszy niż
 * wiersz audytu - z krokiem, powodem i adnotacją, czy krok przeszedł sam. Drugi ślad
 * dla tej samej decyzji, zależny od tego, przy którym urządzeniu ktoś siedział,
 * mówiłby o jednym fakcie na dwa sposoby.
 *
 * ══ DWIE ZDOLNOŚCI, JEDNA TRASA ══
 * `reservations.approve` mówi „ta osoba w ogóle akceptuje", `reservations.manage` jest
 * DRUGĄ ZAPORĄ przed zakleszczeniem ścieżki - odblokowuje każdy krok. Trasa wpuszcza
 * JEDNĄ Z DWÓCH, dokładnie jak jej odpowiednik na telefonie, więc deklaracja stoi na
 * `panel.access`, a rozstrzygnięcie w handlerze: `adminRoute` zna jedną zdolność,
 * a zdolność „approve ALBO manage" nie jest ani jedną z nich, ani trzecią.
 *
 * Kolejka jest natomiast pytaniem o WŁASNE kroki, więc pyta o `reservations.approve`
 * jak każda inna zdolność-atrybut trasy.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ApprovalFlow, ApprovalView } from '../../../application/common/commands/approvals.ts';
import type { BookingQueries } from '../../../application/common/queries/bookings.ts';
import type { ApprovalRefusal } from '../../../domain/approvals.ts';
import { can } from '../../../domain/roles.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { bookingWire, FULL_VIEWER } from './bookingWire.ts';

const REASON_MAX = 500;

const decision = z.object({
  decision: z.enum(['approved', 'rejected']),
  /**
   * Powód - WYMAGANY przy odmowie, ale rozstrzyga to DOMENA (`refuseDecision`), nie ten
   * schemat: pytanie jest o TREŚĆ (napis z samych spacji powodem nie jest), a odpowiedź
   * ma paść jednym kodem, który ekran umie nazwać przy przycisku.
   */
  reason: z.string().trim().max(REASON_MAX).nullable().optional(),
});

/** Odmowa → status. Ta sama tabela, co na telefonie - to ta sama decyzja. */
const STATUS: Readonly<Record<ApprovalRefusal | 'booking_closed', number>> = {
  not_pending: 409,
  booking_closed: 409,
  not_your_step: 403,
  reason_required: 400,
};

/**
 * Ścieżka rezerwacji dla PANELU - z osobą decydującą.
 *
 * Telefon dostaje ten sam widok BEZ `decidedBy` (§9.4: krok bywa obsadzony przez kilka
 * osób, więc jedno nazwisko byłoby nieprawdą, a trzy - listą do przepisania). Panel
 * pyta o co innego - „kto to rozstrzygnął i do kogo zadzwonić" (issue #165, H5) - więc
 * dostaje identyfikator osoby, a nazwisko rozwiązuje z listy członków, jak wszędzie.
 */
export function panelApprovalWire(view: ApprovalView): Record<string, unknown> {
  return {
    outcome: view.outcome,
    steps: view.steps.map((step) => ({
      id: step.id,
      label: step.label,
      current: step.current,
      decision:
        step.decision == null
          ? null
          : {
              decision: step.decision.decision,
              via: step.decision.via,
              reason: step.decision.reason,
              decidedBy: step.decision.decidedBy,
              decidedAt: new Date(step.decision.decidedAt).toISOString(),
            },
    })),
  };
}

export function registerAdminApprovalRoutes(
  app: FastifyInstance,
  approvals: ApprovalFlow,
  calendar: BookingQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/approvals/queue', capability: 'reservations.approve' },
    async (_req, reply, actor) => {
      const timezone = await calendar.timezone(actor.orgId);
      if (timezone == null) return reply.code(404).send({ error: 'not_found' });

      const items = await approvals.queueFor(actor.orgId, actor.pilotId);
      // Pusta lista jest STANEM, w którym ta odpowiedź jest przez większość czasu -
      // baner na osi kalendarza pojawia się wyłącznie z pracą (makieta K5b). Strefa
      // jedzie obok, bo „wczoraj" i „termin za 3 dni" liczą się dobą KLUBU (§6).
      return reply.send({
        timezone,
        // Kolejkę czyta wyłącznie akceptujący, a ten widzi komplet (§17) - bez pytania kto patrzy.
        items: items.map((item) => ({ booking: bookingWire(item.booking, FULL_VIEWER), step: item.step })),
      });
    },
  );

  adminRoute(
    app,
    gate,
    // `null` (issue #216): akceptujący bez „Podglądu klubu" decyduje z panelu tak samo,
    // jak z telefonu - o prawie rozstrzyga para zdolności NIŻEJ, nie wejście do modułu.
    { method: 'POST', url: '/bookings/:id/decision', capability: null },
    async (req, reply, actor) => {
      const approves = can(actor.capabilities, 'reservations.approve');
      const manages = can(actor.capabilities, 'reservations.manage');
      if (!approves && !manages) {
        return reply.code(403).send({ error: 'forbidden', required: 'reservations.approve' });
      }

      const parsed = decision.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

      const id = (req.params as { id: string }).id;
      const result = await approvals.decide(
        actor.orgId,
        id,
        { pilotId: actor.pilotId, manages },
        { decision: parsed.data.decision, reason: parsed.data.reason ?? null },
      );
      // Cudzy klub = wiersz nieistniejący (epik C wielofirmowości): 404, nie 403.
      if (result == null) return reply.code(404).send({ error: 'not_found' });
      if (!result.ok) return reply.code(STATUS[result.refusal]).send({ error: result.refusal });

      return reply.send({
        status: result.booking.status,
        approval: panelApprovalWire(result.view),
      });
    },
  );
}
