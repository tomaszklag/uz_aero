/**
 * UZ Aero (serwer) — STATYSTYKI floty i pilotów (`GET /admin/api/stats`, mockup `A10`).
 *
 * Konstytucja ekranu (zdanie z góry mockupu) w postaci wykonywalnej:
 *
 *  1. **panel sumuje gotowe wyniki** — agregat trasy równa się sumie kolumn projekcji;
 *     równość z `projectSession` przybija osobno `contract.test.ts`;
 *  2. **tylko dni ZAMKNIĘTE wchodzą do sum**, zakres liczy się po DNIU ZAMKNIĘCIA,
 *     a odpowiedź mówi, ile dni otwartych pominęła;
 *  3. **`null` to „nie wiemy", nigdy zero** — wiersz sprzed migracji 18 nie staje się
 *     zerem startów, a zrzut bez wysokości nie wchodzi do średniej.
 *
 * Dni powstają przez `POST /events` tokenem PIC-a (single-writer), żeby agregaty
 * czytały projekcję zapisaną przez PRAWDZIWY ingest, a nie stan wyobrażony testem.
 */

import { describe, expect, it } from 'vitest';

import type { AdminStatsReport } from '../src/application/admin/contracts/stats.ts';
import { TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
/** Trzy kolejne doby czerwca — zakres testów: 2026-06-19 … 2026-06-22. */
const D19 = Date.UTC(2026, 5, 19);
const D20 = Date.UTC(2026, 5, 20);
const D21 = Date.UTC(2026, 5, 21);
const D22 = Date.UTC(2026, 5, 22);

/** Blok kanonicznego dnia: engine_start 08:12 → engine_stop 10:34. */
const BLOCK_MS = (2 * 60 + 22) * MIN_MS;
/** Lot kanonicznego dnia: takeoff 08:25 → landing 09:18. */
const FLIGHT_MS = 53 * MIN_MS;

interface DayOptions {
  sessionUuid: string;
  aircraftId: string;
  picId: string;
  dualId?: string;
  dayStart: number;
  operation?: 'skoki' | 'ferry';
  client?: string;
  /** Zrzuty: `alt: null` = bez fixa wysokości (nie wchodzi do średniej). */
  drops?: { tandem: number; aff: number; solo: number; alt: number | null }[];
  mh?: number;
  fuelEnd?: number;
  /** `false` = dzień bez `day_close` (otwarty — poza sumami). */
  close?: boolean;
  /** Czas `day_close` WZGLĘDEM `dayStart` (domyślnie 16:45 tego samego dnia). */
  closeAtMs?: number;
}

let seq = 0;

/** Kanoniczny dzień lotny — te same godziny co w `contract.test.ts`, sterowane opcjami. */
function flyingDay(o: DayOptions) {
  const base = {
    sessionUuid: o.sessionUuid,
    aircraftId: o.aircraftId,
    picId: o.picId,
    dualId: o.dualId ?? null,
  };
  const at = (h: number, m: number): number => o.dayStart + h * HOUR_MS + m * MIN_MS;
  const mh = o.mh ?? 1200;
  const ev = (type: string, time: number, payload: object = {}) => {
    seq += 1;
    return {
      uuid: `st-${String(seq).padStart(4, '0')}-${type}`,
      type,
      deviceTime: time,
      gpsTime: time,
      payload,
      schemaVersion: 1,
      ...base,
    };
  };

  const events = [
    ev('session_claim', at(7, 50), { mode: 'free' }),
    ev('preflight_confirm', at(8, 0), {
      operation: o.operation ?? 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: null,
      dutyStart: at(8, 0),
      reading: { fuelL: 150, mh },
      client: o.client ?? null,
      mhFormat: 'hhmm',
    }),
    ev('engine_start', at(8, 12)),
    ev('takeoff', at(8, 25), { method: 'auto' }),
    ...(o.drops ?? []).map((drop, i) =>
      ev('drop', at(8, 40 + i * 6), {
        dropNumber: i + 1,
        jumpers: { tandem: drop.tandem, aff: drop.aff, solo: drop.solo },
        ...(drop.alt == null ? {} : { altitudeFt: drop.alt }),
      }),
    ),
    ev('landing', at(9, 18), { method: 'auto' }),
    ev('engine_stop', at(10, 34)),
  ];

  if (o.close !== false) {
    const closeAt = o.dayStart + (o.closeAtMs ?? 16 * HOUR_MS + 45 * MIN_MS);
    events.push(
      ev('day_close', closeAt, {
        finalReading: { fuelL: o.fuelEnd ?? 88, mh: mh + 2.2 },
        dutyEnd: closeAt,
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

/** Wysyła dzień TOKENEM JEGO PIC-a — single-writer, jak w `adminDashboard.test.ts`. */
async function ingest(
  app: Harness['app'],
  events: { picId: string; [key: string]: unknown }[],
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: bearer(await token(app, events[0]!.picId)),
    payload: { events },
  });
  if (res.statusCode !== 200) throw new Error(`ingest odrzucony: ${res.statusCode} ${res.body}`);
}

/**
 * Zestaw kanoniczny: dwa dni ZAMKNIĘTE (skoki na SP-AXA, ferry z dualem na SP-FGK)
 * i jeden OTWARTY — dokładnie ten układ, o którym mówi nagłówek mockupu („dni jeszcze
 * otwarte są celowo poza zakresem").
 */
async function threeDays() {
  const harness = await testHarness();
  const { app } = harness;

  await ingest(
    app,
    flyingDay({
      sessionUuid: 'st-sky',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dayStart: D20,
      operation: 'skoki',
      client: 'SKY CAMP',
      drops: [
        { tandem: 2, aff: 1, solo: 1, alt: 3000 },
        { tandem: 1, aff: 0, solo: 3, alt: null },
      ],
      mh: 1200,
      fuelEnd: 88,
    }),
  );
  await ingest(
    app,
    flyingDay({
      sessionUuid: 'st-ferry',
      aircraftId: 'SP-FGK',
      picId: 'PWI',
      dualId: 'JSE',
      dayStart: D21,
      operation: 'ferry',
      mh: 500,
      fuelEnd: 96,
    }),
  );
  await ingest(
    app,
    flyingDay({
      sessionUuid: 'st-open',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dayStart: D22,
      close: false,
    }),
  );

  const admin = await token(app, 'TMK');
  const stats = async (query = '?from=2026-06-19&to=2026-06-22'): Promise<AdminStatsReport> => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/api/stats${query}`,
      headers: bearer(admin),
    });
    expect(res.statusCode).toBe(200);
    return res.json() as AdminStatsReport;
  };

  return { ...harness, admin, stats };
}

describe('A10 · sumy zakresu z kolumn projekcji', () => {
  it('kafle: blok, lot, starty/lądowania, paliwo, Δ MH i wymiary — z dni ZAMKNIĘTYCH', async () => {
    const { stats } = await threeDays();
    const report = await stats();

    expect(report.totals).toMatchObject({
      sessions: 2,
      aircraft: 2,
      // PIC ∪ Dual: TMK, PWI i JSE — dzień szkolny należy do OBU członków załogi.
      pilots: 3,
      blockMs: 2 * BLOCK_MS,
      flightMs: 2 * FLIGHT_MS,
      takeoffs: 2,
      landings: 2,
      staleRows: 0,
      openSessionsInRange: 1,
    });
    // Paliwo: (150−88) + (150−96); Δ MH: 2×2.2 — floaty porównujemy z tolerancją.
    expect(report.totals.fuelConsumedL).toBeCloseTo(62 + 54, 9);
    expect(report.totals.mhDeltaH).toBeCloseTo(4.4, 9);
    // Iloraz liczy SERWER — panel nie ma prawa dzielić dwóch sum po swojemu.
    expect(report.totals.flightVsBlockPct).toBeCloseTo(((2 * FLIGHT_MS) / (2 * BLOCK_MS)) * 100, 9);
    expect(report.range).toMatchObject({
      fromDay: '2026-06-19',
      toDay: '2026-06-22',
      calendarDays: 4,
      defaulted: false,
    });
  });

  it('trzy ujęcia to TEN SAM zbiór dni — sumy zgadzają się między ujęciami', async () => {
    const { stats } = await threeDays();
    const report = await stats();

    for (const rows of [report.aircraft, report.operations]) {
      expect(rows.reduce((acc, r) => acc + r.blockMs, 0)).toBe(report.totals.blockMs);
      expect(rows.reduce((acc, r) => acc + r.flightMs, 0)).toBe(report.totals.flightMs);
      expect(rows.reduce((acc, r) => acc + r.sessions, 0)).toBe(report.totals.sessions);
    }
    // Blok „jako PIC" też sumuje się do nalotu floty (hint mockupu) — Duala tu nie ma.
    expect(report.pilots.reduce((acc, r) => acc + r.blockMs, 0)).toBe(report.totals.blockMs);

    expect(report.aircraft.map((r) => r.reg).sort()).toEqual(['SP-AXA', 'SP-FGK']);
    // Bloki obu operacji są tu RÓWNE, więc rozstrzyga tie-breaker alfabetyczny.
    expect(report.operations.map((r) => r.operation)).toEqual(['ferry', 'skoki']);
    // Bloki obu PIC-ów są równe — rozstrzyga tie-breaker po identyfikatorze konta.
    expect(report.pilots.map((r) => r.code)).toEqual(['PWI', 'TMK']);
    expect(report.pilots.find((r) => r.code === 'PWI')).toMatchObject({
      regs: ['SP-FGK'],
      sessions: 1,
    });
  });

  it('wiersz samolotu: odczyty skrajne, średnie L/h na godzinę BLOKOWĄ i wykorzystanie', async () => {
    const { stats } = await threeDays();
    const row = (await stats()).aircraft[0]!;

    expect(row).toMatchObject({ reg: 'SP-AXA', sessions: 1, activeDays: 1 });
    expect(row.mhFirstStart).toBe(1200);
    expect(row.mhLastEnd).toBeCloseTo(1202.2, 9);
    // 62 L / (2:22 bloku = 2.3(6) h) — mockup liczy średnią na godzinę blokową.
    expect(row.avgLitresPerBlockHour).toBeCloseTo(62 / (BLOCK_MS / HOUR_MS), 9);
    // 1 dzień lotny na 4 dni kalendarzowe zakresu.
    expect(row.utilizationPct).toBeCloseTo(25, 9);
  });
});

describe('A10 · dni otwarte i oś zakresu', () => {
  it('dzień OTWARTY jest poza sumami — zamknięcie go zmieniłoby raport wstecz', async () => {
    const { app, stats } = await threeDays();
    const before = await stats();
    expect(before.totals.sessions).toBe(2);
    expect(before.totals.openSessionsInRange).toBe(1);

    // Domknięcie otwartego dnia WCIĄGA go do sum — dokładnie dlatego wcześniej był
    // poza nimi: jego liczby nie były jeszcze ostateczne.
    await ingest(app, [
      {
        uuid: 'st-9999-day_close',
        sessionUuid: 'st-open',
        aircraftId: 'SP-AXA',
        picId: 'TMK',
        dualId: null,
        type: 'day_close',
        deviceTime: D22 + 16 * HOUR_MS,
        gpsTime: D22 + 16 * HOUR_MS,
        payload: { finalReading: { fuelL: 90, mh: 1202.2 }, dutyEnd: D22 + 16 * HOUR_MS },
        schemaVersion: 1,
      },
    ]);

    const after = await stats();
    expect(after.totals.sessions).toBe(3);
    expect(after.totals.openSessionsInRange).toBe(0);
    expect(after.totals.blockMs).toBe(3 * BLOCK_MS);
  });

  it('zakres liczy się po DNIU ZAMKNIĘCIA sesji, nie po duty starcie', async () => {
    const { app, admin } = await threeDays();
    // Dzień z duty startem 19-go, domknięty NAZAJUTRZ o 02:30 — nocna zmiana.
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'st-night',
        aircraftId: 'SP-ANK',
        picId: 'KRZ',
        dualId: 'JSE', // An-2 wymaga Duala — a dla statystyk to kolejny uczestnik.
        dayStart: D19,
        operation: 'ferry',
        closeAtMs: 26 * HOUR_MS + 30 * MIN_MS, // 20 czerwca, 02:30
      }),
    );

    const on = async (day: string) => {
      const res = await app.inject({
        method: 'GET',
        url: `/admin/api/stats?from=${day}&to=${day}`,
        headers: bearer(admin),
      });
      expect(res.statusCode).toBe(200);
      return res.json() as AdminStatsReport;
    };

    // 19-go dzień jeszcze trwał — do sum wchodzi tam, gdzie został DOMKNIĘTY.
    expect((await on('2026-06-19')).totals.sessions).toBe(0);
    const closingDay = await on('2026-06-20');
    expect(closingDay.totals.sessions).toBe(2); // st-sky + st-night
    expect(closingDay.aircraft.map((r) => r.reg).sort()).toEqual(['SP-ANK', 'SP-AXA']);
  });

  it('szereg dzienny niesie PEŁNY kalendarz — dzień bez sesji to prawdziwe zero', async () => {
    const { stats } = await threeDays();
    const daily = (await stats()).daily;

    expect(daily).toHaveLength(4);
    expect(daily.map((p) => p.day)).toEqual([
      '2026-06-19',
      '2026-06-20',
      '2026-06-21',
      '2026-06-22',
    ]);
    // 19-go i 22-go nikt nie DOMKNĄŁ dnia — zero jest faktem o rejestrze, nie brakiem.
    expect(daily.map((p) => p.blockMs)).toEqual([0, BLOCK_MS, BLOCK_MS, 0]);
  });

  it('dzień otwarty BEZ CLAIMU (rejestr niekompletny) jest liczony ZAWSZE, osobno', async () => {
    const { app, stats } = await threeDays();
    // Strumień bez `session_claim`, czyli bez `claim_time`. Wg §4.4 claim jest pierwszym
    // zdarzeniem każdej sesji, więc taki strumień nie powstaje w normalnej pracy — ale
    // serwer go przyjmie (§4.5: nie odrzuca danych z terenu) i nie ma jak przypisać go
    // do zakresu dat. Uczciwiej pokazać go zawsze, niż schować: to licznik rzeczy
    // wymagających uwagi, a ta sesja jest połamana.
    //
    // Do migracji 21 rolę „bez daty" pełniła sesja z SAMYM claimem, bo kolumna niosła
    // wtedy meldunek z preflightu. Dziś taka sesja ma datę i jest zwykłym dniem w toku.
    await ingest(app, [
      {
        sessionUuid: 'st-lost',
        aircraftId: 'SP-KWA',
        picId: 'JSE',
        dualId: null,
        schemaVersion: 1,
        uuid: 'st-lost-preflight',
        type: 'preflight_confirm',
        deviceTime: D21 + 7 * HOUR_MS,
        gpsTime: D21 + 7 * HOUR_MS,
        payload: {
          operation: 'skoki',
          departureIcao: 'EPKK',
          arrivalIcao: null,
          reading: { fuelL: 150, mh: 1234.5 },
          client: null,
          mhFormat: 'hhmm',
        },
      },
    ]);

    const report = await stats();
    expect(report.totals.openSessionsInRange).toBe(1); // st-open — po duty starcie
    expect(report.totals.openSessionsUndated).toBe(1); // st-lost — bez daty

    // Zakres, w którym st-open NIE leży: sesja bez daty dalej jest widoczna,
    // bo nie istnieje zakres, do którego należy.
    const narrow = await stats('?from=2026-06-19&to=2026-06-19');
    expect(narrow.totals.openSessionsInRange).toBe(0);
    expect(narrow.totals.openSessionsUndated).toBe(1);
  });

  it('remis po `close_time`: odczyty skrajne rozstrzyga tie-breaker po `session_uuid`', async () => {
    const { app, admin } = await threeDays();
    // Dwie sesje SP-KWA domknięte w TEJ SAMEJ milisekundzie (nocna zmiana kończy się
    // razem z dzienną). Wyższy uuid jedzie PIERWSZY, żeby porządek wstawiania nie mógł
    // przypadkiem udawać porządku zapytania.
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'st-tie-z',
        aircraftId: 'SP-KWA',
        picId: 'JSE',
        dayStart: D20,
        operation: 'ferry',
        mh: 2000,
        closeAtMs: 36 * HOUR_MS, // 21 czerwca, 12:00
      }),
    );
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'st-tie-a',
        aircraftId: 'SP-KWA',
        picId: 'PWI',
        dayStart: D21,
        operation: 'ferry',
        mh: 1000,
        closeAtMs: 12 * HOUR_MS, // ten sam moment
      }),
    );

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/stats?from=2026-06-21&to=2026-06-21',
      headers: bearer(admin),
    });
    expect(res.statusCode).toBe(200);
    const kwa = (res.json() as AdminStatsReport).aircraft.find(
      (r) => r.aircraftId === 'SP-KWA',
    )!;
    // „Pierwsza" sesja remisu to `st-tie-a` (uuid rosnąco), „ostatnia" — `st-tie-z`.
    expect(kwa.mhFirstStart).toBe(1000);
    expect(kwa.mhLastEnd).toBeCloseTo(2002.2, 9);
  });

  it('zakres domyślny to ostatnie 30 dni kalendarzowych od dziś (zegar SERWERA)', async () => {
    const { stats } = await threeDays();
    const report = await stats('');

    // TestClock stoi 2026-06-22 — „dziś" rozstrzyga serwer, nie przeglądarka.
    expect(report.range).toMatchObject({
      fromDay: '2026-05-24',
      toDay: '2026-06-22',
      calendarDays: 30,
      defaulted: true,
    });
    expect(report.daily).toHaveLength(30);
    expect(report.totals.sessions).toBe(2);
  });
});

describe('A10 · strona przychodowa — zrzuty', () => {
  it('sumy wyniesień i skoczków; średnia WYŁĄCZNIE ze zrzutów z fixem', async () => {
    const { stats } = await threeDays();
    const drops = (await stats()).drops;

    expect(drops).toMatchObject({
      sessions: 1, // wyłącznie operacja `skoki` (podpis mockupu) — dzień ferry nie wchodzi
      lifts: 2,
      jumpers: 8,
      tandem: 3,
      aff: 1,
      solo: 4,
      staleRows: 0,
    });
    // Drugi zrzut nie miał wysokości: średnia = 3000 / 1, a nie 1500 / 2.
    expect(drops.avgAltitudeFt).toBe(3000);
    expect(drops.dropsWithoutAltitude).toBe(1);
    expect(drops.jumpersPerLift).toBeCloseTo(4, 9);
    expect(drops.liftsPerSession).toBeCloseTo(2, 9);
    expect(drops.jumpersPerFlightHour).toBeCloseTo(8 / (FLIGHT_MS / HOUR_MS), 9);

    expect(drops.clients).toHaveLength(1);
    expect(drops.clients[0]).toMatchObject({
      client: 'SKY CAMP',
      lifts: 2,
      jumpers: 8,
      tandem: 3,
      avgAltitudeFt: 3000,
    });
    // Licznik zrzutów Z fixem jedzie w odpowiedzi — panel nie ma prawa odtwarzać go
    // odejmowaniem `lifts − dropsWithoutAltitude`.
    expect(drops.dropsWithAltitude).toBe(1);
  });

  it('dzień z `operation IS NULL` w zakresie unieważnia sekcję zrzutów — mógł być skokowy', async () => {
    const { db, stats } = await threeDays();
    // Wiersz historyczny sprzed migracji 11: rodzaju operacji NIE ZNAMY, więc każdy
    // taki dzień MÓGŁ być dniem skokowym. Zawężenie `operation = 'skoki'` nie ma prawa
    // wyrzucić go ze zbioru nawet jako „nieznany" — sekcja pokazywałaby sumę z części
    // wierszy podaną jako całość i przeczyła banerowi o wierszach do przebudowy.
    await db.query(
      `UPDATE sessions SET operation = NULL, client = NULL WHERE session_uuid = 'st-ferry'`,
    );

    const report = await stats();
    expect(report.drops.staleRows).toBe(1);
    expect(report.drops.lifts).toBeNull();
    expect(report.drops.jumpers).toBeNull();
    expect(report.drops.avgAltitudeFt).toBeNull();
    expect(report.drops.clients).toEqual([]);
    // Dni JAWNIE skokowe są policzone — niepewny jest zakres, nie one.
    expect(report.drops.sessions).toBe(1);
  });
});

describe('A10 · `null` to „nie wiemy", nigdy zero', () => {
  it('wiersz sprzed migracji 18 unieważnia agregaty jej kolumn — z licznikiem, nie po cichu', async () => {
    const { db, stats } = await threeDays();
    // Symulacja wiersza sprzed migracji: dokładnie tak wygląda projekcja zapisana przed
    // wdrożeniem, dopóki nie przejdzie przebudowa z `A11`.
    await db.query(
      `UPDATE sessions SET takeoff_count = NULL, landing_count = NULL, mh_delta_h = NULL,
              fuel_consumed_l = NULL, drop_count = NULL, jumpers_tandem = NULL,
              jumpers_aff = NULL, jumpers_solo = NULL, drop_alt_sum_ft = NULL,
              drop_alt_count = NULL
        WHERE session_uuid = 'st-sky'`,
    );

    const report = await stats();
    // Suma po CZĘŚCI wierszy podana jako całość byłaby kłamstwem — jedzie kreska
    // i licznik wierszy do przebudowy.
    expect(report.totals.takeoffs).toBeNull();
    expect(report.totals.landings).toBeNull();
    expect(report.totals.fuelConsumedL).toBeNull();
    expect(report.totals.mhDeltaH).toBeNull();
    expect(report.totals.staleRows).toBe(1);
    // Stare kolumny (blok, lot, liczba dni) są NIETKNIĘTE migracją — zostają liczbami.
    expect(report.totals.blockMs).toBe(2 * BLOCK_MS);

    // Sekcja zrzutów pada W CAŁOŚCI: częściowa tabela klientów wyglądałaby na pełne
    // rozliczenie przychodu.
    expect(report.drops.lifts).toBeNull();
    expect(report.drops.avgAltitudeFt).toBeNull();
    expect(report.drops.clients).toEqual([]);
    expect(report.drops.staleRows).toBe(1);

    // Wiersz per samolot mówi to samo o SWOIM zakresie…
    const axa = report.aircraft.find((r) => r.reg === 'SP-AXA')!;
    expect(axa.takeoffs).toBeNull();
    expect(axa.staleRows).toBe(1);
    // …a samolot z wierszem przeliczonym trzyma liczby.
    const fgk = report.aircraft.find((r) => r.reg === 'SP-FGK')!;
    expect(fgk.takeoffs).toBe(1);
    expect(fgk.staleRows).toBe(0);
  });

  it('dzień zamknięty BEZ preflightu: bilans nieznany nie wchodzi do sumy i jest POLICZONY', async () => {
    const { app, stats } = await threeDays();
    // Claim + day_close bez `preflight_confirm` — realny stan (telefon padł w trakcie).
    // Odczytu początkowego nie ma, więc bilansów NIE DA SIĘ policzyć.
    const base = {
      sessionUuid: 'st-bare',
      aircraftId: 'SP-KWA',
      picId: 'JSE',
      dualId: null,
      schemaVersion: 1,
    };
    await ingest(app, [
      {
        ...base,
        uuid: 'st-bare-claim',
        type: 'session_claim',
        deviceTime: D21 + 7 * HOUR_MS,
        gpsTime: D21 + 7 * HOUR_MS,
        payload: { mode: 'free' },
      },
      {
        ...base,
        uuid: 'st-bare-close',
        type: 'day_close',
        deviceTime: D21 + 15 * HOUR_MS,
        gpsTime: D21 + 15 * HOUR_MS,
        payload: { finalReading: { fuelL: 40, mh: 700 }, dutyEnd: D21 + 15 * HOUR_MS },
      },
    ]);

    const report = await stats();
    expect(report.totals.sessions).toBe(3);
    // Suma paliwa dalej JEST liczbą — ale odpowiedź mówi, że jeden dzień do niej
    // nie wszedł, bo jego bilansu nie znamy.
    expect(report.totals.fuelConsumedL).toBeCloseTo(62 + 54, 9);
    expect(report.totals.fuelUnknownSessions).toBe(1);
    expect(report.totals.mhUnknownSessions).toBe(1);
    expect(report.totals.staleRows).toBe(0);
    // Dzień bez preflightu nie ma też RODZAJU OPERACJI — mógł być skokowy, więc
    // sekcja zrzutów uczciwie mówi „nie wiem", a nie „nikt nie skakał".
    expect(report.drops.staleRows).toBe(1);
    expect(report.drops.lifts).toBeNull();
  });

  it('Śr. L/h i rozjazd Δ MH liczą mianownik z TEGO SAMEGO zbioru dni co licznik', async () => {
    const { app, stats } = await threeDays();
    // Drugi dzień na SP-AXA: zamknięty, z blokiem (engine_start → engine_stop), ale BEZ
    // preflightu — bilansów paliwa i MH nie znamy, choć godziny blokowe są policzone.
    const base = {
      sessionUuid: 'st-noball',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      schemaVersion: 1,
    };
    const at = (h: number, m: number): number => D19 + h * HOUR_MS + m * MIN_MS;
    const ev = (uuid: string, type: string, time: number, payload: object = {}) => ({
      ...base,
      uuid,
      type,
      deviceTime: time,
      gpsTime: time,
      payload,
    });
    await ingest(app, [
      ev('st-nb-claim', 'session_claim', at(7, 50), { mode: 'free' }),
      ev('st-nb-start', 'engine_start', at(8, 12)),
      ev('st-nb-to', 'takeoff', at(8, 25), { method: 'auto' }),
      ev('st-nb-ldg', 'landing', at(9, 18), { method: 'auto' }),
      ev('st-nb-stop', 'engine_stop', at(10, 34)),
      ev('st-nb-close', 'day_close', at(16, 45), {
        finalReading: { fuelL: 80, mh: 1210 },
        dutyEnd: at(16, 45),
      }),
    ]);

    const report = await stats();
    const axa = report.aircraft.find((r) => r.reg === 'SP-AXA')!;
    expect(axa.sessions).toBe(2);
    expect(axa.fuelUnknownSessions).toBe(1);
    // 62 L dzielone przez blok DNI Z BILANSEM (2:22), nie przez blok obu dni (4:44) —
    // mieszany mianownik systematycznie ZANIŻAŁBY zużycie o połowę.
    expect(axa.avgLitresPerBlockHour).toBeCloseTo(62 / (BLOCK_MS / HOUR_MS), 9);

    // Rozjazd Δ MH vs blok: dzień bez pary odczytów nie wchodzi do PORÓWNANIA —
    // częściowa suma Δ minus pełne godziny blokowe pisałaby „rozjazd 2.4 h",
    // gdy naprawdę brakuje odczytów.
    expect(report.totals.mhUnknownSessions).toBe(1);
    expect(report.totals.mhBlockHours).toBeCloseTo((2 * BLOCK_MS) / HOUR_MS, 9);
    expect(report.totals.mhVsBlockH).toBeCloseTo(4.4 - (2 * BLOCK_MS) / HOUR_MS, 9);
  });
});

describe('A10 · brama i walidacja', () => {
  it('data przewinięta w kalendarzu i zakres odwrócony to 400, nie cicho inny okres', async () => {
    const { app, admin } = await threeDays();
    const get = (query: string) =>
      app.inject({ method: 'GET', url: `/admin/api/stats${query}`, headers: bearer(admin) });

    expect((await get('?from=2026-02-30&to=2026-03-01')).statusCode).toBe(400);
    const inverted = await get('?from=2026-06-22&to=2026-06-19');
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toEqual({ error: 'bad_range' });
  });

  it('zakres odwrócony JEDNOSTRONNIE — samo `from` z przyszłości — to też 400 bad_range', async () => {
    const { app, admin } = await threeDays();
    // TestClock stoi 2026-06-22: bez `to` serwer domyka zakres na końcu dzisiejszej
    // doby, więc `from` z przyszłości daje `from > to` DOPIERO po rozstrzygnięciu
    // domyślnych. 200 z `calendarDays: -8` wyglądałoby na ekranie jak awaria pobrania.
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/stats?from=2026-07-01',
      headers: bearer(admin),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_range' });
  });

  it('szef wyszkolenia CZYTA raport, pilot dostaje 403, brak tokenu 401', async () => {
    const { app } = await threeDays();

    const lead = await app.inject({
      method: 'GET',
      url: '/admin/api/stats',
      headers: bearer(await token(app, 'AKO')),
    });
    expect(lead.statusCode).toBe(200);

    const pilot = await app.inject({
      method: 'GET',
      url: '/admin/api/stats',
      headers: bearer(await token(app, 'PWI')),
    });
    expect(pilot.statusCode).toBe(403);
    expect(pilot.json()).toEqual({ error: 'forbidden', required: 'panel.access' });

    expect((await app.inject({ method: 'GET', url: '/admin/api/stats' })).statusCode).toBe(401);
  });
});
