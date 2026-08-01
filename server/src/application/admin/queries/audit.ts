/**
 * UZ Aero (serwer) — strona ODCZYTU dziennika audytu (`A09`).
 *
 * Dziennik zapisuje się od przekroju 1 i do tej pory nikt go nie przeczytał — to jest
 * pierwszy czytelnik. Scenariusz, dla którego powstaje: administrator patrzy na dzień
 * lotny, którego liczby nie zgadzają się z tym, co pamięta pilot, i musi odpowiedzieć
 * na pytanie „kto to ruszał, kiedy i dlaczego".
 *
 * Klasa jest cienka celowo: porządek i filtrowanie są własnością PORTU (indeks
 * i `ORDER BY`), mapowanie na kontrakt — czystej funkcji. Tutaj zostaje wyłącznie
 * rozstrzygnięcie, że nieczytelny kursor jest wariantem WYNIKU, a nie wyjątkiem
 * (wzorzec `AdminSessionQueries.list`): kursor przychodzi z zewnątrz, więc jego
 * uszkodzenie to 400, a nie 500.
 */

import type { Database } from '../../common/ports.ts';
import type { AdminAuditPage } from '../contracts/audit.ts';
import { auditEntry } from '../mappers/auditEntry.ts';
import type { AdminAuditReadPort, AuditListFilter } from '../ports.ts';

export type AuditListOutcome =
  | { ok: true; page: AdminAuditPage }
  | { ok: false; reason: 'bad_cursor' };

export class AdminAuditQueries {
  constructor(
    private readonly db: Database,
    private readonly audit: AdminAuditReadPort,
  ) {}

  async list(filter: AuditListFilter): Promise<AuditListOutcome> {
    const result = await this.audit.list(this.db, filter);
    if (result == null) return { ok: false, reason: 'bad_cursor' };

    return {
      ok: true,
      page: {
        items: result.items.map(auditEntry),
        nextCursor: result.nextCursor,
        total: result.total,
      },
    };
  }
}
