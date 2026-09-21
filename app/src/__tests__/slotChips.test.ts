/**
 * Ninerdeck - test chipów sugerowanych godzin (22).
 *
 * Domena mówi POWÓD, a ten moduł dokłada do niego sąsiada - bo tego domena nie wie:
 * zajętości przychodzą do niej jako same przedziały czasu, bez nazwisk.
 */

import type { RemoteSlot } from '../application';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';
import { buildSlotChips } from '../ui/screens/logic/slotChips';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-20',
  startsAt: Date.parse('2026-09-19T22:00:00Z'),
  endsAt: Date.parse('2026-09-20T22:00:00Z'),
};

const at = (hour: number): number => day.startsAt + hour * HOUR;
const window = { from: at(6), to: at(21) };
const iso = (t: number): string => new Date(t).toISOString();

function slot(over: Partial<RemoteSlot> & { reason: RemoteSlot['reason'] }): RemoteSlot {
  return {
    startsAt: iso(at(11)),
    endsAt: iso(at(13)),
    gapBeforeMin: 30,
    gapAfterMin: 30,
    ...over,
  } as RemoteSlot;
}

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: at(13),
    endsAt: at(15),
    pilotId: 'p1',
    dualId: null,
    operation: 'ferry',
    fromIcao: null,
    toIcao: null,
    plannedAirMin: null,
    plannedFuelL: null,
    sessionUuid: null,
    blockReason: null,
    note: null,
    ...over,
  };
}

const build = (
  slots: RemoteSlot[],
  busy: CalendarBooking[] = [],
  picked: { startsAt: number | null; endsAt: number | null } = { startsAt: null, endsAt: null },
) =>
  buildSlotChips({
    slots,
    busy,
    day,
    window,
    startsAt: picked.startsAt,
    endsAt: picked.endsAt,
    nameOf: (id) => (id === 'p1' ? 'Jan Nowak' : null),
  });

describe('godziny chipa', () => {
  it('idą czasem KLUBU, nie UTC', () => {
    expect(build([slot({ reason: 'open-day' })])[0]!.hours).toBe('11:00 → 13:00');
  });

  it('nieczytelna chwila wypada - chip bez godziny nie jest propozycją', () => {
    expect(build([slot({ reason: 'open-day', startsAt: 'wczoraj' })])).toEqual([]);
  });

  it('chip trafiający w ustawiony termin jest zaznaczony', () => {
    const chips = build([slot({ reason: 'open-day' })], [], {
      startsAt: at(11),
      endsAt: at(13),
    });
    expect(chips[0]!.selected).toBe(true);
  });
});

describe('powód chipa', () => {
  it('przyleganie DO TYŁU nazywa sąsiada za separatorem, bez odmiany nazwiska', () => {
    const chips = build(
      [slot({ reason: 'next-to-booking', startsAt: iso(at(11)), gapBeforeMin: 0 })],
      [booking({ id: 'b1', startsAt: at(9), endsAt: at(11) })],
    );
    expect(chips[0]!.why).toBe('tuż po rezerwacji · J. Nowak');
  });

  it('przyleganie DO PRZODU mówi „tuż przed"', () => {
    const chips = build(
      [slot({ reason: 'next-to-booking', gapAfterMin: 0, gapBeforeMin: 30 })],
      [booking({ id: 'b1' })],
    );
    expect(chips[0]!.why).toBe('tuż przed rezerwacją · J. Nowak');
  });

  it('sąsiad spoza cache floty zostaje bez nazwiska, a zdanie dalej jest zdaniem', () => {
    const chips = build(
      [slot({ reason: 'next-to-booking', gapAfterMin: 0, gapBeforeMin: 30 })],
      [booking({ id: 'b1', pilotId: 'obcy' })],
    );
    expect(chips[0]!.why).toBe('tuż przed rezerwacją');
  });

  it('wyłączenie z użytku nie jest niczyją rezerwacją', () => {
    const chips = build(
      [slot({ reason: 'next-to-booking', gapAfterMin: 0, gapBeforeMin: 30 })],
      [booking({ id: 'b1', kind: 'block', pilotId: null })],
    );
    expect(chips[0]!.why).toBe('tuż przed wyłączeniem z użytku');
  });

  it('wypełnienie dziury i miejsce między rezerwacjami mają własne zdania', () => {
    expect(build([slot({ reason: 'fills-gap' })])[0]!.why).toBe('wypełnia wolne okno');
    expect(build([slot({ reason: 'between-bookings' })])[0]!.why).toBe('między rezerwacjami');
  });

  it('wolny dzień: kafelek na świcie mówi, gdzie stoi', () => {
    const start = build([
      slot({ reason: 'open-day', startsAt: iso(at(6)), endsAt: iso(at(8)) }),
    ]);
    expect(start[0]!.why).toBe('początek dnia');
    expect(build([slot({ reason: 'open-day' })])[0]!.why).toBe('wolny dzień');
  });
});
