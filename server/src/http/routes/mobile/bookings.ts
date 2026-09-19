/**
 * Ninerdeck (serwer) - trasy REZERWACJI dla telefonu (milestone 3.0.0, issue #158 B5;
 * `docs/rezerwacje.md` §5.1).
 *
 * Cienkie jak reszta: zod → komenda albo zapytanie → status. Tożsamość i klub WYŁĄCZNIE
 * z tokenu po bramie członkostwa - pilot nie rezerwuje w cudzym imieniu ani w cudzym
 * klubie, więc w ciele tych pól nie ma.
 *
 * ══ CUDZY KLUB ODPOWIADA 404, NIE 403 ══
 * Rezerwacja innego klubu ma być dla tego tokenu NIEISTNIEJĄCA (epik C wielofirmowości).
 * `403` mówiłoby „to istnieje, ale nie dla ciebie", czyli potwierdzałoby cudzy zasób.
 * Zawężenie robi port (`orgId` argumentem), więc trasa nie ma jak o nim zapomnieć.
 *
 * ══ `409 slot_taken` NIESIE, CO STOI W TYM CZASIE ══
 * Samo „termin zajęty" kazałoby pilotowi zgadywać, czy to przegląd, czy kolega -
 * a ekran ma to napisać (§5.1). Odpowiedź niesie więc kolidującą zajętość, bez pól,
 * które nie są jego sprawą.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { BookingQueries } from '../../../application/common/queries/bookings.ts';
import type { BookingCommands } from '../../../application/mobile/commands/bookings.ts';
import type { BookingRecord } from '../../../application/common/ports.ts';
import type { BookingRefusal } from '../../../domain/bookings.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';

const ICAO = z.string().trim().min(3).max(8);
const NOTE_MAX = 500;

const window = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  aircraftId: z.string().min(1).max(100).optional(),
});

const create = z.object({
  id: z.string().min(1).max(100),
  aircraftId: z.string().min(1).max(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  operation: z.string().trim().min(1).max(40),
  dualId: z.string().min(1).max(100).nullable().optional(),
  fromIcao: ICAO.nullable().optional(),
  toIcao: ICAO.nullable().optional(),
  plannedAirMin: z.number().int().positive().max(24 * 60).nullable().optional(),
  plannedFuelL: z.number().nonnegative().max(10_000).nullable().optional(),
  note: z.string().trim().max(NOTE_MAX).nullable().optional(),
});

const patch = z
  .object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    operation: z.string().trim().min(1).max(40),
    dualId: z.string().min(1).max(100).nullable(),
    fromIcao: ICAO.nullable(),
    toIcao: ICAO.nullable(),
    plannedAirMin: z.number().int().positive().max(24 * 60).nullable(),
    plannedFuelL: z.number().nonnegative().max(10_000).nullable(),
    note: z.string().trim().max(NOTE_MAX).nullable(),
  })
  .partial();

const cancel = z.object({ reason: z.string().trim().max(NOTE_MAX).nullable().optional() });

/**
 * Zajętość na drucie. `createdBy`, `updatedAt` i `closeReason` zostają po stronie
 * serwera - telefon rysuje z tego siatkę i kartę rezerwacji, a nie dziennik zmian.
 */
export function bookingWire(row: BookingRecord): Record<string, unknown> {
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
  };
}

/** Odmowa → status. `slot_taken` jest konfliktem, reszta - błędem żądania albo dostępu. */
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

export function registerBookingRoutes(
  app: FastifyInstance,
  bookings: BookingCommands,
  calendar: BookingQueries,
  gate: MemberGate,
): void {
  app.get('/bookings', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = window.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const view = await calendar.window(
      who.orgId,
      Date.parse(parsed.data.from),
      Date.parse(parsed.data.to),
      parsed.data.aircraftId,
    );
    if (view == null) return reply.code(404).send({ error: 'not_found' });

    if (req.headers['if-none-match'] === view.etag) {
      return reply.code(304).header('etag', view.etag).send();
    }
    return reply.header('etag', view.etag).send({
      timezone: view.timezone,
      homeIcao: view.homeIcao,
      days: view.days.map((d) => ({
        date: d.date,
        startsAt: new Date(d.startsAt).toISOString(),
        endsAt: new Date(d.endsAt).toISOString(),
      })),
      bookings: view.bookings.map(bookingWire),
    });
  });

  app.post('/bookings', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = create.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const b = parsed.data;

    const result = await bookings.create(who.orgId, who.pilotId, {
      id: b.id,
      aircraftId: b.aircraftId,
      startsAt: Date.parse(b.startsAt),
      endsAt: Date.parse(b.endsAt),
      operation: b.operation,
      dualId: b.dualId ?? null,
      fromIcao: b.fromIcao ?? null,
      toIcao: b.toIcao ?? null,
      plannedAirMin: b.plannedAirMin ?? null,
      plannedFuelL: b.plannedFuelL ?? null,
      note: b.note ?? null,
    });
    if (!result.ok) return refuse(reply, result.refusal, result.taken);
    // Powtórzony zapis (telefon ponowił przy słabym łączu) wraca `200` z tym samym
    // wierszem - `201` kłamałoby o tym, że coś właśnie powstało.
    return reply.code(result.created ? 201 : 200).send(bookingWire(result.booking));
  });

  app.patch<{ Params: { id: string } }>('/bookings/:id', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = patch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const p = parsed.data;

    const result = await bookings.patch(who.orgId, who.pilotId, req.params.id, {
      ...(p.startsAt === undefined ? {} : { startsAt: Date.parse(p.startsAt) }),
      ...(p.endsAt === undefined ? {} : { endsAt: Date.parse(p.endsAt) }),
      ...(p.operation === undefined ? {} : { operation: p.operation }),
      ...(p.dualId === undefined ? {} : { dualId: p.dualId }),
      ...(p.fromIcao === undefined ? {} : { fromIcao: p.fromIcao }),
      ...(p.toIcao === undefined ? {} : { toIcao: p.toIcao }),
      ...(p.plannedAirMin === undefined ? {} : { plannedAirMin: p.plannedAirMin }),
      ...(p.plannedFuelL === undefined ? {} : { plannedFuelL: p.plannedFuelL }),
      ...(p.note === undefined ? {} : { note: p.note }),
    });
    if (result == null) return reply.code(404).send({ error: 'not_found' });
    if (!result.ok) return refuse(reply, result.refusal, result.taken);
    return reply.send(bookingWire(result.booking));
  });

  app.delete<{ Params: { id: string } }>('/bookings/:id', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = cancel.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const result = await bookings.cancel(
      who.orgId,
      who.pilotId,
      req.params.id,
      parsed.data.reason ?? null,
    );
    if (result == null) return reply.code(404).send({ error: 'not_found' });
    if (!result.ok) return refuse(reply, result.refusal, result.taken);
    return reply.send(bookingWire(result.booking));
  });
}

function refuse(
  reply: { code: (n: number) => { send: (body: unknown) => unknown } },
  refusal: BookingRefusal,
  taken: BookingRecord | null | undefined,
): unknown {
  return reply.code(STATUS[refusal]).send({
    error: refusal,
    ...(taken == null ? {} : { taken: bookingWire(taken) }),
  });
}
