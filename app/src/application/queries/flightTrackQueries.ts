/**
 * UZ Aero - ZAPYTANIE o ŚLAD SESJI (ekran 14, miniatura na 10).
 *
 * ══ ŚLAD OPISUJE SESJĘ, NIE LOT (issue #38) ══
 * Zapis GPS powstaje w jednym ciągu - od uruchomienia do zatrzymania silnika - więc
 * krojenie go na loty gubiło kołowanie i przerwy między wyniesieniami, czyli dokładnie
 * ten czas, który wchodzi wprost do normy zużycia. Loty są ZNACZNIKAMI na wspólnej linii.
 *
 * ══ GEOMETRIA Z SERWERA, RESZTA Z REJESTRU (issue #47) ══
 * Do issue #47 wszystko liczyło się z zapisu na telefonie, a nagranie znikało po 14 dniach
 * - bo tyle wytrzymywała pamięć urządzenia, nie dlatego, że traciło wartość. Odtąd telefon
 * nagranie ODDAJE i kasuje, a ekran pobiera gotową geometrię (`SessionTrackSource`).
 *
 * Podział jest ostry i to on trzyma offline-first przy życiu:
 *  • **z sieci** - linia, profil, log punktów, statystyki (`SessionTrackPayload`),
 *  • **z lokalnego rejestru** - rejestracja maszyny, lotnisko, okno biegu silnika, lista
 *    lotów, czas w powietrzu i CZASY wszystkich znaczników (§6 pkt 1).
 * Dlatego wariant bez zasięgu (14C) nadal pokazuje komplet czasów: brakuje mu rysunku,
 * nie wiedzy. I dlatego znaczniki są tu, a nie w kopercie serwera - ich czasy pochodzą
 * z rejestru PO korektach, a pozycję dobiera się do nich z pobranej linii.
 */

import {
  applyCorrections,
  emptyFlightProfile,
  emptyFlightTrack,
  emptySessionTrackPayload,
  emptyTrackStats,
  projectSession,
  type EventOf,
  type FlightProfile,
  type FlightTrack,
  type Flight,
  type TrackStats,
  type TrackVertex,
} from '../../domain';
import type { EventsRepo } from '../eventsRepo';
import type { TracePort } from '../ports';
import type { SessionTrackSource } from '../sync/sessionTrackFetch';

/** Powód, dla którego sesja nie ma trasy - ekran tłumaczy go wprost (14B / 14C). */
export type MissingTrackReason =
  /** Sesja wpisana ręcznie: GPS nie pracował albo detekcja jej nie złapała. */
  | 'manual'
  /** Serwer nagrania nie ma i sam z siebie mieć nie będzie (14B). */
  | 'no-record'
  /** Nagranie CZEKA W KOLEJCE na tym telefonie - pójdzie przy najbliższej okazji. */
  | 'pending-upload'
  /** Ślad jest na serwerze, brakuje drogi do niego (14C - jedyny stan wymagający sieci). */
  | 'offline';

/**
 * Punkt na trasie, który coś znaczy: start, lądowanie, zrzut albo szczyt.
 *
 * `position: null` znaczy „zapis nie sięga tej chwili" - trasa bywa dziurawa (utrata
 * fixa w hangarze, wyczerpana bateria), a znacznik postawiony w najbliższym punkcie
 * kilometry dalej kłamałby na mapie. Brak znacznika jest uczciwszy niż zły znacznik.
 */
export interface SessionTrackMarker {
  kind: 'takeoff' | 'landing' | 'drop' | 'peak';
  /** Numer lotu (start/lądowanie) albo numer zrzutu; szczyt numeru nie ma (0). */
  index: number;
  at: number;
  position: TrackVertex | null;
  /** Wysokość - niesie ją WYŁĄCZNIE szczyt, bo tylko on jest o niej (issue #47 pkt 2). */
  altitudeFt?: number | null;
  /**
   * Maksimum wypadło w tej samej chwili co ten znacznik, więc dopisuje się do JEGO
   * podpisu zamiast stawiać drugi punkt w tym samym miejscu (mockup 14, reguła 2 min).
   */
  alsoPeak?: boolean;
}

/** Ślad całej sesji gotowy do narysowania. */
export interface SessionTrackView {
  /** Rejestracja maszyny - podtytuł nagłówka („SP-AXA · 06 SIE · 2 loty"). */
  aircraftId: string | null;
  /**
   * Kod ICAO z preflightu. Mapa rysuje to lotnisko ZAWSZE, także gdy wypada poza kadr -
   * pilot podał je ręcznie, więc jest odpowiedzią na pytanie „gdzie to było", a nie
   * przypadkowym sąsiadem trasy. `null`, gdy preflight go nie niósł.
   */
  departureIcao: string | null;
  /** Okno zapisu = bieg silnika. `toAt: null` = silnik nadal pracuje. */
  fromAt: number;
  toAt: number | null;
  flights: Flight[];
  /** Suma zamkniętych lotów (ms) - kafelek „W powietrzu" pod mapą. */
  flightTimeMs: number;
  markers: SessionTrackMarker[];
  track: FlightTrack;
  profile: FlightProfile;
  /** Statystyki lotu (issue #47 pkt 3) - każdy blok gaśnie osobno. */
  stats: TrackStats;
  /** Null = trasa jest. Wartość = nie ma czego rysować i to jest powód. */
  missing: MissingTrackReason | null;
}

/**
 * Jak daleko w czasie wolno szukać punktu trasy dla znacznika (2 min).
 *
 * Zapis idzie co kilka sekund, więc przy zdrowym śladzie każdy start trafia w punkt
 * odległy o sekundy. Dwie minuty to granica, po której „najbliższy punkt" przestaje
 * opisywać to samo miejsce - przy 90 kt to już trzy mile morskie.
 */
const MARKER_TOLERANCE_MS = 120_000;

/**
 * Jak blisko innego znacznika maksimum przestaje być osobnym punktem (2 min).
 *
 * W dniu skokowym szczyt wypada w chwili zrzutu prawie zawsze. Dwa znaczniki na jednym
 * punkcie to dwa podpisy zachodzące na siebie, więc bliskie maksimum dopisuje się do
 * sąsiada jako „MAX", a osobnym punktem zostaje dopiero wtedy, gdy wypadło samo.
 */
const PEAK_MERGE_MS = 120_000;

export class FlightTrackQueries {
  constructor(
    private readonly repo: EventsRepo,
    private readonly trace: TracePort,
    private readonly source: SessionTrackSource,
  ) {}

  /**
   * @returns `null`, gdy sesji nie ma w rejestrze - ekran nie ma wtedy tematu.
   */
  async bySession(sessionUuid: string): Promise<SessionTrackView | null> {
    const events = await this.repo.getSessionEvents(sessionUuid);
    if (events.length === 0) return null;

    const state = projectSession(events);
    const leg = state.legs[0] ?? null;

    // Sesja bez pracy silnika (09C) nie ma czego rysować i nie jest to awaria zapisu:
    // maszyna stała. Ekran mówi to jednym zdaniem zamiast pustej mapy.
    if (leg == null) {
      return this.empty(state, 'no-record', null, null);
    }

    const fromAt = leg.startedAt;
    const toAt = leg.stoppedAt;

    const outcome = await this.source.fetch(sessionUuid);

    if (outcome.kind === 'unreachable') {
      return this.empty(state, 'offline', fromAt, toAt);
    }

    const payload =
      outcome.kind === 'track' ? outcome.payload : emptySessionTrackPayload(sessionUuid);

    if (payload.usableCount === 0) {
      // Sesja złożona z samych wpisów ręcznych NIGDY śladu nie miała; sesja z detekcją,
      // której nagranie jeszcze nie doleciało - miała i doleci. Trzy różne zdania.
      const manualOnly =
        state.flights.length > 0 && state.flights.every((flight) => flight.method === 'manual');
      const pending = await this.pending(sessionUuid, fromAt, toAt);

      const reason: MissingTrackReason = manualOnly
        ? 'manual'
        : pending > 0
          ? 'pending-upload'
          : 'no-record';

      return this.empty(state, reason, fromAt, toAt);
    }

    const track: FlightTrack = {
      // Punktów SUROWYCH telefon już nie ma i nie potrzebuje: log przychodzi gotowy,
      // a wszystko, co liczyło się z pełnej listy, policzył serwer.
      points: [],
      line: payload.line,
      distanceNm: payload.distanceNm,
      maxAltitudeFt: payload.maxAltitudeFt,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      totalCount: payload.totalCount,
      usableCount: payload.usableCount,
    };

    return {
      aircraftId: state.aircraftId,
      departureIcao: state.departureIcao,
      fromAt,
      toAt,
      flights: state.flights,
      flightTimeMs: state.flightTimeMs,
      markers: buildMarkers(state, events, payload.line, payload.profile),
      track,
      profile: payload.profile,
      stats: payload.stats,
      missing: null,
    };
  }

  /** Ile wierszy nagrania tej sesji leży jeszcze na telefonie (czyli nie poszło). */
  private async pending(sessionUuid: string, fromAt: number, toAt: number | null): Promise<number> {
    // Po issue #47 wysłane wiersze są kasowane, więc cokolwiek zostało - czeka.
    const rows = await this.trace.readTraceFixes(sessionUuid, fromAt, toAt ?? Date.now());
    return rows.length;
  }

  private empty(
    state: ReturnType<typeof projectSession>,
    reason: MissingTrackReason,
    fromAt: number | null,
    toAt: number | null,
  ): SessionTrackView {
    return {
      aircraftId: state.aircraftId,
      departureIcao: state.departureIcao,
      fromAt: fromAt ?? state.claimedAt ?? 0,
      toAt: toAt ?? state.closedAt,
      flights: state.flights,
      flightTimeMs: state.flightTimeMs,
      markers: [],
      track: emptyFlightTrack(),
      profile: emptyFlightProfile(),
      stats: emptyTrackStats(),
      missing: reason,
    };
  }
}

/**
 * Znaczniki: każdy start, każde lądowanie, każdy zrzut i SZCZYT lotu (issue #47 pkt 2).
 *
 * Czasy startów i lądowań pochodzą z projekcji, a zrzuty ze strumienia EFEKTYWNEGO
 * (po korektach) - zrzut unieważniony nie zaszedł i nie ma prawa stać na mapie.
 * Szczyt jest jedynym znacznikiem liczonym z NAGRANIA, bo tylko ono wie, kiedy
 * samolot był najwyżej.
 */
function buildMarkers(
  state: ReturnType<typeof projectSession>,
  events: Parameters<typeof applyCorrections>[0],
  line: readonly TrackVertex[],
  profile: FlightProfile,
): SessionTrackMarker[] {
  const markers: SessionTrackMarker[] = [];

  for (const flight of state.flights) {
    markers.push({
      kind: 'takeoff',
      index: flight.index,
      at: flight.takeoffAt,
      position: vertexAt(line, flight.takeoffAt),
    });
    if (flight.landingAt != null) {
      markers.push({
        kind: 'landing',
        index: flight.index,
        at: flight.landingAt,
        position: vertexAt(line, flight.landingAt),
      });
    }
  }

  for (const event of applyCorrections(events)) {
    if (event.type !== 'drop') continue;
    const drop = event as EventOf<'drop'>;
    const at = drop.gpsTime ?? drop.deviceTime;
    markers.push({
      kind: 'drop',
      index: drop.payload.dropNumber,
      at,
      position: vertexAt(line, at),
    });
  }

  markers.sort((a, b) => a.at - b.at);
  return withPeak(markers, line, profile);
}

/**
 * Dokłada szczyt: osobnym znacznikiem, gdy wypadł sam, a dopiskiem do sąsiada, gdy
 * wypadł razem z nim. Bez tej reguły dzień skokowy rysowałby „ZRZUT 1" i „MAX" jedno
 * na drugim, bo w skokach szczyt JEST zrzutem.
 */
function withPeak(
  markers: SessionTrackMarker[],
  line: readonly TrackVertex[],
  profile: FlightProfile,
): SessionTrackMarker[] {
  if (profile.peakAt == null || profile.peakAltitudeFt == null) return markers;

  const neighbour = markers.find((marker) => Math.abs(marker.at - profile.peakAt!) <= PEAK_MERGE_MS);
  if (neighbour != null) {
    neighbour.alsoPeak = true;
    neighbour.altitudeFt = profile.peakAltitudeFt;
    return markers;
  }

  const peak: SessionTrackMarker = {
    kind: 'peak',
    index: 0,
    at: profile.peakAt,
    position: vertexAt(line, profile.peakAt),
    altitudeFt: profile.peakAltitudeFt,
  };

  return [...markers, peak].sort((a, b) => a.at - b.at);
}

/** Punkt trasy najbliższy danej chwili; `null`, gdy zapis tej chwili nie obejmuje. */
function vertexAt(line: readonly TrackVertex[], at: number): TrackVertex | null {
  let best: TrackVertex | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const vertex of line) {
    const distance = Math.abs(vertex.time - at);
    if (distance < bestDistance) {
      best = vertex;
      bestDistance = distance;
    }
  }

  return bestDistance <= MARKER_TOLERANCE_MS ? best : null;
}
