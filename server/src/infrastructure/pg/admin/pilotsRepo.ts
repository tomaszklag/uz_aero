/**
 * UZ Aero (serwer) - adapter kont pilotów po stronie PANELU (`PilotsAdminPort`, `A06`).
 *
 * Drugi adapter tej samej tabeli i to jest wzorzec, nie niedopatrzenie: `flags` ma
 * dokładnie tak samo `common/flagsRepo.ts` (ingest) i `admin/flagsRepo.ts` (panel).
 * `common/pilotsRepo.ts` obsługuje LOGOWANIE - dwa `SELECT`-y, własny uchwyt do bazy,
 * hash w wyniku. Ten obsługuje ZARZĄDZANIE - pisze, liczy i bierze `tx` z zewnątrz,
 * bo każdy zapis panelu jedzie transakcją śladu audytu. Ścieżka logowania nie ma jak
 * zregresować od zmian w panelu kont.
 *
 * ══ `flying_days` JEST AGREGATEM PROJEKCJI, NIE JEJ ODTWORZENIEM ══
 * Liczymy wiersze `sessions` (projekcja `projectSession`), a nie zdarzenia z `events` -
 * reguła twarda z `docs/architektura-panelu-serwer.md` §7.1. Sesja liczy się pilotowi,
 * gdy był PIC-em ALBO Dualem: dzień szkolny należy do obu, a nie tylko do dowodzącego.
 */

import type {
  AdminPilotAccount,
  AdminPilotJoin,
  NewPilotAccount,
  PilotCounts,
  PilotListFilter,
  PilotPatch,
  PilotScopeCounts,
  PilotsAdminPort,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import { DEFAULT_ROLE, isPilotRole, PILOT_ROLES } from '../../../domain/roles.ts';
import { SqlFilter } from '../sqlFilter.ts';

interface PilotDbRow {
  id: string;
  code: string;
  name: string;
  email: string | null;
  active: boolean;
  role: string;
  updated_at: string | Date;
  /** `COUNT(*)` - sterownik oddaje `int8` NAPISEM, nie liczbą. */
  flying_days: string | number;
}

const toAccount = (r: {
  id: string;
  code: string;
  name: string;
  email: string | null;
  active: boolean;
  role: string;
}): AdminPilotAccount => ({
  id: r.id,
  code: r.code,
  name: r.name,
  email: r.email,
  active: r.active,
  // Ta sama nieufność, co w adapterze logowania: bazy pilnuje CHECK na `pilots.role`,
  // ale nierozpoznana rola schodzi do najmniejszej, nigdy nie awansuje.
  role: isPilotRole(r.role) ? r.role : DEFAULT_ROLE,
});

const toJoin = (r: PilotDbRow): AdminPilotJoin => ({
  account: toAccount(r),
  updatedAt: new Date(r.updated_at),
  flyingDays: Number(r.flying_days),
});

/**
 * Dni lotne w oknie, per pilot. Podzapytanie zamiast dwóch `LEFT JOIN`-ów, bo dzień
 * szkolny ma w wierszu `sessions` DWA konta (`pic_id` i `dual_id`) - złączenie po
 * jednym z nich gubiłoby Duala, a po obu naraz liczyłoby wiersz dwa razy temu, kto
 * był w nim jednocześnie… czyli nikomu, ale kosztem warunku, który trzeba pamiętać.
 * `UNION ALL` z `GROUP BY` mówi to wprost: jedna sesja = jeden dzień dla każdego
 * z jej pilotów.
 *
 * `status = 'closed'` - mockup A06 liczy „dni z zamkniętymi sesjami". Dzień otwarty
 * jeszcze trwa i jego liczby nie są ostateczne.
 */
const flyingDaysSql = (from: string, to: string): string => `
  SELECT pilot_id, COUNT(*) AS days FROM (
    SELECT pic_id AS pilot_id FROM sessions
     WHERE status = 'closed' AND claim_time BETWEEN ${from} AND ${to}
    UNION ALL
    SELECT dual_id AS pilot_id FROM sessions
     WHERE status = 'closed' AND dual_id IS NOT NULL AND claim_time BETWEEN ${from} AND ${to}
  ) s GROUP BY pilot_id`;

export class PgAdminPilotsRepo implements PilotsAdminPort {
  async list(
    db: Queryable,
    filter: PilotListFilter,
  ): Promise<{ items: AdminPilotJoin[]; total: number }> {
    // Okno dni lotnych rejestrujemy PRZEZ `SqlFilter`, mimo że stoi w podzapytaniu,
    // a nie w `WHERE`: numeracja `$n` ma mieć jednego autora. Ręczne „okno to $1 i $2,
    // reszta od $3" jest dokładnie tą księgowością, przed którą ten moduł broni.
    const sql = new SqlFilter();
    const fromParam = sql.bind(filter.fromMs);
    const toParam = sql.bind(filter.toMs);
    applyFilters(sql, filter);

    const limitParam = sql.bind(filter.limit);
    const { rows } = await db.query<PilotDbRow>(
      `SELECT p.id, p.code, p.name, p.email, p.active, p.role, p.updated_at,
              COALESCE(d.days, 0) AS flying_days
         FROM pilots p
         LEFT JOIN (${flyingDaysSql(fromParam, toParam)}) d ON d.pilot_id = p.id
         ${sql.where()}
         ${orderBy(filter.direction)}
         LIMIT ${limitParam}`,
      sql.params(),
    );

    // `COUNT` na tym samym zawężeniu, ale BEZ okna dni lotnych: liczba kont nie
    // zależy od tego, kto latał. Lista kont klubu nie ma kursora i mieć go nie musi
    // (kilkanaście wierszy), więc `total` odpowiada wyłącznie na pytanie „czy limit
    // coś uciął".
    const counted = new SqlFilter();
    applyFilters(counted, filter);
    const total = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM pilots p ${counted.where()}`,
      counted.params(),
    );

    return { items: rows.map(toJoin), total: Number(total.rows[0]?.n ?? 0) };
  }

  async counts(db: Queryable, window: { fromMs: number; toMs: number }): Promise<PilotCounts> {
    const { rows } = await db.query<Record<string, string>>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE active) AS active,
              COUNT(*) FILTER (WHERE role = 'admin') AS admin,
              -- Wszystko, co NIE jest administratorem, liczy się jako pilot - także
              -- wiersz z wycofaną rolą training_lead (2026-08-30). Tak samo czyta to
              -- reszta serwera: isPilotRole(role) albo DEFAULT_ROLE. Liczenie go
              -- osobno albo pomijanie dawałoby kafel, którego suma nie zgadza się
              -- z total - czyli liczbę, przy której administrator zaczyna zgadywać.
              COUNT(*) FILTER (WHERE role IS DISTINCT FROM 'admin') AS pilot
         FROM pilots`,
    );
    // Dni klubu liczymy SESJAMI, nie sumą kolumny z wierszy: dzień szkolny ma dwóch
    // pilotów, więc suma kolumny byłaby liczbą osobodni, a kafel mówi o dniach.
    const days = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM sessions
        WHERE status = 'closed' AND claim_time BETWEEN $1 AND $2`,
      [window.fromMs, window.toMs],
    );
    const row = rows[0] ?? {};
    const total = Number(row.total ?? 0);
    const active = Number(row.active ?? 0);

    // `Record<PilotRole, number>` składamy z katalogu ról, nie z kluczy wiersza:
    // dopisanie roli w `domain/roles.ts` ma wywalić kompilację tutaj, a nie oddać
    // panelowi kartę „Rola w panelu" z brakującą pozycją.
    const byRole = Object.fromEntries(
      PILOT_ROLES.map((role) => [role, Number(row[role] ?? 0)]),
    ) as Record<(typeof PILOT_ROLES)[number], number>;

    return {
      total,
      active,
      inactive: total - active,
      byRole,
      flyingDays: Number(days.rows[0]?.n ?? 0),
    };
  }

  /**
   * Liczniki CHIPÓW - te same cztery zawężenia, w bieżącym wyszukiwaniu.
   *
   * Osobne zapytanie od `counts`, mimo podobieństwa SQL-a, bo odpowiada na inne
   * pytanie: `counts` opisuje klub (kafle), a to jest obietnica chipa („tyle
   * zobaczysz"). Sklejenie ich w jedno zmusiłoby kafle do zmieniania się przy
   * wpisywaniu w wyszukiwarkę, czyli odebrałoby im ich jedyną treść.
   *
   * `role IN (…)` wypisane wprost zamiast sumy dwóch `FILTER`-ów: chip „Z rolą panelu"
   * pyta o KONTA MAJĄCE WEJŚCIE, a nie o sumę dwóch liczb - konto nie może mieć dwóch
   * ról, ale to jest własność dzisiejszego modelu, a nie treść tego pytania.
   */
  async scopeCounts(db: Queryable, filter: { search?: string }): Promise<PilotScopeCounts> {
    const sql = new SqlFilter();
    applySearch(sql, filter.search);

    const { rows } = await db.query<Record<string, string>>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE active) AS active,
              COUNT(*) FILTER (WHERE NOT active) AS inactive,
              -- „Z rolą panelu" = dziś dokładnie administratorzy: po wycofaniu
              -- training_lead (2026-08-30) nie ma innej roli, która wpuszcza do
              -- back-office'u. Chip zostaje, bo wraca razem z trzecią rolą.
              COUNT(*) FILTER (WHERE role = 'admin') AS panel
         FROM pilots p ${sql.where()}`,
      sql.params(),
    );

    const row = rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      active: Number(row.active ?? 0),
      inactive: Number(row.inactive ?? 0),
      panel: Number(row.panel ?? 0),
    };
  }

  async byId(db: Queryable, id: string): Promise<AdminPilotAccount | null> {
    const { rows } = await db.query<{
      id: string;
      code: string;
      name: string;
      email: string | null;
      active: boolean;
      role: string;
    }>('SELECT id, code, name, email, active, role FROM pilots WHERE id = $1', [id]);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async conflict(
    tx: Queryable,
    values: { code: string; email: string | null; exceptId: string | null },
  ): Promise<'code' | 'email' | null> {
    const { rows } = await tx.query<{ code: string; email: string | null }>(
      `SELECT code, email FROM pilots
        WHERE (lower(code) = lower($1) OR (email IS NOT NULL AND lower(email) = lower($2)))
          AND ($3::text IS NULL OR id <> $3)`,
      [values.code, values.email, values.exceptId],
    );

    // Kolejność sprawdzania jest KOLEJNOŚCIĄ PÓL W FORMULARZU: kod stoi nad e-mailem,
    // więc przy podwójnej kolizji panel poprawia najpierw to, co widzi wyżej.
    if (rows.some((r) => r.code.toLowerCase() === values.code.toLowerCase())) return 'code';
    if (
      values.email != null &&
      rows.some((r) => r.email?.toLowerCase() === values.email?.toLowerCase())
    ) {
      return 'email';
    }
    return null;
  }

  async insert(tx: Queryable, account: NewPilotAccount): Promise<void> {
    await tx.query(
      `INSERT INTO pilots (id, code, name, email, password_hash, active, role)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
      [account.id, account.code, account.name, account.email, account.passwordHash, account.role],
    );
  }

  async update(tx: Queryable, id: string, patch: PilotPatch): Promise<void> {
    // `COALESCE` zamiast budowania `SET` z obecnych pól: `undefined` znaczy „bez
    // zmian", a `null` przy e-mailu znaczy „wyczyść" - i te dwa przypadki muszą
    // zostać rozróżnione aż do SQL-a. Stąd jawny znacznik `$5` dla e-maila.
    await tx.query(
      `UPDATE pilots
          SET code = COALESCE($2, code),
              name = COALESCE($3, name),
              email = CASE WHEN $5 THEN $4 ELSE email END,
              role = COALESCE($6, role),
              updated_at = now()
        WHERE id = $1`,
      [
        id,
        patch.code ?? null,
        patch.name ?? null,
        patch.email ?? null,
        patch.email !== undefined,
        patch.role ?? null,
      ],
    );
  }

  /**
   * Deaktywacja przesuwa `credentials_valid_from`; AKTYWACJA go nie rusza.
   *
   * `GREATEST` zamiast przypisania: znacznik ma iść wyłącznie do przodu. Zegar
   * (a przy replayu - kolejność wołań) mógłby cofnąć datę, a cofnięty znacznik
   * OŻYWIŁBY tokeny, które ktoś świadomie unieważnił wcześniej.
   */
  async setActive(tx: Queryable, id: string, active: boolean, at: Date): Promise<void> {
    await tx.query(
      `UPDATE pilots
          SET active = $2,
              credentials_valid_from = CASE
                WHEN $2 THEN credentials_valid_from
                ELSE GREATEST(credentials_valid_from, $3::timestamptz)
              END,
              updated_at = now()
        WHERE id = $1`,
      [id, active, at.toISOString()],
    );
  }

  async setPasswordHash(
    tx: Queryable,
    id: string,
    passwordHash: string,
    at: Date,
  ): Promise<void> {
    await tx.query(
      `UPDATE pilots
          SET password_hash = $2,
              credentials_valid_from = GREATEST(credentials_valid_from, $3::timestamptz),
              updated_at = now()
        WHERE id = $1`,
      [id, passwordHash, at.toISOString()],
    );
  }

  async countActiveAdmins(tx: Queryable): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM pilots WHERE active AND role = 'admin'",
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Klucz jest STAŁY, bo chroniony zasób jest jeden na cały klub: „ilu jest aktywnych
   * administratorów". Blokada per wiersz nie działa - dwie transakcje odbierające rolę
   * DWÓM RÓŻNYM administratorom nie dotykają wspólnego wiersza, więc nic ich nie
   * serializuje, obie odczytują „jest dwóch" i obie commitują. Zostaje zero.
   *
   * `hashtext` na napisie zamiast liczby wpisanej wprost: tak samo powstaje klucz
   * blokady sesji w `IngestCommands` i `AdminCorrectionCommands`, a napis mówi, co
   * jest blokowane. Przestrzeń kluczy advisory jest wspólna dla całej bazy, więc
   * kolizja z hashem uuid-a sesji dałaby najwyżej niepotrzebne czekanie, nigdy
   * pominiętą blokadę.
   */
  async lockAdminPopulation(tx: Queryable): Promise<void> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ADMIN_POPULATION_LOCK]);
  }

  /**
   * Czy cokolwiek odwołuje się do tego konta - wejście do `refuseDelete`.
   *
   * ══ TRZY DECYZJE, KTORE TRZEBA ZNAC ══
   * 1. **`EXISTS`, nie `COUNT(*)`.** Regule wystarczy zero/niezero, a liczenie wierszy
   *    w `events` konta z tysiącem lotów jest pełnym skanem po nic. Wynik jest więc
   *    liczbą ŹRÓDEŁ (0-3), nie wierszy - i tak opisuje go port.
   * 2. **Drugi pilot liczy się TAK SAMO jak PIC**, i to z dwóch miejsc: kolumny
   *    `dual_id` (nagłówek zdarzenia) oraz `payload->>'dualId'` (wartość PO korekcie
   *    administratora, issue #43). Sama kolumna przepuściłaby konto, które ktoś wpisał
   *    jako Duala poprawką - a to jest odwołanie tak samo prawdziwe.
   * 3. **`admin_audit` liczy się po SPRAWCY, nigdy po celu.** Konto jest celem wpisu
   *    `pilot.create` z chwili własnego założenia, więc liczenie celów zablokowałoby
   *    usunięcie KAŻDEGO konta - reguła nie do spełnienia. Sprawca to co innego:
   *    administrator, który coś w klubie zrobił, zostaje w dzienniku, a dziennik bez
   *    tożsamości sprawcy przestaje być dziennikiem.
   */
  async references(tx: Queryable, id: string): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT (EXISTS (SELECT 1 FROM events
                        WHERE pic_id = $1 OR dual_id = $1 OR payload->>'dualId' = $1))::int
            + (EXISTS (SELECT 1 FROM sessions WHERE pic_id = $1))::int
            + (EXISTS (SELECT 1 FROM admin_audit WHERE actor_pilot_id = $1))::int AS n`,
      [id],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Trwałe skasowanie wiersza konta.
   *
   * `refresh_tokens` kasujemy JAWNIE, mimo że mają klucz obcy: bez tego `DELETE`
   * odbiłby się o ograniczenie i wywrócił transakcję wyjątkiem bazy zamiast odmową
   * z powodem. To nie jest historia, tylko sesje telefonu - a te i tak zniknęły przy
   * wyłączeniu konta, którego ta operacja wymaga.
   */
  async delete(tx: Queryable, id: string): Promise<void> {
    await tx.query('DELETE FROM refresh_tokens WHERE pilot_id = $1', [id]);
    await tx.query('DELETE FROM pilots WHERE id = $1', [id]);
  }
}

/** Nazwa chronionego zasobu - jedna, dla wszystkich mutacji zmieniających jego stan. */
const ADMIN_POPULATION_LOCK = 'pilots:admin-population';

/**
 * Porządek listy jest CZĘŚCIĄ KONTRAKTU tego portu, jak przy skrzynce flag: konta
 * NIEAKTYWNE lądują na końcu niezależnie od kierunku sortowania (mockup A06 rysuje
 * je tak), a w obrębie grupy sortujemy po nazwisku. Kod pilota jest tie-breakerem,
 * żeby kolejność była deterministyczna przy dwóch osobach o tym samym nazwisku.
 */
function orderBy(direction: 'asc' | 'desc'): string {
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY p.active DESC, p.name ${dir}, p.code ASC`;
}

function applyFilters(sql: SqlFilter, filter: PilotListFilter): void {
  sql.addOptional('p.active = ?', filter.active);
  if (filter.roles !== undefined && filter.roles.length > 0) {
    // `IN (…)` z osobnych miejsc na wartości, nie `= ANY ($n)` z tablicą: tablicę
    // trzeba by serializować do literału Postgresa, co jest zachowaniem STEROWNIKA,
    // a testy jadą na PGlite, produkcja na `pg`. Ta sama decyzja co w `auditReadRepo`.
    const holes = filter.roles.map(() => '?').join(', ');
    sql.add(`p.role IN (${holes})`, ...filter.roles);
  }
  applySearch(sql, filter.search);
}

/**
 * Wyszukiwanie przez `position(... in ...)`, nie `LIKE '%q%'`: wzorzec `LIKE` wymaga
 * ucieczki `%` i `_` z tekstu wpisanego przez człowieka, a zapomniana ucieczka daje
 * pole wyszukiwania, w którym `%` pokazuje wszystko. `position` nie ma metaznaków.
 *
 * Osobna funkcja od `applyFilters`, bo ma DRUGIEGO wołającego: liczniki chipów
 * zawężają się wyszukiwaniem, ale nie chipem (`scopeCounts`). Powtórzenie tego
 * warunku byłoby pierwszym miejscem, w którym lista i licznik pod nią zaczynają
 * odpowiadać na inne pytanie.
 */
function applySearch(sql: SqlFilter, search: string | undefined): void {
  if (search === undefined || search === '') return;
  sql.add(
    `(position(lower(?) in lower(p.code)) > 0
      OR position(lower(?) in lower(p.name)) > 0
      OR position(lower(?) in lower(coalesce(p.email, ''))) > 0)`,
    search,
    search,
    search,
  );
}
