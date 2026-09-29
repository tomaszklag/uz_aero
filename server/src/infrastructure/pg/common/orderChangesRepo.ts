/**
 * Ninerdeck (serwer) - adapter historii zmian zlecenia (`order_changes`; migracja 16,
 * issue #245; `docs/zlecenia.md` §10.3).
 *
 * Append-only, w transakcji zmiany, o której mówi - zamiast dziennika akcji (pkt 40).
 * Z tych wpisów karta adresata pisze „Edytowane 15:10 · maszyna SP-AXA → SP-KLM" bez
 * nazwiska, a prowadzący widzą, KTO: przy prowadzeniu przez wielu naraz (pkt 20) to jest
 * jedyna odpowiedź na „kto przestawił termin".
 */

import type {
  NewOrderChange,
  OrderChangeRecord,
  OrderChangesPort,
  Queryable,
} from '../../../application/common/ports.ts';

interface ChangeDbRow {
  id: string;
  actor_id: string | null;
  kind: string;
  payload: Record<string, unknown> | string;
  created_at: string | Date;
}

export class PgOrderChangesRepo implements OrderChangesPort {
  async insert(
    tx: Queryable,
    orgId: string,
    orderId: string,
    changes: readonly NewOrderChange[],
    at: Date,
  ): Promise<void> {
    for (const change of changes) {
      await tx.query(
        `INSERT INTO order_changes (id, org_id, order_id, actor_id, kind, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (id) DO NOTHING`,
        [change.id, orgId, orderId, change.actorId, change.kind, JSON.stringify(change.payload), at],
      );
    }
  }

  async listFor(db: Queryable, orgId: string, orderId: string): Promise<OrderChangeRecord[]> {
    const { rows } = await db.query<ChangeDbRow>(
      `SELECT id, actor_id, kind, payload, created_at FROM order_changes
        WHERE org_id = $1 AND order_id = $2
        ORDER BY created_at, id`,
      [orgId, orderId],
    );
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      kind: r.kind,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      createdAt: new Date(r.created_at).getTime(),
    }));
  }
}
