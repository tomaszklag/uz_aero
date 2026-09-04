/**
 * UZ Aero (serwer) - adapter tożsamości zewnętrznych (`ExternalIdentitiesPort`).
 *
 * Obsługuje ŚCIEŻKĘ LOGOWANIA: odczyt zgłoszenia, założenie nowego i podpięcie do
 * istniejącego konta po zweryfikowanym e-mailu. Decyzje administratora (zatwierdzenie,
 * odrzucenie) mają własny adapter po stronie panelu - ta sama zasada, co przy kontach:
 * `PgPilotsRepo` czyta przy logowaniu, `PgAdminPilotsRepo` pisze w transakcji audytu,
 * więc ścieżka logowania nie ma jak zregresować od zmian w panelu.
 */

import type {
  ExternalIdentitiesPort,
  ExternalIdentity,
  IdentityStatus,
  ProviderProfile,
  Queryable,
} from '../../../application/common/ports.ts';

interface IdentityRow {
  provider: string;
  subject: string;
  pilot_id: string | null;
  email: string;
  name: string;
  status: string;
  reject_reason: string | null;
  created_at: string | Date;
}

const STATUSES: readonly IdentityStatus[] = ['pending', 'linked', 'rejected'];

const toIdentity = (r: IdentityRow): ExternalIdentity => ({
  provider: r.provider,
  subject: r.subject,
  pilotId: r.pilot_id,
  email: r.email,
  name: r.name,
  // Ta sama nieufność, co przy roli w `PgPilotsRepo`: nierozpoznany status schodzi
  // do `pending`, czyli do stanu BEZ dostępu. Ten kierunek błędu jest bezpieczny.
  status: (STATUSES as readonly string[]).includes(r.status)
    ? (r.status as IdentityStatus)
    : 'pending',
  rejectReason: r.reject_reason,
  createdAt: new Date(r.created_at),
});

const COLUMNS = 'provider, subject, pilot_id, email, name, status, reject_reason, created_at';

export class PgExternalIdentitiesRepo implements ExternalIdentitiesPort {
  constructor(private readonly db: Queryable) {}

  async find(provider: string, subject: string): Promise<ExternalIdentity | null> {
    const { rows } = await this.db.query<IdentityRow>(
      `SELECT ${COLUMNS} FROM external_identities WHERE provider = $1 AND subject = $2`,
      [provider, subject],
    );
    return rows[0] ? toIdentity(rows[0]) : null;
  }

  async createPending(profile: ProviderProfile): Promise<ExternalIdentity> {
    // `ON CONFLICT DO UPDATE` na e-mailu i nazwie, bo między pierwszym zgłoszeniem
    // a decyzją administratora człowiek może zmienić jedno i drugie po stronie Google -
    // a decyzja ma zapadać na danych aktualnych. Statusu NIE ruszamy: ponowne
    // logowanie nie ma prawa cofnąć odrzucenia ani zerwać podpięcia.
    const { rows } = await this.db.query<IdentityRow>(
      `INSERT INTO external_identities (provider, subject, email, name, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (provider, subject) DO UPDATE
         SET email = EXCLUDED.email, name = EXCLUDED.name
       RETURNING ${COLUMNS}`,
      [profile.provider, profile.subject, profile.email, profile.name],
    );
    return toIdentity(rows[0]!);
  }

  async claimByVerifiedEmail(profile: ProviderProfile): Promise<ExternalIdentity | null> {
    // ══ JEDNO POLECENIE, I TO JEST WYMÓG ══
    // Rozbite na „znajdź konto" + „wstaw tożsamość" zostawiałoby okno, w którym dwa
    // równoległe logowania podpinają dwie tożsamości do jednego konta. Tu warunek
    // i zapis są jedną operacją, a `idx_external_identities_pilot` domyka resztę.
    //
    // `NOT EXISTS` pilnuje, żeby przejęcie dotyczyło wyłącznie konta JESZCZE
    // niepodpiętego: bez tego cudze konto Google o tym samym e-mailu przejęłoby
    // konto już używane przez kogoś innego.
    //
    // Konto WYŁĄCZONE też się podpina - i to jest poprawka po pierwszym przebiegu
    // testów (2026-09-04). Z warunkiem `AND p.active` wyłączony pilot spadał do
    // ścieżki „konto nieznane" i dostawał ŚWIEŻE ZGŁOSZENIE, które administrator
    // mógłby zatwierdzić - zakładając osobie, którą właśnie wyłączył, drugie konto.
    // Tożsamość Google JEST tego człowieka niezależnie od stanu konta; odmowę
    // („account_disabled") orzeka komenda po podpięciu.
    const { rows } = await this.db.query<IdentityRow>(
      `INSERT INTO external_identities (provider, subject, pilot_id, email, name, status)
       SELECT $1, $2, p.id, $3, $4, 'linked'
         FROM pilots p
        WHERE lower(p.email) = lower($3)
          AND NOT EXISTS (
                SELECT 1 FROM external_identities e WHERE e.pilot_id = p.id
              )
       ON CONFLICT (provider, subject) DO NOTHING
       RETURNING ${COLUMNS}`,
      [profile.provider, profile.subject, profile.email, profile.name],
    );
    return rows[0] ? toIdentity(rows[0]) : null;
  }

  async markLogin(provider: string, subject: string, at: Date): Promise<void> {
    await this.db.query(
      'UPDATE external_identities SET last_login_at = $3 WHERE provider = $1 AND subject = $2',
      [provider, subject, at],
    );
  }
}
