/**
 * UZ Aero (serwer) — testy eksportu dziennych arkuszy (§4.7).
 *
 * Ta sama zasada co w `ingest.test.ts`: scenariusze jadą przez PRAWDZIWY `POST /events`
 * na PGlite, a jedyną atrapą jest `FakeSheets` (adaptera Google jeszcze nie ma).
 * Zawartość karty przybijamy liczbami KANONICZNEGO dnia — arkusz liczy ta sama
 * projekcja co ekran 10 telefonu, więc 150→88 L, 1234:30→1241:09 MH i block 02:22
 * nie mają prawa się różnić.
 */

import { describe, expect, it, vi } from 'vitest';

import { projectSession, type Event } from '@uzaero/domain';

import { buildDaySheet, sheetTabName } from '../src/application/common/export/daySheetContent.ts';
import { FakeSheets } from './fakes/fakeSheets.ts';
import { TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
) {
  seq += 1;
  return {
    uuid: `x-${seq}-${type}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    ...over,
  };
}

/** Kanoniczny dzień z `ingest.test.ts` — te same liczby, co test projekcji telefonu. */
function day(sessionUuid = 'sess-1', overrides: Record<string, unknown> = {}) {
  const base = { sessionUuid, ...overrides };
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
        reading: { fuelL: 150, mh: 1234.5 },
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', at(8, 12), {}, base),
    event('takeoff', at(8, 25), { method: 'auto' }, base),
    event('landing', at(9, 18), { method: 'auto' }, base),
    event('engine_stop', at(10, 34), {}, base),
    event(
      'day_close',
      at(16, 45),
      { finalReading: { fuelL: 88, mh: 1241.15 }, dutyEnd: at(16, 45) },
      base,
    ),
  ];
}

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], who = 'TMK') {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

async function post(app: Harness['app'], token: string, events: unknown[]) {
  return app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events },
  });
}

async function syncStatus(app: Harness['app'], token: string, sessionUuid: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/sessions/${sessionUuid}/sync-status`,
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function exportRows(db: Harness['db']) {
  const { rows } = await db.query<{
    session_uuid: string;
    day: string;
    aircraft_id: string;
    sheet_url: string;
    revision: number;
  }>(
    `SELECT session_uuid, day::text AS day, aircraft_id, sheet_url, revision
     FROM export_log ORDER BY id`,
  );
  return rows;
}

describe('eksport dziennego arkusza (§4.7)', () => {
  it('day_close → JEDEN eksport: karta z liczbami telefonu, export_log rev 1, link w sync-status', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const token = await login(app);

    const res = await post(app, token, day());
    expect(res.statusCode).toBe(200);

    // Jedna zamknięta sesja w paczce = dokładnie jeden zapis karty.
    expect(sheets.calls).toHaveLength(1);
    const sheet = sheets.calls[0]!;
    expect(sheet.tab).toBe('2026-06-22_SP-AXA');

    // Nagłówek dnia — data UTC, samolot, załoga kodami, operacja, duty, block.
    expect(sheet.rows).toContainEqual(['UZ Aero — dzień lotny', '2026-06-22 (UTC)']);
    expect(sheet.rows).toContainEqual(['Samolot', 'SP-AXA']);
    expect(sheet.rows).toContainEqual(['PIC', 'TMK']);
    expect(sheet.rows).toContainEqual(['Dual', '—']);
    expect(sheet.rows).toContainEqual(['Operacja', 'skoki']);
    expect(sheet.rows).toContainEqual(['Duty (UTC)', '08:00 → 16:45']);
    expect(sheet.rows).toContainEqual(['Block time', '02:22']);

    // Tabela lotów: czasy UTC, czas lotu, metoda detekcji.
    expect(sheet.rows).toContainEqual(['#', 'Takeoff', 'Landing', 'Block', 'Metoda']);
    expect(sheet.rows).toContainEqual(['1', '08:25', '09:18', '00:53', 'AUTO']);

    // Bilans paliwa: 150 + 0 − 62 = 88 L — liczby z ekranu 10, nie własna arytmetyka.
    expect(sheet.rows).toContainEqual(['Start', '150']);
    expect(sheet.rows).toContainEqual(['Dolane', '0']);
    expect(sheet.rows).toContainEqual(['Zużyte', '62']);
    expect(sheet.rows).toContainEqual(['Koniec', '88']);

    // Motogodziny w formacie samolotu (hhmm): 1234.5 → „1234:30", delta 6.65 → „6:39".
    expect(sheet.rows).toContainEqual(['Start', '1234:30']);
    expect(sheet.rows).toContainEqual(['Koniec', '1241:09']);
    expect(sheet.rows).toContainEqual(['Delta', '6:39']);

    // Operacja skoki → sekcja zrzutów, choćby zerowa (strona przychodowa dnia).
    expect(sheet.rows).toContainEqual(['Wyniesienia', '0']);
    expect(sheet.rows).toContainEqual(['Klient', '—']);

    // Dziennik: pierwszy eksport = rewizja 1, dzień i URL karty.
    expect(await exportRows(db)).toEqual([
      {
        session_uuid: 'sess-1',
        day: '2026-06-22',
        aircraft_id: 'SP-AXA',
        sheet_url: 'https://sheets.example/2026-06-22_SP-AXA',
        revision: 1,
      },
    ]);

    // Ekran 11 dostaje link — pudełko „Serwer zaktualizował arkusz".
    const status = await syncStatus(app, token, 'sess-1');
    expect(status.exportUrl).toBe('https://sheets.example/2026-06-22_SP-AXA');
  });

  it('spóźniona paczka do zamkniętej sesji → rewizja 2 i przegenerowana karta (§4.7)', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const token = await login(app);
    await post(app, token, day());

    // Zrzut zsynchronizowany PO eksporcie — dane dnia się zmieniły, arkusz musi dogonić.
    const late = await post(app, token, [
      event('drop', at(8, 48), {
        dropNumber: 1,
        jumpers: { tandem: 2, aff: 1, solo: 1 },
        altitudeFt: 3200,
      }),
    ]);
    expect(late.statusCode).toBe(200);

    expect(sheets.calls).toHaveLength(2);
    const regenerated = sheets.calls[1]!;
    expect(regenerated.tab).toBe('2026-06-22_SP-AXA'); // ta sama karta, nadpisana
    expect(regenerated.rows).toContainEqual(['Wyniesienia', '1']);
    expect(regenerated.rows).toContainEqual(['Skoczkowie', '4 (2 tandem / 1 AFF / 1 solo)']);

    const log = await exportRows(db);
    expect(log.map((r) => r.revision)).toEqual([1, 2]); // append-only: historia zostaje
    const status = await syncStatus(app, token, 'sess-1');
    expect(status.exportUrl).toBe('https://sheets.example/2026-06-22_SP-AXA');
  });

  it('otwarta flaga session_overlap wstrzymuje eksport do decyzji administratora (§4.7)', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const tokenTmk = await login(app, 'TMK');
    const tokenKrz = await login(app, 'KRZ');

    // TMK nie zamyka dnia… a KRZ przejmuje offline i wysyła własną otwartą sesję —
    // serwer flaguje nakładkę (obie sesje bez day_close).
    await post(app, tokenTmk, day('sess-1').slice(0, 6));
    const takeover = day('sess-2', { picId: 'KRZ' })
      .slice(0, 6)
      .map((e) =>
        e.type === 'preflight_confirm'
          ? { ...e, payload: { ...(e.payload as object), reading: { fuelL: 112, mh: 1236.87 } } }
          : e,
      );
    await post(app, tokenKrz, takeover);

    // KRZ zamyka SWÓJ dzień — sesja domknięta, ale sporna: do arkusza NIE trafia,
    // dopóki flaga nie zostanie rozwiązana (rozwiązuje administrator, nie kokpit).
    const close = await post(app, tokenKrz, [
      event(
        'day_close',
        at(16, 45),
        { finalReading: { fuelL: 95, mh: 1237.4 }, dutyEnd: at(16, 45) },
        { sessionUuid: 'sess-2', picId: 'KRZ' },
      ),
    ]);
    expect(close.statusCode).toBe(200);

    expect(sheets.calls).toHaveLength(0);
    expect(await exportRows(db)).toEqual([]);
    const status = await syncStatus(app, tokenKrz, 'sess-2');
    expect(status.status).toBe('closed');
    expect(status.exportUrl).toBeNull();
  });

  it('awaria Sheets NIE psuje przyjęcia zdarzeń — 200, accepted, export_log pusty', async () => {
    const sheets = new FakeSheets();
    sheets.failWith = new Error('Google API 503');
    const { app, db } = await testHarness({ sheets });
    const token = await login(app);

    // Telefon dostaje 200 za PRZYJĘCIE — eksport to skutek, nie warunek; awaria
    // ląduje w logu serwera, nie w odpowiedzi (inaczej outbox ponawiałby wiecznie
    // paczkę, która dawno weszła).
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await post(app, token, day());
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ accepted: 7, duplicates: 0 });
      expect(errorLog).toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }

    expect(await exportRows(db)).toEqual([]); // bez zapisu karty nie ma wpisu w dzienniku
    const status = await syncStatus(app, token, 'sess-1');
    expect(status.exportUrl).toBeNull();
  });

  it('sesja otwarta (bez day_close) nie jest eksportowana', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const token = await login(app);

    const res = await post(app, token, day().slice(0, 6));
    expect(res.statusCode).toBe(200);

    expect(sheets.calls).toHaveLength(0);
    expect(await exportRows(db)).toEqual([]);
    expect((await syncStatus(app, token, 'sess-1')).exportUrl).toBeNull();
  });
});

describe('daySheetContent (czysta funkcja)', () => {
  it('nazwa karty = konwencja aplikacji (§4.7), bajt w bajt', () => {
    // Ten sam wynik co `sheetTabName` w `app/src/ui/screens/syncStatus.ts` — telefon
    // pokazuje cel eksportu na ekranie 11, zanim serwer cokolwiek zapisze.
    expect(sheetTabName(at(8, 0), 'SP-AXA')).toBe('2026-06-22_SP-AXA');
    // Data karty jest UTC: 23:30 Z to wciąż 22 czerwca, niezależnie od strefy serwera.
    expect(sheetTabName(Date.UTC(2026, 5, 22, 23, 30), 'SP-AXA')).toBe('2026-06-22_SP-AXA');
  });

  it('sesja bez preflightu (brak duty startu) nie ma karty', () => {
    const state = projectSession([
      {
        uuid: 'only-claim-1',
        sessionUuid: 'sess-x',
        aircraftId: 'SP-AXA',
        picId: 'TMK',
        dualId: null,
        type: 'session_claim',
        deviceTime: at(8, 0),
        gpsTime: at(8, 0),
        payload: { mode: 'free' },
        schemaVersion: 1,
        syncedAt: null,
      } as Event,
    ]);
    expect(buildDaySheet(state, { pic: 'TMK', dual: null })).toBeNull();
  });
});
