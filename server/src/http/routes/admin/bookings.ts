/**
 * Ninerdeck (serwer) - trasy KALENDARZA dla panelu (milestone 3.0.0, issue #158 B6;
 * `docs/rezerwacje.md` §5.2, §8).
 *
 * Cztery trasy i TRZY różne zdolności - to nie jest rozdrobnienie, tylko trzy różne
 * pytania o władzę:
 *
 *  - **odczyt** na `panel.access`: kalendarz klubu czyta każdy, kto wchodzi do panelu;
 *  - **rezerwacja za pilota i odwołanie cudzej** na `reservations.manage`: władza nad
 *    czyimś planem;
 *  - **wyłączenie z użytku** na `fleet.manage`: stan MASZYNY rozciągnięty w czasie,
 *    czyli przedłużenie `service_status`, którym tamta zdolność już steruje.
 *
 * Zdjęcie wyłączenia idzie tą samą trasą, co odwołanie rezerwacji, więc tamta pyta
 * o `reservations.manage` także dla wierszy `block`. To świadome uproszczenie
 * pierwszej wersji: w klubie obie zdolności ma dziś ta sama rola (`admin`), a osobna
 * trasa „usuń wyłączenie" byłaby piątą deklaracją dla jednego `UPDATE`-a.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AdminBookingCommands } from '../../../application/admin/commands/bookings.ts';
import type { BookingQueries } from '../../../application/common/queries/bookings.ts';
import type { BookingRecord } from '../../../application/common/ports.ts';
import type { BookingRefusal } from '../../../domain/bookings.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';

const ICAO = z.string().trim().min(3).max(8);
const NOTE_MAX = 500;

const params = z.object({ id: z.string().min(1).max(100) });

const window = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  aircraftId: z.string().min(1).max(100).optional(),
});

const create = z.object({
  id: z.string().min(1).max(100),
  aircraftId: z.string().min(1).max(100),
  pilotId: z.string().min(1).max(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  operation: z.string().trim().min(1).max(40),
  dualId: z.string().min(1).max(100).nullable().optional(),
  fromIcao: ICAO.nullable().optional(),
  toIcao: ICAO.nullable().optional(),
  note: z.string().trim().max(NOTE_MAX).nullable().optional(),
});

const block = z.object({
  id: z.string().min(1).max(100),
  aircraftId: z.string().min(1).max(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  blockReason: z.enum(['maintenance', 'defect', 'other']),
  note: z.string().trim().max(NOTE_MAX).nullable().optional(),
});

/**
 * Powód odwołania jest tu OPCJONALNY na poziomie schematu, a wymaga go DOMENA -
 * i tylko przy cudzej rezerwacji (`reason_required`). Wymuszenie go w zodzie odbiłoby
 * zdjęcie wyłączenia z użytku, które powodu nie potrzebuje: nie ma komu tłumaczyć.
 */
const cancel = z.object({ reason: z.string().trim().max(2000).nullable().optional() });

/** Zajętość na drucie dla panelu - pełna, razem ze śladem zamknięcia i autorem. */
function wire(row: BookingRecord): Record<string, unknown> {
  return {
    id: row.id,
    aircraftId: row.aircraftId,
    kind: row.kind,
    status: row.status,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    pilotId: row.pilotId,
    dualId: row.dualId,
    operation: row.operation,
    fromIcao: row.fromIcao,
    toIcao: row.toIcao,
    plannedAirMin: row.plannedAirMin,
    plannedFuelL: row.plannedFuelL,
    sessionUuid: row.sessionUuid,
    blockReason: row.blockReason,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    closedAt: row.closedAt == null ? null : new Date(row.closedAt).toISOString(),
    closeReason: row.closeReason,
  };
}

const STATUS: Readonly<Record<BookingRefusal, number>> = {
  slot_taken: 409,
  aircraft_disabled: 409,
  aircraft_not_found: 404,
  not_your_booking: 403,
  booking_in_past: 400,
  booking_order: 400,
  booking_closed: 409,
  reason_required: 400,
};

export function registerAdminBookingRoutes(
  app: FastifyInstance,
  bookings: AdminBookingCommands,
  calendar: BookingQueries,
  gate: AdminGate,
): void {
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/bookings', capability: 'panel.access' },
    async (req, reply, actor) => {
      const q = window.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'bad_request' });

      const view = await calendar.window(
        actor.orgId,
        Date.parse(q.data.from),
        Date.parse(q.data.to),
        q.data.aircraftId,
      );
      if (view == null) return reply.code(404).send({ error: 'not_found' });

      return reply.send({
        timezone: view.timezone,
        homeIcao: view.homeIcao,
        days: view.days.map((d) => ({
          date: d.date,
          startsAt: new Date(d.startsAt).toISOString(),
          endsAt: new Date(d.endsAt).toISOString(),
        })),
        bookings: view.bookings.map(wire),
      });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/bookings', capability: 'reservations.manage' },
    async (req, reply, actor) => {
      const b = create.safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await bookings.createFor(actor, {
        id: b.data.id,
        aircraftId: b.data.aircraftId,
        pilotId: b.data.pilotId,
        startsAt: Date.parse(b.data.startsAt),
        endsAt: Date.parse(b.data.endsAt),
        operation: b.data.operation,
        dualId: b.data.dualId ?? null,
        fromIcao: b.data.fromIcao ?? null,
        toIcao: b.data.toIcao ?? null,
        note: b.data.note ?? null,
      });
      return answer(reply, outcome, 201);
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/bookings/blocks', capability: 'fleet.manage' },
    async (req, reply, actor) => {
      const b = block.safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await bookings.block(actor, {
        id: b.data.id,
        aircraftId: b.data.aircraftId,
        startsAt: Date.parse(b.data.startsAt),
        endsAt: Date.parse(b.data.endsAt),
        blockReason: b.data.blockReason,
        note: b.data.note ?? null,
      });
      return answer(reply, outcome, 201);
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'DELETE', url: '/bookings/:id', capability: 'reservations.manage' },
    async (req, reply, actor) => {
      const p = params.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });

      const b = cancel.safeParse(req.body ?? {});
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const outcome = await bookings.cancel(actor, p.data.id, b.data.reason ?? null);
      return answer(reply, outcome, 200);
    },
  );
}

type Outcome = Awaited<ReturnType<AdminBookingCommands['cancel']>>;

function answer(
  reply: { code: (n: number) => { send: (body: unknown) => unknown }; send: (body: unknown) => unknown },
  outcome: Outcome,
  okStatus: number,
): unknown {
  if (outcome.ok) {
    return okStatus === 200 ? reply.send(wire(outcome.booking)) : reply.code(okStatus).send(wire(outcome.booking));
  }
  if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
  return reply.code(STATUS[outcome.refusal]).send({
    error: outcome.refusal,
    ...(outcome.taken == null ? {} : { taken: wire(outcome.taken) }),
  });
}
