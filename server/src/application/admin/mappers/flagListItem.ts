/**
 * Ninerdeck (serwer) - flaga + złączenia → DTO skrzynki (`A03`; 3.2.0: `sprawdzenie-rozjazdy`).
 *
 * Czysta funkcja, testowana bez bazy (wzorzec `application/sessionRow.ts`).
 *
 * Jedyne pole WYLICZONE to `blocksExport`, i to nie jest wygoda: skrzynka sortuje po
 * nim sprawy, a kolumna „Skutek" mówi administratorowi wprost, czy jakaś karta dnia
 * stoi przez tę flagę poza arkuszem. Predykat pochodzi z bramki eksportera, żeby
 * panel i `DayExporter` nie mogły powiedzieć czegoś innego.
 *
 * ══ OPERACJE FLAGI SĄ NAZWANE, NIE ADRESOWANE (3.2.0, P-D) ══
 * `sessionUuids` zostają (adresują), a obok jadą te same operacje w kształcie, którym
 * skrzynka je NAZYWA: sygnatura, pilot, chwile, karta doby. Nazwy przychodzą z listy
 * operacji (`SessionsAdminPort.byUuids` → `sessionListItem`), więc sygnatura tu i na
 * poziomie 2 dziennika to jedno wyliczenie (issue #68). Operacja nieznana projekcji
 * (rejestr niekompletny) po prostu tu nie stoi - panel wraca do uuid-a.
 */

import { blocksExport } from '../../common/export/dayExporter.ts';
import { sheetTabName } from '../../common/export/daySheetContent.ts';
import type { AdminFlagListItem, AdminFlagSession } from '../contracts/flags.ts';
import type { AdminFlagJoin, AdminSessionJoin } from '../ports.ts';
import { sessionListItem } from './sessionListItem.ts';

/** Operacja w kształcie skrzynki - z wiersza listy operacji, nic nie liczy drugi raz. */
export function flagSession(join: AdminSessionJoin): AdminFlagSession {
  const item = sessionListItem(join);
  return {
    sessionUuid: item.sessionUuid,
    signature: item.signature,
    aircraftId: item.aircraftId,
    reg: item.reg,
    picId: item.picId,
    picCode: item.picCode,
    picName: item.picName,
    status: item.status,
    claimedAt: item.claimedAt,
    closeTime: item.closeTime,
    // Nazwa karty TĄ SAMĄ funkcją, którą eksporter nazywa kartę przy zapisie - nakładka
    // mówi „trzyma kartę 2026-09-06_SP-KLM poza arkuszem" i ma trafić w istniejącą nazwę.
    tab: item.claimedAt == null ? null : sheetTabName(item.claimedAt, item.aircraftId),
  };
}

export function flagListItem(
  join: AdminFlagJoin,
  sessions: ReadonlyMap<string, AdminFlagSession>,
): AdminFlagListItem {
  const { flag } = join;
  return {
    id: flag.id,
    type: flag.type,
    status: flag.status,

    aircraftId: flag.aircraftId,
    reg: join.reg,
    aircraftType: join.aircraftType,
    mhFormat: join.mhFormat,

    sessionUuids: flag.sessionUuids,
    sessions: flag.sessionUuids
      .map((uuid) => sessions.get(uuid))
      .filter((session): session is AdminFlagSession => session != null),
    details: flag.details,

    createdAt: flag.createdAt.toISOString(),
    resolvedAt: flag.resolvedAt?.toISOString() ?? null,
    resolvedBy: flag.resolvedBy,
    resolutionNote: flag.resolutionNote,

    blocksExport: blocksExport(flag),
  };
}
