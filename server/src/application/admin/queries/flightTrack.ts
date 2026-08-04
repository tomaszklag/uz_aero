/**
 * UZ Aero (serwer) — ODCZYT śladu jednego lotu dla panelu (`A02c-slad.html`).
 *
 * Składa dwie rzeczy, które nigdzie indziej się nie spotykają:
 *  1. **rejestr** — strumień zdarzeń sesji → `projectSession` → okno lotu (`takeoffAt`,
 *     `landingAt`) już PO korektach administratora,
 *  2. **ślad** — pliki NDJSON przysłane przez telefon, czyli materiał badawczy obok
 *     rejestru.
 *
 * Kolejność jest istotna: okno bierzemy z rejestru, nie ze śladu. Gdyby administrator
 * poprawił czas startu, mapa ma pokazać lot tak, jak go dziś rozumie rejestr — inaczej
 * ekran diagnostyczny zaprzeczałby dokumentowi, który diagnozuje.
 *
 * `projectSession` wołamy RAZ, na jednym strumieniu (dziesiątki zdarzeń) — to ta sama
 * zasada co w karcie dnia (`queries/sessions.ts`) i tak samo nie dotyczy jej zakaz
 * projektowania w listach.
 */

import {
  buildFlightProfile,
  buildFlightTrack,
  emptyFlightProfile,
  projectSession,
  sampleTrackLog,
  type Flight,
  type RawTrackEntry,
} from '@uzaero/domain';

import type { Database, EventsStorePort, TraceSourcePort } from '../../common/ports.ts';
import type { AdminFlightTrack } from '../contracts/flightTrack.ts';

/**
 * Odmowa jako wariant wyniku, nie wyjątek na granicy HTTP (wzorzec `SessionListOutcome`).
 * `no_flight` i `no_session` to dwa różne 404 i panel mówi o nich innym zdaniem:
 * „nie ma takiego dnia" ≠ „ten dzień nie ma lotu o tym numerze".
 */
export type FlightTrackOutcome =
  | { ok: true; track: AdminFlightTrack }
  | { ok: false; reason: 'no_session' | 'no_flight' };

export class AdminFlightTrackQueries {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly traces: TraceSourcePort,
  ) {}

  /**
   * @param flightIndex numer lotu w dniu (1-based), jak w tabeli lotów karty dnia.
   */
  async byFlight(sessionUuid: string, flightIndex: number): Promise<FlightTrackOutcome> {
    const events = await this.events.sessionEvents(this.db, sessionUuid);
    if (events.length === 0) return { ok: false, reason: 'no_session' };

    const state = projectSession(events);
    const flight = state.flights.find((f) => f.index === flightIndex);
    if (flight == null) return { ok: false, reason: 'no_flight' };

    // Lot ręczny nie ma zapisu GPS z definicji — nie ma po co czytać plików.
    // To nie jest błąd, tylko wariant 14B: pusty ślad z wypełnionym oknem lotu.
    if (flight.method === 'manual') {
      return { ok: true, track: emptyTrack(sessionUuid, flight) };
    }

    const raw = await this.traces.read(sessionUuid);
    const entries = raw as unknown as RawTrackEntry[];

    const track = buildFlightTrack(entries, {
      takeoffAt: flight.takeoffAt,
      landingAt: flight.landingAt,
    });

    return {
      ok: true,
      track: {
        sessionUuid,
        flightIndex: flight.index,
        takeoffAt: flight.takeoffAt,
        landingAt: flight.landingAt,
        method: flight.method,
        line: track.line,
        log: sampleTrackLog(track.points),
        profile: buildFlightProfile(track.points),
        distanceNm: track.distanceNm,
        maxAltitudeFt: track.maxAltitudeFt,
        totalCount: track.totalCount,
        usableCount: track.usableCount,
      },
    };
  }
}

/** Ślad, którego nie ma — lot ręczny. Okno lotu zostaje, bo czasy SĄ prawdziwe. */
function emptyTrack(sessionUuid: string, flight: Flight): AdminFlightTrack {
  return {
    sessionUuid,
    flightIndex: flight.index,
    takeoffAt: flight.takeoffAt,
    landingAt: flight.landingAt,
    method: flight.method,
    line: [],
    log: [],
    profile: emptyFlightProfile(),
    distanceNm: 0,
    maxAltitudeFt: null,
    totalCount: 0,
    usableCount: 0,
  };
}
