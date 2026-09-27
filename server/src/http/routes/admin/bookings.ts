/**
 * Ninerdeck (serwer) - trasy KALENDARZA dla panelu (milestone 3.0.0, issue #158 B6;
 * `docs/rezerwacje.md` §5.2, §8).
 *
 * Trzy różne zdolności - to nie jest rozdrobnienie, tylko trzy różne pytania o władzę:
 *
 *  - **odczyt** dla KAŻDEGO członka klubu (`capability: null`, issue #216): kalendarz
 *    w panelu widzi ten sam krąg osób, co w aplikacji - a kształt cudzej rezerwacji
 *    pyta, kto patrzy (`bookingWire.ts`);
 *  - **własna rezerwacja** (`/me/bookings*` i sugestie slotów) też dla każdego członka
 *    (issue #233): właściciel z sesji, ta sama komenda, co z telefonu, bez audytu;
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
import type { ApprovalFlow } from '../../../application/common/commands/approvals.ts';
import type { BookingCommands } from '../../../application/common/commands/bookings.ts';
import type { BookingRecord } from '../../../application/common/ports.ts';
import type { BookingQueries } from '../../../application/common/queries/bookings.ts';
import type { BookingRefusal } from '../../../domain/bookings.ts';
import { askSuggestions, suggestionsQuery, suggestionsWire } from '../common/suggestionsWire.ts';
import { adminRoute, type AdminGate } from './adminRoute.ts';
import { panelApprovalWire } from './approvals.ts';
import {
  bookingWire as wire,
  FULL_VIEWER,
  seesFull,
  viewerOf,
  type PanelBookingViewer,
} from './bookingWire.ts';

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
 * WŁASNA rezerwacja z panelu (issue #233) - to samo zamówienie, co z telefonu, więc
 * te same pola i te same sufity. Właściciela w ciele NIE MA: bierze się z sesji,
 * a pole `pilotId` doklejone przez klienta zod po prostu odrzuca.
 */
const own = z.object({
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

/** Poprawka własnej rezerwacji niesie SAMĄ RÓŻNICĘ - pola pominięte zostają z wiersza. */
const ownPatch = z
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

/**
 * Powód odwołania jest tu OPCJONALNY na poziomie schematu, a wymaga go DOMENA -
 * i tylko przy cudzej rezerwacji (`reason_required`). Wymuszenie go w zodzie odbiłoby
 * zdjęcie wyłączenia z użytku, które powodu nie potrzebuje: nie ma komu tłumaczyć.
 */
const cancel = z.object({ reason: z.string().trim().max(2000).nullable().optional() });

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
  mine: BookingCommands,
  calendar: BookingQueries,
  approvals: ApprovalFlow,
  gate: AdminGate,
): void {
  /**
   * SUGESTIE SLOTÓW dla własnej rezerwacji (issue #233) - bliźniak trasy telefonu, bo
   * panel woła wyłącznie `/admin/api/*` (reguła z #180). Każdy członek: sugestie opisują
   * wolne godziny maszyny, czyli to samo, co oś kalendarza, którą i tak widzi.
   */
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/bookings/suggestions', capability: null },
    async (req, reply, actor) => {
      const q = suggestionsQuery.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'bad_request' });

      const view = await askSuggestions(calendar, actor.orgId, q.data);
      if (view == null) return reply.code(404).send({ error: 'not_found' });
      return reply.send(suggestionsWire(view));
    },
  );

  /**
   * Kroki ścieżki, przez które przejdzie rezerwacja ZALOGOWANEGO (issue #233) - stopka
   * szuflady nazywa je przed kliknięciem. Pusta lista = potwierdza się od razu (klub bez
   * ścieżki albo osoba stojąca na każdym kroku). Same nazwy, bez obsady kroków.
   */
  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/me/approval-path', capability: null },
    async (_req, reply, actor) => {
      const steps = await approvals.stepsAhead(actor.orgId, actor.pilotId);
      return reply.send({ steps: steps.map((s) => s.label) });
    },
  );

  /**
   * WŁASNA REZERWACJA Z PANELU (issue #233) - trzy trasy pod `/me/`, bo dotyczą
   * ZALOGOWANEGO, a nie dowolnego pilota: właściciel bierze się z sesji, więc zwykły
   * członek nie ma jak założyć rezerwacji za kogoś innego (to robi `POST /bookings`
   * na `reservations.manage`). Każdy członek (`capability: null`), jak kalendarz.
   *
   * Ta sama komenda, co z telefonu - ścieżka akceptacji, wiadomości i czyszczenie zgód
   * przy poprawce terminu działają identycznie - i BEZ wpisu w dzienniku audytu: własna
   * rezerwacja jest zwykłą pracą pilota (§3.5 `docs/rezerwacje.md`).
   */
  adminRoute(
    app,
    gate,
    { method: 'POST', url: '/me/bookings', capability: null },
    async (req, reply, actor) => {
      const b = own.safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const result = await mine.create(actor.orgId, actor.pilotId, {
        id: b.data.id,
        aircraftId: b.data.aircraftId,
        startsAt: Date.parse(b.data.startsAt),
        endsAt: Date.parse(b.data.endsAt),
        operation: b.data.operation,
        dualId: b.data.dualId ?? null,
        fromIcao: b.data.fromIcao ?? null,
        toIcao: b.data.toIcao ?? null,
        plannedAirMin: b.data.plannedAirMin ?? null,
        plannedFuelL: b.data.plannedFuelL ?? null,
        note: b.data.note ?? null,
      });
      const viewer = viewerOf(actor);
      if (!result.ok) return refuseOwn(reply, viewer, result.refusal, result.taken);
      // Powtórzony zapis (drugie kliknięcie przy wolnym łączu) wraca `200` z tym samym
      // wierszem - `201` kłamałoby o tym, że coś właśnie powstało.
      return reply.code(result.created ? 201 : 200).send(wire(result.booking, viewer));
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'PATCH', url: '/me/bookings/:id', capability: null },
    async (req, reply, actor) => {
      const p = params.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });
      const b = ownPatch.safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'bad_request' });

      const d = b.data;
      const result = await mine.patch(actor.orgId, actor.pilotId, p.data.id, {
        ...(d.startsAt === undefined ? {} : { startsAt: Date.parse(d.startsAt) }),
        ...(d.endsAt === undefined ? {} : { endsAt: Date.parse(d.endsAt) }),
        ...(d.operation === undefined ? {} : { operation: d.operation }),
        ...(d.dualId === undefined ? {} : { dualId: d.dualId }),
        ...(d.fromIcao === undefined ? {} : { fromIcao: d.fromIcao }),
        ...(d.toIcao === undefined ? {} : { toIcao: d.toIcao }),
        ...(d.plannedAirMin === undefined ? {} : { plannedAirMin: d.plannedAirMin }),
        ...(d.plannedFuelL === undefined ? {} : { plannedFuelL: d.plannedFuelL }),
        ...(d.note === undefined ? {} : { note: d.note }),
      });
      if (result == null) return reply.code(404).send({ error: 'not_found' });
      const viewer = viewerOf(actor);
      if (!result.ok) return refuseOwn(reply, viewer, result.refusal, result.taken);
      return reply.send(wire(result.booking, viewer));
    },
  );

  /**
   * Odwołanie WŁASNEJ rezerwacji - `DELETE` bez ciała, bo powodu tu nie ma: czyta go
   * pilot, którego plan zdjęto, a przy własnym nie ma komu tłumaczyć (decyzja 4 makiety
   * K2b). Cudzą odwołuje `POST /bookings/:id/cancel` z powodem wymaganym.
   */
  adminRoute(
    app,
    gate,
    { method: 'DELETE', url: '/me/bookings/:id', capability: null },
    async (req, reply, actor) => {
      const p = params.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });

      const result = await mine.cancel(actor.orgId, actor.pilotId, p.data.id, null);
      if (result == null) return reply.code(404).send({ error: 'not_found' });
      const viewer = viewerOf(actor);
      if (!result.ok) return refuseOwn(reply, viewer, result.refusal, result.taken);
      return reply.send(wire(result.booking, viewer));
    },
  );

  /**
   * JEDNA zajętość razem ze stanem jej ścieżki (3.1.0, issue #165) - dla szuflady
   * `#/kalendarz/:id`. Stan ścieżki jedzie TUTAJ, nie w oknie kalendarza: siatka rysuje
   * pasek i o kroki nie pyta, a odczyt per wiersz zamieniłby jedno zapytanie o tydzień
   * w tyle zapytań, ile rezerwacji stoi na ekranie (ta sama decyzja, co na telefonie).
   * Cudzy klub = 404, jak wszędzie (epik C wielofirmowości).
   */
  adminRoute(
    app,
    gate,
    // KAŻDY członek (issue #216): kształt pyta, kto patrzy - patrz `bookingWire.ts`.
    { method: 'GET', url: '/bookings/:id', capability: null },
    async (req, reply, actor) => {
      const p = params.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'bad_request' });

      const view = await calendar.byId(actor.orgId, p.data.id);
      if (view == null) return reply.code(404).send({ error: 'not_found' });

      // Stan ścieżki jedzie razem z KOMPLETEM pól - i tylko z nim: historia cudzej
      // sprawy (kroki, decyzje, powody odmowy) jest treścią tej samej klasy, co jej
      // notatka. Wąski widz dostaje `approval: null`, a panel nie rysuje wtedy karty.
      const viewer = viewerOf(actor);
      const approval = seesFull(view.booking, viewer)
        ? panelApprovalWire(await approvals.view(actor.orgId, view.booking.id))
        : null;
      return reply.send({
        timezone: view.timezone,
        booking: wire(view.booking, viewer),
        approval,
      });
    },
  );

  adminRoute(
    app,
    gate,
    { method: 'GET', url: '/bookings', capability: null },
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

      const viewer = viewerOf(actor);
      return reply.send({
        timezone: view.timezone,
        homeIcao: view.homeIcao,
        days: view.days.map((d) => ({
          date: d.date,
          startsAt: new Date(d.startsAt).toISOString(),
          endsAt: new Date(d.endsAt).toISOString(),
        })),
        bookings: view.bookings.map((row) => wire(row, viewer)),
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
    // `POST /:id/cancel`, a NIE `DELETE /:id` z ciałem - ta sama forma, co
    // `POST /sessions/:uuid/void`, i z tego samego powodu: powód jest tu WYMAGANY
    // przy cudzej rezerwacji, a ciało żądania `DELETE` bywa wycinane przez
    // pośredniki. Kosztem byłaby odmowa `reason_required` widoczna wyłącznie na
    // produkcji, przy zielonych testach. Telefon zostaje przy `DELETE`: tam powód
    // jest opcjonalny, bo pilot odwołuje WŁASNĄ rezerwację i nie ma komu tłumaczyć.
    { method: 'POST', url: '/bookings/:id/cancel', capability: 'reservations.manage' },
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

/**
 * Odmowa WŁASNEJ rezerwacji na drut. Kolidująca zajętość jest zwykle CUDZA, więc idzie
 * kształtem dla tego widza - szuflada mówi o niej tyle, ile potrzebuje („SP-AXA
 * 11:00 → 13:00 · rezerwację ma J. Nowak", K7b). `takenAt` stoi OBOK zajętości, jak na
 * telefonie: „weszła 3 min temu" odróżnia wyścig o slot od planu sprzed tygodnia.
 */
function refuseOwn(
  reply: { code: (n: number) => { send: (body: unknown) => unknown } },
  viewer: PanelBookingViewer,
  refusal: BookingRefusal,
  taken: BookingRecord | null | undefined,
): unknown {
  return reply.code(STATUS[refusal]).send({
    error: refusal,
    ...(taken == null
      ? {}
      : { taken: wire(taken, viewer), takenAt: new Date(taken.createdAt).toISOString() }),
  });
}

type Outcome = Awaited<ReturnType<AdminBookingCommands['cancel']>>;

function answer(
  reply: { code: (n: number) => { send: (body: unknown) => unknown }; send: (body: unknown) => unknown },
  outcome: Outcome,
  okStatus: number,
): unknown {
  // Mutacje stoją na `reservations.manage` / `fleet.manage`, a kolidujący wiersz jest
  // treścią odmowy dla kogoś, kto ma prawo go przesunąć - komplet, bez pytania kto patrzy.
  if (outcome.ok) {
    const body = wire(outcome.booking, FULL_VIEWER);
    return okStatus === 200 ? reply.send(body) : reply.code(okStatus).send(body);
  }
  if (outcome.reason === 'not_found') return reply.code(404).send({ error: 'not_found' });
  return reply.code(STATUS[outcome.refusal]).send({
    error: outcome.refusal,
    ...(outcome.taken == null ? {} : { taken: wire(outcome.taken, FULL_VIEWER) }),
  });
}
