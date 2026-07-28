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

import { eventEnvelope } from '../src/http/routes/events.ts';
import { sessionRowFrom } from '../src/application/sessionRow.ts';

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
});
