/**
 * Ninerdeck (serwer) - poświadczenie hasłem osoby (`PasswordCredentialsPort`,
 * tabela `password_credentials`; 2.1.0, issue #132).
 *
 * `common/`, bo z tej samej tabeli czyta logowanie telefonu i panelu, a pisze do niej
 * reset z e-maila, ustawienia telefonu i `#/konto` panelu. Jeden wiersz na osobę
 * (klucz główny) - `upsert` jest ustawieniem i zmianą naraz.
 *
 * `find` na własnym uchwycie (ścieżka logowania, poza transakcją); zapisy w CUDZEJ
 * transakcji, bo idą razem z unieważnieniem sesji i zużyciem tokenu linku.
 */

import type {
  PasswordCredential,
  PasswordCredentialsPort,
  PasswordSetVia,
  Queryable,
} from '../../../application/common/ports.ts';

interface Row {
  pilot_id: string;
  hash: string;
  set_at: string | Date;
  set_via: string;
}

export class PgPasswordCredentialsRepo implements PasswordCredentialsPort {
  constructor(private readonly db: Queryable) {}

  async find(pilotId: string): Promise<PasswordCredential | null> {
    const { rows } = await this.db.query<Row>(
      'SELECT pilot_id, hash, set_at, set_via FROM password_credentials WHERE pilot_id = $1',
      [pilotId],
    );
    const row = rows[0];
    if (row == null) return null;
    return {
      pilotId: row.pilot_id,
      hash: row.hash,
      setAt: new Date(row.set_at),
      // CHECK bazy pilnuje wartości; adapter i tak nie awansuje nieznanego napisu.
      setVia: row.set_via === 'link' ? 'link' : 'self',
    };
  }

  async upsert(
    tx: Queryable,
    credential: { pilotId: string; hash: string; setVia: PasswordSetVia; at: Date },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO password_credentials (pilot_id, hash, set_at, set_via, updated_at)
       VALUES ($1, $2, $3, $4, $3)
       ON CONFLICT (pilot_id) DO UPDATE
         SET hash = EXCLUDED.hash, set_at = EXCLUDED.set_at, set_via = EXCLUDED.set_via,
             updated_at = EXCLUDED.updated_at`,
      [credential.pilotId, credential.hash, credential.at.toISOString(), credential.setVia],
    );
  }

  async rehash(pilotId: string, hash: string, at: Date): Promise<void> {
    await this.db.query(
      'UPDATE password_credentials SET hash = $2, updated_at = $3 WHERE pilot_id = $1',
      [pilotId, hash, at.toISOString()],
    );
  }
}
