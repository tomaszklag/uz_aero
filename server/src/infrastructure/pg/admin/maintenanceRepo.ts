/**
 * UZ Aero (serwer) — adapter operacji konserwacyjnych panelu (`MaintenanceAdminPort`).
 *
 * Jedna metoda i cała jej treść jest w tym, SKĄD czyta: `DISTINCT session_uuid`
 * z rejestru `events`, nie z tabeli `sessions`. Lista budowana z projekcji nie umiałaby
 * pokazać sesji, która jest w rejestrze, a wiersza projekcji nie ma — czyli najcięższego
 * przypadku dryfu, dla którego przebudowa w ogóle powstała.
 *
 * Porządek po `session_uuid` jest deterministyczny, żeby dwa przebiegi na tych samych
 * danych dały ten sam raport — inaczej „różnice" zmieniałyby kolejność między biegami
 * i nie dałoby się ich porównać wzrokiem.
 */

import type { MaintenanceAdminPort } from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';

export class PgAdminMaintenanceRepo implements MaintenanceAdminPort {
  async sessionUuids(db: Queryable): Promise<string[]> {
    const { rows } = await db.query<{ session_uuid: string }>(
      'SELECT DISTINCT session_uuid FROM events ORDER BY session_uuid',
    );
    return rows.map((r) => r.session_uuid);
  }
}
