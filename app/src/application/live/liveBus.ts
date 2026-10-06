/**
 * Ninerdeck - SZYNA KANAŁU KLUBU w aplikacji pilota (4.0.0, `docs/kanal-klubu.md` §3.4,
 * K1, K2; epik KK-C #246).
 *
 * Łącze ma jedno zadanie - trzymać połączenie; szyna ma drugie - powiedzieć ekranom, że
 * coś, co pokazują, się zmieniło. Ekran podpina się TEMATAMI i funkcją odświeżenia
 * (hak `useLiveTopic` w UI), a o kanale nie wie nic więcej: nie zna gniazda, ramek ani
 * klubu. Dzięki temu żaden ekran niczego nie odpytuje (K1) - pętle ponawiania co minutę
 * zastępuje jeden podpięty temat.
 *
 * Sygnał NIE NIESIE TREŚCI (K2): ekran po nim czyta od nowa RESTem, więc kształt danych
 * per widz liczy jak zawsze serwer. Z tego samego powodu zgubiona ramka niczego nie
 * gubi - po każdym powitaniu łącza (`reopened`) KAŻDY podpięty ekran dociąga stan
 * zwykłym odczytem, bo bez połączenia mogło przepaść cokolwiek.
 *
 * SERIA SYGNAŁÓW TO JEDNO ODŚWIEŻENIE: jedna zmiana przychodzi kilkoma ramkami
 * (rezerwacja z dobą kalendarza, osobno samolot; do tego wiadomość w skrzynce), a ekran
 * podpięty pod kilka tematów pytałby serwer tyle razy, ile ramek. Szyna czeka chwilę
 * (`LIVE_COALESCE_MS`) i odświeża raz - opóźnienie jest niezauważalne, zysk jest
 * w każdej serii.
 *
 * BANER SŁUCHA OSOBNO (`onNotification`): nowa wiadomość idzie do niego OD RAZU i W CAŁOŚCI,
 * bez sklejania - baner pokazuje treść wiadomości, a nie czyta niczego od nowa, więc nie ma
 * na co czekać, a każda wiadomość jest osobnym banerem (widać ostatni).
 *
 * OTWARTA ROZMOWA SŁUCHA OSOBNO TAK SAMO (`onThread`, epik Z-C #247): ramki `message`
 * i `read` niosą treść w całości (`docs/zlecenia.md` §11), więc rozmowa dopisuje
 * wiadomość i „Odczytane 14:05" od razu, bez pytania serwera.
 *
 * Tematy są kontraktem z serwerem (`server/src/application/common/live/topics.ts`):
 * wzorzec bez dwukropka łapie cały rodzaj (`calendar` - każda doba), z dwukropkiem -
 * dokładnie ten temat (`booking:<id>`). Dwa wyjątki są LOKALNE: `inbox` - ramka
 * `notification` jest dla skrzynki tym, czym `changed` dla kalendarza - i `thread:<id
 * zlecenia>` - ruch w rozmowach zlecenia, po którym karta prowadzącego i lista czytają
 * od nowa liczniki nieprzeczytanych. Ekrany podpinają się pod nie tak samo, jak pod
 * każdy inny temat.
 */

import type { LiveDataFrame, ThreadFrame } from './frames';
import { GLOBAL_TIMERS, type Timers } from './timers';

/** Temat lokalny telefonu: nowa wiadomość w skrzynce (ramka `notification`). */
export const INBOX_TOPIC = 'inbox';

/** Temat lokalny telefonu: ruch w rozmowach zleceń (ramki `message` i `read`). */
export const THREAD_TOPIC = 'thread';

/** Ruch w rozmowach JEDNEGO zlecenia - wszystkie jego rozmowy naraz. */
export function threadTopic(orderId: string): string {
  return `${THREAD_TOPIC}:${orderId}`;
}

/** Ile szyna czeka, zanim odświeży ekran - tyle trwa seria ramek jednej zmiany. */
export const LIVE_COALESCE_MS = 250;

/** Wzorzec bez dwukropka = cały rodzaj tematów, z dwukropkiem = dokładnie ten temat. */
export function topicMatches(pattern: string, topic: string): boolean {
  if (pattern.includes(':')) return pattern === topic;
  return topic === pattern || topic.startsWith(`${pattern}:`);
}

interface Subscription {
  topics: readonly string[];
  refresh: () => void;
  /** Odświeżenie zaplanowane i jeszcze niewykonane - kolejne sygnały się do niego doklejają. */
  pending: unknown;
}

/** Ramka nowej wiadomości - to, co dostaje baner. */
export type NotificationFrame = Extract<LiveDataFrame, { type: 'notification' }>;

export class LiveBus {
  private readonly subscriptions = new Set<Subscription>();
  private readonly notificationListeners = new Set<(frame: NotificationFrame) => void>();
  private readonly threadListeners = new Set<(frame: ThreadFrame) => void>();

  constructor(private readonly timers: Timers = GLOBAL_TIMERS) {}

  /** Ekran podpina się tematami; wynik odpina go (zejście ze stosu, zmiana tematów). */
  subscribe(topics: readonly string[], refresh: () => void): () => void {
    const subscription: Subscription = { topics, refresh, pending: null };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
      // Ekran, który zszedł ze stosu, nie ma czego odświeżać - także w drodze.
      if (subscription.pending != null) this.timers.clear(subscription.pending);
      subscription.pending = null;
    };
  }

  /** Baner podpina się pod nowe wiadomości; wynik go odpina. */
  onNotification(listener: (frame: NotificationFrame) => void): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  /**
   * Otwarta rozmowa podpina się pod ramki rozmów; wynik ją odpina. Ramka przychodzi dla
   * KAŻDEJ rozmowy, którą widzi to urządzenie - swoją wybiera słuchający (zlecenie × adresat).
   */
  onThread(listener: (frame: ThreadFrame) => void): () => void {
    this.threadListeners.add(listener);
    return () => {
      this.threadListeners.delete(listener);
    };
  }

  /**
   * Ramka z danymi od łącza - pasujące ekrany dostają odświeżenie, baner wiadomość,
   * a otwarta rozmowa - wiadomość albo odczyt w całości.
   */
  publish(frame: LiveDataFrame): void {
    if (frame.type === 'notification') {
      for (const listener of [...this.notificationListeners]) listener(frame);
    }
    if (frame.type === 'message' || frame.type === 'read') {
      for (const listener of [...this.threadListeners]) listener(frame);
    }
    const topics = topicsOf(frame);
    for (const subscription of this.subscriptions) {
      const wanted = subscription.topics.some((pattern) => topics.some((topic) => topicMatches(pattern, topic)));
      if (wanted) this.signal(subscription);
    }
  }

  /** Łącze przywitane - KAŻDY podpięty ekran dociąga stan (K2). */
  reopened(): void {
    for (const subscription of this.subscriptions) this.signal(subscription);
  }

  private signal(subscription: Subscription): void {
    if (subscription.pending != null) return;
    subscription.pending = this.timers.set(() => {
      subscription.pending = null;
      if (this.subscriptions.has(subscription)) subscription.refresh();
    }, LIVE_COALESCE_MS);
  }
}

/** Tematy, które ramka zmienia: serwerowe z `changed`, lokalne ze skrzynki i rozmów. */
function topicsOf(frame: LiveDataFrame): readonly string[] {
  switch (frame.type) {
    case 'changed':
      return frame.topics;
    case 'notification':
      return [INBOX_TOPIC];
    case 'message':
    case 'read':
      return [threadTopic(frame.orderId)];
  }
}
