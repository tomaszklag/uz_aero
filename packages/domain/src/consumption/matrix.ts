/**
 * UZ Aero - mała gęsta algebra dla regresji zużycia (najwyżej cztery niewiadome).
 *
 * DLACZEGO WŁASNA, A NIE BIBLIOTEKA: `@uzaero/domain` ma zero zależności i jest to
 * egzekwowane testem architektury (`app/src/__tests__/architecture.test.ts`) - domenę
 * dzielą aplikacja i serwer, więc każdy import wiązałby OBIE strony z jego obecnością.
 * Przy `n ≤ 4` cała potrzebna algebra to sto linii bez pętli iteracyjnych.
 *
 * Ten plik NIE ZNA pojęć dziedzinowych: nie ma tu paliwa, faz ani interwałów. Wektory
 * i macierze wchodzą, wektory i macierze wychodzą - tak samo jak `detection/regression.ts`
 * nie wie, że liczy prędkość pionową.
 *
 * Konwencja: macierz to tablica WIERSZY (`m[i][j]` = wiersz i, kolumna j). Wszystkie
 * funkcje są czyste - wejście nietknięte, wynik nowy.
 */

/** Iloczyn macierz × wektor. */
export function matVec(a: readonly (readonly number[])[], x: readonly number[]): number[] {
  return a.map((row) => {
    let sum = 0;
    for (let j = 0; j < x.length; j++) sum += (row[j] ?? 0) * x[j]!;
    return sum;
  });
}

/** Iloczyn transpozycji przez wektor: `Aᵀb`. Wynik ma długość równą liczbie KOLUMN. */
export function transposeMultiply(
  a: readonly (readonly number[])[],
  b: readonly number[],
  columns: number,
): number[] {
  const out = new Array<number>(columns).fill(0);
  for (let i = 0; i < a.length; i++) {
    const row = a[i]!;
    const bi = b[i] ?? 0;
    for (let j = 0; j < columns; j++) out[j]! += (row[j] ?? 0) * bi;
  }
  return out;
}

/** Macierz Grama `AᵀA` - symetryczna, rozmiaru `columns × columns`. */
export function gramMatrix(
  a: readonly (readonly number[])[],
  columns: number,
): number[][] {
  const g: number[][] = Array.from({ length: columns }, () =>
    new Array<number>(columns).fill(0),
  );
  for (const row of a) {
    for (let j = 0; j < columns; j++) {
      const vj = row[j] ?? 0;
      if (vj === 0) continue;
      for (let k = j; k < columns; k++) {
        const product = vj * (row[k] ?? 0);
        g[j]![k]! += product;
        if (k !== j) g[k]![j]! += product;
      }
    }
  }
  return g;
}

/** Normy euklidesowe kolumn. Zero znaczy „faza nieobecna we wszystkich równaniach". */
export function columnNorms(
  a: readonly (readonly number[])[],
  columns: number,
): number[] {
  const norms = new Array<number>(columns).fill(0);
  for (const row of a) {
    for (let j = 0; j < columns; j++) norms[j]! += (row[j] ?? 0) ** 2;
  }
  return norms.map(Math.sqrt);
}

/**
 * Rozkład Choleskiego macierzy symetrycznej dodatnio określonej: `M = LLᵀ`.
 *
 * `null`, gdy macierz nie jest dodatnio określona - a to jest DOKŁADNIE ten sygnał,
 * którego szukamy: znaczy, że kolumny są (numerycznie) współliniowe, czyli faz nie da
 * się od siebie odróżnić. Wykrycie osobliwości jest tu funkcją, nie awarią; wywołujący
 * schodzi wtedy na model z mniejszą liczbą faz (`model.ts`).
 *
 * `minPivot` porównujemy z wartością NA PRZEKĄTNEJ przed pierwiastkiem, więc dla macierzy
 * znormalizowanej (przekątna = 1) jest to próg względny, a nie zależny od jednostek.
 */
export function cholesky(
  m: readonly (readonly number[])[],
  minPivot = 1e-8,
): number[][] | null {
  const n = m.length;
  const l: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i]![j] ?? 0;
      for (let k = 0; k < j; k++) sum -= l[i]![k]! * l[j]![k]!;

      if (i === j) {
        if (sum <= minPivot) return null;
        l[i]![j] = Math.sqrt(sum);
      } else {
        l[i]![j] = sum / l[j]![j]!;
      }
    }
  }

  return l;
}

/** Rozwiązuje `LLᵀx = rhs` przez podstawianie w przód i wstecz. */
export function choleskySolve(
  l: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] {
  const n = l.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = rhs[i] ?? 0;
    for (let k = 0; k < i; k++) sum -= l[i]![k]! * y[k]!;
    y[i] = sum / l[i]![i]!;
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k++) sum -= l[k]![i]! * x[k]!;
    x[i] = sum / l[i]![i]!;
  }
  return x;
}

/**
 * Odwrotność macierzy symetrycznej z jej rozkładu Choleskiego.
 *
 * Potrzebna wyłącznie po to, żeby odczytać PRZEKĄTNĄ: `(G⁻¹)ⱼⱼ` znormalizowanego Grama
 * jest współczynnikiem, o który niepewność stawki rośnie względem układu, w którym fazy
 * byłyby idealnie rozdzielone. Jedna inwersja obsługuje więc naraz przedziały ufności
 * i diagnostykę „czy te fazy w ogóle da się odróżnić" (`model.ts`).
 */
export function invertFromCholesky(l: readonly (readonly number[])[]): number[][] {
  const n = l.length;
  const inverse: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let column = 0; column < n; column++) {
    const unit = new Array<number>(n).fill(0);
    unit[column] = 1;
    const solved = choleskySolve(l, unit);
    for (let row = 0; row < n; row++) inverse[row]![column] = solved[row]!;
  }

  return inverse;
}
