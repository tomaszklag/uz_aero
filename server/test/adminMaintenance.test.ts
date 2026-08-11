/**
 * UZ Aero (serwer) — operacje serwisowe panelu (`A11-konserwacja.html`).
 *
 * Maszyneria przebudowy projekcji leżała w repozytorium od przekroju 2 z testami i BEZ
 * ANI JEDNEJ TRASY. Ten plik jest pierwszym wywołaniem jej drogą produkcyjną, więc
 * przypadki idą przez `app.inject` na PGlite — z prawdziwą bramą uprawnień, prawdziwym
 * `AuditedWrite` i prawdziwym CSRF. Dni powstają przez `POST /events`, żeby porównywać
 * się z projekcją, którą naprawdę zapisuje ingest, a nie z tą, którą test sobie wyobraża.
 *
 * Najważniejszy przypadek to pierwszy: przebudowa NIE ZNAJDUJE różnic. Narzędzie, które
 * przy każdym uruchomieniu melduje dryf, przestaje cokolwiek znaczyć.
 */

import { describe, expect, it } from 'vitest';

import { PURGE_TOKENS_CONFIRMATION } from '../src/application/admin/commands/maintenance.ts';
import type {
  RebuildReport,
  RefreshTokenScanDto,
  SchemaStateDto,
  TokenPurgeReport,
} from '../src/application/admin/contracts/maintenance.ts';
import type { EventsStorePort } from '../src/application/common/ports.ts';
import { PROJECTION_DIFF_LIMIT } from '../src/application/admin/projectionScan.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/infrastructure/pg/schema.ts';
import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(type: string, time: number, payload: Record<string, unknown>) {
  seq += 1;
  return {
    uuid: `m-${seq}-${type}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

const fullDay = () => [
  event('session_claim', at(7, 50), { mode: 'free' }),
  event('preflight_confirm', at(8, 0), {
    operation: 'skoki',
    departureIcao: 'EPKK',
    arrivalIcao: null,
    dutyStart: at(8, 0),
    reading: { fuelL: 150, mh: 1234.5 },
    client: 'SKY CAMP',
    mhFormat: 'hhmm',
  }),
  event('engine_start', at(8, 12), {}),
  event('takeoff', at(8, 25), { method: 'auto' }),
  event('landing', at(9, 18), { method: 'auto' }),
  event('engine_stop', at(10, 34), {}),
  event('day_close', at(16, 45), {
    finalReading: { fuelL: 88, mh: 1241.15 },
    dutyEnd: at(16, 45),
  }),
];

/**
 * `count` sesji o JEDNYM zdarzeniu każda — tyle wystarcza, żeby projekcja miała wiersz,
 * a `sessionUuids` (czytające `DISTINCT session_uuid FROM events`) je zobaczyło.
 *
 * Uuidy są dopełnione zerami, bo skan idzie `ORDER BY session_uuid`: dzięki temu wiadomo
 * DOKŁADNIE, które sesje wejdą do limitu, a które zostaną — inaczej asercja o „reszcie"
 * zależałaby od porządku leksykograficznego liczb.
 */
function manySessions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    uuid: `bulk-${String(i).padStart(4, '0')}-claim`,
    sessionUuid: `bulk-${String(i).padStart(4, '0')}`,
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type: 'session_claim',
    deviceTime: DAY + i * 1000,
    gpsTime: DAY + i * 1000,
    payload: { mode: 'free' },
    schemaVersion: 1,
  }));
}

type Harness = Awaited<ReturnType<typeof testHarness>>;

/**
 * Zestaw z jednym pełnym dniem lotnym w rejestrze i zalogowanym administratorem.
 *
 * `login` to `TMK` z ziarna (`infrastructure/pg/seed.ts`) — konto z rolą `admin`,
 * czyli jedyną, która ma dziś `maintenance.run`.
 */
async function withDay(options: Parameters<typeof testHarness>[0] = {}) {
  const harness = await testHarness(options);
  const login = await harness.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: 'TMK', password: TEST_PASSWORD },
  });
  const token = login.json().token as string;

  await harness.app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events: fullDay() },
  });

  const admin = { authorization: `Bearer ${token}` };
  const compare = async (): Promise<RebuildReport> => {
    const res = await harness.app.inject({
      method: 'GET',
      url: '/admin/api/maintenance/projections/compare',
      headers: admin,
    });
    expect(res.statusCode).toBe(200);
    return res.json() as RebuildReport;
  };
  const rebuild = async (payload: Record<string, unknown>) =>
    harness.app.inject({
      method: 'POST',
      url: '/admin/api/maintenance/projections/rebuild',
      headers: { ...admin, ...ADMIN_CSRF_HEADERS },
      payload,
    });

  return { ...harness, admin, compare, rebuild };
}

async function projectionOf(db: Harness['db']) {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM sessions WHERE session_uuid = $1',
    ['sess-1'],
  );
  return rows[0]!;
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    action: string;
    details: Record<string, unknown>;
    target_type: string | null;
    target_id: string | null;
  }>('SELECT action, target_type, target_id, details FROM admin_audit ORDER BY id');
  return rows;
}

describe('A11 · porównanie projekcji: ZAPYTANIE, nie komenda', () => {
  it('na zdrowej bazie melduje ZERO różnic — i to jest wynik oczekiwany', async () => {
    const { compare } = await withDay();

    expect(await compare()).toMatchObject({
      mode: 'dry_run',
      sessions: 1,
      rowsDiffering: 0,
      fieldsDiffering: 0,
      written: 0,
      diffs: [],
    });
  });

  it('NICZEGO NIE ZAPISUJE i NIE ZOSTAWIA ŚLADU W AUDYCIE', async () => {
    // To jest przypadek, dla którego porównanie przestało być trybem komendy.
    // Do 2026-08-02 `dry_run` szedł przez `AuditedWrite`, więc każdy podgląd dopisywał
    // wiersz do `admin_audit` — dziennik nadzoru opisywał wtedy akcje, których nie było.
    const { db, compare } = await withDay();

    // Symulujemy dryf tak, jak mógłby powstać naprawdę: ręczny `UPDATE` w bazie,
    // czyli poza wszystkim, co robi serwer.
    await db.query('UPDATE sessions SET flights_count = 6, block_ms = 111 WHERE session_uuid = $1', [
      'sess-1',
    ]);

    const report = await compare();
    expect(report).toMatchObject({
      mode: 'dry_run',
      sessions: 1,
      rowsDiffering: 1,
      fieldsDiffering: 2,
      written: 0,
    });
    // Raport jest POLE PO POLU: administrator ma wiedzieć, co się rozjechało,
    // a nie tylko „coś się nie zgadza".
    expect(report.diffs[0]).toMatchObject({
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      day: '2026-06-22',
      missing: false,
    });
    expect(report.diffs[0]!.fields).toEqual([
      { field: 'blockMs', stored: 111, computed: (2 * 60 + 22) * 60_000 },
      { field: 'flightsCount', stored: 6, computed: 1 },
    ]);

    // Baza nietknięta — i dziennik audytu też.
    expect(await projectionOf(db)).toMatchObject({ flights_count: 6, block_ms: 111 });
    expect(await auditRows(db)).toEqual([]);
  });

  it('sesja obecna w rejestrze BEZ wiersza projekcji jest widziana jako brak', async () => {
    // Najcięższy przypadek dryfu i powód, dla którego listę sesji budujemy z `events`,
    // a nie z `sessions`: lista z projekcji nie umiałaby zobaczyć wiersza, którego nie ma.
    const { db, compare } = await withDay();
    await db.query('DELETE FROM sessions WHERE session_uuid = $1', ['sess-1']);

    const report = await compare();
    expect(report).toMatchObject({ sessions: 1, rowsDiffering: 1, written: 0 });
    expect(report.diffs[0]).toMatchObject({ sessionUuid: 'sess-1', missing: true });
  });
});

describe('A11 · nadpisanie projekcji: komenda przez bramę audytu', () => {
  it('zapis wymaga POWODU — bez niego nic się nie dzieje i nie ma śladu', async () => {
    const { db, rebuild } = await withDay();
    await db.query('UPDATE sessions SET flights_count = 6 WHERE session_uuid = $1', ['sess-1']);

    for (const payload of [{}, { reason: '   ' }]) {
      const res = await rebuild(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'reason_required' });
    }

    expect(await projectionOf(db)).toMatchObject({ flights_count: 6 });
    expect(await auditRows(db)).toEqual([]);
  });

  it('przelicza wiersz ze strumienia i zapisuje POWÓD do audytu', async () => {
    const { db, rebuild } = await withDay();
    await db.query(
      'UPDATE sessions SET flights_count = 6, operation = NULL WHERE session_uuid = $1',
      ['sess-1'],
    );

    const res = await rebuild({
      reason: 'Różnica wyjaśniona zmianą reguły liczenia bloku w wydaniu z 24 JUL.',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: 'write',
      rowsDiffering: 1,
      fieldsDiffering: 2,
      written: 1,
    });

    expect(await projectionOf(db)).toMatchObject({
      flights_count: 1,
      operation: 'skoki',
      client: 'SKY CAMP',
    });

    expect((await auditRows(db))[0]).toMatchObject({
      action: 'maintenance.rebuild_projections',
      target_type: 'projection',
      target_id: null,
      details: {
        mode: 'write',
        written: 1,
        sessionUuids: ['sess-1'],
        reason: 'Różnica wyjaśniona zmianą reguły liczenia bloku w wydaniu z 24 JUL.',
      },
    });
  });

  it('odtwarza wiersz, którego w projekcji NIE MA', async () => {
    const { db, rebuild } = await withDay();
    await db.query('DELETE FROM sessions WHERE session_uuid = $1', ['sess-1']);

    expect((await rebuild({ reason: 'Odtworzenie wiersza.' })).statusCode).toBe(200);
    expect(await projectionOf(db)).toMatchObject({ flights_count: 1, status: 'closed' });
  });

  it('wypełnia kolumny `operation`/`client` w wierszach, które ich nie mają', async () => {
    // To jest powód, dla którego przebudowa MUSI wejść razem z nowymi kolumnami projekcji: `upsert`
    // uruchamia dopiero następna paczka zdarzeń sesji, a dla dnia zamkniętego takiej
    // paczki już nie będzie. Bez przeliczenia kolumna „Operacja" na liście dni byłaby
    // pusta dla całej historii.
    const { db, compare, rebuild } = await withDay();
    await db.query('UPDATE sessions SET operation = NULL, client = NULL');

    expect((await compare()).diffs[0]!.fields).toEqual([
      { field: 'operation', stored: null, computed: 'skoki' },
      { field: 'client', stored: null, computed: 'SKY CAMP' },
    ]);

    await rebuild({ reason: 'Migracja 11.' });
    expect(await projectionOf(db)).toMatchObject({ operation: 'skoki', client: 'SKY CAMP' });
  });

  it('wypełnia kolumny statystyk w wierszach sprzed migracji', async () => {
    // Ten sam powód, co przy `operation`/`client`: `upsert` uruchamia dopiero następna paczka
    // zdarzeń sesji, a dla dnia zamkniętego takiej paczki już nie będzie. Bez
    // przeliczenia statystyki `A10` widziałyby w całej historii `NULL` — i uczciwie
    // pokazywałyby kreskę zamiast startów, paliwa i zrzutów.
    const { db, compare, rebuild } = await withDay();
    await db.query(
      `UPDATE sessions SET takeoff_count = NULL, landing_count = NULL, mh_delta_h = NULL,
              fuel_consumed_l = NULL, drop_count = NULL, jumpers_tandem = NULL,
              jumpers_aff = NULL, jumpers_solo = NULL, drop_alt_sum_ft = NULL,
              drop_alt_count = NULL`,
    );

    // `projectionDiff` iteruje po polach wiersza PRZELICZONEGO, więc nowe kolumny
    // wchodzą do porównania same — pierwsza przebudowa po migracji MUSI je zobaczyć.
    const fields = (await compare()).diffs[0]!.fields.map((f) => f.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'takeoffCount',
        'landingCount',
        'mhDeltaH',
        'fuelConsumedL',
        'dropCount',
        'jumpersTandem',
        'dropAltSumFt',
        'dropAltCount',
      ]),
    );

    await rebuild({ reason: 'Migracja 18.' });
    const row = await projectionOf(db);
    expect(row).toMatchObject({
      takeoff_count: 1,
      landing_count: 1,
      fuel_consumed_l: 62, // 150 + 0 dolane − 88
      drop_count: 0,
      jumpers_tandem: 0,
      jumpers_aff: 0,
      jumpers_solo: 0,
      drop_alt_sum_ft: 0,
      drop_alt_count: 0,
    });
    // Delta liczników to liczba zmiennoprzecinkowa — porównanie z tolerancją.
    expect(row.mh_delta_h as number).toBeCloseTo(1241.15 - 1234.5, 9);
  });

  it('NIE DOTYKA rejestru zdarzeń — ani przy porównaniu, ani przy zapisie', async () => {
    const { db, compare, rebuild } = await withDay();
    const before = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    const digest = await db.query<{ d: string }>(
      "SELECT string_agg(uuid || ':' || device_time, '|' ORDER BY uuid) AS d FROM events",
    );
    await db.query('UPDATE sessions SET flights_count = 6 WHERE session_uuid = $1', ['sess-1']);

    await compare();
    await rebuild({ reason: 'Wyjaśnione.' });

    const after = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    const digestAfter = await db.query<{ d: string }>(
      "SELECT string_agg(uuid || ':' || device_time, '|' ORDER BY uuid) AS d FROM events",
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    // Nie tylko LICZBA: przebudowa nie ma prawa też przestemplować istniejącego wiersza.
    expect(digestAfter.rows[0]!.d).toBe(digest.rows[0]!.d);
  });

  it('BLOKADA advisory jest brana PRZED odczytem strumienia, który zostanie nadpisany', async () => {
    // ══ CO TEN PRZYPADEK SPRAWDZA, A CZEGO NIE ══
    // Przebudowa czyta strumień i nadpisuje `sessions`; ingest robi to samo w swojej
    // transakcji. Bez szeregowania przebudowa mogłaby nadpisać wiersz policzony ze
    // strumienia ŚWIEŻSZEGO niż jej własny odczyt — czyli cofnąć liczby dnia po cichu.
    //
    // PGlite ma JEDNO połączenie, więc prawdziwej równoległości nie odtworzy i tego
    // wyścigu nie da się tu wywołać (to samo ograniczenie, co przy `ExportLogPort.lock`,
    // `uq_export_log_card_revision`). Testowalna jest KOLEJNOŚĆ: w chwili odczytu poprzedzającego zapis
    // blokada advisory musi już być trzymana przez tę transakcję. Dekorator portu pyta
    // o to `pg_locks` — czyli sam silnik, a nie nasz kod.
    const held: number[] = [];
    // Dekorator wypisuje metody JAWNIE, a nie przez `{...real}`: rozsypanie instancji
    // klasy kopiuje wyłącznie własne pola, więc metody z prototypu (`insertBatch`!)
    // przepadłyby po cichu — a wtedy `POST /events` nie zapisałby ani jednego zdarzenia
    // i test przeszedłby na pustej bazie, twierdząc, że sprawdził blokadę.
    const spy = (real: EventsStorePort): EventsStorePort => ({
      insertBatch: (tx, events, sourceDevice) => real.insertBatch(tx, events, sourceDevice),
      lastReceivedAt: (db, aircraftId) => real.lastReceivedAt(db, aircraftId),
      countForSession: (db, sessionUuid) => real.countForSession(db, sessionUuid),
      sessionStreams: (db, sessionUuids) => real.sessionStreams(db, sessionUuids),
      sessionEvents: async (db, sessionUuid) => {
        const { rows } = await db.query<{ n: number }>(
          "SELECT COUNT(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'",
        );
        held.push(Number(rows[0]?.n ?? 0));
        return real.sessionEvents(db, sessionUuid);
      },
    });

    const { db, rebuild } = await withDay({ events: spy });
    await db.query('UPDATE sessions SET flights_count = 6 WHERE session_uuid = $1', ['sess-1']);

    held.length = 0;
    expect((await rebuild({ reason: 'Kolejność blokady.' })).statusCode).toBe(200);

    // Pierwszy odczyt to SKAN (bez blokady — blokowanie tysięcy sesji na czas skanu
    // zatrzymywałoby ingest), ostatni to odczyt tuż przed `upsert` i ten JEST pod blokadą.
    expect(held.length).toBeGreaterThanOrEqual(2);
    expect(held[0]).toBe(0);
    expect(held.at(-1)).toBeGreaterThan(0);
  });
});

describe('A11 · nadpisanie BEZ RÓŻNIC nie jest operacją i nie ma prawa trafić do dziennika', () => {
  it('zdrowa projekcja → 409 `nothing_to_rebuild`, `admin_audit` zostaje pusty', async () => {
    // Dziennik nadzoru nie opisuje rzeczy, które się nie wydarzyły — ta sama zasada,
    // dla której podgląd korekty i porównanie projekcji nie idą przez `AuditedWrite`.
    // „Nadpisano 0 wierszy" jest wpisem o niczym.
    const { db, rebuild } = await withDay();

    const res = await rebuild({ reason: 'Rutynowe sprawdzenie.' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'nothing_to_rebuild' });
    expect(await auditRows(db)).toEqual([]);
  });

  it('DRUGIE kliknięcie „Nadpisz" po udanym pierwszym nie dokłada drugiego wpisu', async () => {
    // Dokładnie ten scenariusz z przeglądu: po udanym zapisie ekran wracał do stanu
    // czynnego, a kolejne kliknięcie nadpisywało zero wierszy i dopisywało DRUGI wpis
    // do dziennika. Bramka w panelu jest dla człowieka; tutaj stoi bramka dla maszyny.
    const { db, rebuild } = await withDay();
    await db.query('UPDATE sessions SET flights_count = 6 WHERE session_uuid = $1', ['sess-1']);

    expect((await rebuild({ reason: 'Wyjaśnione wydaniem.' })).statusCode).toBe(200);
    expect(await auditRows(db)).toHaveLength(1);

    const again = await rebuild({ reason: 'Wyjaśnione wydaniem.' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'nothing_to_rebuild' });
    // Jeden skutek, jeden ślad — a nie dwa ślady po jednym skutku.
    expect(await auditRows(db)).toHaveLength(1);
  });

  it('brak powodu wygrywa z brakiem różnic — 400, bo to wada ŻĄDANIA', async () => {
    // Kolejność sprawdzeń jest treścią: „popraw formularz" i „nie ma co robić" to dwa
    // różne zdania, a pierwsze da się wypowiedzieć bez czytania całego rejestru.
    const { rebuild } = await withDay();
    const res = await rebuild({});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'reason_required' });
  });
});

describe('A11 · limit przebiegu — granica jest, i jest WIDOCZNA', () => {
  /** Rejestr z `PROJECTION_DIFF_LIMIT + 1` rozjechanymi sesjami plus zdrowy `sess-1`. */
  async function withOverflow() {
    const harness = await withDay();
    const overflow = PROJECTION_DIFF_LIMIT + 1;

    const ingest = await harness.app.inject({
      method: 'POST',
      url: '/events',
      headers: harness.admin,
      payload: { events: manySessions(overflow) },
    });
    expect(ingest.statusCode).toBe(200);

    // Rozjeżdżamy WSZYSTKIE naraz — tak wygląda scenariusz, dla którego przebudowa
    // w ogóle powstała (zmiana reguły liczenia albo kolumna dołożona migracją):
    // N to nie „zero albo kilka", tylko wszystkie sesje w bazie.
    await harness.db.query("UPDATE sessions SET flights_count = 99 WHERE session_uuid LIKE 'bulk-%'");
    return { ...harness, overflow };
  }

  it('raport opisuje najwyżej `PROJECTION_DIFF_LIMIT` sesji, a liczby dotyczą CAŁEGO rejestru', async () => {
    const { compare, overflow } = await withOverflow();

    const report = await compare();
    // Liczba mówi prawdę o bazie…
    expect(report.rowsDiffering).toBe(overflow);
    expect(report.sessions).toBe(overflow + 1);
    // …a lista mówi prawdę o sobie: tyle się zmieściło i tyle zostało.
    expect(report.diffs).toHaveLength(PROJECTION_DIFF_LIMIT);
    expect(report.remaining).toBe(1);
  });

  it('zapis nadpisuje TYLE, ile opisuje raport, i zostawia resztę na kolejne wywołanie', async () => {
    // Bez limitu ta jedna transakcja brałaby `PROJECTION_DIFF_LIMIT + 1` blokad advisory
    // i trzymała je do COMMIT-u — czyli przez cały przebieg telefony nie dosyłałyby
    // paczek dla nadpisywanych dni, a wspólna tablica blokad klastra dostawałaby
    // tysiące wpisów z jednego żądania.
    const { db, compare, rebuild } = await withOverflow();

    const first = await rebuild({ reason: 'Kolumny dołożone migracją.' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      written: PROJECTION_DIFF_LIMIT,
      remaining: 1,
      rowsDiffering: PROJECTION_DIFF_LIMIT + 1,
    });

    // Zostało dokładnie tyle, ile powiedział raport — i da się to domknąć powtórzeniem.
    expect(await compare()).toMatchObject({ rowsDiffering: 1, remaining: 0 });
    expect((await rebuild({ reason: 'Domknięcie reszty.' })).statusCode).toBe(200);
    expect(await compare()).toMatchObject({ rowsDiffering: 0, remaining: 0 });

    // Dziennik nie udaje kompletu: częściowy przebieg mówi w `details`, ile zostało.
    const rows = await auditRows(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.details).toMatchObject({ written: PROJECTION_DIFF_LIMIT, remaining: 1 });
    expect(rows[1]!.details).toMatchObject({ written: 1, remaining: 0 });
  });
});

describe('A11 · wygasłe refresh tokeny — jedyna operacja, która kasuje', () => {
  /** Dwa martwe tokeny i jeden żywy. Wartości są dowolne — w bazie i tak leżą skróty. */
  async function withTokens(harness: Harness) {
    // Czyścimy najpierw, bo logowanie administratora w `withDay` zostawia własny,
    // PRAWDZIWY refresh token. Bez tego liczby w asercjach opisywałyby zestaw testowy,
    // a nie scenariusz, o który pyta ekran.
    await harness.db.query('DELETE FROM refresh_tokens');
    await harness.db.query(
      `INSERT INTO refresh_tokens (token_hash, pilot_id, expires_at) VALUES
         ('hash-martwy-stary',  'TMK', '2026-03-12T03:41:00.000Z'),
         ('hash-martwy-swiezy', 'TMK', '2026-06-20T09:02:00.000Z'),
         ('hash-zywy',          'TMK', '2026-09-01T00:00:00.000Z')`,
    );
  }

  const scan = async (harness: Harness, headers: Record<string, string>) =>
    harness.app.inject({ method: 'GET', url: '/admin/api/maintenance/refresh-tokens', headers });

  const purge = async (
    harness: Harness,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
  ) =>
    harness.app.inject({
      method: 'POST',
      url: '/admin/api/maintenance/refresh-tokens/purge',
      headers: { ...headers, ...ADMIN_CSRF_HEADERS },
      payload,
    });

  it('podgląd liczy martwe i żywe wobec ZEGARA SERWERA, nie zgaduje', async () => {
    const harness = await withDay();
    await withTokens(harness);

    const res = await scan(harness, harness.admin);
    expect(res.statusCode).toBe(200);
    const body = res.json() as RefreshTokenScanDto;

    // Zegar testu stoi na 22 JUN 2026 08:00 UTC — dwa tokeny są już martwe.
    expect(body).toMatchObject({
      total: 3,
      expired: 2,
      valid: 1,
      oldestExpiredAt: '2026-03-12T03:41:00.000Z',
      newestExpiredAt: '2026-06-20T09:02:00.000Z',
      ttlDays: 90,
    });
    // Podgląd niczego nie kasuje i nie audytuje.
    expect(await auditRows(harness.db)).toEqual([]);
  });

  it('BEZ POTWIERDZENIA W ŻĄDANIU serwer odmawia — panel nie jest bramką', async () => {
    // „Panel bramkuje" to ta sama pomyłka, co „rola siedzi w tokenie": `POST` da się
    // wysłać bez panelu. Gołe żądanie i żądanie z cudzym słowem odbijają się tak samo.
    const harness = await withDay();
    await withTokens(harness);

    for (const payload of [{}, { confirm: 'USUŃ' }, { confirm: 'tak' }]) {
      const res = await purge(harness, harness.admin, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'confirmation_required' });
    }

    const { rows } = await harness.db.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM refresh_tokens',
    );
    expect(Number(rows[0]!.n)).toBe(3);
    expect(await auditRows(harness.db)).toEqual([]);
  });

  it('KASUJE WYŁĄCZNIE WYGASŁE — token ważny przeżywa czyszczenie', async () => {
    // Pomyłka tutaj wylogowuje pilotów w terenie: ponowne logowanie jest jedyną
    // czynnością w systemie, która wymaga sieci (§3.0).
    const harness = await withDay();
    await withTokens(harness);

    const res = await purge(harness, harness.admin, { confirm: PURGE_TOKENS_CONFIRMATION });
    expect(res.statusCode).toBe(200);
    expect(res.json() as TokenPurgeReport).toMatchObject({
      deleted: 2,
      oldestExpiredAt: '2026-03-12T03:41:00.000Z',
      newestExpiredAt: '2026-06-20T09:02:00.000Z',
      remainingValid: 1,
    });

    const { rows } = await harness.db.query<{ token_hash: string }>(
      'SELECT token_hash FROM refresh_tokens ORDER BY token_hash',
    );
    expect(rows.map((r) => r.token_hash)).toEqual(['hash-zywy']);
  });

  it('sesja pilota z ŻYWYM tokenem działa PO czyszczeniu — koniec z obietnicą na słowo', async () => {
    // Wykonywalna postać zdania z ekranu: „żaden pilot nie zostanie przez to wylogowany".
    // Token jest tu PRAWDZIWY (z `POST /auth/login`), więc test nie sprawdza własnego
    // wiersza w tabeli, tylko to, czy da się nim jeszcze odnowić dostęp.
    const harness = await withDay();
    await withTokens(harness);

    const login = await harness.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'PWI', password: TEST_PASSWORD },
    });
    const refreshToken = login.json().refreshToken as string;

    await purge(harness, harness.admin, { confirm: PURGE_TOKENS_CONFIRMATION });

    const refreshed = await harness.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
  });

  it('audyt niesie LICZBY I ZAKRES DAT — nigdy wartości ani skrótów tokenów', async () => {
    const harness = await withDay();
    await withTokens(harness);

    await purge(harness, harness.admin, { confirm: PURGE_TOKENS_CONFIRMATION });

    const rows = await auditRows(harness.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'maintenance.prune_tokens',
      target_type: 'refresh_tokens',
      target_id: null,
      details: {
        deleted: 2,
        expiredFrom: '2026-03-12T03:41:00.000Z',
        expiredTo: '2026-06-20T09:02:00.000Z',
        remainingValid: 1,
      },
    });

    // Reguła jest jawna, a nie „wynika z tego, że akurat nie wpisaliśmy": w `details`
    // nie ma prawa pojawić się ŻADEN skrót z tabeli, choćby ktoś dopisał go „na chwilę".
    const dump = JSON.stringify(rows[0]!.details);
    for (const hash of ['hash-martwy-stary', 'hash-martwy-swiezy', 'hash-zywy']) {
      expect(dump).not.toContain(hash);
    }
    expect(dump).not.toContain('token');
  });

  it('czyszczenie na pustym zbiorze jest bezpieczne i mówi „zero", a nie „nie wiem"', async () => {
    const harness = await withDay();

    const res = await purge(harness, harness.admin, { confirm: PURGE_TOKENS_CONFIRMATION });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ deleted: 0, oldestExpiredAt: null, newestExpiredAt: null });
  });
});

describe('A11 · stan schematu — wyłącznie odczyt', () => {
  it('mówi, co zna KOD i co odnotowała BAZA, migracja po migracji', async () => {
    const harness = await withDay();

    const res = await harness.app.inject({
      method: 'GET',
      url: '/admin/api/maintenance/schema',
      headers: harness.admin,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as SchemaStateDto;
    expect(body.schemaVersion).toBe(SCHEMA_VERSION);
    expect(body.applied).toBe(MIGRATIONS.length);
    expect(body.pending).toBe(0);
    expect(body.migrations).toHaveLength(MIGRATIONS.length);
    expect(body.migrations[0]).toMatchObject({ version: 1, applied: true });
    expect(body.migrations[0]!.title.length).toBeGreaterThan(10);
    expect(body.lastAppliedAt).not.toBeNull();
  });

  it('baza STARSZA niż kod pokazuje brakującą pozycję, zamiast ją ukryć', async () => {
    // Stan po awarii runnera w starcie. Lista budowana z `schema_migrations` nie
    // umiałaby powiedzieć, CZEGO brakuje — pokazałaby komplet o jeden krótszy.
    const harness = await withDay();
    await harness.db.query('DELETE FROM schema_migrations WHERE version = $1', [
      MIGRATIONS.length,
    ]);

    const body = (
      await harness.app.inject({
        method: 'GET',
        url: '/admin/api/maintenance/schema',
        headers: harness.admin,
      })
    ).json() as SchemaStateDto;

    expect(body.pending).toBe(1);
    expect(body.applied).toBe(MIGRATIONS.length - 1);
    expect(body.migrations.at(-1)).toMatchObject({ applied: false, appliedAt: null });
  });
});

describe('A11 · zdolności', () => {
  /** Konto z ziarna, które ma wejście do panelu, ale nie ma narzędzi serwisowych. */
  async function trainingLead(harness: Harness): Promise<Record<string, string>> {
    await harness.db.query("UPDATE pilots SET role = 'training_lead' WHERE id = 'AKO'");
    const login = await harness.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'AKO', password: TEST_PASSWORD },
    });
    return { authorization: `Bearer ${login.json().token}` };
  }

  it('szef wyszkolenia dostaje 403 na KAŻDEJ trasie konserwacji, z podaną zdolnością', async () => {
    const harness = await withDay();
    const headers = await trainingLead(harness);

    const cases: [string, string, string][] = [
      ['GET', '/admin/api/maintenance/projections/compare', 'maintenance.run'],
      ['POST', '/admin/api/maintenance/projections/rebuild', 'maintenance.run'],
      ['GET', '/admin/api/maintenance/schema', 'maintenance.run'],
      ['GET', '/admin/api/maintenance/refresh-tokens', 'accounts.manage'],
      ['POST', '/admin/api/maintenance/refresh-tokens/purge', 'accounts.manage'],
    ];

    for (const [method, url, required] of cases) {
      const res = await harness.app.inject({
        method: method as 'GET' | 'POST',
        url,
        headers: { ...headers, ...ADMIN_CSRF_HEADERS },
        payload: method === 'POST' ? {} : undefined,
      });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json()).toMatchObject({ error: 'forbidden', required });
    }
  });

  it('bez tokenu → 401, a mutacja bez nagłówka CSRF → 403 `csrf_required`', async () => {
    const harness = await withDay();

    const anonymous = await harness.app.inject({
      method: 'GET',
      url: '/admin/api/maintenance/schema',
    });
    expect(anonymous.statusCode).toBe(401);

    const noCsrf = await harness.app.inject({
      method: 'POST',
      url: '/admin/api/maintenance/projections/rebuild',
      headers: harness.admin,
      payload: { reason: 'x' },
    });
    expect(noCsrf.statusCode).toBe(403);
  });
});
