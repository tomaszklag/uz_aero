/**
 * UZ Aero (serwer) - cykl życia flagi i re-eksport (`POST /admin/api/flags/:id/resolve`).
 *
 * Ten sam wzorzec co reszta: PGlite w procesie, prawdziwe klasy, `app.inject`, zero
 * atrap. Flagi powstają tak, jak powstają w produkcji - z PRAWDZIWEGO `POST /events`,
 * bo test, który wstawia flagę `INSERT`-em, przybija własne wyobrażenie o niej,
 * a nie zachowanie systemu.
 *
 * Najważniejszy przypadek to ten drugi: rozwiązanie flagi ODBLOKOWUJE kartę dnia.
 * To jest test, dla którego panel powstaje - do przekroju 1 otwarta `aircraft_overlap`
 * blokowała eksport bezterminowo, a jedynym odblokowaniem był ręczny `UPDATE`.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

const DAY = Date.UTC(2026, 5, 22);
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (h: number, m: number, dayOffset = 0): number =>
  DAY + dayOffset * DAY_MS + (h * 60 + m) * 60_000;

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  seq += 1;
  return {
    uuid: `f-${seq}-${type}`,
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

interface DayOptions {
  sessionUuid: string;
  picId: string;
  reading: { fuelL: number; mh: number };
  dayOffset?: number;
}

/** Dzień lotny BEZ zamknięcia - sesja zostaje otwarta (materiał na nakładkę). */
function openDay(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  const base = { sessionUuid: o.sessionUuid, picId: o.picId };
  return [
    event('session_claim', at(8, 0, d), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0, d),
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
    event('engine_start', at(8, 12, d), {}, base),
    event('takeoff', at(8, 25, d), { method: 'auto' }, base),
    event('landing', at(9, 18, d), { method: 'auto' }, base),
    event('engine_stop', at(10, 34, d), {}, base),
  ];
}

function closeDay(o: { sessionUuid: string; picId: string; mh: number; dayOffset?: number }) {
  const d = o.dayOffset ?? 0;
  return [
    event(
      'day_close',
      at(16, 45, d),
      { finalReading: { fuelL: 88, mh: o.mh } },
      { sessionUuid: o.sessionUuid, picId: o.picId },
    ),
  ];
}

type Harness = Awaited<ReturnType<typeof testHarness>>;

async function login(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
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

function resolve(
  app: Harness['app'],
  id: number | string,
  options: { token?: string; note?: unknown } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/admin/api/flags/${id}/resolve`,
    headers: {
      ...ADMIN_CSRF_HEADERS,
      ...(options.token == null ? {} : { authorization: `Bearer ${options.token}` }),
    },
    payload: options.note === undefined ? {} : { note: options.note },
  });
}

async function flagRows(db: Harness['db']) {
  const { rows } = await db.query<{
    id: number;
    type: string;
    status: string;
    resolved_by: string | null;
    resolution_note: string | null;
    resolved_at: Date | string | null;
  }>(
    `SELECT id, type, status, resolved_by, resolution_note, resolved_at
     FROM flags ORDER BY id`,
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
 * Nakładka sesji jak w `export.test.ts`: TMK nie zamyka dnia, KRZ przejmuje samolot
 * offline. Obie sesje bez `day_close` → `aircraft_overlap`. Potem KRZ zamyka SWÓJ
 * dzień - sesja jest domknięta, ale sporna, więc karta NIE powstaje.
 */
async function overlapping() {
  const harness = await testHarness();
  const { app, db } = harness;
  const tmk = await login(app, 'TMK');
  const krz = await login(app, 'KRZ');

  await post(app, tmk, openDay({ sessionUuid: 'sess-1', picId: 'TMK', reading: { fuelL: 150, mh: 1234.5 } }));
  await post(app, krz, openDay({ sessionUuid: 'sess-2', picId: 'KRZ', reading: { fuelL: 112, mh: 1236.87 } }));
  await post(app, krz, closeDay({ sessionUuid: 'sess-2', picId: 'KRZ', mh: 1237.4 }));

  const flags = await flagRows(db);
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({ type: 'aircraft_overlap', status: 'open' });
  // Bramka DZIAŁA przed rozwiązaniem - bez tego test niżej nie dowodziłby niczego.
  expect(await exportRevisions(db)).toEqual([]);

  return { ...harness, flagId: flags[0]!.id };
}

describe('rozwiązanie flagi (A03a)', () => {
  // Osobny przypadek „rola pośrednia MOŻE rozstrzygnąć flagę" wypadł razem z rolą
  // `training_lead` (2026-08-30): dziś flagę rozstrzyga ten, kto wchodzi do panelu,
  // czyli administrator - i to jego drogę przez `flags.resolve` przybija ten przypadek.
  it('zmienia status, zapisuje komentarz i ODBLOKOWUJE kartę dnia', async () => {
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId, {
      token: admin,
      note: 'Rozmowa z TMK: dzień zamknięty telefonicznie, nakładka pozorna.',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ flagId, type: 'aircraft_overlap' });

    // Flaga zamknięta z tożsamością rozstrzygającego i jego komentarzem.
    expect(await flagRows(db)).toMatchObject([
      {
        status: 'resolved',
        resolved_by: 'TMK',
        resolution_note: 'Rozmowa z TMK: dzień zamknięty telefonicznie, nakładka pozorna.',
      },
    ]);
    expect((await flagRows(db))[0]!.resolved_at).not.toBeNull();

    // Re-eksport obu sesji flagi. Od 2026-08-07 (karta = DOBA SAMOLOTU, §4.7) obie
    // prowadzą do TEJ SAMEJ karty, więc obie kończą się sukcesem - a nie, jak przed
    // zmianą, jedną kartą i jedną odmową „dzień jeszcze otwarty". Sesja `sess-1` nie
    // została zdana i to widać W KARCIE (wiersz „w toku"), a nie w odmowie eksportu:
    // doba maszyny ma jedną prawdę niezależnie od tego, ile zmian już ją oddało.
    //
    // Dwie rewizje z jednego rozstrzygnięcia są ceną tego, że `ExportAttempt` jest per
    // SESJA (kontrakt panelu `A03a`), a karta per doba: druga próba przebudowuje ten sam
    // dokument. Dziennik mówi o tym uczciwie - dwa zapisy, dwie rewizje - zamiast ukrywać
    // jedną z prób.
    expect(res.json().exports).toEqual([
      {
        sessionUuid: 'sess-1',
        outcome: {
          exported: true,
          tab: '2026-06-22_SP-AXA',
          revision: 1,
          url: 'http://uzaero.test/sheets/2026-06-22_SP-AXA',
        },
      },
      {
        sessionUuid: 'sess-2',
        outcome: {
          exported: true,
          tab: '2026-06-22_SP-AXA',
          revision: 2,
          url: 'http://uzaero.test/sheets/2026-06-22_SP-AXA',
        },
      },
    ]);

    // …i karta FAKTYCZNIE powstała. Każda rewizja ma wiersz dziennika NA KAŻDĄ sesję
    // wchodzącą do karty - po nich `sync-status` obu pilotów znajduje ten sam link.
    expect(await exportRevisions(db)).toEqual([
      { session_uuid: 'sess-1', revision: 1 },
      { session_uuid: 'sess-2', revision: 1 },
      { session_uuid: 'sess-1', revision: 2 },
      { session_uuid: 'sess-2', revision: 2 },
    ]);
    const sheet = await app.inject({
      method: 'GET',
      url: '/sheets/2026-06-22_SP-AXA',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().rows).toContainEqual(['Samolot', 'SP-AXA']);
    // Obie zmiany w jednym dokumencie: zdana i ta, która maszyny jeszcze nie oddała.
    expect(sheet.json().rows).toContainEqual(['Operacje', '2']);
  });

  it('pilot NIE MOŻE - 403 z podaną wymaganą zdolnością, flaga zostaje otwarta', async () => {
    const { app, db, flagId } = await overlapping();
    const pilot = await login(app, 'PWI');

    const res = await resolve(app, flagId, { token: pilot, note: 'Wygląda w porządku.' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden', required: 'flags.resolve' });
    expect((await flagRows(db))[0]).toMatchObject({ status: 'open' });
  });

  it('bez tokenu → 401, nie 403 - to dwie różne wiadomości', async () => {
    const { app, db, flagId } = await overlapping();

    const res = await resolve(app, flagId, { note: 'Bez logowania.' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
    expect((await flagRows(db))[0]).toMatchObject({ status: 'open' });
  });

  it.each([
    ['brak pola', undefined],
    ['pusty napis', ''],
    ['same spacje', '   '],
  ])('komentarz wymagany - %s daje 400 i nie rusza flagi', async (_case, note) => {
    const { app, db, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId, { token: admin, note });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request' });
    expect((await flagRows(db))[0]).toMatchObject({ status: 'open' });
  });

  it('nieistniejąca flaga → 404', async () => {
    const { app, flagId } = await overlapping();
    const admin = await login(app, 'TMK');

    const res = await resolve(app, flagId + 999, { token: admin, note: 'Nie ma czego zamykać.' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('ponowne rozwiązanie → 409 z AKTUALNYM stanem flagi, komentarz pierwszego zostaje', async () => {
    // Zachowanie wybrane świadomie: nie 200 („i tak jest rozwiązana") i nie 404.
    // Drugi klikający ma zobaczyć, że sprawę zamknął ktoś inny i CZYIM komentarzem -
    // inaczej dopisałby własne uzasadnienie do decyzji, której nie podjął. Warunek
    // `status='open'` siedzi w SQL-u, więc to samo chroni przed wyścigiem dwóch osób.
    const { app, db, flagId } = await overlapping();
    // DWA konta, którym wolno rozstrzygać - świat testowy ma dwóch administratorów
    // właśnie po to, żeby dało się odtworzyć dwie osoby klikające w tę samą flagę.
    const admin = await login(app, 'TMK');
    const otherAdmin = await login(app, 'AKO');

    await resolve(app, flagId, { token: admin, note: 'Pierwsze rozstrzygnięcie.' });
    const second = await resolve(app, flagId, {
      token: otherAdmin,
      note: 'Drugie rozstrzygnięcie.',
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: 'already_resolved',
      flag: { id: flagId, status: 'resolved', resolvedBy: 'TMK', resolutionNote: 'Pierwsze rozstrzygnięcie.' },
    });
    expect((await flagRows(db))[0]).toMatchObject({
      resolved_by: 'TMK',
      resolution_note: 'Pierwsze rozstrzygnięcie.',
    });

    // Karta przebudowała się WYŁĄCZNIE przy pierwszym rozstrzygnięciu - przegrany
    // wyścig nie podbija rewizji. Dwie rewizje to ślad dwóch sesji flagi, a nie
    // dwóch rozstrzygnięć (patrz przypadek „ODBLOKOWUJE kartę dnia" wyżej).
    expect(await exportRevisions(db)).toEqual([
      { session_uuid: 'sess-1', revision: 1 },
      { session_uuid: 'sess-2', revision: 1 },
      { session_uuid: 'sess-1', revision: 2 },
      { session_uuid: 'sess-2', revision: 2 },
    ]);
  });

  it('flaga, która eksportu nie blokowała (mh_gap) → `exports: []`, żadnej nowej rewizji', async () => {
    // Rozwiązanie `mh_gap` niczego nie odblokowuje, bo `DayExporter` nie ma na niego
    // bramki. Odpowiedź z fałszywą rewizją uczyłaby nieufności do narzędzia.
    const { app, db } = await testHarness();
    const tmk = await login(app, 'TMK');

    await post(app, tmk, openDay({ sessionUuid: 'sess-1', picId: 'TMK', reading: { fuelL: 150, mh: 1234.5 } }));
    await post(app, tmk, closeDay({ sessionUuid: 'sess-1', picId: 'TMK', mh: 1241.15 }));
    // Następny dzień zaczyna się od licznika wyższego o ~9 h - ktoś latał bez aplikacji.
    // Paliwo ZGADZA się z przekazaniem (88 L z `closeDay`) celowo: ten test dotyczy
    // flagi nieblokującej eksportu, a rozjazd paliwa dołożyłby drugą, niezwiązaną
    // z jego tezą (od 2026-07-31 serwer liczy też `fuel_mismatch`).
    await post(app, tmk, openDay({ sessionUuid: 'sess-3', picId: 'TMK', reading: { fuelL: 88, mh: 1250 }, dayOffset: 1 }));
    await post(app, tmk, closeDay({ sessionUuid: 'sess-3', picId: 'TMK', mh: 1252, dayOffset: 1 }));

    const flags = await flagRows(db);
    expect(flags).toMatchObject([{ type: 'mh_gap', status: 'open' }]);
    const before = await exportRevisions(db);
    expect(before).toHaveLength(2); // obie sesje zamknięte → obie już wyeksportowane

    const res = await resolve(app, flags[0]!.id, {
      token: tmk,
      note: 'Lot techniczny bez aplikacji, potwierdzony w książce samolotu.',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ type: 'mh_gap', exports: [] });
    expect(await exportRevisions(db)).toEqual(before);
  });
});

function inbox(app: Harness['app'], token: string, query = '') {
  return app.inject({
    method: 'GET',
    url: `/admin/api/flags${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Ten sam dzień, ale na innym samolocie - łańcuchy MH i paliwa są PER SAMOLOT. */
const onAircraft = (events: ReturnType<typeof event>[], aircraftId: string) =>
  events.map((e) => ({ ...e, aircraftId }));

/**
 * Skrzynka z DWOMA typami spraw naraz, na DWÓCH samolotach: nakładka (blokuje kartę
 * dnia) powstaje jako pierwsza, dziura w łańcuchu MH - później. Porządek skrzynki ma
 * je odwrócić.
 *
 * Rozdzielenie na dwa samoloty nie jest kosmetyczne: łańcuch MH i paliwa liczy się
 * w obrębie jednego samolotu, więc doklejenie drugiej sprawy do SP-AXA dołożyłoby
 * flagi, których ten test nie dotyczy.
 *
 * Z tego samego powodu dni na SP-FGK lata TRZECI pilot (2026-08-07). Wcześniej były
 * TMK-a, czyli tego samego, który trzyma otwartą sesję na SP-AXA - a od rozdzielenia
 * `session_overlap` (§4.7) taki układ jest już wykrywany jako `pilot_overlap`:
 * jeden człowiek prowadzi dwie maszyny naraz. Detektor miał rację, więc poprawiamy
 * FIXTURE, a nie detektor.
 */
async function mixedInbox() {
  const harness = await testHarness();
  const { app, db } = harness;
  const tmk = await login(app, 'TMK');
  const krz = await login(app, 'KRZ');
  const jse = await login(app, 'JSE');

  // 1) Nakładka na SP-AXA: dwie sesje bez `day_close`. Powstaje NAJWCZEŚNIEJ.
  await post(app, tmk, openDay({ sessionUuid: 'sess-1', picId: 'TMK', reading: { fuelL: 150, mh: 1234.5 } }));
  await post(app, krz, openDay({ sessionUuid: 'sess-2', picId: 'KRZ', reading: { fuelL: 150, mh: 1236.87 } }));

  // 2) Dziura MH na SP-FGK w kolejnych dniach - flaga młodsza, ale NIE blokuje karty.
  // O „młodszej" decyduje `flags.created_at` z zegara BAZY (DEFAULT now()), nie
  // z `TestClock` - dlatego wiek ustawia tu kolejność wywołań, a nie przesunięcie zegara.
  await post(app, jse, onAircraft(openDay({ sessionUuid: 'sess-3', picId: 'JSE', reading: { fuelL: 150, mh: 400 } }), 'SP-FGK'));
  await post(app, jse, onAircraft(closeDay({ sessionUuid: 'sess-3', picId: 'JSE', mh: 402 }), 'SP-FGK'));
  await post(app, jse, onAircraft(openDay({ sessionUuid: 'sess-4', picId: 'JSE', reading: { fuelL: 88, mh: 410 }, dayOffset: 1 }), 'SP-FGK'));
  await post(app, jse, onAircraft(closeDay({ sessionUuid: 'sess-4', picId: 'JSE', mh: 412, dayOffset: 1 }), 'SP-FGK'));

  const { rows } = await db.query<{ id: number; type: string; created_at: Date }>(
    'SELECT id, type, created_at FROM flags ORDER BY id',
  );
  expect(rows.map((r) => r.type)).toEqual(['aircraft_overlap', 'mh_gap']);

  return { ...harness, admin: tmk, flags: rows };
}

describe('skrzynka flag (A03)', () => {
  it('sortuje blokujące eksport na górę, potem po wieku - od najstarszych', async () => {
    const { app, admin } = await mixedInbox();

    const body = (await inbox(app, admin)).json();

    // Nakładka jest tu STARSZA i blokująca, więc sam wiek by nie dowiódł porządku;
    // dowodzi go dopiero test niżej, w którym blokująca jest MŁODSZA.
    expect(body.items.map((i: { type: string }) => i.type)).toEqual(['aircraft_overlap', 'mh_gap']);
    expect(body.items[0]).toMatchObject({
      type: 'aircraft_overlap',
      status: 'open',
      aircraftId: 'SP-AXA',
      reg: 'SP-AXA',
      aircraftType: 'Cessna 182',
      blocksExport: true,
      resolvedAt: null,
      resolvedBy: null,
    });
    expect(body.items[0].sessionUuids.sort()).toEqual(['sess-1', 'sess-2']);
    expect(body.items[1]).toMatchObject({ type: 'mh_gap', blocksExport: false });
    expect(body.total).toBe(2);
  });

  it('MŁODSZA flaga blokująca wyprzedza starszą nieblokującą', async () => {
    // To jest właściwy dowód na pierwszy klucz sortowania: gdyby skrzynka szła samym
    // wiekiem, karta dnia stojąca poza arkuszem czekałaby na dole listy.
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await login(app, 'TMK');
    const krz = await login(app, 'KRZ');

    // Najpierw dziura MH na SP-AXA (flaga starsza, nieblokująca).
    await post(app, tmk, openDay({ sessionUuid: 'sess-1', picId: 'TMK', reading: { fuelL: 150, mh: 1234.5 } }));
    await post(app, tmk, closeDay({ sessionUuid: 'sess-1', picId: 'TMK', mh: 1241.15 }));
    await post(app, tmk, openDay({ sessionUuid: 'sess-2', picId: 'TMK', reading: { fuelL: 88, mh: 1250 }, dayOffset: 1 }));
    await post(app, tmk, closeDay({ sessionUuid: 'sess-2', picId: 'TMK', mh: 1252, dayOffset: 1 }));

    // Potem nakładka na INNYM samolocie (flaga młodsza, blokująca). Sesje SP-FGK
    // należą do INNYCH pilotów niż dni SP-AXA wyżej - inaczej TMK trzymałby otwartą
    // maszynę, lecąc drugą, czyli produkowałby `pilot_overlap` (§4.7) i zaśmiecał
    // skrzynkę flagami, o których ten test nie mówi.
    const withFgk = (uuid: string, pic: string, mh: number) =>
      onAircraft(openDay({ sessionUuid: uuid, picId: pic, reading: { fuelL: 150, mh } }), 'SP-FGK');
    await post(app, await login(app, 'JSE'), withFgk('sess-3', 'JSE', 400));
    await post(app, krz, withFgk('sess-4', 'KRZ', 402));

    const { rows } = await db.query<{ type: string }>('SELECT type FROM flags ORDER BY id');
    expect(rows.map((r) => r.type)).toEqual(['mh_gap', 'aircraft_overlap']);

    const body = (await inbox(app, tmk)).json();
    expect(body.items.map((i: { type: string }) => i.type)).toEqual(['aircraft_overlap', 'mh_gap']);
  });

  it('filtruje po statusie, typie i samolocie; `total` liczy CAŁY wynik filtra', async () => {
    const { app, admin, flags } = await mixedInbox();
    const types = async (query: string) =>
      (await inbox(app, admin, query)).json().items.map((i: { type: string }) => i.type);

    expect(await types('?type=mh_gap')).toEqual(['mh_gap']);
    expect(await types('?aircraftId=SP-AXA')).toEqual(['aircraft_overlap']);
    expect(await types('?status=resolved')).toEqual([]);
    expect(await types('?sessionUuid=sess-4')).toEqual(['mh_gap']);

    await resolve(app, flags[0]!.id, { token: admin, note: 'Nakładka pozorna.' });
    expect(await types('?status=open')).toEqual(['mh_gap']);
    expect(await types('?status=resolved')).toEqual(['aircraft_overlap']);

    // Rozwiązana nakładka przestaje blokować kartę - ta sama odpowiedź, co bramka
    // eksportera. Nie ma jej gdzie zapisać, bo jest wyliczana z typu i statusu.
    const resolved = (await inbox(app, admin, '?status=resolved')).json();
    expect(resolved.items[0]).toMatchObject({
      blocksExport: false,
      resolvedBy: 'TMK',
      resolutionNote: 'Nakładka pozorna.',
    });

    const limited = (await inbox(app, admin, '?limit=1')).json();
    expect(limited.items).toHaveLength(1);
    expect(limited.total).toBe(2);
  });

  it('panel CZYTA skrzynkę, pilot dostaje 403, brak tokenu 401', async () => {
    const { app, admin } = await mixedInbox();

    expect((await inbox(app, admin)).statusCode).toBe(200);

    const pilot = await inbox(app, await login(app, 'PWI'));
    expect(pilot.statusCode).toBe(403);
    expect(pilot.json()).toEqual({ error: 'forbidden', required: 'panel.access' });

    expect((await app.inject({ method: 'GET', url: '/admin/api/flags' })).statusCode).toBe(401);
  });

  it('nieznany typ flagi w zapytaniu → 400, nie cicha pusta lista', async () => {
    const { app, admin } = await mixedInbox();
    expect((await inbox(app, admin, '?type=cos_wymyslonego')).statusCode).toBe(400);
  });
});
