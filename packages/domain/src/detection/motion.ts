/**
 * UZ Aero — „stoi czy jedzie": automat ruchu oparty na PRZEMIESZCZENIU.
 *
 * DLACZEGO OSOBNY TOR: wykrycie początku kołowania było najsłabszym punktem detekcji
 * i nie dało się go naprawić przesuwaniem progu prędkości. Prędkość chwilowa jest
 * w tym zakresie najgorszą dostępną wielkością — na granicy czułości dopplera i pod
 * filtrem static-hold odbiornika, który zaparkowanemu telefonowi wpisuje twarde zero.
 *
 * Pytanie „czy samolot ruszył ze stanowiska" jest z natury pytaniem o POŁOŻENIE, nie
 * o prędkość: dryf odbiornika stojącego w miejscu to kilka metrów, a samolot, który
 * ruszył, jest po pół minuty ponad sto metrów dalej. Ta sama informacja, kilka razy
 * lepszy kontrast.
 *
 * KOTWICA to centroid pozycji z postoju, nie pojedynczy fix — uśrednienie zjada dryf.
 * Odświeżamy ją, dopóki samolot jest bezspornie na stanowisku (w promieniu
 * `TAXI_ANCHOR_RADIUS_M`); gdy zacznie się oddalać, kotwica zostaje tam, gdzie stał,
 * bo inaczej goniłaby samolot i ruch nigdy nie przekroczyłby progu.
 *
 * Kanał prędkościowy zostaje jako wsparcie — dla fixów bez pozycji i dla ruszenia tak
 * energicznego, że próg prędkości pada wcześniej niż próg przemieszczenia.
 */

import { centroid, distanceM, type LatLon } from './geo';
import { fixPosition, type GpsFix } from './fix';
import { fixesInWindow, newestFix, type FixHistory } from './history';
import { groundSpeed } from './trends';
import { GPS_THRESHOLDS, type GpsThresholds } from './thresholds';
import type { EpochMillis } from '../time';

export interface MotionState {
  /** Pozycja odniesienia (centroid postoju); null dopóki nie ma pozycji z fixów. */
  anchor: LatLon | null;
  /** Czy samolot jest w ruchu. */
  moving: boolean;
  /** Od kiedy nieprzerwanie trzyma się warunek przemieszczeniowy (kanał główny). */
  moveCandidateSince: EpochMillis | null;
  /** Od kiedy nieprzerwanie trzyma się warunek prędkościowy (tor wsparcia). */
  speedCandidateSince: EpochMillis | null;
}

export function createMotionState(): MotionState {
  return { anchor: null, moving: false, moveCandidateSince: null, speedCandidateSince: null };
}

/**
 * Jeden krok automatu ruchu. Czysty: ten sam stan + ta sama historia = ten sam wynik.
 *
 * `signalBroken` przekazuje detektor: po przerwie w sygnale nie wolno „domknąć"
 * warunku prędkościowego z rozpędu, bo nikt nie obserwował, co działo się w środku.
 * Przemieszczenia to nie dotyczy — ono jest odporne z natury: jeśli po przerwie
 * samolot jest 200 m od stanowiska, to naprawdę tam jest.
 */
export function stepMotion(
  state: MotionState,
  history: FixHistory,
  signalBroken: boolean,
  t: GpsThresholds = GPS_THRESHOLDS,
): MotionState {
  const fix = newestFix(history);
  if (fix == null) return state;

  const here = fixPosition(fix);
  const next: MotionState = {
    ...state,
    moveCandidateSince: signalBroken ? null : state.moveCandidateSince,
    speedCandidateSince: signalBroken ? null : state.speedCandidateSince,
  };

  // ── kotwica ────────────────────────────────────────────────────────────────
  // Odświeżamy TYLKO na postoju i tylko dopóki jesteśmy przy niej — inaczej
  // centroid wędrowałby razem z kołującym samolotem.
  if (!next.moving && here != null) {
    const nearAnchor = next.anchor == null || distanceM(here, next.anchor) <= t.TAXI_ANCHOR_RADIUS_M;
    if (nearAnchor) {
      const window = fixesInWindow(history, t.ANCHOR_WINDOW_SEC);
      const positions = window
        .map(fixPosition)
        .filter((p): p is LatLon => p != null);
      next.anchor = centroid(positions) ?? next.anchor;
    }
  }

  const speed = groundSpeed(fixesInWindow(history, t.SPEED_WINDOW_SEC));

  if (!next.moving) {
    // Kanał główny: oddalenie od kotwicy ponad próg. Dwa zabezpieczenia dopisane po
    // zgłoszeniu z terenu (2026-08-04: telefon odłożony na stole „kołował"):
    //
    //  • próg POWIĘKSZONY o deklarowaną niepewność fixa — bramka jakości wpuszcza
    //    dokładność do 50 m, a próg ruchu to 25 m, więc pojedynczy słaby fix umiał
    //    „przenieść" odbiornik za próg; fix przyznający się do ±40 m nie może
    //    dowodzić ruchu o 25 m,
    //  • warunek musi się UTRZYMAĆ przez okno potwierdzenia — odskok multipathu
    //    wraca do kotwicy po paru sekundach, prawdziwe kołowanie tylko się oddala.
    //    Późniejsze potwierdzenie nic nie kosztuje: do rejestru idzie moment
    //    retro-datowany (`taxiOnset`), nie moment decyzji.
    if (here != null && next.anchor != null) {
      const marginM = fix.accuracyM ?? 0;
      if (distanceM(here, next.anchor) > t.TAXI_DISPLACEMENT_M + marginM) {
        const since = next.moveCandidateSince ?? fix.time;
        if ((fix.time - since) / 1000 >= t.TAXI_CONFIRM_SEC) {
          return { ...next, moving: true, moveCandidateSince: null, speedCandidateSince: null };
        }
        next.moveCandidateSince = since;
      } else {
        next.moveCandidateSince = null;
      }
    } else {
      next.moveCandidateSince = null;
    }

    // Kanał wsparcia: prędkość ponad progiem utrzymana przez okno potwierdzenia —
    // WYŁĄCZNIE gdy przemieszczenia nie da się policzyć (fix bez pozycji). Gdy pozycja
    // jest i mówi „przy kotwicy", szum dopplera nie ma prawa jej przegłosować: kanał
    // o kontraście ~24:1 nie może przegrywać z kanałem ~7:1 (rachunek: `trends.ts`).
    if (here == null || next.anchor == null) {
      if (speed != null && speed.kt >= t.TAXI_SPEED_KT) {
        const since = next.speedCandidateSince ?? fix.time;
        if ((fix.time - since) / 1000 >= t.TAXI_CONFIRM_SEC) {
          return { ...next, moving: true, moveCandidateSince: null, speedCandidateSince: null };
        }
        return { ...next, speedCandidateSince: since };
      }
      return { ...next, speedCandidateSince: null };
    }
    return { ...next, speedCandidateSince: null };
  }

  // ── zatrzymanie ────────────────────────────────────────────────────────────
  // Wymagamy OBU warunków naraz (wolno ORAZ nigdzie nie jedzie), bo każdy z osobna
  // ma swój tryb porażki: prędkość potrafi chwilowo zniknąć w szumie na wolnym
  // kołowaniu, a przemieszczenie netto jest małe także w ciasnym zakręcie.
  const slow = speed == null || speed.kt < t.TAXI_SPEED_KT;
  const stopWindow = fixesInWindow(history, t.STOP_WINDOW_SEC);
  const oldest = stopWindow[0];
  const spanSec = oldest == null ? 0 : (fix.time - oldest.time) / 1000;
  const oldestPos = oldest == null ? null : fixPosition(oldest);
  const still =
    here != null &&
    oldestPos != null &&
    spanSec >= t.STOP_WINDOW_SEC * 0.5 &&
    distanceM(here, oldestPos) < t.STOP_DISPLACEMENT_M;

  if (slow && still) {
    // Nowy postój = nowa kotwica; poprzednia opisywała stanowisko sprzed lotu.
    return { anchor: here, moving: false, moveCandidateSince: null, speedCandidateSince: null };
  }
  return next;
}
