/**
 * UZ Aero — karta SAMOLOTU W RĘCE z ekranu 01 (`.claim-card` w `design/01-moj-dzien.html`).
 *
 * Osobno od `myDay.ts`, bo to inna OŚ. `buildMyDay` opisuje służbę pilota — przekrojowo
 * po maszynach, przez całą dobę. Ta karta opisuje jedną sesję: samolot, który pilot
 * trzyma TERAZ, i jedyną akcję „na teraz" na całym ekranie. Zlanie obu w jeden model
 * kazałoby projekcji doby wiedzieć o claimie i stanie silnika, czyli o rzeczach
 * należących do samolotu, a nie do pilota.
 *
 * CHWILA PRZEJĘCIA IDZIE ZE STRUMIENIA, nie z projekcji, bo `SessionState` jej nie
 * niesie: zapamiętuje, KTO trzyma samolot, nie OD KIEDY. Pierwsze zdarzenie sesji jest
 * z definicji `session_claim` (§4.4), więc odczyt jest jednym przejściem po strumieniu,
 * a nie rekonstrukcją.
 */

import { eventTime, type Event, type SessionState } from '../../../domain';
import { timeUtc } from '../../format';
import { operationLabel } from './operations';

export interface HeldAircraftVm {
  /** Znak samolotu („SP-KLM"). */
  aircraftId: string;
  /** Druga linia karty: „Twój od 13:35 UTC · Przelot". */
  since: string;
  engineRunning: boolean;
  /** Plakietka stanu silnika — „Silnik pracuje" / „Silnik wyłączony". */
  engineLabel: string;
}

/**
 * Buduje kartę samolotu w ręce albo `null`, gdy pilot niczego nie trzyma.
 *
 * `null` to BRAK KARTY, nie karta pusta: zdany samolot (`day_close`) przestaje być
 * „na teraz", a ekran domowy nie ma powodu pokazywać przycisku „KOKPIT" prowadzącego
 * do maszyny, której pilot już nie ma.
 */
export function buildHeldAircraft(
  session: SessionState,
  events: readonly Event[],
): HeldAircraftVm | null {
  if (session.sessionUuid == null || session.aircraftId == null || session.closed) return null;

  const claimedAt = claimTime(events);

  return {
    aircraftId: session.aircraftId,
    since: [
      // Bez zdarzenia claimu (sesja wczytana bez strumienia) mówimy mniej, zamiast
      // podstawiać cudzy czas — pierwszy wzlot nie jest chwilą przejęcia.
      claimedAt != null ? `Twój od ${timeUtc(claimedAt)} UTC` : 'Twój samolot',
      session.operation != null ? operationLabel(session.operation) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    engineRunning: session.engineRunning,
    engineLabel: session.engineRunning ? 'Silnik pracuje' : 'Silnik wyłączony',
  };
}

/** Czas `session_claim` — pierwszego zdarzenia sesji (§4.4). */
function claimTime(events: readonly Event[]): number | null {
  const claim = events.find((e) => e.type === 'session_claim');
  return claim != null ? eventTime(claim) : null;
}
