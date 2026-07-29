/**
 * UZ Aero — PORT śladu kalibracyjnego GPS (faza 5).
 *
 * Ślad to SUROWIEC: fixy sprzed kwarantanny jakości + markery pracy detektora
 * (detekcja zgłoszona, COFNIJ). „Detektor strzelił, pilot anulował" to fałszywa
 * detekcja oznaczona przez człowieka — złoto kalibracji, którego rejestr zdarzeń
 * nie widzi (COFNIJ z definicji zapobiega zdarzeniu).
 *
 * Ślad NIE jest zdarzeniem domenowym: nie przechodzi przez outbox, ma własną
 * wysyłkę (`uploadedAt`) i retencję — rejestr jest wieczny, ślad jest materiałem
 * roboczym do progów i przyszłych sensorów (barometr dopisze się jako nowy `kind`).
 */

import type { EpochMillis } from '../../domain';

/** Rodzaj wpisu: surowy fix albo marker pracy detektora. */
export type TraceKind = 'fix' | 'detection' | 'undo';

export interface TraceEntry {
  id: number;
  sessionUuid: string | null;
  kind: TraceKind;
  /** Czas zjawiska (czas fixa / czas fixa wywołującego detekcję). */
  time: EpochMillis;
  /** Zegar urządzenia w chwili zapisu — z pary zegarów wychodzi też dryf. */
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
  markTraceUploaded(ids: number[], uploadedAt: EpochMillis): Promise<void>;
  /** Retencja: kasuje wpisy z `deviceTime` starszym niż próg. Zwraca liczbę usuniętych. */
  purgeTraceOlderThan(threshold: EpochMillis): Promise<number>;
  traceStats(): Promise<TraceStats>;
}
