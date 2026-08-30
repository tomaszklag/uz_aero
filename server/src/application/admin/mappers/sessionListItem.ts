/**
 * UZ Aero (serwer) - wiersz projekcji + złączenia → DTO listy dni (`A02`).
 *
 * Osobny, nazwany moduł z tego samego powodu co `application/sessionRow.ts` po stronie
 * zapisu: to CZYSTA funkcja, więc testuje się ją na liczbach bez bazy, a zapytanie
 * w adapterze zostaje samym SQL-em.
 *
 * **Ta funkcja niczego nie liczy.** Przepisuje wartości, które policzyła projekcja
 * (`sessionRowFrom(projectSession(stream))`), i dokłada pola ze złączeń. Gdyby pojawiła
 * się tu arytmetyka - choćby „delta MH = koniec − start" - byłoby to drugie, równoległe
 * wyliczenie obok projekcji, czyli dokładnie to, które zaczyna kłamać
 * (`docs/architektura-panelu-serwer.md` §7.1). Nowa liczba w panelu = nowa KOLUMNA
 * projekcji wypełniana przez `sessionRowFrom`.
 */

import type { AdminSessionListItem } from '../contracts/sessions.ts';
import type { AdminSessionJoin } from '../ports.ts';

export function sessionListItem(join: AdminSessionJoin): AdminSessionListItem {
  const { row } = join;
  return {
    sessionUuid: row.sessionUuid,

    aircraftId: row.aircraftId,
    reg: join.reg,
    aircraftType: join.aircraftType,
    mhFormat: join.mhFormat,

    picId: row.picId,
    picCode: join.picCode,
    picName: join.picName,
    dualId: row.dualId,
    dualCode: join.dualCode,
    dualName: join.dualName,

    status: row.status,
    operation: row.operation,
    client: row.client,

    // Od 2026-08-07 nazwa kolumny i nazwa pola DTO wreszcie znaczą to samo: chwilę
    // przejęcia samolotu (`session_claim`).
    claimedAt: row.claimTime,
    closeTime: row.closeTime,

    blockMs: row.blockMs,
    flightMs: row.flightMs,
    flightsCount: row.flightsCount,
    mhStart: row.mhStart,
    mhEnd: row.mhEnd,
    fuelStartL: row.fuelStartL,
    // Log dnia (2026-08-30): przepisanie kolumn projekcji, bez ani jednego rachunku.
    engineStartAt: row.engineStartAt,
    engineStopAt: row.engineStopAt,
    firstTakeoffAt: row.firstTakeoffAt,
    lastLandingAt: row.lastLandingAt,
    departureIcao: row.departureIcao,
    arrivalIcao: row.arrivalIcao,
    fuelAddedL: row.fuelAddedL,
    oilLevelL: row.oilLevelL,
    oilAddedL: row.oilAddedL,
    takeoffCount: row.takeoffCount,
    landingCount: row.landingCount,
    manualEntry: row.manualEntry,
    oilAfterL: row.oilAfterL,
    fuelEndL: row.fuelEndL,

    openFlags: join.openFlags,
    exportRevision: join.exportRevision,
    updatedAt: join.updatedAt.toISOString(),
  };
}
