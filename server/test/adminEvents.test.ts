/**
 * UZ Aero (serwer) — REJESTR ZDARZEŃ (`GET /admin/api/events`, mockup `A04`).
 *
 * Ekran jest narzędziem śledczym: sięga się po niego wtedy, gdy liczby się nie zgadzają
 * i trzeba odpowiedzieć na pytanie „skąd się wzięła ta wartość", „co dokładnie przyszło
 * z telefonu" albo „czy to zdarzenie w ogóle dotarło". Z tego wynika, czego pilnuje ten
 * plik — i dlaczego akurat tego:
 *
 *  1. **Nic z bazy nie ma prawa wywrócić listy.** Nieznany typ zdarzenia, payload
 *     niebędący obiektem, klucz kolidujący z `Object.prototype`, brak samolotu, brak
 *     konta — wszystko jedzie do panelu DOSŁOWNIE. Rejestr, który wywraca się na
 *     własnej historii, jest bezużyteczny dokładnie wtedy, gdy jest potrzebny.
 *  2. **Dwa zegary są sednem, nie kolumną obok.** Brak fixa GPS daje `driftMs: null`,
 *     a nie zero — zero jest twierdzeniem, że zegary się zgadzały.
 *  3. **Liczniki opisują ZAKRES, nie okno.** `limit=1` nie ma prawa zmienić kafla.
 *  4. **Granica strony na kursorze przy IDENTYCZNYM `received_at`** — cała paczka
 *     z jednego synca ma ten sam stempel, bo `now()` zwraca czas rozpoczęcia transakcji.
 *  5. **Porządek daje INDEKS, nie sortowanie w pamięci** — sprawdzone `EXPLAIN`-em.
 *
 * Zapisu tu nie ma i nie będzie: `events` jest append-only, a braku `UPDATE`/`DELETE`
 * pilnuje `test/architecture.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { Queryable } from '../src/application/common/ports.ts';
import type { EventListFilter } from '../src/application/admin/ports.ts';
import { PgAdminEventsReadRepo } from '../src/infrastructure/pg/admin/eventsReadRepo.ts';
import { TEST_PASSWORD, testHarness } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number, s = 0): number => DAY + ((h * 60 + m) * 60 + s) * 1000;

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

async function token(app: Harness['app'], who: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: who, password: TEST_PASSWORD },
  });
  return res.json().token as string;
}

const getEvents = (app: Harness['app'], t: string, query = '') =>
  app.inject({ method: 'GET', url: `/admin/api/events${query}`, headers: bearer(t) });

interface EventBase {
  sessionUuid: string;
  picId: string;
  aircraftId: string;
  dualId: string | null;
}

/**
 * Uuid pochodzi od TYPU, a nie od licznika: każdy test ma własną bazę, więc kolizji
 * nie ma, a przypadki korekty mogą wskazać cel po nazwie zamiast po numerze z licznika
 * dzielonego przez cały plik. Prefiks daje wymagane przez kopertę osiem znaków.
 */
const uuidOf = (type: string): string => `evday-${type}`;

function event(
  type: string,
  time: number,
  payload: Record<string, unknown>,
  base: EventBase,
  gpsTime: number | null = time,
) {
  return {
    uuid: uuidOf(type),
    type,
    deviceTime: time,
    gpsTime,
    payload,
    schemaVersion: 1,
    ...base,
  };
}

const BASE: EventBase = {
  sessionUuid: 'sess-a04',
  picId: 'KRZ',
  aircraftId: 'SP-AXA',
  dualId: null,
};

/** Dzień lotny wysłany TOKENEM PIC-a — single-writer §4.4 odmawia każdemu innemu. */
async function ingest(app: Harness['app'], events: { picId: string }[]): Promise<void> {
  const pic = events[0]?.picId;
  if (pic == null) throw new Error('pusta paczka zdarzeń');
  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: bearer(await token(app, pic)),
    payload: { events },
  });
  if (res.statusCode !== 200) throw new Error(`ingest odrzucony: ${res.statusCode} ${res.body}`);
}

function flyingDay(base: EventBase = BASE, gpsShift = 0) {
  const gps = (t: number): number => t - gpsShift;
  return [
    event('session_claim', at(5, 52), { mode: 'free' }, base, gps(at(5, 52))),
    event(
      'preflight_confirm',
      at(6, 5),
      {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        dutyStart: at(6, 5),
        reading: { fuelL: 150, mh: 1200 },
        client: null,
        mhFormat: 'hhmm',
      },
      base,
      gps(at(6, 5)),
    ),
    event('engine_start', at(6, 20), {}, base, gps(at(6, 20))),
    event('takeoff', at(6, 30), { method: 'auto' }, base, gps(at(6, 30))),
    event('landing', at(7, 10), { method: 'auto' }, base, gps(at(7, 10))),
    event('engine_stop', at(7, 20), {}, base, gps(at(7, 20))),
  ];
}

/**
 * Wiersz wstawiony WPROST do bazy, z pominięciem `POST /events`.
 *
 * To nie jest obejście walidacji dla wygody — to jest odtworzenie stanu, którego
 * walidacja wejścia NIE BRONI: wiersz wpisany ręcznie w psql, zapis ze starszej wersji
 * telefonu, typ wycofany z katalogu. Kolumna `events.type` celowo nie ma `CHECK`-a,
 * a `payload` jest `JSONB` dowolnego kształtu — więc taki wiersz istnieje i rejestr
 * ma go pokazać.
 */
async function rawEvent(
  db: Queryable,
  row: {
    uuid: string;
    type: string;
    payload: unknown;
    deviceTime?: number;
    gpsTime?: number | null;
    sessionUuid?: string;
    aircraftId?: string;
    picId?: string;
    dualId?: string | null;
    sourceDevice?: string | null;
    receivedAt?: Date;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO events
       (uuid, session_uuid, aircraft_id, pic_id, dual_id, type,
        device_time, gps_time, payload, schema_version, source_device, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12, now()))`,
    [
      row.uuid,
      row.sessionUuid ?? BASE.sessionUuid,
      row.aircraftId ?? BASE.aircraftId,
      row.picId ?? BASE.picId,
      row.dualId ?? null,
      row.type,
      row.deviceTime ?? at(8, 0),
      row.gpsTime === undefined ? at(8, 0) : row.gpsTime,
      JSON.stringify(row.payload),
      1,
      row.sourceDevice ?? null,
      row.receivedAt ?? null,
    ],
  );
}

interface EntryDto {
  uuid: string;
  type: string;
  deviceTime: number;
  gpsTime: number | null;
  driftMs: number | null;
  effectiveTime: number;
  effectiveClock: 'gps' | 'device';
  payload: unknown;
  reg: string | null;
  picName: string | null;
  voided: boolean;
  correctedTime: number | null;
  adminCorrected: boolean;
  sourceDevice: string | null;
  receivedAt: string;
}

interface PageDto {
  items: EntryDto[];
  nextCursor: string | null;
  counts: {
    total: number;
    withoutGpsFix: number;
    clockDrift: number;
    driftThresholdMs: number;
  } | null;
}

const entry = (page: PageDto, uuid: string): EntryDto => {
  const found = page.items.find((i) => i.uuid === uuid);
  if (found == null) throw new Error(`brak wiersza ${uuid} w rejestrze`);
  return found;
};

// ── uprawnienia ─────────────────────────────────────────────────────────────────

describe('rejestr zdarzeń: kto może patrzeć', () => {
  it('bez tokenu 401, konto pilota 403 — dwa różne komunikaty', async () => {
    const { app } = await testHarness();

    const anon = await app.inject({ method: 'GET', url: '/admin/api/events' });
    expect(anon.statusCode).toBe(401);

    const pilot = await getEvents(app, await token(app, 'KRZ'));
    expect(pilot.statusCode).toBe(403);
  });

  it('szef wyszkolenia CZYTA rejestr — to jest odczyt, nie zapis', async () => {
    // `ANALIZA.md`: „Rejestr zdarzeń — przeglądarka (A04) | admin ✅ | szef wyszkolenia
    // ✅ (odczyt)". Zdolnością jest `panel.access`, a nie nowa `events.read`, bo ta
    // nie odrzuciłaby ani jednego żądania, które przechodzi dziś.
    const { app } = await testHarness();
    const res = await getEvents(app, await token(app, 'AKO'));
    expect(res.statusCode).toBe(200);
  });
});

// ── surowość: nic nie ma prawa wywrócić listy ───────────────────────────────────

describe('rejestr pokazuje to, co przyszło — bez interpretacji', () => {
  it('NIEZNANY typ zdarzenia przechodzi CAŁY tor i jedzie dosłownie', async () => {
    // Kolumna `events.type` nie ma `CHECK`-a, a walidacja katalogu zachodzi na wejściu.
    // Wiersz z typem spoza katalogu (wycofany, ze starszego telefonu) MUSI być widoczny:
    // strażnik przy odczycie kazałby rejestrowi albo rzucić, albo taki wiersz pominąć.
    const { app, db } = await testHarness();
    await rawEvent(db, { uuid: 'ev-obcy', type: 'jakis_nowy_typ', payload: { x: 1 } });

    const res = await getEvents(app, await token(app, 'TMK'));
    expect(res.statusCode).toBe(200);
    expect(entry(res.json() as PageDto, 'ev-obcy').type).toBe('jakis_nowy_typ');
  });

  it('payload NIEBĘDĄCY obiektem (tablica, liczba, null) jedzie bez zmiany kształtu', async () => {
    // `JSONB` przyjmuje też tablicę, liczbę i `null`. Obietnica „payload to zawsze
    // obiekt" jest obietnicą, której baza nie składa — a rejestr, który wywraca się
    // na kształcie payloadu, nie odpowiada na pytanie „co przyszło z telefonu".
    const { app, db } = await testHarness();
    await rawEvent(db, { uuid: 'ev-tab', type: 'taxi', payload: [1, 'dwa', null] });
    await rawEvent(db, { uuid: 'ev-num', type: 'taxi', payload: 42 });
    await rawEvent(db, { uuid: 'ev-nul', type: 'taxi', payload: null });

    const page = (await getEvents(app, await token(app, 'TMK'))).json() as PageDto;
    expect(entry(page, 'ev-tab').payload).toEqual([1, 'dwa', null]);
    expect(entry(page, 'ev-num').payload).toBe(42);
    // `null` NIE zamienia się w pusty obiekt — to dwie różne odpowiedzi na pytanie
    // „co zapisał telefon".
    expect(entry(page, 'ev-nul').payload).toBeNull();
  });

  it('klucze kolidujące z `Object.prototype` nie gubią się ani nie zatruwają wyniku', async () => {
    // Wada z dziennika audytu, tam złapana: `LABELS['toString']` nie jest `undefined`,
    // tylko funkcją z prototypu. Tutaj payload pochodzi WPROST z telefonu, więc może
    // nieść dowolny klucz — a serwer nie ma prawa go zgubić.
    const { app, db } = await testHarness();
    await rawEvent(db, {
      uuid: 'ev-proto',
      type: 'taxi',
      payload: { __proto__: 'nie-prototyp', constructor: 'tekst', hasOwnProperty: 1, ok: 'tak' },
    });

    const page = (await getEvents(app, await token(app, 'TMK'))).json() as PageDto;
    const payload = entry(page, 'ev-proto').payload as Record<string, unknown>;
    expect(payload['constructor']).toBe('tekst');
    expect(payload['hasOwnProperty']).toBe(1);
    expect(payload['ok']).toBe('tak');
  });

  it('zdarzenie samolotu i konta, których już nie ma, ZOSTAJE na liście', async () => {
    // `LEFT JOIN`, nigdy `INNER`: skasowana jednostka odbiera nazwę, nie fakt.
    const { app, db } = await testHarness();
    await rawEvent(db, {
      uuid: 'ev-sierota',
      type: 'taxi',
      payload: {},
      aircraftId: 'SP-NIEMA',
      picId: 'XXX',
    });

    const page = (await getEvents(app, await token(app, 'TMK'))).json() as PageDto;
    const row = entry(page, 'ev-sierota');
    expect(row.reg).toBeNull();
    expect(row.picName).toBeNull();
  });
});

// ── dwa zegary ──────────────────────────────────────────────────────────────────

describe('dwa zegary: brak fixa to nie zero', () => {
  it('bez `gps_time` różnica NIE ISTNIEJE, a czas efektywny idzie z telefonu', async () => {
    const { app, db } = await testHarness();
    await rawEvent(db, {
      uuid: 'ev-bezfixa',
      type: 'engine_stop',
      payload: {},
      deviceTime: at(13, 13, 33),
      gpsTime: null,
    });

    const row = entry((await getEvents(app, await token(app, 'TMK'))).json() as PageDto, 'ev-bezfixa');
    // `null`, nie `0`: zero byłoby twierdzeniem, że zegary się zgadzały.
    expect(row.driftMs).toBeNull();
    expect(row.gpsTime).toBeNull();
    expect(row.effectiveClock).toBe('device');
    expect(row.effectiveTime).toBe(at(13, 13, 33));
  });

  it('z fixem: różnica jest wartością bezwzględną, a czas efektywny idzie z GPS', async () => {
    const { app, db } = await testHarness();
    await rawEvent(db, {
      uuid: 'ev-rozjazd',
      type: 'day_close',
      payload: {},
      // Telefon SPIESZY o 720 s — dokładnie przypadek z mockupu A04.
      deviceTime: at(13, 34, 47),
      gpsTime: at(13, 22, 47),
    });
    await rawEvent(db, {
      uuid: 'ev-spoznia',
      type: 'taxi',
      payload: {},
      // …i przypadek odwrotny: telefon SPÓŹNIA. Różnica musi być ta sama.
      deviceTime: at(13, 22, 47),
      gpsTime: at(13, 34, 47),
    });

    const page = (await getEvents(app, await token(app, 'TMK'))).json() as PageDto;
    expect(entry(page, 'ev-rozjazd').driftMs).toBe(720_000);
    expect(entry(page, 'ev-spoznia').driftMs).toBe(720_000);
    expect(entry(page, 'ev-rozjazd').effectiveClock).toBe('gps');
    expect(entry(page, 'ev-rozjazd').effectiveTime).toBe(at(13, 22, 47));
  });
});

// ── liczniki ────────────────────────────────────────────────────────────────────

describe('liczniki opisują ZAKRES ZAPYTANIA, nie widoczne okno', () => {
  async function withCounts() {
    const harness = await testHarness();
    await ingest(harness.app, flyingDay());
    await rawEvent(harness.db, { uuid: 'ev-c1', type: 'taxi', payload: {}, gpsTime: null });
    await rawEvent(harness.db, { uuid: 'ev-c2', type: 'taxi', payload: {}, gpsTime: null });
    await rawEvent(harness.db, {
      uuid: 'ev-c3',
      type: 'taxi',
      payload: {},
      deviceTime: at(9, 0),
      gpsTime: at(9, 0) - 121_000,
    });
    // Rozjazd DOKŁADNIE równy progowi nie jest rozjazdem — reguła domeny mówi `>`,
    // nie `>=`, i licznik ma o tym wiedzieć.
    await rawEvent(harness.db, {
      uuid: 'ev-c4',
      type: 'taxi',
      payload: {},
      deviceTime: at(9, 0),
      gpsTime: at(9, 0) - 120_000,
    });
    return harness;
  }

  it('`limit=1` obcina STRONĘ, a nie pytanie — kafle się nie ruszają', async () => {
    // Wada z A05 w czystej postaci: zawężenie stało PO `LIMIT`-cie, więc chip pokazywał
    // zero i wyglądało to na dobrą wiadomość.
    const { app } = await withCounts();
    const t = await token(app, 'TMK');

    const full = (await getEvents(app, t, '?limit=500')).json() as PageDto;
    const clipped = (await getEvents(app, t, '?limit=1')).json() as PageDto;

    expect(clipped.items).toHaveLength(1);
    expect(clipped.counts).toEqual(full.counts);
    expect(full.counts?.total).toBe(full.items.length);
  });

  it('liczy „bez fixa" i „rozjazd zegarów" osobno, progiem z DOMENY', async () => {
    const { app } = await withCounts();
    const page = (await getEvents(app, await token(app, 'TMK'), '?limit=500')).json() as PageDto;

    expect(page.counts?.withoutGpsFix).toBe(2);
    // `ev-c3` przekracza próg, `ev-c4` stoi dokładnie na nim.
    expect(page.counts?.clockDrift).toBe(1);
    // Próg jedzie w odpowiedzi, żeby panel go WYPISAŁ, a nie znał.
    expect(page.counts?.driftThresholdMs).toBe(120_000);

    // Kontrola spójności licznika z wierszami: druga definicja rozjazdu (SQL) musi się
    // zgadzać z pierwszą (mapper). Bez tego `FILTER` w `COUNT` mógłby cicho odjechać.
    const overThreshold = page.items.filter(
      (i) => i.driftMs != null && i.driftMs > (page.counts?.driftThresholdMs ?? 0),
    );
    expect(overThreshold).toHaveLength(page.counts?.clockDrift ?? -1);
  });

  it('liczniki respektują FILTR, a strona kursorowa oddaje `null`, nie zero', async () => {
    const { app } = await withCounts();
    const t = await token(app, 'TMK');

    const narrowed = (await getEvents(app, t, '?type=taxi&limit=500')).json() as PageDto;
    expect(narrowed.counts?.total).toBe(4);

    const first = (await getEvents(app, t, '?limit=2')).json() as PageDto;
    expect(first.nextCursor).not.toBeNull();
    const second = (
      await getEvents(app, t, `?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`)
    ).json() as PageDto;
    // `null` znaczy „nie pytaliśmy", a nie „nic nie ma" — panel niesie liczbę
    // z pierwszej strony.
    expect(second.counts).toBeNull();
  });
});

// ── kursor ──────────────────────────────────────────────────────────────────────

describe('kursor keyset: granica strony przy IDENTYCZNYM `received_at`', () => {
  it('cała paczka z jednego synca dzieli się na strony bez gubienia i dublowania', async () => {
    // `received_at` nadaje baza (`DEFAULT now()`), a `now()` w Postgresie zwraca czas
    // ROZPOCZĘCIA TRANSAKCJI — więc sześć zdarzeń jednej paczki ma identyczny stempel.
    // Bez tie-breakera po `uuid` granica strony wypadałaby w środku paczki i wiersze
    // wypadałyby z porządku: administrator szukający konkretnego zdarzenia mógłby nie
    // zobaczyć akurat tego, którego szuka.
    const { app, db } = await testHarness();
    await ingest(app, flyingDay());
    const t = await token(app, 'TMK');

    const stamps = await db.query<{ n: string }>(
      'SELECT COUNT(DISTINCT received_at) AS n FROM events',
    );
    // Kontrola samego testu: gdyby stemple były różne, badalibyśmy inną własność.
    expect(Number(stamps.rows[0]!.n)).toBe(1);

    const all = (await getEvents(app, t, '?limit=500')).json() as PageDto;
    expect(all.items).toHaveLength(6);

    const collected: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const url: string =
        cursor == null ? '?limit=2' : `?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const page = (await getEvents(app, t, url)).json() as PageDto;
      collected.push(...page.items.map((i) => i.uuid));
      cursor = page.nextCursor;
      if (cursor == null) break;
    }

    expect(collected).toEqual(all.items.map((i) => i.uuid));
    expect(new Set(collected).size).toBe(collected.length);
  });

  it('kursor NIECZYTELNY to 400, nie 500 i nie cichy powrót na początek', async () => {
    const { app } = await testHarness();
    const t = await token(app, 'TMK');

    for (const bad of ['nie-base64', Buffer.from('{"k1":"abc","k2":"x","d":"desc"}').toString('base64url')]) {
      const res = await getEvents(app, t, `?cursor=${encodeURIComponent(bad)}`);
      expect(res.statusCode).toBe(400);
    }

    // Kursor wydany dla `desc`, użyty przy `asc`, opisuje pozycję w INNYM porządku —
    // strona byłaby wewnętrznie niespójna, a niespójna strona wygląda jak dane.
    const { nextCursor } = (await getEvents(app, t, '?limit=1')).json() as PageDto;
    if (nextCursor != null) {
      const res = await getEvents(app, t, `?sort=asc&cursor=${encodeURIComponent(nextCursor)}`);
      expect(res.statusCode).toBe(400);
    }
  });
});

// ── filtry ──────────────────────────────────────────────────────────────────────

describe('filtry: nieznana wartość to 400, nie ciche zignorowanie', () => {
  it('typ spoza katalogu domeny odrzucamy czterysetką', async () => {
    // Ciche zignorowanie pokazałoby PEŁNY rejestr pod etykietą zawężenia, czyli
    // skłamałoby o tym, na co człowiek patrzy.
    const { app } = await testHarness();
    const res = await getEvents(app, await token(app, 'TMK'), '?type=nieistniejacy');
    expect(res.statusCode).toBe(400);
  });

  it('typ jest parametrem POWTARZALNYM — chip bywa grupą', async () => {
    const { app } = await testHarness();
    await ingest(app, flyingDay());

    const page = (
      await getEvents(app, await token(app, 'TMK'), '?type=takeoff&type=landing')
    ).json() as PageDto;
    expect(page.items.map((i) => i.type).sort()).toEqual(['landing', 'takeoff']);
  });

  it('pilot dopasowuje PIC-a ALBO Duala — dzień szkolny należy do obu', async () => {
    const { app, db } = await testHarness();
    await rawEvent(db, { uuid: 'ev-dual', type: 'taxi', payload: {}, picId: 'KRZ', dualId: 'JSE' });
    const t = await token(app, 'TMK');

    const asPic = (await getEvents(app, t, '?pilotId=KRZ')).json() as PageDto;
    const asDual = (await getEvents(app, t, '?pilotId=JSE')).json() as PageDto;
    expect(asPic.items.map((i) => i.uuid)).toContain('ev-dual');
    expect(asDual.items.map((i) => i.uuid)).toContain('ev-dual');
  });

  it('`uuid`, `sessionUuid`, `aircraftId` i `sourceDevice` zawężają DOKŁADNIE', async () => {
    const { app, db } = await testHarness();
    await ingest(app, flyingDay());
    await rawEvent(db, {
      uuid: 'ev-panel',
      type: 'event_correction',
      payload: { targetUuid: uuidOf('session_claim'), action: 'void' },
      sourceDevice: 'admin:TMK',
      sessionUuid: 'sess-inna',
      aircraftId: 'SP-FGK',
    });
    const t = await token(app, 'TMK');

    expect(((await getEvents(app, t, '?uuid=ev-panel')).json() as PageDto).items).toHaveLength(1);
    expect(
      ((await getEvents(app, t, '?sessionUuid=sess-inna')).json() as PageDto).items,
    ).toHaveLength(1);
    expect(((await getEvents(app, t, '?aircraftId=SP-FGK')).json() as PageDto).items).toHaveLength(1);
    expect(
      ((await getEvents(app, t, '?sourceDevice=admin%3ATMK')).json() as PageDto).items,
    ).toHaveLength(1);
  });

  it('zakres dat idzie po CZASIE PRZYJĘCIA i domyka górną dobę', async () => {
    const { app, db } = await testHarness();
    await rawEvent(db, {
      uuid: 'ev-stare',
      type: 'taxi',
      payload: {},
      receivedAt: new Date(Date.UTC(2026, 0, 5, 23, 59, 59)),
    });
    const t = await token(app, 'TMK');

    // `do=2026-01-05` obejmuje CAŁĄ dobę — inaczej „od 1 do 5" gubiłoby ostatni dzień.
    const inside = (await getEvents(app, t, '?from=2026-01-05&to=2026-01-05')).json() as PageDto;
    expect(inside.items.map((i) => i.uuid)).toEqual(['ev-stare']);

    const outside = (await getEvents(app, t, '?from=2026-01-06')).json() as PageDto;
    expect(outside.items.map((i) => i.uuid)).not.toContain('ev-stare');
  });
});

// ── korekty ─────────────────────────────────────────────────────────────────────

describe('rejestr jest append-only: korekta przekreśla, nie usuwa', () => {
  it('zdarzenie UNIEWAŻNIONE zostaje na liście, oznaczone — a sama korekta nie', async () => {
    const { app, db } = await testHarness();
    await ingest(app, flyingDay());
    const target = uuidOf('landing');
    await rawEvent(db, {
      uuid: 'ev-void',
      type: 'event_correction',
      payload: { targetUuid: target, action: 'void', reason: 'nie było' },
      sourceDevice: 'admin:TMK',
      deviceTime: at(20, 0),
      gpsTime: at(20, 0),
    });

    const page = (await getEvents(app, await token(app, 'TMK'), '?limit=500')).json() as PageDto;
    expect(entry(page, target).voided).toBe(true);
    expect(entry(page, target).adminCorrected).toBe(true);
    // Korekta korekty nie istnieje — wiersz `event_correction` nigdy nie jest
    // unieważniony. Bez tego rozróżnienia wypadałby z wyniku `applyCorrections`
    // i wyglądał na skreślony.
    expect(entry(page, 'ev-void').voided).toBe(false);
  });

  it('`retime` nadaje czas i NIE unieważnia — a „ostatnia wygrywa" liczy DOMENA', async () => {
    const { app, db } = await testHarness();
    await ingest(app, flyingDay());
    const target = uuidOf('takeoff');

    await rawEvent(db, {
      uuid: 'ev-k1',
      type: 'event_correction',
      payload: { targetUuid: target, action: 'void' },
      deviceTime: at(20, 0),
      gpsTime: at(20, 0),
    });
    // Druga korekta jest PÓŹNIEJSZA i przywraca zdarzenie do życia z nowym czasem.
    await rawEvent(db, {
      uuid: 'ev-k2',
      type: 'event_correction',
      payload: { targetUuid: target, action: 'retime', newTime: at(6, 33) },
      deviceTime: at(21, 0),
      gpsTime: at(21, 0),
    });

    const row = entry(
      (await getEvents(app, await token(app, 'TMK'), '?limit=500')).json() as PageDto,
      target,
    );
    expect(row.voided).toBe(false);
    expect(row.correctedTime).toBe(at(6, 33));
    // Korekt nie zapisał panel, więc śladu w dzienniku audytu nie ma i ekran nie ma
    // prawa go obiecywać.
    expect(row.adminCorrected).toBe(false);
  });

  it('korekta SPOZA zawężenia i tak przekreśla swój cel', async () => {
    // Zdarzenie sprzed miesiąca unieważnione wczoraj musi być przekreślone także wtedy,
    // gdy sama korekta wypadła poza filtr — inaczej rejestr pokazywałby jako ważne coś,
    // czego projekcja już nie liczy.
    const { app, db } = await testHarness();
    await rawEvent(db, {
      uuid: 'ev-daleki',
      type: 'landing',
      payload: {},
      receivedAt: new Date(Date.UTC(2026, 0, 5, 12, 0, 0)),
    });
    await rawEvent(db, {
      uuid: 'ev-korekta-pozniej',
      type: 'event_correction',
      payload: { targetUuid: 'ev-daleki', action: 'void' },
      receivedAt: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)),
    });

    const page = (
      await getEvents(app, await token(app, 'TMK'), '?from=2026-01-05&to=2026-01-05')
    ).json() as PageDto;
    expect(page.items.map((i) => i.uuid)).toEqual(['ev-daleki']);
    expect(entry(page, 'ev-daleki').voided).toBe(true);
  });
});

// ── plan zapytania ──────────────────────────────────────────────────────────────

describe('porządek rejestru daje INDEKS, nie sortowanie w pamięci', () => {
  /**
   * Wsyp dużo wierszy i `ANALYZE` — bez jednego i drugiego planer wybiera `Seq Scan`
   * niezależnie od indeksów (na kilku wierszach jest po prostu tańszy), więc test
   * przechodziłby albo padał z powodu, który nie ma nic wspólnego z badaną własnością.
   */
  async function bigRegistry() {
    const harness = await testHarness();
    await harness.db.query(
      `INSERT INTO events
         (uuid, session_uuid, aircraft_id, pic_id, type, device_time, gps_time,
          payload, schema_version, received_at)
       SELECT 'big-' || g, 'sess-big', 'SP-AXA', 'KRZ', 'taxi', 0, 0, '{}'::jsonb, 1,
              TIMESTAMPTZ '2026-01-01 00:00:00+00' + (g * INTERVAL '1 second')
         FROM generate_series(1, 5000) AS g`,
    );
    await harness.db.query('ANALYZE events');
    await harness.db.query('ANALYZE pilots');
    await harness.db.query('ANALYZE aircraft');
    return harness;
  }

  function recorder(db: Queryable): { spy: Queryable; sent: { text: string; params: unknown[] }[] } {
    const sent: { text: string; params: unknown[] }[] = [];
    const spy: Queryable = {
      query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }> {
        sent.push({ text, params: params ?? [] });
        return db.query<R>(text, params);
      },
    };
    return { spy, sent };
  }

  async function planOf(db: Queryable, filter: EventListFilter): Promise<string> {
    const { spy, sent } = recorder(db);
    await new PgAdminEventsReadRepo().list(spy, filter, 120_000);

    const page = sent.find((q) => q.text.includes('ORDER BY'));
    if (page == null) throw new Error('adapter nie wysłał zapytania strony');
    const { rows } = await db.query<Record<string, string>>(`EXPLAIN ${page.text}`, page.params);
    return rows.map((row) => Object.values(row).join(' ')).join('\n');
  }

  it('pierwsza strona idzie `idx_events_received` — w planie NIE MA węzła `Sort`', async () => {
    // To jest wykonywalna postać migracji 16. Indeks z migracji 15 stał jako
    // `(received_at DESC, uuid DESC)`, czyli `NULLS FIRST`, a kursor emituje
    // `ORDER BY … DESC NULLS LAST` — te dwa zapisy nie pasują do siebie SKŁADNIOWO,
    // a planer nie skraca tego przez `NOT NULL` kolumny. Przed migracją 16 plan
    // schodził na `Sort` CAŁEJ tabeli przed `LIMIT`-em, więc koszt strony rósł
    // liniowo z rejestrem — dokładnie to, czemu kursor miał zapobiec.
    const { db } = await bigRegistry();

    const plan = await planOf(db, { direction: 'desc', limit: 50 });
    expect(plan).not.toMatch(/\bSort\b/);
    expect(plan).toContain('idx_events_received');
  });

  it('strona KURSOROWA też idzie indeksem — predykat go nie unieważnia', async () => {
    const { db } = await bigRegistry();
    const repo = new PgAdminEventsReadRepo();
    const first = await repo.list(db, { direction: 'desc', limit: 50 }, 120_000);
    const cursor = first?.nextCursor;
    expect(cursor).not.toBeNull();

    const plan = await planOf(db, { direction: 'desc', limit: 50, cursor: cursor! });
    expect(plan).not.toMatch(/\bSort\b/);
    expect(plan).toContain('idx_events_received');
  });
});
