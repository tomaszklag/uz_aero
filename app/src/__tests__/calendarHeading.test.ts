/**
 * Ninerdeck - test nagłówka doby nad osią floty (rezerwacje 3.0.0).
 *
 * Ten sam powód, co przy chipach: doba klubu zaczyna się przed północą UTC, więc
 * nazwa dnia liczona z jej początku spóźniałaby się o jeden.
 */

import type { ClubDayBounds } from '../ui/screens/logic/clubClock';
import { dayHeading, dayShort } from '../ui/screens/logic/calendarHeading';

describe('nagłówek doby', () => {
  it('nazywa dzień tygodnia i datę w dopełniaczu', () => {
    const day: ClubDayBounds = {
      date: '2026-09-19',
      startsAt: Date.parse('2026-09-18T22:00:00Z'),
      endsAt: Date.parse('2026-09-19T22:00:00Z'),
    };
    expect(dayHeading(day)).toBe('Sobota 19 września');
  });

  it('doba zaczynająca się przed północą UTC nie cofa się o dzień', () => {
    // Strefa +02:00: początek doby to 22:00 dnia poprzedniego. Liczone z `startsAt`
    // wyszłoby „Piątek 18 września".
    const day: ClubDayBounds = {
      date: '2026-06-22',
      startsAt: Date.parse('2026-06-21T22:00:00Z'),
      endsAt: Date.parse('2026-06-22T22:00:00Z'),
    };
    expect(dayHeading(day)).toBe('Poniedziałek 22 czerwca');
  });
});

describe('krótka doba', () => {
  it('mieści się w jednej linii podtytułu: „Nd 20 WRZ"', () => {
    const day: ClubDayBounds = {
      date: '2026-09-20',
      startsAt: Date.parse('2026-09-19T22:00:00Z'),
      endsAt: Date.parse('2026-09-20T22:00:00Z'),
    };
    expect(dayShort(day)).toBe('Nd 20 WRZ');
  });
});
