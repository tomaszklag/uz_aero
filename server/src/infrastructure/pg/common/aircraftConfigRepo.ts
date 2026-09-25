/**
 * Ninerdeck (serwer) - adapter konfiguracji samolotu (`AircraftConfigPort`).
 *
 * Czysty odczyt jednej wartości: flota zmienia się kilka razy w sezonie i zmienia ją
 * administrator, nie ingest. Czytamy `Queryable` podanym przez wołającego, więc
 * odczyt trafia do TEJ SAMEJ transakcji, w której liczone są flagi - inaczej
 * tolerancja mogłaby pochodzić z innej wersji konfiguracji niż reszta rachunku.
 */

import type { ServiceStatus } from '@ninerdeck/domain';
import type { AircraftConfigPort, Queryable } from '../../../application/common/ports.ts';

export class PgAircraftConfigRepo implements AircraftConfigPort {
  async capacityL(db: Queryable, orgId: string, aircraftId: string): Promise<number | null> {
    const { rows } = await db.query<{ capacity_l: number }>(
      'SELECT capacity_l FROM aircraft WHERE org_id = $1 AND id = $2',
      [orgId, aircraftId],
    );
    return rows[0] == null ? null : Number(rows[0].capacity_l);
  }

  async orgIdOf(db: Queryable, aircraftId: string): Promise<string | null> {
    const { rows } = await db.query<{ org_id: string }>(
      'SELECT org_id FROM aircraft WHERE id = $1',
      [aircraftId],
    );
    return rows[0]?.org_id ?? null;
  }

  async regOf(db: Queryable, orgId: string, aircraftId: string): Promise<string | null> {
    const { rows } = await db.query<{ reg: string }>(
      'SELECT reg FROM aircraft WHERE org_id = $1 AND id = $2',
      [orgId, aircraftId],
    );
    return rows[0]?.reg ?? null;
  }

  async serviceStatusOf(
    db: Queryable,
    orgId: string,
    aircraftId: string,
  ): Promise<ServiceStatus | null> {
    const { rows } = await db.query<{ service_status: string }>(
      'SELECT service_status FROM aircraft WHERE org_id = $1 AND id = $2',
      [orgId, aircraftId],
    );
    const value = rows[0]?.service_status;
    if (value == null) return null;
    // Wartość spoza katalogu schodzi do `disabled` - ta sama ostrożność, co
    // w `fleetRepo.toServiceStatus`: nieznany stan nie ma prawa wypuścić maszyny.
    return value === 'active' ? 'active' : 'disabled';
  }
}
