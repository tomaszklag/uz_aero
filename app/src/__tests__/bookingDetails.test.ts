/**
 * Ninerdeck - test KARTY REZERWACJI (23) i POPRAWKI istniejącego terminu.
 *
 * Dwie rzeczy warte testu: co wolno z rezerwacją zrobić (odwołanie kontra poprawka -
 * rozdzielone celowo) i co jedzie na drut przy poprawce (sama różnica).
 */

import { bookingDetails } from '../ui/screens/logic/bookingDetails';
import {
  aircraftChanged,
  bookingChanged,
  bookingChanges,
  draftOfBooking,
} from '../ui/screens/logic/bookingEdit';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-20',
  startsAt: Date.parse('2026-09-19T22:00:00Z'),
  endsAt: Date.parse('2026-09-20T22:00:00Z'),
};

const at = (hour: number): number => day.startsAt + hour * HOUR;

function booking(over: Partial<CalendarBooking> = {}): CalendarBooking {
  return {
    id: 'b1',
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
    plannedFuelL: 120,
    sessionUuid: null,
    blockReason: null,
    note: null,
    ...over,
  };
}

const vm = (over: Partial<Parameters<typeof bookingDetails>[0]> = {}) =>
  bookingDetails({
    booking: booking(),
    day,
    now: at(9),
    pilotId: 'tmk',
    aircraft: { reg: 'SP-AXA', type: 'Cessna 172' },
    dualName: null,
    dualCode: null,
    airfieldName: (icao) => (icao === 'EPKK' ? 'Kraków-Balice' : null),
    ...over,
  });

describe('nagłówek karty', () => {
  it('termin jest bohaterem - godziny, długość i odliczanie', () => {
    const v = vm();
    expect(v.hours).toBe('11:00 → 13:00');
    expect(v.length).toBe('2 h');
    expect(v.countdown).toBe('ZA 2 H');
    expect(v.badge).toBe('Potwierdzona');
  });

  it('termin, który TRWA, nie dostaje liczby - odliczanie do przeszłości nic nie znaczy', () => {
    expect(vm({ now: at(12) }).countdown).toBe('TRWA');
  });

  it('po terminie odliczania nie ma wcale', () => {
    expect(vm({ now: at(14) }).countdown).toBeNull();
  });

  it('stan nieznany temu wydaniu jedzie SUROWY - kod mówi więcej niż „nieznany"', () => {
    expect(vm({ booking: booking({ status: 'czeka_na_coś' }) }).badge).toBe('czeka_na_coś');
  });
});

describe('co rezerwujesz', () => {
  it('trasa niesie rozwinięcie tylko wtedy, gdy znane są OBA lotniska', () => {
    // Jedna znana nazwa obok surowego kodu wyglądałaby na brak danych po drugiej stronie.
    const jedno = vm().what.find((r) => r.label === 'Trasa');
    expect(jedno?.value).toBe('EPKK → EPRJ');
    expect(jedno?.sub).toBeNull();

    const oba = vm({ airfieldName: () => 'Lotnisko' }).what.find((r) => r.label === 'Trasa');
    expect(oba?.sub).toBe('Lotnisko → Lotnisko');
  });

  it('skoki mają JEDNO lotnisko, a nie parę z powtórzonym kodem', () => {
    const v = vm({
      booking: booking({ operation: 'skoki', fromIcao: 'EPKK', toIcao: 'EPKK' }),
    });
    const row = v.what.find((r) => r.label === 'Lotnisko');
    expect(row?.value).toBe('EPKK');
    expect(v.what.some((r) => r.label === 'Trasa')).toBe(false);
  });

  it('rodzaj operacji spoza tego wydania NIE dostaje wiersza', () => {
    // „ferry" na karcie byłoby napisem z wnętrza bazy pokazanym pilotowi.
    const v = vm({ booking: booking({ operation: 'jakies_nowe' }) });
    expect(v.what.some((r) => r.label === 'Zadanie')).toBe(false);
  });

  it('bez maszyny w cache’u wiersz nie zostaje pusty', () => {
    expect(vm({ aircraft: null }).what[0]!.value).toBe('a1');
  });
});

describe('plan', () => {
  it('sekcji nie ma, gdy pilot nie podał niczego', () => {
    const v = vm({ booking: booking({ plannedAirMin: null, plannedFuelL: null, note: null }) });
    expect(v.plan).toEqual([]);
  });

  it('czas lotu idzie zegarowo, bo tak go pilot wpisał', () => {
    expect(vm().plan.find((r) => r.label === 'Czas lotu')?.value).toBe('1:30');
  });
});

describe('co wolno zrobić', () => {
  it('cudzej rezerwacji nie da się ani odwołać, ani poprawić', () => {
    const v = vm({ pilotId: 'ktos-inny' });
    expect(v.canCancel).toBe(false);
    expect(v.canEdit).toBe(false);
  });

  it('termin, który TRWA, da się oddać, ale nie przesunąć', () => {
    // Pilot może nie polecieć, ale przesuwanie trwającego terminu opisywałoby przeszłość.
    const v = vm({ now: at(12) });
    expect(v.canCancel).toBe(true);
    expect(v.canEdit).toBe(false);
  });

  it('rezerwacja ZAMKNIĘTA nie ma już żadnej z dwóch dróg', () => {
    const v = vm({ booking: booking({ status: 'cancelled' }) });
    expect(v.canCancel).toBe(false);
    expect(v.canEdit).toBe(false);
    expect(v.countdown).toBeNull();
  });
});

describe('poprawka', () => {
  const base = draftOfBooking(booking(), day);

  it('szkic odtworzony z rezerwacji nie jest „zmieniony"', () => {
    expect(bookingChanged({ ...base }, base)).toBe(false);
    expect(bookingChanges({ ...base }, base)).toBeNull();
  });

  it('na drut idzie SAMA różnica - reszta zostaje nietknięta', () => {
    const patch = bookingChanges({ ...base, startsAt: at(12), notes: 'po drodze' }, base);
    expect(Object.keys(patch ?? {}).sort()).toEqual(['note', 'startsAt']);
    expect(patch?.startsAt).toBe(new Date(at(12)).toISOString());
  });

  it('wyczyszczone lotnisko jedzie jako `null`, a nie pusty kod', () => {
    const patch = bookingChanges({ ...base, arrivalIcao: '' }, base);
    expect(patch).toEqual({ toIcao: null });
  });

  it('zmiana maszyny wychodzi poza PATCH i musi to powiedzieć', () => {
    expect(aircraftChanged({ ...base, aircraftId: 'a2' }, base)).toBe(true);
    expect(aircraftChanged({ ...base }, base)).toBe(false);
  });

  it('rodzaj operacji spoza wydania schodzi do pustego wyboru, a nie do surowego kodu', () => {
    const odtworzony = draftOfBooking(booking({ operation: 'jakies_nowe' }), day);
    expect(odtworzony.operation).toBeNull();
  });
});
