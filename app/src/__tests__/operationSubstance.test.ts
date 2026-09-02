/**
 * UZ Aero - testy TREŚCI OPERACJI (issue #75 pkt 2 i 3).
 *
 * Granica pod obserwacją: zapis bez biegu silnika jest operacją TYLKO wtedy, gdy coś
 * się zmieniło (odczyt, dolewka) - a śmieciem tylko wtedy, gdy komplet odczytów
 * potwierdza, że nie zmieniło się NIC. Wszystko pomiędzy (odczyt niekompletny) zostaje
 * widoczne i nienumerowane, jak przed issue #75.
 */

import {
  emptySessionState,
  hasOperationSubstance,
  isEmptyOperation,
  operationAnchor,
  substanceFacts,
} from '../domain';
import type { OperationSubstanceFacts, SessionState } from '../domain';

const facts = (over: Partial<OperationSubstanceFacts>): OperationSubstanceFacts => ({
  engineRan: false,
  flightCount: 0,
  fuelAddedL: 0,
  oilAddedL: 0,
  fuelStartL: null,
  fuelEndL: null,
  mhStart: null,
  mhEnd: null,
  closed: true,
  ...over,
});

/** Komplet równych odczytów - punkt wyjścia „nic się nie zmieniło". */
const unchanged = (over: Partial<OperationSubstanceFacts> = {}): OperationSubstanceFacts =>
  facts({ fuelStartL: 240, fuelEndL: 240, mhStart: 2815.2, mhEnd: 2815.2, ...over });

describe('hasOperationSubstance', () => {
  it.each([
    ['bieg silnika', { engineRan: true }],
    ['lot (strumień złamany)', { flightCount: 1 }],
    ['dolewka paliwa', { fuelAddedL: 48 }],
    ['dolewka oleju', { oilAddedL: 0.5 }],
    ['zmieniony odczyt paliwa', { fuelEndL: 210 }],
    ['zmieniony odczyt licznika', { mhEnd: 2815.4 }],
  ])('%s jest treścią operacji', (_name, over) => {
    expect(hasOperationSubstance(unchanged(over))).toBe(true);
  });

  it('komplet równych odczytów bez biegu i dolewek treścią nie jest', () => {
    expect(hasOperationSubstance(unchanged())).toBe(false);
  });

  it('pojedynczy odczyt niczego nie dowodzi - porównanie wymaga obu stron', () => {
    expect(hasOperationSubstance(facts({ fuelEndL: 240 }))).toBe(false);
    expect(hasOperationSubstance(facts({ mhStart: 2815.2 }))).toBe(false);
  });
});

describe('isEmptyOperation', () => {
  it('zdany zapis z kompletem równych odczytów jest pusty', () => {
    expect(isEmptyOperation(unchanged())).toBe(true);
  });

  it('zapis otwarty nie jest pusty nigdy - jego treść dopiero się dzieje', () => {
    expect(isEmptyOperation(unchanged({ closed: false }))).toBe(false);
  });

  it('bez kompletu odczytów pustości nie da się orzec', () => {
    expect(isEmptyOperation(unchanged({ mhEnd: null }))).toBe(false);
    expect(isEmptyOperation(unchanged({ fuelStartL: null }))).toBe(false);
  });

  it('każda treść wyklucza pustość', () => {
    expect(isEmptyOperation(unchanged({ fuelAddedL: 20 }))).toBe(false);
    expect(isEmptyOperation(unchanged({ engineRan: true }))).toBe(false);
  });
});

describe('operationAnchor', () => {
  const T_CLAIM = Date.UTC(2026, 8, 1, 9, 10);
  const T_START = Date.UTC(2026, 8, 1, 9, 40);

  const session = (over: Partial<SessionState>): SessionState => ({
    ...emptySessionState(),
    sessionUuid: 's',
    claimedAt: T_CLAIM,
    ...over,
  });

  it('bieg silnika kotwiczy uruchomieniem - od pierwszej sekundy, także w toku', () => {
    const running = session({
      legs: [{ index: 1, startedAt: T_START, stoppedAt: null, durationMs: 0 }],
    });
    expect(operationAnchor(running)).toBe(T_START);
  });

  it('zapis bez biegu ze zmienionym odczytem kotwiczy przejęciem - dopiero po zdaniu', () => {
    const changed = session({
      closed: true,
      closedAt: T_CLAIM + 3_600_000,
      fuel: { startL: 240, addedL: 0, endL: 210, consumedL: 30, lastReadingL: 210 },
      mh: { start: 2815.2, end: 2815.2, deltaH: 0 },
    });
    expect(operationAnchor(changed)).toBe(T_CLAIM);
    expect(operationAnchor({ ...changed, closed: false })).toBeNull();
  });

  it('zapis pusty i niekompletny kotwicy nie mają', () => {
    const empty = session({
      closed: true,
      fuel: { startL: 240, addedL: 0, endL: 240, consumedL: 0, lastReadingL: 240 },
      mh: { start: 2815.2, end: 2815.2, deltaH: 0 },
    });
    expect(operationAnchor(empty)).toBeNull();
    expect(operationAnchor(session({ closed: true }))).toBeNull();
  });
});

describe('substanceFacts', () => {
  it('tłumaczy projekcję na fakty jeden do jednego', () => {
    const state: SessionState = {
      ...emptySessionState(),
      legs: [{ index: 1, startedAt: 1, stoppedAt: 2, durationMs: 1 }],
      flights: [],
      closed: true,
      fuel: { startL: 240, addedL: 48, endL: 200, consumedL: 88, lastReadingL: 200 },
      mh: { start: 2815.2, end: 2816.4, deltaH: 1.2 },
      oil: { levelL: 6, addedL: 0.5, afterL: 6.5 },
    };
    expect(substanceFacts(state)).toEqual({
      engineRan: true,
      flightCount: 0,
      fuelAddedL: 48,
      oilAddedL: 0.5,
      fuelStartL: 240,
      fuelEndL: 200,
      mhStart: 2815.2,
      mhEnd: 2816.4,
      closed: true,
    });
  });
});
