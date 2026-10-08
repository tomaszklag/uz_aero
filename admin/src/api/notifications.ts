/**
 * Ninerdeck - panel: SKRZYNKA POWIADOMIEŃ zalogowanego (`/admin/api/me/notifications*`;
 * 4.0.0, K7 `docs/kanal-klubu.md`, epik KK-D #246).
 *
 * Ta sama skrzynka, co w telefonie - wspólne „przeczytane": wiadomość otwarta tutaj
 * gaśnie przy dzwonku na Pulpicie telefonu. Ma ją każdy aktywny członek klubu, bez
 * zdolności; sesja platformowa jej nie ma (401).
 */

import type { InboxPageDto } from './dto';
import { apiGet, apiPost } from './httpClient';

/** Kursor strony - para (chwila, identyfikator) ostatniego wiersza poprzedniej strony. */
export interface InboxCursor {
  at: string;
  id: string;
}

export const INBOX_PAGE = 30;

/** Strona skrzynki; bez kursora - najnowsze. */
export function getInbox(before: InboxCursor | null): Promise<InboxPageDto> {
  const query = new URLSearchParams({ limit: String(INBOX_PAGE) });
  if (before != null) {
    query.set('beforeAt', before.at);
    query.set('beforeId', before.id);
  }
  return apiGet<InboxPageDto>(`/me/notifications?${query.toString()}`);
}

/** Przeczytanie jednej wiadomości (`204`); cudza albo nieistniejąca - `404`. */
export async function markNotificationRead(id: string): Promise<void> {
  await apiPost<null>(`/me/notifications/${encodeURIComponent(id)}/read`);
}
