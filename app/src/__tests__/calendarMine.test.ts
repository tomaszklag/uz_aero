/**
 * Ninerdeck - test sekcji „Twoje rezerwacje" (rezerwacje 3.0.0, `logic/calendarMine.ts`).
 *
 * Godziny są PRZYCIĘTE do doby, a wiersz szczegółów niesie wyłącznie to, co wypełnione -
 * kreska w miejscu pustej trasy powtarzałaby brak, który widać po samym braku wiersza.
 */

import type { ReferenceAircraft } from '../domain';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import { buildMyBookings } from '../ui/screens/logic/calendarMine';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-19',
  startsAt: Date.parse('2026-09-18T22:00:00Z'),
  endsAt: Date.parse('2026-09-19T22:00:00Z'),
};

const at = (hour: number): number => day.startsAt + hour * HOUR;

const FLEET = [{ id: 'a1', reg: 'SP-AXA' } as ReferenceAircraft];

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: at(9),
    endsAt: at(11),
    pilotId: 'ja',
    dualId: null,
    operation: 'ferry',
    fromIcao: 'EPKK',
    toIcao: 'EPRJ',
    plannedAirMin: null,
    plannedFuelL: null,
    sessionUuid: null,
    blockReason: null,
    note: null,
    ...over,
  };
}

const codeOf = (id: string | null): string | null => (id == null ? null : id.toUpperCase());

function mine(bookings: CalendarBooking[]) {
  return buildMyBookings({ day, bookings, aircraft: FLEET, pilotId: 'ja', codeOf });
}

describe('karty własnych rezerwacji', () => {
  it('godziny idą czasem KLUBU, a znak z cache floty', () => {
    expect(mine([booking({ id: 'b1' })])[0]).toMatchObject({
      hours: '09:00 → 11:00',
      reg: 'SP-AXA',
    });
  });

  it('cudze rezerwacje i wyłączenia z użytku tu nie wchodzą', () => {
    const rows = mine([
      booking({ id: 'cudza', pilotId: 'inny' }),
      booking({ id: 'serwis', kind: 'block', pilotId: null }),
    ]);
    expect(rows).toEqual([]);
  });

  it('rezerwacja z poprzedniej doby ma tu początek o północy, nie wczorajszą godzinę', () => {
    const rows = mine([booking({ id: 'przez-noc', startsAt: at(-3), endsAt: at(2) })]);
    expect(rows[0]!.hours).toBe('00:00 → 02:00');
  });

  it('wiersz szczegółów niesie zadanie, trasę i Duala', () => {
    expect(mine([booking({ id: 'b1', dualId: 'bno' })])[0]!.meta).toEqual([
      'Przelot',
      'EPKK → EPRJ',
      'Dual: BNO',
    ]);
  });

  it('skoki piszą JEDNO lotnisko - zapisane mają oba kody równe', () => {
    expect(
      mine([booking({ id: 'b1', operation: 'skoki', fromIcao: 'EPKK', toIcao: 'EPKK' })])[0]!.meta,
    ).toEqual(['Skoki', 'EPKK']);
  });

  it('pusta trasa i brak Duala nie zostawiają pustych członów', () => {
    expect(
      mine([booking({ id: 'b1', fromIcao: null, toIcao: null, dualId: null })])[0]!.meta,
    ).toEqual(['Przelot']);
  });

  it('nieznane zadanie MILCZY zamiast pisać surowy identyfikator', () => {
    expect(
      mine([booking({ id: 'b1', operation: 'cos-nowego', fromIcao: null, toIcao: null })])[0]!.meta,
    ).toEqual([]);
  });

  it('karty idą po godzinie rozpoczęcia', () => {
    const rows = mine([
      booking({ id: 'druga', startsAt: at(14), endsAt: at(15) }),
      booking({ id: 'pierwsza', startsAt: at(8), endsAt: at(9) }),
    ]);
    expect(rows.map((r) => r.bookingId)).toEqual(['pierwsza', 'druga']);
  });

  it('maszyna spoza cache floty zostaje przy identyfikatorze - nie zgadujemy znaku', () => {
    const rows = mine([booking({ id: 'b1', aircraftId: 'nieznana' })]);
    expect(rows[0]!.reg).toBe('nieznana');
  });
});
