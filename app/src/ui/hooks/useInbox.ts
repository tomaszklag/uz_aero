/**
 * Ninerdeck - SKRZYNKA POWIADOMIEŃ razem z kolejką spraw (`GET /me/notifications`
 * + `GET /me/approvals/queue`; 3.1.0, epik R-I; `docs/rezerwacje.md` §12.1).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI I MÓWI TO WPROST ══
 * Decyzja właściciela 2026-09-22: cache'u powiadomień w telefonie NIE MA i nie wolno go
 * dorobić po cichu - zgoda jest umową między ludźmi, a nie pomiarem z kabiny. `null`
 * znaczy „nie wiem" i ekran rysuje wtedy 25B, a nie pustą listę (pusta wyglądałaby jak
 * „nic nie przyszło"). Dopóki nie wie, pyta ponownie co minutę - wzorzec kalendarza.
 *
 * ══ DWA PYTANIA, JEDNA ODPOWIEDŹ ══
 * Skrzynka mówi o WIADOMOŚCIACH, kolejka - o SPRAWACH (§9.4). Plakietka „Do decyzji"
 * przy wierszu liczy się z kolejki, więc oba idą razem: lista bez kolejki pokazałaby
 * prośbę, która przestała być sprawą, jako sprawę. Kolejka, która nie dojechała,
 * NIE gasi listy - wiersze są wtedy bez plakietki, a to mniejsze kłamstwo niż pustka.
 *
 * ══ „NOWE" GAŚNIE Z OTWARCIEM LISTY ══
 * Nieprzeczytane oznaczamy po udanym odczycie, w tle i bez ponownego pytania: zielona
 * krawędź zostaje na czas TEJ wizyty (pilot ma zobaczyć, co przyszło), a licznik przy
 * dzwonku zgaśnie przy następnym wejściu na Pulpit.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import type { RemoteNotification } from '../../application/ports';
import { useSessionStore } from '../store';

import { unreadIds } from '../screens/logic/inbox';

const RETRY_MS = 60_000;
/** Strona skrzynki - tyle, ile pilot doczyta; starsze wiadomości nie zmieniają decyzji. */
const PAGE_LIMIT = 50;

export interface InboxData {
  timezone: string;
  unread: number;
  items: RemoteNotification[];
  /** Rezerwacje czekające na MOJĄ decyzję; pusty zbiór także wtedy, gdy kolejka nie dojechała. */
  todoIds: Set<string>;
}

export interface UseInbox {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo (brak sieci, odmowa). */
  data: InboxData | null | undefined;
  reload: () => void;
}

export function useInbox(): UseInbox {
  const sync = useSessionStore((s) => s.sync);
  const focused = useIsFocused();
  const [data, setData] = useState<InboxData | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (sync == null) {
      setData(null);
      return;
    }

    setData(undefined);
    void Promise.all([sync.fetchInbox({ limit: PAGE_LIMIT }), sync.fetchApprovalQueue()])
      .then(([inbox, queue]) => {
        if (!alive.current) return;
        if (inbox == null) {
          setData(null);
          return;
        }
        setData({
          timezone: inbox.timezone,
          unread: inbox.unread,
          items: inbox.items,
          todoIds: new Set((queue?.items ?? []).map((i) => i.booking.id)),
        });
        // Przeczytanie w tle - fakt „widziałem", nie licznik wejść; nieudane nic nie psuje,
        // bo następne wejście oznaczy je ponownie.
        for (const id of unreadIds(inbox.items)) void sync.markNotificationRead(id);
      })
      .catch(() => {
        if (alive.current) setData(null);
      });
  }, [sync]);

  useFocusEffect(load);

  useEffect(() => {
    if (!focused || data !== null) return;
    const id = setInterval(load, RETRY_MS);
    return () => clearInterval(id);
  }, [focused, data, load]);

  return { data, reload: load };
}
