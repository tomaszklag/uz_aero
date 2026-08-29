/**
 * UZ Aero - siatka undulacji geoidy i czysta interpolacja dwuliniowa.
 *
 * PO CO: GPS na Androidzie podaje wysokość nad ELIPSOIDĄ WGS84, a lotnictwo mierzy
 * wysokości AMSL (nad geoidą, czyli poziomem morza). Różnica tych powierzchni -
 * undulacja geoidy - wynosi w Polsce ~30–40 m, więc surowa „wysokość GPS" rozjeżdża
 * się z elewacją lotniska o ~120 ft (zgłoszenie z EPNL 2026-08-11: elewacja 830 ft,
 * wskazanie ~950 ft). AMSL = wysokość elipsoidalna − undulacja.
 *
 * Ten moduł to sama GEOMETRIA (typ siatki + interpolacja); dane niesie wygenerowany
 * `egm96Grid.ts`, a publiczne API - `undulation.ts`. Rozbicie jest celowe: generator
 * (`scripts/geoid/`) waliduje pobraną siatkę światową DOKŁADNIE tą samą funkcją,
 * którą potem wykonuje aplikacja - wzorce NGA sprawdzają i dane, i interpolację.
 */

import type { LatLon } from '../detection/geo';

/** Prostokątna siatka undulacji: węzły co `stepDeg`, wiersz 0 = północna krawędź. */
export interface GeoidGrid {
  /** Szerokość geograficzna wiersza 0 (północna krawędź siatki). */
  northLatDeg: number;
  /** Długość geograficzna kolumny 0 (zachodnia krawędź siatki). */
  westLonDeg: number;
  /** Krok siatki w stopniach (jednakowy N-S i E-W). */
  stepDeg: number;
  rows: number;
  cols: number;
  /** Undulacja w CENTYMETRACH (całkowite), wiersz-major od północy, kolumny ku wschodowi. */
  valuesCm: readonly number[];
}

/**
 * Undulacja geoidy (metry) w punkcie - interpolacja dwuliniowa z czterech węzłów.
 *
 * Poza pokryciem siatki zwraca `null` - świadomie NIE ekstrapolujemy: zmyślona
 * korekta jest gorsza od jawnego jej braku (odbiorca zostawia wtedy wysokość bez
 * przeliczenia i mówi o tym w kontrakcie). Punkty na krawędziach, także dokładnie
 * na południowej i wschodniej, są WEWNĄTRZ pokrycia.
 */
export function bilinearUndulationM(grid: GeoidGrid, point: LatLon): number | null {
  const row = (grid.northLatDeg - point.lat) / grid.stepDeg;
  const col = (point.lon - grid.westLonDeg) / grid.stepDeg;
  if (!(row >= 0 && row <= grid.rows - 1 && col >= 0 && col <= grid.cols - 1)) return null;
  // Na południowej/wschodniej krawędzi indeks bazowy cofa się o 1, a ułamek rośnie
  // do 1 - bez tego punkt dokładnie na krawędzi czytałby węzły spoza tablicy.
  const i = Math.min(Math.floor(row), grid.rows - 2);
  const j = Math.min(Math.floor(col), grid.cols - 2);
  const t = row - i;
  const u = col - j;
  const nw = grid.valuesCm[i * grid.cols + j]!;
  const ne = grid.valuesCm[i * grid.cols + j + 1]!;
  const sw = grid.valuesCm[(i + 1) * grid.cols + j]!;
  const se = grid.valuesCm[(i + 1) * grid.cols + j + 1]!;
  const cm = (1 - t) * ((1 - u) * nw + u * ne) + t * ((1 - u) * sw + u * se);
  return cm / 100;
}
