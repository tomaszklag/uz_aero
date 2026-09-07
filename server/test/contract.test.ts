/**
 * UZ Aero (serwer) - test KONTRAKTU zod ↔ typ domenowy i projekcja ↔ wiersz sesji.
 *
 * To jest odpowiedź na pytanie „czy z rozwojem nie pogubimy się w modelach": zamiast
 * generatora (code-first) spójność wymuszają testy na styku warstw. Zdarzenie zbudowane
 * z TYPU domenowego musi przechodzić przez kopertę zod - nowe pole w domenie bez zmiany
 * koperty wywali ten test, a nie produkcyjny sync.
 */

import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, projectSession, type Event } from '@uzaero/domain';

import { eventEnvelope } from '../src/http/routes/mobile/events.ts';
import { sessionRowFrom } from '../src/application/common/mappers/sessionRow.ts';
import { sessionListItem } from '../src/application/admin/mappers/sessionListItem.ts';
import type { AdminSessionJoin } from '../src/application/admin/ports.ts';
import type { EventsStorePort } from '../src/application/common/ports.ts';
import { testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

let seq = 0;
function event(type: Event['type'], time: number, payload: object = {}): Event {
  seq += 1;
  return {
    uuid: `e-${seq}-${type}`,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
    syncedAt: null,
  } as Event;
}

describe('koperta zod ↔ typ domenowy', () => {
  it('zdarzenie zbudowane z typu domenowego przechodzi przez kopertę', () => {
    const samples: Event[] = [
      event('engine_start', at(8, 12), { fieldElevationFt: 800 }),
      event('takeoff', at(8, 25), { method: 'auto' }),
      event('drop', at(8, 48), {
        dropNumber: 1,
        jumpers: { tandem: 2, aff: 1, solo: 1 },
        altitudeFt: 3200,
      }),
      event('event_correction', at(10, 0), { targetUuid: 'e-2-takeoff', action: 'void' }),
    ];

    for (const sample of samples) {
      const { syncedAt: _clientOnly, ...wire } = sample as Event & { syncedAt: unknown };
      const parsed = eventEnvelope.safeParse(wire);
      expect(parsed.success, `koperta odrzuciła ${sample.type}`).toBe(true);
    }
  });

  it('koperta zna KAŻDY typ zdarzenia z domeny', () => {
    // Nowy typ w EVENT_TYPES bez aktualizacji koperty = sync odrzuca legalne zdarzenia.
    for (const type of EVENT_TYPES) {
      const parsed = eventEnvelope.safeParse({
        ...event(type as Event['type'], at(9, 0)),
        syncedAt: undefined,
      });
      expect(parsed.success, `typ ${type} nie przechodzi`).toBe(true);
    }
  });

  it('kopertę zatrzymuje to, co zatrzymać powinna', () => {
    const good = event('takeoff', at(8, 25), { method: 'auto' });
    expect(eventEnvelope.safeParse({ ...good, type: 'made_up' }).success).toBe(false);
    expect(eventEnvelope.safeParse({ ...good, deviceTime: -5 }).success).toBe(false);
    expect(eventEnvelope.safeParse({ ...good, uuid: 'x' }).success).toBe(false);
  });
});

describe('projekcja domenowa ↔ wiersz sesji', () => {
  it('wiersz sessions odtwarza liczby projekcji, nie liczy własnych', () => {
    const stream = [
      event('preflight_confirm', at(8, 0), {
        operation: 'skoki',
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
      }),
      event('engine_start', at(8, 12)),
      event('takeoff', at(8, 25), { method: 'auto' }),
      event('landing', at(9, 18), { method: 'auto' }),
      event('engine_stop', at(10, 34)),
    ];

    const row = sessionRowFrom('sess-1', stream);
    const projection = projectSession(stream);

    expect(row).toMatchObject({
      status: 'active',
      mhStart: 1234.5,
      mhEnd: null, // odczyt końcowy istnieje dopiero po day_close
      fuelStartL: 150,
      blockMs: projection.blockTimeMs,
      flightMs: projection.flightTimeMs,
      flightsCount: 1,
    });
  });

  it('day_close domyka wiersz: status, odczyty końcowe, czas zamknięcia', () => {
    const stream = [
      event('preflight_confirm', at(8, 0), {
        operation: 'skoki',
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
      }),
      event('engine_start', at(8, 12)),
      event('engine_stop', at(10, 34)),
      event('day_close', at(16, 45), {
        finalReading: { fuelL: 88, mh: 1241.15 },
      }),
    ];

    expect(sessionRowFrom('sess-1', stream)).toMatchObject({
      status: 'closed',
      mhEnd: 1241.15,
      fuelEndL: 88,
      closeTime: at(16, 45),
    });
  });

  it('kolumny WYMIARÓW panelu też są przepisane z projekcji, nie z payloadu', () => {
    // Migracja 11 dołożyła `operation` i `client` PO to, żeby lista dni miała po czym
    // filtrować. Ich wartości muszą pochodzić z `projectSession` - sięgnięcie po
    // `payload.operation` wprost byłoby drugą implementacją tej samej reguły
    // (a `client` ma własną: dziedziczenie z pierwszego `drop`, gdy preflight go nie podał).
    const stream = [
      event('preflight_confirm', at(8, 0), {
        operation: 'skoki',
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
      }),
      event('drop', at(8, 48), {
        dropNumber: 1,
        jumpers: { tandem: 2, aff: 0, solo: 0 },
        client: 'SKY CAMP',
      }),
    ];

    const projection = projectSession(stream);
    expect(sessionRowFrom('sess-1', stream)).toMatchObject({
      operation: projection.operation,
      client: projection.client,
      // `claim_time` niesie CHWILĘ PRZEJĘCIA (decyzja 2026-08-07). Klamry służby w `sessions`
      // nie ma i nie ma jej być: należy do pilota, nie do sesji samolotu (§3.6a).
      claimTime: projection.claimedAt,
    });
    expect(projection.client).toBe('SKY CAMP');
  });

  it('kolumny STATYSTYK (kolumny statystyk) też są przepisane z projekcji, nie policzone', () => {
    // Ta sama reguła, co przy `operation`/`client`: agregaty `A10` sumują wartości projekcji,
    // więc każda z nich musi mieć kolumnę wypełnianą przez `sessionRowFrom` - razem
    // z regułami projekcji („bilans istnieje dopiero z `day_close`", „zrzut bez
    // wysokości nie wchodzi ani do sumy, ani do licznika fixów").
    const openStream = [
      event('preflight_confirm', at(8, 0), {
        operation: 'skoki',
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
      }),
      event('engine_start', at(8, 12)),
      event('takeoff', at(8, 25), { method: 'auto' }),
      event('drop', at(8, 48), {
        dropNumber: 1,
        jumpers: { tandem: 2, aff: 1, solo: 0 },
        altitudeFt: 3200,
      }),
      event('drop', at(9, 2), {
        dropNumber: 2,
        jumpers: { tandem: 0, aff: 0, solo: 4 },
        // Celowo BEZ `altitudeFt` - nie może wejść ani do sumy, ani do licznika.
      }),
      event('landing', at(9, 18), { method: 'auto' }),
      event('engine_stop', at(10, 34)),
    ];

    const open = projectSession(openStream);
    expect(sessionRowFrom('sess-1', openStream)).toMatchObject({
      takeoffCount: open.takeoffCount,
      landingCount: open.landingCount,
      dropCount: open.drops.count,
      jumpersTandem: open.drops.jumpers.tandem,
      jumpersAff: open.drops.jumpers.aff,
      jumpersSolo: open.drops.jumpers.solo,
      dropAltSumFt: open.drops.altitudeSumFt,
      dropAltCount: open.drops.altitudeFixCount,
      // Dzień OTWARTY: bilansów NIE MA - null projekcji zostaje null-em wiersza.
      mhDeltaH: null,
      fuelConsumedL: null,
    });
    expect(open.drops.altitudeSumFt).toBe(3200);
    expect(open.drops.altitudeFixCount).toBe(1);

    const closedStream = [
      ...openStream,
      event('day_close', at(16, 45), {
        finalReading: { fuelL: 88, mh: 1241.15 },
      }),
    ];
    const closed = projectSession(closedStream);
    expect(sessionRowFrom('sess-1', closedStream)).toMatchObject({
      mhDeltaH: closed.mh.deltaH,
      fuelConsumedL: closed.fuel.consumedL,
    });
    expect(closed.fuel.consumedL).toBe(150 - 88);
  });
});

describe('DTO listy dni ↔ wiersz projekcji', () => {
  const row = sessionRowFrom('sess-1', [
    event('preflight_confirm', at(8, 0), {
      operation: 'ferry',
      reading: { fuelL: 150, mh: 1234.5 },
      mhFormat: 'hhmm',
    }),
    event('engine_start', at(8, 12)),
    event('takeoff', at(8, 25), { method: 'auto' }),
    event('landing', at(9, 18), { method: 'auto' }),
    event('engine_stop', at(10, 34)),
  ]);

  const join: AdminSessionJoin = {
    row,
    dayIndex: 2,
    // Kotwica numeracji z zapytania (issue #75) - dla biegu silnika to chwila
    // jego uruchomienia; mapper NIE liczy jej sam.
    signatureAt: row.engineStartAt,
    reg: 'SP-AXA',
    aircraftType: 'Cessna 182',
    mhFormat: 'hhmm',
    picCode: 'TMK',
    picName: 'Tomasz Małkiewicz',
    dualCode: null,
    dualName: null,
    openFlags: [],
    exportRevision: null,
    updatedAt: new Date(at(10, 35)),
  };

  it('mapper jest CZYSTĄ funkcją i tylko PRZEPISUJE liczby projekcji', () => {
    // Ten sam wzorzec, co `sessionRowFrom`: testowalny bez bazy. Gdyby mapper cokolwiek
    // liczył (choćby deltę MH), byłoby to drugie wyliczenie obok projekcji.
    const item = sessionListItem(join);

    expect(item).toMatchObject({
      blockMs: row.blockMs,
      flightMs: row.flightMs,
      flightsCount: row.flightsCount,
      mhStart: row.mhStart,
      mhEnd: row.mhEnd,
      fuelStartL: row.fuelStartL,
      fuelEndL: row.fuelEndL,
      operation: row.operation,
      client: row.client,
      // Od 2026-08-07 nazwa kolumny i nazwa pola DTO znaczą to samo.
      claimedAt: row.claimTime,
    });
  });

  /**
   * SYGNATURA (issue #68) - jedyne pole DTO, które POWSTAJE w mapperze, a nie jest
   * przepisane. Nie jest to wyłom: składa je domena (`operationSignature`), a mapper
   * dostarcza jej cztery gotowe fakty. Test pilnuje, że bierze je z właściwych miejsc -
   * doba idzie z URUCHOMIENIA SILNIKA (08:12), a nie z przejęcia.
   */
  it('składa sygnaturę operacji ze złączeń i kolumn projekcji', () => {
    expect(sessionListItem(join).signature).toBe('SP-AXA/2026-06-22/TMK/2');
  });

  it('nie ma sygnatury bez któregokolwiek członu - napis z kreską nie identyfikuje', () => {
    expect(sessionListItem({ ...join, picCode: null }).signature).toBeNull();
    expect(sessionListItem({ ...join, reg: null }).signature).toBeNull();
    expect(sessionListItem({ ...join, dayIndex: null }).signature).toBeNull();
  });
});

describe('granica: listy panelu nie odtwarzają projekcji ze strumienia', () => {
  const DAY_STREAM = [
    {
      uuid: 'contract-preflight-1',
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type: 'preflight_confirm',
      deviceTime: at(8, 0),
      gpsTime: at(8, 0),
      payload: {
        operation: 'skoki',
        departureIcao: 'EPKK',
        arrivalIcao: null,
        reading: { fuelL: 150, mh: 1234.5 },
        client: null,
        mhFormat: 'hhmm',
      },
      schemaVersion: 1,
    },
    {
      uuid: 'contract-engine-start-1',
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type: 'engine_start',
      deviceTime: at(8, 12),
      gpsTime: at(8, 12),
      payload: {},
      schemaVersion: 1,
    },
  ];

  /**
   * Dekorator liczący odczyty strumienia - opakowuje PRAWDZIWY adapter, nie udaje go.
   *
   * Liczy OBIE drogi do rejestru osobno: `reads` to odczyty pojedynczej sesji, `bulkReads`
   * to odczyty wielosesyjne (analityka zużycia, `A10a`). Rozdzielenie jest istotne - reguła
   * §7.5 mówi, że listy nie odtwarzają projekcji ze strumienia ŻADNĄ z tych dróg, a nowa
   * metoda portu byłaby inaczej furtką poza tym licznikiem.
   */
  function counting(real: EventsStorePort): EventsStorePort & { reads: number; bulkReads: number } {
    const spy = {
      reads: 0,
      bulkReads: 0,
      insertBatch: real.insertBatch.bind(real),
      lastReceivedAt: real.lastReceivedAt.bind(real),
      countForSession: real.countForSession.bind(real),
      sessionEvents: (...args: Parameters<EventsStorePort['sessionEvents']>) => {
        spy.reads += 1;
        return real.sessionEvents(...args);
      },
      sessionStreams: (...args: Parameters<EventsStorePort['sessionStreams']>) => {
        spy.bulkReads += 1;
        return real.sessionStreams(...args);
      },
    };
    return spy;
  }

  it('lista NIE wczytuje strumienia ani razu, karta dnia wczytuje go DOKŁADNIE raz', async () => {
    // To jest wykonywalna wersja reguły z `docs/architektura-panelu-serwer.md` §7.5.
    // Wersja zapisana wyłącznie w dokumencie przestaje obowiązywać przy pierwszym
    // „przecież tu wystarczy policzyć jedną rzecz ze zdarzeń" - a wtedy strona listy
    // to N pełnych strumieni.
    let spy: ReturnType<typeof counting> | null = null;
    const { app } = await testHarness({
      events: (real) => {
        spy = counting(real);
        return spy;
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('TMK') },
    });
    const token = login.json().token as string;
    const auth = { authorization: `Bearer ${token}` };

    await app.inject({ method: 'POST', url: '/events', headers: auth, payload: { events: DAY_STREAM } });

    const counter = spy as unknown as { reads: number; bulkReads: number };
    counter.reads = 0;
    counter.bulkReads = 0;

    const list = await app.inject({ method: 'GET', url: '/admin/api/sessions', headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(counter.reads).toBe(0);
    // Nowa droga do rejestru (`sessionStreams`) musi być tak samo zamknięta dla list
    // jak stara - inaczej reguła §7.5 obowiązywałaby tylko jedną z nich.
    expect(counter.bulkReads).toBe(0);

    const detail = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions/sess-1',
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    expect(counter.reads).toBe(1);
    expect(counter.bulkReads).toBe(0);
  });

  it('analityka zużycia czyta strumienie JEDNYM zapytaniem, nie sesja po sesji', async () => {
    // Wykonywalna wersja §7.7: analityka wolno czytać rejestr, ale nie wolno jej robić
    // tego w pętli. Przy oknie rocznym byłoby to dwieście round-tripów na jedno wejście
    // na ekran - dokładnie ten koszt, którego kursor i projekcje mają nie dopuszczać.
    let spy: ReturnType<typeof counting> | null = null;
    const { app } = await testHarness({
      events: (real) => {
        spy = counting(real);
        return spy;
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('TMK') },
    });
    const token = login.json().token as string;
    const auth = { authorization: `Bearer ${token}` };

    await app.inject({ method: 'POST', url: '/events', headers: auth, payload: { events: DAY_STREAM } });

    const counter = spy as unknown as { reads: number; bulkReads: number };
    counter.reads = 0;
    counter.bulkReads = 0;

    const report = await app.inject({
      method: 'GET',
      url: '/admin/api/fleet/SP-AXA/consumption',
      headers: auth,
    });

    expect(report.statusCode).toBe(200);
    expect(counter.bulkReads).toBe(1);
    expect(counter.reads).toBe(0);
  });
});

describe('agregat statystyk = suma projekcji (wykonywalna wersja „panel nie liczy po swojemu")', () => {
  /** Zdarzenie w formacie DRUTU (`POST /events`) - bez `syncedAt`. */
  let wireSeq = 0;
  function wire(
    sessionUuid: string,
    aircraftId: string,
    type: string,
    time: number,
    payload: object = {},
  ) {
    wireSeq += 1;
    return {
      uuid: `stat-${wireSeq}-${type}`,
      sessionUuid,
      aircraftId,
      picId: 'TMK',
      dualId: null,
      type,
      deviceTime: time,
      gpsTime: time,
      payload,
      schemaVersion: 1,
    };
  }

  const closedDay = (sessionUuid: string, aircraftId: string, mh: number, fuelEnd: number) => [
    wire(sessionUuid, aircraftId, 'preflight_confirm', at(8, 0), {
      operation: 'skoki',
      reading: { fuelL: 150, mh },
      client: 'SKY CAMP',
      mhFormat: 'hhmm',
    }),
    wire(sessionUuid, aircraftId, 'engine_start', at(8, 12)),
    wire(sessionUuid, aircraftId, 'takeoff', at(8, 25), { method: 'auto' }),
    wire(sessionUuid, aircraftId, 'drop', at(8, 48), {
      dropNumber: 1,
      jumpers: { tandem: 2, aff: 1, solo: 1 },
      altitudeFt: 3200,
    }),
    wire(sessionUuid, aircraftId, 'landing', at(9, 18), { method: 'auto' }),
    wire(sessionUuid, aircraftId, 'engine_stop', at(10, 34)),
    wire(sessionUuid, aircraftId, 'day_close', at(16, 45), {
      finalReading: { fuelL: fuelEnd, mh: mh + 2.2 },
    }),
  ];

  it('GET /admin/api/stats oddaje DOKŁADNIE sumy projectSession policzone w teście', async () => {
    // To jest przypadek z `docs/architektura-panelu-serwer.md` §7.6 pkt 2: dwa zamknięte
    // dni, agregat trasy vs suma `projectSession` policzona TUTAJ, na tych samych
    // strumieniach. Gdyby SQL zaczął liczyć po swojemu (np. `SUM(mh_end - mh_start)`
    // zamiast `SUM(mh_delta_h)`), ta równość pęka pierwsza.
    const { app } = await testHarness();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/google',
      payload: { idToken: googleTokenFor('TMK') },
    });
    const auth = { authorization: `Bearer ${login.json().token as string}` };

    const dayA = closedDay('stat-a', 'SP-AXA', 1200, 88);
    const dayB = closedDay('stat-b', 'SP-FGK', 500, 96);
    for (const events of [dayA, dayB]) {
      const res = await app.inject({ method: 'POST', url: '/events', headers: auth, payload: { events } });
      expect(res.statusCode).toBe(200);
    }

    const projections = [dayA, dayB].map((events) => projectSession(events as unknown as Event[]));
    const sum = (pick: (s: ReturnType<typeof projectSession>) => number): number =>
      projections.reduce((acc, s) => acc + pick(s), 0);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/stats?from=2026-06-22&to=2026-06-22',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const totals = res.json().totals;

    expect(totals.sessions).toBe(2);
    expect(totals.blockMs).toBe(sum((s) => s.blockTimeMs));
    expect(totals.flightMs).toBe(sum((s) => s.flightTimeMs));
    expect(totals.takeoffs).toBe(sum((s) => s.takeoffCount));
    expect(totals.landings).toBe(sum((s) => s.landingCount));
    expect(totals.fuelConsumedL).toBeCloseTo(sum((s) => s.fuel.consumedL!), 9);
    expect(totals.mhDeltaH).toBeCloseTo(sum((s) => s.mh.deltaH!), 9);

    const drops = res.json().drops;
    expect(drops.lifts).toBe(sum((s) => s.drops.count));
    expect(drops.jumpers).toBe(sum((s) => s.drops.totalJumpers));
    // Średnia zakresu z SUM wysokości i LICZNIKA fixów - nie ze średnich per sesja.
    expect(drops.avgAltitudeFt).toBeCloseTo(
      sum((s) => s.drops.altitudeSumFt) / sum((s) => s.drops.altitudeFixCount),
      9,
    );
  });
});
