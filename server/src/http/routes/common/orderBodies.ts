/**
 * Ninerdeck (serwer) - KSZTAŁTY ŻĄDAŃ tras zleceń i rozmów (4.0.0, issue #245;
 * `docs/zlecenia.md` §13).
 *
 * W `common/`, bo telefon i panel przyjmują TE SAME ciała - jedna tablica punktów
 * końcowych (`orderEndpoints.ts`), dwie bramy. Zod pilnuje KSZTAŁTU; o treści (np. czy
 * wiadomość po obcięciu spacji nie jest pusta) rozstrzyga komenda, żeby odmowa padła
 * jednym kodem, który ekran umie nazwać.
 *
 * Tożsamości i klubu w ciałach NIE MA - przychodzą z bramy, jak w każdej trasie.
 */

import { z } from 'zod';

import type { OrderDraft } from '../../../application/common/commands/orders.ts';
import type { OrderPatch } from '../../../application/common/commands/orderEdit.ts';
import { MESSAGE_MAX } from '../../../application/common/commands/threads.ts';

const ID = z.string().min(1).max(100);
const ICAO = z.string().trim().min(3).max(8);
const NOTE_MAX = 500;
/** Powód - zawsze opcjonalny (§5.6), ta sama granica, co przy rezerwacjach. */
const REASON = z.string().trim().max(NOTE_MAX);
const SEAT = z.enum(['pic', 'dual']);

const addressList = z.object({
  pilotIds: z.array(ID).max(100).default([]),
  groupIds: z.array(ID).max(50).default([]),
});

const seats = z.object({
  pic: z.enum(['self', 'sought']),
  dual: z.enum(['self', 'sought', 'none']),
});

const audience = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('per_seat'),
    pic: addressList.nullable().default(null),
    dual: addressList.nullable().default(null),
  }),
  z.object({ kind: z.literal('shared'), list: addressList }),
]);

const orderCreate = z.object({
  id: ID,
  aircraftId: ID,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  operation: z.string().trim().min(1).max(40),
  fromIcao: ICAO.nullable().optional(),
  toIcao: ICAO.nullable().optional(),
  plannedAirMin: z.number().int().positive().max(24 * 60).nullable().optional(),
  plannedFuelL: z.number().nonnegative().max(10_000).nullable().optional(),
  note: z.string().trim().max(NOTE_MAX).nullable().optional(),
  seats,
  audience,
});

const orderPatch = z
  .object({
    aircraftId: ID,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    operation: z.string().trim().min(1).max(40),
    fromIcao: ICAO.nullable(),
    toIcao: ICAO.nullable(),
    plannedAirMin: z.number().int().positive().max(24 * 60).nullable(),
    plannedFuelL: z.number().nonnegative().max(10_000).nullable(),
    note: z.string().trim().max(NOTE_MAX).nullable(),
    seats,
    addRecipients: z.array(z.object({ seat: SEAT.nullable(), list: addressList })).max(10),
    removeRecipients: z.array(ID).max(100),
    resend: z.boolean(),
    reason: REASON.nullable(),
  })
  .partial();

export const reasonBody = z.object({ reason: REASON.nullable().optional() });

export const answerBody = z.object({
  answer: z.enum(['yes', 'no']),
  reason: REASON.nullable().optional(),
});

export const assignBody = z.object({ pilotId: ID, seat: SEAT });

export const unassignBody = z.object({ seat: SEAT, reason: REASON.nullable().optional() });

/** Wiadomość - granica długości z zapasem na spacje; właściwą (po obcięciu) sprawdza komenda. */
export const messageBody = z.object({ id: ID, body: z.string().max(MESSAGE_MAX + 200) });

/** Strona rozmowy: kursor PARĄ, jak w skrzynce - połowa kursora to 400, nie „od początku". */
export const threadPageQuery = z.object({
  beforeAt: z.string().datetime().optional(),
  beforeId: ID.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const boxQuery = z.object({ box: z.enum(['inbox', 'managed']).default('inbox') });

/** Ciało `POST /orders` → zamówienie komendy; `null` = kształt niezgodny (400). */
export function parseOrderDraft(body: unknown): OrderDraft | null {
  const parsed = orderCreate.safeParse(body);
  if (!parsed.success) return null;
  const b = parsed.data;
  return {
    id: b.id,
    aircraftId: b.aircraftId,
    startsAt: Date.parse(b.startsAt),
    endsAt: Date.parse(b.endsAt),
    operation: b.operation,
    fromIcao: b.fromIcao ?? null,
    toIcao: b.toIcao ?? null,
    plannedAirMin: b.plannedAirMin ?? null,
    plannedFuelL: b.plannedFuelL ?? null,
    note: b.note ?? null,
    seats: b.seats,
    audience: b.audience,
  };
}

/** Ciało `PATCH /orders/:id` → zmiana; pola pominięte zostają pominięte. */
export function parseOrderPatch(body: unknown): OrderPatch | null {
  const parsed = orderPatch.safeParse(body ?? {});
  if (!parsed.success) return null;
  const { startsAt, endsAt, ...rest } = parsed.data;
  return {
    ...rest,
    ...(startsAt === undefined ? {} : { startsAt: Date.parse(startsAt) }),
    ...(endsAt === undefined ? {} : { endsAt: Date.parse(endsAt) }),
  };
}
