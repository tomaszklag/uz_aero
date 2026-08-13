/**
 * UZ Aero — test wspólnych napisów ekranu sesji (10).
 *
 * Po przebudowie z issue #38 zostały tu dwie odmiany. Wyglądają na drobiazg, ale obie
 * stoją w miejscach, na które pilot patrzy pierwsze: plakietka nagłówka („6 lot"
 * zamiast „6 lotów" byłoby pierwszą rzeczą po zdaniu samolotu) i rozliczenie zrzutów,
 * które idzie do klienta.
 *
 * Wiersze osi czasu, rachunki paliwa i motogodzin mają własne testy —
 * `sessionAxis.test.ts` i `sessionBalance.test.ts`.
 */

import { dateTimeUtcShort, flightsBadge, hhmm, jumperBreakdown } from '../ui/screens/logic/statsDay';

describe('plakietka lotów — trzy formy liczebnika', () => {
  it('pojedyncza, mnoga bliska i mnoga daleka', () => {
    expect(flightsBadge(1)).toBe('1 lot');
    expect(flightsBadge(2)).toBe('2 loty');
    expect(flightsBadge(4)).toBe('4 loty');
    expect(flightsBadge(6)).toBe('6 lotów');
  });

  it('nastki idą do formy dalekiej, mimo końcówki 2–4', () => {
    expect(flightsBadge(12)).toBe('12 lotów');
    expect(flightsBadge(13)).toBe('13 lotów');
    expect(flightsBadge(22)).toBe('22 loty');
  });

  it('zero to też forma daleka — sesja bez lotu jest normalną sesją', () => {
    expect(flightsBadge(0)).toBe('0 lotów');
  });
});

describe('rozbicie skoczków', () => {
  it('wymienia tylko typy, które wystąpiły', () => {
    expect(jumperBreakdown({ tandem: 12, aff: 6, solo: 4 })).toBe('12 TANDEM · 6 AFF · 4 SOLO');
    expect(jumperBreakdown({ tandem: 12, aff: 0, solo: 4 })).toBe('12 TANDEM · 4 SOLO');
  });

  it('sam zero daje kreskę, a nie „0 TANDEM"', () => {
    expect(jumperBreakdown({ tandem: 0, aff: 0, solo: 0 })).toBe('—');
  });
});

describe('formaty przeniesione do pakietu', () => {
  it('re-eksport `hhmm` stawia wiodące zero', () => {
    expect(hhmm((6 * 60 + 39) * 60_000)).toBe('06:39');
    expect(hhmm(0)).toBe('00:00');
  });

  it('re-eksport `dateTimeUtcShort` składa stempel synchronizacji', () => {
    expect(dateTimeUtcShort(Date.UTC(2026, 5, 22, 16, 45))).toBe('22 CZE 16:45');
  });
});
