/**
 * UZ Aero (serwer) — wiersz projekcji + złączenia → DTO listy dni (`A02`).
 *
 * Osobny, nazwany moduł z tego samego powodu co `application/sessionRow.ts` po stronie
 * zapisu: to CZYSTA funkcja, więc testuje się ją na liczbach bez bazy, a zapytanie
 * w adapterze zostaje samym SQL-em.
 *
 * **Ta funkcja niczego nie liczy.** Przepisuje wartości, które policzyła projekcja
 * (`sessionRowFrom(projectSession(stream))`), i dokłada pola ze złączeń. Gdyby pojawiła
 * się tu arytmetyka — choćby „delta MH = koniec − start" — byłoby to drugie, równoległe
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

    // Nazwa pola DTO idzie za zawartością, nie za nazwą kolumny: `sessions.claim_time`
    // niesie duty start z `preflight_confirm` (uzasadnienie: `application/sessionRow.ts`).
    // Panel ma nazywać rzeczy tym, czym są — inaczej powiela nieporozumienie dalej.
    dutyStart: row.claimTime,
    closeTime: row.closeTime,

    blockMs: row.blockMs,
    flightMs: row.flightMs,
    flightsCount: row.flightsCount,
    mhStart: row.mhStart,
    mhEnd: row.mhEnd,
    fuelStartL: row.fuelStartL,
    fuelEndL: row.fuelEndL,

    openFlags: join.openFlags,
    exportRevision: join.exportRevision,
    updatedAt: join.updatedAt.toISOString(),
  };
}
