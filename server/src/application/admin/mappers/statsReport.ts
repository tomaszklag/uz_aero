/**
 * UZ Aero (serwer) - wiersze agregatów → raport statystyk (`A10`), funkcja CZYSTA.
 *
 * Tu - i tylko tu - powstają ILORAZY ekranu: średnie L/h, udział w nalocie,
 * wykorzystanie floty, skoczkowie na godzinę lotu, średnia wysokość zrzutu. Mapper
 * jest czystą funkcją nad sumami z portu (wzorzec `sessionRowFrom`), więc każdy
 * iloraz testuje się bez bazy. SQL oddaje FAKTY (sumy i liczniki), mapper wyciąga
 * z nich WNIOSKI - a panel już tylko formatuje.
 *
 * ══ DWIE RÓŻNE NIEWIEDZE, DWA RÓŻNE `null` ══
 *  1. `staleRows > 0` - w grupie są wiersze projekcji sprzed kolumn statystyk. Suma po
 *     części wierszy podana jako całość byłaby kłamstwem, więc KAŻDY agregat kolumn
 *     tej migracji jedzie wtedy jako `null`, a `staleRows` mówi, ile wierszy czeka
 *     na przebudowę (`A11`).
 *  2. `fuelKnownSessions === 0` przy niezerowej liczbie dni - bilansu nie da się
 *     policzyć dla ŻADNEGO dnia grupy (np. dni bez odczytu początkowego). Suma zero
 *     wierszy nie jest zerem litrów - jest brakiem odpowiedzi.
 * Zero pozostaje zerem tam, gdzie jest twierdzeniem prawdziwym: zakres bez ani
 * jednego zamkniętego dnia MA zero startów i zero litrów.
 */

import type {
  AdminStatsAircraftItem,
  AdminStatsClientItem,
  AdminStatsDailyPoint,
  AdminStatsDrops,
  AdminStatsOperationItem,
  AdminStatsPilotItem,
  AdminStatsRange,
  AdminStatsReport,
  AdminStatsTotals,
} from '../contracts/stats.ts';
import type {
  AdminStatsAircraftRow,
  AdminStatsClientRow,
  AdminStatsDailyRow,
  AdminStatsDropsRow,
  AdminStatsGroupRow,
  AdminStatsOpenSessionsRow,
  AdminStatsOperationRow,
  AdminStatsPilotRow,
  AdminStatsTotalsRow,
} from '../ports.ts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Wszystko, co zebrały zapytania portu - wejście raportu. */
export interface StatsReportInput {
  at: Date;
  range: AdminStatsRange;
  totals: AdminStatsTotalsRow;
  openSessions: AdminStatsOpenSessionsRow;
  daily: AdminStatsDailyRow[];
  aircraft: AdminStatsAircraftRow[];
  pilots: AdminStatsPilotRow[];
  operations: AdminStatsOperationRow[];
  drops: AdminStatsDropsRow;
  clients: AdminStatsClientRow[];
}

export function statsReport(input: StatsReportInput): AdminStatsReport {
  const totals = totalsFrom(input.totals, input.openSessions);

  return {
    at: input.at.toISOString(),
    range: input.range,
    totals,
    daily: fillDaily(input.daily, input.range),
    aircraft: input.aircraft.map((row) => aircraftItem(row, input.range.calendarDays)),
    pilots: input.pilots.map(pilotItem),
    operations: input.operations.map((row) => operationItem(row, input.totals.blockMs)),
    drops: dropsFrom(input.drops, input.clients),
  };
}

/** Iloraz z pilnowanym mianownikiem - dzielenie przez zero to `null`, nie `Infinity`. */
const over = (numerator: number | null, denominator: number): number | null =>
  numerator == null || denominator <= 0 ? null : numerator / denominator;

/** Agregat kolumn statystyk - `null`, gdy w grupie są wiersze nieprzeliczone. */
const unlessStale = (staleRows: number, value: number): number | null =>
  staleRows > 0 ? null : value;

/**
 * Suma bilansu (paliwo / Δ MH): `null` przy wierszach nieprzeliczonych ORAZ wtedy,
 * gdy żaden dzień grupy bilansu nie ma - patrz nagłówek pliku.
 */
const balanceSum = (row: AdminStatsGroupRow, sum: number, known: number): number | null => {
  if (row.staleRows > 0) return null;
  if (row.sessions > 0 && known === 0) return null;
  return sum;
};

/** Dni zamknięte bez bilansu wśród wierszy PRZELICZONYCH - nie wchodzą do sumy. */
const unknownSessions = (row: AdminStatsGroupRow, known: number): number =>
  Math.max(0, row.sessions - row.staleRows - known);

function totalsFrom(
  row: AdminStatsTotalsRow,
  openSessions: AdminStatsOpenSessionsRow,
): AdminStatsTotals {
  const fuel = balanceSum(row, row.fuelConsumedL, row.fuelKnownSessions);
  const mh = balanceSum(row, row.mhDeltaH, row.mhKnownSessions);
  // Mianownik rozjazdu z TEGO SAMEGO zbioru dni co suma Δ: blok wszystkich dni
  // przy częściowej sumie Δ pisałby „rozjazd 20 h", gdy naprawdę brakuje odczytów.
  const mhBlockHours = row.mhBlockMs / HOUR_MS;

  return {
    sessions: row.sessions,
    aircraft: row.aircraft,
    pilots: row.pilots,
    blockMs: row.blockMs,
    flightMs: row.flightMs,
    flightVsBlockPct: over(row.flightMs * 100, row.blockMs),
    takeoffs: unlessStale(row.staleRows, row.takeoffs),
    landings: unlessStale(row.staleRows, row.landings),
    fuelConsumedL: fuel,
    fuelUnknownSessions: unknownSessions(row, row.fuelKnownSessions),
    mhDeltaH: mh,
    mhUnknownSessions: unknownSessions(row, row.mhKnownSessions),
    mhBlockHours,
    mhVsBlockH: mh == null ? null : mh - mhBlockHours,
    staleRows: row.staleRows,
    openSessionsInRange: openSessions.inRange,
    openSessionsUndated: openSessions.undated,
  };
}

/**
 * Pełny kalendarz zakresu. Dzień bez sesji dostaje ZERO - i to zero jest prawdziwe:
 * „dzień bez ani jednej sesji", nie „brak danych" (hint z mockupu). Dopełnienie
 * zachodzi tutaj, nie w SQL-u - dokładnie jak `fillBuckets` na pulpicie.
 */
function fillDaily(rows: AdminStatsDailyRow[], range: AdminStatsRange): AdminStatsDailyPoint[] {
  const byIndex = new Map(rows.map((row) => [row.dayIndex, row.blockMs]));
  const first = Math.floor(range.fromMs / DAY_MS);
  const out: AdminStatsDailyPoint[] = [];
  for (let i = 0; i < range.calendarDays; i += 1) {
    const index = first + i;
    out.push({ day: dayOf(index), blockMs: byIndex.get(index) ?? 0 });
  }
  return out;
}

const dayOf = (dayIndex: number): string =>
  new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);

function aircraftItem(row: AdminStatsAircraftRow, calendarDays: number): AdminStatsAircraftItem {
  const fuel = balanceSum(row, row.fuelConsumedL, row.fuelKnownSessions);
  return {
    aircraftId: row.aircraftId,
    reg: row.reg,
    aircraftType: row.aircraftType,
    capacityL: row.capacityL,
    mhFormat: row.mhFormat,
    sessions: row.sessions,
    blockMs: row.blockMs,
    flightMs: row.flightMs,
    takeoffs: unlessStale(row.staleRows, row.takeoffs),
    landings: unlessStale(row.staleRows, row.landings),
    fuelConsumedL: fuel,
    fuelUnknownSessions: unknownSessions(row, row.fuelKnownSessions),
    // Na godzinę BLOKOWĄ, nie lotu - tak liczy mockup (19 240 L / 112.6 h = 170.8).
    // Blok TYLKO dni z bilansem paliwa: licznik i mianownik z jednego zbioru dni.
    avgLitresPerBlockHour: over(fuel, row.fuelBlockMs / HOUR_MS),
    mhFirstStart: row.mhFirstStart,
    mhLastEnd: row.mhLastEnd,
    mhDeltaH: balanceSum(row, row.mhDeltaH, row.mhKnownSessions),
    mhUnknownSessions: unknownSessions(row, row.mhKnownSessions),
    activeDays: row.activeDays,
    utilizationPct: over(row.activeDays * 100, calendarDays),
    staleRows: row.staleRows,
  };
}

function pilotItem(row: AdminStatsPilotRow): AdminStatsPilotItem {
  return {
    pilotId: row.pilotId,
    code: row.code,
    name: row.name,
    sessions: row.sessions,
    blockMs: row.blockMs,
    flightMs: row.flightMs,
    takeoffs: unlessStale(row.staleRows, row.takeoffs),
    landings: unlessStale(row.staleRows, row.landings),
    regs: row.regs,
    staleRows: row.staleRows,
  };
}

function operationItem(row: AdminStatsOperationRow, totalBlockMs: number): AdminStatsOperationItem {
  const fuel = balanceSum(row, row.fuelConsumedL, row.fuelKnownSessions);
  return {
    operation: row.operation,
    sessions: row.sessions,
    blockMs: row.blockMs,
    flightMs: row.flightMs,
    takeoffs: unlessStale(row.staleRows, row.takeoffs),
    landings: unlessStale(row.staleRows, row.landings),
    fuelConsumedL: fuel,
    fuelUnknownSessions: unknownSessions(row, row.fuelKnownSessions),
    // Jak wyżej: mianownik z dni Z bilansem, nie z całej grupy.
    avgLitresPerBlockHour: over(fuel, row.fuelBlockMs / HOUR_MS),
    blockSharePct: over(row.blockMs * 100, totalBlockMs),
    regs: row.regs,
    clients: row.clients,
    staleRows: row.staleRows,
  };
}

function dropsFrom(row: AdminStatsDropsRow, clients: AdminStatsClientRow[]): AdminStatsDrops {
  // Wiersze nieprzeliczone LUB bez rodzaju operacji unieważniają CAŁĄ sekcję zrzutów:
  // częściowa suma wyniesień wyglądałaby na kompletną, a tabela klientów - na pełne
  // rozliczenie przychodu (semantyka `staleRows` - patrz `AdminStatsDropsRow`).
  if (row.staleRows > 0) {
    return {
      sessions: row.sessions,
      flightMs: row.flightMs,
      lifts: null,
      jumpers: null,
      tandem: null,
      aff: null,
      solo: null,
      liftsPerSession: null,
      jumpersPerLift: null,
      avgAltitudeFt: null,
      dropsWithAltitude: null,
      dropsWithoutAltitude: null,
      jumpersPerFlightHour: null,
      staleRows: row.staleRows,
      clients: [],
    };
  }

  const jumpers = row.tandem + row.aff + row.solo;
  return {
    sessions: row.sessions,
    flightMs: row.flightMs,
    lifts: row.lifts,
    jumpers,
    tandem: row.tandem,
    aff: row.aff,
    solo: row.solo,
    liftsPerSession: over(row.lifts, row.sessions),
    jumpersPerLift: over(jumpers, row.lifts),
    // Średnia WYŁĄCZNIE ze zrzutów z fixem - zrzut bez wysokości nie wchodzi ani do
    // sumy, ani do licznika (mockup: „7 bez wysokości nie wchodzi do średniej").
    avgAltitudeFt: over(row.altSumFt, row.altCount),
    // Oba liczniki jadą w odpowiedzi - panel nie odtwarza żadnego odejmowaniem.
    dropsWithAltitude: row.altCount,
    dropsWithoutAltitude: row.lifts - row.altCount,
    jumpersPerFlightHour: over(jumpers, row.flightMs / HOUR_MS),
    staleRows: 0,
    clients: clients.filter((client) => client.lifts > 0).map(clientItem),
  };
}

function clientItem(row: AdminStatsClientRow): AdminStatsClientItem {
  const jumpers = row.tandem + row.aff + row.solo;
  return {
    client: row.client,
    lifts: row.lifts,
    jumpers,
    tandem: row.tandem,
    aff: row.aff,
    solo: row.solo,
    avgAltitudeFt: over(row.altSumFt, row.altCount),
    jumpersPerLift: over(jumpers, row.lifts),
  };
}
