/**
 * Ninerdeck (serwer) - adapter poziomu 1 logu dnia: FLOTA W ZAKRESIE DAT.
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
 *
 * ══ OŚ PILOTÓW: TEN SAM ZBIÓR WIERSZY, DRUGA OŚ (3.2.0, §4.1, §17.1) ══
 * `byPilot` czyta DOKŁADNIE te operacje, co `byAircraft` (zakres po `claim_time`, bez
 * unieważnionych i pustych) i rozkłada je po ludziach: raz po dowódcy (nalot), raz po
 * drugim pilocie (osobna suma prawego fotela). Dlatego oba warunki zakresu stoją
 * w JEDNYM napisie (`inRange`) - dwie kopie rozjechałyby się przy pierwszej poprawce,
 * a równość sum obu osi jest treścią testu P-B.
 *
 * ══ SUMY = OPERACJE ZAMKNIĘTE, W TOKU NAZWANA OSOBNO (decyzja właściciela 2026-09-26) ══
 * Do 3.2.0 oś maszyn sumowała także operację w toku „tym, co już zapisała" (reguła
 * z 2.0: inaczej dzisiejszy dzień byłby pusty do wieczora). Od P-B JEDNA podstawa
 * liczenia dla obu osi, nagłówków dób i statystyk (§4.5): do sum wchodzą wyłącznie
 * operacje ZDANE (`status = 'closed'`), a operacja w toku jest w wierszu NAZWANA -
 * `openSessions` („leci teraz", „· 1 w toku") - więc dzisiejszy dzień nie jest pusty,
 * tylko mówi prawdę o tym, czego jeszcze nie ma: wyłączenia silnika i odczytu
 * końcowego. Zakres (`inRange`) decyduje, KTÓRE operacje należą do wiersza; `CLOSED`
 * decyduje, które z nich się SUMUJĄ.
 */

import type { Queryable } from '../../../application/common/ports.ts';
import type {
  LogAdminPort,
  LogAircraftAggregate,
  LogIdleMember,
  LogPilotAggregate,
} from '../../../application/admin/ports.ts';
import { emptySessionSql } from '../substanceSql.ts';

/** Doba UTC w milisekundach - dzielnik do liczenia DNI pracy maszyny. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Warunek zakresu WSPÓLNY dla obu osi: klub (parametr `org` - numer podaje wołający,
 * bo zapytania różnią się liczbą parametrów), przejęcie w zakresie (`$1`, `$2`), bez
 * unieważnionych (issue #75 pkt 1) i bez pustych zapisów (pkt 2). Alias `s`.
 */
const inRange = (org: string): string => `s.org_id = ${org}
          AND s.claim_time BETWEEN $1 AND $2
          AND s.status <> 'voided'
          AND NOT ${emptySessionSql('s')}`;

/**
 * Warunek SUMOWANIA (alias podany przez wołającego): liczy się wyłącznie operacja
 * zdana. Operacja w toku należy do zakresu (`inRange`) i do wiersza, ale nie do sum.
 */
const closed = (alias: string): string => `${alias}.status = 'closed'`;

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
    orgId: string,
    range: { fromMs: number; toMs: number },
  ): Promise<LogAircraftAggregate[]> {
    const { rows } = await db.query<Row>(
      `SELECT a.id AS aircraft_id,
              a.reg,
              a.type,
              a.mh_format,
              -- SUMY = ZAMKNIĘTE (docblock): każdy agregat niżej ma filtr closed(),
              -- a operacja w toku jest policzona OSOBNO w open_sessions.
              COUNT(s.session_uuid) FILTER (WHERE ${closed('s')}) AS sessions,
              COUNT(s.session_uuid) FILTER (WHERE s.status = 'active') AS open_sessions,
              -- DNI pracy, nie liczba sesji: dwie zmiany jednego dnia to jeden dzień.
              -- Doba liczona z chwili PRZEJĘCIA, czyli tą samą osią, którą filtruje
              -- zakres i lista sesji pod spodem.
              COUNT(DISTINCT (s.claim_time / $3)) FILTER (WHERE ${closed('s')}) AS active_days,
              SUM(s.flights_count)   FILTER (WHERE ${closed('s')}) AS flights,
              SUM(s.takeoff_count)   FILTER (WHERE ${closed('s')}) AS takeoffs,
              SUM(s.landing_count)   FILTER (WHERE ${closed('s')}) AS landings,
              SUM(s.block_ms)        FILTER (WHERE ${closed('s')}) AS block_ms,
              SUM(s.flight_ms)       FILTER (WHERE ${closed('s')}) AS flight_ms,
              SUM(s.fuel_added_l)    FILTER (WHERE ${closed('s')}) AS fuel_added_l,
              SUM(s.fuel_consumed_l) FILTER (WHERE ${closed('s')}) AS fuel_consumed_l,
              -- Ile ZAMKNIĘTYCH operacji zakresu NIE MA bilansu paliwa (wpis bez
              -- odczytu końcowego, zakończenie z panelu). Suma z dziurą podana jako
              -- prawda byłaby liczbą mniejszą od rzeczywistej - kontrakt oddaje wtedy
              -- brak, a to pole mówi ile.
              COUNT(s.session_uuid) FILTER (WHERE ${closed('s')} AND s.fuel_consumed_l IS NULL) AS fuel_unknown,
              SUM(s.oil_added_l)     FILTER (WHERE ${closed('s')}) AS oil_added_l,
              SUM(s.mh_delta_h)      FILTER (WHERE ${closed('s')}) AS mh_delta_h,
              -- Ostatnie wyłączenie silnika to FAKT, nie suma: liczy się także
              -- z operacji jeszcze niezdanej, bo śmigło naprawdę stanęło.
              MAX(s.engine_stop_at) AS last_engine_stop_at
         FROM aircraft a
         LEFT JOIN sessions s
           ON s.aircraft_id = a.id
          AND s.org_id = a.org_id
          -- Operacja UNIEWAŻNIONA nie liczy się do sum floty (issue #75 pkt 1):
          -- baner na ekranie operacji obiecuje „nie liczy się do sum dziennika",
          -- a do 2026-09-02 ten JOIN liczył ją jak każdą inną. Pusty zapis
          -- (zdanie bez biegu i bez zmian) odpada z tego samego powodu, co z list.
          -- Zakres, klub i oba wykluczenia to JEDEN napis wspólny z osią pilotów.
          AND ${inRange('$4')}
        -- Flota KLUBU: dziennik jest dokumentem jednego klubu (issue #99).
        WHERE a.org_id = $4
        GROUP BY a.id, a.reg, a.type, a.mh_format
        -- Alfabetycznie po znakach na kadłubie: pytanie brzmi „gdzie jest SP-KLM",
        -- nie „która maszyna wygrała". Jednostki poza służbą i tak wyróżnia panel.
        ORDER BY a.reg ASC`,
      [range.fromMs, range.toMs, DAY_MS, orgId],
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

  async byPilot(
    db: Queryable,
    orgId: string,
    range: { fromMs: number; toMs: number },
  ): Promise<{ pilots: LogPilotAggregate[]; idle: LogIdleMember[] }> {
    interface PilotRow {
      pilot_id: string;
      code: string | null;
      name: string | null;
      active: boolean | null;
      active_days: string;
      sessions: string;
      open_sessions: string;
      flights: string | null;
      block_ms: string | null;
      flight_ms: string | null;
      dual_sessions: string;
      dual_block_ms: string | null;
      regs: (string | null)[] | null;
      open_reg: string | null;
      open_claimed_at: string | null;
      open_engine_running: boolean | null;
    }
    const params = [range.fromMs, range.toMs, DAY_MS, orgId];

    // ZAŁOGA jako jeden wiersz na (osoba, operacja, fotel): dowódca każdej operacji
    // zakresu plus drugi pilot tam, gdzie był i nie jest tą samą osobą. `UNION ALL`,
    // nie `UNION` - to różne fotele, nie duplikaty. Reszta to agregaty kolumn
    // projekcji rozdzielone filtrem po fotelu (§7.1: sumujemy, nie odtwarzamy).
    const { rows } = await db.query<PilotRow>(
      `WITH crew AS (
         SELECT s.pic_id AS pilot_id, s.claim_time, s.aircraft_id, s.status,
                s.flights_count, s.block_ms, s.flight_ms, TRUE AS as_pic
           FROM sessions s
          WHERE ${inRange('$4')}
         UNION ALL
         SELECT s.dual_id, s.claim_time, s.aircraft_id, s.status,
                s.flights_count, s.block_ms, s.flight_ms, FALSE
           FROM sessions s
          WHERE ${inRange('$4')}
            AND s.dual_id IS NOT NULL
            AND s.dual_id <> s.pic_id
       )
       SELECT c.pilot_id,
              m.code                                                    AS code,
              pp.name                                                   AS name,
              (m.status = 'active')                                     AS active,
              -- SUMY = ZAMKNIĘTE (docblock), jak na osi maszyn; operacja w toku
              -- dowódcy jest policzona OSOBNO w open_sessions i nazwana sygnałem
              -- „teraz" (kolumny o.* niżej). DNI z jakimkolwiek lotem, w dowolnym fotelu
              -- (§17.1 pkt 1); doba z chwili PRZEJĘCIA, jak na osi maszyn.
              COUNT(DISTINCT (c.claim_time / $3)) FILTER (WHERE ${closed('c')})  AS active_days,
              COUNT(*)             FILTER (WHERE c.as_pic AND ${closed('c')})     AS sessions,
              COUNT(*)             FILTER (WHERE c.as_pic AND c.status = 'active') AS open_sessions,
              SUM(c.flights_count) FILTER (WHERE c.as_pic AND ${closed('c')})     AS flights,
              SUM(c.block_ms)      FILTER (WHERE c.as_pic AND ${closed('c')})     AS block_ms,
              SUM(c.flight_ms)     FILTER (WHERE c.as_pic AND ${closed('c')})     AS flight_ms,
              COUNT(*)             FILTER (WHERE NOT c.as_pic AND ${closed('c')}) AS dual_sessions,
              SUM(c.block_ms)      FILTER (WHERE NOT c.as_pic AND ${closed('c')}) AS dual_block_ms,
              -- Maszyny, na których osoba LATAŁA - z operacji zamkniętych; maszynę
              -- trzymaną teraz nazywa sygnał „teraz", nie ta lista.
              array_agg(DISTINCT a.reg ORDER BY a.reg) FILTER (WHERE ${closed('c')}) AS regs,
              o.reg                                                     AS open_reg,
              o.claim_time                                              AS open_claimed_at,
              o.engine_running                                          AS open_engine_running
         FROM crew c
         LEFT JOIN pilots      pp ON pp.id = c.pilot_id
         -- Kod Z CZŁONKOSTWA w klubie dziennika: osoba jest jedna, kod należy do klubu.
         LEFT JOIN memberships m  ON m.pilot_id = c.pilot_id AND m.org_id = $4
         LEFT JOIN aircraft    a  ON a.id = c.aircraft_id AND a.org_id = $4
         -- Operacja W TOKU tej osoby jako dowódcy - NIEZALEŻNIE od zakresu (mówi
         -- o teraz); przy kilku bierze się ostatnio przejętą.
         LEFT JOIN LATERAL (
           SELECT oa.reg,
                  os.claim_time,
                  (os.engine_start_at IS NOT NULL AND os.engine_stop_at IS NULL) AS engine_running
             FROM sessions os
             LEFT JOIN aircraft oa ON oa.id = os.aircraft_id AND oa.org_id = os.org_id
            WHERE os.org_id = $4
              AND os.pic_id = c.pilot_id
              AND os.status = 'active'
            ORDER BY os.claim_time DESC NULLS LAST, os.session_uuid DESC
            LIMIT 1
         ) o ON TRUE
        GROUP BY c.pilot_id, m.code, pp.name, m.status, o.reg, o.claim_time, o.engine_running
        -- Alfabetycznie po osobie: pytanie brzmi „gdzie jest Kowalski", nie „kto
        -- wylatał najwięcej" - ranking jest sprawą statystyk.
        ORDER BY pp.name ASC NULLS LAST, c.pilot_id ASC`,
      params,
    );

    // ZWINIĘCI: aktywni członkowie bez ani jednej operacji w zakresie, w dowolnym
    // fotelu. Wyłączeni nie liczą się (§17.1 pkt 3) - „kto nie latał" pyta o ludzi,
    // którzy mogli. `NOT EXISTS` z TYM SAMYM warunkiem zakresu, co lista latających,
    // więc obie listy są rozłączne i razem dają cały aktywny klub. Osoba z operacją
    // W TOKU w zakresie stoi na liście (zera w sumach, sygnał „leci teraz"), nie
    // wśród zwiniętych - zwinięcie mówi „nic się nie działo", a u niej się dzieje.
    const idle = await db.query<{ pilot_id: string; code: string; name: string }>(
      `SELECT m.pilot_id, m.code, pp.name
         FROM memberships m
         JOIN pilots pp ON pp.id = m.pilot_id
        WHERE m.org_id = $3
          AND m.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM sessions s
             WHERE ${inRange('$3')}
               AND (s.pic_id = m.pilot_id OR s.dual_id = m.pilot_id)
          )
        ORDER BY pp.name ASC, m.pilot_id ASC`,
      // Trzy parametry, nie cztery: Postgres odmawia zapytania z parametrem, którego
      // typu nie da się wywieść, a doby to zapytanie nie liczy.
      [range.fromMs, range.toMs, orgId],
    );

    return {
      pilots: rows.map((r) => {
        const dualSessions = int(r.dual_sessions);
        return {
          pilotId: r.pilot_id,
          code: r.code,
          name: r.name,
          active: r.active === true,
          activeDays: int(r.active_days),
          sessions: int(r.sessions),
          openSessions: int(r.open_sessions),
          flights: int(r.flights),
          blockMs: int(r.block_ms),
          flightMs: int(r.flight_ms),
          // Prawy fotel jako OSOBNA liczba; bez takiej operacji `null`, nie para zer.
          dual: dualSessions > 0 ? { operations: dualSessions, blockMs: int(r.dual_block_ms) } : null,
          regs: (r.regs ?? []).filter((reg): reg is string => reg != null),
          open:
            r.open_reg == null && r.open_claimed_at == null && r.open_engine_running == null
              ? null
              : {
                  reg: r.open_reg,
                  claimedAt: nullableInt(r.open_claimed_at),
                  engineRunning: r.open_engine_running === true,
                },
        };
      }),
      idle: idle.rows.map((r) => ({ pilotId: r.pilot_id, code: r.code, name: r.name })),
    };
  }
}
