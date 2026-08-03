/**
 * UZ Aero (serwer) — zapytanie `GET /reference` (§4.6, §4.8).
 *
 * Strona ODCZYTU: migawka floty i pilotów + stan claim/przekazanie z projekcji sesji.
 * To domknięcie zaległości z audytu — cache referencyjny telefonu (§5.2) ma kolumny
 * `claim_pic`/`claim_since`/`handover` i to WŁAŚNIE stąd mają się wypełniać; bez tego
 * preflight musiałby odpytywać `/aircraft/:id/state` per samolot (N+1 na łączu w terenie).
 *
 * ETag składa się z DWÓCH znaczników: `updated_at` floty (zmienia ją administrator)
 * i znacznika sesji (przejęcia, zamknięcia dni) — bez drugiego 304 zamrażałoby claimy.
 */

import type { ReferenceAircraft } from '@uzaero/domain';

import { activeClaim, latestHandover, sessionsStamp } from '../../common/aircraftStateView.ts';
import type {
  Database,
  ReferencePort,
  ReferenceSnapshot,
  SessionRow,
  SessionsProjectionPort,
} from '../../common/ports.ts';

export interface ReferenceView {
  snapshot: ReferenceSnapshot;
  /** Słaby ETag — zmienia się wtedy i tylko wtedy, gdy zmieniły się dane. */
  etag: string;
}

export class ReferenceQueries {
  constructor(
    private readonly reference: ReferencePort,
    private readonly db: Database,
    private readonly sessions: SessionsProjectionPort,
  ) {}

  async get(): Promise<ReferenceView> {
    const snapshot = await this.reference.snapshot();

    // Sesje per samolot — jednym przebiegiem, nie zapytaniem per maszyna.
    const byAircraft = new Map<string, SessionRow[]>();
    for (const aircraft of snapshot.aircraft) {
      byAircraft.set(aircraft.id, await this.sessions.listByAircraft(this.db, aircraft.id));
    }

    const aircraft: ReferenceAircraft[] = snapshot.aircraft.map((a) => {
      const sessions = byAircraft.get(a.id) ?? [];
      const claim = activeClaim(sessions);
      return {
        ...a,
        claimPicId: claim?.picId ?? null,
        claimSince: claim?.since ?? null,
        handover: latestHandover(sessions),
      };
    });

    const refStamp = snapshot.updatedAt?.getTime() ?? 0;
    const sessStamp = sessionsStamp([...byAircraft.values()].flat());

    return {
      snapshot: { ...snapshot, aircraft },
      etag: `W/"ref-${refStamp}-${sessStamp}"`,
    };
  }
}
