/**
 * UZ Aero — LOG KOKPITU (mockupy 04, 04B, 05) jako oś sesji.
 *
 * ══ CO SIĘ TU STAŁO PRZY ISSUE #44 ══
 * Ten moduł budował wcześniej `EventLogRow[]` — własny kształt wiersza dla własnego
 * komponentu kokpitu: szyna z ikonami w plakietkach, chipy licznika i paliwa przy
 * uruchomieniu silnika, pełnoszerokie pasy tankowania, separatory „Lot 1 / Lot 2".
 * Rozliczenie tej samej sesji (10) rysowało tymczasem oś: kolumnę czasu z kropkami,
 * polskie nazwy zdarzeń i numer lotu przy starcie. Pilot dostawał więc dwa widoki
 * jednej rzeczy i musiał uczyć się obu.
 *
 * Odtąd kształt jest jeden (`buildSessionAxis`), a kokpit dokłada do niego dokładnie to,
 * czego rozliczenie mieć nie może, bo opisuje TERAZ:
 *  • **wiersz „na żywo"** — licznik od startu (w powietrzu) albo od uruchomienia silnika;
 *  • **znacznik outboxa** przy wpisach, które czekają na wysyłkę.
 *
 * Znikły przy tym trzy rzeczy i każda z własnego powodu:
 *  • **chipy MH i paliwa przy „Start engine"** — te liczby są odczytem PRZEJĘCIA, więc
 *    stoją teraz w wierszu przejęcia, tam gdzie na 10. Przy uruchomieniu silnika wisiały
 *    tylko dlatego, że kokpit nie miał wiersza przejęcia w ogóle;
 *  • **czas trwania kołowania** — materializował się dopiero przy starcie, więc nigdy
 *    nie pomógł temu, kto właśnie kołuje, a w rozliczeniu jest ciekawostką (do bloku
 *    wchodzi cały bieg silnika);
 *  • **podpis „blok 1:13" przy wyłączeniu** — czas blokowy jest sumą SESJI, nie opisem
 *    tego jednego zdarzenia; mieszka w stopce osi, którą kokpit pokazuje po zatrzymaniu
 *    silnika.
 */

import type { Event, SessionState } from '../../../domain';
import { durationLong } from '../../format';
import { buildSessionAxis, type AxisFootItem, type AxisRow } from './sessionAxis';

/** Oś kokpitu: wiersze z wierszem „na żywo" na końcu plus stopka sum, gdy jest co sumować. */
export interface CockpitAxis {
  rows: AxisRow[];
  /**
   * Sumy sesji — puste, dopóki silnik nie przestał pracować. „BLOK 00:00" pod pracującym
   * silnikiem nie jest odpowiedzią na żadne pytanie, a czas lotu w locie stoi już
   * w siatce przyrządów (05).
   */
  foot: AxisFootItem[];
  /**
   * Czy w sesji zaszło cokolwiek OPERACYJNEGO (kołowanie, start, lądowanie, zrzut,
   * tankowanie, załadunek, zmiana załogi). Karta logu w locie pojawia się dopiero wtedy
   * (issue #19): oś złożona z przejęcia, uruchomienia i wiersza „na żywo" powtarzałaby
   * to, co ekran mówi wyżej.
   */
  hasEvents: boolean;
}

/** Wiersze, które nie są jeszcze przebiegiem sesji — po nich karta logu się nie zapala. */
const QUIET: ReadonlySet<AxisRow['kind']> = new Set(['claim', 'engineStart', 'live']);

/**
 * Buduje oś kokpitu z lokalnego strumienia sesji.
 *
 * @param events strumień sesji (surowy — korekty nakłada `buildSessionAxis`).
 * @param projection stan sesji policzony z tego samego strumienia.
 * @param now „teraz" z tykającego zegara — do licznika „na żywo" i czasu trzymania.
 */
export function buildCockpitAxis(
  events: Event[],
  projection: SessionState,
  now: number,
): CockpitAxis {
  const axis = buildSessionAxis(projection, events, now);
  const rows = withPending(axis.rows, events);

  const live = liveRow(projection, now);
  if (live != null) rows.push(live);

  return {
    rows,
    // Trasy stopka NIE powtarza — stoi w pasku górnym kokpitu (reguła stanu modalnego:
    // ekran nie mówi dwa razy tego samego).
    foot: projection.blockTimeMs > 0 ? axis.foot.filter((item) => item.id !== 'route') : [],
    hasEvents: rows.some((row) => !QUIET.has(row.kind)),
  };
}

/**
 * Oś CUDZEJ sesji (podgląd 04B) — bez wiersza „na żywo" i bez znaczników outboxa.
 *
 * Outbox opisuje TEN telefon; cudze zdarzenia przyszły z serwera, więc strzałka mówiłaby
 * o kolejce, której nie znamy. Wiersza „na żywo" nie ma z podobnego powodu: migawka jest
 * z chwili ostatniego syncu, a zielony licznik sugerowałby, że patrzymy na żywo.
 * Sumy niesie pasek sesji nad logiem, więc stopki też nie ma.
 */
export function buildPeekAxis(events: Event[], projection: SessionState, now: number): AxisRow[] {
  return buildSessionAxis(projection, events, now).rows;
}

/**
 * Znacznik „czeka na wysyłkę" przy wierszu.
 *
 * Adresem jest `targetUuid`, a nie `id`: końce osi (przejęcie, zdanie) mają identyfikatory
 * własne, bo pochodzą z projekcji, a nie z pojedynczego zdarzenia — ale niesie je konkretny
 * wpis rejestru i to jego stan wysyłki opisujemy.
 */
function withPending(rows: AxisRow[], events: readonly Event[]): AxisRow[] {
  const unsent = new Set(events.filter((e) => e.syncedAt == null).map((e) => e.uuid));
  if (unsent.size === 0) return [...rows];
  return rows.map((row) =>
    row.targetUuid != null && unsent.has(row.targetUuid) ? { ...row, pending: true } : row,
  );
}

/**
 * Wiersz „na żywo": zielona kropka, nazwa stanu i licznik.
 *
 * Nie ma godziny w kolumnie czasu, bo nie jest zdarzeniem rejestru — jest czasem TRWANIA,
 * a te w tej osi stoją po prawej (tam, gdzie czas lotu przy lądowaniu). W powietrzu liczy
 * od startu, na ziemi od uruchomienia silnika.
 */
function liveRow(projection: SessionState, now: number): AxisRow | null {
  const since = projection.openTakeoffAt ?? projection.openEngineStartAt;
  if (since == null) return null;

  return {
    id: 'live',
    kind: 'live',
    at: now,
    time: '',
    name: projection.inFlight ? 'W locie…' : 'Silnik pracuje…',
    sub: null,
    flight: null,
    duration: durationLong(Math.max(0, now - since)),
    targetUuid: null,
    corrected: false,
  };
}
