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

/** Co ile sprawdzamy. Rezerwacja zwalnia się po godzinie, więc kwadrans dokładności wystarczy. */
export const RELEASE_TICK_MS = 5 * 60_000;

export interface ReleaseRun {
  checked: number;
  released: number;
}

export class BookingReleaseJob {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingsPort,
    private readonly sessions: SessionsProjectionPort,
    private readonly clock: Clock,
  ) {}

  /**
   * Jeden przebieg. Wydzielony z pętli, bo to JEGO testujemy - `setInterval` nie ma
   * czego dowieść, a przebieg wołany wprost jest zwykłą funkcją z wynikiem.
   */
  async run(): Promise<ReleaseRun> {
    const now = this.clock.now();
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
    return { checked: candidates.length, released };
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
