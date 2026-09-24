/**
 * Ninerdeck - test ODMOWY ZAPISU REZERWACJI (22C).
 *
 * Odmowa niesie TREŚĆ, więc testujemy zdania, a nie kody: ekran ma powiedzieć, co stoi
 * w tym czasie, i zrobić to po polsku, który się nie wywraca na odmianie nazwiska.
 */

import { bookingDeny, BOOKING_OFFLINE } from '../ui/screens/logic/bookingDeny';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-20',
  startsAt: Date.parse('2026-09-19T22:00:00Z'),
  endsAt: Date.parse('2026-09-20T22:00:00Z'),
};

const at = (hour: number): number => day.startsAt + hour * HOUR;
const NOW = at(10);

function booking(over: Partial<CalendarBooking> = {}): CalendarBooking {
  return {
    id: 'b1',
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: at(11),
    endsAt: at(13),
    pilotId: 'nowak',
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

const input = (over: Partial<Parameters<typeof bookingDeny>[0]> = {}) => ({
  refusal: 'slot_taken',
  taken: booking(),
  takenAt: NOW - 3 * 60_000,
  now: NOW,
  day,
  reg: 'SP-AXA',
  pilotId: 'ako',
  nameOf: (id: string | null) => (id === 'nowak' ? 'Jan Nowak' : null),
  ...over,
});

describe('termin zajęty', () => {
  it('mówi CO stoi w tym czasie, a nazwisko daje w MIANOWNIKU za separatorem', () => {
    const vm = bookingDeny(input());
    // Odmiany nazwiska nie da się wyprowadzić regułą, więc zdanie nie próbuje.
    expect(vm.body).toBe('SP-AXA jest zajęta 11:00 → 13:00 · rezerwację ma J. Nowak. Weszła 3 min temu.');
    expect(vm.offerFix).toBe(true);
  });

  it('ŚWIEŻA kolizja to wyścig o slot, stara - zwykły stan kalendarza', () => {
    expect(bookingDeny(input()).title).toBe('Ten termin właśnie zajęto');
    expect(bookingDeny(input({ takenAt: NOW - 3 * 24 * HOUR })).title).toBe(
      'Ten termin jest już zajęty',
    );
  });

  it('bez znanego wieku nie zgaduje - zdania o nim po prostu nie ma', () => {
    const vm = bookingDeny(input({ takenAt: null }));
    expect(vm.body).toBe('SP-AXA jest zajęta 11:00 → 13:00 · rezerwację ma J. Nowak.');
    expect(vm.title).toBe('Ten termin jest już zajęty');
  });

  it('pilot spoza cache’u floty nie zostawia dziury w zdaniu', () => {
    const vm = bookingDeny(input({ nameOf: () => null, takenAt: null }));
    expect(vm.body).toBe('SP-AXA jest zajęta 11:00 → 13:00 · rezerwację ma inny pilot.');
  });

  it('WŁASNA rezerwacja to podwójny wpis, nie cudzy plan', () => {
    const vm = bookingDeny(input({ taken: booking({ pilotId: 'ako' }) }));
    expect(vm.title).toBe('Masz już rezerwację w tych godzinach');
    expect(vm.body).not.toContain('rezerwację ma');
  });

  it('wyłączenie z użytku nazywa POWÓD - nie ma właściciela', () => {
    const vm = bookingDeny(
      input({ taken: booking({ kind: 'block', pilotId: null, blockReason: 'Przegląd 100 h' }) }),
    );
    expect(vm.title).toBe('Maszyna jest w tych godzinach wyłączona');
    expect(vm.body).toBe('SP-AXA jest wyłączona z użytku 11:00 → 13:00 · Przegląd 100 h.');
  });
});

describe('pozostałe odmowy', () => {
  it('maszyna wyłączona z użytku nie dostaje skrótu do wolnego slotu', () => {
    // Sugestie liczą się dla WYBRANEJ maszyny, więc prowadziłyby w tę samą ścianę.
    const vm = bookingDeny(input({ refusal: 'aircraft_disabled', taken: null }));
    expect(vm.offerFix).toBe(false);
    expect(vm.body).toContain('Wybierz inny samolot');
  });

  it('odmowa nieznana temu wydaniu niesie KOD - pilot przeczyta go administratorowi', () => {
    const vm = bookingDeny(input({ refusal: 'jakas_nowa_regula', taken: null }));
    expect(vm.body).toContain('jakas_nowa_regula');
  });

  it('bez maszyny w cache’u zdanie nadal się klei', () => {
    const vm = bookingDeny(input({ reg: null, refusal: 'aircraft_disabled', taken: null }));
    expect(vm.body.startsWith('Ta maszyna')).toBe(true);
  });
});

describe('zapis, który nie dojechał', () => {
  it('mówi, CZYJĄ decyzją jest slot - nie „spróbuj ponownie"', () => {
    expect(BOOKING_OFFLINE.title).toBe('Rezerwacja wymaga połączenia');
    expect(BOOKING_OFFLINE.body).toContain('Slot potwierdza serwer');
    expect(BOOKING_OFFLINE.offerFix).toBe(false);
  });
});
