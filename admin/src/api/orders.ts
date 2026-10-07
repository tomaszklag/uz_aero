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

import type {
  NewOrderDto,
  OrderAnswerDto,
  OrderAnswerResultDto,
  OrderCardDto,
  OrderListDto,
  OrderPatchDto,
  OrderSummaryDto,
  SeatDto,
  ThreadCursorDto,
  ThreadMessageDto,
  ThreadPageDto,
} from './dto';
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

/**
 * Nowe zlecenie (ZL2). Odpowiedź to karta w kształcie widza - prowadzącego, bo właśnie je
 * założył; odmowa terminu (`slot_taken`) niesie kolidującą zajętość, jak przy rezerwacji.
 */
export function createOrder(body: NewOrderDto): Promise<OrderCardDto> {
  return apiPost<OrderCardDto>('/orders', body);
}

/** Edycja zlecenia (ZL2c) - sama różnica; odpowiedź to świeża karta prowadzącego. */
export function editOrder(id: string, patch: OrderPatchDto): Promise<OrderCardDto> {
  return apiPatch<OrderCardDto>(`/orders/${encodeURIComponent(id)}`, patch);
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

/**
 * „Odbierz zlecenie" (pkt 29): adresat wypada ze zlecenia, dostaje „Zlecenie nieaktualne",
 * a rozmowa zostaje do odczytu. Też zmiana zlecenia (`PATCH`), powód opcjonalny.
 */
export function removeRecipient(id: string, body: { pilotId: string; reason: string | null }): Promise<OrderCardDto> {
  return apiPatch<OrderCardDto>(`/orders/${encodeURIComponent(id)}`, { removeRecipients: [body.pilotId], reason: body.reason });
}

/**
 * „Zamień osobę" - usunięcie i dopisanie w JEDNYM ruchu (pkt 29, §5.2), więc fotel imienny
 * dalej obsadza przyjęcie, teraz nowej osoby.
 */
export function swapRecipient(
  id: string,
  body: { seat: SeatDto; outgoing: string; incoming: string; reason: string | null },
): Promise<OrderCardDto> {
  return apiPatch<OrderCardDto>(`/orders/${encodeURIComponent(id)}`, {
    removeRecipients: [body.outgoing],
    addRecipients: [{ seat: body.seat, list: { pilotIds: [body.incoming], groupIds: [] } }],
    reason: body.reason,
  });
}

/**
 * „Rezygnuję" osoby w fotelu (§5.3, karta 23F i szuflada K2c): fotel wraca do szukania,
 * termin zostaje zajęty, zlecający dostaje „Rezygnacja z lotu". Powód opcjonalny (pkt 16).
 */
export function withdrawOrder(id: string, reason: string | null): Promise<OrderCardDto> {
  return apiPost<OrderCardDto>(path(id, 'withdraw'), { reason });
}

/** „Cofnij przydział" (pkt 14): fotel wraca do szukania, zgłoszenia pozostałych dalej się liczą. */
export function unassignOrder(id: string, body: { seat: SeatDto; reason: string | null }): Promise<OrderCardDto> {
  return apiPost<OrderCardDto>(path(id, 'unassign'), body);
}

/**
 * Odpowiedź adresata (§5.1): „Przyjmuję" / „Mogę lecieć" (`yes`) albo „Nie mogę" (`no`,
 * powód opcjonalny - pkt 16). Wraca wynik i świeża karta.
 */
export function answerOrder(id: string, body: { answer: OrderAnswerDto; reason: string | null }): Promise<OrderAnswerResultDto> {
  return apiPost<OrderAnswerResultDto>(path(id, 'answer'), body);
}

/** „Odczytane" (pkt 17) - otwarcie karty przez adresata; skutek patrzenia, nie czynność. */
export async function markOrderSeen(id: string): Promise<void> {
  await apiPost<null>(path(id, 'seen'));
}

const threadPath = (id: string, recipientId: string, tail: string): string =>
  path(id, `threads/${encodeURIComponent(recipientId)}/${tail}`);

/** Strona rozmowy z adresatem - od najnowszej; kursor prowadzi do starszych. */
export function getThreadPage(id: string, recipientId: string, before: ThreadCursorDto | null): Promise<ThreadPageDto> {
  const query = before == null ? '' : `?beforeAt=${encodeURIComponent(before.beforeAt)}&beforeId=${encodeURIComponent(before.beforeId)}`;
  return apiGet<ThreadPageDto>(`${threadPath(id, recipientId, 'messages')}${query}`);
}

/**
 * Wiadomość w rozmowie. Identyfikator nadaje panel: wysyłka ponowiona po zerwanym łączu
 * niesie TEN SAM, więc serwer nie zapisze jej drugi raz (201 przy zapisie, 200 przy powtórce).
 */
export async function sendThreadMessage(
  id: string,
  recipientId: string,
  message: { id: string; body: string },
): Promise<ThreadMessageDto> {
  const res = await apiPost<{ message: ThreadMessageDto }>(threadPath(id, recipientId, 'messages'), message);
  return res.message;
}

/** Odczyt rozmowy przez uczestnika - „Odczytane" u drugiej strony; odczyt czytelnika nie zapala niczego. */
export async function markThreadRead(id: string, recipientId: string): Promise<void> {
  await apiPost<null>(threadPath(id, recipientId, 'read'));
}
