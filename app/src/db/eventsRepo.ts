/**
 * UZ Aero — repozytorium zdarzeń (docs/_main.md.txt §4.1, §4.3, §4.8, §5.2).
 *
 * Warstwa nad `StorageAdapter`: nadaje `uuid`, stempluje dwa zegary, egzekwuje
 * idempotencję i wystawia outbox oraz cache referencyjny. Nie zna SQLite ani UI —
 * działa na dowolnym adapterze (produkcja: `ExpoSqliteAdapter`, testy: `InMemoryAdapter`).
 *
 * Zegar i generator UUID są WSTRZYKIWANE (DI) — testy podają `FixedClock` i deterministyczny
 * `generateId`, więc asercje na czasie/uuid są powtarzalne. W RN można podać
 * `expo-crypto`.randomUUID jako `generateId` (mocniejsza losowość niż fallback).
 */

import type { EpochMillis } from '../types/time';
import {
  CURRENT_SCHEMA_VERSION,
  type AppendEventInput,
  type Event,
} from '../types/events';
import type { ReferenceAircraft, ReferencePilot } from '../types/reference';
import { SESSION_META_KEYS } from '../types/reference';
import { defaultClock, type Clock } from '../utils/clock';
import { uuidv4 } from '../utils/id';
import type { StorageAdapter } from './storageAdapter';

export interface EventsRepoOptions {
  /** Źródło `deviceTime`/`gpsTime`. Domyślnie `defaultClock`. */
  clock?: Clock;
  /** Generator UUID. Domyślnie `uuidv4`. */
  generateId?: () => string;
}

/** Bieżący kontekst sesji zapisany w `session_meta` (§5.2). */
export interface CurrentSession {
  sessionUuid: string;
  pilotId: string;
  aircraftId: string;
}

export class EventsRepo {
  private readonly clock: Clock;
  private readonly generateId: () => string;

  constructor(
    private readonly adapter: StorageAdapter,
    options: EventsRepoOptions = {},
  ) {
    this.clock = options.clock ?? defaultClock;
    this.generateId = options.generateId ?? uuidv4;
  }

  /** Przygotowuje magazyn (schemat/migracje). Woła się raz przy starcie aplikacji. */
  async init(): Promise<void> {
    await this.adapter.init();
  }

  // ── zapis zdarzeń ─────────────────────────────────────────────────────────────

  /**
   * Dopisuje zdarzenie do strumienia (append-only) i zwraca zapisany rekord.
   *
   * Dopełnia: `uuid` (v4, chyba że podany), `deviceTime` (z zegara, chyba że podany),
   * `gpsTime` (z ostatniego fixa; `undefined` = weź z zegara, jawne `null` = brak fixa),
   * `schemaVersion` (CURRENT), `syncedAt = null` (zawsze najpierw do outboxa).
   *
   * IDEMPOTENTNE: ponowny append tego samego `uuid` nie duplikuje — zwraca rekord już
   * zapisany (dedup po UUID, §4.1). Bezpieczne przy retry warstwy sync.
   */
  async appendEvent(input: AppendEventInput): Promise<Event> {
    const uuid = input.uuid ?? this.generateId();
    const deviceTime = input.deviceTime ?? this.clock.now();
    const gpsTime = input.gpsTime !== undefined ? input.gpsTime : this.clock.gpsTime();

    // Rzut do `Event` jest bezpieczny: `AppendEventInput` to unia skorelowana
    // (para `type`↔`payload` wymuszona w miejscu wywołania). Dostęp do pól rozrywa
    // korelację dla kompilatora, ale nie w runtime — pary nie da się rozjechać.
    const event = {
      uuid,
      sessionUuid: input.sessionUuid,
      aircraftId: input.aircraftId,
      picId: input.picId,
      dualId: input.dualId ?? null,
      type: input.type,
      payload: input.payload,
      deviceTime,
      gpsTime,
      schemaVersion: input.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      syncedAt: null,
    } as Event;

    const inserted = await this.adapter.insertEvent(event);
    if (!inserted) {
      const existing = await this.adapter.getEventByUuid(uuid);
      return existing ?? event;
    }
    return event;
  }

  // ── odczyt zdarzeń ────────────────────────────────────────────────────────────

  getEvent(uuid: string): Promise<Event | null> {
    return this.adapter.getEventByUuid(uuid);
  }

  /** Zdarzenia jednej sesji w kolejności wstawienia (materiał dla projekcji). */
  getSessionEvents(sessionUuid: string): Promise<Event[]> {
    return this.adapter.getEventsBySession(sessionUuid);
  }

  getAllEvents(): Promise<Event[]> {
    return this.adapter.getAllEvents();
  }

  // ── outbox (§4.3) ─────────────────────────────────────────────────────────────

  /** Kolejka do wysłania: `syncedAt IS NULL`, w kolejności wstawienia. */
  getOutbox(): Promise<Event[]> {
    return this.adapter.getUnsyncedEvents();
  }

  /** Ile zdarzeń czeka w outboxie — zasila SyncChip (`OFFLINE · n`). */
  async getOutboxCount(): Promise<number> {
    return (await this.adapter.getUnsyncedEvents()).length;
  }

  /**
   * Oznacza zdarzenia jako wysłane (po potwierdzeniu serwera). Znika z outboxa.
   * @param syncedAt czas potwierdzenia (domyślnie `clock.now()`).
   */
  markSynced(uuids: string[], syncedAt: EpochMillis = this.clock.now()): Promise<void> {
    return this.adapter.markSynced(uuids, syncedAt);
  }

  // ── cache referencyjny (§4.8, §5.2) ──────────────────────────────────────────

  /**
   * Zapisuje samoloty do cache, stemplując `fetchedAt` (jeśli nie podano — `clock.now()`).
   * `fetchedAt` steruje adnotacją wieku w UI („· z cache · sync …", §6).
   */
  upsertAircraft(
    rows: Array<Omit<ReferenceAircraft, 'fetchedAt'>>,
    fetchedAt: EpochMillis = this.clock.now(),
  ): Promise<void> {
    return this.adapter.upsertAircraft(rows.map((r) => ({ ...r, fetchedAt })));
  }

  upsertPilots(
    rows: Array<Omit<ReferencePilot, 'fetchedAt'>>,
    fetchedAt: EpochMillis = this.clock.now(),
  ): Promise<void> {
    return this.adapter.upsertPilots(rows.map((r) => ({ ...r, fetchedAt })));
  }

  /** Zbiorczy zapis cache (typowo po odpowiedzi GET /reference). */
  async upsertReference(input: {
    aircraft?: Array<Omit<ReferenceAircraft, 'fetchedAt'>>;
    pilots?: Array<Omit<ReferencePilot, 'fetchedAt'>>;
    fetchedAt?: EpochMillis;
  }): Promise<void> {
    const fetchedAt = input.fetchedAt ?? this.clock.now();
    if (input.aircraft?.length) await this.upsertAircraft(input.aircraft, fetchedAt);
    if (input.pilots?.length) await this.upsertPilots(input.pilots, fetchedAt);
  }

  getAircraft(): Promise<ReferenceAircraft[]> {
    return this.adapter.getAircraft();
  }

  getAircraftById(id: string): Promise<ReferenceAircraft | null> {
    return this.adapter.getAircraftById(id);
  }

  getPilots(): Promise<ReferencePilot[]> {
    return this.adapter.getPilots();
  }

  // ── session_meta (§5.2) ──────────────────────────────────────────────────────

  getMeta(key: string): Promise<string | null> {
    return this.adapter.getMeta(key);
  }

  setMeta(key: string, value: string): Promise<void> {
    return this.adapter.setMeta(key, value);
  }

  /** Zapamiętuje bieżącą sesję (przetrwanie restartu aplikacji). */
  async setCurrentSession(session: CurrentSession): Promise<void> {
    await this.adapter.setMeta(SESSION_META_KEYS.currentSessionUuid, session.sessionUuid);
    await this.adapter.setMeta(SESSION_META_KEYS.currentPilotId, session.pilotId);
    await this.adapter.setMeta(SESSION_META_KEYS.currentAircraftId, session.aircraftId);
  }

  /** Odczytuje bieżącą sesję z `session_meta` (null gdy którykolwiek klucz brakuje). */
  async getCurrentSession(): Promise<CurrentSession | null> {
    const sessionUuid = await this.adapter.getMeta(SESSION_META_KEYS.currentSessionUuid);
    const pilotId = await this.adapter.getMeta(SESSION_META_KEYS.currentPilotId);
    const aircraftId = await this.adapter.getMeta(SESSION_META_KEYS.currentAircraftId);
    if (!sessionUuid || !pilotId || !aircraftId) return null;
    return { sessionUuid, pilotId, aircraftId };
  }
}
