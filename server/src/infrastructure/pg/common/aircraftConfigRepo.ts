/**
 * UZ Aero (serwer) — adapter konfiguracji samolotu (`AircraftConfigPort`).
 *
 * Czysty odczyt jednej wartości: flota zmienia się kilka razy w sezonie i zmienia ją
 * administrator, nie ingest. Czytamy `Queryable` podanym przez wołającego, więc
 * odczyt trafia do TEJ SAMEJ transakcji, w której liczone są flagi — inaczej
 * tolerancja mogłaby pochodzić z innej wersji konfiguracji niż reszta rachunku.
 */

import type { AircraftConfigPort, Queryable } from '../../../application/common/ports.ts';

export class PgAircraftConfigRepo implements AircraftConfigPort {
  async capacityL(db: Queryable, aircraftId: string): Promise<number | null> {
    const { rows } = await db.query<{ capacity_l: number }>(
      'SELECT capacity_l FROM aircraft WHERE id = $1',
      [aircraftId],
    );
    return rows[0] == null ? null : Number(rows[0].capacity_l);
  }
}
