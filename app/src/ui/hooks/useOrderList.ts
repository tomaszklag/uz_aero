/**
 * Ninerdeck - LISTA ZLECEŃ „Do mnie" albo „Zlecone" (`GET /orders?box=`; 4.0.0, epik Z-C
 * #247; makieta 30).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI (§2.2) ══
 * Cache'u zleceń w telefonie nie ma i nie wolno go dorobić po cichu: `null` znaczy „nie
 * wiem", a ekran mówi to wprost, zamiast rysować pustą listę - ta wyglądałaby jak „nic
 * nie przyszło". Stan „nie wiem" wraca sam z powitaniem łącza kanału klubu (K2).
 *
 * ══ NA ŻYWO ══
 * Temat `orders` niesie każdą zmianę zlecenia, które dotyczy patrzącego (odpowiedź,
 * odczyt, przydział, edycja), a lokalny `thread` - ruch w rozmowach, czyli kropkę nowej
 * wiadomości przy wierszu. Oba odświeżają listę po cichu, bez plamek.
 *
 * Zmiana połowy listy to inne pytanie, więc wraca do plamek; powrót na ekran - nie.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { THREAD_TOPIC, type RemoteOrderBox, type RemoteOrderList } from '../../application';
import { useOrders } from '../bootstrap/servicesContext';
import { quietResult, type Reading } from '../screens/logic/liveRefresh';
import { useLiveTopic } from './useLiveTopic';

const LIST_TOPICS = ['orders', THREAD_TOPIC];

export interface UseOrderList {
  data: Reading<RemoteOrderList>;
  reload: () => void;
}

/** `box: null` = połowa jeszcze nierozstrzygnięta (czeka na liczby) - nic nie pytamy. */
export function useOrderList(box: RemoteOrderBox | null): UseOrderList {
  const orders = useOrders();
  const [data, setData] = useState<Reading<RemoteOrderList>>(undefined);
  const alive = useRef(true);
  const asked = useRef<RemoteOrderBox | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `quiet` = sygnał kanału albo powrót na ekran: bez plamek, brak odpowiedzi zostawia listę. */
  const read = useCallback(
    (quiet: boolean) => {
      if (box == null) return;
      if (orders == null) {
        setData(null);
        return;
      }
      // Inna połowa listy to inne pytanie - plamki zamiast listy, która za chwilę zniknie.
      if (!quiet || asked.current !== box) setData(undefined);
      asked.current = box;
      void orders
        .fetchList(box)
        .then((next) => {
          if (!alive.current || asked.current !== box) return;
          setData((previous) => (quiet ? quietResult(previous, next) : next));
        })
        .catch(() => {
          if (alive.current && asked.current === box && !quiet) setData(null);
        });
    },
    [orders, box],
  );

  const refresh = useCallback(() => read(true), [read]);
  // Wejście na ekran i zmiana połowy: przy tej samej połowie liczby zostają do odpowiedzi.
  const load = useCallback(() => read(asked.current === box), [read, box]);

  useFocusEffect(load);
  useLiveTopic(box == null ? null : LIST_TOPICS, refresh);

  return { data, reload: () => read(false) };
}
