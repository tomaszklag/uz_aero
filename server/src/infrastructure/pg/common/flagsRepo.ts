/**
 * UZ Aero (serwer) — adapter flag (`FlagsPort`).
 *
 * Flagi żyją dłużej niż dzień lotny (open → resolved u administratora) i bywają
 * przypięte do PARY sesji (nakładka po przejęciu offline) — stąd osobna tabela,
 * a nie kolumna w `sessions`.
 */

import { isFlagType, type FlagType } from '@uzaero/domain';

import type { FlagRecord, FlagsPort, Queryable } from '../../application/ports.ts';

interface FlagDbRow {
  id: number;
  type: string;
  aircraft_id: string;
  session_uuids: string[];
  details: Record<string, unknown>;
  status: string;
}

const toFlag = (r: FlagDbRow): FlagRecord => {
  // Wartość spoza katalogu jest niemożliwa: pisze tu wyłącznie `ensureOpen` (typowany
  // na `FlagType`), a od migracji 8 pilnuje tego CHECK w bazie. Jeśli mimo to wystąpi,
  // znaczy to, że ktoś zdjął ograniczenie albo grzebał ręcznie — i wtedy CICHE
  // pominięcie byłoby najgorszą z opcji, bo flaga istnieje po to, żeby być widoczna.
  if (!isFlagType(r.type)) {
    throw new Error(`Nieznany typ flagi w bazie: ${r.type} (id ${r.id})`);
  }
  return {
    id: r.id,
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
    flag: { type: FlagType; aircraftId: string; sessionUuids: string[]; details: Record<string, unknown> },
  ): Promise<void> {
    const uuids = [...flag.sessionUuids].sort();
    // Dedupe po (typ, zestaw sesji) — CELOWO obejmuje też flagi `resolved`: anomalia
    // łańcucha jest trwała (odczyty się nie zmienią), więc ponowne otwarcie po decyzji
    // administratora produkowałoby szum uczący ignorowania flag. Nowa sesja w nakładce
    // = nowy zestaw = nowa flaga. Ostatnim słowem jest UNIQUE w bazie (migracja 3) —
    // sam SELECT-then-INSERT przegrywa wyścig równoległych transakcji.
    await tx.query(
      `INSERT INTO flags (type, aircraft_id, session_uuids, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (type, session_uuids) DO NOTHING`,
      [flag.type, flag.aircraftId, uuids, JSON.stringify(flag.details)],
    );
  }

  async openForSession(db: Queryable, sessionUuid: string): Promise<FlagRecord[]> {
    const { rows } = await db.query<FlagDbRow>(
      `SELECT * FROM flags WHERE status = 'open' AND $1 = ANY(session_uuids) ORDER BY id`,
      [sessionUuid],
    );
    return rows.map(toFlag);
  }

  async openForAircraft(db: Queryable, aircraftId: string): Promise<FlagRecord[]> {
    const { rows } = await db.query<FlagDbRow>(
      `SELECT * FROM flags WHERE status = 'open' AND aircraft_id = $1 ORDER BY id`,
      [aircraftId],
    );
    return rows.map(toFlag);
  }
}
