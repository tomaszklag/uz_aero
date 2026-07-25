/**
 * UZ Aero — abstrakcja dostępu do lokalnego magazynu (docs/_main.md.txt §5.2).
 *
 * DLACZEGO INTERFEJS: `expo-sqlite` nie działa w Node/Jest. Cała logika (repo,
 * projekcje, outbox, dedup) rozmawia wyłącznie z tym interfejsem, więc daje się
 * przetestować na `InMemoryAdapter` bez natywnej bazy (CLAUDE.md, brief Fazy 1).
 * Implementacja produkcyjna to `ExpoSqliteAdapter`.
 *
 * KONTRAKT PORZĄDKU: „chronologicznie" = **kolejność wstawienia** (append-only).
 * Świadomie NIE sortujemy po `deviceTime` — offline zegar telefonu może cofnąć się
 * w trakcie dnia (§4.1 pkt 6, §4.5); realna kolejność akcji pilota = kolejność zapisu.
 *
 * KONTRAKT IDEMPOTENCJI: `insertEvent` ignoruje duplikat `uuid` i zwraca `false`
 * (dedup po UUID, §4.1) — to na tym stoi „ponowny append nie duplikuje" z repo.
 */

import type { EpochMillis } from '../types/time';
import type { Event } from '../types/events';
import type { ReferenceAircraft, ReferencePilot } from '../types/reference';

export interface StorageAdapter {
  /** Tworzy schemat / migruje bazę. Idempotentne (można wołać przy każdym starcie). */
  init(): Promise<void>;

  // ── events (append-only) ────────────────────────────────────────────────────
  /** Wstawia zdarzenie. Zwraca `false`, gdy `uuid` już istnieje (duplikat zignorowany). */
  insertEvent(event: Event): Promise<boolean>;
  getEventByUuid(uuid: string): Promise<Event | null>;
  /** Zdarzenia sesji w kolejności wstawienia. */
  getEventsBySession(sessionUuid: string): Promise<Event[]>;
  /** Outbox: zdarzenia z `syncedAt IS NULL`, w kolejności wstawienia (§4.3). */
  getUnsyncedEvents(): Promise<Event[]>;
  /** Wszystkie zdarzenia w kolejności wstawienia (diagnostyka / testy). */
  getAllEvents(): Promise<Event[]>;
  /** Oznacza wskazane `uuid` jako wysłane (ustawia `syncedAt`). Nieznane `uuid` pomija. */
  markSynced(uuids: string[], syncedAt: EpochMillis): Promise<void>;

  // ── cache referencyjny (§4.8, §5.2) ──────────────────────────────────────────
  upsertAircraft(rows: ReferenceAircraft[]): Promise<void>;
  getAircraft(): Promise<ReferenceAircraft[]>;
  getAircraftById(id: string): Promise<ReferenceAircraft | null>;
  upsertPilots(rows: ReferencePilot[]): Promise<void>;
  getPilots(): Promise<ReferencePilot[]>;

  // ── session_meta (key/value, §5.2) ───────────────────────────────────────────
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  deleteMeta(key: string): Promise<void>;

  // ── utrzymanie ───────────────────────────────────────────────────────────────
  /** Czyści cały magazyn (reset w testach / wylogowanie). */
  clear(): Promise<void>;
}

/**
 * Głęboka kopia struktur JSON-serializowalnych. Payloady zdarzeń i rekordy cache to
 * czyste dane (liczby, stringi, null, obiekty/tablice) — round-trip przez JSON jest
 * bezpieczny i izoluje magazyn od mutacji przez wołającego. (Brak Date — czas trzymamy
 * jako epoch ms; `undefined` znika, co jest pożądane dla pól opcjonalnych.)
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Magazyn w pamięci — implementacja referencyjna i testowa `StorageAdapter`.
 * Trzyma zdarzenia w mapie `uuid → Event` plus tablicę `order` (kolejność wstawienia).
 * Zwraca i przyjmuje KOPIE, więc testy nie mogą przypadkiem zmutować stanu magazynu.
 */
export class InMemoryAdapter implements StorageAdapter {
  private events = new Map<string, Event>();
  private order: string[] = [];
  private aircraft = new Map<string, ReferenceAircraft>();
  private pilots = new Map<string, ReferencePilot>();
  private meta = new Map<string, string>();

  async init(): Promise<void> {
    // Nic do zrobienia — struktury istnieją od konstrukcji.
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
    return this.orderedEvents().filter((e) => e.syncedAt == null);
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
  }

  /** Zdarzenia w kolejności wstawienia, jako kopie. */
  private orderedEvents(): Event[] {
    return this.order.map((uuid) => deepClone(this.events.get(uuid)!));
  }
}
