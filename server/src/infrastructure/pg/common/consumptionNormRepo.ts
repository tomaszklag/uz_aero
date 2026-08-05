/**
 * UZ Aero (serwer) — adapter normy zużycia (`ConsumptionNormPort`, migracja 19).
 *
 * Tabela `aircraft_consumption` jest MATERIALIZACJĄ modelu, nie źródłem prawdy: każdy
 * jej wiersz da się odtworzyć ze strumienia zdarzeń, więc skasowanie tabeli jest
 * bezpieczne — odbuduje ją najbliższe zamknięcie dnia albo przeliczenie z panelu.
 *
 * Model jedzie jako JSONB w jednej kolumnie, bo serwer go NIE filtruje ani nie sortuje —
 * zapisuje i oddaje. Rozbicie na kolumny oznaczałoby migrację przy każdej zmianie
 * kształtu `ConsumptionNorm` (a ten urośnie o fazy pionowe).
 */

import type { ConsumptionNorm } from '@uzaero/domain';

import type { ConsumptionNormPort, Queryable } from '../../../application/common/ports.ts';

export class PgConsumptionNormRepo implements ConsumptionNormPort {
  async closedSessionUuids(
    db: Queryable,
    aircraftId: string,
    range: { fromMs: number; toMs: number },
  ): Promise<string[]> {
    // Ten sam predykat, co w analityce panelu (`consumptionRepo.ts`): do modelu wchodzą
    // wyłącznie dni ZAMKNIĘTE, bo dzień bez `day_close` nie ma odczytu końcowego.
    const { rows } = await db.query<{ session_uuid: string }>(
      `SELECT session_uuid
         FROM sessions
        WHERE aircraft_id = $1 AND status = 'closed' AND close_time BETWEEN $2 AND $3
        ORDER BY close_time DESC`,
      [aircraftId, range.fromMs, range.toMs],
    );
    return rows.map((row) => row.session_uuid);
  }

  async save(
    db: Queryable,
    aircraftId: string,
    windowDays: number,
    norm: ConsumptionNorm | null,
    computedAt: Date,
  ): Promise<void> {
    if (norm == null) {
      await db.query('DELETE FROM aircraft_consumption WHERE aircraft_id = $1', [aircraftId]);
      return;
    }

    await db.query(
      `INSERT INTO aircraft_consumption (aircraft_id, window_days, model, computed_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (aircraft_id) DO UPDATE SET
         window_days = EXCLUDED.window_days,
         model = EXCLUDED.model,
         computed_at = EXCLUDED.computed_at`,
      [aircraftId, windowDays, JSON.stringify(norm), computedAt],
    );
  }

  async all(db: Queryable): Promise<Map<string, ConsumptionNorm>> {
    const { rows } = await db.query<{ aircraft_id: string; model: ConsumptionNorm }>(
      'SELECT aircraft_id, model FROM aircraft_consumption',
    );
    return new Map(rows.map((row) => [row.aircraft_id, row.model]));
  }

  async latestComputedAt(db: Queryable): Promise<Date | null> {
    const { rows } = await db.query<{ last: string | null }>(
      'SELECT MAX(computed_at) AS last FROM aircraft_consumption',
    );
    return rows[0]?.last != null ? new Date(rows[0].last) : null;
  }
}
