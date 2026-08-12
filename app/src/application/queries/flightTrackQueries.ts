/**
 * UZ Aero — ZAPYTANIE o ślad lotu (ekran 14).
 *
 * Osobna klasa obok `SessionQueries`, bo ma inną zależność: potrzebuje `TracePort`,
 * czyli tabeli, która świadomie stoi OBOK rejestru (własna retencja, własna wysyłka,
 * nigdy przez outbox). Doklejenie tego do zapytań sesji zrobiłoby z nich klasę, która
 * czyta dwa magazyny o zupełnie różnych gwarancjach.
 *
 * Ślad liczy się CAŁKOWICIE lokalnie — z zapisu na telefonie i z rejestru na telefonie.
 * Ekran 14 działa więc bez sieci w pełnym zakresie: linia, profil i log są kompletne.
 * Ekran nie potrzebuje sieci w ogóle: mapa rysuje siatkę współrzędnych i lotniska
 * z katalogu wbudowanego w aplikację, bez kafelków (decyzja 2026-08-04).
 */

import {
  buildFlightProfile,
  buildFlightTrack,
  emptyFlightProfile,
  emptyFlightTrack,
  projectSession,
  sampleTrackLog,
  type FlightProfile,
  type FlightTrack,
  type Flight,
  type RawTrackEntry,
  type TrackPoint,
} from '../../domain';
import type { EventsRepo } from '../eventsRepo';
import type { TracePort } from '../ports';

/** Powód, dla którego lot nie ma trasy — ekran tłumaczy go wprost (wariant 14B). */
export type MissingTrackReason =
  /** Lot wpisany ręcznie: GPS nie pracował albo detekcja go nie złapała. */
  | 'manual'
  /** Zapis wygasł (retencja 14 dni) albo nigdy nie dotarł. */
  | 'no-record';

/** Ślad jednego lotu gotowy do narysowania. */
export interface FlightTrackView {
  flight: Flight;
  /** Rejestracja maszyny — podtytuł nagłówka (mockup 14: „Lot 3 · 06 SIE · SP-KLM"). */
  aircraftId: string | null;
  /**
   * Kod ICAO z preflightu. Mapa rysuje to lotnisko ZAWSZE, także gdy wypada poza kadr —
   * pilot podał je ręcznie, więc jest odpowiedzią na pytanie „gdzie to było", a nie
   * przypadkowym sąsiadem trasy. `null`, gdy preflight go nie niósł.
   */
  departureIcao: string | null;
  track: FlightTrack;
  profile: FlightProfile;
  /** Log do tabeli: próbka co 30 s plus wszystkie odrzucone. */
  log: TrackPoint[];
  /** Null = trasa jest. Wartość = nie ma czego rysować i to jest powód. */
  missing: MissingTrackReason | null;
}

export class FlightTrackQueries {
  constructor(
    private readonly repo: EventsRepo,
    private readonly trace: TracePort,
  ) {}

  /**
   * @param flightIndex numer lotu w dniu (1-based), jak w tabeli lotów ekranu 10.
   * @returns `null`, gdy sesja nie ma lotu o tym numerze — ekran nie ma wtedy tematu.
   */
  async byFlight(sessionUuid: string, flightIndex: number): Promise<FlightTrackView | null> {
    const state = projectSession(await this.repo.getSessionEvents(sessionUuid));
    const flight = state.flights.find((f) => f.index === flightIndex);
    if (flight == null) return null;

    if (flight.method === 'manual') {
      return this.empty(flight, 'manual', state.aircraftId, state.departureIcao);
    }

    // Lot otwarty (jeszcze w powietrzu) nie ma górnej granicy — bierzemy do teraz.
    const until = flight.landingAt ?? Date.now();
    const entries = (await this.trace.readTraceFixes(
      sessionUuid,
      flight.takeoffAt,
      until,
    )) as unknown as RawTrackEntry[];

    if (entries.length === 0) {
      return this.empty(flight, 'no-record', state.aircraftId, state.departureIcao);
    }

    const track = buildFlightTrack(entries, {
      takeoffAt: flight.takeoffAt,
      landingAt: flight.landingAt,
    });

    return {
      flight,
      aircraftId: state.aircraftId,
      departureIcao: state.departureIcao,
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
    flight: Flight,
    reason: MissingTrackReason,
    aircraftId: string | null,
    departureIcao: string | null,
  ): FlightTrackView {
    return {
      flight,
      aircraftId,
      departureIcao,
      track: emptyFlightTrack(),
      profile: emptyFlightProfile(),
      log: [],
      missing: reason,
    };
  }
}
