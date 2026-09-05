/**
 * UZ Aero (serwer) - LOG DNIA: projekcja i agregat floty (2026-08-30).
 *
 * Dwie rzeczy do udowodnienia i obie są nowe:
 *  1. **projekcja zapisuje kolumny, których dotąd nie było** - bieg silnika, koperta
 *     lotów, lotniska, suma dolewek. Bez tego grid poziomu 2 nie ma z czego powstać,
 *     a `tsc` tego nie złapie: kolumna nieprzepisana w SQL-u to `null` w runtime,
 *     nie błąd typów;
 *  2. **agregat poziomu 1 liczy po TEJ SAMEJ osi**, co lista sesji pod spodem
 *     (`claim_time`), obejmuje całą flotę i NIE pomija sesji otwartych - inaczej
 *     dzisiejszy dzień byłby pusty do wieczora, a dwa poziomy modułu pokazywałyby
 *     inną liczbę sesji.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const DAY = Date.UTC(2026, 5, 22);
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (h: number, m: number, dayOffset = 0): number =>
  DAY + dayOffset * DAY_MS + h * 3600_000 + m * 60_000;

let seq = 0;

function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  seq += 1;
  return { uuid: `l-${seq}-${type}`, type, deviceTime: time, gpsTime: time, payload, schemaVersion: 1, ...base };
}

interface DayOptions {
  sessionUuid: string;
  aircraftId?: string;
  dayOffset?: number;
  close?: boolean;
  arrivalIcao?: string | null;
  refuelL?: number;
}

/** Dzień lotny z KOMPLETEM rzeczy, o które pyta log: lotniska, dolewka, olej. */
function flyingDay(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  const base = {
    sessionUuid: o.sessionUuid,
    picId: 'TMK',
    aircraftId: o.aircraftId ?? 'SP-AXA',
    dualId: null,
  };

  const events = [
    event('session_claim', at(7, 50, d), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0, d),
      {
        operation: 'ferry',
        departureIcao: 'EPKK',
        arrivalIcao: o.arrivalIcao === undefined ? 'EPBA' : o.arrivalIcao,
        reading: { fuelL: 150, mh: 1200 },
        oilL: 8.5,
        oilAddedL: 1,
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
    event('engine_start', at(8, 12, d), {}, base),
    event('takeoff', at(8, 25, d), { method: 'auto' }, base),
    event('landing', at(9, 18, d), { method: 'auto' }, base),
  ];

  if (o.refuelL != null) {
    // Dolewka PO zatrzymaniu śmigła - jedyne okno, w którym domena ją przyjmuje.
    events.push(
      event('engine_stop', at(10, 34, d), {}, base),
      event('refuel', at(10, 40, d), { beforeL: 88, addedL: o.refuelL, afterL: 88 + o.refuelL }, base),
    );
  } else {
    events.push(event('engine_stop', at(10, 34, d), {}, base));
  }

  if (o.close !== false) {
    events.push(
      event('day_close', at(16, 45, d), { finalReading: { fuelL: 88, mh: 1202.2 } }, base),
    );
  }
  return events;
}

async function token(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken: googleTokenFor(who) },
  });
  return res.json().token as string;
}

const post = (app: Harness['app'], t: string, events: unknown[]) =>
  app.inject({
    method: 'POST',
    url: '/events',
    headers: { authorization: `Bearer ${t}`, ...ADMIN_CSRF_HEADERS },
    payload: { events },
  });

const log = (app: Harness['app'], t: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/admin/api/log${query}`,
    headers: { authorization: `Bearer ${t}` },
  });

const sessions = (app: Harness['app'], t: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/admin/api/sessions${query}`,
    headers: { authorization: `Bearer ${t}` },
  });

describe('projekcja sesji: kolumny logu dnia', () => {
  it('zapisuje bieg silnika, kopertę lotów, lotniska i sumę dolewek', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    const ingest = await post(app, tmk, flyingDay({ sessionUuid: 's-log-1', refuelL: 40 }));
    // Ingest musi PRZEJŚĆ - odrzucona paczka dałaby pustą listę i test mówiący
    // „projekcja nie zapisuje kolumn" zamiast „payload był zły".
    expect(ingest.statusCode, JSON.stringify(ingest.json())).toBe(200);

    const items = (await sessions(app, await token(app, 'TMK'), '?aircraftId=SP-AXA')).json().items;
    expect(items).toHaveLength(1);

    // Bieg silnika to NIE przejęcie i NIE zdanie: maszynę wzięto 7:50, zdano 16:45,
    // a śmigło pracowało 8:12 - 10:34. Log dnia pyta o pracę śmigła.
    expect(items[0].engineStartAt).toBe(at(8, 12));
    expect(items[0].engineStopAt).toBe(at(10, 34));
    expect(items[0].firstTakeoffAt).toBe(at(8, 25));
    expect(items[0].lastLandingAt).toBe(at(9, 18));
    expect(items[0].departureIcao).toBe('EPKK');
    expect(items[0].arrivalIcao).toBe('EPBA');
    // Trzecia liczba bilansu paliwa - do dziś żyła wyłącznie w pamięci projekcji.
    expect(items[0].fuelAddedL).toBe(40);
    expect(items[0].oilLevelL).toBe(8.5);
    expect(items[0].oilAddedL).toBe(1);
  });

  it('sesja BEZ LOTU ma pustą kopertę lotów, ale pełny bieg silnika', async () => {
    // Próba silnika albo dzień odwołany pogodą: maszyna pracowała, nikt nie wystartował.
    // To jest stan świata, a nie brak danych - i grid ma go tak pokazać.
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    const base = { sessionUuid: 's-log-2', picId: 'TMK', aircraftId: 'SP-AXA', dualId: null };
    await post(app, tmk, [
      event('session_claim', at(7, 50), { mode: 'free' }, base),
      event(
        'preflight_confirm',
        at(8, 0),
        {
          operation: 'inne',
          departureIcao: 'EPKK',
          arrivalIcao: null,
          reading: { fuelL: 150, mh: 1200 },
          client: null,
          mhFormat: 'hhmm',
        },
        base,
      ),
      event('engine_start', at(8, 12), {}, base),
      event('engine_stop', at(8, 20), {}, base),
      event('day_close', at(8, 30), { finalReading: { fuelL: 148, mh: 1200.1 }, noFlightReason: 'malfunction' }, base),
    ]);

    const items = (await sessions(app, tmk, '?aircraftId=SP-AXA')).json().items;
    expect(items[0].engineStartAt).toBe(at(8, 12));
    expect(items[0].firstTakeoffAt).toBeNull();
    expect(items[0].lastLandingAt).toBeNull();
    expect(items[0].flightsCount).toBe(0);
  });

  it('operacja na JEDNYM placu nie ma drugiego lotniska - i to nie jest brak danych', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    await post(app, tmk, flyingDay({ sessionUuid: 's-log-3', arrivalIcao: null }));

    const items = (await sessions(app, tmk, '?aircraftId=SP-AXA')).json().items;
    expect(items[0].departureIcao).toBe('EPKK');
    expect(items[0].arrivalIcao).toBeNull();
  });
});

describe('GET /admin/api/log - flota w zakresie', () => {
  it('oddaje CAŁĄ flotę, także maszyny, które nie latały', async () => {
    // Wiersz samych zer jest odpowiedzią, po którą się przyszło („czy SP-KLM w ogóle
    // ruszył") - przy złączeniu od sesji ta maszyna po prostu by zniknęła, a brak
    // wiersza czyta się jak brak maszyny.
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    await post(app, tmk, flyingDay({ sessionUuid: 's-log-4' }));

    const report = (await log(app, tmk, '?from=2026-06-22&to=2026-06-22')).json();
    const flew = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-AXA');
    const idle = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId !== 'SP-AXA');

    expect(report.aircraft.length).toBeGreaterThan(1);
    expect(flew).toMatchObject({ sessions: 1, flights: 1, activeDays: 1 });
    expect(idle).toMatchObject({ sessions: 0, flights: 0, activeDays: 0 });
    expect(idle.blockMs).toBe(0);
  });

  it('liczy sesje OTWARTE - inaczej dzisiejszy dzień byłby pusty do wieczora', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    await post(app, tmk, flyingDay({ sessionUuid: 's-log-5', close: false }));

    const report = (await log(app, tmk, '?from=2026-06-22&to=2026-06-22')).json();
    const axa = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-AXA');

    expect(axa).toMatchObject({ sessions: 1, openSessions: 1 });
    // Bilansu paliwa nie ma bez odczytu końcowego - i wtedy suma NIE jest podawana
    // jako prawda, tylko jako brak z liczbą wierszy, których dotyczy.
    expect(axa.fuelConsumedL).toBeNull();
    expect(axa.fuelUnknownSessions).toBe(1);
  });

  it('DNI pracy to doby, nie sesje - dwie zmiany jednego dnia liczą się raz', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    await post(app, tmk, flyingDay({ sessionUuid: 's-log-6a' }));
    await post(app, tmk, flyingDay({ sessionUuid: 's-log-6b' }));

    const report = (await log(app, tmk, '?from=2026-06-22&to=2026-06-22')).json();
    const axa = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-AXA');

    expect(axa).toMatchObject({ sessions: 2, activeDays: 1, flights: 2 });
  });

  it('zakres zawęża po CHWILI PRZEJĘCIA - tą samą osią, co lista sesji', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    await post(app, tmk, flyingDay({ sessionUuid: 's-log-7', dayOffset: 3 }));

    const inside = (await log(app, tmk, '?from=2026-06-25&to=2026-06-25')).json();
    const outside = (await log(app, tmk, '?from=2026-06-22&to=2026-06-22')).json();
    const of = (r: { aircraft: { aircraftId: string; sessions: number }[] }) =>
      r.aircraft.find((a) => a.aircraftId === 'SP-AXA')?.sessions;

    expect(of(inside)).toBe(1);
    expect(of(outside)).toBe(0);
  });

  it('zakres odwrócony to 400 z nazwanym powodem, nie pusta lista', async () => {
    const { app } = await testHarness();
    const res = await log(app, await token(app, 'TMK'), '?from=2026-06-25&to=2026-06-22');

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'bad_range' });
  });

  it('bez zakresu serwer wybiera domyślny i mówi o tym wprost', async () => {
    const { app } = await testHarness();
    const report = (await log(app, await token(app, 'TMK'))).json();

    expect(report.range.defaulted).toBe(true);
    // „Dziś" bierze się z zegara SERWERA - panel kotwiczy nim szybkie filtry, zamiast
    // pytać zegara przeglądarki, który jest trzecim, niesprawdzonym zegarem.
    expect(typeof report.at).toBe('string');
  });

  it('konto bez wejścia do panelu dostaje 403 z podaną zdolnością', async () => {
    const { app } = await testHarness();
    const res = await log(app, await token(app, 'PWI'));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ required: 'panel.access' });
  });
});
