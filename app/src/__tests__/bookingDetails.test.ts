/**
 * Ninerdeck - test KARTY REZERWACJI (23) i POPRAWKI istniejącego terminu.
 *
 * Dwie rzeczy warte testu: co wolno z rezerwacją zrobić (odwołanie kontra poprawka -
 * rozdzielone celowo) i co jedzie na drut przy poprawce (sama różnica).
 */

import { bookingDetails, termTone } from '../ui/screens/logic/bookingDetails';
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
    pilotId: 'ako',
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
    pilotId: 'ako',
    aircraft: { reg: 'SP-AXA', type: 'Cessna 172' },
    nameOf: () => null,
    codeOf: () => null,
    airfieldName: (icao) => (icao === 'EPKK' ? 'Kraków-Balice' : null),
    ...over,
  });

/** Pamięć klubu: zlecająca, dowódca i drugi pilot. */
const PEOPLE: Readonly<Record<string, { name: string; code: string }>> = {
  ako: { name: 'Adam Kowalski', code: 'AKO' },
  mzi: { name: 'Marta Zięba', code: 'MZI' },
  jse: { name: 'Jan Sęk', code: 'JSE' },
};
const known = {
  nameOf: (id: string) => PEOPLE[id]?.name ?? null,
  codeOf: (id: string) => PEOPLE[id]?.code ?? null,
};

const joined = (parts: readonly { text: string }[] | null | undefined): string | null =>
  parts == null ? null : parts.map((p) => p.text).join('');

describe('nagłówek karty', () => {
  it('termin jest bohaterem - godziny, długość i odliczanie', () => {
    const v = vm();
    // Doba jak w karcie terminu zlecenia (28, 32): ten sam komponent, ten sam napis.
    expect(v.date).toBe('Niedziela · 20 września');
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

  it('wartości maszynowe idą krojem cyfr, zdania - nie', () => {
    const v = vm();
    expect(v.what.find((r) => r.label === 'Samolot')?.mono).toBe(true);
    expect(v.what.find((r) => r.label === 'Trasa')?.mono).toBe(true);
    expect(v.what.find((r) => r.label === 'Zadanie')?.mono).toBeFalsy();
  });
});

describe('ton karty terminu - zieleń znaczy „moje" (decyzja właściciela 2026-10-06)', () => {
  it('własna potwierdzona jest zielona, cudza - neutralna, jak szary pasek na osi', () => {
    expect(vm().seated).toBe(true);
    expect(termTone('green', vm().seated)).toBe('green');
    expect(vm({ pilotId: 'krz' }).seated).toBe(false);
    expect(termTone('green', vm({ pilotId: 'krz' }).seated)).toBe('neutral');
  });

  it('drugi pilot siedzi w rezerwacji - dla niego też jest zielona', () => {
    expect(vm({ booking: booking({ dualId: 'jse' }), pilotId: 'jse' }).seated).toBe(true);
  });

  it('„czeka" i „zamknięta" są stanami terminu, nie przynależnością - zostają u każdego', () => {
    expect(termTone('amber', false)).toBe('amber');
    expect(termTone('off', false)).toBe('off');
  });
});

describe('druga osoba w kabinie (decyzja 23 zleceń - karta liczy oba fotele)', () => {
  it('dowódca widzi drugiego pilota: kod wartością, nazwisko rozwinięciem', () => {
    const row = vm({ booking: booking({ dualId: 'jse' }), ...known }).what.at(-1);
    expect(row).toEqual({ label: 'Drugi pilot', value: 'JSE', sub: 'Jan Sęk', mono: true });
  });

  it('drugi pilot widzi DOWÓDCĘ, a nie wiersz o sobie', () => {
    const v = vm({ booking: booking({ dualId: 'jse' }), pilotId: 'jse', ...known });
    expect(v.what.at(-1)).toEqual({ label: 'Dowódca', value: 'AKO', sub: 'Adam Kowalski', mono: true });
    expect(v.what.some((r) => r.label === 'Drugi pilot')).toBe(false);
  });

  it('poza pamięcią klubu zostaje kreska - nigdy surowy identyfikator', () => {
    const row = vm({ booking: booking({ dualId: 'jse' }) }).what.at(-1);
    expect(row?.value).toBe('—');
    expect(row?.sub).toBeNull();
  });
});

describe('rezerwacja ze zlecenia (23F)', () => {
  const order = (over: Partial<NonNullable<CalendarBooking['order']>> = {}) => ({
    seeking: [],
    id: 'o1',
    createdBy: 'mzi',
    ...over,
  });

  it('przydzielony pilot: wiersz „Ze zlecenia" z osobą zlecającą, rezygnacja zamiast poprawki', () => {
    const v = vm({ booking: booking({ order: order() }), ...known });
    expect(v.order?.role).toBe('assigned');
    expect(v.order?.row).toEqual({
      label: 'Ze zlecenia',
      value: 'Marta Zięba',
      sub: 'MZI · termin uzgodnisz w rozmowie',
    });
    // Termin prowadzi zlecenie - poprawkę serwer odrzuciłby jako `booking_from_order`.
    expect(v.canEdit).toBe(false);
    expect(v.editNote).toBeNull();
    expect(v.canCancel).toBe(true);
    // Skutek rezygnacji stoi przypisem pod przyciskiem, arkusz nie dokłada ostrzeżenia.
    expect(v.cancelWarning).toBeNull();
    expect(joined(v.order?.note)).toBe('Po rezygnacji fotel znów będzie do obsadzenia, a Marta Zięba dostanie wiadomość.');
    expect(v.order?.note?.find((p) => p.strong === true)?.text).toBe('fotel znów będzie do obsadzenia');
    expect(v.order?.reference).toBe('SP-AXA · nd 20 WRZ 11:00-13:00');
  });

  it('zlecająca poza pamięcią klubu: kreska i zdanie bez nazwiska', () => {
    const v = vm({ booking: booking({ order: order() }) });
    expect(v.order?.row.value).toBe('—');
    expect(v.order?.row.sub).toBe('termin uzgodnisz w rozmowie');
    expect(joined(v.order?.note)).toBe('Po rezygnacji fotel znów będzie do obsadzenia, a osoba zlecająca dostanie wiadomość.');
  });

  it('zlecający w swoim fotelu odwołuje CAŁE zlecenie (pkt 57) i widzi szukany fotel', () => {
    const v = vm({
      booking: booking({ order: order({ createdBy: 'ako', seeking: ['dual'] }) }),
      ...known,
    });
    expect(v.order?.role).toBe('author');
    expect(v.order?.row).toEqual({ label: 'Ze zlecenia', value: 'Twoje zlecenie', sub: 'termin zmienisz edycją zlecenia' });
    expect(v.order?.note).toBeNull();
    expect(v.canCancel).toBe(true);
    expect(v.canEdit).toBe(false);
    expect(v.cancelWarning).toBe(
      'Termin się zwolni, a adresaci, którzy nie odmówili, dostaną wiadomość - z powodem, jeśli go podasz.',
    );
    expect(v.what.at(-1)).toEqual({ label: 'Drugi pilot', value: 'szukany', sub: null });
  });

  it('drugi pilot ze zlecenia bez dowódcy widzi „Dowódca: szukany"', () => {
    const v = vm({
      booking: booking({ pilotId: null, dualId: 'jse', order: order({ seeking: ['pic'] }) }),
      pilotId: 'jse',
      ...known,
    });
    expect(v.order?.role).toBe('assigned');
    expect(v.what.at(-1)).toEqual({ label: 'Dowódca', value: 'szukany', sub: null });
  });

  it('bez autora zlecenia NIE MA żadnej akcji - zgadnięta rola mogłaby skasować całe zlecenie', () => {
    const v = vm({ booking: booking({ order: { seeking: [], id: null, createdBy: null } }) });
    expect(v.order).toBeNull();
    expect(v.canCancel).toBe(false);
    expect(v.canEdit).toBe(false);
  });

  it('patrzący spoza foteli: bez wiersza zlecenia, bez „szukany" i bez akcji', () => {
    const v = vm({ booking: booking({ order: order({ seeking: ['dual'] }) }), pilotId: 'krz' });
    expect(v.order).toBeNull();
    expect(v.what.some((r) => r.value === 'szukany')).toBe(false);
    expect(v.canCancel).toBe(false);
  });

  it('zamknięte zlecenie: zostaje jedno wyjście, rezygnacji już nie ma', () => {
    const v = vm({ booking: booking({ status: 'cancelled', order: order() }), ...known });
    expect(v.canCancel).toBe(false);
    expect(v.closed).toBe(true);
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

describe('odwołanie zawiadamia osoby w fotelach (§12.9)', () => {
  it('arkusz odwołania mówi PRZED tapnięciem, że drugi pilot dostanie wiadomość', () => {
    expect(vm().cancelWarning).toBe('Termin się zwolni i będzie mógł go zająć ktoś inny.');
    expect(vm({ booking: booking({ dualId: 'jse' }) }).cancelWarning).toBe(
      'Termin się zwolni i będzie mógł go zająć ktoś inny. Drugi pilot dostanie wiadomość.',
    );
  });

  it('drugi pilot odwołanej rezerwacji dostaje wyjście „inny termin", ale nie odwołanie ani poprawkę', () => {
    const asDual = vm({ booking: booking({ dualId: 'jse', status: 'cancelled' }), pilotId: 'jse' });
    expect(asDual.closed).toBe(true);
    const openAsDual = vm({ booking: booking({ dualId: 'jse' }), pilotId: 'jse' });
    expect(openAsDual.canCancel).toBe(false);
    expect(openAsDual.canEdit).toBe(false);
    // Ktoś spoza foteli - nadal bez żadnej akcji.
    expect(vm({ booking: booking({ dualId: 'jse', status: 'cancelled' }), pilotId: 'krz' }).closed).toBe(false);
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
