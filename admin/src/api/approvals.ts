/**
 * Ninerdeck - panel: ścieżka akceptacji i kolejka decyzji (`/admin/api/approval-steps`,
 * `/admin/api/approvals/*`, `/admin/api/bookings/:id/decision`; milestone 3.1.0,
 * issue #165).
 *
 * ══ ŚCIEŻKA ZAPISUJE SIĘ CAŁA ══
 * `PUT` niesie KOMPLET kroków w kolejności pytania - numerów pozycji w ciele nie ma,
 * bo dwa źródła kolejności (indeks i pole) rozjeżdżają się przy pierwszym przestawieniu.
 * Krok z `id` zachowuje swoje decyzje, krok bez `id` dostaje nowy identyfikator.
 *
 * ══ DECYZJA Z PANELU JEST TĄ SAMĄ DECYZJĄ, CO Z TELEFONU ══
 * Ten sam rdzeń po drugiej stronie i ten sam rejestr; panel dostaje w odpowiedzi
 * osobę decydującą, bo pyta „do kogo zadzwonić" - telefon nie (§9.4).
 */

import type {
  AircraftPreviewDto,
  ApprovalPathDto,
  ApprovalQueueDto,
  ApprovalStepInputDto,
  ApprovalVerdictDto,
  DecisionResultDto,
  PilotPreviewDto,
} from './dto';
import { apiGet, apiPost, apiPut } from './httpClient';

export function getApprovalSteps(): Promise<ApprovalPathDto> {
  return apiGet<ApprovalPathDto>('/approval-steps');
}

export function replaceApprovalSteps(steps: readonly ApprovalStepInputDto[]): Promise<ApprovalPathDto> {
  return apiPut<ApprovalPathDto>('/approval-steps', { steps });
}

/** Co czeka na MOJĄ zgodę - rezerwacje stojące na kroku, na którego liście jestem. */
export function getApprovalQueue(): Promise<ApprovalQueueDto> {
  return apiGet<ApprovalQueueDto>('/approvals/queue');
}

export interface DecisionBody {
  decision: ApprovalVerdictDto;
  /** Wymagany przy odmowie - rozstrzyga serwer (`reason_required`), nie ten kształt. */
  reason: string | null;
}

export function decideBooking(id: string, body: DecisionBody): Promise<DecisionResultDto> {
  return apiPost<DecisionResultDto>(`/bookings/${encodeURIComponent(id)}/decision`, body);
}

/** Podgląd pilota stojącego na sprawie (issue #206) - osoba spoza sprawy to 404. */
export function getPilotPreview(bookingId: string, pilotId: string): Promise<PilotPreviewDto> {
  return apiGet<PilotPreviewDto>(
    `/bookings/${encodeURIComponent(bookingId)}/preview/pilot/${encodeURIComponent(pilotId)}`,
  );
}

/** Podgląd maszyny sprawy (issue #206). */
export function getAircraftPreview(bookingId: string): Promise<AircraftPreviewDto> {
  return apiGet<AircraftPreviewDto>(`/bookings/${encodeURIComponent(bookingId)}/preview/aircraft`);
}
