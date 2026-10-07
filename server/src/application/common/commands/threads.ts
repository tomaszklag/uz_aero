/**
 * Ninerdeck (serwer) - ROZMOWA ZLECAJĄCEGO Z ADRESATEM: wiadomość i odczyt (4.0.0,
 * issue #245; `docs/zlecenia.md` §7).
 *
 * ══ JEDEN WĄTEK NA PARĘ ZLECENIE × ADRESAT, DWIE OSOBY PISZĄ ══
 * Wątek zakłada pierwsza wiadomość z którejkolwiek strony. Piszą dokładnie autor zlecenia
 * i adresat; prowadzący inny niż autor wątków nie prowadzi (pkt 20), a osoby
 * z `reservations.manage` czytają bez pisania (pkt 19) - i ich odczyt nie zapala
 * „Odczytane" ani nie gasi nieprzeczytanych uczestnikom.
 *
 * ══ ROZMOWA ZAMYKA SIĘ Z GRĄ ADRESATA (28B) ══
 * Zlecenie odwołane, wygasłe, odebrane albo z fotelem obsadzonym przez kogoś innego -
 * rozmowa zostaje do odczytu, po OBU stronach. Autor nie dopisze się do wątku kogoś,
 * dla kogo zlecenie jest już nieaktualne: ten ktoś nie mógłby mu odpisać.
 *
 * ══ SKRZYNKA NIE ZALEWA SIĘ (§7.3) ══
 * Nowa wiadomość odświeża JEDEN nieprzeczytany wiersz „Wiadomość w zleceniu" na wątek
 * (z licznikiem), ale budzi przy KAŻDEJ wiadomości - to jest rozmowa.
 */

import { inPlay } from '../../../domain/orderAnswers.ts';
import type { Notifier, RecordedNotice } from '../notify/notifier.ts';
import { orderMessage } from '../notify/orderNotices.ts';
import type { OrderSignals } from '../notify/orderSignals.ts';
import { leads, noticeOrderOf, orderView, recipientView, type OrderActor } from '../orderAccess.ts';
import type { LoadedOrder, OrderRecords } from '../orderRecords.ts';
import type {
  Clock,
  Database,
  OrderRecipientRecord,
  OrderRecipientsPort,
  ThreadMessageRecord,
  ThreadMessagesPort,
  ThreadsPort,
} from '../ports.ts';

/** Długość wiadomości - ta sama granica, co CHECK w bazie (§7.2). */
export const MESSAGE_MAX = 2000;

export type ThreadRefusal =
  /** Koordynator czyta cudzą rozmowę, ale do niej nie pisze (pkt 19). */
  | 'read_only'
  /** Rozmowa do odczytu: zlecenie zamknięte, odebrane albo nieaktualne dla adresata (28B). */
  | 'thread_closed'
  /** Pusta albo za długa wiadomość. */
  | 'message_invalid'
  /** Identyfikator wiadomości zajęty w innym klubie - dla tego klubu to kolizja, nie powtórka. */
  | 'message_exists';

export type SendResult =
  | { ok: true; message: ThreadMessageRecord; created: boolean }
  | { ok: false; refusal: ThreadRefusal };

/** Kim jest pytający wobec wątku - uczestnik, czytający albo nikt (404). */
export type ThreadRole = 'participant' | 'reader' | null;

/**
 * Rola wobec wątku `adresat`. Adresat wskazuje wyłącznie siebie; autor prowadzący
 * zlecenie pisze z każdym adresatem; `reservations.manage` czyta każdą rozmowę klubu.
 */
export function threadRole(loaded: LoadedOrder, actor: OrderActor, recipientId: string): ThreadRole {
  const author = loaded.order.createdBy === actor.pilotId && leads(loaded.order, actor);
  if (actor.pilotId === recipientId || author) return 'participant';
  return actor.manages ? 'reader' : null;
}

/** Czy do rozmowy z tym adresatem da się jeszcze pisać (28B). */
export function threadWritable(loaded: LoadedOrder, row: OrderRecipientRecord): boolean {
  return inPlay(orderView(loaded.order, loaded.booking), recipientView(row, loaded.order.revision));
}

const refused = (refusal: ThreadRefusal) => ({ kind: 'refused' as const, refusal });

export class ThreadCommands {
  constructor(
    private readonly db: Database,
    private readonly records: OrderRecords,
    private readonly recipients: OrderRecipientsPort,
    private readonly threads: ThreadsPort,
    private readonly messages: ThreadMessagesPort,
    private readonly notifier: Notifier,
    private readonly signals: OrderSignals,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  /**
   * Wiadomość od uczestnika (uuid klienta: powtórzony `POST` przy słabym łączu to ta sama
   * wiadomość i nikt nie dostaje jej drugi raz). `null` = zlecenie, adresat albo wątek nie
   * istnieją dla pytającego → 404.
   */
  async send(
    orgId: string,
    actor: OrderActor,
    orderId: string,
    recipientId: string,
    input: { id: string; body: string },
  ): Promise<SendResult | null> {
    const body = input.body.trim();
    const now = this.clock.now();

    const written = await this.db.transaction(async (tx) => {
      // Blokada wiersza zlecenia porządkuje ZAŁOŻENIE wątku: dwie pierwsze wiadomości
      // z obu stron naraz trafiają do jednego wątku, a nie do dwóch.
      const loaded = await this.records.lock(tx, orgId, orderId);
      if (loaded == null) return null;
      const row = loaded.recipients.find((r) => r.pilotId === recipientId);
      if (row == null) return null;
      const role = threadRole(loaded, actor, recipientId);
      if (role == null) return null;
      if (role === 'reader') return refused('read_only');
      if (!threadWritable(loaded, row)) return refused('thread_closed');
      if (body.length === 0 || body.length > MESSAGE_MAX) return refused('message_invalid');

      let threadId = row.threadId;
      if (threadId == null) {
        threadId = this.newId();
        await this.threads.create(
          tx,
          orgId,
          { id: threadId, subjectKind: 'order', subjectId: orderId, participantIds: [loaded.order.createdBy, recipientId] },
          now,
        );
        await this.recipients.attachThread(tx, orgId, orderId, recipientId, threadId);
      }

      const inserted = await this.messages.insert(tx, orgId, { id: input.id, threadId, authorId: actor.pilotId, body }, now);
      if (inserted == null) return refused('message_exists');
      if (!inserted.created) {
        return { kind: 'sent' as const, message: inserted.message, created: false, loaded, notices: [] as RecordedNotice[] };
      }

      // Drugi uczestnik dostaje jeden wiersz na wątek - z liczbą nieprzeczytanych.
      const other = actor.pilotId === recipientId ? loaded.order.createdBy : recipientId;
      const unread = await this.messages.unreadFor(tx, orgId, threadId, other);
      const notice = orderMessage(noticeOrderOf(loaded.order, loaded.booking), other, {
        threadId,
        recipientId,
        authorId: actor.pilotId,
        unread,
        body,
      });
      const notices = await this.notifier.recordCollapsed(tx, orgId, notice, { field: 'threadId', value: threadId }, now);
      return { kind: 'sent' as const, message: inserted.message, created: true, loaded, notices };
    });

    if (written == null) return null;
    if (written.kind === 'refused') return { ok: false, refusal: written.refusal };
    if (written.created) {
      await this.notifier.wake(orgId, written.notices);
      this.signals.message(
        orgId,
        { orderId, recipientId, participantIds: [written.loaded.order.createdBy, recipientId] },
        written.message,
      );
    }
    return { ok: true, message: written.message, created: written.created };
  }

  /**
   * Odczyt rozmowy przez UCZESTNIKA - „Odczytane 14:05" pod ostatnią wiadomością. Czytający
   * z `reservations.manage` dostaje zwykłe „w porządku" bez skutku: jego odczyt nie zapala
   * „Odczytane" (pkt 19), a ekran może wołać odczyt bez sprawdzania, kim jest.
   */
  async read(orgId: string, actor: OrderActor, orderId: string, recipientId: string): Promise<{ ok: true } | null> {
    const loaded = await this.records.read(this.db, orgId, orderId);
    if (loaded == null) return null;
    const row = loaded.recipients.find((r) => r.pilotId === recipientId);
    if (row == null) return null;
    const role = threadRole(loaded, actor, recipientId);
    if (role == null) return null;
    if (role === 'reader' || row.threadId == null) return { ok: true };

    const now = this.clock.now();
    const marked = await this.threads.markRead(this.db, orgId, row.threadId, actor.pilotId, now);
    if (marked) {
      this.signals.read(
        orgId,
        { orderId, recipientId, participantIds: [loaded.order.createdBy, recipientId] },
        { pilotId: actor.pilotId, at: now },
      );
    }
    return { ok: true };
  }
}
