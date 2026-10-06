/**
 * Ninerdeck - LICZBY ZLECEŃ (`GET /orders/summary`; 4.0.0, epik Z-C #247; makiety 20F, 30).
 *
 * Karta „Zlecenia" na Pulpicie i segmenty listy pytają o to samo, więc hook jest jeden.
 * Zwraca odczyt w trzech stanach: dane, `null` = nie wiadomo (bez zasięgu - karty nie ma,
 * lista mówi „BRAK POŁĄCZENIA"), `undefined` = pierwsze pytanie w toku.
 *
 * ══ POWRÓT NA EKRAN NIE GASI LICZB ══
 * Wejście czyta od nowa, ale do odpowiedzi zostaje to, co było - jak licznik przy dzwonku:
 * karta na Pulpicie nie ma mrugać przy każdym powrocie z innej zakładki. Liczby zmieniają
 * się NA ŻYWO z tematu `orders` kanału klubu (pkt 27, K1) - bez odpytywania.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import type { RemoteOrderSummary } from '../../application';
import { useOrders } from '../bootstrap/servicesContext';
import { quietResult, type Reading } from '../screens/logic/liveRefresh';
import { useLiveTopic } from './useLiveTopic';

/** Każda zmiana zlecenia, która dotyczy patrzącego (§11). */
const SUMMARY_TOPICS = ['orders'];

export interface UseOrderSummary {
  data: Reading<RemoteOrderSummary>;
  reload: () => void;
}

export function useOrderSummary(): UseOrderSummary {
  const orders = useOrders();
  const [data, setData] = useState<Reading<RemoteOrderSummary>>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `quiet` = sygnał kanału: brak odpowiedzi zostawia to, co było. */
  const read = useCallback(
    (quiet: boolean) => {
      if (orders == null) {
        setData(null);
        return;
      }
      void orders
        .fetchSummary()
        .then((next) => {
          if (alive.current) setData((previous) => (quiet ? quietResult(previous, next) : next));
        })
        .catch(() => {
          if (alive.current && !quiet) setData(null);
        });
    },
    [orders],
  );

  const load = useCallback(() => read(false), [read]);
  const refresh = useCallback(() => read(true), [read]);

  useFocusEffect(load);
  useLiveTopic(SUMMARY_TOPICS, refresh);

  return { data, reload: load };
}
