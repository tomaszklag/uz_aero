/**
 * UZ Aero (serwer) — adapter ODCZYTU dziennika audytu (`AdminAuditReadPort`, `A09`).
 *
 * Osobny plik od `auditRepo.ts` z tego samego powodu, dla którego port jest osobny:
 * tamten ma jedną metodę i jeden `INSERT`, wołany z wnętrza `AuditedWrite` w gorącej
 * transakcji skutku. Ten czyta listy ze złączeniem, filtrami i kursorem. Brama zapisu
 * nie ma jak zregresować od zmian w liście.
 *
 * ══ NIEZNANY KOD AKCJI NIE MA PRAWA WYWRÓCIĆ ODCZYTU ══
 * W adapterach flag i operacji stoi strażnik, który RZUCA na wartości spoza katalogu —
 * bo tam wartość jest bytem żywym, pilnowanym `CHECK`-iem w bazie (migracje 8 i 11),
 * więc jej naruszenie znaczy ręczną ingerencję w dane. **Tutaj takiego strażnika NIE MA
 * i nie wolno go dodać.** Kolumna `action` celowo nie ma `CHECK`-a (komentarz nad
 * `MIGRATION_9`): wiersz jest zapisem historycznym, a strażnik przy odczycie znaczyłby,
 * że dziennik nadzoru przestaje się otwierać przez własną historię. Kod spoza katalogu
 * jedzie do panelu dosłownie.
 *
 * Czego tu NIE MA: `UPDATE` i `DELETE`. Dziennik jest append-only, a brak tych zdań
 * w kodzie jest jedną z trzech warstw tej gwarancji (obok `test/architecture.test.ts`
 * i docelowego `GRANT INSERT, SELECT`).
 */

import type {
  AdminAuditJoin,
  AdminAuditReadPort,
  AuditListFilter,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import {
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetPredicate,
  type CursorShape,
  type KeysetDirection,
} from '../keyset.ts';
import { SqlFilter } from '../sqlFilter.ts';

/**
 * Klucz porządku dziennika — dokładnie ten, pod który stoi `idx_audit_created`
 * (migracja 12). Obie kolumny są `NOT NULL`, stąd `k1Nullable: false`: gałąź `IS NULL`
 * byłaby martwym warunkiem, a martwy warunek w `WHERE` potrafi odciąć planerowi indeks.
 */
const KEY: readonly [string, string] = ['a.created_at', 'a.id'];

/**
 * Kształt kursora dziennika. Trzy deklaracje, z których każda coś ODRZUCA:
 *
 *  • `k1: 'timestamp'` — kolumna wiodąca to `TIMESTAMPTZ`, więc kursor niesie ją ISO
 *    8601 UTC. Sam `typeof === 'string'` przepuszczałby tu dowolny napis prosto
 *    do Postgresa (`22007`, czyli 500 zamiast 400);
 *  • `k1Nullable: false` — `created_at` jest `NOT NULL`, więc kursor z `null` pochodzi
 *    z innego zapytania; przepuszczony wywołałby wyjątek w `keysetPredicate`;
 *  • `k2: 'integer'` — tie-breakerem jest `BIGSERIAL`, który na drucie jedzie NAPISEM;
 *    `"abc"` kończyło się w bazie błędem `22P02`.
 */
const shapeOf = (direction: KeysetDirection): CursorShape => ({
  k1: 'timestamp',
  k1Nullable: false,
  k2: 'integer',
  direction,
});

interface AuditDbRow {
  /** `BIGSERIAL` — sterownik oddaje `int8` NAPISEM, nie liczbą (patrz `toJoin`). */
  id: string | number;
  created_at: string | Date;
  actor_pilot_id: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  actor_code: string | null;
  actor_name: string | null;
}

/**
 * `LEFT JOIN pilots`, nigdy `INNER`: `actor_pilot_id` nie ma klucza obcego (rejestr
 * jest starszy niż klucze — zaległość audytu), a nawet gdyby miał, konto skasowane
 * albo przepisane nie może usuwać wpisów z dziennika. Wpis bez konta zostaje widoczny
 * z samym identyfikatorem.
 */
const SELECT = `
  SELECT a.id,
         a.created_at,
         a.actor_pilot_id,
         a.actor_role,
         a.action,
         a.target_type,
         a.target_id,
         a.details,
         a.ip,
         p.code AS actor_code,
         p.name AS actor_name
    FROM admin_audit a
    LEFT JOIN pilots p ON p.id = a.actor_pilot_id`;

const toJoin = (r: AuditDbRow): AdminAuditJoin => ({
  // `Number(...)` na `BIGSERIAL`: identyfikator dziennika mieści się w bezpiecznym
  // zakresie liczby jeszcze przez kilka epok geologicznych, a napis w JSON-ie zmusiłby
  // panel do parsowania klucza wiersza.
  id: Number(r.id),
  createdAt: new Date(r.created_at),
  actorPilotId: r.actor_pilot_id,
  actorCode: r.actor_code,
  actorName: r.actor_name,
  actorRole: r.actor_role,
  action: r.action,
  targetType: r.target_type,
  targetId: r.target_id,
  // Kolumna jest `NOT NULL DEFAULT '{}'`, więc `null` tu nie powstaje — ale wiersz
  // wpisany ręcznie w psql może mieć `details: null`, a dziennik ma się otworzyć
  // także wtedy.
  details: r.details ?? {},
  ip: r.ip,
});

export class PgAdminAuditReadRepo implements AdminAuditReadPort {
  async list(
    db: Queryable,
    filter: AuditListFilter,
  ): Promise<{ items: AdminAuditJoin[]; nextCursor: string | null; total: number | null } | null> {
    const shape = shapeOf(filter.direction);
    const cursor = filter.cursor == null ? null : decodeCursor(filter.cursor, shape);
    if (filter.cursor != null && cursor == null) return null;

    const page = new SqlFilter();
    applyFilters(page, filter);
    keysetPredicate(KEY, cursor, page, shape);

    // +1 wiersz ponad limit to cała detekcja „czy jest następna strona" — drugi
    // `COUNT` na to nie odpowiada, bo mógłby się zmienić między zapytaniami.
    const limitParam = page.bind(filter.limit + 1);
    const { rows } = await db.query<AuditDbRow>(
      `${SELECT} ${page.where()} ${keysetOrderBy(KEY, filter.direction)} LIMIT ${limitParam}`,
      page.params(),
    );

    const items = rows.slice(0, filter.limit).map(toJoin);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > filter.limit && last != null
        ? encodeCursor({ k1: last.createdAt.toISOString(), k2: String(last.id) }, shape)
        : null;

    return { items, nextCursor, total: await this.count(db, filter, cursor != null) };
  }

  /**
   * `COUNT(*)` WYŁĄCZNIE dla pierwszej strony; kolejne dostają `null`, a panel niesie
   * liczbę z pierwszej.
   *
   * **Powód: liczba wpisów w zawężeniu jest własnością ZAPYTANIA, nie strony** — nie
   * zmienia się przy przewijaniu, więc płacimy za nią RAZ, przy pierwszym pytaniu.
   * Liczenie jej przy każdej stronie jest tym samym błędem, przed którym broni kursor:
   * `admin_audit` z natury tylko przyrasta i sam ekran `A09` deklaruje go jako tabelę
   * bez górnej granicy, a pełny `COUNT` skanuje ją całą — przy 4 000 wierszy jest już
   * kilkadziesiąt razy droższy od strony i rośnie liniowo, podczas gdy koszt strony
   * jest stały. Paginacja kursorem, do której doklejono `COUNT` na każde żądanie, ma
   * dokładnie tę charakterystykę, której miała zapobiec.
   *
   * Ceną jest to, że licznik nie odświeża się w trakcie przeglądania. To jest właściwy
   * kompromis: sklejona lista i tak nie udaje migawki, a „pokazano 50 z 8 814" ma
   * odpowiadać na pytanie o WYNIK FILTRA zadany w chwili wejścia na ekran.
   *
   * `COUNT` bez złączenia: żaden filtr nie sięga do `pilots` (szukamy po identyfikatorze
   * konta, nie po nazwisku), więc złączenie byłoby tu wyłącznie kosztem. Warunki są te
   * same co strony, ale BEZ kursora — licznik opisuje cały wynik filtra, a nie resztę
   * po kursorze.
   */
  private async count(
    db: Queryable,
    filter: AuditListFilter,
    paged: boolean,
  ): Promise<number | null> {
    if (paged) return null;

    const conditions = new SqlFilter();
    applyFilters(conditions, filter);

    const counted = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM admin_audit a ${conditions.where()}`,
      conditions.params(),
    );
    return Number(counted.rows[0]?.n ?? 0);
  }
}

/**
 * Wszystkie filtry są OPCJONALNE i pomijane, gdy nieustawione — numerację `$n` nadaje
 * `SqlFilter`, żeby nie było jej w tym pliku wcale.
 *
 * `IN (…)` składamy z osobnych miejsc na wartości, a nie przez `= ANY ($n)` z tablicą:
 * tablicę trzeba by serializować do literału Postgresa, co jest zachowaniem STEROWNIKA,
 * a testy jadą na PGlite, a produkcja na `pg`. Kilka `$n` znaczy to samo w obu i nie
 * wymaga wiary w żaden z nich.
 */
function applyFilters(sql: SqlFilter, filter: AuditListFilter): void {
  if (filter.actions !== undefined && filter.actions.length > 0) {
    const holes = filter.actions.map(() => '?').join(', ');
    sql.add(`a.action IN (${holes})`, ...filter.actions);
  }

  sql.addOptional('a.actor_pilot_id = ?', filter.actorPilotId);
  sql.addOptional('a.target_type = ?', filter.targetType);
  sql.addOptional('a.target_id = ?', filter.targetId);
  sql.addOptional(
    'a.created_at >= ?',
    filter.fromMs === undefined ? undefined : new Date(filter.fromMs),
  );
  sql.addOptional(
    'a.created_at <= ?',
    filter.toMs === undefined ? undefined : new Date(filter.toMs),
  );
}
