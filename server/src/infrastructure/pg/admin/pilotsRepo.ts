/**
 * UZ Aero (serwer) - adapter członków klubu po stronie PANELU (`PilotsAdminPort`, `A06`).
 *
 * Drugi adapter tych samych tabel i to jest wzorzec, nie niedopatrzenie: `flags` ma
 * dokładnie tak samo `common/flagsRepo.ts` (ingest) i `admin/flagsRepo.ts` (panel).
 * `common/pilotsRepo.ts` obsługuje LOGOWANIE - odczyty, własny uchwyt do bazy. Ten
 * obsługuje ZARZĄDZANIE - pisze, liczy i bierze `tx` z zewnątrz, bo każdy zapis panelu
 * jedzie transakcją śladu audytu. Ścieżka logowania nie ma jak zregresować od zmian
 * w panelu kont.
 *
 * ══ OD WIELOFIRMOWOŚCI (issue #98): WIERSZ LISTY TO CZŁONKOSTWO ══
 * `pilots` jest OSOBĄ (nazwisko, e-mail), `memberships` - tym, kim jest w klubie
 * (kod, rola, status). Lista klubu to złączenie obu po `(org_id, pilot_id)`; kod
 * i rola zapisują się do członkostwa, nazwisko i e-mail do osoby. Kolizja kodu jest
 * pytaniem o KLUB, kolizja e-maila - o to, czy osoba o tym adresie już do klubu należy.
 *
 * Na liście stoją członkostwa `active` i `disabled`. `pending` i `rejected` (zgłoszenia
 * kodem klubu) to kolejka z epiku D - mają własną kartę nad listą, nie wiersz w niej.
 *
 * ══ `flying_days` JEST AGREGATEM PROJEKCJI, NIE JEJ ODTWORZENIEM ══
 * Liczymy wiersze `sessions` (projekcja `projectSession`), a nie zdarzenia z `events` -
 * reguła twarda z `docs/architektura-panelu-serwer.md` §7.1. Sesja liczy się pilotowi,
 * gdy był PIC-em ALBO Dualem: dzień szkolny należy do obu, a nie tylko do dowodzącego.
 * Sesje TEGO klubu - dni w drugim klubie są dniami drugiego klubu.
 */

import type {
  AdminPilotAccount,
  AdminPilotJoin,
  MembershipApproval,
  MembershipDecisionTarget,
  MembershipRejection,
  MembershipRequest,
  PilotCounts,
  PilotListFilter,
  PilotPatch,
  PilotScopeCounts,
  PilotsAdminPort,
} from '../../../application/admin/ports.ts';
import type { Queryable } from '../../../application/common/ports.ts';
import { membershipStatusOf } from '../../../domain/memberships.ts';
import { DEFAULT_ROLE, isPilotRole, PILOT_ROLES } from '../../../domain/roles.ts';
import { SqlFilter } from '../sqlFilter.ts';

interface MemberDbRow {
  id: string;
  org_id: string;
  code: string;
  name: string;
  email: string | null;
  status: string;
  role: string;
  updated_at: string | Date;
  /** `COUNT(*)` - sterownik oddaje `int8` NAPISEM, nie liczbą. */
  flying_days: string | number;
}

/** Wiersz kolejki zgłoszeń - członkostwo `pending` złączone z osobą. */
interface RequestDbRow {
  pilot_id: string;
  name: string;
  email: string | null;
  created_at: string | Date;
}

/** Cel decyzji: stan członkostwa + tożsamość i aktywność PLATFORMOWA osoby. */
interface TargetDbRow extends RequestDbRow {
  status: string;
  active: boolean;
}

const toAccount = (r: {
  id: string;
  org_id: string;
  code: string;
  name: string;
  email: string | null;
  status: string;
  role: string;
}): AdminPilotAccount => ({
  id: r.id,
  orgId: r.org_id,
  code: r.code,
  name: r.name,
  email: r.email,
  active: r.status === 'active',
  // Ta sama nieufność, co w adapterze logowania: bazy pilnuje CHECK na `memberships.role`,
  // ale nierozpoznana rola schodzi do najmniejszej, nigdy nie awansuje.
  role: isPilotRole(r.role) ? r.role : DEFAULT_ROLE,
});

const toJoin = (r: MemberDbRow): AdminPilotJoin => ({
  account: toAccount(r),
  updatedAt: new Date(r.updated_at),
  flyingDays: Number(r.flying_days),
});

/** Członkostwa, które SĄ na liście klubu - kolejka `pending`/`rejected` to osobna karta. */
const LISTED = "m.status IN ('active', 'disabled')";

/**
 * Dni lotne w oknie, per pilot, W KLUBIE. Podzapytanie zamiast dwóch `LEFT JOIN`-ów, bo
 * dzień szkolny ma w wierszu `sessions` DWA konta (`pic_id` i `dual_id`) - złączenie po
 * jednym z nich gubiłoby Duala, a po obu naraz liczyłoby wiersz dwa razy temu, kto
 * był w nim jednocześnie… czyli nikomu, ale kosztem warunku, który trzeba pamiętać.
 * `UNION ALL` z `GROUP BY` mówi to wprost: jedna sesja = jeden dzień dla każdego
 * z jej pilotów.
 *
 * `status = 'closed'` - mockup A06 liczy „dni z zamkniętymi sesjami". Dzień otwarty
 * jeszcze trwa i jego liczby nie są ostateczne.
 */
const flyingDaysSql = (org: string, from: string, to: string): string => `
  SELECT pilot_id, COUNT(*) AS days FROM (
    SELECT pic_id AS pilot_id FROM sessions
     WHERE org_id = ${org} AND status = 'closed' AND claim_time BETWEEN ${from} AND ${to}
    UNION ALL
    SELECT dual_id AS pilot_id FROM sessions
     WHERE org_id = ${org} AND status = 'closed' AND dual_id IS NOT NULL
       AND claim_time BETWEEN ${from} AND ${to}
  ) s GROUP BY pilot_id`;

const MEMBER_COLUMNS = 'p.id, m.org_id, m.code, p.name, p.email, m.status, m.role';

export class PgAdminPilotsRepo implements PilotsAdminPort {
  async list(
    db: Queryable,
    orgId: string,
    filter: PilotListFilter,
  ): Promise<{ items: AdminPilotJoin[]; total: number }> {
    // Klub i okno dni lotnych rejestrujemy PRZEZ `SqlFilter`, mimo że stoją w podzapytaniu,
    // a nie w `WHERE`: numeracja `$n` ma mieć jednego autora. Ręczne „klub to $1,
    // okno to $2 i $3, reszta od $4" jest dokładnie tą księgowością, przed którą ten
    // moduł broni.
    const sql = new SqlFilter();
    const orgParam = sql.bind(orgId);
    const fromParam = sql.bind(filter.fromMs);
    const toParam = sql.bind(filter.toMs);
    sql.add(`m.org_id = ${orgParam}`);
    sql.add(LISTED);
    applyFilters(sql, filter);

    const limitParam = sql.bind(filter.limit);
    const { rows } = await db.query<MemberDbRow>(
      `SELECT ${MEMBER_COLUMNS},
              GREATEST(p.updated_at, m.updated_at) AS updated_at,
              COALESCE(d.days, 0) AS flying_days
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
         LEFT JOIN (${flyingDaysSql(orgParam, fromParam, toParam)}) d ON d.pilot_id = p.id
         ${sql.where()}
         ${orderBy(filter.direction)}
         LIMIT ${limitParam}`,
      sql.params(),
    );

    // `COUNT` na tym samym zawężeniu, ale BEZ okna dni lotnych: liczba członków nie
    // zależy od tego, kto latał. Lista klubu nie ma kursora i mieć go nie musi
    // (kilkanaście wierszy), więc `total` odpowiada wyłącznie na pytanie „czy limit
    // coś uciął".
    const counted = new SqlFilter();
    counted.add('m.org_id = ?', orgId);
    counted.add(LISTED);
    applyFilters(counted, filter);
    const total = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM memberships m JOIN pilots p ON p.id = m.pilot_id ${counted.where()}`,
      counted.params(),
    );

    return { items: rows.map(toJoin), total: Number(total.rows[0]?.n ?? 0) };
  }

  async counts(
    db: Queryable,
    orgId: string,
    window: { fromMs: number; toMs: number },
  ): Promise<PilotCounts> {
    const { rows } = await db.query<Record<string, string>>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE m.status = 'active') AS active,
              COUNT(*) FILTER (WHERE m.role = 'admin') AS admin,
              -- Wszystko, co NIE jest administratorem, liczy się jako pilot - także
              -- wiersz z rolą spoza katalogu. Tak samo czyta to reszta serwera:
              -- isPilotRole(role) albo DEFAULT_ROLE. Liczenie go osobno albo pomijanie
              -- dawałoby kafel, którego suma nie zgadza się z total.
              COUNT(*) FILTER (WHERE m.role IS DISTINCT FROM 'admin') AS pilot
         FROM memberships m
        WHERE m.org_id = $1 AND ${LISTED}`,
      [orgId],
    );
    // Dni klubu liczymy SESJAMI, nie sumą kolumny z wierszy: dzień szkolny ma dwóch
    // pilotów, więc suma kolumny byłaby liczbą osobodni, a kafel mówi o dniach.
    const days = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM sessions
        WHERE org_id = $1 AND status = 'closed' AND claim_time BETWEEN $2 AND $3`,
      [orgId, window.fromMs, window.toMs],
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
   * Osobne zapytanie od `counts`, mimo podobnego SQL-a, bo odpowiada na inne
   * pytanie: `counts` opisuje klub (kafle), a to jest obietnica chipa („tyle
   * zobaczysz"). Sklejenie ich w jedno zmusiłoby kafle do zmieniania się przy
   * wpisywaniu w wyszukiwarkę, czyli odebrałoby im ich jedyną treść.
   */
  async scopeCounts(
    db: Queryable,
    orgId: string,
    filter: { search?: string },
  ): Promise<PilotScopeCounts> {
    const sql = new SqlFilter();
    sql.add('m.org_id = ?', orgId);
    sql.add(LISTED);
    applySearch(sql, filter.search);

    const { rows } = await db.query<Record<string, string>>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE m.status = 'active') AS active,
              COUNT(*) FILTER (WHERE m.status <> 'active') AS inactive,
              -- „Z rolą panelu" = dziś dokładnie administratorzy: po wycofaniu
              -- training_lead (2026-08-30) nie ma innej roli, która wpuszcza do
              -- back-office'u. Chip zostaje, bo wraca razem z trzecią rolą.
              COUNT(*) FILTER (WHERE m.role = 'admin') AS panel
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id ${sql.where()}`,
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

  async byId(db: Queryable, orgId: string, id: string): Promise<AdminPilotAccount | null> {
    const { rows } = await db.query<MemberDbRow>(
      `SELECT ${MEMBER_COLUMNS}
         FROM memberships m JOIN pilots p ON p.id = m.pilot_id
        WHERE m.org_id = $1 AND m.pilot_id = $2 AND ${LISTED}`,
      [orgId, id],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async conflict(
    tx: Queryable,
    orgId: string,
    values: { code: string; email: string | null; exceptId: string | null },
  ): Promise<'code' | 'email' | null> {
    // Kolejność sprawdzania jest KOLEJNOŚCIĄ PÓL W FORMULARZU: kod stoi nad e-mailem,
    // więc przy podwójnej kolizji panel poprawia najpierw to, co widzi wyżej.
    const code = await tx.query<{ pilot_id: string }>(
      `SELECT pilot_id FROM memberships
        WHERE org_id = $1 AND lower(code) = lower($2)
          AND ($3::text IS NULL OR pilot_id <> $3)`,
      [orgId, values.code, values.exceptId],
    );
    if (code.rows.length > 0) return 'code';

    if (values.email != null) {
      // E-mail koliduje wyłącznie z osobą, która JUŻ JEST członkiem tego klubu: osoba
      // z innego klubu pod tym adresem to nie kolizja, tylko dołączenie (`insert`).
      const email = await tx.query<{ id: string }>(
        `SELECT p.id FROM pilots p
          JOIN memberships m ON m.pilot_id = p.id AND m.org_id = $1
         WHERE lower(p.email) = lower($2) AND ($3::text IS NULL OR p.id <> $3)`,
        [orgId, values.email, values.exceptId],
      );
      if (email.rows.length > 0) return 'email';
    }
    return null;
  }

  async update(tx: Queryable, orgId: string, id: string, patch: PilotPatch): Promise<void> {
    // Pola osoby i pola członkostwa idą dwoma `UPDATE`-ami, bo to dwie tabele -
    // a `COALESCE` zamiast budowania `SET` z obecnych pól z tego samego powodu, co
    // dotąd: `undefined` znaczy „bez zmian", `null` przy e-mailu znaczy „wyczyść".
    if (patch.name !== undefined || patch.email !== undefined) {
      await tx.query(
        `UPDATE pilots
            SET name = COALESCE($2, name),
                email = CASE WHEN $4 THEN $3 ELSE email END,
                updated_at = now()
          WHERE id = $1`,
        [id, patch.name ?? null, patch.email ?? null, patch.email !== undefined],
      );
    }
    if (patch.code !== undefined || patch.role !== undefined) {
      await tx.query(
        `UPDATE memberships
            SET code = COALESCE($3, code),
                role = COALESCE($4, role),
                updated_at = now()
          WHERE org_id = $1 AND pilot_id = $2`,
        [orgId, id, patch.code ?? null, patch.role ?? null],
      );
    }
  }

  /**
   * Wyłączenie przesuwa `credentials_valid_from` CZŁONKOSTWA; włączenie go nie rusza.
   *
   * `GREATEST` zamiast przypisania: znacznik ma iść wyłącznie do przodu. Zegar
   * (a przy replayu - kolejność wołań) mógłby cofnąć datę, a cofnięty znacznik
   * OŻYWIŁBY tokeny, które ktoś świadomie unieważnił wcześniej.
   */
  async setActive(
    tx: Queryable,
    orgId: string,
    id: string,
    active: boolean,
    at: Date,
  ): Promise<void> {
    await tx.query(
      `UPDATE memberships
          SET status = CASE WHEN $3 THEN 'active' ELSE 'disabled' END,
              credentials_valid_from = CASE
                WHEN $3 THEN credentials_valid_from
                ELSE GREATEST(credentials_valid_from, $4::timestamptz)
              END,
              updated_at = now()
        WHERE org_id = $1 AND pilot_id = $2`,
      [orgId, id, active, at.toISOString()],
    );
  }

  async countActiveAdmins(tx: Queryable, orgId: string): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM memberships
        WHERE org_id = $1 AND status = 'active' AND role = 'admin'`,
      [orgId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Klucz jest PER KLUB, bo chroniony zasób jest jeden na klub: „ilu jest aktywnych
   * administratorów TEGO klubu". Blokada per wiersz nie działa - dwie transakcje
   * odbierające rolę DWÓM RÓŻNYM administratorom nie dotykają wspólnego wiersza, więc
   * nic ich nie serializuje, obie odczytują „jest dwóch" i obie commitują. Zostaje zero.
   *
   * `hashtext` na napisie zamiast liczby wpisanej wprost: tak samo powstaje klucz
   * blokady sesji w `IngestCommands` i `AdminCorrectionCommands`, a napis mówi, co
   * jest blokowane. Przestrzeń kluczy advisory jest wspólna dla całej bazy, więc
   * kolizja z hashem uuid-a sesji dałaby najwyżej niepotrzebne czekanie, nigdy
   * pominiętą blokadę.
   */
  async lockAdminPopulation(tx: Queryable, orgId: string): Promise<void> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${ADMIN_POPULATION_LOCK}:${orgId}`,
    ]);
  }

  /**
   * Czy cokolwiek odwołuje się do tej OSOBY - wejście do `refuseDelete`.
   *
   * ══ CZTERY DECYZJE, KTORE TRZEBA ZNAC ══
   * 1. **`EXISTS`, nie `COUNT(*)`.** Regule wystarczy zero/niezero, a liczenie wierszy
   *    w `events` konta z tysiącem lotów jest pełnym skanem po nic. Wynik jest więc
   *    liczbą ŹRÓDEŁ (0-4), nie wierszy - i tak opisuje go port.
   * 2. **Drugi pilot liczy się TAK SAMO jak PIC**, i to z dwóch miejsc: kolumny
   *    `dual_id` (nagłówek zdarzenia) oraz `payload->>'dualId'` (wartość PO korekcie
   *    administratora, issue #43). Sama kolumna przepuściłaby konto, które ktoś wpisał
   *    jako Duala poprawką - a to jest odwołanie tak samo prawdziwe.
   * 3. **`admin_audit` liczy się po SPRAWCY, nigdy po celu.** Konto jest celem wpisu
   *    `pilot.create` z chwili własnego założenia, więc liczenie celów zablokowałoby
   *    usunięcie KAŻDEGO konta - reguła nie do spełnienia. Sprawca to co innego:
   *    administrator, który coś w klubie zrobił, zostaje w dzienniku, a dziennik bez
   *    tożsamości sprawcy przestaje być dziennikiem.
   * 4. **Członkostwo w INNYM klubie jest odwołaniem** (wielofirmowość): klub A nie
   *    kasuje osoby, która lata w klubie B - wyłącza u siebie członkostwo i tyle.
   */
  async references(tx: Queryable, orgId: string, id: string): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT (EXISTS (SELECT 1 FROM events
                        WHERE pic_id = $1 OR dual_id = $1 OR payload->>'dualId' = $1))::int
            + (EXISTS (SELECT 1 FROM sessions WHERE pic_id = $1))::int
            + (EXISTS (SELECT 1 FROM admin_audit WHERE actor_pilot_id = $1))::int
            + (EXISTS (SELECT 1 FROM memberships WHERE pilot_id = $1 AND org_id <> $2))::int AS n`,
      [id, orgId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Trwałe skasowanie członkostwa i OSOBY.
   *
   * `refresh_tokens` kasujemy JAWNIE, mimo że mają klucz obcy: bez tego `DELETE`
   * odbiłby się o ograniczenie i wywrócił transakcję wyjątkiem bazy zamiast odmową
   * z powodem. To nie jest historia, tylko sesje telefonu - a te i tak zniknęły przy
   * wyłączeniu członkostwa, którego ta operacja wymaga. Członkostwo znika kaskadą
   * (`ON DELETE CASCADE`), ale piszemy to wprost - kolejność ma być czytelna z kodu.
   */
  async delete(tx: Queryable, orgId: string, id: string): Promise<void> {
    await tx.query('DELETE FROM refresh_tokens WHERE pilot_id = $1', [id]);
    await tx.query('DELETE FROM memberships WHERE org_id = $1 AND pilot_id = $2', [orgId, id]);
    await tx.query('DELETE FROM pilots WHERE id = $1', [id]);
  }

  // ── kolejka zgłoszeń kodem klubu (issue #100, D2) ─────────────────────────────

  /**
   * Zgłoszenia czekające na decyzję, NAJDŁUŻEJ CZEKAJĄCE PIERWSZE.
   *
   * Kolejka, nie lista: porządek jest po `created_at`, więc zgłoszenie nie ma jak
   * „utknąć na dole" po dopisaniu nowszych. `pilot_id` jako tie-breaker, żeby dwa
   * zgłoszenia z tej samej sekundy miały deterministyczną kolejność.
   */
  async pending(db: Queryable, orgId: string): Promise<MembershipRequest[]> {
    const { rows } = await db.query<RequestDbRow>(
      `SELECT m.pilot_id, p.name, p.email, m.created_at
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
        WHERE m.org_id = $1 AND m.status = 'pending'
        ORDER BY m.created_at ASC, m.pilot_id ASC`,
      [orgId],
    );
    return rows.map((row) => ({
      pilotId: row.pilot_id,
      name: row.name,
      email: row.email,
      requestedAt: new Date(row.created_at),
    }));
  }

  /**
   * Wiersz członkostwa w DOWOLNYM stanie - patrz `PilotsAdminPort.decisionTarget`.
   *
   * `p.active` jedzie razem z nim, bo `refuseApprove` pyta o blokadę PLATFORMOWĄ osoby:
   * zatwierdzenie zablokowanego dałoby członkostwo `active`, którym i tak nie da się
   * wejść - a administrator klubu nie ma jak tej blokady zdjąć, więc musi ją zobaczyć.
   */
  async decisionTarget(
    tx: Queryable,
    orgId: string,
    pilotId: string,
  ): Promise<MembershipDecisionTarget | null> {
    const { rows } = await tx.query<TargetDbRow>(
      `SELECT m.pilot_id, m.status, p.name, p.email, p.active, m.created_at
         FROM memberships m
         JOIN pilots p ON p.id = m.pilot_id
        WHERE m.org_id = $1 AND m.pilot_id = $2`,
      [orgId, pilotId],
    );
    const row = rows[0];
    if (row == null) return null;

    return {
      pilotId: row.pilot_id,
      // Ta sama nieufność, co przy roli: wartość spoza katalogu schodzi do `pending`,
      // czyli do stanu BEZ DOSTĘPU - nigdy w stronę wpuszczenia (`domain/memberships.ts`).
      status: membershipStatusOf(row.status),
      name: row.name,
      email: row.email,
      personActive: row.active,
      requestedAt: new Date(row.created_at),
    };
  }

  /**
   * `pending` → `active` z kodem i rolą.
   *
   * Warunek `status = 'pending'` stoi W ZAPYTANIU, mimo że komenda sprawdza stan przed
   * zapisem: sprawdzenie i `UPDATE` to dwa kroki, a między nimi mieści się decyzja
   * drugiego administratora. Bez tego warunku późniejszy zapis przemalowywałby wynik
   * pierwszej decyzji - z `rejected` na `active` albo odwrotnie - i nikt by tego nie
   * zobaczył. `credentials_valid_from` NIE ruszamy: nie było tokenów do unieważnienia.
   */
  async approve(
    tx: Queryable,
    orgId: string,
    pilotId: string,
    decision: MembershipApproval,
  ): Promise<void> {
    await tx.query(
      `UPDATE memberships
          SET status = 'active',
              code = $3,
              role = $4,
              reject_reason = NULL,
              decided_at = $5,
              decided_by = $6,
              updated_at = now()
        WHERE org_id = $1 AND pilot_id = $2 AND status = 'pending'`,
      [orgId, pilotId, decision.code, decision.role, decision.at.toISOString(), decision.by],
    );
  }

  /** `pending` → `rejected` z powodem; kod zostaje pusty, bo członkostwa nie ma. */
  async reject(
    tx: Queryable,
    orgId: string,
    pilotId: string,
    decision: MembershipRejection,
  ): Promise<void> {
    await tx.query(
      `UPDATE memberships
          SET status = 'rejected',
              reject_reason = $3,
              decided_at = $4,
              decided_by = $5,
              updated_at = now()
        WHERE org_id = $1 AND pilot_id = $2 AND status = 'pending'`,
      [orgId, pilotId, decision.reason, decision.at.toISOString(), decision.by],
    );
  }

  /**
   * `rejected` → `pending`: zgłoszenie wraca do kolejki, a wiersz do stanu „czeka".
   *
   * Kasujemy KOMPLET decyzji - powód, chwilę i autora - bo wiersz opisuje STAN, a nie
   * historię: `decided_at` przy członkostwie `pending` znaczyłoby „rozstrzygnięte
   * i czekające" naraz, a pilot czyta powód na 00D jako zdanie o tym, co jest teraz.
   * Ślad odmowy i jej cofnięcia zostaje w dzienniku audytu (`membership.reject`,
   * `membership.reopen`) - tam, gdzie historia decyzji należy.
   */
  async reopen(tx: Queryable, orgId: string, pilotId: string): Promise<void> {
    await tx.query(
      `UPDATE memberships
          SET status = 'pending',
              reject_reason = NULL,
              decided_at = NULL,
              decided_by = NULL,
              updated_at = now()
        WHERE org_id = $1 AND pilot_id = $2 AND status = 'rejected'`,
      [orgId, pilotId],
    );
  }
}

/** Nazwa chronionego zasobu - jedna, dla wszystkich mutacji zmieniających jego stan. */
const ADMIN_POPULATION_LOCK = 'pilots:admin-population';

/**
 * Porządek listy jest CZĘŚCIĄ KONTRAKTU tego portu, jak przy skrzynce flag: członkostwa
 * NIEAKTYWNE lądują na końcu niezależnie od kierunku sortowania (mockup A06 rysuje
 * je tak), a w obrębie grupy sortujemy po nazwisku. Kod pilota jest tie-breakerem,
 * żeby kolejność była deterministyczna przy dwóch osobach o tym samym nazwisku.
 */
function orderBy(direction: 'asc' | 'desc'): string {
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY (m.status = 'active') DESC, p.name ${dir}, m.code ASC`;
}

function applyFilters(sql: SqlFilter, filter: PilotListFilter): void {
  if (filter.active !== undefined) {
    sql.add(filter.active ? "m.status = 'active'" : "m.status <> 'active'");
  }
  if (filter.roles !== undefined && filter.roles.length > 0) {
    // `IN (…)` z osobnych miejsc na wartości, nie `= ANY ($n)` z tablicą: tablicę
    // trzeba by serializować do literału Postgresa, co jest zachowaniem STEROWNIKA,
    // a testy jadą na PGlite, produkcja na `pg`. Ta sama decyzja co w `auditReadRepo`.
    const holes = filter.roles.map(() => '?').join(', ');
    sql.add(`m.role IN (${holes})`, ...filter.roles);
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
    `(position(lower(?) in lower(m.code)) > 0
      OR position(lower(?) in lower(p.name)) > 0
      OR position(lower(?) in lower(coalesce(p.email, ''))) > 0)`,
    search,
    search,
    search,
  );
}
