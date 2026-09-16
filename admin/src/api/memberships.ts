/**
 * Ninerdeck - panel: kolejka zgłoszeń kodem klubu (`/admin/api/memberships*`).
 *
 * Jeden plik = jeden zasób = jeden prefiks trasy, jak `server/src/http/routes/`.
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice, a co z nimi zrobić,
 * decyduje `queries/`.
 *
 * ══ OSOBNY ZASÓB OD `pilots.ts`, BO TO INNY BYT NA EKRANIE ══
 * Wiersz listy opisuje CZŁONKA klubu: ma kod pilota, rolę i status. Wiersz kolejki
 * opisuje KANDYDATA - kodu jeszcze nie ma (nadaje się go dopiero decyzją), roli też nie.
 * Osobne trasy mają przy tym osobną zdolność (`accounts.manage` także na ODCZYT), bo
 * w kolejce stoją adresy e-mail ludzi, których w klubie NIE MA.
 *
 * ══ TRZY DECYZJE, KAŻDA W JEDNĄ STRONĘ ══
 * Zatwierdzenie (`pending` → `active`), odrzucenie (`pending` → `rejected`) i cofnięcie
 * odrzucenia (`rejected` → `pending`). Zatwierdzenie NIE przyjmuje odrzuconego: zdjęcie
 * cudzej odmowy jest osobną decyzją i ma własny ślad w dzienniku.
 */

import type {
  MembershipApprovalBody,
  MembershipDecisionDto,
  MembershipQueueDto,
  PilotChangeDto,
} from './dto';
import { apiGet, apiPost } from './httpClient';

/** Zgłoszenia czekające na decyzję - karta ZGŁOSZENIA nad listą pilotów. */
export function listPendingMemberships(): Promise<MembershipQueueDto> {
  return apiGet<MembershipQueueDto>('/memberships/pending');
}

/**
 * Zatwierdzenie oddaje WIERSZ LISTY, nie stan członkostwa: wpuszczony kandydat jest odtąd
 * członkiem, a nie pozycją kolejki, i panel dostaje go w kształcie, w jakim go pokaże.
 */
export function approveMembership(
  pilotId: string,
  body: MembershipApprovalBody,
): Promise<PilotChangeDto> {
  return apiPost<PilotChangeDto>(`/memberships/${encodeURIComponent(pilotId)}/approve`, body);
}

/** Powód jest WYMAGANY - pilot czyta go na swoim telefonie i to jego jedyna wiadomość. */
export function rejectMembership(
  pilotId: string,
  reason: string,
): Promise<{ membership: MembershipDecisionDto }> {
  return apiPost<{ membership: MembershipDecisionDto }>(
    `/memberships/${encodeURIComponent(pilotId)}/reject`,
    { reason },
  );
}

/** Cofnięcie odrzucenia - zgłoszenie wraca do kolejki, kod i rolę nadaje się potem. */
export function reopenMembership(pilotId: string): Promise<{ membership: MembershipDecisionDto }> {
  return apiPost<{ membership: MembershipDecisionDto }>(
    `/memberships/${encodeURIComponent(pilotId)}/reopen`,
  );
}
