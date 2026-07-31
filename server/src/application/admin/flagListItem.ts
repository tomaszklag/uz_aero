/**
 * UZ Aero (serwer) — flaga + złączenia → DTO skrzynki (`A03`).
 *
 * Czysta funkcja, testowana bez bazy (wzorzec `application/sessionRow.ts`).
 *
 * Jedyne pole WYLICZONE to `blocksExport`, i to nie jest wygoda: skrzynka sortuje po
 * nim sprawy, a kolumna „Skutek" mówi administratorowi wprost, czy jakaś karta dnia
 * stoi przez tę flagę poza arkuszem. Predykat pochodzi z bramki eksportera, żeby
 * panel i `DayExporter` nie mogły powiedzieć czegoś innego.
 */

import { blocksExport } from '../export/dayExporter.ts';
import type { AdminFlagListItem } from './contracts/flags.ts';
import type { AdminFlagJoin } from './ports.ts';

export function flagListItem(join: AdminFlagJoin): AdminFlagListItem {
  const { flag } = join;
  return {
    id: flag.id,
    type: flag.type,
    status: flag.status,

    aircraftId: flag.aircraftId,
    reg: join.reg,
    aircraftType: join.aircraftType,

    sessionUuids: flag.sessionUuids,
    details: flag.details,

    createdAt: flag.createdAt.toISOString(),
    resolvedAt: flag.resolvedAt?.toISOString() ?? null,
    resolvedBy: flag.resolvedBy,
    resolutionNote: flag.resolutionNote,

    blocksExport: blocksExport(flag),
  };
}
