/**
 * UZ Aero (serwer) - test przekroju ANALITYKI ZUŻYCIA (`A10a`, `A10b`).
 *
 * Dane wjeżdżają PRAWDZIWYM ingestem (`POST /events`), jak w `adminStats.test.ts`:
 * analityka czyta rejestr, więc test, który wstawiałby wiersze wprost do bazy,
 * sprawdzałby własne `INSERT`-y zamiast drogi, którą chodzą dane z telefonu.
 *
 * Liczby dni są dobrane tak, żeby dało się je sprawdzić w pamięci: każdy dzień ma jeden
 * cykl silnika o znanej długości i parę odczytów paliwomierza o znanej różnicy.
 */

import { describe, expect, it } from 'vitest';

import { TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const DAY_MS = 86_400_000;
/** Dzień bazowy zgodny z zegarem testowego harnessu (22 JUN 2026). */
const BASE = Date.UTC(2026, 5, 22);

const at = (dayOffset: number, h: number, m: number): number =>
  BASE - dayOffset * DAY_MS + (h * 60 + m) * 60_000;

let seq = 0;
function wire(
  sessionUuid: string,
  type: string,
  time: number,
  payload: object = {},
): { picId: string; [key: string]: unknown } {
  seq += 1;
  return {
    uuid: `cons-${seq}-${type}`,
    sessionUuid,
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

/**
 * Dzień lotny o zadanym zużyciu: preflight → cykl silnika z jednym lotem → zamknięcie.
 *
 * `hours` to długość cyklu, `burnL` - ubytek paliwa. Dzięki temu każdy dzień wnosi
 * jedno równanie o znanej z góry stawce.
 */
function flyingDay(options: {
  dayOffset: number;
  hours: number;
  flightHours: number;
  burnL: number;
  mhStart: number;
  mhDelta: number;
  closed?: boolean;
}) {
  const { dayOffset, hours, flightHours, burnL, mhStart, mhDelta, closed = true } = options;
  const uuid = `s-${dayOffset}`;
  const start = at(dayOffset, 8, 0);
  const engineStart = start + 10 * 60_000;
  const engineStop = engineStart + hours * 3_600_000;
  const takeoff = engineStart + 5 * 60_000;
  const landing = takeoff + flightHours * 3_600_000;

  const events = [
    wire(uuid, 'session_claim', start - 60_000, { mode: 'free' }),
    wire(uuid, 'preflight_confirm', start, {
      operation: 'skoki',
      reading: { fuelL: 300, mh: mhStart },
    }),
    wire(uuid, 'engine_start', engineStart),
    wire(uuid, 'takeoff', takeoff, { method: 'auto' }),
    wire(uuid, 'landing', landing, { method: 'auto' }),
    wire(uuid, 'engine_stop', engineStop),
  ];

  if (closed) {
    events.push(
      wire(uuid, 'day_close', engineStop + 10 * 60_000, {
        finalReading: { fuelL: 300 - burnL, mh: mhStart + mhDelta },
      }),
    );
  }

  return events;
}

async function token(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

async function ingest(app: Harness['app'], events: object[]): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: bearer(await token(app, 'TMK')),
    payload: { events },
  });
  if (res.statusCode !== 200) throw new Error(`ingest odrzucony: ${res.statusCode} ${res.body}`);
}

/**
 * Sześć zamkniętych dni o RÓŻNYCH proporcjach ziemia/powietrze i łącznym czasie silnika
 * ponad 10 h - czyli tyle, ile trzeba, żeby bramka publikacji przepuściła stawki.
 * Stawki źródłowe: 12 L/h na ziemi, 42 L/h w powietrzu; przelicznik MH 1.0 / 0.4.
 */
function sixDays() {
  const shape = [
    { hours: 3.0, flightHours: 2.5 },
    { hours: 2.5, flightHours: 1.0 },
    { hours: 3.5, flightHours: 3.0 },
    { hours: 2.0, flightHours: 0.5 },
    { hours: 4.0, flightHours: 3.5 },
    { hours: 2.5, flightHours: 2.0 },
  ];

  let mh = 1000;
  const events: object[] = [];
  shape.forEach((day, index) => {
    const groundHours = day.hours - day.flightHours;
    const burnL = 12 * groundHours + 42 * day.flightHours;
    const mhDelta = 1.0 * day.flightHours + 0.4 * groundHours;
    events.push(
      ...flyingDay({
        dayOffset: index + 1,
        hours: day.hours,
        flightHours: day.flightHours,
        burnL,
        mhStart: mh,
        mhDelta,
      }),
    );
    mh += mhDelta;
  });

  return events;
}

async function report(app: Harness['app'], query = '') {
  const res = await app.inject({
    method: 'GET',
    url: `/admin/api/fleet/SP-AXA/consumption${query}`,
    headers: bearer(await token(app, 'TMK')),
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('A10a · analityka liczy się ze strumienia, ale bez własnej arytmetyki SQL', () => {
  it('odzyskuje stawki paliwa i przeliczniki motogodzin z dni lotnych', async () => {
    const { app } = await testHarness();
    await ingest(app, sixDays());

    const body = await report(app);

    expect(body.aircraft.reg).toBe('SP-AXA');
    expect(body.basis.sessions).toBe(6);
    expect(body.fuel.published).toBe(true);

    const ground = body.fuel.rates.find((r: { phase: string }) => r.phase === 'ground');
    const air = body.fuel.rates.find((r: { phase: string }) => r.phase === 'air');
    expect(ground.lPerH).toBeCloseTo(12, 3);
    expect(air.lPerH).toBeCloseTo(42, 3);

    expect(body.mh.published).toBe(true);
    expect(body.mh.kind).toBe('tach');
    expect(body.mh.perFlightHour).toBeCloseTo(1.0, 3);
    expect(body.mh.perGroundHour).toBeCloseTo(0.4, 3);
  });

  it('kafle nagłówkowe to ilorazy sum, a przyrost MH liczy się z kolumn projekcji', async () => {
    const { app } = await testHarness();
    await ingest(app, sixDays());

    const body = await report(app);

    // Σ godzin silnika = 17,5; Σ lotu = 12,5; Σ ziemi = 5 → Σ litrów = 585.
    expect(body.headline.litersPerBlockHour).toBeCloseTo(585 / 17.5, 6);
    expect(body.headline.litersPerFlightHour).toBeCloseTo(585 / 12.5, 6);
    // Σ ΔMH = 12,5·1,0 + 5·0,4 = 14,5 → na godzinę bloku.
    expect(body.headline.mhPerBlockHour).toBeCloseTo(14.5 / 17.5, 6);
  });

  it('interwały niosą swoje źródła - tabela „skąd biorą się liczby"', async () => {
    const { app } = await testHarness();
    await ingest(app, sixDays());

    const body = await report(app);

    expect(body.intervals).toHaveLength(6);
    const first = body.intervals[0];
    expect(first.startKind).toBe('preflight');
    expect(first.endKind).toBe('day_close');
    expect(first.startUuid).toMatch(/preflight_confirm$/);
    expect(first.rejected).toBeNull();
    // Kolejność chronologiczna - wykres trendu potrzebuje osi rosnącej.
    expect(body.intervals[0].startAt).toBeLessThan(body.intervals[5].startAt);
  });
});

describe('A10b · poniżej progu publikacji ekran mówi „za mało danych"', () => {
  it('nie publikuje stawek, ale oddaje zebrane interwały i braki do progu', async () => {
    const { app } = await testHarness();
    await ingest(
      app,
      flyingDay({
        dayOffset: 1,
        hours: 2,
        flightHours: 1.5,
        burnL: 69,
        mhStart: 1000,
        mhDelta: 1.7,
      }),
    );

    const body = await report(app);

    expect(body.fuel.published).toBe(false);
    expect(body.fuel.rates).toEqual([]);
    expect(body.fuel.gate.intervals).toBe(1);
    expect(body.fuel.gate.missingIntervals).toBe(4);
    expect(body.intervals).toHaveLength(1);
    // Sumy są dostępne od pierwszego dnia - to na nich stoi ekran `A10b`.
    expect(body.headline.litersPerBlockHour).toBeCloseTo(69 / 2, 6);
  });

  it('dzień OTWARTY nie wchodzi do modelu, ale jest policzony osobno', async () => {
    const { app } = await testHarness();
    await ingest(
      app,
      flyingDay({
        dayOffset: 1,
        hours: 2,
        flightHours: 1.5,
        burnL: 69,
        mhStart: 1000,
        mhDelta: 1.7,
        closed: false,
      }),
    );

    const body = await report(app);

    expect(body.basis.sessions).toBe(0);
    expect(body.basis.openSessions).toBe(1);
    // Bez odczytu końcowego nie znamy zużycia - więc ani interwału, ani zmyślonej liczby.
    expect(body.intervals).toEqual([]);
    expect(body.headline.litersPerBlockHour).toBeNull();
  });

  it('samolot bez ani jednego dnia daje pusty raport, nie błąd', async () => {
    const { app } = await testHarness();

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-FGK/consumption',
      headers: bearer(await token(app, 'TMK')),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().intervals).toEqual([]);
    expect(res.json().fuel.published).toBe(false);
  });
});

describe('A10a · brama uprawnień i walidacja', () => {
  it('szef wyszkolenia widzi raport, pilot dostaje 403', async () => {
    const { app } = await testHarness();

    const lead = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-AXA/consumption',
      headers: bearer(await token(app, 'AKO')),
    });
    expect(lead.statusCode).toBe(200);

    const pilot = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-AXA/consumption',
      headers: bearer(await token(app, 'PWI')),
    });
    expect(pilot.statusCode).toBe(403);
    expect(pilot.json()).toEqual({ error: 'forbidden', required: 'panel.access' });
  });

  it('bez tokenu 401', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-AXA/consumption',
    });
    expect(res.statusCode).toBe(401);
  });

  it('jednostka spoza floty to 404, a nie pusty raport', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-NIEMA/consumption',
      headers: bearer(await token(app, 'TMK')),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('data nieistniejąca w kalendarzu to 400, nie cicho inny miesiąc', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-AXA/consumption?from=2026-02-30',
      headers: bearer(await token(app, 'TMK')),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request' });
  });

  it('zakres odwrócony to 400', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-AXA/consumption?from=2026-06-30&to=2026-06-01',
      headers: bearer(await token(app, 'TMK')),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_range' });
  });

  it('zakres zawęża zbiór dni', async () => {
    const { app } = await testHarness();
    await ingest(app, sixDays());

    // Okno obejmujące wyłącznie dzień sprzed doby (dayOffset = 1).
    const day = new Date(BASE - DAY_MS).toISOString().slice(0, 10);
    const body = await report(app, `?from=${day}&to=${day}`);

    expect(body.basis.sessions).toBe(1);
    expect(body.range.calendarDays).toBe(1);
  });
});
