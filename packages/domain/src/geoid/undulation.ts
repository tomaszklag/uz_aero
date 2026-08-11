/**
 * UZ Aero — undulacja geoidy EGM96 dla pozycji z GPS.
 *
 * Publiczne API korekty elipsoida→AMSL: adapter GPS aplikacji
 * (`app/src/infrastructure/gps/locationToFix.ts`) odejmuje tę wartość od wysokości
 * elipsoidalnej Androida i dopiero wynik wchodzi do domeny jako `altitudeFt`.
 * Domena dostarcza wyłącznie czystą funkcję — sama korekta mieszka w adapterze,
 * bo dotyczy UKŁADU ODNIESIENIA platformy, a nagrane ślady (`server/traces/`)
 * nie mogą dostać jej drugi raz przy odtwarzaniu.
 *
 * Pokrycie wkompilowanej siatki: Europa z zapasem na przeloty (patrz `egm96Grid.ts`).
 * Poza pokryciem `null` — wtedy wysokość zostaje bez korekty (uczciwa degradacja,
 * nie ekstrapolowana zmyślona wartość).
 */

import type { LatLon } from '../detection/geo';
import { EGM96_GRID } from './egm96Grid';
import { bilinearUndulationM } from './grid';

/** Undulacja geoidy EGM96 (metry) albo `null` poza pokryciem wkompilowanej siatki. */
export function geoidUndulationM(point: LatLon): number | null {
  return bilinearUndulationM(EGM96_GRID, point);
}
