/**
 * UZ Aero (serwer) - adapter magazynu zdarzeń (`EventsStorePort`).
 *
 * Idempotencja synca (§4.3) mieszka w JEDNYM miejscu: `ON CONFLICT (uuid) DO NOTHING`.
 * Telefon może wysłać tę samą paczkę pięć razy (urwane połączenie, retry) - liczba
 * wierszy w `events` się nie zmieni, a odpowiedź uczciwie rozdzieli `accepted` od
 * `duplicates`, bo to od niej zależy księgowość outboxa po stronie aplikacji.
 */

import type { Event } from '@uzaero/domain';

import type { EventsStorePort, Queryable } from '../../../application/common/ports.ts';

interface EventRow {
  uuid: string;
  session_uuid: string;
  aircraft_id: string;
  pic_id: string;
  dual_id: string | null;
  type: string;
  device_time: string; // BIGINT wraca z pg jako string
  gps_time: string | null;
  payload: unknown;
  schema_version: number;
}

const toEvent = (r: EventRow): Event =>
  ({
    uuid: r.uuid,
    sessionUuid: r.session_uuid,
    aircraftId: r.aircraft_id,
    picId: r.pic_id,
    dualId: r.dual_id,
    type: r.type,
    deviceTime: Number(r.device_time),
    gpsTime: r.gps_time != null ? Number(r.gps_time) : null,
    payload: r.payload,
    schemaVersion: r.schema_version,
    syncedAt: null, // pole klienckie - na serwerze bez znaczenia
  }) as Event;

export class PgEventsStore implements EventsStorePort {
  async insertBatch(
    tx: Queryable,
    events: readonly Event[],
    sourceDevice: string | null,
  ): Promise<{ accepted: number; duplicates: number }> {
    let accepted = 0;
    for (const e of events) {
      const { rows } = await tx.query<{ uuid: string }>(
        `INSERT INTO events
           (uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
            device_time, gps_time, payload, schema_version, source_device)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (uuid) DO NOTHING
         RETURNING uuid`,
        [
          e.uuid,
          e.sessionUuid,
          e.aircraftId,
          e.picId,
          e.dualId,
          e.type,
          e.deviceTime,
          e.gpsTime,
          JSON.stringify(e.payload),
          e.schemaVersion,
          sourceDevice,
        ],
      );
      if (rows.length > 0) accepted += 1;
    }
    return { accepted, duplicates: events.length - accepted };
  }

  async sessionEvents(db: Queryable, sessionUuid: string): Promise<Event[]> {
    const { rows } = await db.query<EventRow>(
      'SELECT * FROM events WHERE session_uuid = $1 ORDER BY received_at, uuid',
      [sessionUuid],
    );
    return rows.map(toEvent);
  }

  async sessionStreams(
    db: Queryable,
    sessionUuids: readonly string[],
  ): Promise<Map<string, Event[]>> {
    const streams = new Map<string, Event[]>();
    if (sessionUuids.length === 0) return streams;

    // Porządek `session_uuid` na pierwszym miejscu grupuje wiersze jednej sesji obok
    // siebie, ale to `received_at, uuid` jest tu kontraktem: `projectSession` zakłada
    // kolejność WSTAWIENIA, dokładnie jak przy `sessionEvents`.
    const { rows } = await db.query<EventRow>(
      `SELECT * FROM events
        WHERE session_uuid = ANY($1)
        ORDER BY session_uuid, received_at, uuid`,
      [[...sessionUuids]],
    );

    // Klucze zakładamy z góry, żeby sesja BEZ zdarzeń miała pustą tablicę zamiast
    // brakującego wpisu - wywołujący nie musi wtedy rozróżniać `undefined` od `[]`.
    for (const uuid of sessionUuids) streams.set(uuid, []);
    for (const row of rows) streams.get(row.session_uuid)?.push(toEvent(row));

    return streams;
  }

  async lastReceivedAt(db: Queryable, aircraftId: string): Promise<Date | null> {
    const { rows } = await db.query<{ last: string | null }>(
      'SELECT MAX(received_at) AS last FROM events WHERE aircraft_id = $1',
      [aircraftId],
    );
    return rows[0]?.last != null ? new Date(rows[0].last) : null;
  }

  async countForSession(db: Queryable, sessionUuid: string): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM events WHERE session_uuid = $1',
      [sessionUuid],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
