/**
 * UZ Aero — ADAPTER `StoragePort` na `expo-sqlite` (docs/_main.md.txt §5.2).
 *
 * Schemat: `events` (append-only + `synced_at` NULL = outbox), `reference_aircraft`,
 * `reference_pilots`, `session_meta`. Payloady i `handover` trzymamy jako JSON w TEXT,
 * czasy jako INTEGER (epoch ms), boole jako 0/1.
 *
 * Kolejność „chronologiczna" = kolejność wstawienia → sortujemy po `rowid` (klucz PK jest
 * TEXT, więc niejawny `rowid` rośnie z każdym INSERT). Idempotencja: `INSERT OR IGNORE`
 * + sprawdzenie `changes` (0 = duplikat `uuid`).
 *
 * ⚠️ Ten plik importuje `expo-sqlite` (moduł natywny) — NIE jest importowany w testach
 * Node/Jest (te używają `InMemoryAdapter`). Podłączamy go w warstwie aplikacji.
 */

import {
  openDatabaseAsync,
  type SQLiteBindValue,
  type SQLiteDatabase,
} from 'expo-sqlite';

import {
  EVENT_TYPES,
  type EpochMillis,
  type Event,
  type EventType,
  type Handover,
  type MhFormat,
  type ReferenceAircraft,
  type ReferencePilot,
  type ServiceStatus,
} from '../../domain';
import type { StoragePort } from '../../application/ports';

const DB_NAME = 'uzaero.db';
/** Wersja schematu lokalnej bazy (PRAGMA user_version). Bump = nowa migracja. */
const SCHEMA_VERSION = 1;

// ── kształty wierszy tak, jak wracają z SQLite ──────────────────────────────────

interface EventRow {
  uuid: string;
  session_uuid: string;
  aircraft_id: string;
  pic_id: string;
  dual_id: string | null;
  type: string;
  device_time: number;
  gps_time: number | null;
  payload: string;
  schema_version: number;
  synced_at: number | null;
}

interface AircraftRow {
  id: string;
  reg: string;
  type: string;
  year: number | null;
  capacity_l: number;
  mh_format: string;
  dual_required: number;
  service_status: string;
  claim_pic: string | null;
  claim_since: number | null;
  handover: string | null;
  fetched_at: number;
}

interface PilotRow {
  id: string;
  code: string;
  name: string;
  active: number;
  fetched_at: number;
}

export class ExpoSqliteAdapter implements StoragePort {
  private db: SQLiteDatabase | null = null;

  constructor(private readonly databaseName: string = DB_NAME) {}

  async init(): Promise<void> {
    const db = await openDatabaseAsync(this.databaseName);
    this.db = db;
    await db.execAsync('PRAGMA journal_mode = WAL;');

    const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    const current = versionRow?.user_version ?? 0;

    if (current < 1) {
      await this.migrateTo1(db);
    }

    // PRAGMA nie przyjmuje parametrów — wartość to nasza stała liczbowa (bezpieczne).
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  private async migrateTo1(db: SQLiteDatabase): Promise<void> {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS events (
        uuid           TEXT PRIMARY KEY NOT NULL,
        session_uuid   TEXT NOT NULL,
        aircraft_id    TEXT NOT NULL,
        pic_id         TEXT NOT NULL,
        dual_id        TEXT,
        type           TEXT NOT NULL,
        device_time    INTEGER NOT NULL,
        gps_time       INTEGER,
        payload        TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        synced_at      INTEGER
      );
      -- UWAGA: SQLite NIE pozwala umiescic rowid na liscie kolumn indeksu
      -- (blad: "no such column: rowid"), choc w ORDER BY jest legalny. Nie trzeba go
      -- zreszta wymieniac: rowid jest lokalizatorem wiersza w kazdym indeksie, wiec po
      -- trafieniu w session_uuid / synced_at sortowanie po rowid i tak idzie po indeksie.
      CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_uuid);
      CREATE INDEX IF NOT EXISTS idx_events_outbox  ON events (synced_at);

      CREATE TABLE IF NOT EXISTS reference_aircraft (
        id             TEXT PRIMARY KEY NOT NULL,
        reg            TEXT NOT NULL,
        type           TEXT NOT NULL,
        year           INTEGER,
        capacity_l     REAL NOT NULL,
        mh_format      TEXT NOT NULL,
        dual_required  INTEGER NOT NULL,
        service_status TEXT NOT NULL,
        claim_pic      TEXT,
        claim_since    INTEGER,
        handover       TEXT,
        fetched_at     INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reference_pilots (
        id         TEXT PRIMARY KEY NOT NULL,
        code       TEXT NOT NULL,
        name       TEXT NOT NULL,
        active     INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }

  private getDb(): SQLiteDatabase {
    if (!this.db) {
      throw new Error('ExpoSqliteAdapter.init() nie został wywołany.');
    }
    return this.db;
  }

  // ── events ──────────────────────────────────────────────────────────────────

  async insertEvent(event: Event): Promise<boolean> {
    const result = await this.getDb().runAsync(
      `INSERT OR IGNORE INTO events
         (uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
          device_time, gps_time, payload, schema_version, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.uuid,
        event.sessionUuid,
        event.aircraftId,
        event.picId,
        event.dualId,
        event.type,
        event.deviceTime,
        event.gpsTime,
        JSON.stringify(event.payload),
        event.schemaVersion,
        event.syncedAt,
      ],
    );
    // changes === 0 → wiersz już istniał (duplikat uuid zignorowany).
    return result.changes > 0;
  }

  async getEventByUuid(uuid: string): Promise<Event | null> {
    const row = await this.getDb().getFirstAsync<EventRow>(
      'SELECT * FROM events WHERE uuid = ?',
      [uuid],
    );
    return row ? rowToEvent(row) : null;
  }

  async getEventsBySession(sessionUuid: string): Promise<Event[]> {
    const rows = await this.getDb().getAllAsync<EventRow>(
      'SELECT * FROM events WHERE session_uuid = ? ORDER BY rowid ASC',
      [sessionUuid],
    );
    return rows.map(rowToEvent);
  }

  async getUnsyncedEvents(): Promise<Event[]> {
    const rows = await this.getDb().getAllAsync<EventRow>(
      'SELECT * FROM events WHERE synced_at IS NULL ORDER BY rowid ASC',
    );
    return rows.map(rowToEvent);
  }

  async getAllEvents(): Promise<Event[]> {
    const rows = await this.getDb().getAllAsync<EventRow>(
      'SELECT * FROM events ORDER BY rowid ASC',
    );
    return rows.map(rowToEvent);
  }

  async markSynced(uuids: string[], syncedAt: EpochMillis): Promise<void> {
    if (uuids.length === 0) return;
    const db = this.getDb();
    await db.withTransactionAsync(async () => {
      for (const uuid of uuids) {
        await db.runAsync('UPDATE events SET synced_at = ? WHERE uuid = ?', [syncedAt, uuid]);
      }
    });
  }

  // ── reference cache ─────────────────────────────────────────────────────────

  async upsertAircraft(rows: ReferenceAircraft[]): Promise<void> {
    const db = this.getDb();
    await db.withTransactionAsync(async () => {
      for (const a of rows) {
        const params: SQLiteBindValue[] = [
          a.id,
          a.reg,
          a.type,
          a.year,
          a.capacityL,
          a.mhFormat,
          a.dualRequired ? 1 : 0,
          a.serviceStatus,
          a.claimPicId,
          a.claimSince,
          a.handover ? JSON.stringify(a.handover) : null,
          a.fetchedAt,
        ];
        await db.runAsync(
          `INSERT INTO reference_aircraft
             (id, reg, type, year, capacity_l, mh_format, dual_required,
              service_status, claim_pic, claim_since, handover, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             reg=excluded.reg, type=excluded.type, year=excluded.year,
             capacity_l=excluded.capacity_l, mh_format=excluded.mh_format,
             dual_required=excluded.dual_required, service_status=excluded.service_status,
             claim_pic=excluded.claim_pic, claim_since=excluded.claim_since,
             handover=excluded.handover, fetched_at=excluded.fetched_at`,
          params,
        );
      }
    });
  }

  async getAircraft(): Promise<ReferenceAircraft[]> {
    const rows = await this.getDb().getAllAsync<AircraftRow>(
      'SELECT * FROM reference_aircraft ORDER BY reg ASC',
    );
    return rows.map(rowToAircraft);
  }

  async getAircraftById(id: string): Promise<ReferenceAircraft | null> {
    const row = await this.getDb().getFirstAsync<AircraftRow>(
      'SELECT * FROM reference_aircraft WHERE id = ?',
      [id],
    );
    return row ? rowToAircraft(row) : null;
  }

  async upsertPilots(rows: ReferencePilot[]): Promise<void> {
    const db = this.getDb();
    await db.withTransactionAsync(async () => {
      for (const p of rows) {
        await db.runAsync(
          `INSERT INTO reference_pilots (id, code, name, active, fetched_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             code=excluded.code, name=excluded.name,
             active=excluded.active, fetched_at=excluded.fetched_at`,
          [p.id, p.code, p.name, p.active ? 1 : 0, p.fetchedAt],
        );
      }
    });
  }

  async getPilots(): Promise<ReferencePilot[]> {
    const rows = await this.getDb().getAllAsync<PilotRow>(
      'SELECT * FROM reference_pilots ORDER BY code ASC',
    );
    return rows.map(rowToPilot);
  }

  // ── session_meta ────────────────────────────────────────────────────────────

  async getMeta(key: string): Promise<string | null> {
    const row = await this.getDb().getFirstAsync<{ value: string }>(
      'SELECT value FROM session_meta WHERE key = ?',
      [key],
    );
    return row ? row.value : null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.getDb().runAsync(
      `INSERT INTO session_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [key, value],
    );
  }

  async deleteMeta(key: string): Promise<void> {
    await this.getDb().runAsync('DELETE FROM session_meta WHERE key = ?', [key]);
  }

  async clear(): Promise<void> {
    await this.getDb().execAsync(`
      DELETE FROM events;
      DELETE FROM reference_aircraft;
      DELETE FROM reference_pilots;
      DELETE FROM session_meta;
    `);
  }
}

// ── mapowanie wiersz → domena ──────────────────────────────────────────────────

function toEventType(value: string): EventType {
  if ((EVENT_TYPES as readonly string[]).includes(value)) {
    return value as EventType;
  }
  throw new Error(`Nieznany typ zdarzenia w bazie: ${value}`);
}

function rowToEvent(row: EventRow): Event {
  // Bezpieczne złożenie: `type` walidowany, `payload` sparsowany z JSON.
  return {
    uuid: row.uuid,
    sessionUuid: row.session_uuid,
    aircraftId: row.aircraft_id,
    picId: row.pic_id,
    dualId: row.dual_id,
    type: toEventType(row.type),
    deviceTime: row.device_time,
    gpsTime: row.gps_time,
    payload: JSON.parse(row.payload),
    schemaVersion: row.schema_version,
    syncedAt: row.synced_at,
  } as Event;
}

function rowToAircraft(row: AircraftRow): ReferenceAircraft {
  return {
    id: row.id,
    reg: row.reg,
    type: row.type,
    year: row.year,
    capacityL: row.capacity_l,
    mhFormat: row.mh_format as MhFormat,
    dualRequired: row.dual_required === 1,
    serviceStatus: row.service_status as ServiceStatus,
    claimPicId: row.claim_pic,
    claimSince: row.claim_since,
    handover: row.handover ? (JSON.parse(row.handover) as Handover) : null,
    fetchedAt: row.fetched_at,
  };
}

function rowToPilot(row: PilotRow): ReferencePilot {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active === 1,
    fetchedAt: row.fetched_at,
  };
}
