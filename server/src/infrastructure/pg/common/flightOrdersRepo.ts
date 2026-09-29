/**
 * Ninerdeck (serwer) - adapter zleceń (`flight_orders`; migracja 16, issue #245;
 * `docs/zlecenia.md` §10.2).
 *
 * W `common/`, bo zlecenie wysyła się i prowadzi z telefonu I z panelu (§13). Termin
 * i załogę trzyma rezerwacja (`bookings.order_id`) - ten plik czyta ją WYŁĄCZNIE tam,
 * gdzie potrzebny jest porządek po terminie (listy) albo termin dla zegara (`dueOpen`).
 *
 * ══ STANY ŻYWE I KOŃCOWE ══
 * `update` zmienia wyłącznie zlecenie żywe (`open`/`filled`), a zamknięcie ma własną
 * metodę z warunkiem w SQL-u: `null` znaczy „ktoś zdążył przed nami" (drugi prowadzący
 * odwołał, zegar wygasił) - i to nie jest awaria, tylko ta sama odpowiedź.
 */

import type {
  FlightOrderDue,
  FlightOrderPatch,
  FlightOrderQuery,
  FlightOrderRecord,
  FlightOrdersPort,
  NewFlightOrder,
  Queryable,
} from '../../../application/common/ports.ts';
import type { OrderAudience } from '../../../domain/orderAddressing.ts';
import type {
  DualSeatState,
  OrderAddressing,
  OrderStatus,
  PicSeatState,
} from '../../../domain/orders.ts';

interface OrderDbRow {
  id: string;
  created_by: string;
  pic_seat: string;
  dual_seat: string;
  addressing: string;
  status: string;
  revision: number | string;
  audience_label: string;
  audience: OrderAudience | string;
  edited_at: string | Date | null;
  unfilled_warned_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  closed_at: string | Date | null;
  closed_by: string | null;
  close_reason: string | null;
}

const COLUMNS = `
  fo.id, fo.created_by, fo.pic_seat, fo.dual_seat, fo.addressing, fo.status, fo.revision,
  fo.audience_label, fo.audience, fo.edited_at, fo.unfilled_warned_at, fo.created_at,
  fo.updated_at, fo.closed_at, fo.closed_by, fo.close_reason
`;

const LIVE = `('open', 'filled')`;

const ms = (value: string | Date): number => new Date(value).getTime();
const msOrNull = (value: string | Date | null): number | null => (value == null ? null : ms(value));

const toRecord = (r: OrderDbRow): FlightOrderRecord => ({
  id: r.id,
  createdBy: r.created_by,
  seats: { pic: r.pic_seat as PicSeatState, dual: r.dual_seat as DualSeatState },
  addressing: r.addressing as OrderAddressing,
  status: r.status as OrderStatus,
  revision: Number(r.revision),
  audienceLabel: r.audience_label,
  audience: typeof r.audience === 'string' ? (JSON.parse(r.audience) as OrderAudience) : r.audience,
  editedAt: msOrNull(r.edited_at),
  unfilledWarnedAt: msOrNull(r.unfilled_warned_at),
  createdAt: ms(r.created_at),
  updatedAt: ms(r.updated_at),
  closedAt: msOrNull(r.closed_at),
  closedBy: r.closed_by,
  closeReason: r.close_reason,
});

export class PgFlightOrdersRepo implements FlightOrdersPort {
  async byId(db: Queryable, orgId: string, id: string): Promise<FlightOrderRecord | null> {
    const { rows } = await db.query<OrderDbRow>(
      `SELECT ${COLUMNS} FROM flight_orders fo WHERE fo.org_id = $1 AND fo.id = $2`,
      [orgId, id],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async lock(tx: Queryable, orgId: string, id: string): Promise<FlightOrderRecord | null> {
    const { rows } = await tx.query<OrderDbRow>(
      `SELECT ${COLUMNS} FROM flight_orders fo WHERE fo.org_id = $1 AND fo.id = $2 FOR UPDATE`,
      [orgId, id],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async insert(tx: Queryable, orgId: string, order: NewFlightOrder, at: Date): Promise<boolean> {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO flight_orders (
         id, org_id, created_by, pic_seat, dual_seat, addressing, status, audience_label,
         audience, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        order.id,
        orgId,
        order.createdBy,
        order.seats.pic,
        order.seats.dual,
        order.addressing,
        order.status,
        order.audienceLabel,
        JSON.stringify(order.audience),
        at,
      ],
    );
    return rows.length > 0;
  }

  async update(
    tx: Queryable,
    orgId: string,
    id: string,
    patch: FlightOrderPatch,
    at: Date,
  ): Promise<FlightOrderRecord | null> {
    const params: unknown[] = [orgId, id, at];
    const sets: string[] = ['updated_at = $3'];
    const set = (column: string, value: unknown, cast = ''): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}${cast}`);
    };
    if (patch.seats !== undefined) {
      set('pic_seat', patch.seats.pic);
      set('dual_seat', patch.seats.dual);
    }
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.bumpRevision === true) sets.push('revision = revision + 1');
    if (patch.audience !== undefined) set('audience', JSON.stringify(patch.audience), '::jsonb');
    if (patch.audienceLabel !== undefined) set('audience_label', patch.audienceLabel);
    if (patch.edited === true) sets.push('edited_at = $3');

    const { rows } = await tx.query<OrderDbRow>(
      `UPDATE flight_orders fo SET ${sets.join(', ')}
        WHERE fo.org_id = $1 AND fo.id = $2 AND fo.status IN ${LIVE}
        RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async close(
    tx: Queryable,
    orgId: string,
    id: string,
    change: { status: 'cancelled' | 'expired'; at: Date; by: string | null; reason: string | null },
  ): Promise<FlightOrderRecord | null> {
    const { rows } = await tx.query<OrderDbRow>(
      `UPDATE flight_orders fo
          SET status = $3, closed_at = $4, closed_by = $5, close_reason = $6, updated_at = $4
        WHERE fo.org_id = $1 AND fo.id = $2 AND fo.status IN ${LIVE}
        RETURNING ${COLUMNS}`,
      [orgId, id, change.status, change.at, change.by, change.reason],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async list(db: Queryable, orgId: string, query: FlightOrderQuery): Promise<FlightOrderRecord[]> {
    const params: unknown[] = [orgId];
    const where: string[] = ['fo.org_id = $1'];
    if (query.createdBy != null) {
      params.push(query.createdBy);
      where.push(`fo.created_by = $${params.length}`);
    }
    if (query.recipientId != null) {
      params.push(query.recipientId);
      where.push(
        `EXISTS (SELECT 1 FROM order_recipients r
                  WHERE r.order_id = fo.id AND r.org_id = fo.org_id AND r.pilot_id = $${params.length})`,
      );
    }
    params.push(query.endsAfter);
    where.push(`b.ends_at >= $${params.length}`);
    // Porządek po TERMINIE - lista odpowiada na „co najbliżej", nie „co najnowsze".
    const { rows } = await db.query<OrderDbRow>(
      `SELECT ${COLUMNS} FROM flight_orders fo
         JOIN bookings b ON b.order_id = fo.id AND b.org_id = fo.org_id
        WHERE ${where.join(' AND ')}
        ORDER BY b.starts_at, fo.id`,
      params,
    );
    return rows.map(toRecord);
  }

  async dueOpen(db: Queryable, startsBefore: Date): Promise<FlightOrderDue[]> {
    const { rows } = await db.query<{
      id: string;
      org_id: string;
      booking_id: string;
      starts_at: string | Date;
      created_at: string | Date;
      unfilled_warned_at: string | Date | null;
    }>(
      `SELECT fo.id, fo.org_id, b.id AS booking_id, b.starts_at, fo.created_at, fo.unfilled_warned_at
         FROM flight_orders fo
         JOIN bookings b ON b.order_id = fo.id AND b.org_id = fo.org_id
        WHERE fo.status = 'open' AND b.starts_at < $1
        ORDER BY b.starts_at, fo.id`,
      [startsBefore],
    );
    return rows.map((r) => ({
      orderId: r.id,
      orgId: r.org_id,
      bookingId: r.booking_id,
      startsAt: ms(r.starts_at),
      createdAt: ms(r.created_at),
      unfilledWarnedAt: msOrNull(r.unfilled_warned_at),
    }));
  }

  async markWarned(tx: Queryable, orgId: string, id: string, at: Date): Promise<boolean> {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE flight_orders fo SET unfilled_warned_at = $3
        WHERE fo.org_id = $1 AND fo.id = $2 AND fo.status = 'open' AND fo.unfilled_warned_at IS NULL
        RETURNING fo.id`,
      [orgId, id, at],
    );
    return rows.length > 0;
  }
}
