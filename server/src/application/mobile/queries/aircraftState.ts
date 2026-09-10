/**
 * UZ Aero (serwer) - zapytania strony odczytu (M2): stan samolotu i status synca.
 *
 * `GET /aircraft/:id/state` (§4.6) odpowiada na dwa pytania preflightu:
 * „kto teraz prowadzi ten samolot" (claim z sesji NIEZAMKNIĘTEJ) i „jakie są ostatnie
 * znane odczyty" (przekazanie z ostatniego `day_close` ALBO świeższe odczyty z dnia
 * w toku - np. tankowanie). Kształt odpowiedzi = pola `ReferenceAircraft` z domeny,
 * bo telefon wkłada ją wprost do cache referencyjnego (§4.8).
 *
 * ══ KAŻDE PYTANIE NAZYWA KLUB (issue #99) ══
 * Klub przychodzi z tokenu telefonu. Maszyna spoza klubu jest dla pytającego
 * NIEISTNIEJĄCA (`null` → 404), a nie „pusta": odpowiedź z samymi `null`-ami mówiłaby
 * „maszyna jest, tylko nikt jej nie trzyma", czyli o cudzej maszynie coś jednak. Sesja
 * spoza klubu wygląda w `sync-status` jak nieznana - to jest dokładnie ten stan, którego
 * telefon spodziewa się po uuid-zie, którego serwer nie ma, i niczego nie zdradza.
 */

import type { Handover } from '@uzaero/domain';

import { activeClaim, latestHandover } from '../../common/aircraftStateView.ts';
import {
  readingsChainNeighbours,
  type ReadingsChainNeighbours,
} from '../../../domain/readingsChain.ts';

import type {
  AircraftConfigPort,
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
    /**
     * Rejestr floty - wyłącznie po to, żeby odróżnić „maszyna cudzego klubu" (404) od
     * „maszyna klubu bez ani jednej sesji" (200 z pustym stanem). Maszyna NIEZNANA
     * rejestrowi przechodzi jak własna: ingest przyjmuje zdarzenia takich maszyn, więc
     * ich sesje istnieją, a skopowane zapytania niżej i tak oddadzą wyłącznie te z klubu.
     */
    private readonly aircraft: AircraftConfigPort,
  ) {}

  /** `null` = maszyna należy do innego klubu - trasa odpowiada 404. */
  async aircraftState(orgId: string, aircraftId: string): Promise<AircraftState | null> {
    if (await this.foreign(orgId, aircraftId)) return null;

    const sessions = await this.sessions.listByAircraft(this.db, orgId, aircraftId);
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
      lastSyncAt:
        (await this.events.lastReceivedAt(this.db, orgId, aircraftId))?.toISOString() ?? null,
    };
  }

  /**
   * Ciągłość odczytów wokół chwili `at` na tej maszynie (issue #62, piąta tura).
   *
   * Czyta TĘ SAMĄ listę sesji, co `aircraftState` - `listByAircraft` i tak wczytuje
   * całą historię maszyny, bo łańcuch MH potrzebuje sąsiedztwa przez lata. Nowe jest
   * wyłącznie pytanie zadane tym wierszom; SQL zostaje bez zmian.
   *
   * `null` = maszyna cudzego klubu - trasa odpowiada 404, jak przy stanie.
   */
  async readingsChain(
    orgId: string,
    aircraftId: string,
    at: number,
    exceptUuid?: string,
  ): Promise<ReadingsChainNeighbours | null> {
    if (await this.foreign(orgId, aircraftId)) return null;
    const sessions = await this.sessions.listByAircraft(this.db, orgId, aircraftId);
    return readingsChainNeighbours(sessions, at, exceptUuid);
  }

  async syncStatus(orgId: string, sessionUuid: string): Promise<SyncStatus> {
    const [row, received, flags, exported] = await Promise.all([
      this.sessions.get(this.db, orgId, sessionUuid),
      this.events.countForSession(this.db, orgId, sessionUuid),
      this.flags.openForSession(this.db, orgId, sessionUuid),
      // Ostatnia rewizja eksportu - na ekranie 11 staje się pudełkiem
      // „Serwer zaktualizował arkusz" z linkiem.
      this.exportLog.latest(this.db, orgId, sessionUuid),
    ]);

    return {
      sessionUuid,
      received,
      status: row?.status ?? 'unknown',
      flags,
      exportUrl: exported?.sheetUrl ?? null,
    };
  }

  /** Maszyna ZNANA rejestrowi floty i należąca do INNEGO klubu niż pytający. */
  private async foreign(orgId: string, aircraftId: string): Promise<boolean> {
    const owner = await this.aircraft.orgIdOf(this.db, aircraftId);
    return owner != null && owner !== orgId;
  }
}
