/**
 * Ninerdeck - testy CELU TAPNIĘCIA NA OSI (`logic/calendarTargets.ts`; zlecenia 4.0.0, 21E).
 *
 * Pod obserwacją: pasek zlecenia prowadzi do karty zlecenia temu, kto je widzi, a kto
 * siedzi w fotelu - do swojej rezerwacji; cudza zajętość - jak dotąd; wolne pasmo wokół
 * wskazanej godziny liczy domena.
 */

import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import { barTarget, freeBandAt } from '../ui/screens/logic/calendarTargets';

const H = 3_600_000;
const T0 = Date.parse('2026-10-03T04:00:00Z');

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: T0 + 3 * H,
    endsAt: T0 + 7 * H,
    pilotId: null,
    dualId: null,
    operation: 'skoki',
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

describe('pasek', () => {
  it('autor zlecenia - karta prowadzącego', () => {
    const b = booking({ id: 'b1', order: { seeking: ['pic'], id: 'o1', createdBy: 'mzi' } });
    expect(barTarget('b1', b, 'mzi')).toEqual({ screen: 'Order', params: { orderId: 'o1', as: 'leader' } });
  });

  it('adresat albo koordynator - karta zlecenia rozstrzyga sama', () => {
    const b = booking({ id: 'b1', order: { seeking: ['pic'], id: 'o1', createdBy: 'mzi' } });
    expect(barTarget('b1', b, 'ako')).toEqual({ screen: 'Order', params: { orderId: 'o1' } });
  });

  it('w fotelu - własna rezerwacja (23F); bez zlecenia i dla obcych - karta rezerwacji', () => {
    const seated = booking({ id: 'b1', pilotId: 'ako', order: { seeking: ['dual'], id: 'o1', createdBy: 'mzi' } });
    expect(barTarget('b1', seated, 'ako')).toEqual({ screen: 'BookingDetails', params: { bookingId: 'b1' } });
    const foreign = booking({ id: 'b2', order: { seeking: ['pic'], id: null, createdBy: null } });
    expect(barTarget('b2', foreign, 'ako')).toEqual({ screen: 'BookingDetails', params: { bookingId: 'b2' } });
    expect(barTarget('b3', null, 'ako')).toEqual({ screen: 'BookingDetails', params: { bookingId: 'b3' } });
  });
});

describe('wolne pasmo', () => {
  it('pasmo wokół wskazanej godziny; w zajętości - brak', () => {
    const busy = [booking({ id: 'b1', startsAt: T0 + 5 * H, endsAt: T0 + 7 * H })];
    const window = { from: T0, to: T0 + 15 * H };
    expect(freeBandAt({ bookings: busy, aircraftId: 'a1', window, at: T0 + 2 * H })).toEqual({ startsAt: T0, endsAt: T0 + 5 * H });
    expect(freeBandAt({ bookings: busy, aircraftId: 'a1', window, at: T0 + 6 * H })).toBeNull();
    // Zajętości innej maszyny tego pasma nie dotyczą.
    expect(freeBandAt({ bookings: busy, aircraftId: 'a2', window, at: T0 + 6 * H })).toEqual({ startsAt: T0, endsAt: T0 + 15 * H });
  });
});
