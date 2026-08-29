/**
 * UZ Aero (serwer) - adapter statystyk zakresu (`StatsAdminPort`, mockup `A10`).
 *
 * ══ CO TU WOLNO, A CZEGO NIE ══
 * Każde zapytanie tego pliku AGREGUJE kolumny projekcji `sessions` - wartości, które
 * wyprodukował `sessionRowFrom(projectSession(stream))`. Niczego nie liczymy ze
 * strumienia zdarzeń i nie odtwarzamy reguł projekcji SQL-em: `SUM(mh_end - mh_start)`
 * zamiast `SUM(mh_delta_h)` byłoby DRUGĄ implementacją bilansu dnia - i skłamałoby
 * przy pierwszym dniu bez odczytu początkowego (`docs/architektura-panelu-serwer.md` §7.5).
 * Ilorazy (średnie, udziały) liczy mapper warstwy aplikacji, nie SQL - żeby były
 * testowalne bez bazy.
 *
 * ══ ZAKRES PO DNIU ZAMKNIĘCIA ══
 * Wszystkie predykaty to `status = 'closed' AND close_time BETWEEN $1 AND $2`:
 * do sum wchodzą wyłącznie dni ZAMKNIĘTE (otwarte zmieniłyby sumy po zamknięciu),
 * a dzień liczy się tam, gdzie został domknięty. Obsługuje to częściowy indeks
 * `idx_sessions_closed_day`.
 *
 * ══ `NULL` W KOLUMNACH MIGRACJI 18 ══
 * `SUM` po cichu pomija `NULL`, więc sama suma nie odróżnia „zera" od „wiersza sprzed
 * migracji". Dlatego każdy agregat jedzie z licznikami: `stale_rows` (wiersz
 * nieprzeliczony - `takeoff_count IS NULL`, kolumny wypełnia się razem) oraz
 * `fuel_known`/`mh_known` (ile wierszy faktycznie weszło do sumy bilansu). Wnioski
 * z tych liczników wyciąga mapper - tu są wyłącznie fakty.
 */

import { isOperationType, type MhFormat, type OperationType } from '@uzaero/domain';

import type { Queryable } from '../../../application/common/ports.ts';
import type {
  AdminStatsAircraftRow,
  AdminStatsClientRow,
  AdminStatsDailyRow,
  AdminStatsDropsRow,
  AdminStatsGroupRow,
  AdminStatsOpenSessionsRow,
  AdminStatsOperationRow,
  AdminStatsPilotRow,
  AdminStatsTotalsRow,
  StatsAdminPort,
  StatsRange,
} from '../../../application/admin/ports.ts';

/** Doba UTC w ms - mianownik numeru doby (`close_time / 86400000`, dzielenie całkowite). */
const DAY_MS = 86_400_000;

/** Wspólny predykat zakresu - jedna definicja, żeby ujęcia nie mogły się rozjechać. */
const CLOSED_IN_RANGE = `s.status = 'closed' AND s.close_time BETWEEN $1 AND $2`;

/**
 * Wspólna część SELECT-a agregatów - te same wyrażenia w każdym ujęciu, bo sumy
 * MUSZĄ się zgadzać między ujęciami (mockup przełącza je w miejscu, żeby dało się
 * je porównać).
 */
const GROUP_SUMS = `
  COUNT(*)                                                AS sessions,
  COALESCE(SUM(s.block_ms), 0)                            AS block_ms,
  COALESCE(SUM(s.flight_ms), 0)                           AS flight_ms,
  COALESCE(SUM(s.takeoff_count), 0)                       AS takeoffs,
  COALESCE(SUM(s.landing_count), 0)                       AS landings,
  COALESCE(SUM(s.fuel_consumed_l), 0)                     AS fuel_l,
  COUNT(*) FILTER (WHERE s.fuel_consumed_l IS NOT NULL)   AS fuel_known,
  COALESCE(SUM(s.block_ms) FILTER (WHERE s.fuel_consumed_l IS NOT NULL), 0) AS fuel_block_ms,
  COALESCE(SUM(s.mh_delta_h), 0)                          AS mh_delta,
  COUNT(*) FILTER (WHERE s.mh_delta_h IS NOT NULL)        AS mh_known,
  COALESCE(SUM(s.block_ms) FILTER (WHERE s.mh_delta_h IS NOT NULL), 0)      AS mh_block_ms,
  COUNT(*) FILTER (WHERE s.takeoff_count IS NULL)         AS stale_rows`;

interface GroupSumsDbRow {
  sessions: string;
  block_ms: string;
  flight_ms: string;
  takeoffs: string;
  landings: string;
  fuel_l: number | string | null;
  fuel_known: string;
  fuel_block_ms: string;
  mh_delta: number | string | null;
  mh_known: string;
  mh_block_ms: string;
  stale_rows: string;
}

const toGroupSums = (r: GroupSumsDbRow): AdminStatsGroupRow => ({
  sessions: Number(r.sessions),
  blockMs: Number(r.block_ms),
  flightMs: Number(r.flight_ms),
  takeoffs: Number(r.takeoffs),
  landings: Number(r.landings),
  fuelConsumedL: Number(r.fuel_l ?? 0),
  fuelKnownSessions: Number(r.fuel_known),
  // Iloraz (średnia, rozjazd) musi dzielić przez blok TEGO SAMEGO zbioru dni,
  // z którego pochodzi licznik - mieszany mianownik systematycznie ZANIŻA wynik.
  fuelBlockMs: Number(r.fuel_block_ms),
  mhDeltaH: Number(r.mh_delta ?? 0),
  mhKnownSessions: Number(r.mh_known),
  mhBlockMs: Number(r.mh_block_ms),
  staleRows: Number(r.stale_rows),
});

const toMhFormat = (value: string | null): MhFormat | null =>
  value === 'decimal' || value === 'hhmm' ? value : null;

/** `array_agg(DISTINCT reg)` po `LEFT JOIN` niesie `NULL` dla jednostek spoza floty. */
const toRegs = (values: (string | null)[] | null): string[] =>
  (values ?? []).filter((reg): reg is string => reg != null);

export class PgAdminStatsRepo implements StatsAdminPort {
  async totals(db: Queryable, range: StatsRange): Promise<AdminStatsTotalsRow> {
    const params = [range.fromMs, range.toMs];
    const { rows } = await db.query<GroupSumsDbRow & { aircraft: string }>(
      `SELECT ${GROUP_SUMS},
              COUNT(DISTINCT s.aircraft_id) AS aircraft
         FROM sessions s
        WHERE ${CLOSED_IN_RANGE}`,
      params,
    );

    // Pilotów liczymy OSOBNYM zapytaniem, bo to unia dwóch kolumn: dzień szkolny
    // należy do obu członków załogi, a `COUNT(DISTINCT pic_id)` widziałby tylko
    // piszącego sesję.
    const pilots = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM (
         SELECT s.pic_id AS pilot FROM sessions s WHERE ${CLOSED_IN_RANGE}
         UNION
         SELECT s.dual_id FROM sessions s WHERE ${CLOSED_IN_RANGE} AND s.dual_id IS NOT NULL
       ) involved`,
      params,
    );

    const row = rows[0]!;
    return {
      ...toGroupSums(row),
      aircraft: Number(row.aircraft),
      pilots: Number(pilots.rows[0]?.n ?? 0),
    };
  }

  async openSessions(db: Queryable, range: StatsRange): Promise<AdminStatsOpenSessionsRow> {
    // Sesja niezdana nie ma `close_time`, więc jedyną jej datą jest CHWILA PRZEJĘCIA
    // (`claim_time`) - tak samo lokuje ją w czasie lista dni `A02`. Od 2026-08-07 ta
    // kolumna niesie czas `session_claim`, a NIE godzinę meldunku z preflightu; sesja
    // bez `session_claim` nie istnieje (§4.4), więc `claim_time IS NULL` jest stanem
    // wyłącznie awaryjnym - strumień połamany albo przyjęty poza kolejnością. Taka
    // sesja nie należy do ŻADNEGO zakresu, więc liczymy ją ZAWSZE i osobno: to licznik
    // rzeczy wymagających uwagi, a uczciwiej ją pokazać, niż schować za `BETWEEN`.
    const { rows } = await db.query<{ in_range: string; undated: string }>(
      `SELECT COUNT(*) FILTER (WHERE s.claim_time IS NOT NULL) AS in_range,
              COUNT(*) FILTER (WHERE s.claim_time IS NULL)     AS undated
         FROM sessions s
        WHERE s.status = 'active'
          AND (s.claim_time BETWEEN $1 AND $2 OR s.claim_time IS NULL)`,
      [range.fromMs, range.toMs],
    );
    return {
      inRange: Number(rows[0]?.in_range ?? 0),
      undated: Number(rows[0]?.undated ?? 0),
    };
  }

  async daily(db: Queryable, range: StatsRange): Promise<AdminStatsDailyRow[]> {
    // Numer doby to dzielenie CAŁKOWITE epoki przez długość doby - bez funkcji
    // kalendarzowych i stref: `close_time` jest w UTC, a `BIGINT / BIGINT` w Postgresie
    // obcina w stronę zera (epoka jest dodatnia, więc to jest podłoga).
    const { rows } = await db.query<{ day_index: string; block_ms: string }>(
      `SELECT s.close_time / ${DAY_MS} AS day_index,
              COALESCE(SUM(s.block_ms), 0) AS block_ms
         FROM sessions s
        WHERE ${CLOSED_IN_RANGE}
        GROUP BY 1`,
      [range.fromMs, range.toMs],
    );
    return rows.map((r) => ({ dayIndex: Number(r.day_index), blockMs: Number(r.block_ms) }));
  }

  async byAircraft(db: Queryable, range: StatsRange): Promise<AdminStatsAircraftRow[]> {
    interface Row extends GroupSumsDbRow {
      aircraft_id: string;
      reg: string | null;
      aircraft_type: string | null;
      capacity_l: number | null;
      mh_format: string | null;
      active_days: string;
      mh_first_start: number | null;
      mh_last_end: number | null;
    }

    // `LEFT JOIN`: jednostka wykreślona z rejestru floty zostaje w statystykach
    // z pustą rejestracją - nalot jest faktem rejestru, nie konfiguracji.
    // Odczyty skrajne: remis po `close_time` (dwie sesje domknięte w tej samej
    // milisekundzie) rozstrzyga `session_uuid` - bez tie-breakera wynik zależałby
    // od planu zapytania, nie od danych.
    const { rows } = await db.query<Row>(
      `SELECT ${GROUP_SUMS},
              s.aircraft_id,
              a.reg          AS reg,
              a.type         AS aircraft_type,
              a.capacity_l   AS capacity_l,
              a.mh_format    AS mh_format,
              COUNT(DISTINCT s.close_time / ${DAY_MS})           AS active_days,
              (array_agg(s.mh_start ORDER BY s.close_time ASC,  s.session_uuid ASC))[1]  AS mh_first_start,
              (array_agg(s.mh_end   ORDER BY s.close_time DESC, s.session_uuid DESC))[1] AS mh_last_end
         FROM sessions s
         LEFT JOIN aircraft a ON a.id = s.aircraft_id
        WHERE ${CLOSED_IN_RANGE}
        GROUP BY s.aircraft_id, a.reg, a.type, a.capacity_l, a.mh_format
        ORDER BY SUM(s.block_ms) DESC, s.aircraft_id ASC`,
      [range.fromMs, range.toMs],
    );

    return rows.map((r) => ({
      ...toGroupSums(r),
      aircraftId: r.aircraft_id,
      reg: r.reg,
      aircraftType: r.aircraft_type,
      capacityL: r.capacity_l,
      mhFormat: toMhFormat(r.mh_format),
      activeDays: Number(r.active_days),
      mhFirstStart: r.mh_first_start,
      mhLastEnd: r.mh_last_end,
    }));
  }

  async byPilot(db: Queryable, range: StatsRange): Promise<AdminStatsPilotRow[]> {
    interface Row {
      pic_id: string;
      code: string | null;
      name: string | null;
      sessions: string;
      block_ms: string;
      flight_ms: string;
      takeoffs: string;
      landings: string;
      stale_rows: string;
      regs: (string | null)[] | null;
    }

    // Atrybucja po PIC-u - jedynym, którego projekcja zna PEWNIE dla całej sesji
    // (single-writer). Bloku Duala tu NIE MA i nie wolno go policzyć z `dual_id`:
    // kolumna niesie OSTATNIEGO duala dnia, a zmiana załogi w środku dnia przypisałaby
    // mu cudze godziny. Atrybucja per członek załogi wymaga projekcji domenowej
    // (`docs/architektura-panelu-serwer.md` §10 poz. 8) - decyzja poza tym przekrojem.
    const { rows } = await db.query<Row>(
      `SELECT s.pic_id,
              p.code AS code,
              p.name AS name,
              COUNT(*)                                        AS sessions,
              COALESCE(SUM(s.block_ms), 0)                    AS block_ms,
              COALESCE(SUM(s.flight_ms), 0)                   AS flight_ms,
              COALESCE(SUM(s.takeoff_count), 0)               AS takeoffs,
              COALESCE(SUM(s.landing_count), 0)               AS landings,
              COUNT(*) FILTER (WHERE s.takeoff_count IS NULL) AS stale_rows,
              array_agg(DISTINCT a.reg ORDER BY a.reg)        AS regs
         FROM sessions s
         LEFT JOIN pilots   p ON p.id = s.pic_id
         LEFT JOIN aircraft a ON a.id = s.aircraft_id
        WHERE ${CLOSED_IN_RANGE}
        GROUP BY s.pic_id, p.code, p.name
        ORDER BY SUM(s.block_ms) DESC, s.pic_id ASC`,
      [range.fromMs, range.toMs],
    );

    return rows.map((r) => ({
      pilotId: r.pic_id,
      code: r.code,
      name: r.name,
      sessions: Number(r.sessions),
      blockMs: Number(r.block_ms),
      flightMs: Number(r.flight_ms),
      takeoffs: Number(r.takeoffs),
      landings: Number(r.landings),
      staleRows: Number(r.stale_rows),
      regs: toRegs(r.regs),
    }));
  }

  async byOperation(db: Queryable, range: StatsRange): Promise<AdminStatsOperationRow[]> {
    interface Row extends GroupSumsDbRow {
      operation: string | null;
      regs: (string | null)[] | null;
      clients: string;
    }

    const { rows } = await db.query<Row>(
      `SELECT ${GROUP_SUMS},
              s.operation,
              array_agg(DISTINCT a.reg ORDER BY a.reg) AS regs,
              COUNT(DISTINCT s.client)                 AS clients
         FROM sessions s
         LEFT JOIN aircraft a ON a.id = s.aircraft_id
        WHERE ${CLOSED_IN_RANGE}
        GROUP BY s.operation
        ORDER BY SUM(s.block_ms) DESC, s.operation ASC NULLS LAST`,
      [range.fromMs, range.toMs],
    );

    return rows.map((r) => ({
      ...toGroupSums(r),
      operation: toOperation(r.operation),
      regs: toRegs(r.regs),
      clients: Number(r.clients),
    }));
  }

  async drops(db: Queryable, range: StatsRange): Promise<AdminStatsDropsRow> {
    interface Row {
      sessions: string;
      flight_ms: string;
      lifts: string;
      tandem: string;
      aff: string;
      solo: string;
      alt_sum_ft: number | string | null;
      alt_count: string;
      stale_rows: string;
    }

    // Sumy jadą z dni JAWNIE skokowych, ale licznik stale patrzy na CAŁY zakres:
    // dzień z `operation IS NULL` (bez rozpoznanej operacji albo bez preflightu) MÓGŁ być
    // dniem skokowym, więc zawężenie `operation = 'skoki'` nie ma prawa wyrzucić go
    // ze zbioru nawet jako „nieznany". Do czasu przebudowy projekcji (`A11`) to jest
    // DOMYŚLNY stan bazy migrującej ze starego schematu - sekcja mówi wtedy „nie
    // wiem", zamiast podać sumę z części wierszy jako całość.
    const { rows } = await db.query<Row>(
      `SELECT COUNT(*)                    FILTER (WHERE s.operation = 'skoki') AS sessions,
              COALESCE(SUM(s.flight_ms)      FILTER (WHERE s.operation = 'skoki'), 0) AS flight_ms,
              COALESCE(SUM(s.drop_count)     FILTER (WHERE s.operation = 'skoki'), 0) AS lifts,
              COALESCE(SUM(s.jumpers_tandem) FILTER (WHERE s.operation = 'skoki'), 0) AS tandem,
              COALESCE(SUM(s.jumpers_aff)    FILTER (WHERE s.operation = 'skoki'), 0) AS aff,
              COALESCE(SUM(s.jumpers_solo)   FILTER (WHERE s.operation = 'skoki'), 0) AS solo,
              COALESCE(SUM(s.drop_alt_sum_ft) FILTER (WHERE s.operation = 'skoki'), 0) AS alt_sum_ft,
              COALESCE(SUM(s.drop_alt_count)  FILTER (WHERE s.operation = 'skoki'), 0) AS alt_count,
              COUNT(*) FILTER (WHERE s.operation IS NULL
                                  OR (s.operation = 'skoki' AND s.takeoff_count IS NULL))
                                                                               AS stale_rows
         FROM sessions s
        WHERE ${CLOSED_IN_RANGE}`,
      [range.fromMs, range.toMs],
    );

    const r = rows[0]!;
    return {
      sessions: Number(r.sessions),
      flightMs: Number(r.flight_ms),
      lifts: Number(r.lifts),
      tandem: Number(r.tandem),
      aff: Number(r.aff),
      solo: Number(r.solo),
      altSumFt: Number(r.alt_sum_ft ?? 0),
      altCount: Number(r.alt_count),
      staleRows: Number(r.stale_rows),
    };
  }

  async dropsByClient(db: Queryable, range: StatsRange): Promise<AdminStatsClientRow[]> {
    interface Row {
      client: string | null;
      lifts: string;
      tandem: string;
      aff: string;
      solo: string;
      alt_sum_ft: number | string | null;
      alt_count: string;
    }

    // Wiersze sprzed kolumn statystyk (`drop_count IS NULL`) są tu ODFILTROWANE, a nie
    // liczone jako zero - o tym, że tabela klientów przy takich wierszach w ogóle
    // nie ma prawa się pokazać, rozstrzyga mapper (`drops.staleRows`).
    const { rows } = await db.query<Row>(
      `SELECT s.client,
              COALESCE(SUM(s.drop_count), 0)      AS lifts,
              COALESCE(SUM(s.jumpers_tandem), 0)  AS tandem,
              COALESCE(SUM(s.jumpers_aff), 0)     AS aff,
              COALESCE(SUM(s.jumpers_solo), 0)    AS solo,
              COALESCE(SUM(s.drop_alt_sum_ft), 0) AS alt_sum_ft,
              COALESCE(SUM(s.drop_alt_count), 0)  AS alt_count
         FROM sessions s
        WHERE ${CLOSED_IN_RANGE}
          AND s.operation = 'skoki'
          AND s.drop_count IS NOT NULL
        GROUP BY s.client
        ORDER BY COALESCE(SUM(s.jumpers_tandem + s.jumpers_aff + s.jumpers_solo), 0) DESC,
                 s.client ASC NULLS LAST`,
      [range.fromMs, range.toMs],
    );

    return rows.map((r) => ({
      client: r.client,
      lifts: Number(r.lifts),
      tandem: Number(r.tandem),
      aff: Number(r.aff),
      solo: Number(r.solo),
      altSumFt: Number(r.alt_sum_ft ?? 0),
      altCount: Number(r.alt_count),
    }));
  }
}

/**
 * Wartość spoza katalogu rzuca, a nie jest po cichu zerowana - `sessions_operation_known` pilnuje
 * jej `CHECK`, więc obecność innej znaczy ręczną ingerencję (ten sam argument, co
 * w `sessionDbRow.ts`).
 */
function toOperation(value: string | null): OperationType | null {
  if (value == null) return null;
  if (!isOperationType(value)) throw new Error(`Nieznany rodzaj operacji w bazie: ${value}`);
  return value;
}
