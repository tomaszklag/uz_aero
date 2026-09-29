/**
 * Ninerdeck (serwer) - członkowie klubu w przekroju zleceń i grup (4.0.0, issue #245).
 *
 * Aktywność jest KONIUNKCJĄ trzech rzeczy - członkostwo `active`, osoba nie zablokowana
 * platformowo, klub działa - dokładnie jak w bramie uprawnień: zlecenie trafia wyłącznie
 * do kogoś, kto dziś może je otworzyć (§6.2).
 */

import type { ClubMember, ClubMembersPort, Queryable } from '../../../application/common/ports.ts';

export class PgClubMembersRepo implements ClubMembersPort {
  async list(db: Queryable, orgId: string): Promise<ClubMember[]> {
    const { rows } = await db.query<{ pilot_id: string; name: string; code: string | null; active: boolean }>(
      `SELECT m.pilot_id, p.name, m.code,
              (m.status = 'active' AND p.active AND o.active) AS active
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
         JOIN organizations o ON o.id = m.org_id
        WHERE m.org_id = $1
        ORDER BY p.name, m.pilot_id`,
      [orgId],
    );
    return rows.map((r) => ({ pilotId: r.pilot_id, name: r.name, code: r.code, active: r.active }));
  }
}
