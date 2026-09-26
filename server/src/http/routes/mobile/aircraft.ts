/**
 * Ninerdeck (serwer) - KARTA MASZYNY i OBSERWOWANIE z telefonu (3.2.0, issue #205;
 * makiety `27`, `27a-c`, `13c`; `docs/obserwowanie-samolotu.md` §6, §7.1).
 *
 * ══ CAŁY TEN MODUŁ WYMAGA SIECI ══ (§2.2) - jak kalendarz i skrzynka. Karta czyta
 * CUDZE operacje, zajętość i odczyty innych pilotów, więc cache'u nie ma i nie wolno go
 * dorobić po cichu; przełącznik zapisuje się na serwerze wprost, nie przez outbox.
 *
 * ══ KTO PYTA ══
 * Osoba ze zdolnością `fleet.watch` - każda trasa tego pliku. Członek klubu bez niej
 * dostaje 403 z nazwą zdolności (`required`), bo ekran ma umieć powiedzieć, o co
 * poprosić administratora; istnienia maszyny to nie ujawnia, bo flotę klubu widzi
 * każdy w `GET /reference` i tak.
 *
 * ══ CUDZA I NIEZNANA MASZYNA: 404 ══
 * Maszyna innego klubu nie istnieje (epik C); 403 potwierdzałoby, że jest.
 *
 * ══ CUDZY TERMIN NA KARCIE = POLA JAK W KALENDARZU (decyzja P2) ══
 * `bookingWire` pyta, kto patrzy - dokładnie ten sam kształt, co okno kalendarza.
 * Czwartego widza nie ma: obserwujący nie widzi ani zadania, ani trasy, ani notatki
 * cudzej rezerwacji.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AircraftWatchCommands } from '../../../application/common/commands/aircraftWatch.ts';
import type { MembershipAuthSnapshot } from '../../../application/common/ports.ts';
import type { AircraftCard } from '../../../application/common/queries/aircraftCard.ts';
import type { AircraftCardQueries } from '../../../application/common/queries/aircraftCard.ts';
import { HISTORY_PAGE_SIZE, type SeriesPoint } from '../../../domain/aircraftCard.ts';
import { can } from '../../../domain/roles.ts';
import { memberFromRequest, type MemberGate } from '../../memberGate.ts';
import { aircraftNowWire, watchListWire } from '../common/aircraftWatchWire.ts';
import { aircraftHeadWire, countersWire } from '../common/previewWire.ts';
import { bookingWire, type BookingViewer } from './bookings.ts';

/**
 * Strona historii. Kursor jest PARĄ (chwila operacji + uuid), jak w skrzynce: dwie
 * operacje potrafią mieć tę samą chwilę, a sam stempel gubiłby wiersz na granicy stron.
 */
const page = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  beforeAt: z.string().datetime().optional(),
  beforeUuid: z.string().min(1).max(100).optional(),
});

const iso = (at: number): string => new Date(at).toISOString();
const isoOrNull = (at: number | null): string | null => (at == null ? null : iso(at));

const FORBIDDEN = { error: 'forbidden', required: 'fleet.watch' } as const;

function mayWatch(who: MembershipAuthSnapshot): boolean {
  return can(who.capabilities, 'fleet.watch');
}

const viewerOf = (who: MembershipAuthSnapshot): BookingViewer => ({
  pilotId: who.pilotId,
  approves: can(who.capabilities, 'reservations.approve'),
});

function seriesWire(points: readonly SeriesPoint[]): Record<string, unknown>[] {
  return points.map((p) => ({
    at: iso(p.at),
    value: p.value,
    source: p.source,
    sessionUuid: p.sessionUuid,
    pilotId: p.pilotId,
  }));
}

function cardWire(view: AircraftCard, viewer: BookingViewer): Record<string, unknown> {
  return {
    timezone: view.timezone,
    aircraft: aircraftHeadWire(view.aircraft),
    now: aircraftNowWire(view.now),
    lastRecordAt: isoOrNull(view.lastRecordAt),
    counters: countersWire(view.counters),
    lastFlightAt: isoOrNull(view.lastFlightAt),
    last30: view.last30,
    last90: view.last90,
    upcoming: view.upcoming.map(({ booking, day }) => ({
      ...bookingWire(booking, viewer),
      day: { date: day.date, startsAt: iso(day.startsAt), endsAt: iso(day.endsAt) },
    })),
    series: { mh: seriesWire(view.series.mh), fuel: seriesWire(view.series.fuel) },
    watching: view.watching,
    viewer: { watch: true },
  };
}

export function registerAircraftRoutes(
  app: FastifyInstance,
  cards: AircraftCardQueries,
  watch: AircraftWatchCommands,
  gate: MemberGate,
): void {
  /** Cała flota klubu ze stanem „teraz" i bitem obserwowania - sekcja 13C. */
  app.get('/aircraft/watches', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    if (!mayWatch(who)) return reply.code(403).send(FORBIDDEN);

    const view = await cards.watchList(who.orgId, who.pilotId);
    if (view == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(watchListWire(view));
  });

  app.get<{ Params: { id: string } }>('/aircraft/:id/card', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    if (!mayWatch(who)) return reply.code(403).send(FORBIDDEN);

    const view = await cards.card(who.orgId, req.params.id, who.pilotId);
    if (view == null) return reply.code(404).send({ error: 'not_found' });
    return reply.send(cardWire(view, viewerOf(who)));
  });

  app.get<{ Params: { id: string } }>('/aircraft/:id/operations', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    if (!mayWatch(who)) return reply.code(403).send(FORBIDDEN);

    const parsed = page.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const q = parsed.data;
    // Kursor niepełny jest BŁĘDEM ŻĄDANIA, a nie cichym „od początku" - jak w skrzynce.
    if ((q.beforeAt == null) !== (q.beforeUuid == null)) {
      return reply.code(400).send({ error: 'bad_request' });
    }

    const view = await cards.operations(who.orgId, req.params.id, {
      limit: q.limit ?? HISTORY_PAGE_SIZE,
      before:
        q.beforeAt == null || q.beforeUuid == null
          ? undefined
          : { at: Date.parse(q.beforeAt), sessionUuid: q.beforeUuid },
    });
    if (view == null) return reply.code(404).send({ error: 'not_found' });

    return reply.send({
      total: view.total,
      items: view.rows.map((row) => ({
        sessionUuid: row.sessionUuid,
        at: isoOrNull(row.engineStartAt ?? row.claimTime),
        pilotId: row.picId,
        dualId: row.dualId,
        operation: row.operation,
        status: row.status,
        manualEntry: row.manualEntry === true,
        flights: row.flightsCount,
        blockMs: row.blockMs,
        flightMs: row.flightMs,
        // Odczyty z obu stron biegu - druga linia wiersza historii („3907:48 → 3908:12
        // · 112 → 96 L"). Brak odczytu to `null`, a na ekranie kreska - nigdy zero.
        mhStart: row.mhStart,
        mhEnd: row.mhEnd,
        fuelStartL: row.fuelStartL,
        fuelEndL: row.fuelEndL,
        fuelAddedL: row.fuelAddedL,
      })),
      next:
        view.next == null
          ? null
          : { beforeAt: iso(view.next.at), beforeUuid: view.next.sessionUuid },
    });
  });

  app.put<{ Params: { id: string } }>('/aircraft/:id/watch', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    if (!mayWatch(who)) return reply.code(403).send(FORBIDDEN);

    const ok = await watch.watch(who.orgId, who.pilotId, req.params.id);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/aircraft/:id/watch', async (req, reply) => {
    const who = await memberFromRequest(gate, req);
    if (who == null) return reply.code(401).send({ error: 'unauthorized' });
    if (!mayWatch(who)) return reply.code(403).send(FORBIDDEN);

    const ok = await watch.unwatch(who.orgId, who.pilotId, req.params.id);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
