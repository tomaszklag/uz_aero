/**
 * UZ Aero (serwer) — adapter PULSU SYSTEMU (`DashboardAdminPort`, mockupy `A01`/`A01a`).
 *
 * Trzy pytania, których nie zadaje żadna inna powierzchnia, i wszystkie chodzą po
 * `events.received_at` — czyli po ZEGARZE SERWERA. To jest jedyna uczciwa oś dla
 * pulpitu: `device_time` mówi, kiedy coś się stało, a pulpit pyta, kiedy się o tym
 * dowiedzieliśmy. Pusty słupek na wykresie znaczy „nic nie przyszło", nigdy „nikt nie
 * latał" — i mockup opisuje ten przypadek wprost.
 *
 * ══ INDEKS NIE JEST OPTYMALIZACJĄ, TYLKO WARUNKIEM ══
 * `idx_events_received` obsługuje oba wzorce tego pliku: `ORDER BY received_at DESC
 * LIMIT 6` (karta „Ostatnio przyjęte") i zakres `received_at >= …` (histogram, licznik
 * doby). Bez niego każde wejście na pulpit skanowałoby CAŁY rejestr, który rośnie bez
 * granicy — pulpit działałby świetnie w pierwszym miesiącu i coraz gorzej w każdym
 * następnym, czyli w sposób najtrudniejszy do zauważenia.
 *
 * **`ORDER BY` niżej jest BEZ `NULLS LAST` i to jest decyzja, nie przeoczenie.**
 * `events.received_at` jest `NOT NULL`, więc dopisek nie zmienia wyniku — a planer
 * dopasowuje porządek SKŁADNIOWO i o ograniczeniu kolumny nie wnioskuje.
 * `idx_events_received` stoi jako `(received_at DESC, uuid DESC)`, czyli w postaci
 * DOMYŚLNEJ, którą ten sam indeks obsługuje w obie strony. Zapytanie z `NULLS LAST`
 * przestałoby do niego pasować i „ostatnie sześć zdarzeń" zaczęłoby sortować cały
 * rejestr — pulpit ładowałby się natychmiast w pierwszym miesiącu i coraz wolniej
 * w każdym następnym. Trzy podejścia do tej pomyłki opisuje
 * `docs/architektura-panelu-serwer.md` §7.8.
 */

import type {
  AdminDayTotalsRow,
  AdminRecentEventRow,
  DashboardAdminPort,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';

interface InflowRow {
  bucket: string;
  n: string;
}

interface RecentRow {
  uuid: string;
  session_uuid: string;
  aircraft_id: string;
  reg: string | null;
  type: string;
  device_time: string;
  gps_time: string | null;
  received_at: string;
  pic_id: string;
  pic_code: string | null;
  pic_name: string | null;
}

interface TotalsRow {
  sessions: string;
  aircraft: string;
  flights: string;
  block_ms: string;
}

export class PgAdminDashboardRepo implements DashboardAdminPort {
  async inflow(
    db: Queryable,
    window: { fromMs: number; toMs: number; bucketMs: number },
  ): Promise<{ bucket: number; count: number }[]> {
    // Numer wiadra liczymy w SQL-u z milisekund epoki, a nie funkcjami kalendarzowymi
    // (`date_trunc('hour', …)`): podziałka wykresu jest OKNEM RUCHOMYM zakotwiczonym
    // w „teraz", a nie siatką pełnych godzin. `date_trunc` dałby dwanaście wiader,
    // z których pierwsze i ostatnie byłyby niepełne — czyli słupki różnej długości
    // opisane jako równe.
    const { rows } = await db.query<InflowRow>(
      `SELECT floor((EXTRACT(EPOCH FROM received_at) * 1000 - $1) / $3)::bigint AS bucket,
              COUNT(*) AS n
         FROM events
        WHERE received_at >= to_timestamp($1::double precision / 1000)
          AND received_at <  to_timestamp($2::double precision / 1000)
        GROUP BY 1`,
      [window.fromMs, window.toMs, window.bucketMs],
    );
    return rows.map((row) => ({ bucket: Number(row.bucket), count: Number(row.n) }));
  }

  async recent(db: Queryable, limit: number): Promise<AdminRecentEventRow[]> {
    // `LEFT JOIN`, nie `JOIN`: zdarzenie samolotu wykreślonego z rejestru albo pilota
    // z usuniętym kontem MUSI zostać widoczne. Rejestr jest append-only i to on jest
    // prawdą — brak wiersza w tabeli referencyjnej odbiera nazwę, nie fakt.
    const { rows } = await db.query<RecentRow>(
      `SELECT e.uuid, e.session_uuid, e.aircraft_id, e.type,
              e.device_time, e.gps_time, e.received_at, e.pic_id,
              a.reg  AS reg,
              p.code AS pic_code,
              p.name AS pic_name
         FROM events e
         LEFT JOIN aircraft a ON a.id = e.aircraft_id
         LEFT JOIN pilots   p ON p.id = e.pic_id
        ORDER BY e.received_at DESC, e.uuid DESC
        LIMIT $1`,
      [limit],
    );

    return rows.map((row) => ({
      uuid: row.uuid,
      sessionUuid: row.session_uuid,
      aircraftId: row.aircraft_id,
      reg: row.reg,
      type: row.type,
      deviceTime: Number(row.device_time),
      gpsTime: row.gps_time != null ? Number(row.gps_time) : null,
      receivedAt: new Date(row.received_at),
      picId: row.pic_id,
      picCode: row.pic_code,
      picName: row.pic_name,
    }));
  }

  async dayTotals(
    db: Queryable,
    range: { fromMs: number; toMs: number },
  ): Promise<AdminDayTotalsRow> {
    // Sumy jadą z KOLUMN PROJEKCJI, nigdy z ponownego liczenia po zdarzeniach — to ta
    // sama reguła, co na liście dni: „agreguj wartości projekcji, nigdy nie odtwarzaj
    // projekcji SQL-em". Dzień bez preflightu (`claim_time IS NULL`) nie ma daty, więc
    // wypada z zakresu — tak samo jak na `A02`.
    const { rows } = await db.query<TotalsRow>(
      `SELECT COUNT(*)                                  AS sessions,
              COUNT(DISTINCT aircraft_id)               AS aircraft,
              COALESCE(SUM(flights_count), 0)           AS flights,
              COALESCE(SUM(block_ms), 0)                AS block_ms
         FROM sessions
        WHERE claim_time IS NOT NULL
          AND claim_time BETWEEN $1 AND $2`,
      [range.fromMs, range.toMs],
    );

    // Zdarzenia liczymy DRUGIM zapytaniem, bo mierzą co innego: dni lotne po duty
    // starcie (zegar telefonu), zdarzenia po przyjęciu (zegar serwera). Złączenie ich
    // w jedno zapytanie zrosłoby dwie osie czasu w jedną liczbę.
    const accepted = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n
         FROM events
        WHERE received_at >= to_timestamp($1::double precision / 1000)
          AND received_at <= to_timestamp($2::double precision / 1000)`,
      [range.fromMs, range.toMs],
    );

    const row = rows[0];
    return {
      sessions: Number(row?.sessions ?? 0),
      aircraft: Number(row?.aircraft ?? 0),
      flights: Number(row?.flights ?? 0),
      blockMs: Number(row?.block_ms ?? 0),
      eventsAccepted: Number(accepted.rows[0]?.n ?? 0),
    };
  }

  async lastFlyingDayStart(db: Queryable): Promise<number | null> {
    const { rows } = await db.query<{ last: string | null }>(
      'SELECT MAX(claim_time) AS last FROM sessions WHERE claim_time IS NOT NULL',
    );
    const last = rows[0]?.last;
    return last == null ? null : Number(last);
  }
}
