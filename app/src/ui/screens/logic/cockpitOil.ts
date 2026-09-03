/**
 * UZ Aero - podpis kafelka „Dolej olej" w kokpicie (mockupy 04/04a).
 *
 * Przed pierwszym uruchomieniem podpis niesie STAN silnika (pomiar z przejęcia
 * + dolewki) - „W silniku 9,2 L", jak „Na pokładzie" przy paliwie. Po biegu
 * silnika stan jest już tylko SZACUNKIEM (uwaga z urządzenia, 2026-09-03:
 * „jak silnik został uruchomiony, to mamy tylko szacunki - «W silniku około»,
 * i co jakiś czas odświeżamy wartości"): od zapisu odejmujemy zużycie z normy
 * oleju (stawka na godzinę PRACY SILNIKA, issue #66 c.d.) za czas biegu -
 * `now` z tickera kokpitu, więc liczba spada w trakcie pracy silnika.
 *
 * Bez normy oleju zostaje sam zapis z dopiskiem „około" - „około" mówi wtedy
 * o niepewności bez rachunku (spalone nieznane), a liczby nie zmyślamy.
 * Bez pomiaru w strumieniu (stary zapis) - nazwa medium, bez liczby.
 */

import { oilLitres } from '../../format';

export function cockpitOilSub(input: {
  /** Pomiar z przejęcia + dolewki (projekcja); `null` = brak pomiaru w strumieniu. */
  afterL: number | null;
  /** Norma zużycia oleju (L na godzinę pracy silnika); `null` = brak w konfiguracji. */
  ratePerH: number | null;
  /** Czas pracy silnika w operacji (ms) - do „teraz" z tickera kokpitu. */
  engineMs: number;
  /** Silnik już pracował w tej operacji (także: pracuje teraz). */
  engineRan: boolean;
}): string {
  if (input.afterL == null) return 'Olej silnikowy';
  if (!input.engineRan) return `W silniku ${oilLitres(input.afterL)}`;

  const burned = input.ratePerH != null ? (input.ratePerH * input.engineMs) / 3_600_000 : 0;
  // Do dziesiątych, jak każda liczba oleju; podłoga 0 - silnik nie ma ujemnego oleju.
  const estimated = Math.max(0, Math.round((input.afterL - burned) * 10) / 10);
  return `W silniku około ${oilLitres(estimated)}`;
}
