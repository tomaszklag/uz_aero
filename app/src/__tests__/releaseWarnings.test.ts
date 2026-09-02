/**
 * UZ Aero - ostrzeżenie „nic się nie zmieniło" przy zdaniu samolotu (issue #75 pkt 2).
 *
 * Granica pod obserwacją: ostrzeżenie mówi PRZED zapisem, że zdanie bez żadnej zmiany
 * nie utworzy operacji - i gaśnie samo, gdy pilot poprawi odczyt albo gdy w sesji jest
 * jakakolwiek treść (bieg, dolewka). NIGDY nie blokuje - to rola `releaseBlocker`.
 */

import { emptySessionState } from '../domain';
import type { SessionState } from '../domain';
import { emptyReleaseWarning, readingsUntouched } from '../ui/screens/logic/releaseWarnings';

const T = Date.UTC(2026, 8, 1, 9, 10);

/** 09C: przejęta maszyna z odczytem startowym, silnik nie ruszył. */
function heldNoRun(over: Partial<SessionState> = {}): SessionState {
  return {
    ...emptySessionState(),
    sessionUuid: 's-fgk',
    aircraftId: 'SP-FGK',
    sessionPicId: 'tmk',
    claimedAt: T,
    fuel: { startL: 240, addedL: 0, endL: null, consumedL: null, lastReadingL: 240 },
    mh: { start: 2815.2, end: null, deltaH: null },
    ...over,
  };
}

describe('emptyReleaseWarning', () => {
  it('ostrzega, gdy odczyty stoją na wartościach z przejęcia', () => {
    const warning = emptyReleaseWarning(heldNoRun(), { fuelL: 240, mh: 2815.2 });
    expect(warning).toContain('nic nie zostanie zapisane');
    expect(warning).toContain('w Twoim dniu');
  });

  it('gaśnie, gdy pilot poprawi którykolwiek odczyt', () => {
    expect(emptyReleaseWarning(heldNoRun(), { fuelL: 236, mh: 2815.2 })).toBeNull();
    expect(emptyReleaseWarning(heldNoRun(), { fuelL: 240, mh: 2815.4 })).toBeNull();
  });

  it('gaśnie przy dolewce - tankowanie jest treścią operacji', () => {
    const refueled = heldNoRun({
      fuel: { startL: 240, addedL: 48, endL: null, consumedL: null, lastReadingL: 288 },
    });
    expect(emptyReleaseWarning(refueled, { fuelL: 288, mh: 2815.2 })).toBeNull();
  });

  it('milczy bez kompletu odczytów - wtedy mówi blokada, nie ostrzeżenie', () => {
    expect(emptyReleaseWarning(heldNoRun(), { fuelL: null, mh: 2815.2 })).toBeNull();
    expect(emptyReleaseWarning(heldNoRun(), { fuelL: 240, mh: null })).toBeNull();
  });
});

describe('readingsUntouched', () => {
  const initial = { fuelL: 240, mh: 2815.2 };

  it('prawda dokładnie wtedy, gdy oba pola stoją na wartościach podstawionych', () => {
    expect(readingsUntouched(initial, { fuelL: 240, mh: 2815.2 })).toBe(true);
    expect(readingsUntouched(initial, { fuelL: 236, mh: 2815.2 })).toBe(false);
    expect(readingsUntouched(initial, { fuelL: 240, mh: 2815.4 })).toBe(false);
  });
});
