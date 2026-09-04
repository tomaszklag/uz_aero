/**
 * UZ Aero - panel 2.0: zgłoszenia rejestracyjne (`/admin/api/registrations*`,
 * logowanie Google 2026-09-04; `docs/logowanie-google.md` §8).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * == ZATWIERDZENIE TO ZALOZENIE KONTA ==
 * Ciało zatwierdzenia jest formularzem konta BEZ e-maila: adres przychodzi ze zgłoszenia
 * (to tożsamość Google) i administrator go nie wpisuje. Odpowiedź niesie nowe konto
 * i zgłoszenie po decyzji - panel unieważnia OBIE listy (zgłoszeń i pilotów).
 */

import type {
  PilotListItemDto,
  PilotRole,
  RegistrationDto,
  RegistrationPageDto,
  RegistrationStatusDto,
} from './dto';
import { apiGet, apiPost } from './httpClient';

export interface RegistrationListQuery {
  /** Puste = wszystkie; domyślny widok panelu to sama kolejka (`pending`). */
  statuses: RegistrationStatusDto[];
}

export function listRegistrations(query: RegistrationListQuery): Promise<RegistrationPageDto> {
  const status = query.statuses.join(',');
  return apiGet<RegistrationPageDto>(`/registrations${status === '' ? '' : `?status=${status}`}`);
}

/** Adres decyzji: klucz `(provider, subject)` prosto z tabeli, bez surogatu. */
const decisionPath = (provider: string, subject: string, action: 'approve' | 'reject'): string =>
  `/registrations/${encodeURIComponent(provider)}/${encodeURIComponent(subject)}/${action}`;

export interface ApproveRegistrationBody {
  code: string;
  name: string;
  role: PilotRole;
}

export interface ApproveRegistrationResult {
  pilot: PilotListItemDto;
  registration: RegistrationDto;
}

export function approveRegistration(
  provider: string,
  subject: string,
  body: ApproveRegistrationBody,
): Promise<ApproveRegistrationResult> {
  return apiPost<ApproveRegistrationResult>(decisionPath(provider, subject, 'approve'), body);
}

export function rejectRegistration(
  provider: string,
  subject: string,
  reason: string,
): Promise<{ registration: RegistrationDto }> {
  return apiPost<{ registration: RegistrationDto }>(decisionPath(provider, subject, 'reject'), {
    reason,
  });
}
