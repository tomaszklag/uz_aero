/**
 * UZ Aero (serwer) — adapter refresh tokenów (`RefreshTokensPort`).
 *
 * Wydajemy losowe 256 bitów, a w bazie trzymamy SHA-256 wartości — wyciek tabeli nie
 * daje działających sesji. `consume` jest rotacją: jedno użycie kasuje wpis, więc
 * skradziony-i-użyty token unieważnia się sam, a użycie starego po rotacji po prostu
 * nie trafia w żaden wiersz.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Clock, Queryable, RefreshTokensPort } from '../../application/ports.ts';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class PgRefreshTokens implements RefreshTokensPort {
  constructor(
    private readonly db: Queryable,
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

  async consume(token: string): Promise<{ pilotId: string } | null> {
    // Kasowanie i odczyt w JEDNYM zapytaniu — dwa równoległe użycia tego samego tokenu
    // nie mogą oba przejść (drugi DELETE nic nie zwróci).
    const { rows } = await this.db.query<{ pilot_id: string; expires_at: string }>(
      'DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING pilot_id, expires_at',
      [hashToken(token)],
    );
    const row = rows[0];
    if (row == null) return null;
    if (new Date(row.expires_at).getTime() <= this.clock.now().getTime()) return null;
    return { pilotId: row.pilot_id };
  }
}
