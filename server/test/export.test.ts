/**
 * UZ Aero (serwer) - testy eksportu dziennych arkuszy (§4.7).
 *
 * Ta sama zasada co w `ingest.test.ts`: scenariusze jadą przez PRAWDZIWY `POST /events`
 * na PGlite, a jedyną atrapą jest `FakeSheets` (adaptera Google jeszcze nie ma).
 * Zawartość karty przybijamy liczbami KANONICZNEGO dnia - arkusz liczy ta sama
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

/** Kanoniczny dzień z `ingest.test.ts` - te same liczby, co test projekcji telefonu. */
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
      { finalReading: { fuelL: 88, mh: 1241.15 } },
      base,
    ),
  ];
}

/**
 * Druga zmiana na TYM SAMYM samolocie tego samego dnia - wejście testów karty doby.
 *
 * Zaczyna się PO zamknięciu poprzedniej sesji i podejmuje jej odczyty (paliwo 88 L,
 * MH 1241.15), więc nie tworzy ani nakładki, ani dziury w łańcuchu MH: przedmiotem
 * testu jest kształt karty, nie flagi.
 */
function shift(o: {
  sessionUuid: string;
  picId: string;
  from: number;
  reading: { fuelL: number; mh: number };
  finalReading: { fuelL: number; mh: number };
  closed?: boolean;
}) {
  const base = { sessionUuid: o.sessionUuid, picId: o.picId };
  const t = (minutes: number): number => o.from + minutes * 60_000;
  const events = [
    event('session_claim', t(0), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      t(0),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        reading: o.reading,
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', t(10), {}, base),
    event('takeoff', t(20), { method: 'auto' }, base),
    event('landing', t(50), { method: 'auto' }, base),
    event('engine_stop', t(60), {}, base),
  ];
  if (o.closed === false) return events;
  return [
    ...events,
    event('day_close', t(70), { finalReading: o.finalReading }, base),
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

    // Nagłówek doby - data UTC, samolot, ile zmian, czas blokowy doby.
    expect(sheet.rows).toContainEqual(['UZ Aero - doba samolotu', '2026-06-22 (UTC)']);
    expect(sheet.rows).toContainEqual(['Samolot', 'SP-AXA']);
    expect(sheet.rows).toContainEqual(['Sesje', '1']);
    expect(sheet.rows).toContainEqual(['Czas blokowy doby', '02:22']);

    // Wiersz zmiany: załoga kodami, operacja, przejęcie → zdanie, block, stan.
    expect(sheet.rows).toContainEqual([
      'S1',
      'TMK',
      '-',
      'skoki',
      '08:00',
      '16:45',
      '02:22',
      'zdany',
    ]);

    // Tabela lotów: sesja, czasy UTC, czas lotu, metoda detekcji.
    expect(sheet.rows).toContainEqual(['Sesja', '#', 'Takeoff', 'Landing', 'Block', 'Metoda']);
    expect(sheet.rows).toContainEqual(['S1', '1', '08:25', '09:18', '00:53', 'AUTO']);

    // Bilans paliwa: 150 + 0 − 62 = 88 L - liczby z ekranu 10, nie własna arytmetyka.
    // Doba z jedną zmianą powtarza jej wiersz i to jest właściwe: suma jednego składnika.
    expect(sheet.rows).toContainEqual(['S1', '150', '0', '62', '88']);
    expect(sheet.rows).toContainEqual(['Doba', '150', '0', '62', '88']);

    // Motogodziny w formacie samolotu (hhmm): 1234.5 → „1234:30", delta 6.65 → „6:39".
    expect(sheet.rows).toContainEqual(['S1', '1234:30', '1241:09', '6:39']);
    expect(sheet.rows).toContainEqual(['Doba', '1234:30', '1241:09', '6:39']);

    // Operacja skoki → sekcja zrzutów, choćby zerowa (strona przychodowa doby).
    expect(sheet.rows).toContainEqual(['S1', '0', '0']);
    expect(sheet.rows).toContainEqual(['Klient', '-']);

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

    // Ekran 11 dostaje link - pudełko „Serwer zaktualizował arkusz".
    const status = await syncStatus(app, token, 'sess-1');
    expect(status.exportUrl).toBe('https://sheets.example/2026-06-22_SP-AXA');
  });

  it('spóźniona paczka do zamkniętej sesji → rewizja 2 i przegenerowana karta (§4.7)', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const token = await login(app);
    await post(app, token, day());

    // Zrzut zsynchronizowany PO eksporcie - dane dnia się zmieniły, arkusz musi dogonić.
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
    expect(regenerated.rows).toContainEqual(['S1', '1', '4 (2 tandem / 1 AFF / 1 solo)']);
    expect(regenerated.rows).toContainEqual(['Doba', '1', '4 (2 tandem / 1 AFF / 1 solo)']);

    const log = await exportRows(db);
    expect(log.map((r) => r.revision)).toEqual([1, 2]); // append-only: historia zostaje
    const status = await syncStatus(app, token, 'sess-1');
    expect(status.exportUrl).toBe('https://sheets.example/2026-06-22_SP-AXA');
  });

  it('otwarta flaga aircraft_overlap wstrzymuje eksport do decyzji administratora (§4.7)', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const tokenTmk = await login(app, 'TMK');
    const tokenKrz = await login(app, 'KRZ');

    // TMK nie zamyka dnia… a KRZ przejmuje offline i wysyła własną otwartą sesję -
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

    // KRZ zamyka SWÓJ dzień - sesja domknięta, ale sporna: do arkusza NIE trafia,
    // dopóki flaga nie zostanie rozwiązana (rozwiązuje administrator, nie kokpit).
    const close = await post(app, tokenKrz, [
      event(
        'day_close',
        at(16, 45),
        { finalReading: { fuelL: 95, mh: 1237.4 } },
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

  it('awaria Sheets NIE psuje przyjęcia zdarzeń - 200, accepted, export_log pusty', async () => {
    const sheets = new FakeSheets();
    sheets.failWith = new Error('Google API 503');
    const { app, db } = await testHarness({ sheets });
    const token = await login(app);

    // Telefon dostaje 200 za PRZYJĘCIE - eksport to skutek, nie warunek; awaria
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

/**
 * KARTA = DOBA SAMOLOTU, NIE SESJA (decyzja 2026-08-07, §4.7).
 *
 * Po skróceniu sesji (§3.6a) nazwa `YYYY-MM-DD_SP-XXX` przestała być kluczem unikalnym:
 * w dniu skokowym tą samą maszyną lata dwóch pilotów, więc druga karta NADPISYWAŁA
 * pierwszą i podgląd porannej zmiany pokazywał treść popołudniowej. Klub czyta dzień
 * per samolot, więc jednostką jest doba, a sesje są jej WIERSZAMI.
 */
describe('karta = doba samolotu (§4.7)', () => {
  it('dwie zmiany jednego dnia = JEDNA karta z obiema sesjami i WSPÓLNĄ rewizją', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    // Zmiana poranna - zamknięta, karta wychodzi po zdaniu samolotu.
    await post(app, tmk, day('zmiana-am'));
    // Zmiana popołudniowa - ten sam samolot, ta sama doba, inny pilot.
    await post(
      app,
      krz,
      shift({
        sessionUuid: 'zmiana-pm',
        picId: 'KRZ',
        from: at(17, 0),
        reading: { fuelL: 88, mh: 1241.15 },
        finalReading: { fuelL: 60, mh: 1243.15 },
      }),
    );

    // Dwa zapisy karty (po jednym na zdanie samolotu), ale ZA KAŻDYM RAZEM ta sama karta.
    expect(sheets.calls.map((c) => c.tab)).toEqual([
      '2026-06-22_SP-AXA',
      '2026-06-22_SP-AXA',
    ]);

    // Druga wersja karty niesie OBIE zmiany - pierwsza nie zniknęła pod drugą.
    const card = sheets.calls[1]!;
    expect(card.rows).toContainEqual(['UZ Aero - doba samolotu', '2026-06-22 (UTC)']);
    expect(card.rows).toContainEqual(['Samolot', 'SP-AXA']);
    expect(card.rows).toContainEqual(['Sesje', '2']);
    expect(card.rows).toContainEqual([
      'Sesja',
      'PIC',
      'Dual',
      'Operacja',
      'Przejęcie',
      'Zdanie',
      'Block',
      'Stan',
    ]);
    expect(card.rows).toContainEqual([
      'S1',
      'TMK',
      '-',
      'skoki',
      '08:00',
      '16:45',
      '02:22',
      'zdany',
    ]);
    expect(card.rows).toContainEqual([
      'S2',
      'KRZ',
      '-',
      'skoki',
      '17:00',
      '18:10',
      '00:50',
      'zdany',
    ]);

    // Wiersz lotu daje się przypisać do sesji - administrator ma wiedzieć, kto co latał.
    expect(card.rows).toContainEqual(['Sesja', '#', 'Takeoff', 'Landing', 'Block', 'Metoda']);
    expect(card.rows).toContainEqual(['S1', '1', '08:25', '09:18', '00:53', 'AUTO']);
    expect(card.rows).toContainEqual(['S2', '1', '17:20', '17:50', '00:30', 'AUTO']);

    // Sumy są DOBĄ: paliwo od pierwszego odczytu do ostatniego, MH jako ruch licznika.
    expect(card.rows).toContainEqual(['Doba', '150', '0', '90', '60']);
    expect(card.rows).toContainEqual(['Doba', '1234:30', '1243:09', '8:39']);

    // Rewizja należy do PARY (doba, samolot): druga zmiana podbija numer karty,
    // zamiast zaczynać własne liczenie od jedynki.
    expect(await exportRows(db)).toEqual([
      {
        session_uuid: 'zmiana-am',
        day: '2026-06-22',
        aircraft_id: 'SP-AXA',
        sheet_url: 'https://sheets.example/2026-06-22_SP-AXA',
        revision: 1,
      },
      {
        session_uuid: 'zmiana-am',
        day: '2026-06-22',
        aircraft_id: 'SP-AXA',
        sheet_url: 'https://sheets.example/2026-06-22_SP-AXA',
        revision: 2,
      },
      {
        session_uuid: 'zmiana-pm',
        day: '2026-06-22',
        aircraft_id: 'SP-AXA',
        sheet_url: 'https://sheets.example/2026-06-22_SP-AXA',
        revision: 2,
      },
    ]);

    // Ekran 11 OBU pilotów prowadzi do tej samej karty - powiązanie sesja→karta
    // przeżyło zmianę jednostki.
    expect((await syncStatus(app, tmk, 'zmiana-am')).exportUrl).toBe(
      'https://sheets.example/2026-06-22_SP-AXA',
    );
    expect((await syncStatus(app, krz, 'zmiana-pm')).exportUrl).toBe(
      'https://sheets.example/2026-06-22_SP-AXA',
    );
  });

  it('ta sama zmiana NASTĘPNEGO dnia to inna karta i własna rewizja 1', async () => {
    const sheets = new FakeSheets();
    const { app, db } = await testHarness({ sheets });
    const tmk = await login(app, 'TMK');

    await post(app, tmk, day('d-1'));
    await post(
      app,
      tmk,
      shift({
        sessionUuid: 'd-2',
        picId: 'TMK',
        from: at(8, 0) + 24 * 60 * 60 * 1000,
        reading: { fuelL: 88, mh: 1241.15 },
        finalReading: { fuelL: 60, mh: 1243.15 },
      }),
    );

    expect(sheets.calls.map((c) => c.tab)).toEqual([
      '2026-06-22_SP-AXA',
      '2026-06-23_SP-AXA',
    ]);
    expect((await exportRows(db)).map((r) => [r.day, r.revision])).toEqual([
      ['2026-06-22', 1],
      ['2026-06-23', 1],
    ]);
  });
});

describe('daySheetContent (czysta funkcja)', () => {
  it('nazwa karty = konwencja aplikacji (§4.7), bajt w bajt', () => {
    // Ten sam wynik co `sheetTabName` w `app/src/ui/screens/syncStatus.ts` - telefon
    // pokazuje cel eksportu na ekranie 11, zanim serwer cokolwiek zapisze.
    expect(sheetTabName(at(8, 0), 'SP-AXA')).toBe('2026-06-22_SP-AXA');
    // Data karty jest UTC: 23:30 Z to wciąż 22 czerwca, niezależnie od strefy serwera.
    expect(sheetTabName(Date.UTC(2026, 5, 22, 23, 30), 'SP-AXA')).toBe('2026-06-22_SP-AXA');
  });

  it('doba BEZ ani jednej sesji nie ma karty', () => {
    // Jedyny powód, dla którego karty nie da się zbudować. Do 2026-08-07 był nim brak
    // MELDUNKU (`dutyStart`) - a po §3.6a meldunek jest opcjonalny i zwykle pusty, więc
    // ta bramka odrzucałaby dziś każdą sesję z przebudowanego flow.
    expect(
      buildDaySheet({ day: '2026-06-22', aircraftId: 'SP-AXA', sessions: [], excluded: [] }),
    ).toBeNull();
  });

  it('sesja z SAMYM claimem (bez preflightu) jest wierszem karty, a nie jej brakiem', () => {
    // Pilot wziął samolot i nie dokończył przejęcia. Maszyna była zajęta - karta doby
    // ma to pokazać, bo to jest fakt o samolocie, a nie luka w danych do ukrycia.
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

    const sheet = buildDaySheet({
      day: '2026-06-22',
      aircraftId: 'SP-AXA',
      sessions: [{ sessionUuid: 'sess-x', state, crew: { pic: 'TMK', dual: null } }],
      excluded: [],
    });

    expect(sheet?.tab).toBe('2026-06-22_SP-AXA');
    expect(sheet?.rows).toContainEqual([
      'S1',
      'TMK',
      '-',
      '-',
      '08:00',
      '-',
      '00:00',
      'w toku',
    ]);
    // Bez operacji Skoki sekcja zrzutów nie powstaje - zera byłyby szumem, nie informacją.
    expect(sheet?.rows.some((r) => r[0] === 'Zrzuty')).toBe(false);
  });

  it('sesja wstrzymana flagą wypada z karty, a karta MÓWI, że jest niekompletna', () => {
    // §4.7: bramka obejmuje SESJĘ, nie kartę - jedna sporna zmiana nie kasuje doby
    // całej maszyny, ale też nie znika z dokumentu bez słowa.
    const state = projectSession([
      {
        uuid: 'kept-claim-1',
        sessionUuid: 'sess-ok',
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

    const sheet = buildDaySheet({
      day: '2026-06-22',
      aircraftId: 'SP-AXA',
      sessions: [{ sessionUuid: 'sess-ok', state, crew: { pic: 'TMK', dual: null } }],
      excluded: [{ sessionUuid: 'sess-sporna', flagIds: [12] }],
    });

    expect(sheet?.rows).toContainEqual([
      'Niekompletna',
      'sesja sess-sporna poza kartą - flaga #12',
    ]);
  });
});

// ── blok „Olej (L)" (issue #60, etap D) ─────────────────────────────────────────

describe('blok oleju na karcie doby (issue #60)', () => {
  const claimAnd = (extra: Event[]): Event[] => [
    {
      uuid: 'oil-claim-1',
      sessionUuid: 'sess-oil',
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
    ...extra,
  ];

  const preflight = (oil: { oilL?: number | null; oilAddedL?: number | null }): Event =>
    ({
      uuid: 'oil-pf-1',
      sessionUuid: 'sess-oil',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type: 'preflight_confirm',
      deviceTime: at(8, 0),
      gpsTime: at(8, 0),
      payload: {
        operation: 'ferry',
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
        ...oil,
      },
      schemaVersion: 1,
      syncedAt: null,
    }) as Event;

  it('sesja z pomiarem i dolewką dostaje blok z wierszem sesji i „Dobą"', () => {
    const state = projectSession(claimAnd([preflight({ oilL: 10.2, oilAddedL: 1.0 })]));
    const sheet = buildDaySheet({
      day: '2026-06-22',
      aircraftId: 'SP-AXA',
      sessions: [{ sessionUuid: 'sess-oil', state, crew: { pic: 'TMK', dual: null } }],
      excluded: [],
    });

    expect(sheet?.rows.some((r) => r[0] === 'Olej (L)')).toBe(true);
    expect(sheet?.rows).toContainEqual(['S1', '10,2', '1,0']);
    expect(sheet?.rows).toContainEqual(['Doba', '10,2', '1,0']);
  });

  it('doba bez oleju NIE dostaje bloku - ponowny eksport starej karty nie podbija rewizji', () => {
    const state = projectSession(claimAnd([preflight({})]));
    const sheet = buildDaySheet({
      day: '2026-06-22',
      aircraftId: 'SP-AXA',
      sessions: [{ sessionUuid: 'sess-oil', state, crew: { pic: 'TMK', dual: null } }],
      excluded: [],
    });

    expect(sheet?.rows.some((r) => r[0] === 'Olej (L)')).toBe(false);
  });
});
