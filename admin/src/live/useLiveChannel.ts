/**
 * Ninerdeck - panel: KANAŁ KLUBU w drzewie Reacta (4.0.0, `docs/kanal-klubu.md` §3.4;
 * epik KK-D #246).
 *
 * Jedno połączenie na kartę przeglądarki, WYŁĄCZNIE w sesji klubu - sesja platformowa
 * kanału nie ma (K3). Klucz zakresu (klub i osoba) jest tożsamością połączenia:
 * przełączenie klubu zamyka stare i otwiera nowe - z ciasteczkiem nowej sesji.
 *
 * Co robi z ramkami:
 *  - `changed` → unieważnia zapytania z mapy tematów (`topicKeys.ts`); React Query
 *    pobiera od nowa tylko to, co jest na ekranie;
 *  - wznowienie po zerwaniu → unieważnia wszystko poza tożsamością: zgubiona ramka
 *    niczego nie gubi (K2), bo ekran dociąga stan zwykłym odczytem. Pierwsze połączenie
 *    w karcie tego nie robi - dane właśnie przyszły;
 *  - `bye` → pyta bramę REST (`GET /me`), co to znaczy. Unieważniona sesja, wyłączone
 *    członkostwo albo klub i wygasłe ciasteczko kończą się odpowiedzią `null`, czyli
 *    ekranem logowania - jak przy wylogowaniu, razem z wyczyszczonym cache'em: żadna
 *    pobrana lista nie ma prawa mignąć następnej osobie przy tej przeglądarce. Sesja,
 *    która przeżyła, łączy się od nowa;
 *  - `notification` → wiadomość na górę skrzynki i nowa liczba przy dzwonku, bez
 *    drugiego żądania (pozycja przychodzi w kształcie REST, a liczbę liczy serwer).
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { asInboxItem, withNotification, type InboxData } from '../queries/inboxCache';
import { keys } from '../queries/keys';
import { LiveSocket } from './liveSocket';
import { liveUrl } from './liveUrl';
import { prefixesForTopics } from './topicKeys';

const notIdentity = (query: { queryKey: readonly unknown[] }): boolean => query.queryKey[0] !== keys.me[0];

/** `scopeKey` - klub i osoba sesji klubu; `null` = brak kanału (platforma, brak sesji). */
export function useLiveChannel(scopeKey: string | null): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (scopeKey == null) return;

    const socket = new LiveSocket({
      url: liveUrl(window.location),
      onFrame: (frame) => {
        if (frame.type === 'changed') {
          for (const queryKey of prefixesForTopics(frame.topics)) void qc.invalidateQueries({ queryKey });
          return;
        }
        const item = asInboxItem(frame.item);
        if (item == null) return;
        qc.setQueryData<InboxData>(keys.notifications.inbox, (data) => withNotification(data, item, frame.unread));
      },
      onOpen: (reconnected) => {
        if (reconnected) void qc.invalidateQueries({ predicate: notIdentity });
      },
      onBye: () => {
        void qc.refetchQueries({ queryKey: keys.me }).then(() => {
          if (qc.getQueryData(keys.me) == null) qc.removeQueries({ predicate: notIdentity });
          else socket.start();
        });
      },
    });
    socket.start();
    return () => socket.stop();
  }, [scopeKey, qc]);
}
