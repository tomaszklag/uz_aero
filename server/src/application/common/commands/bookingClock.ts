/**
 * Ninerdeck (serwer) - ZADANIE OKRESOWE kalendarza: zwalnianie slotów, wygaszanie
 * spraw bez decyzji i przypomnienie „zbliża się lot" (milestone 3.0.0, issue #158 B10;
 * 3.1.0, §11.5; 3.2.0 - obserwowanie samolotu, `docs/obserwowanie-samolotu.md` §5.1, §5.5).
 *
 * Do 3.2.0 plik nazywał się `bookingRelease.ts` i mówił o jednym pytaniu; odkąd pyta
 * o trzy, nazwa mówi o ZEGARZE, a nie o pierwszym z nich. Sama zmiana nazwy - klasa
 * i pętla są te same.
 *
 * ══ DLACZEGO W OGÓLE JEST TU WĄTEK ══
 * Ograniczenie wykluczające w bazie jest STATYCZNE: broni przed nakładaniem, ale samo
 * z siebie nie wie, że minęła godzina. Zwolnienie slotu jest zmianą stanu w czasie,
 * a nie skutkiem czyjegoś żądania - nikt nie wysyła `POST`-a „minęła godzina".
 *
 * ══ `setInterval`, NIE KOLEJKA ══
 * Serwer chodzi w JEDNEJ instancji (`docs/architektura-panelu-serwer.md` §8.8), więc
 * nie ma dwóch procesów, które mogłyby wykonać tę samą pracę dwa razy. Kolejka
 * i blokada rozproszona byłyby kosztem za problem, którego nie ma; gdy instancji
 * zrobi się więcej, właściwym ruchem jest blokada doradcza wokół przebiegu, a nie
 * przepisanie tego pliku.
 *
 * ══ TRZY PYTANIA, JEDEN WĄTEK, KOLEJNOŚĆ JEST REGUŁĄ ══
 *  1. **rezerwacja CZEKAJĄCA NA ZGODĘ, której termin już nadszedł** - wygasa jako
 *     `expired` (§11.5), bo inaczej maszyna stałaby w sobotę zablokowana prośbą,
 *     której nikt nie rozpatrzył. Idzie PIERWSZE, bo zdejmuje wiersz ze stanu
 *     `pending`, zanim ktokolwiek zapyta o niego dalej;
 *  2. **rezerwacja POTWIERDZONA, której nikt nie odebrał** przez godzinę - slot wraca
 *     do puli jako `released` (§4.1), a obserwujący maszynę dostają „nie odebrano";
 *  3. **rezerwacja POTWIERDZONA, do której zostało mniej niż `FLIGHT_SOON_MS`** - raz,
 *     ze stemplem `reminded_at`: obserwujący dostają „zbliża się lot". Idzie OSTATNIE,
 *     po zwolnieniu: rezerwacja, którą przebieg właśnie zwolnił, nie jest już
 *     potwierdzona i nie ma o czym przypominać - w odwrotnej kolejności ten sam
 *     przebieg mówiłby „za godzinę" i „nie odebrano" o jednym terminie naraz.
 *
 * Stany `released` i `expired` są OSOBNE i to jest ich cała różnica: tam maszyny nie
 * przejęto, tu zgody nie wydano - a pilot ma usłyszeć, którą z tych dwóch rzeczy
 * przegapiono. „Milczenie znaczy zgodę" ODRZUCONE (§16): najprostszą drogą do
 * zatwierdzenia dowolnego lotu stałoby się nieklikanie niczego.
 *
 * ══ DA SIĘ WYŁĄCZYĆ I TO NIE JEST OZDOBA ══
 * Testy nie mają ruszać danych w tle: przebieg zmieniający wiersze między asercjami
 * dawałby testy, które padają raz na dziesięć uruchomień i nikt nie wie dlaczego.
 * Stąd `start()` zwraca funkcję zatrzymującą, a composition root decyduje, czy
 * w ogóle ją woła.
 */

import { FLIGHT_SOON_MS, RELEASE_AFTER_MS, shouldRelease, type AircraftUse } from '@ninerdeck/domain';

import type {
  BookingRecord,
  BookingsPort,
  Clock,
  Database,
  Queryable,
  SessionsProjectionPort,
} from '../ports.ts';
import {
  aircraftFlightSoon,
  aircraftNotTaken,
  type WatchAudience,
} from '../notify/aircraftNotices.ts';
import type { AircraftWatching } from '../notify/aircraftWatching.ts';
import { bookingExpired, type NotificationDraft } from '../notify/bookingNotices.ts';
import type { Notifier } from '../notify/notifier.ts';

/** Co ile sprawdzamy. Rezerwacja zwalnia się po godzinie, więc kwadrans dokładności wystarczy. */
export const RELEASE_TICK_MS = 5 * 60_000;

export interface ClockRun {
  checked: number;
  released: number;
  /** Rezerwacje wygaszone bez decyzji (§11.5) - osobno, bo to inny fakt. */
  expired: number;
  /** Terminy, o których przypomniano obserwującym (3.2.0) - osobno, bo to nie zmiana stanu. */
  reminded: number;
}

export class BookingClockJob {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingsPort,
    private readonly sessions: SessionsProjectionPort,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
    /**
     * Obserwowanie samolotu (3.2.0) - `null` = wyłączone: przebieg dalej zwalnia
     * i wygasza, tylko nikogo o maszynie nie budzi. Stempel przypomnienia pada mimo to
     * (idempotencja zadania nie zależy od tego, czy ktoś obserwuje).
     */
    private readonly watching: AircraftWatching | null = null,
  ) {}

  /**
   * Jeden przebieg. Wydzielony z pętli, bo to JEGO testujemy - `setInterval` nie ma
   * czego dowieść, a przebieg wołany wprost jest zwykłą funkcją z wynikiem.
   */
  async run(): Promise<ClockRun> {
    const now = this.clock.now();
    const expired = await this.expire(now);
    const { checked, released } = await this.release(now);
    const reminded = await this.remind(now);
    return { checked, released, expired, reminded };
  }

  private async release(now: Date): Promise<{ checked: number; released: number }> {
    const candidates = await this.bookings.due(this.db, {
      startedBefore: new Date(now.getTime() - RELEASE_AFTER_MS),
      endsAfter: now,
    });

    let released = 0;
    for (const candidate of candidates) {
      // Historia maszyny per kandydat - to wygląda na N+1 i nim jest, ale kandydatów
      // bywa zero albo kilka na przebieg (rezerwacja musi mieć godzinę opóźnienia
      // i nadal trwać), a port `listByAircraft` już istnieje i jest czytany w ten sam
      // sposób przez łańcuch MH. Własne zapytanie byłoby drugą definicją „zajętości".
      const uses: AircraftUse[] = (
        await this.sessions.listByAircraft(this.db, candidate.orgId, candidate.aircraftId)
      ).map((s) => ({ claimedAt: s.claimTime, closedAt: s.closeTime }));

      const booking = await this.bookings.byId(this.db, candidate.orgId, candidate.id);
      // Zniknęła między zapytaniami (odwołał ją pilot albo panel) - nie ma czego zwalniać.
      if (booking == null) continue;

      if (!shouldRelease(booking, uses, now.getTime())) continue;

      const { closed, notices } = await this.db.transaction(async (tx) => {
        const row = await this.bookings.close(tx, candidate.orgId, candidate.id, {
          status: 'released',
          at: now,
          // Powodu NIE WPISUJEMY: `close_reason` niesie zdanie CZŁOWIEKA, a tu nikt nic
          // nie powiedział - upłynął czas. Sam status `released` mówi wszystko, a napis
          // „zwolniono automatycznie" udawałby uzasadnienie.
          reason: null,
        });
        if (row == null) return { closed: null, notices: [] as NotificationDraft[] };
        // „Nie odebrano" do obserwujących (§5.5) - tą samą transakcją, co zwolnienie,
        // bez PIC-a i Duala rezerwacji: to oni nie przyszli, nie ich budzimy.
        const notices = await this.aircraftNotices(tx, candidate.orgId, row, (audience) =>
          aircraftNotTaken(audience, row),
        );
        return { closed: row, notices };
      });
      if (closed == null) continue;

      released += 1;
      await this.watching?.wake(candidate.orgId, notices);
    }
    return { checked: candidates.length, released };
  }

  /**
   * Rezerwacje, których termin nadszedł bez decyzji (§11.5). Slot wraca do puli,
   * a rezerwujący dostaje wiadomość „nikt nie zdążył zdecydować".
   *
   * BEZ POWODU: `close_reason` niesie zdanie CZŁOWIEKA, a tutaj nikt nic nie
   * powiedział - upłynął czas. Sam status mówi wszystko, a napis „wygasło
   * automatycznie" udawałby uzasadnienie.
   */
  private async expire(now: Date): Promise<number> {
    const waiting = await this.bookings.undecided(this.db, now);

    let expired = 0;
    for (const candidate of waiting) {
      const booking = await this.bookings.byId(this.db, candidate.orgId, candidate.id);
      // Zniknęła między zapytaniami (odwołał ją pilot, rozstrzygnął akceptujący) -
      // nie ma czego wygaszać.
      if (booking == null || booking.status !== 'pending' || booking.pilotId == null) continue;

      const notice = bookingExpired(booking, booking.pilotId);
      const closed = await this.db.transaction(async (tx) => {
        const row = await this.bookings.close(tx, candidate.orgId, candidate.id, {
          status: 'expired',
          at: now,
          reason: null,
        });
        if (row == null) return null;
        // Wiadomość TĄ SAMĄ transakcją, co wygaszenie: pilot, który stracił termin,
        // ma się o tym dowiedzieć zawsze, a nie „jeśli drugi zapis też się uda".
        await this.notifier.record(tx, candidate.orgId, [notice], now);
        return row;
      });
      if (closed == null) continue;

      expired += 1;
      await this.notifier.wake(candidate.orgId, [notice]);
    }
    return expired;
  }

  /**
   * „Zbliża się lot" (obserwowanie §5.1): potwierdzony termin zaczyna się za mniej niż
   * `FLIGHT_SOON_MS` i nikt o nim jeszcze nie przypomniał. Kandydatów wybiera SQL
   * (`dueReminders`), stempel pada w warunku `reminded_at IS NULL` - drugi przebieg
   * i odwołanie w międzyczasie dostają `null` i nie budzą nikogo drugi raz.
   *
   * Rezerwacja złożona później niż godzinę przed startem dostaje przypomnienie na
   * najbliższym przebiegu, a treść liczy się z TERMINU w chwili wysyłki („Za 20 min").
   * Zrealizowana wcześniej (`fulfilled`) wypadła ze `confirmed` i nie ma o czym
   * przypominać; czekająca na zgodę (`pending`) też nie - mechanik nie ma szykować
   * maszyny na lot, na który nikt się nie zgodził.
   */
  private async remind(now: Date): Promise<number> {
    const due = await this.bookings.dueReminders(this.db, {
      startsBefore: new Date(now.getTime() + FLIGHT_SOON_MS),
      endsAfter: now,
    });

    let reminded = 0;
    for (const candidate of due) {
      const { stamped, notices } = await this.db.transaction(async (tx) => {
        const row = await this.bookings.markReminded(tx, candidate.orgId, candidate.id, now);
        if (row == null) return { stamped: null, notices: [] as NotificationDraft[] };
        const notices = await this.aircraftNotices(tx, candidate.orgId, row, (audience) =>
          aircraftFlightSoon(audience, row, now.getTime()),
        );
        return { stamped: row, notices };
      });
      if (stamped == null) continue;

      reminded += 1;
      await this.watching?.wake(candidate.orgId, notices);
    }
    return reminded;
  }

  /**
   * Wiadomości o TERMINIE do obserwujących maszynę, bez PIC-a i Duala rezerwacji,
   * zapisane w podanej transakcji. Pusta lista, gdy obserwowanie jest wyłączone albo
   * nie ma kogo budzić.
   */
  private async aircraftNotices(
    tx: Queryable,
    orgId: string,
    booking: BookingRecord,
    draft: (audience: WatchAudience) => NotificationDraft[],
  ): Promise<NotificationDraft[]> {
    if (this.watching == null) return [];
    // Klub z KANDYDATA: `BookingRecord` klubu nie niesie (czytelnicy znają go z tokenu
    // albo z aktora), a zadanie okresowe zna go wyłącznie z wiersza `due`/`dueReminders`.
    const audience = await this.watching.audience(tx, orgId, booking.aircraftId, [
      booking.pilotId,
      booking.dualId,
    ]);
    if (audience == null) return [];
    const notices = draft(audience);
    await this.watching.record(tx, orgId, notices, this.clock.now());
    return notices;
  }

  /** Uruchamia pętlę i oddaje funkcję, która ją zatrzymuje. */
  start(everyMs = RELEASE_TICK_MS): () => void {
    const timer = setInterval(() => {
      // Wyjątek w przebiegu NIE MOŻE ubić pętli: zwalnianie slotów jest porządkowaniem
      // kalendarza, a nie warunkiem działania serwera. Log i następny kwadrans.
      this.run().catch((err) => console.error('zegar rezerwacji nie powiódł się:', err));
    }, everyMs);
    // Pętla porządkowa nie ma prawa trzymać procesu przy życiu przy zamykaniu.
    timer.unref?.();
    return () => clearInterval(timer);
  }
}
