/**
 * UZ Aero (serwer) — adapter `PilotsPort` i `RefreshTokensPort` na Postgres.
 *
 * Refresh tokeny: wydajemy losowe 256 bitów, a w bazie trzymamy SHA-256 wartości —
 * wyciek tabeli nie daje działających sesji. `consume` jest rotacją: jedno użycie
 * kasuje wpis, więc skradziony-i-użyty token unieważnia się sam, a użycie starego
 * po rotacji po prostu nie trafia w żaden wiersz.
 */

import { createHash, randomBytes } from 'node:crypto';

import type {
  Clock,
  PilotAccount,
  PilotsPort,
  Queryable,
  RefreshTokensPort,
} from '../../application/ports.ts';

interface PilotRow {
  id: string;
  code: string;
  name: string;
  email: string | null;
  password_hash: string;
  active: boolean;
}

const toAccount = (r: PilotRow): PilotAccount => ({
  id: r.id,
  code: r.code,
  name: r.name,
  email: r.email,
  passwordHash: r.password_hash,
  active: r.active,
});

export class PgPilotsRepo implements PilotsPort {
  constructor(private readonly db: Queryable) {}

  async findByLogin(login: string): Promise<PilotAccount | null> {
    // Loginem jest kod pilota albo e-mail — oba unikalne; wielkość liter bez znaczenia,
    // bo „TMK" i „tmk" to w intencji pilota to samo konto.
    const { rows } = await this.db.query<PilotRow>(
      'SELECT * FROM pilots WHERE lower(code) = lower($1) OR lower(email) = lower($1)',
      [login],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async findById(id: string): Promise<PilotAccount | null> {
    const { rows } = await this.db.query<PilotRow>('SELECT * FROM pilots WHERE id = $1', [id]);
    return rows[0] ? toAccount(rows[0]) : null;
  }
}

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
