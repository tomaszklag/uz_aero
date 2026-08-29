/**
 * UZ Aero - PORT śladu kalibracyjnego GPS (faza 5).
 *
 * Ślad to SUROWIEC: fixy sprzed kwarantanny jakości + markery pracy detektora
 * (detekcja zgłoszona, COFNIJ). „Detektor strzelił, pilot anulował" to fałszywa
 * detekcja oznaczona przez człowieka - złoto kalibracji, którego rejestr zdarzeń
 * nie widzi (COFNIJ z definicji zapobiega zdarzeniu).
 *
 * Ślad NIE jest zdarzeniem domenowym: nie przechodzi przez outbox, ma własną
 * wysyłkę (`uploadedAt`) i retencję - rejestr jest wieczny, ślad jest materiałem
 * roboczym do progów i przyszłych sensorów (barometr dopisze się jako nowy `kind`).
 */

import type { EpochMillis } from '../../domain';

/**
 * Rodzaj wpisu: surowy fix, marker pracy detektora albo agregat czujników pokładowych.
 *
 * `sensor` doszedł 2026-07-30 i jest zapowiedzianym w tym nagłówku „nowym `kind`":
 * barometr i czujniki inercyjne nagrywają się do tej samej tabeli, tą samą wysyłką,
 * bez zmiany serwera. NIE wpływają na detekcję - to czysty materiał na fazę 5.
 */
export type TraceKind = 'fix' | 'detection' | 'undo' | 'sensor';

/**
 * Pola czujników pokładowych - obecne WYŁĄCZNIE w wierszach `kind: 'sensor'`
 * (poza `trackDeg`, który należy do fixa).
 *
 * Wszystkie opcjonalne z rozmysłem: pominięte pole nie trafia do NDJSON-a wysyłanego
 * na serwer. Przy ~30 tys. wierszy fixów dziennie osiem zapisanych `null` na wiersz to
 * kilka megabajtów transferu za informację „tu nic nie ma" - a ślad z definicji nie
 * konkuruje o łącze z rejestrem dnia.
 */
export interface TraceSensorFields {
  /** Kurs nad ziemią z fixa (°) - wejście weta zakrętu, więc replay MUSI go widzieć. */
  trackDeg?: number | null;
  /** Ciśnienie statyczne (hPa) - barometryczny tor pionowy. */
  pressureHpa?: number | null;
  /** Średni i maksymalny moduł przyspieszenia LINIOWEGO w oknie (m/s², bez grawitacji). */
  accelMean?: number | null;
  accelMax?: number | null;
  /** Miara wibracji: odchylenie standardowe modułu przyspieszenia w oknie (m/s²). */
  vibrationRms?: number | null;
  /** Średni i maksymalny moduł prędkości kątowej (°/s). */
  gyroMean?: number | null;
  gyroMax?: number | null;
  /** Liczba surowych próbek w oknie - miara jakości agregatu. */
  imuSamples?: number | null;
}

export interface TraceEntry extends TraceSensorFields {
  id: number;
  sessionUuid: string | null;
  kind: TraceKind;
  /** Czas zjawiska (czas fixa / czas fixa wywołującego detekcję / zegar urządzenia). */
  time: EpochMillis;
  /** Zegar urządzenia w chwili zapisu - z pary zegarów wychodzi też dryf. */
  deviceTime: EpochMillis;
  gs: number | null;
  alt: number | null;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  /** Dla markerów: co wykryto / co cofnięto („takeoff" / „landing"). */
  detail: string | null;
  uploadedAt: EpochMillis | null;
}

export type NewTraceEntry = Omit<TraceEntry, 'id' | 'uploadedAt'>;

export interface TraceStats {
  total: number;
  pendingUpload: number;
  oldestDeviceTime: EpochMillis | null;
}

export interface TracePort {
  appendTrace(entry: NewTraceEntry): Promise<void>;
  /** Wpisy jeszcze niewysłane, w kolejności zapisu (własna księgowość, jak outbox). */
  getTraceBatch(limit: number): Promise<TraceEntry[]>;
  /**
   * Fixy jednej sesji z przedziału czasu - wejście ekranu śladu lotu (14).
   *
   * Zawężamy po `time`, a nie po `deviceTime`, bo okno lotu przychodzi z rejestru,
   * a rejestr liczy czasy zdarzeń z zegara GPS (`eventTime`: `gpsTime ?? deviceTime`).
   * Filtrowanie po zegarze telefonu ucinałoby ślad dokładnie o tyle, o ile ten zegar
   * dryfuje - czyli o wielkość, którą ten ślad ma pomagać zmierzyć.
   *
   * Zwraca WYŁĄCZNIE `kind = 'fix'`: agregaty czujników nie mają pozycji i nie mają
   * czego wnieść do mapy, a przy 30 tys. wierszy dziennie ich odsianie w SQL jest
   * tańsze niż przeniesienie ich do pamięci po to, żeby je odrzucić.
   */
  readTraceFixes(
    sessionUuid: string,
    fromTime: EpochMillis,
    toTime: EpochMillis,
  ): Promise<TraceEntry[]>;
  markTraceUploaded(ids: number[], uploadedAt: EpochMillis): Promise<void>;
  /**
   * Kasuje wpisy POTWIERDZONE przez serwer (issue #47) - normalna droga życia nagrania.
   *
   * Osobny krok po `markTraceUploaded`, a nie kasowanie w jego miejsce: przerwanie
   * procesu między jednym a drugim zostawia wtedy wiersze OZNACZONE, które sprzątnie
   * najbliższy przebieg. Skasowanie w tej samej operacji, w której potwierdzamy wysyłkę,
   * nie miałoby jak się cofnąć, gdyby zapis potwierdzenia padł.
   */
  purgeUploadedTrace(): Promise<number>;
  /**
   * Sufit bezpieczeństwa dla wpisów, które NIGDY nie poszły (`TRACE_RETENTION_DAYS`).
   *
   * Do issue #47 to była główna reguła życia śladu - dziś nagranie znika zaraz po
   * wysyłce, więc tu dojeżdża tylko to, czego wysłać się nie udało: telefon miesiącami
   * bez zasięgu, konto wylogowane, serwer nieosiągalny. Bez tego sufitu taka pamięć
   * rosłaby bez końca.
   */
  purgeTraceOlderThan(threshold: EpochMillis): Promise<number>;
  traceStats(): Promise<TraceStats>;
}
