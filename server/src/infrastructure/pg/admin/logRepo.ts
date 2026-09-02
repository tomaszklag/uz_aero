/**
 * UZ Aero (serwer) - adapter poziomu 1 logu dnia: FLOTA W ZAKRESIE DAT.
 *
 * ══ JEDNO ZAPYTANIE, SAME AGREGATY KOLUMN PROJEKCJI ══
 * Reguła §7.1 zabrania liczyć cokolwiek z `events.payload` w SQL-u - i nic tu tego nie
 * robi. `SUM(block_ms)` sumuje WARTOŚĆ POLICZONĄ przez `projectSession` razem z jej
 * regułą; wyciąganie tego samego ze strumienia byłoby drugą, równoległą projekcją,
 * która zaczyna kłamać przy pierwszej zmianie reguły.
 *
 * ══ ZŁĄCZENIE IDZIE OD FLOTY, NIE OD SESJI ══
 * `LEFT JOIN sessions` (a nie `FROM sessions`), bo lista ma pokazywać CAŁĄ flotę:
 * maszyna, która w zakresie nie latała, jest wierszem samych kresek - i to jest
 * odpowiedź, po którą się przyszło („czy SP-KLM w ogóle ruszył w sierpniu"). Przy
 * złączeniu od sesji ta maszyna po prostu by zniknęła, a brak wiersza czyta się jak
 * brak maszyny.
 *
 * Stąd `COUNT(s.session_uuid)`, nie `COUNT(*)`: przy złączeniu bez trafienia Postgres
 * oddaje jeden wiersz z samymi `NULL`-ami, więc `COUNT(*)` policzyłby go jako sesję.
 */

import type { Queryable } from '../../../application/common/ports.ts';
import type { LogAdminPort, LogAircraftAggregate } from '../../../application/admin/ports.ts';
import { emptySessionSql } from '../substanceSql.ts';

/** Doba UTC w milisekundach - dzielnik do liczenia DNI pracy maszyny. */
const DAY_MS = 24 * 60 * 60 * 1000;

interface Row {
  aircraft_id: string;
  reg: string | null;
  type: string | null;
  mh_format: string | null;
  sessions: string;
  open_sessions: string;
  active_days: string;
  flights: string | null;
  takeoffs: string | null;
  landings: string | null;
  block_ms: string | null;
  flight_ms: string | null;
  fuel_added_l: number | null;
  fuel_consumed_l: number | null;
  fuel_unknown: string;
  oil_added_l: number | null;
  mh_delta_h: number | null;
  last_engine_stop_at: string | null;
}

const int = (v: string | null): number => (v == null ? 0 : Number(v));
const nullableInt = (v: string | null): number | null => (v == null ? null : Number(v));

export class PgAdminLogRepo implements LogAdminPort {
  async byAircraft(
    db: Queryable,
    range: { fromMs: number; toMs: number },
  ): Promise<LogAircraftAggregate[]> {
    const { rows } = await db.query<Row>(
      `SELECT a.id AS aircraft_id,
              a.reg,
              a.type,
              a.mh_format,
              COUNT(s.session_uuid) AS sessions,
              COUNT(s.session_uuid) FILTER (WHERE s.status = 'active') AS open_sessions,
              -- DNI pracy, nie liczba sesji: dwie zmiany jednego dnia to jeden dzień.
              -- Doba liczona z chwili PRZEJĘCIA, czyli tą samą osią, którą filtruje
              -- zakres i lista sesji pod spodem.
              COUNT(DISTINCT (s.claim_time / $3)) AS active_days,
              SUM(s.flights_count) AS flights,
              SUM(s.takeoff_count) AS takeoffs,
              SUM(s.landing_count) AS landings,
              SUM(s.block_ms) AS block_ms,
              SUM(s.flight_ms) AS flight_ms,
              SUM(s.fuel_added_l) AS fuel_added_l,
              SUM(s.fuel_consumed_l) AS fuel_consumed_l,
              -- Ile sesji zakresu NIE MA bilansu paliwa (otwarta, wpis bez odczytu
              -- końcowego). Suma z dziurą podana jako prawda byłaby liczbą mniejszą
              -- od rzeczywistej - kontrakt oddaje wtedy brak, a to pole mówi ile.
              COUNT(s.session_uuid) FILTER (WHERE s.fuel_consumed_l IS NULL) AS fuel_unknown,
              SUM(s.oil_added_l) AS oil_added_l,
              SUM(s.mh_delta_h) AS mh_delta_h,
              MAX(s.engine_stop_at) AS last_engine_stop_at
         FROM aircraft a
         LEFT JOIN sessions s
           ON s.aircraft_id = a.id
          AND s.claim_time BETWEEN $1 AND $2
          -- Operacja UNIEWAŻNIONA nie liczy się do sum floty (issue #75 pkt 1):
          -- baner na ekranie operacji obiecuje „nie liczy się do sum dziennika",
          -- a do 2026-09-02 ten JOIN liczył ją jak każdą inną. Pusty zapis
          -- (zdanie bez biegu i bez zmian) odpada z tego samego powodu, co z list.
          AND s.status <> 'voided'
          AND NOT ${emptySessionSql('s')}
        GROUP BY a.id, a.reg, a.type, a.mh_format
        -- Alfabetycznie po znakach na kadłubie: pytanie brzmi „gdzie jest SP-KLM",
        -- nie „która maszyna wygrała". Jednostki poza służbą i tak wyróżnia panel.
        ORDER BY a.reg ASC`,
      [range.fromMs, range.toMs, DAY_MS],
    );

    return rows.map((r) => {
      const sessions = int(r.sessions);
      const fuelUnknown = int(r.fuel_unknown);
      return {
        aircraftId: r.aircraft_id,
        reg: r.reg,
        aircraftType: r.type,
        mhFormat: r.mh_format,
        sessions,
        openSessions: int(r.open_sessions),
        activeDays: int(r.active_days),
        flights: int(r.flights),
        takeoffs: nullableInt(r.takeoffs),
        landings: nullableInt(r.landings),
        blockMs: int(r.block_ms),
        flightMs: int(r.flight_ms),
        fuelAddedL: r.fuel_added_l,
        // Bilans z dziurą NIE jest bilansem: przy choćby jednej sesji bez odczytu
        // końcowego oddajemy brak, a nie sumę tego, co akurat było policzone.
        fuelConsumedL: fuelUnknown > 0 ? null : r.fuel_consumed_l,
        fuelUnknownSessions: fuelUnknown,
        oilAddedL: r.oil_added_l,
        // Przyrost licznika sumuje się BEZ zastrzeżenia paliwowego: motogodziny mają
        // własny bilans (`mh_delta_h` jest `null` do zdania samolotu), a jedna sesja
        // bez odczytu paliwa nie unieważnia przyrostu policzonego z pozostałych.
        mhDeltaH: r.mh_delta_h,
        lastEngineStopAt: nullableInt(r.last_engine_stop_at),
      };
    });
  }
}
