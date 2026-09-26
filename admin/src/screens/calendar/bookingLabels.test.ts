import { describe, expect, it } from 'vitest';

import type { BookingDto } from '../../api/dto';
import {
  cellLabel,
  drawerHeading,
  hoursLabel,
  originLabel,
  plannedLabel,
  type Person,
} from './bookingLabels';

const PEOPLE: Readonly<Record<string, Person>> = {
  'p-1': { name: 'Jan Nowak', code: 'JNO' },
  'p-2': { name: 'Adam Kowalski', code: 'AKO' },
};
const person = (id: string): Person | null => PEOPLE[id] ?? null;

const booking = (over: Partial<BookingDto> = {}): BookingDto =>
  ({
    id: 'b-1',
    aircraftId: 'a-1',
    kind: 'flight',
    status: 'confirmed',
    startsAt: '2026-09-22T08:00:00.000Z',
    endsAt: '2026-09-22T10:00:00.000Z',
    pilotId: 'p-1',
    dualId: null,
    operation: 'ferry',
    fromIcao: null,
    toIcao: null,
    plannedAirMin: null,
    plannedFuelL: null,
    blockReason: null,
    note: null,
    sessionUuid: null,
    createdAt: '2026-09-18T18:14:00.000Z',
    createdBy: 'p-2',
    ...over,
  }) as BookingDto;

describe('napis na pasku siatki', () => {
  it('rezerwacja niesie SKRÓCONE NAZWISKO, nie identyfikator ani kod', () => {
    expect(cellLabel(booking(), person)).toBe('J. Nowak');
  });

  it('pilot spoza cache członków daje kreskę, nie surowy identyfikator', () => {
    // `7c1e5a9b-…` na kalendarzu nie mówi nic nikomu - to ta sama klasa błędu,
    // przez którą sygnatura operacji w ogóle powstała (issue #68).
    expect(cellLabel(booking({ pilotId: 'p-nieznany' }), person)).toBe('—');
    expect(cellLabel(booking({ pilotId: null }), person)).toBe('—');
  });

  it('wyłączenie z użytku mówi NOTATKĄ, bo powodów z katalogu są trzy', () => {
    const block = booking({ kind: 'block', pilotId: null, blockReason: 'maintenance' });
    expect(cellLabel({ ...block, note: 'Przegląd 100 h' }, person)).toBe('Przegląd 100 h');
  });

  it('wyłączenie bez notatki wraca do nazwy z katalogu - pasek bez napisu byłby plamką', () => {
    const block = booking({ kind: 'block', pilotId: null, blockReason: 'defect' });
    expect(cellLabel(block, person)).toBe('Usterka');
    expect(cellLabel({ ...block, note: '   ' }, person)).toBe('Usterka');
  });

  it('nieznany powód wyłączenia nie wywraca napisu', () => {
    const block = booking({ kind: 'block', pilotId: null, blockReason: 'sabotaż' as never });
    expect(cellLabel(block, person)).toBe('Wyłączona');
  });
});

describe('długość terminu', () => {
  it('pełne godziny bez przecinka', () => {
    expect(hoursLabel(2 * 3_600_000)).toBe('2 h');
  });

  it('połówka z PRZECINKIEM - panel pisze po polsku', () => {
    expect(hoursLabel(2.5 * 3_600_000)).toBe('2,5 h');
  });

  it('niepełne dziesiąte zaokrągla się do jednej cyfry', () => {
    // 2 h 20 min = 2,333… - druga cyfra po przecinku udawałaby dokładność, której
    // umowa o termin nie ma.
    expect(hoursLabel(140 * 60_000)).toBe('2,3 h');
  });

  it('zakres pusty albo odwrócony nie daje liczby ujemnej', () => {
    expect(hoursLabel(0)).toBe('0 h');
    expect(hoursLabel(-3_600_000)).toBe('0 h');
  });
});

describe('plan lotu', () => {
  it('czas w powietrzu jako H:MM, paliwo w litrach', () => {
    expect(plannedLabel(booking({ plannedAirMin: 90, plannedFuelL: 120 }))).toBe(
      '1:30 · paliwo 120 L',
    );
  });

  it('każdy człon osobno - pilot deklaruje je, gdy chce', () => {
    expect(plannedLabel(booking({ plannedAirMin: 45 }))).toBe('0:45');
    expect(plannedLabel(booking({ plannedFuelL: 60 }))).toBe('paliwo 60 L');
  });

  it('bez planu napis jest PUSTY - wtedy wiersza w szufladzie nie ma wcale', () => {
    expect(plannedLabel(booking())).toBe('');
  });
});

describe('nagłówek szuflady', () => {
  const TZ = 'Europe/Warsaw';

  it('jedna doba: dzień tygodnia w tytule, same godziny w podtytule', () => {
    const h = drawerHeading(
      booking({ startsAt: '2026-09-26T07:00:00.000Z', endsAt: '2026-09-26T15:00:00.000Z' }),
      'SP-AND',
      TZ,
    );
    expect(h.title).toBe('SP-AND · sobota, 26 września');
    expect(h.sub).toBe('09:00 → 17:00 czasu klubu · 8 h · rezerwacja pilota');
  });

  it('KILKA DÓB: tytuł podaje zakres dat, a godziny dostają swoje dni', () => {
    // Przegląd przez trzy doby z tytułem „środa, 23 września" i podtytułem „06:00 → 18:00"
    // czytał się jak dwunastogodzinne okno w środę - i przeczył „60 h" dwie linijki niżej.
    const h = drawerHeading(
      booking({
        kind: 'block',
        pilotId: null,
        startsAt: '2026-09-23T04:00:00.000Z',
        endsAt: '2026-09-25T16:00:00.000Z',
      }),
      'SP-TKM',
      TZ,
    );
    expect(h.title).toBe('SP-TKM · 23-25 września');
    expect(h.sub).toBe('23 wrz, 06:00 → 25 wrz, 18:00 czasu klubu · 60 h · wyłączenie z użytku');
  });

  it('na przełomie miesięcy miesiąc pada po OBU stronach zakresu', () => {
    const h = drawerHeading(
      booking({
        kind: 'block',
        pilotId: null,
        startsAt: '2026-09-30T04:00:00.000Z',
        endsAt: '2026-10-02T16:00:00.000Z',
      }),
      'SP-TKM',
      TZ,
    );
    expect(h.title).toBe('SP-TKM · 30 września - 2 października');
  });

  it('doby liczą się w strefie KLUBU, nie przeglądarki', () => {
    // 23:30 czasu klubu to jeszcze ta sama doba, choć w UTC jest już następna.
    const h = drawerHeading(
      booking({ startsAt: '2026-09-26T19:00:00.000Z', endsAt: '2026-09-26T21:30:00.000Z' }),
      'SP-AXA',
      TZ,
    );
    expect(h.title).toBe('SP-AXA · sobota, 26 września');
  });
});

describe('pochodzenie zajętości', () => {
  it('rezerwacja pilota założona przez niego samego mówi o APLIKACJI', () => {
    expect(originLabel(booking({ pilotId: 'p-1', createdBy: 'p-1' }), person)).toBe(
      'przez pilota, z aplikacji',
    );
  });

  it('cudza ręka to PANEL, a kto - mówi kod, bo kod się nie odmienia', () => {
    expect(originLabel(booking({ pilotId: 'p-1', createdBy: 'p-2' }), person)).toBe('z panelu · AKO');
  });

  it('autor spoza cache członków nie zostawia po sobie pustego napisu', () => {
    expect(originLabel(booking({ createdBy: 'ktoś-obcy' }), person)).toBe('z panelu');
  });
});
