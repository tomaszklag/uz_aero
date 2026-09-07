/**
 * UZ Aero - test odsiewu miękkich flag na ekranie pilota (issue #84).
 *
 * Filtr jest maleńki, ale strzeże dwóch rzeczy naraz i obie łatwo zepsuć: rozjazd
 * zegara ma zniknąć pilotowi z oczu, a KAŻDE inne ostrzeżenie ma przejść - bo nowe
 * kody dochodzą z każdą turą zgłoszeń i domyślną odpowiedzią musi być „pokaż".
 */

import { pilotWarnings } from '../ui/screens/logic/pilotWarnings';
import type { RuleViolation } from '../domain';

const flag = (code: string, message: string): RuleViolation =>
  ({ code, severity: 'warning', message }) as RuleViolation;

const drift = flag('CLOCK_DRIFT', 'Zegar telefonu rozjeżdża się z GPS o 121 s.');
const fuel = flag('FUEL_MISMATCH', 'Paliwa przybyło bez tankowania - sprawdź odczyt.');

describe('ostrzeżenia pokazywane pilotowi', () => {
  it('rozjazd zegara nie trafia na ekran - pilot nie ma na niego odpowiedzi', () => {
    expect(pilotWarnings([drift])).toEqual([]);
  });

  it('reszta flag przechodzi bez zmian, także obok rozjazdu zegara', () => {
    expect(pilotWarnings([drift, fuel])).toEqual([fuel]);
  });

  /**
   * Domyślną odpowiedzią jest „pokaż": filtr wypisuje wprost, co odsiewa, żeby kod
   * dołożony w przyszłości nie zniknął z ekranu przez przeoczenie.
   */
  it('nieznany kod jest pokazywany, nie ukrywany', () => {
    const nowy = flag('SOMETHING_NEW', 'Coś nowego do sprawdzenia.');

    expect(pilotWarnings([nowy])).toEqual([nowy]);
  });

  it('bez czego odsiewać oddaje TĘ SAMĄ tablicę - render kokpitu nie ma się od czego budzić', () => {
    const all = [fuel];

    expect(pilotWarnings(all)).toBe(all);
  });
});
