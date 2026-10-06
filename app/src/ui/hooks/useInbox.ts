/**
 * Ninerdeck - SKRZYNKA POWIADOMIEŃ razem z kolejką spraw (`GET /me/notifications`
 * + `GET /me/approvals/queue`; 3.1.0, epik R-I; `docs/rezerwacje.md` §12.1).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI I MÓWI TO WPROST ══
 * Decyzja właściciela 2026-09-22: cache'u powiadomień w telefonie NIE MA i nie wolno go
 * dorobić po cichu - zgoda jest umową między ludźmi, a nie pomiarem z kabiny. `null`
 * znaczy „nie wiem" i ekran rysuje wtedy 25B, a nie pustą listę (pusta wyglądałaby jak
 * „nic nie przyszło").
 *
 * ══ NA ŻYWO Z KANAŁU KLUBU ══ (4.0.0, K1, K3)
 * Nowa wiadomość przychodzi ramką `notification` (temat lokalny `inbox`), a kolejka spraw
 * zmienia się z każdą decyzją w klubie (`booking`) - na oba sygnały lista czyta się po
 * cichu od nowa. Odpytywania nie ma: w stanie „nie wiem" lista wraca sama z powitaniem
 * łącza, które przychodzi razem z zasięgiem (wzorzec kalendarza).
 *
 * ══ DWA PYTANIA, JEDNA ODPOWIEDŹ ══
 * Skrzynka mówi o WIADOMOŚCIACH, kolejka - o SPRAWACH (§9.4). Plakietka „Do decyzji"
 * przy wierszu liczy się z kolejki, więc oba idą razem: lista bez kolejki pokazałaby
 * prośbę, która przestała być sprawą, jako sprawę. Kolejka, która nie dojechała,
 * NIE gasi listy - wiersze są wtedy bez plakietki, a to mniejsze kłamstwo niż pustka.
 *
 * ══ „NOWE" GAŚNIE Z OTWARCIEM LISTY ══
 * Nieprzeczytane oznaczamy po udanym odczycie, w tle i bez ponownego pytania: zielona
 * krawędź zostaje na czas TEJ wizyty (pilot ma zobaczyć, co przyszło) - także po cichym
 * odświeżeniu z kanału, które zna już przeczytanie (`keepVisitNew`) - a licznik przy
 * dzwonku zgaśnie przy następnym wejściu na Pulpit.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { INBOX_TOPIC } from '../../application/live/liveBus';
import type { RemoteNotification } from '../../application/ports';
import { useSessionStore } from '../store';

import { keepVisitNew, unreadIds } from '../screens/logic/inbox';
import { quietResult } from '../screens/logic/liveRefresh';
import { useLiveTopic } from './useLiveTopic';

/** Nowe wiadomości i decyzje w klubie, które zmieniają kolejkę spraw („Do decyzji"). */
const INBOX_TOPICS = [INBOX_TOPIC, 'booking'];
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
  const [data, setData] = useState<InboxData | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `quiet` = sygnał kanału: bez plamek, a brak odpowiedzi zostawia to, co było. */
  const read = useCallback(
    (quiet: boolean) => {
      if (sync == null) {
        setData(null);
        return;
      }

      if (!quiet) setData(undefined);
      void Promise.all([sync.fetchInbox({ limit: PAGE_LIMIT }), sync.fetchApprovalQueue()])
        .then(([inbox, queue]) => {
          if (!alive.current) return;
          const next: InboxData | null =
            inbox == null
              ? null
              : {
                  timezone: inbox.timezone,
                  unread: inbox.unread,
                  items: inbox.items,
                  todoIds: new Set((queue?.items ?? []).map((i) => i.booking.id)),
                };
          setData((previous) => {
            if (!quiet) return next;
            if (next == null || previous == null) return quietResult(previous, next);
            return { ...next, items: keepVisitNew(previous.items, next.items) };
          });
          // Przeczytanie w tle - fakt „widziałem", nie licznik wejść; nieudane nic nie
          // psuje, bo następne wejście oznaczy je ponownie. Wiadomość, która przyszła przy
          // otwartej liście, pilot właśnie widzi - też jest przeczytana.
          if (inbox != null) for (const id of unreadIds(inbox.items)) void sync.markNotificationRead(id);
        })
        .catch(() => {
          if (alive.current && !quiet) setData(null);
        });
    },
    [sync],
  );

  const load = useCallback(() => read(false), [read]);
  const refresh = useCallback(() => read(true), [read]);

  useFocusEffect(load);
  useLiveTopic(INBOX_TOPICS, refresh);

  return { data, reload: load };
}
