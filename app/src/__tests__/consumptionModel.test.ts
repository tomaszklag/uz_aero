/**
 * UZ Aero — test modelu zużycia paliwa per faza.
 *
 * Model odpowiada na pytanie, którego nikt nie zmierzył: ile samolot pali na ziemi,
 * a ile w powietrzu. Odpowiedź jest wnioskiem z wielu interwałów, więc test buduje dane
 * o ZNANYCH stawkach i sprawdza, czy model je odzyskuje — a przede wszystkim, czy
 * MILCZY tam, gdzie dane nie pozwalają rozdzielić faz. Cichy podział przypadkowy
 * byłby tu gorszy od braku odpowiedzi, bo wygląda jak wiedza.
 */

import { fitConsumptionModel, type FuelInterval } from '../domain';

const DAY = Date.UTC(2026, 4, 10);
const HOUR = 3_600_000;

/** Interwał o zadanym czasie ziemi i lotu; zużycie liczone z zadanych stawek. */
function interval(
  index: number,
  groundHours: number,
  flightHours: number,
  groundRate: number,
  airRate: number,
  noise = 0,
): FuelInterval {
  const groundMs = groundHours * HOUR;
  const flightMs = flightHours * HOUR;
  return {
    sessionUuid: `s-${index}`,
    aircraftId: 'SP-AXA',
    dayStart: DAY + index * 86_400_000,
    startAt: DAY + index * 86_400_000,
    endAt: DAY + index * 86_400_000 + groundMs + flightMs,
    startKind: 'preflight',
    endKind: 'day_close',
    startUuid: `u-${index}-a`,
    endUuid: `u-${index}-b`,
    startReadingL: 200,
    endReadingL: 100,
    consumedL: groundRate * groundHours + airRate * flightHours + noise,
    engineMs: groundMs + flightMs,
    flightMs,
    groundMs,
    climbMs: null,
    cruiseMs: null,
    descentMs: null,
    flightCount: Math.max(1, Math.round(flightHours)),
    rejected: null,
  };
}

/**
 * Sześć interwałów o RÓŻNYCH proporcjach ziemia/powietrze — to ta zmienność pozwala
 * rozdzielić stawki. Łącznie ponad 10 h silnika, więc bramka publikacji przechodzi.
 */
function variedIntervals(groundRate: number, airRate: number, noise: number[] = []): FuelInterval[] {
  const shape: Array<[number, number]> = [
    [0.5, 3.0],
    [1.5, 1.0],
    [0.4, 2.5],
    [2.0, 0.6],
    [0.8, 3.5],
    [1.2, 2.0],
  ];
  return shape.map(([ground, flight], i) =>
    interval(i, ground, flight, groundRate, airRate, noise[i] ?? 0),
  );
}

describe('rozdzielenie faz', () => {
  it('odzyskuje stawki ziemi i powietrza z interwałów o różnych proporcjach', () => {
    const model = fitConsumptionModel(variedIntervals(12, 42));

    expect(model.published).toBe(true);
    expect(model.phaseSet).toBe('two');
    expect(rate(model, 'ground')).toBeCloseTo(12, 6);
    expect(rate(model, 'air')).toBeCloseTo(42, 6);
  });

  it('nie schodzi do modelu czterofazowego bez śladu GPS i mówi dlaczego', () => {
    const model = fitConsumptionModel(variedIntervals(12, 42));

    expect(model.phaseSet).toBe('two');
    expect(model.degradedBecause).toBe('no-trace');
    expect(model.tracedIntervals).toBe(0);
  });

  it('podaje udział czasu każdej fazy — wstęga na ekranie', () => {
    const model = fitConsumptionModel(variedIntervals(12, 42));
    const ground = model.rates.find((r) => r.phase === 'ground')!;
    const air = model.rates.find((r) => r.phase === 'air')!;

    expect(ground.hoursInWindowMs).toBeCloseTo(6.4 * HOUR, 0);
    expect(air.hoursInWindowMs).toBeCloseTo(12.6 * HOUR, 0);
  });
});

describe('degradacja, gdy faz nie da się rozdzielić', () => {
  it('schodzi do jednej fazy, gdy proporcje są STAŁE we wszystkich interwałach', () => {
    // Każdy interwał ma ziemię i lot w tej samej proporcji 1:3. Podział zużycia między
    // te dwie fazy jest wtedy dowolny — każdy pasuje tak samo dobrze.
    const constant = [1, 2, 3, 4, 5, 6].map((n) => interval(n, n * 0.5, n * 1.5, 12, 42));
    const model = fitConsumptionModel(constant);

    expect(model.phaseSet).toBe('single');
    expect(model.degradedBecause).not.toBe('none');
    expect(model.rates).toHaveLength(1);
    expect(model.rates[0]!.phase).toBe('engine');
  });

  it('nie publikuje niczego poniżej progu danych', () => {
    const model = fitConsumptionModel(variedIntervals(12, 42).slice(0, 3));

    expect(model.published).toBe(false);
    expect(model.rates).toEqual([]);
    expect(model.gate.missingIntervals).toBe(2);
  });

  it('interwały odrzucone przed modelem nie wchodzą do bramki', () => {
    const withBad = [
      ...variedIntervals(12, 42),
      { ...interval(9, 1, 1, 12, 42), rejected: 'negative-consumption' as const },
    ];
    const model = fitConsumptionModel(withBad);

    expect(model.gate.intervals).toBe(6);
    expect(model.published).toBe(true);
  });
});

describe('odstające', () => {
  it('wyklucza interwał, którego model nie tłumaczy, i pokazuje go osobno', () => {
    const base = variedIntervals(12, 42, [0.4, -0.3, 0.2, -0.4, 0.3, -0.2]);
    const rogue = interval(9, 1.0, 2.0, 12, 42);
    rogue.consumedL += 60; // 60 L z powietrza — pomyłka odczytu albo dolewka spoza aplikacji

    const model = fitConsumptionModel([...base, rogue]);

    expect(model.outliers).toHaveLength(1);
    expect(model.outliers[0]!.rejected).toBe('outlier');
    expect(model.equations).toBe(6);
    // Po wykluczeniu stawki wracają do prawdziwych wartości.
    expect(rate(model, 'ground')).toBeCloseTo(12, 0);
    expect(rate(model, 'air')).toBeCloseTo(42, 0);
  });
});

describe('niepewność', () => {
  it('dane z rozrzutem dają niezerowy przedział i sigmę w litrach', () => {
    const model = fitConsumptionModel(
      variedIntervals(12, 42, [1.2, -0.9, 0.7, -1.1, 0.8, -0.7]),
    );

    const air = model.rates.find((r) => r.phase === 'air')!;
    expect(air.ciHalfWidth).not.toBeNull();
    expect(air.ciHalfWidth!).toBeGreaterThan(0);
    expect(model.residualSigmaL!).toBeGreaterThan(0);
    expect(model.rSquaredUncentered!).toBeGreaterThan(0.9);
  });

  it('współczynnik inflacji wariancji rośnie, gdy fazy są skorelowane', () => {
    // Fazy prawie proporcjonalne — model jeszcze je rozdziela, ale płaci niepewnością.
    const nearlyConstant = [1, 2, 3, 4, 5, 6].map((n) =>
      interval(n, n * 0.5, n * 1.5 + (n % 2 === 0 ? 0.4 : -0.4), 12, 42, n % 2 === 0 ? 0.3 : -0.3),
    );
    const model = fitConsumptionModel(nearlyConstant);

    if (model.phaseSet === 'two') {
      const ground = model.rates.find((r) => r.phase === 'ground')!;
      expect(ground.varianceInflation).toBeGreaterThan(1);
    } else {
      // Zejście na jedną fazę jest tu równie poprawną odpowiedzią.
      expect(model.phaseSet).toBe('single');
    }
  });
});

function rate(
  model: ReturnType<typeof fitConsumptionModel>,
  phase: 'ground' | 'air' | 'engine',
): number {
  return model.rates.find((r) => r.phase === phase)?.lPerH ?? Number.NaN;
}

describe('bramki znalezione przebiegiem po realnej historii (2026-08-05)', () => {
  it('nie publikuje podziału, którego dane nie rozstrzygają — mimo wąskich przedziałów', () => {
    // Sedno wady, którą złapał przebieg: dni o prawie stałej proporcji faz dają model
    // idealnie dopasowany (σ ≈ 0), więc przedziały wychodzą wąskie — a podział jest
    // DOWOLNY. Poprzednia wersja publikowała wtedy „na ziemi 52 L/h, w locie 37 L/h",
    // czyli fizyczny absurd z wiarygodnie wyglądającym ±. Sam przedział tego nie widzi;
    // widzi to dopiero współczynnik inflacji wariancji.
    const nearlyProportional = [1, 2, 3, 4, 5, 6].map((n) =>
      interval(n, n * 0.5 + 0.001 * n, n * 1.5, 12, 42),
    );
    const model = fitConsumptionModel(nearlyProportional);

    expect(model.published).toBe(true);
    expect(model.phaseSet).toBe('single');
    expect(model.degradedBecause).toBe('collinear');
    // Zamiast dwóch zmyślonych stawek jedna uczciwa: średnia na godzinę pracy silnika.
    expect(model.rates).toHaveLength(1);
    expect(model.rates[0]!.phase).toBe('engine');
  });
});
