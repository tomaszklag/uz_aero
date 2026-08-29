/**
 * UZ Aero (serwer) - mapper raportu analityki zużycia (`A10a`, `A10b`).
 *
 * Funkcja CZYSTA: dostaje wiersze i strumienie, oddaje DTO. Bez bazy, bez zegara -
 * dzięki temu każdy iloraz da się przetestować bez stawiania Postgresa, tak samo jak
 * `statsReport.ts`.
 *
 * ══ PODZIAŁ PRACY ══
 * Domena liczy to, co wymaga wiedzy o dziedzinie: interwały, regresję, przeliczniki.
 * Ten plik robi trzy rzeczy, których domena robić nie ma po co: składa strumienie wielu
 * sesji w jeden zbiór interwałów, liczy ilorazy sum na kolumnach projekcji i opisuje,
 * ILU dni analiza dotyczyła. Ostatnie jest równie ważne jak liczby: raport z połowy
 * okna, który nie mówi, że jest z połowy, kłamie skuteczniej niż brak raportu.
 */

import {
  buildFuelIntervals,
  consumptionSummary,
  fitConsumptionModel,
  fitMhModel,
  type Event,
  type FuelInterval,
  type MhEquation,
  type PhaseSegment,
} from '@uzaero/domain';

import type {
  ConsumptionAircraftRow,
  ConsumptionSessionRef,
} from '../ports.ts';
import type {
  AdminConsumptionBasis,
  AdminConsumptionHeadline,
  AdminConsumptionReport,
} from '../contracts/consumption.ts';
import type { AdminStatsRange } from '../contracts/stats.ts';

const HOUR_MS = 3_600_000;

export interface ConsumptionReportInput {
  at: Date;
  range: AdminStatsRange;
  aircraft: ConsumptionAircraftRow;
  /** Dni zamknięte, które weszły do analizy (już przycięte limitem). */
  sessions: readonly ConsumptionSessionRef[];
  /** Dni zamknięte w oknie łącznie - do wykrycia przycięcia. */
  sessionsInRange: number;
  openSessions: number;
  /** Strumienie tych samych sesji, po `sessionUuid`. */
  streams: ReadonlyMap<string, Event[]>;
  /**
   * Osie faz pionowych ze śladu GPS, po `sessionUuid`. Sesja bez wpisu (albo z pustą
   * osią) nie dostaje rozbicia lotu na wznoszenie/przelot/zniżanie - jej interwały
   * wchodzą do modelu dwufazowego, a `fuel.tracedIntervals` mówi, ilu wierszy to dotyczy.
   */
  timelines?: ReadonlyMap<string, PhaseSegment[]>;
}

export function consumptionReport(input: ConsumptionReportInput): AdminConsumptionReport {
  const intervals: FuelInterval[] = [];
  const equations: MhEquation[] = [];

  for (const session of input.sessions) {
    const stream = input.streams.get(session.sessionUuid) ?? [];
    if (stream.length === 0) continue;

    const phaseTimeline = input.timelines?.get(session.sessionUuid);
    const extracted = buildFuelIntervals(stream, { phaseTimeline });
    intervals.push(...extracted.intervals);
    if (extracted.mh != null) equations.push(extracted.mh);
  }

  // Kolejność chronologiczna, nie „od najnowszego": tabela interwałów czyta się jak
  // rejestr, a wykres trendu potrzebuje osi rosnącej. Odwrócenie na potrzeby widoku
  // jest sprawą ekranu, nie kontraktu.
  intervals.sort((a, b) => a.startAt - b.startAt);

  const summary = consumptionSummary(intervals);
  const fuel = fitConsumptionModel(intervals);
  const mh = fitMhModel(equations);

  return {
    at: input.at.toISOString(),
    range: input.range,
    aircraft: {
      aircraftId: input.aircraft.aircraftId,
      reg: input.aircraft.reg,
      aircraftType: input.aircraft.aircraftType,
      capacityL: input.aircraft.capacityL,
      mhFormat: input.aircraft.mhFormat,
      serviceStatus: input.aircraft.serviceStatus,
    },
    headline: headline(input.sessions, summary),
    basis: basis(input, summary),
    summary,
    fuel,
    mh,
    intervals,
  };
}

/**
 * Kafle nagłówkowe. Trzy pierwsze liczby biorą się z interwałów (czyli ze strumienia),
 * czwarta - z KOLUMN PROJEKCJI, bo przyrost licznika jest wartością, którą projekcja
 * już policzyła i nie ma powodu odtwarzać go po raz drugi.
 */
function headline(
  sessions: readonly ConsumptionSessionRef[],
  summary: ReturnType<typeof consumptionSummary>,
): AdminConsumptionHeadline {
  let mhDelta = 0;
  let blockMs = 0;
  for (const session of sessions) {
    // Dzień bez przyrostu licznika NIE wchodzi też mianownikiem - inaczej iloraz
    // dzieliłby sumę z części dni przez blok wszystkich i systematycznie zaniżał wynik.
    // Ta sama zasada, co przy `fuelBlockMs` w statystykach zakresu.
    if (session.mhDeltaH == null) continue;
    mhDelta += session.mhDeltaH;
    blockMs += session.blockMs;
  }

  return {
    litersPerFlightHour: summary.litersPerFlightHour,
    litersPerBlockHour: summary.litersPerBlockHour,
    litersPerFlight: summary.litersPerFlight,
    mhPerBlockHour: over(mhDelta, blockMs / HOUR_MS),
  };
}

function basis(
  input: ConsumptionReportInput,
  summary: ReturnType<typeof consumptionSummary>,
): AdminConsumptionBasis {
  return {
    sessions: input.sessions.length,
    sessionsInRange: input.sessionsInRange,
    openSessions: input.openSessions,
    staleRows: input.sessions.filter((session) => session.takeoffCount == null).length,
    firstDay: summary.firstDay,
    lastDay: summary.lastDay,
  };
}

/** Dzielenie, które nie zmyśla: `null` zamiast nieskończoności przy pustym mianowniku. */
function over(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
