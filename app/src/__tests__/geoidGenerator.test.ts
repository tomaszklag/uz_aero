/**
 * UZ Aero - generator wycinka siatki undulacji EGM96 (`scripts/geoid/`).
 *
 * Parser dostaje syntetyczny plik o PEŁNYCH wymiarach świata (721×1441), bo jego
 * kontrakt jest z definicji światowy - nagłówek i liczność są częścią walidacji.
 * Wycinanie i render testujemy na małych siatkach: `subsetGrid` jest ogólny.
 */

import { parseWorldGrd, WORLD_COLS, WORLD_ROWS } from '../../../packages/domain/scripts/geoid/grd';
import { renderGeoidModule } from '../../../packages/domain/scripts/geoid/render';
import { subsetGrid } from '../../../packages/domain/scripts/geoid/subset';
import type { GeoidGrid } from '../domain';

const HEADER = '   -90.000000   90.000000     .000000  360.000000     .250000     .250000';

/** Świat zer z możliwością nadpisania pojedynczych węzłów: `{ 'row:col': metry }`. */
const worldText = (overrides: Record<string, number> = {}): string => {
  const rows: string[] = [HEADER];
  for (let r = 0; r < WORLD_ROWS; r++) {
    const row = new Array<string>(WORLD_COLS).fill('0.000');
    for (const [key, meters] of Object.entries(overrides)) {
      const [orow, ocol] = key.split(':').map(Number);
      if (orow === r) row[ocol!] = meters.toFixed(3);
    }
    rows.push(row.join(' '));
  }
  return rows.join('\n');
};

describe('parseWorldGrd', () => {
  it('umieszcza wartość pod właściwymi współrzędnymi i zaokrągla do centymetrów', () => {
    // Szew wymaga tej samej wartości w kolumnach 0° i 360°.
    const world = parseWorldGrd(worldText({ '2:5': 12.345, '3:0': -1.5, [`3:${WORLD_COLS - 1}`]: -1.5 }));
    expect(world.rows).toBe(WORLD_ROWS);
    expect(world.cols).toBe(WORLD_COLS);
    expect(world.valuesCm[2 * WORLD_COLS + 5]).toBe(1235);
    expect(world.valuesCm[3 * WORLD_COLS]).toBe(-150);
  });

  it('odrzuca plik ucięty', () => {
    const text = worldText();
    expect(() => parseWorldGrd(text.slice(0, text.length - 20))).toThrow(/tokenów/);
  });

  it('odrzuca obcy nagłówek', () => {
    const text = worldText().replace('.250000', '.500000');
    expect(() => parseWorldGrd(text)).toThrow(/nagłówek/);
  });

  it('odrzuca wartość poza fizycznym zakresem geoidy', () => {
    expect(() => parseWorldGrd(worldText({ '1:1': 250 }))).toThrow(/zakresem/);
  });

  it('odrzuca rozjechany szew 0°/360°', () => {
    expect(() => parseWorldGrd(worldText({ '4:0': 2 }))).toThrow(/szew/);
  });
});

describe('subsetGrid', () => {
  /** Pełne koło długości (0–360°) w jednym pasie szerokości; wartość = kolumna. */
  const ring: GeoidGrid = {
    northLatDeg: 60,
    westLonDeg: 0,
    stepDeg: 1,
    rows: 2,
    cols: 361,
    valuesCm: Array.from({ length: 2 * 361 }, (_, i) => i % 361),
  };

  it('zachodnia krawędź na ujemnej długości czyta kolumny modulo 360', () => {
    const cut = subsetGrid(ring, { northLatDeg: 60, southLatDeg: 59, westLonDeg: -2, eastLonDeg: 2 });
    expect(cut.valuesCm.slice(0, 5)).toEqual([358, 359, 0, 1, 2]);
    expect(cut.westLonDeg).toBe(-2);
    expect(cut.rows).toBe(2);
    expect(cut.cols).toBe(5);
  });

  it('odrzuca bbox poza węzłami siatki', () => {
    expect(() =>
      subsetGrid(ring, { northLatDeg: 60, southLatDeg: 59, westLonDeg: 0.3, eastLonDeg: 2 }),
    ).toThrow(/węźle/);
  });

  it('odrzuca bbox odwrócony i wystający poza siatkę', () => {
    expect(() =>
      subsetGrid(ring, { northLatDeg: 59, southLatDeg: 60, westLonDeg: 0, eastLonDeg: 2 }),
    ).toThrow(/odwrócony/);
    expect(() =>
      subsetGrid(ring, { northLatDeg: 61, southLatDeg: 59, westLonDeg: 0, eastLonDeg: 2 }),
    ).toThrow(/wystaje/);
  });
});

describe('renderGeoidModule', () => {
  const small: GeoidGrid = {
    northLatDeg: 52,
    westLonDeg: 20,
    stepDeg: 0.25,
    rows: 2,
    cols: 3,
    valuesCm: [3100, 3150, 3210, 3080, 3130, 3190],
  };

  it('wypisane wartości i wymiary odtwarzają siatkę co do centymetra', () => {
    const source = renderGeoidModule(small);
    const body = source.slice(source.indexOf('valuesCm: ['), source.indexOf('],'));
    const values = [...body.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
    expect(values).toEqual([...small.valuesCm]);
    expect(source).toContain('rows: 2');
    expect(source).toContain('cols: 3');
    expect(source).toContain('PLIK GENEROWANY');
  });
});
