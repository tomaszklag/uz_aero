/**
 * UZ Aero (serwer) — dziennik audytu: ZAPIS jako część komendy i ODCZYT dla `A09`.
 *
 * Pierwsza połowa pliku nie sprawdza, że coś się loguje. Sprawdza WŁASNOŚĆ, na której
 * stoi cały mechanizm `AuditedWrite`: skutek i jego ślad są tą samą transakcją, więc
 * zmiana bez śladu nie ma prawa się zapisać, a ślad bez zmiany nie ma prawa powstać.
 *
 * Druga połowa (`GET /admin/api/audit`) sprawdza stronę odczytu — dziennik zapisuje się
 * od przekroju 1 i do tej pory nikt go nie przeczytał. Najważniejszy jest tam przypadek
 * NIEZNANEGO KODU AKCJI: kolumna `action` celowo nie ma `CHECK`-a, więc lista musi
 * pokazać taki wiersz dosłownie, zamiast się nim wywrócić albo go pominąć.
 *
 * Jedyna podmiana w całym pliku to port ZAPISU audytu, który RZUCA — bo awarii zapisu
 * śladu nie da się wywołać inaczej niż awarią zapisu śladu.
 */

import { describe, expect, it } from 'vitest';

import type { AdminAuditPort, AuditListFilter } from '../src/application/admin/ports.ts';
import type { Queryable } from '../src/application/common/ports.ts';
import { PgAdminAuditReadRepo } from '../src/infrastructure/pg/admin/auditReadRepo.ts';
import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  seq += 1;
  return {
    uuid: `a-${seq}-${type}`,
    aircraftId: 'SP-AXA',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    ...base,
  };
}

function openDay(sessionUuid: string, picId: string, mh: number) {
  const base = { sessionUuid, picId };
  return [
    event('session_claim', at(8, 0), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        dutyStart: at(8, 0),
        reading: { fuelL: 150, mh },
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', at(8, 12), {}, base),
    event('takeoff', at(8, 25), { method: 'auto' }, base),
    event('landing', at(9, 18), { method: 'auto' }, base),
    event('engine_stop', at(10, 34), {}, base),
  ];
}

/** Port audytu, który zawsze rzuca — jedyny sposób na wymuszenie awarii ŚLADU. */
const failingAudit: AdminAuditPort = {
  append: () => Promise.reject(new Error('zapis do admin_audit nie powiódł się')),
};

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

function post(app: Harness['app'], token: string, events: unknown[]) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events },
  });
}

function resolve(app: Harness['app'], id: number, token: string, note: string) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/flags/${id}/resolve`,
    headers: { authorization: `Bearer ${token}`, ...ADMIN_CSRF_HEADERS },
    payload: { note },
  });
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    actor_pilot_id: string;
    actor_role: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
    ip: string | null;
    created_at: Date | string;
  }>(
    `SELECT actor_pilot_id, actor_role, action, target_type, target_id, details, ip, created_at
     FROM admin_audit ORDER BY id`,
  );
  return rows;
}

/** Nakładka sesji jak w `adminFlags.test.ts` — flaga blokująca kartę dnia. */
async function overlapping(options: Parameters<typeof testHarness>[0] = {}) {
  const harness = await testHarness(options);
  const { app, db } = harness;
  const tmk = await login(app, 'TMK');
  const krz = await login(app, 'KRZ');

  await post(app, tmk, openDay('sess-1', 'TMK', 1234.5));
  await post(app, krz, openDay('sess-2', 'KRZ', 1236.87));
  await post(app, krz, [
    event(
      'day_close',
      at(16, 45),
      { finalReading: { fuelL: 95, mh: 1237.4 }, dutyEnd: at(16, 45) },
      { sessionUuid: 'sess-2', picId: 'KRZ' },
    ),
  ]);

  const { rows } = await db.query<{ id: number }>("SELECT id FROM flags WHERE status = 'open'");
  return { ...harness, flagId: rows[0]!.id };
}

async function flagStatus(db: Harness['db'], id: number): Promise<string> {
  const { rows } = await db.query<{ status: string }>('SELECT status FROM flags WHERE id = $1', [id]);
  return rows[0]!.status;
}

describe('audyt wymuszony typem, nie dyscypliną', () => {
  it('AWARIA AUDYTU cofa skutek — flaga zostaje `open`, karta dnia nie powstaje', async () => {
    // To jest test, który dowodzi zdania „zmiana bez śladu nie ma prawa się zapisać".
    // Bez niego `AuditedWrite` byłby wyłącznie obietnicą złożoną w docblocku.
    const { app, db, flagId } = await overlapping({ audit: failingAudit });
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId, admin, 'Wyjaśnione, odblokowuję kartę.');

    expect(res.statusCode).toBe(500);
    expect(await flagStatus(db, flagId)).toBe('open');

    // Skutek uboczny też nie zaszedł: eksport rusza dopiero PO commicie, którego
    // nie było. Karta ze stanu, który się nie zapisał, byłaby najgorszym wynikiem.
    const { rows: exports } = await db.query('SELECT 1 FROM export_log');
    expect(exports).toHaveLength(0);
  });

  it('NIEUDANY SKUTEK nie zostawia śladu — odbita próba nie dopisuje wiersza', async () => {
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');
    const trainingLead = await login(app, 'AKO');

    await resolve(app, flagId, admin, 'Pierwsze rozstrzygnięcie.');
    const second = await resolve(app, flagId, trainingLead, 'Drugie rozstrzygnięcie.');
    expect(second.statusCode).toBe(409);

    // Dokładnie JEDEN wiersz: druga próba przerwała transakcję przed wpisem, więc
    // dziennik nie zna akcji, która się nie odbyła.
    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_pilot_id: 'TMK' });
  });

  it('wpis niesie aktora, jego rolę, akcję i identyfikator flagi', async () => {
    const { app, db, flagId } = await overlapping();
    const trainingLead = await login(app, 'AKO');

    await resolve(app, flagId, trainingLead, 'Nakładka pozorna — dane dosłane z kopii.');

    expect(await auditRows(db)).toMatchObject([
      {
        actor_pilot_id: 'AKO',
        actor_role: 'training_lead',
        action: 'flag.resolve',
        target_type: 'flag',
        target_id: String(flagId),
        details: {
          note: 'Nakładka pozorna — dane dosłane z kopii.',
          type: 'session_overlap',
          sessionUuids: ['sess-1', 'sess-2'],
        },
      },
    ]);
  });

  it('`actor_role` to rola Z CHWILI AKCJI — późniejsza zmiana konta jej nie przepisuje', async () => {
    // Dziennik jest zapisem historycznym, nie złączeniem z `pilots`. Gdyby rola szła
    // z konta przy odczycie, odebranie uprawnień zafałszowałoby odpowiedź na pytanie
    // „kto miał wtedy prawo to zrobić" — czyli jedyne, po co ten dziennik istnieje.
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    await resolve(app, flagId, admin, 'Rozstrzygnięte przez administratora.');
    await db.query("UPDATE pilots SET role = 'pilot' WHERE id = 'TMK'");

    expect((await auditRows(db))[0]).toMatchObject({ actor_pilot_id: 'TMK', actor_role: 'admin' });
  });
});

// ══ ODCZYT DZIENNIKA (`GET /admin/api/audit`, ekran A09) ═══════════════════════════

/** Stempel: `dayOffset` dni względem `DAY`, godzina UTC. */
const stamp = (dayOffset: number, h: number, m: number): Date =>
  new Date(DAY + dayOffset * 24 * 60 * 60_000 + (h * 60 + m) * 60_000);

interface AuditSeed {
  actor: string;
  role: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  at: Date;
}

/**
 * Wiersze wstawiamy WPROST do tabeli, a nie przez komendy panelu — i to jest właściwa
 * droga dla testów ODCZYTU. Strona zapisu ma własne przypadki wyżej; tutaj potrzebny
 * jest dziennik o znanym kształcie, obejmujący kilka dni, kilku aktorów i — przede
 * wszystkim — kod akcji SPOZA katalogu, którego żadna komenda nie umie wyprodukować.
 */
async function seedAudit(db: Harness['db'], rows: readonly AuditSeed[]): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO admin_audit
         (actor_pilot_id, actor_role, action, target_type, target_id, details, ip, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.actor,
        row.role,
        row.action,
        row.targetType,
        row.targetId,
        JSON.stringify(row.details),
        row.ip,
        row.at,
      ],
    );
  }
}

const JOURNAL: readonly AuditSeed[] = [
  {
    actor: 'TMK',
    role: 'admin',
    action: 'pilot.create',
    targetType: 'pilot',
    targetId: 'MBK',
    details: { code: 'MBK', role: 'pilot' },
    ip: '10.20.4.11',
    at: stamp(-2, 9, 0),
  },
  {
    actor: 'TMK',
    role: 'admin',
    action: 'aircraft.update',
    targetType: 'aircraft',
    targetId: 'SP-KLM',
    details: { capacityL: { from: 1240, to: 1257 } },
    ip: '10.20.4.11',
    at: stamp(-1, 10, 0),
  },
  {
    actor: 'AKO',
    role: 'training_lead',
    action: 'flag.resolve',
    targetType: 'flag',
    targetId: '1044',
    details: { note: 'Przeloty techniczne po przeglądzie.', type: 'mh_gap', sessionUuids: ['sess-1'] },
    ip: '10.20.4.63',
    at: stamp(0, 8, 30),
  },
  {
    actor: 'TMK',
    role: 'admin',
    action: 'event.correct',
    targetType: 'event',
    targetId: 'evt-9a01',
    details: {
      sessionUuid: 'sess-1',
      correctionUuid: 'corr-1',
      action: 'retime',
      newTime: DAY + 11 * 60 * 60_000,
      reason: 'Lądowanie wykryte 3 min po dobiegu.',
    },
    ip: '10.20.4.11',
    at: stamp(0, 11, 2),
  },
  {
    actor: 'TMK',
    role: 'admin',
    action: 'export.retry',
    targetType: 'sheet',
    targetId: '2026-06-21_SP-KLM',
    details: { revision: 3 },
    // Akcja spoza żądania HTTP (skrypt administracyjny) — `ip` jest NULL-owalne
    // właśnie dla tego przypadku, a wymyślony adres byłby gorszy niż jego brak.
    ip: null,
    at: stamp(0, 14, 19),
  },
  {
    // KOD SPOZA KATALOGU i konto, którego nie ma w `pilots` — jeden wiersz, dwie
    // rzeczy, które nie mają prawa wywrócić listy ani z niej zniknąć.
    actor: 'ZZZ',
    role: 'superadmin',
    action: 'pilot.merge',
    targetType: 'pilot',
    targetId: 'XYZ',
    details: { note: 'Wpis historyczny — akcja wycofana z katalogu.' },
    ip: null,
    at: stamp(0, 15, 0),
  },
];

interface AuditEntryWire {
  id: number;
  createdAt: string;
  actorPilotId: string;
  actorCode: string | null;
  actorName: string | null;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
}

function getAudit(app: Harness['app'], token: string | null, query = '') {
  return app.inject({
    method: 'GET',
    url: `/admin/api/audit${query}`,
    ...(token == null ? {} : { headers: { authorization: `Bearer ${token}` } }),
  });
}

/** Harness z dziennikiem o znanym kształcie i tokenem administratora. */
async function journal() {
  const harness = await testHarness();
  await seedAudit(harness.db, JOURNAL);
  return { ...harness, admin: await login(harness.app, 'TMK') };
}

const actionsOf = (body: { items: AuditEntryWire[] }): string[] =>
  body.items.map((item) => item.action);

describe('dziennik audytu — strona odczytu (A09)', () => {
  it('domyślnie NAJNOWSZE na górze, z nazwiskiem aktora ze złączenia', async () => {
    const { app, admin } = await journal();

    const res = await getAudit(app, admin);
    expect(res.statusCode).toBe(200);

    const body = res.json() as { items: AuditEntryWire[]; nextCursor: string | null; total: number };
    expect(body.total).toBe(6);
    expect(body.nextCursor).toBeNull();
    expect(actionsOf(body)).toEqual([
      'pilot.merge',
      'export.retry',
      'event.correct',
      'flag.resolve',
      'aircraft.update',
      'pilot.create',
    ]);

    expect(body.items[3]).toMatchObject({
      actorPilotId: 'AKO',
      actorCode: 'AKO',
      actorName: 'Anna Kowalska',
      actorRole: 'training_lead',
      targetType: 'flag',
      targetId: '1044',
      ip: '10.20.4.63',
      details: { type: 'mh_gap', sessionUuids: ['sess-1'] },
    });
  });

  it('NIEZNANY KOD AKCJI nie wywraca odczytu — wiersz wraca dosłownie', async () => {
    // To jest przypadek, dla którego migracja 9 świadomie nie ma `CHECK`-a na `action`
    // (komentarz nad `MIGRATION_9`). Strażnik przy odczycie znaczyłby, że dziennik
    // nadzoru przestaje się otwierać przez własną historię; ciche pominięcie wiersza
    // znaczyłoby, że zaczyna ukrywać wpisy. Obie odpowiedzi są gorsze od surowego kodu.
    const { app, admin } = await journal();

    const body = (await getAudit(app, admin)).json() as { items: AuditEntryWire[] };
    expect(body.items[0]).toMatchObject({
      action: 'pilot.merge',
      actorPilotId: 'ZZZ',
      // Konta nie ma w `pilots`, więc `LEFT JOIN` nie ma czego dołożyć — a wpis
      // zostaje widoczny z samym identyfikatorem, zamiast wypaść z listy.
      actorCode: null,
      actorName: null,
      // Rola też jest napisem historycznym: `superadmin` nie istnieje w katalogu ról.
      actorRole: 'superadmin',
    });
  });

  it('filtruje po JEDNEJ akcji i po GRUPIE akcji (parametr powtarzalny)', async () => {
    const { app, admin } = await journal();

    const one = (await getAudit(app, admin, '?action=flag.resolve')).json() as {
      items: AuditEntryWire[];
      total: number;
    };
    expect(actionsOf(one)).toEqual(['flag.resolve']);
    expect(one.total).toBe(1);

    // Chip „Konfiguracja" na ekranie to kilka kodów katalogu naraz — stąd parametr
    // powtarzalny, a nie pojedyncza wartość.
    const group = (
      await getAudit(app, admin, '?action=pilot.create&action=aircraft.update')
    ).json() as { items: AuditEntryWire[]; total: number };
    expect(actionsOf(group)).toEqual(['aircraft.update', 'pilot.create']);
    expect(group.total).toBe(2);
  });

  it('NIEZNANA wartość filtra to 400, nie ciche zignorowanie', async () => {
    // Wiersz z akcją `pilot.merge` W BAZIE jest (poprzedni przypadek), ale PYTANIE
    // o kod spoza katalogu nie ma poprawnej odpowiedzi. Ciche pominięcie parametru
    // pokazałoby pełny dziennik pod etykietą zawężenia — czyli skłamałoby o tym,
    // na co człowiek patrzy. Od tego istnieje `isAdminAction`.
    const { app, admin } = await journal();

    expect((await getAudit(app, admin, '?action=pilot.merge')).statusCode).toBe(400);
    expect((await getAudit(app, admin, '?action=cokolwiek')).statusCode).toBe(400);
    // Jedna zła wartość w grupie wywraca CAŁE żądanie — częściowe zawężenie byłoby
    // odpowiedzią na pytanie, którego nikt nie zadał.
    expect((await getAudit(app, admin, '?action=flag.resolve&action=nie.ma')).statusCode).toBe(400);
  });

  it('filtruje po aktorze oraz po TYPIE I IDENTYFIKATORZE obiektu', async () => {
    const { app, admin } = await journal();

    const byActor = (await getAudit(app, admin, '?actor=AKO')).json() as { items: AuditEntryWire[] };
    expect(actionsOf(byActor)).toEqual(['flag.resolve']);

    // To jest wejście z kontekstem, którego wymaga ekran korekty („ślad w audycie
    // → A09"): filtr po OBIEKCIE, nie surowa lista wszystkiego.
    const byTarget = (await getAudit(app, admin, '?targetType=event&targetId=evt-9a01')).json() as {
      items: AuditEntryWire[];
      total: number;
    };
    expect(byTarget.total).toBe(1);
    expect(byTarget.items[0]).toMatchObject({
      action: 'event.correct',
      details: { sessionUuid: 'sess-1', action: 'retime' },
    });

    // Sam typ obiektu też jest pytaniem sensownym („wszystko, co robiono na kontach").
    const byType = (await getAudit(app, admin, '?targetType=pilot')).json() as {
      items: AuditEntryWire[];
    };
    expect(actionsOf(byType)).toEqual(['pilot.merge', 'pilot.create']);
  });

  it('zakres dat jest obustronnie DOMKNIĘTY — `to` obejmuje całą dobę', async () => {
    const { app, admin } = await journal();

    const oneDay = (await getAudit(app, admin, '?from=2026-06-22&to=2026-06-22')).json() as {
      items: AuditEntryWire[];
      total: number;
    };
    // Wpis o 15:00 UTC mieści się w `to=2026-06-22`; gdyby granicą była północ,
    // dzień gubiłby wszystko po niej.
    expect(oneDay.total).toBe(4);
    expect(actionsOf(oneDay)).toEqual([
      'pilot.merge',
      'export.retry',
      'event.correct',
      'flag.resolve',
    ]);

    const older = (await getAudit(app, admin, '?to=2026-06-21')).json() as {
      items: AuditEntryWire[];
    };
    expect(actionsOf(older)).toEqual(['aircraft.update', 'pilot.create']);
  });

  it('KURSOR keyset przechodzi granicę strony bez luk i bez dubli', async () => {
    const { app, admin } = await journal();

    const first = (await getAudit(app, admin, '?limit=2')).json() as {
      items: AuditEntryWire[];
      nextCursor: string | null;
      total: number;
    };
    expect(actionsOf(first)).toEqual(['pilot.merge', 'export.retry']);
    expect(first.nextCursor).not.toBeNull();
    // `total` opisuje CAŁY wynik filtra, a nie stronę — inaczej licznik „pokazano 2
    // z 6" nie miałby skąd wziąć drugiej liczby.
    expect(first.total).toBe(6);

    const second = (await getAudit(
      app,
      admin,
      `?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
    )).json() as { items: AuditEntryWire[]; nextCursor: string | null; total: number | null };
    expect(actionsOf(second)).toEqual(['event.correct', 'flag.resolve']);
    // Licznika NIE MA na kolejnych stronach i to jest decyzja, nie brak: liczba wpisów
    // w zawężeniu jest własnością ZAPYTANIA, nie strony, więc płacimy za nią raz —
    // pełny `COUNT(*)` na dzienniku bez górnej granicy jest wielokrotnie droższy od
    // samej strony i rośnie liniowo, czyli odbiera kursorowi to, po co istnieje.
    // `null` to „nie pytaliśmy", nigdy „zero"; wartość z pierwszej strony niesie panel.
    expect(second.total).toBeNull();

    const third = (await getAudit(
      app,
      admin,
      `?limit=2&cursor=${encodeURIComponent(second.nextCursor!)}`,
    )).json() as { items: AuditEntryWire[]; nextCursor: string | null };
    expect(actionsOf(third)).toEqual(['aircraft.update', 'pilot.create']);
    // `null` znaczy „to był koniec", a nie „spróbuj jeszcze raz".
    expect(third.nextCursor).toBeNull();

    // Identyfikatory nie powtarzają się i nie brakuje żadnego — to jest cała
    // odpowiedź na pytanie, po co kursor zamiast `OFFSET`.
    const ids = [...first.items, ...second.items, ...third.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(6);
  });

  it('kursor DOPISANY w trakcie przeglądania nie przesuwa granicy strony', async () => {
    // Dziennik rośnie, gdy się go czyta — administrator klika w panelu, a inny
    // administrator właśnie coś zmienia. `OFFSET 2` pokazałby wtedy drugą stronę
    // przesuniętą o jeden wiersz, czyli ZGUBIŁ jeden wpis. Kursor opisuje pozycję
    // w porządku, więc nowy wiersz na górze go nie dotyczy.
    const { app, db, admin } = await journal();

    const first = (await getAudit(app, admin, '?limit=2')).json() as {
      items: AuditEntryWire[];
      nextCursor: string | null;
    };

    await seedAudit(db, [
      {
        actor: 'TMK',
        role: 'admin',
        action: 'maintenance.rebuild_projections',
        targetType: null,
        targetId: null,
        details: { sessions: 12 },
        ip: '10.20.4.11',
        at: stamp(1, 9, 0),
      },
    ]);

    const second = (await getAudit(
      app,
      admin,
      `?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
    )).json() as { items: AuditEntryWire[] };
    expect(actionsOf(second)).toEqual(['event.correct', 'flag.resolve']);
  });

  it('porządek rosnący na żądanie; zepsuty kursor to 400, nie 500', async () => {
    const { app, admin } = await journal();

    const asc = (await getAudit(app, admin, '?sort=asc&limit=2')).json() as {
      items: AuditEntryWire[];
    };
    expect(actionsOf(asc)).toEqual(['pilot.create', 'aircraft.update']);

    const broken = await getAudit(app, admin, '?cursor=to-nie-jest-kursor');
    expect(broken.statusCode).toBe(400);
    expect(broken.json()).toMatchObject({ error: 'bad_cursor' });
  });

  it('kursor SPARSOWANY, ale niezgodny z kolumnami, też daje 400 — nie 500 z SQL-a', async () => {
    // Napis niebędący base64/JSON-em to najłatwiejszy przypadek i sam w sobie nic nie
    // dowodzi: kursor jest JSON-em, więc dziury są W ŚRODKU. Każda z poniższych
    // wartości jest poprawnym JSON-em, przechodziła walidację „czy da się sparsować"
    // i wywracała się dopiero w Postgresie — a administrator dostawał wtedy 500
    // z treścią błędu SQL-a zamiast 400.
    const { app, admin } = await journal();

    const cursor = (payload: Record<string, unknown>): string =>
      encodeURIComponent(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'));

    const stamp = '2026-06-22T14:19:02.000Z';
    const cases: Record<string, string> = {
      // `created_at` jest TIMESTAMPTZ — dowolny napis leciał wprost do bazy (22007).
      'k1 nie jest stemplem czasu': cursor({ k1: 'wczoraj', k2: '3', d: 'desc' }),
      'k1 jest liczbą, nie stemplem': cursor({ k1: 1_780_000_000_000, k2: '3', d: 'desc' }),
      // `created_at` jest NOT NULL, a `keysetPredicate` na takim kluczu RZUCA.
      'k1 jest NULL-em na kolumnie NOT NULL': cursor({ k1: null, k2: '3', d: 'desc' }),
      // `id` jest BIGSERIAL — „abc" kończyło się błędem 22P02.
      'k2 nie jest liczbą': cursor({ k1: stamp, k2: 'abc', d: 'desc' }),
    };

    // Zbieramy WSZYSTKIE odpowiedzi, zamiast padać na pierwszej: każda pozycja to inna
    // dziura i test ma powiedzieć, ile ich zostało, a nie którą znalazł najpierw.
    const status: Record<string, number> = {};
    const errors: Record<string, unknown> = {};
    for (const [what, value] of Object.entries(cases)) {
      const res = await getAudit(app, admin, `?cursor=${value}`);
      status[what] = res.statusCode;
      errors[what] = res.json();
    }

    expect(status).toEqual({
      'k1 nie jest stemplem czasu': 400,
      'k1 jest liczbą, nie stemplem': 400,
      'k1 jest NULL-em na kolumnie NOT NULL': 400,
      'k2 nie jest liczbą': 400,
    });
    for (const body of Object.values(errors)) {
      expect(body).toMatchObject({ error: 'bad_cursor' });
    }
  });

  it('kursor wydany dla `desc` użyty przy `sort=asc` to 400, nie niespójna strona', async () => {
    // Kursor opisuje POZYCJĘ W PORZĄDKU. Ten sam klucz w porządku odwrotnym opisuje
    // co innego niż mówi — strona wychodzi wewnętrznie niespójna, a niespójna strona
    // wygląda jak dane, nie jak awaria. Dlatego kierunek jedzie W KURSORZE i jest
    // sprawdzany przy odczycie. Z panelu nieosiągalne; to dziura kontraktu HTTP.
    const { app, admin } = await journal();

    const first = (await getAudit(app, admin, '?limit=2')).json() as { nextCursor: string | null };
    const cursor = encodeURIComponent(first.nextCursor!);

    expect((await getAudit(app, admin, `?limit=2&cursor=${cursor}`)).statusCode).toBe(200);

    const flipped = await getAudit(app, admin, `?sort=asc&limit=2&cursor=${cursor}`);
    expect(flipped.statusCode).toBe(400);
    expect(flipped.json()).toMatchObject({ error: 'bad_cursor' });
  });

  it('GRANICA STRONY przy IDENTYCZNYM `created_at` — bez luk i bez dubli', async () => {
    // To jest własność, dla której kursor w ogóle jest PARĄ kluczy. Wpisy z jednej
    // sekundy nie są przypadkiem brzegowym: `AuditedWrite` stempluje wiersz zegarem
    // serwera, więc dwie akcje z jednego kliknięcia (albo z jednego skryptu) mają ten
    // sam `created_at` co do milisekundy. Bez tie-breakera `id` porządek między nimi
    // byłby nieokreślony, a kursor po pierwszej stronie albo GUBIŁBY wiersz, albo
    // pokazywał go drugi raz — i jedno, i drugie wyglądałoby na poprawną listę.
    const harness = await testHarness();
    const admin = await login(harness.app, 'TMK');

    const sameMoment = stamp(0, 12, 0);
    await seedAudit(
      harness.db,
      ['pilot.create', 'pilot.update', 'pilot.deactivate', 'aircraft.create', 'export.retry'].map(
        (action, i) => ({
          actor: 'TMK',
          role: 'admin',
          action,
          targetType: 'pilot',
          targetId: `P-${i}`,
          details: {},
          ip: null,
          at: sameMoment,
        }),
      ),
    );

    const seen: number[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const query = `?limit=2${cursor == null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const page = (await getAudit(harness.app, admin, query)).json() as {
        items: AuditEntryWire[];
        nextCursor: string | null;
      };
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      guard += 1;
    } while (cursor != null && guard < 10);

    // Wszystkie wiersze, każdy dokładnie raz — i wszystkie mają ten sam stempel,
    // więc rozstrzygnął wyłącznie tie-breaker.
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);

    const { rows } = await harness.db.query<{ id: string | number; created_at: Date | string }>(
      'SELECT id, created_at FROM admin_audit ORDER BY id',
    );
    expect(new Set(rows.map((r) => new Date(r.created_at).getTime())).size).toBe(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(rows.map((r) => Number(r.id)));
  });

  it('audyt czyta WYŁĄCZNIE administrator — szef wyszkolenia dostaje 403', async () => {
    // `domain/roles.ts` nie daje `audit.read` roli `training_lead` i to jest decyzja,
    // nie luka: rozstrzyganie rozbieżności to inna odpowiedzialność niż nadzór nad
    // administratorami. Panel ma tę pozycję nawigacji POKAZAĆ i zablokować z powodem,
    // więc odpowiedź musi nieść, KTÓREJ zdolności zabrakło.
    const { app } = await journal();
    const trainingLead = await login(app, 'AKO');
    const pilot = await login(app, 'PWI');

    const lead = await getAudit(app, trainingLead);
    expect(lead.statusCode).toBe(403);
    expect(lead.json()).toMatchObject({ required: 'audit.read' });

    expect((await getAudit(app, pilot)).statusCode).toBe(403);
    expect((await getAudit(app, null)).statusCode).toBe(401);
  });
});

// ══ PLAN ZAPYTAŃ (`idx_audit_created`, `idx_audit_actor`, migracja 12) ═════════════

/**
 * Nagrywa SQL, który adapter FAKTYCZNIE wysyła do bazy. Plan sprawdzamy dla tego
 * zapytania, a nie dla przepisanego ręcznie w teście — inaczej test przybijałby własny
 * SQL, a zapytanie adaptera mogłoby się rozjechać z indeksem bez żadnego sygnału.
 */
function recorder(db: Queryable): { spy: Queryable; sent: { text: string; params: unknown[] }[] } {
  const sent: { text: string; params: unknown[] }[] = [];
  const spy: Queryable = {
    query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }> {
      sent.push({ text, params: params ?? [] });
      return db.query<R>(text, params);
    },
  };
  return { spy, sent };
}

/** Zapytanie STRONY (to z `ORDER BY`), w odróżnieniu od `COUNT(*)`. */
const pageQuery = (sent: { text: string; params: unknown[] }[]) =>
  sent.find((q) => q.text.includes('ORDER BY'))!;

async function planOf(db: Queryable, filter: AuditListFilter): Promise<string> {
  const { spy, sent } = recorder(db);
  await new PgAdminAuditReadRepo().list(spy, filter);

  const page = pageQuery(sent);
  const { rows } = await db.query<Record<string, string>>(`EXPLAIN ${page.text}`, page.params);
  return rows.map((row) => Object.values(row).join(' ')).join('\n');
}

describe('porządek dziennika daje INDEKS, nie sortowanie w pamięci', () => {
  /**
   * Wsyp dużo wierszy i `ANALYZE` — bez jednego i drugiego planer wybiera `Seq Scan`
   * niezależnie od indeksów (na kilku wierszach jest po prostu tańszy), więc test
   * przechodziłby albo padał z powodu, który nie ma nic wspólnego z badaną własnością.
   */
  async function bigJournal() {
    const harness = await testHarness();
    await harness.db.query(
      `INSERT INTO admin_audit
         (actor_pilot_id, actor_role, action, target_type, target_id, details, ip, created_at)
       SELECT CASE WHEN g % 4 = 0 THEN 'TMK' ELSE 'AKO' END,
              'admin', 'flag.resolve', 'flag', g::text, '{}'::jsonb, NULL,
              TIMESTAMPTZ '2026-01-01 00:00:00+00' + (g * INTERVAL '1 second')
         FROM generate_series(1, 4000) AS g`,
    );
    await harness.db.query('ANALYZE admin_audit');
    await harness.db.query('ANALYZE pilots');
    return harness;
  }

  const filter = (over: Partial<AuditListFilter> = {}): AuditListFilter => ({
    direction: 'desc',
    limit: 50,
    ...over,
  });

  it.each(['desc', 'asc'] as const)(
    'pierwsza strona BEZ filtra (`%s`) idzie indeksem — w planie nie ma węzła `Sort`',
    async (direction) => {
      // To jest wykonywalna postać zdania z migracji 12. Dopóki istniało wyłącznie
      // w prozie, ta sama wada zdążyła się powielić na drugi indeks, a potem na rejestr
      // zdarzeń — za każdym razem w postaci „naprawmy indeks pod `NULLS LAST`".
      //
      // OBA KIERUNKI, bo naprawa migracji 12 działała tylko dla `desc`: indeks
      // `created_at DESC NULLS LAST` skanowany wstecz daje `ASC NULLS FIRST`, a zapytanie
      // prosiło o `ASC NULLS LAST`. Zmierzone na 4 000 wierszy: `?sort=asc` sortował CAŁY
      // dziennik przed `LIMIT`-em, koszt 527 zamiast 5,3. Migracja 17 zdejmuje `NULLS
      // LAST` z indeksów kolumn `NOT NULL`, a `keysetOrderBy` przestaje go emitować —
      // wtedy jeden indeks obsługuje oba kierunki.
      const { db } = await bigJournal();

      const plan = await planOf(db, filter({ direction }));
      expect(plan).not.toMatch(/Sort/);
      expect(plan).toContain('idx_audit_created');
    },
  );

  it.each(['desc', 'asc'] as const)(
    'zawężenie po AKTORZE (`%s`) idzie własnym indeksem — też bez `Sort`',
    async (direction) => {
      // Kolumna „Kto" na `A09` jest linkiem, więc to najczęstsze zawężenie ekranu.
      // `idx_audit_actor` z migracji 9 nie miał ani `id`, ani porządku pasującego do
      // zapytania, więc planer schodził na indeks czasu z filtrem albo na `Seq Scan`:
      // PIERWSZA strona zawężenia kosztowała tyle, co cały dziennik.
      const { db } = await bigJournal();

      const plan = await planOf(db, filter({ direction, actorPilotId: 'TMK' }));
      expect(plan).not.toMatch(/Sort/);
      expect(plan).toContain('idx_audit_actor');
    },
  );

  it('kontrola samego testu: `Sort` w planie faktycznie DA SIĘ zobaczyć', async () => {
    // Bez tego cztery asercje wyżej przechodziłyby także wtedy, gdyby wzorzec nigdy
    // nie mógł trafić — a to jest test, który raz już przepuścił tę wadę.
    const { db } = await bigJournal();
    const { rows } = await db.query<Record<string, string>>(
      `EXPLAIN SELECT id FROM admin_audit ORDER BY details::text, id LIMIT 50`,
    );
    expect(rows.map((r) => Object.values(r).join(' ')).join('\n')).toMatch(/Sort/);
  });
});

describe('zakres dat: data NIEISTNIEJĄCA to 400, nie cichy inny okres', () => {
  // `Date.UTC` nie waliduje, tylko PRZEWIJA — `Date.UTC(2026, 12, 45)` to 14 lutego
  // 2027. Kształt `YYYY-MM-DD` przepuszczał więc `2026-13-45`, a trasa odpowiadała 200
  // na zakres cofnięty o ponad pół roku. W narzędziu nadzoru to najgorszy tryb awarii:
  // nie ma komunikatu ani pustej listy, jest wiarygodnie wyglądająca odpowiedź
  // o INNYM okresie, a administrator sprawdzający „czy w lipcu czegoś nie
  // przegapiliśmy" dostawał luty i nie miał jak tego zauważyć.
  //
  // Parser jest wspólny (`http/routes/admin/dayRange.ts`), więc ten przypadek broni
  // także listy dni (`A02`) i eksportów (`A05`).
  it.each([
    ['2026-13-45', 'miesiąc i dzień poza kalendarzem'],
    ['2026-02-30', 'luty bez trzydziestego'],
    ['2026-00-10', 'miesiąc zerowy'],
    ['2026-12-32', 'dzień poza grudniem'],
  ])('%s → 400 (%s)', async (day) => {
    const { app, admin } = await journal();
    expect((await getAudit(app, admin, `?from=${day}`)).statusCode).toBe(400);
    expect((await getAudit(app, admin, `?to=${day}`)).statusCode).toBe(400);
  });

  it('data ISTNIEJĄCA nadal przechodzi — łącznie z 29 lutego roku przestępnego', async () => {
    // Kontrola samego przypadku wyżej: gdyby round-trip odrzucał wszystko, cztery
    // asercje `400` przechodziłyby przy zepsutym parserze.
    const { app, admin } = await journal();
    expect((await getAudit(app, admin, '?from=2024-02-29')).statusCode).toBe(200);
    expect((await getAudit(app, admin, '?from=2026-07-01&to=2026-07-31')).statusCode).toBe(200);
  });

  it('rok trzycyfrowy przechodzi tak samo jak w panelu — 400 tylko przy dacie NIEISTNIEJĄCEJ', async () => {
    // `Date.UTC(y, m-1, d)` mapuje lata 0–99 na 1900 + rok, więc `0099-01-01` wracało
    // czterysetką, choć panel ten sam napis PRZEPUSZCZAŁ (waliduje parsowaniem ISO).
    // Skutek na ekranie był mylący podwójnie: baner „Panel działa wyłącznie online",
    // czyli komunikat o SIECI przy błędzie walidacji zakresu dat. Obie strony liczą
    // teraz tym samym mechanizmem — lustro: `admin/src/screens/events/eventsFilters.ts`.
    const { app, admin } = await journal();
    expect((await getAudit(app, admin, '?from=0099-01-01')).statusCode).toBe(200);
    expect((await getAudit(app, admin, '?from=0001-01-01&to=0001-12-31')).statusCode).toBe(200);
  });
});
