/**
 * Ninerdeck (serwer) - PUNKTY KOŃCOWE zleceń i rozmów, wspólne dla telefonu i panelu
 * (4.0.0, issue #245; `docs/zlecenia.md` §13).
 *
 * ══ JEDNA TABLICA, DWIE BRAMY ══
 * Zlecenie wysyła się, prowadzi i czyta z telefonu I z panelu - ta sama czynność, te same
 * odmowy, ten sam kształt. Tablica trzyma trasy WZGLĘDNE (`/orders/...`), a każda
 * powierzchnia rejestruje je przez własną bramę: telefon - token klubu i członkostwo
 * (`mobile/orders.ts`), panel - sesja klubu (`admin/orders.ts`). Dwie kopie handlerów
 * rozjechałyby się przy pierwszej poprawce reguły, jak kiedyś dwie kopie rezerwacji.
 *
 * ══ ZDOLNOŚĆ ROZSTRZYGA HANDLER, NIE BRAMA ══
 * Odpowiadać, czytać i pisać w rozmowie może każdy adresat - bez zdolności (§9), więc
 * trasy są „każdego aktywnego członka", a o prawie decyduje komenda: autor z „Zlecaniem
 * lotów" albo „Cudze rezerwacje" prowadzi, adresat odpowiada, reszta dostaje 404 - cudze
 * zlecenie jest dla niej nieistniejące (epik C).
 */

import type { FastifyRequest } from 'fastify';

import type { OrderAssignmentCommands } from '../../../application/common/commands/orderAssignments.ts';
import type { OrderEditCommands } from '../../../application/common/commands/orderEdit.ts';
import type { OrderCommands } from '../../../application/common/commands/orders.ts';
import type { OrderResponseCommands } from '../../../application/common/commands/orderResponses.ts';
import type { ThreadCommands, ThreadRefusal } from '../../../application/common/commands/threads.ts';
import type { OrderActor } from '../../../application/common/orderAccess.ts';
import type { OrderCommandRefusal, OrderFailure } from '../../../application/common/orderOutcome.ts';
import type { BookingRecord } from '../../../application/common/ports.ts';
import type { Capability } from '../../../domain/roles.ts';
import type { OrderQueries } from '../../../application/common/queries/orders.ts';
import type { ThreadQueries } from '../../../application/common/queries/threads.ts';
import {
  answerBody,
  assignBody,
  boxQuery,
  messageBody,
  parseOrderDraft,
  parseOrderPatch,
  reasonBody,
  threadPageQuery,
  unassignBody,
} from './orderBodies.ts';
import { messageWire, orderCardWire, orderListWire, orderSummaryWire, threadPageWire } from './orderWire.ts';

/** Komendy i zapytania zleceń - jeden pakiet dla obu powierzchni. */
export interface OrderDeps {
  orders: OrderCommands;
  edits: OrderEditCommands;
  responses: OrderResponseCommands;
  assignments: OrderAssignmentCommands;
  threads: ThreadCommands;
  queries: OrderQueries;
  threadQueries: ThreadQueries;
}

/** Kto pyta, po bramie: klub z tokenu albo sesji, osoba i jej zdolności. */
export interface OrderContext {
  orgId: string;
  actor: OrderActor;
  /** Pełny zbiór - powierzchnia liczy z niego, kto widzi cudzą zajętość przy kolizji. */
  capabilities: readonly Capability[];
}

export interface EndpointReply {
  status: number;
  body?: unknown;
}

export interface OrderEndpoint {
  method: 'GET' | 'POST' | 'PATCH';
  /** Ścieżka WZGLĘDNA - powierzchnia dokłada swój prefiks. */
  url: string;
  handle(ctx: OrderContext, req: FastifyRequest): Promise<EndpointReply>;
}

/**
 * Co powierzchnia dokłada od siebie: kształt KOLIDUJĄCEJ zajętości przy `409 slot_taken`.
 * Kolizja bywa cudzą rezerwacją, a telefon i panel pokazują cudze terminy w różnym
 * zakresie (telefon pyta, kto patrzy - `mobile/bookings.ts`; panel ma własny kontrakt).
 */
export interface OrderSurface {
  takenWire(row: BookingRecord, ctx: OrderContext): Promise<unknown>;
}

/** Odmowa → status. Treść żądania - 400; stan zlecenia - 409; prawo - 403. */
const STATUS: Readonly<Record<OrderCommandRefusal, number>> = {
  slot_taken: 409,
  aircraft_disabled: 409,
  aircraft_not_found: 404,
  not_your_booking: 403,
  booking_in_past: 400,
  booking_order: 400,
  booking_closed: 409,
  reason_required: 400,
  no_seat_sought: 400,
  dual_required: 400,
  no_recipients: 400,
  seat_not_sought: 400,
  unknown_group: 400,
  not_member: 400,
  order_closed: 409,
  not_recipient: 403,
  seat_filled: 409,
  not_volunteered: 409,
  wrong_seat: 409,
  same_person_both_seats: 409,
  seat_empty: 409,
  not_assigned: 409,
  already_assigned: 409,
  recipient_assigned: 409,
  not_leader: 403,
  booking_from_order: 409,
};

const THREAD_STATUS: Readonly<Record<ThreadRefusal, number>> = {
  read_only: 403,
  thread_closed: 409,
  message_invalid: 400,
  message_exists: 409,
};

const NOT_FOUND: EndpointReply = { status: 404, body: { error: 'not_found' } };
const BAD_REQUEST: EndpointReply = { status: 400, body: { error: 'bad_request' } };

type Params = { id: string; pilotId?: string };
const params = (req: FastifyRequest): Params => req.params as Params;

export function orderEndpoints(deps: OrderDeps, surface: OrderSurface): OrderEndpoint[] {
  /** Karta po zmianie - świeży stan w kształcie widza, jak przy `GET /orders/:id`. */
  const card = async (ctx: OrderContext, id: string, status = 200): Promise<EndpointReply> => {
    const view = await deps.queries.card(ctx.orgId, ctx.actor, id);
    return view == null ? NOT_FOUND : { status, body: orderCardWire(view) };
  };

  const refuse = async (ctx: OrderContext, failure: OrderFailure): Promise<EndpointReply> => ({
    status: STATUS[failure.refusal],
    body: {
      error: failure.refusal,
      // Kolizja z tym, co stoi w tym czasie - ekran ma to nazwać (22C), jak przy rezerwacji.
      ...(failure.taken == null
        ? {}
        : {
            taken: await surface.takenWire(failure.taken, ctx),
            takenAt: new Date(failure.taken.createdAt).toISOString(),
          }),
    },
  });

  return [
    {
      method: 'GET',
      url: '/orders/summary',
      handle: async (ctx) => ({ status: 200, body: orderSummaryWire(await deps.queries.summary(ctx.orgId, ctx.actor)) }),
    },
    {
      method: 'GET',
      url: '/orders',
      handle: async (ctx, req) => {
        const parsed = boxQuery.safeParse(req.query ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const view = await deps.queries.list(ctx.orgId, ctx.actor, parsed.data.box);
        // „Zlecone" nie istnieje dla kogoś, kto nie zleca i nie prowadzi - to jego brak
        // prawa, a nie brak danych.
        if (view == null) return { status: 403, body: { error: 'forbidden' } };
        return { status: 200, body: orderListWire(view, parsed.data.box) };
      },
    },
    {
      method: 'GET',
      url: '/orders/:id',
      handle: async (ctx, req) => card(ctx, params(req).id),
    },
    {
      method: 'POST',
      url: '/orders',
      handle: async (ctx, req) => {
        const draft = parseOrderDraft(req.body);
        if (draft == null) return BAD_REQUEST;
        const result = await deps.orders.create(ctx.orgId, ctx.actor, draft);
        if (!result.ok) return refuse(ctx, result);
        // Powtórzony zapis wraca `200` z tym samym zleceniem - `201` kłamałoby, że coś powstało.
        return card(ctx, draft.id, result.created ? 201 : 200);
      },
    },
    {
      method: 'PATCH',
      url: '/orders/:id',
      handle: async (ctx, req) => {
        const patch = parseOrderPatch(req.body);
        if (patch == null) return BAD_REQUEST;
        const result = await deps.edits.edit(ctx.orgId, ctx.actor, params(req).id, patch);
        if (result == null) return NOT_FOUND;
        if (!result.ok) return refuse(ctx, result);
        return card(ctx, params(req).id);
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/cancel',
      handle: async (ctx, req) => {
        const parsed = reasonBody.safeParse(req.body ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const result = await deps.orders.cancel(ctx.orgId, ctx.actor, params(req).id, parsed.data.reason ?? null);
        if (result == null) return NOT_FOUND;
        if (!result.ok) return refuse(ctx, result);
        return card(ctx, params(req).id);
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/seen',
      handle: async (ctx, req) => {
        const result = await deps.responses.seen(ctx.orgId, ctx.actor, params(req).id);
        if (result == null) return NOT_FOUND;
        if (!result.ok) return { status: 403, body: { error: result.refusal } };
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/answer',
      handle: async (ctx, req) => {
        const parsed = answerBody.safeParse(req.body ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const result = await deps.responses.answer(ctx.orgId, ctx.actor, params(req).id, {
          answer: parsed.data.answer,
          reason: parsed.data.reason ?? null,
        });
        if (result == null) return NOT_FOUND;
        if (!result.ok) return refuse(ctx, result);
        // „Fotel już zajęty" i „zamknięte" to odpowiedzi o stanie, nie awarie - zawsze 200
        // (§20 Z3). Karta obok, żeby ekran nie pytał drugi raz.
        const view = await deps.queries.card(ctx.orgId, ctx.actor, params(req).id);
        return {
          status: 200,
          body: { outcome: result.outcome, card: view == null ? null : orderCardWire(view) },
        };
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/assign',
      handle: async (ctx, req) => {
        const parsed = assignBody.safeParse(req.body ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const result = await deps.assignments.assign(ctx.orgId, ctx.actor, params(req).id, parsed.data);
        if (result == null) return NOT_FOUND;
        if (!result.ok) return refuse(ctx, result);
        return card(ctx, params(req).id);
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/unassign',
      handle: async (ctx, req) => {
        const parsed = unassignBody.safeParse(req.body ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const result = await deps.assignments.unassign(ctx.orgId, ctx.actor, params(req).id, {
          seat: parsed.data.seat,
          reason: parsed.data.reason ?? null,
        });
        if (result == null) return NOT_FOUND;
        if (!result.ok) return refuse(ctx, result);
        return card(ctx, params(req).id);
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/withdraw',
      handle: async (ctx, req) => {
        const parsed = reasonBody.safeParse(req.body ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const result = await deps.responses.withdraw(ctx.orgId, ctx.actor, params(req).id, parsed.data.reason ?? null);
        if (result == null) return NOT_FOUND;
        if (!result.ok) return refuse(ctx, result);
        return card(ctx, params(req).id);
      },
    },
    {
      method: 'GET',
      url: '/orders/:id/threads/:pilotId/messages',
      handle: async (ctx, req) => {
        const parsed = threadPageQuery.safeParse(req.query ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const q = parsed.data;
        // Połowa kursora to błąd żądania, nie „od początku" - strona od początku wygląda
        // jak strona z wynikami, więc ekran pętliłby się na pierwszej (wzorzec skrzynki).
        if ((q.beforeAt == null) !== (q.beforeId == null)) return BAD_REQUEST;
        const { id, pilotId } = params(req);
        const view = await deps.threadQueries.page(ctx.orgId, ctx.actor, id, pilotId!, {
          limit: q.limit ?? 50,
          ...(q.beforeAt == null || q.beforeId == null ? {} : { before: { createdAt: Date.parse(q.beforeAt), id: q.beforeId } }),
        });
        return view == null ? NOT_FOUND : { status: 200, body: threadPageWire(view) };
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/threads/:pilotId/messages',
      handle: async (ctx, req) => {
        const parsed = messageBody.safeParse(req.body ?? {});
        if (!parsed.success) return BAD_REQUEST;
        const { id, pilotId } = params(req);
        const result = await deps.threads.send(ctx.orgId, ctx.actor, id, pilotId!, parsed.data);
        if (result == null) return NOT_FOUND;
        if (!result.ok) return { status: THREAD_STATUS[result.refusal], body: { error: result.refusal } };
        return { status: result.created ? 201 : 200, body: { message: messageWire(result.message) } };
      },
    },
    {
      method: 'POST',
      url: '/orders/:id/threads/:pilotId/read',
      handle: async (ctx, req) => {
        const { id, pilotId } = params(req);
        const result = await deps.threads.read(ctx.orgId, ctx.actor, id, pilotId!);
        return result == null ? NOT_FOUND : { status: 204 };
      },
    },
  ];
}
