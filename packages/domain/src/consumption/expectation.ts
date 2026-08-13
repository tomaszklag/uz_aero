/**
 * UZ Aero — ile TA sesja POWINNA była spalić i o ile powinien pójść licznik (issue #38).
 *
 * ══ PYTANIE, NA KTÓRE TO ODPOWIADA ══
 * „Wpisałem 27 litrów i +1:35 na liczniku — czy to normalne dla tej maszyny po TAKIM
 * locie?" Do issue #38 ekran 10 odpowiadał na pytanie o jedną trzecią węższe: porównywał
 * L/h sesji z pasmem blokowym samolotu, czyli z liczbą policzoną na innej mieszance faz.
 * Sesja z długim kołowaniem wychodziła wtedy „poniżej normy" bez żadnego powodu poza
 * proporcją ziemi do powietrza, a motogodziny nie miały normy w ogóle — ekran twierdził
 * po prostu, że ΔMH równa się czasowi blokowemu (czemu `mhModel.ts` wprost zaprzecza).
 *
 * ══ JEDNO RÓWNANIE, DWIE WIELKOŚCI ══
 * Paliwo i motogodziny liczą się TĄ SAMĄ formułą — `wielkość = k_lot·t_lot + k_ziemia·t_ziemia`
 * — bo opisują to samo zjawisko: silnik pracuje inaczej w powietrzu niż na wolnych
 * obrotach. Stąd wspólny typ wyniku i wspólny werdykt; ekran ma dzięki temu jedną formę
 * prezentacji dla obu (issue #38 pkt 5), a nie dwie przypadkowo różne.
 *
 * ══ PASMO Z OBSERWACJI, NIE Z PRZEDZIAŁU UFNOŚCI ══
 * Reguła przeniesiona wprost z `summary.ts` i obowiązuje tu tak samo: pytamy „czy wynik
 * mieści się w tym, co ta maszyna zwykle pokazuje", a nie „jak dokładnie znamy stawkę".
 * Pasmo bierze się więc z rozrzutu ilorazów fakt/model w oknie (`ratio.ts`), a nie
 * z przedziałów regresji. Do tego dolna granica z `policy.ts`: przy danych bez szumu
 * rozrzut schodzi do zera i werdykt zapalałby się na błędzie odczytu przyrządu.
 */

import type { ConsumptionNorm } from '../reference';
import { FUEL_BAND_FLOOR_L, HOUR_MS, MH_BAND_FLOOR_H } from './policy';

/**
 * Czasy jednej sesji — wejście przewidywania.
 *
 * Bierzemy CZAS BLOKOWY i czas w powietrzu, a ziemię liczymy sami, bo to jedyny sposób,
 * żeby ujemna ziemia nie weszła do równania. Czas lotu większy niż czas pracy silnika
 * jest niemożliwy fizycznie i znaczy rozjazd w rejestrze (ręczny wpis nachodzący na
 * bieg silnika) — ten sam przypadek, który `buildMhEquation` oznacza jako `clamped`.
 */
export interface SessionPhaseTimes {
  /** Czas pracy silnika: uruchomienie → zatrzymanie (ms). */
  blockMs: number;
  /** Czas w powietrzu: suma lotów sesji (ms). */
  flightMs: number;
}

/** Na czym stoi przewidywanie — ekran mówi to wprost, bo to zmienia jego wiarygodność. */
export type ExpectationBasis =
  /** Rozdzielone fazy: osobna stawka na ziemi i w powietrzu. */
  | 'phases'
  /** Sama godzina pracy silnika — model nie rozdzielił faz, pasmo z centyli okna. */
  | 'engine';

/** Przewidywanie razem z pasmem, w którym wynik uznajemy za normalny. */
export interface Expectation {
  value: number;
  low: number;
  high: number;
  basis: ExpectationBasis;
}

/** Werdykt porównania wyniku sesji z pasmem oczekiwania. */
export type NormVerdict = 'w-normie' | 'powyzej' | 'ponizej';

/**
 * Ile paliwa POWINNA była spalić ta sesja.
 *
 * `null` = nie ma czego pokazać (brak normy albo silnik nie pracował) i ekran ma wtedy
 * MILCZEĆ — ta sama reguła, co w całym module normy.
 *
 * Schodzenie po drabinie modeli jest tu takie samo jak w `model.ts`: gdy stawek fazowych
 * nie ma (model zdegradowany do jednej fazy), przewidujemy z godziny pracy silnika
 * i pasma centylowego. To słabsza odpowiedź, ale uczciwa — i ekran ją rozpozna po `basis`.
 */
export function expectedFuelL(
  norm: ConsumptionNorm | null,
  times: SessionPhaseTimes,
): Expectation | null {
  if (norm == null) return null;
  const split = phaseHours(times);
  if (split == null) return null;

  if (norm.groundLPerH != null && norm.airLPerH != null) {
    const value = norm.airLPerH * split.flightH + norm.groundLPerH * split.groundH;
    return band(value, norm.fuelRatioLow, norm.fuelRatioHigh, FUEL_BAND_FLOOR_L, 'phases');
  }

  // Bez rozdzielonych faz zostaje stawka blokowa — wtedy pasmo bierzemy wprost z centyli
  // okna, bo to jest dokładnie to samo pytanie zadane o godzinę pracy silnika.
  const blockH = split.flightH + split.groundH;
  return withFloor(
    {
      value: norm.blockLPerH * blockH,
      low: norm.blockLPerHLow * blockH,
      high: norm.blockLPerHHigh * blockH,
      basis: 'engine',
    },
    FUEL_BAND_FLOOR_L,
  );
}

/**
 * O ile POWINIEN był pójść licznik motogodzin w tej sesji.
 *
 * `null`, gdy przeliczników nie ma — czyli gdy samolot nie uzbierał jeszcze pięciu
 * zdanych sesji (`MIN_PUBLISH_MH_DAYS`) albo dopasowanie nie przeszło bramki fizycznej.
 * Wtedy ekran nie orzeka o odczycie pilota w żaden sposób.
 */
export function expectedMhH(
  norm: ConsumptionNorm | null,
  times: SessionPhaseTimes,
): Expectation | null {
  if (norm?.mh == null) return null;
  const split = phaseHours(times);
  if (split == null) return null;

  const value = norm.mh.perFlightHour * split.flightH + norm.mh.perGroundHour * split.groundH;
  return band(value, norm.mh.ratioLow, norm.mh.ratioHigh, MH_BAND_FLOOR_H, 'phases');
}

/**
 * Werdykt: czy wynik mieści się w paśmie.
 *
 * Granice należą do pasma (porównania nieostre) — wynik dokładnie na krawędzi jest
 * jeszcze normalny. Przy pasmach ściągniętych do podłogi przyrządu (`policy.ts`) to nie
 * jest formalność: różnica jednej podziałki licznika trafia wtedy w krawędź co chwilę.
 */
export function expectationVerdict(actual: number, expectation: Expectation): NormVerdict {
  if (actual < expectation.low) return 'ponizej';
  if (actual > expectation.high) return 'powyzej';
  return 'w-normie';
}

/**
 * Czasy faz w godzinach; `null`, gdy silnik nie pracował.
 *
 * Ziemia przycinana do zera z tego samego powodu, co w `buildMhEquation`: ujemny czas
 * kołowania to nie dana do modelowania, tylko rozjazd rejestru.
 */
function phaseHours(times: SessionPhaseTimes): { flightH: number; groundH: number } | null {
  if (times.blockMs <= 0) return null;
  const flightMs = Math.max(0, Math.min(times.flightMs, times.blockMs));
  return {
    flightH: flightMs / HOUR_MS,
    groundH: (times.blockMs - flightMs) / HOUR_MS,
  };
}

/**
 * Pasmo wokół przewidywania: rozrzut obserwacji, ale nie węższe niż podziałka przyrządu.
 *
 * Brak rozrzutu (`null`) nie unieważnia przewidywania — zostaje sama podłoga, czyli
 * „tyle, ile wynosi błąd odczytu". Przewidywanie bez pasma byłoby gorsze: sugerowałoby
 * dokładność, której nie ma.
 */
function band(
  value: number,
  ratioLow: number | null,
  ratioHigh: number | null,
  floor: number,
  basis: ExpectationBasis,
): Expectation {
  return withFloor(
    {
      value,
      low: ratioLow != null ? value * ratioLow : value,
      high: ratioHigh != null ? value * ratioHigh : value,
      basis,
    },
    floor,
  );
}

/** Rozpycha pasmo do podziałki przyrządu i nie wypuszcza dolnej granicy poniżej zera. */
function withFloor(expectation: Expectation, floor: number): Expectation {
  return {
    ...expectation,
    low: Math.max(0, Math.min(expectation.low, expectation.value - floor)),
    high: Math.max(expectation.high, expectation.value + floor),
  };
}
