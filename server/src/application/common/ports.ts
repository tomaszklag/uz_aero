/**
 * UZ Aero (serwer) — PORTY warstwy aplikacji.
 *
 * Ta sama zasada co w aplikacji mobilnej: komendy i zapytania znają WYŁĄCZNIE te
 * interfejsy; implementacje (Postgres, zegar systemowy, krypto) wstrzykuje composition
 * root. Dzięki temu testy jadą na PGlite i sterowanym zegarze bez jednej atrapy
 * „udającej" logikę.
 *
 * Uproszczony CQRS: komendy piszą i zwracają wynik, zapytania czytają projekcje.
 * Bez szyny zdarzeń i bez osobnej bazy odczytu — projekcje odświeżamy synchronicznie
 * w tej samej transakcji, w której przyjmujemy zdarzenia. Przy skali klubu (jeden
 * serwer, kilkunastu pilotów) każdy dodatkowy ruchomy element to koszt bez zysku.
 */

import type {
  Event,
  FlagStatus,
  FlagType,
  OperationType,
  ReferenceAircraft,
  ReferencePilot,
} from '@uzaero/domain';

import type { PilotRole } from '../../domain/roles.ts';

// ── magazyn ─────────────────────────────────────────────────────────────────────

/**
 * Minimalny interfejs bazy — spełniają go strukturalnie i `pg.Pool`, i PGlite.
 * To jest nasz „port bazodanowy": adaptery przyjmują `Queryable`, więc test może
 * podać bazę w procesie, a produkcja pulę połączeń, bez żadnej warstwy tłumaczącej.
 */
export interface Queryable {
  query<R = unknown>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

/**
 * Baza z transakcjami. Przyjęcie paczki zdarzeń jest atomowe: wstawienie + odświeżenie
 * projekcji + flagi w JEDNEJ transakcji — telefon, który dostał odpowiedź, może uznać
 * zdarzenia za dostarczone, a stan `sessions` nigdy nie wyprzedza ani nie goni `events`.
 */
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

// ── piloci i uwierzytelnienie ───────────────────────────────────────────────────

/** Konto pilota po stronie serwera (zakłada administrator — brak rejestracji). */
export interface PilotAccount {
  id: string;
  code: string;
  name: string;
  email: string | null;
  passwordHash: string;
  active: boolean;
  /** Uprawnienia w panelu administracyjnym (`src/domain/roles.ts`). */
  role: PilotRole;
}

/**
 * Konto tak, jak widzi je BRAMA UPRAWNIEŃ panelu (`http/authorize.ts`) — bez hasha.
 *
 * Osobny typ od `PilotAccount` i to jest cała jego treść. `PilotAccount` istnieje dla
 * LOGOWANIA, więc niesie `passwordHash`; brama hasła nie weryfikuje, a mimo to czytała
 * go przy KAŻDYM żądaniu panelu i wnosiła aż do warstwy HTTP (`AuthOutcome.account`).
 * Hash, który wjeżdża tam, gdzie nie jest potrzebny, prędzej czy później gdzieś się
 * zserializuje — jeden brak pola jest tańszy niż dyscyplina „pamiętaj, żeby go nie
 * wypisać". Ta sama zasada, co przy `AdminPilotAccount` po stronie panelu.
 */
export interface PilotAuthSnapshot {
  id: string;
  code: string;
  name: string;
  active: boolean;
  role: PilotRole;
  /**
   * Od kiedy poświadczenia tego konta są ważne (migracja 13). `null` = nigdy ich nie
   * unieważniano. Token wydany WCZEŚNIEJ nie przechodzi bramy — to jedyny sposób,
   * w jaki reset hasła i deaktywacja zrywają sesję PANELU, która nie ma wiersza
   * w bazie (podpisany JWT w ciasteczku `HttpOnly`).
   */
  credentialsValidFrom: Date | null;
}

export interface PilotsPort {
  findByLogin(login: string): Promise<PilotAccount | null>;
  findById(id: string): Promise<PilotAccount | null>;
  /** Projekcja dla bramy panelu: rola, aktywność i znacznik unieważnienia — bez hasha. */
  authSnapshot(id: string): Promise<PilotAuthSnapshot | null>;
}

/**
 * Preferencje pilota (dziś wyłącznie motyw) — wędrują za pilotem między urządzeniami
 * (decyzja 2026-07-29). `themeUpdatedAt` to stempel DECYZJI nadany przez telefon:
 * oś rozstrzygania LWW, celowo różna od `updated_at` konta.
 */
export interface PilotPrefs {
  theme: string | null;
  themeUpdatedAt: Date | null;
}

/**
 * Osobny port od `PilotsPort` nie dla symetrii, tylko dlatego, że tamten jest CZYSTYM
 * odczytem kont (zapis kont mieszka w seedzie/administratorze) — a preferencje są
 * jedynym miejscem, w którym pilot pisze do własnego wiersza.
 */
export interface PilotPrefsPort {
  /** `null` = pilot nie istnieje (token przeżył konto — stan patologiczny). */
  get(pilotId: string): Promise<PilotPrefs | null>;
  /**
   * Zapis LWW: skutek WYŁĄCZNIE, gdy `updatedAt` jest ściśle NOWSZY niż zapisany
   * stempel (brak stempla = każdy wygrywa). Warunek siedzi w SQL-u, nie w odczycie
   * przed zapisem — dwa telefony tego samego pilota nie prześcigną się timingiem.
   */
  setIfNewer(pilotId: string, theme: string, updatedAt: Date): Promise<void>;
}

/**
 * Hasła: `hash` przy zakładaniu konta (seed/admin), `verify` przy logowaniu.
 * Implementacja na `node:crypto` (scrypt) — patrz adapter, tam jest uzasadnienie.
 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

/** Podpisywanie i weryfikacja JWT sesji (HS256). */
/** Tożsamość odczytana z tokenu — to, na podstawie czego trasy podejmują decyzje. */
export interface Identity {
  pilotId: string;
  code: string;
  role: PilotRole;
}

/**
 * Tożsamość ODCZYTANA z tokenu razem z CHWILĄ JEGO WYDANIA.
 *
 * `issuedAt` nie jest polem wejściowym `sign` — chwilę wydania zna wyłącznie ten, kto
 * podpisuje, i sam ją wpisuje z zegara. Osobny typ zamiast pola opcjonalnego w
 * `Identity`, żeby żaden wołający `sign` nie mógł tej wartości podać ani zapomnieć.
 */
export interface VerifiedIdentity extends Identity {
  /**
   * `iat` w SEKUNDACH epoki (RFC 7519). `0` = token sprzed wprowadzenia claimu
   * (migracja 13) — czyli „wydany przed czasem", więc każde unieważnienie poświadczeń
   * go obejmuje. Domyślna wartość idzie w stronę BEZPIECZNĄ, nigdy w stronę zaufania.
   */
  issuedAt: number;
}

export interface TokenService {
  /** Zwraca podpisany token dostępu dla pilota. */
  sign(claims: Identity, ttlSec: number): string;
  /** Zwraca claims albo `null` — token zły/wygasły. Nigdy nie rzuca. */
  verify(token: string): VerifiedIdentity | null;
}

/**
 * Refresh tokeny: NIEPRZEZROCZYSTE losowe wartości w bazie (hash), nie JWT.
 * Powód: refresh żyje długo (§3.0 — wygasły JWT nie wylogowuje), więc musi dać się
 * unieważnić po stronie serwera; JWT z natury unieważnić się nie da.
 */
export interface RefreshTokensPort {
  issue(pilotId: string, expiresAt: Date): Promise<string>;
  /**
   * ATOMOWA rotacja: unieważnia stary i wydaje nowy w jednej transakcji.
   * Rozdzielone consume+issue (audyt) zostawiały okno, w którym crash/zgubiona
   * odpowiedź kasowały stary token bez wydania nowego — a pełne ponowne logowanie
   * wymaga sieci, więc łamałoby obietnicę §3.0. `null` = token nieznany/wygasły.
   */
  rotate(token: string, newExpiresAt: Date): Promise<{ pilotId: string; token: string } | null>;
}

// ── dane referencyjne ───────────────────────────────────────────────────────────

/** Flota + piloci dla `GET /reference` (§4.6, §4.8). */
export interface ReferenceSnapshot {
  aircraft: ReferenceAircraft[];
  pilots: ReferencePilot[];
  /** Najświeższy `updated_at` — podstawa ETagu i adnotacji wieku cache w aplikacji. */
  updatedAt: Date | null;
}

export interface ReferencePort {
  snapshot(): Promise<ReferenceSnapshot>;
}

// ── zdarzenia, sesje, flagi (M2) ────────────────────────────────────────────────

export interface EventsStorePort {
  /** Wstawia paczkę; duplikaty po `uuid` pomija (idempotencja synca §4.3). */
  insertBatch(
    tx: Queryable,
    events: readonly Event[],
    sourceDevice: string | null,
  ): Promise<{ accepted: number; duplicates: number }>;
  /** Pełny strumień sesji — wejście `projectSession`. */
  sessionEvents(db: Queryable, sessionUuid: string): Promise<Event[]>;
  /** Znacznik ostatniego przyjęcia zdarzenia samolotu (do `last_sync_at`). */
  lastReceivedAt(db: Queryable, aircraftId: string): Promise<Date | null>;
  /** Liczba zdarzeń sesji przyjętych przez serwer (do `sync-status`). */
  countForSession(db: Queryable, sessionUuid: string): Promise<number>;
}

/** Wiersz projekcji `sessions` — zrzut `projectSession`, nigdy źródło prawdy. */
export interface SessionRow {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId: string | null;
  status: 'active' | 'closed';
  /**
   * `SessionState.dutyStart` — czas MELDUNKU z `preflight_confirm`, mimo nazwy kolumny
   * (`claim_time`, migracja 2). Rozbieżność nazwy z zawartością jest opisana
   * w `application/sessionRow.ts`; `null` = sesja bez preflightu (realny stan).
   */
  claimTime: number | null;
  closeTime: number | null;
  /**
   * Rodzaj operacji i klient dnia (migracja 11) — wymiary listy dni panelu (`A02`).
   * Wartości pochodzą z projekcji, nie z ponownego czytania payloadów: reguła
   * „agreguj wartości projekcji, nigdy nie odtwarzaj projekcji SQL-em".
   */
  operation: OperationType | null;
  client: string | null;
  mhStart: number | null;
  mhEnd: number | null;
  fuelStartL: number | null;
  fuelEndL: number | null;
  fuelLastL: number | null;
  mhLast: number | null;
  blockMs: number;
  flightMs: number;
  flightsCount: number;
  /**
   * Kolumny statystyk (migracja 18) — wejście agregatów `A10`.
   *
   * Wszystkie są NULL-owalne z JEDNEGO powodu: wiersz zapisany przed migracją ma tu
   * `NULL` do czasu przebudowy projekcji (`A11`) i agregat musi umieć to odróżnić od
   * zera. `sessionRowFrom` NIGDY nie pisze `null` w liczniki (`takeoffCount`,
   * `dropCount`, …) — `null` czytany z bazy znaczy więc zawsze „nieprzeliczone".
   * `mhDeltaH`/`fuelConsumedL` bywają `null` także w świeżym wierszu: bilans dnia
   * istnieje dopiero z odczytem końcowym `day_close` (reguła projekcji).
   */
  takeoffCount: number | null;
  landingCount: number | null;
  mhDeltaH: number | null;
  fuelConsumedL: number | null;
  dropCount: number | null;
  jumpersTandem: number | null;
  jumpersAff: number | null;
  jumpersSolo: number | null;
  /** Suma wysokości zrzutów Z FIXEM i ich licznik — średnia zakresu = suma / licznik. */
  dropAltSumFt: number | null;
  dropAltCount: number | null;
}

export interface SessionsProjectionPort {
  upsert(tx: Queryable, row: SessionRow): Promise<void>;
  get(db: Queryable, sessionUuid: string): Promise<SessionRow | null>;
  listByAircraft(db: Queryable, aircraftId: string): Promise<SessionRow[]>;
}

/**
 * Konfiguracja samolotu potrzebna REGUŁOM serwera (dziś: pojemność zbiorników do
 * tolerancji `fuel_mismatch`, §4.5).
 *
 * Osobny, jednometodowy port zamiast sięgnięcia po `ReferenceRepo`: tamten buduje CAŁĄ
 * migawkę floty z ETagiem pod cache telefonów i czyta poza transakcją, a ingest
 * potrzebuje jednej liczby WEWNĄTRZ swojej transakcji.
 */
export interface AircraftConfigPort {
  /** `null` = samolot nieznany albo bez skonfigurowanej pojemności. */
  capacityL(db: Queryable, aircraftId: string): Promise<number | null>;
}

/**
 * Wiersz flagi po stronie serwera. Kształt „na drucie" (`type`, `sessionUuids`) idzie
 * z domeny — `SessionFlag` w `@uzaero/domain` — bo telefon czyta dokładnie te pola
 * z `/sessions/:uuid/sync-status`. Reszta (`id`, `details`, `status`) jest sprawą
 * panelu i na telefon nie jedzie.
 */
export interface FlagRecord {
  id: number;
  type: FlagType;
  aircraftId: string;
  sessionUuids: string[];
  details: Record<string, unknown>;
  status: FlagStatus;
}

export interface FlagsPort {
  /**
   * Zapewnia OTWARTĄ flagę (typ + ten sam zestaw sesji) — wstawia tylko, gdy nie ma.
   * Ponowny sync tych samych danych nie może mnożyć flag.
   */
  ensureOpen(
    tx: Queryable,
    flag: { type: FlagType; aircraftId: string; sessionUuids: string[]; details: Record<string, unknown> },
  ): Promise<void>;
  openForSession(db: Queryable, sessionUuid: string): Promise<FlagRecord[]>;
  openForAircraft(db: Queryable, aircraftId: string): Promise<FlagRecord[]>;
}

// ── eksport dzienny (§4.7) ──────────────────────────────────────────────────────

/**
 * Dzienna karta arkusza: tytuł wg konwencji §4.7 (`YYYY-MM-DD_SP-XXX`) + zawartość
 * tabelaryczna jako wiersze komórek. Kształt jest CELOWO niezależny od Google API —
 * budowa treści to czysta funkcja domeny eksportu, a jak te wiersze trafiają do
 * arkusza (i czym jest „karta" u dostawcy), wie wyłącznie adapter.
 */
export interface DaySheet {
  tab: string;
  rows: string[][];
}

export interface SheetsPort {
  /** Zapisuje/nadpisuje dzienną kartę arkusza; zwraca URL karty. */
  writeDaySheet(sheet: DaySheet): Promise<{ url: string }>;
}

/** Zapisana karta dzienna: dosłowna treść + stempel ostatniego nadpisania (rewizji). */
export interface StoredDaySheet {
  tab: string;
  rows: string[][];
  updatedAt: Date;
}

/**
 * Odczyt zapisanych kart — OSOBNY port, nie metoda `SheetsPort`. Stronę zapisu
 * implementuje KAŻDY dostawca arkuszy (bazodanowy dziś, Google po dostarczeniu
 * klucza serwisowego — podmiana tego samego portu), ale odczyt po nazwie istnieje
 * wyłącznie dlatego, że karty serwujemy z własnej bazy (`GET /sheets/:tab`).
 * U Google „odczytem" jest sam arkusz pod `sheet_url` — doklejenie tej metody do
 * `SheetsPort` zmuszałoby przyszły adapter do martwego kodu.
 */
export interface SheetsReadPort {
  /** Karta po nazwie (`YYYY-MM-DD_SP-XXX`); `null` = nigdy nie wyeksportowano. */
  readDaySheet(tab: string): Promise<StoredDaySheet | null>;
}

/** Wpis dziennika eksportu (§5.3 `export_log`) — jedna wykonana rewizja karty. */
export interface ExportRecord {
  sessionUuid: string;
  /** Dzień karty jako `YYYY-MM-DD` (UTC z duty start) — prefiks nazwy karty. */
  day: string;
  aircraftId: string;
  sheetUrl: string;
  /** 1 = pierwszy eksport; spóźnione dane po eksporcie podbijają o 1 (§4.7). */
  revision: number;
  exportedAt: Date;
}

/**
 * Dziennik eksportu jest append-only jak reszta systemu: regeneracja karty to NOWY
 * wiersz z kolejną rewizją, nie nadpisanie — historia „co i kiedy poszło do arkusza"
 * zostaje do audytu, a `sync-status` czyta po prostu najświeższy wpis.
 */
export interface ExportLogPort {
  /** Ostatnia rewizja eksportu sesji; `null` = jeszcze nie eksportowano. */
  latest(db: Queryable, sessionUuid: string): Promise<ExportRecord | null>;
  append(db: Queryable, record: ExportRecord): Promise<void>;
  /**
   * Blokada advisory na DZIENNIKU JEDNEJ SESJI, ważna do końca transakcji. Wołana
   * PRZED `latest` przez każdego, kto zaraz nada kolejną rewizję.
   *
   * ══ CZEGO PILNUJE ══
   * Sekwencji „odczytaj ostatnią rewizję → dodaj jeden → dopisz wiersz". Bez niej
   * spóźniona paczka z telefonu i kliknięcie „Ponów" w panelu, trafione w tę samą
   * chwilę, czytają ten sam stan i obie chcą zapisać rewizję 3 — a dziennik, w którym
   * numer rewizji nie jest jednoznaczny, przestaje odpowiadać na pytanie „co i kiedy
   * poszło do arkusza". Od migracji 14 drugi zapis odbija się o `UNIQUE`; blokada
   * sprawia, że do tego odbicia w ogóle nie dochodzi w normalnej pracy.
   *
   * ══ CZEGO NIE PILNUJE ══
   * Treści karty. `exported_sheets` jest UPSERT-em po nazwie i wygrywa zapis późniejszy
   * — co jest poprawne, bo obie strony budują kartę z TEGO SAMEGO strumienia zdarzeń.
   *
   * Klucz mieszka w adapterze, bo nazwa klucza advisory jest szczegółem Postgresa —
   * ta sama decyzja, co przy `FleetAdminPort.lockAircraft`.
   */
  lock(tx: Queryable, sessionUuid: string): Promise<void>;
}

// ── ślad kalibracyjny GPS (faza 5) ─────────────────────────────────────────────

/**
 * Zrzut śladu kalibracyjnego z telefonów (`POST /traces`): surowe fixy + markery
 * detektora, materiał do kalibracji progów §3.3 i replayu przez `runDetector`.
 * To NIE są zdarzenia domenowe — nie dotykają Postgresa ani projekcji; lądują
 * w plikach NDJSON per sesja, bo analiza i tak jest offline (skrypt replay).
 */
export interface TraceSinkPort {
  /** Dopisuje wpisy (append); grupowanie per sesja robi adapter. */
  append(pilotId: string, entries: Record<string, unknown>[]): Promise<void>;
}

/**
 * ODCZYT śladu jednej sesji — do mapy lotu w panelu (`A02c-slad.html`).
 *
 * Osobny port od `TraceSinkPort`, mimo wspólnego magazynu, bo to dwie różne
 * odpowiedzialności o różnych wymaganiach: zapis jest gorący (kilkanaście telefonów
 * dopisuje w kółko) i musi być tani, odczyt jest rzadki (administrator otwiera mapę)
 * i może sobie pozwolić na przeczytanie całego pliku sesji. Sklejenie ich w jeden port
 * kazałoby adapterowi zapisu deklarować metodę, której zapis nigdy nie użyje.
 *
 * Zwracamy SUROWE wiersze — filtrowanie po oknie lotu i bramkę jakości robi domena
 * (`buildFlightTrack`), tym samym kodem, którym liczy je telefon.
 */
export interface TraceSourcePort {
  /**
   * Wpisy śladu jednej sesji, w kolejności zapisu. Pusta tablica, gdy sesja nie ma
   * zapisu — brak pliku NIE jest błędem: lot mógł być wpisany ręcznie, telefon mógł
   * nie zdążyć wysłać, a ślad i tak nigdy nie był rejestrem (wariant 14B).
   */
  read(sessionUuid: string): Promise<Record<string, unknown>[]>;
}

// ── zegar ───────────────────────────────────────────────────────────────────────

/** Czas jako port — testy okna refresh tokenów sterują nim jawnie. */
export interface Clock {
  now(): Date;
}
