/**
 * Ninerdeck - test paska dni kalendarza (rezerwacje 3.0.0, `logic/calendarDays.ts`).
 *
 * Dzień tygodnia liczy się ze ŚRODKA doby: granica doby klubu wypada przed północą UTC,
 * więc rachunek z jej początku trafiłby w dzień poprzedni. To jest jedyna pułapka
 * tego modułu i dlatego ma tu własny przypadek.
 */

import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import { buildDayChips, defaultDay } from '../ui/screens/logic/calendarDays';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

/** Trzy doby klubu w strefie +02:00 - sobota, niedziela, poniedziałek. */
const days: ClubDayBounds[] = [
  {
    date: '2026-09-19',
    startsAt: Date.parse('2026-09-18T22:00:00Z'),
    endsAt: Date.parse('2026-09-19T22:00:00Z'),
  },
  {
    date: '2026-09-20',
    startsAt: Date.parse('2026-09-19T22:00:00Z'),
    endsAt: Date.parse('2026-09-20T22:00:00Z'),
  },
  {
    date: '2026-09-21',
    startsAt: Date.parse('2026-09-20T22:00:00Z'),
    endsAt: Date.parse('2026-09-21T22:00:00Z'),
  },
];

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: days[0]!.startsAt + 9 * HOUR,
    endsAt: days[0]!.startsAt + 11 * HOUR,
    pilotId: 'ja',
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

const now = days[0]!.startsAt + 8 * HOUR;

describe('chipy dni', () => {
  it('dzień tygodnia bierze się ze środka doby, nie z jej początku w UTC', () => {
    // Doba 19 września zaczyna się 18 września o 22:00 UTC - liczona z początku
    // wyszłaby jako piątek.
    const chips = buildDayChips({ days, bookings: [], pilotId: 'ja', selected: '2026-09-19', now });
    expect(chips.map((c) => c.dow)).toEqual(['Sob', 'Nd', 'Pn']);
    expect(chips.map((c) => c.day)).toEqual(['19', '20', '21']);
  });

  it('kropka znaczy WŁASNĄ rezerwację, nie zajętość klubu', () => {
    const chips = buildDayChips({
      days,
      bookings: [
        booking({ id: 'moja' }),
        booking({
          id: 'cudza',
          pilotId: 'inny',
          startsAt: days[1]!.startsAt + 9 * HOUR,
          endsAt: days[1]!.startsAt + 10 * HOUR,
        }),
      ],
      pilotId: 'ja',
      selected: '2026-09-19',
      now,
    });
    expect(chips.map((c) => c.mine)).toEqual([true, false, false]);
  });

  it('wyłączenie z użytku nie zapala kropki - to nie jest plan pilota', () => {
    const chips = buildDayChips({
      days,
      bookings: [booking({ id: 'serwis', kind: 'block', pilotId: null })],
      pilotId: 'ja',
      selected: '2026-09-19',
      now,
    });
    expect(chips.every((c) => !c.mine)).toBe(true);
  });

  it('wybrana i dzisiejsza to dwa różne stany', () => {
    const chips = buildDayChips({ days, bookings: [], pilotId: 'ja', selected: '2026-09-21', now });
    expect(chips.map((c) => c.selected)).toEqual([false, false, true]);
    expect(chips.map((c) => c.today)).toEqual([true, false, false]);
  });
});

describe('doba domyślna', () => {
  it('to dzisiejsza, gdy jest w oknie', () => {
    expect(defaultDay(days, now)).toBe('2026-09-19');
  });

  it('bez dzisiejszej bierze pierwszą - ekran bez doby nie ma czego narysować', () => {
    expect(defaultDay(days, days[0]!.startsAt - 10 * HOUR)).toBe('2026-09-19');
  });

  it('bez ani jednej doby nie zgaduje', () => {
    expect(defaultDay([], now)).toBeNull();
  });
});
