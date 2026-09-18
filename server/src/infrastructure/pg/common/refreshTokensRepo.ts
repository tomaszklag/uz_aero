/**
 * Ninerdeck (serwer) - adapter refresh tokenów (`RefreshTokensPort`).
 *
 * Wydajemy losowe 256 bitów, a w bazie trzymamy SHA-256 wartości - wyciek tabeli nie
 * daje działających sesji. Rotacja jest JEDNĄ transakcją (audyt): kasowanie starego
 * i wydanie nowego nie mogą się rozjechać, bo telefon, który stracił odpowiedź,
 * zostałby bez żadnego ważnego tokenu - a ponowne logowanie wymaga sieci (§3.0).
 *
 * `DELETE … RETURNING` w rotacji daje też ochronę przed podwójnym użyciem: z dwóch
 * równoległych prób tego samego tokenu tylko jedna trafi w wiersz.
 *
 * ══ REFRESH NIESIE KLUB (wielofirmowość §6) ══
 * Para tokenów jest parą DLA KLUBU: rotacja wydaje następny refresh w TYM SAMYM klubie
 * i oddaje go wołającemu, żeby nowy token dostępu dostał ten sam `org`. Przełączenie
 * klubu to osobna trasa (`POST /auth/switch`, epik F), nie parametr rotacji.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Clock, Database, Queryable, RefreshTokensPort } from '../../../application/common/ports.ts';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class PgRefreshTokens implements RefreshTokensPort {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async issue(
    pilotId: string,
    orgId: string,
    sessionId: string,
    expiresAt: Date,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, session_id, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        hashToken(token),
        pilotId,
        orgId,
        sessionId,
        expiresAt.toISOString(),
        this.clock.now().toISOString(),
      ],
    );
    return token;
  }

  async sessionOf(token: string): Promise<string | null> {
    const { rows } = await this.db.query<{ session_id: string }>(
      'SELECT session_id FROM refresh_tokens WHERE token_hash = $1',
      [hashToken(token)],
    );
    return rows[0]?.session_id ?? null;
  }

  /**
   * Rotacja ZACHOWUJE sesję: to dalej to samo urządzenie, więc `sid` w nowym tokenie
   * dostępu ma być ten sam, co przed odświeżeniem. Nowa sesja przy każdej rotacji
   * zamieniłaby listę urządzeń w panelu w dziennik odświeżeń.
   */
  async rotate(
    token: string,
    newExpiresAt: Date,
  ): Promise<{ pilotId: string; orgId: string; sessionId: string; token: string } | null> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{
        pilot_id: string;
        org_id: string;
        session_id: string;
        expires_at: string;
      }>(
        `DELETE FROM refresh_tokens WHERE token_hash = $1
         RETURNING pilot_id, org_id, session_id, expires_at`,
        [hashToken(token)],
      );
      const row = rows[0];
      if (row == null) return null;
      if (new Date(row.expires_at).getTime() <= this.clock.now().getTime()) return null;

      const next = randomBytes(32).toString('base64url');
      await tx.query(
        `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, session_id, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          hashToken(next),
          row.pilot_id,
          row.org_id,
          row.session_id,
          newExpiresAt.toISOString(),
          this.clock.now().toISOString(),
        ],
      );
      return {
        pilotId: row.pilot_id,
        orgId: row.org_id,
        sessionId: row.session_id,
        token: next,
      };
    });
  }

  /**
   * Klub najświeższego refresha osoby. `created_at` idzie z ZEGARA aplikacji, nie z
   * `now()` bazy (patrz `issue`/`rotate`): w testach oba muszą mówić o tym samym czasie,
   * inaczej „ostatnio używany" znaczyłby „ostatnio wstawiony przez system operacyjny".
   */
  /**
   * WSZYSTKIE kluby naraz - świadomie bez `org_id` (imienny wyjątek w `architecture.test.ts`):
   * reset hasła jest decyzją o OSOBIE, nie o członkostwie. Panel kasuje per klub
   * (`PgAdminRefreshTokensRepo.revokeAllFor`), bo tam decyduje administrator klubu.
   */
  async revokeAllOf(tx: Queryable, pilotId: string): Promise<number> {
    const { rows } = await tx.query<{ token_hash: string }>(
      'DELETE FROM refresh_tokens WHERE pilot_id = $1 RETURNING token_hash',
      [pilotId],
    );
    return rows.length;
  }

  async lastOrgFor(pilotId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ org_id: string }>(
      `SELECT org_id FROM refresh_tokens
        WHERE pilot_id = $1
        ORDER BY created_at DESC, token_hash DESC
        LIMIT 1`,
      [pilotId],
    );
    return rows[0]?.org_id ?? null;
  }
}
