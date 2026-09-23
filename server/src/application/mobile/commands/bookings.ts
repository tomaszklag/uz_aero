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
import type { ApprovalFlow } from '../../common/commands/approvals.ts';
import type { Notifier } from '../../common/notify/notifier.ts';
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
    private readonly approvals: ApprovalFlow,
    private readonly notifier: Notifier,
  ) {}

  /**
   * Nowa rezerwacja pilota. Stan startowy WYZNACZA ŚCIEŻKA AKCEPTACJI klubu (3.1.0,
   * §11): klub bez ścieżki dostaje `confirmed` od razu i pracuje dokładnie jak
   * w 3.0.0, klub ze ścieżką - `pending`, który TRZYMA SLOT (§11.2; inaczej
   * „czekam na akceptację" znaczyłoby „ktoś mi to zaraz zajmie").
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

    // Plan liczy się PRZED zapisem, bo jego wynikiem jest między innymi stan startowy
    // wiersza - dołożony po fakcie wymagałby drugiego zapisu, który mógłby się nie udać.
    const plan = await this.approvals.plan(orgId, pilotId, {
      id: draft.id,
      aircraftId: draft.aircraftId,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
    });

    const row: NewBooking = {
      id: draft.id,
      aircraftId: draft.aircraftId,
      kind: 'flight',
      status: plan.status,
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
    const write = await this.db.transaction(async (tx) => {
      const result = await this.bookings.insert(tx, orgId, row);
      // Pominięcia kroków i prośby o zgodę idą TĄ SAMĄ transakcją, co rezerwacja -
      // inaczej prośba istnieje, a nikt o niej nie wie, albo odwrotnie (§12.1).
      // Tylko przy wierszu NOWYM: powtórzony zapis (telefon ponowił przy słabym łączu)
      // nie ma prawa wysłać drugiej prośby o tę samą zgodę.
      if (result.ok && result.created) await this.approvals.recordPlan(tx, orgId, draft.id, plan);
      return result;
    });
    if (!write.ok) return { ok: false, refusal: 'slot_taken', taken: write.taken };

    // Budzik PO commicie i nigdy przed: push jest budzikiem, nie treścią, więc jego
    // awaria ma kosztować ciszę w telefonie, a nie utraconą rezerwację.
    if (write.created) await this.notifier.wake(plan.notices);
    return write;
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
