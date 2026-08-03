/**
 * UZ Aero (serwer) — `AdminPilotJoin` → kontrakt listy kont (`A06`).
 *
 * Czysta funkcja, jak `sessionListItem.ts` i `auditEntry.ts`: port oddaje model
 * warstwy aplikacji, a mapowanie na kształt „na drucie" jest testowalne bez bazy.
 * Tutaj mieszka jedyna rzecz, którą trzeba pamiętać przy tej trasie — **hash hasła
 * nie ma dokąd wjechać, bo port go nie niesie** (`AdminPilotAccount` jest osobnym
 * typem od `PilotAccount` właśnie po to).
 */

import type { AdminPilotListItem } from '../contracts/pilots.ts';
import type { AdminPilotJoin, PilotCounts, PilotScopeCounts } from '../ports.ts';
import type { AdminPilotCounts, AdminPilotScopeCounts } from '../contracts/pilots.ts';

export function pilotListItem(join: AdminPilotJoin): AdminPilotListItem {
  const { account } = join;
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    email: account.email,
    active: account.active,
    role: account.role,
    updatedAt: join.updatedAt.toISOString(),
    flyingDays: join.flyingDays,
  };
}

/**
 * `PilotCounts.byRole` (mapa po katalogu ról) → płaskie pola kontraktu.
 *
 * Płasko, a nie mapą, bo kontrakt panelu ma być czytelny bez znajomości katalogu ról
 * serwera — a dopisanie czwartej roli i tak wymaga decyzji o tym, jak nazwać ją
 * w karcie „Rola w panelu", czyli zmiany po obu stronach.
 */
export function pilotCounts(counts: PilotCounts): AdminPilotCounts {
  return {
    total: counts.total,
    active: counts.active,
    inactive: counts.inactive,
    admin: counts.byRole.admin,
    trainingLead: counts.byRole.training_lead,
    pilot: counts.byRole.pilot,
    flyingDays: counts.flyingDays,
  };
}

/**
 * Liczniki chipów — przepisanie 1:1, bo port i kontrakt odpowiadają tu na dokładnie
 * to samo pytanie. Mapper istnieje mimo to, żeby kontrakt nie był typem PORTU: to
 * dwie rzeczy, które zmieniają się z różnych powodów (kształt SQL-a vs kształt drutu).
 */
export function pilotScopeCounts(counts: PilotScopeCounts): AdminPilotScopeCounts {
  return {
    total: counts.total,
    active: counts.active,
    inactive: counts.inactive,
    panel: counts.panel,
  };
}
