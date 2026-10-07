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
 */

import type { OrderListDto, OrderSummaryDto } from './dto';
import { apiGet } from './httpClient';

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
