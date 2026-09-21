/**
 * Ninerdeck (serwer) - adapter USTAWIEŃ KALENDARZA KLUBU (`organizations.timezone`
 * i `home_icao`, migracja 11).
 *
 * Osobny, mały port zamiast dokładania kolumn do `OrganizationsPlatformPort`: tamten
 * należy do modułu Organizacje (superadministrator, zakres platformy), a te dwa pola
 * czyta KLUB u siebie - kalendarz w aplikacji pilota i moduł kalendarza w panelu.
 * Wspólny port znaczyłby, że trasa telefonu sięga po liczniki członków i maszyn, żeby
 * dowiedzieć się, w jakiej strefie rysować siatkę.
 *
 * `organizations` nie jest tabelą SKOPOWANĄ klubem - klub jest tu WIERSZEM, nie
 * kolumną - więc `id = $1` jest tu pełnym zawężeniem.
 */

import type { ClubCalendarSettings, ClubSettingsPort, Queryable } from '../../../application/common/ports.ts';

export class PgClubSettingsRepo implements ClubSettingsPort {
  async calendar(db: Queryable, orgId: string): Promise<ClubCalendarSettings | null> {
    const { rows } = await db.query<{ timezone: string | null; home_icao: string | null }>(
      'SELECT timezone, home_icao FROM organizations WHERE id = $1',
      [orgId],
    );
    const row = rows[0];
    if (row == null) return null;
    return { timezone: row.timezone, homeIcao: row.home_icao };
  }
}
