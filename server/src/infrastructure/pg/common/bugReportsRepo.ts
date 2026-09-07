/**
 * UZ Aero (serwer) - adapter tabeli `bug_reports` (zgłoszenia z aplikacji pilota,
 * issue #87).
 *
 * W `common/`, bo port ma dwóch czytelników po obu stronach systemu: `POST /me/bug-reports`
 * (telefon pisze) i moduł „Zgłoszenia" w panelu (administrator czyta i przestawia status).
 * Jedna tabela, jeden adapter - druga kopia zapytania to pierwsze miejsce, w którym lista
 * panelu zaczęłaby pokazywać co innego niż szuflada.
 *
 * Wiersz jest prawie append-only: dopisuje go telefon, a jedyną zmianą jest STATUS wpisany
 * przez administratora (`setStatus`). Treści zgłoszenia nie zmienia nikt - to jest cudza
 * relacja z tego, co się stało, i poprawiona przestałaby nią być.
 */

import type {
  BugReportIntake,
  BugReportRecord,
  BugReportsPort,
  NewBugReport,
  Queryable,
} from '../../../application/common/ports.ts';
import { BUG_STATUSES, bugStatusOf, isBugSeverity, type BugStatus } from '../../../domain/bugReports.ts';

interface BugDbRow {
  uuid: string;
  pilot_id: string;
  created_at: string | Date;
  received_at: string | Date;
  severity: string | null;
  description: string;
  screen: string;
  app_version: string | null;
  session_uuid: string | null;
  /** JSONB - `pg` oddaje obiekt, PGlite też; napis byłby awarią sterownika, nie stanem. */
  context: Record<string, unknown> | null;
  status: string;
  status_note: string | null;
  status_by: string | null;
  status_at: string | Date | null;
  pilot_code: string | null;
  pilot_name: string | null;
  status_by_code: string | null;
}

const toRecord = (r: BugDbRow): BugReportRecord => ({
  uuid: r.uuid,
  pilotId: r.pilot_id,
  pilotCode: r.pilot_code,
  pilotName: r.pilot_name,
  createdAt: new Date(r.created_at),
  receivedAt: new Date(r.received_at),
  // Waga spoza katalogu (starszy telefon, ręczna poprawka) schodzi do „nie podano",
  // zamiast wyciekać surowym napisem na ekran panelu.
  severity: isBugSeverity(r.severity) ? r.severity : null,
  description: r.description,
  screen: r.screen,
  appVersion: r.app_version,
  sessionUuid: r.session_uuid,
  context: r.context ?? {},
  status: bugStatusOf(r.status),
  statusNote: r.status_note,
  statusBy: r.status_by,
  statusByCode: r.status_by_code,
  statusAt: r.status_at == null ? null : new Date(r.status_at),
});

/**
 * Odczyt zawsze ze złączeniem kont: lista i szuflada panelu piszą KOD pilota, nie
 * jego identyfikator (ta sama reguła, co w aplikacji - surowy uuid z panelu nie
 * identyfikuje nikogo dla człowieka). `LEFT JOIN`, bo konto może zniknąć, a
 * zgłoszenie zostaje.
 */
const SELECT_SQL = `
  SELECT b.uuid, b.pilot_id, b.created_at, b.received_at, b.severity, b.description,
         b.screen, b.app_version, b.session_uuid, b.context, b.status,
         b.status_note, b.status_by, b.status_at,
         p.code AS pilot_code, p.name AS pilot_name, a.code AS status_by_code
    FROM bug_reports b
    LEFT JOIN pilots p ON p.id = b.pilot_id
    LEFT JOIN pilots a ON a.id = b.status_by
`;

export class PgBugReportsRepo implements BugReportsPort {
  async insertMany(
    db: Queryable,
    pilotId: string,
    reports: NewBugReport[],
  ): Promise<BugReportIntake> {
    if (reports.length === 0) return { accepted: 0, duplicates: 0 };

    let accepted = 0;
    for (const report of reports) {
      // Wiersz po wierszu, bo paczka ma z natury jedną–dwie pozycje: pilot tapie
      // „WYŚLIJ" raz, a kolejka rośnie wyłącznie wtedy, gdy telefon długo nie miał
      // zasięgu. Budowanie wielowierszowego `VALUES` kosztowałoby tu więcej uwagi
      // przy czytaniu niż oszczędza rundek do bazy.
      const { rows } = await db.query<{ uuid: string }>(
        `INSERT INTO bug_reports (uuid, pilot_id, created_at, received_at, severity,
                                  description, screen, app_version, session_uuid, context,
                                  status, status_note, status_by, status_at)
         VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, 'new', NULL, NULL, NULL)
         ON CONFLICT (uuid) DO NOTHING
         RETURNING uuid`,
        [
          report.uuid,
          pilotId,
          report.createdAt,
          report.severity,
          report.description,
          report.screen,
          report.appVersion,
          report.sessionUuid,
          JSON.stringify(report.context),
        ],
      );
      if (rows.length > 0) accepted += 1;
    }

    return { accepted, duplicates: reports.length - accepted };
  }

  async list(
    db: Queryable,
    filter: { statuses: readonly BugStatus[]; limit: number },
  ): Promise<BugReportRecord[]> {
    // Pusta lista statusów znaczy „wszystkie" - i wtedy warunku NIE MA, zamiast
    // wyliczać komplet katalogu: `status = ANY(<wszystko>)` odcięłoby wiersze
    // z wartością spoza katalogu, czyli dokładnie te, które `bugStatusOf` ma
    // przywrócić na listę roboczą.
    const filtered = filter.statuses.length > 0;
    const { rows } = await db.query<BugDbRow>(
      `${SELECT_SQL}
        ${filtered ? 'WHERE b.status = ANY($1)' : ''}
        ORDER BY b.created_at DESC, b.uuid DESC
        LIMIT ${filtered ? '$2' : '$1'}`,
      filtered ? [[...filter.statuses], filter.limit] : [filter.limit],
    );
    return rows.map(toRecord);
  }

  async byUuid(db: Queryable, uuid: string): Promise<BugReportRecord | null> {
    const { rows } = await db.query<BugDbRow>(
      `${SELECT_SQL} WHERE b.uuid = $1`,
      [uuid],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async setStatus(
    tx: Queryable,
    uuid: string,
    change: { status: BugStatus; note: string | null; by: string; at: Date },
  ): Promise<boolean> {
    const { rows } = await tx.query<{ uuid: string }>(
      `UPDATE bug_reports
          SET status = $2, status_note = $3, status_by = $4, status_at = $5
        WHERE uuid = $1
        RETURNING uuid`,
      [uuid, change.status, change.note, change.by, change.at],
    );
    return rows.length > 0;
  }

  async countByStatus(db: Queryable): Promise<Record<BugStatus, number>> {
    const { rows } = await db.query<{ status: string; n: string | number }>(
      'SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status',
    );
    // Zerami wypełniamy KOMPLET katalogu, a nie tylko trafione statusy: plakietka
    // „0" jest odpowiedzią, a brakujący klucz w mapie jest błędem odczytu u wołającego.
    const out = Object.fromEntries(BUG_STATUSES.map((s) => [s, 0])) as Record<BugStatus, number>;
    for (const row of rows) out[bugStatusOf(row.status)] += Number(row.n);
    return out;
  }
}
