/**
 * Ninerdeck - panel: hooki modułu ZLECENIA (4.0.0, epik Z-D #248).
 *
 * ══ ŚWIEŻOŚĆ DAJE KANAŁ KLUBU, NIE ODPYTYWANIE ══
 * Odczyty, odpowiedzi i przydziały zmieniają listę i kartę na żywo: serwer ogłasza tematy
 * `orders` i `order:<id>`, a `live/topicKeys.ts` unieważnia klucze modułu - React Query
 * pobiera od nowa tylko to, co jest na ekranie (K1, `docs/kanal-klubu.md`).
 *
 * ══ KOMENDA WPISUJE KARTĘ, LISTA CZYTA SIĘ OD NOWA ══
 * Odpowiedź komendy JEST świeżą kartą w kształcie widza, więc trafia prosto do pamięci -
 * a lista i liczby modułu pytają serwer od nowa, bo zmieniają się razem z nią
 * (komplet załogi zmienia plakietkę wiersza, przydział - licznik „mogą lecieć").
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { OrderCardDto, OrderListDto, OrderSummaryDto, SeatDto } from '../api/dto';
import { assignOrder, cancelOrder, getOrder, getOrderSummary, getOrders, resendOrder, type OrderBox } from '../api/orders';
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

/** Karta zlecenia - `null` = szuflada zamknięta, więc nie ma o co pytać. */
export function useOrder(id: string | null) {
  return useQuery<OrderCardDto>({
    queryKey: keys.orders.card(id ?? ''),
    queryFn: () => getOrder(id ?? ''),
    enabled: id != null,
  });
}

function useOrderCommand<TVars>(id: string, fn: (vars: TVars) => Promise<OrderCardDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (card) => {
      qc.setQueryData(keys.orders.card(id), card);
      void qc.invalidateQueries({ queryKey: keys.orders.all, predicate: (q) => q.queryKey[1] !== 'card' });
      // Zlecenie JEST rezerwacją - przydział i odwołanie zmieniają pasek na osi kalendarza.
      void qc.invalidateQueries({ queryKey: keys.calendar.all });
    },
  });
}

export function useAssignOrder(id: string) {
  return useOrderCommand(id, (body: { pilotId: string; seat: SeatDto }) => assignOrder(id, body));
}

export function useCancelOrder(id: string) {
  return useOrderCommand(id, (reason: string | null) => cancelOrder(id, reason));
}

export function useResendOrder(id: string) {
  return useOrderCommand(id, () => resendOrder(id));
}
