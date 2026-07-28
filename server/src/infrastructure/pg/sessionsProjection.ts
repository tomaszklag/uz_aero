/**
 * UZ Aero (serwer) — adapter projekcji sesji (`SessionsProjectionPort`).
 *
 * `sessions` NIE jest źródłem prawdy — to zrzut `projectSession(events)`, w całości
 * odtwarzalny ze strumienia. Upsert nadpisuje wszystko poza kluczem: projekcja nie ma
 * własnej pamięci, więc nie ma czego scalać.
 */

import type { Queryable, SessionRow, SessionsProjectionPort } from '../../application/ports.ts';

interface SessionDbRow {
  session_uuid: string;
  aircraft_id: string;
  pic_id: string;
  dual_id: string | null;
  status: string;
  claim_time: string | null;
  close_time: string | null;
  mh_start: number | null;
  mh_end: number | null;
  fuel_start_l: number | null;
  fuel_end_l: number | null;
  fuel_last_l: number | null;
  mh_last: number | null;
  block_ms: string;
  flight_ms: string;
  flights_count: number;
}

const toSession = (r: SessionDbRow): SessionRow => ({
  sessionUuid: r.session_uuid,
  aircraftId: r.aircraft_id,
  picId: r.pic_id,
  dualId: r.dual_id,
  status: r.status === 'closed' ? 'closed' : 'active',
  claimTime: r.claim_time != null ? Number(r.claim_time) : null,
  closeTime: r.close_time != null ? Number(r.close_time) : null,
  mhStart: r.mh_start,
  mhEnd: r.mh_end,
  fuelStartL: r.fuel_start_l,
  fuelEndL: r.fuel_end_l,
  fuelLastL: r.fuel_last_l,
  mhLast: r.mh_last,
  blockMs: Number(r.block_ms),
  flightMs: Number(r.flight_ms),
  flightsCount: r.flights_count,
});

export class PgSessionsProjection implements SessionsProjectionPort {
  async upsert(tx: Queryable, row: SessionRow): Promise<void> {
    await tx.query(
      `INSERT INTO sessions
         (session_uuid, aircraft_id, pic_id, dual_id, status, claim_time, close_time,
          mh_start, mh_end, fuel_start_l, fuel_end_l, fuel_last_l, mh_last,
          block_ms, flight_ms, flights_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
       ON CONFLICT (session_uuid) DO UPDATE SET
         aircraft_id = EXCLUDED.aircraft_id, pic_id = EXCLUDED.pic_id,
         dual_id = EXCLUDED.dual_id, status = EXCLUDED.status,
         claim_time = EXCLUDED.claim_time, close_time = EXCLUDED.close_time,
         mh_start = EXCLUDED.mh_start, mh_end = EXCLUDED.mh_end,
         fuel_start_l = EXCLUDED.fuel_start_l, fuel_end_l = EXCLUDED.fuel_end_l,
         fuel_last_l = EXCLUDED.fuel_last_l, mh_last = EXCLUDED.mh_last,
         block_ms = EXCLUDED.block_ms, flight_ms = EXCLUDED.flight_ms,
         flights_count = EXCLUDED.flights_count, updated_at = now()`,
      [
        row.sessionUuid,
        row.aircraftId,
        row.picId,
        row.dualId,
        row.status,
        row.claimTime,
        row.closeTime,
        row.mhStart,
        row.mhEnd,
        row.fuelStartL,
        row.fuelEndL,
        row.fuelLastL,
        row.mhLast,
        row.blockMs,
        row.flightMs,
        row.flightsCount,
      ],
    );
  }

  async get(db: Queryable, sessionUuid: string): Promise<SessionRow | null> {
    const { rows } = await db.query<SessionDbRow>(
      'SELECT * FROM sessions WHERE session_uuid = $1',
      [sessionUuid],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async listByAircraft(db: Queryable, aircraftId: string): Promise<SessionRow[]> {
    const { rows } = await db.query<SessionDbRow>(
      'SELECT * FROM sessions WHERE aircraft_id = $1',
      [aircraftId],
    );
    return rows.map(toSession);
  }
}
