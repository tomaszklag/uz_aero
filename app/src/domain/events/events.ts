/**
 * UZ Aero — model zdarzenia (docs/_main.md.txt §5.1).
 *
 * Wszystko, co dzieje się w dniu lotnym, jest **zdarzeniem append-only** o wspólnym
 * nagłówku (§5.1) i payloadzie specyficznym dla typu. Payload jest modelowany jako
 * **discriminated union** po polu `type` — dzięki temu po zawężeniu `type` kompilator
 * zna dokładny kształt `payload` (zero rzutowań w projekcjach).
 *
 * Zasady twarde (CLAUDE.md §Offline-first):
 *  - strumień jest append-only — korekta to KOLEJNE zdarzenie, nigdy nadpisanie,
 *  - każde zdarzenie niesie DWA zegary: `deviceTime` (zegar telefonu) + `gpsTime`
 *    (z fixa GPS, null gdy brak) — rozjazd wyłapuje serwer flagą CLOCK_DRIFT (§4.5),
 *  - liczniki fizyczne (FOB, MH) są źródłem prawdy; wartości z serwera to podpowiedź.
 *
 * Uwaga o nullach: kolumny opcjonalne z §5.1 (`dual_id`, `gps_time`, `synced_at`)
 * są tu zawsze OBECNE jako właściwości typu `… | null` — wiersz w bazie zawsze ma
 * te kolumny, a `null` reprezentuje „brak". Dzięki temu projekcje są totalne (bez
 * `undefined`). Skrót `?` z opisu w dokumentacji = `| null` w tym modelu.
 */

import type { EpochMillis } from '../time';

/** Wersja schematu payloadu — bump przy każdej zmianie kształtu payloadów (§5.1). */
export const CURRENT_SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Typy pomocnicze wspólne dla payloadów
// ─────────────────────────────────────────────────────────────────────────────

/** Pozycja z GPS w chwili zdarzenia. Wszystkie pola opcjonalne — GPS bywa niedostępny. */
export interface GpsPosition {
  /** Szerokość geograficzna (stopnie dziesiętne). */
  lat: number;
  /** Długość geograficzna (stopnie dziesiętne). */
  lon: number;
  /** Wysokość n.p.m. (stopy) — z GPS. */
  altitudeFt?: number;
  /** Prędkość względem ziemi (węzły) — z GPS. */
  groundSpeedKt?: number;
  /** Deklarowana dokładność pozycji (metry). */
  accuracyM?: number;
}

/** Rodzaj operacji dnia (§3.1 — siatka kart z ikonami). */
export type OperationType = 'skoki' | 'ferry' | 'egzamin' | 'techniczny' | 'inne';

/** Sposób wykrycia startu/lądowania (§3.3): auto (algorytm GPS) lub manual (pilot). */
export type DetectionMethod = 'auto' | 'manual';

/** Rola w załodze (§decyzja 2026-07-03): PIC prowadzi aplikację, Dual to drugi pilot. */
export type CrewRole = 'pic' | 'dual';

/**
 * Tryb rozpoczęcia/przejęcia sesji (§4.4):
 *  - `free`             — samolot był wolny,
 *  - `takeover_online`  — przejęcie z pełną wiedzą z serwera,
 *  - `takeover_offline` — przejęcie na danych z cache (ostrzeżenie słabsze, §4.4).
 */
export type SessionClaimMode = 'free' | 'takeover_online' | 'takeover_offline';

/** Format odczytu motogodzin — konfiguracja samolotu (§5.4). */
export type MhFormat = 'decimal' | 'hhmm';

/** Odczyt liczników fizycznych: paliwo (L) + motogodziny (wartość liczbowa). */
export interface FuelMhReading {
  /** Fuel on Board — odczyt paliwomierza (litry). */
  fuelL: number;
  /**
   * Motogodziny jako wartość liczbowa (godziny dziesiętne, np. 1238.5).
   * Format wyświetlania (`decimal`/`hhmm`) pochodzi z konfiguracji samolotu (§5.4)
   * i jest sprawą UI — w danych trzymamy zawsze godziny dziesiętne.
   */
  mh: number;
}

/** Wpis korekty odczytu w preflightcie (§3.1 — „Koryguj" z podaniem powodu). */
export interface PreflightCorrection {
  field: 'fuel' | 'mh';
  /** Wartość podpowiedziana (z przekazania/serwera). */
  from: number;
  /** Wartość wpisana przez pilota (staje się źródłem prawdy). */
  to: number;
  reason: string;
}

/** Rozbicie skoczków wg typu — strona przychodowa dnia (§decyzja 2026-07-23, §5.1 `drop`). */
export interface JumperCounts {
  tandem: number;
  aff: number;
  solo: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payloady per typ zdarzenia (§5.1 — kolumna „Payload")
// ─────────────────────────────────────────────────────────────────────────────

/** `session_claim` — tryb przejęcia (wolny / online / offline). */
export interface SessionClaimPayload {
  mode: SessionClaimMode;
  /** Kogo przejmujemy (z cache/serwera), gdy `mode` = takeover_*. */
  previousPicId?: string | null;
}

/** `preflight_confirm` — trasa, operacja, duty start, odczyt FOB+MH, korekty z powodem. */
export interface PreflightConfirmPayload {
  operation: OperationType;
  /** ICAO startu (np. „EPKK"). */
  departureIcao?: string | null;
  /** ICAO lądowania planowanego. */
  arrivalIcao?: string | null;
  /** Czas meldowania = początek duty (UTC, §3.1). */
  dutyStart: EpochMillis;
  /** Odczyt liczników na start dnia — początek łańcucha MH (§4.5). */
  reading: FuelMhReading;
  /** Log korekt podpowiedzi (append-only, nie nadpisuje `reading`). */
  corrections?: PreflightCorrection[];
  /** Klient (operacja Skoki) — wiąże dzień z odbiorcą; dziedziczony przez `drop`. */
  client?: string | null;
  /** Format MH samolotu — zapamiętany dla spójnego wyświetlania w sesji. */
  mhFormat?: MhFormat;
}

/** `engine_start` — pozycja GPS + elewacja lotniska (baza dla detekcji S/L, §3.3). */
export interface EngineStartPayload {
  position?: GpsPosition | null;
  /** Elewacja lotniska = wysokość GPS w momencie START ENGINE (§3.3, §8 mitygacja). */
  fieldElevationFt?: number | null;
}

/** `engine_stop` — pozycja GPS w chwili wyłączenia. */
export interface EngineStopPayload {
  position?: GpsPosition | null;
}

/**
 * `taxi` — samolot ruszył w kierunku startu.
 *
 * Otwiera każdy lot w logu cyklu (mockup 05: „13:11 · Taxi · 0:13" przed „13:24 · Takeoff").
 * Zdarzenie zapada raz na lot: po uruchomieniu silnika albo zaraz po lądowaniu, gdy
 * samolot kołuje z powrotem.
 *
 * DLACZEGO ZDARZENIE, A NIE SAMA FAZA: faza lotu (`flightPhase`) jest wyliczana z bieżących
 * fixów i znika razem z nimi — po restarcie aplikacji albo w logu dnia nie ma po niej
 * śladu. Czas rozpoczęcia kołowania jest natomiast trwałą informacją: to od niego liczy
 * się czas przygotowania do startu, widoczny w logu jako „0:13".
 *
 * NIE wpływa na czas blokowy ani na czas lotu — te wyznaczają `engine_start`/`engine_stop`
 * i `takeoff`/`landing`. Fałszywe kołowanie dodaje wiersz w logu i nic poza tym, dlatego
 * (inaczej niż start i lądowanie) zapisuje się od razu, bez okna „COFNIJ".
 */
export interface TaxiPayload {
  method: DetectionMethod;
  position?: GpsPosition | null;
}

/**
 * `event_correction` — poprawka istniejącego zdarzenia (ekran 04c).
 *
 * Rejestr jest append-only, więc korekta NIE edytuje celu: dopisujemy osobne zdarzenie,
 * a oryginalny odczyt zostaje. Projekcja nakłada korekty przed liczeniem (ostatnia
 * wygrywa), serwer scali obie wersje i pokaże poprawkę w arkuszu.
 *
 * Dwie akcje — dokładnie te z mockupu:
 *  • `retime` — zdarzenie zaszło, ale o innej godzinie (GPS wykrył za późno);
 *  • `void`   — zdarzenia NIE BYŁO (przelot nad pasem zaliczony jako lądowanie).
 *
 * `void` nie usuwa wiersza z rejestru — wyłącza go z projekcji. Dzięki temu „cofnięcie"
 * pomyłki samo jest udokumentowane, a serwer widzi pełną historię decyzji.
 */
export type EventCorrectionPayload = { targetUuid: string } & (
  | { action: 'retime'; newTime: EpochMillis }
  | { action: 'void' }
);

/** `takeoff` — metoda (auto/manual) + pozycja. */
export interface TakeoffPayload {
  method: DetectionMethod;
  position?: GpsPosition | null;
}

/** `landing` — metoda (auto/manual) + pozycja. */
export interface LandingPayload {
  method: DetectionMethod;
  position?: GpsPosition | null;
}

/** `drop` — numer zrzutu, wysokość, rozbicie skoczków; klient dziedziczony z preflightu. */
export interface DropPayload {
  /** Kolejny numer wyniesienia w dniu (1-based). */
  dropNumber: number;
  /** Wysokość zrzutu (stopy, z GPS). */
  altitudeFt?: number | null;
  /** Liczba skoczków w rozbiciu na typy (przychód dnia). */
  jumpers: JumperCounts;
  /** Klient dziedziczony z `preflight_confirm` (denormalizacja dla arkusza). */
  client?: string | null;
  position?: GpsPosition | null;
}

/** `refuel` — przed / dolano / po + wyliczone zużycie (§3.4). */
export interface RefuelPayload {
  /** Stan przed tankowaniem (L) — podpowiada bieżący FOB. */
  beforeL: number;
  /** Ilość dolana (L). */
  addedL: number;
  /** Stan po tankowaniu (L) — walidacja UI: ≤ capacity_l. */
  afterL: number;
  /** Średnie zużycie L/h od ostatniego tankowania (punkt kontrolny, §3.4). */
  consumptionLPerH?: number | null;
}

/** `crew_change` — rola + pilot schodzący/wchodzący (§3.5). */
export interface CrewChangePayload {
  role: CrewRole;
  /** Pilot schodzący (null przy dodaniu Duala tam, gdzie go nie było). */
  pilotOutId?: string | null;
  /** Pilot wchodzący (null przy usunięciu Duala). */
  pilotInId?: string | null;
}

/** `manual_log_entry` — ręczny wzlot (fallback GPS, §3.8). Czasy w UTC (epoch ms). */
export interface ManualLogEntryPayload {
  offBlock?: EpochMillis | null;
  takeoff?: EpochMillis | null;
  landing?: EpochMillis | null;
  onBlock?: EpochMillis | null;
  notes?: string | null;
}

/** `day_close` — końcowy FOB+MH (przekazanie dla następnego) + koniec duty (§3.6). */
export interface DayClosePayload {
  /** Odczyt końcowy = przekazanie dla kolejnego pilota (koniec łańcucha MH). */
  finalReading: FuelMhReading;
  /** Godzina zakończenia duty (UTC). */
  dutyEnd: EpochMillis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rejestr typ → payload i typ zdarzenia
// ─────────────────────────────────────────────────────────────────────────────

/** Mapowanie typu zdarzenia na kształt jego payloadu (jedyne źródło prawdy). */
export interface EventPayloadMap {
  session_claim: SessionClaimPayload;
  preflight_confirm: PreflightConfirmPayload;
  engine_start: EngineStartPayload;
  engine_stop: EngineStopPayload;
  taxi: TaxiPayload;
  takeoff: TakeoffPayload;
  landing: LandingPayload;
  drop: DropPayload;
  refuel: RefuelPayload;
  crew_change: CrewChangePayload;
  manual_log_entry: ManualLogEntryPayload;
  day_close: DayClosePayload;
  event_correction: EventCorrectionPayload;
}

/** Unia typów zdarzeń (§5.1). */
export type EventType = keyof EventPayloadMap;

/** Lista wszystkich typów zdarzeń (runtime) — walidacja przy odczycie z bazy. */
export const EVENT_TYPES: readonly EventType[] = [
  'session_claim',
  'preflight_confirm',
  'engine_start',
  'engine_stop',
  'taxi',
  'takeoff',
  'landing',
  'drop',
  'refuel',
  'crew_change',
  'manual_log_entry',
  'day_close',
  'event_correction',
];

// ─────────────────────────────────────────────────────────────────────────────
// Zdarzenie (wiersz w tabeli `events`, §5.1 + `synced_at` z §5.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Wspólny nagłówek zdarzenia — pola niezależne od typu (§5.1). */
interface EventHeader {
  /** UUID — klucz idempotencji (dedup na serwerze, §4.1). */
  uuid: string;
  /** Sesja (od `session_claim` do `day_close`). */
  sessionUuid: string;
  /** Samolot. */
  aircraftId: string;
  /** PIC w chwili zdarzenia (jedyny piszący, single-writer §4.1). */
  picId: string;
  /** Dual w chwili zdarzenia (null gdy jednoosobowo). */
  dualId: string | null;
  /** Zegar telefonu (UTC, epoch ms). */
  deviceTime: EpochMillis;
  /** Czas z fixa GPS (UTC, epoch ms) — null gdy brak fixa. */
  gpsTime: EpochMillis | null;
  /** Wersja schematu payloadu. */
  schemaVersion: number;
  /** Znacznik wysyłki: null = w outboxie (§4.3), wartość = potwierdzone przez serwer. */
  syncedAt: EpochMillis | null;
}

/**
 * Zdarzenie jako **discriminated union**: `type` zawęża `payload`.
 * Kształt buduje się mapując `EventPayloadMap` — jedno źródło prawdy dla par typ↔payload.
 */
export type Event = {
  [K in EventType]: EventHeader & { type: K; payload: EventPayloadMap[K] };
}[EventType];

/** Zawężony typ zdarzenia konkretnego rodzaju (np. `EventOf<'refuel'>`). */
export type EventOf<K extends EventType> = Extract<Event, { type: K }>;

// ─────────────────────────────────────────────────────────────────────────────
// Wejście do zapisu (repo wypełnia resztę)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dane do `EventsRepo.appendEvent`. Repo dopełnia:
 *  - `uuid` (v4) — chyba że podany (idempotentny retry),
 *  - `deviceTime` z zegara — chyba że podany (backfill / testy),
 *  - `gpsTime` z ostatniego fixa — chyba że podany jawnie (null = brak fixa),
 *  - `schemaVersion` = CURRENT_SCHEMA_VERSION — chyba że podany,
 *  - `syncedAt` = null (zawsze trafia najpierw do outboxa).
 */
export type AppendEventInput = {
  [K in EventType]: {
    type: K;
    payload: EventPayloadMap[K];
    sessionUuid: string;
    aircraftId: string;
    picId: string;
    dualId?: string | null;
    /** Idempotencja / retry — gdy pominięty, repo generuje v4. */
    uuid?: string;
    /** Nadpisanie zegara telefonu (domyślnie `clock.now()`). */
    deviceTime?: EpochMillis;
    /** Nadpisanie czasu GPS (domyślnie z `clock.gpsTime()`; `null` = jawny brak fixa). */
    gpsTime?: EpochMillis | null;
    /** Nadpisanie wersji schematu (domyślnie CURRENT_SCHEMA_VERSION). */
    schemaVersion?: number;
  };
}[EventType];
