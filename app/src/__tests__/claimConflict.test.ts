/**
 * Ninerdeck - test OSTRZEŻENIA O CUDZEJ REZERWACJI przy przejęciu (23A, #162 F9).
 *
 * Reguła, której pilnuje ten plik, jest jedna i twarda: to jest BANER, nigdy blokada -
 * więc moduł zwraca zdanie albo `null`, i nigdy nic, z czego dałoby się wyprowadzić
 * wyszarzenie przycisku (§2.3).
 */

import { claimConflict, CONFLICT_WINDOW_MS } from '../ui/screens/logic/claimConflict';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-20',
  startsAt: Date.parse('2026-09-19T22:00:00Z'),
  endsAt: Date.parse('2026-09-20T22:00:00Z'),
};

const at = (hour: number): number => day.startsAt + hour * HOUR;

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: at(9),
    endsAt: at(11),
    pilotId: 'ako',
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

const input = (over: Partial<Parameters<typeof claimConflict>[0]> = {}) => ({
  bookings: [booking({ id: 'b1' })],
  days: [day],
  aircraftId: 'a1',
  reg: 'SP-AXA',
  pilotId: 'tmk',
  now: at(9),
  nameOf: (id: string | null) => (id === 'ako' ? 'Anna Kowalska' : null),
  ...over,
});

describe('kiedy baner jest', () => {
  it('cudzy termin na tej maszynie ostrzega i nazywa go w MIANOWNIKU', () => {
    const vm = claimConflict(input());
    expect(vm?.title).toBe('Ktoś ma tę maszynę zarezerwowaną');
    // Nazwisko za separatorem: „przez A. Kowalską" wymagałoby odmiany.
    expect(vm?.text).toBe(
      'SP-AXA ma rezerwację 09:00 → 11:00 · A. Kowalska. Możesz lecieć - to tylko informacja o cudzym planie.',
    );
  });

  it('termin zaczynający się w oknie dwóch godzin też ostrzega', () => {
    const vm = claimConflict(
      input({ bookings: [booking({ id: 'b1', startsAt: at(10), endsAt: at(12) })], now: at(9) }),
    );
    expect(vm).not.toBeNull();
  });

  it('pilot spoza cache’u nie zostawia dziury w zdaniu', () => {
    const vm = claimConflict(input({ nameOf: () => null }));
    expect(vm?.text).toBe(
      'SP-AXA ma rezerwację 09:00 → 11:00. Możesz lecieć - to tylko informacja o cudzym planie.',
    );
  });
});

describe('kiedy banera nie ma', () => {
  it('WŁASNA rezerwacja nie jest kolizją - to plan, z którego pilot właśnie korzysta', () => {
    expect(claimConflict(input({ bookings: [booking({ id: 'b1', pilotId: 'tmk' })] }))).toBeNull();
  });

  it('cudzy termin za trzy godziny nie koliduje z lotem, do którego pilot siada', () => {
    const daleko = booking({ id: 'b1', startsAt: at(9) + CONFLICT_WINDOW_MS + HOUR, endsAt: at(14) });
    expect(claimConflict(input({ bookings: [daleko] }))).toBeNull();
  });

  it('zajętość INNEJ maszyny nie dotyczy tego przejęcia', () => {
    expect(claimConflict(input({ bookings: [booking({ id: 'b1', aircraftId: 'a2' })] }))).toBeNull();
  });

  it('wyłączenie z użytku ma własną drogę - nie jest cudzym planem', () => {
    const serwis = booking({ id: 'b1', kind: 'block', pilotId: null, blockReason: 'Przegląd' });
    expect(claimConflict(input({ bookings: [serwis] }))).toBeNull();
  });

  it('BEZ SIECI ostrzeżenia nie ma, a przejęcie idzie dalej', () => {
    // Znana cena §2.2: rezerwacja nigdy nie warunkowała lotu, więc jej brak niczego
    // nie psuje - psułoby dopiero udawanie, że wiemy.
    expect(claimConflict(input({ bookings: null }))).toBeNull();
  });

  it('przed wyborem maszyny nie ma o co pytać', () => {
    expect(claimConflict(input({ aircraftId: null }))).toBeNull();
  });
});
