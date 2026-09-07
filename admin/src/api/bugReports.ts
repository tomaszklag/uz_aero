/**
 * UZ Aero - panel 2.0: ZGŁOSZENIA BŁĘDÓW (`/admin/api/bug-reports`, issue #87).
 *
 * Warstwa `api/` nie zna Reacta ani cache'u - zwraca obietnice.
 *
 * Moduł ma dokładnie dwie operacje i to jest jego pełny zakres: przeczytać listę
 * i przestawić status. Kasowania nie ma i nie będzie - zgłoszenie nietrafione zamyka
 * się statusem `rejected` z komentarzem, a to niesie więcej niż pusty wiersz po wierszu,
 * którego już nie ma.
 */

import type { BugReportDto, BugReportPageDto, BugStatusDto } from './dto';
import { apiGet, apiPatch } from './httpClient';

/**
 * Filtr statusem. Pusta lista = wszystkie; serwer rozumie `?status=new,in_progress`.
 *
 * Lista, nie pojedyncza wartość, bo domyślny widok panelu to „nowe i w toku" - jedna
 * wartość zmuszałaby ekran do dwóch żądań i sklejania wyniku po swojej stronie.
 */
export interface BugListQuery {
  statuses: readonly BugStatusDto[];
}

export function listBugReports(query: BugListQuery): Promise<BugReportPageDto> {
  const status = query.statuses.join(',');
  return apiGet<BugReportPageDto>(`/bug-reports${status === '' ? '' : `?status=${status}`}`);
}

/**
 * Zmiana statusu. `PATCH`, bo opisuje RÓŻNICĘ - treści zgłoszenia nie zmienia nikt.
 *
 * Odpowiedź niesie stan PO zmianie, więc ekran odświeża wiersz bez drugiego żądania,
 * a stempel i autor pochodzą z serwera, nie z zegara przeglądarki.
 *
 * `note` przy `rejected` jest WYMAGANY (serwer odbija `400 note_required`): odrzucenie
 * bez powodu nie mówi nic ani zgłaszającemu, ani temu, kto za miesiąc czyta listę.
 */
export function setBugStatus(
  uuid: string,
  status: BugStatusDto,
  note: string | null,
): Promise<BugReportDto> {
  return apiPatch<BugReportDto>(`/bug-reports/${encodeURIComponent(uuid)}`, { status, note });
}
