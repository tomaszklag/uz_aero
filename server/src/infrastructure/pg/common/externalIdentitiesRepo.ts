/**
 * UZ Aero (serwer) - adapter tożsamości zewnętrznych (`ExternalIdentitiesPort`).
 *
 * Obsługuje ŚCIEŻKĘ LOGOWANIA: odczyt tożsamości, założenie OSOBY przy pierwszym
 * logowaniu i podpięcie do istniejącego konta po zweryfikowanym e-mailu. Decyzje
 * administratora o zgłoszeniach nie dotykają już tej tabeli (wielofirmowość §4,
 * epik D): zgłoszenie jest wierszem `memberships`, a tożsamość Google jest albo
 * nieznana, albo podpięta do osoby - statusów tu nie ma.
 *
 * Adapter ma własny uchwyt do bazy jak `PgPilotsRepo` - logowanie jedzie poza
 * transakcją audytu, bo nie jest akcją panelu.
 */

import type {
  Database,
  ExternalIdentitiesPort,
  ExternalIdentity,
  ProviderProfile,
} from '../../../application/common/ports.ts';

interface IdentityRow {
  provider: string;
  subject: string;
  pilot_id: string;
  email: string;
  name: string;
  created_at: string | Date;
  last_login_at: string | Date | null;
}

const toIdentity = (r: IdentityRow): ExternalIdentity => ({
  provider: r.provider,
  subject: r.subject,
  pilotId: r.pilot_id,
  email: r.email,
  name: r.name,
  createdAt: new Date(r.created_at),
  lastLoginAt: r.last_login_at == null ? null : new Date(r.last_login_at),
});

const COLUMNS = 'provider, subject, pilot_id, email, name, created_at, last_login_at';

/** Sygnał wycofania transakcji `createPerson` - przegrany wyścig o tożsamość. */
class IdentityRace extends Error {}

export class PgExternalIdentitiesRepo implements ExternalIdentitiesPort {
  constructor(private readonly db: Database) {}

  async find(provider: string, subject: string): Promise<ExternalIdentity | null> {
    const { rows } = await this.db.query<IdentityRow>(
      `SELECT ${COLUMNS} FROM external_identities WHERE provider = $1 AND subject = $2`,
      [provider, subject],
    );
    return rows[0] ? toIdentity(rows[0]) : null;
  }

  async findByPilot(pilotId: string): Promise<ExternalIdentity | null> {
    const { rows } = await this.db.query<IdentityRow>(
      `SELECT ${COLUMNS} FROM external_identities WHERE pilot_id = $1`,
      [pilotId],
    );
    return rows[0] ? toIdentity(rows[0]) : null;
  }

  async createPerson(profile: ProviderProfile, personId: string): Promise<ExternalIdentity | null> {
    // JEDNA transakcja: osoba bez tożsamości byłaby wierszem, do którego nikt nigdy nie
    // wejdzie - a właśnie taki zostawiłby przegrany wyścig dwóch pierwszych logowań tej
    // samej tożsamości, gdyby osoba powstawała osobnym poleceniem. Przegrana kończy się
    // wyjątkiem (rollback), a wołający czyta wiersz zwycięzcy.
    //
    // Adres z Google trafia na osobę WYŁĄCZNIE potwierdzony i wolny: `pilots.email` jest
    // listą, po której panel dopisuje członkostwo do istniejącej osoby (`insert`
    // w `PgAdminPilotsRepo`), więc adres niepotwierdzony byłby drogą do podszycia się
    // pod kogoś, komu administrator dopiero wpisze ten adres.
    try {
      return await this.db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO pilots (id, name, email, active)
           VALUES ($1, $2,
                   CASE WHEN $4::boolean
                         AND NOT EXISTS (SELECT 1 FROM pilots WHERE lower(email) = lower($3))
                        THEN $3::text ELSE NULL END,
                   TRUE)`,
          [personId, profile.name, profile.email, profile.emailVerified],
        );
        const { rows } = await tx.query<IdentityRow>(
          `INSERT INTO external_identities (provider, subject, pilot_id, email, name)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (provider, subject) DO NOTHING
           RETURNING ${COLUMNS}`,
          [profile.provider, profile.subject, personId, profile.email, profile.name],
        );
        if (rows[0] == null) throw new IdentityRace();
        return toIdentity(rows[0]);
      });
    } catch (err) {
      if (err instanceof IdentityRace) return null;
      throw err;
    }
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
    // Konto WYŁĄCZONE też się podpina - poprawka po pierwszym przebiegu testów
    // (2026-09-04). Z warunkiem `AND p.active` wyłączony pilot spadał do ścieżki
    // „konto nieznane" i dostawał ŚWIEŻĄ osobę, którą administrator mógłby przyjąć -
    // zakładając człowiekowi, którego właśnie wyłączył, drugie konto. Tożsamość Google
    // JEST tego człowieka niezależnie od stanu konta; odmowę („account_disabled")
    // orzeka komenda po podpięciu.
    //
    // `ON CONFLICT DO NOTHING`: wyścig dwóch pierwszych logowań tej samej tożsamości
    // kończy się jednym wierszem, a przegrany czyta go zwykłym `find`.
    const { rows } = await this.db.query<IdentityRow>(
      `INSERT INTO external_identities (provider, subject, pilot_id, email, name)
       SELECT $1, $2, p.id, $3, $4
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
