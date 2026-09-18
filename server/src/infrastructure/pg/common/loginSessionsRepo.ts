/**
 * Ninerdeck (serwer) - adapter SESJI LOGOWANIA (`LoginSessionsPort`, 2.1.0, issue #133).
 *
 * Jeden wiersz na żywą parę tokenów (telefon) albo ciasteczko (panel). Do 2.1.0 sesja
 * telefonu była wierszem `refresh_tokens` bez metadanych, a sesja panelu nie miała wiersza
 * WCALE - stąd jedynym zdalnym wylogowaniem był młot `credentials_valid_from`, który zrywa
 * wszystko naraz, łącznie z telefonem w powietrzu.
 *
 * ══ STEMPLUJEMY, NIE KASUJEMY ══
 * Unieważnienie to `revoked_at` + `revoked_by`, a nie `DELETE`: panel ma pokazać, że
 * urządzenie BYŁO i zostało wyłączone (przez kogo), a audyt - mieć do czego się odnieść.
 * Wiersz znika dopiero razem z osobą (`ON DELETE CASCADE`).
 *
 * ══ `touch` I `find` NIE ZNAJĄ KLUBU - IMIENNY WYJĄTEK OD STRAŻNIKA ══
 * Obie biorą identyfikator sesji odczytany ze ZWERYFIKOWANEGO tokenu, a nie z adresu
 * żądania, więc zawężenie po klubie nie dokładałoby żadnej kontroli: kto ma ten `sid`,
 * ma już podpis serwera pod nim. Dla odczytów panelu jest odwrotnie i tam klub stoi
 * w predykacie zawsze (`list`, `revoke`, `revokeAll`) - klub nie ma prawa zobaczyć ani
 * wyłączyć urządzenia, którym ta osoba loguje się gdzie indziej.
 */

import type {
  Clock,
  Database,
  LoginSessionOpen,
  LoginSessionView,
  LoginSessionsPort,
  Queryable,
  SessionDevice,
  SessionRevokeFilter,
} from '../../../application/common/ports.ts';
import {
  isLoginMethod,
  isSessionSurface,
  type LoginMethod,
  type RevokedBy,
} from '../../../domain/loginSessions.ts';

interface SessionRow {
  id: string;
  org_id: string | null;
  surface: string;
  method: string;
  created_at: string | Date;
  last_seen_at: string | Date;
  expires_at: string | Date;
  device_label: string | null;
  ip: string | null;
}

/**
 * Wiersz → widok. Nierozpoznana wartość `surface`/`method` schodzi do najbardziej
 * zachowawczej ('panel', 'legacy') zamiast wywracać odczyt - ta sama nieufność wobec
 * napisu z bazy, co przy rolach (`isPilotRole(...) ? role : DEFAULT_ROLE`). CHECK broni
 * zapisu, ale lista sesji nie ma prawa paść o wiersz wpisany kiedyś ręką.
 */
const toView = (r: SessionRow): LoginSessionView => ({
  id: r.id,
  orgId: r.org_id,
  surface: isSessionSurface(r.surface) ? r.surface : 'panel',
  method: isLoginMethod(r.method) ? r.method : 'legacy',
  createdAt: new Date(r.created_at),
  lastSeenAt: new Date(r.last_seen_at),
  expiresAt: new Date(r.expires_at),
  deviceLabel: r.device_label,
  ip: r.ip,
});

const COLUMNS =
  'id, org_id, surface, method, created_at, last_seen_at, expires_at, device_label, ip';

export class PgLoginSessions implements LoginSessionsPort {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async open(session: LoginSessionOpen): Promise<void> {
    const now = this.clock.now().toISOString();
    await this.db.query(
      `INSERT INTO login_sessions
             (id, pilot_id, org_id, surface, method, created_at, last_seen_at, expires_at, device_label, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)`,
      [
        session.id,
        session.pilotId,
        session.orgId,
        session.surface,
        session.method,
        now,
        session.expiresAt.toISOString(),
        session.device.label,
        session.device.ip,
      ],
    );
  }

  /**
   * `COALESCE` przy adresie i urządzeniu, bo nie każde żądanie je niesie: telefon podaje
   * nagłówek urządzenia przy logowaniu, a potem niekoniecznie, i pusta wartość nie ma
   * prawa WYMAZAĆ tego, co panel już pokazuje. Sesja unieważniona nie tyka - „ostatnio
   * aktywny" ma opisywać czas, w którym jeszcze działała.
   */
  async touch(id: string, at: Date, device: SessionDevice): Promise<void> {
    await this.db.query(
      `UPDATE login_sessions
          SET last_seen_at = $2,
              ip = COALESCE($3, ip),
              device_label = COALESCE($4, device_label)
        WHERE id = $1 AND revoked_at IS NULL`,
      [id, at.toISOString(), device.ip, device.label],
    );
  }

  async find(id: string, at: Date): Promise<{ method: LoginMethod; live: boolean } | null> {
    const { rows } = await this.db.query<{ method: string; live: boolean }>(
      `SELECT method, (revoked_at IS NULL AND expires_at > $2) AS live
         FROM login_sessions WHERE id = $1`,
      [id, at.toISOString()],
    );
    const row = rows[0];
    if (row == null) return null;
    return { method: isLoginMethod(row.method) ? row.method : 'legacy', live: row.live };
  }

  async isRevoked(id: string, pilotId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ one: number }>(
      `SELECT 1 AS one FROM login_sessions
        WHERE id = $1 AND pilot_id = $2 AND revoked_at IS NULL`,
      [id, pilotId],
    );
    return rows.length === 0;
  }

  /**
   * Zawężenie po OSOBIE i po klubie stoi w SQL-u, nie w komendzie: „wyloguj sesję X"
   * przychodzi z adresu żądania, więc bez tych dwóch predykatów administrator klubu A
   * mógłby wyłączyć urządzenie, którym ta sama osoba pracuje w klubie B - wystarczyłoby
   * znać identyfikator. `revoked_at IS NULL` czyni operację idempotentną: drugie kliknięcie
   * oddaje `false`, a nie przestempluje cudzej decyzji nowym sprawcą.
   */
  async revoke(
    tx: Queryable,
    target: { id: string; pilotId: string; orgId?: string },
    at: Date,
    by: RevokedBy,
  ): Promise<boolean> {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE login_sessions
          SET revoked_at = $3, revoked_by = $4
        WHERE id = $1 AND pilot_id = $2 AND revoked_at IS NULL
          AND ($5::text IS NULL OR org_id = $5)
        RETURNING id`,
      [target.id, target.pilotId, at.toISOString(), by, target.orgId ?? null],
    );
    return rows.length > 0;
  }

  /**
   * Rzutowania `::text` przy parametrach opcjonalnych są WYMAGANE: bez nich Postgres
   * wywodzi typ parametru z `NULL` i porównanie pada na „could not determine data type"
   * (ta sama pułapka, co w §7.9 (i) architektury panelu).
   */
  async revokeAll(
    tx: Queryable,
    filter: SessionRevokeFilter,
    at: Date,
    by: RevokedBy,
  ): Promise<number> {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE login_sessions
          SET revoked_at = $2, revoked_by = $3
        WHERE pilot_id = $1 AND revoked_at IS NULL
          AND ($4::text IS NULL OR org_id = $4)
          AND ($5::text IS NULL OR id <> $5)
        RETURNING id`,
      [filter.pilotId, at.toISOString(), by, filter.orgId ?? null, filter.exceptId ?? null],
    );
    return rows.length;
  }

  /**
   * Wyłącznie sesje ŻYWE - lista wygasłych odpowiadałaby na pytanie, którego nikt nie
   * zadaje („gdzie logowałem się w maju"), a przy okazji pokazywałaby urządzenia, których
   * wyłączenie niczego już nie zmienia. Porządek po ostatniej aktywności: to jest kolejność,
   * w której człowiek szuka „co to za urządzenie".
   */
  async list(db: Queryable, pilotId: string, orgId?: string): Promise<LoginSessionView[]> {
    const { rows } = await db.query<SessionRow>(
      `SELECT ${COLUMNS} FROM login_sessions
        WHERE pilot_id = $1 AND revoked_at IS NULL AND expires_at > $2
          AND ($3::text IS NULL OR org_id = $3)
        ORDER BY last_seen_at DESC, id ASC`,
      [pilotId, this.clock.now().toISOString(), orgId ?? null],
    );
    return rows.map(toView);
  }
}
