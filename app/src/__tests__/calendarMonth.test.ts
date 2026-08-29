/**
 * UZ Aero - testy matematyki kalendarza miesięcznego (arkusz daty lotu, issue #58).
 *
 * Kalendarz potrafi się pomylić w trzech miejscach i wszystkie trzy są tu przybite:
 * wyrównanie pierwszego dnia do PONIEDZIAŁKU (getUTCDay liczy od niedzieli), długość
 * lutego w roku przestępnym i przejście przez granicę roku w obie strony.
 */

import {
  addMonthsUtc,
  calendarWeeks,
  monthStartUtc,
} from '../ui/components/input/calendarMonth';

const DAY_MS = 86_400_000;

describe('monthStartUtc', () => {
  it('zwraca północ UTC pierwszego dnia miesiąca', () => {
    expect(monthStartUtc(Date.UTC(2026, 7, 16, 14, 30))).toBe(Date.UTC(2026, 7, 1));
    // Pierwszy dzień miesiąca jest już „swoim" początkiem.
    expect(monthStartUtc(Date.UTC(2026, 7, 1))).toBe(Date.UTC(2026, 7, 1));
  });
});

describe('addMonthsUtc', () => {
  it('przechodzi przez granicę roku w obie strony', () => {
    expect(addMonthsUtc(Date.UTC(2026, 11, 1), 1)).toBe(Date.UTC(2027, 0, 1));
    expect(addMonthsUtc(Date.UTC(2026, 0, 1), -1)).toBe(Date.UTC(2025, 11, 1));
  });
});

describe('calendarWeeks', () => {
  it('sierpień 2026: zaczyna się w sobotę → 5 pustych pól, 31 dni, 6 tygodni', () => {
    const weeks = calendarWeeks(Date.UTC(2026, 7, 1));

    expect(weeks).toHaveLength(6);
    for (const week of weeks) expect(week).toHaveLength(7);

    // 1 SIE 2026 to sobota - kolumny PN…PT puste, sobota niesie pierwszy dzień.
    expect(weeks[0]!.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(weeks[0]![5]).toBe(Date.UTC(2026, 7, 1));

    const days = weeks.flat().filter((d): d is number => d != null);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe(Date.UTC(2026, 7, 1));
    expect(days.at(-1)).toBe(Date.UTC(2026, 7, 31));
    // Doby idą co 24 h - kalendarz mówi tym samym `utcDayStart`, co reszta modelu.
    expect(days[1]! - days[0]!).toBe(DAY_MS);
  });

  it('czerwiec 2026: zaczyna się w poniedziałek → zero pustych pól na starcie', () => {
    const weeks = calendarWeeks(Date.UTC(2026, 5, 1));
    expect(weeks[0]![0]).toBe(Date.UTC(2026, 5, 1));
  });

  it('luty roku przestępnego ma 29 dni, zwykłego 28', () => {
    const leap = calendarWeeks(Date.UTC(2028, 1, 1)).flat().filter((d) => d != null);
    const plain = calendarWeeks(Date.UTC(2026, 1, 1)).flat().filter((d) => d != null);
    expect(leap).toHaveLength(29);
    expect(plain).toHaveLength(28);
  });

  it('ostatni tydzień jest dopełniony do 7 pól pustymi komórkami', () => {
    const weeks = calendarWeeks(Date.UTC(2026, 7, 1));
    const last = weeks.at(-1)!;
    // 31 SIE 2026 to poniedziałek - reszta tygodnia pusta.
    expect(last[0]).toBe(Date.UTC(2026, 7, 31));
    expect(last.slice(1)).toEqual([null, null, null, null, null, null]);
  });
});
