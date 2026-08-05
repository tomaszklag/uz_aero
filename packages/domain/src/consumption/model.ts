/**
 * UZ Aero — model zużycia paliwa per faza lotu.
 *
 * ══ CO TU SIĘ DZIEJE ══
 * Każdy przyjęty interwał daje równanie „zużycie = Σ stawka_fazy · czas_fazy". Stawek
 * szukamy regresją z więzem nieujemności (`fit.ts`), a niepewność wyniku jest częścią
 * odpowiedzi, nie dodatkiem — stawka bez przedziału nie ma prawa stanąć na ekranie.
 *
 * ══ DRABINA MODELI: OD SZCZEGÓŁU DO UCZCIWOŚCI ══
 * Fazy da się rozdzielić tylko wtedy, gdy występują w interwałach w RÓŻNYCH proporcjach.
 * Dzień skokowy wygląda co wyniesienie tak samo, więc wznoszenia od przelotu może się
 * nie dać odróżnić — i wtedy regresja nadal poda cztery liczby, tylko będą one podziałem
 * przypadkowym, z ogromnymi przedziałami. Zamiast to pokazać, schodzimy o szczebel:
 *
 *     ziemia · wznoszenie · przelot · zniżanie   (wymaga śladu GPS)
 *                      ↓
 *              ziemia · powietrze
 *                      ↓
 *                sam czas silnika
 *
 * Zejście jest DEKLAROWANE (`phaseSet`, `degradedBecause`), bo „nie umiemy rozdzielić
 * tych faz" jest wynikiem, a nie awarią do ukrycia.
 *
 * ══ INTERWAŁY BEZ ŚLADU NIE SĄ IMPUTOWANE ══
 * Interwał bez rozbicia lotu na fazy pionowe nie dostaje podziału „średnimi proporcjami" —
 * to byłoby wpisanie do danych czegoś, czego nikt nie zaobserwował. Model czterofazowy
 * liczy się WYŁĄCZNIE na interwałach ze śladem; `tracedIntervals` mówi, ilu wierszy
 * to dotyczy („89 / 96" na mockupie A10a).
 *
 * ══ ODSTAJĄCE WYKLUCZAMY, ALE POKAZUJEMY ══
 * Interwał z resztą ponad `OUTLIER_SIGMA` wypada z dopasowania i trafia na listę
 * z powodem. Zwykle jest śladem czegoś realnego — pomyłki w odczycie albo dolewki spoza
 * aplikacji — więc ukrycie go kosztowałoby dokładnie tę informację, dla której ten ekran
 * powstał.
 */

import { isUsableInterval, type FuelInterval } from './interval';
import { fitNonNegative, type Fit } from './fit';
import {
  HOUR_MS,
  MAX_RELATIVE_CI,
  MAX_VARIANCE_INFLATION,
  OUTLIER_SIGMA,
  publicationGate,
  type PublicationGate,
} from './policy';

/** Który zestaw faz udało się rozdzielić. */
export type PhaseSet = 'four' | 'two' | 'single';

/** Dlaczego model zszedł niżej niż zestaw czterofazowy. */
export type Degradation =
  /** Bez zejścia — model stoi na najbogatszym zestawie, jaki dane uniosły. */
  | 'none'
  /** Zbyt jednorodne interwały: przedziały szersze niż `MAX_RELATIVE_CI`. */
  | 'collinear'
  /** Za mało interwałów ze śladem GPS, żeby rozdzielić fazy pionowe. */
  | 'no-trace'
  /** Układ osobliwy — faz nie da się od siebie odróżnić w ogóle. */
  | 'singular';

/** Nazwa fazy w wyniku modelu. */
export type ConsumptionPhase = 'ground' | 'climb' | 'cruise' | 'descent' | 'air' | 'engine';

/** Stawka jednej fazy razem z tym, ile o niej wiadomo. */
export interface PhaseRate {
  phase: ConsumptionPhase;
  lPerH: number;
  /** Połowa szerokości przedziału 95%; `null` = brak stopni swobody. */
  ciHalfWidth: number | null;
  /** Stawka przypięta do zera przez więz — przedział czytamy jednostronnie („≤ …"). */
  pinned: boolean;
  /** Ile razy niepewność jest większa niż przy fazach idealnie rozdzielonych. */
  varianceInflation: number;
  /** Łączny czas tej fazy w oknie (ms) — wstęga podziału czasu na mockupie. */
  hoursInWindowMs: number;
}

/** Dopasowany model zużycia. */
export interface ConsumptionModel {
  published: boolean;
  gate: PublicationGate;
  phaseSet: PhaseSet;
  degradedBecause: Degradation;
  rates: PhaseRate[];
  /** Liczba równań, które weszły do dopasowania (po wykluczeniu odstających). */
  equations: number;
  degreesOfFreedom: number;
  /** Odchylenie reszt w litrach — nagłówkowa miara jakości dopasowania. */
  residualSigmaL: number | null;
  rSquaredUncentered: number | null;
  /** Interwały wykluczone jako odstające — z ustawionym `rejected: 'outlier'`. */
  outliers: FuelInterval[];
  /** Ile przyjętych interwałów ma pełny ślad GPS (mianownik: `gate.intervals`). */
  tracedIntervals: number;
}

/** Model, którego nie wolno opublikować — bramka niespełniona albo brak dopasowania. */
export function emptyConsumptionModel(
  gate: PublicationGate,
  degradedBecause: Degradation = 'none',
): ConsumptionModel {
  return {
    published: false,
    gate,
    phaseSet: 'single',
    degradedBecause,
    rates: [],
    equations: 0,
    degreesOfFreedom: 0,
    residualSigmaL: null,
    rSquaredUncentered: null,
    outliers: [],
    tracedIntervals: 0,
  };
}

/** Dopasowuje najbogatszy zestaw faz, jaki dane uniosą. */
export function fitConsumptionModel(intervals: readonly FuelInterval[]): ConsumptionModel {
  const accepted = intervals.filter(isUsableInterval);
  const gate = publicationGate(intervals);
  const traced = accepted.filter(hasTrace);

  if (!gate.published) return { ...emptyConsumptionModel(gate), tracedIntervals: traced.length };

  // Zejście po drabinie zapamiętuje POWÓD pierwszego niepowodzenia — administratora
  // interesuje, dlaczego nie widzi rozbicia na fazy lotu, a nie że ostatni szczebel wyszedł.
  let reason: Degradation = 'none';

  if (publicationGate(traced).published) {
    const four = attempt(traced, FOUR_PHASE);
    if (four != null) return finish(four, gate, 'four', 'none', traced.length);
    reason = 'collinear';
  } else if (traced.length < accepted.length) {
    reason = 'no-trace';
  }

  const two = attempt(accepted, TWO_PHASE);
  if (two != null) return finish(two, gate, 'two', reason, traced.length);

  // Zejście na JEDNĄ fazę ma zawsze ten sam powód — ziemi nie dało się odróżnić od
  // powietrza. Brak śladu GPS tłumaczy wyłącznie brak faz PIONOWYCH i przepisanie go
  // tutaj byłoby myleniem czytelnika: usunięcie plików śladu niczego by nie naprawiło.
  const single = attempt(accepted, SINGLE_PHASE);
  if (single != null) return finish(single, gate, 'single', 'collinear', traced.length);

  return { ...emptyConsumptionModel(gate, 'singular'), tracedIntervals: traced.length };
}

// ── zestawy faz ────────────────────────────────────────────────────────────────
// Każdy zestaw to lista kolumn: nazwa fazy + jak wyciągnąć jej czas z interwału.
// Czas podajemy w GODZINACH, żeby stawki wychodziły wprost w L/h.

interface PhaseColumn {
  phase: ConsumptionPhase;
  hours: (interval: FuelInterval) => number;
}

const FOUR_PHASE: PhaseColumn[] = [
  { phase: 'ground', hours: (i) => i.groundMs / HOUR_MS },
  { phase: 'climb', hours: (i) => (i.climbMs ?? 0) / HOUR_MS },
  { phase: 'cruise', hours: (i) => (i.cruiseMs ?? 0) / HOUR_MS },
  { phase: 'descent', hours: (i) => (i.descentMs ?? 0) / HOUR_MS },
];

const TWO_PHASE: PhaseColumn[] = [
  { phase: 'ground', hours: (i) => i.groundMs / HOUR_MS },
  { phase: 'air', hours: (i) => i.flightMs / HOUR_MS },
];

const SINGLE_PHASE: PhaseColumn[] = [
  { phase: 'engine', hours: (i) => i.engineMs / HOUR_MS },
];

/** Interwał z pełnym rozbiciem lotu na fazy pionowe (wymaga śladu GPS). */
function hasTrace(interval: FuelInterval): boolean {
  return interval.climbMs != null && interval.cruiseMs != null && interval.descentMs != null;
}

/** Wynik jednej próby dopasowania — razem z tym, co z niej wypadło. */
interface Attempt {
  fit: Fit;
  columns: PhaseColumn[];
  used: FuelInterval[];
  outliers: FuelInterval[];
}

/**
 * Dopasowuje zestaw faz i odrzuca odstające, po czym dopasowuje raz jeszcze.
 *
 * Jedna runda usuwania, nie pętla do zbieżności: każde kolejne przejście zawęża próbkę
 * do tego, co model już rozumie, i po kilku rundach zostawia dane sztucznie zgodne
 * z modelem. Jedna runda usuwa realne pomyłki odczytu i na tym poprzestaje.
 *
 * `null`, gdy układ jest osobliwy albo przedziały przekraczają `MAX_RELATIVE_CI` —
 * wtedy wywołujący schodzi na uboższy zestaw faz.
 */
function attempt(intervals: readonly FuelInterval[], columns: PhaseColumn[]): Attempt | null {
  const first = run(intervals, columns);
  if (first == null) return null;

  const outliers = findOutliers(intervals, first);
  if (outliers.length === 0) {
    return acceptable(first, columns)
      ? { fit: first, columns, used: [...intervals], outliers: [] }
      : null;
  }

  const kept = intervals.filter((interval) => !outliers.includes(interval));
  if (!publicationGate(kept).published) return null;

  const second = run(kept, columns);
  if (second == null || !acceptable(second, columns)) return null;

  return {
    fit: second,
    columns,
    used: kept,
    outliers: outliers.map((interval) => ({ ...interval, rejected: 'outlier' as const })),
  };
}

function run(intervals: readonly FuelInterval[], columns: PhaseColumn[]): Fit | null {
  const a = intervals.map((interval) => columns.map((column) => column.hours(interval)));
  const b = intervals.map((interval) => interval.consumedL);
  return fitNonNegative(a, b);
}

/**
 * Interwały, których model nie tłumaczy — reszta ponad `OUTLIER_SIGMA` odpornych odchyleń.
 *
 * ══ DLACZEGO MEDIANA, A NIE ODCHYLENIE STANDARDOWE (poprawka z testu) ══
 * Pierwsza wersja mierzyła rozrzut przez `residualSigma`, czyli pierwiastek z sumy
 * kwadratów reszt — i NIE ZNAJDOWAŁA odstających w ogóle. Powód jest wbudowany w metodę:
 * regresja przesuwa się w stronę punktu odstającego, a jego wielka reszta wchodzi do tej
 * samej sumy, z której liczymy próg. Przy siedmiu równaniach jeden błąd odczytu podnosił
 * σ tak, że sam mieścił się poniżej „trzech sigm". Zjawisko nazywa się maskowaniem
 * i jest tym groźniejsze, im mniejsza próbka — czyli dokładnie w naszym zakresie.
 *
 * Mediana odchyleń bezwzględnych (MAD) tego nie ma: pojedyncza wielka reszta nie rusza
 * mediany. Mnożnik 1,4826 skaluje MAD tak, żeby dla reszt o rozkładzie normalnym
 * odpowiadał odchyleniu standardowemu — dzięki temu próg `OUTLIER_SIGMA` znaczy to samo,
 * co znaczył.
 *
 * Gdy MAD wychodzi zero (ponad połowa reszt identyczna — dane bez szumu), wracamy do
 * `residualSigma`: przy zerowej skali odpornej każde odchylenie byłoby „nieskończenie
 * odstające", a to jest agresywność, na którą przy pięciu równaniach nie ma miejsca.
 */
function findOutliers(intervals: readonly FuelInterval[], fit: Fit): FuelInterval[] {
  const residuals = intervals.map((_, index) => fit.residuals[index] ?? 0);
  const center = median(residuals);
  const mad = median(residuals.map((residual) => Math.abs(residual - center)));

  const scale = mad > 0 ? 1.4826 * mad : (fit.residualSigma ?? 0);
  if (scale <= 0) return [];

  const limit = OUTLIER_SIGMA * scale;
  return intervals.filter((_, index) => Math.abs(residuals[index]! - center) > limit);
}

/** Mediana — przy parzystej liczbie próbek średnia dwóch środkowych. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

/**
 * Czy wynik nadaje się do pokazania — DWIE niezależne bramki.
 *
 * ══ 1. SZEROKOŚĆ PRZEDZIAŁU ══
 * Żadna stawka wolna nie może mieć przedziału szerszego niż `MAX_RELATIVE_CI` swojej
 * wartości. Ta bramka mówi, JAK DOKŁADNIE znamy stawkę przy tych danych, i jest
 * w jednostkach, które ekran i tak pokazuje.
 *
 * ══ 2. ROZDZIELNOŚĆ KOLUMN (dołożona 2026-08-05 po przebiegu na realnej historii) ══
 * Sam przedział NIE WYSTARCZA i kosztowało to konkretny błędny wynik: model podał
 * stawkę ziemi WYŻSZĄ niż stawkę lotu (52 vs 37 L/h dla Cessny 182), a przedziały
 * wyszły ±21% i ±14%, czyli poniżej progu. Dane były wewnętrznie spójne, więc σ reszt
 * było maleńkie — a iloczyn `σ · √VIF` bywa mały nawet przy VIF rzędu tysiąca.
 *
 * Przedział i VIF odpowiadają na różne pytania: pierwszy na „jak dokładnie", drugi na
 * „czy te dane w ogóle rozstrzygają ten podział". Model idealnie dopasowany do dni
 * o prawie stałej proporcji faz podaje podział DOWOLNY, nie wyznaczony — i tylko VIF
 * to widzi.
 */
function acceptable(fit: Fit, columns: PhaseColumn[]): boolean {
  // Jedna kolumna nie ma czego mylić z czym — zestaw jednofazowy przechodzi zawsze,
  // inaczej drabina nie miałaby ostatniego szczebla.
  if (columns.length === 1) return true;

  return fit.coefficients.every((coefficient) => {
    if (coefficient.pinned) return true;

    if (
      Number.isFinite(coefficient.varianceInflation) &&
      coefficient.varianceInflation > MAX_VARIANCE_INFLATION
    ) {
      return false;
    }

    if (coefficient.ciHalfWidth == null) return true; // brak stopni swobody — patrz `fit.ts`
    if (coefficient.value <= 0) return true;
    return coefficient.ciHalfWidth / coefficient.value <= MAX_RELATIVE_CI;
  });
}

/** Składa wynik próby w model gotowy dla warstwy aplikacji. */
function finish(
  attemptResult: Attempt,
  gate: PublicationGate,
  phaseSet: PhaseSet,
  degradedBecause: Degradation,
  tracedIntervals: number,
): ConsumptionModel {
  const { fit, columns, used, outliers } = attemptResult;

  const rates: PhaseRate[] = columns.map((column, index) => {
    const coefficient = fit.coefficients[index]!;
    return {
      phase: column.phase,
      lPerH: coefficient.value,
      ciHalfWidth: coefficient.ciHalfWidth,
      pinned: coefficient.pinned,
      varianceInflation: coefficient.varianceInflation,
      hoursInWindowMs: used.reduce((sum, interval) => sum + column.hours(interval) * HOUR_MS, 0),
    };
  });

  return {
    published: true,
    gate,
    phaseSet,
    degradedBecause,
    rates,
    equations: fit.equations,
    degreesOfFreedom: fit.degreesOfFreedom,
    residualSigmaL: fit.residualSigma,
    rSquaredUncentered: fit.rSquaredUncentered,
    outliers,
    tracedIntervals,
  };
}
