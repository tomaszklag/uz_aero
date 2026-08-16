/**
 * UZ Aero — fragment trasy w oknie czasu (issue #47, podświetlenie zamiast przeskoku).
 *
 * Profil przybliżony do wycinka czasu mówi mapie, który to wycinek. Pierwsza wersja tej
 * funkcji zwracała LISTĘ przebiegów, bo „nad polem samolot jest kilka razy" — i dopiero
 * test poniżej pokazał, że to nieporozumienie: linia jest uporządkowana czasem, więc
 * pasujące wierzchołki zawsze leżą obok siebie, a kilka przelotów nad tym samym placem
 * to jeden ciągły kawałek zawinięty w pętle.
 */

import { highlightRange } from '../ui/components/data/highlightRuns';

const T0 = Date.UTC(2026, 7, 14, 8, 0, 0);
const min = (n: number): number => T0 + n * 60_000;

/** Czasy wierzchołków co minutę, od 0 do `n`. */
const everyMinute = (n: number): number[] => Array.from({ length: n + 1 }, (_, i) => min(i));

describe('fragment trasy w oknie', () => {
  it('okno w środku daje zakres z punktem zapasu po obu stronach', () => {
    // Zapas domyka styk z przygaszoną linią: bez niego podświetlenie urywa się
    // piksel przed granicą okna.
    expect(highlightRange(everyMinute(20), { from: min(10), to: min(14) })).toEqual([9, 15]);
  });

  it('okno obejmujące całość podświetla całość', () => {
    expect(highlightRange(everyMinute(5), { from: min(-1), to: min(9) })).toEqual([0, 5]);
  });

  it('kilka przelotów nad tym samym placem to JEDEN ciągły kawałek', () => {
    // Trasa zawija się w pętle nad polem, ale w czasie biegnie liniowo — więc okno
    // wycina z niej jeden spójny fragment, który po prostu kilka razy tamtędy wraca.
    const ranges = highlightRange(everyMinute(60), { from: min(20), to: min(40) });

    expect(ranges).toEqual([19, 41]);
  });

  it('okno poza nagraniem nie podświetla niczego', () => {
    expect(highlightRange(everyMinute(5), { from: min(30), to: min(40) })).toBeNull();
    expect(highlightRange([], { from: min(0), to: min(5) })).toBeNull();
  });

  it('zakres nigdy nie jest pustym odcinkiem', () => {
    const range = highlightRange([min(3)], { from: min(3), to: min(3) });

    expect(range).toBeNull();
  });
});
