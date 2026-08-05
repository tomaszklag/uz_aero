/**
 * UZ Aero — regresja liniowa z więzem nieujemności (NNLS).
 *
 * ══ PO CO WIĘZ ══
 * Szukamy stawek zużycia per faza z równań „zużycie = Σ stawka · czas". Zwykła metoda
 * najmniejszych kwadratów potrafi oddać stawkę UJEMNĄ — matematycznie poprawne dopasowanie,
 * fizycznie bzdura („na ziemi silnik produkuje paliwo"). Ujemna stawka nie jest drobnym
 * artefaktem do zaokrąglenia: pojawia się dokładnie wtedy, gdy dwie fazy są trudne do
 * rozdzielenia, i wtedy jedna wychodzi wysoko, druga poniżej zera, a suma się zgadza.
 * Więz `r ≥ 0` zamienia ten fałsz w informację: stawka ląduje NA zerze i jest oznaczona
 * jako przypięta (`active`), co ekran pokazuje wprost.
 *
 * ══ DLACZEGO ENUMERACJA, A NIE LAWSON-HANSON ══
 * Przy `n ≤ 4` podzbiorów „które zmienne siedzą na zerze" jest najwyżej 16. Dla każdego
 * rozwiązujemy zwykły układ normalny na zmiennych wolnych i sprawdzamy dwa warunki KKT.
 * Rozwiązanie NNLS jest przy pełnym rzędzie jedyne, więc wynik jest IDENTYCZNY jak
 * z Lawsona-Hansona — za to bez pętli iteracyjnej, bez tolerancji zbieżności i bez
 * pytania „czy zbiegło". Metody iteracyjne (gradient rzutowany, coordinate descent)
 * odpadły z innego powodu: na złe uwarunkowanie — nasz główny tryb awarii — reagują
 * cichym, wolnym pełzaniem zamiast błędu, a my potrzebujemy tu twardego `null`.
 *
 * Przy `n > 6` (64 podzbiory) ta arytmetyka przestaje się opłacać — wtedy wróć do
 * Lawsona-Hansona, nie do metody iteracyjnej.
 *
 * ══ NORMALIZACJA KOLUMN ══
 * Kolumny (czasy faz w godzinach) mają różne skale: kołowanie to dziesiąte części
 * godziny, przelot — godziny. Rozwiązujemy na kolumnach o normie 1 i skalujemy wynik
 * z powrotem. Poprawia to uwarunkowanie, a przy okazji daje za darmo `gramInverse`,
 * którego przekątna jest miarą rozdzielności faz (patrz `matrix.ts`).
 */

import {
  cholesky,
  choleskySolve,
  columnNorms as computeColumnNorms,
  gramMatrix,
  invertFromCholesky,
  matVec,
  transposeMultiply,
} from './matrix';

/** Wynik dopasowania z więzem nieujemności. */
export interface NnlsSolution {
  /** Stawki w jednostkach WEJŚCIA (np. L/h), wszystkie ≥ 0. Długość = liczba kolumn. */
  x: number[];
  /** `true` = zmienna przypięta do zera przez więz (albo kolumna pusta). */
  active: boolean[];
  /** Reszty `Ax − b` dla każdego równania. */
  residuals: number[];
  /** Suma kwadratów reszt. */
  rss: number;
  /** Indeksy kolumn WOLNYCH — mapowanie pozycji w `gramInverse`. */
  freeIndices: number[];
  /**
   * Odwrotność znormalizowanej macierzy Grama zmiennych WOLNYCH. Przekątna niesie
   * współczynnik wzrostu niepewności; razem z `columnNorms` daje błąd standardowy
   * stawki: `SE(x_j) = σ · √((G⁻¹)_kk) / ‖a_j‖`.
   */
  gramInverse: number[][];
  /** Normy kolumn wejścia — drugi składnik powyższego wzoru. */
  columnNorms: number[];
}

/**
 * Rozwiązuje `min ‖Ax − b‖²` przy `x ≥ 0`.
 *
 * `null`, gdy układu nie da się rozwiązać dla ŻADNEGO dopuszczalnego podzbioru —
 * w praktyce: kolumny współliniowe (faz nie da się rozdzielić) albo równań mniej niż
 * niewiadomych. To nie jest awaria, tylko odpowiedź „z tych danych tego nie wiadomo";
 * wywołujący schodzi wtedy na model z mniejszą liczbą faz.
 *
 * @param a macierz równań: wiersz = interwał, kolumna = faza (czasy w godzinach).
 * @param b prawa strona: zużycie w każdym interwale (litry).
 */
export function solveNnls(
  a: readonly (readonly number[])[],
  b: readonly number[],
): NnlsSolution | null {
  const rows = a.length;
  const columns = a[0]?.length ?? 0;
  if (rows === 0 || columns === 0 || b.length !== rows) return null;

  const norms = computeColumnNorms(a, columns);
  // Kolumna o zerowej normie to faza nieobecna we WSZYSTKICH równaniach. Nie ma o niej
  // czego powiedzieć, więc nie bierze udziału w układzie — inaczej zerowałaby pivot
  // i przewracała rozkład za każdym razem.
  const usable = norms.map((n) => n > 0);
  const normalized = a.map((row) =>
    row.map((value, j) => (usable[j] === true ? value / norms[j]! : 0)),
  );

  // Osobliwość PEŁNEGO zbioru kolumn użytecznych kończy pracę od razu — i to jest
  // rozróżnienie, dla którego ten warunek tu stoi. Bez niego solver schodziłby po cichu
  // do mniejszego podzbioru i oddawał rozwiązanie z fazą przypiętą do zera, czyli mylił
  // „ta faza nic nie pali" (odpowiedź na podstawie danych) z „tych faz nie da się od
  // siebie odróżnić" (brak odpowiedzi). Wyszło to z testu na kolumnach współliniowych.
  // Uwaga: przy pełnym rzędzie kolumnowym ŻADEN podzbiór nie jest osobliwy, więc ten
  // jeden rozkład rozstrzyga sprawę dla wszystkich kandydatów.
  const usableIndices = usable.flatMap((ok, j) => (ok ? [j] : []));
  if (usableIndices.length === 0) return null;
  const fullSubmatrix = normalized.map((row) => usableIndices.map((j) => row[j]!));
  if (cholesky(gramMatrix(fullSubmatrix, usableIndices.length)) == null) return null;

  const candidates = subsetsBySizeDesc(columns, usable);

  for (const free of candidates) {
    const submatrix = normalized.map((row) => free.map((j) => row[j]!));
    const gram = gramMatrix(submatrix, free.length);
    const l = cholesky(gram);
    if (l == null) continue; // podzbiór osobliwy — spróbuj mniejszego

    const rhs = transposeMultiply(submatrix, b, free.length);
    const solved = choleskySolve(l, rhs);

    // (1) dopuszczalność prymalna: zmienne wolne muszą wyjść nieujemne.
    if (solved.some((value) => value < 0)) continue;

    const scaled = new Array<number>(columns).fill(0);
    free.forEach((column, k) => {
      scaled[column] = solved[k]!;
    });

    const fitted = matVec(normalized, scaled);
    const residuals = fitted.map((value, i) => value - b[i]!);
    const gradient = transposeMultiply(normalized, residuals, columns);

    // (2) dopuszczalność dualna: dla zmiennych przypiętych do zera gradient nie może
    // wskazywać, że opłacałoby się je podnieść. Tolerancja bierze skalę zadania,
    // bo gradient ma jednostkę litrów — próg absolutny kłamałby przy innym samolocie.
    const tolerance = 1e-9 * Math.max(1, ...residuals.map(Math.abs));
    const dualOk = gradient.every(
      (value, j) => free.includes(j) || !usable[j] || value >= -tolerance,
    );
    if (!dualOk) continue;

    const x = scaled.map((value, j) => (usable[j] === true ? value / norms[j]! : 0));
    const active = x.map((_, j) => !free.includes(j));

    return {
      x,
      active,
      residuals,
      rss: residuals.reduce((sum, r) => sum + r * r, 0),
      freeIndices: free,
      gramInverse: invertFromCholesky(l),
      columnNorms: norms,
    };
  }

  return null;
}

/**
 * Podzbiory indeksów kolumn użytecznych, od najliczniejszych do najmniejszych.
 *
 * Kolejność jest częścią kontraktu, nie szczegółem: przy danych zdegenerowanych
 * (dwa podzbiory dają tę samą sumę kwadratów) wybieramy ten, który przypina do zera
 * MNIEJ zmiennych — czyli mówi mniej rzeczy, których nie sprawdziliśmy. Dzięki temu
 * wynik jest deterministyczny i niezależny od kolejności równań.
 */
function subsetsBySizeDesc(columns: number, usable: readonly boolean[]): number[][] {
  const all: number[][] = [];
  for (let mask = (1 << columns) - 1; mask >= 0; mask--) {
    const subset: number[] = [];
    for (let j = 0; j < columns; j++) {
      if ((mask & (1 << j)) !== 0) {
        if (usable[j] !== true) {
          subset.length = 0;
          break;
        }
        subset.push(j);
      }
    }
    if (subset.length > 0) all.push(subset);
  }
  return all.sort((x, y) => y.length - x.length);
}
