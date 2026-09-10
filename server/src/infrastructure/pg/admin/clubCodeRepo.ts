/**
 * UZ Aero (serwer) - adapter KODU KLUBU (`ClubCodeAdminPort`; wielofirmowość §3.8;
 * issue #100, D2).
 *
 * Kod mieszka w kolumnie `organizations.join_code` - jawnym tekstem, nie hashem, bo
 * administrator musi go ODCZYTAĆ z panelu, żeby podać pilotom, a sam kod nie daje
 * dostępu (daje członkostwo `pending`). Hash chroniłby sekret, którego tu nie ma.
 *
 * ══ DRUGI ADAPTER `organizations` OBOK `organizationsRepo.ts` - CELOWO ══
 * Tamten należy do PLATFORMY (superadministrator zakłada i wyłącza kluby), ten do PANELU
 * KLUBU (klub prowadzi swoją drogę dołączania). Ta sama tabela, dwie różne władze i dwie
 * różne zdolności - sklejenie ich w jeden adapter dałoby klasę, w której jedna metoda
 * wymaga `platform.manage`, a druga `accounts.manage`, i nic by tego nie mówiło.
 */

import type { ClubCodeAdminPort, ClubCodeState } from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';

interface CodeRow {
  join_code: string | null;
  join_code_since: string | Date | null;
  /** `COUNT(*)` - sterownik oddaje `int8` NAPISEM. */
  pending_with_code: string | number;
}

export class PgClubCodeRepo implements ClubCodeAdminPort {
  async state(db: Queryable, orgId: string): Promise<ClubCodeState> {
    // Zgłoszenia „tym kodem" liczymy od `join_code_since`, bo `memberships` nie zapisuje,
    // którym kodem ktoś wszedł - i nie ma po co: kod jest jeden na klub, a jego zmiana
    // ma w bazie stempel. Podzapytanie, nie złączenie: wiersz klubu ma zostać jeden,
    // także przy zerowej kolejce.
    const { rows } = await db.query<CodeRow>(
      `SELECT o.join_code,
              o.join_code_since,
              (SELECT COUNT(*) FROM memberships m
                WHERE m.org_id = o.id
                  AND m.status = 'pending'
                  AND (o.join_code_since IS NULL OR m.created_at >= o.join_code_since)
              ) AS pending_with_code
         FROM organizations o
        WHERE o.id = $1`,
      [orgId],
    );

    const row = rows[0];
    // Klub z sesji panelu, którego nie ma w tabeli, to awaria bramy - nie stan do
    // przemilczenia pustym kodem (wtedy panel pokazywałby „dołączanie wyłączone").
    if (row == null) throw new Error(`klub ${orgId} nie istnieje`);

    return {
      code: row.join_code,
      since: row.join_code_since == null ? null : new Date(row.join_code_since),
      pendingWithCode: Number(row.pending_with_code),
    };
  }

  async setCode(tx: Queryable, orgId: string, code: string | null, at: Date): Promise<void> {
    // Stempel idzie RAZEM z kodem i gaśnie razem z nim: „obowiązuje od" bez kodu nie
    // opisywałoby niczego, a karta liczy z niego zgłoszenia złożone tym kodem.
    await tx.query(
      `UPDATE organizations
          SET join_code = $2,
              -- Rzutowanie jest WYMAGANE: bez niego gałąź NULL i parametr tekstowy dają
              -- CASE o typie text, a Postgres odmawia wpisania go do kolumny
              -- timestamptz (42804) - i to dopiero w czasie działania.
              join_code_since = CASE WHEN $2::text IS NULL THEN NULL ELSE $3::timestamptz END
        WHERE id = $1`,
      [orgId, code, at.toISOString()],
    );
  }
}
