/**
 * Ninerdeck (serwer) - strona ODCZYTU skrzynki flag (`A03`; 3.2.0: skrzynka rozjazdów).
 *
 * Cienka warstwa: port oddaje flagi ze złączeniami w porządku skrzynki, ta klasa mapuje
 * je na kontrakt panelu. Porządek („blokujące eksport → najstarsze") jest własnością
 * PORTU, a nie tego pliku - bo wynika z indeksu i z `ORDER BY`, a nie z sortowania
 * w pamięci: lista przycięta limitem musi być przycięta po WŁAŚCIWEJ stronie porządku.
 *
 * ══ OPERACJE FLAG DOCIĄGA JEDNO ZAPYTANIE (3.2.0, P-D) ══
 * Skrzynka nazywa operacje sygnaturą i nazwiskiem, więc po flagach idzie JEDNO pytanie
 * do listy operacji o komplet uuid-ów (`byUuids`), a nie pytanie na sprawę. Ta klasa
 * jest przez to JEDYNYM miejscem, w którym flaga dostaje operacje - karta operacji
 * i pulpit wołają ją, zamiast portu flag wprost, żeby flaga wyglądała wszędzie tak samo.
 */

import type { Database } from '../../common/ports.ts';
import type { AdminFlagPage, AdminFlagSession } from '../contracts/flags.ts';
import { flagListItem, flagSession } from '../mappers/flagListItem.ts';
import type { AdminFlagJoin, FlagListFilter, FlagsAdminPort, SessionsAdminPort } from '../ports.ts';

export class AdminFlagQueries {
  constructor(
    private readonly db: Database,
    private readonly flags: FlagsAdminPort,
    private readonly sessions: SessionsAdminPort,
  ) {}

  async list(orgId: string, filter: FlagListFilter): Promise<AdminFlagPage> {
    const { items, total } = await this.flags.list(this.db, orgId, filter);
    const sessions = await this.sessionsOf(orgId, items);
    return { items: items.map((join) => flagListItem(join, sessions)), total };
  }

  /** Operacje wszystkich flag strony, po uuid - jedno zapytanie, bez powtórzeń. */
  private async sessionsOf(
    orgId: string,
    joins: readonly AdminFlagJoin[],
  ): Promise<Map<string, AdminFlagSession>> {
    const uuids = [...new Set(joins.flatMap((join) => join.flag.sessionUuids))];
    const rows = await this.sessions.byUuids(this.db, orgId, uuids);
    return new Map(rows.map((join) => [join.row.sessionUuid, flagSession(join)]));
  }
}
