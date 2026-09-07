/**
 * UZ Aero - test oczekiwania fazowego (issue #38 pkt 4 i 6).
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
  NOMINAL_BAND_RATIO,
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
    // Sesja na tyle duża, że ±10% rozrzutu przekracza podłogę przyrządu - inaczej
    // testowalibyśmy podłogę, a nie pasmo.
    const e = expectedFuelL(norm(), { blockMs: 5 * HOUR, flightMs: 5 * HOUR })!;

    expect(e.value).toBeCloseTo(100, 6);
    expect(e.low).toBeCloseTo(90, 6);
    expect(e.high).toBeCloseTo(110, 6);
  });

  it('pasmo nie schodzi poniżej błędu odczytu paliwomierza', () => {
    // Rozrzut zerowy (dane wewnętrznie spójne) - bez podłogi werdykt zapalałby się
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
    // Rozjazd rejestru (ręczny wpis nachodzący na bieg silnika) - ziemia przycięta
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

  it('bez przeliczników milczy - nie podstawia czasu blokowego', () => {
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

/**
 * NORMA Z DOKUMENTACJI (issue #66) - trzeci szczebel drabiny.
 *
 * Zgłoszenie: „dla pierwszych lotów gdzie nie ma jeszcze danych nie ma jak wyliczyć
 * normy i odchyleń". Do tej pory `norm == null` znaczyło „ekran milczy" - a to jest
 * dokładnie ten okres, w którym pilot nie zna jeszcze maszyny.
 */
describe('norma nominalna z dokumentacji jednostki', () => {
  it('bez modelu liczy z godziny PRACY SILNIKA i oznacza podstawę', () => {
    // 5 h silnika × 18 L/h = 90 L, pasmo ±15% → 76,5–103,5 L. Piętnaście procent z 90 L
    // to 13,5 L, czyli więcej niż podłoga przyrządu (6 L) - tu rządzi sam próg.
    const e = expectedFuelL(null, { blockMs: 5 * HOUR, flightMs: 2 * HOUR }, 18)!;

    expect(e.value).toBeCloseTo(90, 6);
    expect(e.low).toBeCloseTo(90 * (1 - NOMINAL_BAND_RATIO), 6);
    expect(e.high).toBeCloseTo(90 * (1 + NOMINAL_BAND_RATIO), 6);
    // Ekran musi umieć powiedzieć, że to NIE jest liczba z lotów tej maszyny.
    expect(e.basis).toBe('nominal');
  });

  it('MIESZANKA FAZ nie zmienia wyniku - dokumentacja nie rozdziela ziemi od lotu', () => {
    const lotem = expectedFuelL(null, { blockMs: 2 * HOUR, flightMs: 2 * HOUR }, 18)!;
    const ziemia = expectedFuelL(null, { blockMs: 2 * HOUR, flightMs: 0 }, 18)!;

    // I dlatego pasmo jest szerokie: pokrywa różnicę, której ta liczba nie opisuje.
    expect(lotem.value).toBeCloseTo(ziemia.value, 6);
  });

  it('MODEL WYGRYWA z dokumentacją - ten egzemplarz przed typem', () => {
    const e = expectedFuelL(norm(), { blockMs: 2 * HOUR, flightMs: 1 * HOUR }, 18)!;

    // 1 h × 20 + 1 h × 8 = 28 L z modelu, a nie 36 L z dokumentacji.
    expect(e.value).toBeCloseTo(28, 6);
    expect(e.basis).toBe('phases');
  });

  it('pasmo nie schodzi poniżej błędu odczytu przyrządu', () => {
    // Godzina silnika × 18 L/h = 18 L. ±15% to 2,7 L - mniej niż podłoga 6 L, więc
    // to ona rozpycha pasmo: przy takim zużyciu dwa odczyty paliwomierza są mniej
    // dokładne niż sam próg procentowy.
    const e = expectedFuelL(null, { blockMs: HOUR, flightMs: 0 }, 18)!;

    expect(e.high - e.value).toBeCloseTo(FUEL_BAND_FLOOR_L, 6);
    expect(e.value - e.low).toBeCloseTo(FUEL_BAND_FLOOR_L, 6);

    // Dolna granica NIE schodzi pod zero także wtedy, gdy podłoga jest szersza od
    // samego oczekiwania - „ujemne litry" nie są stanem świata.
    const krotka = expectedFuelL(null, { blockMs: HOUR / 4, flightMs: 0 }, 18)!;
    expect(krotka.low).toBe(0);
  });

  it('brak jednego i drugiego to nadal MILCZENIE, nie zero', () => {
    expect(expectedFuelL(null, { blockMs: 2 * HOUR, flightMs: HOUR }, null)).toBeNull();
    // Zero i minus nie są stawką - taka konfiguracja nie ma prawa produkować werdyktu.
    expect(expectedFuelL(null, { blockMs: 2 * HOUR, flightMs: HOUR }, 0)).toBeNull();
    expect(expectedFuelL(null, { blockMs: 2 * HOUR, flightMs: HOUR }, -5)).toBeNull();
    // Silnik, który nie pracował, nie ma czego mnożyć.
    expect(expectedFuelL(null, { blockMs: 0, flightMs: 0 }, 18)).toBeNull();
  });

  it('LICZNIK dokumentacji nie ma i milczy dalej', () => {
    // Żadna instrukcja nie podaje przelicznika obrotomierza - drabina MH ma dwa szczeble.
    expect(expectedMhH(null, { blockMs: 2 * HOUR, flightMs: HOUR })).toBeNull();
  });
});
