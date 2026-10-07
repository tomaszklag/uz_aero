/**
 * Ninerdeck - GRUPY KLUBU do adresowania zlecenia (`GET /groups`; 4.0.0, epik Z-C #247;
 * makieta 31C; `docs/zlecenia.md` §6.1).
 *
 * Grupy zakłada administrator w panelu, a formularz zlecenia wybiera je jako adresatów.
 * Odpowiedź niesie listę osób KAŻDEJ grupy - także wyłączonych, które formularz pomija
 * w liczbach - więc z jednej odpowiedzi biorą się i karty grup w arkuszu, i zdanie
 * „Zlecenie trafi do 6 osób" nad przyciskiem.
 *
 * Bez cache'u, jak cały moduł (§2.2): pytamy przy wejściu w formularz. `null` = nie wiem
 * (bez zasięgu albo bez „Zlecania lotów") - formularz pokazuje wtedy same osoby, a zdanie
 * nad przyciskiem mówi bez liczby.
 */

import { useEffect, useState } from 'react';

import type { RemoteMemberGroup } from '../../application';
import { useOrders } from '../bootstrap/servicesContext';
import type { Reading } from '../screens/logic/liveRefresh';

export function useOrderGroups(): Reading<RemoteMemberGroup[]> {
  const orders = useOrders();
  const [data, setData] = useState<Reading<RemoteMemberGroup[]>>(undefined);

  useEffect(() => {
    if (orders == null) {
      setData(null);
      return;
    }
    let alive = true;
    void orders
      .fetchGroups()
      .then((groups) => {
        if (alive) setData(groups);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [orders]);

  return data;
}
