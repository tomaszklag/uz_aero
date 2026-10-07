/**
 * Ninerdeck - panel: hooki modułu ZLECENIA (4.0.0, epik Z-D #248).
 *
 * ══ ŚWIEŻOŚĆ DAJE KANAŁ KLUBU, NIE ODPYTYWANIE ══
 * Odczyty, odpowiedzi i przydziały zmieniają listę na żywo: serwer ogłasza temat `orders`,
 * a `live/topicKeys.ts` unieważnia korzeń `keys.orders` - React Query pobiera od nowa
 * tylko to, co jest na ekranie (K1, `docs/kanal-klubu.md`).
 */

import { useQuery } from '@tanstack/react-query';

import type { OrderListDto, OrderSummaryDto } from '../api/dto';
import { getOrderSummary, getOrders, type OrderBox } from '../api/orders';
import { keys } from './keys';

/**
 * Liczby modułu. `enabled: false` = pytanie bez znaczenia: członek bez uprawnień ma
 * jedną połowę listy, więc nie ma czego wybierać.
 */
export function useOrderSummary(enabled: boolean) {
  return useQuery<OrderSummaryDto>({ queryKey: keys.orders.summary, queryFn: getOrderSummary, enabled });
}

/** Lista jednej połowy; `null` = połowa jeszcze nie wybrana (wejście bez parametru). */
export function useOrderList(box: OrderBox | null) {
  return useQuery<OrderListDto>({
    queryKey: keys.orders.list(box ?? 'inbox'),
    queryFn: () => getOrders(box ?? 'inbox'),
    enabled: box != null,
  });
}
