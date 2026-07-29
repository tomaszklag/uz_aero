/**
 * UZ Aero — automat detekcji startu i lądowania z GPS (§3.3).
 *
 * CZYSTA DOMENA: żadnego `expo-location`, żadnych timerów, żadnego Reacta. Dostaje
 * kolejne fixy i zwraca nowy stan + ewentualną detekcję. Dzięki temu cały algorytm —
 * łącznie z przypadkami brzegowymi, które w powietrzu trafiają się raz na sto lotów —
 * testujemy w Node w milisekundach.
 *
 * ZASADA NADRZĘDNA: detekcja **nie zapisuje zdarzenia**. Zwraca sygnał, na podstawie
 * którego UI pokazuje toast z odliczaniem („COFNIJ", §3.2); dopiero po jego upływie
 * leci komenda. Dlatego automat nie wie nic o zdarzeniach ani o zapisie.
 *
 * Dlaczego warunki są takie, a nie prostsze (§3.3, §8 „znane ryzyka"):
 *  • START     — GS ponad próg **LUB** przyrost wysokości ponad próg. Alternatywa, bo
 *                start bywa widoczny najpierw w prędkości (rozbieg), a przy słabym
 *                fixie GS potrafi kłamać — wtedy ratuje wysokość.
 *  • LĄDOWANIE — GS poniżej progu **ORAZ** wysokość blisko elewacji lotniska. Koniunkcja,
 *                bo sam spadek GS to codzienność ciasnego zakrętu; dopiero razem
 *                z niską wysokością znaczy „jestem na ziemi".
 *  • Oba warunki muszą się **utrzymać** przez kilka sekund (odsiew szpilek GPS),
 *    a po detekcji obowiązuje histereza (cooldown), żeby jedno zdarzenie nie odpaliło
 *    serii.
 */

import { GPS_THRESHOLDS, type GpsThresholds } from './thresholds';
import type { EpochMillis } from '../time';

/**
 * Odczyt GPS zredukowany do tego, czego potrzebuje algorytm.
 * `altitudeFt` bywa `null` — consumer-grade GPS gubi wysokość częściej niż pozycję.
 */
export interface GpsFix {
  /** Czas fixa (UTC, epoch ms) — zegar GPS, nie telefonu (§4.5). */
  time: EpochMillis;
  /** Prędkość względem ziemi (węzły). */
  groundSpeedKt: number;
  /** Wysokość (stopy AMSL); null gdy fix bez wysokości. */
  altitudeFt: number | null;
  /** Pozycja i dokładność — diagnostyka GPS (ekran 13); detektor ich nie czyta. */
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
}

/** Faza lotu z punktu widzenia detektora (nie mylić z fazą wyświetlaną w kokpicie). */
export type DetectorPhase = 'ground' | 'airborne';

/** Co detektor wykrył w tym kroku (null = nic). */
/**
 * `taxi` jest w tej unii, bo automat naprawdę je wykrywa — ale UI traktuje je inaczej:
 * start i lądowanie przechodzą przez okno „COFNIJ", kołowanie zapisuje się od razu.
 * Ta różnica to polityka interfejsu (fałszywy start psuje czas lotu, fałszywe kołowanie
 * dodaje wiersz w logu), więc mieszka w `useFlightDetection`, nie tutaj.
 */
export type Detection = 'taxi' | 'takeoff' | 'landing';

export interface DetectorState {
  phase: DetectorPhase;
  /**
   * Czy w bieżącym locie odnotowano już rozpoczęcie kołowania.
   *
   * Zeruje się przy starcie (kolejne kołowanie będzie dopiero po lądowaniu) i przy
   * lądowaniu (samolot kołuje z powrotem). Bez tej flagi każdy fix na ziemi z prędkością
   * ponad progiem produkowałby nowe zdarzenie — a kołowanie ma być JEDNYM wpisem
   * otwierającym lot, tak jak w mockupie 05.
   */
  taxiing: boolean;
  /** Od kiedy nieprzerwanie trzyma się warunek kołowania (osobny tor niż start/lądowanie). */
  taxiCandidateSince: EpochMillis | null;
  /**
   * Elewacja lotniska = wysokość GPS w chwili ENGINE START (§3.3, §8 mitygacja).
   * Null, gdy przy starcie silnika nie było fixa z wysokością.
   */
  fieldElevationFt: number | null;
  /** Od kiedy nieprzerwanie trzyma się warunek detekcji (null = nie trzyma się). */
  candidateSince: EpochMillis | null;
  /** Do kiedy ignorujemy detekcje (histereza po poprzedniej). */
  cooldownUntil: EpochMillis | null;
  /** Czas ostatniego przetworzonego fixa — do wykrywania przerw w sygnale. */
  lastFixAt: EpochMillis | null;
}

export interface DetectorStep {
  state: DetectorState;
  /** Detekcja w tym kroku — UI ma pokazać toast z możliwością cofnięcia. */
  detection: Detection | null;
}

/**
 * Maksymalna przerwa między fixami, przy której wciąż wierzymy, że warunek „trwał".
 *
 * Nie ma tego w §3.3, ale bez tego algorytm jest podatny na fałszywkę: GPS milknie na
 * minutę, wraca ze spełnionym warunkiem, a licznik „utrzymania" nadal wskazuje moment
 * sprzed przerwy — detekcja odpala natychmiast, choć nikt nie obserwował tego, co działo
 * się w międzyczasie. Przerwa dłuższa niż próg zeruje kandydata.
 */
export const MAX_FIX_GAP_SEC = 10;

/** Stan początkowy — zwykle tworzony przy ENGINE START, z elewacją lotniska. */
export function createDetectorState(fieldElevationFt: number | null = null): DetectorState {
  return {
    phase: 'ground',
    taxiing: false,
    taxiCandidateSince: null,
    fieldElevationFt,
    candidateSince: null,
    cooldownUntil: null,
    lastFixAt: null,
  };
}

/** Wysokość nad lotniskiem; null gdy brakuje którejkolwiek składowej. */
function heightAboveField(fix: GpsFix, state: DetectorState): number | null {
  if (fix.altitudeFt == null || state.fieldElevationFt == null) return null;
  return fix.altitudeFt - state.fieldElevationFt;
}

/** Warunek startu: rozpędzony LUB wzniesiony ponad lotnisko. */
function takeoffConditionMet(fix: GpsFix, state: DetectorState, t: GpsThresholds): boolean {
  if (fix.groundSpeedKt > t.TAKEOFF_SPEED_KT) return true;
  const agl = heightAboveField(fix, state);
  return agl != null && agl > t.TAKEOFF_ALT_DIFF_FT;
}

/**
 * Warunek lądowania: wolno ORAZ nisko.
 *
 * Gdy wysokości brak, świadomie **nie wykrywamy** lądowania — sam niski GS to za mało
 * (ciasny zakręt), a zmyślona detekcja kosztuje więcej niż jej brak: pilot ma ekran
 * wpisu ręcznego (05f) i toast korekty. Milczenie jest tu bezpieczniejsze od zgadywania.
 */
function landingConditionMet(fix: GpsFix, state: DetectorState, t: GpsThresholds): boolean {
  if (fix.groundSpeedKt >= t.LANDING_SPEED_KT) return false;
  const agl = heightAboveField(fix, state);
  return agl != null && agl < t.LANDING_ALT_DIFF_FT;
}

/**
 * Przetwarza jeden fix. Funkcja czysta: ten sam stan + ten sam fix = ten sam wynik.
 *
 * Kolejność decyzji ma znaczenie:
 *   1. fix z przeszłości → ignorujemy (zegar potrafi skoczyć wstecz);
 *   2. przerwa w sygnale → zerujemy kandydata (patrz `MAX_FIX_GAP_SEC`);
 *   3. cooldown → tylko odnotowujemy fix, żadnych detekcji;
 *   4. warunek fazy → utrzymanie przez wymagany czas → detekcja + zmiana fazy.
 */
export function stepDetector(
  state: DetectorState,
  fix: GpsFix,
  thresholds: GpsThresholds = GPS_THRESHOLDS,
): DetectorStep {
  // 1. Fix starszy niż ostatnio przetworzony — poza kolejnością, pomijamy.
  if (state.lastFixAt != null && fix.time < state.lastFixAt) {
    return { state, detection: null };
  }

  const gapSec = state.lastFixAt == null ? 0 : (fix.time - state.lastFixAt) / 1000;
  const signalBroken = gapSec > MAX_FIX_GAP_SEC;

  const next: DetectorState = {
    ...state,
    lastFixAt: fix.time,
    candidateSince: signalBroken ? null : state.candidateSince,
    taxiCandidateSince: signalBroken ? null : state.taxiCandidateSince,
  };

  // 3. Histereza po poprzedniej detekcji — dotyczy WYŁĄCZNIE zmian fazy.
  //
  //    Kołowanie fazy nie zmienia, więc histereza go nie blokuje: gdyby blokowała, wpis
  //    po lądowaniu spóźniałby się o pół minuty, a w mockupie 05 kołowanie zaczyna się
  //    dokładnie wtedy, gdy samolot zjeżdża z pasa („14:08 Landing", „14:08 Taxi").
  const inCooldown = next.cooldownUntil != null && fix.time < next.cooldownUntil;

  const conditionMet =
    !inCooldown &&
    (next.phase === 'ground'
      ? takeoffConditionMet(fix, next, thresholds)
      : landingConditionMet(fix, next, thresholds));

  if (conditionMet) {
    // Warunek spełniony — od kiedy?
    const since = next.candidateSince ?? fix.time;
    const heldSec = (fix.time - since) / 1000;
    const requiredSec =
      next.phase === 'ground' ? thresholds.TAKEOFF_CONFIRM_SEC : thresholds.LANDING_CONFIRM_SEC;

    if (heldSec < requiredSec) {
      return { state: { ...next, candidateSince: since }, detection: null };
    }
  } else {
    next.candidateSince = null;

    // 4. Kołowanie rozpatrujemy DOPIERO, gdy w tym kroku nie zaszła zmiana fazy.
    //
    //    Kolejność ma znaczenie: gdyby kołowanie było sprawdzane pierwsze, jego wykrycie
    //    kończyłoby krok i „zjadało" tick, w którym potwierdzał się start — start
    //    przesuwałby się o jeden fix. Poza tym wpis „ruszył kołować" w tej samej chwili,
    //    w której samolot się oderwał, byłby bez sensu.
    if (next.phase === 'ground' && !next.taxiing) {
      if (fix.groundSpeedKt >= thresholds.TAXI_SPEED_KT) {
        const taxiSince = next.taxiCandidateSince ?? fix.time;
        if ((fix.time - taxiSince) / 1000 >= thresholds.TAXI_CONFIRM_SEC) {
          return {
            state: { ...next, taxiing: true, taxiCandidateSince: null },
            detection: 'taxi',
          };
        }
        next.taxiCandidateSince = taxiSince;
      } else {
        next.taxiCandidateSince = null;
      }
    }

    return { state: next, detection: null };
  }

  // 4. Detekcja: zmiana fazy + histereza.
  const detection: Detection = next.phase === 'ground' ? 'takeoff' : 'landing';
  const cooldownSec =
    detection === 'takeoff'
      ? thresholds.COOLDOWN_AFTER_TAKEOFF_SEC
      : thresholds.COOLDOWN_AFTER_LANDING_SEC;

  return {
    state: {
      ...next,
      phase: detection === 'takeoff' ? 'airborne' : 'ground',
      // Start zamyka kołowanie tego lotu; lądowanie otwiera drogę do kolejnego —
      // samolot zjeżdża z pasa i kołuje z powrotem, co jest nowym wpisem.
      taxiing: false,
      taxiCandidateSince: null,
      candidateSince: null,
      cooldownUntil: fix.time + cooldownSec * 1000,
    },
    detection,
  };
}

/**
 * Przetwarza serię fixów (wygodne w testach i przy odtwarzaniu zapisu z lotu).
 * Zwraca stan końcowy i wszystkie detekcje wraz z czasem, w którym padły.
 */
export function runDetector(
  state: DetectorState,
  fixes: readonly GpsFix[],
  thresholds: GpsThresholds = GPS_THRESHOLDS,
): { state: DetectorState; detections: { at: EpochMillis; detection: Detection }[] } {
  let current = state;
  const detections: { at: EpochMillis; detection: Detection }[] = [];

  for (const fix of fixes) {
    const step = stepDetector(current, fix, thresholds);
    current = step.state;
    if (step.detection) detections.push({ at: fix.time, detection: step.detection });
  }

  return { state: current, detections };
}
