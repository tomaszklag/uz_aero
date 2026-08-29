/**
 * UZ Aero - PORT zegara: dwa niezależne czasy (docs/_main.md.txt §4.1 pkt 6, §4.5).
 *
 * Każde zdarzenie niesie `deviceTime` (zegar telefonu) i `gpsTime` (czas z fixa GPS).
 * GPS jest niezależny od sieci i ustawień telefonu - serwer po nim wykrywa przestawiony
 * zegar (flaga CLOCK_DRIFT), a lokalnie robi to reguła `CLOCK_DRIFT`.
 *
 * DLACZEGO PORT: czas to wejście z zewnątrz, tak samo jak baza. Bez wstrzyknięcia zegara
 * testy reguł czasowych (okno korekty 24 h, drift) musiałyby mockować `Date.now()`
 * globalnie. Implementacje: `DeviceClock` (produkcja) i `FixedClock` (testy) -
 * `infrastructure/clock.ts`.
 */

import type { EpochMillis } from '../../domain';

/** Źródło obu czasów zdarzenia. Wstrzykiwane do `EventsRepo`. */
export interface ClockPort {
  /** Zegar telefonu (UTC, epoch ms). */
  now(): EpochMillis;
  /** Czas ostatniego świeżego fixa GPS (UTC, epoch ms) - null gdy brak/nieświeży. */
  gpsTime(): EpochMillis | null;
}
