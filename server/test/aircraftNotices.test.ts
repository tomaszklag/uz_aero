/**
 * Ninerdeck (serwer) - BRZMIENIE powiadomień o obserwowanej maszynie (3.2.0, issue #205;
 * `docs/obserwowanie-samolotu.md` §5).
 *
 * Czyste treści, jak `bookingNotices`: test pyta o adresatów, o to, czego push NIE
 * niesie (nazwisk i godzin), i o czas Z REJESTRU w payloadzie - a nie ogląda telefonu.
 */

import { describe, expect, it } from 'vitest';

import {
  aircraftEngineStarted,
  aircraftFlightCancelled,
  aircraftFlightSoon,
  aircraftNotTaken,
  aircraftReleased,
  soonBody,
} from '../src/application/common/notify/aircraftNotices.ts';

const MIN = 60_000;
const T = Date.UTC(2026, 5, 22, 8, 12);
const AUDIENCE = { pilotIds: ['KRZ', 'BNO'], reg: 'SP-AXA' };
const BOOKING = {
  id: 'b-1',
  aircraftId: 'SP-AXA',
  pilotId: 'AKO',
  dualId: 'JSE',
  startsAt: T + 60 * MIN,
  endsAt: T + 180 * MIN,
};

describe('adresaci i to, czego push nie niesie', () => {
  it('jedna wiadomość na każdego z listy - i dla nikogo spoza niej', () => {
    const drafts = aircraftFlightSoon(AUDIENCE, BOOKING, T);
    expect(drafts.map((d) => d.pilotId)).toEqual(['KRZ', 'BNO']);
    expect(drafts.every((d) => d.kind === 'aircraft_flight_soon')).toBe(true);
    expect(aircraftFlightSoon({ pilotIds: [], reg: 'SP-AXA' }, BOOKING, T)).toEqual([]);
  });

  it('push nazywa maszynę ZNAKIEM, ale nie niesie ani nazwiska, ani godziny terminu', () => {
    const all = [
      ...aircraftFlightSoon(AUDIENCE, BOOKING, T),
      ...aircraftFlightCancelled(AUDIENCE, BOOKING, null),
      ...aircraftEngineStarted(AUDIENCE, {
        sessionUuid: 's-1',
        aircraftId: 'SP-AXA',
        pilotId: 'AKO',
        dualId: 'JSE',
        at: T,
        planned: false,
        bookingId: null,
      }),
      ...aircraftReleased(AUDIENCE, {
        sessionUuid: 's-1',
        aircraftId: 'SP-AXA',
        pilotId: 'AKO',
        dualId: null,
        at: T + 120 * MIN,
        engineStartAt: T,
        engineStopAt: T + 100 * MIN,
        blockMs: 100 * MIN,
        flights: 2,
        fuelEndL: 88,
        mhEnd: 1241.15,
        noFlightReason: null,
        closedBy: 'pilot',
        reason: null,
      }),
      ...aircraftNotTaken(AUDIENCE, BOOKING),
    ];
    for (const draft of all) {
      const push = `${draft.push.title} ${draft.push.body}`;
      expect(draft.push.title).toContain('SP-AXA');
      // Identyfikatory osób i godziny zostają w SKRZYNCE - budzik ląduje na ekranie
      // blokady, który widzi każdy, kto akurat patrzy na telefon.
      expect(push).not.toMatch(/AKO|JSE|KRZ|BNO/);
      expect(push).not.toMatch(/\d{1,2}:\d{2}/);
      // Payload za to niesie identyfikatory - z nich aplikacja rozwiąże znak i nazwisko.
      expect(draft.payload.aircraftId).toBe('SP-AXA');
    }
  });
});

describe('„zbliża się lot" - wyprzedzenie z terminu w chwili wysyłki', () => {
  it('godzina przed startem mówi „za godzinę", mniej - w minutach, termin trwający - że się zaczyna', () => {
    expect(soonBody(60 * MIN)).toBe('Za godzinę.');
    expect(soonBody(57 * MIN)).toBe('Za godzinę.');
    expect(soonBody(30 * MIN)).toBe('Za 30 min.');
    expect(soonBody(20 * 1000)).toBe('Za 1 min.');
    expect(soonBody(0)).toBe('Termin właśnie się zaczyna.');
    expect(soonBody(-5 * MIN)).toBe('Termin właśnie się zaczyna.');
  });

  it('payload niesie termin, właściciela i drugiego pilota - do doby klubu dolicza trasa skrzynki', () => {
    const [draft] = aircraftFlightSoon(AUDIENCE, BOOKING, T + 30 * MIN);
    expect(draft!.push.body).toBe('Za 30 min.');
    expect(draft!.payload).toEqual({
      bookingId: 'b-1',
      aircraftId: 'SP-AXA',
      pilotId: 'AKO',
      dualId: 'JSE',
      startsAt: new Date(BOOKING.startsAt).toISOString(),
      endsAt: new Date(BOOKING.endsAt).toISOString(),
    });
  });
});

describe('operacja - czas Z REJESTRU, nie chwila dotarcia paczki', () => {
  it('uruchomienie niesie chwilę `engine_start` i adnotację planu', () => {
    const planned = aircraftEngineStarted(AUDIENCE, {
      sessionUuid: 's-1',
      aircraftId: 'SP-AXA',
      pilotId: 'AKO',
      dualId: null,
      at: T,
      planned: true,
      bookingId: 'b-1',
    })[0]!;
    expect(planned.kind).toBe('aircraft_engine_started');
    expect(planned.payload.at).toBe('2026-06-22T08:12:00.000Z');
    expect(planned.payload.planned).toBe(true);
    expect(planned.payload.bookingId).toBe('b-1');
    expect(planned.push).toEqual({
      title: 'SP-AXA uruchomiona',
      body: 'Uruchomienie silnika · zgodnie z planem.',
    });

    const unplanned = aircraftEngineStarted(AUDIENCE, {
      sessionUuid: 's-2',
      aircraftId: 'SP-AXA',
      pilotId: 'AKO',
      dualId: null,
      at: T,
      planned: false,
      bookingId: null,
    })[0]!;
    expect(unplanned.push.body).toBe('Uruchomienie silnika · poza planem.');
  });

  it('zdana niesie odczyty i czasy biegu; zakończenie z panelu - powód i BEZ odczytów', () => {
    const base = {
      sessionUuid: 's-1',
      aircraftId: 'SP-AXA',
      pilotId: 'AKO',
      dualId: null,
      at: T + 120 * MIN,
      engineStartAt: T,
      engineStopAt: T + 100 * MIN,
      blockMs: 100 * MIN,
      flights: 2,
    };
    const byPilot = aircraftReleased(AUDIENCE, {
      ...base,
      fuelEndL: 88,
      mhEnd: 1241.15,
      noFlightReason: null,
      closedBy: 'pilot',
      reason: null,
    })[0]!;
    expect(byPilot.push).toEqual({ title: 'SP-AXA zdana', body: 'Wróciła z odczytami.' });
    expect(byPilot.payload).toMatchObject({
      at: '2026-06-22T10:12:00.000Z',
      engineStartAt: '2026-06-22T08:12:00.000Z',
      fuelEndL: 88,
      mhEnd: 1241.15,
      flights: 2,
      closedBy: 'pilot',
    });

    const noFlight = aircraftReleased(AUDIENCE, {
      ...base,
      flights: 0,
      engineStartAt: null,
      engineStopAt: null,
      blockMs: 0,
      fuelEndL: 150,
      mhEnd: 1234.5,
      noFlightReason: 'weather',
      closedBy: 'pilot',
      reason: null,
    })[0]!;
    expect(noFlight.push.body).toBe('Zdana bez lotu.');
    expect(noFlight.payload.noFlightReason).toBe('weather');

    const byAdmin = aircraftReleased(AUDIENCE, {
      ...base,
      fuelEndL: null,
      mhEnd: null,
      noFlightReason: null,
      closedBy: 'admin',
      reason: 'pilot nie zdał, maszyna w hangarze',
    })[0]!;
    expect(byAdmin.push.body).toBe('Operację zakończył administrator.');
    expect(byAdmin.payload).toMatchObject({
      closedBy: 'admin',
      reason: 'pilot nie zdał, maszyna w hangarze',
      fuelEndL: null,
      mhEnd: null,
    });
  });
});

describe('termin przypomniany, potem zmieniony', () => {
  it('odwołanie niesie STARY termin, przesunięcie także nowy', () => {
    const cancelled = aircraftFlightCancelled(AUDIENCE, BOOKING, null)[0]!;
    expect(cancelled.kind).toBe('aircraft_flight_cancelled');
    expect(cancelled.push).toEqual({ title: 'Odwołany lot · SP-AXA', body: 'Termin odwołano.' });
    expect(cancelled.payload.startsAt).toBe(new Date(BOOKING.startsAt).toISOString());
    expect(cancelled.payload.movedTo).toBeNull();

    const moved = aircraftFlightCancelled(AUDIENCE, BOOKING, {
      startsAt: BOOKING.startsAt + 120 * MIN,
      endsAt: BOOKING.endsAt + 120 * MIN,
    })[0]!;
    expect(moved.push.body).toBe('Termin przesunięto.');
    expect(moved.payload.movedTo).toEqual({
      startsAt: new Date(BOOKING.startsAt + 120 * MIN).toISOString(),
      endsAt: new Date(BOOKING.endsAt + 120 * MIN).toISOString(),
    });
  });

  it('„nie odebrano" opisuje termin jak przypomnienie', () => {
    const [draft] = aircraftNotTaken(AUDIENCE, BOOKING);
    expect(draft!.kind).toBe('aircraft_not_taken');
    expect(draft!.push.title).toBe('Nie odebrano · SP-AXA');
    expect(draft!.payload.bookingId).toBe('b-1');
  });
});
