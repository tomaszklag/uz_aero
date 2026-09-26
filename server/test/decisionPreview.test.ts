/**
 * Podgląd pilota i samolotu przy decyzji (3.1.0, issue #206).
 *
 * Dwie warstwy: czysty rachunek (`domain/decisionPreview.ts`) na wierszach z ręki
 * i pełna droga HTTP przez TE SAME adaptery, co produkcja - telefon i panel mają
 * dostać jeden komplet faktów, więc test pyta obie trasy o tę samą sprawę.
 */

import { describe, expect, it } from 'vitest';

import type { BookingRecord, SessionRow } from '../src/application/common/ports.ts';
import {
  aircraftFacts,
  pilotFacts,
  upcomingOf,
  UPCOMING_LIMIT,
} from '../src/domain/decisionPreview.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];
type Db = Harness['db'];

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

const TERAZ = Date.UTC(2026, 5, 22, 8, 0, 0);
const DAY = 86_400_000;
const H = 3_600_000;
const JUTRO = TERAZ + DAY;
const iso = (t: number): string => new Date(t).toISOString();

let seq = 0;
const nextId = (): string => `pv-${(seq += 1)}`;

const book = (
  app: App,
  token: string,
  body: Partial<{ aircraftId: string; from: number; to: number; dualId: string | null }> = {},
) =>
  app.inject({
    method: 'POST',
    url: '/bookings',
    headers: bearer(token),
    payload: {
      id: nextId(),
      aircraftId: body.aircraftId ?? 'SP-AXA',
      startsAt: iso(body.from ?? JUTRO + 8 * H),
      endsAt: iso(body.to ?? JUTRO + 10 * H),
      operation: 'skoki',
      dualId: body.dualId ?? null,
    },
  });

const grantApprove = (db: Db, pilotId: string) =>
  db.query(
    `INSERT INTO membership_capabilities (org_id, pilot_id, capability)
     VALUES ($2, $1, 'reservations.approve') ON CONFLICT DO NOTHING`,
    [pilotId, ORG_A],
  );

/** Wiersz projekcji z ręki - operacja ZAMKNIĘTA z lotem, resztę nadpisuje test. */
function session(over: Partial<SessionRow> & { sessionUuid: string; at: number }): SessionRow {
  const { at, ...rest } = over;
  return {
    orgId: ORG_A,
    aircraftId: 'SP-AXA',
    picId: 'PWI',
    dualId: null,
    status: 'closed',
    claimTime: at - 10 * 60_000,
    closeTime: at + 2 * H,
    operation: 'ferry',
    client: null,
    notes: null,
    mhStart: 1200,
    mhEnd: 1201.5,
    fuelStartL: 200,
    fuelEndL: 150,
    fuelLastL: 150,
    mhLast: 1201.5,
    blockMs: 100 * 60_000,
    flightMs: 80 * 60_000,
    flightsCount: 2,
    takeoffCount: 2,
    landingCount: 2,
    mhDeltaH: 1.5,
    fuelConsumedL: 50,
    dropCount: null,
    jumpersTandem: null,
    jumpersAff: null,
    jumpersSolo: null,
    dropAltSumFt: null,
    dropAltCount: null,
    oilLevelL: 8,
    oilAddedL: 0,
    engineStartAt: at,
    engineStopAt: at + 100 * 60_000,
    firstTakeoffAt: at + 10 * 60_000,
    lastLandingAt: at + 90 * 60_000,
    departureIcao: 'EPKK',
    arrivalIcao: 'EPKK',
    fuelAddedL: null,
    manualEntry: null,
    oilAfterL: 8,
    ...rest,
  };
}

function bookingRecord(over: Partial<BookingRecord> & { id: string }): BookingRecord {
  return {
    aircraftId: 'SP-AXA',
    kind: 'flight',
    status: 'pending',
    startsAt: JUTRO + 8 * H,
    endsAt: JUTRO + 10 * H,
    pilotId: 'PWI',
    dualId: null,
    operation: 'skoki',
    fromIcao: null,
    toIcao: null,
    plannedAirMin: null,
    plannedFuelL: null,
    sessionUuid: null,
    blockReason: null,
    note: null,
    createdBy: 'PWI',
    createdAt: TERAZ,
    updatedAt: TERAZ,
    closedAt: null,
    closeReason: null,
    remindedAt: null,
    ...over,
  };
}

describe('rachunek podglądu pilota', () => {
  it('liczy doświadczenie na egzemplarzu sprawy osobno od nalotu ogólnego', () => {
    const rows = [
      session({ sessionUuid: 'a1', at: TERAZ - 6 * DAY }),
      session({ sessionUuid: 'a2', at: TERAZ - 40 * DAY, aircraftId: 'SP-FGK', flightsCount: 1 }),
      session({ sessionUuid: 'a3', at: TERAZ - 100 * DAY }),
    ];
    const facts = pilotFacts(rows, 'SP-AXA', TERAZ);

    expect(facts.lastFlightAt).toBe(TERAZ - 6 * DAY);
    expect(facts.onAircraft).toEqual({
      operations: 2,
      lastAt: TERAZ - 6 * DAY,
      flights: 4,
      blockMs: 200 * 60_000,
      flightMs: 160 * 60_000,
    });
    expect(facts.last30.flights).toBe(2);
    expect(facts.last90.flights).toBe(3);
    expect(facts.total.flights).toBe(5);
    expect(facts.recent.map((r) => r.sessionUuid)).toEqual(['a1', 'a2', 'a3']);
  });

  it('nie liczy operacji unieważnionej ani zapisu bez biegu silnika', () => {
    const rows = [
      session({ sessionUuid: 'v', at: TERAZ - DAY, status: 'voided' }),
      // Zdanie ze zmienionym odczytem: operacja w sensie issue #75, ale bez nalotu.
      session({ sessionUuid: 'r', at: TERAZ - 2 * DAY, blockMs: 0, flightMs: 0, flightsCount: 0 }),
      session({ sessionUuid: 'ok', at: TERAZ - 3 * DAY }),
    ];
    const facts = pilotFacts(rows, 'SP-AXA', TERAZ);
    expect(facts.onAircraft.operations).toBe(1);
    expect(facts.recent.map((r) => r.sessionUuid)).toEqual(['ok']);
  });

  it('pilot bez ani jednej operacji dostaje zera, nie brak', () => {
    const facts = pilotFacts([], 'SP-AXA', TERAZ);
    expect(facts.lastFlightAt).toBeNull();
    expect(facts.onAircraft.operations).toBe(0);
    expect(facts.total).toEqual({ flights: 0, blockMs: 0, flightMs: 0 });
  });
});

describe('rachunek podglądu samolotu', () => {
  it('liczy dni z lotami po dobie klubu, a starty z projekcji', () => {
    const rows = [
      session({ sessionUuid: 'd1', at: TERAZ - 2 * DAY + 6 * H }),
      session({ sessionUuid: 'd2', at: TERAZ - 2 * DAY + 12 * H, takeoffCount: 5 }),
      session({ sessionUuid: 'd3', at: TERAZ - 10 * DAY, takeoffCount: null, flightsCount: 3 }),
      session({ sessionUuid: 'old', at: TERAZ - 45 * DAY }),
    ];
    const facts = aircraftFacts(rows, TERAZ, (at) => new Date(at).toISOString().slice(0, 10));
    expect(facts.last30.daysWithFlights).toBe(2);
    // 2 + 5 + 3 (bez startów w projekcji liczy się liczba lotów - każdy zaczął się startem).
    expect(facts.last30.takeoffs).toBe(10);
    expect(facts.last30.blockMs).toBe(300 * 60_000);
    expect(facts.recent.map((r) => r.sessionUuid)).toEqual(['d2', 'd1', 'd3', 'old']);
  });
});

describe('najbliższe terminy', () => {
  it('oznacza sprawę i nachodzenie, a przeszłość pomija', () => {
    const theCase = bookingRecord({ id: 'case' });
    const rows = [
      bookingRecord({ id: 'past', startsAt: TERAZ - 3 * H, endsAt: TERAZ - H }),
      bookingRecord({ id: 'clash', aircraftId: 'SP-FGK', startsAt: JUTRO + 9 * H, endsAt: JUTRO + 11 * H }),
      theCase,
      bookingRecord({ id: 'later', startsAt: JUTRO + 3 * DAY }),
    ];
    const out = upcomingOf(rows, theCase, TERAZ);
    expect(out.map((r) => [r.booking.id, r.thisCase, r.overlaps])).toEqual([
      ['case', true, false],
      ['clash', false, true],
      ['later', false, false],
    ]);
  });

  it('sprawa stojąca za sufitem listy wchodzi mimo to', () => {
    const theCase = bookingRecord({ id: 'far', startsAt: JUTRO + 40 * DAY, endsAt: JUTRO + 40 * DAY + H });
    const rows = Array.from({ length: UPCOMING_LIMIT + 2 }, (_, i) =>
      bookingRecord({ id: `b${i}`, startsAt: JUTRO + i * DAY, endsAt: JUTRO + i * DAY + H }),
    );
    const out = upcomingOf([...rows, theCase], theCase, TERAZ);
    expect(out).toHaveLength(UPCOMING_LIMIT + 1);
    expect(out.at(-1)?.thisCase).toBe(true);
  });
});

describe('trasy podglądu - jeden komplet faktów dla telefonu i panelu', () => {
  async function world() {
    const harness = await testHarness();
    const { app, db } = harness;
    const projection = new PgSessionsProjection();
    // Operacje PWI: świeża na SP-AXA, starsza na SP-FGK i unieważniona - jak w rachunku.
    await projection.upsert(db, session({ sessionUuid: 's-fresh', at: TERAZ - 6 * DAY }));
    await projection.upsert(
      db,
      session({ sessionUuid: 's-fgk', at: TERAZ - 40 * DAY, aircraftId: 'SP-FGK', flightsCount: 1 }),
    );
    await projection.upsert(db, session({ sessionUuid: 's-void', at: TERAZ - DAY, status: 'voided' }));
    // Operacja KRZ na SP-AXA z uczniem JSE jako Dual - do podglądu z fotela Duala.
    await projection.upsert(
      db,
      session({ sessionUuid: 's-krz', at: TERAZ - 3 * DAY, picId: 'KRZ', dualId: 'JSE', flightsCount: 4 }),
    );
    await grantApprove(db, 'KRZ');
    const pwi = await login(app, 'PWI');
    const krz = await login(app, 'KRZ');
    const jse = await login(app, 'JSE');
    const made = await book(app, pwi);
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json().id as string;
    // Drugi termin PWI, na innej maszynie, NACHODZĄCY na sprawę - baza tego nie wyklucza.
    const clash = await book(app, pwi, { aircraftId: 'SP-FGK', from: JUTRO + 9 * H, to: JUTRO + 11 * H });
    expect(clash.statusCode, clash.body).toBe(201);
    return { app, db, pwi, krz, jse, id, clashId: clash.json().id as string };
  }

  it('podgląd pilota: nalot na egzemplarzu, okna, ostatnie loty i nachodzący termin', async () => {
    const { app, krz, id, clashId } = await world();
    const res = await app.inject({ url: `/bookings/${id}/preview/pilot/PWI`, headers: bearer(krz) });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    expect(body.pilot).toMatchObject({ id: 'PWI', code: 'PWI', name: 'Piotr Wiśniewski' });
    expect(typeof body.pilot.memberSince).toBe('string');
    expect(body.lastFlightAt).toBe(iso(TERAZ - 6 * DAY));
    expect(body.onAircraft).toEqual({
      aircraftId: 'SP-AXA',
      operations: 1,
      lastAt: iso(TERAZ - 6 * DAY),
      flights: 2,
      blockMs: 100 * 60_000,
      flightMs: 80 * 60_000,
    });
    expect(body.flying.last30.flights).toBe(2);
    expect(body.flying.last90.flights).toBe(3);
    expect(body.flying.total.flights).toBe(3);
    expect(body.recent.map((r: { sessionUuid: string }) => r.sessionUuid)).toEqual(['s-fresh', 's-fgk']);
    expect(body.upcoming.map((r: { id: string; thisCase: boolean; overlaps: boolean }) => [r.id, r.thisCase, r.overlaps])).toEqual([
      [id, true, false],
      [clashId, false, true],
    ]);
    expect(body.upcoming[0].day.date).toBe('2026-06-23');
  });

  it('uczeń liczy się z fotela Duala, a podgląd otwiera się tylko dla osoby na sprawie', async () => {
    const { app, db, krz, jse } = await world();
    // Sprawa z JSE jako Dual: KRZ rezerwuje, JSE stoi na rezerwacji.
    await grantApprove(db, 'PWI');
    const pwi = await login(app, 'PWI');
    const made = await book(app, krz, { from: JUTRO + 12 * H, to: JUTRO + 13 * H, dualId: 'JSE' });
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json().id as string;

    const dual = await app.inject({ url: `/bookings/${id}/preview/pilot/JSE`, headers: bearer(pwi) });
    expect(dual.statusCode, dual.body).toBe(200);
    expect(dual.json().onAircraft.operations).toBe(1);
    expect(dual.json().flying.total.flights).toBe(4);

    // Osoba spoza sprawy nie istnieje dla tej trasy - nie jest wyszukiwarką nalotu.
    const obcy = await app.inject({ url: `/bookings/${id}/preview/pilot/PWI`, headers: bearer(pwi) });
    expect(obcy.statusCode).toBe(404);
    // Bez zdolności - 403; sprawę i tak widać w kalendarzu, więc nic nie wycieka.
    const bez = await app.inject({ url: `/bookings/${id}/preview/pilot/JSE`, headers: bearer(jse) });
    expect(bez.statusCode).toBe(403);
    // Sprawa nieznana.
    const nie = await app.inject({ url: `/bookings/nie-ma/preview/pilot/JSE`, headers: bearer(krz) });
    expect(nie.statusCode).toBe(404);
  });

  it('podgląd samolotu: liczniki ze źródłem, ostatnie 30 dni, ostatnie loty i terminy', async () => {
    const { app, krz, id } = await world();
    const res = await app.inject({ url: `/bookings/${id}/preview/aircraft`, headers: bearer(krz) });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    expect(body.aircraft).toMatchObject({
      id: 'SP-AXA',
      reg: 'SP-AXA',
      type: 'Cessna 182',
      serviceStatus: 'active',
      capacityL: 330,
      mhFormat: 'hhmm',
    });
    expect(body.lastFlightAt).toBe(iso(TERAZ - 3 * DAY));
    // Przekazanie = zdanie najświeższej ZAMKNIĘTEJ operacji z odczytami (s-krz).
    expect(body.counters).toMatchObject({
      mh: 1201.5,
      fuelL: 150,
      source: 'handover',
      byPilotId: 'KRZ',
      at: iso(TERAZ - 3 * DAY + 2 * H),
    });
    expect(body.last30).toEqual({
      daysWithFlights: 2,
      takeoffs: 4,
      blockMs: 200 * 60_000,
      flightMs: 160 * 60_000,
    });
    expect(body.recent.map((r: { sessionUuid: string; pilotId: string }) => [r.sessionUuid, r.pilotId])).toEqual([
      ['s-krz', 'KRZ'],
      ['s-fresh', 'PWI'],
    ]);
    expect(body.upcoming.map((r: { id: string; thisCase: boolean }) => [r.id, r.thisCase])).toEqual([
      [id, true],
    ]);
  });

  it('panel dostaje bajt w bajt ten sam komplet, co telefon', async () => {
    const { app, krz, id } = await world();
    const cookie = await panelCookie(app, 'AKO');

    const phone = await app.inject({ url: `/bookings/${id}/preview/pilot/PWI`, headers: bearer(krz) });
    const panel = await app.inject({ url: `/admin/api/bookings/${id}/preview/pilot/PWI`, headers: cookie });
    expect(panel.statusCode, panel.body).toBe(200);
    expect(panel.json()).toEqual(phone.json());

    const phoneAc = await app.inject({ url: `/bookings/${id}/preview/aircraft`, headers: bearer(krz) });
    const panelAc = await app.inject({ url: `/admin/api/bookings/${id}/preview/aircraft`, headers: cookie });
    expect(panelAc.statusCode, panelAc.body).toBe(200);
    // `viewer` mówi o PATRZĄCYM (czy ma kartę maszyny - obserwowanie samolotu, 3.2.0),
    // nie o sprawie: komplet FAKTÓW porównuje się bez niego. Panel bitu nie dostaje,
    // bo ma własną stopkę („Pokaż w dzienniku").
    const { viewer, ...phoneFacts } = phoneAc.json();
    expect(viewer).toEqual({ watch: false });
    expect(panelAc.json()).toEqual(phoneFacts);

    expect(
      (await app.inject({ url: `/admin/api/bookings/nie-ma/preview/aircraft`, headers: cookie })).statusCode,
    ).toBe(404);
  });
});
