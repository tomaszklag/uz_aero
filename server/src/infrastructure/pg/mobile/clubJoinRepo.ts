/**
 * Ninerdeck (serwer) - adapter DOŁĄCZANIA kodem klubu (`ClubJoinPort`, wielofirmowość
 * epik D, `docs/wielofirmowosc.md` §3.8, §5).
 *
 * Drugi adapter tabeli `memberships` obok `PgPilotsRepo` (odczyt przy logowaniu)
 * i `PgAdminPilotsRepo` (decyzje panelu w transakcji audytu) - ta sama zasada, co przy
 * flagach: inne pytanie, inny rytm. Tu pisze PILOT SAM, poza panelem i poza audytem,
 * i pisze dokładnie jedną rzecz: zgłoszenie `pending`.
 */

import type { Organization } from '../../../domain/organizations.ts';
import { membershipStatusOf } from '../../../domain/memberships.ts';
import type { ClubJoinPort, JoinAttempt } from '../../../application/mobile/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

interface MembershipRow {
  status: string;
  reject_reason: string | null;
  decided_at: string | Date | null;
}

const toAttempt = (r: MembershipRow, created: boolean): JoinAttempt => ({
  created,
  status: membershipStatusOf(r.status),
  rejectReason: r.reject_reason,
  decidedAt: r.decided_at == null ? null : new Date(r.decided_at),
});

export class PgClubJoinRepo implements ClubJoinPort {
  constructor(private readonly db: Queryable) {}

  async findByCode(code: string): Promise<Organization | null> {
    // Porównanie dokładne na kolumnie ZNORMALIZOWANEJ (`domain/clubCode.ts`): kod
    // wyłączony to `NULL`, a `NULL = $1` nie pasuje do niczego - klub z wyłączonym
    // dołączaniem jest dla tej trasy nieodróżnialny od nieistniejącego. Tak ma być (§3.8).
    const { rows } = await this.db.query<OrgRow>(
      'SELECT id, slug, name, active FROM organizations WHERE join_code = $1',
      [code],
    );
    const row = rows[0];
    return row == null ? null : { id: row.id, slug: row.slug, name: row.name, active: row.active };
  }

  async join(orgId: string, pilotId: string, at: Date): Promise<JoinAttempt> {
    // `ON CONFLICT … DO NOTHING` na kluczu `(org_id, pilot_id)`: drugie zgłoszenie tej
    // samej osoby (drugi telefon, drugie tapnięcie) nie zakłada drugiego wiersza ani nie
    // cofa decyzji - istniejący wiersz zostaje nietknięty, a stan czyta odczyt niżej.
    const inserted = await this.db.query<MembershipRow>(
      `INSERT INTO memberships (org_id, pilot_id, status, joined_via, created_at, updated_at)
       VALUES ($1, $2, 'pending', 'code', $3, $3)
       ON CONFLICT (org_id, pilot_id) DO NOTHING
       RETURNING status, reject_reason, decided_at`,
      [orgId, pilotId, at.toISOString()],
    );
    if (inserted.rows[0] != null) return toAttempt(inserted.rows[0], true);

    const existing = await this.db.query<MembershipRow>(
      'SELECT status, reject_reason, decided_at FROM memberships WHERE org_id = $1 AND pilot_id = $2',
      [orgId, pilotId],
    );
    const row = existing.rows[0];
    if (row == null) {
      // Wiersz zniknął między INSERT-em a odczytem (usunięcie osoby z panelu w tej
      // samej chwili) - stan niemożliwy do obsłużenia sensownie; lepiej głośno.
      throw new Error(`członkostwo (${orgId}, ${pilotId}) zniknęło w trakcie zgłoszenia`);
    }
    return toAttempt(row, false);
  }
}
