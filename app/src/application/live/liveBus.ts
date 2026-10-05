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
 * gubi - po wznowieniu łącza (`reopened`) KAŻDY podpięty ekran dociąga stan zwykłym
 * odczytem, bo w przerwie mogło przepaść cokolwiek.
 *
 * Tematy są kontraktem z serwerem (`server/src/application/common/live/topics.ts`):
 * wzorzec bez dwukropka łapie cały rodzaj (`calendar` - każda doba), z dwukropkiem -
 * dokładnie ten temat (`booking:<id>`). Jeden wyjątek jest LOKALNY: `inbox` - ramka
 * `notification` jest dla skrzynki tym, czym `changed` dla kalendarza, więc ekrany
 * skrzynki podpinają się tak samo, jak każdy inny.
 */

import type { LiveDataFrame } from './frames';

/** Temat lokalny telefonu: nowa wiadomość w skrzynce (ramka `notification`). */
export const INBOX_TOPIC = 'inbox';

/** Wzorzec bez dwukropka = cały rodzaj tematów, z dwukropkiem = dokładnie ten temat. */
export function topicMatches(pattern: string, topic: string): boolean {
  if (pattern.includes(':')) return pattern === topic;
  return topic === pattern || topic.startsWith(`${pattern}:`);
}

interface Subscription {
  topics: readonly string[];
  refresh: () => void;
}

export class LiveBus {
  private readonly subscriptions = new Set<Subscription>();

  /** Ekran podpina się tematami; wynik odpina go (zejście ze stosu, zmiana tematów). */
  subscribe(topics: readonly string[], refresh: () => void): () => void {
    const subscription: Subscription = { topics, refresh };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /** Ramka z danymi od łącza - każdy pasujący ekran odświeża się RAZ, choćby pasowało kilka tematów. */
  publish(frame: LiveDataFrame): void {
    const topics = frame.type === 'changed' ? frame.topics : [INBOX_TOPIC];
    this.dispatch((s) => s.topics.some((pattern) => topics.some((topic) => topicMatches(pattern, topic))));
  }

  /** Łącze wróciło po przerwie - KAŻDY podpięty ekran dociąga stan (K2). */
  reopened(): void {
    this.dispatch(() => true);
  }

  /**
   * Rozsyłanie po migawce, ale z pytaniem o obecność: ekran odpięty w trakcie (zszedł ze
   * stosu w odpowiedzi na inne odświeżenie) nie dostaje już tej ramki, a pozostali nie
   * przepadają przez zmianę zbioru w środku pętli - zasada jak przy zdarzeniach DOM.
   */
  private dispatch(wanted: (subscription: Subscription) => boolean): void {
    for (const subscription of [...this.subscriptions]) {
      if (this.subscriptions.has(subscription) && wanted(subscription)) subscription.refresh();
    }
  }
}
