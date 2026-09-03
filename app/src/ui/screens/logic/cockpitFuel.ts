/**
 * UZ Aero - paliwo na ekranie 04: JEDNO miejsce na litry (decyzja 2026-08-10).
 *
 * Kokpit ground mówił o paliwie dwa razy: pasek-przyrząd („Paliwo · ostatni odczyt ·
 * 111 L") i podpis kafelka „Tankowanie" („Na pokładzie: 111 L"). Ta sama liczba w dwóch
 * miejscach nie jest redundancją nieszkodliwą - przy planowaniu paliwa każe pilotowi
 * sprawdzać, czy oba napisy się zgadzają.
 *
 * REGUŁA: pasek pojawia się WYŁĄCZNIE wtedy, gdy mówi coś więcej niż liczbę - czyli gdy
 * samolot ma normę zużycia z serwera i da się z niej policzyć wystarczalność. Wtedy jest
 * przyrządem: szacunek, ton ostrzeżenia (amber godzinę przed rezerwą, czerwony na
 * rezerwie) i adnotacja, że decyduje paliwomierz. Bez normy paska NIE MA, a litry niesie
 * kafelek. To ta sama zasada, którą `fuelNorm.ts` stosuje do samej normy: „bez normy ekran
 * MILCZY o normie" - pasek bez szacunku jest właśnie takim milczeniem, tylko na całą
 * szerokość ekranu.
 *
 * Konsekwencja, o którą łatwo się potknąć: podpis kafelka NIE MOŻE być stały. Gdy paska
 * nie ma, to on jest jedynym nośnikiem stanu zbiorników - także po tankowaniu, kiedy
 * „Dolane dziś" wyparłoby stan na pokładzie z całego ekranu.
 *
 * Skład ekranu zależy więc od danych z serwera i ten sam kokpit wygląda inaczej na dwie
 * maszyny. To świadoma cena: alternatywą było albo puste ostrzeżenie, albo powtórzona
 * liczba.
 */

import { litres } from '../../format';
import { enduranceLabel } from './fuelNorm';
import type { ConsumptionNorm } from '../../../domain';

export interface CockpitFuelView {
  /**
   * Pasek paliwa albo `null`, gdy nie miałby czym uzasadnić swojej obecności.
   *
   * Sama wartość FOB i ton zostają po stronie ekranu - bierze je z projekcji i z
   * `fuelTone`, tak samo jak przyrządy kokpitu w locie.
   */
  strip: { endurance: string; source: string } | null;
  /** Podpis kafelka „Tankowanie" - nigdy nie powtarza tego, co mówi pasek. */
  refuelSub: string;
}

export function buildCockpitFuel(input: {
  fobL: number | null;
  addedL: number;
  norm: ConsumptionNorm | null;
  /**
   * Silnik już pracował w tej operacji, więc litry są SZACUNKIEM (z normy, gdy
   * jest; bez niej nieaktualnym odczytem) - podpis dostaje „około" (uwaga
   * z urządzenia, 2026-09-03). Przed pierwszym uruchomieniem wartość jest
   * odczytem albo przekazaniem i „około" by ją podważało.
   */
  estimated: boolean;
}): CockpitFuelView {
  const endurance = enduranceLabel(input.fobL, input.norm);

  // `endurance` liczy się WYŁĄCZNIE z normy, więc drugi warunek jest tu dla typów,
  // nie dla logiki: bez normy nie ma szacunku i pasek nie ma czego pokazać.
  if (endurance != null && input.norm != null) {
    return {
      strip: {
        endurance,
        source: `szacunek z normy samolotu (${input.norm.windowDays} dni) - decyduje paliwomierz`,
      },
      // Litry mówi pasek, więc kafelek wraca do bycia przyciskiem: albo melduje dzisiejszą
      // dolewkę (fakt, którego pasek nie zna), albo zaprasza do akcji.
      refuelSub: input.addedL > 0 ? `Dolane dziś: ${litres(input.addedL)}` : 'Dolej i zapisz odczyt',
    };
  }

  const aboard = `Na pokładzie:${input.estimated ? ' około' : ''} ${litres(input.fobL)}`;
  return {
    strip: null,
    refuelSub: input.addedL > 0 ? `${aboard} · dolane ${litres(input.addedL)}` : aboard,
  };
}
