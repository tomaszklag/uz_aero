/**
 * UZ Aero (serwer) — flota w panelu (`/admin/api/fleet*`, `A07` i `A07a`).
 *
 * Flota jest jedynym miejscem, w którym administrator przestawia WEJŚCIA REGUŁ, więc
 * ten plik pilnuje sześciu własności, których złamanie jest usterką produktu, a nie
 * kosmetyką ekranu:
 *
 *  1. **serwer podaje ROZWIĄZANĄ tolerancję** — `max(10 L, 5% pojemności)` — i robi to
 *     zarówno przy każdym samolocie, jak i dla pojemności, która jeszcze nie została
 *     zapisana; bez tego panel nie ma prawa pokazać progu, bo nie wolno mu liczyć;
 *  2. **komenda floty niczego nie przepisuje** — flaga wystawiona przed zmianą zachowuje
 *     stary próg w `details`, a rejestr zdarzeń zostaje nietknięty. Osobno przybite jest
 *     to, co z tego NIE wynika: nowy próg obejmie także pary dni historycznych przy
 *     najbliższym `POST /events`, bo detekcja liczy łańcuch z całej historii samolotu;
 *  3. **zapis podbija ETag `GET /reference`** — to JEDYNY kanał, którym konfiguracja
 *     wychodzi do telefonów; bez tego zmiana zostaje w panelu;
 *  4. **samolotu z otwartą sesją nie da się wyłączyć ze służby** — odmowa jawna,
 *     z powodem;
 *  5. **wyłączenie ze służby nie psuje historii** — dni, flagi i karty zostają;
 *  6. **szef wyszkolenia czyta flotę, ale jej nie zmienia** — 403 z podaną zdolnością.
 *
 * Zero atrap: PGlite w procesie, prawdziwe klasy, `app.inject`, dni powstają
 * z prawdziwego `POST /events`.
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_CSRF_HEADERS, TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type Body = Record<string, unknown>;

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
  aircraftId?: string;
  mh?: number;
  fuelStartL?: number;
  fuelEndL?: number;
  dayOffset?: number;
  close?: boolean;
}

/** Dzień lotny: preflight → cykl silnika → (opcjonalnie) zamknięcie z przekazaniem. */
function flyingDay(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  const mh = o.mh ?? 1200;
  const base = {
    sessionUuid: o.sessionUuid,
    picId: o.picId,
    aircraftId: o.aircraftId ?? 'SP-AXA',
    dualId: null,
  };

  const events = [
    event('session_claim', at(7, 50, d), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0, d),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        reading: { fuelL: o.fuelStartL ?? 150, mh },
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

  if (o.close !== false) {
    events.push(
      event(
        'day_close',
        at(16, 45, d),
        {
          finalReading: { fuelL: o.fuelEndL ?? 88, mh: mh + 2.2 },
        },
        base,
      ),
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
const writer = (t: string) => ({ ...bearer(t), ...ADMIN_CSRF_HEADERS });

const postEvents = (app: Harness['app'], t: string, events: unknown[]) =>
  app.inject({ method: 'POST', url: '/events', headers: bearer(t), payload: { events } });

const listFleet = (app: Harness['app'], t: string, query = '') =>
  app.inject({ method: 'GET', url: `/admin/api/fleet${query}`, headers: bearer(t) });

const tolerance = (app: Harness['app'], t: string, query: string) =>
  app.inject({ method: 'GET', url: `/admin/api/fleet/tolerance${query}`, headers: bearer(t) });

const createAircraft = (app: Harness['app'], t: string, body: Body) =>
  app.inject({ method: 'POST', url: '/admin/api/fleet', headers: writer(t), payload: body });

const patchAircraft = (app: Harness['app'], t: string, id: string, body: Body) =>
  app.inject({
    method: 'PATCH',
    url: `/admin/api/fleet/${id}`,
    headers: writer(t),
    payload: body,
  });

const reference = (app: Harness['app'], t: string, etag?: string) =>
  app.inject({
    method: 'GET',
    url: '/reference',
    headers: etag == null ? bearer(t) : { ...bearer(t), 'if-none-match': etag },
  });

const rowOf = (body: { items: { reg: string }[] }, reg: string) => {
  const row = body.items.find((i) => i.reg === reg);
  if (row == null) throw new Error(`brak wiersza ${reg} w odpowiedzi floty`);
  return row as Record<string, never> & { reg: string };
};

// ── odczyt listy ────────────────────────────────────────────────────────────────

describe('GET /admin/api/fleet — konfiguracja + stan z telefonów', () => {
  it('każdy wiersz niesie ROZWIĄZANĄ tolerancję `FUEL_MISMATCH`, nie samą pojemność', async () => {
    // To jest własność, dla której ta trasa w ogóle ma taki kształt: panel nie może
    // policzyć `max(10 L, 5%)`, bo z domeny wolno mu importować wyłącznie typy.
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    const res = await listFleet(app, tmk);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // 330 L → 5% = 16.5 L, czyli powyżej progu 10 L.
    expect(rowOf(body, 'SP-AXA')).toMatchObject({ capacityL: 330, fuelToleranceL: 16.5 });
    // 1700 L → 85 L.
    expect(rowOf(body, 'SP-ANK')).toMatchObject({ capacityL: 1700, fuelToleranceL: 85 });
    // 200 L → 5% = 10 L, czyli dokładnie próg — tolerancja nie schodzi niżej.
    expect(rowOf(body, 'SP-KWA')).toMatchObject({ capacityL: 200, fuelToleranceL: 10 });
  });

  it('kolumny stanu mają TRZY stany świeżości — nigdy zera za brak', async () => {
    const harness = await testHarness();
    const { app } = harness;
    const tmk = await token(app, 'TMK');
    const krz = await token(app, 'KRZ');

    // SP-AXA: dzień ZAMKNIĘTY → jest przekazanie, nie ma claimu.
    await postEvents(app, tmk, flyingDay({ sessionUuid: 'fleet-closed', picId: 'TMK' }));
    // SP-FGK: dzień OTWARTY → jest claim; przekazania nie ma, bo nie ma zamkniętego dnia.
    await postEvents(
      app,
      krz,
      flyingDay({
        sessionUuid: 'fleet-open',
        picId: 'KRZ',
        aircraftId: 'SP-FGK',
        close: false,
        dayOffset: 1,
      }),
    );

    const body = (await listFleet(app, tmk)).json();

    const axa = rowOf(body, 'SP-AXA') as unknown as Record<string, unknown>;
    expect(axa.claim).toBeNull();
    expect(axa.reading).toMatchObject({ fuelL: 88, source: 'handover', byPilotName: 'Tomasz Małkiewicz' });
    expect(typeof axa.lastEventAt).toBe('string');

    const fgk = rowOf(body, 'SP-FGK') as unknown as Record<string, unknown>;
    expect(fgk.claim).toMatchObject({ picId: 'KRZ', picCode: 'KRZ', sessionUuid: 'fleet-open' });
    // Odczytu NIE MA — i to jest trzeci stan („brak danych"), a nie zero.
    expect(fgk.reading).toBeNull();
    expect(typeof fgk.lastEventAt).toBe('string');

    // SP-ANK nie dostał ani jednego zdarzenia: wszystkie trzy pola są `null`.
    const ank = rowOf(body, 'SP-ANK') as unknown as Record<string, unknown>;
    expect(ank.claim).toBeNull();
    expect(ank.reading).toBeNull();
    expect(ank.lastEventAt).toBeNull();
    expect(ank.openSessions).toBe(0);
  });

  it('liczniki kafli opisują CAŁĄ flotę, a filtr zawęża wyłącznie listę', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    const krz = await token(app, 'KRZ');
    await postEvents(
      app,
      krz,
      flyingDay({ sessionUuid: 'fleet-claimed', picId: 'KRZ', aircraftId: 'SP-FGK', close: false }),
    );

    const all = (await listFleet(app, tmk)).json();
    expect(all.counts).toEqual({ total: 4, active: 3, disabled: 1, claimed: 1 });
    // Wyłączone na końcu listy — porządek jest częścią kontraktu portu.
    expect(all.items.map((i: { reg: string }) => i.reg)).toEqual([
      'SP-ANK',
      'SP-AXA',
      'SP-FGK',
      'SP-KWA',
    ]);

    // Bez wyszukiwania chipy zgadzają się z kaflami.
    expect(all.scopes).toEqual(all.counts);

    const narrowed = (await listFleet(app, tmk, '?status=disabled')).json();
    expect(narrowed.items.map((i: { reg: string }) => i.reg)).toEqual(['SP-KWA']);
    // Kafle się NIE ruszyły — opisują flotę, nie zawężenie. Chip też nie: zawęża go
    // WYŁĄCZNIE wyszukiwanie, żeby cztery liczby zostały porównywalne między sobą.
    expect(narrowed.counts).toEqual({ total: 4, active: 3, disabled: 1, claimed: 1 });
    expect(narrowed.scopes).toEqual({ total: 4, active: 3, disabled: 1, claimed: 1 });

    const searched = (await listFleet(app, tmk, '?q=antonov')).json();
    expect(searched.items.map((i: { reg: string }) => i.reg)).toEqual(['SP-ANK']);
    // Kafle mówią o flocie…
    expect(searched.counts).toEqual({ total: 4, active: 3, disabled: 1, claimed: 1 });
    // …a chipy o tym, co zobaczy człowiek po kliknięciu przy tej frazie.
    expect(searched.scopes).toEqual({ total: 1, active: 1, disabled: 0, claimed: 0 });

    // Chip „Z claimem" filtruje po stronie SERWERA — liczba na chipie i skład listy
    // pod nim muszą mieć jedną definicję, a nie dwie (SQL kafla vs `.filter()` panelu).
    const claimed = (await listFleet(app, tmk, '?claimed=true')).json();
    expect(claimed.items.map((i: { reg: string }) => i.reg)).toEqual(['SP-FGK']);
    const free = (await listFleet(app, tmk, '?claimed=false')).json();
    expect(free.items.map((i: { reg: string }) => i.reg)).not.toContain('SP-FGK');
  });

  it('chip „Wyłączone" i lista pod nim mają JEDNĄ definicję — także dla stanu spoza katalogu', async () => {
    // Chip z liczbą jest obietnicą „tyle wierszy zobaczysz po kliknięciu". Do 2026-08-01
    // kafel i chip liczyły `service_status <> 'active'`, a lista filtrowała przez
    // `= 'disabled'` — więc wiersz ze stanem spoza katalogu wchodził do liczby i nie
    // wchodził do listy. Przez HTTP jest to nieosiągalne (zod ma enum), ale wartość
    // w bazie bierze się też z migracji, seeda i psql; a `toServiceStatus` w adapterze
    // PREZENTUJE taki wiersz jako „Wyłączony", bo domyślenie się `active` z literówki
    // wpuściłoby na listę wyboru samolot, którego ktoś świadomie z niej zdejmował.
    // To ta sama usterka, co przy chipach na `A06`.
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    await db.query(
      `INSERT INTO aircraft (id, reg, type, year, capacity_l, mh_format, dual_required, service_status)
       VALUES ('ac-dziwny', 'SP-ZLE', 'Cessna 152', 1998, 120, 'decimal', false, 'w_remoncie')`,
    );

    const body = (await listFleet(app, tmk)).json();
    // Prezentacja: wiersz jest w tabeli i jest opisany jako wyłączony.
    expect(rowOf(body, 'SP-ZLE')).toMatchObject({ serviceStatus: 'disabled' });

    const narrowed = (await listFleet(app, tmk, '?status=disabled')).json();
    // Liczba na chipie == liczba wierszy, które chip pokazuje. To jest cała reguła.
    expect(narrowed.items).toHaveLength(body.counts.disabled);
    expect(narrowed.items.map((i: { reg: string }) => i.reg).sort()).toEqual(['SP-KWA', 'SP-ZLE']);

    // …a suma dwóch stanów nadal zgadza się z całością floty.
    expect(body.counts.active + body.counts.disabled).toBe(body.counts.total);
    const active = (await listFleet(app, tmk, '?status=active')).json();
    expect(active.items).toHaveLength(body.counts.active);
    expect(active.items.map((i: { reg: string }) => i.reg)).not.toContain('SP-ZLE');
  });
});

// ── rozwiązana tolerancja dla wartości spoza bazy ───────────────────────────────

describe('GET /admin/api/fleet/tolerance — próg dla pojemności i dla samolotu', () => {
  it('liczy próg dla pojemności, której jeszcze nie ma w bazie (karta „Skutki zmiany")', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    expect((await tolerance(app, tmk, '?capacityL=1257')).json()).toEqual({
      capacityL: 1257,
      fuelToleranceL: 62.85,
    });
    expect((await tolerance(app, tmk, '?capacityL=1100')).json()).toEqual({
      capacityL: 1100,
      fuelToleranceL: 55,
    });
    // Poniżej progu 10 L tolerancja NIE schodzi — to jest cała treść słowa „lub" w §4.5.
    expect((await tolerance(app, tmk, '?capacityL=118')).json()).toEqual({
      capacityL: 118,
      fuelToleranceL: 10,
    });
  });

  it('odpowiada też po `aircraftId` — to odblokowuje A02a/A02b, gdzie panel zna samolot, a nie pojemność', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    expect((await tolerance(app, tmk, '?aircraftId=SP-ANK')).json()).toEqual({
      capacityL: 1700,
      fuelToleranceL: 85,
    });
    // Samolot spoza rejestru = brak odpowiedzi, a nie próg z podłogi.
    expect((await tolerance(app, tmk, '?aircraftId=SP-NIEMA')).statusCode).toBe(404);
  });

  it('odmawia DOKŁADNIE tym samym, czym odmawia zapis — jedna definicja dopuszczalnej pojemności', async () => {
    // Do 2026-08-01 ta trasa odpowiadała progiem na `0`, `-500`, pusty parametr
    // i `1e300`, mimo że zapis tych samych wartości kończył się `409
    // capacity_not_positive` albo `400`. Dwie trasy jednego zasobu miały dwie definicje
    // pojemności, więc karta „Skutki zmiany" potrafiła pokazać wiarygodny próg dla
    // liczby, której serwer nigdy by nie zapisał. Jedyną obroną był warunek w
    // `admin/src/queries/useFleet.ts` — czyli reguła siedziała w panelu, dokładnie tam,
    // gdzie ten przekrój deklaruje, że jej nie ma.
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    for (const query of ['?capacityL=0', '?capacityL=-500', '?capacityL=']) {
      const res = await tolerance(app, tmk, query);
      expect([query, res.statusCode]).toEqual([query, 409]);
      expect(res.json()).toEqual({ error: 'refused', reason: 'capacity_not_positive' });
    }

    // Poza zakresem kolumny to kształt żądania, nie reguła — tak samo jak przy zapisie.
    expect((await tolerance(app, tmk, '?capacityL=1e300')).statusCode).toBe(400);
    expect((await tolerance(app, tmk, '?capacityL=abc')).statusCode).toBe(400);

    // Kontrola w drugą stronę: te same wartości odbijają się od ZAPISU tak samo.
    const zero = await createAircraft(app, tmk, {
      reg: 'SP-ZRO',
      type: 'Cessna 152',
      capacityL: 0,
      mhFormat: 'decimal',
    });
    expect(zero.statusCode).toBe(409);
    expect(zero.json()).toEqual({ error: 'refused', reason: 'capacity_not_positive' });
  });

  it('BRAK obu parametrów to nadal poprawne pytanie — „pojemność nieznana", próg z podłogi', async () => {
    // `capacityL: null` znaczy „zapytanie nie podało pojemności", a NIE „samolot bez
    // skonfigurowanej pojemności": takiego wiersza nie ma, bo `aircraft.capacity_l` jest
    // `NOT NULL`, a zapis ≤ 0 kończy się odmową. Kontrakt mówił do 2026-08-01 to drugie.
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    expect((await tolerance(app, tmk, '')).json()).toEqual({ capacityL: null, fuelToleranceL: 10 });
  });
});

// ── zapis konfiguracji ──────────────────────────────────────────────────────────

describe('POST /admin/api/fleet — dodanie jednostki', () => {
  it('zakłada samolot, oddaje pełny wiersz listy i zapisuje próg w dzienniku audytu', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    const res = await createAircraft(app, tmk, {
      reg: 'sp-klm',
      type: 'Cessna 208 Caravan',
      year: 2011,
      capacityL: 1257,
      mhFormat: 'decimal',
      dualRequired: true,
    });

    expect(res.statusCode).toBe(201);
    const aircraft = res.json().aircraft;
    // Rejestracja znormalizowana do WERSALIKÓW — indeks `UNIQUE` jest wrażliwy na
    // wielkość, więc bez tego „sp-klm" założyłoby drugi wiersz tej samej maszyny.
    expect(aircraft).toMatchObject({
      reg: 'SP-KLM',
      capacityL: 1257,
      fuelToleranceL: 62.85,
      mhFormat: 'decimal',
      dualRequired: true,
      serviceStatus: 'active',
      openFlags: 0,
      openSessions: 0,
      claim: null,
      reading: null,
      lastEventAt: null,
    });
    // Identyfikator NIE jest rejestracją: zdarzenia wiążą się z `aircraft_id`, więc
    // przemalowanie znaków na kadłubie nie może oderwać samolotu od jego nalotu.
    expect(aircraft.id).not.toBe('SP-KLM');

    const audit = await db.query<{ action: string; target_id: string; details: Body }>(
      "SELECT action, target_id, details FROM admin_audit WHERE action = 'aircraft.create'",
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.target_id).toBe(aircraft.id);
    expect(audit.rows[0]!.details).toMatchObject({ reg: 'SP-KLM', fuelToleranceL: 62.85 });
  });

  it('zajęta rejestracja → 409 z NAZWĄ POLA, bez drugiego wiersza w bazie', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    const res = await createAircraft(app, tmk, {
      reg: 'SP-AXA',
      type: 'Cessna 182',
      capacityL: 330,
      mhFormat: 'hhmm',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'conflict', field: 'reg' });
    const count = await db.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM aircraft WHERE reg = 'SP-AXA'",
    );
    expect(Number(count.rows[0]!.n)).toBe(1);
  });

  it('pojemność ≤ 0 → 409 z POWODEM, a nie ciche 400 „popraw formularz"', async () => {
    // Zero w tej kolumnie nie jest stanem świata: `fuelToleranceL(0)` cofa się do progu
    // 10 L, więc samolot dostałby po cichu tolerancję z podłogi, a inwariant „stan po
    // tankowaniu ≤ pojemność" przestałby cokolwiek znaczyć.
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    const res = await createAircraft(app, tmk, {
      reg: 'SP-ZER',
      type: 'Cessna 152',
      capacityL: 0,
      mhFormat: 'decimal',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'refused', reason: 'capacity_not_positive' });
    const rows = await db.query("SELECT id FROM aircraft WHERE reg = 'SP-ZER'");
    expect(rows.rows).toHaveLength(0);
    // Odmowa NIE zostawia wpisu w dzienniku — wyjątek wycofuje całą transakcję.
    const audit = await db.query("SELECT id FROM admin_audit WHERE action = 'aircraft.create'");
    expect(audit.rows).toHaveLength(0);
  });
});

describe('PATCH /admin/api/fleet/:id — zmiana konfiguracji', () => {
  it('zmiana pojemności PRZESUWA próg flagi i wypisuje skutek w dzienniku', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    const before = rowOf((await listFleet(app, tmk)).json(), 'SP-ANK') as unknown as {
      id: string;
      fuelToleranceL: number;
    };
    expect(before.fuelToleranceL).toBe(85);

    const res = await patchAircraft(app, tmk, before.id, { capacityL: 1100 });
    expect(res.statusCode).toBe(200);
    expect(res.json().aircraft).toMatchObject({ capacityL: 1100, fuelToleranceL: 55 });

    // Lista mówi to samo co odpowiedź mutacji — jedno źródło liczby.
    const after = rowOf((await listFleet(app, tmk)).json(), 'SP-ANK') as unknown as {
      fuelToleranceL: number;
    };
    expect(after.fuelToleranceL).toBe(55);

    const audit = await db.query<{ action: string; details: Body }>(
      'SELECT action, details FROM admin_audit ORDER BY id DESC LIMIT 1',
    );
    expect(audit.rows[0]!.action).toBe('aircraft.update');
    expect(audit.rows[0]!.details).toMatchObject({
      reg: 'SP-ANK',
      changes: { capacityL: { from: 1700, to: 1100 } },
      fuelToleranceL: { from: 85, to: 55 },
    });
  });

  it('PATCH bez faktycznej zmiany → 400 `no_changes`, bez wpisu o niczym', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');
    const axa = rowOf((await listFleet(app, tmk)).json(), 'SP-AXA') as unknown as { id: string };

    const res = await patchAircraft(app, tmk, axa.id, { capacityL: 330, mhFormat: 'hhmm' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no_changes' });

    const audit = await db.query("SELECT id FROM admin_audit WHERE action LIKE 'aircraft.%'");
    expect(audit.rows).toHaveLength(0);
  });

  it('nieznana jednostka → 404, a nie 500 ani ciche 200', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    const res = await patchAircraft(app, tmk, 'nie-ma-takiego', { capacityL: 200 });
    expect(res.statusCode).toBe(404);
  });
});

// ── co komenda robi, a czego z tego NIE wynika ──────────────────────────────────

describe('komenda floty niczego nie przepisuje', () => {
  it('flaga wystawiona przed zmianą zachowuje STARY próg, a rejestr zostaje nietknięty', async () => {
    // Scenariusz z mockupu A07a, przybity na danych: dwa dni SP-AXA z rozjazdem paliwa
    // 62 L przy tolerancji 16.5 L → flaga `fuel_mismatch` z `toleranceL: 16.5`.
    // Po zmianie pojemności na 118 L (tolerancja 10 L) ta flaga MA ZOSTAĆ taka, jaka
    // była: rejestr jest append-only, a panel go nie przepisuje.
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    await postEvents(
      app,
      tmk,
      flyingDay({ sessionUuid: 'back-1', picId: 'TMK', mh: 1200, fuelEndL: 88 }),
    );
    await postEvents(
      app,
      tmk,
      flyingDay({
        sessionUuid: 'back-2',
        picId: 'TMK',
        dayOffset: 1,
        mh: 1202.2,
        fuelStartL: 150,
      }),
    );

    const flagBefore = await db.query<{ id: number; details: Body; created_at: Date }>(
      "SELECT id, details, created_at FROM flags WHERE type = 'fuel_mismatch'",
    );
    expect(flagBefore.rows).toHaveLength(1);
    expect(flagBefore.rows[0]!.details).toMatchObject({ toleranceL: 16.5 });

    const eventsBefore = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');

    const axa = rowOf((await listFleet(app, tmk)).json(), 'SP-AXA') as unknown as {
      id: string;
      openFlags: number;
    };
    expect(axa.openFlags).toBe(1);

    expect((await patchAircraft(app, tmk, axa.id, { capacityL: 118 })).statusCode).toBe(200);

    const flagAfter = await db.query<{ id: number; details: Body; created_at: Date }>(
      "SELECT id, details, created_at FROM flags WHERE type = 'fuel_mismatch'",
    );
    expect(flagAfter.rows).toHaveLength(1);
    // Ten SAM wiersz, ten SAM próg, ten SAM czas wykrycia.
    expect(flagAfter.rows[0]!.id).toBe(flagBefore.rows[0]!.id);
    expect(flagAfter.rows[0]!.details).toEqual(flagBefore.rows[0]!.details);
    expect(flagAfter.rows[0]!.created_at).toEqual(flagBefore.rows[0]!.created_at);

    // Rejestr zdarzeń bez zmian — ani jednego dopisanego, ani jednego skasowanego.
    const eventsAfter = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM events');
    expect(eventsAfter.rows[0]!.n).toBe(eventsBefore.rows[0]!.n);

    // Liczba otwartych flag na wierszu floty się nie zmieniła — karta „Skutki zmiany"
    // pokazuje ją właśnie po to, żeby powiedzieć, ilu spraw zmiana NIE dotyka.
    const after = rowOf((await listFleet(app, tmk)).json(), 'SP-AXA') as unknown as {
      openFlags: number;
      fuelToleranceL: number;
    };
    expect(after.openFlags).toBe(1);
    // …a próg dla kolejnych przeliczeń już jest nowy.
    expect(after.fuelToleranceL).toBe(10);
  });

  it('ale NOWY próg obejmuje też pary historyczne: najbliższy `POST /events` flaguje parę starych, zamkniętych dni', async () => {
    // ══ TO JEST WŁASNOŚĆ, KTÓRA ZASKAKIWAŁA ══
    // Komenda floty faktycznie niczego nie przepisuje (test wyżej). Nie znaczy to
    // jednak, że „zmiana nie działa wstecz": `IngestCommands` po KAŻDEJ przyjętej
    // paczce liczy `chainFlags` na CAŁEJ historii sesji samolotu, z pojemnością
    // BIEŻĄCĄ. Obniżenie pojemności przesuwa więc próg także dla par dni zamkniętych
    // PRZED zmianą — i wychodzi to przy pierwszej synchronizacji tej jednostki,
    // czyli w chwili, w której nikt się tego nie spodziewa.
    //
    // Zachowanie zostaje (zmiana momentu powstawania flag wymaga ścieżki
    // kalibracyjnej), więc test jest dowodem, a nie postulatem: teksty `A07a`
    // i szuflady panelu mówią dokładnie to, co robi ten przypadek.
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    const ankDays = (o: Omit<DayOptions, 'aircraftId'>) =>
      flyingDay({ ...o, aircraftId: 'SP-ANK' });

    // Dwa dni SP-ANK z rozjazdem paliwa 62 L. Pojemność 1700 L → tolerancja 85 L,
    // więc przy STARYM progu ta para jest czysta.
    await postEvents(app, tmk, ankDays({ sessionUuid: 'hist-a', picId: 'TMK', mh: 1200, fuelEndL: 88 }));
    await postEvents(
      app,
      tmk,
      ankDays({ sessionUuid: 'hist-b', picId: 'TMK', dayOffset: 1, mh: 1202.2, fuelStartL: 150, fuelEndL: 88 }),
    );

    const flagsOf = async () =>
      (
        await db.query<{ session_uuids: string[]; details: Body }>(
          "SELECT session_uuids, details FROM flags WHERE type = 'fuel_mismatch' AND aircraft_id = 'SP-ANK'",
        )
      ).rows;

    expect(await flagsOf()).toHaveLength(0);

    // Pojemność w dół: 1700 → 200 L, czyli tolerancja 85 → 10 L.
    const ank = rowOf((await listFleet(app, tmk)).json(), 'SP-ANK') as unknown as { id: string };
    expect((await patchAircraft(app, tmk, ank.id, { capacityL: 200 })).statusCode).toBe(200);

    // Sam PATCH nadal niczego nie wystawia — komenda nie ma pętli po `flags`.
    expect(await flagsOf()).toHaveLength(0);

    // …a teraz przychodzi ZWYCZAJNA paczka trzeciego dnia, spięta z poprzednim bez
    // żadnego rozjazdu (paliwo 88 → 88, licznik ciągły). Jedyne, co się zmieniło,
    // to próg — i to on wystawia flagę na parze `hist-a` / `hist-b`.
    await postEvents(
      app,
      tmk,
      ankDays({ sessionUuid: 'hist-c', picId: 'TMK', dayOffset: 2, mh: 1204.4, fuelStartL: 88, fuelEndL: 88 }),
    );

    const raised = await flagsOf();
    expect(raised).toHaveLength(1);
    // Para DNI ZAMKNIĘTYCH przed zmianą pojemności — nie ta, którą właśnie przysłano.
    expect(raised[0]!.session_uuids).toEqual(['hist-a', 'hist-b']);
    // Próg zapisany w fladze to NOWY próg, mimo że oba dni domknięto przy starym.
    expect(raised[0]!.details).toMatchObject({ toleranceL: 10, diffL: 62 });

    // Asymetria: powrót do 1700 L NIE zdejmuje flagi, która przy tym progu by nie
    // powstała — `ensureOpen` tylko dokłada. Zmiana działa wstecz WYŁĄCZNIE w stronę
    // produkującą pracę i ekran ma o tym mówić wprost.
    expect((await patchAircraft(app, tmk, ank.id, { capacityL: 1700 })).statusCode).toBe(200);
    await postEvents(
      app,
      tmk,
      ankDays({ sessionUuid: 'hist-d', picId: 'TMK', dayOffset: 3, mh: 1206.6, fuelStartL: 88, fuelEndL: 88 }),
    );
    expect(await flagsOf()).toHaveLength(1);
  });
});

// ── kanał do telefonów ──────────────────────────────────────────────────────────

describe('zapis dociera do telefonów — ETag `GET /reference`', () => {
  it('zmiana konfiguracji PODBIJA znacznik i unieważnia 304', async () => {
    // To jest JEDYNY kanał, którym konfiguracja wychodzi z panelu. Zapis, który nie
    // rusza `aircraft.updated_at`, zostaje w bazie panelu i żaden telefon go nie
    // zobaczy — dostanie 304 i będzie pracował na starej pojemności.
    const harness = await testHarness();
    const { app } = harness;
    const tmk = await token(app, 'TMK');

    const first = await reference(app, tmk);
    expect(first.statusCode).toBe(200);
    const etag = first.headers.etag as string;

    // Kontrola: bez zmiany ten sam znacznik daje 304.
    expect((await reference(app, tmk, etag)).statusCode).toBe(304);

    const ank = rowOf((await listFleet(app, tmk)).json(), 'SP-ANK') as unknown as { id: string };
    expect((await patchAircraft(app, tmk, ank.id, { capacityL: 1100 })).statusCode).toBe(200);

    const stale = await reference(app, tmk, etag);
    expect(stale.statusCode).toBe(200);
    expect(stale.headers.etag).not.toBe(etag);

    const aircraft = (stale.json().aircraft as { reg: string; capacityL: number }[]).find(
      (a) => a.reg === 'SP-ANK',
    );
    expect(aircraft?.capacityL).toBe(1100);
  });

  it('samolot WYŁĄCZONY nadal jedzie w `/reference` — filtruje go aplikacja, nie serwer', async () => {
    // Sprostowanie mockupu A07: „przestaje wychodzić w GET /reference" nie jest tym,
    // co robi serwer. Migawka niesie WSZYSTKIE jednostki razem z `serviceStatus`, bo
    // rekord, który zniknie z odpowiedzi, zostaje w cache telefonu na zawsze
    // (`app/src/application/sync/referenceSync.ts` mówi to wprost). Wybór blokuje
    // aplikacja — `preflightDraft.ts` odrzuca `serviceStatus === 'disabled'`.
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');

    const body = (await reference(app, tmk)).json();
    const kwa = (body.aircraft as { reg: string; serviceStatus: string }[]).find(
      (a) => a.reg === 'SP-KWA',
    );
    expect(kwa).toMatchObject({ serviceStatus: 'disabled' });
  });
});

// ── wyłączenie ze służby ────────────────────────────────────────────────────────

describe('wyłączenie ze służby', () => {
  it('samolot z OTWARTĄ sesją → 409 `open_session`, konfiguracja bez zmian', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');
    const krz = await token(app, 'KRZ');

    await postEvents(
      app,
      krz,
      flyingDay({ sessionUuid: 'still-open', picId: 'KRZ', aircraftId: 'SP-FGK', close: false }),
    );

    const fgk = rowOf((await listFleet(app, tmk)).json(), 'SP-FGK') as unknown as {
      id: string;
      openSessions: number;
    };
    expect(fgk.openSessions).toBe(1);

    const res = await patchAircraft(app, tmk, fgk.id, { serviceStatus: 'disabled' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'refused', reason: 'open_session' });

    const row = await db.query<{ service_status: string }>(
      'SELECT service_status FROM aircraft WHERE id = $1',
      [fgk.id],
    );
    expect(row.rows[0]!.service_status).toBe('active');
  });

  it('po zamknięciu dnia wyłączenie przechodzi i ma WŁASNY kod w dzienniku', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const tmk = await token(app, 'TMK');

    await postEvents(app, tmk, flyingDay({ sessionUuid: 'closed-day', picId: 'TMK' }));
    const axa = rowOf((await listFleet(app, tmk)).json(), 'SP-AXA') as unknown as { id: string };

    const res = await patchAircraft(app, tmk, axa.id, { serviceStatus: 'disabled' });
    expect(res.statusCode).toBe(200);

    const audit = await db.query<{ action: string; details: Body }>(
      'SELECT action, details FROM admin_audit ORDER BY id DESC LIMIT 1',
    );
    // `aircraft.disable`, a nie `aircraft.update`: odebranie jednostki z listy wyboru
    // jest zdarzeniem, którego szuka się w dzienniku po nazwie.
    expect(audit.rows[0]!.action).toBe('aircraft.disable');

    // Powrót do służby wraca jako zwykła aktualizacja — katalog nie ma
    // `aircraft.enable` i to jest jego świadoma treść.
    expect((await patchAircraft(app, tmk, axa.id, { serviceStatus: 'active' })).statusCode).toBe(200);
    const back = await db.query<{ action: string }>(
      'SELECT action FROM admin_audit ORDER BY id DESC LIMIT 1',
    );
    expect(back.rows[0]!.action).toBe('aircraft.update');
  });

  it('wyłączenie NIE unieważnia historii — dni, flagi i karty zostają', async () => {
    const harness = await testHarness();
    const { app } = harness;
    const tmk = await token(app, 'TMK');

    await postEvents(
      app,
      tmk,
      flyingDay({ sessionUuid: 'hist-1', picId: 'TMK', mh: 1200, fuelEndL: 88 }),
    );
    await postEvents(
      app,
      tmk,
      flyingDay({
        sessionUuid: 'hist-2',
        picId: 'TMK',
        dayOffset: 1,
        mh: 1202.2,
        fuelStartL: 150,
      }),
    );

    const axa = rowOf((await listFleet(app, tmk)).json(), 'SP-AXA') as unknown as { id: string };
    expect((await patchAircraft(app, tmk, axa.id, { serviceStatus: 'disabled' })).statusCode).toBe(200);

    const days = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions?aircraftId=SP-AXA',
      headers: bearer(tmk),
    });
    expect(days.json().items.map((d: { sessionUuid: string }) => d.sessionUuid).sort()).toEqual([
      'hist-1',
      'hist-2',
    ]);

    const flags = await app.inject({
      method: 'GET',
      url: '/admin/api/flags?aircraftId=SP-AXA',
      headers: bearer(tmk),
    });
    expect(flags.json().total).toBeGreaterThan(0);

    // Karta arkusza dnia też zostaje — wyłączenie to zmiana konfiguracji, nie kasowanie.
    const sheet = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions/hist-1',
      headers: bearer(tmk),
    });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().session.reg).toBe('SP-AXA');
  });
});

// ── zakres uprawnień ────────────────────────────────────────────────────────────

describe('zakres uprawnień floty', () => {
  it('szef wyszkolenia CZYTA flotę, ale jej nie zmienia — 403 z podaną zdolnością', async () => {
    const { app } = await testHarness();
    // AKO = `training_lead` z seeda.
    const ako = await token(app, 'AKO');

    expect((await listFleet(app, ako)).statusCode).toBe(200);
    expect((await tolerance(app, ako, '?capacityL=1100')).statusCode).toBe(200);

    const created = await createAircraft(app, ako, {
      reg: 'SP-NEW',
      type: 'Cessna 152',
      capacityL: 100,
      mhFormat: 'decimal',
    });
    expect(created.statusCode).toBe(403);
    expect(created.json()).toMatchObject({ required: 'fleet.manage' });

    const tmk = await token(app, 'TMK');
    const axa = rowOf((await listFleet(app, tmk)).json(), 'SP-AXA') as unknown as { id: string };
    const patched = await patchAircraft(app, ako, axa.id, { capacityL: 400 });
    expect(patched.statusCode).toBe(403);
    expect(patched.json()).toMatchObject({ required: 'fleet.manage' });
  });

  it('pilot bez wejścia do panelu nie widzi nawet listy — 403 `panel.access`', async () => {
    const { app } = await testHarness();
    const pwi = await token(app, 'PWI');
    const res = await listFleet(app, pwi);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ required: 'panel.access' });
  });

  it('mutacja bez nagłówka CSRF nie przechodzi', async () => {
    const { app } = await testHarness();
    const tmk = await token(app, 'TMK');
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/fleet',
      headers: bearer(tmk),
      payload: { reg: 'SP-CSR', type: 'Cessna 152', capacityL: 100, mhFormat: 'decimal' },
    });
    expect(res.statusCode).toBe(403);
  });
});
