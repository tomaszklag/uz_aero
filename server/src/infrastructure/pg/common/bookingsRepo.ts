/**
 * Ninerdeck (serwer) - adapter tabeli `bookings` (zajętość maszyny: rezerwacje pilotów
 * i wyłączenia z użytku; migracja 11, issue #158 B4).
 *
 * W `common/`, bo czytelnicy są po obu stronach systemu: kalendarz w aplikacji pilota
 * i moduł kalendarza w panelu. Reguły „kto co może" siedzą w `domain/bookings.ts`,
 * tutaj jest wyłącznie SQL.
 *
 * ══ NAKŁADANIE ODBIJA BAZA, A TEN PLIK TŁUMACZY JEJ ODMOWĘ ══
 * `bookings_no_overlap` to ograniczenie wykluczające (`EXCLUDE USING gist`), więc przy
 * kolizji Postgres rzuca wyjątkiem `23P01`. Adapter zamienia go na `{ ok: false }`
 * i DOCIĄGA kolidujący wiersz - ekran ma powiedzieć, CO stoi w tym czasie, a nie samo
 * „nie da się" (§5.1). Sprawdzenie nakładania PRZED zapisem byłoby czymś innym i gorszym:
 * dwa równoczesne zapisy przeczytałyby wolny slot, zanim którykolwiek zdążył go zająć.
 *
 * ══ ZAPIS IDZIE W PUNKCIE ZAPISU (`SAVEPOINT`) I TO NIE JEST OSTROŻNOŚĆ ══
 * Odmowa ograniczenia UNIEWAŻNIA CAŁĄ TRANSAKCJĘ: każde następne zapytanie w niej
 * dostaje „current transaction is aborted". A my chcemy zaraz po odmowie zapytać,
 * CO stoi w tym czasie - i, w panelu, dopisać ślad audytu tą samą transakcją.
 * Punkt zapisu cofa wyłącznie nieudany `INSERT`, zostawiając transakcję żywą.
 *
 * ══ KLUB W KAŻDYM PREDYKACIE ══
 * `org_id` jest ARGUMENTEM metody i stoi jako PIERWSZY warunek (epik C wielofirmowości).
 * Wyjątkiem jest `due()` - zadanie okresowe przemiata cały serwer i nie działa w imieniu
 * żadnego klubu, więc go nie ZAWĘŻA. Klub każdego kandydata mimo to CZYTA i oddaje
 * wołającemu (`BookingDue.orgId`), bo zapis zwolnienia musi wrócić we właściwy - i to
 * jest powód, dla którego strażnik `org_id` przepuszcza tę metodę bez imiennego wyjątku.
 */

import type {
  BookingDue,
  BookingPatch,
  BookingQuery,
  BookingRecord,
  BookingWrite,
  BookingsPort,
  NewBooking,
  Queryable,
} from '../../../application/common/ports.ts';
import { SLOT_HOLDING_STATUSES, type BookingKind, type BookingStatus } from '../../../domain/bookings.ts';

interface BookingDbRow {
  id: string;
  aircraft_id: string;
  kind: string;
  status: string;
  starts_at: string | Date;
  ends_at: string | Date;
  pilot_id: string | null;
  dual_id: string | null;
  operation: string | null;
  from_icao: string | null;
  to_icao: string | null;
  planned_air_min: number | string | null;
  /** `REAL` - PGlite bywa napisem; `Number` domyka oba sterowniki. */
  planned_fuel_l: number | string | null;
  session_uuid: string | null;
  block_reason: string | null;
  note: string | null;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
  closed_at: string | Date | null;
  close_reason: string | null;
}

const COLUMNS = `
  id, aircraft_id, kind, status, starts_at, ends_at, pilot_id, dual_id, operation,
  from_icao, to_icao, planned_air_min, planned_fuel_l, session_uuid, block_reason,
  note, created_by, created_at, updated_at, closed_at, close_reason
`;

/** Lista stanów trzymających slot w postaci gotowej do `IN (...)` - jedno źródło z domeną. */
const HOLDING = SLOT_HOLDING_STATUSES.map((s) => `'${s}'`).join(', ');

/** Nazwa punktu zapisu - jedna, bo nigdy nie zagnieżdżamy tych zapisów. */
const SAVEPOINT = 'booking_write';

const ms = (value: string | Date): number => new Date(value).getTime();

const toRecord = (r: BookingDbRow): BookingRecord => ({
  id: r.id,
  aircraftId: r.aircraft_id,
  kind: r.kind as BookingKind,
  status: r.status as BookingStatus,
  startsAt: ms(r.starts_at),
  endsAt: ms(r.ends_at),
  pilotId: r.pilot_id,
  dualId: r.dual_id,
  operation: r.operation,
  fromIcao: r.from_icao,
  toIcao: r.to_icao,
  plannedAirMin: r.planned_air_min == null ? null : Number(r.planned_air_min),
  plannedFuelL: r.planned_fuel_l == null ? null : Number(r.planned_fuel_l),
  sessionUuid: r.session_uuid,
  blockReason: r.block_reason,
  note: r.note,
  createdBy: r.created_by,
  createdAt: ms(r.created_at),
  updatedAt: ms(r.updated_at),
  closedAt: r.closed_at == null ? null : ms(r.closed_at),
  closeReason: r.close_reason,
});

/**
 * Czy to odmowa ograniczenia wykluczającego. Kod `23P01` = `exclusion_violation`;
 * nazwę ograniczenia sprawdzamy dodatkowo, bo w tej tabeli może kiedyś stanąć drugie,
 * a wtedy „termin zajęty" byłoby złą odpowiedzią na całkiem inny problem.
 */
function isOverlapConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown };
  if (e.code !== '23P01') return false;
  const where = [e.constraint, e.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return where.includes('bookings_no_overlap');
}

export class PgBookingsRepo implements BookingsPort {
  async list(db: Queryable, orgId: string, query: BookingQuery): Promise<BookingRecord[]> {
    const params: unknown[] = [orgId, new Date(query.from), new Date(query.to)];
    // Nakładanie na okno, nie zawieranie się w nim: rezerwacja zaczęta wczoraj wieczorem
    // też stoi na dzisiejszej siatce. Granice półotwarte, jak w ograniczeniu bazy.
    let sql = `SELECT ${COLUMNS} FROM bookings
                WHERE org_id = $1 AND starts_at < $3 AND ends_at > $2`;
    if (query.aircraftId != null) {
      params.push(query.aircraftId);
      sql += ` AND aircraft_id = $${params.length}`;
    }
    if (query.includeClosed !== true) sql += ` AND status IN (${HOLDING})`;
    sql += ' ORDER BY starts_at, aircraft_id';
    const { rows } = await db.query<BookingDbRow>(sql, params);
    return rows.map(toRecord);
  }

  async byId(db: Queryable, orgId: string, id: string): Promise<BookingRecord | null> {
    const { rows } = await db.query<BookingDbRow>(
      `SELECT ${COLUMNS} FROM bookings WHERE org_id = $1 AND id = $2`,
      [orgId, id],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async pending(db: Queryable, orgId: string): Promise<BookingRecord[]> {
    // `kind = 'flight'` jest tu REGUŁĄ, nie filtrem wygody: wyłączenie maszyny z użytku
    // nie ma ścieżki i nie może czekać na niczyją zgodę (§11) - a `pending` na takim
    // wierszu i tak nie ma jak powstać. Najstarsze pierwsze, bo kolejka ma pokazać na
    // górze to, co jest najbliżej wygaśnięcia.
    const { rows } = await db.query<BookingDbRow>(
      `SELECT ${COLUMNS} FROM bookings
        WHERE org_id = $1 AND kind = 'flight' AND status = 'pending'
        ORDER BY created_at, id`,
      [orgId],
    );
    return rows.map(toRecord);
  }

  /**
   * Zapis idempotentny po uuidzie klienta: `ON CONFLICT DO NOTHING` nic nie oddaje,
   * więc wiersz dociągamy osobno i mówimy `created: false`. Powtórzony `POST` z terenu
   * ma wrócić TYM SAMYM terminem, a nie drugim.
   */
  async insert(tx: Queryable, orgId: string, draft: NewBooking): Promise<BookingWrite> {
    await tx.query(`SAVEPOINT ${SAVEPOINT}`);
    try {
      const { rows } = await tx.query<BookingDbRow>(
        `INSERT INTO bookings (
           id, org_id, aircraft_id, kind, status, starts_at, ends_at, pilot_id, dual_id,
           operation, from_icao, to_icao, planned_air_min, planned_fuel_l, block_reason,
           note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (id) DO NOTHING
         RETURNING ${COLUMNS}`,
        [
          draft.id,
          orgId,
          draft.aircraftId,
          draft.kind,
          draft.status,
          new Date(draft.startsAt),
          new Date(draft.endsAt),
          draft.pilotId,
          draft.dualId,
          draft.operation,
          draft.fromIcao,
          draft.toIcao,
          draft.plannedAirMin,
          draft.plannedFuelL,
          draft.blockReason,
          draft.note,
          draft.createdBy,
        ],
      );
      if (rows[0] != null) return { ok: true, booking: toRecord(rows[0]), created: true };

      const existing = await this.byId(tx, orgId, draft.id);
      // Wiersz o tym uuidzie stoi w INNYM klubie - dla tego tokenu nie istnieje, więc
      // odpowiadamy jak na zajęty termin bez wskazania czym (`taken: null`).
      if (existing == null) return { ok: false, taken: null };
      return { ok: true, booking: existing, created: false };
    } catch (err) {
      if (!isOverlapConflict(err)) throw err;
      await tx.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      return { ok: false, taken: await this.colliding(tx, orgId, draft) };
    }
  }

  async update(
    tx: Queryable,
    orgId: string,
    id: string,
    patch: BookingPatch,
  ): Promise<BookingWrite | null> {
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [orgId, id];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (patch.startsAt !== undefined) set('starts_at', new Date(patch.startsAt));
    if (patch.endsAt !== undefined) set('ends_at', new Date(patch.endsAt));
    if (patch.dualId !== undefined) set('dual_id', patch.dualId);
    if (patch.operation !== undefined) set('operation', patch.operation);
    if (patch.fromIcao !== undefined) set('from_icao', patch.fromIcao);
    if (patch.toIcao !== undefined) set('to_icao', patch.toIcao);
    if (patch.plannedAirMin !== undefined) set('planned_air_min', patch.plannedAirMin);
    if (patch.plannedFuelL !== undefined) set('planned_fuel_l', patch.plannedFuelL);
    if (patch.blockReason !== undefined) set('block_reason', patch.blockReason);
    if (patch.note !== undefined) set('note', patch.note);

    await tx.query(`SAVEPOINT ${SAVEPOINT}`);
    try {
      const { rows } = await tx.query<BookingDbRow>(
        `UPDATE bookings SET ${sets.join(', ')}
          WHERE org_id = $1 AND id = $2
          RETURNING ${COLUMNS}`,
        params,
      );
      if (rows[0] == null) return null;
      return { ok: true, booking: toRecord(rows[0]), created: false };
    } catch (err) {
      if (!isOverlapConflict(err)) throw err;
      await tx.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      const current = await this.byId(tx, orgId, id);
      if (current == null) return null;
      return {
        ok: false,
        taken: await this.colliding(tx, orgId, {
          id,
          aircraftId: current.aircraftId,
          startsAt: patch.startsAt ?? current.startsAt,
          endsAt: patch.endsAt ?? current.endsAt,
        }),
      };
    }
  }

  async close(
    tx: Queryable,
    orgId: string,
    id: string,
    change: { status: BookingStatus; at: Date; reason: string | null },
  ): Promise<BookingRecord | null> {
    const { rows } = await tx.query<BookingDbRow>(
      `UPDATE bookings
          SET status = $3, closed_at = $4, close_reason = $5, updated_at = $4
        WHERE org_id = $1 AND id = $2 AND status IN (${HOLDING})
        RETURNING ${COLUMNS}`,
      [orgId, id, change.status, change.at, change.reason],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async confirm(
    tx: Queryable,
    orgId: string,
    id: string,
    at: Date,
  ): Promise<BookingRecord | null> {
    // `status = 'pending'` w warunku, a nie sprawdzenie przed zapisem: między odczytem
    // a zapisem mieści się odwołanie pilota i decyzja panelu, a `null` jest wtedy tą
    // samą odpowiedzią co „nie ma czego potwierdzać".
    const { rows } = await tx.query<BookingDbRow>(
      `UPDATE bookings
          SET status = 'confirmed', updated_at = $3
        WHERE org_id = $1 AND id = $2 AND status = 'pending'
        RETURNING ${COLUMNS}`,
      [orgId, id, at],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async reopen(
    tx: Queryable,
    orgId: string,
    id: string,
    at: Date,
  ): Promise<BookingRecord | null> {
    // Ten sam warunek w SQL-u, co przy `confirm`: między odczytem a zapisem ktoś mógł
    // odwołać rezerwację, a wtedy wracamy `null` zamiast wskrzeszać wiersz zamknięty.
    const { rows } = await tx.query<BookingDbRow>(
      `UPDATE bookings
          SET status = 'pending', updated_at = $3
        WHERE org_id = $1 AND id = $2 AND status IN (${HOLDING})
        RETURNING ${COLUMNS}`,
      [orgId, id, at],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }

  async fulfil(
    tx: Queryable,
    orgId: string,
    id: string,
    sessionUuid: string,
    at: Date,
  ): Promise<boolean> {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE bookings
          SET status = 'fulfilled', session_uuid = $3, updated_at = $4
        WHERE org_id = $1 AND id = $2 AND status IN (${HOLDING})
        RETURNING id`,
      [orgId, id, sessionUuid, at],
    );
    return rows.length > 0;
  }

  async due(
    db: Queryable,
    window: { startedBefore: Date; endsAfter: Date },
  ): Promise<BookingDue[]> {
    const { rows } = await db.query<{
      id: string;
      org_id: string;
      aircraft_id: string;
      starts_at: string | Date;
    }>(
      `SELECT id, org_id, aircraft_id, starts_at
         FROM bookings
        WHERE kind = 'flight' AND status = 'confirmed'
          AND starts_at < $1 AND ends_at > $2
        ORDER BY starts_at`,
      [window.startedBefore, window.endsAfter],
    );
    return rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      aircraftId: r.aircraft_id,
      startsAt: ms(r.starts_at),
    }));
  }

  async undecided(db: Queryable, startedBefore: Date): Promise<BookingDue[]> {
    const { rows } = await db.query<{
      id: string;
      org_id: string;
      aircraft_id: string;
      starts_at: string | Date;
    }>(
      `SELECT id, org_id, aircraft_id, starts_at
         FROM bookings
        WHERE kind = 'flight' AND status = 'pending' AND starts_at <= $1
        ORDER BY starts_at`,
      [startedBefore],
    );
    return rows.map((r) => ({
      id: r.id,
      orgId: r.org_id,
      aircraftId: r.aircraft_id,
      startsAt: ms(r.starts_at),
    }));
  }

  async latestChangeAt(db: Queryable, orgId: string): Promise<number | null> {
    const { rows } = await db.query<{ at: string | Date | null }>(
      'SELECT MAX(updated_at) AS at FROM bookings WHERE org_id = $1',
      [orgId],
    );
    const at = rows[0]?.at;
    return at == null ? null : ms(at);
  }

  /**
   * Co stoi w tym czasie. Pytamy DOPIERO po odmowie bazy, więc nie ma tu wyścigu:
   * ograniczenie już orzekło, a to jest wyłącznie dociągnięcie nazwy dla ekranu.
   * Wynik bywa `null`, gdy kolizja zniknęła między odmową a tym zapytaniem - odpowiedź
   * „termin zajęty" zostaje wtedy bez wskazania czym, zamiast zmyślać.
   */
  private async colliding(
    db: Queryable,
    orgId: string,
    window: { id: string; aircraftId: string; startsAt: number; endsAt: number },
  ): Promise<BookingRecord | null> {
    const { rows } = await db.query<BookingDbRow>(
      `SELECT ${COLUMNS} FROM bookings
        WHERE org_id = $1 AND aircraft_id = $2 AND id <> $3
          AND status IN (${HOLDING}) AND starts_at < $5 AND ends_at > $4
        ORDER BY starts_at
        LIMIT 1`,
      [orgId, window.aircraftId, window.id, new Date(window.startsAt), new Date(window.endsAt)],
    );
    return rows[0] == null ? null : toRecord(rows[0]);
  }
}
