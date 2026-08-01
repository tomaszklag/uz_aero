/**
 * UZ Aero — panel: testy wykresu „Napływ zdarzeń 12 h" (`A01`).
 *
 * Najważniejsza własność jest semantyczna, nie geometryczna: **pusty słupek musi być
 * WIDOCZNY i mieć własną klasę**. Cytat z `SZABLON.html`: „cisza w rejestrze wymaga
 * podpisu: nie znaczy »nikt nie latał«, tylko »nic nie dotarło«".
 */

import { describe, expect, it } from 'vitest';

import type { DashboardInflowDto } from '../../api/dto';
import { sparkNote, sparkView } from './pulpitSpark';

const NOW = Date.UTC(2026, 6, 31, 14, 0, 0);
const HOUR = 60 * 60 * 1000;

const inflow = (buckets: number[]): DashboardInflowDto => ({
  fromMs: NOW - 12 * HOUR,
  toMs: NOW,
  bucketMs: HOUR,
  buckets,
});

describe('słupki', () => {
  it('najwyższy wypełnia wykres, reszta skaluje się względem niego', () => {
    // Skala liniowa względem szczytu, nie względem stałej: wykres ma być czytelny
    // i przy dwóch zdarzeniach na godzinę, i przy dwustu.
    const view = sparkView(inflow([0, 25, 50, 100, 75, 0, 10, 20, 30, 40, 60, 80]));
    expect(view.bars).toHaveLength(12);
    expect(view.bars[3]?.height).toBe('100%');
    expect(view.bars[2]?.height).toBe('50%');
  });

  it('pusty słupek ma WŁASNĄ klasę i widoczną wysokość', () => {
    const view = sparkView(inflow([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    expect(view.bars[0]?.className).toBe('zero');
    expect(view.bars[0]?.height).toBe('4%');
    expect(view.bars[0]?.count).toBe(0);
  });

  it('BIEŻĄCE wiadro jest wyróżnione, nawet gdy puste', () => {
    // Ostatnie wiadro dopiero się wypełnia, więc jego pustka znaczy co innego niż
    // pustka wiadra domkniętego — i nie ma prawa wyglądać tak samo.
    const view = sparkView(inflow([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]));
    expect(view.bars[11]?.className).toBe('now');
    expect(view.bars[10]?.className).toBe('');
  });

  it('całkowicie pusty napływ nie dzieli przez zero', () => {
    const view = sparkView(inflow(new Array(12).fill(0)));
    expect(view.total).toBe(0);
    expect(view.zeros).toBe(12);
    expect(view.bars.every((b) => b.height === '4%')).toBe(true);
  });

  it('każdy słupek zna swój początek — do etykiety dostępnościowej', () => {
    const view = sparkView(inflow(new Array(12).fill(1)));
    expect(view.bars[0]?.fromMs).toBe(NOW - 12 * HOUR);
    expect(view.bars[11]?.fromMs).toBe(NOW - HOUR);
  });
});

describe('oś', () => {
  it('trzy podpisy: brzegi okna i środek, z dopiskiem UTC na końcu', () => {
    expect(sparkView(inflow(new Array(12).fill(1))).axis).toEqual(['02:00', '08:00', '14:00 UTC']);
  });
});

describe('zdanie pod wykresem mówi, czego wykres NIE wie', () => {
  it('cisza całkowita: „pokazuje, że nic nie przyszło, nigdy dlaczego"', () => {
    const note = sparkNote(sparkView(inflow(new Array(12).fill(0))));
    expect(note).toContain('0 zdarzeń w 12 h');
    expect(note).toContain('nigdy dlaczego');
    expect(note).toContain('nie znaczy, że nikt nie lata');
  });

  it('przerwa w środku: tłumaczy zaległy outbox, zamiast alarmować', () => {
    const note = sparkNote(sparkView(inflow([5, 5, 5, 0, 0, 5, 5, 5, 5, 5, 5, 5])));
    expect(note).toContain('2 godzin bez ani jednego');
    expect(note).toContain('zaległą paczkę');
  });

  it('napływ bez przerw: przypomina, że oś to czas PRZYJĘCIA', () => {
    const note = sparkNote(sparkView(inflow(new Array(12).fill(3))));
    expect(note).toContain('bez przerw');
    expect(note).toContain('czas PRZYJĘCIA');
  });
});
