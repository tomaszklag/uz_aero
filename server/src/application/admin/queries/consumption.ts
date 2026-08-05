/**
 * UZ Aero (serwer) — ANALITYKA ZUŻYCIA jednego samolotu (`A10a`, `A10b`), strona odczytu.
 *
 * ══ DLACZEGO TO ZAPYTANIE CZYTA STRUMIEŃ ZDARZEŃ ══
 * Reguła §7.2 mówi: „nowa liczba w panelu = nowa kolumna projekcji, nigdy nowe wyrażenie
 * SQL". Trzyma się jej i to zapytanie — nie liczymy TU niczego SQL-em, całą arytmetykę
 * wykonuje `@uzaero/domain`. Czytamy natomiast rejestr, bo granice interwałów paliwowych
 * wyznaczają odczyty z payloadów (`preflight_confirm`, `refuel`, `day_close`), a tych
 * projekcja nie niesie i nieść nie powinna: jest ich kilka na sesję, więc nie są
 * wartością wiersza. Stawka `r_przelot` też nie należy do żadnego dnia — opisuje OKNO.
 *
 * To wyjątek NAZWANY, nie cichy: precedensy czytania strumienia poza listami są trzy
 * (`sessions.detail`, `flightTrack`, `projectionScan`), a granicy pilnują dwa testy —
 * licznik odczytów w `contract.test.ts` i reguła po ścieżce w `architecture.test.ts`.
 *
 * ══ TRZY ZAPYTANIA NA OTWARCIE EKRANU ══
 * Dni zamknięte okna → licznik dni otwartych → strumienie wszystkich tych sesji JEDNYM
 * `WHERE session_uuid = ANY(...)`. Pętla po `sessionEvents` dałaby dwieście round-tripów
 * przy oknie rocznym.
 */

import type {
  Clock,
  Database,
  EventsStorePort,
  PhaseTimelinePort,
} from '../../common/ports.ts';
import type { PhaseSegment } from '@uzaero/domain';

import type { AdminConsumptionReport } from '../contracts/consumption.ts';
import type { AdminStatsRange } from '../contracts/stats.ts';
import { consumptionReport } from '../mappers/consumptionReport.ts';
import type { ConsumptionAdminPort } from '../ports.ts';

const DAY_MS = 86_400_000;

/** Zakres domyślny analityki — trzy miesiące, jak chip „90 dni" na mockupie. */
const DEFAULT_RANGE_DAYS = 90;

/**
 * Ile dni wchodzi do JEDNEGO przebiegu analityki.
 *
 * Bezpiecznik, nie stronicowanie: przy realnej skali klubu (kilka samolotów, ~50 dni
 * lotnych na 90 dni) próg jest nieosiągalny, a chroni przed oknem „od zawsze" na bazie
 * z kilkuletnią historią. Gdy zadziała, raport MÓWI o tym (`basis.sessionsInRange`
 * większe od `basis.sessions`) — przycięta analiza udająca komplet byłaby gorsza
 * od odmowy.
 */
export const CONSUMPTION_SESSION_LIMIT = 400;

export interface ConsumptionFilter {
  fromMs?: number;
  toMs?: number;
}

export type ConsumptionOutcome =
  | { ok: true; report: AdminConsumptionReport }
  | { ok: false; reason: 'bad_range' | 'no_aircraft' };

export class AdminConsumptionQueries {
  constructor(
    private readonly db: Database,
    private readonly consumption: ConsumptionAdminPort,
    private readonly events: EventsStorePort,
    private readonly clock: Clock,
    /**
     * Osie faz pionowych; `null` = analityka pracuje na dwóch fazach (ziemia/powietrze).
     * Wstrzykiwalne, bo źródłem są PLIKI śladu, a nie baza — test bez katalogu nagrań
     * ma działać bez atrapy systemu plików.
     */
    private readonly phases: PhaseTimelinePort | null = null,
  ) {}

  async load(aircraftId: string, filter: ConsumptionFilter = {}): Promise<ConsumptionOutcome> {
    const at = this.clock.now();
    const range = rangeFrom(filter, at.getTime());
    if (range == null) return { ok: false, reason: 'bad_range' };

    const aircraft = await this.consumption.aircraft(this.db, aircraftId);
    // Jednostka spoza floty to wada ŻĄDANIA, nie pusty wynik: raport o samolocie,
    // którego nie ma, nie ma poprawnej treści (inaczej niż raport o samolocie, który
    // po prostu nie latał — ten jest legalnie pusty).
    if (aircraft == null) return { ok: false, reason: 'no_aircraft' };

    const scope = { fromMs: range.fromMs, toMs: range.toMs };
    const [page, openSessions] = await Promise.all([
      this.consumption.closedSessions(this.db, aircraftId, scope, CONSUMPTION_SESSION_LIMIT),
      this.consumption.openSessions(this.db, aircraftId, scope),
    ]);

    const sessionUuids = page.sessions.map((session) => session.sessionUuid);
    const streams = await this.events.sessionStreams(this.db, sessionUuids);

    // Osie faz pionowych ze śladów — każda z pliku pobocznego (kilkaset bajtów), więc
    // koszt jest liniowy i mały. Sesja bez nagrania oddaje pustą oś i jej interwały
    // po prostu nie dostają rozbicia lotu na fazy; ekran mówi o tym liczbą
    // `fuel.tracedIntervals`, zamiast udawać, że ślad był.
    const timelines = new Map<string, PhaseSegment[]>();
    if (this.phases != null) {
      for (const sessionUuid of sessionUuids) {
        timelines.set(sessionUuid, await this.phases.read(sessionUuid));
      }
    }

    return {
      ok: true,
      report: consumptionReport({
        at,
        range,
        aircraft,
        sessions: page.sessions,
        sessionsInRange: page.total,
        openSessions,
        streams,
        timelines,
      }),
    };
  }
}

/**
 * Zakres z filtra albo domyślny (90 dni wstecz od dziś). Granice wyrównane do dób UTC;
 * zakres odwrócony to `null`, sprawdzany PO rozstrzygnięciu domyślnych — z tego samego
 * powodu, co w statystykach: samo `?from=` z przyszłości odwraca zakres dopiero, gdy
 * serwer domknie drugą granicę własnym zegarem.
 */
function rangeFrom(filter: ConsumptionFilter, nowMs: number): AdminStatsRange | null {
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
