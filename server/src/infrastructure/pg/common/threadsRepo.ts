/**
 * Ninerdeck (serwer) - adapter wątków (`threads`, `thread_participants`; migracja 16,
 * issue #245; `docs/zlecenia.md` §7, §10.5).
 *
 * Wątek jest OGÓLNY: temat wskazuje para `subject_kind`/`subject_id`, a zlecenie jest
 * pierwszym tematem (grupy dyskusyjne #11 dołożą swój). Piszą wyłącznie UCZESTNICY;
 * czytelnicy z `reservations.manage` wiersza tu nie mają i mieć nie mogą - ich odczyt nie
 * ma prawa zapalić „Odczytane" ani zgasić nieprzeczytanych wiadomości uczestnikom (§7.1).
 */

import type { Queryable, ThreadRecord, ThreadsPort } from '../../../application/common/ports.ts';

interface ThreadDbRow {
  id: string;
  subject_kind: string;
  subject_id: string;
  created_at: string | Date;
}

interface ParticipantDbRow {
  pilot_id: string;
  last_read_at: string | Date | null;
}

export class PgThreadsRepo implements ThreadsPort {
  async byId(db: Queryable, orgId: string, id: string): Promise<ThreadRecord | null> {
    const { rows } = await db.query<ThreadDbRow>(
      'SELECT id, subject_kind, subject_id, created_at FROM threads WHERE org_id = $1 AND id = $2',
      [orgId, id],
    );
    const thread = rows[0];
    if (thread == null) return null;
    const participants = await db.query<ParticipantDbRow>(
      `SELECT pilot_id, last_read_at FROM thread_participants
        WHERE org_id = $1 AND thread_id = $2 ORDER BY pilot_id`,
      [orgId, id],
    );
    return {
      id: thread.id,
      subjectKind: thread.subject_kind,
      subjectId: thread.subject_id,
      createdAt: new Date(thread.created_at).getTime(),
      participants: participants.rows.map((p) => ({
        pilotId: p.pilot_id,
        lastReadAt: p.last_read_at == null ? null : new Date(p.last_read_at).getTime(),
      })),
    };
  }

  async create(
    tx: Queryable,
    orgId: string,
    thread: { id: string; subjectKind: string; subjectId: string; participantIds: readonly string[] },
    at: Date,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO threads (id, org_id, subject_kind, subject_id, created_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [thread.id, orgId, thread.subjectKind, thread.subjectId, at],
    );
    for (const pilotId of new Set(thread.participantIds)) {
      await tx.query(
        `INSERT INTO thread_participants (org_id, thread_id, pilot_id) VALUES ($1, $2, $3)
         ON CONFLICT (thread_id, pilot_id) DO NOTHING`,
        [orgId, thread.id, pilotId],
      );
    }
  }

  async markRead(db: Queryable, orgId: string, threadId: string, pilotId: string, at: Date): Promise<boolean> {
    const { rows } = await db.query<{ pilot_id: string }>(
      `UPDATE thread_participants SET last_read_at = $4
        WHERE org_id = $1 AND thread_id = $2 AND pilot_id = $3
        RETURNING pilot_id`,
      [orgId, threadId, pilotId, at],
    );
    return rows.length > 0;
  }
}
