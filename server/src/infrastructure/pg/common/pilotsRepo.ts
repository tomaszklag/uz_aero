/**
 * Ninerdeck (serwer) - adapter osób i członkostw na ścieżce LOGOWANIA (`PilotsPort`).
 *
 * Konta powstają przez zatwierdzenie zgłoszenia albo w panelu, więc adapter jest
 * ODCZYTEM ścieżki logowania i bramy; zapis mieszka w seedzie i w `PgAdminPilotsRepo`.
 * Dwa wyjątki od 2.1.0 (issue #132) i oba są ścieżką LOGOWANIA: `insertPerson` zakłada
 * osobę z rejestracji e-mailem przy realizacji linku (jak `createPerson` tożsamości
 * Google przy pierwszym logowaniu), a `revokeCredentials` stempluje unieważnienie
 * poświadczeń osoby po resecie hasła.
 *
 * ══ OD WIELOFIRMOWOŚCI (issue #98) DWIE TABELE, JEDNO PYTANIE ══
 * Osoba (`pilots`) jest jedna; to, KIM jest w klubie, stoi w `memberships`. Kod i rola
 * przychodzą odtąd Z CZŁONKOSTWA i każde pytanie o nie musi nazwać klub - dlatego
 * `authSnapshot` i `membership` biorą `orgId`, a `memberships` oddaje komplet klubów
 * osoby do wyboru przy logowaniu.
 */

import type {
  Membership,
  MembershipAuthSnapshot,
  PilotAccount,
  PilotsPort,
  Queryable,
} from '../../../application/common/ports.ts';
import { membershipStatusOf } from '../../../domain/memberships.ts';
import { normalizeEmail } from '../../../domain/email.ts';
import { DEFAULT_ROLE, isPilotRole, isPlatformRole } from '../../../domain/roles.ts';

interface PilotRow {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  platform_role: string | null;
  credentials_valid_from: string | Date | null;
}

const at = (v: string | Date | null): Date | null => (v == null ? null : new Date(v));

const toAccount = (r: PilotRow): PilotAccount => ({
  id: r.id,
  name: r.name,
  email: r.email,
  active: r.active,
  // Bazy pilnuje CHECK, ale adapter i tak nie ufa łańcuchowi znaków z zewnątrz:
  // nierozpoznana rola platformowa schodzi do „zwykła osoba", nigdy nie awansuje.
  platformRole: isPlatformRole(r.platform_role) ? r.platform_role : null,
  credentialsValidFrom: at(r.credentials_valid_from),
});

interface MembershipRow {
  org_id: string;
  org_name: string;
  org_slug: string;
  org_active: boolean;
  code: string | null;
  role: string;
  status: string;
  reject_reason: string | null;
  created_at: string | Date;
  decided_at: string | Date | null;
  credentials_valid_from: string | Date | null;
}

const toMembership = (r: MembershipRow): Membership => ({
  orgId: r.org_id,
  orgName: r.org_name,
  orgSlug: r.org_slug,
  orgActive: r.org_active,
  code: r.code,
  // Ta sama nieufność, co przy roli konta do 2.0.0: nierozpoznana rola schodzi do
  // najmniejszej, nierozpoznany status - do stanu bez dostępu.
  role: isPilotRole(r.role) ? r.role : DEFAULT_ROLE,
  status: membershipStatusOf(r.status),
  credentialsValidFrom: at(r.credentials_valid_from),
  rejectReason: r.reject_reason,
  createdAt: new Date(r.created_at),
  decidedAt: at(r.decided_at),
});

/**
 * Członkostwo ze złączonym klubem - kolumny WYPISANE IMIENNIE, nie `SELECT *`: kształt
 * `Membership` ma zmieniać się świadomie, a nie przy każdej nowej kolumnie na
 * `memberships` czy `organizations`.
 */
const MEMBERSHIP_SELECT = `
  SELECT m.org_id, o.name AS org_name, o.slug AS org_slug, o.active AS org_active,
         m.code, m.role, m.status, m.reject_reason, m.created_at, m.decided_at,
         m.credentials_valid_from
    FROM memberships m
    JOIN organizations o ON o.id = m.org_id`;

/** Kolumny OSOBY wypisane imiennie - jedno źródło dla trzech wyszukań (id, adres, kod). */
const ACCOUNT_SELECT =
  'SELECT id, name, email, active, platform_role, credentials_valid_from FROM pilots';

export class PgPilotsRepo implements PilotsPort {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<PilotAccount | null> {
    const { rows } = await this.db.query<PilotRow>(
      `${ACCOUNT_SELECT} WHERE id = $1`,
      [id],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<PilotAccount | null> {
    // `lower()` po obu stronach - dokładnie predykat indeksu `idx_pilots_email_lower`.
    const { rows } = await this.db.query<PilotRow>(
      `${ACCOUNT_SELECT} WHERE email IS NOT NULL AND lower(email) = lower($1)`,
      [email.trim()],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async findByCode(orgId: string, code: string): Promise<PilotAccount | null> {
    // Kod jest własnością CZŁONKOSTWA w klubie (wielofirmowość) - złączenie po parze
    // `(org_id, code)`, czyli po unikacie `idx_memberships_code`. Kody w bazie są
    // wersalikami; wpis z ekranu porównujemy bez względu na wielkość liter.
    const { rows } = await this.db.query<PilotRow>(
      `SELECT p.id, p.name, p.email, p.active, p.platform_role, p.credentials_valid_from
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
        WHERE m.org_id = $1 AND m.code IS NOT NULL AND upper(m.code) = upper($2)`,
      [orgId, code.trim()],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async insertPerson(tx: Queryable, person: { id: string; name: string; email: string }): Promise<{ pilotId: string }> {
    // Adres ZNORMALIZOWANY (§4.4) - od 2.1.0 jest loginem, a indeks porównuje po
    // `lower()`. Wyścig z pierwszym logowaniem Googlem tym adresem rozstrzyga odczyt
    // W TEJ SAMEJ transakcji: gdy osoba już jest, oddajemy ją.
    const email = normalizeEmail(person.email);
    const existing = await tx.query<{ id: string }>(
      'SELECT id FROM pilots WHERE lower(email) = $1',
      [email],
    );
    if (existing.rows[0] != null) return { pilotId: existing.rows[0].id };

    await tx.query('INSERT INTO pilots (id, name, email, active) VALUES ($1, $2, $3, TRUE)', [
      person.id,
      person.name,
      email,
    ]);
    return { pilotId: person.id };
  }

  async revokeCredentials(tx: Queryable, pilotId: string, at: Date): Promise<void> {
    // Stempel z ZEGARA aplikacji, nie `now()` bazy - brama porównuje go z chwilą wydania
    // tokenu, a ta też idzie z zegara aplikacji (ta sama reguła, co `setActive` członkostwa).
    await tx.query('UPDATE pilots SET credentials_valid_from = $2, updated_at = now() WHERE id = $1', [
      pilotId,
      at.toISOString(),
    ]);
  }

  async memberships(pilotId: string): Promise<Membership[]> {
    // Porządek po NAZWIE klubu, potem po id - „pierwszy alfabetycznie" z reguły wyboru
    // klubu aktywnego (§5) ma być tym samym klubem przy każdym logowaniu.
    const { rows } = await this.db.query<MembershipRow>(
      `${MEMBERSHIP_SELECT} WHERE m.pilot_id = $1 ORDER BY o.name ASC, o.id ASC`,
      [pilotId],
    );
    return rows.map(toMembership);
  }

  async membership(pilotId: string, orgId: string): Promise<Membership | null> {
    const { rows } = await this.db.query<MembershipRow>(
      `${MEMBERSHIP_SELECT} WHERE m.pilot_id = $1 AND m.org_id = $2`,
      [pilotId, orgId],
    );
    return rows[0] ? toMembership(rows[0]) : null;
  }

  /**
   * Odczyt BRAMY panelu - jedno złączenie po kluczu głównym `(org_id, pilot_id)`,
   * kolumny imiennie. `active` liczymy TU, w SQL-u, jako koniunkcję trzech rzeczy
   * (osoba, klub, członkostwo): brama nie ma powodu rozróżniać, która z nich odebrała
   * dostęp, a rozbicie na trzy pola zapraszałoby do sprawdzenia dwóch z nich.
   *
   * `code` przez `COALESCE` do pustego napisu jest ZAWĘŻENIEM typu, nie danymi: kod bywa
   * `NULL` wyłącznie przy `pending`, a wtedy `active` jest `false` i brama odbija wiersz,
   * zanim ktokolwiek przeczyta kod.
   */
  async authSnapshot(
    pilotId: string,
    orgId: string,
    sessionId: string | null,
  ): Promise<MembershipAuthSnapshot | null> {
    const { rows } = await this.db.query<{
      pilot_id: string;
      org_id: string;
      code: string | null;
      name: string;
      active: boolean;
      role: string;
      credentials_valid_from: string | Date | null;
      membership_credentials_valid_from: string | Date | null;
      session_revoked: boolean;
    }>(
      // Sesja wchodzi `LEFT JOIN`-em po TRÓJCE (identyfikator, osoba, klub), a nie po
      // samym `sid`: `sid` z tokenu jest już podpisany przez nas, ale zawężenie do osoby
      // i klubu wiersza czyni podstawienie cudzej sesji niewyrażalnym, zamiast tylko
      // nieprawdopodobnym. `$3::text IS NOT NULL` odróżnia „token bez sesji" (przed 2.1.0,
      // przechodzi) od „sesji, której nie ma" (odbija).
      `SELECT m.pilot_id, m.org_id, m.code, p.name,
              (p.active AND o.active AND m.status = 'active') AS active,
              m.role,
              p.credentials_valid_from,
              m.credentials_valid_from AS membership_credentials_valid_from,
              ($3::text IS NOT NULL AND (s.id IS NULL OR s.revoked_at IS NOT NULL))
                AS session_revoked
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
         JOIN organizations o ON o.id = m.org_id
         LEFT JOIN login_sessions s
                ON s.id = $3 AND s.pilot_id = m.pilot_id AND s.org_id = m.org_id
        WHERE m.pilot_id = $1 AND m.org_id = $2`,
      [pilotId, orgId, sessionId],
    );

    const row = rows[0];
    if (row == null) return null;
    return {
      pilotId: row.pilot_id,
      orgId: row.org_id,
      code: row.code ?? '',
      name: row.name,
      active: row.active,
      role: isPilotRole(row.role) ? row.role : DEFAULT_ROLE,
      credentialsValidFrom: at(row.credentials_valid_from),
      membershipCredentialsValidFrom: at(row.membership_credentials_valid_from),
      sessionRevoked: row.session_revoked,
      sessionId,
    };
  }
}
