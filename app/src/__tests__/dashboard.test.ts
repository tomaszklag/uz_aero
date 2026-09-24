/**
 * Ninerdeck - testy modelu PULPITU (ekran 20, epik R-E).
 *
 * Trzy rzeczy, które ekran mówi o dobie i o planie - i każda z nich ma stan graniczny,
 * w którym łatwo skłamać: doba bez lotów (żadnych zer), termin, który już się zaczął
 * (żadnego minusa), i brak rezerwacji (żadnego podpisu pod przyciskiem).
 */

import {
  bookingLead,
  bookingLength,
  daySubtitle,
  startHint,
  type NextBooking,
} from '../ui/screens/logic/dashboard';
import type { MyDayVm } from '../ui/screens/logic/myDay';

const MIN = 60_000;
const H = 3_600_000;

const dzien = (aircraft: string[], empty = false): MyDayVm =>
  ({
    empty,
    sessions: aircraft.map((reg, i) => ({ sessionUuid: `s-${i}`, aircraft: reg })),
    totals: { flights: null, block: null, flight: null, aircraftCount: aircraft.length },
  }) as unknown as MyDayVm;

const rezerwacja = (over: Partial<NextBooking> = {}): NextBooking => ({
  id: 'b-1',
  startsAt: Date.UTC(2026, 8, 20, 7, 0),
  endsAt: Date.UTC(2026, 8, 20, 9, 0),
  clock: '09:00 → 11:00',
  aircraft: 'SP-AXA',
  operation: 'Przelot',
  pending: false,
  route: 'EPKK → EPRJ',
  dualCode: 'BNO',
  ...over,
});

describe('podpis karty „Mój dzień"', () => {
  it('mówi ILE i CZYM - suma „Blok 1:38" sama nie zdradza, że dzień miał dwie maszyny', () => {
    expect(daySubtitle(dzien(['SP-AXA', 'SP-BKL']))).toBe('2 operacje · SP-AXA, SP-BKL');
    expect(daySubtitle(dzien(['SP-AXA']))).toBe('1 operacja · SP-AXA');
    expect(daySubtitle(dzien(['SP-AXA', 'SP-BKL', 'SP-TKM', 'SP-AND', 'SP-OLD']))).toMatch(
      /^5 operacji · /,
    );
  });

  it('ta sama maszyna dwa razy pada w podpisie RAZ', () => {
    // Podpis odpowiada na „czym dziś latałem", a nie „ile razy wymieniałem samolot".
    expect(daySubtitle(dzien(['SP-AXA', 'SP-AXA']))).toBe('2 operacje · SP-AXA');
  });

  it('doba BEZ LOTÓW nie ma podpisu - karta kurczy się do jednej linijki', () => {
    // Zera znaczyłyby zmierzony wynik, a nie brak pomiaru (reguła z 01A: „- -", nigdy zera).
    expect(daySubtitle(dzien([], true))).toBeNull();
  });
});

describe('odliczanie do rezerwacji', () => {
  const start = Date.UTC(2026, 8, 20, 7, 0);

  it('godziny i minuty, a przy pełnej godzinie - same godziny', () => {
    expect(bookingLead(start, start - (1 * H + 15 * MIN))).toBe('ZA 1 H 15 MIN');
    expect(bookingLead(start, start - 2 * H)).toBe('ZA 2 H');
  });

  it('poniżej godziny same minuty', () => {
    expect(bookingLead(start, start - 45 * MIN)).toBe('ZA 45 MIN');
  });

  it('termin, który JUŻ SIĘ ZACZĄŁ, nie odlicza wstecz', () => {
    // Rezerwacja zaczynająca się kwadrans temu jest normalna: pilot bierze maszynę
    // i wpisuje, do której godziny. Minus opisywałby stan zwyczajny jako spóźnienie.
    expect(bookingLead(start, start)).toBe('TERAZ');
    expect(bookingLead(start, start + 15 * MIN)).toBe('TERAZ');
  });

  it('powyżej dwunastu godzin liczba przestaje być czasem - zostaje „JUTRO"', () => {
    expect(bookingLead(start, start - 18 * H)).toBe('JUTRO');
  });

  it('ostatnia minuta nie zeruje się przed czasem', () => {
    // „ZA 0 MIN" czyta się jak „już po" - a termin jeszcze nie nadszedł.
    expect(bookingLead(start, start - 30_000)).toBe('ZA 1 MIN');
  });
});

describe('podpis pod „ROZPOCZNIJ LOT"', () => {
  it('mówi, czym wypełni się krok 1 - bo karta rezerwacji nie ma własnego startu', () => {
    expect(startHint(rezerwacja())).toBe('Wypełni się rezerwacją 09:00 · SP-AXA');
  });

  it('bez rezerwacji podpisu NIE MA', () => {
    // Przycisk wygląda i stoi tak samo przez cały dzień (issue #42); rezerwacja zmienia
    // wyłącznie to, czym wypełni krok przejęcia.
    expect(startHint(null)).toBeUndefined();
  });
});

describe('długość terminu', () => {
  it('liczy się z pary chwil, nie z napisu', () => {
    expect(bookingLength(rezerwacja())).toBe('2:00');
    expect(bookingLength(rezerwacja({ endsAt: Date.UTC(2026, 8, 20, 8, 30) }))).toBe('1:30');
  });
});
