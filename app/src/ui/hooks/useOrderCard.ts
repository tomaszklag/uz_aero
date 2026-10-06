/**
 * Ninerdeck - KARTA ZLECENIA (`GET /orders/:id`; 4.0.0, epik Z-C #247; makiety 28, 32).
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI (§2.2) ══
 * Kopii zlecenia w telefonie nie ma i nie wolno jej dorobić: zlecenie sprzed godziny mogło
 * już mieć obsadzony fotel albo inny termin, a pokazane bez połączenia wyglądałoby na
 * aktualne. `null` znaczy „nie wiem" i ekran mówi to wprost (28E); stan wraca sam
 * z powitaniem łącza kanału klubu (K2) - bez przycisku i bez odpytywania.
 *
 * ══ OTWARCIE KARTY TO „ODCZYTANE" (pkt 17) ══
 * Adresat, który otworzył kartę, zapala prowadzącym „Odczytane" - przy KAŻDYM wejściu,
 * bo prowadzący widzi też „zmiana z 07:10 nieodczytana" (§8). Odczyt idzie raz na
 * wejście, nie na każde ciche odświeżenie: serwer budzi nim kartę prowadzącego, a ten
 * sam sygnał dostaje karta adresata - zapis przy każdym odświeżeniu kręciłby się w kółko.
 * Odczyt, który nie dojechał, nie jest błędem: następne wejście zapisze go znowu.
 *
 * ══ NA ŻYWO ══
 * `order:<id>` niesie każdą zmianę tego zlecenia (edycja, odpowiedź, przydział, odczyt),
 * a lokalny `thread:<id>` - ruch w jego rozmowach (kropka nowej wiadomości).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { threadTopic, type RemoteOrderCard } from '../../application';
import { useOrders } from '../bootstrap/servicesContext';
import { quietResult, type Reading } from '../screens/logic/liveRefresh';
import { useLiveTopic } from './useLiveTopic';

export interface UseOrderCard {
  data: Reading<RemoteOrderCard>;
  reload: () => void;
  /** Karta z odpowiedzi zapisu - serwer oddaje ją w kształcie widza, więc drugi raz nie pytamy. */
  accept: (card: RemoteOrderCard) => void;
}

export function useOrderCard(orderId: string | null): UseOrderCard {
  const orders = useOrders();
  const [data, setData] = useState<Reading<RemoteOrderCard>>(undefined);
  const alive = useRef(true);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `quiet` = sygnał kanału albo powrót na ekran; `entry` = wejście, które zapisuje odczyt. */
  const read = useCallback(
    (quiet: boolean, entry: boolean) => {
      if (orders == null || orderId == null) {
        setData(null);
        return;
      }
      // Inne zlecenie to inne pytanie - plamki zamiast karty, która za chwilę zniknie.
      if (!quiet || asked.current !== orderId) setData(undefined);
      asked.current = orderId;
      void orders
        .fetchCard(orderId)
        .then((next) => {
          if (!alive.current || asked.current !== orderId) return;
          setData((previous) => (quiet ? quietResult(previous, next) : next));
          if (entry && next?.viewer.recipient != null) void orders.markSeen(orderId);
        })
        .catch(() => {
          if (alive.current && asked.current === orderId && !quiet) setData(null);
        });
    },
    [orders, orderId],
  );

  const refresh = useCallback(() => read(true, false), [read]);
  // Wejście na ekran: karta tego samego zlecenia zostaje do odpowiedzi, inna - plamki.
  const load = useCallback(() => read(asked.current === orderId, true), [read, orderId]);

  useFocusEffect(load);
  useLiveTopic(orderId == null ? null : [`order:${orderId}`, threadTopic(orderId)], refresh);

  return {
    data,
    reload: useCallback(() => read(false, false), [read]),
    accept: useCallback((card: RemoteOrderCard) => setData(card), []),
  };
}
