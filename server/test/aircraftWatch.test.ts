/**
 * Ninerdeck (serwer) - OBSERWOWANIE SAMOLOTU end-to-end (3.2.0, issue #205, epik O-B;
 * `docs/obserwowanie-samolotu.md` §2, §5, §7).
 *
 * Scenariusze jadą przez PRAWDZIWE trasy na PGlite: zdolność i przełącznik, karta
 * maszyny, historia stronami, producenci wiadomości (ingest, rezerwacje telefonu
 * i panelu, zakończenie z panelu, zegar) i reguła „prawo sprawdza się przy wysyłce".
 * Atrapą jest wyłącznie budzik (`FakePush`) - skrzynka, adaptery i transakcje są prawdziwe.
 */

import { describe, expect, it } from 'vitest';

import { BookingClockJob } from '../src/application/common/commands/bookingClock.ts';
import { AircraftWatching } from '../src/application/common/notify/aircraftWatching.ts';
import { PgAircraftConfigRepo } from '../src/infrastructure/pg/common/aircraftConfigRepo.ts';
import { PgAircraftWatchesRepo } from '../src/infrastructure/pg/common/aircraftWatchesRepo.ts';
import { PgBookingsRepo } from '../src/infrastructure/pg/common/bookingsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { silentNotifier } from './fakePush.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];
type Db = Harness['db'];

const H = 3_600_000;
const MIN = 60_000;
/** Zegar świata testowego (`TestClock`). */
const TERAZ = Date.UTC(2026, 5, 22, 8, 0, 0);
const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * MIN;
const iso = (t: number): string => new Date(t).toISOString();

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

const login = (app: App, who: string): Promise<string> =>
  app
    .inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(who) } })
    .then((res) => res.json().token as string);

async function panelCookie(app: App, who: string): Promise<Record<string, string>> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'ninerdeck_admin')!;
  return { cookie: `ninerdeck_admin=${cookie.value}`, ...ADMIN_CSRF_HEADERS };
}

/** Zdolność obserwowania dla osoby spoza kompletu administratora (KRZ, JSE, PWI). */
const grantWatch = (db: Db, pilotId: string) =>
  db.query(
    `INSERT INTO membership_capabilities (org_id, pilot_id, capability)
     VALUES ($2, $1, 'fleet.watch') ON CONFLICT DO NOTHING`,
    [pilotId, ORG_A],
  );

const watch = (app: App, token: string, aircraftId = 'SP-AXA', method: 'PUT' | 'DELETE' = 'PUT') =>
  app.inject({ method, url: `/aircraft/${aircraftId}/watch`, headers: bearer(token) });

const inbox = async (app: App, token: string): Promise<{ kind: string; payload: Record<string, unknown> }[]> => {
  const res = await app.inject({ method: 'GET', url: '/me/notifications', headers: bearer(token) });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().items;
};

const kinds = async (app: App, token: string): Promise<string[]> => (await inbox(app, token)).map((n) => n.kind);

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
) {
  seq += 1;
  return {
    uuid: `w-${seq}-${type}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'AKO',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    ...over,
  };
}

/** Przejęcie + zadanie + uruchomienie - operacja W TOKU. */
function opened(sessionUuid: string, over: Record<string, unknown> = {}, claim: Record<string, unknown> = {}) {
  const base = { sessionUuid, ...over };
  return [
    event('session_claim', at(8, 0), { mode: 'free', ...claim }, base),
    event(
      'preflight_confirm',
      at(8, 0),
      { operation: 'skoki', departureIcao: 'EPKK', arrivalIcao: null, reading: { fuelL: 150, mh: 1234.5 }, client: null, mhFormat: 'hhmm' },
      base,
    ),
    event('engine_start', at(8, 12), {}, base),
  ];
}

/** Lot i zdanie - reszta dnia po `opened`. */
function closed(sessionUuid: string, over: Record<string, unknown> = {}, fuelEndL = 88) {
  const base = { sessionUuid, ...over };
  return [
    event('takeoff', at(8, 25), { method: 'auto' }, base),
    event('landing', at(9, 18), { method: 'auto' }, base),
    event('engine_stop', at(10, 34), {}, base),
    event('day_close', at(16, 45), { finalReading: { fuelL: fuelEndL, mh: 1241.15 } }, base),
  ];
}

const post = (app: App, token: string, events: unknown[]) =>
  app.inject({ method: 'POST', url: '/events', headers: bearer(token), payload: { events } });

const book = (app: App, token: string, from: number, to: number, id = `bk-${(seq += 1)}`) =>
  app.inject({
    method: 'POST',
    url: '/bookings',
    headers: bearer(token),
    payload: { id, aircraftId: 'SP-AXA', startsAt: iso(from), endsAt: iso(to), operation: 'skoki' },
  });

/** Zegar rezerwacji z obserwowaniem - jak w composition root, z atrapą budzika. */
function clockJob(db: Db, now: number): BookingClockJob {
  const notifier = silentNotifier(db);
  return new BookingClockJob(
    db,
    new PgBookingsRepo(),
    new PgSessionsProjection(),
    { now: () => new Date(now) },
    notifier,
    new AircraftWatching(new PgAircraftWatchesRepo(), new PgAircraftConfigRepo(), notifier),
  );
}

/** KRZ obserwuje SP-AXA ze zdolnością; AKO (administrator, komplet) też - jako sprawca. */
async function watchers(app: App, db: Db): Promise<{ ako: string; krz: string }> {
  await grantWatch(db, 'KRZ');
  const ako = await login(app, 'AKO');
  const krz = await login(app, 'KRZ');
  expect((await watch(app, krz)).statusCode).toBe(204);
  expect((await watch(app, ako)).statusCode).toBe(204);
  return { ako, krz };
}

describe('zdolność i przełącznik', () => {
  it('bez `fleet.watch` KAŻDA trasa odpowiada 403 z nazwą zdolności', async () => {
    const { app } = await testHarness();
    const pwi = await login(app, 'PWI');
    for (const [method, url] of [
      ['GET', '/aircraft/watches'],
      ['GET', '/aircraft/SP-AXA/card'],
      ['GET', '/aircraft/SP-AXA/operations'],
      ['PUT', '/aircraft/SP-AXA/watch'],
      ['DELETE', '/aircraft/SP-AXA/watch'],
    ] as const) {
      const res = await app.inject({ method, url, headers: bearer(pwi) });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().required).toBe('fleet.watch');
    }
  });

  it('włączenie jest idempotentne, lista mówi „obserwujesz", wyłączenie gasi; nieznana maszyna to 404', async () => {
    const { app, db } = await testHarness();
    await grantWatch(db, 'KRZ');
    const krz = await login(app, 'KRZ');

    expect((await watch(app, krz)).statusCode).toBe(204);
    expect((await watch(app, krz)).statusCode).toBe(204);
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM aircraft_watches WHERE pilot_id = 'KRZ'`,
    );
    expect(Number(rows[0]!.n)).toBe(1);

    const list = await app.inject({ url: '/aircraft/watches', headers: bearer(krz) });
    expect(list.statusCode, list.body).toBe(200);
    const items = list.json().items as { aircraftId: string; watching: boolean; now: { kind: string } }[];
    // CAŁA flota klubu, nie same obserwowane - do włączenia trzeba widzieć resztę.
    expect(items.map((i) => i.aircraftId).sort()).toEqual(['SP-ANK', 'SP-AXA', 'SP-FGK', 'SP-KWA']);
    expect(items.find((i) => i.aircraftId === 'SP-AXA')).toMatchObject({ watching: true, now: { kind: 'free' } });
    expect(items.find((i) => i.aircraftId === 'SP-FGK')).toMatchObject({ watching: false });
    // Wycofana z użytku zostaje na liście - stan mówi, czemu nie ma czym latać.
    expect(items.find((i) => i.aircraftId === 'SP-KWA')).toMatchObject({ now: { kind: 'retired' } });
    expect(list.json().viewer).toEqual({ watch: true });

    expect((await watch(app, krz, 'SP-AXA', 'DELETE')).statusCode).toBe(204);
    expect((await watch(app, krz, 'SP-AXA', 'DELETE')).statusCode).toBe(204);
    const card = await app.inject({ url: '/aircraft/SP-AXA/card', headers: bearer(krz) });
    expect(card.json().watching).toBe(false);

    expect((await watch(app, krz, 'SP-NIE-MA')).statusCode).toBe(404);
    expect((await watch(app, krz, 'SP-NIE-MA', 'DELETE')).statusCode).toBe(404);
    expect((await app.inject({ url: '/aircraft/SP-NIE-MA/card', headers: bearer(krz) })).statusCode).toBe(404);
  });

  it('panel: to samo ustawienie pod `/admin/api/me/watches`, bez wpisu w dzienniku audytu', async () => {
    const { app, db } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');
    const audit = async () =>
      Number((await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM admin_audit')).rows[0]!.n);
    const before = await audit();

    expect(
      (await app.inject({ method: 'PUT', url: '/admin/api/me/watches/SP-FGK', headers: cookie })).statusCode,
    ).toBe(204);
    const list = await app.inject({ url: '/admin/api/me/watches', headers: cookie });
    expect(list.statusCode, list.body).toBe(200);
    expect(
      (list.json().items as { aircraftId: string; watching: boolean }[]).find((i) => i.aircraftId === 'SP-FGK')?.watching,
    ).toBe(true);

    // Telefon widzi to samo ustawienie tej samej osoby.
    const ako = await login(app, 'AKO');
    expect((await app.inject({ url: '/aircraft/SP-FGK/card', headers: bearer(ako) })).json().watching).toBe(true);

    expect(
      (await app.inject({ method: 'DELETE', url: '/admin/api/me/watches/SP-FGK', headers: cookie })).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'PUT', url: '/admin/api/me/watches/SP-NIE-MA', headers: cookie })).statusCode,
    ).toBe(404);
    expect(await audit()).toBe(before);
  });
});

describe('karta maszyny i historia', () => {
  it('po zdanej operacji: wolna, liczniki ze zdania, serie z przejęcia, tankowania i zdania, ostatni zapis', async () => {
    const { app, db } = await testHarness();
    await grantWatch(db, 'KRZ');
    const ako = await login(app, 'AKO');
    const krz = await login(app, 'KRZ');
    const refuel = event('refuel', at(8, 5), { beforeL: 150, addedL: 20, afterL: 170 }, { sessionUuid: 'sess-1' });
    expect((await post(app, ako, [...opened('sess-1'), refuel, ...closed('sess-1')])).statusCode).toBe(200);
    const made = await book(app, ako, TERAZ + 5 * H, TERAZ + 7 * H);
    expect(made.statusCode, made.body).toBe(201);

    const res = await app.inject({ url: '/aircraft/SP-AXA/card', headers: bearer(krz) });
    expect(res.statusCode, res.body).toBe(200);
    const card = res.json();
    expect(card.aircraft).toMatchObject({ id: 'SP-AXA', reg: 'SP-AXA' });
    expect(card.now).toEqual({
      kind: 'free',
      next: { bookingId: made.json().id, kind: 'flight', startsAt: iso(TERAZ + 5 * H) },
    });
    expect(card.lastRecordAt).not.toBeNull();
    expect(card.counters).toMatchObject({ fuelL: 88, mh: 1241.15, source: 'handover', byPilotId: 'AKO' });
    expect(card.series.mh.map((p: { source: string; value: number }) => [p.source, p.value])).toEqual([
      ['claim', 1234.5],
      ['release', 1241.15],
    ]);
    expect(card.series.fuel.map((p: { source: string; value: number }) => [p.source, p.value])).toEqual([
      ['claim', 150],
      ['refuel', 170],
      ['release', 88],
    ]);
    expect(card.last30).toMatchObject({ daysWithFlights: 1, takeoffs: 1 });
    expect(card.last90).toMatchObject({ daysWithFlights: 1, takeoffs: 1 });
    // Cudzy termin - pola JAK W KALENDARZU, bez zadania (P2).
    expect(card.upcoming).toHaveLength(1);
    expect(card.upcoming[0]).toMatchObject({ id: made.json().id, pilotId: 'AKO' });
    expect(card.upcoming[0].operation).toBeUndefined();
    expect(card.upcoming[0].day.date).toBe('2026-06-22');
    expect(card.watching).toBe(false);
    expect(card.viewer).toEqual({ watch: true });
  });

  it('w trakcie operacji: „w locie" z pilotem i chwilą uruchomienia', async () => {
    const { app, db } = await testHarness();
    await grantWatch(db, 'KRZ');
    const ako = await login(app, 'AKO');
    const krz = await login(app, 'KRZ');
    expect((await post(app, ako, opened('sess-1'))).statusCode).toBe(200);
    const card = (await app.inject({ url: '/aircraft/SP-AXA/card', headers: bearer(krz) })).json();
    // Zadanie i lotnisko startu jadą razem z załogą - hero karty pisze
    // „A. Kowalski · skoki · EPKK", a cudzej operacji telefon nie ma u siebie.
    expect(card.now).toEqual({
      kind: 'flying',
      sessionUuid: 'sess-1',
      pilotId: 'AKO',
      dualId: null,
      operation: 'skoki',
      departureIcao: 'EPKK',
      since: iso(at(8, 12)),
    });
  });

  it('historia idzie stronami z kursorem PARĄ, najnowsze pierwsze, bez dolnej granicy czasu', async () => {
    const { app, db } = await testHarness();
    await grantWatch(db, 'KRZ');
    const ako = await login(app, 'AKO');
    const krz = await login(app, 'KRZ');
    for (const [uuid, day] of [
      ['sess-old', -400],
      ['sess-mid', -2],
      ['sess-new', -1],
    ] as const) {
      const shift = day * 24 * H;
      const base = { sessionUuid: uuid };
      const events = [...opened(uuid), ...closed(uuid)].map((e) => ({
        ...e,
        ...base,
        deviceTime: e.deviceTime + shift,
        gpsTime: e.gpsTime + shift,
      }));
      expect((await post(app, ako, events)).statusCode).toBe(200);
    }

    const first = await app.inject({ url: '/aircraft/SP-AXA/operations?limit=2', headers: bearer(krz) });
    expect(first.statusCode, first.body).toBe(200);
    expect((first.json().items as { sessionUuid: string }[]).map((i) => i.sessionUuid)).toEqual(['sess-new', 'sess-mid']);
    expect(first.json().items[0]).toMatchObject({ pilotId: 'AKO', flights: 1, mhStart: 1234.5, mhEnd: 1241.15, fuelEndL: 88 });
    // Liczba CAŁEJ historii jedzie z każdą stroną: nagłówek pisze „3 operacje",
    // a „Pokaż starsze" - ile jeszcze zostało za tą stroną.
    expect(first.json().total).toBe(3);
    const next = first.json().next as { beforeAt: string; beforeUuid: string };
    expect(next.beforeUuid).toBe('sess-mid');

    const second = await app.inject({
      url: `/aircraft/SP-AXA/operations?limit=2&beforeAt=${encodeURIComponent(next.beforeAt)}&beforeUuid=${next.beforeUuid}`,
      headers: bearer(krz),
    });
    // Operacja sprzed roku też wchodzi (P5) - i to jest ostatnia strona.
    expect((second.json().items as { sessionUuid: string }[]).map((i) => i.sessionUuid)).toEqual(['sess-old']);
    expect(second.json().next).toBeNull();

    // Kursor niepełny jest błędem żądania, nie cichym „od początku".
    expect(
      (await app.inject({ url: '/aircraft/SP-AXA/operations?beforeUuid=sess-mid', headers: bearer(krz) })).statusCode,
    ).toBe(400);
  });
});

describe('powiadomienia z rejestru (ingest)', () => {
  it('uruchomienie budzi obserwujących POZA planem, z czasem Z REJESTRU, bez sprawcy', async () => {
    const { app, db, push } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    expect(
      (await app.inject({ method: 'POST', url: '/me/push-token', headers: bearer(krz), payload: { token: 'ExponentPushToken[krz]' } })).statusCode,
    ).toBe(204);

    expect((await post(app, ako, opened('sess-1'))).statusCode).toBe(200);

    // Budzik niesie KLUB (R6): telefon osoby z dwóch klubów porównuje go z aktywnym.
    expect(push.to('ExponentPushToken[krz]')).toHaveLength(1);
    expect(push.to('ExponentPushToken[krz]')[0]!.data).toMatchObject({ kind: 'aircraft_engine_started', orgId: ORG_A, aircraftId: 'SP-AXA' });

    const msgs = await inbox(app, krz);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      kind: 'aircraft_engine_started',
      payload: { sessionUuid: 'sess-1', aircraftId: 'SP-AXA', pilotId: 'AKO', at: iso(at(8, 12)), planned: false, bookingId: null },
    });
    // AKO obserwuje, ale sam uruchomił - o sobie nie słyszy.
    expect(await kinds(app, ako)).toEqual([]);
  });

  it('uruchomienie z rezerwacji jest „zgodnie z planem"', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    const made = await book(app, ako, TERAZ + 5 * MIN, TERAZ + 2 * H);
    expect(made.statusCode, made.body).toBe(201);

    expect((await post(app, ako, opened('sess-1', {}, { reservationId: made.json().id }))).statusCode).toBe(200);
    const [msg] = await inbox(app, krz);
    expect(msg!.payload).toMatchObject({ planned: true, bookingId: made.json().id });
  });

  it('paczka z uruchomieniem I zdaniem rodzi TYLKO „zdana" - z odczytami i biegiem', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);

    expect((await post(app, ako, [...opened('sess-1'), ...closed('sess-1')])).statusCode).toBe(200);

    const msgs = await inbox(app, krz);
    expect(msgs.map((m) => m.kind)).toEqual(['aircraft_released']);
    expect(msgs[0]!.payload).toMatchObject({
      at: iso(at(16, 45)),
      engineStartAt: iso(at(8, 12)),
      engineStopAt: iso(at(10, 34)),
      flights: 1,
      fuelEndL: 88,
      mhEnd: 1241.15,
      closedBy: 'pilot',
      reason: null,
    });
  });

  it('zdanie dosłane osobno rodzi „zdana"; powtórzona paczka nie dzwoni drugi raz', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    const open = opened('sess-1');
    const close = closed('sess-1');

    expect((await post(app, ako, open)).statusCode).toBe(200);
    expect((await post(app, ako, open)).statusCode).toBe(200);
    expect(await kinds(app, krz)).toEqual(['aircraft_engine_started']);

    expect((await post(app, ako, close)).statusCode).toBe(200);
    expect((await post(app, ako, [...open, ...close])).statusCode).toBe(200);
    expect((await kinds(app, krz)).sort()).toEqual(['aircraft_engine_started', 'aircraft_released']);
  });

  it('wpis ręczny MILCZY - opisuje przeszłość, nie to, co dzieje się z maszyną', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    expect(
      (await post(app, ako, [...opened('sess-1', {}, { manualEntry: true }), ...closed('sess-1')])).statusCode,
    ).toBe(200);
    expect(await kinds(app, krz)).toEqual([]);
  });

  it('PRAWO SPRAWDZA SIĘ PRZY WYSYŁCE: bez zdolności albo z wyłączonym członkostwem cisza, po przywróceniu - wiersz obserwowania żyje dalej', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);

    await db.query(`DELETE FROM membership_capabilities WHERE pilot_id = 'KRZ' AND capability = 'fleet.watch'`);
    expect((await post(app, ako, opened('sess-1'))).statusCode).toBe(200);

    await grantWatch(db, 'KRZ');
    await db.query(`UPDATE memberships SET status = 'disabled' WHERE pilot_id = 'KRZ' AND org_id = $1`, [ORG_A]);
    expect((await post(app, ako, opened('sess-2'))).statusCode).toBe(200);
    await db.query(`UPDATE memberships SET status = 'active' WHERE pilot_id = 'KRZ' AND org_id = $1`, [ORG_A]);

    // Wiersz obserwowania NIE został skasowany - trzecia operacja budzi bez drugiego włączenia.
    expect((await post(app, ako, opened('sess-3'))).statusCode).toBe(200);
    const msgs = await inbox(app, krz);
    expect(msgs.map((m) => m.payload.sessionUuid)).toEqual(['sess-3']);
  });
});

describe('powiadomienia o terminie', () => {
  it('„za godzinę" pada raz, potem odwołanie budzi; nieprzypomniany termin odwołuje się po cichu', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    const soon = await book(app, ako, TERAZ + 30 * MIN, TERAZ + 2 * H);
    const far = await book(app, ako, TERAZ + 5 * H, TERAZ + 6 * H);
    expect(soon.statusCode, soon.body).toBe(201);
    expect(far.statusCode, far.body).toBe(201);

    const first = await clockJob(db, TERAZ + MIN).run();
    expect(first.reminded).toBe(1);
    const second = await clockJob(db, TERAZ + 6 * MIN).run();
    expect(second.reminded).toBe(0);

    let msgs = await inbox(app, krz);
    expect(msgs.map((m) => m.kind)).toEqual(['aircraft_flight_soon']);
    expect(msgs[0]!.payload).toMatchObject({ bookingId: soon.json().id, pilotId: 'AKO' });
    expect(await kinds(app, ako)).toEqual([]);

    // Termin nieprzypomniany (`far`) - odwołanie bez wiadomości; przypomniany - z wiadomością.
    expect((await app.inject({ method: 'DELETE', url: `/bookings/${far.json().id}`, headers: bearer(ako), payload: {} })).statusCode).toBe(200);
    expect(await kinds(app, krz)).toEqual(['aircraft_flight_soon']);
    expect((await app.inject({ method: 'DELETE', url: `/bookings/${soon.json().id}`, headers: bearer(ako), payload: {} })).statusCode).toBe(200);
    msgs = await inbox(app, krz);
    expect(msgs.map((m) => m.kind).sort()).toEqual(['aircraft_flight_cancelled', 'aircraft_flight_soon']);
    expect(msgs.find((m) => m.kind === 'aircraft_flight_cancelled')!.payload).toMatchObject({
      bookingId: soon.json().id,
      startsAt: iso(TERAZ + 30 * MIN),
      movedTo: null,
    });
    expect(await kinds(app, ako)).toEqual([]);
  });

  it('przesunięcie POCZĄTKU przypomnianego terminu budzi i zeruje stempel; poprawka notatki nie', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    const made = await book(app, ako, TERAZ + 30 * MIN, TERAZ + 2 * H);
    const id = made.json().id as string;
    expect((await clockJob(db, TERAZ + MIN).run()).reminded).toBe(1);

    const stamp = async () =>
      (await db.query<{ reminded_at: string | null }>('SELECT reminded_at FROM bookings WHERE id = $1', [id])).rows[0]!.reminded_at;
    expect(await stamp()).not.toBeNull();

    const note = await app.inject({ method: 'PATCH', url: `/bookings/${id}`, headers: bearer(ako), payload: { note: 'tandem' } });
    expect(note.statusCode, note.body).toBe(200);
    expect(await stamp()).not.toBeNull();
    expect(await kinds(app, krz)).toEqual(['aircraft_flight_soon']);

    const moved = await app.inject({
      method: 'PATCH',
      url: `/bookings/${id}`,
      headers: bearer(ako),
      payload: { startsAt: iso(TERAZ + 3 * H), endsAt: iso(TERAZ + 5 * H) },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(await stamp()).toBeNull();
    const cancelled = (await inbox(app, krz)).find((m) => m.kind === 'aircraft_flight_cancelled')!;
    expect(cancelled.payload).toMatchObject({
      startsAt: iso(TERAZ + 30 * MIN),
      movedTo: { startsAt: iso(TERAZ + 3 * H), endsAt: iso(TERAZ + 5 * H) },
    });
    // Nowy termin dostanie własne „za godzinę".
    expect((await clockJob(db, TERAZ + 2 * H + 10 * MIN).run()).reminded).toBe(1);
  });

  it('odwołanie z PANELU przypomnianego terminu budzi obserwujących, nie administratora', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    const made = await book(app, ako, TERAZ + 30 * MIN, TERAZ + 2 * H);
    expect((await clockJob(db, TERAZ + MIN).run()).reminded).toBe(1);

    // BNO (komplet administratora) obserwuje i odwołuje cudzy termin - jako sprawca milczy.
    const bno = await login(app, 'BNO');
    expect((await watch(app, bno)).statusCode).toBe(204);
    const cookie = await panelCookie(app, 'BNO');
    const res = await app.inject({
      method: 'POST',
      url: `/admin/api/bookings/${made.json().id}/cancel`,
      headers: cookie,
      payload: { reason: 'maszyna do przeglądu' },
    });
    expect(res.statusCode, res.body).toBe(200);

    expect((await kinds(app, krz)).sort()).toEqual(['aircraft_flight_cancelled', 'aircraft_flight_soon']);
    expect(await kinds(app, bno)).toEqual([]);
    // AKO nie jest sprawcą odwołania, ale jest PIC-em terminu: wiadomość dostaje, bo
    // odwołał go KTO INNY (§5.2: „bez odwołującego").
    expect(await kinds(app, ako)).toEqual(['aircraft_flight_cancelled']);
  });

  it('nikt nie odebrał maszyny - slot wraca do puli i budzi obserwujących', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    const made = await book(app, ako, TERAZ - 70 * MIN, TERAZ + 3 * H);
    expect(made.statusCode, made.body).toBe(201);

    const run = await clockJob(db, TERAZ).run();
    expect(run.released).toBe(1);
    // Zwolniona nie jest już potwierdzona - o „za godzinę" nie ma mowy.
    expect(run.reminded).toBe(0);
    const msgs = await inbox(app, krz);
    expect(msgs.map((m) => m.kind)).toEqual(['aircraft_not_taken']);
    expect(msgs[0]!.payload).toMatchObject({ bookingId: made.json().id });
    expect(await kinds(app, ako)).toEqual([]);
  });
});

describe('zakończenie z panelu', () => {
  it('operacja w toku zakończona przez administratora rodzi „zdana" z powodem, bez odczytów i bez sprawców', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    expect((await post(app, ako, opened('sess-1'))).statusCode).toBe(200);
    expect(await kinds(app, krz)).toEqual(['aircraft_engine_started']);

    const bno = await login(app, 'BNO');
    expect((await watch(app, bno)).statusCode).toBe(204);
    const cookie = await panelCookie(app, 'BNO');
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-1/close',
      headers: cookie,
      payload: { reason: 'pilot nie zdał, maszyna w hangarze' },
    });
    expect(res.statusCode, res.body).toBe(200);

    const released = (await inbox(app, krz)).find((m) => m.kind === 'aircraft_released')!;
    expect(released.payload).toMatchObject({
      sessionUuid: 'sess-1',
      closedBy: 'admin',
      reason: 'pilot nie zdał, maszyna w hangarze',
      fuelEndL: null,
      mhEnd: null,
      engineStartAt: iso(at(8, 12)),
    });
    expect(await kinds(app, bno)).toEqual([]);
    expect(await kinds(app, ako)).toEqual([]);
  });

  it('unieważnienie operacji W TOKU domyka ją obserwującym; unieważnienie zdanej nie mówi nic', async () => {
    const { app, db } = await testHarness();
    const { ako, krz } = await watchers(app, db);
    const cookie = await panelCookie(app, 'BNO');
    const voidOf = (uuid: string) =>
      app.inject({ method: 'POST', url: `/admin/api/sessions/${uuid}/void`, headers: cookie, payload: { reason: 'pomyłka' } });

    expect((await post(app, ako, [...opened('sess-done'), ...closed('sess-done')])).statusCode).toBe(200);
    expect((await voidOf('sess-done')).statusCode).toBe(200);
    expect(await kinds(app, krz)).toEqual(['aircraft_released']);

    expect((await post(app, ako, opened('sess-open'))).statusCode).toBe(200);
    expect((await voidOf('sess-open')).statusCode).toBe(200);
    const msgs = await inbox(app, krz);
    expect(msgs.filter((m) => m.payload.sessionUuid === 'sess-open').map((m) => m.kind).sort()).toEqual([
      'aircraft_engine_started',
      'aircraft_released',
    ]);
    expect(msgs.find((m) => m.payload.sessionUuid === 'sess-open' && m.kind === 'aircraft_released')!.payload).toMatchObject({
      closedBy: 'admin',
      reason: 'pomyłka',
    });
  });
});
