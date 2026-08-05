/**
 * UZ Aero — deklinacja magnetyczna i przeliczanie kursów na magnetyczne.
 *
 * PO CO: w lotnictwie kurs bez oznaczenia jest MAGNETYCZNY — tak są opisane progi pasów,
 * tak podaje je wieża i tak czyta je pilot z busoli. Nasze dane źródłowe (OurAirports,
 * geometria OpenStreetMap) są geograficzne, więc różnią się od tego, co pilot widzi na
 * tabliczce, o kilka stopni. Katalog zostaje geograficzny, bo mapa śladu rysuje pasy na
 * siatce zorientowanej na północ geograficzną; przeliczamy dopiero PRZY WYŚWIETLANIU.
 *
 * MODEL: liniowe przybliżenie IGRF dla obszaru Polski, epoka 2026. Deklinacja rośnie
 * ku wschodowi i północnemu wschodowi — od ~+4,5° przy granicy zachodniej do ~+8,5°
 * na Suwalszczyźnie. Reszta po dopasowaniu mieści się poniżej 1°, czyli poniżej
 * rozdzielczości, z jaką cokolwiek tu pokazujemy.
 *
 * OGRANICZENIA, świadome:
 * - Model obowiązuje W POLSCE. Katalog jest wyłącznie polski (`EP**`), więc innych
 *   punktów tu nie ma; gdyby kiedyś były, ta funkcja przestaje być właściwym narzędziem.
 * - Deklinacja dryfuje o ~+0,1°/rok. Po kilku latach warto odświeżyć stałe — do tego
 *   czasu błąd zostaje poniżej stopnia, a to i tak mniej niż niepewność kursu liczonego
 *   z geometrii pasa.
 * - To NIE jest źródło do nawigacji. Służy do podpisu „pas 060°" przy podpowiedzi
 *   lotniska, żeby liczba zgadzała się z oznaczeniem progu.
 */

import type { LatLon } from './detection/geo';

/** Deklinacja w środku obszaru (52°N, 19°E) dla epoki modelu. */
const BASE_DEG = 6.3;
const BASE_LAT = 52;
const BASE_LON = 19;

/** Przyrost na stopień długości geograficznej (ku wschodowi). */
const PER_LON_DEG = 0.35;
/** Przyrost na stopień szerokości geograficznej (ku północy). */
const PER_LAT_DEG = 0.2;

/**
 * Deklinacja magnetyczna w danym punkcie (stopnie; dodatnia = wschodnia).
 *
 * Wschodnia deklinacja znaczy, że północ magnetyczna leży NA WSCHÓD od geograficznej,
 * więc kurs magnetyczny jest o tyle MNIEJSZY od geograficznego.
 */
export function magneticDeclinationDeg(point: LatLon): number {
  return (
    BASE_DEG + PER_LON_DEG * (point.lon - BASE_LON) + PER_LAT_DEG * (point.lat - BASE_LAT)
  );
}

/** Kurs magnetyczny z geograficznego, zaokrąglony do stopnia i sprowadzony do 0–359. */
export function toMagneticDeg(trueDeg: number, point: LatLon): number {
  const magnetic = trueDeg - magneticDeclinationDeg(point);
  return ((Math.round(magnetic) % 360) + 360) % 360;
}
