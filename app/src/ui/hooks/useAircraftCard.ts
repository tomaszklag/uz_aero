/**
 * Ninerdeck - KARTA MASZYNY i jej HISTORIA z serwera (`GET /aircraft/:id/card`,
 * `GET /aircraft/:id/operations`; obserwowanie 3.2.0, `docs/obserwowanie-samolotu.md` §6).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI I MÓWI TO WPROST ══ (§2.2)
 * Karta czyta cudze operacje, terminy i odczyty innych pilotów, których telefon nie ma
 * u siebie - cache'u nie ma i nie będzie: liczniki sprzed godziny wyglądałyby na stan
 * maszyny. `null` znaczy „nie wiem" i ekran rysuje 27C, a nie puste liczniki.
 *
 * ══ NA ŻYWO Z KANAŁU KLUBU ══ (4.0.0, K1, K3)
 * Serwer mówi `aircraft:<id>`, gdy maszyna wystartuje, zostanie zdana albo dostanie
 * termin - karta i pierwsza strona historii czytają się wtedy po cichu od nowa. Odpytywania
 * nie ma: karta w stanie „nie wiem" wraca sama, gdy łącze przywita się razem z zasięgiem.
 *
 * ══ HISTORIA OSOBNO OD KARTY ══
 * Karta jest jednym zapytaniem, historia idzie STRONAMI (kursor parą, jak skrzynka):
 * pierwsza strona przy wejściu, kolejne pod „Pokaż starsze". Karta bez historii jest
 * wciąż kartą (hero, liczniki, terminy, wykresy), więc oba pytania nie czekają na siebie.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import type { RemoteAircraftCard } from '../../application/ports';
import { useSessionStore } from '../store';

import { mergeFirstPage, operationsPage, type OperationsData } from '../screens/logic/aircraftOperationsPage';
import { quietResult } from '../screens/logic/liveRefresh';
import { useLiveTopic } from './useLiveTopic';

/** Strona historii - tyle, ile mieści się na dwóch ekranach przewijania. */
const PAGE_LIMIT = 30;

/** Temat kanału jednej maszyny - lot, zdanie, termin. */
function useAircraftTopics(aircraftId: string | null): string[] | null {
  return useMemo(() => (aircraftId == null ? null : [`aircraft:${aircraftId}`]), [aircraftId]);
}

export interface UseAircraftCard {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo (brak sieci, odmowa, cudza maszyna). */
  data: RemoteAircraftCard | null | undefined;
  /**
   * Ciche odczytanie karty od nowa - po zapisie przełącznika obserwowania. Karta stoi
   * przed oczami pilota, więc bez plamek; obietnica rozstrzyga się z nową kartą.
   */
  refresh: () => Promise<void>;
}

export function useAircraftCard(aircraftId: string | null): UseAircraftCard {
  const sync = useSessionStore((s) => s.sync);
  const [data, setData] = useState<RemoteAircraftCard | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `quiet` = sygnał kanału: bez plamek, a brak odpowiedzi zostawia to, co było. */
  const read = useCallback(
    (quiet: boolean): Promise<void> => {
      if (sync == null || aircraftId == null) {
        setData(null);
        return Promise.resolve();
      }
      if (!quiet) setData(undefined);
      return sync
        .fetchAircraftCard(aircraftId)
        .then((wire) => {
          if (alive.current) setData((previous) => (quiet ? quietResult(previous, wire) : wire));
        })
        .catch(() => {
          // `authorizedFetch` zwija offline i odmowy do `null`; tu łapiemy resztę.
          if (alive.current && !quiet) setData(null);
        });
    },
    [sync, aircraftId],
  );

  // Wejście bez zwracania obietnicy: `useFocusEffect` przyjmuje wyłącznie funkcję sprzątającą.
  const load = useCallback(() => {
    void read(false);
  }, [read]);
  const refresh = useCallback(() => read(true), [read]);
  const signal = useCallback(() => {
    void read(true);
  }, [read]);

  useFocusEffect(load);
  useLiveTopic(useAircraftTopics(aircraftId), signal);

  return { data, refresh };
}

export interface UseAircraftOperations {
  /** `undefined` = pierwsza strona w toku, `null` = nie wiadomo. */
  data: OperationsData | null | undefined;
  /** Doładowanie starszych; nic nie robi, gdy strony nie ma albo trwa. */
  loadMore: () => void;
  loadingMore: boolean;
}

export function useAircraftOperations(aircraftId: string | null): UseAircraftOperations {
  const sync = useSessionStore((s) => s.sync);
  const [data, setData] = useState<OperationsData | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const first = useCallback(() => {
    if (sync == null || aircraftId == null) {
      setData(null);
      return;
    }
    setData(undefined);
    void sync
      .fetchAircraftOperations(aircraftId, { limit: PAGE_LIMIT })
      .then((wire) => {
        if (!alive.current) return;
        setData(wire == null ? null : operationsPage(wire, []));
      })
      .catch(() => {
        if (alive.current) setData(null);
      });
  }, [sync, aircraftId]);

  /**
   * Sygnał kanału: świeża pierwsza strona scala się z tym, co pilot doładował - nowe
   * operacje wchodzą na górę, a „Pokaż starsze" ciągnie dalej od miejsca, w którym
   * skończył. Brak odpowiedzi zostawia listę, jaka jest.
   */
  const refresh = useCallback(() => {
    if (sync == null || aircraftId == null) return;
    void sync
      .fetchAircraftOperations(aircraftId, { limit: PAGE_LIMIT })
      .then((wire) => {
        if (alive.current && wire != null) setData((previous) => mergeFirstPage(wire, previous));
      })
      .catch(() => undefined);
  }, [sync, aircraftId]);

  useFocusEffect(first);
  useLiveTopic(useAircraftTopics(aircraftId), refresh);

  const loadMore = useCallback(() => {
    if (sync == null || aircraftId == null || data == null || data.next == null || loadingMore) return;
    const before = data.next;
    setLoadingMore(true);
    void sync
      .fetchAircraftOperations(aircraftId, { limit: PAGE_LIMIT, before })
      .then((wire) => {
        if (!alive.current || wire == null) return;
        // Strona, która nie dojechała, zostawia listę, jaka jest - wiersz „Pokaż
        // starsze" stoi dalej i tapnięcie ponawia pytanie. Doklejamy ją do listy z TEJ
        // chwili, nie sprzed pytania: sygnał kanału mógł w międzyczasie dołożyć nowe
        // operacje na górę. Lista przebudowana od zera (inny kursor) nie dostaje strony,
        // która należała do poprzedniej.
        setData((previous) =>
          previous != null && previous.next === before ? operationsPage(wire, previous.items) : previous,
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setLoadingMore(false);
      });
  }, [sync, aircraftId, data, loadingMore]);

  return { data, loadMore, loadingMore };
}
