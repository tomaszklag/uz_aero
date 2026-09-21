/**
 * Ninerdeck - test KARTY NAJBLIŻSZEJ REZERWACJI na Pulpicie (20) i WEJŚCIA W LOT (23A/F8).
 *
 * Dwa pytania, dwie odpowiedzi i celowo różne: „co mam przed sobą" (karta) sięga dalej
 * niż „czym wypełnić przejęcie" (ziarno) - plan na przyszły weekend jest treścią karty,
 * a podstawiony w formularz wyglądałby jak wpis pilota.
 */

import { claimSeed, CLAIM_LEAD_MS } from '../ui/screens/logic/claimFromBooking';
import type { CalendarBooking, CalendarData } from '../ui/screens/logic/calendarData';
import { nextBooking, nextBookingRow } from '../ui/screens/logic/nextBooking';

const HOUR = 3_600_000;

const day = {
  date: '2026-09-20',
  startsAt: Date.parse('2026-09-19T22:00:00Z'),
  endsAt: Date.parse('2026-09-20T22:00:00Z'),
};
const jutro = {
  date: '2026-09-21',
  startsAt: day.endsAt,
  endsAt: day.endsAt + 24 * HOUR,
};

const at = (hour: number): number => day.startsAt + hour * HOUR;

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: at(11),
    endsAt: at(13),
    pilotId: 'tmk',
    dualId: null,
    operation: 'ferry',
    fromIcao: 'EPKK',
    toIcao: 'EPRJ',
    plannedAirMin: 90,
    plannedFuelL: null,
    sessionUuid: null,
    blockReason: null,
    note: null,
    ...over,
  };
}

const data = (bookings: CalendarBooking[]): CalendarData =>
  ({ timezone: 'Europe/Warsaw', homeIcao: 'EPKK', days: [day, jutro], bookings }) as CalendarData;

const input = (bookings: CalendarBooking[], now = at(9)) => ({
  data: data(bookings),
  pilotId: 'tmk',
  now,
  regOf: (id: string) => (id === 'a1' ? 'SP-AXA' : null),
  codeOf: (id: string) => (id === 'ako' ? 'AKO' : null),
});

describe('która rezerwacja jest „najbliższa"', () => {
  it('bierze pierwszą, która się jeszcze nie skończyła - także tę, która TRWA', () => {
    const trwa = booking({ id: 'teraz', startsAt: at(8), endsAt: at(10) });
    const potem = booking({ id: 'potem', startsAt: at(14), endsAt: at(16) });
    expect(nextBookingRow(input([potem, trwa]))?.id).toBe('teraz');
  });

  it('termin, który MINĄŁ, przestaje być planem', () => {
    const wczoraj = booking({ id: 'stary', startsAt: at(6), endsAt: at(8) });
    expect(nextBookingRow(input([wczoraj], at(9)))).toBeNull();
  });

  it('cudzy plan i wyłączenie z użytku to nie jest plan TEGO pilota', () => {
    const cudza = booking({ id: 'cudza', pilotId: 'inny' });
    const serwis = booking({ id: 'serwis', kind: 'block', pilotId: null });
    expect(nextBookingRow(input([cudza, serwis]))).toBeNull();
  });

  it('odwołana rezerwacja znika z Pulpitu', () => {
    expect(nextBookingRow(input([booking({ id: 'x', status: 'cancelled' })]))).toBeNull();
  });

  it('bez odpowiedzi serwera karty nie ma - i to jest cała treść braku sieci', () => {
    expect(nextBooking({ ...input([]), data: null })).toBeNull();
  });
});

describe('karta', () => {
  it('godziny idą czasem KLUBU, a znak z cache floty', () => {
    const vm = nextBooking(input([booking({ id: 'b1' })]));
    expect(vm?.clock).toBe('11:00 → 13:00');
    expect(vm?.aircraft).toBe('SP-AXA');
    expect(vm?.operation).toBe('Przelot');
    expect(vm?.route).toBe('EPKK → EPRJ');
  });

  it('skoki mają JEDNO lotnisko, a nie strzałkę między dwoma takimi samymi', () => {
    const vm = nextBooking(
      input([booking({ id: 'b1', operation: 'skoki', fromIcao: 'EPKK', toIcao: 'EPKK' })]),
    );
    expect(vm?.route).toBe('EPKK');
  });

  it('rezerwacja JUTRO liczy godziny od granic SWOJEJ doby', () => {
    const vm = nextBooking(
      input([booking({ id: 'b1', startsAt: jutro.startsAt + 9 * HOUR, endsAt: jutro.startsAt + 11 * HOUR })]),
    );
    expect(vm?.clock).toBe('09:00 → 11:00');
  });

  it('maszyna spoza cache’u nie zostawia pustego miejsca', () => {
    const vm = nextBooking(input([booking({ id: 'b1', aircraftId: 'nieznana' })]));
    expect(vm?.aircraft).toBe('nieznana');
  });
});

describe('czym wypełnić przejęcie', () => {
  it('termin, do którego pilot właśnie siada, wypełnia formularz', () => {
    const seed = claimSeed(booking({ id: 'b1' }), at(11) - CLAIM_LEAD_MS + 60_000);
    expect(seed?.reservationId).toBe('b1');
    expect(seed?.operation).toBe('ferry');
    expect(seed?.departureIcao).toBe('EPKK');
  });

  it('plan na przyszły tydzień NIE wypełnia niczego - podstawiony wyglądałby jak wpis', () => {
    expect(claimSeed(booking({ id: 'b1' }), at(11) - CLAIM_LEAD_MS - 60_000)).toBeNull();
  });

  it('termin, który TRWA, dalej wypełnia - pilot spóźniony lata ze swojej rezerwacji', () => {
    expect(claimSeed(booking({ id: 'b1' }), at(12))?.reservationId).toBe('b1');
  });

  it('po terminie ziarna nie ma', () => {
    expect(claimSeed(booking({ id: 'b1' }), at(13))).toBeNull();
  });

  it('brak rezerwacji to brak ziarna, a nie blokada - formularz otwiera się pusty', () => {
    expect(claimSeed(null, at(11))).toBeNull();
  });

  it('rodzaj spoza tego wydania zostawia wybór pilotowi', () => {
    const seed = claimSeed(booking({ id: 'b1', operation: 'jakies_nowe' }), at(11));
    expect(seed).not.toBeNull();
    expect(seed?.operation).toBeNull();
  });
});
