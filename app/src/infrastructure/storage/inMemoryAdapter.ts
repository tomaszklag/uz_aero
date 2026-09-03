/**
 * UZ Aero - magazyn w pamięci: implementacja referencyjna i testowa `StoragePort`.
 *
 * Dzięki niemu CAŁY rdzeń (repo, komendy, reguły, projekcje, outbox, dedup) testuje się
 * w Node/Jest bez natywnego `expo-sqlite` - to jest powód istnienia portu.
 *
 * Trzyma zdarzenia w mapie `uuid → Event` plus tablicę `order` (kolejność wstawienia).
 * Zwraca i przyjmuje KOPIE, więc testy nie mogą przypadkiem zmutować stanu magazynu.
 */

import type { EpochMillis, Event, ReferenceAircraft, ReferencePilot } from '../../domain';
import type {
  NewTraceEntry,
  StoragePort,
  TraceEntry,
  TracePort,
  TraceStats,
  WithheldEvent,
  WithheldReason,
} from '../../application/ports';

/**
 * Głęboka kopia struktur JSON-serializowalnych. Payloady zdarzeń i rekordy cache to
 * czyste dane (liczby, stringi, null, obiekty/tablice) - round-trip przez JSON jest
 * bezpieczny i izoluje magazyn od mutacji przez wołającego. (Brak Date - czas trzymamy
 * jako epoch ms; `undefined` znika, co jest pożądane dla pól opcjonalnych.)
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class InMemoryAdapter implements StoragePort, TracePort {
  private events = new Map<string, Event>();
  private order: string[] = [];
  private aircraft = new Map<string, ReferenceAircraft>();
  private pilots = new Map<string, ReferencePilot>();
  private meta = new Map<string, string>();
  /** Zapisy wstrzymane decyzją administratora (issue #81) - lustro `withheld_events`. */
  private withheld = new Map<string, WithheldEvent>();

  async init(): Promise<void> {
    // Nic do zrobienia - struktury istnieją od konstrukcji.
  }

  async insertEvent(event: Event): Promise<boolean> {
    if (this.events.has(event.uuid)) return false;
    this.events.set(event.uuid, deepClone(event));
    this.order.push(event.uuid);
    return true;
  }

  async getEventByUuid(uuid: string): Promise<Event | null> {
    const found = this.events.get(uuid);
    return found ? deepClone(found) : null;
  }

  async getEventsBySession(sessionUuid: string): Promise<Event[]> {
    return this.orderedEvents().filter((e) => e.sessionUuid === sessionUuid);
  }

  async getUnsyncedEvents(): Promise<Event[]> {
    // Wstrzymane WYPADŁY z kolejki (issue #81), choć `syncedAt` mają dalej `null`.
    return this.orderedEvents().filter((e) => e.syncedAt == null && !this.withheld.has(e.uuid));
  }

  async getAllEvents(): Promise<Event[]> {
    return this.orderedEvents();
  }

  async markSynced(uuids: string[], syncedAt: EpochMillis): Promise<void> {
    for (const uuid of uuids) {
      const found = this.events.get(uuid);
      if (found) found.syncedAt = syncedAt;
    }
  }

  async withholdEvents(
    uuids: string[],
    reason: WithheldReason,
    withheldAt: EpochMillis,
  ): Promise<void> {
    for (const uuid of uuids) {
      const found = this.events.get(uuid);
      // Nieznany uuid pomijamy, jak `markSynced`; drugi raz to samo - bez zmiany
      // (pierwsza decyzja zostaje, jak `INSERT OR IGNORE` w SQLite).
      if (found == null || this.withheld.has(uuid)) continue;
      this.withheld.set(uuid, { uuid, sessionUuid: found.sessionUuid, reason, withheldAt });
    }
  }

  async getWithheldEvents(): Promise<WithheldEvent[]> {
    return [...this.withheld.values()].map(deepClone);
  }

  async upsertAircraft(rows: ReferenceAircraft[]): Promise<void> {
    for (const row of rows) this.aircraft.set(row.id, deepClone(row));
  }

  async getAircraft(): Promise<ReferenceAircraft[]> {
    return [...this.aircraft.values()].map(deepClone);
  }

  async getAircraftById(id: string): Promise<ReferenceAircraft | null> {
    const found = this.aircraft.get(id);
    return found ? deepClone(found) : null;
  }

  async upsertPilots(rows: ReferencePilot[]): Promise<void> {
    for (const row of rows) this.pilots.set(row.id, deepClone(row));
  }

  async getPilots(): Promise<ReferencePilot[]> {
    return [...this.pilots.values()].map(deepClone);
  }

  // ── ślad kalibracyjny GPS (faza 5) ──────────────────────────────────────────
  private trace: TraceEntry[] = [];
  private traceSeq = 0;

  async appendTrace(entry: NewTraceEntry): Promise<void> {
    this.trace.push({ ...entry, id: (this.traceSeq += 1), uploadedAt: null });
  }

  async getTraceBatch(limit: number): Promise<TraceEntry[]> {
    return this.trace.filter((e) => e.uploadedAt == null).slice(0, limit).map(deepClone);
  }

  async readTraceFixes(
    sessionUuid: string,
    fromTime: EpochMillis,
    toTime: EpochMillis,
  ): Promise<TraceEntry[]> {
    return this.trace
      .filter(
        (e) =>
          e.sessionUuid === sessionUuid &&
          e.kind === 'fix' &&
          e.time >= fromTime &&
          e.time <= toTime,
      )
      .sort((a, b) => a.time - b.time)
      .map(deepClone);
  }

  async markTraceUploaded(ids: number[], uploadedAt: EpochMillis): Promise<void> {
    const set = new Set(ids);
    for (const e of this.trace) if (set.has(e.id)) e.uploadedAt = uploadedAt;
  }

  async purgeUploadedTrace(): Promise<number> {
    const before = this.trace.length;
    this.trace = this.trace.filter((e) => e.uploadedAt == null);
    return before - this.trace.length;
  }

  async purgeTraceOlderThan(threshold: EpochMillis): Promise<number> {
    const before = this.trace.length;
    this.trace = this.trace.filter((e) => e.deviceTime >= threshold);
    return before - this.trace.length;
  }

  async traceStats(): Promise<TraceStats> {
    return {
      total: this.trace.length,
      pendingUpload: this.trace.filter((e) => e.uploadedAt == null).length,
      oldestDeviceTime: this.trace.reduce<EpochMillis | null>(
        (min, e) => (min == null || e.deviceTime < min ? e.deviceTime : min),
        null,
      ),
    };
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.has(key) ? this.meta.get(key)! : null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  async deleteMeta(key: string): Promise<void> {
    this.meta.delete(key);
  }

  async clear(): Promise<void> {
    this.events.clear();
    this.order = [];
    this.aircraft.clear();
    this.pilots.clear();
    this.meta.clear();
    this.trace = [];
  }

  /** Zdarzenia w kolejności wstawienia, jako kopie. */
  private orderedEvents(): Event[] {
    return this.order.map((uuid) => deepClone(this.events.get(uuid)!));
  }
}
