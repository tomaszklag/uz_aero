/**
 * UZ Aero (serwer) — adapter dziennika eksportu (`ExportLogPort`).
 *
 * `day` idzie w obie strony jako NAPIS `YYYY-MM-DD`: przy zapisie Postgres sam
 * rzutuje na DATE, przy odczycie bierzemy `day::text`. Sterowniki (pg, PGlite)
 * parsują DATE do JS `Date` o PÓŁNOCY LOKALNEJ — `toISOString()` na takiej dacie
 * cofa dzień w każdej strefie na wschód od Greenwich, czyli dokładnie u nas.
 * Tekst z bazy nie ma czego przekręcić.
 */

import type { ExportLogPort, ExportRecord, Queryable } from '../../../application/common/ports.ts';

interface ExportLogDbRow {
  session_uuid: string;
  day: string;
  aircraft_id: string;
  sheet_url: string;
  revision: number;
  exported_at: string | Date;
}

export class PgExportLogRepo implements ExportLogPort {
  /**
   * Klucz advisory jest PRZESTRZENIĄ NAZW plus identyfikator (`export_log:<uuid>`),
   * dokładnie jak `aircraft:<id>` przy flocie. `hashtext` zwęża napis do `int4`, więc
   * kolizja dwóch różnych sesji jest możliwa i nieszkodliwa: kosztuje szeregowanie
   * dwóch eksportów, które i tak trwają milisekundy. Prefiks jest tu po to, żeby taka
   * kolizja nie mogła zajść MIĘDZY dziedzinami — blokada dziennika i blokada samolotu
   * o tym samym haszu zatrzymywałyby się nawzajem bez żadnego powodu.
   */
  async lock(tx: Queryable, sessionUuid: string): Promise<void> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`export_log:${sessionUuid}`]);
  }

  async latest(db: Queryable, sessionUuid: string): Promise<ExportRecord | null> {
    const { rows } = await db.query<ExportLogDbRow>(
      `SELECT session_uuid, day::text AS day, aircraft_id, sheet_url, revision, exported_at
       FROM export_log WHERE session_uuid = $1
       ORDER BY revision DESC, id DESC LIMIT 1`,
      [sessionUuid],
    );
    const r = rows[0];
    if (r == null) return null;
    return {
      sessionUuid: r.session_uuid,
      day: r.day,
      aircraftId: r.aircraft_id,
      sheetUrl: r.sheet_url,
      revision: r.revision,
      exportedAt: new Date(r.exported_at),
    };
  }

  async append(db: Queryable, record: ExportRecord): Promise<void> {
    await db.query(
      `INSERT INTO export_log (session_uuid, day, aircraft_id, sheet_url, revision, exported_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        record.sessionUuid,
        record.day,
        record.aircraftId,
        record.sheetUrl,
        record.revision,
        record.exportedAt,
      ],
    );
  }
}
