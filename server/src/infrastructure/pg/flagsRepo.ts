/**
 * UZ Aero (serwer) — adapter flag (`FlagsPort`).
 *
 * Flagi żyją dłużej niż dzień lotny (open → resolved u administratora) i bywają
 * przypięte do PARY sesji (nakładka po przejęciu offline) — stąd osobna tabela,
 * a nie kolumna w `sessions`.
 */

import type { FlagRecord, FlagsPort, Queryable } from '../../application/ports.ts';

interface FlagDbRow {
  id: number;
  type: string;
  aircraft_id: string;
  session_uuids: string[];
  details: Record<string, unknown>;
  status: string;
}

const toFlag = (r: FlagDbRow): FlagRecord => ({
  id: r.id,
  type: r.type,
  aircraftId: r.aircraft_id,
  sessionUuids: r.session_uuids,
  details: r.details,
  status: r.status === 'resolved' ? 'resolved' : 'open',
});

export class PgFlagsRepo implements FlagsPort {
  async ensureOpen(
    tx: Queryable,
    flag: { type: string; aircraftId: string; sessionUuids: string[]; details: Record<string, unknown> },
  ): Promise<void> {
    const uuids = [...flag.sessionUuids].sort();
    // Dedupe po (typ, zestaw sesji): ponowny sync tych samych danych nie mnoży flag,
    // a rozwiązana flaga NIE odżywa — jeśli anomalia trwa, admin już o niej wie.
    const { rows } = await tx.query<{ id: number }>(
      `SELECT id FROM flags WHERE type = $1 AND session_uuids = $2`,
      [flag.type, uuids],
    );
    if (rows.length > 0) return;

    await tx.query(
      `INSERT INTO flags (type, aircraft_id, session_uuids, details)
       VALUES ($1, $2, $3, $4)`,
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
