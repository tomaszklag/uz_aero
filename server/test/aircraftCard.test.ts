/**
 * Ninerdeck (serwer) - KARTA MASZYNY: stan „teraz" i serie wykresów (3.2.0, issue #205;
 * `domain/aircraftCard.ts`, `docs/obserwowanie-samolotu.md` §6.3, §6.4).
 *
 * Rachunek jest czysty, więc test podaje wiersze projekcji i zajętości z ręki i pyta
 * o PIERWSZEŃSTWO stanów oraz o to, co wchodzi na wykres, a co nie.
 */

import { describe, expect, it } from 'vitest';

import type { AdminReading, BookingRecord, SessionRow } from '../src/application/common/ports.ts';
import { aircraftNow, fuelSeries, mhSeries } from '../src/domain/aircraftCard.ts';
import { ORG_A } from './testWorld.ts';

const H = 3_600_000;
const NOW = Date.UTC(2026, 5, 22, 12, 0);

/** Operacja ZAMKNIĘTA z lotem; resztę nadpisuje test. */
function session(over: Partial<SessionRow> & { sessionUuid: string; at: number }): SessionRow {
  const { at, ...rest } = over;
  return {
    orgId: ORG_A,
    aircraftId: 'SP-AXA',
    picId: 'PWI',
    dualId: null,
    status: 'closed',
    claimTime: at,
    closeTime: at + 3 * H,
    operation: 'ferry',
    client: null,
    notes: null,
    mhStart: 1200,
    mhEnd: 1201.5,
    fuelStartL: 200,
    fuelEndL: 150,
    fuelLastL: 150,
    mhLast: 1201.5,
    blockMs: 100 * 60_000,
    flightMs: 80 * 60_000,
    flightsCount: 2,
    takeoffCount: 2,
    landingCount: 2,
    mhDeltaH: 1.5,
    fuelConsumedL: 50,
    dropCount: null,
    jumpersTandem: null,
    jumpersAff: null,
    jumpersSolo: null,
    dropAltSumFt: null,
    dropAltCount: null,
    oilLevelL: null,
    oilAddedL: null,
    engineStartAt: at + 10 * 60_000,
    engineStopAt: at + 110 * 60_000,
    firstTakeoffAt: at + 20 * 60_000,
    lastLandingAt: at + 100 * 60_000,
    departureIcao: 'EPKK',
    arrivalIcao: 'EPKK',
    fuelAddedL: null,
    manualEntry: false,
    oilAfterL: null,
    ...rest,
  };
}

function booking(over: Partial<BookingRecord> & { id: string }): BookingRecord {
  return {
    aircraftId: 'SP-AXA',
    kind: 'flight',
    status: 'confirmed',
    startsAt: NOW - H,
    endsAt: NOW + H,
    pilotId: 'JSE',
    dualId: null,
    operation: 'skoki',
    fromIcao: null,
    toIcao: null,
    plannedAirMin: null,
    plannedFuelL: null,
    sessionUuid: null,
    blockReason: null,
    note: null,
    createdBy: 'JSE',
    createdAt: NOW - 24 * H,
    updatedAt: NOW - 24 * H,
    closedAt: null,
    closeReason: null,
    remindedAt: null,
    ...over,
  };
}

const now = (over: { serviceStatus?: 'active' | 'disabled'; sessions?: SessionRow[]; bookings?: BookingRecord[] }) =>
  aircraftNow({
    serviceStatus: over.serviceStatus ?? 'active',
    sessions: over.sessions ?? [],
    bookings: over.bookings ?? [],
    now: NOW,
  });

describe('stan teraz - pierwszeństwo od góry (§6.3)', () => {
  const flying = session({ sessionUuid: 'flying', at: NOW - H, status: 'active', engineStopAt: null, closeTime: null, mhEnd: null, fuelEndL: null });

  it('WYCOFANA z użytku wygrywa ze wszystkim - także z operacją w toku', () => {
    expect(now({ serviceStatus: 'disabled', sessions: [flying] })).toEqual({ kind: 'retired' });
  });

  it('operacja w toku: w locie → przejęta → po locie, wg biegu silnika', () => {
    expect(now({ sessions: [flying] })).toEqual({
      kind: 'flying',
      sessionUuid: 'flying',
      pilotId: 'PWI',
      dualId: null,
      since: NOW - H + 10 * 60_000,
    });
    const claimed = session({ sessionUuid: 'claimed', at: NOW - H, status: 'active', engineStartAt: null, engineStopAt: null, closeTime: null });
    expect(now({ sessions: [claimed] })).toMatchObject({ kind: 'claimed', since: NOW - H });
    const after = session({ sessionUuid: 'after', at: NOW - 3 * H, status: 'active', closeTime: null });
    expect(now({ sessions: [after] })).toMatchObject({ kind: 'after_flight', since: NOW - 3 * H + 110 * 60_000 });
  });

  it('operacja w toku wygrywa z wyłączeniem i rezerwacją; przy dwóch w toku liczy się ostatnio przejęta', () => {
    const block = booking({ id: 'blk', kind: 'block', pilotId: null, blockReason: 'przegląd' });
    expect(now({ sessions: [flying], bookings: [block] }).kind).toBe('flying');
    const older = session({ sessionUuid: 'older', at: NOW - 5 * H, status: 'active', engineStartAt: null, engineStopAt: null, closeTime: null });
    expect(now({ sessions: [older, flying] })).toMatchObject({ kind: 'flying', sessionUuid: 'flying' });
  });

  it('bez operacji: WYŁĄCZENIE obejmujące „teraz" przed rezerwacją, rezerwacja przed wolną', () => {
    const block = booking({ id: 'blk', kind: 'block', pilotId: null, blockReason: 'przegląd', endsAt: NOW + 3 * H });
    const res = booking({ id: 'res' });
    expect(now({ bookings: [res, block] })).toEqual({ kind: 'blocked', bookingId: 'blk', reason: 'przegląd', until: NOW + 3 * H });
    expect(now({ bookings: [res] })).toEqual({ kind: 'booked', bookingId: 'res', pilotId: 'JSE', startsAt: NOW - H, endsAt: NOW + H });
  });

  it('rezerwacja CZEKAJĄCA NA ZGODĘ i zamknięta nie są „zarezerwowana"', () => {
    expect(now({ bookings: [booking({ id: 'p', status: 'pending' })] }).kind).toBe('free');
    expect(now({ bookings: [booking({ id: 'c', status: 'cancelled' })] }).kind).toBe('free');
  });

  it('wolna mówi o NAJBLIŻSZYM terminie, także wyłączeniu; zamknięta operacja nic nie zmienia', () => {
    const closed = session({ sessionUuid: 'done', at: NOW - 6 * H });
    const later = booking({ id: 'later', startsAt: NOW + 5 * H, endsAt: NOW + 7 * H });
    const soon = booking({ id: 'soon', kind: 'block', pilotId: null, blockReason: 'olej', startsAt: NOW + 2 * H, endsAt: NOW + 3 * H });
    const past = booking({ id: 'past', startsAt: NOW - 5 * H, endsAt: NOW - 3 * H });
    expect(now({ sessions: [closed], bookings: [later, soon, past] })).toEqual({
      kind: 'free',
      next: { bookingId: 'soon', kind: 'block', startsAt: NOW + 2 * H },
    });
    expect(now({})).toEqual({ kind: 'free', next: null });
  });
});

describe('serie wykresów (§6.4)', () => {
  const SINCE = NOW - 90 * 24 * H;
  const reading: AdminReading = { mh: 1202, fuelL: 180, oilL: null, note: 'po przeglądzie', byPilotId: 'AKO', at: NOW - 2 * H };

  it('MH: przejęcie, zdanie i wpis administratora w porządku czasu, ze źródłem', () => {
    const a = session({ sessionUuid: 'a', at: NOW - 10 * H });
    const points = mhSeries([a], [reading], SINCE);
    expect(points).toEqual([
      { at: NOW - 10 * H, value: 1200, source: 'claim', sessionUuid: 'a', pilotId: 'PWI' },
      { at: NOW - 7 * H, value: 1201.5, source: 'release', sessionUuid: 'a', pilotId: 'PWI' },
      { at: NOW - 2 * H, value: 1202, source: 'admin', sessionUuid: null, pilotId: 'AKO' },
    ]);
  });

  it('bez punktu: operacja unieważniona, zakończona z panelu (bez odczytu) i wszystko sprzed okna', () => {
    const voided = session({ sessionUuid: 'v', at: NOW - 10 * H, status: 'voided' });
    const adminClosed = session({ sessionUuid: 'adm', at: NOW - 8 * H, mhEnd: null, fuelEndL: null });
    const old = session({ sessionUuid: 'old', at: SINCE - 20 * H });
    const points = mhSeries([voided, adminClosed, old], [{ ...reading, at: SINCE - H }], SINCE);
    // Zakończona z panelu daje TYLKO przejęcie - odczytu końcowego nie ma i nie udajemy go.
    expect(points).toEqual([
      { at: NOW - 8 * H, value: 1200, source: 'claim', sessionUuid: 'adm', pilotId: 'PWI' },
    ]);
  });

  it('paliwo: tankowanie ze stanem PO dolewce między przejęciem a zdaniem', () => {
    const a = session({ sessionUuid: 'a', at: NOW - 10 * H });
    const points = fuelSeries(
      [a],
      [{ at: NOW - 9 * H, afterL: 260, sessionUuid: 'a', pilotId: 'PWI' }],
      [],
      SINCE,
    );
    expect(points.map((p) => [p.source, p.value])).toEqual([
      ['claim', 200],
      ['refuel', 260],
      ['release', 150],
    ]);
  });

  it('ta sama chwila: zdanie poprzednika PRZED przejęciem następcy - tak czyta się przekazanie', () => {
    const a = session({ sessionUuid: 'a', at: NOW - 10 * H, closeTime: NOW - 7 * H });
    const b = session({ sessionUuid: 'b', at: NOW - 7 * H, mhStart: 1201.5, closeTime: NOW - 4 * H, mhEnd: 1203 });
    const points = mhSeries([b, a], [], SINCE);
    expect(points.map((p) => `${p.source}:${p.sessionUuid}`)).toEqual([
      'claim:a',
      'release:a',
      'claim:b',
      'release:b',
    ]);
  });
});
