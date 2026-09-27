import { describe, expect, it } from 'vitest';

import { aircraftLogPath, logbookPath, pilotLogPath, sessionEditPath, sessionPath } from './logbookPaths';

const range = { from: '2026-09-01', to: '2026-09-07' };
const none = { from: '', to: '' };

describe('adresy dziennika', () => {
  it('oś maszyn jest domyślna i nie stoi w adresie; oś pilotów to `os=piloci`', () => {
    expect(logbookPath('samoloty', range)).toBe('/dziennik?od=2026-09-01&do=2026-09-07');
    expect(logbookPath('piloci', range)).toBe('/dziennik?os=piloci&od=2026-09-01&do=2026-09-07');
  });

  it('pusty zakres nie wchodzi do adresu - `?od=&do=` niczego nie mówi', () => {
    expect(logbookPath('samoloty', none)).toBe('/dziennik');
    expect(logbookPath('piloci', none)).toBe('/dziennik?os=piloci');
    expect(aircraftLogPath('SP-AXA', none)).toBe('/dziennik/SP-AXA');
  });

  it('poziom 2 obu osi i poziom 3 niosą zakres, z którego się przyszło', () => {
    expect(aircraftLogPath('SP-AXA', range)).toBe('/dziennik/SP-AXA?od=2026-09-01&do=2026-09-07');
    expect(pilotLogPath('AKO', range)).toBe('/dziennik/pilot/AKO?od=2026-09-01&do=2026-09-07');
    expect(sessionPath('SP-AXA', 'u-1', range)).toBe('/dziennik/SP-AXA/u-1?od=2026-09-01&do=2026-09-07');
  });

  it('tryb edycji operacji ma własny adres - segment `edycja` za operacją, z zakresem', () => {
    expect(sessionEditPath('SP-AXA', 'u-1', range)).toBe(
      '/dziennik/SP-AXA/u-1/edycja?od=2026-09-01&do=2026-09-07',
    );
    expect(sessionEditPath('SP-AXA', 'u-1', none)).toBe('/dziennik/SP-AXA/u-1/edycja');
  });
});
