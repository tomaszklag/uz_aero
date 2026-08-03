/**
 * UZ Aero (serwer) — test KONTRAKTU zod ↔ typ domenowy i projekcja ↔ wiersz sesji.
 *
 * To jest odpowiedź na pytanie „czy z rozwojem nie pogubimy się w modelach": zamiast
 * generatora (code-first) spójność wymuszają testy na styku warstw. Zdarzenie zbudowane
 * z TYPU domenowego musi przechodzić przez kopertę zod — nowe pole w domenie bez zmiany
 * koperty wywali ten test, a nie produkcyjny sync.
 */

import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, projectSession, type Event } from '@uzaero/domain';

import { eventEnvelope } from '../src/http/routes/mobile/events.ts';
import { sessionRowFrom } from '../src/application/common/mappers/sessionRow.ts';
import { sessionListItem } from '../src/application/admin/mappers/sessionListItem.ts';
import type { AdminSessionJoin } from '../src/application/admin/ports.ts';
import type { EventsStorePort } from '../src/application/common/ports.ts';
import { TEST_PASSWORD, testHarness } from './helpers.ts';

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
        dutyStart: at(8, 0),
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
        dutyStart: at(8, 0),
        reading: { fuelL: 150, mh: 1234.5 },
        mhFormat: 'hhmm',
      }),
      event('engine_start', at(8, 12)),
      event('engine_stop', at(10, 34)),
      event('day_close', at(16, 45), {
        finalReading: { fuelL: 88, mh: 1241.15 },
        dutyEnd: at(16, 45),
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
    // filtrować. Ich wartości muszą pochodzić z `projectSession` — sięgnięcie po
    // `payload.operation` wprost byłoby drugą implementacją tej samej reguły
    // (a `client` ma własną: dziedziczenie z pierwszego `drop`, gdy preflight go nie podał).
    const stream = [
      event('preflight_confirm', at(8, 0), {
        operation: 'skoki',
        dutyStart: at(8, 0),
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
      // `claim_time` niesie DUTY START — dlatego migracja 11 nie dokłada `duty_start`
      // (uzasadnienie: `application/sessionRow.ts`).
      claimTime: projection.dutyStart,
    });
    expect(projection.client).toBe('SKY CAMP');
  });
});

describe('DTO listy dni ↔ wiersz projekcji', () => {
  const row = sessionRowFrom('sess-1', [
    event('preflight_confirm', at(8, 0), {
      operation: 'ferry',
      dutyStart: at(8, 0),
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
      // Nazwa pola DTO idzie za ZAWARTOŚCIĄ kolumny, nie za jej nazwą.
      dutyStart: row.claimTime,
    });
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
        dutyStart: at(8, 0),
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

  /** Dekorator liczący odczyty strumienia — opakowuje PRAWDZIWY adapter, nie udaje go. */
  function counting(real: EventsStorePort): EventsStorePort & { reads: number } {
    const spy = {
      reads: 0,
      insertBatch: real.insertBatch.bind(real),
      lastReceivedAt: real.lastReceivedAt.bind(real),
      countForSession: real.countForSession.bind(real),
      sessionEvents: (...args: Parameters<EventsStorePort['sessionEvents']>) => {
        spy.reads += 1;
        return real.sessionEvents(...args);
      },
    };
    return spy;
  }

  it('lista NIE wczytuje strumienia ani razu, karta dnia wczytuje go DOKŁADNIE raz', async () => {
    // To jest wykonywalna wersja reguły z `docs/architektura-panelu-serwer.md` §7.5.
    // Wersja zapisana wyłącznie w dokumencie przestaje obowiązywać przy pierwszym
    // „przecież tu wystarczy policzyć jedną rzecz ze zdarzeń" — a wtedy strona listy
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
      url: '/auth/login',
      payload: { login: 'TMK', password: TEST_PASSWORD },
    });
    const token = login.json().token as string;
    const auth = { authorization: `Bearer ${token}` };

    await app.inject({ method: 'POST', url: '/events', headers: auth, payload: { events: DAY_STREAM } });

    const counter = spy as unknown as { reads: number };
    counter.reads = 0;

    const list = await app.inject({ method: 'GET', url: '/admin/api/sessions', headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(counter.reads).toBe(0);

    const detail = await app.inject({
      method: 'GET',
      url: '/admin/api/sessions/sess-1',
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    expect(counter.reads).toBe(1);
  });
});
