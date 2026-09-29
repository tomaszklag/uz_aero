/**
 * Ninerdeck (serwer) - ZEGAR ZLECEŃ: czwarte pytanie zadania okresowego kalendarza
 * (4.0.0, issue #245; `docs/zlecenia.md` §5.5, pkt 15 i 45).
 *
 * Woła go `BookingClockJob` po swoich trzech pytaniach (wygaszanie → zwalnianie →
 * przypomnienie → ZLECENIA): rezerwacji zlecenia bez kompletu załogi tamte pytania nie
 * dotyczą - nie zwalnia się jej po godzinie ani nie przypomina o niej obserwującym
 * (`bookingsRepo`), bo o jej losie rozstrzyga ten plik.
 *
 * ══ DWA PYTANIA, KOLEJNOŚĆ JEST REGUŁĄ ══
 *  1. **wygaśnięcie** - termin nadszedł, a zlecenie nie ma kompletu: wygasa W CAŁOŚCI
 *     (pkt 15). Zlecenie `expired`, rezerwacja `released` (slot wraca do puli), bez powodu
 *     - `close_reason` niesie zdanie CZŁOWIEKA, a tu upłynął czas. Idzie PIERWSZE: termin,
 *     który już się zaczął, nie ma o czym ostrzegać;
 *  2. **ostrzeżenie** - o 18:00 czasu klubu w przeddzień, wyłącznie do zlecającego.
 *     Rozstrzyga się RAZ, przy pierwszym przebiegu po tej chwili, ze stemplem
 *     `unfilled_warned_at` (idempotencja jak przy `reminded_at`): brakuje załogi -
 *     wiadomość; komplet albo zlecenie wysłane później (pkt 45) - sam stempel. Rezygnacja
 *     po 18:00 już nie ostrzega: zlecający dostaje „Rezygnacja z lotu" (decyzja 2026-09-29).
 *
 * Każde zlecenie idzie osobną transakcją pod blokadą wiersza: przydział albo odwołanie
 * w tej samej chwili ustawia się w kolejce, a przebieg widzi już jego skutek.
 */

import { expireAudience } from '../../../domain/orderAudiences.ts';
import { openSeats } from '../../../domain/orderSeats.ts';
import { safeZone } from '../../../domain/clubTime.ts';
import { warnDecision } from '../../../domain/orderDeadlines.ts';
import { aircraftFlightCancelled } from '../notify/aircraftNotices.ts';
import type { AircraftWatching } from '../notify/aircraftWatching.ts';
import type { NotificationDraft } from '../notify/bookingNotices.ts';
import type { Notifier } from '../notify/notifier.ts';
import { orderExpired, orderUnfilled } from '../notify/orderNotices.ts';
import type { OrderSignals } from '../notify/orderSignals.ts';
import { audienceStateOf, crewOf, noticeOrderOf } from '../orderAccess.ts';
import type { OrderRecords } from '../orderRecords.ts';
import type {
  BookingsPort,
  ClubSettingsPort,
  Clock,
  Database,
  FlightOrdersPort,
  OrderChangesPort,
} from '../ports.ts';

/**
 * Jak daleko w przód zegar patrzy po zlecenia do ostrzeżenia: 18:00 przeddnia wypada
 * najwyżej ~31 h przed terminem (lot tuż przed północą, doba przeddnia 25-godzinna).
 */
const WARN_HORIZON_MS = 32 * 3_600_000;

export interface OrderClockRun {
  warned: number;
  expired: number;
}

export class OrderClock {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly orders: FlightOrdersPort,
    private readonly bookings: BookingsPort,
    private readonly changes: OrderChangesPort,
    private readonly clubs: ClubSettingsPort,
    private readonly notifier: Notifier,
    private readonly signals: OrderSignals,
    private readonly newId: () => string,
    private readonly clock: Clock,
    /** Obserwowanie samolotu - „co ogłosiłeś, to odwołaj" przy terminie, o którym już przypomniano. */
    private readonly watching: AircraftWatching | null = null,
  ) {}

  async run(now: Date): Promise<OrderClockRun> {
    const expired = await this.expire(now);
    const warned = await this.warn(now);
    return { warned, expired };
  }

  private async expire(now: Date): Promise<number> {
    // `dueOpen` pyta o początek PRZED granicą - milisekunda dalej obejmuje termin, który
    // zaczyna się dokładnie teraz (wygaśnięcie „w chwili początku terminu", §5.5).
    const due = await this.orders.dueOpen(this.db, new Date(now.getTime() + 1));
    let expired = 0;
    for (const candidate of due) {
      const written = await this.db.transaction(async (tx) => {
        const loaded = await this.records.lock(tx, candidate.orgId, candidate.orderId);
        if (loaded == null || loaded.order.status !== 'open' || loaded.booking.startsAt > now.getTime()) return null;

        // Odbiorców liczy się na stanie SPRZED zamknięcia - kto czekał, ten słyszy.
        const before = audienceStateOf(loaded);
        const order = await this.orders.close(tx, candidate.orgId, candidate.orderId, {
          status: 'expired',
          at: now,
          by: null,
          reason: null,
        });
        if (order == null) return null;
        const booking =
          (await this.bookings.close(tx, candidate.orgId, loaded.booking.id, { status: 'released', at: now, reason: null })) ??
          loaded.booking;
        await this.changes.insert(
          tx,
          candidate.orgId,
          candidate.orderId,
          [{ id: this.newId(), actorId: null, kind: 'expired', payload: {} }],
          now,
        );

        const notices = orderExpired(noticeOrderOf(order, loaded.booking), expireAudience(before));
        await this.notifier.record(tx, candidate.orgId, notices, now);

        // Termin, o którym przypomniano obserwującym (zlecenie miało komplet, a potem ktoś
        // zrezygnował), zostaje odwołany - obserwujący nie mają czekać na lot, którego nie będzie.
        let watchNotices: NotificationDraft[] = [];
        if (this.watching != null && loaded.booking.remindedAt != null) {
          const crew = crewOf(loaded.booking);
          const audience = await this.watching.audience(tx, candidate.orgId, loaded.booking.aircraftId, [crew.pic, crew.dual]);
          if (audience != null) {
            watchNotices = aircraftFlightCancelled(audience, loaded.booking, null);
            await this.watching.record(tx, candidate.orgId, watchNotices, now);
          }
        }
        return { loaded: { order, booking, recipients: loaded.recipients }, notices, watchNotices };
      });
      if (written == null) continue;

      expired += 1;
      await this.notifier.wake(candidate.orgId, written.notices);
      if (written.watchNotices.length > 0) await this.watching?.wake(candidate.orgId, written.watchNotices);
      this.signals.changed(candidate.orgId, written.loaded);
    }
    return expired;
  }

  private async warn(now: Date): Promise<number> {
    const due = await this.orders.dueWarnDecisions(this.db, new Date(now.getTime() + WARN_HORIZON_MS));
    const zones = new Map<string, string>();
    let warned = 0;
    for (const candidate of due) {
      let zone = zones.get(candidate.orgId);
      if (zone == null) {
        zone = safeZone((await this.clubs.calendar(this.db, candidate.orgId))?.timezone);
        zones.set(candidate.orgId, zone);
      }
      const decision = (complete: boolean) =>
        warnDecision(
          { createdAt: candidate.createdAt, startsAt: candidate.startsAt, decidedAt: candidate.unfilledWarnedAt, complete },
          zone!,
          now.getTime(),
        );
      // Wstępny odsiew bez blokady - właściwe rozstrzygnięcie pada niżej, na stanie PO blokadzie.
      if (decision(candidate.status === 'filled') == null) continue;

      const notice = await this.db.transaction(async (tx) => {
        const loaded = await this.records.lock(tx, candidate.orgId, candidate.orderId);
        if (loaded == null || (loaded.order.status !== 'open' && loaded.order.status !== 'filled')) return null;
        const decided = decision(loaded.order.status === 'filled');
        if (decided == null) return null;
        if (!(await this.orders.markWarnDecided(tx, candidate.orgId, candidate.orderId, now))) return null;
        if (decided === 'quiet') return null;
        const seats = openSeats(loaded.order.seats, crewOf(loaded.booking));
        const draft = orderUnfilled(noticeOrderOf(loaded.order, loaded.booking), loaded.order.createdBy, seats);
        await this.notifier.record(tx, candidate.orgId, [draft], this.clock.now());
        return draft;
      });
      if (notice == null) continue;

      warned += 1;
      await this.notifier.wake(candidate.orgId, [notice]);
    }
    return warned;
  }
}
