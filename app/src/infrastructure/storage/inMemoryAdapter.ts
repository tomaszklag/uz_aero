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
  BugReport,
  BugReportPort,
  NewBugReport,
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

export class InMemoryAdapter implements StoragePort, TracePort, BugReportPort {
  private events = new Map<string, Event>();
  private order: string[] = [];
  /** Flota z klubem, do którego należy - lustro `reference_aircraft.org_id`. */
  private aircraft = new Map<string, { orgId: string; row: ReferenceAircraft }>();
  /** Klucz `org|id`, bo kod pilota należy do CZŁONKOSTWA (lustro klucza `(org_id, id)`). */
  private pilots = new Map<string, { orgId: string; row: ReferencePilot }>();
  private meta = new Map<string, string>();
  /** Klub operacji - lustro `session_orgs` (wielofirmowość §7). */
  private sessionOrgs = new Map<string, string>();
  /** Zgłoszenia błędów (issue #87) - lustro `bug_reports`, w kolejności zapisu. */
  private bugs: BugReport[] = [];
  /** Zapisy wstrzymane decyzją administratora (issue #81) - lustro `withheld_events`. */
  private withheld = new Map<string, WithheldEvent>();

  async init(): Promise<void> {
    // Nic do zrobienia - struktury istnieją od konstrukcji.
  }

  async insertEvent(event: Event, orgId: string | null = null): Promise<boolean> {
    // Klub stawia PIERWSZE zdarzenie operacji i nikt go potem nie zmienia - ten sam
    // kontrakt, co `INSERT OR IGNORE` w adapterze SQLite. Dzieje się to także przy
    // duplikacie zdarzenia: operacja mogła dostać klub później niż swoje pierwsze zapisy.
    if (orgId != null && !this.sessionOrgs.has(event.sessionUuid)) {
      this.sessionOrgs.set(event.sessionUuid, orgId);
    }
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

  async getUnsyncedEvents(orgId?: string | null): Promise<Event[]> {
    // Wstrzymane WYPADŁY z kolejki (issue #81), choć `syncedAt` mają dalej `null`.
    // Zawężenie do klubu obejmuje operacje BEZ klubu (zapisy sprzed 2.0.0, §11).
    return this.orderedEvents().filter(
      (e) =>
        e.syncedAt == null &&
        !this.withheld.has(e.uuid) &&
        (orgId == null || (this.sessionOrgs.get(e.sessionUuid) ?? orgId) === orgId),
    );
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

  // ── klub operacji (wielofirmowość §7) ───────────────────────────────────────

  async getSessionOrg(sessionUuid: string): Promise<string | null> {
    return this.sessionOrgs.get(sessionUuid) ?? null;
  }

  async getSessionOrgs(): Promise<Record<string, string>> {
    return Object.fromEntries(this.sessionOrgs);
  }

  async adoptSessionsWithoutOrg(orgId: string): Promise<number> {
    let adopted = 0;
    for (const event of this.events.values()) {
      if (this.sessionOrgs.has(event.sessionUuid)) continue;
      this.sessionOrgs.set(event.sessionUuid, orgId);
      adopted += 1;
    }
    return adopted;
  }

  async upsertAircraft(rows: ReferenceAircraft[], orgId: string): Promise<void> {
    for (const row of rows) this.aircraft.set(row.id, { orgId, row: deepClone(row) });
  }

  async getAircraft(orgId: string | null): Promise<ReferenceAircraft[]> {
    if (orgId == null) return [];
    return [...this.aircraft.values()].filter((a) => a.orgId === orgId).map((a) => deepClone(a.row));
  }

  async aircraftCountsByOrg(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const { orgId } of this.aircraft.values()) counts[orgId] = (counts[orgId] ?? 0) + 1;
    return counts;
  }

  async getAllAircraft(): Promise<ReferenceAircraft[]> {
    return [...this.aircraft.values()].map((a) => deepClone(a.row));
  }

  async getAircraftById(id: string): Promise<ReferenceAircraft | null> {
    // BEZ zawężenia do klubu - patrz `StoragePort.getAircraftById`.
    const found = this.aircraft.get(id);
    return found ? deepClone(found.row) : null;
  }

  async upsertPilots(rows: ReferencePilot[], orgId: string): Promise<void> {
    for (const row of rows) this.pilots.set(`${orgId}|${row.id}`, { orgId, row: deepClone(row) });
  }

  async getPilots(orgId: string | null): Promise<ReferencePilot[]> {
    if (orgId == null) return [];
    return [...this.pilots.values()].filter((p) => p.orgId === orgId).map((p) => deepClone(p.row));
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

  async appendBugReport(report: NewBugReport): Promise<void> {
    // `INSERT OR IGNORE` z adaptera SQLite - ten sam kontrakt: uuid jest kluczem.
    if (this.bugs.some((b) => b.uuid === report.uuid)) return;
    this.bugs.push({ ...deepClone(report), sentAt: null });
  }

  async getPendingBugReports(limit: number): Promise<BugReport[]> {
    return this.bugs
      .filter((b) => b.sentAt == null)
      .slice(0, limit)
      .map((b) => deepClone(b));
  }

  async markBugReportsSent(uuids: string[], sentAt: EpochMillis): Promise<void> {
    for (const bug of this.bugs) {
      if (uuids.includes(bug.uuid)) bug.sentAt = sentAt;
    }
  }

  async purgeSentBugReports(): Promise<number> {
    const before = this.bugs.length;
    this.bugs = this.bugs.filter((b) => b.sentAt == null);
    return before - this.bugs.length;
  }

  async pendingBugReportCount(): Promise<number> {
    return this.bugs.filter((b) => b.sentAt == null).length;
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
    this.withheld.clear();
    this.sessionOrgs.clear();
    this.aircraft.clear();
    this.pilots.clear();
    this.meta.clear();
    this.trace = [];
    this.bugs = [];
  }

  /** Zdarzenia w kolejności wstawienia, jako kopie. */
  private orderedEvents(): Event[] {
    return this.order.map((uuid) => deepClone(this.events.get(uuid)!));
  }
}
