/**
 * Ninerdeck - ZLECENIA NA LOT na drucie, strona telefonu (4.0.0, epik Z-C #247;
 * `docs/zlecenia.md` §13, §13.1).
 *
 * Osobny port od `ServerPort`, bo to osobny moduł z osobnym klientem (`OrderClient`)
 * i osobnym adapterem (`HttpOrderApi`) - wspólny jest tylko transport HTTP. Kształty
 * stoją tu tak, jak oddaje je serwer (`server/src/http/routes/common/orderWire.ts`):
 * chwile jako napisy ISO, doba klubu przy każdym terminie.
 *
 * ══ CAŁY MODUŁ WYMAGA SIECI ══
 * Zlecenie jest UMOWĄ MIĘDZY LUDŹMI, której arbitrem jest serwer (§2.2). Cache'u zleceń
 * i rozmów w telefonie NIE MA i nie wolno go dorobić po cichu - brak odpowiedzi znaczy
 * „nie wiem", a ekran mówi to wprost. Świeżość przynosi kanał klubu (tematy `orders`
 * i `order:<id>`, ramki `message` i `read`), nie odpytywanie.
 *
 * ══ KSZTAŁT ZALEŻY OD WIDZA (§13.1) ══
 * Prowadzący (autor z „Zlecaniem lotów", każdy z „Cudzymi rezerwacjami") dostaje komplet:
 * adresatów z odczytami, odpowiedziami i rozmowami oraz historię zmian. Adresat dostaje
 * zlecenie, swój fotel, swoją odpowiedź i to, CO się zmieniło - bez ani słowa o innych
 * adresatach (pkt 18). Pola, których widz nie widzi, przychodzą jako `null`; pola
 * istniejące wyłącznie dla prowadzącego są opcjonalne (`audienceLabel`).
 *
 * Kody odmów zostają NAPISAMI, jak przy zapisie rezerwacji: serwer nowszy niż aplikacja
 * dokłada kody, a nazwanie ich po polsku jest sprawą ekranu.
 */

import type { RemoteBooking, RemoteCalendarDay } from './serverPort';

/** Fotel w samolocie. */
export type RemoteSeat = 'pic' | 'dual';

/** Stany zlecenia (§5): `open` i `filled` żyją, `cancelled` i `expired` są końcowe. */
export type RemoteOrderStatus = 'open' | 'filled' | 'cancelled' | 'expired';

/** Odpowiedź adresata: „PRZYJMUJĘ"/„MOGĘ LECIEĆ" albo „NIE MOGĘ". */
export type RemoteOrderAnswer = 'yes' | 'no';

/**
 * Dlaczego zlecenie przestało być dla adresata aktualne (28B): zamknięte, odebrane,
 * fotel przestał być szukany albo obsadził go ktoś inny.
 */
export type RemoteStaleReason = 'closed' | 'removed' | 'seat_dropped' | 'seat_filled';

/** Stany foteli (§4.1): „ja", „szukam" i - wyłącznie przy drugim pilocie - „brak". */
export interface RemoteOrderSeats {
  pic: 'self' | 'sought';
  dual: 'self' | 'sought' | 'none';
}

/** Sposób adresowania (§4.2): per fotel albo wspólna lista bez foteli. */
export type RemoteOrderAddressing = 'per_seat' | 'shared';

/** Zlecenie. Etykieta adresowania WYŁĄCZNIE dla prowadzącego. */
export interface RemoteOrder {
  id: string;
  status: RemoteOrderStatus;
  /** Wersja - podnosi ją WYŁĄCZNIE zmiana terminu (§5.1). */
  revision: number;
  createdBy: string;
  seats: RemoteOrderSeats;
  addressing: RemoteOrderAddressing;
  editedAt: string | null;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
  /** „dowódca: Instruktorzy · drugi pilot: A. Nowak" - tylko prowadzący. */
  audienceLabel?: string;
}

/** Termin zlecenia - treść zlecenia, więc w komplecie dla każdego, kto je widzi. */
export interface RemoteOrderBooking {
  id: string;
  aircraftId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  operation: string | null;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  note: string | null;
  /** Załoga już obsadzona; `null` = fotel bez osoby. */
  pilotId: string | null;
  dualId: string | null;
}

/** Ja jako adresat - karta 28, wiersz „Do mnie". */
export interface RemoteOrderMe {
  /** Fotel, na który trafiłem; `null` = wspólna lista albo termin do potwierdzenia. */
  seat: RemoteSeat | null;
  /** Fotel, na który wskazano mnie imiennie (przy terminie do potwierdzenia). */
  namedSeat: RemoteSeat | null;
  /** Wskazany imiennie jako JEDYNY adresat fotela - moje „tak" obsadza go od razu. */
  direct: boolean;
  /** Odpowiedź w BIEŻĄCEJ wersji. */
  answer: RemoteOrderAnswer | null;
  answerReason: string | null;
  answeredAt: string | null;
  /** Odpowiedź z poprzedniego terminu - przekreślona na 28C. */
  previousAnswer: RemoteOrderAnswer | null;
  seen: boolean;
  removed: boolean;
  /** Czy zlecenie jest dla mnie jeszcze w grze - inaczej 28B. */
  inPlay: boolean;
  staleReason: RemoteStaleReason | null;
  /** Fotel, w którym siedzę - lot jest już moją rezerwacją. */
  assignedSeat: RemoteSeat | null;
  threadId: string | null;
  /** Nieprzeczytane wiadomości w mojej rozmowie. */
  unread: number;
}

/** Inna rezerwacja osoby w tym terminie - bursztyn przy wyborze i przed odpowiedzią (§4.3). */
export interface RemoteOrderConflict {
  bookingId: string;
  aircraftId: string;
  startsAt: string;
  endsAt: string;
}

/** Adresat widziany przez prowadzącego - karta 32. */
export interface RemoteOrderRecipient {
  pilotId: string;
  seat: RemoteSeat | null;
  namedSeat: RemoteSeat | null;
  direct: boolean;
  /** Grupa, przez którą trafił; `null` = wskazany imiennie. */
  viaGroupId: string | null;
  answer: RemoteOrderAnswer | null;
  previousAnswer: RemoteOrderAnswer | null;
  answerReason: string | null;
  answeredAt: string | null;
  /** „Odczytane 14:02" w bieżącej wersji. */
  seen: boolean;
  seenAt: string | null;
  lastSeenAt: string | null;
  /** Otworzył kartę PRZED ostatnią edycją - „zmiana z 15:10 nieodczytana" (§8). */
  editUnseen: boolean;
  inPlay: boolean;
  staleReason: RemoteStaleReason | null;
  assignedSeat: RemoteSeat | null;
  removed: boolean;
  removedAt: string | null;
  conflict: RemoteOrderConflict | null;
  threadId: string | null;
  /** Nieprzeczytane przez AUTORA wiadomości od tego adresata; u pozostałych prowadzących 0. */
  unread: number;
}

/**
 * Wpis historii zmian (§10.3). Rodzaj jest NAPISEM, bo historia jest zapisem, a serwer
 * nowszy niż aplikacja dokłada rodzaje - wpis nieznanego rodzaju ma się przeczytać,
 * nie wywrócić ekranu.
 */
export interface RemoteOrderHistoryEntry {
  id: string;
  /** `null` = zegar (wygaśnięcie). */
  actorId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  at: string;
}

/** Karta zlecenia (28, 32) - kształt wynika z widza. */
export interface RemoteOrderCard {
  /** Strefa klubu - napis do wyświetlenia, nie materiał do rachunku. */
  timezone: string;
  /** Doba klubu początku terminu - godziny liczą się odejmowaniem od jej granic. */
  day: RemoteCalendarDay;
  order: RemoteOrder;
  booking: RemoteOrderBooking;
  viewer: {
    /** Czy pytający prowadzi to zlecenie. */
    leads: boolean;
    /** Ja jako adresat; `null` = nie jestem adresatem. */
    recipient: RemoteOrderMe | null;
  };
  /** Ostatnia edycja inna niż termin, BEZ nazwiska (pkt 31): klucze zmian i chwila. */
  lastEdit: { at: string; changes: Record<string, unknown> } | null;
  /** Ostatnia zmiana terminu - 28C pokazuje, z czego na co. */
  lastTermChange: { at: string; from: unknown; to: unknown } | null;
  /** Moje inne rezerwacje w tym terminie - widzę je przed odpowiedzią (§4.3). */
  myConflicts: RemoteOrderConflict[];
  /** Wyłącznie prowadzący. */
  recipients: RemoteOrderRecipient[] | null;
  history: RemoteOrderHistoryEntry[] | null;
}

/** Postęp w wierszu „Zlecone" - „5 z 6 odczytało · 2 mogą lecieć" albo jedna osoba i jej stan. */
export interface RemoteOrderProgress {
  recipients: number;
  seen: number;
  volunteers: number;
  single: {
    pilotId: string;
    seen: boolean;
    answer: RemoteOrderAnswer | null;
    answeredAt: string | null;
  } | null;
}

export interface RemoteOrderListItem {
  day: RemoteCalendarDay;
  order: RemoteOrder;
  booking: RemoteOrderBooking;
  /** „Do mnie": ja jako adresat; w „Zlecone" `null`. */
  me: RemoteOrderMe | null;
  /** „Zlecone": postęp odpowiedzi; w „Do mnie" `null`. */
  progress: RemoteOrderProgress | null;
  unread: number;
}

/** Połowa listy (30): „Do mnie" albo „Zlecone". */
export type RemoteOrderBox = 'inbox' | 'managed';

export interface RemoteOrderList {
  timezone: string;
  items: RemoteOrderListItem[];
}

/**
 * Liczby karty „Zlecenia" na Pulpicie (20F) i bity, którymi telefon rozstrzyga, co
 * pokazać - zdolności nie zna (§9): `canCreate` = „Zlecanie lotów", `canManage` =
 * „Cudze rezerwacje".
 */
export interface RemoteOrderSummary {
  awaitingAnswer: number;
  seekingCrew: number;
  canCreate: boolean;
  canManage: boolean;
}

/** Odpowiedź na „PRZYJMUJĘ"/„MOGĘ LECIEĆ"/„NIE MOGĘ" - wynik o stanie, nigdy awaria (§20 Z3). */
export type RemoteAnswerOutcome =
  /** Imiennie: fotel obsadzony tą odpowiedzią. */
  | { kind: 'assigned'; seat: RemoteSeat }
  /** Zgłoszenie - fotel wybierze prowadzący. */
  | { kind: 'volunteered' }
  | { kind: 'declined' }
  /** „Tak" na fotel, który zdążył zająć ktoś inny - zapisane jako gotowość (pkt 54). */
  | { kind: 'seat_filled' }
  /** Zlecenie odwołane, wygasłe albo odebrane. */
  | { kind: 'closed' };

/** Wiadomość w rozmowie. */
export interface RemoteThreadMessage {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

/** Kursor strony rozmowy - PARA, jak w skrzynce: sam stempel nie porządkuje jednoznacznie. */
export interface ThreadCursor {
  beforeAt: string;
  beforeId: string;
}

/** Strona rozmowy (29, 29B), od najnowszej wiadomości. */
export interface RemoteThreadPage {
  /** `reader` = czytam z „Cudzymi rezerwacjami", bez pisania (pkt 19). */
  role: 'participant' | 'reader';
  /** `null` = da się pisać; inaczej powód w polu wiadomości. */
  closed: 'read_only' | 'thread_closed' | null;
  /** `null` = rozmowa jeszcze nie powstała (zakłada ją pierwsza wiadomość). */
  threadId: string | null;
  participants: { pilotId: string; lastReadAt: string | null }[];
  messages: RemoteThreadMessage[];
  /** Kursor następnej (starszej) strony; `null` = to już początek rozmowy. */
  next: ThreadCursor | null;
}

/** Grupa klubu - adresaci zlecenia (§6.1). Lista osób jedzie z wyłączonymi. */
export interface RemoteMemberGroup {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lista adresatów: osoby i grupy - grupy rozwija serwer przy wysłaniu (§6.2). */
export interface RemoteAddressList {
  pilotIds: string[];
  groupIds: string[];
}

/** Adresowanie przy wysłaniu: per fotel albo wspólna lista. */
export type RemoteOrderAudience =
  | { kind: 'per_seat'; pic: RemoteAddressList | null; dual: RemoteAddressList | null }
  | { kind: 'shared'; list: RemoteAddressList };

/** Nowe zlecenie (`POST /orders`). Uuid nadaje TELEFON - powtórzony zapis wraca tym samym. */
export interface RemoteOrderDraft {
  id: string;
  aircraftId: string;
  startsAt: string;
  endsAt: string;
  operation: string;
  fromIcao?: string | null;
  toIcao?: string | null;
  plannedAirMin?: number | null;
  plannedFuelL?: number | null;
  note?: string | null;
  seats: RemoteOrderSeats;
  audience: RemoteOrderAudience;
}

/**
 * Zmiana zlecenia (`PATCH /orders/:id`). Pola pominięte zostają bez zmian; zamiana osoby
 * to `removeRecipients` i `addRecipients` w JEDNYM żądaniu (pkt 29), „Wyślij ponownie"
 * to `resend: true` (pkt 41).
 */
export interface RemoteOrderPatch {
  aircraftId?: string;
  startsAt?: string;
  endsAt?: string;
  operation?: string;
  fromIcao?: string | null;
  toIcao?: string | null;
  plannedAirMin?: number | null;
  plannedFuelL?: number | null;
  note?: string | null;
  seats?: RemoteOrderSeats;
  addRecipients?: { seat: RemoteSeat | null; list: RemoteAddressList }[];
  removeRecipients?: string[];
  resend?: boolean;
  reason?: string | null;
}

/**
 * Wynik zapisu zlecenia. Odmowa NIE JEST wyjątkiem, bo `slot_taken` niesie TREŚĆ -
 * kolidującą zajętość w kształcie kalendarza, jak przy rezerwacji (22C); pozostałe kody
 * ekran nazywa zdaniem. Sukces niesie świeżą kartę w kształcie widza - ekran nie pyta
 * drugi raz.
 */
export type OrderWriteResult =
  | { ok: true; card: RemoteOrderCard }
  | {
      ok: false;
      refusal: string;
      taken: RemoteBooking | null;
      /** Kiedy POWSTAŁA kolidująca zajętość (UTC, ms); `null` = odmowa bez zajętości. */
      takenAt: number | null;
    };

/** Wynik odpowiedzi adresata - wynik o stanie z kartą obok albo odmowa z kodem. */
export type OrderAnswerResult =
  | { ok: true; outcome: RemoteAnswerOutcome; card: RemoteOrderCard | null }
  | { ok: false; refusal: string };

/** Wynik wysłania wiadomości - zapisana albo odmowa (`thread_closed`, `read_only`, …). */
export type ThreadSendResult =
  | { ok: true; message: RemoteThreadMessage }
  | { ok: false; refusal: string };

export interface OrderServerPort {
  /** Liczby karty „Zlecenia" i bity `canCreate`/`canManage` (`GET /orders/summary`). */
  getOrderSummary(token: string): Promise<RemoteOrderSummary>;
  /** „Do mnie" albo „Zlecone" (`GET /orders?box=`); „Zlecone" bez prawa = 403. */
  getOrders(token: string, box: RemoteOrderBox): Promise<RemoteOrderList>;
  /** Karta zlecenia (`GET /orders/:id`); cudze i nieistniejące są nie do odróżnienia (404). */
  getOrder(token: string, id: string): Promise<RemoteOrderCard>;
  createOrder(token: string, draft: RemoteOrderDraft): Promise<OrderWriteResult>;
  patchOrder(token: string, id: string, patch: RemoteOrderPatch): Promise<OrderWriteResult>;
  /** Odwołanie (`POST /orders/:id/cancel`); powód opcjonalny (§5.6). */
  cancelOrder(token: string, id: string, reason: string | null): Promise<OrderWriteResult>;
  /** Odczyt bieżącej wersji przez adresata (`POST /orders/:id/seen`, §8). */
  markOrderSeen(token: string, id: string): Promise<void>;
  answerOrder(
    token: string,
    id: string,
    body: { answer: RemoteOrderAnswer; reason: string | null },
  ): Promise<OrderAnswerResult>;
  /** Przydział spośród zgłoszonych (`POST /orders/:id/assign`). */
  assignOrderSeat(
    token: string,
    id: string,
    body: { pilotId: string; seat: RemoteSeat },
  ): Promise<OrderWriteResult>;
  /** Cofnięcie przydziału (`POST /orders/:id/unassign`); powód opcjonalny. */
  unassignOrderSeat(
    token: string,
    id: string,
    body: { seat: RemoteSeat; reason: string | null },
  ): Promise<OrderWriteResult>;
  /** Rezygnacja przydzielonego z własnego fotela (`POST /orders/:id/withdraw`). */
  withdrawFromOrder(token: string, id: string, reason: string | null): Promise<OrderWriteResult>;
  /** Strona rozmowy z adresatem (`GET /orders/:id/threads/:recipientId/messages`). */
  getThread(
    token: string,
    orderId: string,
    recipientId: string,
    page?: { limit?: number; before?: ThreadCursor },
  ): Promise<RemoteThreadPage>;
  /** Wiadomość (`POST …/messages`) - uuid nadaje telefon, powtórzony zapis to ta sama wiadomość. */
  sendThreadMessage(
    token: string,
    orderId: string,
    recipientId: string,
    body: { id: string; body: string },
  ): Promise<ThreadSendResult>;
  /** Odczyt rozmowy przez uczestnika (`POST …/read`) - „Odczytane 14:05" u drugiej strony. */
  markThreadRead(token: string, orderId: string, recipientId: string): Promise<void>;
  /** Grupy klubu do adresowania (`GET /groups`) - wyłącznie z „Zlecaniem lotów". */
  getGroups(token: string): Promise<RemoteMemberGroup[]>;
}
