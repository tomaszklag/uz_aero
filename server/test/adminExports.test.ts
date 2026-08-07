/**
 * UZ Aero (serwer) — monitor eksportu i ponowienie (`/admin/api/exports*`, mockup `A05`).
 *
 * Ten sam wzorzec co reszta: PGlite w procesie, prawdziwe klasy, `app.inject`, zero
 * atrap poza JEDNĄ — adapterem arkuszy, który potrafi na żądanie paść. Bez niego stan
 * `missing` („dzień zamknięty, karty nie ma") byłby nieosiągalny, a to jest jedyny stan,
 * dla którego cały ten ekran istnieje: karta jest SKUTKIEM, nie warunkiem, więc awaria
 * eksportu nie cofa niczego i nie zostawia po sobie wiersza w żadnej tabeli.
 *
 * Dni lotne powstają z PRAWDZIWEGO `POST /events` — test, który wstawia sesję i wiersz
 * `export_log` `INSERT`-em, przybija własne wyobrażenie o systemie, a nie system.
 */

import { describe, expect, it } from 'vitest';

import type { Event } from '@uzaero/domain';

import { exportState } from '../src/application/admin/mappers/exportListItem.ts';
import type { AdminExportJoin } from '../src/application/admin/ports.ts';
import type {
  DaySheet,
  EventsStorePort,
  Queryable,
  SheetsPort,
} from '../src/application/common/ports.ts';
import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (h: number, m: number, dayOffset = 0): number =>
  DAY + dayOffset * DAY_MS + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: { sessionUuid: string; picId: string; aircraftId?: string },
) {
  seq += 1;
  return {
    uuid: `x-${seq}-${type}`,
    aircraftId: base.aircraftId ?? 'SP-AXA',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    sessionUuid: base.sessionUuid,
    picId: base.picId,
  };
}

interface DayOptions {
  sessionUuid: string;
  picId: string;
  aircraftId?: string;
  reading?: { fuelL: number; mh: number };
  dayOffset?: number;
}

/** Dzień lotny BEZ `day_close` — sesja zostaje otwarta. */
function openDay(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  const reading = o.reading ?? { fuelL: 150, mh: 1234.5 };
  return [
    event('session_claim', at(8, 0, d), { mode: 'free' }, o),
    event(
      'preflight_confirm',
      at(8, 0, d),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        dutyStart: at(8, 0, d),
        reading,
        client: null,
        mhFormat: 'hhmm',
      },
      o,
    ),
    event('engine_start', at(8, 12, d), {}, o),
    event('takeoff', at(8, 25, d), { method: 'auto' }, o),
    event('landing', at(9, 18, d), { method: 'auto' }, o),
    event('engine_stop', at(10, 34, d), {}, o),
  ];
}

function closeDay(o: DayOptions & { mh?: number }) {
  const d = o.dayOffset ?? 0;
  return [
    event(
      'day_close',
      at(16, 45, d),
      { finalReading: { fuelL: 88, mh: o.mh ?? 1235.4 }, dutyEnd: at(16, 45, d) },
      o,
    ),
  ];
}

/** Sesja BEZ `preflight_confirm` — pilot wziął samolot i nie dokończył przejęcia. */
function claimOnly(o: DayOptions) {
  return [event('session_claim', at(8, 0, o.dayOffset ?? 0), { mode: 'free' }, o)];
}

/**
 * Strumień BEZ `session_claim` — jedyna droga do stanu `impossible` po migracji 21.
 *
 * Wg §4.4 claim jest pierwszym zdarzeniem każdej sesji, więc taki strumień nie powstaje
 * w normalnej pracy. Serwer go jednak PRZYJMIE (§4.5: nie odrzuca danych z terenu), a
 * monitor eksportu musi umieć powiedzieć, że takiej karty nie da się nazwać — zamiast
 * pokazać ją jako brakującą, czyli możliwą do dorobienia.
 */
function withoutClaim(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  return [
    event(
      'preflight_confirm',
      at(8, 0, d),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        reading: o.reading ?? { fuelL: 150, mh: 1234.5 },
        client: null,
        mhFormat: 'hhmm',
      },
      o,
    ),
  ];
}

type Harness = Awaited<ReturnType<typeof testHarness>>;

/**
 * Adapter arkuszy, który pada na żądanie — jedyna atrapa w tym pliku.
 *
 * Opakowuje PRAWDZIWY zapis (`PgSheets` przez `write`), więc po wyłączeniu awarii karta
 * ląduje w bazie dokładnie tak, jak w produkcji. Podmieniamy moment awarii, nie
 * zachowanie — ta sama zasada, co przy dekoratorze `events` w `contract.test.ts`.
 */
class FlakySheets implements SheetsPort {
  failing = false;
  constructor(private readonly write: SheetsPort['writeDaySheet']) {}
  async writeDaySheet(sheet: DaySheet): Promise<{ url: string }> {
    if (this.failing) throw new Error('sheets_write_timeout');
    return this.write(sheet);
  }
}

/**
 * Strumień zdarzeń, który potrafi rzucić `TypeError` — druga (i ostatnia) atrapa.
 *
 * Istnieje wyłącznie po to, żeby odtworzyć BŁĄD PO NASZEJ STRONIE w środku eksportu:
 * bez niego jedynym osiągalnym wyjątkiem jest awaria adaptera arkuszy, więc rozróżnienia
 * `sheets_adapter` vs `unexpected` nie dałoby się przybić niczym poza deklaracją.
 * Opakowuje PRAWDZIWY adapter i wybucha dopiero po ustawieniu `explode` — ingest
 * przechodzi normalnie, dopiero ponowienie trafia na wyjątek.
 */
class ExplodingEvents implements EventsStorePort {
  explode = false;
  constructor(private readonly real: EventsStorePort) {}
  insertBatch(tx: Queryable, events: readonly Event[], sourceDevice: string | null) {
    return this.real.insertBatch(tx, events, sourceDevice);
  }
  sessionEvents(db: Queryable, sessionUuid: string): Promise<Event[]> {
    if (this.explode) throw new TypeError('projekcja: nie mogę odczytać właściwości „map"');
    return this.real.sessionEvents(db, sessionUuid);
  }
  sessionStreams(db: Queryable, sessionUuids: readonly string[]): Promise<Map<string, Event[]>> {
    return this.real.sessionStreams(db, sessionUuids);
  }
  lastReceivedAt(db: Queryable, aircraftId: string) {
    return this.real.lastReceivedAt(db, aircraftId);
  }
  countForSession(db: Queryable, sessionUuid: string) {
    return this.real.countForSession(db, sessionUuid);
  }
}

async function explodingHarness() {
  let store: ExplodingEvents | null = null;
  const harness = await testHarness({
    events: (real) => {
      store = new ExplodingEvents(real);
      return store;
    },
  });
  return { ...harness, events: store as unknown as ExplodingEvents };
}

async function flakyHarness() {
  // `PgSheets` potrzebuje bazy, więc atrapa dostaje delegata dopiero po złożeniu
  // harnessu — stąd pośrednik, a nie gotowa instancja w argumencie.
  let delegate: SheetsPort['writeDaySheet'] | null = null;
  const sheets = new FlakySheets((sheet) => {
    if (delegate == null) throw new Error('delegat arkuszy nie został ustawiony');
    return delegate(sheet);
  });
  const harness = await testHarness({ sheets });
  // Odtwarzamy dokładnie tego samego `PgSheets`, którego składa harness dla odczytu.
  const { PgSheets } = await import('../src/infrastructure/pg/common/sheetsRepo.ts');
  const real = new PgSheets(harness.db, 'http://uzaero.test', harness.clock);
  delegate = (sheet) => real.writeDaySheet(sheet);
  return { ...harness, sheets };
}

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

function listExports(app: Harness['app'], token: string, query = '') {
  return app.inject({
    method: 'GET',
    url: `/admin/api/exports${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function getPanel(app: Harness['app'], token: string, path: string) {
  return app.inject({
    method: 'GET',
    url: `/admin/api${path}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function retry(app: Harness['app'], sessionUuid: string, token?: string) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/exports/${sessionUuid}/retry`,
    headers: {
      ...ADMIN_CSRF_HEADERS,
      ...(token == null ? {} : { authorization: `Bearer ${token}` }),
    },
  });
}

async function exportLogRows(db: Harness['db']) {
  const { rows } = await db.query<{ session_uuid: string; revision: number; day: string }>(
    'SELECT session_uuid, revision, day::text AS day FROM export_log ORDER BY id',
  );
  return rows;
}

async function sheetRowCount(db: Harness['db']) {
  const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM exported_sheets');
  return Number(rows[0]!.n);
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    action: string;
    actor_pilot_id: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
  }>('SELECT action, actor_pilot_id, target_type, target_id, details FROM admin_audit ORDER BY id');
  return rows;
}

describe('monitor eksportu — lista (A05)', () => {
  it('pusto: zero wierszy i liczniki w zerach, nie brak liczników', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');

    const res = await listExports(app, admin);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [],
      counts: {
        total: 0,
        current: 0,
        blocked: 0,
        missing: 0,
        waiting: 0,
        impossible: 0,
        revised: 0,
        overwritten: 0,
      },
      // Pusty zakres nie jest obcięty — i to jest inne zdanie niż „nic nie ma".
      matched: 0,
      truncated: false,
    });
  });

  it('nazywa kartę TAK SAMO jak eksporter — także dla dnia, który jeszcze trwa', async () => {
    const { app } = await testHarness();
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    // Dzień zamknięty → karta powstała automatycznie przy ingescie.
    await post(app, tmk, openDay({ sessionUuid: 'closed-1', picId: 'TMK' }));
    await post(app, tmk, closeDay({ sessionUuid: 'closed-1', picId: 'TMK' }));
    // Dzień w toku na innym samolocie → czeka.
    await post(
      app,
      krz,
      openDay({ sessionUuid: 'open-1', picId: 'KRZ', aircraftId: 'SP-FGK', dayOffset: 1 }),
    );
    // Sesja bez preflightu → karty nie da się nazwać.
    await post(
      app,
      krz,
      claimOnly({ sessionUuid: 'bare-1', picId: 'KRZ', aircraftId: 'SP-ANK', dayOffset: 2 }),
    );

    const body = (await listExports(app, tmk)).json();
    const by = (uuid: string) =>
      body.items.find((item: { sessionUuid: string }) => item.sessionUuid === uuid);

    expect(by('closed-1')).toMatchObject({
      state: 'current',
      tab: '2026-06-22_SP-AXA',
      day: '2026-06-22',
      revision: 1,
      reg: 'SP-AXA',
      picCode: 'TMK',
      sessionStatus: 'closed',
      sheetUrl: 'http://uzaero.test/sheets/2026-06-22_SP-AXA',
      blockingFlagIds: [],
    });
    // Nazwa karty jedzie MIMO braku eksportu: pytanie ekranu brzmi „której karty
    // brakuje", a nie „które karty są".
    expect(by('open-1')).toMatchObject({
      state: 'waiting',
      tab: '2026-06-23_SP-FGK',
      revision: null,
      exportedAt: null,
    });
    // Sesja z SAMYM claimem, bez preflightu, ma dziś nazwę karty — bo nazwę wyznacza
    // chwila przejęcia, a nie meldunek (migracja 21). To dzień, który po prostu jeszcze
    // trwa. Stan `impossible` został wyłącznie dla rejestru niekompletnego (brak
    // `session_claim`), czyli dla czegoś, czego trasą `POST /events` nie da się zapisać.
    expect(by('bare-1')).toMatchObject({
      state: 'waiting',
      tab: '2026-06-24_SP-ANK',
      day: '2026-06-24',
    });

    expect(body.counts).toMatchObject({
      total: 3,
      current: 1,
      waiting: 2,
      impossible: 0,
      missing: 0,
      blocked: 0,
      revised: 0,
    });
  });

  it('otwarta flaga `session_overlap` daje stan `blocked` z NUMEREM flagi', async () => {
    const { app } = await testHarness();
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    // Nakładka: TMK nie zamyka dnia, KRZ przejmuje ten sam samolot i zamyka swój.
    await post(app, tmk, openDay({ sessionUuid: 'ov-1', picId: 'TMK' }));
    await post(app, krz, openDay({ sessionUuid: 'ov-2', picId: 'KRZ' }));
    await post(app, krz, closeDay({ sessionUuid: 'ov-2', picId: 'KRZ' }));

    const body = (await listExports(app, tmk)).json();
    const blocked = body.items.find(
      (item: { sessionUuid: string }) => item.sessionUuid === 'ov-2',
    );

    expect(blocked).toMatchObject({ state: 'blocked', revision: null });
    // Identyfikator, nie licznik: wiersz ma prowadzić DO flagi, a nie kazać jej szukać.
    expect(blocked.blockingFlagIds).toHaveLength(1);
    expect(blocked.blockingFlagIds[0]).toBeGreaterThan(0);
    expect(body.counts).toMatchObject({ blocked: 1, waiting: 1, current: 0 });
  });

  it('chip zawęża listę, a liczniki opisują CAŁY zakres (obietnica chipa)', async () => {
    const { app } = await testHarness();
    const tmk = await login(app, 'TMK');

    await post(app, tmk, openDay({ sessionUuid: 'c-1', picId: 'TMK' }));
    await post(app, tmk, closeDay({ sessionUuid: 'c-1', picId: 'TMK' }));
    await post(
      app,
      tmk,
      openDay({ sessionUuid: 'w-1', picId: 'TMK', aircraftId: 'SP-FGK', dayOffset: 1 }),
    );

    const narrowed = (await listExports(app, tmk, '?state=current')).json();

    expect(narrowed.items.map((i: { sessionUuid: string }) => i.sessionUuid)).toEqual(['c-1']);
    // Po kliknięciu chipa pozostałe liczby NIE spadają do zera — inaczej administrator
    // po jednym zawężeniu przestałby widzieć, ile jeszcze zostało.
    expect(narrowed.counts).toMatchObject({ total: 2, current: 1, waiting: 1 });

    expect((await listExports(app, tmk, '?state=nieznany')).statusCode).toBe(400);
  });

  it('filtruje po zakresie dni i po samolocie; zakres jest DOMKNIĘTY', async () => {
    const { app } = await testHarness();
    const tmk = await login(app, 'TMK');

    await post(app, tmk, openDay({ sessionUuid: 'd-0', picId: 'TMK' }));
    await post(app, tmk, closeDay({ sessionUuid: 'd-0', picId: 'TMK' }));
    await post(
      app,
      tmk,
      openDay({ sessionUuid: 'd-2', picId: 'TMK', aircraftId: 'SP-FGK', dayOffset: 2 }),
    );

    const uuids = async (query: string) =>
      (await listExports(app, tmk, query)).json().items.map(
        (i: { sessionUuid: string }) => i.sessionUuid,
      );

    // Górna granica to KONIEC doby: `do=2026-06-24` obejmuje dzień z `dayOffset: 2`,
    // który zaczął się o 08:00 UTC.
    expect(await uuids('?from=2026-06-22&to=2026-06-24')).toEqual(['d-2', 'd-0']);
    expect(await uuids('?from=2026-06-22&to=2026-06-22')).toEqual(['d-0']);
    expect(await uuids('?aircraftId=SP-FGK')).toEqual(['d-2']);
    expect(await uuids('?q=fgk')).toEqual(['d-2']);
  });
});

/**
 * LICZNIKI I ZAWĘŻENIE OPISUJĄ ZAKRES, NIE OKNO (poprawka 2026-08-01).
 *
 * Wada, którą te przypadki zamykają: `LIMIT` szedł w SQL-u bez predykatu stanu,
 * a zawężenie chipem i WSZYSTKIE liczniki liczyły się w JS z okna PO obcięciu. Klub
 * z 250 zamkniętymi dniami wchodził bez filtrów, dostawał 200 najnowszych, kafel
 * „Bez karty" pokazywał 0 — a dzień z awarią eksportu sprzed dziewięciu miesięcy był
 * niewidoczny, niepoliczony i nie do znalezienia chipem.
 */
describe('limit obcina LISTĘ, nie prawdę o zakresie (A05)', () => {
  it('liczniki opisują CAŁY zakres, a odpowiedź mówi wprost, że lista jest obcięta', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');

    // Trzy zamknięte dni, każdy z kartą — i pytanie o JEDEN najnowszy.
    for (const day of [0, 1, 2]) {
      const o = { sessionUuid: `l-${day}`, picId: 'TMK', dayOffset: day };
      await post(app, admin, openDay(o));
      await post(app, admin, closeDay(o));
    }

    const body = (await listExports(app, admin, '?limit=1')).json();

    expect(body.items).toHaveLength(1);
    // Przed poprawką `total` był długością `items`, czyli 1 — kafel opisywał okno.
    expect(body.counts).toMatchObject({ total: 3, current: 3 });
    expect(body.matched).toBe(3);
    // Lista przycięta po cichu jest najgorszym trybem awarii narzędzia nadzoru:
    // wygląda na komplet.
    expect(body.truncated).toBe(true);

    const full = (await listExports(app, admin)).json();
    expect(full.items).toHaveLength(3);
    expect(full.truncated).toBe(false);
    expect(full.matched).toBe(3);
  });

  it('chip znajduje dzień STARSZY niż limit — zawężenie jest przed obcięciem', async () => {
    const { app, sheets } = await flakyHarness();
    const admin = await login(app, 'TMK');

    // Najstarszy dzień: eksport padł, więc karty nie ma. Dokładnie ten wiersz, dla
    // którego ten ekran istnieje — i dokładnie ten, który obcięcie zabierało pierwszy.
    sheets.failing = true;
    await post(app, admin, openDay({ sessionUuid: 'old-missing', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'old-missing', picId: 'TMK' }));
    sheets.failing = false;

    // …i dwa nowsze dni z kartami, które w oknie stoją przed nim.
    for (const day of [1, 2]) {
      const o = { sessionUuid: `new-${day}`, picId: 'TMK', dayOffset: day };
      await post(app, admin, openDay(o));
      await post(app, admin, closeDay(o));
    }

    // Bez zawężenia limit pokazuje wyłącznie nowsze dni — i to jest w porządku…
    const window = (await listExports(app, admin, '?limit=2')).json();
    expect(window.items.map((i: { sessionUuid: string }) => i.sessionUuid)).toEqual([
      'new-2',
      'new-1',
    ]);
    // …dopóki licznik mówi prawdę o tym, czego w oknie nie widać.
    expect(window.counts).toMatchObject({ total: 3, current: 2, missing: 1 });

    // Przed poprawką: `.filter()` po `LIMIT` — pusta lista i chip kłamiący „1".
    const narrowed = (await listExports(app, admin, '?state=missing&limit=2')).json();
    expect(narrowed.items.map((i: { sessionUuid: string }) => i.sessionUuid)).toEqual([
      'old-missing',
    ]);
    expect(narrowed.matched).toBe(1);
    expect(narrowed.truncated).toBe(false);
    // Liczniki dalej opisują CAŁY zakres, nie zawężenie — inaczej po jednym kliknięciu
    // przestałoby być widać, ile zostało gdzie indziej.
    expect(narrowed.counts).toMatchObject({ total: 3, current: 2, missing: 1 });
  });

  it('`truncated` przy zawężeniu liczy TE wiersze, które chip obiecuje', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');

    for (const day of [0, 1]) {
      const o = { sessionUuid: `t-${day}`, picId: 'TMK', dayOffset: day };
      await post(app, admin, openDay(o));
      await post(app, admin, closeDay(o));
    }
    await post(app, admin, openDay({ sessionUuid: 't-open', picId: 'TMK', dayOffset: 3 }));

    const body = (await listExports(app, admin, '?state=current&limit=1')).json();

    expect(body.items).toHaveLength(1);
    // `matched` to liczba kart „W arkuszu", a nie wszystkich dni: obietnicą chipa jest
    // „tyle wierszy zobaczysz", więc sygnał obcięcia musi odnosić się do tej samej liczby.
    expect(body.matched).toBe(2);
    expect(body.truncated).toBe(true);
    expect(body.counts).toMatchObject({ total: 3, current: 2, waiting: 1 });
  });

  /**
   * DWA WYRAŻENIA JEDNEJ REGUŁY, PRZYBITE DO SIEBIE.
   *
   * Od 2026-08-01 stan karty ma dwie definicje: `exportState` w mapperze (dla wiersza)
   * i `CASE` w adapterze (dla liczników i zawężenia). Rozjazd między nimi jest dokładnie
   * tą wadą, przed którą broniła poprzednia konstrukcja — i którą kupujemy świadomie,
   * bo DA SIĘ ją złapać testem, a kłamiącego licznika nie dało się.
   */
  it('liczniki zgadzają się z wierszami, a `?state=X` oddaje dokładnie te wiersze', async () => {
    const { app, sheets } = await flakyHarness();
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    // `current` (+ `revised` po ponowieniu)
    await post(app, tmk, openDay({ sessionUuid: 's-cur', picId: 'TMK' }));
    await post(app, tmk, closeDay({ sessionUuid: 's-cur', picId: 'TMK' }));
    await retry(app, 's-cur', tmk);
    // `missing`
    sheets.failing = true;
    await post(app, tmk, openDay({ sessionUuid: 's-miss', picId: 'TMK', dayOffset: 1 }));
    await post(app, tmk, closeDay({ sessionUuid: 's-miss', picId: 'TMK', dayOffset: 1 }));
    sheets.failing = false;
    // `impossible` — strumień bez claimu, czyli rejestr niekompletny (patrz `withoutClaim`).
    await post(
      app,
      krz,
      withoutClaim({ sessionUuid: 's-bare', picId: 'KRZ', aircraftId: 'SP-ANK', dayOffset: 2 }),
    );
    // `waiting` + `blocked` (nakładka na SP-FGK: pierwsza sesja zostaje otwarta)
    await post(
      app,
      tmk,
      openDay({ sessionUuid: 's-wait', picId: 'TMK', aircraftId: 'SP-FGK', dayOffset: 3 }),
    );
    await post(
      app,
      krz,
      openDay({ sessionUuid: 's-block', picId: 'KRZ', aircraftId: 'SP-FGK', dayOffset: 3 }),
    );
    await post(
      app,
      krz,
      closeDay({ sessionUuid: 's-block', picId: 'KRZ', aircraftId: 'SP-FGK', dayOffset: 3 }),
    );

    const body = (await listExports(app, tmk)).json();
    const items: { sessionUuid: string; state: string; revision: number | null }[] = body.items;
    expect(items).toHaveLength(5);

    // 1. Liczniki SQL-a = policzone wiersze mappera.
    const tally = (state: string) => items.filter((i) => i.state === state).length;
    expect(body.counts).toEqual({
      total: items.length,
      current: tally('current'),
      blocked: tally('blocked'),
      missing: tally('missing'),
      waiting: tally('waiting'),
      impossible: tally('impossible'),
      revised: items.filter((i) => i.revision != null && i.revision > 1).length,
      overwritten: 0,
    });
    // Kontrola samego przypadku: gdyby wszystkie dni miały ten sam stan, równość wyżej
    // przechodziłaby przy dowolnie rozjechanym `CASE`.
    expect(new Set(items.map((i) => i.state)).size).toBe(5);

    // 2. Zawężenie SQL-a = wiersze, którym mapper nadał ten stan.
    for (const state of ['current', 'blocked', 'missing', 'waiting', 'impossible']) {
      const narrowed = (await listExports(app, tmk, `?state=${state}`)).json();
      expect(
        narrowed.items.map((i: { sessionUuid: string }) => i.sessionUuid).sort(),
        `zawężenie ?state=${state}`,
      ).toEqual(
        items
          .filter((i) => i.state === state)
          .map((i) => i.sessionUuid)
          .sort(),
      );
    }
  });
});

/**
 * DWIE ZMIANY NA JEDNYM SAMOLOCIE JEDNEGO DNIA — KARTA JEST JEDNA.
 *
 * Nazwa karty (`sheetTabName`) niesie DZIEŃ i SAMOLOT, ale nie sesję, a `exported_sheets`
 * jest po `tab` UPSERT-owane. Zmiana poranna i popołudniowa to dwie ZAMKNIĘTE sesje, więc
 * `session_overlap` nie powstaje (ta flaga dotyczy sesji niezamkniętych) — i druga karta
 * po prostu nadpisuje pierwszą. Do 2026-08-01 monitor raportował obie jako „W arkuszu",
 * a podgląd karty porannej pokazywał treść popołudniowej bez słowa komentarza.
 *
 * Konwencji nazw ani schematu NIE zmieniamy (decyzja produktowa dotykająca telefonu,
 * §4.7). Zmieniamy to, co ekran o tym MÓWI.
 */
describe('kolizja nazw kart tego samego dnia (A05)', () => {
  it('nadpisany jest ten, kto pisał WCZEŚNIEJ — i wie, kto go nadpisał', async () => {
    const { app, clock } = await testHarness();
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    // Zmiana poranna: pełny dzień, zamknięty.
    await post(app, tmk, openDay({ sessionUuid: 'zmiana-am', picId: 'TMK' }));
    await post(app, tmk, closeDay({ sessionUuid: 'zmiana-am', picId: 'TMK' }));

    // Zmiana popołudniowa: TEN SAM samolot, TEN SAM dzień, inny pilot, też zamknięta.
    // Zegar do przodu, żeby drugi eksport dostał PÓŹNIEJSZY stempel — w klubie dzieli
    // je pół dnia; tutaj wystarczy cokolwiek różnego od zera.
    clock.advance(5 * 60 * 1000);
    await post(app, krz, openDay({ sessionUuid: 'zmiana-pm', picId: 'KRZ' }));
    await post(app, krz, closeDay({ sessionUuid: 'zmiana-pm', picId: 'KRZ' }));

    const body = (await listExports(app, tmk)).json();
    const by = (uuid: string) =>
      body.items.find((item: { sessionUuid: string }) => item.sessionUuid === uuid);

    // Obie sesje mają własne wiersze dziennika, więc obie są `current` — i to jest prawda.
    expect(by('zmiana-am')).toMatchObject({ state: 'current', tab: '2026-06-22_SP-AXA' });
    expect(by('zmiana-pm')).toMatchObject({ state: 'current', tab: '2026-06-22_SP-AXA' });

    // Nieprawdą byłoby dopiero milczenie o tym, CZYJA treść leży dziś pod tą nazwą.
    expect(by('zmiana-am').overwrittenBy).toMatchObject({ sessionUuid: 'zmiana-pm' });
    // Ostatni autor nie jest niczyją ofiarą.
    expect(by('zmiana-pm').overwrittenBy).toBeNull();
    expect(body.counts.overwritten).toBe(1);

    // Flaga nakładki NIE powstała — obie sesje zamknięto poprawnie, więc nie ma sporu.
    expect(by('zmiana-am').blockingFlagIds).toEqual([]);
    expect(by('zmiana-pm').blockingFlagIds).toEqual([]);
  });

  it('podgląd karty porannej pokazuje treść popołudniowej — i rozwinięcie o tym mówi', async () => {
    const { app, db, clock } = await testHarness();
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    await post(app, tmk, openDay({ sessionUuid: 'am', picId: 'TMK' }));
    await post(app, tmk, closeDay({ sessionUuid: 'am', picId: 'TMK' }));
    clock.advance(5 * 60 * 1000);
    await post(app, krz, openDay({ sessionUuid: 'pm', picId: 'KRZ' }));
    await post(app, krz, closeDay({ sessionUuid: 'pm', picId: 'KRZ' }));

    // Dwa wiersze dziennika (po jednym na sesję) i JEDNA karta — obie sesje pisały pod
    // tą samą nazwą.
    expect(await exportLogRows(db)).toHaveLength(2);
    expect(await sheetRowCount(db)).toBe(1);

    const amSheet = (await getPanel(app, tmk, '/exports/am/sheet')).json();
    const pmSheet = (await getPanel(app, tmk, '/exports/pm/sheet')).json();
    // Ta sama nazwa = ta sama treść: podgląd sesji porannej pokazuje dzień KRZ-a.
    expect(amSheet.rows).toEqual(pmSheet.rows);
    expect(amSheet.rows).toContainEqual(['PIC', 'KRZ']);

    // Rozwinięcie niesie ten fakt razem z podglądem, bo to podgląd wprowadza w błąd.
    const history = (await getPanel(app, tmk, '/exports/am')).json();
    expect(history.overwrittenBy).toMatchObject({ sessionUuid: 'pm' });
    expect((await getPanel(app, tmk, '/exports/pm')).json().overwrittenBy).toBeNull();
  });

  it('ten sam dzień na INNYM samolocie to nie kolizja — nazwa karty jest inna', async () => {
    const { app, clock } = await testHarness();
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    await post(app, tmk, openDay({ sessionUuid: 'a-axa', picId: 'TMK' }));
    await post(app, tmk, closeDay({ sessionUuid: 'a-axa', picId: 'TMK' }));
    clock.advance(5 * 60 * 1000);
    await post(app, krz, openDay({ sessionUuid: 'b-fgk', picId: 'KRZ', aircraftId: 'SP-FGK' }));
    await post(app, krz, closeDay({ sessionUuid: 'b-fgk', picId: 'KRZ', aircraftId: 'SP-FGK' }));

    const body = (await listExports(app, tmk)).json();

    for (const item of body.items) expect(item.overwrittenBy).toBeNull();
    expect(body.counts.overwritten).toBe(0);
  });

  it('kolejne REWIZJE tej samej sesji nie nadpisują same siebie', async () => {
    // Regeneracja własnej karty jest zamierzona i codzienna (spóźniony sync, korekta).
    // Warunek `o.session_uuid <> s.session_uuid` istnieje właśnie po to.
    const { app, clock } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'self', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'self', picId: 'TMK' }));
    clock.advance(5 * 60 * 1000);
    await retry(app, 'self', admin);

    const body = (await listExports(app, admin)).json();
    expect(body.items[0]).toMatchObject({ revision: 2, overwrittenBy: null });
    expect(body.counts).toMatchObject({ revised: 1, overwritten: 0 });
  });
});

describe('historia rewizji i podgląd karty (A05)', () => {
  it('N wierszy dziennika, JEDEN wiersz karty — dwie tabele, dwa zadania', async () => {
    const { app, db } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'h-1', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'h-1', picId: 'TMK' }));
    await retry(app, 'h-1', admin);
    await retry(app, 'h-1', admin);

    const history = (await getPanel(app, admin, '/exports/h-1')).json();

    expect(history).toMatchObject({ sessionUuid: 'h-1', tab: '2026-06-22_SP-AXA', state: 'current' });
    // Dziennik pamięta KAŻDĄ wysyłkę z osobna, od najstarszej.
    expect(history.revisions.map((r: { revision: number }) => r.revision)).toEqual([1, 2, 3]);
    expect(history.revisions[0]).toMatchObject({
      day: '2026-06-22',
      sheetUrl: 'http://uzaero.test/sheets/2026-06-22_SP-AXA',
    });
    // …a karta trzyma WYŁĄCZNIE treść bieżącą. To jest cała treść tego ekranu.
    expect(history.sheetRows).toBe(1);
    expect(await sheetRowCount(db)).toBe(1);
    expect(await exportLogRows(db)).toHaveLength(3);
  });

  it('podgląd karty jedzie POD PREFIKSEM PANELU — ciasteczko sesji nie widzi `/sheets`', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'p-1', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'p-1', picId: 'TMK' }));

    const res = await getPanel(app, admin, '/exports/p-1/sheet');

    expect(res.statusCode).toBe(200);
    expect(res.json().tab).toBe('2026-06-22_SP-AXA');
    // Dosłowne wiersze dokumentu, te same, które oddaje `GET /sheets/:tab` telefonowi.
    expect(res.json().rows).toContainEqual(['Samolot', 'SP-AXA']);

    const phone = await app.inject({
      method: 'GET',
      url: '/sheets/2026-06-22_SP-AXA',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.json().rows).toEqual(phone.json().rows);
  });

  it('404 na podglądzie dnia, którego karta nigdy nie powstała', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');
    await post(app, admin, openDay({ sessionUuid: 'nosheet', picId: 'TMK' }));

    expect((await getPanel(app, admin, '/exports/nosheet/sheet')).statusCode).toBe(404);
    expect((await getPanel(app, admin, '/exports/nie-ma-takiej')).statusCode).toBe(404);
  });
});

describe('ponowienie eksportu (A05)', () => {
  it('DOPISUJE wiersz dziennika i NADPISUJE treść karty', async () => {
    const { app, db } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'r-1', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'r-1', picId: 'TMK' }));
    expect(await exportLogRows(db)).toEqual([
      { session_uuid: 'r-1', revision: 1, day: '2026-06-22' },
    ]);

    const res = await retry(app, 'r-1', admin);

    expect(res.statusCode).toBe(200);
    expect(res.json().retry).toMatchObject({
      sessionUuid: 'r-1',
      tab: '2026-06-22_SP-AXA',
      revisionBefore: 1,
      revisionAfter: 2,
      outcome: { exported: true, revision: 2, tab: '2026-06-22_SP-AXA' },
    });
    // Odpowiedź niesie ŚWIEŻY wiersz listy, żeby panel nie musiał dopytywać.
    expect(res.json().row).toMatchObject({ state: 'current', revision: 2 });

    // Dziennik urósł, karta została jedna — to jest test, dla którego ten ekran istnieje.
    expect(await exportLogRows(db)).toEqual([
      { session_uuid: 'r-1', revision: 1, day: '2026-06-22' },
      { session_uuid: 'r-1', revision: 2, day: '2026-06-22' },
    ]);
    expect(await sheetRowCount(db)).toBe(1);
  });

  it('pierwsze ponowienie po AWARII eksportu daje rewizję 1, a nie 2', async () => {
    const { app, db, sheets } = await flakyHarness();
    const admin = await login(app, 'TMK');

    sheets.failing = true;
    await post(app, admin, openDay({ sessionUuid: 'f-1', picId: 'TMK' }));
    // Awaria arkuszy NIE cofa przyjęcia zdarzeń — telefon dostał 200, dzień jest zamknięty.
    expect((await post(app, admin, closeDay({ sessionUuid: 'f-1', picId: 'TMK' }))).statusCode).toBe(
      200,
    );
    expect(await exportLogRows(db)).toEqual([]);

    // …i właśnie tak wygląda dzień, dla którego ten ekran powstał.
    const before = (await listExports(app, admin)).json();
    expect(before.items[0]).toMatchObject({ state: 'missing', revision: null });
    expect(before.counts).toMatchObject({ missing: 1, current: 0 });

    // Ponowienie przy nadal padniętym adapterze: 200 z `outcome: null`, nie 500.
    const failed = await retry(app, 'f-1', admin);
    expect(failed.statusCode).toBe(200);
    expect(failed.json().retry).toMatchObject({
      outcome: null,
      revisionBefore: null,
      revisionAfter: null,
    });
    expect(await exportLogRows(db)).toEqual([]);

    sheets.failing = false;
    const fixed = await retry(app, 'f-1', admin);
    expect(fixed.json().retry).toMatchObject({
      revisionBefore: null,
      revisionAfter: 1,
      outcome: { exported: true, revision: 1 },
    });
    expect(await exportLogRows(db)).toEqual([
      { session_uuid: 'f-1', revision: 1, day: '2026-06-22' },
    ]);
  });

  it('odmowa bramki to 200 z POWODEM, nie 500 — i nie dopisuje rewizji', async () => {
    const { app, db } = await testHarness();
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    await post(app, tmk, openDay({ sessionUuid: 'g-open', picId: 'TMK' }));
    await post(app, krz, openDay({ sessionUuid: 'g-block', picId: 'KRZ' }));
    await post(app, krz, closeDay({ sessionUuid: 'g-block', picId: 'KRZ' }));

    const openDayRetry = await retry(app, 'g-open', tmk);
    expect(openDayRetry.statusCode).toBe(200);
    expect(openDayRetry.json().retry.outcome).toEqual({ exported: false, reason: 'session_open' });

    const blockedRetry = await retry(app, 'g-block', tmk);
    expect(blockedRetry.statusCode).toBe(200);
    expect(blockedRetry.json().retry.outcome).toEqual({ exported: false, reason: 'overlap_flag' });

    // Ponowienie NIE omija bramek §4.7 — sporny dzień dalej nie ma karty.
    expect(await exportLogRows(db)).toEqual([]);
    expect(await sheetRowCount(db)).toBe(0);
  });

  it('zostawia ślad w audycie: karta, rewizja przed i po, wynik próby', async () => {
    const { app, db } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'a-1', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'a-1', picId: 'TMK' }));
    await retry(app, 'a-1', admin);

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'export.retry',
      actor_pilot_id: 'TMK',
      // Celem jest KARTA — dziennik ma się dać zawęzić do „co robiono z tym arkuszem".
      target_type: 'sheet',
      target_id: '2026-06-22_SP-AXA',
    });
    expect(rows[0]!.details).toMatchObject({
      sessionUuid: 'a-1',
      revisionBefore: 1,
      revisionAfter: 2,
      outcome: { exported: true, revision: 2 },
    });
  });

  it('ślad powstaje TAKŻE przy odmowie — inaczej „dlaczego ten dzień stoi" nie ma odpowiedzi', async () => {
    const { app, db } = await testHarness();
    const admin = await login(app, 'TMK');
    await post(app, admin, openDay({ sessionUuid: 'a-2', picId: 'TMK' }));

    await retry(app, 'a-2', admin);

    const rows = await auditRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toMatchObject({
      outcome: { exported: false, reason: 'session_open' },
    });
  });

  /**
   * AWARIA ADAPTERA ARKUSZY TO CO INNEGO NIŻ BŁĄD PO NASZEJ STRONIE (poprawka 2026-08-01).
   *
   * Do tej pory komenda łapała KAŻDY wyjątek i zwracała `outcome: null`, a panel mówił
   * na to „Adapter arkuszy zgłosił awarię — spróbuj ponownie za chwilę". Czyli `TypeError`
   * w projekcji albo przegrany wyścig rewizji były raportowane jako awaria Google:
   * komunikat kazał administratorowi CZEKAĆ na coś, co samo nie minie.
   */
  it('awaria zapisu karty jedzie jako `sheets_adapter`', async () => {
    const { app, db, sheets } = await flakyHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'e-sheets', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'e-sheets', picId: 'TMK' }));

    sheets.failing = true;
    const res = await retry(app, 'e-sheets', admin);

    expect(res.statusCode).toBe(200);
    expect(res.json().retry).toMatchObject({ outcome: null, failure: 'sheets_adapter' });
    // Rodzaj awarii zostaje w dzienniku nadzoru: bez niego dwa różne wpisy wyglądają
    // identycznie (`outcome: null`) i po latach nie da się ich rozróżnić.
    expect((await auditRows(db))[0]!.details).toMatchObject({ failure: 'sheets_adapter' });
  });

  it('błąd PO NASZEJ STRONIE jedzie jako `unexpected`, nie jako awaria arkuszy', async () => {
    const { app, db, events } = await explodingHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'e-boom', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'e-boom', picId: 'TMK' }));

    // Wybucha dopiero teraz: ingest przeszedł normalnie, więc dzień jest zamknięty
    // i ma kartę — tak jak w prawdziwej regresji, która wychodzi przy ponowieniu.
    events.explode = true;
    const res = await retry(app, 'e-boom', admin);

    // Dalej 200 z powodem, nie 500: ślad w dzienniku ma powstać ZWŁASZCZA wtedy…
    expect(res.statusCode).toBe(200);
    expect(res.json().retry).toMatchObject({ outcome: null, failure: 'unexpected' });
    // …ale nie wolno mu udawać znanego trybu awarii.
    expect(res.json().retry.failure).not.toBe('sheets_adapter');
    expect((await auditRows(db))[0]!.details).toMatchObject({ failure: 'unexpected' });
  });

  it('udana próba i odmowa bramki nie mają rodzaju awarii', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'e-ok', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'e-ok', picId: 'TMK' }));
    expect((await retry(app, 'e-ok', admin)).json().retry.failure).toBeNull();

    // Odmowa jest stanem świata, a nie awarią — `failure` musi zostać puste, inaczej
    // panel pokazałby „coś się zepsuło" tam, gdzie działa zasada.
    await post(app, admin, openDay({ sessionUuid: 'e-open', picId: 'TMK', dayOffset: 1 }));
    const refused = await retry(app, 'e-open', admin);
    expect(refused.json().retry).toMatchObject({
      outcome: { exported: false, reason: 'session_open' },
      failure: null,
    });
  });

  it('404 dla nieznanej sesji — i ANI JEDNEGO wpisu w dzienniku audytu', async () => {
    const { app, db } = await testHarness();
    const admin = await login(app, 'TMK');

    const res = await retry(app, 'nie-ma-takiej-sesji', admin);

    expect(res.statusCode).toBe(404);
    // Wpis o operacji na nieistniejącym celu byłby szumem w dzienniku nadzoru.
    expect(await auditRows(db)).toEqual([]);
  });
});

describe('rewizje są jednoznaczne (migracja 14)', () => {
  it('baza ODRZUCA drugą rewizję o tym samym numerze', async () => {
    const { app, db } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'u-1', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'u-1', picId: 'TMK' }));

    // Dokładnie ten wiersz, który powstałby przy przegranym wyścigu dwóch eksportów:
    // ten sam `session_uuid`, ten sam numer rewizji.
    const duplicate = db.query(
      `INSERT INTO export_log (session_uuid, day, aircraft_id, sheet_url, revision, exported_at)
       VALUES ('u-1', '2026-06-22', 'SP-AXA', 'http://uzaero.test/x', 1, now())`,
    );

    await expect(duplicate).rejects.toMatchObject({ code: '23505' });
    expect(await exportLogRows(db)).toHaveLength(1);
  });

  /**
   * ══ CZEGO TEN PRZYPADEK NIE DOWODZI ══
   * **Nie dowodzi, że działa blokada advisory** — i tak ma być zapisane, zamiast udawać
   * inaczej. PGlite ma JEDNO połączenie i szereguje transakcje własnym mutexem, więc
   * `pg_advisory_xact_lock` nie ma tu czego wstrzymać: po jego usunięciu ten przypadek
   * nadal przechodzi (sprawdzone). Prawdziwej równoległości nie da się na PGlite
   * odtworzyć, a test, który by ją udawał, dawałby fałszywe poczucie pokrycia.
   *
   * Dowodzi natomiast rzeczy, którą da się sprawdzić: sekwencja nadania rewizji jest
   * poprawna, dwie próby dają dwa RÓŻNE numery i żadna nie kończy się pięćsetką.
   * Przed wyścigiem, którego tu nie ma, broni ograniczenie z migracji 14 — a ono ma
   * własny przypadek wyżej i ten faktycznie upada po zdjęciu `UNIQUE`.
   */
  it('dwa ponowienia naraz dają DWIE różne rewizje, nie dwie takie same', async () => {
    const { app, db } = await testHarness();
    const admin = await login(app, 'TMK');

    await post(app, admin, openDay({ sessionUuid: 'u-2', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'u-2', picId: 'TMK' }));

    const [a, b] = await Promise.all([retry(app, 'u-2', admin), retry(app, 'u-2', admin)]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const revisions = [a, b].map((res) => res.json().retry.revisionAfter).sort();
    expect(revisions).toEqual([2, 3]);
    expect((await exportLogRows(db)).map((r) => r.revision)).toEqual([1, 2, 3]);
    // Treść karty dalej JEDNA — obie wysyłki budują ją z tego samego strumienia.
    expect(await sheetRowCount(db)).toBe(1);
  });
});

/**
 * KOLEJNOŚĆ rozstrzygania stanu — jedyny przypadek, którego nie da się zbudować przez
 * `POST /events`, bo wymaga sesji jednocześnie bez preflightu i objętej flagą.
 *
 * Ten blok DOPEŁNIA przypadki HTTP wyżej, a nie zastępuje ich: test modułu czystego
 * przechodzi także wtedy, gdy nikt tego modułu nie woła. Stany osiągalne naturalnie
 * (`waiting`, `blocked`, `missing`, `current`, `impossible`) są przybite przez trasę.
 */
describe('pierwszeństwo stanów karty', () => {
  const join = (patch: Partial<AdminExportJoin>): AdminExportJoin => ({
    sessionUuid: 's',
    aircraftId: 'SP-AXA',
    reg: 'SP-AXA',
    aircraftType: 'Cessna 182',
    picId: 'TMK',
    picCode: 'TMK',
    picName: 'Tomasz Małkiewicz',
    status: 'closed',
    claimedAt: DAY,
    updatedAt: new Date(DAY),
    blockingFlagIds: [],
    revision: null,
    exportedAt: null,
    sheetUrl: null,
    overwrittenBy: null,
    ...patch,
  });

  it('brak chwili przejęcia wygrywa ze wszystkim — karty nie da się NAZWAĆ', () => {
    // „Brakuje karty" sugerowałoby, że da się ją dorobić; tu nie ma jak. Od migracji 21
    // to stan wyłącznie awaryjny: `session_claim` ma KAŻDA sesja (§4.4).
    expect(exportState(join({ claimedAt: null, blockingFlagIds: [7], status: 'active' }))).toBe(
      'impossible',
    );
  });

  it('dzień w toku jest `waiting`, nawet gdy wisi na nim flaga blokująca', () => {
    // Dzień, który jeszcze trwa, nie jest zablokowany decyzją człowieka — jest niegotowy.
    expect(exportState(join({ status: 'active', blockingFlagIds: [7] }))).toBe('waiting');
  });

  it('flaga wygrywa z brakiem karty — wiersz ma prowadzić do flagi, nie do „Ponów"', () => {
    expect(exportState(join({ blockingFlagIds: [7] }))).toBe('blocked');
  });

  it('rewizja bez stempla wysyłki to nadal `missing`, nie „karta jest"', () => {
    // Obie kolumny wchodzą do `export_log` jednym `INSERT`-em, więc rozjazd znaczy
    // ręczną ingerencję — i wtedy uczciwiej powiedzieć „karty nie ma".
    expect(exportState(join({ revision: 2, exportedAt: null }))).toBe('missing');
    expect(exportState(join({ revision: 2, exportedAt: new Date(DAY) }))).toBe('current');
  });
});

describe('zdolności monitora eksportu', () => {
  it('szef wyszkolenia CZYTA monitor, ale nie ponawia; pilot nie wchodzi wcale', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');
    const trainingLead = await login(app, 'AKO');
    const pilot = await login(app, 'PWI');

    await post(app, admin, openDay({ sessionUuid: 'z-1', picId: 'TMK' }));
    await post(app, admin, closeDay({ sessionUuid: 'z-1', picId: 'TMK' }));

    // Odczyt: `panel.access` — monitor jest narzędziem obojga.
    expect((await listExports(app, trainingLead)).statusCode).toBe(200);
    expect((await getPanel(app, trainingLead, '/exports/z-1')).statusCode).toBe(200);
    expect((await getPanel(app, trainingLead, '/exports/z-1/sheet')).statusCode).toBe(200);

    // Ponowienie nadpisuje dokument klubu — zostaje przy właścicielu systemu.
    const refused = await retry(app, 'z-1', trainingLead);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ required: 'fleet.manage' });

    expect((await listExports(app, pilot)).statusCode).toBe(403);
    expect((await retry(app, 'z-1')).statusCode).toBe(401);
  });

  it('ponowienie bez nagłówka CSRF jest odrzucane', async () => {
    const { app } = await testHarness();
    const admin = await login(app, 'TMK');

    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/exports/z-2/retry',
      headers: { authorization: `Bearer ${admin}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
