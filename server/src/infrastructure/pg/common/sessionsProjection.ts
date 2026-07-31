/**
 * UZ Aero (serwer) — adapter projekcji sesji (`SessionsProjectionPort`).
 *
 * `sessions` NIE jest źródłem prawdy — to zrzut `projectSession(events)`, w całości
 * odtwarzalny ze strumienia. Upsert nadpisuje wszystko poza kluczem: projekcja nie ma
 * własnej pamięci, więc nie ma czego scalać.
 *
 * Kształt wiersza i jego mapowanie mieszkają w `sessionDbRow.ts` — od przekroju 2
 * panelu czyta tę tabelę także `admin/sessionsRepo.ts`.
 */

import type { Queryable, SessionRow, SessionsProjectionPort } from '../../application/ports.ts';
import { sessionColumns, toSessionRow, type SessionDbRow } from './sessionDbRow.ts';

export class PgSessionsProjection implements SessionsProjectionPort {
  async upsert(tx: Queryable, row: SessionRow): Promise<void> {
    await tx.query(
      `INSERT INTO sessions
         (session_uuid, aircraft_id, pic_id, dual_id, status, claim_time, close_time,
          operation, client,
          mh_start, mh_end, fuel_start_l, fuel_end_l, fuel_last_l, mh_last,
          block_ms, flight_ms, flights_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
       ON CONFLICT (session_uuid) DO UPDATE SET
         aircraft_id = EXCLUDED.aircraft_id, pic_id = EXCLUDED.pic_id,
         dual_id = EXCLUDED.dual_id, status = EXCLUDED.status,
         claim_time = EXCLUDED.claim_time, close_time = EXCLUDED.close_time,
         operation = EXCLUDED.operation, client = EXCLUDED.client,
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
        row.operation,
        row.client,
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
      `SELECT ${sessionColumns('s')} FROM sessions s WHERE s.session_uuid = $1`,
      [sessionUuid],
    );
    return rows[0] ? toSessionRow(rows[0]) : null;
  }

  async listByAircraft(db: Queryable, aircraftId: string): Promise<SessionRow[]> {
    const { rows } = await db.query<SessionDbRow>(
      `SELECT ${sessionColumns('s')} FROM sessions s WHERE s.aircraft_id = $1`,
      [aircraftId],
    );
    return rows.map(toSessionRow);
  }
}
