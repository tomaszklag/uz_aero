/**
 * UZ Aero — test oczekiwania fazowego (issue #38 pkt 4 i 6).
 *
 * Ekran 10 pyta „czy 27 litrów i +1:35 na liczniku to normalne PO TAKIEJ sesji", więc
 * test pilnuje trzech rzeczy w tej kolejności: że przewidywanie reaguje na PROPORCJĘ faz
 * (a nie tylko na długość sesji), że pasmo nigdy nie schodzi poniżej błędu odczytu
 * przyrządu, i że brak danych kończy się `null`, a nie liczbą wziętą z sufitu.
 */

import {
  expectationVerdict,
  expectedFuelL,
  expectedMhH,
  FUEL_BAND_FLOOR_L,
  MH_BAND_FLOOR_H,
  type ConsumptionNorm,
} from '../domain';

const HOUR = 3_600_000;

/** Norma z rozdzielonymi fazami: ziemia 8 L/h, powietrze 20 L/h, rozrzut ±10%. */
const norm = (over: Partial<ConsumptionNorm> = {}): ConsumptionNorm => ({
  windowDays: 90,
  blockLPerHLow: 12,
  blockLPerHHigh: 18,
  blockLPerH: 15,
  airLPerH: 20,
  groundLPerH: 8,
  litersPerFlight: 22,
  fuelRatioLow: 0.9,
  fuelRatioHigh: 1.1,
  mh: {
    kind: 'tach',
    perFlightHour: 1,
    perGroundHour: 0.4,
    ratioLow: 0.95,
    ratioHigh: 1.05,
    sessions: 12,
  },
  intervals: 96,
  engineMs: 118 * HOUR,
  computedAt: Date.UTC(2026, 7, 5, 17, 30),
  ...over,
});

describe('oczekiwane zużycie paliwa', () => {
  it('waży stawki proporcją faz, a nie samym czasem blokowym', () => {
    // Dwie sesje po dwie godziny silnika, różny podział: 2 h lotu vs 1 h lotu + 1 h ziemi.
    const lotem = expectedFuelL(norm(), { blockMs: 2 * HOUR, flightMs: 2 * HOUR });
    const mieszana = expectedFuelL(norm(), { blockMs: 2 * HOUR, flightMs: 1 * HOUR });

    expect(lotem?.value).toBeCloseTo(40, 6);
    expect(mieszana?.value).toBeCloseTo(28, 6);
    expect(lotem?.basis).toBe('phases');
  });

  it('pasmo bierze się z rozrzutu obserwacji', () => {
    // Sesja na tyle duża, że ±10% rozrzutu przekracza podłogę przyrządu — inaczej
    // testowalibyśmy podłogę, a nie pasmo.
    const e = expectedFuelL(norm(), { blockMs: 5 * HOUR, flightMs: 5 * HOUR })!;

    expect(e.value).toBeCloseTo(100, 6);
    expect(e.low).toBeCloseTo(90, 6);
    expect(e.high).toBeCloseTo(110, 6);
  });

  it('pasmo nie schodzi poniżej błędu odczytu paliwomierza', () => {
    // Rozrzut zerowy (dane wewnętrznie spójne) — bez podłogi werdykt zapalałby się
    // na jednym litrze, czyli na czymś, czego paliwomierz nie umie pokazać.
    const e = expectedFuelL(norm({ fuelRatioLow: 1, fuelRatioHigh: 1 }), {
      blockMs: 1 * HOUR,
      flightMs: 1 * HOUR,
    })!;

    expect(e.value).toBeCloseTo(20, 6);
    expect(e.low).toBeCloseTo(20 - FUEL_BAND_FLOOR_L, 6);
    expect(e.high).toBeCloseTo(20 + FUEL_BAND_FLOOR_L, 6);
  });

  it('bez rozdzielonych faz schodzi na godzinę pracy silnika i mówi to wprost', () => {
    const e = expectedFuelL(norm({ airLPerH: null, groundLPerH: null }), {
      blockMs: 2 * HOUR,
      flightMs: 1 * HOUR,
    })!;

    expect(e.basis).toBe('engine');
    expect(e.value).toBeCloseTo(30, 6);
    expect(e.low).toBeCloseTo(24, 6);
    expect(e.high).toBeCloseTo(36, 6);
  });

  it('czas lotu dłuższy niż praca silnika nie robi ujemnej ziemi', () => {
    // Rozjazd rejestru (ręczny wpis nachodzący na bieg silnika) — ziemia przycięta
    // do zera, a nie odjęta od zużycia.
    const e = expectedFuelL(norm(), { blockMs: 1 * HOUR, flightMs: 3 * HOUR })!;

    expect(e.value).toBeCloseTo(20, 6);
  });

  it('bez normy i bez pracy silnika nie zmyśla liczby', () => {
    expect(expectedFuelL(null, { blockMs: HOUR, flightMs: HOUR })).toBeNull();
    expect(expectedFuelL(norm(), { blockMs: 0, flightMs: 0 })).toBeNull();
  });
});

describe('oczekiwany przyrost licznika', () => {
  it('licznik obrotomierzowy chodzi na ziemi wolniej niż zegar', () => {
    // 1 h lotu + 1 h ziemi przy k = 1,0 / 0,4 → 1,4 MH, nie 2,0 (czas blokowy).
    const e = expectedMhH(norm(), { blockMs: 2 * HOUR, flightMs: 1 * HOUR })!;

    expect(e.value).toBeCloseTo(1.4, 6);
  });

  it('pasmo bierze się z rozrzutu obserwacji', () => {
    // 5 h lotu + 2 h ziemi → 5,8 MH; ±5% to więcej niż podziałka licznika.
    const e = expectedMhH(norm(), { blockMs: 7 * HOUR, flightMs: 5 * HOUR })!;

    expect(e.value).toBeCloseTo(5.8, 6);
    expect(e.low).toBeCloseTo(5.8 * 0.95, 6);
    expect(e.high).toBeCloseTo(5.8 * 1.05, 6);
  });

  it('pasmo nie schodzi poniżej podziałki licznika', () => {
    const e = expectedMhH(norm({ mh: { ...norm().mh!, ratioLow: 1, ratioHigh: 1 } }), {
      blockMs: 1 * HOUR,
      flightMs: 1 * HOUR,
    })!;

    expect(e.low).toBeCloseTo(1 - MH_BAND_FLOOR_H, 6);
    expect(e.high).toBeCloseTo(1 + MH_BAND_FLOOR_H, 6);
  });

  it('bez przeliczników milczy — nie podstawia czasu blokowego', () => {
    expect(expectedMhH(norm({ mh: null }), { blockMs: 2 * HOUR, flightMs: HOUR })).toBeNull();
  });
});

describe('werdykt', () => {
  const e = { value: 30, low: 27, high: 33, basis: 'phases' as const };

  it('granice należą do pasma', () => {
    expect(expectationVerdict(27, e)).toBe('w-normie');
    expect(expectationVerdict(33, e)).toBe('w-normie');
  });

  it('poza pasmem mówi, w którą stronę', () => {
    expect(expectationVerdict(26.9, e)).toBe('ponizej');
    expect(expectationVerdict(33.1, e)).toBe('powyzej');
  });
});
