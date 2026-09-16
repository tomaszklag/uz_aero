/**
 * Ninerdeck (serwer) - adapter flag (`FlagsPort`).
 *
 * Flagi żyją dłużej niż dzień lotny (open → resolved u administratora) i bywają
 * przypięte do PARY sesji (nakładka po przejęciu offline) - stąd osobna tabela,
 * a nie kolumna w `sessions`.
 */

import { isFlagType, type FlagType } from '@ninerdeck/domain';

import type { FlagRecord, FlagsPort, Queryable } from '../../../application/common/ports.ts';

interface FlagDbRow {
  id: number;
  org_id: string;
  type: string;
  aircraft_id: string;
  session_uuids: string[];
  details: Record<string, unknown>;
  status: string;
}

const toFlag = (r: FlagDbRow): FlagRecord => {
  // Wartość spoza katalogu jest niemożliwa: pisze tu wyłącznie `ensureOpen` (typowany
  // na `FlagType`), a pilnuje tego `flags_type_known` w bazie. Jeśli mimo to wystąpi,
  // znaczy to, że ktoś zdjął ograniczenie albo grzebał ręcznie - i wtedy CICHE
  // pominięcie byłoby najgorszą z opcji, bo flaga istnieje po to, żeby być widoczna.
  if (!isFlagType(r.type)) {
    throw new Error(`Nieznany typ flagi w bazie: ${r.type} (id ${r.id})`);
  }
  return {
    id: r.id,
    orgId: r.org_id,
    type: r.type,
    aircraftId: r.aircraft_id,
    sessionUuids: r.session_uuids,
    details: r.details,
    status: r.status === 'resolved' ? 'resolved' : 'open',
  };
};

export class PgFlagsRepo implements FlagsPort {
  async ensureOpen(
    tx: Queryable,
    flag: {
      orgId: string;
      type: FlagType;
      aircraftId: string;
      sessionUuids: string[];
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    const uuids = [...flag.sessionUuids].sort();
    // Dedupe po (typ, zestaw sesji) - CELOWO obejmuje też flagi `resolved`: anomalia
    // łańcucha jest trwała (odczyty się nie zmienią), więc ponowne otwarcie po decyzji
    // administratora produkowałoby szum uczący ignorowania flag. Nowa sesja w nakładce
    // = nowy zestaw = nowa flaga. Ostatnim słowem jest UNIQUE w bazie (`uq_flags_type_sessions`) -
    // sam SELECT-then-INSERT przegrywa wyścig równoległych transakcji.
    await tx.query(
      `INSERT INTO flags (type, aircraft_id, session_uuids, details, org_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (type, session_uuids) DO NOTHING`,
      [flag.type, flag.aircraftId, uuids, JSON.stringify(flag.details), flag.orgId],
    );
  }

  async openForSession(db: Queryable, orgId: string, sessionUuid: string): Promise<FlagRecord[]> {
    const { rows } = await db.query<FlagDbRow>(
      `SELECT * FROM flags
        WHERE org_id = $1 AND status = 'open' AND $2 = ANY(session_uuids)
        ORDER BY id`,
      [orgId, sessionUuid],
    );
    return rows.map(toFlag);
  }

  async openForAircraft(db: Queryable, orgId: string, aircraftId: string): Promise<FlagRecord[]> {
    const { rows } = await db.query<FlagDbRow>(
      `SELECT * FROM flags
        WHERE org_id = $1 AND status = 'open' AND aircraft_id = $2
        ORDER BY id`,
      [orgId, aircraftId],
    );
    return rows.map(toFlag);
  }
}
