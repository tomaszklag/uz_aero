/**
 * UZ Aero - panel: TABELA LOTÓW karty dnia, `SessionState.flights` → wiersze
 * (moduł CZYSTY).
 *
 * Wszystkie loty i ich czasy policzyła projekcja: `flights` powstaje z par
 * `takeoff`/`landing` PO nałożeniu korekt, więc lot, którego lądowanie unieważniono,
 * ma już właściwy czas, a fałszywe lądowanie w ogóle nie zamyka lotu. Panel niczego
 * tu nie dopasowuje na nowo - przepisuje i formatuje.
 *
 * ══ CZEGO W TEJ TABELI NIE MA, MIMO ŻE JEST W MOCKUPIE ══
 *  • **Kolumny „Zrzut" (skoczkowie i wysokość na lot).** `SessionState.drops` jest
 *    AGREGATEM dnia, nie rozbiciem per lot. Policzenie tego w panelu wymagałoby
 *    przypisania zdarzeń `drop` do przedziałów lotu i zsumowania skoczków - czyli
 *    wyprodukowania liczby przychodowej, której serwer nigdy nie wysłał, w narzędziu,
 *    którego cała wartość polega na tym, że tego nie robi. Zrzuty widać na osi zdarzeń
 *    (fakty z payloadu) i w karcie „Zrzuty" (agregat z projekcji).
 *  • **Kolumny „Uwagi" z adnotacją korekty.** Wygląda na proste dopasowanie po
 *    `takeoffUuid`/`landingUuid`, ale jest pułapką: korekta `void` USUWA zdarzenie ze
 *    strumienia efektywnego, więc jej cel nie jest już uuid-em żadnego lotu i licznik
 *    po cichu zaniżałby wynik. Korekty są wypisane w całości na osi zdarzeń, tam gdzie
 *    widać ich kontekst.
 */

import type { SessionState } from '@uzaero/domain';
import { hhmm, timeUtcSeconds } from '@uzaero/format';

import type { PillTone } from '../../ui/components/Pill';

export interface FlightRow {
  index: number;
  takeoff: string;
  landing: string;
  duration: string;
  method: { label: string; tone: PillTone };
  /** Numer cyklu silnika, w którym mieści się start; „-" gdy poza cyklem. */
  cycle: string;
  /** Lot jeszcze trwa - czas lotu nie wchodzi do sumy dnia. */
  open: boolean;
  /**
   * Adres śladu tego lotu (`A02c`). Wypełniony ZAWSZE, także dla wpisu ręcznego -
   * ekran śladu tłumaczy wtedy, dlaczego trasy nie ma, a wyszarzony przycisk kazałby
   * administratorowi zgadywać, czy to brak danych, czy niedziałająca funkcja.
   * `null` wyłącznie wtedy, gdy projekcja nie zna uuid-a sesji (stan niemożliwy dla
   * dnia, który ma loty - ale typ tego nie gwarantuje).
   */
  trackHref: string | null;
}

/**
 * W którym cyklu silnika odbył się ten lot.
 *
 * To jest PRZYPISANIE, nie wyliczenie: obie strony (cykle i loty) policzyła projekcja,
 * a warunek jest zawarciem w przedziale - start między `engine_start` a `engine_stop`.
 * Cykl otwarty (`stoppedAt === null`) obejmuje wszystko po swoim starcie, bo tak samo
 * traktuje go `projectSession` przy liczeniu czasu blokowego.
 *
 * `-` znaczy „poza cyklem" i jest prawdziwą odpowiedzią, nie brakiem danych: wpis
 * ręczny (`manual_log_entry`) wnosi lot bez pary zdarzeń silnika, więc do żadnego
 * cyklu nie należy.
 */
function cycleOf(state: SessionState, takeoffAt: number): string {
  const index = state.legs.findIndex(
    (run) => run.startedAt <= takeoffAt && (run.stoppedAt == null || takeoffAt <= run.stoppedAt),
  );
  return index === -1 ? '-' : String(index + 1);
}

export function flightRows(state: SessionState): FlightRow[] {
  return state.flights.map((flight) => ({
    index: flight.index,
    takeoff: timeUtcSeconds(flight.takeoffAt),
    landing: timeUtcSeconds(flight.landingAt),
    // Lot w powietrzu ma `durationMs === 0` z definicji projekcji („wartości na żywo
    // NIE wchodzą do sum"). Wypisanie „00:00" sugerowałoby lot zerowej długości,
    // więc mówimy wprost, że nie ma jeszcze czego mierzyć.
    duration: flight.landingAt == null ? '-' : hhmm(flight.durationMs),
    method:
      flight.method === 'manual'
        ? { label: 'ręcznie', tone: 'amber' }
        : { label: 'auto', tone: 'dim' },
    cycle: cycleOf(state, flight.takeoffAt),
    open: flight.landingAt == null,
    trackHref:
      state.sessionUuid == null
        ? null
        : `/dni/${encodeURIComponent(state.sessionUuid)}/slad/${flight.index}`,
  }));
}
