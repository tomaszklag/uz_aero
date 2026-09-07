/**
 * UZ Aero - SZLAK TEJ OPERACJI w arkuszach wpisu ręcznego (uwaga z urządzenia,
 * 2026-09-04: „w manualnym locie z paliwem zastanym czemu nie dasz też info, ile
 * użytkownik przejął, ile dolał, ile latał i ile wpisał, że zostało").
 *
 * Test pilnuje DWÓCH rzeczy naraz: że sekwencja opowiada całą historię wpisu i że
 * oczekiwanie jest TĄ SAMĄ liczbą, którą liczy werdykt na karcie - drugi rachunek
 * tej samej wielkości rozjeżdża się przy pierwszej poprawce jednej z kopii.
 */

import { expectedFuelL, expectedMhH, type ConsumptionNorm } from '../domain';
import {
  emptyManualFlightDraft,
  type ManualFlightDraft,
} from '../ui/screens/logic/manualFlight';
import { manualPhaseTimes } from '../ui/screens/logic/manualFlightBalance';
import { manualFuelTrail, manualMhTrail } from '../ui/screens/logic/manualReadingsTrail';

const DAY = Date.UTC(2026, 7, 16);
const t = (h: number, m = 0): number => DAY + (h * 60 + m) * 60_000;

const norm = (over: Partial<ConsumptionNorm> = {}): ConsumptionNorm => ({
  windowDays: 90,
  blockLPerHLow: 15,
  blockLPerHHigh: 17,
  blockLPerH: 16,
  airLPerH: 20,
  groundLPerH: 8,
  litersPerFlight: 22,
  fuelRatioLow: 0.9,
  fuelRatioHigh: 1.1,
  mh: { kind: 'hobbs', perFlightHour: 1, perGroundHour: 0.6, ratioLow: 0.9, ratioHigh: 1.1, sessions: 40 },
  intervals: 96,
  engineMs: 118 * 3_600_000,
  computedAt: DAY,
  ...over,
});

function draft(over: Partial<ManualFlightDraft> = {}): ManualFlightDraft {
  return {
    ...emptyManualFlightDraft(t(16)),
    aircraftId: 'sp-axa',
    operation: 'skoki',
    engineStart: t(9, 42),
    engineStop: t(11, 18),
    flights: [{ id: 'f1', takeoff: t(9, 48), landing: t(10, 14) }],
    fuel: { foundL: 64, addedL: 48, afterL: 76 },
    mhBefore: 1306.35,
    mhAfter: 1307.88,
    ...over,
  };
}

describe('manualFuelTrail - co zastałem, co dolałem, ile latałem, ile zostanie', () => {
  it('opowiada operację w kolejności, w jakiej się wydarzyła', () => {
    const rows = manualFuelTrail(draft(), norm(), null, null);

    expect(rows.map((r) => r.id)).toEqual(['found', 'added', 'flown', 'expect']);
    expect(rows[0]!.title).toContain('Zastane');
    expect(rows[1]!.title).toContain('+48');
    // Bieg silnika 1:36, z czego 26 min w powietrzu - obie liczby są w szlaku, bo
    // norma liczy z nich RÓŻNE stawki (issue #38).
    expect(rows[2]!.title).toContain('1h 36 min');
    expect(rows[2]!.meta).toContain('26 min');
    expect(rows[3]!.tone).toBe('green');
  });

  it('oczekiwanie to TA SAMA liczba, co w werdykcie karty', () => {
    const d = draft();
    const n = norm();
    const expectation = expectedFuelL(n, manualPhaseTimes(d)!, null)!;
    const expected = Math.round(d.fuel.foundL! + d.fuel.addedL - expectation.value);

    const green = manualFuelTrail(d, n, null, null).at(-1)!;
    expect(green.title).toBe(`Szacunkowo zostało ~${expected} L`);
    expect(green.meta).toContain('90 dni');
  });

  it('norma z dokumentacji nie udaje okna centyli', () => {
    // Przy `basis: 'nominal'` (issue #66) pasmo jest ZADEKLAROWANE, nie zmierzone -
    // podanie „(90 dni)" byłoby zmyśleniem źródła.
    const green = manualFuelTrail(draft(), null, 18, null).at(-1)!;
    expect(green.tone).toBe('green');
    expect(green.meta).toContain('dokumentacji');
    expect(green.meta).not.toContain('dni');
  });

  it('bez normy milczy o oczekiwaniu, ale historię opowiada dalej', () => {
    const rows = manualFuelTrail(draft(), null, null, null);

    expect(rows.map((r) => r.id)).toEqual(['found', 'added', 'flown']);
    expect(rows[2]!.meta).not.toContain('normy');
  });

  it('bez stanu zastanego nie ma od czego zacząć - szlaku nie ma wcale', () => {
    expect(manualFuelTrail(draft({ fuel: { foundL: null, addedL: 0, afterL: null } }), norm(), null, null)).toEqual([]);
  });

  it('bez dolewki nie ma wiersza dolewki', () => {
    const rows = manualFuelTrail(draft({ fuel: { foundL: 64, addedL: 0, afterL: 76 } }), norm(), null, null);
    expect(rows.map((r) => r.id)).not.toContain('added');
  });

  it('podpowiedź z łańcucha zostaje podpisana źródłem, wpis pilota - przyrządem', () => {
    const fromChain = manualFuelTrail(draft(), norm(), null, 'z poprzedniego lotu · AKO');
    expect(fromChain[0]!.meta).toBe('z poprzedniego lotu · AKO');
    expect(manualFuelTrail(draft(), norm(), null, null)[0]!.meta).toContain('paliwomierza');
  });

  it('bez biegu silnika zostaje sam stan zastany', () => {
    const rows = manualFuelTrail(draft({ engineStart: null, engineStop: null }), norm(), null, null);
    expect(rows.map((r) => r.id)).toEqual(['found', 'added']);
  });
});

describe('manualMhTrail - licznik ma tę samą chronologię', () => {
  it('mówi STANEM licznika, bo tę liczbę pilot przepisuje z tarczy', () => {
    const d = draft();
    const n = norm();
    const rows = manualMhTrail(d, n, 'decimal', null);

    expect(rows.map((r) => r.id)).toEqual(['before', 'flown', 'expect']);
    const expectation = expectedMhH(n, manualPhaseTimes(d)!)!;
    expect(rows[2]!.title).toContain(`${(d.mhBefore! + expectation.value).toFixed(1)}`);
    expect(rows[2]!.meta).toContain('przyrost z normy');
    expect(rows[2]!.tone).toBe('green');
  });

  it('bez przeliczników licznika milczy o oczekiwaniu', () => {
    const rows = manualMhTrail(draft(), norm({ mh: null }), 'decimal', null);
    expect(rows.map((r) => r.id)).toEqual(['before', 'flown']);
  });

  it('bez odczytu początkowego szlaku nie ma', () => {
    expect(manualMhTrail(draft({ mhBefore: null }), norm(), 'decimal', null)).toEqual([]);
  });
});
