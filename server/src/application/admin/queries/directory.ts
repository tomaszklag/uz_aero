/**
 * Ninerdeck (serwer) - słownik klubu dla panelu (`GET /admin/api/directory`, issue #216).
 *
 * Dwa pytania, jeden odczyt: „jak nazywa się osoba o tym identyfikatorze" i „jaki znak
 * ma ta maszyna". Odpowiada każdemu członkowi klubu (trasa bez zdolności), więc niesie
 * WYŁĄCZNIE to, co kalendarz i kolejka decyzji z niej czytają - powody w nagłówku
 * `contracts/directory.ts`.
 *
 * Flota idzie tym samym portem, co moduł Samoloty, bo lista floty klubu jest jednym
 * zapytaniem, a do słownika trafiają z niej cztery pola; członkowie mają WŁASNĄ metodę
 * portu, bo lista modułu Piloci liczy dni lotne, sesje i metody logowania - rzeczy,
 * których słownik nie ma prawa nieść i nie ma po co liczyć.
 */

import type { Database } from '../../common/ports.ts';
import type { AdminDirectory } from '../contracts/directory.ts';
import type { FleetAdminPort, PilotsAdminPort } from '../ports.ts';

export class AdminDirectoryQueries {
  constructor(
    private readonly db: Database,
    private readonly pilots: PilotsAdminPort,
    private readonly fleet: FleetAdminPort,
  ) {}

  async of(orgId: string): Promise<AdminDirectory> {
    const [members, aircraft] = await Promise.all([
      this.pilots.directory(this.db, orgId),
      this.fleet.list(this.db, orgId, {}),
    ]);
    return {
      members,
      aircraft: aircraft.map((join) => ({
        id: join.aircraft.id,
        reg: join.aircraft.reg,
        type: join.aircraft.type,
        serviceStatus: join.aircraft.serviceStatus,
      })),
    };
  }
}
