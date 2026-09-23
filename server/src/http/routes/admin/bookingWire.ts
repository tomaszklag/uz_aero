/**
 * Ninerdeck (serwer) - ZAJĘTOŚĆ NA DRUCIE dla PANELU (milestone 3.0.0, issue #158 B6;
 * od 3.1.0 wspólna dla kalendarza, kolejki decyzji i karty rezerwacji - issue #165).
 *
 * Pełna, razem ze śladem zamknięcia i autorem - inaczej niż na telefonie, gdzie kształt
 * pyta, KTO PATRZY (§17). Panel ma własną zdolność i własną robotę: administrator widzi
 * komplet, bo rozstrzyga cudze sprawy. Jedna funkcja, bo trzy trasy niosące tę samą
 * zajętość w trzech kształtach rozjechałyby się przy pierwszym nowym polu.
 */

import type { BookingRecord } from '../../../application/common/ports.ts';

export function bookingWire(row: BookingRecord): Record<string, unknown> {
  return {
    id: row.id,
    aircraftId: row.aircraftId,
    kind: row.kind,
    status: row.status,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    pilotId: row.pilotId,
    dualId: row.dualId,
    operation: row.operation,
    fromIcao: row.fromIcao,
    toIcao: row.toIcao,
    plannedAirMin: row.plannedAirMin,
    plannedFuelL: row.plannedFuelL,
    sessionUuid: row.sessionUuid,
    blockReason: row.blockReason,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    closedAt: row.closedAt == null ? null : new Date(row.closedAt).toISOString(),
    closeReason: row.closeReason,
  };
}
