/**
 * UZ Aero — ZAPYTANIE o ŚLAD SESJI (ekran 14, miniatura na 10).
 *
 * Osobna klasa obok `SessionQueries`, bo ma inną zależność: potrzebuje `TracePort`,
 * czyli tabeli, która świadomie stoi OBOK rejestru (własna retencja, własna wysyłka,
 * nigdy przez outbox). Doklejenie tego do zapytań sesji zrobiłoby z nich klasę, która
 * czyta dwa magazyny o zupełnie różnych gwarancjach.
 *
 * ══ ŚLAD OPISUJE SESJĘ, NIE LOT (issue #38) ══
 * Do issue #38 ta klasa wycinała z zapisu okno JEDNEGO lotu, bo ekran 16 pokazywał jeden
 * lot. Zapis powstaje jednak w jednym ciągu — od uruchomienia do zatrzymania silnika —
 * więc krojenie go na loty gubiło kołowanie i przerwy między wyniesieniami, czyli
 * dokładnie ten czas, który od issue #38 wchodzi wprost do normy zużycia. Loty zostały
 * ZNACZNIKAMI na wspólnej linii.
 *
 * Ślad liczy się CAŁKOWICIE lokalnie — z zapisu na telefonie i z rejestru na telefonie.
 * Ekran 14 działa więc bez sieci w pełnym zakresie: linia, profil i log są kompletne.
 * Mapa rysuje siatkę współrzędnych i lotniska z katalogu wbudowanego w aplikację,
 * bez kafelków (decyzja 2026-08-04).
 */

import {
  applyCorrections,
  buildFlightProfile,
  buildFlightTrack,
  emptyFlightProfile,
  emptyFlightTrack,
  projectSession,
  sampleTrackLog,
  type EventOf,
  type FlightProfile,
  type FlightTrack,
  type Flight,
  type RawTrackEntry,
  type TrackPoint,
  type TrackVertex,
} from '../../domain';
import type { EventsRepo } from '../eventsRepo';
import type { TracePort } from '../ports';

/** Powód, dla którego sesja nie ma trasy — ekran tłumaczy go wprost (wariant 14B). */
export type MissingTrackReason =
  /** Sesja wpisana ręcznie: GPS nie pracował albo detekcja jej nie złapała. */
  | 'manual'
  /** Zapis wygasł (retencja 14 dni) albo nigdy nie dotarł. */
  | 'no-record';

/**
 * Punkt na trasie, który coś znaczy: start, lądowanie albo zrzut.
 *
 * `position: null` znaczy „zapis nie sięga tej chwili" — trasa bywa dziurawa (utrata
 * fixa w hangarze, wyczerpana bateria), a znacznik postawiony w najbliższym punkcie
 * kilometry dalej kłamałby na mapie. Brak znacznika jest uczciwszy niż zły znacznik.
 */
export interface SessionTrackMarker {
  kind: 'takeoff' | 'landing' | 'drop';
  /** Numer lotu (start/lądowanie) albo numer zrzutu — ten sam, co na osi czasu ekranu 10. */
  index: number;
  at: number;
  position: TrackVertex | null;
}

/** Ślad całej sesji gotowy do narysowania. */
export interface SessionTrackView {
  /** Rejestracja maszyny — podtytuł nagłówka („SP-AXA · 06 SIE · 2 loty"). */
  aircraftId: string | null;
  /**
   * Kod ICAO z preflightu. Mapa rysuje to lotnisko ZAWSZE, także gdy wypada poza kadr —
   * pilot podał je ręcznie, więc jest odpowiedzią na pytanie „gdzie to było", a nie
   * przypadkowym sąsiadem trasy. `null`, gdy preflight go nie niósł.
   */
  departureIcao: string | null;
  /** Okno zapisu = bieg silnika. `toAt: null` = silnik nadal pracuje. */
  fromAt: number;
  toAt: number | null;
  flights: Flight[];
  /** Suma zamkniętych lotów (ms) — kafelek „W powietrzu" pod mapą. */
  flightTimeMs: number;
  markers: SessionTrackMarker[];
  track: FlightTrack;
  profile: FlightProfile;
  /** Log do tabeli: próbka co 30 s plus wszystkie odrzucone. */
  log: TrackPoint[];
  /** Null = trasa jest. Wartość = nie ma czego rysować i to jest powód. */
  missing: MissingTrackReason | null;
}

/**
 * Jak daleko w czasie wolno szukać punktu trasy dla znacznika (2 min).
 *
 * Zapis idzie co kilka sekund, więc przy zdrowym śladzie każdy start trafia w punkt
 * odległy o sekundy. Dwie minuty to granica, po której „najbliższy punkt" przestaje
 * opisywać to samo miejsce — przy 90 kt to już trzy mile morskie.
 */
const MARKER_TOLERANCE_MS = 120_000;

export class FlightTrackQueries {
  constructor(
    private readonly repo: EventsRepo,
    private readonly trace: TracePort,
  ) {}

  /**
   * @returns `null`, gdy sesji nie ma w rejestrze — ekran nie ma wtedy tematu.
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
    const entries = (await this.trace.readTraceFixes(
      sessionUuid,
      fromAt,
      toAt ?? Date.now(),
    )) as unknown as RawTrackEntry[];

    // Sesja złożona z samych wpisów ręcznych NIGDY śladu nie miała; sesja z detekcją,
    // której zapis nie dotarł albo wygasł — miała. Dwa różne zdania dla pilota.
    const manualOnly =
      state.flights.length > 0 && state.flights.every((flight) => flight.method === 'manual');

    if (entries.length === 0) {
      return this.empty(state, manualOnly ? 'manual' : 'no-record', fromAt, toAt);
    }

    const track = buildFlightTrack(entries, { takeoffAt: fromAt, landingAt: toAt });

    return {
      aircraftId: state.aircraftId,
      departureIcao: state.departureIcao,
      fromAt,
      toAt,
      flights: state.flights,
      flightTimeMs: state.flightTimeMs,
      markers: buildMarkers(state, events, track.line),
      track,
      profile: buildFlightProfile(track.points),
      log: sampleTrackLog(track.points),
      // Zapis mógł istnieć, ale w całości polec na bramce jakości (lot w strefie
      // zakłóceń). Dla ekranu to ten sam stan pusty co brak zapisu — z tą różnicą,
      // że log pokazuje odrzucone wiersze i widać, CO się stało.
      missing: track.usableCount === 0 ? 'no-record' : null,
    };
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
      log: [],
      missing: reason,
    };
  }
}

/**
 * Znaczniki: każdy start, każde lądowanie i każdy zrzut sesji.
 *
 * Zrzuty czytamy ze strumienia EFEKTYWNEGO (po korektach 04c) — dokładnie tego, który
 * policzyła projekcja: zrzut unieważniony nie zaszedł i nie ma prawa stać na mapie.
 */
function buildMarkers(
  state: ReturnType<typeof projectSession>,
  events: Parameters<typeof applyCorrections>[0],
  line: readonly TrackVertex[],
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

  return markers.sort((a, b) => a.at - b.at);
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
