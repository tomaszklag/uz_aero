/**
 * Ninerdeck (serwer) - LOG DNIA: projekcja i agregat floty (2026-08-30).
 *
 * Dwie rzeczy do udowodnienia i obie są nowe:
 *  1. **projekcja zapisuje kolumny, których dotąd nie było** - bieg silnika, koperta
 *     lotów, lotniska, suma dolewek. Bez tego grid poziomu 2 nie ma z czego powstać,
 *     a `tsc` tego nie złapie: kolumna nieprzepisana w SQL-u to `null` w runtime,
 *     nie błąd typów;
 *  2. **agregat poziomu 1 liczy po TEJ SAMEJ osi**, co lista sesji pod spodem
 *     (`claim_time`), obejmuje całą flotę i NAZYWA operację w toku osobno
 *     (`openSessions`) - do 3.2.0 sumował ją „tym, co już zapisała", od decyzji
 *     właściciela z 2026-09-26 sumy liczą WYŁĄCZNIE operacje zdane (jedna podstawa
 *     liczenia z nagłówkami dób i statystykami, §4.5), a dzisiejszy dzień nie jest
 *     pusty, bo wiersz mówi „leci teraz";
 *  3. **oś pilotów (3.2.0, `docs/panel-3.2.md` §4.1, §17.1) rozkłada TEN SAM zbiór
 *     operacji po ludziach**: sumy dowódcy obu osi są równe co do minuty, czas
 *     w prawym fotelu jest osobną liczbą, a członkowie bez lotów są zwinięci - liczba
 *     zawsze, lista na żądanie.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

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
  /** Dowódca (domyślnie AKO) i drugi pilot - oś pilotów pyta o oba fotele. */
  picId?: string;
  dualId?: string | null;
  dayOffset?: number;
  close?: boolean;
  /** `false` = silnik NIE został wyłączony (operacja w toku z pracującym śmigłem). */
  stopEngine?: boolean;
  arrivalIcao?: string | null;
  refuelL?: number;
}

/** Blok kanonicznego dnia: 08:12 → 10:34. */
const BLOCK_MS = (2 * 60 + 22) * 60_000;

/** Dzień lotny z KOMPLETEM rzeczy, o które pyta log: lotniska, dolewka, olej. */
function flyingDay(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  const base = {
    sessionUuid: o.sessionUuid,
    picId: o.picId ?? 'AKO',
    aircraftId: o.aircraftId ?? 'SP-AXA',
    dualId: o.dualId ?? null,
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

  if (o.stopEngine === false) return events;

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
    const ako = await token(app, 'AKO');
    const ingest = await post(app, ako, flyingDay({ sessionUuid: 's-log-1', refuelL: 40 }));
    // Ingest musi PRZEJŚĆ - odrzucona paczka dałaby pustą listę i test mówiący
    // „projekcja nie zapisuje kolumn" zamiast „payload był zły".
    expect(ingest.statusCode, JSON.stringify(ingest.json())).toBe(200);

    const items = (await sessions(app, await token(app, 'AKO'), '?aircraftId=SP-AXA')).json().items;
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
    const ako = await token(app, 'AKO');
    const base = { sessionUuid: 's-log-2', picId: 'AKO', aircraftId: 'SP-AXA', dualId: null };
    await post(app, ako, [
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

    const items = (await sessions(app, ako, '?aircraftId=SP-AXA')).json().items;
    expect(items[0].engineStartAt).toBe(at(8, 12));
    expect(items[0].firstTakeoffAt).toBeNull();
    expect(items[0].lastLandingAt).toBeNull();
    expect(items[0].flightsCount).toBe(0);
  });

  it('operacja na JEDNYM placu nie ma drugiego lotniska - i to nie jest brak danych', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-log-3', arrivalIcao: null }));

    const items = (await sessions(app, ako, '?aircraftId=SP-AXA')).json().items;
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
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-log-4' }));

    const report = (await log(app, ako, '?from=2026-06-22&to=2026-06-22')).json();
    const flew = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-AXA');
    const idle = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId !== 'SP-AXA');

    expect(report.aircraft.length).toBeGreaterThan(1);
    expect(flew).toMatchObject({ sessions: 1, flights: 1, activeDays: 1 });
    expect(idle).toMatchObject({ sessions: 0, flights: 0, activeDays: 0 });
    expect(idle.blockMs).toBe(0);
  });

  it('operacja W TOKU jest NAZWANA, ale nie sumowana - dzisiejszy dzień mówi „leci teraz", nie „0"', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-log-5', close: false }));

    const report = (await log(app, ako, '?from=2026-06-22&to=2026-06-22')).json();
    const axa = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-AXA');

    // Decyzja właściciela 2026-09-26: sumy = operacje ZDANE (jak w statystykach
    // i w nagłówkach dób); operacja w toku stoi w wierszu osobno.
    expect(axa).toMatchObject({ sessions: 0, openSessions: 1, activeDays: 0, flights: 0, blockMs: 0 });
    // Bilans paliwa liczy się z zamkniętych - bez ani jednej nie ma ani sumy, ani dziury.
    expect(axa.fuelConsumedL).toBeNull();
    expect(axa.fuelUnknownSessions).toBe(0);
  });

  it('wpis bez odczytu końcowego wśród ZAMKNIĘTYCH: suma paliwa jest brakiem z liczbą wierszy', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-log-5b' }));
    // Zakończenie z panelu zamyka operację BEZ odczytów (issue #81) - bilansu nie ma.
    await post(app, ako, flyingDay({ sessionUuid: 's-log-5c', dayOffset: 1, close: false }));
    const closed = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/s-log-5c/close',
      headers: { authorization: `Bearer ${ako}`, ...ADMIN_CSRF_HEADERS },
      payload: { reason: 'pilot nie zdał' },
    });
    expect(closed.statusCode, closed.body).toBe(200);

    const report = (await log(app, ako, '?from=2026-06-22&to=2026-06-23')).json();
    const axa = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-AXA');
    expect(axa).toMatchObject({ sessions: 2, openSessions: 0 });
    // Suma z dziurą NIE jest podawana jako prawda, tylko jako brak z liczbą wierszy.
    expect(axa.fuelConsumedL).toBeNull();
    expect(axa.fuelUnknownSessions).toBe(1);
  });

  it('DNI pracy to doby, nie sesje - dwie zmiany jednego dnia liczą się raz', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-log-6a' }));
    await post(app, ako, flyingDay({ sessionUuid: 's-log-6b' }));

    const report = (await log(app, ako, '?from=2026-06-22&to=2026-06-22')).json();
    const axa = report.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-AXA');

    expect(axa).toMatchObject({ sessions: 2, activeDays: 1, flights: 2 });
  });

  it('zakres zawęża po CHWILI PRZEJĘCIA - tą samą osią, co lista sesji', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-log-7', dayOffset: 3 }));

    const inside = (await log(app, ako, '?from=2026-06-25&to=2026-06-25')).json();
    const outside = (await log(app, ako, '?from=2026-06-22&to=2026-06-22')).json();
    const of = (r: { aircraft: { aircraftId: string; sessions: number }[] }) =>
      r.aircraft.find((a) => a.aircraftId === 'SP-AXA')?.sessions;

    expect(of(inside)).toBe(1);
    expect(of(outside)).toBe(0);
  });

  it('zakres odwrócony to 400 z nazwanym powodem, nie pusta lista', async () => {
    const { app } = await testHarness();
    const res = await log(app, await token(app, 'AKO'), '?from=2026-06-25&to=2026-06-22');

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'bad_range' });
  });

  it('bez zakresu serwer wybiera domyślny i mówi o tym wprost', async () => {
    const { app } = await testHarness();
    const report = (await log(app, await token(app, 'AKO'))).json();

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

/** Oś pilotów tego samego zakresu - `?os=piloci`, z listą zwiniętych po `&idle=1`. */
const pilotsLog = (app: Harness['app'], t: string, query = '') =>
  log(app, t, `?os=piloci${query}`);

interface PilotRowLike {
  code: string | null;
  sessions: number;
  openSessions: number;
  flights: number;
  blockMs: number;
  flightMs: number;
  activeDays: number;
  dual: { operations: number; blockMs: number } | null;
  regs: string[];
  open: { reg: string | null; claimedAt: number | null; engineRunning: boolean } | null;
}

const pilotRow = (report: { pilots: PilotRowLike[] }, code: string): PilotRowLike | undefined =>
  report.pilots.find((p) => p.code === code);

describe('GET /admin/api/log?os=piloci - oś pilotów', () => {
  it('wiersz na osobę: nalot DOWÓDCY, czas w prawym fotelu OSOBNO, dni z jakimkolwiek lotem', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    const bno = await token(app, 'BNO');
    // Dzień 0: AKO dowódcą z BNO w prawym fotelu. Dzień 1: BNO sam, jako dowódca.
    expect((await post(app, ako, flyingDay({ sessionUuid: 's-pl-1', dualId: 'BNO' }))).statusCode).toBe(200);
    expect((await post(app, bno, flyingDay({ sessionUuid: 's-pl-2', picId: 'BNO', dayOffset: 1 }))).statusCode).toBe(200);

    const report = (await pilotsLog(app, ako, '&from=2026-06-22&to=2026-06-23')).json();
    const akoRow = pilotRow(report, 'AKO');
    const bnoRow = pilotRow(report, 'BNO');

    // Instruktor: jedna operacja jako dowódca, ani jednej w prawym fotelu.
    expect(akoRow).toMatchObject({ sessions: 1, flights: 1, blockMs: BLOCK_MS, activeDays: 1, dual: null });
    expect(akoRow?.regs).toEqual(['SP-AXA']);
    // Uczeń: nalot dowódcy z JEDNEJ własnej operacji, a lot szkolny w OSOBNEJ liczbie -
    // tej samej godziny nie wolno dodać do bloku dowódcy (wariant B, §17.1).
    expect(bnoRow).toMatchObject({ sessions: 1, blockMs: BLOCK_MS, dual: { operations: 1, blockMs: BLOCK_MS } });
    // Dni liczą się z JAKIMKOLWIEK lotem: dzień szkolny i własny to dwa dni.
    expect(bnoRow?.activeDays).toBe(2);
    // Nikt nie trzyma maszyny.
    expect(akoRow?.open).toBeNull();
    // Kolejność alfabetyczna po osobie - pytanie brzmi „gdzie jest Kowalski".
    expect(report.pilots.map((p: PilotRowLike) => p.code)).toEqual(['AKO', 'BNO']);
  });

  it('sumy dowódcy OBU osi są równe co do minuty - operacja w toku POZA sumami obu, unieważniona poza obiema', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    const krz = await token(app, 'KRZ');
    await post(app, ako, flyingDay({ sessionUuid: 's-pl-3', dualId: 'BNO' }));
    await post(app, ako, flyingDay({ sessionUuid: 's-pl-4', dayOffset: 1, refuelL: 30 }));
    await post(app, krz, flyingDay({ sessionUuid: 's-pl-5', picId: 'KRZ', aircraftId: 'SP-FGK', dayOffset: 1 }));
    // Operacja W TOKU nie wchodzi do sum ŻADNEJ osi (decyzja właściciela 2026-09-26) -
    // obie nazywają ją osobno w `openSessions`.
    await post(app, krz, flyingDay({ sessionUuid: 's-pl-6', picId: 'KRZ', aircraftId: 'SP-FGK', dayOffset: 2, close: false }));
    // Unieważniona wypada z OBU osi.
    await post(app, ako, flyingDay({ sessionUuid: 's-pl-7', dayOffset: 2 }));
    const voided = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/s-pl-7/void',
      headers: { authorization: `Bearer ${ako}`, ...ADMIN_CSRF_HEADERS },
      payload: { reason: 'wpis testowy' },
    });
    expect(voided.statusCode, voided.body).toBe(200);

    const range = '?from=2026-06-22&to=2026-06-24';
    const fleet = (await log(app, ako, range)).json();
    const people = (await pilotsLog(app, ako, `&from=2026-06-22&to=2026-06-24`)).json();

    type A = { sessions: number; flights: number; blockMs: number; flightMs: number };
    const sumOf = (rows: A[], pick: (row: A) => number): number =>
      rows.reduce((acc, row) => acc + pick(row), 0);
    const totals = (rows: A[]) => ({
      sessions: sumOf(rows, (a) => a.sessions),
      flights: sumOf(rows, (a) => a.flights),
      blockMs: sumOf(rows, (a) => a.blockMs),
      flightMs: sumOf(rows, (a) => a.flightMs),
    });
    const fleetSum = totals(fleet.aircraft);
    expect(totals(people.pilots)).toEqual(fleetSum);
    // Trzy operacje ZDANE (dwie AKO, jedna KRZ); w toku i unieważniona poza rachunkiem.
    expect(fleetSum.sessions).toBe(3);
    // Operacja w toku KRZ stoi na obu osiach OSOBNO: w wierszu maszyny i w wierszu osoby.
    expect(fleet.aircraft.find((a: { aircraftId: string }) => a.aircraftId === 'SP-FGK')).toMatchObject({ sessions: 1, openSessions: 1 });
    expect(pilotRow(people, 'KRZ')).toMatchObject({ sessions: 1, openSessions: 1, blockMs: BLOCK_MS, regs: ['SP-FGK'] });
    // Drugi pilot NIE dodaje się do sum dowódcy - BNO ma zero jako dowódca, a lot
    // szkolny stoi w jego wierszu osobno.
    expect(pilotRow(people, 'BNO')).toMatchObject({ sessions: 0, blockMs: 0, dual: { operations: 1 } });
  });

  it('operacja w toku: wiersz mówi, że osoba TRZYMA maszynę - i czy śmigło pracuje', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    const krz = await token(app, 'KRZ');
    // AKO: silnik wyłączony, samolot niezdany. KRZ: silnik dalej pracuje.
    await post(app, ako, flyingDay({ sessionUuid: 's-pl-8', close: false }));
    await post(app, krz, flyingDay({ sessionUuid: 's-pl-9', picId: 'KRZ', aircraftId: 'SP-FGK', close: false, stopEngine: false }));

    const report = (await pilotsLog(app, ako, '&from=2026-06-22&to=2026-06-22')).json();
    expect(pilotRow(report, 'AKO')?.open).toEqual({ reg: 'SP-AXA', claimedAt: at(7, 50), engineRunning: false });
    expect(pilotRow(report, 'KRZ')?.open).toEqual({ reg: 'SP-FGK', claimedAt: at(7, 50), engineRunning: true });
    // Osoba z samą operacją w toku STOI na liście (nie wśród zwiniętych), z zerami
    // w sumach i pustą listą maszyn - maszynę nazywa sygnał „teraz".
    expect(pilotRow(report, 'KRZ')).toMatchObject({ sessions: 0, openSessions: 1, activeDays: 0, blockMs: 0, regs: [] });
    expect(report.idle.count).toBe(3);
  });

  it('operacja w toku mówi o TERAZ - wiersz niesie ją także spoza zakresu', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-pl-10', dayOffset: -10, close: false }));
    await post(app, ako, flyingDay({ sessionUuid: 's-pl-11' }));

    const report = (await pilotsLog(app, ako, '&from=2026-06-22&to=2026-06-22')).json();
    // W zakresie jedna operacja; maszyna nieoddana od dziesięciu dni dalej jest sprawą.
    expect(pilotRow(report, 'AKO')).toMatchObject({ sessions: 1, open: { reg: 'SP-AXA', claimedAt: at(7, 50, -10) } });
  });

  it('zwinięci: aktywni członkowie bez lotu - LICZBA zawsze, LISTA na żądanie, wyłączeni poza', async () => {
    const { app, db } = await testHarness();
    const ako = await token(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 's-pl-12' }));

    const folded = (await pilotsLog(app, ako, '&from=2026-06-22&to=2026-06-22')).json();
    // Klub A: AKO latał, czworo nie (BNO, PWI, JSE, KRZ).
    expect(folded.idle).toEqual({ count: 4, members: null });
    expect(folded.pilots.map((p: PilotRowLike) => p.code)).toEqual(['AKO']);

    const unfolded = (await pilotsLog(app, ako, '&from=2026-06-22&to=2026-06-22&idle=1')).json();
    expect(unfolded.idle.count).toBe(4);
    // Alfabetycznie po osobie, jak lista latających.
    expect(unfolded.idle.members.map((m: { code: string }) => m.code)).toEqual(['BNO', 'JSE', 'KRZ', 'PWI']);

    // Członek WYŁĄCZONY nie liczy się do zwiniętych: „kto nie latał" pyta o tych, którzy mogli.
    await db.query(`UPDATE memberships SET status = 'disabled' WHERE org_id = $1 AND pilot_id = 'JSE'`, [ORG_A]);
    const after = (await pilotsLog(app, ako, '&from=2026-06-22&to=2026-06-22&idle=1')).json();
    expect(after.idle.members.map((m: { code: string }) => m.code)).toEqual(['BNO', 'KRZ', 'PWI']);
  });

  it('członek wyłączony, który w zakresie LATAŁ, zostaje na liście z `active: false`', async () => {
    const { app, db } = await testHarness();
    const krz = await token(app, 'KRZ');
    await post(app, krz, flyingDay({ sessionUuid: 's-pl-13', picId: 'KRZ', aircraftId: 'SP-FGK' }));
    await db.query(`UPDATE memberships SET status = 'disabled' WHERE org_id = $1 AND pilot_id = 'KRZ'`, [ORG_A]);

    const report = (await pilotsLog(app, await token(app, 'AKO'), '&from=2026-06-22&to=2026-06-22')).json();
    expect(pilotRow(report, 'KRZ')).toMatchObject({ sessions: 1, active: false });
  });

  it('oś spoza słownika to 400, a zakres i uprawnienie działają jak na osi maszyn', async () => {
    const { app } = await testHarness();
    const ako = await token(app, 'AKO');
    expect((await log(app, ako, '?os=maszyny')).statusCode).toBe(400);
    expect((await pilotsLog(app, ako, '&from=2026-06-25&to=2026-06-22')).json()).toMatchObject({ error: 'bad_range' });
    expect((await pilotsLog(app, await token(app, 'PWI'))).statusCode).toBe(403);
  });
});
