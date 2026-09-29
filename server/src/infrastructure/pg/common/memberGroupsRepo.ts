/**
 * Ninerdeck (serwer) - adapter grup klubu (`member_groups`, `member_group_members`;
 * migracja 16, issue #245; `docs/zlecenia.md` §6.1).
 *
 * W `common/`, bo grupy CZYTA telefon (adresowanie zlecenia, `GET /groups`) i panel,
 * a ZMIENIA wyłącznie panel. Reguły („członek spoza klubu = odmowa", zdolność
 * `accounts.manage`) siedzą w komendzie - tutaj jest SQL.
 *
 * ══ NAZWĘ JEDYNĄ W KLUBIE ODBIJA BAZA ══
 * `idx_member_groups_name` na `(org_id, lower(name))`. Sprawdzenie przed zapisem byłoby
 * gorsze: dwóch administratorów zakładających „Piloci An-2" w tej samej minucie
 * przeczytałoby wolną nazwę. Zapis idzie w punkcie zapisu (`SAVEPOINT`) z tego samego
 * powodu, co w `bookingsRepo`: odmowa ograniczenia unieważnia transakcję, a komenda
 * chce potem jeszcze dopisać ślad audytu.
 */

import type {
  MemberGroupRecord,
  MemberGroupsPort,
  MemberGroupWrite,
  NewMemberGroup,
  Queryable,
} from '../../../application/common/ports.ts';

interface GroupDbRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
  member_ids: string[] | null;
}

/** Grupa z listą osób jednym zapytaniem - `ORDER BY` w agregacie trzyma listę stabilną. */
const SELECT_GROUPS = `
  SELECT g.id, g.name, g.created_by, g.created_at, g.updated_at,
         COALESCE(array_agg(m.pilot_id ORDER BY m.pilot_id) FILTER (WHERE m.pilot_id IS NOT NULL), '{}') AS member_ids
    FROM member_groups g
    LEFT JOIN member_group_members m ON m.group_id = g.id AND m.org_id = g.org_id
`;

const SAVEPOINT = 'member_group_write';

const toRecord = (row: GroupDbRow): MemberGroupRecord => ({
  id: row.id,
  name: row.name,
  memberIds: row.member_ids ?? [],
  createdBy: row.created_by,
  createdAt: new Date(row.created_at).getTime(),
  updatedAt: new Date(row.updated_at).getTime(),
});

/** Odmowa unikatu NAZWY - nie każda `23505` (klucz główny obsługuje `ON CONFLICT`). */
function isNameConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown };
  if (e.code !== '23505') return false;
  const where = [e.constraint, e.message].filter((v): v is string => typeof v === 'string').join(' ');
  return where.includes('idx_member_groups_name');
}

export class PgMemberGroupsRepo implements MemberGroupsPort {
  async list(db: Queryable, orgId: string): Promise<MemberGroupRecord[]> {
    const { rows } = await db.query<GroupDbRow>(
      `${SELECT_GROUPS} WHERE g.org_id = $1 GROUP BY g.id ORDER BY lower(g.name), g.id`,
      [orgId],
    );
    return rows.map(toRecord);
  }

  async byId(db: Queryable, orgId: string, id: string): Promise<MemberGroupRecord | null> {
    const { rows } = await db.query<GroupDbRow>(
      `${SELECT_GROUPS} WHERE g.org_id = $1 AND g.id = $2 GROUP BY g.id`,
      [orgId, id],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async insert(tx: Queryable, orgId: string, group: NewMemberGroup, at: Date): Promise<MemberGroupWrite> {
    await tx.query(`SAVEPOINT ${SAVEPOINT}`);
    try {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO member_groups (id, org_id, name, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [group.id, orgId, group.name, group.createdBy, at],
      );
      if (rows[0] == null) {
        // Powtórzony zapis tym samym uuidem - oddajemy grupę taką, jaka już jest.
        const existing = await this.byId(tx, orgId, group.id);
        return existing == null ? { ok: false, reason: 'name_taken' } : { ok: true, group: existing, created: false };
      }
      await this.writeMembers(tx, orgId, group.id, group.memberIds);
    } catch (err) {
      if (!isNameConflict(err)) throw err;
      await tx.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      return { ok: false, reason: 'name_taken' };
    }
    const saved = await this.byId(tx, orgId, group.id);
    return { ok: true, group: saved!, created: true };
  }

  async update(
    tx: Queryable,
    orgId: string,
    id: string,
    patch: { name?: string; memberIds?: readonly string[] },
    at: Date,
  ): Promise<MemberGroupWrite | null> {
    await tx.query(`SAVEPOINT ${SAVEPOINT}`);
    try {
      const { rows } = await tx.query<{ id: string }>(
        `UPDATE member_groups
            SET name = COALESCE($3, name), updated_at = $4
          WHERE org_id = $1 AND id = $2
          RETURNING id`,
        [orgId, id, patch.name ?? null, at],
      );
      if (rows[0] == null) return null;
      if (patch.memberIds !== undefined) {
        await tx.query('DELETE FROM member_group_members WHERE org_id = $1 AND group_id = $2', [orgId, id]);
        await this.writeMembers(tx, orgId, id, patch.memberIds);
      }
    } catch (err) {
      if (!isNameConflict(err)) throw err;
      await tx.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      return { ok: false, reason: 'name_taken' };
    }
    const saved = await this.byId(tx, orgId, id);
    return { ok: true, group: saved!, created: false };
  }

  async remove(tx: Queryable, orgId: string, id: string): Promise<boolean> {
    const { rows } = await tx.query<{ id: string }>(
      'DELETE FROM member_groups WHERE org_id = $1 AND id = $2 RETURNING id',
      [orgId, id],
    );
    return rows.length > 0;
  }

  private async writeMembers(tx: Queryable, orgId: string, groupId: string, memberIds: readonly string[]): Promise<void> {
    for (const pilotId of new Set(memberIds)) {
      await tx.query(
        `INSERT INTO member_group_members (org_id, group_id, pilot_id) VALUES ($1, $2, $3)
         ON CONFLICT (group_id, pilot_id) DO NOTHING`,
        [orgId, groupId, pilotId],
      );
    }
  }
}
