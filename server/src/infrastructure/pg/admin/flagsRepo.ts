/**
 * UZ Aero (serwer) — adapter flag dla panelu (`FlagsAdminPort`).
 *
 * Duplikat nazwy bazowej z `pg/flagsRepo.ts` jest CELOWY: rolą tego pliku jest
 * „adapter flag panelu", a kwalifikator niesie katalog. `adminFlagsRepo.ts` dałoby
 * stutter `admin/adminFlagsRepo.ts`.
 *
 * Rozdział na dwa adaptery ma tę samą przyczynę, co rozdział portów: tamten obsługuje
 * ścieżkę ingestu (`ensureOpen` w gorącej transakcji przyjęcia zdarzeń), ten cykl
 * życia flagi. Ingest przez to nie ma jak zregresować od zmian w panelu.
 */

import { isFlagType } from '@uzaero/domain';

import type {
  AdminFlag,
  AdminFlagJoin,
  FlagListFilter,
  FlagsAdminPort,
  ResolvedFlag,
} from '../../../application/admin/ports.ts';
import { EXPORT_BLOCKING_FLAG_TYPES } from '../../../application/export/dayExporter.ts';
import type { Queryable } from '../../../application/ports.ts';
import { SqlFilter } from '../sqlFilter.ts';

interface AdminFlagDbRow {
  id: number;
  type: string;
  aircraft_id: string;
  session_uuids: string[];
  details: Record<string, unknown>;
  status: string;
  created_at: string | Date;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

interface JoinedFlagDbRow extends AdminFlagDbRow {
  reg: string | null;
  aircraft_type: string | null;
}

const FLAG_COLUMNS = `f.id, f.type, f.aircraft_id, f.session_uuids, f.details, f.status,
                      f.created_at, f.resolved_at, f.resolved_by, f.resolution_note`;

const toFlag = (r: AdminFlagDbRow): AdminFlag => {
  // Ten sam strażnik i to samo uzasadnienie co w `pg/flagsRepo.ts`: od migracji 8
  // pilnuje tego CHECK w bazie, więc wartość spoza katalogu znaczy, że ktoś zdjął
  // ograniczenie albo grzebał ręcznie. CICHE pominięcie byłoby wtedy najgorszą
  // z opcji, bo flaga istnieje po to, żeby być widoczna.
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
    createdAt: new Date(r.created_at),
    resolvedAt: r.resolved_at == null ? null : new Date(r.resolved_at),
    resolvedBy: r.resolved_by,
    resolutionNote: r.resolution_note,
  };
};

export class PgAdminFlagsRepo implements FlagsAdminPort {
  /**
   * Porządek skrzynki (`A03`) siedzi w `ORDER BY`, a nie w sortowaniu w pamięci —
   * inaczej limit obcinałby listę po złej stronie porządku:
   *
   *  1. **Blokujące eksport na górze.** Lista typów jedzie PARAMETREM z
   *     `EXPORT_BLOCKING_FLAG_TYPES`, czyli z tego samego miejsca, co bramka
   *     `DayExporter` i kolumna „Skutek" DTO — dopisanie tam nowego typu przestawia
   *     skrzynkę samo, bez pamiętania o tym pliku.
   *  2. **Potem po wieku, od najstarszych.** Flaga leżąca trzeci dzień jest problemem
   *     sama w sobie, więc rośnie w górę listy, a nie spada z niej.
   *  3. `id` jako rozstrzygnięcie remisów — porządek ma być deterministyczny.
   */
  async list(
    db: Queryable,
    filter: FlagListFilter,
  ): Promise<{ items: AdminFlagJoin[]; total: number }> {
    // Dwa akumulatory z tymi samymi warunkami: strona ma `LIMIT`, licznik nie —
    // a `total` musi opisywać CAŁY wynik filtra („pokazano 50 z 127"), nie stronę.
    const conditions = this.conditionsOf(filter);
    const page = this.conditionsOf(filter);
    const blocking = page.bind([...EXPORT_BLOCKING_FLAG_TYPES]);
    const limitParam = page.bind(filter.limit);

    const { rows } = await db.query<JoinedFlagDbRow>(
      `SELECT ${FLAG_COLUMNS}, a.reg AS reg, a.type AS aircraft_type
         FROM flags f
         LEFT JOIN aircraft a ON a.id = f.aircraft_id
        ${page.where()}
        ORDER BY (f.status = 'open' AND f.type = ANY (${blocking})) DESC,
                 f.created_at ASC,
                 f.id ASC
        LIMIT ${limitParam}`,
      page.params(),
    );

    const counted = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM flags f ${conditions.where()}`,
      conditions.params(),
    );

    return {
      items: rows.map((r) => ({ flag: toFlag(r), reg: r.reg, aircraftType: r.aircraft_type })),
      total: Number(counted.rows[0]?.n ?? 0),
    };
  }

  /**
   * Warunki filtra — wszystkie OPCJONALNE, pomijane gdy nieustawione.
   *
   * Zakres dat przychodzi w epoch ms (jedna jednostka czasu w całym kontrakcie panelu),
   * a `flags.created_at` jest `TIMESTAMPTZ` — konwersję robi baza (`to_timestamp`),
   * bo jest to konwersja MIĘDZY TYPAMI KOLUMNY a parametrem, a nie arytmetyka na czasie.
   */
  private conditionsOf(filter: FlagListFilter): SqlFilter {
    return new SqlFilter()
      .addOptional('f.status = ?', filter.status)
      .addOptional('f.type = ?', filter.type)
      .addOptional('f.aircraft_id = ?', filter.aircraftId)
      .addOptional('? = ANY (f.session_uuids)', filter.sessionUuid)
      .addOptional('f.created_at >= to_timestamp(? / 1000.0)', filter.fromMs)
      .addOptional('f.created_at <= to_timestamp(? / 1000.0)', filter.toMs);
  }

  async byId(db: Queryable, id: number): Promise<AdminFlag | null> {
    const { rows } = await db.query<AdminFlagDbRow>(
      `SELECT ${FLAG_COLUMNS} FROM flags f WHERE f.id = $1`,
      [id],
    );
    const row = rows[0];
    return row == null ? null : toFlag(row);
  }

  async resolve(
    db: Queryable,
    id: number,
    by: string,
    note: string,
    at: Date,
  ): Promise<ResolvedFlag | null> {
    // Warunek `status = 'open'` siedzi W SQL-u, a nie w odczycie przed zapisem —
    // dwie osoby klikające „Rozwiąż" nie prześcigną się timingiem. Druga dostaje
    // zero wierszy, czyli `null`, i to jest cała obsługa wyścigu.
    const { rows } = await db.query<{ type: string; session_uuids: string[] }>(
      `UPDATE flags
          SET status = 'resolved', resolved_at = $4, resolved_by = $2, resolution_note = $3
        WHERE id = $1 AND status = 'open'
        RETURNING type, session_uuids`,
      [id, by, note, at],
    );

    const row = rows[0];
    if (row == null) return null;
    if (!isFlagType(row.type)) {
      throw new Error(`Nieznany typ flagi w bazie: ${row.type} (id ${id})`);
    }
    return { type: row.type, sessionUuids: row.session_uuids };
  }
}
