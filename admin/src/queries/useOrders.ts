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

import type { OrderAnswerDto, OrderCardDto, OrderListDto, OrderSummaryDto, SeatDto } from '../api/dto';
import {
  answerOrder,
  assignOrder,
  cancelOrder,
  getOrder,
  getOrderSummary,
  getOrders,
  markOrderSeen,
  removeRecipient,
  resendOrder,
  swapRecipient,
  unassignOrder,
  type OrderBox,
} from '../api/orders';
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

export function useRemoveRecipient(id: string) {
  return useOrderCommand(id, (body: { pilotId: string; reason: string | null }) => removeRecipient(id, body));
}

export function useSwapRecipient(id: string) {
  return useOrderCommand(id, (body: { seat: SeatDto; outgoing: string; incoming: string; reason: string | null }) =>
    swapRecipient(id, body),
  );
}

export function useUnassignOrder(id: string) {
  return useOrderCommand(id, (body: { seat: SeatDto; reason: string | null }) => unassignOrder(id, body));
}

/**
 * Odpowiedź adresata. Karta wraca w odpowiedzi (także przy „fotel już zajęty" i „zamknięte"
 * - to stan zlecenia, nie awaria), więc szuflada nie pyta drugi raz; lista „Do mnie"
 * i kalendarz czytają się na nowo, bo przyjęcie zamienia zlecenie w rezerwację.
 */
export function useAnswerOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { answer: OrderAnswerDto; reason: string | null }) => answerOrder(id, body),
    onSuccess: (result) => {
      if (result.card != null) qc.setQueryData(keys.orders.card(id), result.card);
      else void qc.invalidateQueries({ queryKey: keys.orders.card(id) });
      void qc.invalidateQueries({ queryKey: keys.orders.all, predicate: (q) => q.queryKey[1] !== 'card' });
      void qc.invalidateQueries({ queryKey: keys.calendar.all });
    },
  });
}

/** „Odczytane" przy otwarciu szuflady adresata - nic na ekranie się od tego nie zmienia. */
export function useMarkOrderSeen(id: string) {
  return useMutation({ mutationFn: () => markOrderSeen(id) });
}
