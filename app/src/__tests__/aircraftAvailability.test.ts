/**
 * Ninerdeck - test karty samolotu przy zakładaniu rezerwacji (22).
 *
 * Wolne pasma liczy DOMENA (`freeSpans`) - ta sama odpowiedź, z której powstają
 * sugestie slotów. Tutaj sprawdzamy, co z niej robi ekran.
 */

import type { ReferenceAircraft } from '../domain';
import { buildAircraftOptions } from '../ui/screens/logic/aircraftAvailability';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-20',
  startsAt: Date.parse('2026-09-19T22:00:00Z'),
  endsAt: Date.parse('2026-09-20T22:00:00Z'),
};

const at = (hour: number, minute = 0): number => day.startsAt + hour * HOUR + minute * 60_000;
/** Okno doby lotnej, w którym liczą się procenty osi - tu domyślne 06-21. */
const window = { from: at(6), to: at(21) };

const FLEET = [
  { id: 'a1', reg: 'SP-AXA', type: 'C172' },
  { id: 'a2', reg: 'SP-CDR', type: 'AN-2' },
] as ReferenceAircraft[];

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: at(9),
    endsAt: at(11),
    pilotId: 'inny',
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

const build = (bookings: CalendarBooking[]) =>
  buildAircraftOptions({ aircraft: FLEET, bookings, day, window });

describe('wolne pasma na karcie', () => {
  it('doba bez zajętości to jedno pasmo przez całe okno', () => {
    expect(build([])[0]!.free).toBe('wolne: 06:00-21:00');
  });

  it('rezerwacja dzieli okno na dwa pasma', () => {
    expect(build([booking({ id: 'b1' })])[0]!.free).toBe('wolne: 06:00-09:00 · 11:00-21:00');
  });

  it('sąsiadujące rezerwacje scalają się w JEDNĄ przerwę', () => {
    const free = build([
      booking({ id: 'b1', startsAt: at(9), endsAt: at(11) }),
      booking({ id: 'b2', startsAt: at(11), endsAt: at(13) }),
    ])[0]!.free;
    expect(free).toBe('wolne: 06:00-09:00 · 13:00-21:00');
  });

  it('szpara krótsza niż kwadrans nie jest terminem do wzięcia i nie wchodzi do napisu', () => {
    const free = build([
      booking({ id: 'b1', startsAt: at(6), endsAt: at(9) }),
      booking({ id: 'b2', startsAt: at(9, 10), endsAt: at(21) }),
    ])[0]!.free;
    expect(free).toBeNull();
  });

  it('zajętość CUDZEJ maszyny nie rusza tej karty', () => {
    expect(build([booking({ id: 'b1' })])[1]!.free).toBe('wolne: 06:00-21:00');
  });
});

describe('maszyna wyłączona z użytku', () => {
  const serwis = booking({
    id: 'serwis',
    aircraftId: 'a2',
    kind: 'block',
    pilotId: null,
    blockReason: 'Przegląd 100 h',
    startsAt: day.startsAt - 24 * HOUR,
    // Granica WYŁĄCZAJĄCA: to jest północ klubu z 24 na 25 września, więc ostatnim
    // dniem OBJĘTYM przeglądem jest 24 - i tak ma się nazywać na karcie.
    endsAt: Date.parse('2026-09-24T22:00:00Z'),
  });

  it('wyłączenie na CAŁE okno gasi kartę i mówi powód', () => {
    const card = build([serwis])[1]!;
    expect(card.blocked).toEqual({
      reason: 'Przegląd 100 h',
      until: 'wyłączony z użytku do 24 września',
    });
    // Wolnych pasm nie wypisujemy - nie ma czego wziąć.
    expect(card.free).toBeNull();
  });

  it('wyłączenie na KILKA GODZIN zostaje zwykłą zajętością - maszynę da się wziąć obok', () => {
    const card = build([
      { ...serwis, startsAt: at(9), endsAt: at(11) },
    ])[1]!;
    expect(card.blocked).toBeNull();
    expect(card.free).toBe('wolne: 06:00-09:00 · 11:00-21:00');
  });

  it('bez powodu zostaje nazwa stanu - liczby ani zdania nie zmyślamy', () => {
    const card = build([{ ...serwis, blockReason: null }])[1]!;
    expect(card.blocked?.reason).toBe('Wyłączony z użytku');
  });
});
