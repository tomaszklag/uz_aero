/**
 * Ninerdeck (serwer) - ZAPIS REZERWACJI Z TELEFONU (milestone 3.0.0, issue #158 B5;
 * `docs/rezerwacje.md` §2.2, §5.1).
 *
 * ══ TO JEDYNE MIEJSCE PILOTA, KTÓRE WYMAGA SIECI I NIE JEST WYJĄTKIEM OD OFFLINE-FIRST ══
 * Rejestr operacji jest append-only i ma jednego piszącego, więc telefon zapisuje
 * lokalnie i dosyła. Rezerwacja jest przedmiotem konkurencji: dwóch pilotów chce tej
 * samej soboty i rozstrzygnąć to może wyłącznie ten, kto widzi obu. Zapis offline
 * znaczyłby „zarezerwowane" na ekranie i odmowę po powrocie zasięgu - a to gorsze niż
 * uczciwe „bez sieci nie zarezerwujesz". ODCZYT działa z cache jak wszystko inne.
 *
 * Ślad w dzienniku audytu NIE POWSTAJE: to zwykła praca pilota, jak wpisanie lotu.
 * Dziennik jest od decyzji administratora o cudzych sprawach (`booking.*` w panelu).
 */

import {
  refuseCancel,
  refuseChange,
  refuseCreate,
  refuseWindow,
  type BookingRefusal,
} from '../../../domain/bookings.ts';
import type {
  AircraftConfigPort,
  BookingPatch,
  BookingRecord,
  BookingsPort,
  Clock,
  Database,
  NewBooking,
} from '../../common/ports.ts';

/** Zamówienie pilota. Klub, właściciela i autora dokłada komenda - nie przychodzą z drutu. */
export interface BookingDraft {
  id: string;
  aircraftId: string;
  startsAt: number;
  endsAt: number;
  dualId: string | null;
  operation: string;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  note: string | null;
}

export type BookingResult =
  | { ok: true; booking: BookingRecord; created: boolean }
  | { ok: false; refusal: BookingRefusal; taken?: BookingRecord | null };

export class BookingCommands {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingsPort,
    private readonly aircraft: AircraftConfigPort,
    private readonly clock: Clock,
  ) {}

  /**
   * Nowa rezerwacja pilota. Stan od razu `confirmed` - ścieżka akceptacji (`pending`)
   * przychodzi w 3.1.0, a model jest na nią gotowy (§4).
   */
  async create(orgId: string, pilotId: string, draft: BookingDraft): Promise<BookingResult> {
    const status = await this.aircraft.serviceStatusOf(this.db, orgId, draft.aircraftId);
    const refusal = refuseCreate({ ...draft, kind: 'flight' }, this.clock.now().getTime(), {
      // `null` = maszyna cudza albo skasowana. Reguła odpowiada wtedy
      // `aircraft_not_found` - jednym kodem na oba przypadki, bo odróżnienie ich
      // potwierdzałoby istnienie cudzego egzemplarza (epik C wielofirmowości).
      serviceStatus: status,
    });
    if (refusal != null) return { ok: false, refusal };

    const row: NewBooking = {
      id: draft.id,
      aircraftId: draft.aircraftId,
      kind: 'flight',
      status: 'confirmed',
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      pilotId,
      dualId: draft.dualId,
      operation: draft.operation,
      fromIcao: draft.fromIcao,
      toIcao: draft.toIcao,
      plannedAirMin: draft.plannedAirMin,
      plannedFuelL: draft.plannedFuelL,
      blockReason: null,
      note: draft.note,
      createdBy: pilotId,
    };
    const write = await this.db.transaction((tx) => this.bookings.insert(tx, orgId, row));
    if (write.ok) return write;
    return { ok: false, refusal: 'slot_taken', taken: write.taken };
  }

  /**
   * Przesunięcie i zmiana zadania WŁASNEJ rezerwacji. `null` = wiersza nie ma w tym
   * klubie; trasa robi z tego 404, a nie 403 - cudzy klub ma być nieistniejący.
   */
  async patch(
    orgId: string,
    pilotId: string,
    id: string,
    patch: BookingPatch,
  ): Promise<BookingResult | null> {
    const current = await this.bookings.byId(this.db, orgId, id);
    if (current == null) return null;

    const now = this.clock.now().getTime();
    const actor = { pilotId, manages: false };
    const refusal =
      refuseChange(current, actor, now) ??
      // Nowe okno sprawdzamy osobno: przesunięcie w przeszłość jest odmową o czym innym
      // niż „to już minęło" (tamto mówi o wierszu, to o wpisanych godzinach).
      refuseWindowOf(current, patch, now);
    if (refusal != null) return { ok: false, refusal };

    const write = await this.db.transaction((tx) => this.bookings.update(tx, orgId, id, patch));
    if (write == null) return null;
    if (write.ok) return write;
    return { ok: false, refusal: 'slot_taken', taken: write.taken };
  }

  /**
   * Odwołanie własnej rezerwacji. Wiersz ZOSTAJE (`status = 'cancelled'`) - kalendarz
   * przestaje go rysować, a zapis pamięta, że plan był.
   */
  async cancel(
    orgId: string,
    pilotId: string,
    id: string,
    reason: string | null,
  ): Promise<BookingResult | null> {
    const current = await this.bookings.byId(this.db, orgId, id);
    if (current == null) return null;

    const refusal = refuseCancel(current, { pilotId, manages: false }, reason);
    if (refusal != null) return { ok: false, refusal };

    const closed = await this.db.transaction((tx) =>
      this.bookings.close(tx, orgId, id, {
        status: 'cancelled',
        at: this.clock.now(),
        reason,
      }),
    );
    // Przegrany wyścig z zadaniem okresowym albo z panelem: wiersz przestał być czynny
    // między odczytem a zapisem. To nie jest awaria - to jest ta sama odpowiedź.
    if (closed == null) return { ok: false, refusal: 'booking_closed' };
    return { ok: true, booking: closed, created: false };
  }
}

/** Okno PO zmianie - pola pominięte zostają z wiersza. */
function refuseWindowOf(
  current: BookingRecord,
  patch: BookingPatch,
  now: number,
): BookingRefusal | null {
  if (patch.startsAt === undefined && patch.endsAt === undefined) return null;
  return refuseWindow(
    {
      startsAt: patch.startsAt ?? current.startsAt,
      endsAt: patch.endsAt ?? current.endsAt,
    },
    now,
  );
}
