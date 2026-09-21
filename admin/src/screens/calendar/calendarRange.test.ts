/**
 * Ninerdeck - panel: zakres dat kalendarza (issue #160).
 *
 * Pod obserwacją jest jedna liczba, którą łatwo pomylić o jeden i zobaczyć dopiero na
 * ekranie: ile KOLUMN wyjdzie z okna. Serwer domyka dobę sam, więc `now + 7 dni` daje
 * osiem kolumn pod chipem „Ten tydzień".
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_RANGE, RANGE_OPTIONS, calendarQuery, rangeDays } from './calendarRange';

const DAY_MS = 86_400_000;
const TERAZ = Date.parse('2026-09-20T17:16:00.000Z');

describe('okno pytania o kalendarz', () => {
  it('kończy się na POCZĄTKU ostatniej doby, nie dobę dalej', () => {
    const q = calendarQuery('week', TERAZ);
    expect(Date.parse(q.from)).toBe(TERAZ);
    expect(Date.parse(q.to) - TERAZ).toBe(6 * DAY_MS);
  });

  it('każdy zakres obejmuje DOKŁADNIE tyle dób, ile obiecuje jego chip', () => {
    // Doba klubu to okno [północ, północ), a `clubDays` kończy się na tej, która
    // obejmuje `to` - więc liczba dób to liczba przeskoczonych północy plus jeden.
    for (const option of RANGE_OPTIONS) {
      const q = calendarQuery(option.key, TERAZ);
      const dob = (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS + 1;
      expect(dob).toBe(option.days);
      expect(rangeDays(option.key)).toBe(option.days);
    }
  });

  it('nieznany zakres z adresu schodzi do domyślnego zamiast wywracać ekran', () => {
    expect(calendarQuery('kwartał' as never, TERAZ)).toEqual(calendarQuery(DEFAULT_RANGE, TERAZ));
  });
});
