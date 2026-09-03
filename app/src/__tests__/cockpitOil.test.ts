/**
 * UZ Aero - test podpisu kafelka „Dolej olej" (uwagi z urządzenia, 2026-09-03).
 *
 * Przed uruchomieniem podpis jest STANEM („W silniku 9,2 L"), po biegu silnika
 * SZACUNKIEM z normy oleju („W silniku około …") - patrz `logic/cockpitOil.ts`.
 */

import { cockpitOilSub } from '../ui/screens/logic/cockpitOil';

const HOUR = 3_600_000;

describe('podpis kafelka „Dolej olej"', () => {
  it('przed uruchomieniem: stan bez „około"', () => {
    expect(cockpitOilSub({ afterL: 9.2, ratePerH: 0.1, engineMs: 0, engineRan: false })).toBe(
      'W silniku 9,2 L',
    );
  });

  it('po biegu: „około" z odjętym zużyciem z normy (stawka × czas pracy)', () => {
    // 9,2 − 0,1 L/h × 2 h = 9,0.
    expect(cockpitOilSub({ afterL: 9.2, ratePerH: 0.1, engineMs: 2 * HOUR, engineRan: true })).toBe(
      'W silniku około 9,0 L',
    );
  });

  it('po biegu bez normy: zapis z „około" - spalonego nie zgadujemy, niepewność mówimy', () => {
    expect(cockpitOilSub({ afterL: 9.2, ratePerH: null, engineMs: 2 * HOUR, engineRan: true })).toBe(
      'W silniku około 9,2 L',
    );
  });

  it('szacunek nie schodzi poniżej zera', () => {
    expect(cockpitOilSub({ afterL: 0.2, ratePerH: 1, engineMs: HOUR, engineRan: true })).toBe(
      'W silniku około 0,0 L',
    );
  });

  it('bez pomiaru w strumieniu zostaje nazwa medium - liczby nie zmyślamy', () => {
    expect(cockpitOilSub({ afterL: null, ratePerH: 0.1, engineMs: HOUR, engineRan: true })).toBe(
      'Olej silnikowy',
    );
  });
});
