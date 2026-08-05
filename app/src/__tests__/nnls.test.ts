/**
 * UZ Aero — testy regresji z więzem nieujemności (analityka zużycia).
 *
 * Ta matematyka nie ma testu „na oko" — dokładnie jak odwzorowanie mapy: błąd w niej
 * nie wywala aplikacji, tylko podaje stawkę spalania o kilka litrów obok, a taka liczba
 * wygląda równie wiarygodnie jak prawdziwa. Dlatego punktami odniesienia są układy
 * o rozwiązaniu znanym z definicji (dokładne dopasowanie, iloraz sum, jawny więz),
 * a nie wyniki zapamiętane z jednego przebiegu.
 */

import { solveNnls } from '../domain';

describe('solveNnls — układy o znanym rozwiązaniu', () => {
  it('odtwarza stawki dokładnie, gdy równania są spójne', () => {
    // 2 fazy: ziemia 10 L/h, powietrze 40 L/h. Trzy interwały o różnych proporcjach.
    const a = [
      [1, 0],
      [0, 1],
      [0.5, 2],
    ];
    const b = [10, 40, 85];

    const solution = solveNnls(a, b);

    expect(solution).not.toBeNull();
    expect(solution!.x[0]).toBeCloseTo(10, 10);
    expect(solution!.x[1]).toBeCloseTo(40, 10);
    expect(solution!.rss).toBeCloseTo(0, 10);
    expect(solution!.active).toEqual([false, false]);
  });

  it('model jednofazowy NIE jest ilorazem sum — i to jest poprawne', () => {
    // Rzecz, którą trzeba znać, zanim ktoś zacznie „naprawiać" rozjazd między kaflem
    // „na godzinę bloku" a modelem zdegradowanym do jednej fazy. Regresja przez zero
    // minimalizuje błąd w LITRACH, więc waży interwał kwadratem jego długości:
    // x = Σ(h·L) / Σ(h²). Iloraz sum waży liniowo: ΣL / Σh. Obie liczby są uzasadnione
    // (odczyt paliwomierza ma błąd stały, więc dłuższy interwał niesie więcej informacji),
    // ale to NIE JEST ta sama liczba i nie ma prawa nią być.
    const hours = [2, 3, 5];
    const litres = [30, 44, 76];
    const solution = solveNnls(hours.map((h) => [h]), litres)!;

    const weighted =
      hours.reduce((s, h, i) => s + h * litres[i]!, 0) / hours.reduce((s, h) => s + h * h, 0);
    const sumRatio = litres.reduce((s, v) => s + v, 0) / hours.reduce((s, v) => s + v, 0);

    expect(solution.x[0]).toBeCloseTo(weighted, 10);
    expect(sumRatio).not.toBeCloseTo(weighted, 3);
  });

  it('przy równych długościach interwałów obie metody się spotykają', () => {
    // Kontrola poprzedniego testu: rozjazd bierze się WYŁĄCZNIE z różnych długości,
    // a nie z błędu w którejkolwiek metodzie.
    const solution = solveNnls([[4], [4], [4]], [60, 68, 64])!;
    expect(solution.x[0]).toBeCloseTo(192 / 12, 10);
  });

  it('przypina stawkę do zera zamiast oddać ujemną', () => {
    // Druga kolumna „tłumaczyłaby" dane najlepiej wartością ujemną. Zwykła regresja
    // podałaby ją bez mrugnięcia — fizycznie znaczyłaby „silnik produkuje paliwo".
    const a = [
      [1, 1],
      [1, 2],
      [1, 3],
    ];
    const b = [30, 20, 10];

    const solution = solveNnls(a, b);

    expect(solution!.x[1]).toBe(0);
    expect(solution!.active).toEqual([false, true]);
    expect(solution!.x[0]).toBeGreaterThan(0);
    // Po przypięciu drugiej zmiennej pierwsza musi być zwykłą średnią (kolumna samych jedynek).
    expect(solution!.x[0]).toBeCloseTo(20, 10);
  });

  it('kolumny współliniowe zwracają null — nie da się rozdzielić faz', () => {
    // Druga kolumna to dokładnie dwukrotność pierwszej: każdy podział zużycia między
    // te fazy pasuje tak samo dobrze. „Nie wiem" jest tu jedyną uczciwą odpowiedzią.
    const a = [
      [1, 2],
      [2, 4],
      [3, 6],
    ];
    expect(solveNnls(a, [10, 20, 30])).toBeNull();
  });

  it('faza nieobecna we wszystkich równaniach wychodzi zerem, nie NaN-em', () => {
    const a = [
      [2, 0],
      [3, 0],
    ];
    const solution = solveNnls(a, [20, 30]);

    expect(solution).not.toBeNull();
    expect(solution!.x[1]).toBe(0);
    expect(solution!.active[1]).toBe(true);
    expect(Number.isFinite(solution!.x[0])).toBe(true);
    expect(solution!.x[0]).toBeCloseTo(10, 10);
  });

  it('równań mniej niż niewiadomych to null, a nie zgadywanie', () => {
    expect(solveNnls([[1, 1]], [10])).toBeNull();
  });

  it('daje ten sam wynik niezależnie od kolejności równań', () => {
    const a = [
      [1, 0.5],
      [0.2, 2],
      [1.5, 1],
      [0.4, 0.3],
    ];
    const b = [32, 84, 63, 17];

    const straight = solveNnls(a, b)!;
    const reversed = solveNnls([...a].reverse(), [...b].reverse())!;

    expect(reversed.x[0]).toBeCloseTo(straight.x[0], 10);
    expect(reversed.x[1]).toBeCloseTo(straight.x[1], 10);
  });

  it('niesie składniki błędu standardowego: odwrotność Grama i normy kolumn', () => {
    // Bez tych dwóch liczb nie da się policzyć „±2.1" — a stawka bez niepewności
    // nie ma prawa stanąć na ekranie.
    const solution = solveNnls(
      [
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      [10, 40, 50],
    )!;

    expect(solution.freeIndices).toEqual([0, 1]);
    expect(solution.gramInverse).toHaveLength(2);
    expect(solution.columnNorms[0]).toBeCloseTo(Math.SQRT2, 10);
    // Przekątna odwrotności znormalizowanego Grama nie schodzi poniżej 1: układ idealnie
    // rozdzielony daje dokładnie 1, każda korelacja faz tę liczbę podnosi.
    expect(solution.gramInverse[0]![0]).toBeGreaterThanOrEqual(1);
  });
});
