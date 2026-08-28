/**
 * UZ Aero — matematyka kalendarza miesięcznego (arkusz daty lotu, issue #58).
 *
 * Czysta arytmetyka na dobach UTC — zero Reacta, zero zegara systemowego. Komponent
 * `CalendarGrid` tylko rysuje to, co stąd dostanie; testowalne jest wszystko, co
 * w kalendarzu potrafi się pomylić: wyrównanie pierwszego dnia do poniedziałku,
 * długość lutego w roku przestępnym, przejście grudzień → styczeń.
 *
 * Tydzień zaczyna się w PONIEDZIAŁEK (tak czyta kalendarz polski pilot), a wszystkie
 * doby są północami UTC — tą samą kotwicą, którą trzyma cały model (`utcDayStart`).
 */

import type { EpochMillis } from '../../../domain';

const DAY_MS = 86_400_000;

/** Północ UTC pierwszego dnia miesiąca, w który wpada `at`. */
export function monthStartUtc(at: EpochMillis): EpochMillis {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Pierwszy dzień miesiąca przesuniętego o `delta` miesięcy (ujemne = wstecz). */
export function addMonthsUtc(monthStart: EpochMillis, delta: number): EpochMillis {
  const d = new Date(monthStart);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
}

/**
 * Tygodnie miesiąca jako wiersze po 7 komórek (poniedziałek → niedziela).
 * Komórka to północ UTC dnia albo `null` — wyrównanie na skrajach; dni sąsiednich
 * miesięcy NIE rysujemy, bo tapnięcie w nie zmieniałoby dobę i miesiąc naraz.
 */
export function calendarWeeks(monthStart: EpochMillis): (EpochMillis | null)[][] {
  const start = new Date(monthStart);
  const daysInMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // getUTCDay: 0 = niedziela … 6 = sobota → indeks kolumny od poniedziałku.
  const leadBlanks = (start.getUTCDay() + 6) % 7;

  const cells: (EpochMillis | null)[] = Array.from({ length: leadBlanks }, () => null);
  for (let day = 0; day < daysInMonth; day++) cells.push(monthStart + day * DAY_MS);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (EpochMillis | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
