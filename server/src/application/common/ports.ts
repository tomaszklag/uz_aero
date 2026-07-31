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

export interface PilotsPort {
  findByLogin(login: string): Promise<PilotAccount | null>;
  findById(id: string): Promise<PilotAccount | null>;
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

export interface TokenService {
  /** Zwraca podpisany token dostępu dla pilota. */
  sign(claims: Identity, ttlSec: number): string;
  /** Zwraca claims albo `null` — token zły/wygasły. Nigdy nie rzuca. */
  verify(token: string): Identity | null;
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

// ── zegar ───────────────────────────────────────────────────────────────────────

/** Czas jako port — testy okna refresh tokenów sterują nim jawnie. */
export interface Clock {
  now(): Date;
}
