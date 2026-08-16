/**
 * UZ Aero — DROGA PRZEBYTA DO DANEJ CHWILI (issue #47, trzecia tura przeglądu).
 *
 * Profil ma oś CZASU, więc podziałka mówi „15 min". Pilot pyta jednak też o dystans —
 * a ten na osi czasu NIE JEST proporcjonalny: pięć minut wznoszenia po 70 kt to inna
 * droga niż pięć minut przelotu po 110 kt, a pięć minut postoju to zero.
 *
 * Dlatego nie liczymy „ile NM na piksel" (byłaby to średnia udająca skalę), tylko
 * podajemy drogę DLA KONKRETNEJ PARY CHWIL — tej, którą akurat obejmuje pasek podziałki
 * w miejscu, w którym stoi. Wynik jest wtedy faktem o tym locie, a nie przybliżeniem:
 * przesunięcie wykresu zmienia liczbę, bo w innym miejscu lotu samolot leciał inaczej.
 */

import { distanceNm, type TrackVertex } from '../../../domain';

/** Droga narastająco od początku nagrania; `null` = poza zakresem albo brak śladu. */
export type DistanceLookup = (at: number) => number | null;

/**
 * Buduje odczyt drogi z geometrii śladu.
 *
 * Między wierzchołkami interpolujemy LINIOWO po czasie. To przybliżenie tylko wewnątrz
 * jednego odcinka uproszczonej linii — a te są krótkie, bo RDP zostawia wierzchołki
 * tam, gdzie trasa zmienia kształt.
 */
export function buildDistanceLookup(line: readonly TrackVertex[]): DistanceLookup {
  if (line.length < 2) return () => null;

  // Droga narastająco — liczona raz, przy budowie odczytu.
  const cumulative: number[] = new Array(line.length);
  cumulative[0] = 0;
  for (let i = 1; i < line.length; i++) {
    cumulative[i] =
      cumulative[i - 1]! +
      distanceNm(
        { lat: line[i - 1]!.lat, lon: line[i - 1]!.lon },
        { lat: line[i]!.lat, lon: line[i]!.lon },
      );
  }

  const first = line[0]!;
  const last = line[line.length - 1]!;

  return (at: number): number | null => {
    if (at <= first.time) return 0;
    if (at >= last.time) return cumulative[cumulative.length - 1]!;

    // Wyszukiwanie binarne: odczyt woła się przy każdej klatce gestu, a linia ma
    // kilkaset wierzchołków.
    let low = 0;
    let high = line.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (line[mid]!.time <= at) low = mid;
      else high = mid;
    }

    const span = line[high]!.time - line[low]!.time;
    if (span <= 0) return cumulative[low]!;

    const ratio = (at - line[low]!.time) / span;
    return cumulative[low]! + (cumulative[high]! - cumulative[low]!) * ratio;
  };
}
