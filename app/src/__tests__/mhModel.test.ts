/**
 * UZ Aero — test przelicznika motogodzin.
 *
 * Model odpowiada na pytanie, które w dokumentacji nie ma odpowiedzi: czy licznik tego
 * samolotu chodzi z zegarem (Hobbs), czy zlicza obroty (obrotomierzowy, na ziemi wolniej).
 * Odpowiedź bierze się WYŁĄCZNIE z danych, więc test buduje dni o znanych przelicznikach
 * i sprawdza, czy model je odzyskuje — oraz czy MILCZY tam, gdzie dane nie rozstrzygają.
 */

import { fitMhModel, type MhEquation } from '../domain';

const DAY = Date.UTC(2026, 5, 1);
const HOUR = 3_600_000;

/** Dzień o zadanych czasach faz, z przyrostem licznika wyliczonym z zadanych `k`. */
function day(
  index: number,
  flightHours: number,
  groundHours: number,
  kFlight: number,
  kGround: number,
  noise = 0,
): MhEquation {
  return {
    sessionUuid: `s-${index}`,
    dayStart: DAY + index * 86_400_000,
    deltaMh: kFlight * flightHours + kGround * groundHours + noise,
    flightMs: flightHours * HOUR,
    groundMs: groundHours * HOUR,
    clamped: false,
  };
}

/** Sześć dni o RÓŻNYCH proporcjach faz — to ta zmienność identyfikuje przeliczniki. */
function sixDays(kFlight: number, kGround: number, noise: number[] = []): MhEquation[] {
  const shape: Array<[number, number]> = [
    [4.0, 0.5],
    [1.0, 1.5],
    [3.0, 1.0],
    [0.5, 2.0],
    [5.0, 0.8],
    [2.0, 0.3],
  ];
  return shape.map(([flight, ground], i) =>
    day(i, flight, ground, kFlight, kGround, noise[i] ?? 0),
  );
}

describe('rozpoznanie typu licznika', () => {
  it('licznik chodzący 1:1 w obu fazach to Hobbs', () => {
    const model = fitMhModel(sixDays(1, 1));

    expect(model.published).toBe(true);
    expect(model.kind).toBe('hobbs');
    expect(model.perFlightHour).toBeCloseTo(1, 6);
    expect(model.perGroundHour).toBeCloseTo(1, 6);
  });

  it('licznik przyrastający na ziemi wolniej to obrotomierz', () => {
    const model = fitMhModel(sixDays(0.96, 0.41));

    expect(model.kind).toBe('tach');
    expect(model.perFlightHour).toBeCloseTo(0.96, 6);
    expect(model.perGroundHour).toBeCloseTo(0.41, 6);
  });

  it('nie rozstrzyga typu, dopóki dni jest za mało', () => {
    const model = fitMhModel(sixDays(0.96, 0.41).slice(0, 3));

    expect(model.published).toBe(false);
    expect(model.kind).toBe('unknown');
    expect(model.perFlightHour).toBeNull();
    expect(model.perGroundHour).toBeNull();
    // Wiersze zestawienia „fakt kontra model" powstają mimo to — ekran ma co pokazać,
    // zanim przeliczniki wolno opublikować.
    expect(model.rows).toHaveLength(3);
  });
});

describe('odporność wejścia', () => {
  it('odrzuca dzień z ujemnym przyrostem licznika', () => {
    // To nie jest przypadek do dopasowania, tylko rozjazd łańcucha odczytów
    // (flaga `mh_regression`). Wpuszczony do regresji ciągnąłby oba przeliczniki w dół.
    const equations = [...sixDays(1, 1), day(9, 2, 1, -0.5, -0.5)];
    const model = fitMhModel(equations);

    expect(model.rejected).toBe(1);
    expect(model.equations).toBe(6);
    expect(model.perFlightHour).toBeCloseTo(1, 6);
  });

  it('odrzuca dzień bez pracy silnika', () => {
    const model = fitMhModel([...sixDays(1, 1), day(9, 0, 0, 1, 1)]);
    expect(model.rejected).toBe(1);
  });

  it('pusta lista dni nie wywraca modelu', () => {
    const model = fitMhModel([]);
    expect(model.published).toBe(false);
    expect(model.kind).toBe('unknown');
    expect(model.rows).toEqual([]);
  });
});

describe('niepewność i reszty', () => {
  it('dane z rozrzutem dają niezerowy przedział', () => {
    const model = fitMhModel(sixDays(0.96, 0.41, [0.05, -0.04, 0.03, -0.05, 0.04, -0.03]));

    expect(model.perFlightCi).not.toBeNull();
    expect(model.perFlightCi!).toBeGreaterThan(0);
    expect(model.residualSigmaH!).toBeGreaterThan(0);
  });

  it('idealne dopasowanie zostawia reszty przy zerze', () => {
    const model = fitMhModel(sixDays(1, 1));

    for (const row of model.rows) {
      expect(Math.abs(row.residualMh)).toBeLessThan(1e-9);
      expect(row.modelledMh).toBeCloseTo(row.actualMh, 9);
    }
  });
});
