/**
 * UZ Aero (serwer) - adapter MODUŁU ORGANIZACJE (`OrganizationsPlatformPort`;
 * wielofirmowość §8.1; issue #100, D3).
 *
 * Jedyny adapter panelu, który NIE dostaje `orgId` parametrem: to on klubami zarządza.
 * Z wnętrza klubu czyta wyłącznie LICZBY (`COUNT`) i administratorów - żadnego wiersza
 * dziennika, floty ani kolejki. Ta wąskość jest treścią §3.3, nie oszczędnością:
 * „nic nie wycieka między klubami" obejmuje także listę klubów.
 *
 * ══ ADMINISTRATORZY IDĄ DRUGIM ZAPYTANIEM, NIE ZŁĄCZENIEM ══
 * Klub ma zwykle jednego administratora, ale może mieć kilku - a złączenie mnożyłoby
 * wiersze klubu i psuło `COUNT`-y w podzapytaniach albo wymagałoby agregatu JSON-owego.
 * Dwa zapytania i sklejenie w pamięci są tu tańsze do przeczytania, a lista klubów ma
 * kilkanaście wierszy, nie kilkanaście tysięcy.
 */

import type {
  NewOrganization,
  OrganizationAdmin,
  OrganizationDetail,
  OrganizationPatch,
  OrganizationSummary,
  OrganizationsPlatformPort,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import { SqlFilter } from '../sqlFilter.ts';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string | Date;
  join_code: string | null;
  join_code_since: string | Date | null;
  /** `COUNT(*)` - sterownik oddaje `int8` NAPISEM. */
  members: string | number;
  aircraft: string | number;
}

interface AdminRow {
  org_id: string;
  pilot_id: string;
  code: string;
  name: string;
  email: string | null;
  signed_in: boolean;
}

/**
 * Liczniki z wnętrza klubu.
 *
 * `members` liczy członkostwa Z LISTY klubu (`active`/`disabled`) - tą samą regułą, co
 * lista pilotów (`pilotsRepo.ts`, stała `LISTED`): zgłoszenie `pending` nie jest jeszcze
 * członkiem, a odrzucone nie będzie. Gdyby liczyło wszystkie wiersze, liczba na liście
 * klubów rosłaby od samych zgłoszeń i nie zgadzałaby się z listą w panelu klubu.
 *
 * `aircraft` liczy CAŁĄ flotę, także jednostki wyłączone ze służby: pytanie brzmi „jak
 * duży jest ten klub", a nie „ile maszyn dziś lata".
 */
const COUNTS = `
  (SELECT COUNT(*) FROM memberships m
    WHERE m.org_id = o.id AND m.status IN ('active', 'disabled')) AS members,
  (SELECT COUNT(*) FROM aircraft a WHERE a.org_id = o.id) AS aircraft`;

const ORG_COLUMNS = `o.id, o.name, o.slug, o.active, o.created_at, o.join_code, o.join_code_since`;

const toSummary = (row: OrgRow, admins: OrganizationAdmin[]): OrganizationSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  active: row.active,
  createdAt: new Date(row.created_at),
  members: Number(row.members),
  aircraft: Number(row.aircraft),
  admins,
});

export class PgOrganizationsRepo implements OrganizationsPlatformPort {
  async list(
    db: Queryable,
    filter: { search?: string; active?: boolean },
  ): Promise<OrganizationSummary[]> {
    const sql = new SqlFilter();
    if (filter.active !== undefined) sql.add('o.active = ?', filter.active);
    if (filter.search !== undefined && filter.search !== '') {
      // Nazwa ALBO slug: jedno jest napisem dla człowieka, drugie adresem - człowiek
      // szukający klubu ma w pamięci raz to, raz tamto.
      //
      // `position`, nie `LIKE '%q%'` - ta sama reguła, co w `pilotsRepo.ts`: wzorzec
      // `LIKE` wymagałby ucieczki `%` i `_` z tekstu wpisanego ręką, a zapomniana
      // ucieczka daje wyszukiwarkę, w której `%` pokazuje wszystko.
      sql.add(
        `(position(lower(?) in lower(o.name)) > 0 OR position(lower(?) in lower(o.slug)) > 0)`,
        filter.search,
        filter.search,
      );
    }

    const { rows } = await db.query<OrgRow>(
      `SELECT ${ORG_COLUMNS}, ${COUNTS}
         FROM organizations o
         ${sql.where()}
        -- Klub wyłączony jest przygaszony i stoi na KOŃCU, jak konto wyłączone na
        -- liście pilotów (mockup organizacje-lista).
        ORDER BY o.active DESC, o.name ASC`,
      sql.params(),
    );

    const admins = await this.adminsOf(
      db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toSummary(row, admins.get(row.id) ?? []));
  }

  async byId(db: Queryable, id: string): Promise<OrganizationDetail | null> {
    const { rows } = await db.query<OrgRow>(
      `SELECT ${ORG_COLUMNS}, ${COUNTS} FROM organizations o WHERE o.id = $1`,
      [id],
    );
    const row = rows[0];
    if (row == null) return null;

    const admins = await this.adminsOf(db, [row.id]);
    return {
      ...toSummary(row, admins.get(row.id) ?? []),
      joinCode: row.join_code,
      joinCodeSince: row.join_code_since == null ? null : new Date(row.join_code_since),
    };
  }

  /**
   * Klub + pierwszy administrator w JEDNEJ transakcji (wołający daje `tx`).
   *
   * Osoba o tym adresie może już istnieć (lata w innym klubie) - wtedy dopisujemy
   * członkostwo DO NIEJ i oddajemy JEJ identyfikator: `pilots.email` jest jedyny na
   * serwerze, bo osoba jest jedna (§3.6). Nazwiska istniejącej osoby NIE ruszamy -
   * należy do niej, a nie do klubu, który ją właśnie dopisuje (ta sama reguła, co miał
   * `PgAdminPilotsRepo.insert` do epiku D).
   */
  async insert(tx: Queryable, org: NewOrganization): Promise<{ adminPilotId: string }> {
    const at = org.at.toISOString();
    await tx.query(
      `INSERT INTO organizations (id, name, slug, active, join_code, join_code_since, created_at, created_by)
       VALUES ($1, $2, $3, TRUE, $4, $5, $5, $6)`,
      [org.id, org.name, org.slug, org.joinCode, at, org.createdBy],
    );

    const existing = await tx.query<{ id: string }>(
      'SELECT id FROM pilots WHERE lower(email) = lower($1)',
      [org.admin.email],
    );
    let pilotId = existing.rows[0]?.id ?? org.admin.pilotId;
    if (existing.rows[0] == null) {
      await tx.query('INSERT INTO pilots (id, name, email, active) VALUES ($1, $2, $3, TRUE)', [
        pilotId,
        org.admin.name,
        org.admin.email,
      ]);
    }

    // `joined_via = 'platform'`: pierwszy administrator klubu to jedyny wyjątek od kodu
    // klubu i ma w bazie własną nazwę, żeby było widać, że nikt go nie zatwierdzał.
    await tx.query(
      `INSERT INTO memberships (org_id, pilot_id, code, role, status, joined_via, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', 'active', 'platform', $4, $4)`,
      [org.id, pilotId, org.admin.code, at],
    );

    return { adminPilotId: pilotId };
  }

  async update(tx: Queryable, id: string, patch: OrganizationPatch): Promise<void> {
    // Sam `name`: slug jest adresem kart arkusza i po nadaniu się nie zmienia (§3.1),
    // a kod klubu prowadzi panel klubu (`PgClubCodeRepo`).
    await tx.query('UPDATE organizations SET name = COALESCE($2, name) WHERE id = $1', [
      id,
      patch.name ?? null,
    ]);
  }

  async setActive(tx: Queryable, id: string, active: boolean): Promise<void> {
    await tx.query('UPDATE organizations SET active = $2 WHERE id = $1', [id, active]);
  }

  /**
   * Administratorzy podanych klubów, pogrupowani po klubie.
   *
   * `signedIn` czyta obecność wiersza w `external_identities`: tożsamość Google powstaje
   * przy PIERWSZYM logowaniu (§4), więc jej brak znaczy dokładnie „ten człowiek jeszcze
   * nie wszedł". Stempel `last_login_at` odpowiadałby na to samo pytanie, ale tylko dla
   * tożsamości, które już istnieją - a pytanie dotyczy właśnie tych, których nie ma.
   */
  private async adminsOf(
    db: Queryable,
    orgIds: readonly string[],
  ): Promise<Map<string, OrganizationAdmin[]>> {
    const out = new Map<string, OrganizationAdmin[]>();
    if (orgIds.length === 0) return out;

    const { rows } = await db.query<AdminRow>(
      `SELECT m.org_id, m.pilot_id, m.code, p.name, p.email,
              EXISTS (SELECT 1 FROM external_identities e WHERE e.pilot_id = p.id) AS signed_in
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
        WHERE m.org_id = ANY($1) AND m.role = 'admin' AND m.status = 'active'
        ORDER BY p.name ASC`,
      [orgIds],
    );

    for (const row of rows) {
      const admins = out.get(row.org_id) ?? [];
      admins.push({
        pilotId: row.pilot_id,
        name: row.name,
        email: row.email,
        code: row.code,
        signedIn: row.signed_in,
      });
      out.set(row.org_id, admins);
    }
    return out;
  }
}
