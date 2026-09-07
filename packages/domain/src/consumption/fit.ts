/**
 * UZ Aero - dopasowanie z więzem nieujemności RAZEM z niepewnością wyniku.
 *
 * ══ DLACZEGO NIEPEWNOŚĆ JEST CZĘŚCIĄ WYNIKU, A NIE DODATKIEM ══
 * Stawka „51,3 L/h" policzona z pięciu interwałów i z dziewięćdziesięciu sześciu wygląda
 * na ekranie identycznie, a znaczy co innego. Ekran A10a pokazuje więc `±` przy KAŻDEJ
 * stawce, a ten moduł zwraca je w jednym obiekcie z wartością - żeby nie dało się pokazać
 * jednego bez drugiego.
 *
 * ══ PRZEDZIAŁY ZE WZORU, NIE Z LOSOWANIA (decyzja 2026-08-05) ══
 * Mockup mówił pierwotnie o bootstrapie. Wybrana została metoda analityczna, bo:
 *  • domena jest deterministyczna i nie ma w niej generatora losowego - zaseedowany
 *    bootstrap byłby powtarzalny, ale na pytanie „dlaczego ±2,1, a nie ±2,3" jedyną
 *    odpowiedzią byłoby „bo takie wyszło losowanie". Na ekranie, którego cała teza brzmi
 *    „każda liczba klika się w dół do źródła", to jest wada zasadnicza;
 *  • nie kosztuje nic: `gramInverse` liczymy i tak, do wykrywania współliniowości;
 *  • jedyną realną przewagę bootstrapu - ucięty rozkład przy stawce na więzie - obsługujemy
 *    JAWNIE i lepiej: `pinned` mówi wprost „tej fazy nie dało się odróżnić od zera",
 *    zamiast maskować to symetrycznym `±` sięgającym poniżej zera.
 *
 * Ten moduł nie zna paliwa ani motogodzin - dostaje macierz i wektor.
 */

import { solveNnls } from './nnls';

/**
 * Kwantyle rozkładu t-Studenta dla przedziału dwustronnego 95%, indeksowane liczbą
 * stopni swobody (pozycja 0 nieużywana). Powyżej 30 stopni różnica od granicy 1,96
 * jest mniejsza niż rozdzielczość, z jaką te liczby w ogóle pokazujemy.
 *
 * Tablica zamiast funkcji odwrotnej: pięć linii danych kontra implementacja funkcji
 * beta niepełnej, przy identycznym wyniku w zakresie, który nas dotyczy.
 */
const T_TWO_SIDED_95: readonly number[] = [
  NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/** Granica normalna - dla df ≥ 30. */
const Z_TWO_SIDED_95 = 1.96;

/** Kwantyl t dla zadanej liczby stopni swobody; `null` gdy stopni brak. */
export function tQuantile95(degreesOfFreedom: number): number | null {
  if (degreesOfFreedom < 1) return null;
  return T_TWO_SIDED_95[degreesOfFreedom] ?? Z_TWO_SIDED_95;
}

/** Jeden współczynnik dopasowania razem z tym, ile o nim wiadomo. */
export interface FittedCoefficient {
  /** Wartość w jednostkach wejścia (L/h albo MH/h). Zawsze ≥ 0. */
  value: number;
  /**
   * Połowa szerokości przedziału 95%. `null` = brak stopni swobody (równań tyle samo,
   * co niewiadomych) - dopasowanie przechodzi wtedy przez punkty i nie ma z czego
   * oszacować rozrzutu.
   */
  ciHalfWidth: number | null;
  /**
   * Współczynnik przypięty do zera przez więz. Przedział czytamy wtedy JEDNOSTRONNIE
   * („≤ ciHalfWidth"), bo symetryczny sięgałby poniżej zera, czyli poza dziedzinę.
   */
  pinned: boolean;
  /**
   * Ile razy niepewność tej stawki jest większa niż w układzie o fazach idealnie
   * rozdzielonych. Rośnie, gdy fazy występują w interwałach w stałej proporcji.
   * `1` = rozdzielone idealnie; wartości rzędu kilkunastu znaczą, że model widzi
   * sumę tych faz, a nie każdą z osobna.
   */
  varianceInflation: number;
}

/** Wynik dopasowania: współczynniki, reszty i miary jakości. */
export interface Fit {
  coefficients: FittedCoefficient[];
  /** Liczba równań, które weszły do dopasowania. */
  equations: number;
  /** Równania minus liczba współczynników WOLNYCH (przypięte nie kosztują stopnia). */
  degreesOfFreedom: number;
  /** Odchylenie reszt w jednostkach prawej strony (litry albo motogodziny). */
  residualSigma: number | null;
  /**
   * R² NIECENTROWANE: `1 − RSS/Σy²`. Model nie ma wyrazu wolnego z powodu fizycznego
   * (zero czasu = zero paliwa), a R² centrowane bywa dla takich modeli ujemne i myli
   * czytelnika. Nagłówkową miarą dopasowania pozostaje `residualSigma` w litrach.
   */
  rSquaredUncentered: number | null;
  residuals: number[];
}

/**
 * Dopasowuje `b ≈ A·x` przy `x ≥ 0` i opisuje niepewność wyniku.
 *
 * `null`, gdy układu nie da się rozwiązać (kolumny nierozróżnialne albo równań mniej
 * niż niewiadomych) - wywołujący schodzi wtedy na model o mniejszej liczbie kolumn.
 */
export function fitNonNegative(
  a: readonly (readonly number[])[],
  b: readonly number[],
): Fit | null {
  const solution = solveNnls(a, b);
  if (solution == null) return null;

  const equations = a.length;
  const freeCount = solution.freeIndices.length;
  const degreesOfFreedom = equations - freeCount;

  const residualSigma =
    degreesOfFreedom > 0 ? Math.sqrt(solution.rss / degreesOfFreedom) : null;
  const t = tQuantile95(degreesOfFreedom);

  const totalSquares = b.reduce((sum, value) => sum + value * value, 0);
  const rSquaredUncentered = totalSquares > 0 ? 1 - solution.rss / totalSquares : null;

  const coefficients: FittedCoefficient[] = solution.x.map((value, column) => {
    const position = solution.freeIndices.indexOf(column);
    const pinned = position < 0;
    // Dla współczynnika przypiętego nie ma wpisu w odwróconym Gramie - jego niepewność
    // nie jest zresztą pytaniem, na które ten model odpowiada. Zamiast zmyślać liczbę,
    // oddajemy `null` i flagę `pinned`; UI napisze wtedy „≤ …" albo samą kreskę.
    const inflation = pinned ? Number.NaN : (solution.gramInverse[position]?.[position] ?? Number.NaN);
    const norm = solution.columnNorms[column] ?? 0;

    const ciHalfWidth =
      !pinned && residualSigma != null && t != null && norm > 0 && Number.isFinite(inflation)
        ? (t * residualSigma * Math.sqrt(inflation)) / norm
        : null;

    return {
      value,
      ciHalfWidth,
      pinned,
      varianceInflation: Number.isFinite(inflation) ? inflation : Number.NaN,
    };
  });

  return {
    coefficients,
    equations,
    degreesOfFreedom,
    residualSigma,
    rSquaredUncentered,
    residuals: solution.residuals,
  };
}
