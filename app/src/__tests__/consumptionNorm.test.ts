/**
 * UZ Aero - test składania NORMY dla telefonu (issue #38).
 *
 * Norma jest jedynym kanałem, którym analityka dociera do pilota, więc test idzie tą
 * samą drogą, co serwer: syntetyczne interwały → `consumptionSummary` → `fitConsumptionModel`
 * → `fitMhModel` → `buildConsumptionNorm`. Sprawdzanie samego złożenia obiektu na
 * atrapach modelu przepuściłoby dokładnie te błędy, które tu są groźne - sklejenie faz
 * i dobór interwałów do pasma rozrzutu.
 */

import {
  buildConsumptionNorm,
  consumptionSummary,
  fitConsumptionModel,
  fitMhModel,
  type FuelInterval,
  type MhEquation,
} from '../domain';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const START = Date.UTC(2026, 5, 1);

/**
 * Interwał o zadanych czasach faz i zużyciu policzonym z zadanych stawek.
 * Proporcje faz muszą się między interwałami RÓŻNIĆ - to ta zmienność identyfikuje stawki.
 */
function interval(
  index: number,
  flightH: number,
  groundH: number,
  airLPerH: number,
  groundLPerH: number,
  noiseL = 0,
): FuelInterval {
  const consumedL = airLPerH * flightH + groundLPerH * groundH + noiseL;
  const startAt = START + index * DAY;
  const engineMs = (flightH + groundH) * HOUR;

  return {
    sessionUuid: `s-${index}`,
    aircraftId: 'SP-AXA',
    dayStart: startAt,
    startAt,
    endAt: startAt + engineMs,
    startKind: 'preflight',
    endKind: 'day_close',
    startUuid: `u-${index}-a`,
    endUuid: `u-${index}-b`,
    startReadingL: 200,
    endReadingL: 200 - consumedL,
    consumedL,
    engineMs,
    flightMs: flightH * HOUR,
    groundMs: groundH * HOUR,
    climbMs: null,
    cruiseMs: null,
    descentMs: null,
    flightCount: Math.max(1, Math.round(flightH)),
    rejected: null,
  };
}

/** Osiem interwałów o różnych proporcjach faz - komplet ponad progami publikacji. */
function eightIntervals(airLPerH = 20, groundLPerH = 8, noise: number[] = []): FuelInterval[] {
  const shape: Array<[number, number]> = [
    [3.0, 0.6],
    [1.0, 1.2],
    [2.5, 0.5],
    [0.8, 1.6],
    [2.0, 1.0],
    [1.5, 0.4],
    [3.2, 1.4],
    [1.2, 0.8],
  ];
  return shape.map(([flightH, groundH], index) =>
    interval(index, flightH, groundH, airLPerH, groundLPerH, noise[index] ?? 0),
  );
}

/** Stawki faz pionowych używane przez interwały ze śladem. */
const VERTICAL = { ground: 8, climb: 30, cruise: 18, descent: 10 };

/**
 * Interwał ZE ŚLADEM - z rozbiciem lotu na wznoszenie, przelot i zniżanie.
 * Zużycie liczone z czterech stawek, żeby model miał co odzyskać.
 */
function traced(
  index: number,
  groundH: number,
  climbH: number,
  cruiseH: number,
  descentH: number,
): FuelInterval {
  const flightH = climbH + cruiseH + descentH;
  const base = interval(index, flightH, groundH, 0, VERTICAL.ground);
  const consumedL =
    VERTICAL.ground * groundH +
    VERTICAL.climb * climbH +
    VERTICAL.cruise * cruiseH +
    VERTICAL.descent * descentH;

  return {
    ...base,
    consumedL,
    endReadingL: base.startReadingL - consumedL,
    climbMs: climbH * HOUR,
    cruiseMs: cruiseH * HOUR,
    descentMs: descentH * HOUR,
  };
}

/** Równanie licznika dla sesji o zadanych fazach i przelicznikach. */
function equation(index: number, flightH: number, groundH: number, kF: number, kG: number): MhEquation {
  return {
    sessionUuid: `s-${index}`,
    dayStart: START + index * DAY,
    deltaMh: kF * flightH + kG * groundH,
    flightMs: flightH * HOUR,
    groundMs: groundH * HOUR,
    clamped: false,
  };
}

/** Sześć zdanych sesji o różnych proporcjach - ponad `MIN_PUBLISH_MH_DAYS`. */
function sixEquations(kFlight = 1, kGround = 0.4): MhEquation[] {
  const shape: Array<[number, number]> = [
    [4.0, 0.5],
    [1.0, 1.5],
    [3.0, 1.0],
    [0.5, 2.0],
    [2.5, 0.8],
    [1.5, 1.2],
  ];
  return shape.map(([f, g], index) => equation(index, f, g, kFlight, kGround));
}

/** Przepuszcza wejście przez tę samą kolejność wywołań, co serwer. */
function build(intervals: FuelInterval[], equations: MhEquation[] = sixEquations()) {
  const summary = consumptionSummary(intervals);
  const model = fitConsumptionModel(intervals);
  return buildConsumptionNorm(
    { summary, model, intervals, mh: fitMhModel(equations) },
    90,
    Date.UTC(2026, 5, 10),
  );
}

describe('norma dla telefonu', () => {
  it('niesie obie stawki fazowe, nie samą blokową', () => {
    const norm = build(eightIntervals())!;

    expect(norm.airLPerH).toBeCloseTo(20, 3);
    expect(norm.groundLPerH).toBeCloseTo(8, 3);
  });

  it('niesie przeliczniki licznika razem z jego charakterem', () => {
    const norm = build(eightIntervals())!;

    expect(norm.mh?.perFlightHour).toBeCloseTo(1, 3);
    expect(norm.mh?.perGroundHour).toBeCloseTo(0.4, 3);
    expect(norm.mh?.kind).toBe('tach');
    expect(norm.mh?.sessions).toBe(6);
  });

  it('licznik godzinowy rozpoznaje się tak samo jak obrotomierzowy', () => {
    const norm = build(eightIntervals(), sixEquations(1, 1))!;

    expect(norm.mh?.kind).toBe('hobbs');
    expect(norm.mh?.perGroundHour).toBeCloseTo(1, 3);
  });

  it('pasmo rozrzutu rozchyla się na zaszumionych danych', () => {
    const czyste = build(eightIntervals())!;
    const zaszumione = build(eightIntervals(20, 8, [1.5, -1, 1, -1.5, 1, -1, 1.5, -1.5]))!;

    // Dane idealne: model trafia w każdy interwał, więc pasmo jest punktem. To NIE jest
    // powód do radości - dlatego oczekiwanie ma podłogę z błędu odczytu (`policy.ts`).
    expect(czyste.fuelRatioLow).toBeCloseTo(1, 6);
    expect(czyste.fuelRatioHigh).toBeCloseTo(1, 6);

    const szerokosc = zaszumione.fuelRatioHigh! - zaszumione.fuelRatioLow!;
    expect(szerokosc).toBeGreaterThan(0.02);
  });

  it('brak przeliczników licznika nie unieważnia normy paliwa', () => {
    // Trzy sesje to mniej niż `MIN_PUBLISH_MH_DAYS` - paliwo zostaje, MH milczy.
    const norm = build(eightIntervals(), sixEquations().slice(0, 3))!;

    expect(norm.airLPerH).toBeCloseTo(20, 3);
    expect(norm.mh).toBeNull();
  });

  it('model poniżej progu publikacji nie daje normy w ogóle', () => {
    expect(build(eightIntervals().slice(0, 2))).toBeNull();
  });

  /**
   * Telefon nie ma faz pionowych, więc model czterofazowy trzeba skleić do pary stawek.
   * Do issue #38 stawką lotu był sam PRZELOT - najniższa z trzech - więc dla maszyny
   * spędzającej połowę czasu na wznoszeniu (dzień skokowy) norma zaniżała zużycie,
   * a razem z nim rezerwę paliwa w kokpicie.
   */
  it('model czterofazowy skleja się średnią ważoną, nie samym przelotem', () => {
    // Proporcje faz muszą się między interwałami mocno różnić (dzień skokowy obok
    // przelotu), inaczej regresja nie rozdzieli wznoszenia od przelotu i model zejdzie
    // o szczebel - bramka `MAX_VARIANCE_INFLATION` pilnuje tego celowo.
    const shapes: Array<[number, number, number, number]> = [
      [0.5, 1.6, 0.1, 1.0],
      [1.5, 0.2, 2.5, 0.3],
      [0.3, 1.2, 0.2, 0.9],
      [2.0, 0.3, 3.0, 0.4],
      [0.8, 0.1, 0.2, 1.5],
      [0.4, 2.0, 0.3, 0.2],
      [1.2, 0.5, 1.5, 1.2],
      [0.6, 0.9, 0.6, 0.3],
      [1.0, 0.2, 2.0, 1.0],
      [0.2, 1.5, 1.0, 0.4],
    ];
    const norm = build(
      shapes.map(([g, c, cr, d], index) => traced(index, g, c, cr, d)),
    )!;

    const sum = (pick: (s: [number, number, number, number]) => number) =>
      shapes.reduce((total, shape) => total + pick(shape), 0);
    const climbH = sum((s) => s[1]);
    const cruiseH = sum((s) => s[2]);
    const descentH = sum((s) => s[3]);
    const blended =
      (VERTICAL.climb * climbH + VERTICAL.cruise * cruiseH + VERTICAL.descent * descentH) /
      (climbH + cruiseH + descentH);

    expect(norm.airLPerH).toBeCloseTo(blended, 2);
    expect(norm.airLPerH).toBeGreaterThan(VERTICAL.cruise);
    expect(norm.groundLPerH).toBeCloseTo(VERTICAL.ground, 2);
  });
});
