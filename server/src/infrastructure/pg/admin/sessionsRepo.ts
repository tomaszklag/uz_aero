/**
 * Ninerdeck (serwer) - adapter listy dni lotnych panelu (`SessionsAdminPort`, `A02`).
 *
 * Osobny adapter od `pg/sessionsProjection.ts` z tego samego powodu, co osobny port:
 * tamten obsługuje ZAPIS projekcji w gorącej transakcji ingestu (`upsert` + odczyty
 * punktowe), ten czyta listy ze złączeniami i kursorem. Ingest nie ma jak zregresować
 * od zmian w panelu.
 *
 * **Czego tu NIE MA i nie wolno dodać:** arytmetyki na kolumnach projekcji
 * (`SUM(mh_end - mh_start)`, `COUNT(*) FROM events WHERE type='takeoff'`). Wolno
 * AGREGOWAĆ wartości, które wyprodukowała projekcja; nie wolno ODTWARZAĆ projekcji
 * SQL-em - to drugie, równoległe wyliczenie, i to ono zaczyna kłamać
 * (`docs/architektura-panelu-serwer.md` §7.1). Nowa liczba w panelu = nowa kolumna
 * wypełniana przez `sessionRowFrom`.
 *
 * Podzapytania po `flags` i `export_log` nie łamią tej reguły: to inne tabele, czytane
 * wprost (typ flagi, numer rewizji), a nie liczby dnia policzone po raz drugi.
 *
 * Nie łamie jej też `day_index` (issue #68), choć czyta `sessions`: to RANGA wiersza
 * wśród sąsiadów po kolumnach, które projekcja już policzyła - a nie te same liczby
 * wyprowadzone drugi raz ze strumienia. Kolumny wypełnianej przy zapisie być tu nie
 * może, bo ingest widzi JEDNĄ operację, a numer zależy od pozostałych operacji doby.
 */

import { isFlagType, type MhFormat } from '@ninerdeck/domain';

import type { Queryable } from '../../../application/common/ports.ts';
import type { AdminOpenFlag } from '../../../application/admin/contracts/flags.ts';
import type {
  AdminSessionDayAggregate,
  AdminSessionJoin,
  SessionListFilter,
  SessionsAdminPort,
} from '../../../application/admin/ports.ts';
import {
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetPredicate,
  type CursorShape,
  type KeysetDirection,
} from '../keyset.ts';
import { sessionColumns, toSessionRow, type SessionDbRow } from '../sessionDbRow.ts';
import { SqlFilter } from '../sqlFilter.ts';
import { anchorSql, dayIndexSql, emptySessionSql } from '../substanceSql.ts';

/** Klucz porządku listy dni. `claim_time` jest NULL-owalne - stąd `NULLS LAST` i kursor. */
const KEY: readonly [string, string] = ['s.claim_time', 's.session_uuid'];

/** Doba UTC w ms - dzielnik numeru doby w sumach dób (`claim_time / 86400000`). */
const DAY_MS = 86_400_000;

interface DayDbRow {
  day_index: string;
  operations: string;
  flights: string | null;
  block_ms: string | null;
  flight_ms: string | null;
  in_progress: string;
  dual_operations: string | null;
  dual_block_ms: string | null;
}

const int = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

const toDay = (r: DayDbRow, withDual: boolean): AdminSessionDayAggregate => {
  const dualOperations = int(r.dual_operations);
  return {
    // Numer doby (`BIGINT` → tekst) z powrotem na dzień UTC - tak samo, jak robi to
    // warstwa aplikacji przy szeregu dziennym statystyk.
    day: new Date(Number(r.day_index) * DAY_MS).toISOString().slice(0, 10),
    operations: int(r.operations),
    flights: int(r.flights),
    blockMs: int(r.block_ms),
    flightMs: int(r.flight_ms),
    inProgress: int(r.in_progress),
    // Piąta suma nie rysuje się z zera (§17.1): bez filtra pilota i bez lotu w prawym
    // fotelu pole jest `null`, nie parą zer.
    dual: withDual && dualOperations > 0 ? { operations: dualOperations, blockMs: int(r.dual_block_ms) } : null,
  };
};

/**
 * Kształt kursora listy dni: `claim_time` to `BIGINT` z epoką w ms (NULL-owalny -
 * sesja bez przejęcia nie ma daty), a tie-breakerem jest `session_uuid`, czyli
 * zwykły tekst. Jeden obiekt dla dekodowania i dla predykatu, żeby deklaracja klucza
 * była w tym pliku jedna.
 */
const shapeOf = (direction: KeysetDirection): CursorShape => ({
  k1: 'number',
  k1Nullable: true,
  k2: 'string',
  direction,
});

interface JoinedDbRow extends SessionDbRow {
  updated_at: string | Date;
  day_index: string | null;
  signature_at: string | null;
  reg: string | null;
  aircraft_type: string | null;
  mh_format: string | null;
  pic_code: string | null;
  pic_name: string | null;
  dual_code: string | null;
  dual_name: string | null;
  open_flags: { id: number; type: string; details: Record<string, unknown> }[] | null;
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
         -- NUMER OPERACJI W DOBIE PILOTA - ostatni człon sygnatury (issue #68).
         --
         -- Nie łamie reguły §7.1: to RANGA po kolumnach projekcji, nie odtworzenie
         -- projekcji ze strumienia. Nie da się jej też wypełnić przy zapisie, bo numer
         -- jest miejscem wiersza wśród SĄSIADÓW, a ingest widzi jedną operację.
         --
         -- Reguła musi zgadzać się co do znaku z operationIndexes (@ninerdeck/domain),
         -- bo telefon liczy ten sam numer u siebie, offline. Stąd te same warunki:
         -- ten sam pilot, bez unieważnionych, wyłącznie operacje z KOTWICĄ
         -- (issue #75: uruchomienie silnika, a bez biegu - przejęcie zapisu zdanego
         -- z treścią; wyrażenie w substanceSql.ts, lustro operationAnchor). Doba
         -- i kolejność biorą się z kotwicy. Remis rozstrzyga session_uuid -
         -- w domenie z tego samego powodu, czyli dla determinizmu. Wyrażenie stoi
         -- w substanceSql.ts (dayIndexSql), bo od 3.2.0 pisze je też monitor kart dnia.
         ${dayIndexSql('s')}  AS day_index,
         -- Kotwica numeracji - z niej mapper bierze DOBĘ sygnatury. Liczona TYM SAMYM
         -- wyrażeniem, co ranga wyżej, żeby mapper nie odtwarzał reguły po swojemu.
         ${anchorSql('s')}    AS signature_at,
         a.reg                AS reg,
         a.type               AS aircraft_type,
         a.mh_format          AS mh_format,
         -- Kod pilota Z CZŁONKOSTWA w klubie TEJ operacji (wielofirmowość): osoba jest
         -- jedna, kod należy do klubu. Nazwisko zostaje własnością osoby.
         p.code               AS pic_code,
         pp.name              AS pic_name,
         d.code               AS dual_code,
         dp.name              AS dual_name,
         -- Klub POWTARZA SIĘ w każdym podzapytaniu i w każdym złączeniu (issue #99 C4).
         -- Uuid operacji jest dziś kluczem głównym, więc formalnie wystarczyłby on sam -
         -- ale wtedy izolacja klubów wisi na globalnej jedyności identyfikatora
         -- nadawanego przez TELEFON. Jawny predykat kosztuje jedną linijkę i nie
         -- zależy od tego, kto nadaje uuidy.
         -- OTWARTE FLAGI z liczbami rozjazdu (3.2.0, P-D): wiersz poziomu 2 stawia
         -- plakietkę z polską nazwą i podpis („przekazano 92 L"), więc sam typ nie
         -- wystarcza - jedzie identyfikator (link do sprawy) i liczby z ingestu (details).
         (SELECT jsonb_agg(jsonb_build_object('id', f.id, 'type', f.type, 'details', f.details)
                           ORDER BY f.id)
            FROM flags f
           WHERE f.org_id = s.org_id
             AND f.status = 'open'
             AND s.session_uuid = ANY (f.session_uuids))          AS open_flags,
         (SELECT MAX(e.revision)
            FROM export_log e
           WHERE e.org_id = s.org_id
             AND e.session_uuid = s.session_uuid)                 AS export_revision
    FROM sessions s
    LEFT JOIN aircraft    a  ON a.id = s.aircraft_id AND a.org_id = s.org_id
    LEFT JOIN pilots      pp ON pp.id = s.pic_id
    LEFT JOIN memberships p  ON p.pilot_id = s.pic_id AND p.org_id = s.org_id
    LEFT JOIN pilots      dp ON dp.id = s.dual_id
    LEFT JOIN memberships d  ON d.pilot_id = s.dual_id AND d.org_id = s.org_id`;

const toMhFormat = (value: string | null): MhFormat | null =>
  value === 'decimal' || value === 'hhmm' ? value : null;

const toOpenFlags = (
  values: { id: number; type: string; details: Record<string, unknown> }[] | null,
): AdminOpenFlag[] => {
  if (values == null) return [];
  // Ten sam strażnik i to samo uzasadnienie, co w adapterach flag: od wprowadzenia `flags_type_known`
  // pilnuje tego `CHECK`, więc wartość spoza katalogu znaczy ręczną ingerencję -
  // a ciche pominięcie flagi byłoby najgorszą z opcji, bo flaga istnieje po to,
  // żeby być widoczna.
  return values.map((value) => {
    if (!isFlagType(value.type)) throw new Error(`Nieznany typ flagi w bazie: ${value.type}`);
    return { id: value.id, type: value.type, details: value.details };
  });
};

const toJoin = (r: JoinedDbRow): AdminSessionJoin => ({
  row: toSessionRow(r),
  // `COUNT` wraca z Postgresa jako BIGINT, czyli tekst - jak reszta liczników tego pliku.
  dayIndex: r.day_index == null ? null : Number(r.day_index),
  signatureAt: r.signature_at == null ? null : Number(r.signature_at),
  reg: r.reg,
  aircraftType: r.aircraft_type,
  mhFormat: toMhFormat(r.mh_format),
  picCode: r.pic_code,
  picName: r.pic_name,
  dualCode: r.dual_code,
  dualName: r.dual_name,
  openFlags: toOpenFlags(r.open_flags),
  exportRevision: r.export_revision,
  updatedAt: new Date(r.updated_at),
});

export class PgAdminSessionsRepo implements SessionsAdminPort {
  async list(
    db: Queryable,
    orgId: string,
    filter: SessionListFilter,
  ): Promise<{
    items: AdminSessionJoin[];
    nextCursor: string | null;
    total: number;
    days: AdminSessionDayAggregate[];
  } | null> {
    const shape = shapeOf(filter.direction);
    const cursor = filter.cursor == null ? null : decodeCursor(filter.cursor, shape);
    if (filter.cursor != null && cursor == null) return null;

    // Warunki BEZ kursora - te same jadą do `COUNT(*)`, żeby licznik „pokazano 50
    // z ~1 291" opisywał cały wynik filtra, a nie resztę po kursorze. Klub stoi
    // w obu jako PIERWSZY warunek - nie jest polem filtra, którego mogłoby nie być.
    const conditions = new SqlFilter();
    conditions.add('s.org_id = ?', orgId);
    this.applyFilters(conditions, filter);

    const page = new SqlFilter();
    page.add('s.org_id = ?', orgId);
    this.applyFilters(page, filter);
    keysetPredicate(KEY, cursor, page, shape);

    // +1 wiersz ponad limit to cała detekcja „czy jest następna strona": pytanie
    // „czy coś jeszcze zostało" ma tę samą odpowiedź co „czy przyszło o jeden więcej",
    // a drugi `COUNT` na to nie odpowiada (mógłby się zmienić między zapytaniami).
    const limitParam = page.bind(filter.limit + 1);
    const { rows } = await db.query<JoinedDbRow>(
      `${SELECT} ${page.where()} ${keysetOrderBy(KEY, shape)} LIMIT ${limitParam}`,
      page.params(),
    );

    const items = rows.slice(0, filter.limit).map(toJoin);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > filter.limit && last != null
        ? encodeCursor({ k1: last.row.claimTime, k2: last.row.sessionUuid }, shape)
        : null;

    // `COUNT` bez złączeń: żaden filtr nie sięga do `aircraft` ani `pilots`, więc
    // złączenia byłyby tu wyłącznie kosztem. Dokładne liczenie przy skali klubu jest
    // tanie - szacowania z `pg_class.reltuples` nie budujemy.
    const counted = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM sessions s ${conditions.where()}`,
      conditions.params(),
    );

    const days = await this.days(db, orgId, filter);

    return { items, nextCursor, total: Number(counted.rows[0]?.n ?? 0), days };
  }

  /**
   * SUMY DÓB nad CAŁYM wynikiem filtra (3.2.0, §4.4) - bez kursora, bo strona potrafi
   * rozciąć dobę, a suma połowy doby wyglądałaby poprawnie. Te same warunki, co
   * licznik `total`, plus wymóg daty: operacja bez przejęcia nie ma doby i nie ma
   * czego sumować (na liście jest, w nagłówku doby nie).
   *
   * Z filtrem pilota sumy dowódcy liczą wyłącznie operacje, w których pilot BYŁ
   * dowódcą (filtr listy dopasowuje też Duala - tamte wiersze są na liście, ale
   * w OSOBNEJ sumie prawego fotela). Agregaty kolumn projekcji, ani jednej nowej liczby.
   */
  private async days(
    db: Queryable,
    orgId: string,
    f: SessionListFilter,
  ): Promise<AdminSessionDayAggregate[]> {
    const days = new SqlFilter();
    days.add('s.org_id = ?', orgId);
    this.applyFilters(days, f);
    days.add('s.claim_time IS NOT NULL');
    const dayMs = days.bind(DAY_MS);
    const pic = f.pilotId === undefined ? null : days.bind(f.pilotId);
    const closed = pic == null ? `s.status = 'closed'` : `s.status = 'closed' AND s.pic_id = ${pic}`;
    const asDual =
      pic == null ? null : `s.status = 'closed' AND s.dual_id = ${pic} AND s.pic_id <> ${pic}`;

    const { rows } = await db.query<DayDbRow>(
      `SELECT s.claim_time / ${dayMs}                                    AS day_index,
              COUNT(*) FILTER (WHERE ${closed})                           AS operations,
              SUM(s.flights_count) FILTER (WHERE ${closed})               AS flights,
              SUM(s.block_ms) FILTER (WHERE ${closed})                    AS block_ms,
              SUM(s.flight_ms) FILTER (WHERE ${closed})                   AS flight_ms,
              COUNT(*) FILTER (WHERE s.status = 'active')                 AS in_progress,
              ${
                asDual == null
                  ? 'NULL AS dual_operations, NULL AS dual_block_ms'
                  : `COUNT(*) FILTER (WHERE ${asDual})          AS dual_operations,
                     SUM(s.block_ms) FILTER (WHERE ${asDual})   AS dual_block_ms`
              }
         FROM sessions s
         ${days.where()}
        GROUP BY 1
        ORDER BY 1 ${f.direction === 'asc' ? 'ASC' : 'DESC'}`,
      days.params(),
    );

    return rows.map((r) => toDay(r, pic != null));
  }

  async byUuid(db: Queryable, orgId: string, sessionUuid: string): Promise<AdminSessionJoin | null> {
    const { rows } = await db.query<JoinedDbRow>(
      `${SELECT} WHERE s.org_id = $1 AND s.session_uuid = $2`,
      [orgId, sessionUuid],
    );
    return rows[0] == null ? null : toJoin(rows[0]);
  }

  /**
   * Operacje objęte FLAGAMI (3.2.0, P-D) - jednym zapytaniem dla całej skrzynki, bo
   * skrzynka ma do stu spraw po dwie operacje i sto wołań `byUuid` byłoby dwustoma
   * zapytaniami na jedno otwarcie ekranu. Klub w warunku, jak wszędzie: cudza operacja
   * o tym samym uuid-zie (nadaje go TELEFON) po prostu nie wraca.
   */
  async byUuids(db: Queryable, orgId: string, sessionUuids: readonly string[]): Promise<AdminSessionJoin[]> {
    if (sessionUuids.length === 0) return [];
    const { rows } = await db.query<JoinedDbRow>(
      `${SELECT} WHERE s.org_id = $1 AND s.session_uuid = ANY ($2)`,
      [orgId, [...sessionUuids]],
    );
    return rows.map(toJoin);
  }

  /**
   * Wszystkie filtry są OPCJONALNE i pomijane, gdy nieustawione - numerację `$n` nadaje
   * `SqlFilter`, żeby nie było jej w tym pliku wcale.
   *
   * Filtr zakresu dat działa na `claim_time`, czyli na czasie przejęcia; sesja bez
   * `preflight_confirm` nie ma daty dnia i wypada z zakresu (zobaczy ją filtr stanu
   * albo lista bez dat). Domyślanie się daty z `close_time` byłoby zgadywaniem
   * w narzędziu, którego jedynym zadaniem jest nie zgadywać.
   */
  private applyFilters(filter: SqlFilter, f: SessionListFilter): void {
    /* PUSTY ZAPIS NIE WCHODZI NA ŻADNĄ LISTĘ (issue #75 pkt 2): zdanie bez biegu,
       lotów i zmian odczytów to śmieć, nie operacja - słowa właściciela. Filtr stoi
       w applyFilters, więc obejmuje i stronę, i licznik `COUNT`. Adres bezpośredni
       (`byUuid`) NIE filtruje: rejestr ma widzieć wszystko, jak przy unieważnieniu. */
    filter.add(`NOT ${emptySessionSql('s')}`);
    filter.addOptional('s.claim_time >= ?', f.fromMs);
    filter.addOptional('s.claim_time <= ?', f.toMs);
    filter.addOptional('s.aircraft_id = ?', f.aircraftId);
    filter.addOptional('s.status = ?', f.status);
    filter.addOptional('s.operation = ?', f.operation);

    // Dzień szkolny należy do OBU członków załogi - pilot pytający o swoje dni
    // ma zobaczyć także te, w których siedział jako Dual.
    if (f.pilotId !== undefined) {
      filter.add('(s.pic_id = ? OR s.dual_id = ?)', f.pilotId, f.pilotId);
    }

    // Oba podzapytania niosą klub, choć zewnętrzne `WHERE` zawęziło już `s` do jednego
    // (issue #99 C4): `NOT EXISTS` odwraca sens: bez predykatu cudza flaga na operacji
    // o tym samym uuidzie wypychałaby WŁASNĄ operację z listy „bez uwag".
    if (f.flagged !== undefined) {
      const exists = `EXISTS (SELECT 1 FROM flags f
                               WHERE f.org_id = s.org_id
                                 AND f.status = 'open'
                                 AND s.session_uuid = ANY (f.session_uuids))`;
      filter.add(f.flagged ? exists : `NOT ${exists}`);
    }

    if (f.exported !== undefined) {
      const exists = `EXISTS (SELECT 1 FROM export_log e
                               WHERE e.org_id = s.org_id AND e.session_uuid = s.session_uuid)`;
      filter.add(f.exported ? exists : `NOT ${exists}`);
    }
  }
}
