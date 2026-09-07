/**
 * UZ Aero (serwer) - adapter tabeli `aircraft_readings` (odczyty wpisane ręką
 * administratora, issue #81).
 *
 * W `common/`, bo port ma dwóch czytelników po obu stronach systemu: `GET /reference`
 * (telefon) i kartę samolotu w panelu. Pisze wyłącznie komenda panelu - w transakcji
 * śladu audytu, więc `insert` bierze `tx` z zewnątrz.
 *
 * Tabela jest APPEND-ONLY: nie ma tu `UPDATE` ani `DELETE`. Każdy wpis zostaje z autorem,
 * chwilą i komentarzem - jak korekta w rejestrze zdarzeń.
 */

import type {
  AdminReading,
  AircraftReadingsPort,
  Queryable,
} from '../../../application/common/ports.ts';

interface ReadingDbRow {
  aircraft_id: string;
  /** `DOUBLE PRECISION` - PGlite bywa napisem; `Number` domyka oba sterowniki. */
  mh: string | number;
  fuel_l: string | number;
  oil_l: string | number | null;
  note: string;
  by_pilot_id: string;
  created_at: string | Date;
}

const toReading = (r: ReadingDbRow): AdminReading => ({
  mh: Number(r.mh),
  fuelL: Number(r.fuel_l),
  oilL: r.oil_l == null ? null : Number(r.oil_l),
  note: r.note,
  byPilotId: r.by_pilot_id,
  at: new Date(r.created_at).getTime(),
});

/**
 * Ostatni wpis per maszyna. `DISTINCT ON` po `aircraft_id` w porządku indeksu
 * `idx_aircraft_readings_latest` - jedno przejście dla całej floty.
 */
const LATEST_SQL = `
  SELECT DISTINCT ON (aircraft_id)
         aircraft_id, mh, fuel_l, oil_l, note, by_pilot_id, created_at
    FROM aircraft_readings
`;

export class PgAircraftReadingsRepo implements AircraftReadingsPort {
  async latest(db: Queryable, aircraftId: string): Promise<AdminReading | null> {
    const { rows } = await db.query<ReadingDbRow>(
      `${LATEST_SQL} WHERE aircraft_id = $1 ORDER BY aircraft_id, created_at DESC, id DESC`,
      [aircraftId],
    );
    return rows[0] == null ? null : toReading(rows[0]);
  }

  async latestAll(db: Queryable): Promise<Map<string, AdminReading>> {
    const { rows } = await db.query<ReadingDbRow>(
      `${LATEST_SQL} ORDER BY aircraft_id, created_at DESC, id DESC`,
    );
    return new Map(rows.map((r) => [r.aircraft_id, toReading(r)]));
  }

  async latestAt(db: Queryable): Promise<Date | null> {
    const { rows } = await db.query<{ at: string | Date | null }>(
      'SELECT MAX(created_at) AS at FROM aircraft_readings',
    );
    const at = rows[0]?.at;
    return at == null ? null : new Date(at);
  }

  async insert(tx: Queryable, aircraftId: string, reading: AdminReading): Promise<void> {
    await tx.query(
      `INSERT INTO aircraft_readings (aircraft_id, mh, fuel_l, oil_l, note, by_pilot_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        aircraftId,
        reading.mh,
        reading.fuelL,
        reading.oilL,
        reading.note,
        reading.byPilotId,
        new Date(reading.at),
      ],
    );
  }
}
