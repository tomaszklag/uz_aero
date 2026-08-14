/**
 * UZ Aero — test PODPISU pod kontrolką czasu (`TimeStepper`).
 *
 * Zdanie „o ile przesunąłem to zdarzenie" pisały wcześniej dwa arkusze osobno i każdy
 * trochę inaczej. Po scaleniu kontrolki (uwaga z urządzenia, 2026-08-14: „korekta czasu
 * to powinien być wszędzie ten sam komponent") jest jedno miejsce — więc i jeden test.
 */

import { timeShiftHint } from '../ui/components/input/timeShiftHint';
import { timeUtc } from '../ui/format';

const DAY = Date.UTC(2026, 7, 6);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

describe('podpis przesunięcia czasu', () => {
  it('mówi o ile i w którą stronę', () => {
    expect(timeShiftHint(at(9, 3), at(9, 1), timeUtc)).toBe('Zmiana o +2 min względem 09:01');
    expect(timeShiftHint(at(8, 58), at(9, 1), timeUtc)).toBe('Zmiana o −3 min względem 09:01');
  });

  it('przy zerowej zmianie NIE MILCZY', () => {
    // Pilot, który tapnął dwa razy w przeciwne strony, musi widzieć, że wrócił do
    // wartości pierwotnej — brak podpisu wygląda tak samo jak stan sprzed edycji.
    expect(timeShiftHint(at(9, 1), at(9, 1), timeUtc)).toBe('Bez zmiany względem 09:01');
  });

  it('nazywa źródło wartości pierwotnej, gdy jest znane', () => {
    expect(timeShiftHint(at(9, 3), at(9, 1), timeUtc, 'odczytu GPS')).toBe(
      'Zmiana o +2 min względem odczytu GPS (09:01)',
    );
  });

  it('sekundy nie robią z minuty dwóch', () => {
    // Czasy zdarzeń niosą sekundy (GPS), a kontrolka chodzi po minutach — podpis ma
    // opisywać krok, który pilot zrobił, a nie różnicę co do sekundy.
    const zSekundami = at(9, 1) + 40_000;

    expect(timeShiftHint(zSekundami + 60_000, zSekundami, timeUtc)).toBe(
      'Zmiana o +1 min względem 09:01',
    );
  });
});
