/**
 * UZ Aero (serwer) - `SessionState` → stan silnika jednostki na pulpicie (`A01`).
 *
 * Czysta funkcja bez bazy i bez zegara: wejściem jest projekcja policzona
 * `projectSession` na strumieniu JEDNEJ otwartej sesji, wyjściem - tyle, ile potrzebuje
 * wiersz „Flota teraz".
 *
 * ══ CO TU JEST WYBOREM, A NIE PRZEPISANIEM ══
 *  1. **`engineStoppedAt` bierzemy z ostatniego ZAMKNIĘTEGO cyklu**, a nie z ostatniego
 *     zdarzenia typu `engine_stop`. Wzloty liczy domena (`Leg`) i to ona wie, co
 *     zrobić z korektami i z ręcznymi wpisami off-block - drugie przejście po strumieniu
 *     byłoby drugą definicją „kiedy silnik stanął".
 *  2. **`flightsCount` to `flights.length`, czyli numer bieżącego lotu**, a nie liczba
 *     lotów ZAKOŃCZONYCH. Mockup podpisuje wiersz „lot 4 · T/O 14:11" w chwili, gdy ten
 *     lot trwa - więc lot otwarty musi się liczyć. `projectSession` numeruje loty
 *     1-based i otwarty ma już swój indeks.
 *  3. **`dualName` jest parametrem, nie polem projekcji.** Strumień niesie identyfikator
 *     drugiego pilota; nazwisko mieszka w `pilots` i wybiera je warstwa zapytania -
 *     tak samo jak przy claimie na liście floty.
 */

import type { SessionState } from '@uzaero/domain';

import type { AdminEngineState } from '../contracts/dashboard.ts';

export function engineState(
  sessionUuid: string,
  state: SessionState,
  /** Nazwisko drugiego pilota; `null` = brak duala ALBO konta już nie ma w `pilots`. */
  dualName: string | null,
): AdminEngineState {
  // Ostatni cykl silnika, KTÓRY SIĘ ZAMKNĄŁ. Cykl otwarty ma `stoppedAt: null`, więc
  // przy pracującym silniku ta wartość zostaje z poprzedniego postoju - i tak ma być:
  // wiersz mówi wtedy „W locie", a nie „silnik OFF".
  const stopped = [...state.legs].reverse().find((run) => run.stoppedAt != null);

  return {
    sessionUuid,
    engineRunning: state.engineRunning,
    inFlight: state.inFlight,
    flightsCount: state.flights.length,
    openTakeoffAt: state.openTakeoffAt,
    engineStoppedAt: stopped?.stoppedAt ?? null,
    lastEventAt: state.lastEventAt,
    claimedAt: state.claimedAt,
    departureIcao: state.departureIcao,
    dualId: state.dualId,
    dualName,
    eventCount: state.eventCount,
  };
}
