/**
 * UZ Aero (serwer) — strona ODCZYTU skrzynki flag (`A03`).
 *
 * Cienka warstwa: port oddaje flagi ze złączeniami w porządku skrzynki, ta klasa mapuje
 * je na kontrakt panelu. Porządek („blokujące eksport → najstarsze") jest własnością
 * PORTU, a nie tego pliku — bo wynika z indeksu i z `ORDER BY`, a nie z sortowania
 * w pamięci: lista przycięta limitem musi być przycięta po WŁAŚCIWEJ stronie porządku.
 */

import type { Database } from '../../common/ports.ts';
import type { AdminFlagPage } from '../contracts/flags.ts';
import { flagListItem } from '../mappers/flagListItem.ts';
import type { FlagListFilter, FlagsAdminPort } from '../ports.ts';

export class AdminFlagQueries {
  constructor(
    private readonly db: Database,
    private readonly flags: FlagsAdminPort,
  ) {}

  async list(filter: FlagListFilter): Promise<AdminFlagPage> {
    const { items, total } = await this.flags.list(this.db, filter);
    return { items: items.map(flagListItem), total };
  }
}
