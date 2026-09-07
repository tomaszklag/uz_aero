/**
 * UZ Aero (serwer) - adapter zgłoszeń rejestracyjnych po stronie PANELU
 * (`RegistrationsAdminPort`).
 *
 * Drugi adapter tej samej tabeli obok `PgExternalIdentitiesRepo` i to jest ta sama
 * decyzja, co przy kontach: ścieżka LOGOWANIA (tamten) i DECYZJE administratora (ten)
 * to inne pytania w innym rytmie - jedno poza transakcją, drugie w transakcji audytu.
 * Ścieżka logowania nie ma jak zregresować od zmian w panelu.
 */

import type { IdentityStatus, Queryable } from '../../../application/common/ports.ts';
import type { RegistrationRecord, RegistrationsAdminPort } from '../../../application/admin/ports.ts';

interface Row {
  provider: string;
  subject: string;
  email: string;
  name: string;
  status: string;
  reject_reason: string | null;
  created_at: string | Date;
  last_login_at: string | Date | null;
  decided_at: string | Date | null;
  decided_by_code: string | null;
  pilot_id: string | null;
  pilot_code: string | null;
}

const STATUSES: readonly IdentityStatus[] = ['pending', 'linked', 'rejected'];

const at = (v: string | Date | null): Date | null => (v == null ? null : new Date(v));

const toRecord = (r: Row): RegistrationRecord => ({
  provider: r.provider,
  subject: r.subject,
  email: r.email,
  name: r.name,
  // Nierozpoznany status schodzi do `pending` - do stanu BEZ dostępu (jak w adapterze
  // logowania). Kierunek błędu jest bezpieczny.
  status: (STATUSES as readonly string[]).includes(r.status)
    ? (r.status as IdentityStatus)
    : 'pending',
  rejectReason: r.reject_reason,
  createdAt: new Date(r.created_at),
  lastLoginAt: at(r.last_login_at),
  decidedAt: at(r.decided_at),
  decidedByCode: r.decided_by_code,
  pilotId: r.pilot_id,
  pilotCode: r.pilot_code,
});

/**
 * Dwa złączenia z `pilots` pod dwoma aliasami: `p` = konto ZATWIERDZONE (kod pilota
 * na liście), `d` = administrator, który ZDECYDOWAŁ. Oba `LEFT`, bo zgłoszenie
 * oczekujące nie ma ani jednego, ani drugiego.
 */
const SELECT = `
  SELECT e.provider, e.subject, e.email, e.name, e.status, e.reject_reason,
         e.created_at, e.last_login_at, e.decided_at,
         d.code AS decided_by_code,
         e.pilot_id, p.code AS pilot_code
    FROM external_identities e
    LEFT JOIN pilots p ON p.id = e.pilot_id
    LEFT JOIN pilots d ON d.id = e.decided_by`;

export class PgAdminRegistrationsRepo implements RegistrationsAdminPort {
  async list(
    db: Queryable,
    filter: { statuses: readonly IdentityStatus[]; limit: number },
  ): Promise<RegistrationRecord[]> {
    // Filtr składany z numerowanych parametrów zamiast `= ANY($1)`: lista statusów ma
    // trzy pozycje, a parametr tablicowy jest jedynym miejscem, w którym `pg` i PGlite
    // potrafią się różnić kodowaniem - nie warto.
    const params: unknown[] = [];
    const where =
      filter.statuses.length === 0
        ? ''
        : ` WHERE e.status IN (${filter.statuses.map((s) => `$${params.push(s)}`).join(', ')})`;
    params.push(filter.limit);

    // KOLEJKA: najstarsze pierwsze - kto czeka najdłużej, ten stoi na górze.
    const { rows } = await db.query<Row>(
      `${SELECT}${where} ORDER BY e.created_at ASC, e.subject ASC LIMIT $${params.length}`,
      params,
    );
    return rows.map(toRecord);
  }

  async find(db: Queryable, provider: string, subject: string): Promise<RegistrationRecord | null> {
    const { rows } = await db.query<Row>(`${SELECT} WHERE e.provider = $1 AND e.subject = $2`, [
      provider,
      subject,
    ]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async countByStatus(db: Queryable): Promise<Record<IdentityStatus, number>> {
    const { rows } = await db.query<{ status: string; count: unknown }>(
      'SELECT status, count(*) AS count FROM external_identities GROUP BY status',
    );
    const counts: Record<IdentityStatus, number> = { pending: 0, linked: 0, rejected: 0 };
    for (const row of rows) {
      if ((STATUSES as readonly string[]).includes(row.status)) {
        // `Number(...)`, bo node-pg oddaje count jako napis, a PGlite jako liczbę.
        counts[row.status as IdentityStatus] = Number(row.count);
      }
    }
    return counts;
  }

  async link(
    tx: Queryable,
    key: { provider: string; subject: string },
    pilotId: string,
    by: string,
    at: Date,
  ): Promise<boolean> {
    // `RETURNING` zamiast liczby zmienionych wierszy: port `Queryable` oddaje wyłącznie
    // `rows`, a `pg` i PGlite nazywają licznik inaczej. Warunek `status = 'pending'`
    // JEST rozstrzygnięciem wyścigu - druga decyzja nie znajdzie wiersza.
    const { rows } = await tx.query(
      `UPDATE external_identities
          SET status = 'linked', pilot_id = $3, decided_by = $4, decided_at = $5
        WHERE provider = $1 AND subject = $2 AND status = 'pending'
        RETURNING subject`,
      [key.provider, key.subject, pilotId, by, at],
    );
    return rows.length > 0;
  }

  async reject(
    tx: Queryable,
    key: { provider: string; subject: string },
    reason: string,
    by: string,
    at: Date,
  ): Promise<boolean> {
    const { rows } = await tx.query(
      `UPDATE external_identities
          SET status = 'rejected', reject_reason = $3, decided_by = $4, decided_at = $5
        WHERE provider = $1 AND subject = $2 AND status = 'pending'
        RETURNING subject`,
      [key.provider, key.subject, reason, by, at],
    );
    return rows.length > 0;
  }
}
