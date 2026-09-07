/**
 * UZ Aero (serwer) - wiersz projekcji `sessions` → fakty treści operacji (issue #75).
 *
 * Domena rozstrzyga, co jest operacją, a co pustym zapisem (`operationSubstance`
 * w @uzaero/domain); ten mapper tylko TŁUMACZY kolumny wiersza na jej fakty, żeby
 * czytelnicy wiersza (eksporter karty doby) pytali TĘ SAMĄ regułę, którą liczy telefon
 * i którą listy panelu mają w SQL-u (`pg/substanceSql.ts`). Zero arytmetyki - same
 * przepisania i koalescencje, jak w każdym mapperze tej warstwy.
 */

import { isEmptyOperation, type OperationSubstanceFacts } from '@uzaero/domain';

import type { SessionRow } from '../ports.ts';

/** Fakty treści z wiersza projekcji - odpowiednik `substanceFacts` liczonego na telefonie. */
export function rowSubstanceFacts(row: SessionRow): OperationSubstanceFacts {
  return {
    engineRan: row.engineStartAt != null,
    flightCount: row.flightsCount,
    fuelAddedL: row.fuelAddedL ?? 0,
    oilAddedL: row.oilAddedL ?? 0,
    fuelStartL: row.fuelStartL,
    fuelEndL: row.fuelEndL,
    mhStart: row.mhStart,
    mhEnd: row.mhEnd,
    closed: row.status === 'closed',
  };
}

/** Czy wiersz jest PUSTĄ operacją (issue #75 pkt 2) - skrót dla czytelników wiersza. */
export const isEmptySessionRow = (row: SessionRow): boolean =>
  isEmptyOperation(rowSubstanceFacts(row));
