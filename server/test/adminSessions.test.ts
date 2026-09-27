/**
 * Ninerdeck (serwer) - lista dni i karta dnia panelu
 * (`GET /admin/api/sessions`, `GET /admin/api/sessions/:uuid`; mockupy `A02`, `A02a`).
 *
 * Ten sam wzorzec co reszta: PGlite w procesie, prawdziwe klasy, `app.inject`, zero
 * atrap. Dni powstają tak, jak powstają w produkcji - z PRAWDZIWEGO `POST /events`,
 * bo test, który wstawia wiersz projekcji `INSERT`-em, przybija własne wyobrażenie
 * o projekcji, a nie zachowanie systemu.
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
    uuid: `s-${seq}-${type}`,
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
  dualId?: string | null;
  operation?: string;
  client?: string | null;
  mh?: number;
  /** Odczyt startowy paliwa - musi zgadzać się z przekazaniem poprzedniego dnia. */
  fuelStartL?: number;
  dayOffset?: number;
  close?: boolean;
}

/** Pełny dzień lotny: preflight → cykl silnika z jednym lotem → (opcjonalnie) zamknięcie. */
function flyingDay(o: DayOptions) {
  const d = o.dayOffset ?? 0;
  const mh = o.mh ?? 1234.5;
  const base = {
    sessionUuid: o.sessionUuid,
    picId: o.picId,
    aircraftId: o.aircraftId ?? 'SP-AXA',
    dualId: o.dualId ?? null,
  };

  const events: ReturnType<typeof event>[] = [
    event('session_claim', at(7, 50, d), { mode: 'free' }, base),
    event(
      'preflight_confirm',
      at(8, 0, d),
      {
        operation: o.operation ?? 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        reading: { fuelL: o.fuelStartL ?? 150, mh },
        client: o.client ?? null,
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
        { finalReading: { fuelL: 88, mh: mh + 2.2 } },
        base,
      ),
    );
  }
  return events;
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

function list(app: Harness['app'], token: string, query = '') {
  return app.inject({
    method: 'GET',
    url: `/admin/api/sessions${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Trzy dni na dwóch samolotach, dwóch pilotów, dwie operacje - materiał na filtry. */
async function threeDays() {
  const harness = await testHarness();
  const { app } = harness;
  const ako = await login(app, 'AKO');
  const krz = await login(app, 'KRZ');

  await post(app, ako, flyingDay({ sessionUuid: 'sess-1', picId: 'AKO', dayOffset: 0, mh: 1200 }));
  await post(
    app,
    krz,
    flyingDay({
      sessionUuid: 'sess-2',
      picId: 'KRZ',
      dualId: 'JSE',
      aircraftId: 'SP-FGK',
      operation: 'egzamin',
      client: null,
      dayOffset: 1,
      mh: 900,
    }),
  );
  // Dzień OTWARTY (bez `day_close`) - na liście ma stan `active` i puste odczyty końcowe.
  // Odczyty startowe (MH i paliwo) domykają przekazanie z `sess-1` na tym samym
  // samolocie: fixtura ma być BEZ flag, żeby test filtra `flagged` mierzył filtr,
  // a nie przypadkową rozbieżność w danych testowych.
  await post(
    app,
    ako,
    flyingDay({
      sessionUuid: 'sess-3',
      picId: 'AKO',
      operation: 'ferry',
      client: 'SKY CAMP',
      dayOffset: 2,
      mh: 1202.2,
      fuelStartL: 88,
      close: false,
    }),
  );

  return { ...harness, admin: ako };
}

describe('lista dni (A02)', () => {
  it('oddaje kolumny mockupu: samolot, załoga, operacja, liczby dnia, arkusz', async () => {
    const { app, admin } = await threeDays();

    const res = await list(app, admin);
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.total).toBe(3);
    // Porządek domyślny: najnowszy dzień na górze (`claim_time DESC`).
    expect(body.items.map((i: { sessionUuid: string }) => i.sessionUuid)).toEqual([
      'sess-3',
      'sess-2',
      'sess-1',
    ]);

    expect(body.items[1]).toMatchObject({
      sessionUuid: 'sess-2',
      aircraftId: 'SP-FGK',
      reg: 'SP-FGK',
      aircraftType: 'Cessna 182',
      mhFormat: 'hhmm',
      picId: 'KRZ',
      picCode: 'KRZ',
      picName: 'Krzysztof Zieliński',
      dualId: 'JSE',
      dualCode: 'JSE',
      status: 'closed',
      operation: 'egzamin',
      client: null,
      // Kolumna „Dzień · UTC" idzie od PRZEJĘCIA samolotu (7:50), nie od meldunku (8:00).
      claimedAt: at(7, 50, 1),
      closeTime: at(16, 45, 1),
      flightsCount: 1,
      mhStart: 900,
      mhEnd: 902.2,
      fuelStartL: 150,
      fuelEndL: 88,
      openFlags: [],
      exportRevision: 1,
    });

    // Dzień otwarty: odczyty końcowe puste, karty arkusza nie ma. Panel niczego
    // nie domyśla - to jest cała treść banera „dzień otwarty ≠ dzień niekompletny".
    expect(body.items[0]).toMatchObject({
      sessionUuid: 'sess-3',
      status: 'active',
      operation: 'ferry',
      client: 'SKY CAMP',
      closeTime: null,
      mhEnd: null,
      fuelEndL: null,
      exportRevision: null,
    });
  });

  it('liczby wiersza są liczbami PROJEKCJI, nie własną arytmetyką listy', async () => {
    const { app, admin } = await threeDays();

    const body = (await list(app, admin, '?aircraftId=SP-FGK')).json();

    // Blok = jeden cykl silnika 08:12 → 10:34; lot = 08:25 → 09:18. Te same liczby
    // co ekran 10 telefonu i karta arkusza - jeden `projectSession` dla wszystkich.
    expect(body.items[0]).toMatchObject({
      blockMs: (2 * 60 + 22) * 60_000,
      flightMs: 53 * 60_000,
      flightsCount: 1,
    });
  });

  it('filtry: zakres dat (domknięty obustronnie), samolot, pilot, stan, operacja', async () => {
    const { app, admin } = await threeDays();
    const uuids = async (query: string) =>
      (await list(app, admin, query)).json().items.map((i: { sessionUuid: string }) => i.sessionUuid);

    // Zakres domknięty: `do=` obejmuje CAŁY podany dzień, nie jego północ.
    expect(await uuids('?from=2026-06-22&to=2026-06-23')).toEqual(['sess-2', 'sess-1']);
    expect(await uuids('?from=2026-06-24')).toEqual(['sess-3']);

    expect(await uuids('?aircraftId=SP-FGK')).toEqual(['sess-2']);
    expect(await uuids('?status=active')).toEqual(['sess-3']);
    expect(await uuids('?operation=skoki')).toEqual(['sess-1']);
    expect(await uuids('?exported=false')).toEqual(['sess-3']);
    // Fixtura jest bez rozbieżności, więc obie strony filtra flag mają odpowiedź:
    // pustą listę i pełną. Stronę pozytywną na PRAWDZIWEJ fladze sprawdza test
    // nakładki niżej.
    expect(await uuids('?flagged=true')).toEqual([]);
    expect(await uuids('?flagged=false')).toEqual(['sess-3', 'sess-2', 'sess-1']);

    // Pilot dopasowuje PIC-a ALBO Duala: dzień szkolny należy do obu.
    expect(await uuids('?pilotId=AKO')).toEqual(['sess-3', 'sess-1']);
    expect(await uuids('?pilotId=JSE')).toEqual(['sess-2']);
  });

  it('`total` opisuje cały wynik filtra, nie stronę', async () => {
    const { app, admin } = await threeDays();

    const body = (await list(app, admin, '?limit=1')).json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(3);
    expect(body.nextCursor).not.toBeNull();
  });

  it('kursor przechodzi granicę strony bez gubienia i dublowania wierszy', async () => {
    const { app, admin } = await threeDays();

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const query: string = `?limit=2${cursor == null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
      const body = (await list(app, admin, query)).json();
      seen.push(...body.items.map((i: { sessionUuid: string }) => i.sessionUuid));
      cursor = body.nextCursor;
      if (cursor == null) break;
    }

    // Trzy dni, strona po dwa: 2 + 1, każdy dokładnie raz i w porządku listy.
    expect(seen).toEqual(['sess-3', 'sess-2', 'sess-1']);
    expect(cursor).toBeNull();
  });

  it('dzień DOPISANY między stronami nie przesuwa kursora (po to jest keyset)', async () => {
    const { app, admin } = await threeDays();

    const first = (await list(app, admin, '?limit=2')).json();
    expect(first.items.map((i: { sessionUuid: string }) => i.sessionUuid)).toEqual([
      'sess-3',
      'sess-2',
    ]);

    // Telefon dosyła NOWSZY dzień - z `OFFSET 2` druga strona zaczęłaby się od
    // `sess-2` (wiersz z pierwszej strony), a `sess-1` przepadłby bez śladu.
    await post(
      app,
      admin,
      flyingDay({ sessionUuid: 'sess-4', picId: 'AKO', dayOffset: 3, mh: 1210 }),
    );

    const second = (
      await list(app, admin, `?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)
    ).json();
    expect(second.items.map((i: { sessionUuid: string }) => i.sessionUuid)).toEqual(['sess-1']);
  });

  it('uszkodzony kursor → 400, nie 500 i nie ciche wrócenie na początek', async () => {
    const { app, admin } = await threeDays();

    const res = await list(app, admin, '?cursor=to-nie-jest-kursor');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_cursor' });
  });

  it('limit ponad twardy próg jest odrzucany, nie po cichu przycinany', async () => {
    const { app, admin } = await threeDays();
    expect((await list(app, admin, '?limit=501')).statusCode).toBe(400);
    expect((await list(app, admin, '?operation=lot-w-kosmos')).statusCode).toBe(400);
  });

  it('panel CZYTA listę, pilot dostaje 403, brak tokenu 401', async () => {
    const { app } = await threeDays();

    expect((await list(app, await login(app, 'AKO'))).statusCode).toBe(200);

    const pilot = await list(app, await login(app, 'PWI'));
    expect(pilot.statusCode).toBe(403);
    expect(pilot.json()).toEqual({ error: 'forbidden', required: 'panel.access' });

    expect((await app.inject({ method: 'GET', url: '/admin/api/sessions' })).statusCode).toBe(401);
  });
});

describe('karta dnia (A02a)', () => {
  it('niesie wiersz listy, stan z `projectSession`, oś zdarzeń i flagi', async () => {
    const { app, admin } = await threeDays();

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions/sess-1',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.session).toMatchObject({ sessionUuid: 'sess-1', reg: 'SP-AXA', picCode: 'AKO' });

    // `state` to byt DOMENOWY - jedzie bez własnego DTO, w całości, żeby panel
    // formatował liczby serwera zamiast liczyć swoje.
    expect(body.state).toMatchObject({
      sessionUuid: 'sess-1',
      operation: 'skoki',
      closed: true,
      blockTimeMs: (2 * 60 + 22) * 60_000,
      flightTimeMs: 53 * 60_000,
    });
    expect(body.state.flights).toHaveLength(1);
    expect(body.state.fuel).toMatchObject({ startL: 150, endL: 88, consumedL: 62 });

    // Oś pokazuje CAŁY strumień w kolejności rejestru, bez adnotacji korekt.
    expect(body.timeline.map((e: { event: { type: string } }) => e.event.type)).toEqual([
      'session_claim',
      'preflight_confirm',
      'engine_start',
      'takeoff',
      'landing',
      'engine_stop',
      'day_close',
    ]);
    expect(body.timeline.every((e: { voided: boolean }) => !e.voided)).toBe(true);
    // Zapisy z telefonu nie mają autora z panelu.
    expect(body.timeline.every((e: { adminAuthorId: string | null }) => e.adminAuthorId === null)).toBe(
      true,
    );
    expect(body.flags).toEqual([]);
    // Dzień spójny: lista niespójności jest pusta, nie nieobecna.
    expect(body.consistency).toEqual([]);
  });

  it('`consistency` niesie TE SAME zdania, które pilot czyta na 10D, z adresem wiersza', async () => {
    // Lot bez lądowania (GPS zgubił przyziemienie): ingest przyjmuje, karta ma to nazwać.
    const { app, admin } = await threeDays();
    const day = flyingDay({ sessionUuid: 'sess-9', picId: 'AKO', dayOffset: 5, mh: 1300 }).filter(
      (e) => e.type !== 'landing',
    );
    const res = await post(app, admin, day);
    expect(res.statusCode).toBe(200);

    const card = (
      await app.inject({
        method: 'GET',
        url: '/admin/api/sessions/sess-9',
        headers: { authorization: `Bearer ${admin}` },
      })
    ).json();
    const takeoff = card.state.flights[0].takeoffUuid;
    expect(card.consistency).toMatchObject([
      { code: 'FLIGHT_WITHOUT_LANDING', severity: 'warning', details: { uuid: takeoff, flight: 1 } },
    ]);
  });

  it('oś jest CHRONOLOGICZNA także wtedy, gdy uuidy sortują się odwrotnie', async () => {
    // Regresja. Cały dzień przychodzi JEDNĄ paczką (norma offline-first: pilot lata bez
    // zasięgu, outbox leci jednym rzutem), a `received_at` bierze się z `now()`, czyli
    // z czasu ROZPOCZĘCIA TRANSAKCJI - więc dla całej paczki jest identyczny i porządek
    // rozstrzyga `uuid`, w produkcji przypadkowy.
    //
    // Poprzedni test tego nie łapał, bo jego fikstura nadaje uuidy `s-1-…`…`s-7-…`,
    // które sortują się alfabetycznie ZGODNIE z chronologią. Tutaj celowo odwrotnie:
    // gdyby oś brała kolejność z bazy, wróciłaby dokładnie na opak.
    const { app, admin } = await threeDays();

    const base = { sessionUuid: 'sess-rev', picId: 'AKO', aircraftId: 'SP-AXA', dualId: null };
    const reversed = [
      { ...event('session_claim', at(7, 50), { mode: 'free' }, base), uuid: 'zz-06-claim' },
      {
        ...event(
          'preflight_confirm',
          at(8, 0),
          {
            operation: 'skoki',
            departureIcao: 'EPKK',
            arrivalIcao: null,
            reading: { fuelL: 150, mh: 1300 },
            client: null,
            mhFormat: 'hhmm',
          },
          base,
        ),
        uuid: 'zz-05-preflight',
      },
      { ...event('engine_start', at(8, 12), {}, base), uuid: 'zz-04-engstart' },
      { ...event('takeoff', at(8, 25), { method: 'auto' }, base), uuid: 'zz-03-takeoff' },
      { ...event('landing', at(9, 18), { method: 'auto' }, base), uuid: 'zz-02-landing' },
      { ...event('engine_stop', at(10, 34), {}, base), uuid: 'zz-01-engstop' },
    ];

    const ako = await login(app, 'AKO');
    const sent = await post(app, ako, reversed);
    expect(sent.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions/sess-rev',
      headers: { authorization: `Bearer ${admin}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().timeline.map((e: { event: { type: string } }) => e.event.type)).toEqual([
      'session_claim',
      'preflight_confirm',
      'engine_start',
      'takeoff',
      'landing',
      'engine_stop',
    ]);
  });

  it('oś zdarzeń pokazuje zdarzenie UNIEWAŻNIONE, a nie ukrywa je', async () => {
    const { app, admin } = await threeDays();

    // Korekta administracyjna po zamknięciu dnia (przekrój 3) - jedyna droga, którą
    // korekta trafia do rejestru z panelu.
    const correction = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-1/corrections',
      headers: { authorization: `Bearer ${admin}`, ...ADMIN_CSRF_HEADERS },
      payload: {
        targetUuid: (
          await app.inject({
            method: 'GET',
            url: '/admin/api/sessions/sess-1',
            headers: { authorization: `Bearer ${admin}` },
          })
        ).json().state.flights[0].takeoffUuid,
        action: 'void',
        reason: 'Start wykryty przy kołowaniu - potwierdzone z pilotem.',
      },
    });
    expect(correction.statusCode).toBe(200);

    const body = (
      await app.inject({
        method: 'GET',
        url: '/admin/api/sessions/sess-1',
        headers: { authorization: `Bearer ${admin}` },
      })
    ).json();

    const takeoff = body.timeline.find(
      (e: { event: { type: string } }) => e.event.type === 'takeoff',
    );
    expect(takeoff.voided).toBe(true);
    // Rejestr jest append-only: zdarzenie ZOSTAJE na osi, razem z samą korektą.
    expect(
      body.timeline.some((e: { event: { type: string } }) => e.event.type === 'event_correction'),
    ).toBe(true);
  });

  it('oś pokazuje czas PO korekcie przy poprawionym zdarzeniu', async () => {
    const { app, clock } = await threeDays();
    // Zegar testu stoi na starcie dnia pierwszego, a korekta stempluje się „teraz":
    // bez przesunięcia nowy czas lądowania byłby dla reguł czasem Z PRZYSZŁOŚCI
    // (`CORRECTION_TIME_IN_FUTURE`) - i słusznie. Po przesunięciu token dostępu jest
    // przeterminowany, więc logujemy się jeszcze raz: to jest zachowanie produkcyjne,
    // a nie obejście testowe.
    clock.advance(4 * DAY_MS);
    const admin = await login(app, 'AKO');

    const before = (
      await app.inject({
        method: 'GET',
        url: '/admin/api/sessions/sess-1',
        headers: { authorization: `Bearer ${admin}` },
      })
    ).json();

    const landingUuid = before.state.flights[0].landingUuid;
    const correction = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-1/corrections',
      headers: { authorization: `Bearer ${admin}`, ...ADMIN_CSRF_HEADERS },
      payload: {
        targetUuid: landingUuid,
        action: 'retime',
        newTime: at(9, 30),
        reason: 'Lądowanie wykryte 12 min za późno - GPS zgubił fix na finale.',
      },
    });
    expect(correction.statusCode).toBe(200);

    const body = (
      await app.inject({
        method: 'GET',
        url: '/admin/api/sessions/sess-1',
        headers: { authorization: `Bearer ${admin}` },
      })
    ).json();

    const landing = body.timeline.find(
      (e: { event: { uuid: string } }) => e.event.uuid === landingUuid,
    );
    expect(landing.voided).toBe(false);
    expect(landing.correctedTime).toBe(at(9, 30));
    // Zapisany czas zostaje nietknięty - oś pokazuje OBA (mockup: stary przekreślony).
    expect(landing.event.gpsTime).toBe(at(9, 18));
  });

  it('`adminCorrected` odróżnia korektę PANELU od korekty pilota z okna 24 h', async () => {
    // Oba zdarzenia wyjdą z tej osi UNIEWAŻNIONE i w rejestrze wyglądają identycznie -
    // `event_correction` ma ten sam kształt niezależnie od tego, kto ją dopisał.
    // Różnica jest w tym, CZY POWSTAŁ ŚLAD: korekta administratora idzie przez
    // `AuditedWrite` i zostawia wiersz w `admin_audit`, a korekta pilota przez
    // `POST /events`, czyli z pominięciem tej bramy - dziennika nie dotyka w ogóle.
    // Panel wiesza na tym polu przejście „ślad w audycie", więc bez tego rozróżnienia
    // link prowadzi w pustkę dokładnie w przypadku NORMALNYM (korekt pilota jest
    // więcej niż administracyjnych, bo tamte są z definicji wyjątkiem).
    const { app, admin } = await threeDays();

    const card = () =>
      app
        .inject({
          method: 'GET',
          url: '/admin/api/sessions/sess-1',
          headers: { authorization: `Bearer ${admin}` },
        })
        .then((res) => res.json());

    const flight = (await card()).state.flights[0];

    // 1) KOREKTA ADMINISTRATORA - jedyna droga zapisu panelu, `source_device` = `admin:AKO`.
    const byAdmin = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-1/corrections',
      headers: { authorization: `Bearer ${admin}`, ...ADMIN_CSRF_HEADERS },
      payload: {
        targetUuid: flight.takeoffUuid,
        action: 'void',
        reason: 'Start wykryty przy kołowaniu - potwierdzone z pilotem.',
      },
    });
    expect(byAdmin.statusCode).toBe(200);

    // 2) KOREKTA PILOTA - zwykły `POST /events` z telefonu, z identyfikatorem urządzenia.
    const pilot = await login(app, 'AKO');
    const byPilot = await post(app, pilot, [
      event(
        'event_correction',
        at(23, 0),
        { targetUuid: flight.landingUuid, action: 'void' },
        { sessionUuid: 'sess-1', picId: 'AKO', aircraftId: 'SP-AXA' },
      ),
    ]);
    expect(byPilot.statusCode).toBe(200);

    const timeline = (await card()).timeline as {
      event: { uuid: string; type: string };
      voided: boolean;
      adminCorrected: boolean;
      adminAuthorId: string | null;
    }[];
    const find = (uuid: string) => timeline.find((e) => e.event.uuid === uuid)!;

    // Oba są unieważnione - po tym polu NIE DA SIĘ ich rozróżnić…
    expect([find(flight.takeoffUuid).voided, find(flight.landingUuid).voided]).toEqual([true, true]);
    // …a ślad w dzienniku ma tylko jedno z nich.
    expect(find(flight.takeoffUuid).adminCorrected).toBe(true);
    expect(find(flight.landingUuid).adminCorrected).toBe(false);

    // Sama KOREKTA (wiersz osi) niesie autora: ta z panelu konto, ta z telefonu `null`.
    const corrections = timeline.filter((e) => e.event.type === 'event_correction');
    expect(corrections.map((e) => e.adminAuthorId)).toEqual(['AKO', null]);
    expect(find(flight.takeoffUuid).adminAuthorId).toBeNull();

    // Kontrola: w `admin_audit` jest DOKŁADNIE jeden wpis `event.correct` i wskazuje
    // na zdarzenie poprawione przez panel. To jest ta sama lista, którą po kliknięciu
    // „Audyt" pokazuje `GET /admin/api/audit?targetType=event&targetId=…`.
    const audited = (
      await app.inject({
        method: 'GET',
        url: '/admin/api/audit?action=event.correct',
        headers: { authorization: `Bearer ${admin}` },
      })
    ).json() as { items: { targetId: string }[] };
    expect(audited.items.map((i) => i.targetId)).toEqual([flight.takeoffUuid]);
  });

  it('flagi dnia zawierają także ROZWIĄZANE - historia decyzji zostaje na karcie', async () => {
    const harness = await testHarness();
    const { app, db } = harness;
    const ako = await login(app, 'AKO');
    const krz = await login(app, 'KRZ');

    // Nakładka: dwie niezamknięte sesje jednego samolotu → `aircraft_overlap`.
    await post(app, ako, flyingDay({ sessionUuid: 'sess-1', picId: 'AKO', close: false }));
    await post(app, krz, flyingDay({ sessionUuid: 'sess-2', picId: 'KRZ', close: false, mh: 1240 }));

    const { rows } = await db.query<{ id: number }>('SELECT id FROM flags ORDER BY id');
    expect(rows).toHaveLength(1);

    // Pozytywna strona filtra `flagged` na PRAWDZIWEJ fladze: obie sesje nakładki.
    const flagged = (await list(app, ako, '?flagged=true')).json();
    expect(flagged.items.map((i: { sessionUuid: string }) => i.sessionUuid).sort()).toEqual([
      'sess-1',
      'sess-2',
    ]);
    // Flaga przy wierszu niesie identyfikator (link do sprawy) i liczby rozjazdu (P-D).
    expect(flagged.items[0].openFlags).toEqual([
      { id: rows[0]!.id, type: 'aircraft_overlap', details: { openSessions: 2 } },
    ]);

    await app.inject({
      method: 'POST',
      url: `/admin/api/flags/${rows[0]!.id}/resolve`,
      headers: { authorization: `Bearer ${ako}`, ...ADMIN_CSRF_HEADERS },
      payload: { note: 'Nakładka pozorna - KRZ zamknął dzień telefonicznie.' },
    });

    const body = (
      await app.inject({
        method: 'GET',
        url: '/admin/api/sessions/sess-1',
        headers: { authorization: `Bearer ${ako}` },
      })
    ).json();

    expect(body.flags).toHaveLength(1);
    expect(body.flags[0]).toMatchObject({
      type: 'aircraft_overlap',
      status: 'resolved',
      resolvedBy: 'AKO',
      // Rozwiązana nakładka już NIE blokuje karty - to samo mówi bramka eksportera.
      blocksExport: false,
    });
  });

  it('nieznana sesja → 404', async () => {
    const { app, admin } = await threeDays();

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions/nie-ma-takiej',
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

/**
 * NAGŁÓWKI DÓB (3.2.0, `docs/panel-3.2.md` §4.4): sumy jadą w TEJ SAMEJ odpowiedzi
 * co wiersze i liczą się nad CAŁYM wynikiem filtra, nie nad stroną - strona
 * kursorowa potrafi rozciąć dobę, a suma połowy doby wygląda poprawnie.
 */
describe('nagłówki dób w odpowiedzi listy', () => {
  const BLOCK_MS = (2 * 60 + 22) * 60_000;
  const FLIGHT_MS = 53 * 60_000;

  it('suma doby obejmuje CAŁĄ dobę, także tę rozciętą stroną', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const krz = await login(app, 'KRZ');
    // Trzy zamknięte operacje jednej doby na trzech maszynach + jedna W TOKU dobę później.
    expect((await post(app, ako, flyingDay({ sessionUuid: 'd-1', picId: 'AKO' }))).statusCode).toBe(200);
    expect((await post(app, krz, flyingDay({ sessionUuid: 'd-2', picId: 'KRZ', aircraftId: 'SP-FGK' }))).statusCode).toBe(200);
    expect((await post(app, krz, flyingDay({ sessionUuid: 'd-3', picId: 'KRZ', aircraftId: 'SP-ANK', dualId: 'AKO' }))).statusCode).toBe(200);
    expect((await post(app, ako, flyingDay({ sessionUuid: 'd-4', picId: 'AKO', dayOffset: 1, close: false }))).statusCode).toBe(200);

    const page = (await list(app, ako, '?from=2026-06-22&to=2026-06-23&limit=2')).json();
    // Strona ma DWA wiersze (najnowszy to operacja w toku z doby 23), a nagłówki mówią
    // prawdę o obu dobach w całości - także o dobie 22, z której na stronie stoi
    // jeden wiersz z trzech.
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(page.days).toEqual([
      { day: '2026-06-23', operations: 0, flights: 0, blockMs: 0, flightMs: 0, inProgress: 1, dual: null },
      { day: '2026-06-22', operations: 3, flights: 3, blockMs: 3 * BLOCK_MS, flightMs: 3 * FLIGHT_MS, inProgress: 0, dual: null },
    ]);
  });

  it('z filtrem pilota: sumy DOWÓDCY i osobna suma prawego fotela', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const bno = await login(app, 'BNO');
    // AKO dowódcą z BNO w prawym fotelu; BNO dowódcą na drugiej maszynie tej samej doby.
    await post(app, ako, flyingDay({ sessionUuid: 'd-5', picId: 'AKO', dualId: 'BNO' }));
    await post(app, bno, flyingDay({ sessionUuid: 'd-6', picId: 'BNO', aircraftId: 'SP-FGK' }));

    // Lista BNO niesie OBA wiersze (dzień szkolny należy do obu), ale suma dowódcy
    // liczy jeden, a lot w prawym fotelu stoi w piątej sumie - nigdy dodany do bloku.
    const asBno = (await list(app, ako, '?from=2026-06-22&to=2026-06-22&pilotId=BNO')).json();
    expect(asBno.items).toHaveLength(2);
    expect(asBno.days).toEqual([
      { day: '2026-06-22', operations: 1, flights: 1, blockMs: BLOCK_MS, flightMs: FLIGHT_MS, inProgress: 0, dual: { operations: 1, blockMs: BLOCK_MS } },
    ]);

    // Instruktor: bez lotu w prawym fotelu piąta suma jest `null`, nie parą zer.
    const asAko = (await list(app, ako, '?from=2026-06-22&to=2026-06-22&pilotId=AKO')).json();
    expect(asAko.days[0]).toMatchObject({ operations: 1, dual: null });
  });

  it('operacja unieważniona zostaje na liście, ale nie wchodzi do sum doby', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    await post(app, ako, flyingDay({ sessionUuid: 'd-7', picId: 'AKO' }));
    await post(app, ako, flyingDay({ sessionUuid: 'd-8', picId: 'AKO', aircraftId: 'SP-FGK' }));
    const voided = await app.inject({
      method: 'POST',
      url: '/admin/api/sessions/d-8/void',
      headers: { authorization: `Bearer ${ako}`, ...ADMIN_CSRF_HEADERS },
      payload: { reason: 'wpis testowy' },
    });
    expect(voided.statusCode, voided.body).toBe(200);

    const page = (await list(app, ako, '?from=2026-06-22&to=2026-06-22')).json();
    expect(page.items.map((i: { status: string }) => i.status).sort()).toEqual(['closed', 'voided']);
    expect(page.days).toEqual([
      { day: '2026-06-22', operations: 1, flights: 1, blockMs: BLOCK_MS, flightMs: FLIGHT_MS, inProgress: 0, dual: null },
    ]);
  });
});
