/**
 * Ninerdeck - test koperty kalendarza (rezerwacje 3.0.0, `logic/calendarData.ts`).
 *
 * Parsowanie dzieje się RAZ, a wiersz bez dającej się przeczytać pary chwil wypada:
 * pasek o nieznanym położeniu narysowany „gdzieś" kłamałby o zajętości maszyny.
 */

import type { RemoteBooking, RemoteCalendar } from '../application';
import { bookingsOnDay, toBooking, toCalendar } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-19',
  startsAt: Date.parse('2026-09-18T22:00:00Z'),
  endsAt: Date.parse('2026-09-19T22:00:00Z'),
};

function wire(over: Partial<RemoteBooking> = {}): RemoteBooking {
  return {
    id: 'b1',
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: '2026-09-19T07:00:00Z',
    endsAt: '2026-09-19T09:00:00Z',
    pilotId: 'p1',
    dualId: null,
    operation: 'ferry',
    fromIcao: 'EPKK',
    toIcao: 'EPRJ',
    plannedAirMin: 90,
    plannedFuelL: 60,
    sessionUuid: null,
    blockReason: null,
    note: null,
    ...over,
  };
}

describe('parsowanie koperty', () => {
  it('chwile ISO zamieniają się w liczby, a reszta pól przechodzi bez zmian', () => {
    const parsed = toBooking(wire());
    expect(parsed).toMatchObject({
      id: 'b1',
      startsAt: Date.parse('2026-09-19T07:00:00Z'),
      endsAt: Date.parse('2026-09-19T09:00:00Z'),
      fromIcao: 'EPKK',
      plannedAirMin: 90,
    });
  });

  it('wiersz z nieczytelną chwilą wypada - „gdzieś na osi" kłamałoby o zajętości', () => {
    expect(toBooking(wire({ startsAt: 'wczoraj' }))).toBeNull();
  });

  it('wiersz o zerowej albo odwróconej długości wypada tak samo', () => {
    expect(toBooking(wire({ endsAt: '2026-09-19T07:00:00Z' }))).toBeNull();
    expect(toBooking(wire({ endsAt: '2026-09-19T06:00:00Z' }))).toBeNull();
  });

  it('cała koperta: doby i zajętości przechodzą przez ten sam filtr', () => {
    const remote: RemoteCalendar = {
      timezone: 'Europe/Warsaw',
      homeIcao: 'EPKK',
      days: [
        { date: '2026-09-19', startsAt: '2026-09-18T22:00:00Z', endsAt: '2026-09-19T22:00:00Z' },
        { date: 'zepsuta', startsAt: 'nie-data', endsAt: 'nie-data' },
      ],
      bookings: [wire(), wire({ id: 'b2', startsAt: 'nie-data' })],
    };

    const parsed = toCalendar(remote);
    expect(parsed.timezone).toBe('Europe/Warsaw');
    expect(parsed.days.map((d) => d.date)).toEqual(['2026-09-19']);
    expect(parsed.bookings.map((b) => b.id)).toEqual(['b1']);
  });
});

describe('zajętości doby', () => {
  const b = (id: string, startsAt: number, endsAt: number) => ({
    ...toBooking(wire({ id }))!,
    startsAt,
    endsAt,
  });

  it('wchodzi to, co NACHODZI na dobę, a nie tylko to, co się w niej zaczyna', () => {
    const wczoraj = b('wczoraj', day.startsAt - 3 * HOUR, day.startsAt + 2 * HOUR);
    expect(bookingsOnDay([wczoraj], day).map((x) => x.id)).toEqual(['wczoraj']);
  });

  it('rezerwacja kończąca się o północy należy do doby, która właśnie minęła', () => {
    const styk = b('styk', day.startsAt - 2 * HOUR, day.startsAt);
    expect(bookingsOnDay([styk], day)).toEqual([]);
  });

  it('rezerwacja zaczynająca się o północy należy do doby nowej', () => {
    const styk = b('styk', day.startsAt, day.startsAt + HOUR);
    expect(bookingsOnDay([styk], day).map((x) => x.id)).toEqual(['styk']);
  });

  it('wielodniowe wyłączenie z użytku wchodzi do KAŻDEJ doby, którą obejmuje', () => {
    const serwis = b('serwis', day.startsAt - 24 * HOUR, day.endsAt + 24 * HOUR);
    expect(bookingsOnDay([serwis], day).map((x) => x.id)).toEqual(['serwis']);
  });
});
