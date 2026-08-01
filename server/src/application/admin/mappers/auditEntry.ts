/**
 * UZ Aero (serwer) — wiersz dziennika + złączenie → DTO panelu (funkcja CZYSTA).
 *
 * Ten sam wzorzec, co `sessionListItem` i `flagListItem`: mapowanie na kontrakt jest
 * czystą funkcją, żeby dało się je sprawdzić bez bazy, a adapter zajmował się wyłącznie
 * SQL-em.
 *
 * Mapper NICZEGO nie interpretuje — nie tłumaczy kodu akcji, nie nazywa roli, nie
 * zagląda do `details`. To nie jest oszczędność: dziennik audytu, którego serwer
 * „poprawia" po drodze, przestaje być zapisem tego, co się zdarzyło. Jedyna zmiana
 * kształtu to `Date` → ISO 8601, bo JSON nie ma typu daty.
 */

import type { AdminAuditEntry } from '../contracts/audit.ts';
import type { AdminAuditJoin } from '../ports.ts';

export function auditEntry(join: AdminAuditJoin): AdminAuditEntry {
  return {
    id: join.id,
    createdAt: join.createdAt.toISOString(),
    actorPilotId: join.actorPilotId,
    actorCode: join.actorCode,
    actorName: join.actorName,
    actorRole: join.actorRole,
    action: join.action,
    targetType: join.targetType,
    targetId: join.targetId,
    details: join.details,
    ip: join.ip,
  };
}
