/**
 * UZ Aero - polityka usługi pierwszoplanowej GPS.
 *
 * Dwa przypadki są tu obroną przed realnymi awariami:
 *  - adopcja (`none` przy działającej usłudze) - restart po powrocie z headless
 *    mrugałby powiadomieniem i wycinał dziurę w śladzie kalibracyjnym,
 *  - `retry-later` z tła - start usługi pierwszoplanowej spoza pierwszego planu
 *    kończy się `ForegroundServiceStartNotAllowedException` i crashem uzbrajania.
 */

import { serviceCommand } from '../infrastructure/gps/backgroundModePolicy';

describe('serviceCommand - usługa pierwszoplanowa GPS', () => {
  it('silnik gra, usługi nie ma, aplikacja na ekranie → start', () => {
    expect(serviceCommand({ desired: 'service', started: false, appActive: true })).toBe('start');
  });

  it('silnik gra, usługi nie ma, aplikacja w tle → retry-later (zakaz startu FGS z tła)', () => {
    expect(serviceCommand({ desired: 'service', started: false, appActive: false })).toBe(
      'retry-later',
    );
  });

  it('silnik gra, usługa już działa → none (adopcja bez mrugnięcia powiadomieniem)', () => {
    expect(serviceCommand({ desired: 'service', started: true, appActive: true })).toBe('none');
    expect(serviceCommand({ desired: 'service', started: true, appActive: false })).toBe('none');
  });

  it('tryb watch, usługa działa → stop (sprzątanie osieroconej usługi)', () => {
    expect(serviceCommand({ desired: 'watch', started: true, appActive: true })).toBe('stop');
  });

  it('tryb watch, usługi nie ma → none', () => {
    expect(serviceCommand({ desired: 'watch', started: false, appActive: false })).toBe('none');
  });
});
