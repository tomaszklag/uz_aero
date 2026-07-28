/**
 * UZ Aero (serwer) — zapytania strony odczytu (M2): stan samolotu i status synca.
 *
 * `GET /aircraft/:id/state` (§4.6) odpowiada na dwa pytania preflightu:
 * „kto teraz prowadzi ten samolot" (claim z sesji NIEZAMKNIĘTEJ) i „jakie są ostatnie
 * znane odczyty" (przekazanie z ostatniego `day_close` ALBO świeższe odczyty z dnia
 * w toku — np. tankowanie). Kształt odpowiedzi = pola `ReferenceAircraft` z domeny,
 * bo telefon wkłada ją wprost do cache referencyjnego (§4.8).
 */

import type { Handover } from '@uzaero/domain';

import type {
  Database,
  EventsStorePort,
  FlagRecord,
  FlagsPort,
  SessionRow,
  SessionsProjectionPort,
} from '../ports.ts';

export interface AircraftState {
  aircraftId: string;
  claimPicId: string | null;
  claimSince: number | null;
  handover: Handover | null;
  lastSyncAt: string | null;
}

export interface SyncStatus {
  sessionUuid: string;
  /** Ile zdarzeń sesji serwer przyjął — telefon porówna ze swoim licznikiem. */
  received: number;
  status: 'active' | 'closed' | 'unknown';
  flags: FlagRecord[];
  /** Link do arkusza — M4; `null` mówi „jeszcze nie wyeksportowano". */
  exportUrl: null;
}

export class StateQueries {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    private readonly flags: FlagsPort,
  ) {}

  async aircraftState(aircraftId: string): Promise<AircraftState> {
    const sessions = await this.sessions.listByAircraft(this.db, aircraftId);

    // Claim = sesja niezamknięta. Przy nakładce (dwie otwarte — §4.4) pokazujemy
    // świeższą: to ona odpowiada temu, co dzieje się przy samolocie TERAZ; sam
    // konflikt jest już oflagowany i widoczny osobno.
    const open = sessions
      .filter((s) => s.status === 'active')
      .sort((a, b) => (b.claimTime ?? 0) - (a.claimTime ?? 0));
    const claim = open[0] ?? null;

    return {
      aircraftId,
      claimPicId: claim?.picId ?? null,
      claimSince: claim?.claimTime ?? null,
      handover: latestHandover(sessions),
      lastSyncAt: (await this.events.lastReceivedAt(this.db, aircraftId))?.toISOString() ?? null,
    };
  }

  async syncStatus(sessionUuid: string): Promise<SyncStatus> {
    const [row, received, flags] = await Promise.all([
      this.sessions.get(this.db, sessionUuid),
      this.events.countForSession(this.db, sessionUuid),
      this.flags.openForSession(this.db, sessionUuid),
    ]);

    return {
      sessionUuid,
      received,
      status: row?.status ?? 'unknown',
      flags,
      exportUrl: null,
    };
  }
}

/**
 * Ostatnie znane odczyty jako przekazanie (§4.5).
 *
 * Podstawą jest ostatnia sesja ZAMKNIĘTA (day_close = świadome przekazanie), ale gdy
 * po niej trwa już kolejny dzień z nowszymi odczytami (tankowanie podbija fuel_last),
 * pokazujemy je — preflight ma podpowiadać stan FAKTYCZNY, nie historyczny.
 */
function latestHandover(sessions: SessionRow[]): Handover | null {
  const closed = sessions
    .filter((s) => s.status === 'closed' && s.mhEnd != null && s.fuelEndL != null)
    .sort((a, b) => (b.closeTime ?? 0) - (a.closeTime ?? 0));
  const base = closed[0];
  if (base == null) return null;

  const newerOpen = sessions
    .filter(
      (s) =>
        s.status === 'active' &&
        (s.claimTime ?? 0) > (base.closeTime ?? 0) &&
        s.fuelLastL != null &&
        s.mhLast != null,
    )
    .sort((a, b) => (b.claimTime ?? 0) - (a.claimTime ?? 0))[0];

  if (newerOpen != null) {
    return {
      reading: { fuelL: newerOpen.fuelLastL!, mh: newerOpen.mhLast! },
      byPilotId: newerOpen.picId,
      at: newerOpen.claimTime ?? 0,
    };
  }

  return {
    reading: { fuelL: base.fuelEndL!, mh: base.mhEnd! },
    byPilotId: base.picId,
    at: base.closeTime ?? 0,
  };
}
