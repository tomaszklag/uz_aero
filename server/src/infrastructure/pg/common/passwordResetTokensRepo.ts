/**
 * Ninerdeck (serwer) - tokeny linku „ustaw hasło" (`PasswordResetTokensPort`,
 * tabela `password_reset_tokens`; 2.1.0, `docs/logowanie-haslem.md` §4.2, §5.4, §5.4a).
 *
 * Ten sam wzorzec, co refreshe: 32 losowe bajty `base64url` w adresie, `sha256` w bazie.
 * Wyciek tabeli nie daje działających linków, a 256 bitów nie da się zgadnąć, więc limit
 * prób stoi na WYSYŁCE, nie na samym tokenie.
 *
 * ══ JEDNORAZOWOŚĆ ══
 * `consume` robi `UPDATE … WHERE consumed_at IS NULL RETURNING`: z dwóch równoległych
 * kliknięć w ten sam link tylko jedno trafi w wiersz - drugie dostaje `null` i strona
 * mówi „link został już użyty". `peek` przed `consume` służy sprawdzeniu polityki
 * hasła BEZ zużywania tokenu: słabe hasło nie ma prawa spalić linku.
 *
 * ══ NOWY LINK ZUŻYWA STARY ══
 * `issue` stempluje `consumed_at` na wszystkich niezużytych tokenach tej OSOBY (`reset`)
 * albo tego ADRESU (`signup`) w tej samej transakcji. Kto poprosił o link dwa razy, ma
 * jeden działający - ten z ostatniego listu.
 */

import { createHash, randomBytes } from 'node:crypto';

import type {
  IssuedResetToken,
  PasswordResetTokensPort,
  Queryable,
  ResetTokenIssue,
  ResetTokenView,
  ResetTrigger,
} from '../../../application/common/ports.ts';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

interface Row {
  kind: string;
  pilot_id: string | null;
  email: string | null;
  display_name: string | null;
  triggered_by: string;
}

const TRIGGERS: readonly ResetTrigger[] = ['self', 'admin', 'platform', 'cli'];

function toView(row: Row): ResetTokenView | null {
  if (row.kind === 'signup' && row.email != null && row.display_name != null) {
    return { kind: 'signup', email: row.email, displayName: row.display_name };
  }
  if (row.kind === 'reset' && row.pilot_id != null) {
    const trigger = TRIGGERS.find((t) => t === row.triggered_by) ?? 'self';
    return { kind: 'reset', pilotId: row.pilot_id, triggeredBy: trigger };
  }
  // CHECK bazy nie dopuszcza takiego wiersza; głośno byłoby lepiej, ale strona
  // i tak ma jedną odpowiedź na wszystko poza sukcesem.
  return null;
}

const COLUMNS = 'kind, pilot_id, email, display_name, triggered_by';

export class PgPasswordResetTokensRepo implements PasswordResetTokensPort {
  constructor(private readonly db: Queryable) {}

  async issue(tx: Queryable, input: ResetTokenIssue): Promise<IssuedResetToken> {
    const now = input.now.toISOString();
    if (input.kind === 'reset') {
      await tx.query(
        `UPDATE password_reset_tokens SET consumed_at = $2
          WHERE pilot_id = $1 AND consumed_at IS NULL`,
        [input.pilotId, now],
      );
    } else {
      await tx.query(
        `UPDATE password_reset_tokens SET consumed_at = $2
          WHERE kind = 'signup' AND lower(email) = lower($1) AND consumed_at IS NULL`,
        [input.email, now],
      );
    }

    const token = randomBytes(32).toString('base64url');
    if (input.kind === 'reset') {
      await tx.query(
        `INSERT INTO password_reset_tokens
           (token_hash, kind, pilot_id, triggered_by, created_at, created_by, expires_at)
         VALUES ($1, 'reset', $2, $3, $4, $5, $6)`,
        [hashToken(token), input.pilotId, input.triggeredBy, now, input.createdBy, input.expiresAt.toISOString()],
      );
    } else {
      await tx.query(
        `INSERT INTO password_reset_tokens
           (token_hash, kind, email, display_name, triggered_by, created_at, expires_at)
         VALUES ($1, 'signup', $2, $3, 'self', $4, $5)`,
        [hashToken(token), input.email.trim().toLowerCase(), input.displayName, now, input.expiresAt.toISOString()],
      );
    }
    return { token, expiresAt: input.expiresAt };
  }

  async peek(token: string, now: Date): Promise<ResetTokenView | null> {
    const { rows } = await this.db.query<Row>(
      `SELECT ${COLUMNS} FROM password_reset_tokens
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2`,
      [hashToken(token), now.toISOString()],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  async consume(tx: Queryable, token: string, now: Date): Promise<ResetTokenView | null> {
    const { rows } = await tx.query<Row>(
      `UPDATE password_reset_tokens SET consumed_at = $2
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2
        RETURNING ${COLUMNS}`,
      [hashToken(token), now.toISOString()],
    );
    return rows[0] ? toView(rows[0]) : null;
  }
}
