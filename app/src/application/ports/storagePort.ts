/**
 * UZ Aero — PORT magazynu lokalnego (docs/_main.md.txt §5.2).
 *
 * To jest port w rozumieniu architektury heksagonalnej: aplikacja mówi, czego potrzebuje
 * od magazynu; infrastruktura dostarcza implementację (`ExpoSqliteAdapter` w telefonie,
 * `InMemoryAdapter` w testach). Kierunek zależności: infrastruktura → aplikacja, nigdy
 * odwrotnie.
 *
 * DLACZEGO PORT, a nie import `expo-sqlite` wprost: moduł natywny nie działa w Node/Jest,
 * a rdzeń logiki (repo, projekcje, reguły, outbox, dedup) musi być testowalny bez telefonu.
 *
 * KONTRAKT PORZĄDKU: „chronologicznie" = **kolejność wstawienia** (append-only).
 * Świadomie NIE sortujemy po `deviceTime` — offline zegar telefonu może cofnąć się
 * w trakcie dnia (§4.1 pkt 6, §4.5); realna kolejność akcji pilota = kolejność zapisu.
 * (Porządek CZASOWY, potrzebny do arytmetyki, przywraca dopiero `projectSession`.)
 *
 * KONTRAKT IDEMPOTENCJI: `insertEvent` ignoruje duplikat `uuid` i zwraca `false`
 * (dedup po UUID, §4.1) — to na tym stoi „ponowny append nie duplikuje" z repo.
 *
 * KONTRAKT WALIDACJI: port NIE zna reguł domenowych i celowo przyjmie każde zdarzenie.
 * Inwarianty egzekwuje warstwa komend (`application/commands`) PRZED zapisem — magazyn
 * musi umieć odtworzyć dowolną historię, także zastaną.
 */

import type { EpochMillis, Event, ReferenceAircraft, ReferencePilot } from '../../domain';

export interface StoragePort {
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
 * Klucze `session_meta` (§5.2 — key/value bieżącej sesji i zalogowanego pilota).
 * Trzymane jako string↔string; wartości strukturalne serializujemy do JSON.
 * Mieszkają przy porcie, bo są kontraktem MAGAZYNU, nie pojęciem domenowym.
 */
export const SESSION_META_KEYS = {
  currentSessionUuid: 'current_session_uuid',
  currentPilotId: 'current_pilot_id',
  currentAircraftId: 'current_aircraft_id',
  /**
   * Sesja OTWARTEGO dnia — dla writera headless (GPS w tle po śmierci procesu).
   * Inny cykl życia niż `current_session_uuid` (ten nigdy nie jest czyszczony,
   * o wznowieniu decyduje `dutyEnd`): zapis przy claimie, czyszczenie przy
   * `day_close`, uzgodnienie przy wznowieniu. Brak klucza = fixy do kosza.
   */
  activeSessionUuid: 'active_session_uuid',
} as const;

export type SessionMetaKey = (typeof SESSION_META_KEYS)[keyof typeof SESSION_META_KEYS];
