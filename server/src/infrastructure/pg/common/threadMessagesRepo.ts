/**
 * Ninerdeck (serwer) - adapter wiadomości w wątkach (`thread_messages`; migracja 16,
 * issue #245; `docs/zlecenia.md` §7.2, §10.5).
 *
 * `id` nadaje KLIENT: powtórzony `POST` przy słabym łączu to ta sama wiadomość, nie
 * druga. Strona rozmowy idzie kursorem PARĄ `(created_at, id)`, jak skrzynka -
 * wiadomości tej samej chwili nie gubią się na granicy strony.
 */

import type {
  Queryable,
  ThreadMessageCursor,
  ThreadMessageRecord,
  ThreadMessagesPort,
} from '../../../application/common/ports.ts';

interface MessageDbRow {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string | Date;
}

const toRecord = (r: MessageDbRow): ThreadMessageRecord => ({
  id: r.id,
  threadId: r.thread_id,
  authorId: r.author_id,
  body: r.body,
  createdAt: new Date(r.created_at).getTime(),
});

export class PgThreadMessagesRepo implements ThreadMessagesPort {
  async insert(
    tx: Queryable,
    orgId: string,
    message: { id: string; threadId: string; authorId: string; body: string },
    at: Date,
  ): Promise<{ message: ThreadMessageRecord; created: boolean } | null> {
    const { rows } = await tx.query<MessageDbRow>(
      `INSERT INTO thread_messages (id, org_id, thread_id, author_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, thread_id, author_id, body, created_at`,
      [message.id, orgId, message.threadId, message.authorId, message.body, at],
    );
    if (rows[0] != null) return { message: toRecord(rows[0]), created: true };
    const existing = await tx.query<MessageDbRow>(
      `SELECT id, thread_id, author_id, body, created_at FROM thread_messages
        WHERE org_id = $1 AND id = $2`,
      [orgId, message.id],
    );
    // Uuid zajęty w INNYM klubie nie ma prawa ujawnić cudzej treści ani udawać zapisu -
    // `null` każe wołającemu odmówić zamiast potwierdzać wiadomość, której nie ma.
    const row = existing.rows[0];
    return row == null ? null : { message: toRecord(row), created: false };
  }

  async page(
    db: Queryable,
    orgId: string,
    threadId: string,
    page: { before?: ThreadMessageCursor; limit: number },
  ): Promise<ThreadMessageRecord[]> {
    const cursor = page.before;
    const { rows } = await db.query<MessageDbRow>(
      `SELECT id, thread_id, author_id, body, created_at
         FROM thread_messages
        WHERE org_id = $1 AND thread_id = $2
          ${cursor == null ? '' : 'AND (created_at, id) < ($4, $5)'}
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      cursor == null
        ? [orgId, threadId, page.limit]
        : [orgId, threadId, page.limit, new Date(cursor.createdAt), cursor.id],
    );
    return rows.map(toRecord);
  }

  async unreadFor(db: Queryable, orgId: string, threadId: string, pilotId: string): Promise<number> {
    const { rows } = await db.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count
         FROM thread_messages m
         LEFT JOIN thread_participants p
           ON p.thread_id = m.thread_id AND p.org_id = m.org_id AND p.pilot_id = $3
        WHERE m.org_id = $1 AND m.thread_id = $2 AND m.author_id <> $3
          AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)`,
      [orgId, threadId, pilotId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async lastUnreadAt(db: Queryable, orgId: string, threadId: string, pilotId: string): Promise<number | null> {
    // Ten sam zbiór, co `unreadFor` - liczba i godzina mówią o TYCH SAMYCH wiadomościach.
    const { rows } = await db.query<{ last: string | Date | null }>(
      `SELECT MAX(m.created_at) AS last
         FROM thread_messages m
         LEFT JOIN thread_participants p
           ON p.thread_id = m.thread_id AND p.org_id = m.org_id AND p.pilot_id = $3
        WHERE m.org_id = $1 AND m.thread_id = $2 AND m.author_id <> $3
          AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)`,
      [orgId, threadId, pilotId],
    );
    const last = rows[0]?.last;
    return last == null ? null : new Date(last).getTime();
  }
}
