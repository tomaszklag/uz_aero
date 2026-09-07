/**
 * UZ Aero - interpolacja dwuliniowa siatki undulacji (`geoid/grid.ts`).
 *
 * Siatki syntetyczne, bo tu testujemy GEOMETRIĘ: trafienie w węzeł, uśrednianie
 * wewnątrz oczka, domknięte krawędzie i uczciwe `null` poza pokryciem. Wartości
 * prawdziwej, wkompilowanej siatki sprawdza `geoidUndulation.test.ts`.
 */

import { bilinearUndulationM, type GeoidGrid } from '../domain';

/** 3×3, krok 0,5°, róg NW w (50°N, 10°E); wartości w cm rosną wiersz-major. */
const grid: GeoidGrid = {
  northLatDeg: 50,
  westLonDeg: 10,
  stepDeg: 0.5,
  rows: 3,
  cols: 3,
  valuesCm: [100, 200, 300, 400, 500, 600, 700, 800, 900],
};

describe('bilinearUndulationM - wewnątrz pokrycia', () => {
  it('punkt dokładnie w węźle zwraca wartość węzła', () => {
    expect(bilinearUndulationM(grid, { lat: 50, lon: 10 })).toBeCloseTo(1.0, 9);
    expect(bilinearUndulationM(grid, { lat: 49.5, lon: 10.5 })).toBeCloseTo(5.0, 9);
    expect(bilinearUndulationM(grid, { lat: 49, lon: 11 })).toBeCloseTo(9.0, 9);
  });

  it('środek oczka to średnia czterech węzłów', () => {
    // Oczko NW: węzły 1,00 / 2,00 / 4,00 / 5,00 m → środek 3,00 m.
    expect(bilinearUndulationM(grid, { lat: 49.75, lon: 10.25 })).toBeCloseTo(3.0, 9);
  });

  it('kierunek wierszy: na południe wartości rosną jak w tablicy, nie odwrotnie', () => {
    // Transpozycja albo odwrócenie osi szerokości dałoby tu wartość z innego wiersza.
    expect(bilinearUndulationM(grid, { lat: 49.5, lon: 10 })).toBeCloseTo(4.0, 9);
    expect(bilinearUndulationM(grid, { lat: 50, lon: 10.5 })).toBeCloseTo(2.0, 9);
  });

  it('krawędzie południowa i wschodnia są domknięte', () => {
    expect(bilinearUndulationM(grid, { lat: 49, lon: 10.25 })).toBeCloseTo(7.5, 9);
    expect(bilinearUndulationM(grid, { lat: 49.75, lon: 11 })).toBeCloseTo(4.5, 9);
  });
});

describe('bilinearUndulationM - poza pokryciem null, nigdy ekstrapolacja', () => {
  it.each([
    ['na północ', { lat: 50.01, lon: 10.5 }],
    ['na południe', { lat: 48.99, lon: 10.5 }],
    ['na zachód', { lat: 49.5, lon: 9.99 }],
    ['na wschód', { lat: 49.5, lon: 11.01 }],
  ])('%s od siatki → null', (_label, point) => {
    expect(bilinearUndulationM(grid, point)).toBeNull();
  });
});
