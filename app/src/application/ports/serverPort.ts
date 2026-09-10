/**
 * UZ Aero - PORT serwera synchronizacji (§4.6).
 *
 * Jedyne miejsce, w którym aplikacja „wie", że istnieje serwer. Kontrakt odpowiada
 * 1:1 endpointom z §4.6; kształty danych idą z domeny, więc telefon i serwer nie mają
 * osobnych definicji tych samych rzeczy.
 *
 * Adapter produkcyjny robi HTTP (fetch); testy wstrzykują implementację w pamięci -
 * pętla synca musi być testowalna bez sieci, bo jej najciekawsze przypadki to właśnie
 * BRAK sieci i tokeny, które wygasły w połowie pracy.
 *
 * Błędy: metody rzucają `ServerUnreachableError` (offline/timeout - normalny stan
 * pracy, nie awaria) albo `ServerRejectedError` (serwer odpowiedział odmową - 401/403/4xx,
 * z kodem do decyzji wołającego). Rozróżnienie jest sednem offline-first: na pierwsze
 * odpowiadamy „spróbuj później", na drugie trzeba zareagować (odświeżyć token, pokazać
 * powód).
 */

import type { BugSeverity } from './bugReportPort';

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

/** Klub tak, jak nazywa go serwer - tyle, ile trzeba, żeby go NAPISAĆ na ekranie. */
export interface OrgRef {
  id: string;
  slug: string;
  name: string;
}

/**
 * Para tokenów + tożsamość W KLUBIE (§3.0, wielofirmowość §6).
 *
 * `org` mówi, DLA KTÓREGO klubu wydano tę parę - token jest tokenem klubu, więc flota,
 * przejęcie i wysyłka dzieją się w nim. `memberships` niesie komplet klubów osoby: z tego
 * telefon wie, czy w ogóle rysować przełącznik na 13A i plakietkę klubu na kafelku (01E) -
 * przy jednym członkostwie nie rysuje żadnego (reguła SyncChipa z issue #12).
 */
export interface AuthTokens {
  token: string;
  refreshToken: string;
  pilot: { id: string; code: string; name: string };
  org: OrgRef;
  memberships: ClubMembership[];
}

/** Kod pilota i rola w JEDNYM klubie - jedno i drugie należy do CZŁONKOSTWA (§3.2). */
export interface ClubMembership {
  org: OrgRef;
  code: string;
  role: string;
}

/**
 * Członkostwo tak, jak widzą je ekrany 00C/00D/00E i lista klubów na 13A: klub nazwany,
 * stan, powód odrzucenia i chwile.
 *
 * To NIE jest już „zgłoszenie rejestracyjne" (`docs/logowanie-google.md` §7): od
 * wielofirmowości oczekiwanie i odmowa dotyczą KLUBU, nie tożsamości Google - ta sama
 * osoba może czekać w jednym klubie i latać w drugim (wielofirmowość §4).
 */
export interface ClubMembershipView {
  org: OrgRef;
  /** Klub wyłączony przez superadministratora nie wpuszcza nikogo, choć członkostwo stoi. */
  clubActive: boolean;
  status: 'active' | 'pending' | 'rejected' | 'disabled';
  /** Kod pilota W TYM klubie; `null`, dopóki administrator go nie nadał. */
  code: string | null;
  role: string;
  /** Powód administratora - `00d` cytuje go dosłownie; `null` dopóki zgłoszenie czeka. */
  rejectReason: string | null;
  /** ISO 8601 UTC - kiedy zgłoszenie trafiło do klubu. */
  createdAt: string;
  /** ISO 8601 UTC - chwila decyzji; `null` dopóki czeka. */
  decidedAt: string | null;
}

/**
 * Stan osoby wobec klubów - to, co rozstrzyga, który ekran rodziny 00 pokazać (§5):
 * `pending` → 00C, `rejected` → 00D, `none` → 00E. Pierwszeństwo ustala serwer:
 * osoba czekająca w jednym klubie i odrzucona w drugim ma na ekranie CZEKANIE.
 */
export type ClubsStatus = 'active' | 'pending' | 'rejected' | 'none';

/** Komplet klubów osoby razem ze stanem zbiorczym. */
export interface ClubsView {
  status: ClubsStatus;
  memberships: ClubMembershipView[];
  /**
   * Kim jest pytający - imię i adres Z KONTA, do plakietki na ekranach 00C/00D/00E.
   * Serwer podaje je w tej samej odpowiedzi, bo „na co czekam" ma sens dopiero razem
   * z „pod którym kontem"; telefon nie ma skąd wziąć tego sam.
   */
  person: { name: string; email: string | null };
}

/**
 * Wynik `POST /auth/google` - DWA stany, z których tylko pierwszy jest tożsamością.
 *
 * `no_club` niesie token OSOBY, który otwiera dokładnie dwie trasy bez klubu
 * (`GET /auth/memberships`, `POST /auth/join`) i niczego nie podpisuje w rejestrze.
 * Który z ekranów 00C/00D/00E z tego wynika, mówi `clubs.status`.
 */
export type GoogleLoginResult =
  | { kind: 'signed_in'; tokens: AuthTokens }
  | { kind: 'no_club'; personToken: string; clubs: ClubsView };

/**
 * Wynik `GET /auth/memberships`. `approved` niesie TOKENY - pilot zatwierdzony
 * w międzyczasie wchodzi bez ponownego przechodzenia przez Google.
 */
export type MembershipStatusResult =
  | { kind: 'approved'; tokens: AuthTokens }
  | { kind: 'clubs'; clubs: ClubsView };

/**
 * Wynik `POST /auth/join { code }` (wielofirmowość §5) - tabela odpowiedzi serwera
 * przełożona na decyzje ekranu 00E i arkusza na 13A:
 *  • `pending` (202) → 00C z nazwą klubu;
 *  • `rejected` (403) → 00D z powodem;
 *  • `unknown_code` (404) → zdanie PRZY POLU, bez czyszczenia wpisu (kod nieznany,
 *    dołączanie wyłączone i klub nieaktywny to JEDNA odpowiedź - nic się nie ujawnia);
 *  • `already_member` / `membership_disabled` (409) → zdanie przy polu;
 *  • `rate_limited` (429) → powód z czasem odczekania W PRZYCISKU (issue #55).
 */
export type JoinClubResult =
  | { kind: 'pending'; org: OrgRef; clubs: ClubsView }
  | { kind: 'rejected'; org: OrgRef; rejectReason: string | null; decidedAt: string | null }
  | { kind: 'unknown_code' }
  | { kind: 'already_member'; org: OrgRef }
  | { kind: 'membership_disabled'; org: OrgRef }
  | { kind: 'rate_limited'; retryAfterSec: number };

/** Wynik przyjęcia paczki przez serwer (§4.3, §4.5). */
export interface PushResult {
  accepted: number;
  duplicates: number;
  /** Otwarte flagi dotykające wysłanych sesji - do pokazania na ekranie 11. */
  flags: SessionFlag[];
  /**
   * Uuidy zdarzeń WSTRZYMANYCH przez serwer (issue #81): operacja zakończona albo
   * unieważniona przez administratora nie przyjmuje już nic z telefonu. Nie weszły
   * do rejestru i nie wejdą - telefon oznacza je jako wstrzymane, nie ponawia.
   * Brak pola = starszy serwer, czyli nic nie wstrzymano.
   */
  withheld?: string[];
}

/**
 * Strona własnego rejestru z `GET /me/events` (§4.9, issue #32) - droga POWROTNA
 * outboxa, czyli odtworzenie lokalnego strumienia na urządzeniu, które go straciło.
 *
 * `cursor` jest dla telefonu NIEPRZEZROCZYSTY: opisuje pozycję w porządku serwera
 * i wraca w takiej postaci, w jakiej przyszedł. `nextCursor: null` znaczy „na teraz
 * masz wszystko" - kursor zapamiętujemy i przy kolejnej okazji pytamy od niego,
 * więc pełne pobranie zdarza się raz, a potem jedzie sama dosyłka.
 */
export interface RemoteEventPage {
  /** Zdarzenia BEZ `syncedAt` - to pole jest księgowością telefonu, nie serwera. */
  events: Omit<Event, 'syncedAt'>[];
  /**
   * Pozycja ZA ostatnim zdarzeniem strony - wypełniona także wtedy, gdy strona była
   * ostatnia (`null` tylko dla strony pustej). To ją telefon zapamiętuje.
   */
  nextCursor: string | null;
  /** Czy za tą stroną jest jeszcze co czytać - telefon pętli się, dopóki `true`. */
  hasMore: boolean;
}

/** Migawka `GET /reference` - wejście do cache referencyjnego (§4.8). */
export interface ReferenceData {
  aircraft: ReferenceAircraft[];
  pilots: ReferencePilot[];
}

/**
 * Wynik `GET /reference` z obsługą ETag (§4.8): `data: null` = 304 Not Modified -
 * serwer potwierdził, że cache jest aktualny, i nie wysyłał ciała. `etag` zapamiętuje
 * wołający i podaje przy następnym zapytaniu.
 */
export interface ReferenceFetch {
  data: ReferenceData | null;
  etag: string | null;
}

/**
 * Preferencje pilota z `/me/prefs` (decyzja 2026-07-29: motyw wędruje za pilotem
 * między urządzeniami). `theme` jest dla portu NIEPRZEZROCZYSTĄ nazwą - listę
 * motywów znają wyłącznie tokeny UI; `null` = pilot nigdy nie wybrał motywu.
 * `themeUpdatedAt` to ISO UTC stempla DECYZJI pilota (zegar telefonu) - oś LWW.
 */
export interface RemoteThemePrefs {
  theme: string | null;
  themeUpdatedAt: string | null;
}

/** Stan samolotu z `GET /aircraft/:id/state` - claim + przekazanie (§4.6). */
export interface RemoteAircraftState {
  aircraftId: string;
  claimPicId: string | null;
  claimSince: number | null;
  handover: Handover | null;
  lastSyncAt: string | null;
}

/**
 * Stan sesji po stronie serwera z `GET /sessions/:uuid/sync-status` - ekran 11.
 *
 * `received` to liczba zdarzeń, które SERWER widzi (nie mylić z licznikiem outboxa),
 * a `exportUrl` wypełni się dopiero, gdy serwerowy eksport do Sheets powstanie (faza 4)
 * - do tego czasu jest jawnym `null`, nie brakującym polem.
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
 * Podpowiedzi do formularza zadania (`GET /me/task-suggestions`, issue #14) - ostatnio
 * używane oznaczenia klientów i notatki.
 *
 * Świadomie **tylko online**. To jedyna rzecz w tym formularzu, która nie ma prawa
 * niczego zablokować: bez zasięgu pilot po prostu wpisuje wartość z palca, tak jak
 * dotąd. Cache byłby tu kosztem bez zysku - lista podpowiedzi to wygoda, a nie dane,
 * których brak zmienia dzień lotny (`CLAUDE.md`, offline-first pkt 3 dotyczy AKCJI
 * wymagających sieci; tu akcja działa, chudsza jest tylko podpowiedź).
 *
 * `operation` przy kliencie odpowiada na pytanie „co to było za zlecenie" - ten sam
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
 * nie brak danych: pierwszy lot maszyny nie ma poprzednika, najnowszy - następcy.
 */
export interface RemoteReadingsChain {
  before: RemoteReadingsChainLink | null;
  after: RemoteReadingsChainLink | null;
  /**
   * Ostatni POMIAR OLEJU nie później niż pytana chwila, razem z sumą dolewek od niego.
   *
   * Olej idzie WŁASNĄ osią, bo bagnet tuż po locie kłamie i zdanie samolotu oleju
   * NIE MIERZY (issue #60): interwał biegnie pomiar→pomiar przez wiele sesji, więc
   * pary „przed/po" tu nie ma - jest kotwica. Ten sam kształt, co `Handover.oil`,
   * więc ekran liczy z niej oczekiwanie tym samym `oilPreflight`, co na 02a.
   */
  oil: OilHandover | null;
}

/**
 * KTO POPROSIŁ o tę rozmowę z serwerem - i tylko tyle. Ile sekund z tego wynika,
 * decyduje adapter, bo cierpliwość jest własnością TRANSPORTU (uwaga z urządzenia,
 * 2026-08-30).
 *
 * Port świadomie nie przyjmuje milisekund. Warstwa aplikacji wie, czy przy telefonie
 * ktoś stoi; nie wie i nie ma prawa wiedzieć, ile trwa obudzenie uśpionej instancji.
 *
 * Skąd wymóg. Limit był JEDEN i wynosił 8 s - dobrany pod pętlę okazji, gdzie jest
 * słuszny: przy słabym zasięgu lepiej szybko powiedzieć „offline" i wrócić za minutę,
 * niż wisieć i blokować kolejne okazje. Dla przycisku „PONÓW PRÓBĘ" ten sam limit był
 * jednak wadą, i to trafiającą dokładnie w najgorszy moment: pilot sięga po ponowienie
 * wtedy, gdy długo nic nie szło, czyli gdy serwer zdążył się uśpić - a zimny start
 * bywa dłuższy niż 8 s. Telefon rzucał `abort()`, meldował „brak sieci" i szedł dalej,
 * podczas gdy serwer właśnie wstawał, PRZYJMOWAŁ paczkę i zapisywał ją do bazy.
 * W logach API zostawał sukces, na ekranie „OFFLINE" - i to jest ta sprzeczność,
 * od której zaczęło się zgłoszenie.
 */
/**
 * Zgłoszenie błędu tak, jak jedzie na drut (issue #87) - `BugReport` bez `sentAt`
 * i z czasem w ISO. Stempel wysyłki jest księgowością TELEFONU, więc kopercie
 * serwera nic po nim; `createdAt` jedzie jako ISO, bo tak wygląda każdy czas
 * w tym kontrakcie (`themeUpdatedAt`, `recordedAt`).
 */
export interface RemoteBugReport {
  uuid: string;
  createdAt: string;
  severity: BugSeverity | null;
  description: string;
  screen: string;
  appVersion: string | null;
  sessionUuid: string | null;
  context: Record<string, unknown>;
}

/** Wynik przyjęcia paczki zgłoszeń - kształt `PushResult`, bo pytanie to samo. */
export interface BugReportPushResult {
  accepted: number;
  duplicates: number;
}

export type SyncTrigger = 'background' | 'manual';

export interface ServerPort {
  /**
   * Logowanie tokenem tożsamości Google (2026-09-04, `docs/logowanie-google.md`).
   * Jedyna czynność aplikacji, która wymaga sieci (§3.0) - i dlatego jedzie z limitem
   * jak ponowienie z ręki pilota: człowiek stoi i patrzy, a serwer mógł się uśpić.
   */
  loginWithGoogle(idToken: string): Promise<GoogleLoginResult>;
  /**
   * Stan osoby wobec klubów (`GET /auth/memberships`) - ekran `00c` pyta o to co
   * kilkanaście sekund i pod „SPRAWDŹ PONOWNIE", a 13A raz przy otwarciu.
   *
   * Przyjmuje token OSOBY (droga 00C) albo token DOWOLNEGO klubu (13A: pilot klubu A
   * ogląda stan zgłoszenia do B). Tokeny klubu wraca WYŁĄCZNIE tokenowi osoby i
   * dokładnie raz - `ServerRejectedError` 401/404 znaczy „za tym tokenem nikt już nie
   * stoi", więc wołający wraca na ekran logowania.
   */
  membershipStatus(token: string): Promise<MembershipStatusResult>;
  /**
   * Dołączenie do klubu kodem (`POST /auth/join`, wielofirmowość §3.8) - JEDYNA droga
   * do klubu. Kod daje wyłącznie ZGŁOSZENIE; o przyjęciu decyduje administrator klubu.
   *
   * Token osoby (00E) albo dowolnego klubu (13A). Odmowy serwera NIE są tu wyjątkami,
   * tylko wynikami: każda ma na ekranie inną drogę wyjścia (patrz `JoinClubResult`).
   */
  joinClub(token: string, code: string): Promise<JoinClubResult>;
  /**
   * Przełączenie klubu (`POST /auth/switch`, wielofirmowość §6) - NOWA para tokenów dla
   * klubu docelowego. WYMAGA SIECI: offline-first dotyczy pracy w klubie, nie zmiany
   * klubu. `null` = klub, którego ta osoba nie ma (404) - dla niej NIEISTNIEJĄCY.
   */
  switchClub(token: string, orgId: string): Promise<AuthTokens | null>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  pushEvents(
    token: string,
    events: Event[],
    sourceDevice: string | null,
    trigger?: SyncTrigger,
  ): Promise<PushResult>;
  /**
   * Strona WŁASNYCH zdarzeń pilota (`GET /me/events`, §4.9) - kierunek powrotny
   * `pushEvents`. Tożsamość bierze się z tokenu, więc port nie ma gdzie przyjąć
   * cudzego `picId`: to jest odtworzenie własnego rejestru, nie czytnik cudzych dni.
   */
  pullEvents(
    token: string,
    params: { cursor?: string | null; limit?: number },
  ): Promise<RemoteEventPage>;
  getReference(
    token: string,
    etag?: string | null,
    trigger?: SyncTrigger,
  ): Promise<ReferenceFetch>;
  getAircraftState(token: string, aircraftId: string): Promise<RemoteAircraftState>;
  /**
   * Ciągłość odczytów wokół chwili (`GET /aircraft/:id/readings-chain`, issue #62) - czym
   * maszyna została ZDANA przed tym lotem i co zastał ten, kto ją przejął PO nim.
   *
   * Osobno od `getAircraftState`, bo to inne pytanie: tamto mówi „ile jest teraz",
   * a wpis ręczny opisuje czwartek - i między czwartkiem a dziś maszyna zdążyła
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
   * Ślad kalibracyjny GPS (faza 5) na `POST /traces` - osobny, niskopriorytetowy tor
   * obok outboxa zdarzeń; serwer odkłada NDJSON per sesja do analizy progów.
   */
  pushTraces(token: string, entries: unknown[]): Promise<{ accepted: number }>;
  /**
   * Ślad sesji do narysowania (`GET /me/sessions/:uuid/track`, issue #47) - kierunek
   * POWROTNY `pushTraces`. Telefon oddaje surowe fixy i kasuje swoją kopię, więc ekran
   * 14 pobiera stąd gotową geometrię: linię i profil po uproszczeniu, próbkę logu
   * i statystyki. Tożsamość bierze się z tokenu - cudza sesja jest nie do odróżnienia
   * od nieistniejącej (404).
   */
  getSessionTrack(token: string, sessionUuid: string): Promise<SessionTrackPayload>;
  /** Podpowiedzi do formularza zadania (`GET /me/task-suggestions`) - wyłącznie online. */
  getTaskSuggestions(token: string): Promise<RemoteTaskSuggestions>;
  /**
   * Zgłoszenia błędów z telefonu (`POST /me/bug-reports`, issue #87) - osobny,
   * NISKOPRIORYTETOWY tor obok outboxa zdarzeń, jak ślad kalibracyjny. Duplikat
   * jest sukcesem, nie błędem: serwer dedupuje po uuid, więc wysyłka „do skutku"
   * jest bezpieczna.
   */
  pushBugReports(token: string, reports: RemoteBugReport[]): Promise<BugReportPushResult>;
  /** Preferencje pilota Z TOKENU (`GET /me/prefs`). */
  getPrefs(token: string): Promise<RemoteThemePrefs>;
  /**
   * `PUT /me/prefs` - zapis LWW po `themeUpdatedAt`; odpowiedź jest ZAWSZE stanem
   * autorytatywnym po operacji (przegrany stempel dostaje zwycięzcę do adopcji).
   */
  putPrefs(token: string, prefs: { theme: string; themeUpdatedAt: string }): Promise<RemoteThemePrefs>;
}
