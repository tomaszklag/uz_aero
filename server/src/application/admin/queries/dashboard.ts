/**
 * UZ Aero (serwer) — PULPIT (`A01`, `A01a`).
 *
 * ══ TA KLASA NICZEGO NIE LICZY PO SWOJEMU ══
 * Pulpit jest ekranem-skrótem: każda jego liczba pochodzi z zapytania, które obsługuje
 * ekran docelowy, i wraca w kontrakcie tamtego ekranu. „Flagi otwarte" to `total` ze
 * skrzynki `A03`, „Dni otwarte" to `total` z listy dni `A02` zawężonej `status=active`,
 * stan kart to `AdminExportCounts` z monitora `A05`, wiersz floty to
 * `AdminAircraftListItem` z `A07`. Kafel jest przejściem, więc jego liczba MUSI być
 * obietnicą „tyle wierszy tam zobaczysz" — a jedynym sposobem, żeby nią była, jest
 * policzenie jej tym samym kodem.
 *
 * Konsekwencja praktyczna: ta klasa ma pięciu współpracowników i prawie żadnej własnej
 * logiki. To jest cel, nie przypadek.
 *
 * ══ JEDYNE MIEJSCE, GDZIE PULPIT CZYTA STRUMIEŃ ══
 * Stan silnika („W locie" / „Na ziemi") nie stoi w żadnej kolumnie — projekcja
 * `sessions` go nie niesie. `A02` i `A07` z tego powodu plakietkę POMIJAŁY i było to
 * słuszne: obie listy są nieograniczone, więc odczyt strumienia na wiersz to N pełnych
 * strumieni na stronę.
 *
 * Tutaj zbiór jest inny i to zmienia rachunek: czytamy strumienie WYŁĄCZNIE tych
 * jednostek, które mają OTWARTĄ sesję. Górna granica to liczba samolotów w rejestrze
 * (klub ma kilka), a strumień jednej sesji to jeden dzień pracy — kilkadziesiąt zdarzeń,
 * niezależnie od tego, ile lat ma rejestr. Zapytanie NIE degraduje się z historią;
 * degraduje się z liczbą samolotów latających jednocześnie, a ta jest ograniczona
 * wielkością floty.
 *
 * Gdyby kiedyś flota urosła do rozmiaru, przy którym to boli, właściwym ruchem jest
 * kolumna stanu silnika w projekcji (jedna liczba dopisywana przy ingescie), a NIE
 * rezygnacja z plakietki — bo pytanie „co ten samolot teraz robi" jest jedynym pytaniem
 * tego ekranu.
 */

import { CORRECTION_WINDOW_MS, projectSession } from '@uzaero/domain';

import type { Clock, Database, EventsStorePort } from '../../common/ports.ts';
import type {
  AdminDashboard,
  AdminDashboardAircraft,
  AdminDayTotals,
} from '../contracts/dashboard.ts';
import type { AdminAircraftListItem } from '../contracts/fleet.ts';
import { exportListItem } from '../mappers/exportListItem.ts';
import { engineState } from '../mappers/engineState.ts';
import { flagListItem } from '../mappers/flagListItem.ts';
import { recentEvent } from '../mappers/recentEvent.ts';
import { sessionListItem } from '../mappers/sessionListItem.ts';
import type {
  DashboardAdminPort,
  ExportsAdminPort,
  FlagsAdminPort,
  PilotsAdminPort,
  SessionsAdminPort,
} from '../ports.ts';
import type { AdminFleetQueries } from './fleet.ts';

/**
 * Ile pozycji trafia do kolejki „Wymaga uwagi" z KAŻDEGO z trzech źródeł.
 *
 * Mockup pokazuje pięć wierszy razem, a pulpit ma kierować ruch, nie zastępować
 * skrzynki — pełne listy są pod kaflami i to one mówią, ile spraw jest naprawdę
 * (`counts`). Limit per źródło, a nie na całość, bo inaczej dwadzieścia flag zepchnęłoby
 * z ekranu jedyny nieudany eksport.
 */
const ATTENTION_PER_SOURCE = 5;

/** Ile zdarzeń pokazuje karta „Ostatnio przyjęte" — tyle, ile wierszy ma mockup. */
const RECENT_EVENTS = 6;

/** Okno wykresu „Napływ zdarzeń" i jego podziałka — 12 h w słupkach godzinnych (A01). */
const INFLOW_WINDOW_MS = 12 * 60 * 60 * 1000;
const INFLOW_BUCKET_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export class AdminDashboardQueries {
  constructor(
    private readonly db: Database,
    /**
     * Flota jedzie przez ZAPYTANIE ekranu `A07`, a nie przez własny adapter. To ono
     * zna regułę wyboru claimu i przekazania (`application/common/aircraftStateView.ts`)
     * oraz rozwiązuje próg flagi funkcją domeny. Drugie wyliczenie tych rzeczy na
     * pulpicie dałoby dwie odpowiedzi na pytanie „kto trzyma ten samolot".
     */
    private readonly fleet: AdminFleetQueries,
    private readonly sessions: SessionsAdminPort,
    private readonly flags: FlagsAdminPort,
    private readonly exports: ExportsAdminPort,
    private readonly dashboard: DashboardAdminPort,
    /** Strumień otwartej sesji — WYŁĄCZNIE do stanu silnika (patrz nagłówek pliku). */
    private readonly events: EventsStorePort,
    /** Nazwisko drugiego pilota dnia; po `byId`, bo dotyczy najwyżej kilku kont. */
    private readonly pilots: PilotsAdminPort,
    private readonly clock: Clock,
  ) {}

  async load(): Promise<AdminDashboard> {
    const now = this.clock.now();
    const nowMs = now.getTime();

    const [fleetPage, openDays, staleOpenDays, flagPage, exportPage, inflow, recent] =
      await Promise.all([
        this.fleet.list({}),
        // Sam LICZNIK dni otwartych: `limit: 1`, liczy się wyłącznie `total`. To jest
        // dokładnie to samo pytanie, co chip „Otwarte" na `A02` — i ta sama trasa.
        this.sessions.list(this.db, { status: 'active', direction: 'desc', limit: 1 }),
        // Dni otwarte DŁUŻEJ niż okno korekty, od najstarszego. Próg jest tu jedynym
        // miejscem, w którym pulpit rozstrzyga, co jest zadaniem, a co normalną pracą.
        this.sessions.list(this.db, {
          status: 'active',
          toMs: nowMs - CORRECTION_WINDOW_MS,
          direction: 'asc',
          limit: ATTENTION_PER_SOURCE,
        }),
        this.flags.list(this.db, { status: 'open', limit: ATTENTION_PER_SOURCE }),
        // Jedno zapytanie, dwie odpowiedzi: `items` zawężone do kart, których NIE MA
        // (awaria eksportu), a `counts` policzone nad całym zakresem NIEZALEŻNIE od
        // zawężenia stanem — tak stanowi kontrakt monitora.
        this.exports.list(this.db, { state: 'missing', limit: ATTENTION_PER_SOURCE }),
        this.dashboard.inflow(this.db, {
          fromMs: nowMs - INFLOW_WINDOW_MS,
          toMs: nowMs,
          bucketMs: INFLOW_BUCKET_MS,
        }),
        this.dashboard.recent(this.db, RECENT_EVENTS),
      ]);

    const todayStart = startOfUtcDay(nowMs);
    const lastFlyingStart = await this.dashboard.lastFlyingDayStart(this.db);

    const [today, lastFlyingDay] = await Promise.all([
      this.dayTotals(todayStart),
      lastFlyingStart == null ? Promise.resolve(null) : this.dayTotals(startOfUtcDay(lastFlyingStart)),
    ]);

    return {
      at: now.toISOString(),
      correctionWindowMs: CORRECTION_WINDOW_MS,
      counts: {
        aircraftTotal: fleetPage.counts.total,
        aircraftActive: fleetPage.counts.active,
        aircraftClaimed: fleetPage.counts.claimed,
        // `list` oddaje `null` wyłącznie przy nieczytelnym KURSORZE, a tu go nie ma —
        // więc gałąź jest nieosiągalna. Zero byłoby jednak twierdzeniem o świecie,
        // dlatego przy braku odpowiedzi wolimy jawny błąd niż cichy licznik.
        openDays: openDays?.total ?? notCounted('dni otwarte'),
        openFlags: flagPage.total,
        exports: exportPage.counts,
      },
      fleet: await this.withEngine(fleetPage.items),
      attention: {
        flags: flagPage.items.map(flagListItem),
        failedExports: exportPage.items.map(exportListItem),
        staleOpenDays: (staleOpenDays?.items ?? []).map(sessionListItem),
      },
      inflow: {
        fromMs: nowMs - INFLOW_WINDOW_MS,
        toMs: nowMs,
        bucketMs: INFLOW_BUCKET_MS,
        buckets: fillBuckets(inflow, INFLOW_WINDOW_MS / INFLOW_BUCKET_MS),
      },
      recent: recent.map(recentEvent),
      today,
      lastFlyingDay,
    };
  }

  /** Sumy jednej doby UTC, zaczynającej się o `dayStartMs`. */
  private async dayTotals(dayStartMs: number): Promise<AdminDayTotals> {
    const toMs = dayStartMs + DAY_MS - 1;
    const row = await this.dashboard.dayTotals(this.db, { fromMs: dayStartMs, toMs });
    return {
      day: new Date(dayStartMs).toISOString().slice(0, 10),
      fromMs: dayStartMs,
      toMs,
      ...row,
    };
  }

  /**
   * Dokłada stan silnika jednostkom z OTWARTĄ sesją.
   *
   * Pętla, a nie `Promise.all`: strumień na jednostkę to jedno zapytanie plus jedna
   * projekcja, a jednostek z otwartym dniem jest w klubie kilka. Równoległość kupiłaby
   * milisekundy kosztem N jednoczesnych połączeń — ta sama decyzja, co w `withState`
   * zapytania floty.
   */
  private async withEngine(
    items: readonly AdminAircraftListItem[],
  ): Promise<AdminDashboardAircraft[]> {
    const out: AdminDashboardAircraft[] = [];

    for (const aircraft of items) {
      if (aircraft.claim == null) {
        out.push({ aircraft, engine: null });
        continue;
      }

      const stream = await this.events.sessionEvents(this.db, aircraft.claim.sessionUuid);
      const state = projectSession(stream);
      // Nazwisko duala czytamy TYLKO wtedy, gdy dzień faktycznie jest szkolny —
      // większość dni ma `dualId: null`, więc to zwykle zero dodatkowych zapytań.
      const dual = state.dualId == null ? null : await this.pilots.byId(this.db, state.dualId);

      out.push({
        aircraft,
        engine: engineState(aircraft.claim.sessionUuid, state, dual?.name ?? null),
      });
    }

    return out;
  }
}

/** Północ UTC doby, w której leży `ms`. */
function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Wiadra z `GROUP BY` (tylko niepuste) → pełna tablica długości `count`.
 *
 * Dopełnienie zerami zachodzi TUTAJ, a nie w SQL-u, i to jest jedyne miejsce w całym
 * pulpicie, w którym zero jest wartością POPRAWNĄ: „w tej godzinie nic nie przyszło"
 * to fakt o rejestrze, a nie brak wiedzy. Wykres bez tego dopełnienia miałby dziury
 * nie do narysowania.
 */
function fillBuckets(rows: readonly { bucket: number; count: number }[], count: number): number[] {
  const out = new Array<number>(count).fill(0);
  for (const row of rows) {
    if (row.bucket >= 0 && row.bucket < count) out[row.bucket] = row.count;
  }
  return out;
}

/**
 * Licznik, którego nie da się policzyć, jest AWARIĄ, a nie zerem.
 *
 * „0 otwartych flag" przy nieudanym pobraniu to najgorszy możliwy komunikat w narzędziu
 * nadzoru: wygląda jak dobra wiadomość. Wolimy 500 i baner „nie udało się pobrać
 * pulpitu" — panel umie go pokazać, a administrator wie wtedy, że nic nie wie.
 */
function notCounted(what: string): never {
  throw new Error(`pulpit: nie udało się policzyć — ${what}`);
}
