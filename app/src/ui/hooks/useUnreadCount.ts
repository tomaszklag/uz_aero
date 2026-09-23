/**
 * Ninerdeck - LICZNIK NIEPRZECZYTANYCH przy dzwonku na Pulpicie (3.1.0, epik R-I;
 * makieta 20E, `docs/rezerwacje.md` §9.4).
 *
 * Zapala się WYŁĄCZNIE z nieprzeczytanymi; pusta skrzynka nie dostaje zera (reguła
 * SyncChipa z issue #12). BEZ ZASIĘGU LICZNIKA NIE MA WCALE: liczbę zna serwer,
 * a zapamiętana sprzed godziny mówiłaby o stanie, którego telefon nie zna - stąd `null`,
 * a nie ostatnia znana wartość. Pytamy przy każdym wejściu na Pulpit o JEDNĄ wiadomość:
 * `unread` liczy całą skrzynkę niezależnie od strony.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useSessionStore } from '../store';

export function useUnreadCount(): number | null {
  const sync = useSessionStore((s) => s.sync);
  const [count, setCount] = useState<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (sync == null) {
      setCount(null);
      return;
    }
    void sync
      .fetchInbox({ limit: 1 })
      .then((inbox) => {
        if (alive.current) setCount(inbox == null ? null : inbox.unread);
      })
      .catch(() => {
        if (alive.current) setCount(null);
      });
  }, [sync]);

  useFocusEffect(load);

  return count;
}
