/**
 * UZ Aero - przelicznik motogodzin na godzinę zegara, wyznaczony z danych.
 *
 * ══ PROBLEM, KTÓRY TEN MODEL ROZWIĄZUJE ══
 * Przyrost licznika motogodzin w dniu NIE równa się czasowi blokowemu i nie ma prawa
 * się równać. Licznik obrotomierzowy zlicza obroty silnika przeliczone na godziny przy
 * obrotach znamionowych: w powietrzu silnik pracuje blisko nich (k ≈ 1), na ziemi na
 * wolnych obrotach (k ≈ 0,4). Dzień z długim kołowaniem daje więc ΔMH wyraźnie mniejszą
 * od bloku - i to jest poprawne działanie przyrządu, nie rozjazd danych.
 *
 * Model: `ΔMH_dnia = k_lot · t_lot + k_ziemia · t_ziemia`, jedno równanie na zamknięty
 * dzień. Niewiadome `k` są stałymi maszyny, więc identyfikuje je zmienność PROPORCJI faz
 * między dniami: dzień szkolny z dziesięcioma kręgami i dzień przelotowy to dwa bardzo
 * różne równania.
 *
 * ══ TYP LICZNIKA WYKRYWAMY, NIE KONFIGURUJEMY ══
 * `aircraft.mh_format` mówi, jak licznik WYŚWIETLA wartość (dziesiętnie czy hh:mm), a nie
 * jak ją zlicza. O tym drugim nikt w systemie nie wie - i nie ma potrzeby, żeby ktoś
 * wpisywał to ręcznie, skoro dane odpowiadają wprost: przelicznik bliski jedności w OBU
 * fazach to licznik godzinowy (Hobbs), wyraźnie niższy na ziemi to obrotomierzowy.
 * Rozstrzyga przedział ufności, a nie próg „na oko" - czyli ta sama liczba, którą i tak
 * pokazujemy na ekranie.
 */

import type { EpochMillis } from '../time';
import type { MhEquation } from './interval';
import { fitNonNegative } from './fit';
import { HOUR_MS, MIN_PUBLISH_MH_DAYS } from './policy';

/**
 * Poniżej tej różnicy przeliczniki uznajemy za NIEROZRÓŻNIALNE (0,05 MH na godzinę
 * zegara, czyli trzy minuty).
 *
 * Próg praktyczny obok statystycznego, dołożony po przebiegu na realnej historii
 * (2026-08-05). Przy danych wewnętrznie spójnych σ reszt schodzi do zera, więc przedziały
 * ufności też - i wtedy KAŻDA różnica staje się „istotna": model orzekał licznik
 * obrotomierzowy na podstawie 1,00 kontra 0,99. Statystyka miała rację (różnica jest
 * pewna), ale odpowiedź była bez sensu, bo trzy minuty na godzinę to nie jest różnica
 * między typami licznika, tylko szum odczytu z tarczy.
 */
const MH_MIN_DISTINGUISHABLE = 0.05;

/** Charakter licznika odczytany z danych. */
export type CounterKind =
  /** Godzinowy: chodzi 1:1 z zegarem, gdy silnik pracuje. */
  | 'hobbs'
  /** Obrotomierzowy: na ziemi przyrasta wolniej niż zegar. */
  | 'tach'
  /** Za mało danych albo przedziały nierozstrzygające - nie zgadujemy. */
  | 'unknown';

/** Jeden dzień w zestawieniu „fakt kontra model" (tabela na `A10a`). */
export interface MhFit {
  sessionUuid: string;
  dayStart: EpochMillis | null;
  flightMs: number;
  groundMs: number;
  /** Przyrost odczytany z licznika (godziny dziesiętne). */
  actualMh: number;
  /** Przyrost przewidziany przez model. */
  modelledMh: number;
  /** `actualMh − modelledMh`. */
  residualMh: number;
}

/** Przeliczniki motogodzin razem z tym, ile o nich wiadomo. */
export interface MhModel {
  published: boolean;
  kind: CounterKind;
  /** Motogodziny na godzinę zegara W LOCIE; `null` gdy model nieopublikowany. */
  perFlightHour: number | null;
  perFlightCi: number | null;
  /** Motogodziny na godzinę zegara NA ZIEMI (silnik pracuje, samolot nie leci). */
  perGroundHour: number | null;
  perGroundCi: number | null;
  /** Liczba dni, które weszły do dopasowania. */
  equations: number;
  /** Ile dni odrzucono jako niezdatne (brak pracy silnika, ujemny przyrost licznika). */
  rejected: number;
  residualSigmaH: number | null;
  rows: MhFit[];
}

/** Pusty model - brak danych albo brak dopasowania. */
export function emptyMhModel(rejected = 0): MhModel {
  return {
    published: false,
    kind: 'unknown',
    perFlightHour: null,
    perFlightCi: null,
    perGroundHour: null,
    perGroundCi: null,
    equations: 0,
    rejected,
    residualSigmaH: null,
    rows: [],
  };
}

/** Dopasowuje przeliczniki do zamkniętych dni samolotu. */
export function fitMhModel(equations: readonly MhEquation[]): MhModel {
  const usable = equations.filter(isUsableEquation);
  const rejected = equations.length - usable.length;
  if (usable.length === 0) return emptyMhModel(rejected);

  const a = usable.map((e) => [e.flightMs / HOUR_MS, e.groundMs / HOUR_MS]);
  const b = usable.map((e) => e.deltaMh);

  const fit = fitNonNegative(a, b);
  if (fit == null) return { ...emptyMhModel(rejected), equations: usable.length };

  const flight = fit.coefficients[0]!;
  const ground = fit.coefficients[1]!;

  const rows: MhFit[] = usable.map((equation, index) => {
    const modelledMh =
      flight.value * (equation.flightMs / HOUR_MS) +
      ground.value * (equation.groundMs / HOUR_MS);
    return {
      sessionUuid: equation.sessionUuid,
      dayStart: equation.dayStart,
      flightMs: equation.flightMs,
      groundMs: equation.groundMs,
      actualMh: equation.deltaMh,
      modelledMh,
      residualMh: equation.deltaMh - modelledMh,
    };
  });

  const published =
    usable.length >= MIN_PUBLISH_MH_DAYS && fit.degreesOfFreedom > 0 && trustworthy(flight, ground);

  return {
    published,
    kind: published ? classifyCounter(flight.value, flight.ciHalfWidth, ground.value, ground.ciHalfWidth) : 'unknown',
    perFlightHour: published ? flight.value : null,
    perFlightCi: published ? flight.ciHalfWidth : null,
    perGroundHour: published ? ground.value : null,
    perGroundCi: published ? ground.ciHalfWidth : null,
    equations: usable.length,
    rejected,
    residualSigmaH: fit.residualSigma,
    rows,
  };
}

/**
 * Dzień wchodzi do modelu, gdy silnik w ogóle pracował i licznik poszedł do przodu.
 *
 * Ujemny przyrost to nie jest przypadek do dopasowania - to rozjazd łańcucha odczytów,
 * którym zajmuje się flaga `mh_regression` (§4.5). Wpuszczony do regresji ciągnąłby
 * oba przeliczniki w dół i psuł liczby dla wszystkich pozostałych dni.
 */
function isUsableEquation(equation: MhEquation): boolean {
  if (equation.deltaMh <= 0) return false;
  return equation.flightMs > 0 || equation.groundMs > 0;
}

/**
 * Czy wynikowi wolno stanąć na ekranie - bramka FIZYCZNA.
 *
 * Przelicznik na ziemi wyższy niż w locie znaczyłby licznik chodzący szybciej na wolnych
 * obrotach. Taki nie istnieje - ani obrotomierzowy, ani godzinowy. Wynik, który to
 * twierdzi, jest artefaktem danych (rozjazd łańcucha odczytów, dzień z zapomnianym
 * wyłączeniem silnika), więc go NIE PUBLIKUJEMY. Znalezione przebiegiem po realnej
 * historii 2026-08-05: An-2 dawał „w locie 0,90, na ziemi 1,20" i model podawał to
 * jako fakt.
 *
 * ══ DLACZEGO TU NIE MA BRAMKI NA WSPÓŁLINIOWOŚĆ (a przy paliwie jest) ══
 * Bo ten model ma dwie niewiadome o ZNANEJ z góry relacji: `k_ziemia ≤ k_lot`. Warunek
 * wyżej wyczerpuje więc to, co bramka VIF miałaby tu wykryć, i robi to bez odrzucania
 * wyników użytecznych - pierwsza wersja z progiem VIF wycinała samolot o przedziałach
 * ±0,07 i ±0,14, czyli odpowiedź całkiem precyzyjną. Model paliwa ma do czterech faz
 * i relacji między nimi nie zna z góry, więc tam VIF zostaje jedyną obroną przed
 * podziałem wyznaczonym przez szum.
 *
 * Nadinterpretacji broni osobno `classifyCounter`: przy niepewnych danych przedziały się
 * nie rozejdą i typ licznika zostanie `unknown`, mimo opublikowanych wartości.
 */
function trustworthy(
  flight: { value: number },
  ground: { value: number },
): boolean {
  return ground.value <= flight.value + MH_MIN_DISTINGUISHABLE;
}

/**
 * Rozstrzyga typ licznika przedziałami ORAZ progiem praktycznym.
 *
 * `hobbs` - przeliczniki są nieodróżnialne od siebie i oba zgodne z jednością.
 * `tach`  - ziemia leży niżej niż lot i to NA TYLE, żeby różnica coś znaczyła:
 *           przedziały muszą się rozejść, a sama różnica przekroczyć
 *           `MH_MIN_DISTINGUISHABLE`. Sam rozjazd przedziałów nie wystarcza, bo przy
 *           danych bez szumu przedziały są zerowe i „istotna" robi się różnica 0,01.
 * `unknown` - wszystko inne. Milczenie jest tu odpowiedzią, nie brakiem odpowiedzi.
 */
function classifyCounter(
  flight: number,
  flightCi: number | null,
  ground: number,
  groundCi: number | null,
): CounterKind {
  if (flightCi == null || groundCi == null) return 'unknown';

  const difference = flight - ground;

  if (Math.abs(difference) < MH_MIN_DISTINGUISHABLE) {
    // Przeliczniki nierozróżnialne - licznik chodzi tak samo w obu fazach. To Hobbs,
    // o ile chodzi 1:1 z zegarem; inaczej mamy licznik o nieznanej charakterystyce.
    const nearOne = (value: number, ci: number) =>
      Math.abs(value - 1) <= Math.max(ci, MH_MIN_DISTINGUISHABLE);
    return nearOne(flight, flightCi) && nearOne(ground, groundCi) ? 'hobbs' : 'unknown';
  }

  const separated = ground + groundCi < flight - flightCi;
  return difference > 0 && separated ? 'tach' : 'unknown';
}
