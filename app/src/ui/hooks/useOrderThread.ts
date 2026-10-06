/**
 * Ninerdeck - ROZMOWA W ZLECENIU (`…/orders/:id/threads/:recipientId`; 4.0.0, epik Z-C #247;
 * makiety 29, 29A, 29B; `docs/kanal-klubu.md` §13).
 *
 * ══ NA ŻYWO, BEZ ODPYTYWANIA (pkt 21, 49) ══
 * Kanał klubu niesie wiadomość W CAŁOŚCI (ramka `message`) i odczyt drugiej strony
 * (`read`), więc otwarta rozmowa dopisuje je od razu, bez pytania serwera. Pierwszą stronę
 * czyta wejście na ekran; po każdym powitaniu łącza i każdej zmianie zlecenia (temat
 * `order:<id>` - rozmowa zamyka się razem ze zleceniem) czyta ją od nowa i dopisuje to,
 * co ominęło ją bez łącza.
 *
 * ══ BEZ POŁĄCZENIA (29A) ══
 * Telefon nie ma czujnika sieci, a łącze kanału nie mówi ekranom o swoim stanie - o braku
 * połączenia wiadomo dopiero wtedy, gdy wysyłka albo odczyt nie dojedzie. Pole staje wtedy
 * zablokowane z powodem i wraca SAMO: powitanie łącza każe przeczytać rozmowę od nowa,
 * a udany odczyt zdejmuje blokadę. Wczytane wiadomości zostają na ekranie.
 *
 * ══ ODCZYT (pkt 17, 19) ══
 * Uczestnik, który patrzy na rozmowę, czyta ją: odczyt zapisuje się przy wejściu i przy
 * każdej nowej wiadomości drugiej strony, dopóki ekran jest na wierzchu. Czytelnik
 * (koordynator) odczytu nie zapisuje - nie jest uczestnikiem rozmowy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { useLive, useOrders } from '../bootstrap/servicesContext';
import type { Reading } from '../screens/logic/liveRefresh';
import { upsertMessage, withFirstPage, withOlderPage, withRead, type ThreadState } from '../screens/logic/threadState';
import { useCurrentPilot } from '../store';
import { useLiveTopic } from './useLiveTopic';

export type { ThreadState };

export type SendOutcome = { kind: 'sent' } | { kind: 'offline' } | { kind: 'refused'; refusal: string };

export interface UseOrderThread {
  data: Reading<ThreadState>;
  /** Ostatni odczyt albo wysyłka nie dojechały - pole wiadomości stoi z powodem. */
  offline: boolean;
  /** Dociąga starszą stronę (przewinięcie do początku rozmowy). */
  loadOlder: () => void;
  /** Wysyła wiadomość o identyfikatorze nadanym przez telefon - ponowienie to ta sama wiadomość. */
  send: (id: string, body: string) => Promise<SendOutcome>;
}

export function useOrderThread(orderId: string | null, recipientId: string | null): UseOrderThread {
  const orders = useOrders();
  const live = useLive();
  const focused = useIsFocused();
  const viewerId = useCurrentPilot((p) => p.id);
  const [data, setData] = useState<Reading<ThreadState>>(undefined);
  const [offline, setOffline] = useState(false);
  const alive = useRef(true);
  const current = useRef<Reading<ThreadState>>(undefined);
  const olderInFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Każda zmiana stanu idzie przez `current` - liczona SYNCHRONICZNIE, a nie w aktualizatorze
   * `setState` (ten bywa wykonywany dopiero przy renderze, więc odczyt zapisany zaraz po
   * pierwszej stronie widziałby jeszcze stan sprzed niej).
   */
  const apply = useCallback((update: (previous: Reading<ThreadState>) => Reading<ThreadState>) => {
    const next = update(current.current);
    current.current = next;
    setData(next);
  }, []);

  /** Odczyt rozmowy przez uczestnika - „Odczytane" u drugiej strony. */
  const markRead = useCallback(() => {
    const state = current.current;
    if (orders == null || orderId == null || recipientId == null || state == null) return;
    if (state.role !== 'participant' || state.messages.length === 0) return;
    void orders.markThreadRead(orderId, recipientId);
  }, [orders, orderId, recipientId]);

  /** Pierwsza strona; `entry` = wejście na ekran, które zapisuje odczyt. */
  const read = useCallback(
    (entry: boolean) => {
      if (orders == null || orderId == null || recipientId == null) {
        apply((previous) => previous ?? null);
        setOffline(true);
        return;
      }
      void orders
        .fetchThread(orderId, recipientId)
        .then((page) => {
          if (!alive.current) return;
          if (page == null) {
            // Wczytane wiadomości zostają; bez nich ekran mówi „BRAK POŁĄCZENIA".
            apply((previous) => previous ?? null);
            setOffline(true);
            return;
          }
          setOffline(false);
          apply((previous) => withFirstPage(previous, page));
          if (entry) markRead();
        })
        .catch(() => {
          if (!alive.current) return;
          apply((previous) => previous ?? null);
          setOffline(true);
        });
    },
    [orders, orderId, recipientId, apply, markRead],
  );

  const load = useCallback(() => read(true), [read]);
  const refresh = useCallback(() => read(false), [read]);

  useFocusEffect(load);
  useLiveTopic(orderId == null ? null : [`order:${orderId}`], refresh);

  // Ramki rozmowy - wiadomość i odczyt w całości, bez drugiego pytania serwera.
  useEffect(() => {
    if (live == null || !focused || orderId == null || recipientId == null) return;
    return live.bus.onThread((frame) => {
      if (frame.orderId !== orderId || frame.recipientId !== recipientId) return;
      // Ramka przyszła, więc łącze stoi - pole wraca do pisania.
      setOffline(false);
      if (frame.type === 'message') {
        apply((previous) => (previous == null ? previous : { ...previous, messages: upsertMessage(previous.messages, frame.message) }));
        // Wiadomość drugiej strony na otwartym ekranie jest przeczytana; własna - nie ma czego czytać.
        if (frame.message.authorId !== viewerId) markRead();
      } else {
        apply((previous) =>
          previous == null ? previous : { ...previous, participants: withRead(previous.participants, frame.pilotId, frame.at) },
        );
      }
    });
  }, [live, focused, orderId, recipientId, viewerId, apply, markRead]);

  const loadOlder = useCallback(() => {
    const cursor = current.current?.next ?? null;
    if (orders == null || orderId == null || recipientId == null || cursor == null || olderInFlight.current) return;
    olderInFlight.current = true;
    void orders
      .fetchThread(orderId, recipientId, { before: cursor })
      .then((page) => {
        if (!alive.current) return;
        if (page == null) {
          setOffline(true);
          return;
        }
        apply((previous) =>
          previous == null ? previous : withOlderPage(previous, page),
        );
      })
      .catch(() => {
        if (alive.current) setOffline(true);
      })
      .finally(() => {
        olderInFlight.current = false;
      });
  }, [orders, orderId, recipientId, apply]);

  const send = useCallback(
    async (id: string, body: string): Promise<SendOutcome> => {
      if (orders == null || orderId == null || recipientId == null) {
        setOffline(true);
        return { kind: 'offline' };
      }
      const result = await orders.send(orderId, recipientId, { id, body });
      if (result == null) {
        if (alive.current) setOffline(true);
        return { kind: 'offline' };
      }
      if (!result.ok) {
        // Rozmowa mogła się zamknąć pod palcem - stopka ma pokazać jej NOWY stan.
        refresh();
        return { kind: 'refused', refusal: result.refusal };
      }
      if (alive.current) {
        setOffline(false);
        apply((previous) => (previous == null ? previous : { ...previous, messages: upsertMessage(previous.messages, result.message) }));
      }
      return { kind: 'sent' };
    },
    [orders, orderId, recipientId, refresh, apply],
  );

  return { data, offline, loadOlder, send };
}
