/**
 * Ninerdeck - KARTA MASZYNY i jej HISTORIA z serwera (`GET /aircraft/:id/card`,
 * `GET /aircraft/:id/operations`; obserwowanie 3.2.0, `docs/obserwowanie-samolotu.md` §6).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI I MÓWI TO WPROST ══ (§2.2)
 * Karta czyta cudze operacje, terminy i odczyty innych pilotów, których telefon nie ma
 * u siebie - cache'u nie ma i nie będzie: liczniki sprzed godziny wyglądałyby na stan
 * maszyny. `null` znaczy „nie wiem" i ekran rysuje 27C, a nie puste liczniki; dopóki
 * nie wie, pyta ponownie co minutę i wraca sam (wzorzec okna kalendarza).
 *
 * ══ HISTORIA OSOBNO OD KARTY ══
 * Karta jest jednym zapytaniem, historia idzie STRONAMI (kursor parą, jak skrzynka):
 * pierwsza strona przy wejściu, kolejne pod „Pokaż starsze". Karta bez historii jest
 * wciąż kartą (hero, liczniki, terminy, wykresy), więc oba pytania nie czekają na siebie.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import type { RemoteAircraftCard, RemoteAircraftOperation, RemoteAircraftOperations } from '../../application/ports';
import { useSessionStore } from '../store';

const RETRY_MS = 60_000;
/** Strona historii - tyle, ile mieści się na dwóch ekranach przewijania. */
const PAGE_LIMIT = 30;

export interface UseAircraftCard {
  /** `undefined` = pytanie w toku, `null` = nie wiadomo (brak sieci, odmowa, cudza maszyna). */
  data: RemoteAircraftCard | null | undefined;
  reload: () => void;
}

export function useAircraftCard(aircraftId: string | null): UseAircraftCard {
  const sync = useSessionStore((s) => s.sync);
  const focused = useIsFocused();
  const [data, setData] = useState<RemoteAircraftCard | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (sync == null || aircraftId == null) {
      setData(null);
      return;
    }
    setData(undefined);
    void sync
      .fetchAircraftCard(aircraftId)
      .then((wire) => {
        if (alive.current) setData(wire);
      })
      .catch(() => {
        // `authorizedFetch` zwija offline i odmowy do `null`; tu łapiemy resztę.
        if (alive.current) setData(null);
      });
  }, [sync, aircraftId]);

  useFocusEffect(load);

  // Ponawiamy WYŁĄCZNIE w stanie „nie wiem" i na widocznym ekranie - jak kalendarz.
  useEffect(() => {
    if (!focused || data !== null) return;
    const id = setInterval(load, RETRY_MS);
    return () => clearInterval(id);
  }, [focused, data, load]);

  return { data, reload: load };
}

export interface OperationsData {
  total: number;
  items: RemoteAircraftOperation[];
  /** Ile operacji zostało ZA tym, co już wczytano - wiersz „Pokaż starsze". */
  remaining: number;
  next: RemoteAircraftOperations['next'];
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
        setData(wire == null ? null : page(wire, []));
      })
      .catch(() => {
        if (alive.current) setData(null);
      });
  }, [sync, aircraftId]);

  useFocusEffect(first);

  const loadMore = useCallback(() => {
    if (sync == null || aircraftId == null || data == null || data.next == null || loadingMore) return;
    setLoadingMore(true);
    void sync
      .fetchAircraftOperations(aircraftId, { limit: PAGE_LIMIT, before: data.next })
      .then((wire) => {
        if (!alive.current) return;
        // Strona, która nie dojechała, zostawia listę, jaka jest - wiersz „Pokaż
        // starsze" stoi dalej i tapnięcie ponawia pytanie.
        if (wire != null) setData(page(wire, data.items));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setLoadingMore(false);
      });
  }, [sync, aircraftId, data, loadingMore]);

  return { data, loadMore, loadingMore };
}

function page(wire: RemoteAircraftOperations, before: RemoteAircraftOperation[]): OperationsData {
  const items = [...before, ...wire.items];
  return { total: wire.total, items, remaining: Math.max(0, wire.total - items.length), next: wire.next };
}
