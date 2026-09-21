/**
 * Ninerdeck - PORT serwera synchronizacji (§4.6).
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
  PasswordWeakness,
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
 * Metody logowania TEGO wdrożenia (`GET /auth/methods`, 2.1.0 §5.7) - ekran 00A rysuje
 * z tego przyciski, zamiast zakładać, co serwer umie.
 *
 * `google: null` znaczy „to wdrożenie nie ma klienta Google" i wtedy hasło wchodzi na
 * jego miejsce jako droga PIERWSZA. `password` jest dziś zawsze `true` - hasło nie ma
 * konfiguracji - ale pole zostaje, bo aplikacja ma czytać odpowiedź, a nie zakładać
 * jej treść.
 */
export interface LoginMethods {
  google: { clientId: string } | null;
  password: boolean;
}

/**
 * CZYM ZALOGOWANY MOŻE SIĘ ZALOGOWAĆ (`GET /me/account`, 2.1.0 §5.3).
 *
 * Inne pytanie niż `LoginMethods`: tamto opisuje WDROŻENIE („czy ten serwer ma Google"),
 * to - OSOBĘ („czy ja mam już hasło"). Ustawienia potrzebują właśnie drugiego: obecność
 * hasła rozstrzyga, czy wiersz nazywa się „Ustaw hasło" (bez pola na obecne), czy
 * „Zmień hasło" (z nim). Zgadnięcie w jedną stronę znaczy formularz proszący o hasło,
 * którego nie ma; w drugą - milczące nadpisanie istniejącego.
 *
 * Odpowiedź należy do OSOBY, więc jest ta sama w każdym jej klubie - i dlatego nie jedzie
 * w `GET /reference`, które jest cache'em KLUBU z ETagiem.
 */
export interface AccountMethods {
  email: string | null;
  hasGoogle: boolean;
  hasPassword: boolean;
}

/**
 * Wynik `POST /auth/password` (2.1.0, §5.1) - DRUGA droga tej samej osoby.
 *
 * Dwa pierwsze stany są DOKŁADNIE tymi samymi, co po Google: hasło kończy się tam,
 * gdzie kończy Google, bo od chwili ustalenia osoby jedzie wspólny rdzeń serwera.
 * Trzy pozostałe to ODMOWY, które na 00F mają różne drogi wyjścia, więc są WYNIKAMI,
 * nie wyjątkami (ta sama zasada, co przy `JoinClubResult`):
 *  • `invalid_credentials` - JEDNA odpowiedź na login nieznany, osobę bez hasła i złe
 *    hasło. Serwer starannie ich nie rozróżnia (§5.1), więc ekran nie ma prawa;
 *  • `account_disabled` - osoba zablokowana; próbowanie ponownie nic nie zmieni;
 *  • `rate_limited` - powód z CZASEM w przycisku (wzór 00E).
 */
export type PasswordLoginResult =
  | { kind: 'signed_in'; tokens: AuthTokens }
  | { kind: 'no_club'; personToken: string; clubs: ClubsView }
  | { kind: 'invalid_credentials' }
  | { kind: 'account_disabled' }
  | { kind: 'rate_limited'; retryAfterSec: number };

/**
 * Wynik `PUT /me/password` (§5.3) - ustawienie PIERWSZEGO hasła albo zmiana istniejącego.
 *
 * `weak_password` niesie POWÓD z domeny, bo tę samą politykę liczy ekran przed wysłaniem
 * (`checkPassword`): dwa różne zdania o tej samej wartości znaczyłyby dwie kopie reguły.
 */
export type SetPasswordResult =
  | { kind: 'ok' }
  | { kind: 'invalid_credentials' }
  | { kind: 'email_required' }
  | { kind: 'weak_password'; reason: PasswordWeakness }
  | { kind: 'rate_limited'; retryAfterSec: number };

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

/**
 * ZAJĘTOŚĆ FLOTY z `GET /bookings` (rezerwacje 3.0.0, epik R-F).
 *
 * ══ WYŁĄCZNIE ONLINE ══
 * Cały moduł rezerwacji wymaga sieci (decyzja właściciela 2026-09-20,
 * `docs/rezerwacje.md` §2.2): „rezerwację raczej robimy w domu, gdzie zasięg jest".
 * Telefon NIE trzyma zajętości w SQLite, więc brak odpowiedzi znaczy „nie wiem",
 * a ekran mówi to wprost zamiast rysować pustą siatkę - ta wyglądałaby na flotę wolną
 * na wylot. To samo rozstrzygnięcie, co przy `getReadingsChain`.
 */
export interface RemoteCalendar {
  /** Strefa KLUBU - siatkę rysuje ona, nie strefa telefonu (§6). */
  timezone: string;
  /** Lotnisko macierzyste klubu; `null` = nieustawione, okno doby jest wtedy domyślne. */
  homeIcao: string | null;
  /**
   * GRANICE KAŻDEJ DOBY jako para chwil UTC (§6.1) - i to jest cały powód, dla którego
   * telefon nie potrzebuje ani `Intl`, ani tablicy stref: położenie paska na siatce,
   * godzinę z formularza i podpis osi liczy samym odejmowaniem. Doba zmiany czasu
   * wychodzi poprawnie sama, bo ma 23 albo 25 godzin.
   */
  days: RemoteCalendarDay[];
  bookings: RemoteBooking[];
}

export interface RemoteCalendarDay {
  /** `RRRR-MM-DD` w strefie klubu - klucz doby, nie data do wyświetlenia. */
  date: string;
  startsAt: string;
  endsAt: string;
}

/** Jedna zajętość - rezerwacja pilota albo wyłączenie maszyny z użytku. */
export interface RemoteBooking {
  id: string;
  aircraftId: string;
  kind: 'flight' | 'block';
  status: string;
  startsAt: string;
  endsAt: string;
  pilotId: string | null;
  dualId: string | null;
  operation: string | null;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  sessionUuid: string | null;
  blockReason: string | null;
  note: string | null;
}

/** Propozycje wolnych slotów z `GET /bookings/suggestions` (domena R-C liczy je na serwerze). */
export interface RemoteSlotSuggestions {
  day: RemoteCalendarDay;
  /**
   * Okno doby lotnej. `basis` mówi, SKĄD się wzięło: `solar` z efemeryd lotniska
   * macierzystego, `default` z progu 06-21 - i ekran musi to rozróżniać, bo inaczej
   * domyślne okno wyglądałoby na wynik rachunku, którego nie było.
   */
  window: { from: string; to: string; basis: 'solar' | 'default' };
  suggestions: RemoteSlot[];
}

export interface RemoteSlot {
  startsAt: string;
  endsAt: string;
  reason: string;
  gapBeforeMin: number;
  gapAfterMin: number;
}

/** Szkic rezerwacji wysyłany na serwer - kroki 1-2 przejęcia plus czas i plan. */
export interface RemoteBookingDraft {
  id: string;
  aircraftId: string;
  startsAt: string;
  endsAt: string;
  operation: string;
  dualId?: string | null;
  fromIcao?: string | null;
  toIcao?: string | null;
  plannedAirMin?: number | null;
  plannedFuelL?: number | null;
  note?: string | null;
}

/**
 * Wynik zapisu rezerwacji.
 *
 * Odmowa NIE JEST wyjątkiem, bo `slot_taken` niesie TREŚĆ: kolidującą zajętość,
 * którą serwer dociąga kosztem punktu zapisu w transakcji (epik R-B). Ekran ma
 * powiedzieć, CO stoi w tym czasie, a nie „spróbuj ponownie".
 */
export type BookingWriteResult =
  | { ok: true; booking: RemoteBooking }
  | { ok: false; refusal: string; taken: RemoteBooking | null };

export type SyncTrigger = 'background' | 'manual';

export interface ServerPort {
  /**
   * Logowanie tokenem tożsamości Google (2026-09-04, `docs/logowanie-google.md`).
   * Jedyna czynność aplikacji, która wymaga sieci (§3.0) - i dlatego jedzie z limitem
   * jak ponowienie z ręki pilota: człowiek stoi i patrzy, a serwer mógł się uśpić.
   */
  loginWithGoogle(idToken: string): Promise<GoogleLoginResult>;
  /**
   * Co to wdrożenie umie (`GET /auth/methods`) - PUBLICZNE, bo pyta o to ekran
   * logowania, czyli ktoś bez sesji.
   */
  methods(): Promise<LoginMethods>;
  /**
   * Czym MOŻE SIĘ ZALOGOWAĆ TA OSOBA (`GET /me/account`, §5.3) - ustawienia, sekcja
   * „Hasło". Za bramą członkostwa: hasło ustawia ktoś, kto już wszedł do klubu.
   */
  account(token: string): Promise<AccountMethods>;
  /**
   * Logowanie hasłem (`POST /auth/password`, 2.1.0 §5.1) - DRUGA droga tej samej osoby,
   * dla WSPÓLNEGO TABLETU w samolocie.
   *
   * `login` to e-mail ALBO kod pilota; rozstrzyga sam napis (wpis z „@" jest adresem),
   * a kod pilota rozwiązuje się w klubie, który URZĄDZENIE zna - stąd `orgId`. Bez niego
   * serwer umie odpowiedzieć wyłącznie na adres, i to jest poprawne: kod pilota jest
   * jedyny w klubie, nie na serwerze.
   *
   * Limit jak przy Google: człowiek stoi i patrzy, a serwer liczy scrypt.
   */
  loginWithPassword(input: {
    login: string;
    password: string;
    orgId?: string | null;
  }): Promise<PasswordLoginResult>;
  /**
   * „Nie pamiętam hasła" (`POST /auth/password/forgot`, §5.4) - prośba o list z linkiem.
   *
   * Nie ma czego zwracać i to jest treść, nie brak: serwer odpowiada `202` ZAWSZE -
   * dla adresu znanego, nieznanego i po wyczerpaniu limitu wysyłek. Inna odpowiedź
   * wyliczałaby konta, a ten ekran stoi przed każdym, kto zna adres aplikacji.
   * Brak sieci zostaje wyjątkiem, bo wtedy list NIE poszedł.
   */
  forgotPassword(email: string): Promise<void>;
  /**
   * „Załóż konto" (`POST /auth/signup`, §5.4a) - rejestracja e-mailem, TYM SAMYM linkiem.
   *
   * Osoba powstaje dopiero przy REALIZACJI linku, więc adres jest potwierdzony
   * kliknięciem. `202` zawsze, z tego samego powodu co wyżej; adres zajęty dostaje list
   * „masz już konto" zamiast odmowy.
   */
  signUp(input: { name: string; email: string }): Promise<void>;
  /**
   * Ustawienie albo zmiana WŁASNEGO hasła (`PUT /me/password`, §5.3) - arkusz 13B.
   *
   * `current` pomija się WYŁĄCZNIE wtedy, gdy osoba hasła jeszcze nie ma (dziś: każdy,
   * kto wchodzi Googlem). Zapis unieważnia pozostałe sesje tej osoby - bieżąca zostaje.
   */
  setPassword(
    token: string,
    input: { current?: string; next: string },
  ): Promise<SetPasswordResult>;
  /**
   * Wylogowanie (`POST /auth/logout`, §5.5) - kasuje refresh po stronie SERWERA
   * i stempluje sesję.
   *
   * Do 2.1.0 telefon przy wylogowaniu nie wołał serwera wcale, więc refresh żył po nim
   * jeszcze 90 dni. Odpowiedź jest `204` także dla poświadczenia martwego: „wyloguj"
   * klika się również wtedy, gdy token już nie działa.
   */
  logout(refreshToken: string): Promise<void>;
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
  /**
   * Zajętość floty w oknie dat (`GET /bookings`) - WYŁĄCZNIE online (§2.2).
   *
   * `aircraftId` zawęża do jednej maszyny: kalendarz pyta bez niego, a ostrzeżenie
   * o kolizji przy przejęciu - z nim.
   */
  getBookings(
    token: string,
    params: { from: number; to: number; aircraftId?: string },
  ): Promise<RemoteCalendar>;
  /** Propozycje wolnych slotów dla maszyny w dobie (`GET /bookings/suggestions`). */
  getSlotSuggestions(
    token: string,
    params: { aircraftId: string; day: number; minutes: number; preferredAt?: number },
  ): Promise<RemoteSlotSuggestions>;
  /**
   * Nowa rezerwacja (`POST /bookings`). Uuid nadaje TELEFON i to on jest całą
   * idempotencją: powtórzony zapis przy słabym łączu wraca tym samym wierszem,
   * a nie drugim terminem.
   */
  createBooking(token: string, draft: RemoteBookingDraft): Promise<BookingWriteResult>;
  /** Odwołanie WŁASNEJ rezerwacji (`DELETE /bookings/:id`); powód opcjonalny. */
  cancelBooking(token: string, id: string, reason: string | null): Promise<BookingWriteResult>;
  /** Preferencje pilota Z TOKENU (`GET /me/prefs`). */
  getPrefs(token: string): Promise<RemoteThemePrefs>;
  /**
   * `PUT /me/prefs` - zapis LWW po `themeUpdatedAt`; odpowiedź jest ZAWSZE stanem
   * autorytatywnym po operacji (przegrany stempel dostaje zwycięzcę do adopcji).
   */
  putPrefs(token: string, prefs: { theme: string; themeUpdatedAt: string }): Promise<RemoteThemePrefs>;
}
