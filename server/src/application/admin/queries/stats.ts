/**
 * UZ Aero (serwer) — STATYSTYKI floty i pilotów (`A10`), strona odczytu.
 *
 * Jedno zapytanie → trzy ujęcia naraz (per samolot / pilot / operacja) plus szereg
 * dzienny i strona przychodowa. Celowo JEDNA odpowiedź, nie pięć tras: mockup
 * przełącza ujęcia w miejscu, bo to TEN SAM zbiór dni policzony w trzech przekrojach
 * i sumy muszą się zgadzać między ujęciami — pięć osobnych żądań dałoby pięć różnych
 * chwil bazy i rozjazd, którego nikt by nie umiał wyjaśnić.
 *
 * ══ ZAKRES DOMYŚLNY: OSTATNIE 30 DNI KALENDARZOWYCH ══
 * Mockup podpisuje kafel „30 dni kalendarzowych" i taki jest domyślny zakres, liczony
 * od DZIŚ zegara serwera. Domyślny liczy SERWER, nie panel — panel bez parametrów
 * w adresie nie ma prawa sam rozstrzygać, co znaczy „ostatnie 30 dni", bo „dziś"
 * to pytanie o zegar, a zegar panelu jest trzecim, niesprawdzonym zegarem w równaniu
 * (ten sam argument, co przy `DashboardDto.at`). Odpowiedź niesie użyty zakres
 * i `defaulted`, żeby ekran wiedział, co pokazuje.
 */

import type { Clock, Database } from '../../common/ports.ts';
import type { AdminStatsRange, AdminStatsReport } from '../contracts/stats.ts';
import { statsReport } from '../mappers/statsReport.ts';
import type { StatsAdminPort } from '../ports.ts';

const DAY_MS = 86_400_000;
/** „Ostatnie 30 dni kalendarzowych" — dzień dzisiejszy plus 29 wstecz. */
const DEFAULT_RANGE_DAYS = 30;

/** Filtr trasy: północ dnia `from` i KONIEC doby `to` (domknięcie robi `dayRange.ts`). */
export interface StatsFilter {
  fromMs?: number;
  toMs?: number;
}

/** `bad_range` = zakres odwrócony PO rozstrzygnięciu domyślnych — trasa oddaje 400. */
export type StatsLoadOutcome =
  | { ok: true; report: AdminStatsReport }
  | { ok: false; reason: 'bad_range' };

export class AdminStatsQueries {
  constructor(
    private readonly db: Database,
    private readonly stats: StatsAdminPort,
    private readonly clock: Clock,
  ) {}

  async load(filter: StatsFilter = {}): Promise<StatsLoadOutcome> {
    const at = this.clock.now();
    const range = rangeFrom(filter, at.getTime());
    if (range == null) return { ok: false, reason: 'bad_range' };
    const scope = { fromMs: range.fromMs, toMs: range.toMs };

    const [totals, openSessions, daily, aircraft, pilots, operations, drops, clients] =
      await Promise.all([
        this.stats.totals(this.db, scope),
        this.stats.openSessions(this.db, scope),
        this.stats.daily(this.db, scope),
        this.stats.byAircraft(this.db, scope),
        this.stats.byPilot(this.db, scope),
        this.stats.byOperation(this.db, scope),
        this.stats.drops(this.db, scope),
        this.stats.dropsByClient(this.db, scope),
      ]);

    return {
      ok: true,
      report: statsReport({
        at,
        range,
        totals,
        openSessions,
        daily,
        aircraft,
        pilots,
        operations,
        drops,
        clients,
      }),
    };
  }
}

/**
 * Zakres z filtra ALBO domyślny. Granice zawsze wyrównane do dób UTC: `fromMs` to
 * północ, `toMs` — ostatnia milisekunda doby (obustronne domknięcie, jak wszędzie
 * w panelu — „od 25 do 31" nie ma prawa zgubić 31-go).
 *
 * Zakres ODWRÓCONY to `null` — i sprawdzamy go TUTAJ, po rozstrzygnięciu domyślnych,
 * a nie w trasie: samo `?from=` z przyszłości bez `to` odwraca zakres dopiero wtedy,
 * gdy serwer domknie `to` na końcu dzisiejszej doby. Guard w trasie widzi tylko parę
 * jawnych parametrów i taki wariant przepuszczał jako 200 z ujemnym `calendarDays`.
 */
function rangeFrom(filter: StatsFilter, nowMs: number): AdminStatsRange | null {
  const todayStart = startOfUtcDay(nowMs);
  const defaulted = filter.fromMs == null && filter.toMs == null;

  const toMs = filter.toMs ?? todayStart + DAY_MS - 1;
  const toDayStart = startOfUtcDay(toMs);
  const fromMs = filter.fromMs ?? toDayStart - (DEFAULT_RANGE_DAYS - 1) * DAY_MS;

  if (fromMs > toMs) return null;

  return {
    fromDay: new Date(fromMs).toISOString().slice(0, 10),
    toDay: new Date(toDayStart).toISOString().slice(0, 10),
    fromMs,
    toMs,
    calendarDays: Math.round((toMs + 1 - fromMs) / DAY_MS),
    defaulted,
  };
}

const startOfUtcDay = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;
