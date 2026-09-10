/**
 * UZ Aero (serwer) - adapter projekcji sesji (`SessionsProjectionPort`).
 *
 * `sessions` NIE jest źródłem prawdy - to zrzut `projectSession(events)`, w całości
 * odtwarzalny ze strumienia. Upsert nadpisuje wszystko poza kluczem: projekcja nie ma
 * własnej pamięci, więc nie ma czego scalać.
 *
 * Kształt wiersza i jego mapowanie mieszkają w `sessionDbRow.ts` - od przekroju 2
 * panelu czyta tę tabelę także `admin/sessionsRepo.ts`.
 */

import type {
  Queryable,
  SessionOwner,
  SessionRow,
  SessionsProjectionPort,
} from '../../../application/common/ports.ts';
import { sessionColumns, toSessionRow, type SessionDbRow } from '../sessionDbRow.ts';

export class PgSessionsProjection implements SessionsProjectionPort {
  async upsert(tx: Queryable, row: SessionRow): Promise<void> {
    await tx.query(
      `INSERT INTO sessions
         (session_uuid, aircraft_id, pic_id, dual_id, status, claim_time, close_time,
          operation, client, notes,
          mh_start, mh_end, fuel_start_l, fuel_end_l, fuel_last_l, mh_last,
          block_ms, flight_ms, flights_count,
          takeoff_count, landing_count, mh_delta_h, fuel_consumed_l,
          drop_count, jumpers_tandem, jumpers_aff, jumpers_solo,
          drop_alt_sum_ft, drop_alt_count, oil_level_l, oil_added_l,
          engine_start_at, engine_stop_at, first_takeoff_at, last_landing_at,
          departure_icao, arrival_icao, fuel_added_l, manual_entry, oil_after_l, org_id,
          updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,
               $32,$33,$34,$35,$36,$37,$38,$39,$40,$41, now())
       ON CONFLICT (session_uuid) DO UPDATE SET
         aircraft_id = EXCLUDED.aircraft_id, pic_id = EXCLUDED.pic_id,
         org_id = EXCLUDED.org_id,
         dual_id = EXCLUDED.dual_id, status = EXCLUDED.status,
         claim_time = EXCLUDED.claim_time, close_time = EXCLUDED.close_time,
         operation = EXCLUDED.operation, client = EXCLUDED.client,
         notes = EXCLUDED.notes,
         mh_start = EXCLUDED.mh_start, mh_end = EXCLUDED.mh_end,
         fuel_start_l = EXCLUDED.fuel_start_l, fuel_end_l = EXCLUDED.fuel_end_l,
         fuel_last_l = EXCLUDED.fuel_last_l, mh_last = EXCLUDED.mh_last,
         block_ms = EXCLUDED.block_ms, flight_ms = EXCLUDED.flight_ms,
         flights_count = EXCLUDED.flights_count,
         takeoff_count = EXCLUDED.takeoff_count, landing_count = EXCLUDED.landing_count,
         mh_delta_h = EXCLUDED.mh_delta_h, fuel_consumed_l = EXCLUDED.fuel_consumed_l,
         drop_count = EXCLUDED.drop_count, jumpers_tandem = EXCLUDED.jumpers_tandem,
         jumpers_aff = EXCLUDED.jumpers_aff, jumpers_solo = EXCLUDED.jumpers_solo,
         drop_alt_sum_ft = EXCLUDED.drop_alt_sum_ft, drop_alt_count = EXCLUDED.drop_alt_count,
         oil_level_l = EXCLUDED.oil_level_l, oil_added_l = EXCLUDED.oil_added_l,
         engine_start_at = EXCLUDED.engine_start_at,
         engine_stop_at = EXCLUDED.engine_stop_at,
         first_takeoff_at = EXCLUDED.first_takeoff_at,
         last_landing_at = EXCLUDED.last_landing_at,
         departure_icao = EXCLUDED.departure_icao, arrival_icao = EXCLUDED.arrival_icao,
         fuel_added_l = EXCLUDED.fuel_added_l, manual_entry = EXCLUDED.manual_entry, oil_after_l = EXCLUDED.oil_after_l,
         updated_at = now()`,
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
        row.notes,
        row.mhStart,
        row.mhEnd,
        row.fuelStartL,
        row.fuelEndL,
        row.fuelLastL,
        row.mhLast,
        row.blockMs,
        row.flightMs,
        row.flightsCount,
        row.takeoffCount,
        row.landingCount,
        row.mhDeltaH,
        row.fuelConsumedL,
        row.dropCount,
        row.jumpersTandem,
        row.jumpersAff,
        row.jumpersSolo,
        row.dropAltSumFt,
        row.dropAltCount,
        row.oilLevelL,
        row.oilAddedL,
        row.engineStartAt,
        row.engineStopAt,
        row.firstTakeoffAt,
        row.lastLandingAt,
        row.departureIcao,
        row.arrivalIcao,
        row.fuelAddedL,
        row.manualEntry,
        row.oilAfterL,
        row.orgId,
      ],
    );
  }

  async get(db: Queryable, orgId: string, sessionUuid: string): Promise<SessionRow | null> {
    const { rows } = await db.query<SessionDbRow>(
      `SELECT ${sessionColumns('s')} FROM sessions s
        WHERE s.org_id = $1 AND s.session_uuid = $2`,
      [orgId, sessionUuid],
    );
    return rows[0] ? toSessionRow(rows[0]) : null;
  }

  /**
   * Właściciel po samym uuid-zie - JEDYNY odczyt tej tabeli bez klubu w warunku
   * (`SessionOwner` w portach mówi, dlaczego ingest go potrzebuje). Oddaje trzy kolumny,
   * nie wiersz: wołający ma rozstrzygnąć, CZYJA to sesja, a nie przeczytać jej treść.
   */
  async ownerOf(db: Queryable, sessionUuid: string): Promise<SessionOwner | null> {
    const { rows } = await db.query<{ org_id: string; pic_id: string; status: string }>(
      'SELECT org_id, pic_id, status FROM sessions WHERE session_uuid = $1',
      [sessionUuid],
    );
    const row = rows[0];
    if (row == null) return null;
    return {
      orgId: row.org_id,
      picId: row.pic_id,
      status: row.status === 'closed' ? 'closed' : row.status === 'voided' ? 'voided' : 'active',
    };
  }

  async listByAircraft(db: Queryable, orgId: string, aircraftId: string): Promise<SessionRow[]> {
    const { rows } = await db.query<SessionDbRow>(
      `SELECT ${sessionColumns('s')} FROM sessions s
        WHERE s.org_id = $1 AND s.aircraft_id = $2`,
      [orgId, aircraftId],
    );
    return rows.map(toSessionRow);
  }

  /**
   * Skład karty doby (§4.7): sesje maszyny PRZEJĘTE w oknie, chronologicznie.
   *
   * `BETWEEN` jest domknięty obustronnie, bo `utcDayRange` oddaje ostatnią milisekundę
   * doby, a nie północ następnej - inaczej sesja przejęta dokładnie o 00:00:00.000
   * wpadłaby do dwóch kart albo do żadnej, zależnie od strony ostrego nierówności.
   * Porządek `(claim_time, session_uuid)` jest treścią, nie ozdobą: karta numeruje
   * zmiany `S1`, `S2`… i dwie sesje przejęte w tej samej minucie muszą mieć stabilną
   * kolejność między rewizjami. Zapytanie schodzi po `idx_sessions_day`.
   */
  async listByAircraftDay(
    db: Queryable,
    orgId: string,
    aircraftId: string,
    range: { fromMs: number; toMs: number },
  ): Promise<SessionRow[]> {
    const { rows } = await db.query<SessionDbRow>(
      `SELECT ${sessionColumns('s')} FROM sessions s
        WHERE s.org_id = $1 AND s.aircraft_id = $2 AND s.claim_time BETWEEN $3 AND $4
        ORDER BY s.claim_time ASC, s.session_uuid ASC`,
      [orgId, aircraftId, range.fromMs, range.toMs],
    );
    return rows.map(toSessionRow);
  }

  async listByPilot(db: Queryable, orgId: string, picId: string): Promise<SessionRow[]> {
    const { rows } = await db.query<SessionDbRow>(
      `SELECT ${sessionColumns('s')} FROM sessions s WHERE s.org_id = $1 AND s.pic_id = $2`,
      [orgId, picId],
    );
    return rows.map(toSessionRow);
  }
}
