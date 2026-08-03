/**
 * UZ Aero (serwer) — adapter preferencji pilota (`PilotPrefsPort`, migracja 6).
 *
 * LWW egzekwowany W ZAPYTANIU (`WHERE theme_updated_at IS NULL OR < $3`), nie
 * porównaniem po odczycie — dwie równoległe rotacje z dwóch urządzeń tego samego
 * pilota rozstrzyga baza, a nie kolejność wątków. Starszy stempel po prostu nie
 * trafia do wiersza; odpowiedź autorytatywną składa komenda z ponownego `get`.
 */

import type { PilotPrefs, PilotPrefsPort, Queryable } from '../../../application/common/ports.ts';

interface PrefsRow {
  theme: string | null;
  theme_updated_at: Date | string | null;
}

export class PgPilotPrefsRepo implements PilotPrefsPort {
  constructor(private readonly db: Queryable) {}

  async get(pilotId: string): Promise<PilotPrefs | null> {
    const { rows } = await this.db.query<PrefsRow>(
      'SELECT theme, theme_updated_at FROM pilots WHERE id = $1',
      [pilotId],
    );
    const row = rows[0];
    if (row == null) return null;
    return {
      theme: row.theme,
      // `pg` zwraca TIMESTAMPTZ jako Date, PGlite potrafi jako string — normalizujemy.
      themeUpdatedAt: row.theme_updated_at == null ? null : new Date(row.theme_updated_at),
    };
  }

  async setIfNewer(pilotId: string, theme: string, updatedAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE pilots SET theme = $2, theme_updated_at = $3
       WHERE id = $1 AND (theme_updated_at IS NULL OR theme_updated_at < $3)`,
      [pilotId, theme, updatedAt],
    );
  }
}
