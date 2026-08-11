/**
 * UZ Aero — ekstrakcja interwałów paliwowych i równania motogodzin z JEDNEJ sesji.
 *
 * ══ JAK DZIEŃ DZIELI SIĘ NA INTERWAŁY ══
 * Odczyt paliwomierza pada w trzech momentach i każdy z nich znaczy co innego dla granic:
 *
 *   `preflight_confirm`  →  OTWIERA pierwszy interwał (odczyt startowy)
 *   `refuel`             →  ZAMYKA bieżący (`beforeL`) i OTWIERA następny (`afterL`)
 *   `day_close`          →  ZAMYKA ostatni (`finalReading.fuelL`)
 *
 * (`leg_close` bywał czwartą granicą między 2026-08-06 a 2026-08-10 — znikł razem
 * z opcjonalnym odczytem per wzlot; sesję domykają odczyty przejęcia i zdania.)
 *
 * Dolewka nie jest więc składnikiem żadnego równania — jest GRANICĄ. To dlatego zużycie
 * w interwale liczy się jako różnica dwóch odczytów, bez żadnej arytmetyki dolewek.
 *
 * ══ RYZYKO §3.6b ZAMKNIĘTE PRZEZ PIVOT (2026-08-10) ══
 * Odczyty są obowiązkowe przy zdaniu, a sesja = jeden bieg silnika — każda sesja jest
 * więc domknięta odczytami z OBU stron i interwały degeneracyjne „między ostatnim
 * odczytem wzlotu a zdaniem" znikają z konstrukcji. Progów nadal NIE stroimy tutaj —
 * od tego jest `server/scripts/consumptionReplay.ts` na danych demo (etap E).
 *
 * ══ SESJA BEZ `day_close` NIE PRODUKUJE OSTATNIEGO INTERWAŁU ══
 * I nie jest to niedopatrzenie: bez odczytu zamykającego nie wiadomo, ile paliwa ubyło.
 * Dzień otwarty oddaje więc interwały domknięte tankowaniami, a ostatni odcinek czeka
 * na zamknięcie dnia. Ta sama zasada, co w projekcji: „zużycie istnieje dopiero
 * z odczytem końcowym".
 *
 * ══ KOREKTY PRZED ARYTMETYKĄ ══
 * Układ jest ten sam co w `projectSession` (i musi być, bo obie strony mają widzieć ten
 * sam dzień): korekty nakładamy PRZED liczeniem, potem sortujemy po czasie zdarzenia.
 * Skutki są konkretne i warto je znać: `void` na tankowaniu SCALA dwa sąsiednie interwały
 * w jeden (znika granica), a `retime` PRZESUWA granicę i zmienia czasy obu sąsiadów.
 */

import type { EpochMillis } from '../time';
import type { Event } from '../events';
import { applyCorrections, eventTime, projectSession, type SessionState } from '../projections';
import {
  emptySessionIntervals,
  type FuelBoundKind,
  type FuelInterval,
  type MhEquation,
  type SessionIntervals,
} from './interval';
import { intervalRejection } from './policy';
import { phaseTimesInWindow, type PhaseSegment } from './phaseTimeline';
import { blockSpans, flightSpans, spanTimeInWindow, type Span } from './timeInPhase';

/**
 * Punkt odczytu paliwomierza na osi dnia.
 *
 * Jedno zdarzenie potrafi nieść DWA odczyty (tankowanie: przed i po), dlatego pola
 * `closes` i `opens` są rozdzielone — a nie jedna wartość z flagą.
 */
interface FuelBound {
  at: EpochMillis;
  uuid: string;
  kind: FuelBoundKind;
  /** Odczyt zamykający bieżący interwał; `null` = ten punkt niczego nie zamyka. */
  closes: number | null;
  /** Odczyt otwierający następny interwał; `null` = ten punkt niczego nie otwiera. */
  opens: number | null;
}

/** Opcje ekstrakcji. */
export interface FuelIntervalOptions {
  /**
   * Oś faz pionowych ze śladu GPS (`buildPhaseTimeline`). Podana — interwały dostają
   * rozbicie lotu na wznoszenie/przelot/zniżanie i model może pracować na czterech
   * fazach. Pominięta — pola faz zostają `null`, czyli „nie wiem", a model schodzi
   * na podział ziemia/powietrze.
   *
   * Oś jest parametrem, a nie czymś, co ta funkcja sama sobie policzy, bo pochodzi
   * z INNEGO magazynu (pliki śladu) niż rejestr zdarzeń — a domena nie czyta plików.
   */
  phaseTimeline?: readonly PhaseSegment[];
}

/**
 * Buduje interwały paliwowe i równanie motogodzin z sesji.
 *
 * @param events strumień JEDNEJ sesji — surowy (korekty nakładamy tutaj).
 */
export function buildFuelIntervals(
  events: Event[],
  options: FuelIntervalOptions = {},
): SessionIntervals {
  if (events.length === 0) return emptySessionIntervals();

  const state = projectSession(events);
  const ordered = [...applyCorrections(events)].sort((a, b) => eventTime(a) - eventTime(b));

  const block = blockSpans(state, events);
  const flights = flightSpans(state);

  const intervals = buildIntervals(ordered, state, block, flights);

  if (options.phaseTimeline != null && options.phaseTimeline.length > 0) {
    for (const interval of intervals) {
      const times = phaseTimesInWindow(
        options.phaseTimeline,
        flights,
        interval.startAt,
        interval.endAt,
      );
      interval.climbMs = times.climbMs;
      interval.cruiseMs = times.cruiseMs;
      interval.descentMs = times.descentMs;
    }
  }

  return { intervals, mh: buildMhEquation(state, block, flights) };
}

/** Wyłuskuje punkty odczytu z posortowanego strumienia efektywnego. */
function collectBounds(ordered: readonly Event[]): FuelBound[] {
  const bounds: FuelBound[] = [];

  for (const event of ordered) {
    const at = eventTime(event);

    if (event.type === 'preflight_confirm') {
      bounds.push({
        at,
        uuid: event.uuid,
        kind: 'preflight',
        closes: null,
        opens: event.payload.reading.fuelL,
      });
    } else if (event.type === 'refuel') {
      bounds.push({
        at,
        uuid: event.uuid,
        kind: 'refuel',
        closes: event.payload.beforeL,
        opens: event.payload.afterL,
      });
    } else if (event.type === 'day_close') {
      bounds.push({
        at,
        uuid: event.uuid,
        kind: 'day_close',
        closes: event.payload.finalReading.fuelL,
        opens: null,
      });
    }
  }

  return bounds;
}

function buildIntervals(
  ordered: readonly Event[],
  state: SessionState,
  block: readonly Span[],
  flights: readonly Span[],
): FuelInterval[] {
  const bounds = collectBounds(ordered);
  const intervals: FuelInterval[] = [];
  let open: FuelBound | null = null;

  for (const bound of bounds) {
    if (open != null && bound.closes != null) {
      // Granica o tym samym znaczniku czasu co otwarcie nie wyznacza żadnego okna
      // (dwa odczyty w tej samej milisekundzie — korekta albo podwójny zapis).
      if (bound.at > open.at) {
        intervals.push(
          measure(open, bound, state, block, flights, open.opens!, bound.closes),
        );
      }
      open = null;
    }
    if (bound.opens != null) open = bound;
  }

  return intervals;
}

/** Wypełnia jeden interwał czasami faz i werdyktem bramki. */
function measure(
  from: FuelBound,
  to: FuelBound,
  state: SessionState,
  block: readonly Span[],
  flights: readonly Span[],
  startReadingL: number,
  endReadingL: number,
): FuelInterval {
  const engineMs = spanTimeInWindow(block, from.at, to.at);
  const flightMs = spanTimeInWindow(flights, from.at, to.at);

  const interval: FuelInterval = {
    sessionUuid: state.sessionUuid ?? '',
    aircraftId: state.aircraftId ?? '',
    dayStart: state.claimedAt,
    startAt: from.at,
    endAt: to.at,
    startKind: from.kind,
    endKind: to.kind,
    startUuid: from.uuid,
    endUuid: to.uuid,
    startReadingL,
    endReadingL,
    consumedL: startReadingL - endReadingL,
    engineMs,
    flightMs,
    // Czas lotu większy niż czas pracy silnika jest fizycznie niemożliwy i znaczy
    // rozjazd w rejestrze (ręczny wpis nachodzący na cykl). Przycinamy do zera zamiast
    // wpuszczać ujemny czas do regresji — a sam rozjazd zobaczy flaga, nie ten moduł.
    groundMs: Math.max(0, engineMs - flightMs),
    climbMs: null,
    cruiseMs: null,
    descentMs: null,
    flightCount: countFlights(state, from.at, to.at),
    rejected: null,
  };

  interval.rejected = intervalRejection(interval);
  return interval;
}

/**
 * Loty ZAWARTE w oknie — mianownik metryki „paliwo na lot".
 *
 * Liczymy loty zamknięte w całości między granicami, a nie przecinające je: tankowanie
 * odbywa się na ziemi, więc lot rozcięty granicą interwału znaczy rozjazd w rejestrze,
 * a nie sytuację normalną. Liczba, która w takim wypadku zaniży się o jeden, jest lepsza
 * od takiej, która policzy ten sam lot w dwóch interwałach.
 */
function countFlights(state: SessionState, since: EpochMillis, until: EpochMillis): number {
  let count = 0;
  for (const flight of state.flights) {
    if (flight.landingAt == null) continue;
    if (flight.takeoffAt >= since && flight.landingAt <= until) count += 1;
  }
  return count;
}

/**
 * Równanie motogodzin dnia — `null`, dopóki nie ma OBU odczytów licznika.
 *
 * Czasy bierzemy przez te same odcinki co interwały (więc ze scalaniem nakładek), a nie
 * z `state.blockTimeMs` / `state.flightTimeMs`. Powód jest ten sam, dla którego powstał
 * `timeInPhase.ts`: sumy projekcji liczą zaraportowany czas, a mianownik równania ma
 * opisywać czas, w którym silnik faktycznie pracował.
 */
function buildMhEquation(
  state: SessionState,
  block: readonly Span[],
  flights: readonly Span[],
): MhEquation | null {
  if (state.mh.deltaH == null || state.sessionUuid == null) return null;

  const window = spanWindow(block);
  if (window == null) return null;

  const engineMs = spanTimeInWindow(block, window.from, window.to);
  const flightMs = spanTimeInWindow(flights, window.from, window.to);
  if (engineMs <= 0) return null;

  return {
    sessionUuid: state.sessionUuid,
    dayStart: state.claimedAt,
    deltaMh: state.mh.deltaH,
    flightMs,
    groundMs: Math.max(0, engineMs - flightMs),
    clamped: flightMs > engineMs,
  };
}

/** Domknięcie wszystkich odcinków pracy silnika; `null` gdy silnik nie pracował. */
function spanWindow(spans: readonly Span[]): { from: EpochMillis; to: EpochMillis } | null {
  let from: EpochMillis | null = null;
  let to: EpochMillis | null = null;

  for (const span of spans) {
    // Dzień zamknięty nie ma prawa mieć otwartego cyklu (`day_close` wymaga wyłączonego
    // silnika), więc odcinek bez końca pomijamy zamiast domykać go zgadywanym czasem.
    if (span.to == null) continue;
    if (from == null || span.from < from) from = span.from;
    if (to == null || span.to > to) to = span.to;
  }

  return from != null && to != null ? { from, to } : null;
}
