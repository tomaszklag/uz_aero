/**
 * Ninerdeck (serwer) - adapter SKRZYNKI POWIADOMIEŃ (`notifications`; migracja 13,
 * issue #164, `docs/rezerwacje.md` §12.1).
 *
 * Skrzynka jest ŹRÓDŁEM PRAWDY, push tylko budzikiem: bywa niedostarczony, wyłączony
 * w ustawieniach systemu albo odrzucony na Androidzie 13+, a prośba o zgodę, która
 * przepadła, znaczy pilota czekającego na odpowiedź, która nigdy nie przyszła. Dlatego
 * kompletna i z historią jest TA tabela.
 *
 * ══ KURSOR JEST PARĄ ══
 * Powiadomienia jednej decyzji rodzą się w TEJ SAMEJ transakcji, więc mają ten sam
 * stempel co do mikrosekundy. Strona po samym `created_at` potrafiłaby zgubić wiersz
 * albo pokazać go dwa razy - stąd porządek i warunek po parze `(created_at, id)`,
 * dokładnie tak, jak indeks `idx_notifications_inbox`.
 */

import type {
  NewNotification,
  NotificationCursor,
  NotificationRecord,
  NotificationsPort,
  Queryable,
} from '../../../application/common/ports.ts';

interface NotificationDbRow {
  id: string;
  kind: string;
  /** `JSONB` - `pg` oddaje obiekt, PGlite bywa napisem. */
  payload: Record<string, unknown> | string;
  created_at: string | Date;
  read_at: string | Date | null;
}

const toRecord = (row: NotificationDbRow): NotificationRecord => ({
  id: row.id,
  kind: row.kind,
  payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  createdAt: new Date(row.created_at).getTime(),
  readAt: row.read_at == null ? null : new Date(row.read_at).getTime(),
});

export class PgNotificationsRepo implements NotificationsPort {
  async insert(
    tx: Queryable,
    orgId: string,
    rows: readonly NewNotification[],
    at: Date,
  ): Promise<void> {
    for (const row of rows) {
      await tx.query(
        `INSERT INTO notifications (id, org_id, pilot_id, kind, payload, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, orgId, row.pilotId, row.kind, JSON.stringify(row.payload), at],
      );
    }
  }

  async list(
    db: Queryable,
    orgId: string,
    pilotId: string,
    page: { before?: NotificationCursor; limit: number },
  ): Promise<NotificationRecord[]> {
    const cursor = page.before;
    const { rows } = await db.query<NotificationDbRow>(
      `SELECT id, kind, payload, created_at, read_at
         FROM notifications
        WHERE org_id = $1 AND pilot_id = $2
          ${cursor == null ? '' : 'AND (created_at, id) < ($4, $5)'}
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      cursor == null
        ? [orgId, pilotId, page.limit]
        : [orgId, pilotId, page.limit, new Date(cursor.createdAt), cursor.id],
    );
    return rows.map(toRecord);
  }

  async unreadCount(db: Queryable, orgId: string, pilotId: string): Promise<number> {
    const { rows } = await db.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM notifications
        WHERE org_id = $1 AND pilot_id = $2 AND read_at IS NULL`,
      [orgId, pilotId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async markRead(
    db: Queryable,
    orgId: string,
    pilotId: string,
    id: string,
    at: Date,
  ): Promise<boolean> {
    // `read_at IS NULL` w warunku: przeczytanie jest FAKTEM, a nie licznikiem wejść -
    // powtórzone otwarcie nie ma prawa przesuwać stempla. Wiersz już przeczytany też
    // jednak ISTNIEJE, więc odpowiedź „udało się" liczy się z osobnego odczytu, a nie
    // z liczby zmienionych wierszy.
    await db.query(
      `UPDATE notifications SET read_at = $4
        WHERE org_id = $1 AND pilot_id = $2 AND id = $3 AND read_at IS NULL`,
      [orgId, pilotId, id, at],
    );
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM notifications WHERE org_id = $1 AND pilot_id = $2 AND id = $3`,
      [orgId, pilotId, id],
    );
    return rows.length > 0;
  }
}
