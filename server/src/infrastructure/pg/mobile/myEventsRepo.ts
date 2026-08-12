/**
 * UZ Aero (serwer) — adapter odtworzenia rejestru telefonu (`MyEventsPort`, §4.9).
 *
 * Osobny plik od `common/eventsStore.ts` z tego samego powodu, dla którego port jest
 * osobny: tamten obsługuje INGEST i czyta strumień JEDNEJ sesji (albo garści sesji)
 * bez stronicowania. Ten czyta rejestr JEDNEGO PILOTA przez wszystkie jego sesje,
 * kursorem, w porządku przyjęcia — to inne pytanie i inny indeks.
 *
 * Czego tu NIE MA: `UPDATE`, `DELETE` i strażnika typów. Rejestr jest append-only,
 * a `events.type` celowo nie ma `CHECK`-a (katalog typów mieszka w `@uzaero/domain`) —
 * telefon ma odzyskać to, co kiedyś zapisał, także gdy katalog zdążył się zmienić.
 */

import type { Event } from '@uzaero/domain';

import type { Queryable } from '../../../application/common/ports.ts';
import type { MyEventsPort } from '../../../application/mobile/ports.ts';
import {
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetPredicate,
  type CursorShape,
} from '../keyset.ts';
import { SqlFilter } from '../sqlFilter.ts';

/**
 * Klucz porządku — ten sam, pod który stoi `idx_events_received (received_at DESC,
 * uuid DESC)`. Kierunek ROSNĄCY obsługuje ten indeks skanem wstecz, bo `keysetOrderBy`
 * nie dokleja `NULLS` przy kluczu `NOT NULL` (reguła §7.8 `architektura-panelu-serwer.md`
 * — dopisek wyłamałby jeden z dwóch kierunków).
 */
const KEY: readonly [string, string] = ['received_at', 'uuid'];

/**
 * Kształt kursora. `timestamp` + `k1Nullable: false` + `k2: 'string'` odrzucają wartość
 * z zewnątrz PRZED Postgresem: obie kolumny są `NOT NULL` (`uuid` jest kluczem głównym),
 * a `received_at` jest `TIMESTAMPTZ`, więc kursor niesie ISO 8601 UTC, nie dowolny napis.
 *
 * `direction: 'asc'` jest częścią kursora i jest sprawdzany przy odczycie — kursor wydany
 * przez listę panelu (`desc`) opisuje pozycję w INNYM porządku, więc nie ma prawa
 * przejść tutaj jako „prawie pasujący".
 */
const SHAPE: CursorShape = {
  k1: 'timestamp',
  k1Nullable: false,
  k2: 'string',
  direction: 'asc',
};

interface EventDbRow {
  uuid: string;
  session_uuid: string;
  aircraft_id: string;
  pic_id: string;
  dual_id: string | null;
  type: string;
  /** `BIGINT` — sterownik oddaje `int8` NAPISEM, nie liczbą. */
  device_time: string | number;
  gps_time: string | number | null;
  payload: unknown;
  schema_version: number;
  received_at: string | Date;
}

const toEvent = (r: EventDbRow): Event =>
  ({
    uuid: r.uuid,
    sessionUuid: r.session_uuid,
    aircraftId: r.aircraft_id,
    picId: r.pic_id,
    dualId: r.dual_id,
    type: r.type,
    deviceTime: Number(r.device_time),
    gpsTime: r.gps_time == null ? null : Number(r.gps_time),
    payload: r.payload,
    schemaVersion: r.schema_version,
    // Pole KLIENCKIE: na serwerze nie ma znaczenia, a telefon stempluje je sam w chwili
    // zapisu pobranego zdarzenia (przyszło z serwera = serwer je ma).
    syncedAt: null,
  }) as Event;

export class PgMyEventsRepo implements MyEventsPort {
  async page(
    db: Queryable,
    picId: string,
    cursor: string | null,
    limit: number,
  ): Promise<{ events: Event[]; nextCursor: string | null; hasMore: boolean } | null> {
    const key = cursor == null ? null : decodeCursor(cursor, SHAPE);
    if (cursor != null && key == null) return null;

    const filter = new SqlFilter();
    filter.add('pic_id = ?', picId);
    keysetPredicate(KEY, key, filter, SHAPE);

    // +1 wiersz ponad limit to cała detekcja „czy jest następna strona" — `COUNT`
    // na to nie odpowiada, bo rejestr rośnie MIĘDZY zapytaniami (telefony dosyłają
    // outboxy dokładnie wtedy, gdy ten telefon odtwarza swój).
    const limitParam = filter.bind(limit + 1);
    const { rows } = await db.query<EventDbRow>(
      `SELECT uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
              device_time, gps_time, payload, schema_version, received_at
         FROM events
         ${filter.where()}
         ${keysetOrderBy(KEY, SHAPE)}
        LIMIT ${limitParam}`,
      filter.params(),
    );

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    // Kursor za OSTATNIM oddanym wierszem — także gdy strona była ostatnia: telefon
    // ma go zapamiętać i wrócić z nim po dosyłkę. `null` wyłącznie dla strony pustej,
    // bo tam nie ma pozycji do opisania (wołający zostaje przy tym, co miał).
    const nextCursor =
      last != null
        ? encodeCursor({ k1: new Date(last.received_at).toISOString(), k2: last.uuid }, SHAPE)
        : null;

    return { events: page.map(toEvent), nextCursor, hasMore: rows.length > limit };
  }
}
