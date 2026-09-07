/**
 * UZ Aero - translacja odczytu platformy na fix domeny.
 *
 * Strażnik kontraktu null-nie-zero (poprawka 2026-07-30): Android przy małych
 * prędkościach nie podaje prędkości albo zeruje ją filtrem static-hold, a `-1`
 * to jego idiom „niedostępne". Regres do dawnego `?? 0` podawał detektorowi
 * pomiar, którego nikt nie wykonał - i opóźniał wykrycie kołowania.
 */

import { geoidUndulationM } from '../domain';
import {
  METERS_TO_FEET,
  MPS_TO_KNOTS,
  locationToFix,
  type RawLocation,
} from '../infrastructure/gps/locationToFix';

const raw = (over: Partial<RawLocation['coords']> = {}, timestamp = 1_723_456_789_000): RawLocation => ({
  coords: {
    latitude: 52.1,
    longitude: 21.0,
    altitude: 152.4,
    accuracy: 5,
    speed: 10,
    heading: 270,
    ...over,
  },
  timestamp,
});

describe('locationToFix - brak pomiaru to null, nigdy zero', () => {
  it('brak prędkości (null) → groundSpeedKt: null', () => {
    expect(locationToFix(raw({ speed: null })).groundSpeedKt).toBeNull();
  });

  it('ujemna prędkość (androidowe „niedostępne") → null', () => {
    expect(locationToFix(raw({ speed: -1 })).groundSpeedKt).toBeNull();
  });

  it('ujemny kurs → trackDeg: null; kurs 0° zostaje pomiarem', () => {
    expect(locationToFix(raw({ heading: -1 })).trackDeg).toBeNull();
    expect(locationToFix(raw({ heading: 0 })).trackDeg).toBe(0);
  });

  it('brak wysokości i dokładności → null w obu polach', () => {
    const fix = locationToFix(raw({ altitude: null, accuracy: null }));
    expect(fix.altitudeFt).toBeNull();
    expect(fix.accuracyM).toBeNull();
  });
});

describe('locationToFix - jednostki i zegar', () => {
  it('m/s → węzły', () => {
    const fix = locationToFix(raw({ speed: 10 }));
    expect(fix.groundSpeedKt).toBeCloseTo(10 * MPS_TO_KNOTS, 6);
    expect(fix.groundSpeedKt).toBeCloseTo(19.43844492, 6);
  });

  it('wysokość: elipsoida − undulacja geoidy → stopy AMSL', () => {
    // Android podaje wysokość nad elipsoidą WGS84; do domeny ma wejść AMSL.
    const undulationM = geoidUndulationM({ lat: 52.1, lon: 21.0 });
    expect(undulationM).not.toBeNull();
    const fix = locationToFix(raw({ altitude: 100 }));
    expect(fix.altitudeFt).toBeCloseTo((100 - undulationM!) * METERS_TO_FEET, 6);
  });

  it('poza pokryciem siatki geoidy wysokość zostaje elipsoidalna', () => {
    const fix = locationToFix(raw({ latitude: 10, longitude: -150, altitude: 100 }));
    expect(fix.altitudeFt).toBeCloseTo(100 * METERS_TO_FEET, 6);
  });

  it('czas fixa pochodzi z timestampu GPS, nie z zegara urządzenia', () => {
    // Zegar urządzenia celowo „przestawiony" - fix ma nieść czas GPS (§4.5).
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(999);
    try {
      expect(locationToFix(raw({}, 1_723_456_789_000)).time).toBe(1_723_456_789_000);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('współrzędne przechodzą bez przekształceń', () => {
    const fix = locationToFix(raw());
    expect(fix.lat).toBe(52.1);
    expect(fix.lon).toBe(21.0);
    expect(fix.accuracyM).toBe(5);
  });
});

describe('locationToFix - regresja EPNL (zgłoszenie 2026-08-11)', () => {
  it('na EPNL surowe ~950 ft elipsoidalnie pokazuje się jako ~830 ft AMSL', () => {
    // Elewacja EPNL (Łososina Dolna) to 830 ft AMSL, a loger wskazywał ~950 ft:
    // różnica to undulacja geoidy (~37 m). 289,56 m = dokładnie 950 ft.
    const fix = locationToFix(raw({ latitude: 49.74532, longitude: 20.62347, altitude: 289.56 }));
    expect(fix.altitudeFt).toBeGreaterThan(815);
    expect(fix.altitudeFt).toBeLessThan(845);
  });
});
