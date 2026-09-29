/**
 * Ninerdeck (serwer) - STRONA ROZMOWY w zleceniu (4.0.0, issue #245; `docs/zlecenia.md`
 * §7, §10.5; makiety 29, 29A, 29B).
 *
 * Czytają uczestnicy (autor prowadzący zlecenie i adresat) oraz osoby
 * z `reservations.manage` (pkt 19). Odpowiedź mówi też, czy da się pisać i dlaczego nie -
 * ekran stawia powód w polu wiadomości (pole i WYŚLIJ to jedna kontrolka, issue #55).
 *
 * Strona idzie od najnowszej wiadomości, kursorem PARĄ `(created_at, id)` - wiadomości
 * tej samej chwili nie gubią się na granicy strony (wzorzec skrzynki).
 */

import { threadRole, threadWritable, type ThreadRefusal } from '../commands/threads.ts';
import type { OrderActor } from '../orderAccess.ts';
import type { OrderRecords } from '../orderRecords.ts';
import type {
  Database,
  ThreadMessageCursor,
  ThreadMessageRecord,
  ThreadMessagesPort,
  ThreadsPort,
} from '../ports.ts';

export interface ThreadPageView {
  role: 'participant' | 'reader';
  /** `null` = da się pisać; inaczej powód w polu wiadomości. */
  closed: Extract<ThreadRefusal, 'read_only' | 'thread_closed'> | null;
  threadId: string | null;
  /** Uczestnicy z odczytem - „Odczytane 14:05" pod ostatnią wiadomością. */
  participants: Array<{ pilotId: string; lastReadAt: number | null }>;
  /** Od najnowszej. */
  messages: ThreadMessageRecord[];
  /** Kursor następnej (starszej) strony; `null` = to już początek rozmowy. */
  next: ThreadMessageCursor | null;
}

export class ThreadQueries {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly threads: ThreadsPort,
    private readonly messages: ThreadMessagesPort,
  ) {}

  /** `null` = zlecenie, adresat albo rozmowa nie istnieją dla pytającego → 404. */
  async page(
    orgId: string,
    actor: OrderActor,
    orderId: string,
    recipientId: string,
    page: { before?: ThreadMessageCursor; limit: number },
  ): Promise<ThreadPageView | null> {
    const loaded = await this.records.read(this.db, orgId, orderId);
    if (loaded == null) return null;
    const row = loaded.recipients.find((r) => r.pilotId === recipientId);
    if (row == null) return null;
    const role = threadRole(loaded, actor, recipientId);
    if (role == null) return null;

    const closed = role === 'reader' ? 'read_only' : threadWritable(loaded, row) ? null : 'thread_closed';
    if (row.threadId == null) {
      return {
        role,
        closed,
        threadId: null,
        participants: [loaded.order.createdBy, recipientId].map((pilotId) => ({ pilotId, lastReadAt: null })),
        messages: [],
        next: null,
      };
    }

    const thread = await this.threads.byId(this.db, orgId, row.threadId);
    // O jedną więcej niż strona - tak wiadomo, czy jest dalej, bez osobnego liczenia.
    const rows = await this.messages.page(this.db, orgId, row.threadId, { before: page.before, limit: page.limit + 1 });
    const messages = rows.slice(0, page.limit);
    const last = messages[messages.length - 1];
    return {
      role,
      closed,
      threadId: row.threadId,
      participants: thread?.participants ?? [],
      messages,
      next: rows.length > page.limit && last != null ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
