/**
 * UZ Aero (serwer) - `BugReportRecord` (port) → `AdminBugReport` (kontrakt panelu).
 *
 * Czysta funkcja, jak reszta katalogu: cała różnica między jednym a drugim to daty
 * zamienione na ISO. Granica typów istnieje mimo to i nie jest ozdobą - port opisuje,
 * co umie MAGAZYN, a kontrakt to, co widzi PRZEGLĄDARKA; gdy jedno przestanie
 * odpowiadać drugiemu, ta funkcja jest miejscem, w którym to widać.
 */

import type { BugReportRecord } from '../../common/ports.ts';
import type { AdminBugReport } from '../contracts/bugReports.ts';

export const bugReport = (r: BugReportRecord): AdminBugReport => ({
  uuid: r.uuid,
  createdAt: r.createdAt.toISOString(),
  receivedAt: r.receivedAt.toISOString(),
  pilotId: r.pilotId,
  pilotCode: r.pilotCode,
  pilotName: r.pilotName,
  severity: r.severity,
  description: r.description,
  screen: r.screen,
  appVersion: r.appVersion,
  sessionUuid: r.sessionUuid,
  context: r.context,
  status: r.status,
  statusNote: r.statusNote,
  // Panel dostaje KOD, nie identyfikator: „TMK" mówi coś człowiekowi, uuid nie mówi nic.
  statusBy: r.statusByCode,
  statusAt: r.statusAt?.toISOString() ?? null,
});
