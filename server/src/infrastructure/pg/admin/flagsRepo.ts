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

import type { AdminFlag, FlagsAdminPort, ResolvedFlag } from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/ports.ts';

interface AdminFlagDbRow {
  id: number;
  type: string;
  aircraft_id: string;
  session_uuids: string[];
  details: Record<string, unknown>;
  status: string;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

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
    resolvedAt: r.resolved_at == null ? null : new Date(r.resolved_at),
    resolvedBy: r.resolved_by,
    resolutionNote: r.resolution_note,
  };
};

export class PgAdminFlagsRepo implements FlagsAdminPort {
  async byId(db: Queryable, id: number): Promise<AdminFlag | null> {
    const { rows } = await db.query<AdminFlagDbRow>(
      `SELECT id, type, aircraft_id, session_uuids, details, status,
              resolved_at, resolved_by, resolution_note
         FROM flags WHERE id = $1`,
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
