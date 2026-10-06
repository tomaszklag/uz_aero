/**
 * Ninerdeck - KLIENT ZLECEŃ NA LOT i rozmów (4.0.0, epik Z-C #247; `docs/zlecenia.md`
 * §2.2, §13).
 *
 * Każde wywołanie idzie pod świeżym tokenem przez `authorizedFetch`: `401` → jedna
 * rotacja i ponowienie, każdy inny nieszczęśliwy koniec (offline, wygasła sesja, odmowa
 * ODCZYTU) → `null`, czyli „nie wiem TERAZ". Cały moduł wymaga sieci, a cache'u nie ma
 * (§2.2), więc `null` jest dla ekranu odpowiedzią do powiedzenia wprost: „BRAK
 * POŁĄCZENIA" przy odczycie, „zapis potwierdza serwer - potrzebne połączenie" przy
 * zapisie.
 *
 * Zapis ma TRZY odpowiedzi i każda jest inną wiadomością na ekranie:
 *  • `{ ok: true }`  - zapisano, karta wraca z serwera w kształcie widza,
 *  • `{ ok: false }` - REGUŁA odmówiła i mówi, dlaczego (a przy `slot_taken` - co stoi),
 *  • `null`          - nie wiadomo, czy zapisano (brak sieci, wygasła sesja).
 *
 * Osobno od `SyncEngine`, choć wzorzec jest ten sam: silnik opróżnia outbox zdarzeń
 * rejestru, a zlecenie nie jest zdarzeniem rejestru (§2.3) - to umowa między ludźmi,
 * której arbitrem jest serwer, więc zapis idzie wprost i odpowiada TERAZ.
 */

import type { AuthService } from '../auth/authService';
import type {
  OrderAnswerResult,
  OrderServerPort,
  OrderWriteResult,
  RemoteMemberGroup,
  RemoteOrderAnswer,
  RemoteOrderBox,
  RemoteOrderCard,
  RemoteOrderDraft,
  RemoteOrderList,
  RemoteOrderPatch,
  RemoteOrderSummary,
  RemoteSeat,
  RemoteThreadPage,
  ThreadCursor,
  ThreadSendResult,
} from '../ports';
import { authorizedFetch } from './authorizedFetch';

export class OrderClient {
  constructor(
    private readonly server: OrderServerPort,
    private readonly auth: AuthService,
  ) {}

  /** Liczby karty „Zlecenia" na Pulpicie (20F) i bity `canCreate`/`canManage`. */
  fetchSummary(): Promise<RemoteOrderSummary | null> {
    return this.read((token) => this.server.getOrderSummary(token));
  }

  /** „Do mnie" albo „Zlecone" (30). */
  fetchList(box: RemoteOrderBox): Promise<RemoteOrderList | null> {
    return this.read((token) => this.server.getOrders(token, box));
  }

  /** Karta zlecenia (28, 32) w kształcie widza. */
  fetchCard(id: string): Promise<RemoteOrderCard | null> {
    return this.read((token) => this.server.getOrder(token, id));
  }

  /** Nowe zlecenie - termin zajmuje się od chwili zapisu (pkt 1). */
  create(draft: RemoteOrderDraft): Promise<OrderWriteResult | null> {
    return this.read((token) => this.server.createOrder(token, draft));
  }

  /** Zmiana zlecenia, dopisanie i odebranie adresatów, „Wyślij ponownie". */
  patch(id: string, patch: RemoteOrderPatch): Promise<OrderWriteResult | null> {
    return this.read((token) => this.server.patchOrder(token, id, patch));
  }

  /** Odwołanie przez prowadzącego; termin wraca do puli. */
  cancel(id: string, reason: string | null): Promise<OrderWriteResult | null> {
    return this.read((token) => this.server.cancelOrder(token, id, reason));
  }

  /**
   * „Odczytane" (§8) - adresat otworzył kartę. `false` = nie dojechało: następne otwarcie
   * zapisze odczyt ponownie, a prowadzący zobaczy go wtedy z późniejszą godziną.
   */
  async markSeen(id: string): Promise<boolean> {
    const done = await this.read(async (token) => {
      await this.server.markOrderSeen(token, id);
      return true;
    });
    return done === true;
  }

  /** „PRZYJMUJĘ" / „MOGĘ LECIEĆ" / „NIE MOGĘ" z powodem opcjonalnym. */
  answer(id: string, body: { answer: RemoteOrderAnswer; reason: string | null }): Promise<OrderAnswerResult | null> {
    return this.read((token) => this.server.answerOrder(token, id, body));
  }

  /** Przydział spośród zgłoszonych - WYBIERZ / NA DOWÓDCĘ / NA DRUGIEGO PILOTA. */
  assign(id: string, body: { pilotId: string; seat: RemoteSeat }): Promise<OrderWriteResult | null> {
    return this.read((token) => this.server.assignOrderSeat(token, id, body));
  }

  /** Cofnięcie przydziału - fotel wraca do szukania, drugi zostaje (§5.3). */
  unassign(id: string, body: { seat: RemoteSeat; reason: string | null }): Promise<OrderWriteResult | null> {
    return this.read((token) => this.server.unassignOrderSeat(token, id, body));
  }

  /** Rezygnacja przydzielonego z własnego fotela (§5.3). */
  withdraw(id: string, reason: string | null): Promise<OrderWriteResult | null> {
    return this.read((token) => this.server.withdrawFromOrder(token, id, reason));
  }

  /** Strona rozmowy z adresatem, od najnowszej wiadomości. */
  fetchThread(
    orderId: string,
    recipientId: string,
    page?: { limit?: number; before?: ThreadCursor },
  ): Promise<RemoteThreadPage | null> {
    return this.read((token) => this.server.getThread(token, orderId, recipientId, page));
  }

  /** Wiadomość w rozmowie - uuid nadaje telefon, powtórzony zapis to ta sama wiadomość. */
  send(orderId: string, recipientId: string, body: { id: string; body: string }): Promise<ThreadSendResult | null> {
    return this.read((token) => this.server.sendThreadMessage(token, orderId, recipientId, body));
  }

  /** Odczyt rozmowy przez uczestnika - „Odczytane" u drugiej strony. `false` = nie dojechało. */
  async markThreadRead(orderId: string, recipientId: string): Promise<boolean> {
    const done = await this.read(async (token) => {
      await this.server.markThreadRead(token, orderId, recipientId);
      return true;
    });
    return done === true;
  }

  /** Grupy klubu do adresowania - wyłącznie z „Zlecaniem lotów"; inaczej `null`. */
  fetchGroups(): Promise<RemoteMemberGroup[] | null> {
    return this.read((token) => this.server.getGroups(token));
  }

  private read<T>(call: (token: string) => Promise<T>): Promise<T | null> {
    return authorizedFetch(this.auth, call);
  }
}
