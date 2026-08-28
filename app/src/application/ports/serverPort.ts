/**
 * UZ Aero — PORT serwera synchronizacji (§4.6).
 *
 * Jedyne miejsce, w którym aplikacja „wie", że istnieje serwer. Kontrakt odpowiada
 * 1:1 endpointom z §4.6; kształty danych idą z domeny, więc telefon i serwer nie mają
 * osobnych definicji tych samych rzeczy.
 *
 * Adapter produkcyjny robi HTTP (fetch); testy wstrzykują implementację w pamięci —
 * pętla synca musi być testowalna bez sieci, bo jej najciekawsze przypadki to właśnie
 * BRAK sieci i tokeny, które wygasły w połowie pracy.
 *
 * Błędy: metody rzucają `ServerUnreachableError` (offline/timeout — normalny stan
 * pracy, nie awaria) albo `ServerRejectedError` (serwer odpowiedział odmową — 401/403/4xx,
 * z kodem do decyzji wołającego). Rozróżnienie jest sednem offline-first: na pierwsze
 * odpowiadamy „spróbuj później", na drugie trzeba zareagować (odświeżyć token, pokazać
 * powód).
 */

import type {
  Event,
  Handover,
  OilHandover,
  OperationType,
  ReferenceAircraft,
  ReferencePilot,
  SessionFlag,
  SessionTrackPayload,
} from '../../domain';

/** Para tokenów + tożsamość — wynik logowania i odświeżenia (§3.0). */
export interface AuthTokens {
  token: string;
  refreshToken: string;
  pilot: { id: string; code: string; name: string };
}

/** Wynik przyjęcia paczki przez serwer (§4.3, §4.5). */
export interface PushResult {
  accepted: number;
  duplicates: number;
  /** Otwarte flagi dotykające wysłanych sesji — do pokazania na ekranie 11. */
  flags: SessionFlag[];
}

/**
 * Strona własnego rejestru z `GET /me/events` (§4.9, issue #32) — droga POWROTNA
 * outboxa, czyli odtworzenie lokalnego strumienia na urządzeniu, które go straciło.
 *
 * `cursor` jest dla telefonu NIEPRZEZROCZYSTY: opisuje pozycję w porządku serwera
 * i wraca w takiej postaci, w jakiej przyszedł. `nextCursor: null` znaczy „na teraz
 * masz wszystko" — kursor zapamiętujemy i przy kolejnej okazji pytamy od niego,
 * więc pełne pobranie zdarza się raz, a potem jedzie sama dosyłka.
 */
export interface RemoteEventPage {
  /** Zdarzenia BEZ `syncedAt` — to pole jest księgowością telefonu, nie serwera. */
  events: Omit<Event, 'syncedAt'>[];
  /**
   * Pozycja ZA ostatnim zdarzeniem strony — wypełniona także wtedy, gdy strona była
   * ostatnia (`null` tylko dla strony pustej). To ją telefon zapamiętuje.
   */
  nextCursor: string | null;
  /** Czy za tą stroną jest jeszcze co czytać — telefon pętli się, dopóki `true`. */
  hasMore: boolean;
}

/** Migawka `GET /reference` — wejście do cache referencyjnego (§4.8). */
export interface ReferenceData {
  aircraft: ReferenceAircraft[];
  pilots: ReferencePilot[];
}

/**
 * Wynik `GET /reference` z obsługą ETag (§4.8): `data: null` = 304 Not Modified —
 * serwer potwierdził, że cache jest aktualny, i nie wysyłał ciała. `etag` zapamiętuje
 * wołający i podaje przy następnym zapytaniu.
 */
export interface ReferenceFetch {
  data: ReferenceData | null;
  etag: string | null;
}

/**
 * Preferencje pilota z `/me/prefs` (decyzja 2026-07-29: motyw wędruje za pilotem
 * między urządzeniami). `theme` jest dla portu NIEPRZEZROCZYSTĄ nazwą — listę
 * motywów znają wyłącznie tokeny UI; `null` = pilot nigdy nie wybrał motywu.
 * `themeUpdatedAt` to ISO UTC stempla DECYZJI pilota (zegar telefonu) — oś LWW.
 */
export interface RemoteThemePrefs {
  theme: string | null;
  themeUpdatedAt: string | null;
}

/** Stan samolotu z `GET /aircraft/:id/state` — claim + przekazanie (§4.6). */
export interface RemoteAircraftState {
  aircraftId: string;
  claimPicId: string | null;
  claimSince: number | null;
  handover: Handover | null;
  lastSyncAt: string | null;
}

/**
 * Stan sesji po stronie serwera z `GET /sessions/:uuid/sync-status` — ekran 11.
 *
 * `received` to liczba zdarzeń, które SERWER widzi (nie mylić z licznikiem outboxa),
 * a `exportUrl` wypełni się dopiero, gdy serwerowy eksport do Sheets powstanie (faza 4)
 * — do tego czasu jest jawnym `null`, nie brakującym polem.
 */
export interface SessionSyncStatus {
  sessionUuid: string;
  received: number;
  /** Stan wg PROJEKCJI serwera; `unknown` = serwer nie widział jeszcze tej sesji. */
  status: 'active' | 'closed' | 'unknown';
  flags: SessionFlag[];
  exportUrl: string | null;
}

/**
 * Podpowiedzi do formularza zadania (`GET /me/task-suggestions`, issue #14) — ostatnio
 * używane oznaczenia klientów i notatki.
 *
 * Świadomie **tylko online**. To jedyna rzecz w tym formularzu, która nie ma prawa
 * niczego zablokować: bez zasięgu pilot po prostu wpisuje wartość z palca, tak jak
 * dotąd. Cache byłby tu kosztem bez zysku — lista podpowiedzi to wygoda, a nie dane,
 * których brak zmienia dzień lotny (`CLAUDE.md`, offline-first pkt 3 dotyczy AKCJI
 * wymagających sieci; tu akcja działa, chudsza jest tylko podpowiedź).
 *
 * `operation` przy kliencie odpowiada na pytanie „co to było za zlecenie" — ten sam
 * klient bywa i skokami, i przelotem, a pilot wybiera z listy po pamięci ostatniego dnia.
 */
export interface RemoteTaskSuggestions {
  clients: { value: string; operation: OperationType | null; lastUsedAt: string }[];
  notes: { value: string; lastUsedAt: string }[];
}

export class ServerUnreachableError extends Error {
  constructor(cause?: unknown) {
    super('Serwer nieosiągalny');
    this.name = 'ServerUnreachableError';
    this.cause = cause;
  }
}

export class ServerRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Serwer odmówił: ${status} ${code}`);
    this.name = 'ServerRejectedError';
  }
}

/** Jeden koniec łańcucha paliwa: czyj odczyt, kiedy i jaki (issue #62). */
export interface RemoteReadingsChainLink {
  sessionUuid: string;
  picId: string;
  at: number;
  fuelL: number;
  mh: number;
}

/**
 * Sąsiedztwo w łańcuchu paliwa. Oba pola bywają `null` i to jest NORMALNY stan,
 * nie brak danych: pierwszy lot maszyny nie ma poprzednika, najnowszy — następcy.
 */
export interface RemoteReadingsChain {
  before: RemoteReadingsChainLink | null;
  after: RemoteReadingsChainLink | null;
  /**
   * Ostatni POMIAR OLEJU nie później niż pytana chwila, razem z sumą dolewek od niego.
   *
   * Olej idzie WŁASNĄ osią, bo bagnet tuż po locie kłamie i zdanie samolotu oleju
   * NIE MIERZY (issue #60): interwał biegnie pomiar→pomiar przez wiele sesji, więc
   * pary „przed/po" tu nie ma — jest kotwica. Ten sam kształt, co `Handover.oil`,
   * więc ekran liczy z niej oczekiwanie tym samym `oilPreflight`, co na 02a.
   */
  oil: OilHandover | null;
}

export interface ServerPort {
  login(login: string, password: string): Promise<AuthTokens>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  pushEvents(token: string, events: Event[], sourceDevice: string | null): Promise<PushResult>;
  /**
   * Strona WŁASNYCH zdarzeń pilota (`GET /me/events`, §4.9) — kierunek powrotny
   * `pushEvents`. Tożsamość bierze się z tokenu, więc port nie ma gdzie przyjąć
   * cudzego `picId`: to jest odtworzenie własnego rejestru, nie czytnik cudzych dni.
   */
  pullEvents(
    token: string,
    params: { cursor?: string | null; limit?: number },
  ): Promise<RemoteEventPage>;
  getReference(token: string, etag?: string | null): Promise<ReferenceFetch>;
  getAircraftState(token: string, aircraftId: string): Promise<RemoteAircraftState>;
  /**
   * Ciągłość odczytów wokół chwili (`GET /aircraft/:id/readings-chain`, issue #62) — czym
   * maszyna została ZDANA przed tym lotem i co zastał ten, kto ją przejął PO nim.
   *
   * Osobno od `getAircraftState`, bo to inne pytanie: tamto mówi „ile jest teraz",
   * a wpis ręczny opisuje czwartek — i między czwartkiem a dziś maszyna zdążyła
   * polatać. WYŁĄCZNIE online: brak odpowiedzi znaczy „nie wiem" i ekran wtedy
   * o ciągłości milczy, zamiast zgadywać z ostatniego przekazania.
   */
  getReadingsChain(
    token: string,
    aircraftId: string,
    params: { at: number; exceptSessionUuid?: string },
  ): Promise<RemoteReadingsChain>;
  getSyncStatus(token: string, sessionUuid: string): Promise<SessionSyncStatus>;
  /**
   * Ślad kalibracyjny GPS (faza 5) na `POST /traces` — osobny, niskopriorytetowy tor
   * obok outboxa zdarzeń; serwer odkłada NDJSON per sesja do analizy progów.
   */
  pushTraces(token: string, entries: unknown[]): Promise<{ accepted: number }>;
  /**
   * Ślad sesji do narysowania (`GET /me/sessions/:uuid/track`, issue #47) — kierunek
   * POWROTNY `pushTraces`. Telefon oddaje surowe fixy i kasuje swoją kopię, więc ekran
   * 14 pobiera stąd gotową geometrię: linię i profil po uproszczeniu, próbkę logu
   * i statystyki. Tożsamość bierze się z tokenu — cudza sesja jest nie do odróżnienia
   * od nieistniejącej (404).
   */
  getSessionTrack(token: string, sessionUuid: string): Promise<SessionTrackPayload>;
  /** Podpowiedzi do formularza zadania (`GET /me/task-suggestions`) — wyłącznie online. */
  getTaskSuggestions(token: string): Promise<RemoteTaskSuggestions>;
  /** Preferencje pilota Z TOKENU (`GET /me/prefs`). */
  getPrefs(token: string): Promise<RemoteThemePrefs>;
  /**
   * `PUT /me/prefs` — zapis LWW po `themeUpdatedAt`; odpowiedź jest ZAWSZE stanem
   * autorytatywnym po operacji (przegrany stempel dostaje zwycięzcę do adopcji).
   */
  putPrefs(token: string, prefs: { theme: string; themeUpdatedAt: string }): Promise<RemoteThemePrefs>;
}
