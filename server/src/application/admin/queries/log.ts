/**
 * Ninerdeck (serwer) - LOG DNIA, poziom 1: flota w zakresie dat.
 *
 * Warstwa cienka z zawodu: rozstrzyga ZAKRES, woła adapter i przepisuje agregat na
 * kontrakt. Arytmetyki nie ma tu ani jednej - sumy policzył Postgres z kolumn
 * projekcji, a te policzyła domena.
 */

import type {
  AdminLogAircraftItem,
  AdminLogPilotItem,
  AdminLogPilotsReport,
  AdminLogRange,
  AdminLogReport,
} from '../contracts/log.ts';
import type { Clock } from '../../common/ports.ts';
import type { Database } from '../../common/ports.ts';
import type { LogAdminPort, LogAircraftAggregate, LogPilotAggregate } from '../ports.ts';

/** Zakres jak w reszcie panelu: dzień UTC `YYYY-MM-DD`, obustronnie domknięty. */
export interface LogFilter {
  fromMs?: number;
  toMs?: number;
}

export type LogLoadOutcome =
  | { ok: true; report: AdminLogReport }
  | { ok: false; reason: 'bad_range' };

export type LogPilotsOutcome =
  | { ok: true; report: AdminLogPilotsReport }
  | { ok: false; reason: 'bad_range' };

/** Zakres ROZSTRZYGNIĘTY (domyślne wstawione) razem z chwilą odpowiedzi. */
interface ResolvedRange {
  at: Date;
  fromMs: number;
  toMs: number;
  range: AdminLogRange;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Domyślne okno - ostatnie 30 dni, tak jak w statystykach. */
const DEFAULT_DAYS = 30;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export class AdminLogQueries {
  constructor(
    private readonly db: Database,
    private readonly log: LogAdminPort,
    private readonly clock: Clock,
  ) {}

  async load(orgId: string, filter: LogFilter = {}): Promise<LogLoadOutcome> {
    const resolved = this.resolve(filter);
    if (resolved == null) return { ok: false, reason: 'bad_range' };
    const { at, fromMs, toMs, range } = resolved;

    const aircraft = await this.log.byAircraft(this.db, orgId, { fromMs, toMs });

    return {
      ok: true,
      report: { at: at.toISOString(), range, aircraft: aircraft.map(toItem) },
    };
  }

  /**
   * OŚ PILOTÓW tego samego zakresu (3.2.0, §4.1): ci, którzy latali, plus zwinięci
   * członkowie bez lotów. Zakres rozstrzyga się TĄ SAMĄ funkcją, co dla osi maszyn -
   * dwie osie jednego ekranu nie mają prawa mieć dwóch „dziś".
   */
  async loadPilots(
    orgId: string,
    filter: LogFilter & { includeIdle: boolean },
  ): Promise<LogPilotsOutcome> {
    const resolved = this.resolve(filter);
    if (resolved == null) return { ok: false, reason: 'bad_range' };
    const { at, fromMs, toMs, range } = resolved;

    const { pilots, idle } = await this.log.byPilot(this.db, orgId, { fromMs, toMs });

    return {
      ok: true,
      report: {
        at: at.toISOString(),
        range,
        pilots: pilots.map(toPilotItem),
        // Liczba zawsze, lista na żądanie: wiersz zwinięcia czeka na liczbę, a nie na
        // nazwiska, których zwykle nikt nie rozwija.
        idle: { count: idle.length, members: filter.includeIdle ? idle : null },
      },
    };
  }

  /** `null` = zakres odwrócony (po wstawieniu domyślnych). */
  private resolve(filter: LogFilter): ResolvedRange | null {
    // „Dziś" bierze się z zegara SERWERA, nie przeglądarki. Zegar przeglądarki jest
    // trzecim, niesprawdzonym zegarem w systemie, a od tego, co znaczy „dziś", zależy,
    // które wiersze człowiek zobaczy - i czy uzna je za komplet.
    const at = this.clock.now();
    const defaulted = filter.fromMs == null && filter.toMs == null;

    const toMs = filter.toMs ?? endOfDay(at.getTime());
    const fromMs = filter.fromMs ?? startOfDay(toMs) - (DEFAULT_DAYS - 1) * DAY_MS;
    // Zakres odwrócony odrzucamy TUTAJ, po rozstrzygnięciu domyślnych - inaczej trasa
    // musiałaby znać reguły domyślne, żeby wiedzieć, co porównuje.
    if (fromMs > toMs) return null;

    return { at, fromMs, toMs, range: { from: dayOf(fromMs), to: dayOf(toMs), defaulted } };
  }
}

/** Agregat osi pilotów -> wiersz kontraktu. Przepisanie, bez ani jednego rachunku. */
function toPilotItem(p: LogPilotAggregate): AdminLogPilotItem {
  return {
    pilotId: p.pilotId,
    code: p.code,
    name: p.name,
    active: p.active,
    activeDays: p.activeDays,
    sessions: p.sessions,
    openSessions: p.openSessions,
    flights: p.flights,
    blockMs: p.blockMs,
    flightMs: p.flightMs,
    dual: p.dual,
    regs: p.regs,
    open: p.open,
  };
}

const startOfDay = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;
const endOfDay = (ms: number): number => startOfDay(ms) + DAY_MS - 1;

/**
 * Agregat portu -> wiersz kontraktu.
 *
 * `mhFormat` przepuszczamy przez strażnika, bo kontrakt ma zamkniętą unię, a kolumna
 * w bazie jest tekstem z `CHECK`-iem: wartość spoza słownika znaczy, że ktoś zdjął
 * ograniczenie, i wtedy `null` jest uczciwszy niż rzutowanie.
 */
function toItem(a: LogAircraftAggregate): AdminLogAircraftItem {
  return {
    aircraftId: a.aircraftId,
    reg: a.reg,
    aircraftType: a.aircraftType,
    mhFormat: a.mhFormat === 'decimal' || a.mhFormat === 'hhmm' ? a.mhFormat : null,
    sessions: a.sessions,
    openSessions: a.openSessions,
    activeDays: a.activeDays,
    flights: a.flights,
    takeoffs: a.takeoffs,
    landings: a.landings,
    blockMs: a.blockMs,
    flightMs: a.flightMs,
    fuelAddedL: a.fuelAddedL,
    fuelConsumedL: a.fuelConsumedL,
    fuelUnknownSessions: a.fuelUnknownSessions,
    oilAddedL: a.oilAddedL,
    mhDeltaH: a.mhDeltaH,
    lastEngineStopAt: a.lastEngineStopAt,
  };
}
