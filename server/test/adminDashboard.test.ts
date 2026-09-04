/**
 * UZ Aero (serwer) - PULPIT (`GET /admin/api/dashboard`, mockupy `A01` i `A01a`).
 *
 * Pulpit jest jedynym ekranem panelu z gwarantowaną publicznością - każdy zalogowany
 * ląduje tu pierwszy. Dlatego ten plik pilnuje pięciu własności, których złamanie
 * podważa nie tylko pulpit, ale i ekrany, do których prowadzi:
 *
 *  1. **stan silnika jest PRAWDZIWY, nie zastępczy** - „W locie" wynika z projekcji
 *     strumienia otwartej sesji, a jednostka bez otwartej sesji dostaje `engine: null`,
 *     nigdy zgadywanego `false`;
 *  2. **kafle nie mają własnych definicji** - każda liczba zgadza się CO DO ZNAKU
 *     z trasą ekranu docelowego. Rozjazd „pulpit mówi 7 flag, skrzynka pokazuje 6"
 *     jest gorszy niż brak kafla, bo podważa oba ekrany;
 *  3. **kolejka „wymaga uwagi" stawia zadania, a nie opisuje stan** - dzień otwarty
 *     od godziny to normalna praca, dzień otwarty od wczoraj to zadanie;
 *  4. **cisza jest POPRAWNĄ odpowiedzią, nie awarią** - pusty klub dostaje komplet
 *     zer i pustych list, a nie 500 ani brakujących pól;
 *  5. **401 ≠ 403**, a `panel.access` wystarcza - pulpit nie żąda niczego ponadto.
 *
 * ══ DLACZEGO PRZESTAWIAMY ZEGAR TESTU ══
 * `events.received_at` nadaje BAZA (`DEFAULT now()`), a pulpit mierzy okno napływu
 * i granice doby zegarem APLIKACJI (`Clock`). W produkcji to jeden czas ścienny -
 * `Clock` composition rootu to `{ now: () => new Date() }`. W teście `TestClock` jest
 * ZAMROŻONY i stoi domyślnie w czerwcu 2026, więc bez zsynchronizowania histogram
 * ostatnich 12 h byłby pusty Z ZAŁOŻENIA i test niczego by nie sprawdzał - a co gorsza,
 * wyglądałby na przechodzący.
 *
 * Dlatego `dashboard()` przestawia zegar na „teraz + sekunda" tuż przed każdym
 * żądaniem: zamrożony zegar, który został z chwili SPRZED przyjęcia paczki, wypychałby
 * właśnie przyjęte zdarzenia poza górną granicę okna (`received_at < toMs`).
 * Dzień lotny budujemy od północy dzisiejszej doby UTC, a nie od „teraz minus
 * godzina", żeby uruchomienie testu tuż po północy nie przerzucało go na wczoraj.
 */

import { describe, expect, it } from 'vitest';

import type { Queryable } from '../src/application/common/ports.ts';
import { PgAdminDashboardRepo } from '../src/infrastructure/pg/admin/dashboardRepo.ts';
import { testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Północ UTC doby, w której leży `ms`. */
const startOfUtcDay = (ms: number): number => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * Harness z zegarem zsynchronizowanym z bazą (patrz nagłówek pliku).
 *
 * `dashboard()` mieszka tutaj, a nie obok reszty pomocników, bo musi mieć dostęp do
 * zegara: przestawienie go jest częścią wołania, a nie osobnym krokiem, o którym
 * następny test mógłby zapomnieć.
 */
async function harnessNow() {
  const harness = await testHarness();
  const sync = (): void => harness.clock.advance(Date.now() + 1000 - harness.clock.now().getTime());
  sync();
  const dayStart = startOfUtcDay(harness.clock.now().getTime());

  const dashboard = (t: string) => {
    sync();
    return harness.app.inject({
      method: 'GET',
      url: '/admin/api/dashboard',
      headers: { authorization: `Bearer ${t}` },
    });
  };

  return { ...harness, dayStart, dashboard };
}

/**
 * Numer w uuid-zie jest ZERAMI WYPEŁNIONY, bo porządek karty „Ostatnio przyjęte" to
 * `(received_at DESC, uuid DESC)`, a cała paczka wstawiona jedną transakcją ma
 * IDENTYCZNY `received_at`. Bez wypełnienia `dash-10-…` byłoby leksykograficznie
 * mniejsze od `dash-9-…` i porządek wewnątrz paczki przestawałby odpowiadać kolejności
 * wysyłki - czyli test sprawdzałby coś innego, niż głosi jego nazwa.
 */
/**
 * Nagłówek zdarzenia. TYPOWANY, a nie `Record<string, unknown>`: `picId` jest kluczem
 * wysyłki (single-writer), więc pomocnik `ingest` musi go widzieć w typie - inaczej
 * literówka w nagłówku wychodzi dopiero jako 403 w czasie działania.
 */
interface EventBase {
  sessionUuid: string;
  picId: string;
  aircraftId: string;
  dualId: string | null;
}

let seq = 0;
function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: EventBase,
) {
  seq += 1;
  return {
    uuid: `dash-${String(seq).padStart(4, '0')}-${type}`,
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
  aircraftId: string;
  dayStart: number;
  mh?: number;
  /** Do którego zdarzenia dzień dochodzi - dalej strumień się urywa. */
  until: 'preflight' | 'engine_start' | 'takeoff' | 'landing' | 'engine_stop' | 'day_close';
}

/**
 * Dzień lotny urwany w wybranym miejscu. Wariant `until` jest tu całą treścią testu
 * stanu silnika: ten sam samolot po `takeoff` jest „w locie", a po `engine_stop`
 * „na ziemi" - i różnicy tej NIE WIDAĆ w projekcji `sessions`.
 */
function flyingDay(o: DayOptions) {
  const mh = o.mh ?? 1200;
  const base = {
    sessionUuid: o.sessionUuid,
    picId: o.picId,
    aircraftId: o.aircraftId,
    dualId: null,
  };
  const at = (h: number, m = 0): number => o.dayStart + h * HOUR_MS + m * 60_000;

  const events = [
    event('session_claim', at(7, 50), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        reading: { fuelL: 150, mh },
        client: null,
        mhFormat: 'hhmm',
      },
      base,
    ),
  ];
  if (o.until === 'preflight') return events;

  events.push(event('engine_start', at(8, 12), {}, base));
  if (o.until === 'engine_start') return events;

  events.push(event('takeoff', at(8, 25), { method: 'auto' }, base));
  if (o.until === 'takeoff') return events;

  events.push(event('landing', at(9, 18), { method: 'auto' }, base));
  if (o.until === 'landing') return events;

  events.push(event('engine_stop', at(10, 34), {}, base));
  if (o.until === 'engine_stop') return events;

  events.push(
    event(
      'day_close',
      at(16, 45),
      { finalReading: { fuelL: 88, mh: mh + 2.2 } },
      base,
    ),
  );
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

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

/**
 * Wysyła dzień lotny TOKENEM JEGO PIC-a.
 *
 * Reguła single-writer (§4.4): zdarzenia sesji wysyła wyłącznie telefon jej PIC-a,
 * a `POST /events` odmawia 403 każdemu innemu. Test, który wysyłałby cudze dni tokenem
 * administratora, budowałby stan nieosiągalny w produkcji - a odmowa nie zatrzymuje
 * testu, więc połowa danych znikałaby po cichu i test przechodziłby na pustce.
 */
async function ingest(app: Harness['app'], events: { picId: string }[]): Promise<void> {
  const pic = events[0]?.picId;
  if (pic == null) throw new Error('pusta paczka zdarzeń');
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: bearer(await token(app, pic)),
    payload: { events },
  });
  if (res.statusCode !== 200) {
    throw new Error(`ingest odrzucony: ${res.statusCode} ${res.body}`);
  }
}

const getPanel = (app: Harness['app'], t: string, path: string) =>
  app.inject({ method: 'GET', url: `/admin/api${path}`, headers: bearer(t) });

/** Wiersz floty z odpowiedzi pulpitu. */
const rowOf = (body: { fleet: { aircraft: { reg: string } }[] }, reg: string) => {
  const row = body.fleet.find((r) => r.aircraft.reg === reg);
  if (row == null) throw new Error(`brak wiersza ${reg} na pulpicie`);
  return row as {
    aircraft: Record<string, unknown> & { reg: string };
    engine: Record<string, unknown> | null;
  };
};

describe('pulpit - stan silnika', () => {
  it('jednostka W POWIETRZU: silnik pracuje, `inFlight`, numer lotu i czas startu', async () => {
    // To jest własność, której `A02` i `A07` ODMÓWIŁY - i słusznie, bo tam listy są
    // nieograniczone. Tutaj czytamy strumień wyłącznie jednostek z OTWARTĄ sesją,
    // więc odpowiedź jest prawdziwa, a nie zastępcza („Zajęty" zamiast „W locie").
    const { app, dayStart, dashboard } = await harnessNow();
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-air',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart,
        until: 'takeoff',
      }),
    );

    const row = rowOf((await dashboard(await token(app, 'TMK'))).json(), 'SP-AXA');

    expect(row.engine).not.toBeNull();
    expect(row.engine).toMatchObject({
      sessionUuid: 'dash-air',
      engineRunning: true,
      inFlight: true,
      flightsCount: 1,
      openTakeoffAt: dayStart + 8 * HOUR_MS + 25 * 60_000,
      // Wiersz floty mówi, od kiedy MASZYNA jest zajęta - czyli od claimu (7:50),
      // a nie od meldunku pilota (8:00). Po §3.6a to dwie różne wielkości.
      claimedAt: dayStart + 7 * HOUR_MS + 50 * 60_000,
      departureIcao: 'EPKK',
    });
    // Silnik nigdy nie stanął w tej sesji - `null`, a nie czas ostatniego zdarzenia.
    expect(row.engine?.engineStoppedAt).toBeNull();
  });

  it('jednostka NA ZIEMI: silnik stoi, znany czas wyłączenia, dzień wciąż otwarty', async () => {
    const { app, dayStart, dashboard } = await harnessNow();
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-ground',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart,
        until: 'engine_stop',
      }),
    );

    const row = rowOf((await dashboard(await token(app, 'TMK'))).json(), 'SP-AXA');
    expect(row.engine).toMatchObject({
      engineRunning: false,
      inFlight: false,
      flightsCount: 1,
      openTakeoffAt: null,
      engineStoppedAt: dayStart + 10 * HOUR_MS + 34 * 60_000,
    });
  });

  it('jednostka BEZ otwartej sesji → `engine: null`, nigdy zgadywane `false`', async () => {
    // `null` znaczy „nie ma otwartej sesji", a nie „nie wiemy, czy silnik pracuje".
    // `false` byłoby twierdzeniem o świecie, którego serwer nie ma jak sprawdzić -
    // dokładnie tak samo, jak zero zamiast braku danych w kolumnie paliwa.
    const { app, dayStart, dashboard } = await harnessNow();
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-closed',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart,
        until: 'day_close',
      }),
    );

    const body = (await dashboard(await token(app, 'TMK'))).json();
    expect(rowOf(body, 'SP-AXA').engine).toBeNull();
    // Samolot, który nigdy nie latał, też jest na liście - pulpit pokazuje CAŁĄ flotę.
    expect(rowOf(body, 'SP-ANK').engine).toBeNull();
    expect(body.fleet).toHaveLength(4);
  });

  it('claim BEZ ani jednego zdarzenia po nim jest widoczny w `eventCount`', async () => {
    // Warunek „cisza podejrzana" z `A01a`: ktoś zajął samolot i od tego czasu nie
    // dotarło nic. Z samej projekcji `sessions` tego nie widać - wiersz wygląda jak
    // każdy inny otwarty dzień.
    const { app, dayStart, dashboard } = await harnessNow();
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-silent',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart,
        until: 'preflight',
      }),
    );

    const row = rowOf((await dashboard(await token(app, 'TMK'))).json(), 'SP-AXA');
    expect(row.engine).toMatchObject({ engineRunning: false, inFlight: false, flightsCount: 0 });
    expect(row.engine?.eventCount).toBe(2);
  });
});

describe('pulpit - kafle są SKRÓTEM do list, nie drugą definicją', () => {
  it('każdy licznik zgadza się z trasą ekranu docelowego', async () => {
    // Najważniejszy przypadek w tym pliku. Kafel jest przejściem, więc jego liczba
    // musi być obietnicą „tyle wierszy tam zobaczysz". Gdyby pulpit liczył po swojemu,
    // pierwszy rozjazd podważyłby OBA ekrany naraz - a pulpit czyta każdy zalogowany.
    const { app, dayStart, dashboard } = await harnessNow();

    // Dzień zamknięty (karta idzie do arkusza), dzień otwarty dzisiejszy i dzień
    // otwarty sprzed trzech dób - trzy różne stany naraz.
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-a',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart: dayStart - 3 * DAY_MS,
        until: 'day_close',
      }),
    );
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-b',
        picId: 'KRZ',
        aircraftId: 'SP-FGK',
        dayStart,
        mh: 900,
        until: 'takeoff',
      }),
    );
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-c',
        picId: 'JSE',
        aircraftId: 'SP-ANK',
        dayStart: dayStart - 3 * DAY_MS,
        mh: 500,
        until: 'engine_stop',
      }),
    );
    // Drugi dzień SP-AXA z dziurą w łańcuchu motogodzin - po to, żeby licznik flag też
    // NIE BYŁ zerem. Test porównujący dwa zera przechodzi przy dowolnie rozjechanych
    // definicjach, więc każda z tych liczb musi tu być niepusta.
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-a2',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart: dayStart - 2 * DAY_MS,
        mh: 1010,
        until: 'day_close',
      }),
    );

    const t = await token(app, 'TMK');
    const [dash, flags, openDays, exports, fleet] = await Promise.all([
      dashboard(t),
      getPanel(app, t, '/flags?status=open&limit=100'),
      getPanel(app, t, '/sessions?status=active&limit=1'),
      getPanel(app, t, '/exports?limit=200'),
      getPanel(app, t, '/fleet'),
    ]);

    const counts = dash.json().counts;
    expect(counts.openFlags).toBe(flags.json().total);
    expect(counts.openDays).toBe(openDays.json().total);
    expect(counts.exports).toEqual(exports.json().counts);
    expect(counts.aircraftTotal).toBe(fleet.json().counts.total);
    expect(counts.aircraftActive).toBe(fleet.json().counts.active);
    expect(counts.aircraftClaimed).toBe(fleet.json().counts.claimed);

    // …i ŻADNA z nich nie jest zerem, bo porównanie dwóch zer przechodzi przy dowolnie
    // rozjechanych definicjach. To jest asercja kontrolna tego przypadku.
    expect(counts.openDays).toBe(2);
    expect(counts.aircraftClaimed).toBe(2);
    expect(counts.openFlags).toBeGreaterThan(0);
    expect(counts.exports.total).toBeGreaterThan(0);
    expect(counts.exports.current).toBeGreaterThan(0);
  });
});

describe('pulpit - kolejka „wymaga uwagi"', () => {
  it('dzień otwarty DŁUŻEJ niż okno korekty jest zadaniem; dzisiejszy nie jest', async () => {
    const { app, dayStart, dashboard } = await harnessNow();

    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-stale',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart: dayStart - 3 * DAY_MS,
        until: 'engine_stop',
      }),
    );
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-fresh',
        picId: 'KRZ',
        aircraftId: 'SP-FGK',
        dayStart,
        mh: 900,
        until: 'takeoff',
      }),
    );

    const body = (await dashboard(await token(app, 'TMK'))).json();
    const uuids = body.attention.staleOpenDays.map((s: { sessionUuid: string }) => s.sessionUuid);

    // Oba dni są OTWARTE i oba liczą się do kafla…
    expect(body.counts.openDays).toBe(2);
    // …ale zadaniem jest wyłącznie ten sprzed trzech dób. Dzień otwarty od rana to
    // normalna praca, a kolejka, która wypisuje normalną pracę, przestaje być czytana.
    expect(uuids).toEqual(['dash-stale']);
    expect(body.correctionWindowMs).toBe(DAY_MS);
  });

  it('otwarta flaga trafia do kolejki w kształcie wiersza skrzynki `A03`', async () => {
    // Flagę wystawia INGEST (dziura w łańcuchu MH), a nie test - kolejka pulpitu ma
    // pokazywać te same sprawy, które zobaczy się na `A03`, w tym samym kontrakcie.
    const { app, dayStart, dashboard } = await harnessNow();

    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-mh-1',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart: dayStart - 2 * DAY_MS,
        mh: 1000,
        until: 'day_close',
      }),
    );
    // Kolejny dzień startuje od odczytu ODLEGŁEGO od poprzedniego końca (1000 + 2.2):
    // to jest dziura w łańcuchu motogodzin, czyli `mh_gap`.
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-mh-2',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart: dayStart - DAY_MS,
        mh: 1010,
        until: 'day_close',
      }),
    );

    const t = await token(app, 'TMK');
    const body = (await dashboard(t)).json();
    const inbox = (await getPanel(app, t, '/flags?status=open&limit=100')).json();

    expect(body.counts.openFlags).toBeGreaterThan(0);
    expect(body.attention.flags).toEqual(inbox.items.slice(0, body.attention.flags.length));
  });
});

describe('pulpit - puls rejestru', () => {
  it('histogram ma PEŁNE 12 wiader, a godzina bez zdarzeń to 0, nie brak wiersza', async () => {
    // Zero jest tu jedyną wartością poprawną i to jest wyjątek nazwany w kodzie:
    // „w tej godzinie nic nie przyszło" to fakt o rejestrze, a nie brak wiedzy.
    const { app, dayStart, dashboard } = await harnessNow();

    const events = flyingDay({
      sessionUuid: 'dash-pulse',
      picId: 'TMK',
      aircraftId: 'SP-AXA',
      dayStart,
      until: 'day_close',
    });
    await ingest(app, events);

    const body = (await dashboard(await token(app, 'TMK'))).json();
    expect(body.inflow.buckets).toHaveLength(12);
    expect(body.inflow.bucketMs).toBe(HOUR_MS);
    expect(body.inflow.toMs - body.inflow.fromMs).toBe(12 * HOUR_MS);
    // Wszystko przyjęliśmy przed chwilą, więc cała paczka siedzi w OSTATNIM wiadrze,
    // a jedenaście wcześniejszych to zera - nie braki.
    expect(body.inflow.buckets.slice(0, 11)).toEqual(new Array(11).fill(0));
    expect(body.inflow.buckets[11]).toBe(events.length);
  });

  it('„ostatnio przyjęte" idzie po ZEGARZE SERWERA i preferuje czas GPS', async () => {
    const { app, dayStart, dashboard } = await harnessNow();

    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-r1',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart,
        until: 'engine_stop',
      }),
    );
    // Druga paczka przychodzi PÓŹNIEJ, choć opisuje zdarzenia z tej samej doby -
    // to jest cała treść tej karty: „kiedy się dowiedzieliśmy", nie „kiedy się stało".
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-r2',
        picId: 'KRZ',
        aircraftId: 'SP-FGK',
        dayStart,
        mh: 900,
        until: 'preflight',
      }),
    );

    const body = (await dashboard(await token(app, 'TMK'))).json();
    const recent = body.recent as {
      uuid: string;
      sessionUuid: string;
      reg: string | null;
      eventTime: number;
      receivedAt: string;
      picCode: string | null;
    }[];

    expect(recent).toHaveLength(6);
    // Najnowsza paczka na górze, choć jej zdarzenia mają WCZEŚNIEJSZE czasy urządzenia
    // niż `engine_stop` z paczki pierwszej.
    expect(recent[0]?.sessionUuid).toBe('dash-r2');
    expect(recent[1]?.sessionUuid).toBe('dash-r2');
    expect(recent[2]?.sessionUuid).toBe('dash-r1');
    // Czas zdarzenia jedzie z GPS-u, `receivedAt` jest znacznikiem serwera - dwie różne
    // wielkości w jednym wierszu i o ich RÓŻNICY jest ta karta.
    expect(recent[0]?.eventTime).toBe(dayStart + 8 * HOUR_MS);
    expect(Number.isNaN(Date.parse(recent[0]?.receivedAt ?? ''))).toBe(false);
    // Złączenia z rejestrem floty i kont - wiersz ma nazwać samolot i pilota.
    expect(recent[0]?.reg).toBe('SP-FGK');
    expect(recent[0]?.picCode).toBe('KRZ');
  });

  it('„ostatnio przyjęte" bierze porządek z `idx_events_received`, nie z sortowania', async () => {
    // Pulpit jest ekranem, na którym każdy ląduje jako pierwszym, a `events` rośnie bez
    // granicy - więc `Sort` w tym planie znaczy „ładuje się natychmiast w pierwszym
    // miesiącu i coraz wolniej w każdym następnym". Dokładnie takie zniszczenie groziło
    // przy `idx_events_correction_target` (`ORDER BY` dostał wtedy `NULLS LAST` w ślad za indeksem)
    // i przy powrocie indeksu do postaci domyślnej. Ani razu nie pilnował
    // tego test - dlatego stoi tu teraz.
    const { db } = await testHarness();
    await db.query(
      `INSERT INTO events
         (uuid, session_uuid, aircraft_id, pic_id, type, device_time, gps_time,
          payload, schema_version, received_at)
       SELECT 'puls-' || g, 'sess-puls', 'SP-AXA', 'KRZ', 'taxi', 0, 0, '{}'::jsonb, 1,
              TIMESTAMPTZ '2026-01-01 00:00:00+00' + (g * INTERVAL '1 second')
         FROM generate_series(1, 5000) AS g`,
    );
    for (const table of ['events', 'pilots', 'aircraft']) await db.query(`ANALYZE ${table}`);

    const sent: { text: string; params: unknown[] }[] = [];
    const spy: Queryable = {
      query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }> {
        sent.push({ text, params: params ?? [] });
        return db.query<R>(text, params);
      },
    };
    await new PgAdminDashboardRepo().recent(spy, 6);

    const query = sent.find((q) => q.text.includes('ORDER BY'));
    if (query == null) throw new Error('adapter nie wysłał zapytania „ostatnio przyjęte"');
    const { rows } = await db.query<Record<string, string>>(
      `EXPLAIN ${query.text}`,
      query.params,
    );
    const plan = rows.map((row) => Object.values(row).join(' ')).join('\n');

    expect(plan).not.toMatch(/\bSort\b/);
    expect(plan).toContain('idx_events_received');
  });

  it('„dziś w liczbach" sumuje KOLUMNY PROJEKCJI, a nie zdarzenia', async () => {
    const { app, dayStart, dashboard } = await harnessNow();

    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-t1',
        picId: 'TMK',
        aircraftId: 'SP-AXA',
        dayStart,
        until: 'day_close',
      }),
    );
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-t2',
        picId: 'KRZ',
        aircraftId: 'SP-FGK',
        dayStart,
        mh: 900,
        until: 'day_close',
      }),
    );
    // Dzień sprzed trzech dób NIE MA prawa wejść do „dziś".
    await ingest(
      app,
      flyingDay({
        sessionUuid: 'dash-t0',
        picId: 'JSE',
        aircraftId: 'SP-ANK',
        dayStart: dayStart - 3 * DAY_MS,
        mh: 500,
        until: 'day_close',
      }),
    );

    const t = await token(app, 'TMK');
    const body = (await dashboard(t)).json();
    const list = (await getPanel(app, t, '/sessions?limit=50')).json();
    const today = list.items.filter((s: { sessionUuid: string }) =>
      ['dash-t1', 'dash-t2'].includes(s.sessionUuid),
    );

    expect(body.today.day).toBe(new Date(dayStart).toISOString().slice(0, 10));
    expect(body.today.sessions).toBe(2);
    expect(body.today.aircraft).toBe(2);
    // Suma z listy dni, a nie z osobnego przeliczenia - te same liczby, ten sam kod.
    expect(body.today.flights).toBe(
      today.reduce((sum: number, s: { flightsCount: number }) => sum + s.flightsCount, 0),
    );
    expect(body.today.blockMs).toBe(
      today.reduce((sum: number, s: { blockMs: number }) => sum + s.blockMs, 0),
    );
    expect(body.today.blockMs).toBeGreaterThan(0);

    // Ostatni dzień lotny to dziś - pulpit z ruchem i pulpit w ciszy dostają ten sam
    // kształt danych, różnią się wyłącznie tym, którą kartę panel z niego złoży.
    expect(body.lastFlyingDay.day).toBe(body.today.day);
  });
});

describe('pulpit - cisza jest odpowiedzią, nie awarią', () => {
  it('klub bez ani jednego zdarzenia dostaje komplet zer i pustych list', async () => {
    // Wariant `A01a`. Pusty pulpit ma wyglądać jak potwierdzenie, że jest dobrze -
    // więc odpowiedź musi być POPRAWNA i kompletna, a nie 500 ani brak pól.
    const { app, dashboard } = await harnessNow();

    const res = await dashboard(await token(app, 'TMK'));
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.counts).toMatchObject({
      aircraftClaimed: 0,
      openDays: 0,
      openFlags: 0,
      aircraftTotal: 4,
    });
    expect(body.counts.exports.total).toBe(0);
    expect(body.attention).toEqual({ flags: [], failedExports: [], staleOpenDays: [] });
    expect(body.recent).toEqual([]);
    expect(body.inflow.buckets).toEqual(new Array(12).fill(0));
    // Flota jest widoczna w całości, każda jednostka bez otwartej sesji.
    expect(body.fleet.every((r: { engine: unknown }) => r.engine === null)).toBe(true);
    // „Nie było jeszcze żadnego dnia lotnego" to `null`, a nie doba zerowa.
    expect(body.lastFlyingDay).toBeNull();
    expect(body.today).toMatchObject({ sessions: 0, aircraft: 0, flights: 0, blockMs: 0 });
    expect(Number.isNaN(Date.parse(body.at))).toBe(false);
  });
});

describe('pulpit - uprawnienia', () => {
  it('bez tokenu → 401, konto pilota → 403 z podaną zdolnością', async () => {
    const { app, dashboard } = await harnessNow();

    const anon = await app.inject({ method: 'GET', url: '/admin/api/dashboard' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json()).toEqual({ error: 'unauthorized' });

    const pilot = await dashboard(await token(app, 'PWI'));
    expect(pilot.statusCode).toBe(403);
    expect(pilot.json()).toEqual({ error: 'forbidden', required: 'panel.access' });
  });

  // Osobny przypadek „rola pośrednia widzi CAŁY pulpit" wypadł razem z rolą
  // `training_lead` (2026-08-30): pulpit nie żąda niczego ponad `panel.access`, a jego
  // pełną treść - z flotą i jednostką w powietrzu - przybijają przypadki wyżej.
});
