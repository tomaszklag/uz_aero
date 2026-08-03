/**
 * UZ Aero (serwer) — adapter dziennika audytu panelu (`AdminAuditPort`).
 *
 * Jedna metoda i jeden `INSERT`. To nie jest zalążek do rozbudowy: `admin_audit` jest
 * append-only, więc `UPDATE` i `DELETE` nie mają się tu z czego wziąć — a ich BRAK
 * w adapterze jest jedną z trzech warstw tej gwarancji (obok testu architektury
 * i docelowego `GRANT INSERT, SELECT`).
 *
 * `db` przychodzi PARAMETREM, nie polem klasy: wpis musi jechać transakcją skutku,
 * który opisuje (`AuditedWrite`). Adapter z własnym uchwytem do puli otworzyłby drugie
 * połączenie i tym samym drugą transakcję — czyli dokładnie ten rozjazd, przed którym
 * cały mechanizm broni.
 */

import type { AdminAuditPort, AuditRecord } from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';

export class PgAdminAuditRepo implements AdminAuditPort {
  async append(db: Queryable, record: AuditRecord): Promise<void> {
    await db.query(
      `INSERT INTO admin_audit
         (actor_pilot_id, actor_role, action, target_type, target_id, details, ip, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.actorPilotId,
        record.actorRole,
        record.action,
        record.targetType,
        record.targetId,
        JSON.stringify(record.details),
        record.ip,
        record.createdAt,
      ],
    );
  }
}
