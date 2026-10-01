/**
 * Ninerdeck (serwer) - SKRZYNKA NA DRUCIE: strona z zapytania i odpowiedź (3.1.0,
 * issue #164; panel od 4.0.0 - K7, `docs/kanal-klubu.md`, epik Z-E #246).
 *
 * Wspólne dla `GET /me/notifications` (telefon) i `GET /admin/api/me/notifications`
 * (panel). Obie powierzchnie rysują wiersz skrzynki tym samym kształtem, co ramka
 * `notification` kanału klubu (`inboxItem.ts`), i przewijają listę tym samym kursorem -
 * dwie kopie rozjechałyby się przy pierwszym nowym polu.
 */

import { z } from 'zod';

import { inboxItem, type InboxItem } from '../../../application/common/notify/inboxItem.ts';
import type { NotificationCursor } from '../../../application/common/ports.ts';
import type { InboxView } from '../../../application/common/queries/notifications.ts';

/**
 * Strona skrzynki. Kursor jest PARĄ (stempel + identyfikator): powiadomienia jednej
 * decyzji rodzą się w tej samej transakcji, więc sam stempel nie porządkuje ich
 * jednoznacznie i strona potrafiłaby zgubić wiersz.
 */
const pageQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  beforeAt: z.string().datetime().optional(),
  beforeId: z.string().min(1).max(100).optional(),
});

const DEFAULT_LIMIT = 30;

export interface InboxPage {
  limit: number;
  before?: NotificationCursor;
}

/**
 * Strona z zapytania; `null` = żądanie złe (400). Kursor NIEPEŁNY jest błędem, a nie
 * cichym „od początku": strona od początku wygląda jak strona z wynikami, więc klient
 * pętliłby się po pierwszej stronie i nikt by tego nie zauważył.
 */
export function inboxPageOf(query: unknown): InboxPage | null {
  const parsed = pageQuery.safeParse(query);
  if (!parsed.success) return null;
  const q = parsed.data;
  if ((q.beforeAt == null) !== (q.beforeId == null)) return null;
  return {
    limit: q.limit ?? DEFAULT_LIMIT,
    before:
      q.beforeAt == null || q.beforeId == null
        ? undefined
        : { createdAt: Date.parse(q.beforeAt), id: q.beforeId },
  };
}

export interface InboxWire {
  /** Strefa klubu - wiersze liczą godziny terminu z granic jego doby (`InboxItem.day`). */
  timezone: string;
  /** Nieprzeczytane w CAŁEJ skrzynce - liczba przy dzwonku. */
  unread: number;
  items: InboxItem[];
}

export function inboxWire(view: InboxView, timezone: string): InboxWire {
  return { timezone, unread: view.unread, items: view.items.map((n) => inboxItem(n, timezone)) };
}
