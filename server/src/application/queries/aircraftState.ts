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

import { activeClaim, latestHandover } from '../aircraftStateView.ts';

import type {
  Database,
  EventsStorePort,
  ExportLogPort,
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
  /** Link do karty arkusza (§4.7); `null` mówi „jeszcze nie wyeksportowano". */
  exportUrl: string | null;
}

export class StateQueries {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly sessions: SessionsProjectionPort,
    private readonly flags: FlagsPort,
    private readonly exportLog: ExportLogPort,
  ) {}

  async aircraftState(aircraftId: string): Promise<AircraftState> {
    const sessions = await this.sessions.listByAircraft(this.db, aircraftId);
    const claim = activeClaim(sessions);

    return {
      aircraftId,
      claimPicId: claim?.picId ?? null,
      claimSince: claim?.since ?? null,
      handover: latestHandover(sessions),
      lastSyncAt: (await this.events.lastReceivedAt(this.db, aircraftId))?.toISOString() ?? null,
    };
  }

  async syncStatus(sessionUuid: string): Promise<SyncStatus> {
    const [row, received, flags, exported] = await Promise.all([
      this.sessions.get(this.db, sessionUuid),
      this.events.countForSession(this.db, sessionUuid),
      this.flags.openForSession(this.db, sessionUuid),
      // Ostatnia rewizja eksportu — na ekranie 11 staje się pudełkiem
      // „Serwer zaktualizował arkusz" z linkiem.
      this.exportLog.latest(this.db, sessionUuid),
    ]);

    return {
      sessionUuid,
      received,
      status: row?.status ?? 'unknown',
      flags,
      exportUrl: exported?.sheetUrl ?? null,
    };
  }
}
