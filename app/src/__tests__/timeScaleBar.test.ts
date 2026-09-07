/**
 * UZ Aero - podziałka czasu profilu (issue #47, trzecia tura przeglądu).
 *
 * Podziałka jest WSKAŹNIKIEM PRZYBLIŻENIA: ma zmieniać podpis razem z zoomem, tak jak
 * podziałka odległości na mapie („500 m" zamiast „2 km"). Test pilnuje trzech rzeczy,
 * bez których byłaby ozdobą: że pasek mieści się w limicie, że krok jest okrągły
 * w mowie pilota, i że przybliżenie faktycznie schodzi na krótszy krok.
 */

import { timeScaleBar } from '../ui/components/data/timeScaleBar';

const MINUTE = 60_000;

/** Typowa sesja: 103 min biegu silnika na ~260 px szerokości krzywej. */
const SESSION_MS = 103 * MINUTE;
const SPAN_PX = 260;

describe('podziałka czasu profilu', () => {
  it('mieści się w zadanej szerokości', () => {
    const scale = timeScaleBar(SESSION_MS / SPAN_PX, 70)!;

    expect(scale.pixels).toBeLessThanOrEqual(70);
    expect(scale.pixels).toBeGreaterThan(0);
  });

  it('przybliżenie schodzi na KRÓTSZY krok - po to ta podziałka jest', () => {
    const rest = timeScaleBar(SESSION_MS / SPAN_PX, 70)!;
    const zoomed = timeScaleBar(SESSION_MS / (SPAN_PX * 8), 70)!;

    expect(zoomed.ms).toBeLessThan(rest.ms);
    expect(zoomed.label).not.toBe(rest.label);
  });

  it('kroki są okrągłe w mowie pilota, nie arytmetycznie równe', () => {
    const labels = [1, 2, 4, 8].map((zoom) => timeScaleBar(SESSION_MS / (SPAN_PX * zoom), 70)!.label);

    for (const label of labels) {
      expect(label).toMatch(/^(10|20|30) s$|^(1|2|5|10|15|30) min$|^(1|2|4) h$/);
    }
  });

  it('nagranie kilkusekundowe dostaje najmniejszy krok, a nie brak podziałki', () => {
    const scale = timeScaleBar(5_000 / SPAN_PX, 70);

    expect(scale).not.toBeNull();
    expect(scale!.label).toBe('10 s');
  });

  it('bezsensowne wejście nie produkuje paska', () => {
    expect(timeScaleBar(0, 70)).toBeNull();
    expect(timeScaleBar(Number.NaN, 70)).toBeNull();
    expect(timeScaleBar(1_000, 0)).toBeNull();
  });
});
