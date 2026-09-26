/**
 * Ninerdeck (serwer) - ZAJĘTOŚĆ MASZYNY Z PANELU (milestone 3.0.0, issue #158 B6;
 * `docs/rezerwacje.md` §5.2, §8).
 *
 * Trzy rzeczy, których pilot ze swojego telefonu nie zrobi, i każda z własnym śladem
 * w dzienniku - bo każda dotyczy CUDZYCH spraw:
 *
 *  1. **rezerwacja za pilota** (`booking.create`) - zdolność `reservations.manage`;
 *  2. **odwołanie cudzej rezerwacji** (`booking.cancel`) - ta sama zdolność, POWÓD
 *     WYMAGANY: pilot czyta go w aplikacji (P4, decyzja właściciela 2026-09-19);
 *  3. **wyłączenie maszyny z użytku** (`booking.block`) - zdolność `fleet.manage`,
 *     bo to stan MASZYNY rozciągnięty w czasie, czyli przedłużenie `service_status`,
 *     a nie władza nad czyimś planem. Zdjęcie wyłączenia idzie tą samą drogą, co
 *     odwołanie, i powodu nie wymaga - nie ma komu tłumaczyć.
 *
 * Konstruktor bez `Database` i bez `Queryable`: jedyną drogą zapisu panelu jest
 * `AuditedWrite`, a komenda bez uchwytu do bazy nie ma jak go obejść. Odczyty idą więc
 * przez `tx` W ŚRODKU transakcji - i to nie jest tylko czystość warstw: odczyt cudzym
 * uchwytem w otwartej transakcji zawiesza PGlite (pułapka z 2.1.0, `docs/architektura-
 * panelu-serwer.md` §7.9).
 *
 * Odmowa biznesowa leci WYJĄTKIEM, nie wartością - tylko wyjątek wycofuje transakcję,
 * a akcja, która się nie zdarzyła, nie ma prawa zostawić wpisu w dzienniku.
 */

import {
  refuseCancel,
  refuseCreate,
  type BookingRefusal,
} from '../../../domain/bookings.ts';
import type {
  AircraftConfigPort,
  BookingRecord,
  BookingsPort,
  Clock,
  NewBooking,
} from '../../common/ports.ts';
import { aircraftFlightCancelled } from '../../common/notify/aircraftNotices.ts';
import type { AircraftWatching } from '../../common/notify/aircraftWatching.ts';
import type { NotificationDraft } from '../../common/notify/bookingNotices.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import type { Actor } from '../ports.ts';

/** Rezerwacja wpisana za pilota - poza właścicielem to samo zamówienie, co z telefonu. */
export interface AdminBookingInput {
  id: string;
  aircraftId: string;
  pilotId: string;
  startsAt: number;
  endsAt: number;
  dualId: string | null;
  operation: string;
  fromIcao: string | null;
  toIcao: string | null;
  note: string | null;
}

/** Wyłączenie maszyny z użytku na konkretne dni. */
export interface AdminBlockInput {
  id: string;
  aircraftId: string;
  startsAt: number;
  endsAt: number;
  blockReason: 'maintenance' | 'defect' | 'other';
  note: string | null;
}

export type AdminBookingOutcome =
  | { ok: true; booking: BookingRecord }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'refused'; refusal: BookingRefusal; taken: BookingRecord | null };

class BookingNotFound extends Error {}

class Refused extends Error {
  constructor(
    readonly refusal: BookingRefusal,
    readonly taken: BookingRecord | null = null,
  ) {
    super(`odmowa: ${refusal}`);
  }
}

export class AdminBookingCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly bookings: BookingsPort,
    private readonly aircraft: AircraftConfigPort,
    private readonly clock: Clock,
    /** Obserwowanie samolotu (3.2.0): odwołanie przypomnianego terminu budzi obserwujących, bez administratora. */
    private readonly watching: AircraftWatching | null = null,
  ) {}

  async createFor(actor: Actor, input: AdminBookingInput): Promise<AdminBookingOutcome> {
    return this.insert(actor, 'booking.create', {
      id: input.id,
      aircraftId: input.aircraftId,
      kind: 'flight',
      status: 'confirmed',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      pilotId: input.pilotId,
      dualId: input.dualId,
      operation: input.operation,
      fromIcao: input.fromIcao,
      toIcao: input.toIcao,
      plannedAirMin: null,
      plannedFuelL: null,
      blockReason: null,
      note: input.note,
      createdBy: actor.pilotId,
    });
  }

  /**
   * Wyłączenie z użytku wolno wpisać także maszynie JUŻ WYŁĄCZONEJ ze służby - przegląd
   * zaplanowany na jednostce stojącej w serwisie jest zwyczajną sytuacją. Rozstrzyga to
   * `refuseCreate` po rodzaju wpisu; istnienie maszyny w klubie sprawdzane jest tak
   * samo w obu drogach.
   */
  async block(actor: Actor, input: AdminBlockInput): Promise<AdminBookingOutcome> {
    return this.insert(
      actor,
      'booking.block',
      {
        id: input.id,
        aircraftId: input.aircraftId,
        kind: 'block',
        status: 'confirmed',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        pilotId: null,
        dualId: null,
        operation: null,
        fromIcao: null,
        toIcao: null,
        plannedAirMin: null,
        plannedFuelL: null,
        blockReason: input.blockReason,
        note: input.note,
        createdBy: actor.pilotId,
      },
    );
  }

  /** Odwołanie cudzej rezerwacji albo zdjęcie wyłączenia z użytku. */
  async cancel(
    actor: Actor,
    id: string,
    reason: string | null,
  ): Promise<AdminBookingOutcome> {
    const at = this.clock.now();
    let watchNotices: NotificationDraft[] = [];
    try {
      const booking = await this.write.run(actor, async (tx) => {
        const current = await this.bookings.byId(tx, actor.orgId, id);
        if (current == null) throw new BookingNotFound();

        const refusal = refuseCancel(current, { pilotId: actor.pilotId, manages: true }, reason);
        if (refusal != null) throw new Refused(refusal);

        const closed = await this.bookings.close(tx, actor.orgId, id, {
          status: 'cancelled',
          at,
          reason,
        });
        // Wiersz przestał być czynny między odczytem a zapisem (telefon pilota, zadanie
        // okresowe). Ta sama odpowiedź, co przy rezerwacji już zamkniętej.
        if (closed == null) throw new Refused('booking_closed');

        // „Co ogłosiłeś, to odwołaj" (obserwowanie §5.2) - tą samą transakcją, co
        // odwołanie i ślad audytu; administrator o własnej decyzji nie słyszy.
        if (this.watching != null && current.remindedAt != null) {
          const audience = await this.watching.audience(tx, actor.orgId, current.aircraftId, [
            actor.pilotId,
          ]);
          if (audience != null) {
            watchNotices = aircraftFlightCancelled(audience, current, null);
            await this.watching.record(tx, actor.orgId, watchNotices, at);
          }
        }

        return {
          result: closed,
          audit: {
            action: current.kind === 'block' ? ('booking.block' as const) : ('booking.cancel' as const),
            targetType: 'booking' as const,
            targetId: id,
            details: {
              aircraftId: current.aircraftId,
              startsAt: new Date(current.startsAt).toISOString(),
              endsAt: new Date(current.endsAt).toISOString(),
              cancelled: 'true',
              ...(current.pilotId == null ? {} : { pilotId: current.pilotId }),
              ...(reason == null ? {} : { reason }),
            },
          },
        };
      });
      if (watchNotices.length > 0) await this.watching?.wake(actor.orgId, watchNotices);
      return { ok: true, booking };
    } catch (err) {
      return outcomeOf(err);
    }
  }

  private async insert(
    actor: Actor,
    action: 'booking.create' | 'booking.block',
    row: NewBooking,
  ): Promise<AdminBookingOutcome> {
    const now = this.clock.now().getTime();
    try {
      const booking = await this.write.run(actor, async (tx) => {
        // STAN SŁUŻBY CZYTAMY ZAWSZE, także przy wyłączeniu z użytku - bo to jedyne
        // pytanie, które mówi też, czy maszyna W OGÓLE należy do tego klubu. Pominięcie
        // go „bo blokada i tak nie patrzy na stan" pozwalało panelowi klubu A zająć
        // terminem maszynę klubu B: klucz obcy wskazuje `aircraft(id)` bez klubu,
        // a ograniczenie wykluczające liczy się PER MASZYNA, więc taki wiersz odbierał
        // właścicielowi jego własny samolot. Złapał to test izolacji tras.
        const status = await this.aircraft.serviceStatusOf(tx, actor.orgId, row.aircraftId);
        const refusal = refuseCreate(row, now, { serviceStatus: status });
        if (refusal != null) throw new Refused(refusal);

        const write = await this.bookings.insert(tx, actor.orgId, row);
        if (!write.ok) throw new Refused('slot_taken', write.taken);

        return {
          result: write.booking,
          audit: {
            action,
            targetType: 'booking' as const,
            targetId: row.id,
            details: {
              aircraftId: row.aircraftId,
              startsAt: new Date(row.startsAt).toISOString(),
              endsAt: new Date(row.endsAt).toISOString(),
              ...(row.pilotId == null ? {} : { pilotId: row.pilotId }),
              ...(row.blockReason == null ? {} : { blockReason: row.blockReason }),
            },
          },
        };
      });
      return { ok: true, booking };
    } catch (err) {
      return outcomeOf(err);
    }
  }
}

function outcomeOf(err: unknown): AdminBookingOutcome {
  if (err instanceof BookingNotFound) return { ok: false, reason: 'not_found' };
  if (err instanceof Refused) {
    return { ok: false, reason: 'refused', refusal: err.refusal, taken: err.taken };
  }
  throw err;
}
