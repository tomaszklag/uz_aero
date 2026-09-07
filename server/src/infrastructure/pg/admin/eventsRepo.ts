/**
 * UZ Aero (serwer) - adapter metadanych rejestru dla panelu (`EventsAdminPort`).
 *
 * Osobny plik od `pg/common/eventsStore.ts`, bo osobny jest POWÓD istnienia: tamten
 * obsługuje ingest (wstawianie paczki, odczyt strumienia do projekcji) i zwraca byty
 * domenowe. Ten odpowiada wyłącznie na pytania panelu o KOLUMNY TECHNICZNE, których
 * `Event` nie ma i mieć nie powinien. Ten sam wzorzec, co `admin/flagsRepo.ts` obok
 * `common/flagsRepo.ts`: duplikat nazwy bazowej jest celowy, kwalifikator niesie katalog.
 *
 * Zapisu tu nie ma i nie będzie - `events` jest append-only (pilnuje tego
 * `test/architecture.test.ts`).
 */

import type { EventsAdminPort } from '../../../application/admin/ports.ts';
import { isAdminSourceDevice } from '../../../application/admin/sourceDevice.ts';
import type { Queryable } from '../../../application/common/ports.ts';

export class PgAdminEventsRepo implements EventsAdminPort {
  async sourceDeviceOf(
    db: Queryable,
    eventUuid: string,
  ): Promise<{ sourceDevice: string | null } | null> {
    const { rows } = await db.query<{ source_device: string | null }>(
      'SELECT source_device FROM events WHERE uuid = $1',
      [eventUuid],
    );
    const row = rows[0];
    return row === undefined ? null : { sourceDevice: row.source_device };
  }

  async adminCorrectionUuids(db: Queryable, sessionUuid: string): Promise<string[]> {
    const { rows } = await db.query<{ uuid: string; source_device: string | null }>(
      `SELECT uuid, source_device
         FROM events
        WHERE session_uuid = $1
          AND type = 'event_correction'`,
      [sessionUuid],
    );
    // Rozpoznanie znacznika zostaje po stronie TypeScriptu, a nie w `LIKE 'admin:%'`:
    // format znacznika ma jedno miejsce (`application/admin/sourceDevice.ts`), a korekt
    // w jednym dniu lotnym są jednostki, więc filtrowanie tej garstki w pamięci nie
    // kupuje nic drugiego zapytania ani drugiej definicji prefiksu.
    return rows.filter((r) => isAdminSourceDevice(r.source_device)).map((r) => r.uuid);
  }
}
