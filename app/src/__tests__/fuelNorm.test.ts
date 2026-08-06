/**
 * UZ Aero — test normy zużycia w aplikacji pilota.
 *
 * Norma jest podpowiedzią, na której pilot może oprzeć decyzję o paliwie — więc każdy
 * przypadek „nie wiem" musi kończyć się `null`, a nie liczbą. Test pilnuje przede
 * wszystkim tego, a dopiero potem poprawności arytmetyki.
 */

import {
  RESERVE_MINUTES,
  compareToNorm,
  enduranceLabel,
  flightTimeRemainingMs,
  fuelTone,
  liftsRemaining,
  normLabel,
  verdictLabel,
} from '../ui/screens/logic/fuelNorm';
import type { ConsumptionNorm } from '../domain';

/** Norma SP-AXA z mockupu 06: pasmo 15–17 L/h, okno 90 dni. */
const norm = (over: Partial<ConsumptionNorm> = {}): ConsumptionNorm => ({
  windowDays: 90,
  blockLPerHLow: 15,
  blockLPerHHigh: 17,
  blockLPerH: 16,
  airLPerH: 20,
  litersPerFlight: 22,
  intervals: 96,
  engineMs: 118 * 3_600_000,
  computedAt: Date.UTC(2026, 5, 21, 17, 30),
  ...over,
});

describe('porównanie z normą', () => {
  it('wynik w paśmie to „w normie" — łącznie z krawędziami', () => {
    expect(compareToNorm(16, norm())).toBe('w-normie');
    expect(compareToNorm(15, norm())).toBe('w-normie');
    expect(compareToNorm(17, norm())).toBe('w-normie');
  });

  it('rozpoznaje obie strony pasma', () => {
    expect(compareToNorm(18.2, norm())).toBe('powyzej');
    expect(compareToNorm(11.4, norm())).toBe('ponizej');
  });

  it('bez normy albo bez wyniku nie ma werdyktu', () => {
    expect(compareToNorm(16, null)).toBeNull();
    expect(compareToNorm(null, norm())).toBeNull();
    expect(verdictLabel(null)).toBeNull();
  });

  it('napis werdyktu jest ten sam, co w mockupie 06', () => {
    expect(verdictLabel('w-normie')).toBe('✓ w normie');
  });
});

describe('podpis normy', () => {
  it('zaokrągla do pełnych litrów — paliwomierz nie ma lepszej rozdzielczości', () => {
    expect(normLabel(norm({ blockLPerHLow: 15.2, blockLPerHHigh: 16.8 }))).toBe(
      'norma tego samolotu 15–17 L/h · 90 dni',
    );
  });

  it('pasmo zwężone do punktu pokazuje jedną liczbę, nie „16–16"', () => {
    expect(normLabel(norm({ blockLPerHLow: 16, blockLPerHHigh: 16 }))).toBe(
      'norma tego samolotu 16 L/h · 90 dni',
    );
  });

  it('brak normy to brak podpisu', () => {
    expect(normLabel(null)).toBeNull();
  });
});

describe('ile jeszcze wyniesień', () => {
  it('odejmuje rezerwę liczoną stawką LOTU, nie bloku', () => {
    // 141 L na pokładzie, rezerwa 45 min × 20 L/h = 15 L, zostaje 126 L / 22 L = 5.
    expect(liftsRemaining(141, norm())).toBe(5);
  });

  it('paliwo poniżej rezerwy to `null`, nie zero', () => {
    // Zero znaczyłoby „starczy na rezerwę, ale nie na lot" — a tu nie starcza nawet
    // na rezerwę i jest to zupełnie inna sytuacja.
    expect(liftsRemaining(10, norm())).toBeNull();
  });

  it('zero znaczy „starczy na rezerwę, ale nie na kolejny lot"', () => {
    expect(liftsRemaining(20, norm())).toBe(0);
  });

  it('bez stawki lotu nie zgaduje rezerwy', () => {
    // Model zdegradowany do jednej fazy nie ma `airLPerH`. Liczenie rezerwy stawką
    // blokową ZANIŻYŁOBY ją, czyli zawyżyło liczbę wyniesień — błąd w najgorszą stronę.
    expect(liftsRemaining(141, norm({ airLPerH: null }))).toBeNull();
  });

  it('bez metryki „paliwo na lot" też milczy', () => {
    expect(liftsRemaining(141, norm({ litersPerFlight: null }))).toBeNull();
  });

  it('bez normy i bez odczytu paliwa — `null`', () => {
    expect(liftsRemaining(141, null)).toBeNull();
    expect(liftsRemaining(null, norm())).toBeNull();
  });
});

describe('ile jeszcze czasu lotu', () => {
  it('liczy do rezerwy, nie do sucha', () => {
    // 141 L − 15 L rezerwy = 126 L / 20 L/h = 6,3 h.
    expect(flightTimeRemainingMs(141, norm())).toBeCloseTo(6.3 * 3_600_000, -2);
  });

  it('bez stawki lotu nie ma odpowiedzi', () => {
    expect(flightTimeRemainingMs(141, norm({ airLPerH: null }))).toBeNull();
  });
});

describe('zdanie dla paska paliwa (mockup 04)', () => {
  it('preferuje wyniesienia — to jednostka, w której myśli pilot skoków', () => {
    expect(enduranceLabel(141, norm())).toBe(
      `wystarczy na ~5 wyniesień do rezerwy ${RESERVE_MINUTES} min`,
    );
  });

  it('odmienia liczebnik', () => {
    expect(enduranceLabel(42, norm())).toContain('~1 wyniesienie');
    expect(enduranceLabel(80, norm())).toContain('~2 wyniesienia');
  });

  it('bez metryki na lot schodzi na czas lotu', () => {
    expect(enduranceLabel(141, norm({ litersPerFlight: null }))).toBe(
      `wystarczy na ~6:18 lotu do rezerwy ${RESERVE_MINUTES} min`,
    );
  });

  it('bez normy pasek pokazuje sam odczyt paliwa', () => {
    expect(enduranceLabel(141, null)).toBeNull();
  });
});

/**
 * Kolor odczytu paliwa (issue #19). Do tej pory paliwo świeciło na pomarańczowo zawsze —
 * także przy pełnych zbiornikach — więc kolor nie niósł żadnej informacji. Teraz wynika
 * z szacunku czasu lotu, a testy pilnują obu granic i tego, że BEZ NORMY nie zmyślamy tonu.
 */
describe('ton odczytu paliwa', () => {
  // Stawka lotu 20 L/h: 45 min = 15 L, 1:45 = 35 L.
  it('rezerwa i mniej — czerwony', () => {
    expect(fuelTone(15, norm())).toBe('red');
    expect(fuelTone(9, norm())).toBe('red');
  });

  it('godzina nad rezerwą — amber', () => {
    expect(fuelTone(35, norm())).toBe('amber');
    expect(fuelTone(20, norm())).toBe('amber');
  });

  it('powyżej progu ostrzegawczego — bez tonu ostrzegawczego', () => {
    expect(fuelTone(36, norm())).toBe('neutral');
    expect(fuelTone(141, norm())).toBe('neutral');
  });

  it('bez normy albo bez stawki lotu NIE zgadujemy koloru', () => {
    expect(fuelTone(141, null)).toBeNull();
    expect(fuelTone(null, norm())).toBeNull();
    expect(fuelTone(141, norm({ airLPerH: null }))).toBeNull();
  });
});
