/**
 * UZ Aero - PODZIAŁ ŚLADU NA FAZY: kołowanie kontra lot (issue #75 pkt 4).
 *
 * Zapis GPS obejmuje CAŁY bieg silnika (issue #38), więc jedna linia na mapie mieszała
 * drogę kołowania z trasą w powietrzu - a mockupy 14 i miniatury na 10 od początku
 * rysują kołowanie przerywaną szarą, loty pełną zieloną. Ten moduł liczy, KTÓRE odcinki
 * są którą fazą; jak je narysować (kreska, kolor), rozstrzyga powierzchnia.
 *
 * ══ FAZA PRZYCHODZI Z REJESTRU, NIE Z KOPERTY ══
 * Koperta śladu niesie WYŁĄCZNIE geometrię (issue #47) i tak zostaje: granice lotów
 * (start → lądowanie) są faktami rejestru i to wołający je podaje - telefon z lokalnej
 * projekcji, panel z DTO sesji. Dokładanie fazy do wierzchołków koperty byłoby drugą
 * kopią tych samych faktów na drucie, czyli dokładnie tym, przed czym tamten moduł
 * ma test.
 *
 * ══ ODCINEK, NIE WIERZCHOŁEK ══
 * Fazę ma ODCINEK między sąsiednimi punktami: lot to odcinki, których OBA końce leżą
 * w oknie któregoś lotu. Odcinek przejściowy (jeden koniec przed startem) zostaje
 * kołowaniem - przerywana kreska dochodzi wtedy do znacznika T/O zamiast zieleni
 * zaczynającej się w połowie drogi na pas. Sąsiednie przebiegi DZIELĄ wierzchołek
 * graniczny, więc łamane stykają się bez dziury.
 *
 * Bieg bez ani jednego lotu (próba silnika) jest w całości kołowaniem - i to jest
 * odpowiedź poprawna, nie przypadek brzegowy.
 */

import type { EpochMillis } from '../time';

/** Faza odcinka śladu. `taxi` = ziemia (kołowanie, postój z zapisem), `flight` = powietrze. */
export type TrackPhase = 'taxi' | 'flight';

/** Okno jednego lotu; `landingAt: null` = w powietrzu (okno otwarte do końca zapisu). */
export interface TrackFlightWindow {
  takeoffAt: EpochMillis;
  landingAt: EpochMillis | null;
}

/**
 * Spójny przebieg jednej fazy: wierzchołki `from..to` WŁĄCZNIE (indeksy wejściowej
 * listy czasów). Kolejne przebiegi dzielą wierzchołek graniczny (`to` == następne `from`).
 */
export interface TrackPhaseRun {
  phase: TrackPhase;
  from: number;
  to: number;
}

const inFlight = (t: EpochMillis, flights: readonly TrackFlightWindow[]): boolean =>
  flights.some((f) => t >= f.takeoffAt && (f.landingAt == null || t <= f.landingAt));

/**
 * Dzieli listę czasów wierzchołków na przebiegi faz.
 *
 * @param times   czasy wierzchołków linii (albo próbek profilu) w porządku zapisu,
 * @param flights okna lotów z REJESTRU (nie z koperty - patrz docblock modułu).
 *
 * Mniej niż dwa punkty = nie ma ani jednego odcinka, więc i przebiegów. Pusta lista
 * lotów = całość kołowaniem.
 */
export function trackPhaseRuns(
  times: readonly EpochMillis[],
  flights: readonly TrackFlightWindow[],
): TrackPhaseRun[] {
  if (times.length < 2) return [];

  const runs: TrackPhaseRun[] = [];
  let current: TrackPhaseRun | null = null;

  for (let i = 1; i < times.length; i++) {
    const phase: TrackPhase =
      inFlight(times[i - 1]!, flights) && inFlight(times[i]!, flights) ? 'flight' : 'taxi';

    if (current != null && current.phase === phase) {
      current.to = i;
    } else {
      current = { phase, from: i - 1, to: i };
      runs.push(current);
    }
  }

  return runs;
}

/**
 * Przycina przebiegi do okna indeksów `from..to` WŁĄCZNIE - dla fragmentu trasy
 * podświetlanego z profilu (mapa 14): fragment ma nieść te same fazy, co całość,
 * a nie wracać do jednej zielonej linii. Przebiegi jednopunktowe po przycięciu
 * odpadają - punkt nie ma jak być odcinkiem.
 */
export function clipPhaseRuns(
  runs: readonly TrackPhaseRun[],
  from: number,
  to: number,
): TrackPhaseRun[] {
  const clipped: TrackPhaseRun[] = [];
  for (const run of runs) {
    const start = Math.max(run.from, from);
    const end = Math.min(run.to, to);
    if (start < end) clipped.push({ phase: run.phase, from: start, to: end });
  }
  return clipped;
}
