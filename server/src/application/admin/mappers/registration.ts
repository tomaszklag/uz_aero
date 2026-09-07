/**
 * UZ Aero (serwer) - `RegistrationRecord` (port) → `AdminRegistration` (kontrakt panelu).
 *
 * Czysta funkcja, jak reszta katalogu: daty na ISO, kod decydenta pod nazwą, którą
 * rozumie przeglądarka. Granica typów nie jest ozdobą - port opisuje, co umie MAGAZYN,
 * kontrakt to, co widzi PRZEGLĄDARKA; gdy jedno przestanie odpowiadać drugiemu,
 * ta funkcja jest miejscem, w którym to widać.
 */

import type { AdminRegistration } from '../contracts/registrations.ts';
import type { RegistrationRecord } from '../ports.ts';

export const registration = (r: RegistrationRecord): AdminRegistration => ({
  provider: r.provider,
  subject: r.subject,
  email: r.email,
  name: r.name,
  status: r.status,
  rejectReason: r.rejectReason,
  createdAt: r.createdAt.toISOString(),
  lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  // Panel dostaje KOD, nie identyfikator: „TMK" mówi coś człowiekowi, uuid nie mówi nic.
  decidedBy: r.decidedByCode,
  pilotId: r.pilotId,
  pilotCode: r.pilotCode,
});
