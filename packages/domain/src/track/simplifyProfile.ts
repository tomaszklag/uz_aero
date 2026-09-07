/**
 * UZ Aero - upraszczanie PROFILU PIONOWEGO (Ramer–Douglas–Peucker w osi wysokości).
 *
 * Osobno od `simplify.ts`, bo mierzy co innego. Tam odległość punktu od cięciwy liczy
 * się w METRACH na płaszczyźnie - tutaj punkt ma czas i wysokość, czyli dwie wielkości
 * w różnych jednostkach, i „odległość prostopadła" nie znaczy nic, dopóki ktoś nie
 * wybierze kursu wymiany minut na stopy. Nie ma takiego kursu, więc mierzymy PIONOWO:
 * o ile stóp punkt odbiega od prostej poprowadzonej między sąsiadami w jego chwili.
 * To standardowa miara dla szeregu czasowego i ma naturalny próg - szum wysokości GPS.
 *
 * PO CO: profil rysował się do issue #47 z KAŻDEJ próbki. Godzinny bieg silnika przy
 * fixie co sekundę to 3 600 punktów na 290 px szerokości - czyli 12 próbek na piksel,
 * z których 11 nie ma jak niczego zmienić w rysunku, a każda kosztuje wiersz w JSON-ie
 * lecącym przez sieć i jeden `<View>` na telefonie.
 */

import type { ProfileSample } from './profile';

/**
 * Domyślna tolerancja (stopy).
 *
 * 25 ft to mniej niż typowy szum wysokości GPS klasy konsumenckiej (kilkadziesiąt stóp),
 * więc upraszczanie ścina prostą, na której nic się nie dzieje, a nie realne przegięcie
 * profilu. Poniżej tego progu zostawiałoby sam szum odbiornika.
 */
export const DEFAULT_PROFILE_TOLERANCE_FT = 25;

/**
 * Upraszcza szereg wysokości, zachowując punkty odbiegające od cięciwy o więcej niż
 * `toleranceFt`. Pierwszy i ostatni zostają ZAWSZE - to granice nagrania.
 *
 * Implementacja iteracyjna, nie rekurencyjna, z tego samego powodu co w `simplify.ts`:
 * rekurencja na dziesiątkach tysięcy punktów przepełnia stos na telefonie.
 *
 * Wejście musi być posortowane rosnąco po czasie.
 */
export function simplifyProfile(
  samples: readonly ProfileSample[],
  toleranceFt: number = DEFAULT_PROFILE_TOLERANCE_FT,
): ProfileSample[] {
  if (samples.length <= 2) return [...samples];

  const keep = new Array<boolean>(samples.length).fill(false);
  keep[0] = true;
  keep[samples.length - 1] = true;

  const stack: Array<[number, number]> = [[0, samples.length - 1]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (range == null) break;
    const [first, last] = range;
    if (last <= first + 1) continue;

    const start = samples[first]!;
    const end = samples[last]!;
    const spanMs = end.time - start.time;

    let maxDeviation = -1;
    let maxIndex = first;

    for (let i = first + 1; i < last; i++) {
      const sample = samples[i]!;
      // Cięciwa zdegenerowana do pionu (dwa odczyty w tej samej milisekundzie) -
      // odniesieniem zostaje wysokość początku, bo interpolacja nie ma po czym biec.
      const expected =
        spanMs === 0
          ? start.altitudeFt
          : start.altitudeFt +
            ((end.altitudeFt - start.altitudeFt) * (sample.time - start.time)) / spanMs;

      const deviation = Math.abs(sample.altitudeFt - expected);
      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        maxIndex = i;
      }
    }

    if (maxDeviation > toleranceFt) {
      keep[maxIndex] = true;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  return samples.filter((_, i) => keep[i]);
}
