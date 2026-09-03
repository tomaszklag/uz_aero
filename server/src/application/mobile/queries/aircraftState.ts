/**
 * UZ Aero (serwer) - zapytania strony odczytu (M2): stan samolotu i status synca.
 *
 * `GET /aircraft/:id/state` (§4.6) odpowiada na dwa pytania preflightu:
 * „kto teraz prowadzi ten samolot" (claim z sesji NIEZAMKNIĘTEJ) i „jakie są ostatnie
 * znane odczyty" (przekazanie z ostatniego `day_close` ALBO świeższe odczyty z dnia
 * w toku - np. tankowanie). Kształt odpowiedzi = pola `ReferenceAircraft` z domeny,
 * bo telefon wkłada ją wprost do cache referencyjnego (§4.8).
 */

import type { Handover } from '@uzaero/domain';

import { activeClaim, latestHandover } from '../../common/aircraftStateView.ts';
import {
  readingsChainNeighbours,
  type ReadingsChainNeighbours,
} from '../../../domain/readingsChain.ts';

import type {
  Database,
  EventsStorePort,
  ExportLogPort,
  FlagRecord,
  FlagsPort,
  SessionRow,
  SessionsProjectionPort,
} from '../../common/ports.ts';

export interface AircraftState {
  aircraftId: string;
  claimPicId: string | null;
  claimSince: number | null;
  handover: Handover | null;
  lastSyncAt: string | null;
}

export interface SyncStatus {
  sessionUuid: string;
  /** Ile zdarzeń sesji serwer przyjął - telefon porówna ze swoim licznikiem. */
  received: number;
  status: 'active' | 'closed' | 'voided' | 'unknown';
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
      // `null` = ta trasa nie czyta konfiguracji floty, więc nie zna stanu początkowego
      // z panelu (issue #66). Świadomie: `GET /aircraft/:id/state` jest dziś trasą
      // uśpioną - aplikacja bierze przekazanie z `/reference`, gdzie stan początkowy
      // wchodzi. Dołożenie tu portu floty byłoby zależnością dla nikogo.
      // Bez stanu początkowego i bez odczytu administratora (issue #81) - trasa uśpiona,
      // nie czyta konfiguracji floty; pierwszy lot maszyny zobaczy tu „brak danych".
      handover: latestHandover(sessions, null, null),
      lastSyncAt: (await this.events.lastReceivedAt(this.db, aircraftId))?.toISOString() ?? null,
    };
  }

  /**
   * Ciągłość odczytów wokół chwili `at` na tej maszynie (issue #62, piąta tura).
   *
   * Czyta TĘ SAMĄ listę sesji, co `aircraftState` - `listByAircraft` i tak wczytuje
   * całą historię maszyny, bo łańcuch MH potrzebuje sąsiedztwa przez lata. Nowe jest
   * wyłącznie pytanie zadane tym wierszom; SQL zostaje bez zmian.
   */
  async readingsChain(
    aircraftId: string,
    at: number,
    exceptUuid?: string,
  ): Promise<ReadingsChainNeighbours> {
    const sessions = await this.sessions.listByAircraft(this.db, aircraftId);
    return readingsChainNeighbours(sessions, at, exceptUuid);
  }

  async syncStatus(sessionUuid: string): Promise<SyncStatus> {
    const [row, received, flags, exported] = await Promise.all([
      this.sessions.get(this.db, sessionUuid),
      this.events.countForSession(this.db, sessionUuid),
      this.flags.openForSession(this.db, sessionUuid),
      // Ostatnia rewizja eksportu - na ekranie 11 staje się pudełkiem
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
