/**
 * Ninerdeck - panel: ZLECENIA NA LOT (`/admin/api/orders*`; 4.0.0, epik Z-D #248;
 * `docs/zlecenia.md` §13, §15).
 *
 * ══ TE SAME TRASY, CO W TELEFONIE ══
 * Serwer rejestruje dla panelu tę samą tablicę punktów końcowych, co dla aplikacji
 * (`server/.../common/orderEndpoints.ts`), tylko za bramą sesji klubu. Zdolność trasy to
 * „każdy członek" - o tym, kto zlecenie prowadzi, a kto na nie odpowiada, rozstrzyga
 * komenda: cudze zlecenie jest dla reszty nieistniejące (404).
 *
 * Klub bierze się z SESJI, nie z adresu - jak w kalendarzu i dzienniku.
 *
 * ══ KOMENDA ODDAJE ŚWIEŻĄ KARTĘ ══
 * Przydział, odwołanie i zmiana odpowiadają kartą w kształcie widza - ekran wpisuje ją
 * do pamięci zamiast pytać drugi raz (ta sama zasada, co odpowiedź na zlecenie).
 */

import type { OrderCardDto, OrderListDto, OrderSummaryDto, SeatDto } from './dto';
import { apiGet, apiPatch, apiPost } from './httpClient';

/** „Do mnie" (zlecenia, na które się odpowiada) albo „Zlecone" (prowadzone). */
export type OrderBox = 'inbox' | 'managed';

/**
 * Liczby modułu - pierwsza połowa listy wybiera się z nich (pkt 36): „Do mnie", gdy coś
 * tam czeka na odpowiedź, inaczej „Zlecone".
 */
export function getOrderSummary(): Promise<OrderSummaryDto> {
  return apiGet<OrderSummaryDto>('/orders/summary');
}

/**
 * Lista jednej połowy. „Zlecone" bez „Zlecania lotów" i bez „Cudzych rezerwacji" to 403 -
 * segmentu dla takiej osoby nie ma, więc ekran o tę połowę nie pyta.
 */
export function getOrders(box: OrderBox): Promise<OrderListDto> {
  return apiGet<OrderListDto>(`/orders?box=${box}`);
}

/** Karta zlecenia w kształcie widza (§13.1); cudze albo nieznane zlecenie to 404. */
export function getOrder(id: string): Promise<OrderCardDto> {
  return apiGet<OrderCardDto>(`/orders/${encodeURIComponent(id)}`);
}

const path = (id: string, tail: string): string => `/orders/${encodeURIComponent(id)}/${tail}`;

/** Przydział spośród zgłoszonych - „Wybierz", „Na dowódcę", „Na drugiego pilota". */
export function assignOrder(id: string, body: { pilotId: string; seat: SeatDto }): Promise<OrderCardDto> {
  return apiPost<OrderCardDto>(path(id, 'assign'), body);
}

/** Odwołanie zlecenia - powód opcjonalny (pkt 16); termin wraca do puli. */
export function cancelOrder(id: string, reason: string | null): Promise<OrderCardDto> {
  return apiPost<OrderCardDto>(path(id, 'cancel'), { reason });
}

/**
 * „Wyślij ponownie" (pkt 41): zlecenie dostają nowi członkowie grup, przypomnienie - ci,
 * którzy jeszcze nie odpowiedzieli. To jest zmiana zlecenia (`PATCH`), nie osobna trasa.
 */
export function resendOrder(id: string): Promise<OrderCardDto> {
  return apiPatch<OrderCardDto>(`/orders/${encodeURIComponent(id)}`, { resend: true });
}
