/**
 * UZ Aero - STATYSTYKI ŚLADU (issue #47 pkt 3, mockup `design/14-slad.html`).
 *
 * Trzy bloki karty „Statystyki lotu" i nic ponadto: prędkość z pionem, czasy faz
 * i trzymanie wysokości w przelocie. To OPIS lotu, nie dokument - żadna z tych liczb
 * nie wchodzi do rejestru, do rozliczenia ani do normy zużycia. Dlatego stoją na
 * ekranie śladu, a nie na ekranie sesji.
 *
 * ══ CO JEST STĄD, A CO Z REJESTRU ══
 * Ślad wie „jak", rejestr wie „co i kiedy". Podział na ziemię i powietrze przychodzi
 * więc Z REJESTRU (`airborne` - starty i lądowania po korektach), a wszystko, co dzieje
 * się wewnątrz tych odcinków, liczy się z nagrania. Wysokość GPS na płycie potrafi
 * dryfować o kilkadziesiąt stóp, więc bez tego przecięcia postój przy pracującym
 * silniku produkowałby „wznoszenie" - ta sama pułapka, którą opisuje `phaseTimeline.ts`.
 *
 * ══ `null` ZNACZY „NIE MA CZEGO POKAZAĆ" ══
 * Każdy blok gaśnie osobno i ekran wtedy o nim MILCZY (reguła z issue #38). Nagranie
 * bez prędkości nie unieważnia czasów faz, a dzień skokowy prawie bez przelotu nie
 * unieważnia reszty - po prostu nie ma o czym orzekać.
 */

import { TAXI_MIN_KT } from '../detection/flightPhase';
import { percentile } from '../consumption/percentile';
import {
  mergeSpans,
  spanTimeInWindow,
  type ClosedSpan,
  type Span,
} from '../consumption/timeInPhase';
import {
  buildPhaseTimeline,
  phaseTimesInWindow,
  verticalSpeedSeries,
} from '../consumption/phaseTimeline';
import type { EpochMillis } from '../time';
import { isUsablePoint, type TrackPoint } from './point';

/**
 * Tolerancja „lotu równego" (stopy).
 *
 * 100 ft to działka wysokościomierza, w jakiej mówi się o utrzymaniu poziomu w szkoleniu
 * i na egzaminie praktycznym. Próg jest PREZENTACYJNY - nie wchodzi do żadnej reguły
 * domenowej ani do rozliczenia - więc wolno go zmienić bez kalibracji na nagraniach,
 * inaczej niż progi z `detection/thresholds.ts`.
 */
export const LEVEL_TOLERANCE_FT = 100;

/**
 * Poniżej tylu minut przelotu blok „trzymanie wysokości" znika w całości.
 *
 * Dzień skokowy to prawie samo wznoszenie i zniżanie - przelotu bywa w nim kilkadziesiąt
 * sekund, a pasmo wahań policzone z trzech odczytów wygląda jak wiedza i nią nie jest.
 */
export const LEVEL_MIN_CRUISE_MS = 120_000;

/**
 * Przerwa w przelocie, przez którą odcinki jeszcze SKLEJAMY (ms).
 *
 * Oś faz pracuje na oknie 10 s, bo od tego zależy przypisanie paliwa do fazy i lepiej,
 * żeby reagowała szybko. Trzymanie wysokości jest jednak pytaniem o MINUTY, nie
 * o sekundy: dwudziestosekundowa górka o 350 ft/min to wahnięcie w locie poziomym,
 * a nie wznoszenie z przelotem po obu stronach. Bez sklejania każdy taki bąbel dzielił
 * przelot na kawałki, a „najdłuższy równy odcinek" mierzył odstępy między turbulencjami.
 *
 * Reguła nie tworzy drugiej definicji fazy: odcinki nadal pochodzą z JEDNEJ osi
 * (`buildPhaseTimeline`), a scalanie tylko domyka w nich dziury. Konsekwencja jest
 * zamierzona i warto ją nazwać: lot falujący o ±300 ft w półtorej minuty to według osi
 * naprzemienne wznoszenie i zniżanie - i tak go pokaże blok czasów faz, zamiast
 * meldować „przelot z dużym pasmem".
 */
export const LEVEL_MERGE_GAP_MS = 60_000;

/**
 * Najdłuższa przerwa w nagraniu, przez którą wolno CAŁKOWAĆ (ms).
 *
 * Średnia prędkość i czas kołowania liczą się trapezami między sąsiednimi punktami.
 * Dziura po utracie fixa (tunel hangaru, zapchany odbiornik) nie jest odcinkiem
 * o znanej prędkości, więc jej nie wliczamy - reszta bilansu i tak domyka się czasem
 * biegu silnika.
 */
const MAX_INTEGRATION_GAP_MS = 60_000;

/** Prędkość i pion - pierwszy blok karty. */
export interface TrackSpeedStats {
  /** Największa prędkość względem ziemi (kt), po odsianiu pojedynczych szpilek. */
  maxGroundSpeedKt: number;
  /** Średnia W POWIETRZU, ważona czasem; `null` bez odczytów prędkości w locie. */
  averageInFlightKt: number | null;
  /** Największe wznoszenie i największe opadanie (ft/min, opadanie UJEMNE). */
  maxClimbFtPerMin: number | null;
  maxDescentFtPerMin: number | null;
}

/**
 * Czasy faz - drugi blok. Suma pięciu składników RÓWNA SIĘ czasowi biegu silnika,
 * bo pasek pod nimi rysuje proporcje i musi domykać się do całości.
 */
export interface TrackPhaseStats {
  /** Ziemia w ruchu (GS ≥ `TAXI_MIN_KT`). */
  taxiMs: number;
  /** Ziemia bez ruchu - tu trafia też czas, którego nagranie nie obejmuje. */
  standingMs: number;
  climbMs: number;
  cruiseMs: number;
  descentMs: number;
}

/** Trzymanie wysokości w przelocie - trzeci blok. */
export interface LevelFlightStats {
  /** Pasmo wahań wokół wysokości utrzymywanej (± stopy, centyl 90 odchyleń). */
  bandFt: number;
  /** Udział czasu przelotu spędzony w granicach `LEVEL_TOLERANCE_FT` (0–1). */
  withinToleranceRatio: number;
  /** Najdłuższy nieprzerwany odcinek w tolerancji (ms). */
  longestSteadyMs: number;
  /**
   * Ile trwał analizowany LOT POZIOMY - mianownik dwóch liczb wyżej.
   *
   * To NIE jest `cruiseMs` z bloku czasów faz i dlatego nazywa się inaczej: tam liczy się
   * czysty przelot z osi faz, tutaj odcinki sklejone przez krótkie wahnięcia
   * (`LEVEL_MERGE_GAP_MS`). Dwie liczby pod jedną nazwą różniłyby się na ekranie
   * o minutę i nie dałoby się powiedzieć, która kłamie.
   */
  levelMs: number;
}

export interface TrackStats {
  speed: TrackSpeedStats | null;
  phases: TrackPhaseStats | null;
  level: LevelFlightStats | null;
}

export interface TrackStatsInput {
  /**
   * Odcinki w powietrzu z REJESTRU (start → lądowanie), już po korektach.
   * Lot bez lądowania ma `to: null` i domyka się końcem okna.
   */
  airborne: readonly Span[];
  /** Okno biegu silnika: uruchomienie → wyłączenie. */
  engineFrom: EpochMillis;
  engineTo: EpochMillis;
}

export function emptyTrackStats(): TrackStats {
  return { speed: null, phases: null, level: null };
}

/**
 * Buduje komplet statystyk z punktów śladu po bramce jakości.
 *
 * @param points punkty CAŁEJ sesji (z odrzuconymi - odsiewamy je tutaj).
 */
export function buildTrackStats(
  points: readonly TrackPoint[],
  input: TrackStatsInput,
): TrackStats {
  const usable = points.filter(isUsablePoint).sort((a, b) => a.time - b.time);
  if (usable.length === 0) return emptyTrackStats();

  return {
    speed: speedStats(usable, input),
    phases: phaseStats(usable, input),
    level: levelStats(usable, input),
  };
}

/* ── prędkość i pion ───────────────────────────────────────────────────────── */

function speedStats(
  usable: readonly TrackPoint[],
  input: TrackStatsInput,
): TrackSpeedStats | null {
  const maxGroundSpeedKt = robustMaxGroundSpeed(usable);
  const averageInFlightKt = averageSpeedInFlight(usable, input);
  const vertical = verticalExtremes(usable, input);

  if (maxGroundSpeedKt == null && averageInFlightKt == null && vertical == null) return null;

  return {
    // Blok istnieje, gdy JEST prędkość - bez niej zostaje sam pion i wtedy nagłówek
    // „Prędkość i pion" kłamałby połową. Stąd maksimum jest polem wymaganym.
    maxGroundSpeedKt: maxGroundSpeedKt ?? 0,
    averageInFlightKt,
    maxClimbFtPerMin: vertical?.maxClimb ?? null,
    maxDescentFtPerMin: vertical?.maxDescent ?? null,
  };
}

/**
 * Maksimum prędkości odporne na pojedynczą szpilkę.
 *
 * Bramka jakości odrzuca odczyty fizycznie niemożliwe (`MAX_PLAUSIBLE_SPEED_KT`), ale
 * między „niemożliwe" a „prawdziwe" zostaje pas, w którym odbiornik potrafi raz strzelić
 * o 30 kt za wysoko. Dlatego maksimum bierzemy z mediany trójki: wartość musi się
 * potwierdzić w sąsiedztwie, żeby zostać rekordem lotu. Przy dwóch odczytach nie ma
 * czego potwierdzać i zostaje zwykłe maksimum.
 */
function robustMaxGroundSpeed(usable: readonly TrackPoint[]): number | null {
  const speeds = usable
    .map((point) => point.groundSpeedKt)
    .filter((speed): speed is number => speed != null);

  if (speeds.length === 0) return null;
  if (speeds.length < 3) return Math.max(...speeds);

  let best = -Infinity;
  for (let i = 1; i < speeds.length - 1; i++) {
    const median = [speeds[i - 1]!, speeds[i]!, speeds[i + 1]!].sort((a, b) => a - b)[1]!;
    if (median > best) best = median;
  }

  return best;
}

/** Średnia ważona czasem, liczona trapezami po odcinkach W POWIETRZU. */
function averageSpeedInFlight(
  usable: readonly TrackPoint[],
  input: TrackStatsInput,
): number | null {
  const airborne = closedAirborne(input);
  if (airborne.length === 0) return null;

  let weighted = 0;
  let totalMs = 0;

  for (let i = 1; i < usable.length; i++) {
    const previous = usable[i - 1]!;
    const current = usable[i]!;
    if (previous.groundSpeedKt == null || current.groundSpeedKt == null) continue;

    const dt = current.time - previous.time;
    if (dt <= 0 || dt > MAX_INTEGRATION_GAP_MS) continue;

    // Odcinek liczy się tylko w tej części, która wypadła w powietrzu - start dzieli
    // parę punktów na pół i przypisanie całej pary do lotu zawyżałoby średnią o kołowanie.
    const inFlight = spanTimeInWindow(airborne, previous.time, current.time);
    if (inFlight <= 0) continue;

    weighted += ((previous.groundSpeedKt + current.groundSpeedKt) / 2) * inFlight;
    totalMs += inFlight;
  }

  return totalMs > 0 ? weighted / totalMs : null;
}

/** Skrajne prędkości pionowe W POWIETRZU - z tej samej serii, co oś faz. */
function verticalExtremes(
  usable: readonly TrackPoint[],
  input: TrackStatsInput,
): { maxClimb: number | null; maxDescent: number | null } | null {
  const airborne = closedAirborne(input);
  if (airborne.length === 0) return null;

  let maxClimb: number | null = null;
  let maxDescent: number | null = null;

  for (const sample of verticalSpeedSeries(usable)) {
    if (sample.fpm == null) continue;
    if (!inAnySpan(airborne, sample.time)) continue;

    if (maxClimb == null || sample.fpm > maxClimb) maxClimb = sample.fpm;
    if (maxDescent == null || sample.fpm < maxDescent) maxDescent = sample.fpm;
  }

  // Regresja w oknie `VS_WINDOW_SEC` wygładza szum, ale przy locie bez ani jednego
  // wznoszenia zwróciłaby wartości wokół zera - i to jest prawda o takim locie,
  // więc nie zerujemy ich do `null`.
  if (maxClimb == null && maxDescent == null) return null;
  return { maxClimb, maxDescent };
}

/* ── czasy faz ─────────────────────────────────────────────────────────────── */

function phaseStats(
  usable: readonly TrackPoint[],
  input: TrackStatsInput,
): TrackPhaseStats | null {
  const engineMs = input.engineTo - input.engineFrom;
  if (engineMs <= 0) return null;

  const airborne = closedAirborne(input);
  const airborneMs = spanTimeInWindow(airborne, input.engineFrom, input.engineTo);
  const groundMs = Math.max(0, engineMs - airborneMs);

  const timeline = buildPhaseTimeline(usable);
  const times = phaseTimesInWindow(timeline, airborne, input.engineFrom, input.engineTo);

  const taxiMs = Math.min(groundMs, taxiTime(usable, airborne, input));

  return {
    taxiMs,
    // Reszta ziemi to POSTÓJ - także minuty, których nagranie nie obejmuje. Pasek
    // rysuje proporcje biegu silnika, więc musi się domykać do całości, a samolot,
    // o którym nic nie wiadomo, na pewno nie kołował.
    standingMs: Math.max(0, groundMs - taxiMs),
    climbMs: times.climbMs,
    cruiseMs: times.cruiseMs,
    descentMs: times.descentMs,
  };
}

/** Czas na ziemi w ruchu - trapezy poza odcinkami lotu, próg `TAXI_MIN_KT`. */
function taxiTime(
  usable: readonly TrackPoint[],
  airborne: readonly Span[],
  input: TrackStatsInput,
): number {
  let taxiMs = 0;

  for (let i = 1; i < usable.length; i++) {
    const previous = usable[i - 1]!;
    const current = usable[i]!;
    if (previous.groundSpeedKt == null || current.groundSpeedKt == null) continue;

    const dt = current.time - previous.time;
    if (dt <= 0 || dt > MAX_INTEGRATION_GAP_MS) continue;
    if ((previous.groundSpeedKt + current.groundSpeedKt) / 2 < TAXI_MIN_KT) continue;

    const from = Math.max(previous.time, input.engineFrom);
    const to = Math.min(current.time, input.engineTo);
    if (to <= from) continue;

    // Z odcinka odejmujemy część spędzoną w powietrzu - para punktów wokół startu
    // należy do obu stron i bez tego rozbiegówka liczyłaby się dwa razy.
    taxiMs += to - from - spanTimeInWindow(airborne, from, to);
  }

  return taxiMs;
}

/* ── trzymanie wysokości ───────────────────────────────────────────────────── */

/**
 * Wahania wysokości liczone WYŁĄCZNIE na odcinkach przelotowych.
 *
 * Na wznoszeniu zmiana wysokości nie jest wadą, tylko celem, więc wrzucenie jej do tej
 * samej puli dałoby „pasmo ± 6 000 ft" i liczbę bez żadnego znaczenia. Odniesieniem
 * jest MEDIANA odcinka, nie jego początek: pilot trzyma wysokość, na której się ustawił,
 * a nie tę, z którą wszedł w przelot.
 */
function levelStats(
  usable: readonly TrackPoint[],
  input: TrackStatsInput,
): LevelFlightStats | null {
  const airborne = closedAirborne(input);
  if (airborne.length === 0) return null;

  const timeline = buildPhaseTimeline(usable);
  const cruiseSpans: ClosedSpan[] = [];

  for (const segment of timeline) {
    if (segment.phase !== 'cruise') continue;
    const from = Math.max(segment.from, input.engineFrom);
    const to = Math.min(segment.to, input.engineTo);
    if (to > from && spanTimeInWindow(airborne, from, to) > 0) cruiseSpans.push({ from, to });
  }

  const spans = mergeWithinGap(mergeSpans(cruiseSpans), LEVEL_MERGE_GAP_MS);
  const levelMs = spans.reduce(
    (total, span) => total + spanTimeInWindow(airborne, span.from, span.to),
    0,
  );
  if (levelMs < LEVEL_MIN_CRUISE_MS) return null;

  const deviations: number[] = [];
  let steadyMs = 0;
  let longestSteadyMs = 0;
  let measuredMs = 0;

  for (const span of spans) {
    const samples = usable.filter(
      (point) =>
        point.altitudeFt != null &&
        point.time >= span.from &&
        point.time <= span.to &&
        inAnySpan(airborne, point.time),
    );
    if (samples.length < 2) continue;

    const reference = median(samples.map((point) => point.altitudeFt!));
    let run = 0;

    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1]!;
      const current = samples[i]!;
      const dt = current.time - previous.time;
      if (dt <= 0 || dt > MAX_INTEGRATION_GAP_MS) {
        run = 0;
        continue;
      }

      const deviation = Math.max(
        Math.abs(previous.altitudeFt! - reference),
        Math.abs(current.altitudeFt! - reference),
      );
      deviations.push(Math.abs(current.altitudeFt! - reference));
      measuredMs += dt;

      if (deviation <= LEVEL_TOLERANCE_FT) {
        run += dt;
        steadyMs += dt;
        if (run > longestSteadyMs) longestSteadyMs = run;
      } else {
        run = 0;
      }
    }
  }

  if (measuredMs === 0 || deviations.length === 0) return null;

  return {
    // Pasmo z ROZRZUTU OBSERWACJI, nie z wartości skrajnej: jeden fix odbiegający
    // o 400 ft opisuje odbiornik, a nie pilota (ta sama reguła, co pasmo normy
    // zużycia w `consumption/ratio.ts`).
    bandFt: percentile(deviations, 0.9) ?? 0,
    withinToleranceRatio: steadyMs / measuredMs,
    longestSteadyMs,
    levelMs,
  };
}

/* ── wspólne ───────────────────────────────────────────────────────────────── */

/** Odcinki lotu domknięte końcem okna - lot bez lądowania trwa do wyłączenia silnika. */
function closedAirborne(input: TrackStatsInput): ClosedSpan[] {
  const closed: ClosedSpan[] = [];
  for (const span of input.airborne) {
    const from = Math.max(span.from, input.engineFrom);
    const to = Math.min(span.to ?? input.engineTo, input.engineTo);
    if (to > from) closed.push({ from, to });
  }
  return mergeSpans(closed);
}

/** Skleja odcinki rozdzielone przerwą krótszą niż `gapMs`. Wejście posortowane. */
function mergeWithinGap(spans: readonly ClosedSpan[], gapMs: number): ClosedSpan[] {
  const merged: ClosedSpan[] = [];

  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last != null && span.from - last.to <= gapMs) {
      if (span.to > last.to) last.to = span.to;
    } else {
      merged.push({ from: span.from, to: span.to });
    }
  }

  return merged;
}

function inAnySpan(spans: readonly ClosedSpan[], at: EpochMillis): boolean {
  return spans.some((span) => at >= span.from && at <= span.to);
}

function median(values: readonly number[]): number {
  return percentile(values, 0.5) ?? 0;
}
