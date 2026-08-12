/**
 * UZ Aero (serwer) — adapter analityki zużycia (`ConsumptionAdminPort`, mockup `A10a`).
 *
 * ══ CO TU WOLNO, A CZEGO NIE ══
 * Ten plik NIE LICZY NICZEGO. Oddaje wiersze: konfigurację jednostki, kolumny projekcji
 * zamkniętych dni okna i licznik dni otwartych. Cała arytmetyka — interwały paliwowe,
 * regresja, przeliczniki motogodzin — mieszka w `@uzaero/domain`, a ilorazy w mapperze.
 * Reguła jest ta sama, co przy `statsRepo.ts`: SQL oddaje FAKTY, wnioski wyciąga warstwa
 * wyżej (`docs/architektura-panelu-serwer.md` §7.1).
 *
 * ══ ZAKRES PO DNIU ZAMKNIĘCIA ══
 * Do modelu wchodzą wyłącznie dni ZAMKNIĘTE — dzień bez `day_close` nie ma odczytu
 * końcowego paliwomierza, więc jego zużycia po prostu nie znamy. Predykat jest ten sam,
 * co w statystykach zakresu, i obsługuje go ten sam częściowy indeks
 * `idx_sessions_closed_day`.
 */

import { type MhFormat } from '@uzaero/domain';

import type { Queryable } from '../../../application/common/ports.ts';
import type {
  ConsumptionAdminPort,
  ConsumptionAircraftRow,
  ConsumptionSessionsPage,
  StatsRange,
} from '../../../application/admin/ports.ts';

/** Wspólny predykat okna — jedna definicja, żeby licznik i lista nie mogły się rozjechać. */
const CLOSED_IN_RANGE = `s.aircraft_id = $1 AND s.status = 'closed' AND s.close_time BETWEEN $2 AND $3`;

interface SessionDbRow {
  session_uuid: string;
  claim_time: string | null;
  close_time: string | null;
  mh_delta_h: number | string | null;
  block_ms: string;
  flight_ms: string;
  takeoff_count: number | null;
}

const toMhFormat = (value: string): MhFormat => (value === 'hhmm' ? 'hhmm' : 'decimal');

export class PgAdminConsumptionRepo implements ConsumptionAdminPort {
  async aircraft(db: Queryable, aircraftId: string): Promise<ConsumptionAircraftRow | null> {
    const { rows } = await db.query<{
      id: string;
      reg: string;
      type: string;
      capacity_l: number;
      mh_format: string;
      service_status: string;
    }>(
      `SELECT id, reg, type, capacity_l, mh_format, service_status
         FROM aircraft WHERE id = $1`,
      [aircraftId],
    );

    const row = rows[0];
    if (row == null) return null;

    return {
      aircraftId: row.id,
      reg: row.reg,
      aircraftType: row.type,
      capacityL: Number(row.capacity_l),
      mhFormat: toMhFormat(row.mh_format),
      serviceStatus: row.service_status,
    };
  }

  async closedSessions(
    db: Queryable,
    aircraftId: string,
    range: StatsRange,
    limit: number,
  ): Promise<ConsumptionSessionsPage> {
    const params = [aircraftId, range.fromMs, range.toMs];

    // Licznik JEST osobnym zapytaniem, choć kusi, żeby wyliczyć go z długości listy.
    // Przy przycięciu limitem długość mówiłaby tylko „tyle, ile pokazaliśmy", a ekran
    // ma powiedzieć, ilu dni NIE policzył — inaczej przycięta analityka wyglądałaby
    // na komplet.
    const counted = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM sessions s WHERE ${CLOSED_IN_RANGE}`,
      params,
    );

    // Od najnowszego: gdy okno przekracza limit, chcemy zachować dni ŚWIEŻE — model
    // ma opisywać samolot, jakim jest teraz, a nie jakim był na początku zakresu.
    // `session_uuid` rozstrzyga remis, inaczej wynik zależałby od planu zapytania.
    const { rows } = await db.query<SessionDbRow>(
      `SELECT s.session_uuid, s.claim_time, s.close_time, s.mh_delta_h,
              s.block_ms, s.flight_ms, s.takeoff_count
         FROM sessions s
        WHERE ${CLOSED_IN_RANGE}
        ORDER BY s.close_time DESC, s.session_uuid DESC
        LIMIT $4`,
      [...params, limit],
    );

    return {
      total: Number(counted.rows[0]?.n ?? 0),
      sessions: rows.map((r) => ({
        sessionUuid: r.session_uuid,
        claimTime: r.claim_time != null ? Number(r.claim_time) : null,
        closeTime: r.close_time != null ? Number(r.close_time) : null,
        mhDeltaH: r.mh_delta_h != null ? Number(r.mh_delta_h) : null,
        blockMs: Number(r.block_ms),
        flightMs: Number(r.flight_ms),
        takeoffCount: r.takeoff_count,
      })),
    };
  }

  async openSessions(db: Queryable, aircraftId: string, range: StatsRange): Promise<number> {
    // Dzień otwarty nie ma `close_time`, więc jedyną jego datą jest czas przejęcia (`claim_time`) — tak samo
    // lokuje go w czasie lista dni (`A02`) i licznik otwartych w statystykach (`A10`).
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n
         FROM sessions s
        WHERE s.aircraft_id = $1
          AND s.status = 'active'
          AND s.claim_time BETWEEN $2 AND $3`,
      [aircraftId, range.fromMs, range.toMs],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
