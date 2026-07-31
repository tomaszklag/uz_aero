/**
 * UZ Aero (serwer) — adapter listy dni lotnych panelu (`SessionsAdminPort`, `A02`).
 *
 * Osobny adapter od `pg/sessionsProjection.ts` z tego samego powodu, co osobny port:
 * tamten obsługuje ZAPIS projekcji w gorącej transakcji ingestu (`upsert` + odczyty
 * punktowe), ten czyta listy ze złączeniami i kursorem. Ingest nie ma jak zregresować
 * od zmian w panelu.
 *
 * **Czego tu NIE MA i nie wolno dodać:** arytmetyki na kolumnach projekcji
 * (`SUM(mh_end - mh_start)`, `COUNT(*) FROM events WHERE type='takeoff'`). Wolno
 * AGREGOWAĆ wartości, które wyprodukowała projekcja; nie wolno ODTWARZAĆ projekcji
 * SQL-em — to drugie, równoległe wyliczenie, i to ono zaczyna kłamać
 * (`docs/architektura-panelu-serwer.md` §7.1). Nowa liczba w panelu = nowa kolumna
 * wypełniana przez `sessionRowFrom`.
 *
 * Podzapytania po `flags` i `export_log` nie łamią tej reguły: to inne tabele, czytane
 * wprost (typ flagi, numer rewizji), a nie liczby dnia policzone po raz drugi.
 */

import { isFlagType, type FlagType, type MhFormat } from '@uzaero/domain';

import type { Queryable } from '../../../application/ports.ts';
import type {
  AdminSessionJoin,
  SessionListFilter,
  SessionsAdminPort,
} from '../../../application/admin/ports.ts';
import { decodeCursor, encodeCursor, keysetOrderBy, keysetPredicate } from '../keyset.ts';
import { sessionColumns, toSessionRow, type SessionDbRow } from '../sessionDbRow.ts';
import { SqlFilter } from '../sqlFilter.ts';

/** Klucz porządku listy dni. `claim_time` jest NULL-owalne — stąd `NULLS LAST` i kursor. */
const KEY: readonly [string, string] = ['s.claim_time', 's.session_uuid'];

interface JoinedDbRow extends SessionDbRow {
  updated_at: string | Date;
  reg: string | null;
  aircraft_type: string | null;
  mh_format: string | null;
  pic_code: string | null;
  pic_name: string | null;
  dual_code: string | null;
  dual_name: string | null;
  open_flags: string[] | null;
  export_revision: number | null;
}

/**
 * Złączenia i pola wyliczone. `LEFT JOIN` wszędzie, bo rejestr zdarzeń jest starszy niż
 * klucze obce (zaległość audytu): sesja samolotu, który zniknął z `aircraft`, ma zostać
 * widoczna z pustą rejestracją, a nie wypaść z listy.
 */
const SELECT = `
  SELECT ${sessionColumns('s')},
         s.updated_at,
         a.reg                AS reg,
         a.type               AS aircraft_type,
         a.mh_format          AS mh_format,
         p.code               AS pic_code,
         p.name               AS pic_name,
         d.code               AS dual_code,
         d.name               AS dual_name,
         (SELECT array_agg(f.type ORDER BY f.id)
            FROM flags f
           WHERE f.status = 'open'
             AND s.session_uuid = ANY (f.session_uuids))          AS open_flags,
         (SELECT MAX(e.revision)
            FROM export_log e
           WHERE e.session_uuid = s.session_uuid)                 AS export_revision
    FROM sessions s
    LEFT JOIN aircraft a ON a.id = s.aircraft_id
    LEFT JOIN pilots   p ON p.id = s.pic_id
    LEFT JOIN pilots   d ON d.id = s.dual_id`;

const toMhFormat = (value: string | null): MhFormat | null =>
  value === 'decimal' || value === 'hhmm' ? value : null;

const toFlagTypes = (values: string[] | null): FlagType[] => {
  if (values == null) return [];
  // Ten sam strażnik i to samo uzasadnienie, co w adapterach flag: od migracji 8
  // pilnuje tego `CHECK`, więc wartość spoza katalogu znaczy ręczną ingerencję —
  // a ciche pominięcie flagi byłoby najgorszą z opcji, bo flaga istnieje po to,
  // żeby być widoczna.
  for (const value of values) {
    if (!isFlagType(value)) throw new Error(`Nieznany typ flagi w bazie: ${value}`);
  }
  return values as FlagType[];
};

const toJoin = (r: JoinedDbRow): AdminSessionJoin => ({
  row: toSessionRow(r),
  reg: r.reg,
  aircraftType: r.aircraft_type,
  mhFormat: toMhFormat(r.mh_format),
  picCode: r.pic_code,
  picName: r.pic_name,
  dualCode: r.dual_code,
  dualName: r.dual_name,
  openFlags: toFlagTypes(r.open_flags),
  exportRevision: r.export_revision,
  updatedAt: new Date(r.updated_at),
});

export class PgAdminSessionsRepo implements SessionsAdminPort {
  async list(
    db: Queryable,
    filter: SessionListFilter,
  ): Promise<{ items: AdminSessionJoin[]; nextCursor: string | null; total: number } | null> {
    const cursor = filter.cursor == null ? null : decodeCursor(filter.cursor, 'number');
    if (filter.cursor != null && cursor == null) return null;

    // Warunki BEZ kursora — te same jadą do `COUNT(*)`, żeby licznik „pokazano 50
    // z ~1 291" opisywał cały wynik filtra, a nie resztę po kursorze.
    const conditions = new SqlFilter();
    this.applyFilters(conditions, filter);

    const page = new SqlFilter();
    this.applyFilters(page, filter);
    keysetPredicate(KEY, cursor, page, { direction: filter.direction });

    // +1 wiersz ponad limit to cała detekcja „czy jest następna strona": pytanie
    // „czy coś jeszcze zostało" ma tę samą odpowiedź co „czy przyszło o jeden więcej",
    // a drugi `COUNT` na to nie odpowiada (mógłby się zmienić między zapytaniami).
    const limitParam = page.bind(filter.limit + 1);
    const { rows } = await db.query<JoinedDbRow>(
      `${SELECT} ${page.where()} ${keysetOrderBy(KEY, filter.direction)} LIMIT ${limitParam}`,
      page.params(),
    );

    const items = rows.slice(0, filter.limit).map(toJoin);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > filter.limit && last != null
        ? encodeCursor({ k1: last.row.claimTime, k2: last.row.sessionUuid })
        : null;

    // `COUNT` bez złączeń: żaden filtr nie sięga do `aircraft` ani `pilots`, więc
    // złączenia byłyby tu wyłącznie kosztem. Dokładne liczenie przy skali klubu jest
    // tanie — szacowania z `pg_class.reltuples` nie budujemy.
    const counted = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM sessions s ${conditions.where()}`,
      conditions.params(),
    );

    return { items, nextCursor, total: Number(counted.rows[0]?.n ?? 0) };
  }

  async byUuid(db: Queryable, sessionUuid: string): Promise<AdminSessionJoin | null> {
    const { rows } = await db.query<JoinedDbRow>(`${SELECT} WHERE s.session_uuid = $1`, [
      sessionUuid,
    ]);
    return rows[0] == null ? null : toJoin(rows[0]);
  }

  /**
   * Wszystkie filtry są OPCJONALNE i pomijane, gdy nieustawione — numerację `$n` nadaje
   * `SqlFilter`, żeby nie było jej w tym pliku wcale.
   *
   * Filtr zakresu dat działa na `claim_time`, czyli na duty starcie; sesja bez
   * `preflight_confirm` nie ma daty dnia i wypada z zakresu (zobaczy ją filtr stanu
   * albo lista bez dat). Domyślanie się daty z `close_time` byłoby zgadywaniem
   * w narzędziu, którego jedynym zadaniem jest nie zgadywać.
   */
  private applyFilters(filter: SqlFilter, f: SessionListFilter): void {
    filter.addOptional('s.claim_time >= ?', f.fromMs);
    filter.addOptional('s.claim_time <= ?', f.toMs);
    filter.addOptional('s.aircraft_id = ?', f.aircraftId);
    filter.addOptional('s.status = ?', f.status);
    filter.addOptional('s.operation = ?', f.operation);

    // Dzień szkolny należy do OBU członków załogi — pilot pytający o swoje dni
    // ma zobaczyć także te, w których siedział jako Dual.
    if (f.pilotId !== undefined) {
      filter.add('(s.pic_id = ? OR s.dual_id = ?)', f.pilotId, f.pilotId);
    }

    if (f.flagged !== undefined) {
      const exists = `EXISTS (SELECT 1 FROM flags f
                               WHERE f.status = 'open'
                                 AND s.session_uuid = ANY (f.session_uuids))`;
      filter.add(f.flagged ? exists : `NOT ${exists}`);
    }

    if (f.exported !== undefined) {
      const exists = `EXISTS (SELECT 1 FROM export_log e WHERE e.session_uuid = s.session_uuid)`;
      filter.add(f.exported ? exists : `NOT ${exists}`);
    }
  }
}
