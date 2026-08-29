/**
 * UZ Aero - panel: geometria wykresu „nalot dzień po dniu".
 *
 * Serwer oddaje szereg (dzień → blok); tu sprawdzamy WYŁĄCZNIE rysunek: skalowanie
 * do viewBoxu mockupu, kropki dni zerowych (widoczne, nie puste) i podpisy osi.
 */

import { describe, expect, it } from 'vitest';

import { trendView } from './statsTrend';

const HOUR = 3_600_000;

const day = (n: number, blockMs: number) => ({
  day: `2026-07-${String(n).padStart(2, '0')}`,
  blockMs,
});

describe('trendView', () => {
  it('pusty szereg = brak wykresu (`null`), nie wykres z niczego', () => {
    expect(trendView([])).toBeNull();
  });

  it('maksimum siedzi na suficie (y=5), zero na podłodze (y=85)', () => {
    const view = trendView([day(1, 0), day(2, 5 * HOUR), day(3, 10 * HOUR)])!;
    expect(view.points).toBe('0,85 300,45 600,5');
    expect(view.lastDot).toEqual({ x: 600, y: 5 });
  });

  it('dzień ZEROWY dostaje kropkę na osi - jest widoczny, nie pusty', () => {
    const view = trendView([day(1, 2 * HOUR), day(2, 0), day(3, 4 * HOUR)])!;
    expect(view.zeroDots).toEqual([{ key: '2026-07-02', x: 300 }]);
    expect(view.zeroNote).toContain('Jeden dzień bez nalotu (02 JUL)');
    expect(view.zeroNote).toContain('nie brak danych');
  });

  it('zakres bez nalotu: linia leży na podłodze, plakietki „max" nie ma', () => {
    const view = trendView([day(1, 0), day(2, 0)])!;
    expect(view.points).toBe('0,85 600,85');
    expect(view.maxLabel).toBeNull();
    expect(view.sumLabel).toBe('suma 0:00');
  });

  it('plakietki niosą maksimum z DNIEM i sumę zakresu', () => {
    const view = trendView([day(1, 2 * HOUR), day(2, 10.2 * HOUR), day(3, HOUR)])!;
    expect(view.maxLabel).toBe('max 10.2 h · 02 JUL');
    expect(view.sumLabel).toBe('suma 13:12');
  });

  it('oś: pierwszy dzień, ćwiartki i ostatni - bez duplikatów przy krótkich zakresach', () => {
    const month = Array.from({ length: 30 }, (_, i) => day(i + 1, HOUR));
    expect(trendView(month)!.axis).toEqual(['01 JUL', '08 JUL', '16 JUL', '23 JUL', '30 JUL']);

    expect(trendView([day(1, HOUR), day(2, HOUR)])!.axis).toEqual(['01 JUL', '02 JUL']);
  });

  it('lista dni zerowych jest PRZYCIĘTA - sześć imiennie, reszta wielokropkiem', () => {
    const quiet = Array.from({ length: 10 }, (_, i) => day(i + 1, 0));
    quiet.push(day(11, HOUR));
    const note = trendView(quiet)!.zeroNote!;
    expect(note).toContain('10 dni bez nalotu');
    expect(note).toContain(', …');
  });
});
