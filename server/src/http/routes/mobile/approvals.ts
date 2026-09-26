/**
 * Ninerdeck (serwer) - DECYZJA O REZERWACJI z telefonu (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §11).
 *
 * ══ DLACZEGO TO JEST TRASA TELEFONU, A NIE PANELU ══
 * Osobą kroku bywa ZWYKŁY PILOT bez dostępu do panelu - mechanik, który zwalnia maszynę,
 * jest w klubie pilotem (§11.2). Panel jest dla tego, kto ścieżkę UKŁADA, nie dla tego,
 * kto po niej klika.
 *
 * ══ DWIE RÓŻNE ZDOLNOŚCI I DWA RÓŻNE PYTANIA ══
 * `reservations.approve` odpowiada „czy ta osoba w ogóle akceptuje i widzi terminy klubu",
 * a lista kroku - „czy to jest JEJ krok". Potrzebne są OBIE i żadna nie zastępuje drugiej.
 * `reservations.manage` wpuszcza osobno i to nie jest luźniejsza furtka, tylko druga
 * z dwóch zapór przed zakleszczeniem ścieżki (§11.2): bez niej jedno odejście z klubu
 * zatrzymywałoby rezerwacje na zawsze, a odblokować mógłby wyłącznie ktoś, kogo w tej
 * roli nie ma.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ApprovalFlow } from '../../../application/common/commands/approvals.ts';
import type { ApprovalRefusal } from '../../../domain/approvals.ts';
import { can } from '../../../domain/roles.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';
import { approvalWire } from './approvalWire.ts';
import { bookingWire } from './bookings.ts';

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

/** Odmowa → status. Wszystkie mówią o STANIE sprawy, nie o kształcie żądania. */
const STATUS: Readonly<Record<ApprovalRefusal | 'booking_closed', number>> = {
  not_pending: 409,
  booking_closed: 409,
  not_your_step: 403,
  reason_required: 400,
};

export function registerApprovalRoutes(
  app: FastifyInstance,
  approvals: ApprovalFlow,
  gate: MemberGate,
): void {
  /**
   * CO CZEKA NA MOJĄ DECYZJĘ (3.1.0, epik R-I - issue #166): rezerwacje klubu stojące
   * na kroku, na którego liście jest pytający. Ta sama odpowiedź, którą dostaje panel
   * (`GET /admin/api/approvals/queue`), bo to to samo pytanie.
   *
   * Skrzynka mówi o WIADOMOŚCIACH i gaśnie z przeczytaniem; plakietka „Do decyzji"
   * mówi o SPRAWIE i stoi, dopóki decyzja nie zapadnie (§9.4) - i tę drugą liczy się
   * WYŁĄCZNIE stąd. Zdolności tu nie sprawdzamy: osoba bez `reservations.approve`
   * dostaje prośby jak każdy z listy kroku, a odmowę usłyszy dopiero przy decyzji -
   * pusta kolejka ukryłaby przed nią sprawę, o którą ktoś ją prosi.
   */
  app.get('/me/approvals/queue', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const items = await approvals.queueFor(who.orgId, who.pilotId);
    const viewer = { pilotId: who.pilotId, approves: can(who.capabilities, 'reservations.approve') };
    return reply.send({
      items: items.map((item) => ({ booking: bookingWire(item.booking, viewer), step: item.step })),
    });
  });

  app.post<{ Params: { id: string } }>('/bookings/:id/decision', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const approves = can(who.capabilities, 'reservations.approve');
    const manages = can(who.capabilities, 'reservations.manage');
    // `403`, a nie `404`: rezerwacja NALEŻY do klubu, w którym ta osoba jest - istnienia
    // cudzego zasobu nie potwierdzamy, ale tu nie ma czego ukrywać. Cudzy klub odpowiada
    // `404` piętro niżej, bo tam wiersza po prostu nie ma (epik C wielofirmowości).
    if (!approves && !manages) return reply.code(403).send({ error: 'forbidden' });

    const parsed = decision.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await approvals.decide(
      who.orgId,
      req.params.id,
      { pilotId: who.pilotId, manages },
      { decision: parsed.data.decision, reason: parsed.data.reason ?? null },
    );
    if (result == null) return reply.code(404).send({ error: 'not_found' });
    if (!result.ok) return reply.code(STATUS[result.refusal]).send({ error: result.refusal });

    return reply.send({
      status: result.booking.status,
      approval: approvalWire(result.view),
    });
  });
}
