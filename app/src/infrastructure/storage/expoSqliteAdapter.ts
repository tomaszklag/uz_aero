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
import type {
  NewTraceEntry,
  StoragePort,
  TraceEntry,
  TracePort,
  TraceStats,
} from '../../application/ports';
// Schemat trzymamy osobno, bo dzięki temu da się go uruchomić w Node i przetestować
// na prawdziwym silniku SQLite — patrz `schema.ts` i `sqliteSchema.test.ts`.
import { MIGRATIONS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'uzaero.db';

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

export class ExpoSqliteAdapter implements StoragePort, TracePort {
  private db: SQLiteDatabase | null = null;

  constructor(private readonly databaseName: string = DB_NAME) {}

  async init(): Promise<void> {
    const db = await openDatabaseAsync(this.databaseName);
    this.db = db;
    await db.execAsync('PRAGMA journal_mode = WAL;');
    // Dwa połączenia współistnieją przez chwilę przy zimnym starcie z działającą
    // usługą GPS w tle (writer headless + bootstrap aplikacji). Oba robią pojedyncze
    // INSERT-y — krótki czekacz zamienia rzadki SQLITE_BUSY w niezauważalną pauzę.
    await db.execAsync('PRAGMA busy_timeout = 2000;');

    const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    const current = versionRow?.user_version ?? 0;

    // Migracje stosujemy po kolei od bieżącej wersji — jedno źródło DDL (`schema.ts`),
    // wspólne z testem schematu.
    for (let v = current; v < MIGRATIONS.length; v += 1) {
      await db.execAsync(MIGRATIONS[v]);
    }

    // PRAGMA nie przyjmuje parametrów — wartość to nasza stała liczbowa (bezpieczne).
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }


  /**
   * Zamyka połączenie. Potrzebne wyłącznie writerowi headless: gdy aplikacja wstaje,
   * jej bootstrap otwiera własne połączenie do TEGO SAMEGO pliku — drugie żywe
   * połączenie potrafi unieważnić pierwsze po stronie natywnej
   * (`NativeDatabase.prepareAsync → NullPointerException` na głównym zapisie).
   */
  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    if (db != null) await db.closeAsync();
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

  // ── ślad kalibracyjny GPS (faza 5) ──────────────────────────────────────────

  async appendTrace(entry: NewTraceEntry): Promise<void> {
    await this.getDb().runAsync(
      `INSERT INTO gps_trace
         (session_uuid, kind, time, device_time, gs, alt, track_deg, lat, lon, accuracy_m,
          pressure_hpa, accel_mean, accel_max, vibration_rms, gyro_mean, gyro_max, imu_samples,
          detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.sessionUuid,
        entry.kind,
        entry.time,
        entry.deviceTime,
        entry.gs,
        entry.alt,
        entry.trackDeg ?? null,
        entry.lat,
        entry.lon,
        entry.accuracyM,
        entry.pressureHpa ?? null,
        entry.accelMean ?? null,
        entry.accelMax ?? null,
        entry.vibrationRms ?? null,
        entry.gyroMean ?? null,
        entry.gyroMax ?? null,
        entry.imuSamples ?? null,
        entry.detail,
      ],
    );
  }

  async getTraceBatch(limit: number): Promise<TraceEntry[]> {
    const rows = await this.getDb().getAllAsync<TraceRow>(
      'SELECT * FROM gps_trace WHERE uploaded_at IS NULL ORDER BY id LIMIT ?',
      [limit],
    );
    return rows.map(toTraceEntry);
  }

  async readTraceFixes(
    sessionUuid: string,
    fromTime: EpochMillis,
    toTime: EpochMillis,
  ): Promise<TraceEntry[]> {
    // `kind = 'fix'` odsiewamy w SQL, nie w pamięci: agregaty czujników to połowa
    // wierszy śladu i nie mają pozycji, więc przenoszenie ich tylko po to, żeby je
    // odrzucić, byłoby najdroższą częścią tego zapytania.
    const rows = await this.getDb().getAllAsync<TraceRow>(
      `SELECT * FROM gps_trace
        WHERE session_uuid = ? AND kind = 'fix' AND time >= ? AND time <= ?
        ORDER BY time`,
      [sessionUuid, fromTime, toTime],
    );
    return rows.map(toTraceEntry);
  }

  async markTraceUploaded(ids: number[], uploadedAt: EpochMillis): Promise<void> {
    await this.getDb().withTransactionAsync(async () => {
      const db = this.getDb();
      for (const id of ids) {
        await db.runAsync('UPDATE gps_trace SET uploaded_at = ? WHERE id = ?', [uploadedAt, id]);
      }
    });
  }

  async purgeTraceOlderThan(threshold: EpochMillis): Promise<number> {
    const result = await this.getDb().runAsync('DELETE FROM gps_trace WHERE device_time < ?', [
      threshold,
    ]);
    return result.changes;
  }

  async traceStats(): Promise<TraceStats> {
    const row = await this.getDb().getFirstAsync<{
      total: number;
      pending: number;
      oldest: number | null;
    }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN uploaded_at IS NULL THEN 1 ELSE 0 END) AS pending,
              MIN(device_time) AS oldest
       FROM gps_trace`,
    );
    return {
      total: row?.total ?? 0,
      pendingUpload: row?.pending ?? 0,
      oldestDeviceTime: row?.oldest ?? null,
    };
  }

  async clear(): Promise<void> {
    await this.getDb().execAsync(`
      DELETE FROM events;
      DELETE FROM reference_aircraft;
      DELETE FROM reference_pilots;
      DELETE FROM session_meta;
      DELETE FROM gps_trace;
    `);
  }
}

/** Wiersz `gps_trace` w bazie (snake_case jak w DDL). */
interface TraceRow {
  id: number;
  session_uuid: string | null;
  kind: string;
  time: number;
  device_time: number;
  gs: number | null;
  alt: number | null;
  track_deg: number | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  pressure_hpa: number | null;
  accel_mean: number | null;
  accel_max: number | null;
  vibration_rms: number | null;
  gyro_mean: number | null;
  gyro_max: number | null;
  imu_samples: number | null;
  detail: string | null;
  uploaded_at: number | null;
}

/** Pole trafia do wpisu tylko wtedy, gdy naprawdę coś zmierzono. */
function present(key: string, value: number | null): Record<string, number> {
  return value == null ? {} : { [key]: value };
}

/**
 * Wiersz bazy → wpis śladu.
 *
 * Kolumny bez pomiaru POMIJAMY, nie przepisujemy jako `null`: ten obiekt idzie prosto
 * do `JSON.stringify` w wysyłce, a jedenaście kolumn czujników zapisanych jako `null`
 * w każdym z ~30 tys. dziennych wierszy fixa to kilka megabajtów transferu za zdanie
 * „tu nic nie ma".
 */
function toTraceEntry(row: TraceRow): TraceEntry {
  return {
    id: row.id,
    sessionUuid: row.session_uuid,
    kind: row.kind as TraceEntry['kind'],
    time: row.time,
    deviceTime: row.device_time,
    gs: row.gs,
    alt: row.alt,
    lat: row.lat,
    lon: row.lon,
    accuracyM: row.accuracy_m,
    detail: row.detail,
    uploadedAt: row.uploaded_at,
    ...present('trackDeg', row.track_deg),
    ...present('pressureHpa', row.pressure_hpa),
    ...present('accelMean', row.accel_mean),
    ...present('accelMax', row.accel_max),
    ...present('vibrationRms', row.vibration_rms),
    ...present('gyroMean', row.gyro_mean),
    ...present('gyroMax', row.gyro_max),
    ...present('imuSamples', row.imu_samples),
  };
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
