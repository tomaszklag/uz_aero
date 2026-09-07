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
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Clock, Database, RefreshTokensPort } from '../../../application/common/ports.ts';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class PgRefreshTokens implements RefreshTokensPort {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async issue(pilotId: string, expiresAt: Date): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.query(
      'INSERT INTO refresh_tokens (token_hash, pilot_id, expires_at) VALUES ($1, $2, $3)',
      [hashToken(token), pilotId, expiresAt.toISOString()],
    );
    return token;
  }

  async rotate(
    token: string,
    newExpiresAt: Date,
  ): Promise<{ pilotId: string; token: string } | null> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ pilot_id: string; expires_at: string }>(
        'DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING pilot_id, expires_at',
        [hashToken(token)],
      );
      const row = rows[0];
      if (row == null) return null;
      if (new Date(row.expires_at).getTime() <= this.clock.now().getTime()) return null;

      const next = randomBytes(32).toString('base64url');
      await tx.query(
        'INSERT INTO refresh_tokens (token_hash, pilot_id, expires_at) VALUES ($1, $2, $3)',
        [hashToken(next), row.pilot_id, newExpiresAt.toISOString()],
      );
      return { pilotId: row.pilot_id, token: next };
    });
  }
}
