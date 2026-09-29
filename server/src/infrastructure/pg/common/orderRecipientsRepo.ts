/**
 * Ninerdeck (serwer) - adapter adresatów zlecenia (`order_recipients`; migracja 16,
 * issue #245; `docs/zlecenia.md` §6.2, §8, §10.2).
 *
 * ══ WIERSZ ADRESATA JEST ZAPISEM, NIE STANEM DO SPRZĄTANIA ══
 * Odebranie zlecenia stempluje `removed_at` (pkt 29), a dopisanie osoby, która już ma
 * wiersz, NIE przywraca go - dzięki temu „Wyślij ponownie" nie odda zlecenia komuś,
 * komu je odebrano. Odpowiedź z poprzedniej wersji zostaje w wierszu jako zapis
 * („Nie może · poprzedni termin"); o tym, czy się liczy, rozstrzyga porównanie
 * `answered_revision` z wersją zlecenia po stronie wołającego.
 */

import type {
  OrderRecipientRecord,
  OrderRecipientsPort,
  Queryable,
} from '../../../application/common/ports.ts';
import type { PlannedRecipient } from '../../../domain/orderAddressing.ts';
import type { OrderAnswer, Seat } from '../../../domain/orders.ts';

interface RecipientDbRow {
  order_id: string;
  pilot_id: string;
  seat: string | null;
  named_seat: string | null;
  direct: boolean;
  via_group_id: string | null;
  seen_at: string | Date | null;
  seen_revision: number | string | null;
  last_seen_at: string | Date | null;
  answer: string | null;
  answer_reason: string | null;
  answered_at: string | Date | null;
  answered_revision: number | string | null;
  thread_id: string | null;
  removed_at: string | Date | null;
  removed_by: string | null;
}

const COLUMNS = `
  order_id, pilot_id, seat, named_seat, direct, via_group_id, seen_at, seen_revision,
  last_seen_at, answer, answer_reason, answered_at, answered_revision, thread_id,
  removed_at, removed_by
`;

const msOrNull = (value: string | Date | null): number | null => (value == null ? null : new Date(value).getTime());
const numOrNull = (value: number | string | null): number | null => (value == null ? null : Number(value));

const toRecord = (r: RecipientDbRow): OrderRecipientRecord => ({
  pilotId: r.pilot_id,
  seat: r.seat as Seat | null,
  namedSeat: r.named_seat as Seat | null,
  direct: r.direct,
  viaGroupId: r.via_group_id,
  seenAt: msOrNull(r.seen_at),
  seenRevision: numOrNull(r.seen_revision),
  lastSeenAt: msOrNull(r.last_seen_at),
  answer: r.answer as OrderAnswer | null,
  answerReason: r.answer_reason,
  answeredAt: msOrNull(r.answered_at),
  answeredRevision: numOrNull(r.answered_revision),
  threadId: r.thread_id,
  removedAt: msOrNull(r.removed_at),
  removedBy: r.removed_by,
});

export class PgOrderRecipientsRepo implements OrderRecipientsPort {
  async listFor(db: Queryable, orgId: string, orderId: string): Promise<OrderRecipientRecord[]> {
    const { rows } = await db.query<RecipientDbRow>(
      `SELECT ${COLUMNS} FROM order_recipients WHERE org_id = $1 AND order_id = $2 ORDER BY pilot_id`,
      [orgId, orderId],
    );
    return rows.map(toRecord);
  }

  async listForOrders(
    db: Queryable,
    orgId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, OrderRecipientRecord[]>> {
    const out = new Map<string, OrderRecipientRecord[]>();
    if (orderIds.length === 0) return out;
    const { rows } = await db.query<RecipientDbRow>(
      `SELECT ${COLUMNS} FROM order_recipients
        WHERE org_id = $1 AND order_id = ANY($2::text[])
        ORDER BY order_id, pilot_id`,
      [orgId, [...orderIds]],
    );
    for (const row of rows) {
      const list = out.get(row.order_id) ?? [];
      list.push(toRecord(row));
      out.set(row.order_id, list);
    }
    return out;
  }

  async insertMany(
    tx: Queryable,
    orgId: string,
    orderId: string,
    rows: readonly PlannedRecipient[],
  ): Promise<string[]> {
    const inserted: string[] = [];
    for (const row of rows) {
      const { rows: done } = await tx.query<{ pilot_id: string }>(
        `INSERT INTO order_recipients (org_id, order_id, pilot_id, seat, named_seat, direct, via_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (order_id, pilot_id) DO NOTHING
         RETURNING pilot_id`,
        [orgId, orderId, row.pilotId, row.seat, row.namedSeat, row.direct, row.viaGroupId],
      );
      if (done[0] != null) inserted.push(done[0].pilot_id);
    }
    return inserted;
  }

  async updatePlan(
    tx: Queryable,
    orgId: string,
    orderId: string,
    rows: readonly PlannedRecipient[],
  ): Promise<void> {
    for (const row of rows) {
      await tx.query(
        `UPDATE order_recipients
            SET seat = $4, named_seat = $5, direct = $6, via_group_id = $7
          WHERE org_id = $1 AND order_id = $2 AND pilot_id = $3 AND removed_at IS NULL`,
        [orgId, orderId, row.pilotId, row.seat, row.namedSeat, row.direct, row.viaGroupId],
      );
    }
  }

  async answer(
    tx: Queryable,
    orgId: string,
    orderId: string,
    pilotId: string,
    answer: { answer: OrderAnswer; reason: string | null; revision: number },
    at: Date,
  ): Promise<boolean> {
    const { rows } = await tx.query<{ pilot_id: string }>(
      `UPDATE order_recipients
          SET answer = $4, answer_reason = $5, answered_at = $6, answered_revision = $7
        WHERE org_id = $1 AND order_id = $2 AND pilot_id = $3 AND removed_at IS NULL
        RETURNING pilot_id`,
      [orgId, orderId, pilotId, answer.answer, answer.reason, at, answer.revision],
    );
    return rows.length > 0;
  }

  async seen(
    db: Queryable,
    orgId: string,
    orderId: string,
    pilotId: string,
    revision: number,
    at: Date,
  ): Promise<boolean> {
    // `seen_at` zostaje przy PIERWSZYM otwarciu w wersji - „Odczytane 14:02" mówi, kiedy
    // adresat zobaczył TEN termin; `last_seen_at` idzie za każdym otwarciem, bo z niego
    // liczy się „zmiana nieodczytana" po edycji innej niż termin (§8).
    const { rows } = await db.query<{ pilot_id: string }>(
      `UPDATE order_recipients
          SET seen_at = CASE WHEN seen_revision = $4 THEN seen_at ELSE $5 END,
              seen_revision = $4,
              last_seen_at = $5
        WHERE org_id = $1 AND order_id = $2 AND pilot_id = $3 AND removed_at IS NULL
        RETURNING pilot_id`,
      [orgId, orderId, pilotId, revision, at],
    );
    return rows.length > 0;
  }

  async remove(
    tx: Queryable,
    orgId: string,
    orderId: string,
    pilotId: string,
    by: string,
    at: Date,
  ): Promise<boolean> {
    const { rows } = await tx.query<{ pilot_id: string }>(
      `UPDATE order_recipients SET removed_at = $5, removed_by = $4
        WHERE org_id = $1 AND order_id = $2 AND pilot_id = $3 AND removed_at IS NULL
        RETURNING pilot_id`,
      [orgId, orderId, pilotId, by, at],
    );
    return rows.length > 0;
  }

  async attachThread(
    tx: Queryable,
    orgId: string,
    orderId: string,
    pilotId: string,
    threadId: string,
  ): Promise<void> {
    await tx.query(
      `UPDATE order_recipients SET thread_id = $4
        WHERE org_id = $1 AND order_id = $2 AND pilot_id = $3 AND thread_id IS NULL`,
      [orgId, orderId, pilotId, threadId],
    );
  }
}
