/**
 * UZ Aero - test PODPISU pod kontrolką czasu (`TimeStepper`).
 *
 * Zdanie „o ile przesunąłem to zdarzenie" pisały wcześniej dwa arkusze osobno i każdy
 * trochę inaczej. Po scaleniu kontrolki (uwaga z urządzenia, 2026-08-14: „korekta czasu
 * to powinien być wszędzie ten sam komponent") jest jedno miejsce - więc i jeden test.
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

  it('przy zerowej zmianie MILCZY', () => {
    // Uwaga z urządzenia (2026-08-14): „bez zmiany względem wpisu (09:01)" mówiło
    // o stanie, który widać w kontrolce nad podpisem - godzina jest ta sama, którą
    // arkusz otworzył. Miejsce na podpis rezerwuje `TimeStepper`, więc jego pojawienie
    // się niczego nie przesuwa.
    expect(timeShiftHint(at(9, 1), at(9, 1), timeUtc)).toBeNull();
    expect(timeShiftHint(at(9, 1), at(9, 1), timeUtc, 'wpisu')).toBeNull();
  });

  it('nazywa źródło wartości pierwotnej, gdy jest znane', () => {
    expect(timeShiftHint(at(9, 3), at(9, 1), timeUtc, 'odczytu GPS')).toBe(
      'Zmiana o +2 min względem odczytu GPS (09:01)',
    );
  });

  it('ponad godzinę mówi w godzinach, nie w minutach (issue #62 pkt 4)', () => {
    // „+205 min" kazało pilotowi dzielić przez sześćdziesiąt, żeby zobaczyć, o ile
    // właściwie się pomylił. Człon zerowy zjadamy - „−1 h", nie „−1 h 0 min".
    expect(timeShiftHint(at(12, 26), at(9, 1), timeUtc)).toBe(
      'Zmiana o +3 h 25 min względem 09:01',
    );
    expect(timeShiftHint(at(10, 1), at(9, 1), timeUtc)).toBe('Zmiana o +1 h względem 09:01');
    expect(timeShiftHint(at(8, 1), at(9, 1), timeUtc)).toBe('Zmiana o −1 h względem 09:01');
    expect(timeShiftHint(at(6, 30), at(9, 1), timeUtc)).toBe(
      'Zmiana o −2 h 31 min względem 09:01',
    );

    // Granica: 59 minut zostaje minutami, 60 staje się godziną.
    expect(timeShiftHint(at(10, 0), at(9, 1), timeUtc)).toBe('Zmiana o +59 min względem 09:01');
  });

  it('sekundy nie robią z minuty dwóch', () => {
    // Czasy zdarzeń niosą sekundy (GPS), a kontrolka chodzi po minutach - podpis ma
    // opisywać krok, który pilot zrobił, a nie różnicę co do sekundy.
    const zSekundami = at(9, 1) + 40_000;

    expect(timeShiftHint(zSekundami + 60_000, zSekundami, timeUtc)).toBe(
      'Zmiana o +1 min względem 09:01',
    );
  });
});
