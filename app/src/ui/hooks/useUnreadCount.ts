/**
 * Ninerdeck - RZUT OKA NA SKRZYNKĘ przy wejściu na Pulpit (3.1.0, epik R-I; makieta 20E,
 * `docs/rezerwacje.md` §9.4) - licznik przy dzwonku i flaga akceptującego (epik R-J).
 *
 * Licznik zapala się WYŁĄCZNIE z nieprzeczytanymi; pusta skrzynka nie dostaje zera (reguła
 * SyncChipa z issue #12). BEZ ZASIĘGU LICZNIKA NIE MA WCALE: liczbę zna serwer,
 * a zapamiętana sprzed godziny mówiłaby o stanie, którego telefon nie zna - stąd `null`,
 * a nie ostatnia znana wartość. Pytamy przy każdym wejściu na Pulpit o JEDNĄ wiadomość:
 * `unread` liczy całą skrzynkę niezależnie od strony.
 *
 * Od kanału klubu (4.0.0, K3) licznik rośnie NA ŻYWO: nowa wiadomość przychodzi ramką
 * `notification` (temat lokalny `inbox`) i Pulpit pyta po cichu od nowa. Brak odpowiedzi
 * na ciche pytanie nie gasi licznika - łącze przed chwilą działało, więc to chwilowa
 * awaria, a nie brak zasięgu.
 *
 * `approver` przyjeżdża tą samą odpowiedzią (serwer 3.1.0): Pulpit prosi akceptującego
 * o zgodę na powiadomienia od razu, a pozostałych dopiero przy ich sprawie (J3).
 * `undefined` = bez zasięgu albo serwer sprzed 3.1.0 - wtedy nie pytamy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { INBOX_TOPIC } from '../../application/live/liveBus';
import { useSessionStore } from '../store';

import { useLiveTopic } from './useLiveTopic';

export interface InboxGlance {
  unread: number | null;
  approver: boolean | undefined;
}

const NOTHING: InboxGlance = { unread: null, approver: undefined };

const GLANCE_TOPICS = [INBOX_TOPIC];

export function useUnreadCount(): InboxGlance {
  const sync = useSessionStore((s) => s.sync);
  const [glance, setGlance] = useState<InboxGlance>(NOTHING);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `quiet` = sygnał kanału: brak odpowiedzi zostawia licznik, jaki był. */
  const read = useCallback(
    (quiet: boolean) => {
      if (sync == null) {
        setGlance(NOTHING);
        return;
      }
      void sync
        .fetchInbox({ limit: 1 })
        .then((inbox) => {
          if (!alive.current) return;
          if (inbox != null) setGlance({ unread: inbox.unread, approver: inbox.approver });
          else if (!quiet) setGlance(NOTHING);
        })
        .catch(() => {
          if (alive.current && !quiet) setGlance(NOTHING);
        });
    },
    [sync],
  );

  const load = useCallback(() => read(false), [read]);
  const refresh = useCallback(() => read(true), [read]);

  useFocusEffect(load);
  useLiveTopic(GLANCE_TOPICS, refresh);

  return glance;
}
