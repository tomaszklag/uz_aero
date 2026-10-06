/**
 * Ninerdeck - ADAPTER `OrderServerPort` na fetch: zlecenia na lot i rozmowy (4.0.0,
 * epik Z-C #247; `docs/zlecenia.md` §13).
 *
 * Ten sam transport, co `HttpServerApi` (`httpTransport.ts`) - osobny jest tylko przekład
 * odpowiedzi. Odczyty idą przez `request`: odpowiedź poza 2xx to `ServerRejectedError`,
 * który `authorizedFetch` zwija do „nie wiem". ZAPISY idą przez `send`, bo odmowa niesie
 * TREŚĆ: kod, który ekran nazywa zdaniem, a przy `slot_taken` także kolidującą zajętość
 * (22C). Sukces zapisu niesie świeżą kartę w kształcie widza - ekran nie pyta drugi raz.
 *
 * Dwa wyjątki od „odmowa jest wynikiem", wspólne dla wszystkich zapisów:
 *  • `401` zostaje wyjątkiem - `authorizedFetch` odświeży tokeny i ponowi żądanie;
 *  • odpowiedź BEZ nazwanego kodu (500, nie-JSON) to awaria, nie odmowa reguły - i tak
 *    ma wyglądać na ekranie.
 * Awaria SIECI zostaje wyjątkiem transportu: „nie wiem, czy zapisano" to inna wiadomość
 * niż „odmówiono".
 */

import type {
  OrderAnswerResult,
  OrderServerPort,
  OrderWriteResult,
  RemoteAnswerOutcome,
  RemoteBooking,
  RemoteMemberGroup,
  RemoteOrderAnswer,
  RemoteOrderBox,
  RemoteOrderCard,
  RemoteOrderDraft,
  RemoteOrderList,
  RemoteOrderPatch,
  RemoteOrderSummary,
  RemoteSeat,
  RemoteThreadMessage,
  RemoteThreadPage,
  ThreadCursor,
  ThreadSendResult,
} from '../../application/ports';
import { ServerRejectedError } from '../../application/ports';
import { errorCode, type HttpTransport } from './httpTransport';

const path = (id: string): string => `/orders/${encodeURIComponent(id)}`;
const threadPath = (orderId: string, recipientId: string): string =>
  `${path(orderId)}/threads/${encodeURIComponent(recipientId)}`;

/** Powód opcjonalny (§5.6) - bez niego ciało jest puste, a nie `{ reason: null }`. */
const reasonBody = (reason: string | null): Record<string, string> => (reason == null ? {} : { reason });

export class HttpOrderApi implements OrderServerPort {
  /** Transport podaje composition root - ten sam, co `HttpServerApi`. */
  constructor(private readonly http: HttpTransport) {}

  getOrderSummary(token: string): Promise<RemoteOrderSummary> {
    return this.http.request('GET', '/orders/summary', { token });
  }

  getOrders(token: string, box: RemoteOrderBox): Promise<RemoteOrderList> {
    return this.http.request('GET', `/orders?box=${box}`, { token });
  }

  getOrder(token: string, id: string): Promise<RemoteOrderCard> {
    return this.http.request('GET', path(id), { token });
  }

  async createOrder(token: string, draft: RemoteOrderDraft): Promise<OrderWriteResult> {
    return writeResult(await this.http.send('POST', '/orders', { token, body: draft }));
  }

  async patchOrder(token: string, id: string, patch: RemoteOrderPatch): Promise<OrderWriteResult> {
    return writeResult(await this.http.send('PATCH', path(id), { token, body: patch }));
  }

  async cancelOrder(token: string, id: string, reason: string | null): Promise<OrderWriteResult> {
    return writeResult(await this.http.send('POST', `${path(id)}/cancel`, { token, body: reasonBody(reason) }));
  }

  async markOrderSeen(token: string, id: string): Promise<void> {
    const response = await this.http.send('POST', `${path(id)}/seen`, { token });
    if (!response.ok) throw new ServerRejectedError(response.status, await errorCode(response));
  }

  async answerOrder(
    token: string,
    id: string,
    body: { answer: RemoteOrderAnswer; reason: string | null },
  ): Promise<OrderAnswerResult> {
    const response = await this.http.send('POST', `${path(id)}/answer`, {
      token,
      body: { answer: body.answer, ...reasonBody(body.reason) },
    });
    const parsed = (await response.json().catch(() => null)) as
      | { outcome?: RemoteAnswerOutcome; card?: RemoteOrderCard | null; error?: string }
      | null;
    if (response.ok) {
      if (parsed?.outcome == null) throw new ServerRejectedError(response.status, `http_${response.status}`);
      return { ok: true, outcome: parsed.outcome, card: parsed.card ?? null };
    }
    return { ok: false, refusal: refusalOf(response, parsed) };
  }

  async assignOrderSeat(
    token: string,
    id: string,
    body: { pilotId: string; seat: RemoteSeat },
  ): Promise<OrderWriteResult> {
    return writeResult(await this.http.send('POST', `${path(id)}/assign`, { token, body }));
  }

  async unassignOrderSeat(
    token: string,
    id: string,
    body: { seat: RemoteSeat; reason: string | null },
  ): Promise<OrderWriteResult> {
    const response = await this.http.send('POST', `${path(id)}/unassign`, {
      token,
      body: { seat: body.seat, ...reasonBody(body.reason) },
    });
    return writeResult(response);
  }

  async withdrawFromOrder(token: string, id: string, reason: string | null): Promise<OrderWriteResult> {
    return writeResult(await this.http.send('POST', `${path(id)}/withdraw`, { token, body: reasonBody(reason) }));
  }

  getThread(
    token: string,
    orderId: string,
    recipientId: string,
    page?: { limit?: number; before?: ThreadCursor },
  ): Promise<RemoteThreadPage> {
    const query = new URLSearchParams();
    if (page?.limit != null) query.set('limit', String(page.limit));
    if (page?.before != null) {
      query.set('beforeAt', page.before.beforeAt);
      query.set('beforeId', page.before.beforeId);
    }
    const suffix = query.toString();
    const base = `${threadPath(orderId, recipientId)}/messages`;
    return this.http.request('GET', suffix === '' ? base : `${base}?${suffix}`, { token });
  }

  async sendThreadMessage(
    token: string,
    orderId: string,
    recipientId: string,
    body: { id: string; body: string },
  ): Promise<ThreadSendResult> {
    const response = await this.http.send('POST', `${threadPath(orderId, recipientId)}/messages`, {
      token,
      body,
    });
    const parsed = (await response.json().catch(() => null)) as
      | { message?: RemoteThreadMessage; error?: string }
      | null;
    if (response.ok) {
      if (parsed?.message == null) throw new ServerRejectedError(response.status, `http_${response.status}`);
      return { ok: true, message: parsed.message };
    }
    return { ok: false, refusal: refusalOf(response, parsed) };
  }

  async markThreadRead(token: string, orderId: string, recipientId: string): Promise<void> {
    const response = await this.http.send('POST', `${threadPath(orderId, recipientId)}/read`, { token });
    if (!response.ok) throw new ServerRejectedError(response.status, await errorCode(response));
  }

  async getGroups(token: string): Promise<RemoteMemberGroup[]> {
    const body = await this.http.request<{ groups?: RemoteMemberGroup[] }>('GET', '/groups', { token });
    return body.groups ?? [];
  }
}

/**
 * Kod odmowy z ciała odpowiedzi poza 2xx. `401` i odpowiedź bez kodu to WYJĄTEK (patrz
 * nagłówek pliku) - inaczej wygasły token wyglądałby jak odmowa reguły, a `authorizedFetch`
 * nie odświeżyłby go nigdy.
 */
function refusalOf(response: Response, body: { error?: string } | null): string {
  const refusal = body?.error;
  if (refusal == null || response.status === 401) {
    throw new ServerRejectedError(response.status, refusal ?? `http_${response.status}`);
  }
  return refusal;
}

/** Odpowiedź zapisu → wynik: świeża karta albo odmowa z tym, co koliduje (`slot_taken`). */
async function writeResult(response: Response): Promise<OrderWriteResult> {
  const body = (await response.json().catch(() => null)) as
    | (RemoteOrderCard & { error?: undefined })
    | { error?: string; taken?: RemoteBooking; takenAt?: string }
    | null;

  if (response.ok) {
    if (body == null || !('order' in body)) {
      throw new ServerRejectedError(response.status, `http_${response.status}`);
    }
    return { ok: true, card: body };
  }

  const refusal = refusalOf(response, body);
  const denial = body as { taken?: RemoteBooking; takenAt?: string } | null;
  const at = denial?.takenAt == null ? null : Date.parse(denial.takenAt);
  return {
    ok: false,
    refusal,
    taken: denial?.taken ?? null,
    takenAt: at == null || Number.isNaN(at) ? null : at,
  };
}
