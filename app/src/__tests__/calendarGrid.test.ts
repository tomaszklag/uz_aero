/**
 * Ninerdeck - test OSI FLOTY kalendarza (rezerwacje 3.0.0, `logic/calendarGrid.ts`).
 *
 * Pozycje pasków, okno doby lotnej i to, co na osi WIDAĆ. Rachunek stoi tutaj, bo
 * komponent ma go tylko narysować.
 */

import type { ReferenceAircraft } from '../domain';
import type { CalendarBooking } from '../ui/screens/logic/calendarData';
import { buildFleetGrid } from '../ui/screens/logic/calendarGrid';
import type { ClubDayBounds } from '../ui/screens/logic/clubClock';

const HOUR = 3_600_000;

/** Doba klubu w strefie +02:00 (lato): północ lokalna to 22:00 UTC dnia poprzedniego. */
const day: ClubDayBounds = {
  date: '2026-09-19',
  startsAt: Date.parse('2026-09-18T22:00:00Z'),
  endsAt: Date.parse('2026-09-19T22:00:00Z'),
};

const at = (hour: number, minute = 0): number => day.startsAt + hour * HOUR + minute * 60_000;

function aircraft(id: string, reg: string, type = 'C172'): ReferenceAircraft {
  return {
    id,
    reg,
    type,
    year: null,
    capacityL: 180,
    mhFormat: 'hhmm',
    dualRequired: false,
    serviceStatus: 'active',
    fuelNormLPerH: null,
    oilNormLPerH: null,
    oilCapacityL: null,
    oilMinL: null,
    claimPicId: null,
    claimSince: null,
    handover: null,
    consumption: null,
    fetchedAt: 0,
  };
}

function booking(over: Partial<CalendarBooking> & { id: string; aircraftId: string }): CalendarBooking {
  return {
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

const FLEET = [aircraft('a1', 'SP-AXA'), aircraft('a2', 'SP-BKL', 'PA-28')];

function grid(over: Partial<Parameters<typeof buildFleetGrid>[0]> = {}) {
  return buildFleetGrid({
    day,
    aircraft: FLEET,
    bookings: [],
    // Bez lotniska macierzystego okno schodzi do domyślnego 06-21 i test ma równe
    // liczby do sprawdzenia; wariant z efemerydami ma własny przypadek niżej.
    homeIcao: null,
    pilotId: 'ja',
    codeOf: (id) => (id == null ? null : id === 'ja' ? 'TMK' : 'XYZ'),
    nameOf: (id) => (id === 'inny' ? 'Jan Nowak' : null),
    now: at(7, 45),
    ...over,
  });
}

describe('okno osi', () => {
  it('bez lotniska macierzystego jest domyślne i mówi o tym', () => {
    const g = grid();
    expect(g.windowBasis).toBe('default');
    expect(g.from).toBe(at(6));
    expect(g.to).toBe(at(21));
  });

  it('z lotniskiem macierzystym liczy się z efemeryd', () => {
    const g = grid({ homeIcao: 'EPKK' });
    expect(g.windowBasis).toBe('solar');
    // Wrzesień w Krakowie: okno szersze niż 06-21 nie jest, ale zaczyna się i kończy
    // w innych minutach niż pełna godzina - dokładnych wartości nie przepisujemy,
    // bo to byłoby powtórzenie tej samej formuły, którą liczy domena.
    expect(g.from).toBeGreaterThan(day.startsAt);
    expect(g.to).toBeLessThan(day.endsAt);
    expect(g.from % HOUR).not.toBe(at(6) % HOUR);
  });

  it('REZERWACJA wystająca poza dobę lotną ROZCIĄGA okno - ukryta byłaby ukrytą kolizją', () => {
    const g = grid({
      bookings: [booking({ id: 'b1', aircraftId: 'a1', startsAt: at(4), endsAt: at(5) })],
    });
    expect(g.from).toBe(at(4));
    expect(g.rows[0]!.bars).toHaveLength(1);
  });

  it('WYŁĄCZENIE Z UŻYTKU okna nie rozciąga - przycięcie niczego nie gubi', () => {
    const g = grid({
      bookings: [
        booking({
          id: 'b1',
          aircraftId: 'a1',
          kind: 'block',
          startsAt: day.startsAt,
          endsAt: day.endsAt,
          blockReason: 'Przegląd 100 h',
        }),
      ],
    });
    expect(g.from).toBe(at(6));
    expect(g.to).toBe(at(21));
    // Całodobowe wyłączenie rysuje się na CAŁEJ szerokości okna, jak w makiecie.
    expect(g.rows[0]!.bars[0]).toMatchObject({ leftPct: 0, widthPct: 100, tone: 'block' });
  });
});

describe('paski zajętości', () => {
  it('pozycja i szerokość liczą się w procentach okna', () => {
    const g = grid({ bookings: [booking({ id: 'b1', aircraftId: 'a1' })] });
    const bar = g.rows[0]!.bars[0]!;
    // 09:00 w oknie 06-21 (15 h) to 20%, dwie godziny to 13,33%.
    expect(bar.leftPct).toBeCloseTo(20);
    expect(bar.widthPct).toBeCloseTo(13.33, 1);
  });

  it('bardzo krótka rezerwacja ma szerokość progu dotknięcia, nie kreski', () => {
    const g = grid({
      bookings: [booking({ id: 'b1', aircraftId: 'a1', startsAt: at(9), endsAt: at(9, 5) })],
    });
    expect(g.rows[0]!.bars[0]!.widthPct).toBeGreaterThanOrEqual(1.6);
  });

  it('pasek podniesiony do progu nie wyjeżdża poza prawą krawędź', () => {
    const g = grid({
      bookings: [booking({ id: 'b1', aircraftId: 'a1', startsAt: at(20, 55), endsAt: at(21) })],
    });
    const bar = g.rows[0]!.bars[0]!;
    expect(bar.leftPct + bar.widthPct).toBeLessThanOrEqual(100.0001);
  });

  it('paski jednej maszyny idą po czasie, niezależnie od kolejności w odpowiedzi', () => {
    const g = grid({
      bookings: [
        booking({ id: 'pozny', aircraftId: 'a1', startsAt: at(15), endsAt: at(16) }),
        booking({ id: 'wczesny', aircraftId: 'a1', startsAt: at(8), endsAt: at(9) }),
      ],
    });
    expect(g.rows[0]!.bars.map((b) => b.bookingId)).toEqual(['wczesny', 'pozny']);
  });
});

describe('napis i ton paska', () => {
  it('WŁASNA rezerwacja niesie skrócone nazwisko - jedna konwencja na całej osi', () => {
    const g = grid({
      bookings: [booking({ id: 'b1', aircraftId: 'a1', pilotId: 'ja' })],
      nameOf: (id) => (id === 'ja' ? 'Tomasz Małkiewicz' : null),
    });
    expect(g.rows[0]!.bars[0]).toMatchObject({ label: 'T. Małkiewicz', tone: 'mine' });
  });

  it('CUDZA tak samo - kodów kolegów nikt nie pamięta', () => {
    const g = grid({ bookings: [booking({ id: 'b1', aircraftId: 'a1' })] });
    expect(g.rows[0]!.bars[0]).toMatchObject({ label: 'J. Nowak', tone: 'other' });
  });

  it('pilot spoza cache floty zostaje przy kodzie, a nie przy surowym identyfikatorze', () => {
    const g = grid({
      bookings: [booking({ id: 'b1', aircraftId: 'a1', pilotId: 'obcy' })],
      nameOf: () => null,
      codeOf: (id) => (id === 'obcy' ? 'OBC' : null),
    });
    expect(g.rows[0]!.bars[0]!.label).toBe('OBC');
  });

  it('własny pasek bez nazwiska w cache schodzi do kodu, nie do identyfikatora', () => {
    const g = grid({
      bookings: [booking({ id: 'b1', aircraftId: 'a1', pilotId: 'ja' })],
      nameOf: () => null,
    });
    expect(g.rows[0]!.bars[0]!.label).toBe('TMK');
  });

  it('wyłączenie z użytku niesie POWÓD, a bez niego nazwę stanu', () => {
    const g = grid({
      bookings: [
        booking({ id: 'b1', aircraftId: 'a1', kind: 'block', blockReason: 'Usterka - radio' }),
        booking({ id: 'b2', aircraftId: 'a2', kind: 'block', blockReason: null }),
      ],
    });
    expect(g.rows[0]!.bars[0]!.label).toBe('Usterka - radio');
    expect(g.rows[1]!.bars[0]!.label).toBe('Wyłączony z użytku');
  });

  it('czekająca na zgodę ma TEN SAM ton, a odróżnia się kształtem', () => {
    const g = grid({
      bookings: [booking({ id: 'b1', aircraftId: 'a1', pilotId: 'ja', status: 'pending' })],
    });
    expect(g.rows[0]!.bars[0]!.tone).toBe('pending');
  });
});

describe('siatka, skala i „teraz"', () => {
  it('mocniejsze linie stoją dokładnie pod podpisami (bez krawędzi okna)', () => {
    const g = grid();
    expect(g.majorTicks).toEqual(
      g.scale.filter((m) => m.pct > 0 && m.pct < 100).map((m) => m.pct),
    );
  });

  it('skala nazywa GODZINY KLUBU, nie UTC', () => {
    // Okno domyślne 06-21: krawędzie są pełnymi godzinami i mają podpisy, jak w makiecie.
    expect(grid().scale.map((m) => m.text)).toEqual(['06', '09', '12', '15', '18', '21']);
  });

  it('linie pełnych godzin są w środku okna, bez krawędzi', () => {
    const g = grid();
    // Okno 06-21 ma czternaście linii wewnętrznych (07…20).
    expect(g.hourTicks).toHaveLength(14);
    expect(g.hourTicks[0]).toBeCloseTo((1 / 15) * 100);
  });

  it('linia „teraz" stoi na swoim procencie, gdy chwila leży w oknie', () => {
    // 07:45 w oknie 06-21 to 11,67%.
    expect(grid().nowPct).toBeCloseTo(11.67, 1);
  });

  it('poza oknem linii „teraz" nie ma - inna doba nie ma „teraz"', () => {
    expect(grid({ now: at(3) }).nowPct).toBeNull();
  });
});

describe('legenda', () => {
  it('doba bez zajętości nie dostaje legendy - nie ma czego tłumaczyć', () => {
    expect(grid().legend).toEqual([]);
  });

  it('opisuje wyłącznie tony obecne na osi i zawsze w tej samej kolejności', () => {
    const g = grid({
      bookings: [
        booking({ id: 'b1', aircraftId: 'a2', kind: 'block', blockReason: 'Przegląd' }),
        booking({ id: 'b2', aircraftId: 'a1', pilotId: 'ja' }),
      ],
    });
    expect(g.legend).toEqual(['mine', 'block']);
  });
});

describe('zawężenie floty', () => {
  it('oś rysuje maszyny, które dostała - filtr jest sprawą wołającego', () => {
    const g = grid({ aircraft: [FLEET[1]!] });
    expect(g.rows.map((r) => r.reg)).toEqual(['SP-BKL']);
  });
});
