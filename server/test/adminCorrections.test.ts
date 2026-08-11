/**
 * UZ Aero (serwer) — korekta administratora po oknie 24 h
 * (`POST /admin/api/sessions/:uuid/corrections`, mockup `A02b-korekta.html`).
 *
 * Ten sam wzorzec co reszta: PGlite w procesie, prawdziwe klasy, `app.inject`, zero
 * atrap. Dzień powstaje tak, jak powstaje w produkcji — z PRAWDZIWEGO `POST /events`
 * przysłanego przez telefon PIC-a, bo test, który wstawia zdarzenia `INSERT`-em,
 * przybija własne wyobrażenie o rejestrze, a nie zachowanie systemu.
 *
 * Scenariusz jest scenariuszem z mockupu: silnik wyłączono o 10:34, ale bez fixa GPS
 * czas spadł na zegar telefonu, który spieszył 12 minut. Pilot zauważa to za późno —
 * jego okno korekty (04c) już minęło — więc godzinę prostuje administrator.
 *
 * Najważniejsze przypadki to dwa: (1) korekta ląduje w rejestrze ostemplowana PIC-em
 * SESJI, nie administratorem, a jego tożsamość żyje w audycie; (2) liczby dnia
 * i karta arkusza faktycznie się zmieniają — bez tego korekta byłaby wpisem do
 * dziennika i niczym więcej.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
const HOUR_MS = 3_600_000;

/** Sesja dnia: PIC to KRZ (zwykły pilot), administratorem panelu jest TMK. */
const SESSION = 'sess-1';
const PIC = 'KRZ';
/** `events.source_device` paczki telefonu — dowolny napis z aplikacji, jak w A02b. */
const DEVICE = 'Pixel 7a · a41f9c';

/** Uuid zdarzeń są jawne, bo test celuje w nie `targetUuid`-em (koperta: min. 8 znaków). */
const UUID = {
  claim: 'k-session-claim',
  preflight: 'k-preflight',
  engineStart: 'k-engine-start',
  takeoff: 'k-takeoff',
  landing: 'k-landing',
  engineStop: 'k-engine-stop',
  dayClose: 'k-day-close',
} as const;

function event(uuid: string, type: string, time: number, payload: Record<string, unknown>) {
  return {
    uuid,
    sessionUuid: SESSION,
    aircraftId: 'SP-AXA',
    picId: PIC,
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  };
}

/** Kanoniczny dzień: cykl 08:12–10:34 z jednym lotem 08:25–09:18, zamknięty 16:45. */
const DAY_EVENTS = [
  event(UUID.claim, 'session_claim', at(8, 0), { mode: 'free' }),
  event(UUID.preflight, 'preflight_confirm', at(8, 0), {
    operation: 'skoki',
    departureIcao: 'EPKK',
    arrivalIcao: null,
    reading: { fuelL: 150, mh: 1234.5 },
    client: null,
    mhFormat: 'hhmm',
  }),
  event(UUID.engineStart, 'engine_start', at(8, 12), {}),
  event(UUID.takeoff, 'takeoff', at(8, 25), { method: 'auto' }),
  event(UUID.landing, 'landing', at(9, 18), { method: 'auto' }),
  event(UUID.engineStop, 'engine_stop', at(10, 34), {}),
];

const CLOSE_EVENT = event(UUID.dayClose, 'day_close', at(16, 45), {
  finalReading: { fuelL: 88, mh: 1236.87 },
});

const BLOCK_MS = (10 * 60 + 34 - (8 * 60 + 12)) * 60_000; // 2:22
const FLIGHT_MS = (9 * 60 + 18 - (8 * 60 + 25)) * 60_000; // 0:53

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

function correct(
  app: Harness['app'],
  sessionUuid: string,
  options: { token?: string; body?: unknown },
) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/sessions/${sessionUuid}/corrections`,
    headers: {
      ...ADMIN_CSRF_HEADERS,
      ...(options.token == null ? {} : { authorization: `Bearer ${options.token}` }),
    },
    payload: options.body ?? {},
  });
}

function preview(
  app: Harness['app'],
  sessionUuid: string,
  options: { token?: string; body?: unknown },
) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/sessions/${sessionUuid}/corrections/preview`,
    headers: {
      ...ADMIN_CSRF_HEADERS,
      ...(options.token == null ? {} : { authorization: `Bearer ${options.token}` }),
    },
    payload: options.body ?? {},
  });
}

async function eventRows(db: Harness['db']) {
  const { rows } = await db.query<{
    uuid: string;
    type: string;
    pic_id: string;
    device_time: string | number;
    gps_time: string | number | null;
    payload: Record<string, unknown>;
    source_device: string | null;
  }>(
    `SELECT uuid, type, pic_id, device_time, gps_time, payload, source_device
       FROM events WHERE session_uuid = $1 ORDER BY received_at, uuid`,
    [SESSION],
  );
  return rows;
}

/** Wiersz projekcji `sessions`; BIGINT-y sprowadzamy do liczb, żeby porównywać wprost. */
async function sessionRow(db: Harness['db']) {
  const { rows } = await db.query<{
    block_ms: string | number;
    flight_ms: string | number;
    flights_count: number;
  }>('SELECT block_ms, flight_ms, flights_count FROM sessions WHERE session_uuid = $1', [SESSION]);
  const row = rows[0]!;
  return {
    blockMs: Number(row.block_ms),
    flightMs: Number(row.flight_ms),
    flightsCount: Number(row.flights_count),
  };
}

async function auditRows(db: Harness['db']) {
  const { rows } = await db.query<{
    actor_pilot_id: string;
    actor_role: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
  }>(
    `SELECT actor_pilot_id, actor_role, action, target_type, target_id, details
       FROM admin_audit ORDER BY id`,
  );
  return rows;
}

async function exportRevisions(db: Harness['db']) {
  const { rows } = await db.query<{ session_uuid: string; revision: number }>(
    'SELECT session_uuid, revision FROM export_log ORDER BY id',
  );
  return rows;
}

/**
 * Dzień zamknięty i wyeksportowany, zegar przesunięty POZA okno korekty pilota.
 *
 * `closed: false` zostawia samolot NIEZDANY — od 2026-08-07 to już nie odmowa, tylko
 * powód ostrzeżenia `ADMIN_EDIT_SESSION_ACTIVE`. `advanceMs` steruje drugą kolizją:
 * krótszy skok zostawia okno 24 h wzlotu otwarte (`ADMIN_EDIT_PILOT_WINDOW_OPEN`).
 */
async function flownDay(options: { closed?: boolean; advanceMs?: number } = {}) {
  const harness = await testHarness();
  const { app, clock } = harness;
  const pic = await login(app, PIC);

  const payload = options.closed === false ? DAY_EVENTS : [...DAY_EVENTS, CLOSE_EVENT];
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${pic}` },
    // `sourceDevice` jest tu naprawdę wysyłany, bo podgląd korekty go pokazuje
    // („Zapisane przez: telefon PIC-a") — a pole odczytane z pustej bazy nie
    // udowodniłoby, że trasa czyta właściwą kolumnę.
    payload: { events: payload, sourceDevice: DEVICE },
  });
  expect(res.statusCode).toBe(200);

  // Doba i osiem godzin od zamknięcia: okno 04c minęło, więc pilot nie poprawi już nic
  // sam. Zegar jest portem, więc test nie musi spać ani udawać upływu czasu.
  clock.advance(options.advanceMs ?? 2 * 24 * HOUR_MS);
  return harness;
}

describe('korekta administratora po oknie 24 h (A02b)', () => {
  it('retime: dopisuje zdarzenie PIC-em sesji, przelicza dzień i podbija rewizję karty', async () => {
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    // Przed korektą: siedem zdarzeń i karta w rewizji 1 (eksport po `day_close`).
    expect(await eventRows(db)).toHaveLength(7);
    expect(await exportRevisions(db)).toEqual([{ session_uuid: SESSION, revision: 1 }]);
    expect(await sessionRow(db)).toMatchObject({ blockMs: BLOCK_MS });

    const res = await correct(app, SESSION, {
      token: admin,
      body: {
        targetUuid: UUID.engineStop,
        action: 'retime',
        newTime: at(10, 22),
        reason: 'Zegar telefonu spieszył 12 min; godzinę potwierdza książka samolotu.',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sessionUuid: SESSION,
      targetUuid: UUID.engineStop,
      action: 'retime',
      // Stan dnia PO korekcie liczy serwer — panel nie ma czego liczyć sam.
      state: { blockTimeMs: BLOCK_MS - 12 * 60_000, flightTimeMs: FLIGHT_MS },
      reexport: { exported: true, tab: '2026-06-22_SP-AXA', revision: 2 },
    });

    // ── rejestr: DOPISANE zdarzenie, oryginał nietknięty ──────────────────────
    const rows = await eventRows(db);
    expect(rows).toHaveLength(8);

    const original = rows.find((r) => r.uuid === UUID.engineStop)!;
    expect(Number(original.gps_time)).toBe(at(10, 34));
    expect(Number(original.device_time)).toBe(at(10, 34));

    const correction = rows.find((r) => r.type === 'event_correction')!;
    expect(correction.uuid).toBe(res.json().correctionUuid);
    expect(correction.payload).toEqual({
      targetUuid: UUID.engineStop,
      action: 'retime',
      newTime: at(10, 22),
    });
    // Tożsamość w rejestrze to PIC SESJI — inaczej `WRITER_MISMATCH`, i słusznie.
    // Że zrobił to administrator, mówi `source_device` i dziennik audytu.
    expect(correction.pic_id).toBe(PIC);
    expect(correction.source_device).toBe('admin:TMK');
    // Powód korekty NIE wchodzi do rejestru — rejestr opisuje lot, nie motywację.
    expect(JSON.stringify(correction.payload)).not.toContain('Zegar telefonu');

    // ── projekcja: liczby dnia faktycznie się zmieniły ────────────────────────
    expect(await sessionRow(db)).toEqual({
      blockMs: BLOCK_MS - 12 * 60_000,
      flightMs: FLIGHT_MS,
      flightsCount: 1,
    });

    // ── audyt: kto, w jakiej roli, na czym i dlaczego ─────────────────────────
    expect(await auditRows(db)).toMatchObject([
      {
        actor_pilot_id: 'TMK',
        actor_role: 'admin',
        action: 'event.correct',
        target_type: 'event',
        target_id: UUID.engineStop,
        details: {
          sessionUuid: SESSION,
          correctionUuid: res.json().correctionUuid,
          action: 'retime',
          newTime: at(10, 22),
          reason: 'Zegar telefonu spieszył 12 min; godzinę potwierdza książka samolotu.',
        },
      },
    ]);

    // ── arkusz: klub dostaje POPRAWIONE liczby, historia rewizji zostaje ──────
    expect(await exportRevisions(db)).toEqual([
      { session_uuid: SESSION, revision: 1 },
      { session_uuid: SESSION, revision: 2 },
    ]);
    const sheet = await app.inject({
      method: 'GET',
      url: '/sheets/2026-06-22_SP-AXA',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(sheet.statusCode).toBe(200);
    // Karta klubu pokazuje POPRAWIONY czas blokowy (02:22 → 02:10), a nie ten,
    // który zapisał telefon. To jest cel całego przekroju.
    expect(sheet.json().rows).toContainEqual(['Czas blokowy doby', '02:10']);
  });

  it('void: zdarzenie wypada z wyliczeń, wiersz zostaje w rejestrze', async () => {
    // Fałszywe lądowanie (przelot nad pasem zaliczony przez detektor). `void` jest tu
    // właściwym narzędziem: zdarzenia NIE BYŁO, więc nie ma czego przesuwać.
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: {
        targetUuid: UUID.landing,
        action: 'void',
        reason: 'Przelot nad pasem zaliczony jako lądowanie — potwierdzone z pilotem.',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      action: 'void',
      state: { landingCount: 0, takeoffCount: 1, flightTimeMs: 0, blockTimeMs: BLOCK_MS },
      reexport: { exported: true, revision: 2 },
    });

    // Wiersz oryginału ZOSTAJE — „cofnięcie" pomyłki samo jest udokumentowane.
    const rows = await eventRows(db);
    expect(rows.find((r) => r.uuid === UUID.landing)).toBeDefined();
    expect(rows.find((r) => r.type === 'event_correction')!.payload).toEqual({
      targetUuid: UUID.landing,
      action: 'void',
    });

    expect(await sessionRow(db)).toMatchObject({ flightMs: 0, blockMs: BLOCK_MS });
  });

  it('szef wyszkolenia NIE MOŻE pisać w cudzym rejestrze — 403 z wymaganą zdolnością', async () => {
    // Rozstrzyganie flag ma (`adminFlags.test.ts`), korekty nie: wyjaśnianie
    // rozbieżności to inna odpowiedzialność niż dopisywanie zdarzeń.
    const { app, db } = await flownDay();
    const trainingLead = await login(app, 'AKO');

    const res = await correct(app, SESSION, {
      token: trainingLead,
      body: { targetUuid: UUID.landing, action: 'void', reason: 'Wygląda na pomyłkę detektora.' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'events.correct' });
    expect(await eventRows(db)).toHaveLength(7);
    expect(await auditRows(db)).toEqual([]);
  });

  it('pilot NIE MOŻE — nawet PIC tej sesji, bo po 24 h ścieżką jest panel', async () => {
    const { app, db } = await flownDay();
    const pic = await login(app, PIC);

    const res = await correct(app, SESSION, {
      token: pic,
      body: { targetUuid: UUID.landing, action: 'void', reason: 'To jednak nie było lądowanie.' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'events.correct' });
    expect(await eventRows(db)).toHaveLength(7);
  });

  it('bez tokenu → 401, nie 403 — to dwie różne wiadomości', async () => {
    const { app, db } = await flownDay();

    const res = await correct(app, SESSION, {
      body: { targetUuid: UUID.landing, action: 'void', reason: 'Bez logowania.' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    expect(await eventRows(db)).toHaveLength(7);
  });

  it.each([
    ['brak pola', undefined],
    ['pusty napis', ''],
    ['same spacje', '   '],
  ])('powód wymagany — %s daje 400 i nie rusza rejestru', async (_case, reason) => {
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: {
        targetUuid: UUID.landing,
        action: 'void',
        ...(reason === undefined ? {} : { reason }),
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request' });
    expect(await eventRows(db)).toHaveLength(7);
    expect(await auditRows(db)).toEqual([]);
  });

  it('retime bez nowego czasu → 400 (payload niekompletny, nie „domyślnie teraz")', async () => {
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.engineStop, action: 'retime', reason: 'Bez podania godziny.' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request' });
  });

  it('nieistniejąca sesja → 404', async () => {
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, 'sess-nie-ma', {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'void', reason: 'Pomyłka w adresie.' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(await auditRows(db)).toEqual([]);
  });

  it('cel spoza sesji → 422 z PODANYM powodem, rejestr i audyt nietknięte', async () => {
    // To jest dowód, że uchylenie okna nie jest przepustką do rejestru: reguła
    // `CORRECTION_TARGET_NOT_FOUND` obowiązuje administratora tak samo jak pilota.
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: { targetUuid: 'zdarzenie-z-innego-dnia', action: 'void', reason: 'Zła sesja.' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('rule_violation');
    expect(res.json().violations).toMatchObject([
      { code: 'CORRECTION_TARGET_NOT_FOUND', severity: 'error' },
    ]);
    expect(await eventRows(db)).toHaveLength(7);
    expect(await auditRows(db)).toEqual([]);
  });

  it('cel niekorygowalny (day_close) → 422 — odczyty łańcucha MH zostają nienaruszalne', async () => {
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.dayClose, action: 'void', reason: 'Chcę rozbić dzień w pół.' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().violations).toMatchObject([{ code: 'CORRECTION_TARGET_NOT_ALLOWED' }]);
    expect(await eventRows(db)).toHaveLength(7);
  });

  it('poprawiony czas z przyszłości → 422', async () => {
    const { app, clock } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: {
        targetUuid: UUID.engineStop,
        action: 'retime',
        newTime: clock.now().getTime() + HOUR_MS,
        reason: 'Przepowiednia zamiast korekty.',
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().violations).toMatchObject([{ code: 'CORRECTION_TIME_IN_FUTURE' }]);
  });

  it('sesja OTWARTA → zapis PRZECHODZI z ostrzeżeniem; bramka `day_open` znikła', async () => {
    // ODWRÓCENIE oczekiwania z 2026-08-01 (decyzja użytkownika 2026-08-07). Stary test
    // brzmiał „dzień OTWARTY → 400 day_open: pilot poprawia sam". Reguła opierała się na
    // równości „brak `day_close` = dzień trwa", a §3.6a ją unieważnił: zdanie samolotu
    // jest OPCJONALNE, więc sesja sprzed tygodnia wygląda dokładnie tak samo jak ta
    // z dzisiejszego poranka. Bramka odmawiałaby więc korekty przede wszystkim tam,
    // gdzie jest naprawdę potrzebna. Administrator nie jest NIGDY blokowany — dostaje
    // ostrzeżenie i decyduje sam.
    const { app, db } = await flownDay({ closed: false });
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'void', reason: 'Lądowanie policzone dwa razy.' },
    });

    expect(res.statusCode).toBe(200);
    // Kolizja jedzie w odpowiedzi POZYTYWNEJ, bo korekta JEST w rejestrze.
    expect(res.json().warnings).toMatchObject([{ code: 'ADMIN_EDIT_SESSION_ACTIVE' }]);
    // Zdarzenie dopisane (6 → 7) i ślad w audycie zostawiony — jedno i drugie
    // odróżnia „zapisano mimo kolizji" od dawnej odmowy.
    expect(await eventRows(db)).toHaveLength(7);
    expect(await auditRows(db)).toHaveLength(1);
  });

  it('sesja ZDANA, ale okno wzlotu jeszcze biegnie → ostrzeżenie o kolizji z pilotem', async () => {
    // Druga z dwóch kolizji, całkiem niezależna od pierwszej: samolot jest zdany
    // (`day_close` o 16:45), więc `ADMIN_EDIT_SESSION_ACTIVE` się nie należy — ale od
    // wyłączenia silnika o 10:34 nie minęła doba, więc pilot może ten wzlot poprawić
    // SAM na 04c. Obie strony pisałyby wtedy naraz i administrator ma o tym wiedzieć.
    const { app } = await flownDay({ advanceMs: 9 * HOUR_MS });
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'void', reason: 'Lądowanie policzone dwa razy.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toMatchObject([{ code: 'ADMIN_EDIT_PILOT_WINDOW_OPEN' }]);
  });

  it('sesja ZDANA i po oknie pilota → zapis bez ANI JEDNEGO ostrzeżenia', async () => {
    // Druga strona tej samej reguły: ostrzeżenie ma znaczyć KOLIZJĘ, a nie towarzyszyć
    // każdej korekcie. Bez tego przypadku baner nad formularzem świeciłby zawsze
    // i przestałby cokolwiek mówić.
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await correct(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'void', reason: 'Lądowanie policzone dwa razy.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
  });

  it('druga korekta tego samego celu wygrywa — i obie zostają w rejestrze', async () => {
    // „Ostatnia wygrywa" jest własnością projekcji (`applyCorrections`), nie panelu.
    // Test przybija, że przekrój administratora tego nie obchodzi po swojemu.
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    await correct(app, SESSION, {
      token: admin,
      body: {
        targetUuid: UUID.engineStop,
        action: 'retime',
        newTime: at(10, 22),
        reason: 'Pierwsza wersja z książki samolotu.',
      },
    });
    const second = await correct(app, SESSION, {
      token: admin,
      body: {
        targetUuid: UUID.engineStop,
        action: 'retime',
        newTime: at(10, 30),
        reason: 'Doprecyzowane po rozmowie z mechanikiem.',
      },
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().state.blockTimeMs).toBe(BLOCK_MS - 4 * 60_000);
    expect((await eventRows(db)).filter((r) => r.type === 'event_correction')).toHaveLength(2);
    expect(await auditRows(db)).toHaveLength(2);
    expect(await exportRevisions(db)).toHaveLength(3);
  });
});

/**
 * PODGLĄD KOREKTY (`POST …/corrections/preview`) — karta „Wpływ na liczby dnia ·
 * przed → po" z `A02b`.
 *
 * Podgląd istnieje, bo panel nie ma prawa policzyć skutku sam: z domeny wolno mu
 * importować wyłącznie typy. Dwie własności są tu warte testu bardziej niż reszta:
 * (1) `void` NIE skraca cyklu o różnicę czasów, tylko zostawia go OTWARTYM — to jest
 * teza amber-banera z mockupu i najłatwiejsza rzecz do zgadnięcia źle; (2) podgląd
 * NICZEGO nie zapisuje, także dziennika audytu, bo obejrzenie skutku nie jest zmianą.
 */
describe('podgląd korekty przed zapisem (A02b, dry-run)', () => {
  it('retime: pokazuje czas blokowy przed i po, bez naruszeń i bez zapisu', async () => {
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.engineStop, action: 'retime', newTime: at(10, 22) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sessionUuid: SESSION,
      target: {
        uuid: UUID.engineStop,
        type: 'engine_stop',
        deviceTime: at(10, 34),
        gpsTime: at(10, 34),
        effectiveTime: at(10, 34),
        voided: false,
        // Kolumna techniczna rejestru — panel mówi, CZYM zapisano odczyt.
        sourceDevice: DEVICE,
      },
      before: { blockTimeMs: BLOCK_MS, flightTimeMs: FLIGHT_MS },
      after: { blockTimeMs: BLOCK_MS - 12 * 60_000, flightTimeMs: FLIGHT_MS },
      violations: [],
    });

    // Rejestr, projekcja, audyt i arkusz — wszystko dokładnie tak, jak przed podglądem.
    expect(await eventRows(db)).toHaveLength(7);
    expect(await sessionRow(db)).toMatchObject({ blockMs: BLOCK_MS });
    expect(await auditRows(db)).toEqual([]);
    expect(await exportRevisions(db)).toEqual([{ session_uuid: SESSION, revision: 1 }]);
  });

  it('void na engine_stop zostawia cykl OTWARTY — blok wypada w całości, nie skraca się', async () => {
    // To jest dowód tezy amber-banera z mockupu: `void` jest tu ZŁYM narzędziem.
    // Silnik został wyłączony, pomylona jest tylko godzina — a unieważnienie
    // `engine_stop` nie skraca cyklu o 12 minut, tylko usuwa go z czasu blokowego
    // w całości. Panel nie umiałby tego wyliczyć: reguła mieszka w projekcji.
    const { app, db } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.engineStop, action: 'void' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.before).toMatchObject({ blockTimeMs: BLOCK_MS, engineRunning: false });
    expect(body.after).toMatchObject({
      blockTimeMs: 0,
      engineRunning: true,
      openEngineStartAt: at(8, 12),
      // Loty się nie zmieniają — korekta dotyczy silnika, nie startów i lądowań.
      flightTimeMs: FLIGHT_MS,
    });
    expect(body.violations).toEqual([]);

    expect(await eventRows(db)).toHaveLength(7);
    expect(await auditRows(db)).toEqual([]);
  });

  it('cel niekorygowalny (day_close) → 200 z naruszeniem, nie kod błędu', async () => {
    // Naruszenie jest TREŚCIĄ odpowiedzi: administrator ma zobaczyć powód razem
    // z liczbami `before`, a nie pustą kartę z 422.
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.dayClose, action: 'void' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().violations).toMatchObject([
      { code: 'CORRECTION_TARGET_NOT_ALLOWED', severity: 'error' },
    ]);
    expect(res.json().before).toMatchObject({ blockTimeMs: BLOCK_MS });
  });

  it('cel spoza sesji → brak opisu celu i naruszenie CORRECTION_TARGET_NOT_FOUND', async () => {
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: 'zdarzenie-z-innego-dnia', action: 'void' },
    });

    expect(res.statusCode).toBe(200);
    // `null`, a nie zmyślony wiersz z zerami: nie mamy czym opisać celu, którego nie ma.
    expect(res.json().target).toBeNull();
    expect(res.json().violations).toMatchObject([{ code: 'CORRECTION_TARGET_NOT_FOUND' }]);
  });

  it('czas z przyszłości → naruszenie CORRECTION_TIME_IN_FUTURE', async () => {
    const { app, clock } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await preview(app, SESSION, {
      token: admin,
      body: {
        targetUuid: UUID.engineStop,
        action: 'retime',
        newTime: clock.now().getTime() + HOUR_MS,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().violations).toMatchObject([{ code: 'CORRECTION_TIME_IN_FUTURE' }]);
  });

  it('podgląd zdarzenia JUŻ unieważnionego mówi o tym wprost', async () => {
    // Ponowna korekta unieważnionego jest legalna („ostatnia wygrywa"), więc podgląd
    // musi umieć opisać taki cel — inaczej administrator nie wie, od jakiego stanu
    // startuje.
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    await correct(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'void', reason: 'Przelot nad pasem.' },
    });

    const res = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'retime', newTime: at(9, 20) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().target).toMatchObject({
      uuid: UUID.landing,
      voided: true,
      // Zdarzenie nie wchodzi dziś do żadnej liczby, więc nie ma „czasu w projekcji".
      effectiveTime: null,
    });
    // `retime` przywraca zdarzenie do życia — stąd lądowanie z powrotem w bilansie.
    expect(res.json().after).toMatchObject({ landingCount: 1 });
    expect(res.json().violations).toEqual([]);
  });

  it('sesja OTWARTA → podgląd DZIAŁA i uprzedza, tak samo jak zapis', async () => {
    // Podgląd i zapis muszą odmawiać tego samego i przepuszczać to samo — inaczej panel
    // wystawia formularz tam, gdzie zapis odmówi (albo odwrotnie). Bramka `day_open`
    // znikła po OBU stronach naraz, więc i tu jest 200 razem z ostrzeżeniem.
    const { app } = await flownDay({ closed: false });
    const admin = await login(app, 'TMK');

    const res = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'void' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().violations).toEqual([]);
    expect(res.json().warnings).toMatchObject([{ code: 'ADMIN_EDIT_SESSION_ACTIVE' }]);
  });

  it('nieistniejąca sesja → 404', async () => {
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const res = await preview(app, 'sess-nie-ma', {
      token: admin,
      body: { targetUuid: UUID.landing, action: 'void' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('szef wyszkolenia NIE zobaczy podglądu — ta sama zdolność, co przy zapisie', async () => {
    const { app } = await flownDay();
    const trainingLead = await login(app, 'AKO');

    const res = await preview(app, SESSION, {
      token: trainingLead,
      body: { targetUuid: UUID.landing, action: 'void' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'events.correct' });
  });

  it('podgląd NIE przyjmuje `reason` — i nie wymaga go, żeby odpowiedzieć', async () => {
    // Kolejność jest celowa: najpierw zobacz skutek, potem wytłumacz decyzję.
    // Ciało bez uzasadnienia MUSI więc przejść, a `retime` bez czasu — nie.
    const { app } = await flownDay();
    const admin = await login(app, 'TMK');

    const ok = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.engineStop, action: 'retime', newTime: at(10, 22) },
    });
    expect(ok.statusCode).toBe(200);

    const incomplete = await preview(app, SESSION, {
      token: admin,
      body: { targetUuid: UUID.engineStop, action: 'retime' },
    });
    expect(incomplete.statusCode).toBe(400);
    expect(incomplete.json()).toEqual({ error: 'bad_request' });
  });
});
