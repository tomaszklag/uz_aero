/**
 * UZ Aero (serwer) - adapter refresh tokenów (`RefreshTokensPort`).
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

import type { Clock, Database, RefreshTokensPort } from '../../../application/common/ports.ts';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class PgRefreshTokens implements RefreshTokensPort {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async issue(pilotId: string, orgId: string, expiresAt: Date): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [hashToken(token), pilotId, orgId, expiresAt.toISOString(), this.clock.now().toISOString()],
    );
    return token;
  }

  async rotate(
    token: string,
    newExpiresAt: Date,
  ): Promise<{ pilotId: string; orgId: string; token: string } | null> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ pilot_id: string; org_id: string; expires_at: string }>(
        'DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING pilot_id, org_id, expires_at',
        [hashToken(token)],
      );
      const row = rows[0];
      if (row == null) return null;
      if (new Date(row.expires_at).getTime() <= this.clock.now().getTime()) return null;

      const next = randomBytes(32).toString('base64url');
      await tx.query(
        `INSERT INTO refresh_tokens (token_hash, pilot_id, org_id, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [hashToken(next), row.pilot_id, row.org_id, newExpiresAt.toISOString(), this.clock.now().toISOString()],
      );
      return { pilotId: row.pilot_id, orgId: row.org_id, token: next };
    });
  }

  /**
   * Klub najświeższego refresha osoby. `created_at` idzie z ZEGARA aplikacji, nie z
   * `now()` bazy (patrz `issue`/`rotate`): w testach oba muszą mówić o tym samym czasie,
   * inaczej „ostatnio używany" znaczyłby „ostatnio wstawiony przez system operacyjny".
   */
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
