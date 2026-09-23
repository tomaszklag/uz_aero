/**
 * Ninerdeck (serwer) - ZADANIE OKRESOWE: zwalnianie slotów po godzinie bez przejęcia
 * maszyny (milestone 3.0.0, issue #158 B10; `docs/rezerwacje.md` §4.1).
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
 * ══ DWA PYTANIA, JEDEN WĄTEK (3.1.0, §11.5) ══
 * Przebieg pyta o dwie różne rzeczy i nie wolno ich mylić:
 *
 *  1. **rezerwacja POTWIERDZONA, której nikt nie odebrał** przez godzinę - slot wraca
 *     do puli jako `released` (§4.1);
 *  2. **rezerwacja CZEKAJĄCA NA ZGODĘ, której termin już nadszedł** - wygasa jako
 *     `expired`, bo inaczej maszyna stałaby w sobotę zablokowana prośbą, której nikt
 *     nie rozpatrzył.
 *
 * Stany są OSOBNE i to jest ich cała różnica: tam maszyny nie przejęto, tu zgody nie
 * wydano - a pilot ma usłyszeć, którą z tych dwóch rzeczy przegapiono. Wygaśnięcie
 * idzie PIERWSZE, bo zdejmuje wiersz ze stanu `pending`, zanim ktokolwiek zapyta
 * o niego jako o rezerwację do zwolnienia.
 *
 * „Milczenie znaczy zgodę" ODRZUCONE (§16): najprostszą drogą do zatwierdzenia
 * dowolnego lotu stałoby się nieklikanie niczego.
 *
 * ══ DA SIĘ WYŁĄCZYĆ I TO NIE JEST OZDOBA ══
 * Testy i staging nie mają ruszać danych w tle: przebieg zmieniający wiersze między
 * asercjami dawałby testy, które padają raz na dziesięć uruchomień i nikt nie wie
 * dlaczego. Stąd `start()` zwraca funkcję zatrzymującą, a composition root decyduje,
 * czy w ogóle ją woła.
 */

import { RELEASE_AFTER_MS, shouldRelease, type AircraftUse } from '@ninerdeck/domain';

import type {
  BookingsPort,
  Clock,
  Database,
  SessionsProjectionPort,
} from '../ports.ts';
import type { Notifier } from '../notify/notifier.ts';
import { bookingExpired } from '../notify/bookingNotices.ts';

/** Co ile sprawdzamy. Rezerwacja zwalnia się po godzinie, więc kwadrans dokładności wystarczy. */
export const RELEASE_TICK_MS = 5 * 60_000;

export interface ReleaseRun {
  checked: number;
  released: number;
  /** Rezerwacje wygaszone bez decyzji (§11.5) - osobno, bo to inny fakt. */
  expired: number;
}

export class BookingReleaseJob {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingsPort,
    private readonly sessions: SessionsProjectionPort,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  /**
   * Jeden przebieg. Wydzielony z pętli, bo to JEGO testujemy - `setInterval` nie ma
   * czego dowieść, a przebieg wołany wprost jest zwykłą funkcją z wynikiem.
   */
  async run(): Promise<ReleaseRun> {
    const now = this.clock.now();
    const expired = await this.expire(now);
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

      const closed = await this.db.transaction((tx) =>
        this.bookings.close(tx, candidate.orgId, candidate.id, {
          status: 'released',
          at: now,
          // Powodu NIE WPISUJEMY: `close_reason` niesie zdanie CZŁOWIEKA, a tu nikt nic
          // nie powiedział - upłynął czas. Sam status `released` mówi wszystko, a napis
          // „zwolniono automatycznie" udawałby uzasadnienie.
          reason: null,
        }),
      );
      if (closed != null) released += 1;
    }
    return { checked: candidates.length, released, expired };
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
      await this.notifier.wake([notice]);
    }
    return expired;
  }

  /** Uruchamia pętlę i oddaje funkcję, która ją zatrzymuje. */
  start(everyMs = RELEASE_TICK_MS): () => void {
    const timer = setInterval(() => {
      // Wyjątek w przebiegu NIE MOŻE ubić pętli: zwalnianie slotów jest porządkowaniem
      // kalendarza, a nie warunkiem działania serwera. Log i następny kwadrans.
      this.run().catch((err) => console.error('zwalnianie slotów nie powiodło się:', err));
    }, everyMs);
    // Pętla porządkowa nie ma prawa trzymać procesu przy życiu przy zamykaniu.
    timer.unref?.();
    return () => clearInterval(timer);
  }
}
