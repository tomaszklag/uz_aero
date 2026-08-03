/**
 * UZ Aero — routing paczek fixów z taska usługi w tle.
 *
 * Kontrakt: żywy sink > zapis headless > kosz. Fix bez atrybucji sesji NIE trafia
 * do `gps_trace` — przy następnym claimie mógłby wylądować w cudzej sesji, a bez
 * sesji jest bezużyteczny dla kalibracji progów (faza 5).
 */

import { routeBackgroundFixes } from '../infrastructure/gps/backgroundFixRouting';

describe('routeBackgroundFixes — sink > store > drop', () => {
  it('żywy sink wygrywa nawet przy znanej sesji (aplikacja sama pisze ślad)', () => {
    expect(routeBackgroundFixes(true, 'sess-1')).toEqual({ kind: 'sink' });
    expect(routeBackgroundFixes(true, null)).toEqual({ kind: 'sink' });
  });

  it('bez sinka i ze znaną sesją → zapis headless z tą sesją', () => {
    expect(routeBackgroundFixes(false, 'sess-1')).toEqual({
      kind: 'store',
      sessionUuid: 'sess-1',
    });
  });

  it('bez sinka i bez sesji → kosz (null i pusty string)', () => {
    expect(routeBackgroundFixes(false, null)).toEqual({ kind: 'drop' });
    expect(routeBackgroundFixes(false, '')).toEqual({ kind: 'drop' });
  });
});
