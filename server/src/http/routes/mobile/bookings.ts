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
import type { ApprovalFlow } from '../../../application/common/commands/approvals.ts';
import type { MembershipAuthSnapshot } from '../../../application/common/ports.ts';
import type { BookingRefusal } from '../../../domain/bookings.ts';
import { can } from '../../../domain/roles.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';
import { approvalWire } from './approvalWire.ts';

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
 * Sugestie slotów. `day` to DOWOLNA chwila doby, o którą pytamy - trasa i tak sprowadzi
 * ją do granic doby w strefie klubu, a telefon ma wtedy jedną rzecz mniej do policzenia.
 *
 * Sufit długości to doba: slot dłuższy niż dzień nie istnieje, a liczba bez sufitu
 * kazałaby funkcji przemielić okno w poszukiwaniu czegoś, czego nie ma.
 */
const suggestions = z.object({
  aircraftId: z.string().min(1).max(100),
  day: z.string().datetime(),
  minutes: z.coerce.number().int().positive().max(24 * 60),
  preferredAt: z.string().datetime().optional(),
});

/**
 * Zajętość na drucie. `createdBy`, `updatedAt` i `closeReason` zostają po stronie
 * serwera - telefon rysuje z tego siatkę i kartę rezerwacji, a nie dziennik zmian.
 *
 * ══ CUDZA ZAJĘTOŚĆ NIESIE TYLKO TO, CO EKRANY Z NIEJ CZYTAJĄ ══
 * (przegląd bezpieczeństwa W7, decyzja właściciela 2026-09-21). Oś floty, sugestie
 * godzin, karta samolotu i ostrzeżenie o kolizji biorą z CUDZEGO terminu dokładnie
 * pięć rzeczy: godziny, maszynę, właściciela, rodzaj zajętości i powód wyłączenia
 * z użytku. Trasa, drugi pilot, plan lotu i NOTATKA - wolny tekst, który pilot pisał
 * dla siebie i dla administratora - nie trafiają na ekran nigdy, a jechały na każdy
 * telefon w klubie przy każdym odświeżeniu kalendarza.
 *
 * Dlatego kształt pyta, KTO PATRZY. Nie jest to zawężenie „na wszelki wypadek":
 * to jest dokładnie ta sama lista pól, którą czyta `logic/calendarGrid.ts`,
 * `slotChips.ts`, `aircraftAvailability.ts` i `claimConflict.ts`.
 *
 * Wyłączenie z użytku nie ma właściciela (`pilotId === null`), więc idzie wąskim
 * kształtem - a `blockReason` jest w nim od zawsze, bo to ono nazywa taką zajętość
 * na pasku osi.
 *
 * Panel ma własne kontrakty i własną zdolność (`reservations.manage`) - tam
 * administrator widzi komplet, bo to jego robota.
 *
 * ══ TRZECI WIDZ: AKCEPTUJĄCY (3.1.0, §17) ══
 * Osoba ze zdolnością `reservations.approve` dostaje komplet pól WSZYSTKICH rezerwacji
 * klubu - zadanie, trasę, drugiego pilota, planowany czas, paliwo i notatkę. Bez tego
 * zgoda zapadałaby na podstawie samych godzin i znaku maszyny, czyli ekran decyzji
 * (26) pytałby o coś, czego nie pokazuje. Zwykły członek klubu nie zyskuje ani
 * jednego pola - kształt dalej pyta, KTO PATRZY, tylko odpowiedzi są trzy.
 */
export interface BookingViewer {
  pilotId: string;
  /** Czy widzi komplet cudzych rezerwacji - zdolność `reservations.approve`. */
  approves: boolean;
}

export function bookingWire(row: BookingRecord, viewer: BookingViewer): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    id: row.id,
    aircraftId: row.aircraftId,
    kind: row.kind,
    status: row.status,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    pilotId: row.pilotId,
    blockReason: row.blockReason,
  };

  if (row.pilotId !== viewer.pilotId && !viewer.approves) return wire;

  return {
    ...wire,
    dualId: row.dualId,
    operation: row.operation,
    fromIcao: row.fromIcao,
    toIcao: row.toIcao,
    plannedAirMin: row.plannedAirMin,
    plannedFuelL: row.plannedFuelL,
    sessionUuid: row.sessionUuid,
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
  approvals: ApprovalFlow,
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
      bookings: view.bookings.map((row) => bookingWire(row, viewerOf(who))),
    });
  });

  app.get('/bookings/suggestions', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const parsed = suggestions.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const q = parsed.data;

    const view = await calendar.suggestions(
      who.orgId,
      q.aircraftId,
      Date.parse(q.day),
      q.minutes * 60_000,
      { preferredAt: q.preferredAt == null ? null : Date.parse(q.preferredAt) },
    );
    if (view == null) return reply.code(404).send({ error: 'not_found' });

    // Pusta lista NIE JEST błędem: dzień bywa pełny, i to jest odpowiedź. ETagu tu nie
    // ma - sugestie zależą od chwili bieżącej, więc znacznik starzałby się co minutę.
    return reply.send({
      day: {
        date: view.day.date,
        startsAt: new Date(view.day.startsAt).toISOString(),
        endsAt: new Date(view.day.endsAt).toISOString(),
      },
      window: {
        from: new Date(view.window.from).toISOString(),
        to: new Date(view.window.to).toISOString(),
        basis: view.window.basis,
      },
      suggestions: view.suggestions.map((s) => ({
        startsAt: new Date(s.startsAt).toISOString(),
        endsAt: new Date(s.endsAt).toISOString(),
        reason: s.reason,
        gapBeforeMin: Math.round(s.gapBeforeMs / 60_000),
        gapAfterMin: Math.round(s.gapAfterMs / 60_000),
      })),
    });
  });
  /**
   * JEDNA zajętość - karta rezerwacji (23) i karta najbliższej rezerwacji na Pulpicie.
   *
   * Osobna trasa, a nie szukanie w oknie kalendarza: termin bywa za dwa miesiące,
   * więc telefon musiałby pytać o okno, którego nie pokazuje, żeby znaleźć jeden
   * wiersz. ETagu nie ma - to jest odczyt POJEDYNCZEGO wiersza, a nie siatki, którą
   * telefon odświeża przy każdym wejściu.
   */
  app.get<{ Params: { id: string } }>('/bookings/:id', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });

    const view = await calendar.byId(who.orgId, req.params.id);
    if (view == null) return reply.code(404).send({ error: 'not_found' });

    // Stan ścieżki jedzie WYŁĄCZNIE tutaj, a nie w oknie kalendarza: siatka rysuje
    // pasek zajętości i o kroki nie pyta, a odczyt per wiersz zamieniłby jedno
    // zapytanie o dobę w tyle zapytań, ile rezerwacji stoi na ekranie.
    const approval = await approvals.view(who.orgId, view.booking.id);

    return reply.send({
      timezone: view.timezone,
      day: {
        date: view.day.date,
        startsAt: new Date(view.day.startsAt).toISOString(),
        endsAt: new Date(view.day.endsAt).toISOString(),
      },
      booking: bookingWire(view.booking, viewerOf(who)),
      approval: approvalWire(approval),
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
    if (!result.ok) return refuse(reply, viewerOf(who), result.refusal, result.taken);
    // Powtórzony zapis (telefon ponowił przy słabym łączu) wraca `200` z tym samym
    // wierszem - `201` kłamałoby o tym, że coś właśnie powstało.
    return reply.code(result.created ? 201 : 200).send(bookingWire(result.booking, viewerOf(who)));
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
    if (!result.ok) return refuse(reply, viewerOf(who), result.refusal, result.taken);
    return reply.send(bookingWire(result.booking, viewerOf(who)));
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
    if (!result.ok) return refuse(reply, viewerOf(who), result.refusal, result.taken);
    return reply.send(bookingWire(result.booking, viewerOf(who)));
  });
}

/**
 * Kto patrzy - z członkostwa, nigdy z ciała żądania. Akceptujący widzi komplet pól
 * cudzych rezerwacji, bo bez nich zgoda zapadałaby na podstawie samych godzin (§17).
 */
const viewerOf = (who: MembershipAuthSnapshot): BookingViewer => ({
  pilotId: who.pilotId,
  approves: can(who.capabilities, 'reservations.approve'),
});

/**
 * Odmowa na drut. Widz jedzie tu z tego samego powodu, co do `bookingWire`:
 * kolidująca zajętość jest zwykle CUDZA, a ekran mówi o niej dokładnie tyle, ile
 * potrzebuje - „SP-AXA jest zajęta 11:00 → 13:00 · rezerwację ma J. Nowak" (22C).
 */
function refuse(
  reply: { code: (n: number) => { send: (body: unknown) => unknown } },
  viewer: BookingViewer,
  refusal: BookingRefusal,
  taken: BookingRecord | null | undefined,
): unknown {
  return reply.code(STATUS[refusal]).send({
    error: refusal,
    // `takenAt` stoi OBOK zajętości, a nie w niej: `bookingWire` opisuje zajętość na
    // siatce kalendarza, gdzie wiek wiersza nie znaczy nic. Przy kolizji znaczy -
    // ekran pisze „rezerwacja weszła 3 minuty temu" (makieta 22C), bo to jest różnica
    // między cudzym planem sprzed tygodnia a slotem zajętym w trakcie wypełniania
    // formularza. Dokładanie pola do wspólnego kształtu kazałoby wozić je w każdej
    // odpowiedzi kalendarza.
    ...(taken == null
      ? {}
      : {
          taken: bookingWire(taken, viewer),
          takenAt: new Date(taken.createdAt).toISOString(),
        }),
  });
}
