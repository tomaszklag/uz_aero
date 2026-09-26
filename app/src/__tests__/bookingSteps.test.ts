/**
 * Ninerdeck - test bramek formularza rezerwacji (22, 22A).
 *
 * Powód blokady stoi WEWNĄTRZ przycisku, a kolejność sprawdzeń jest kolejnością
 * CZYNNOŚCI: przycisk pokazuje jedno zdanie, więc pierwsze musi być tym, które pilot
 * ma zrobić teraz.
 */

import type { ReferenceAircraft } from '../domain';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';
import {
  confirmLabel,
  overlapping,
  planNote,
  slotNote,
  step1Blocker,
  step2Blocker,
  step2Subtitle,
} from '../ui/screens/logic/bookingSteps';
import type { BookingDraft } from '../ui/store/bookingDraft';

const HOUR = 3_600_000;

const day: ClubDayBounds = {
  date: '2026-09-20',
  startsAt: Date.parse('2026-09-19T22:00:00Z'),
  endsAt: Date.parse('2026-09-20T22:00:00Z'),
};

const at = (hour: number, minute = 0): number => day.startsAt + hour * HOUR + minute * 60_000;

const AXA = { id: 'a1', reg: 'SP-AXA', dualRequired: false, capacityL: 180 } as ReferenceAircraft;
const AN2 = { id: 'a2', reg: 'SP-CDR', dualRequired: true, capacityL: 1200 } as ReferenceAircraft;

function draft(over: Partial<BookingDraft> = {}): BookingDraft {
  return {
    date: '2026-09-20',
    aircraftId: 'a1',
    startsAt: at(11),
    endsAt: at(13),
    operation: 'ferry',
    departureIcao: 'EPKK',
    arrivalIcao: 'EPRJ',
    dualId: null,
    plannedAirMin: 90,
    plannedFuelL: null,
    notes: null,
    ...over,
  };
}

function booking(over: Partial<CalendarBooking> & { id: string }): CalendarBooking {
  return {
    aircraftId: 'a1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: at(13),
    endsAt: at(15),
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

const gate = (over: Partial<Parameters<typeof step1Blocker>[0]> = {}) => ({
  draft: draft(),
  aircraft: AXA,
  bookings: [] as CalendarBooking[],
  now: at(8),
  ...over,
});

describe('krok 1: termin i maszyna', () => {
  it('komplet przechodzi', () => {
    expect(step1Blocker(gate())).toBeNull();
  });

  it('pyta najpierw o maszynę, potem o godziny - bez maszyny godziny nie mają czego zająć', () => {
    expect(step1Blocker(gate({ draft: draft({ aircraftId: null, startsAt: null, endsAt: null }) }))).toBe(
      'Wybierz samolot.',
    );
  });

  it('bez godzin mówi o godzinach', () => {
    expect(step1Blocker(gate({ draft: draft({ startsAt: null, endsAt: null }) }))).toBe(
      'Ustaw godziny rezerwacji.',
    );
  });

  it('odwrócona para mówi o SKUTKU, nie o nazwach pól', () => {
    expect(step1Blocker(gate({ draft: draft({ startsAt: at(13), endsAt: at(11) }) }))).toBe(
      'Koniec rezerwacji wypada przed jej początkiem.',
    );
  });

  describe('termin w przeszłości', () => {
    it('rezerwacja zaczęta kwadrans temu jest NORMALNA - pilot bierze maszynę teraz', () => {
      expect(step1Blocker(gate({ now: at(11, 15) }))).toBeNull();
    });

    it('odrzucamy dopiero termin, który CAŁY minął', () => {
      expect(step1Blocker(gate({ now: at(13, 1) }))).toBe('Ten termin już minął.');
    });
  });

  describe('kolizja z zajętością', () => {
    it('cudza rezerwacja blokuje i nazywa maszynę', () => {
      const blocker = step1Blocker(
        gate({ bookings: [booking({ id: 'b1', startsAt: at(12), endsAt: at(14) })] }),
      );
      expect(blocker).toBe('SP-AXA jest w tych godzinach zajęta.');
    });

    it('wyłączenie z użytku ma własne zdanie', () => {
      const blocker = step1Blocker(
        gate({
          bookings: [booking({ id: 'b1', kind: 'block', startsAt: at(6), endsAt: at(21) })],
        }),
      );
      expect(blocker).toBe('SP-AXA jest w tych godzinach wyłączona z użytku.');
    });

    it('zetknięcie co do minuty NIE jest nakładką - to ta sama klamra, którą liczy baza', () => {
      expect(step1Blocker(gate({ bookings: [booking({ id: 'styk' })] }))).toBeNull();
      expect(overlapping(gate({ bookings: [booking({ id: 'styk' })] }))).toBeNull();
    });

    it('zajętość INNEJ maszyny nie przeszkadza', () => {
      const blocker = step1Blocker(
        gate({
          bookings: [booking({ id: 'b1', aircraftId: 'a2', startsAt: at(12), endsAt: at(14) })],
        }),
      );
      expect(blocker).toBeNull();
    });
  });
});

describe('krok 2: zadanie i plan', () => {
  const two = { draft: draft(), aircraft: AXA, singleField: false };

  it('komplet przechodzi', () => {
    expect(step2Blocker(two)).toBeNull();
  });

  it('rodzaj operacji jest pierwszym pytaniem - wybór ma być świadomy', () => {
    expect(step2Blocker({ ...two, draft: draft({ operation: null }) })).toBe(
      'Wybierz rodzaj operacji.',
    );
  });

  it('skoki pytają o JEDNO lotnisko i tak też nazywają brak', () => {
    expect(
      step2Blocker({
        draft: draft({ operation: 'skoki', departureIcao: '', arrivalIcao: '' }),
        aircraft: AXA,
        singleField: true,
      }),
    ).toBe('Wybierz lotnisko.');
  });

  it('para pyta osobno o start i o lądowanie', () => {
    expect(step2Blocker({ ...two, draft: draft({ departureIcao: '' }) })).toBe(
      'Wybierz lotnisko startu.',
    );
    expect(step2Blocker({ ...two, draft: draft({ arrivalIcao: '' }) })).toBe(
      'Wybierz lotnisko lądowania.',
    );
  });

  it('wymóg załogi dwuosobowej jedzie WSPÓLNYM zdaniem z przejęciem i wpisem ręcznym', () => {
    expect(step2Blocker({ ...two, aircraft: AN2 })).toBe(
      'Wybierz drugiego pilota - ten samolot wymaga załogi dwuosobowej.',
    );
    expect(step2Blocker({ ...two, aircraft: AN2, draft: draft({ dualId: 'bno' }) })).toBeNull();
  });

  it('czas lotu nie ma plakietki „opcjonalne", więc bramka go egzekwuje', () => {
    expect(step2Blocker({ ...two, draft: draft({ plannedAirMin: null }) })).toBe(
      'Podaj planowany czas lotu.',
    );
  });

  it('paliwo jest opcjonalne i nie blokuje', () => {
    expect(step2Blocker({ ...two, draft: draft({ plannedFuelL: null }) })).toBeNull();
  });
});

describe('podpisy', () => {
  it('przycisk mówi, CO SIĘ STANIE - z terminem w środku', () => {
    expect(confirmLabel(draft(), day)).toBe('ZAREZERWUJ 11:00 → 13:00');
  });

  it('bez godzin zostaje sam czasownik', () => {
    expect(confirmLabel(draft({ startsAt: null, endsAt: null }), day)).toBe('ZAREZERWUJ');
  });

  it('podpis godzin mówi długość i to, czy maszyna jest wolna', () => {
    expect(slotNote(gate())).toBe('2 h · SP-AXA wolna w tych godzinach');
    expect(slotNote(gate({ bookings: [booking({ id: 'b1', startsAt: at(12), endsAt: at(14) })] }))).toBe(
      '2 h · SP-AXA zajęta w tych godzinach',
    );
  });

  it('plan krótszy niż termin mówi, ile zostaje na obsługę', () => {
    expect(planNote(draft())).toEqual({
      text: 'Slot 2 h · plan lotu 1:30 zostawia 30 min na obsługę',
      tone: 'muted',
    });
  });

  it('plan dłuższy niż termin nie blokuje, tylko świeci', () => {
    const note = planNote(draft({ plannedAirMin: 150 }));
    expect(note?.tone).toBe('amber');
    expect(note?.text).toContain('nie mieści się w rezerwacji');
  });

  it('bez planu podpisu nie ma - zdanie o niczym', () => {
    expect(planNote(draft({ plannedAirMin: null }))).toBeNull();
  });

  it('podtytuł kroku 2 wypisuje to, co pilot już ustalił', () => {
    expect(step2Subtitle(draft(), day, AXA, 'Niedziela 20 września')).toBe(
      'Niedziela 20 września · 11:00 → 13:00 · SP-AXA',
    );
  });
});
