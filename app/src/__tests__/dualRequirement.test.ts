/**
 * UZ Aero - test wymogu załogi dwuosobowej jako blokady z powodem (uwaga z urządzenia,
 * 2026-08-29).
 *
 * Sedno zgłoszenia brzmiało „trzeba to ujednolicić": ten sam wymóg na 02 mówił banerem,
 * a wszędzie indziej powód blokady stoi w przycisku. Test pilnuje tego, co ujednolicenie
 * naprawdę znaczy - JEDNEGO zdania czytanego przez obie drogi do lotu.
 */

import {
  DUAL_REQUIRED_REASON,
  dualRequirementBlocker,
} from '../ui/screens/logic/dualRequirement';
import { manualFlightStepBlocker, emptyManualFlightDraft } from '../ui/screens/logic/manualFlight';

describe('dualRequirementBlocker', () => {
  it('blokuje maszynę z wymogiem, dopóki nie ma drugiego pilota', () => {
    expect(dualRequirementBlocker({ dualRequired: true }, null)).toBe(DUAL_REQUIRED_REASON);
    expect(dualRequirementBlocker({ dualRequired: true }, 'ako')).toBeNull();
  });

  it('milczy tam, gdzie wymogu nie ma - i zanim jest o czym mówić', () => {
    expect(dualRequirementBlocker({ dualRequired: false }, null)).toBeNull();
    expect(dualRequirementBlocker(null, null)).toBeNull();
    expect(dualRequirementBlocker(undefined, null)).toBeNull();
  });

  it('mówi w trybie rozkazującym, jak każdy inny powód blokady', () => {
    // Pilot czyta powód, szukając NASTĘPNEJ CZYNNOŚCI, nie diagnozy.
    expect(DUAL_REQUIRED_REASON.startsWith('Wybierz drugiego pilota')).toBe(true);
  });
});

describe('to samo zdanie na obu drogach do lotu', () => {
  it('bramka wpisu ręcznego oddaje DOKŁADNIE zdanie wspólnego modułu', () => {
    /* Gdyby krok 1 wpisu ręcznego formułował własne zdanie, rozjazd 02 ↔ 15 wróciłby
       tą samą drogą, którą przyszedł - tylko cicho. Preflight (02) czyta
       `dualRequirementBlocker` wprost w `disabledReason`, więc tu wystarczy sprawdzić
       drugą stronę. */
    const draft = { ...emptyManualFlightDraft(Date.UTC(2026, 7, 16)), aircraftId: 'sp-axa' };
    expect(manualFlightStepBlocker('aircraft', draft, { capacityL: null, dualRequired: true })).toBe(
      DUAL_REQUIRED_REASON,
    );
  });
});
