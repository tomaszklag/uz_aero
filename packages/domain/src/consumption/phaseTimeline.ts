/**
 * UZ Aero — oś faz pionowych lotu (wznoszenie / przelot / zniżanie) ze śladu GPS.
 *
 * ══ PO CO ══
 * Model zużycia rozdziela paliwo między fazy, ale ziemia/powietrze to podział zgrubny:
 * wznoszenie pali wyraźnie więcej niż przelot, a zniżanie wyraźnie mniej. Żeby model
 * mógł je rozróżnić, każdy interwał paliwowy musi wiedzieć, ile czasu spędził w każdej
 * z nich — a tego rejestr zdarzeń nie wie. Wie ślad GPS.
 *
 * ══ KLUCZOWA FAKTORYZACJA ══
 * Ta oś zależy WYŁĄCZNIE od śladu i od niczego więcej. Podział na ziemię i powietrze
 * pochodzi z rejestru (`takeoff`/`landing`), podział lotu na fazy pionowe — z wysokości.
 * Rozdzielenie tych dwóch źródeł jest tym, co czyni wynik cache'owalnym: korekta czasu
 * startu (04c) zmienia okno lotu, ale nie zmienia ANI JEDNEGO odcinka tej osi. Gdyby
 * funkcja czytała rejestr, każda korekta unieważniałaby zapisany wynik.
 *
 * ══ TA SAMA METODA, CO NAPIS W KOKPICIE ══
 * Prędkość pionowa liczy się nachyleniem regresji w oknie `VS_WINDOW_SEC`, a progiem
 * jest `VS_THRESHOLD_FPM` — dokładnie jak w `detection/flightPhase.ts`. Druga, własna
 * definicja „wznoszenia" rozjechałaby się z tym, co pilot widział na ekranie, i nikt
 * by tego nie zauważył aż do rozmowy o konkretnym locie.
 */

import type { EpochMillis } from '../time';
import { VS_THRESHOLD_FPM, VS_WINDOW_SEC } from '../detection/flightPhase';
import { slopePerSecond, type TimePoint } from '../detection/regression';
import { isUsablePoint, type TrackPoint } from '../track/point';
import { mergeSpans, spanTimeInWindow, type ClosedSpan, type Span } from './timeInPhase';

/** Faza pionowa — podzbiór faz kokpitu, bez stanów naziemnych. */
export type VerticalPhase = 'climb' | 'cruise' | 'descent';

/** Odcinek jednej fazy pionowej. */
export interface PhaseSegment {
  from: EpochMillis;
  to: EpochMillis;
  phase: VerticalPhase;
}

/** Czasy faz pionowych w oknie (ms) — wejście modelu czterofazowego. */
export interface PhaseTimes {
  climbMs: number;
  cruiseMs: number;
  descentMs: number;
}

const SECOND_MS = 1000;
const FEET_PER_MINUTE = 60;

/**
 * Buduje oś faz pionowych z punktów śladu.
 *
 * Bierze wyłącznie punkty przyjęte przez bramkę jakości i mające wysokość — odrzucony
 * fix z wysokością 8 000 ft w środku wznoszenia wyprodukowałby fazę, której nie było,
 * a to ten sam błąd, przed którym bramka chroni detektor.
 *
 * Każdemu punktowi przypisujemy fazę z prędkości pionowej policzonej w oknie KOŃCZĄCYM
 * się na nim, po czym sklejamy sąsiednie punkty o tej samej fazie w odcinki. Punkt bez
 * dającej się policzyć prędkości (za mało historii, przerwa w sygnale) dostaje `cruise` —
 * ten sam stan domyślny, co w kokpicie, i z tego samego powodu: brak wiedzy o zmianie
 * wysokości nie jest dowodem na wznoszenie.
 */
export function buildPhaseTimeline(points: readonly TrackPoint[]): PhaseSegment[] {
  const usable = points
    .filter(isUsablePoint)
    .filter((point): point is TrackPoint & { altitudeFt: number } => point.altitudeFt != null)
    .sort((a, b) => a.time - b.time);

  if (usable.length < 2) return [];

  const segments: PhaseSegment[] = [];
  let openPhase: VerticalPhase | null = null;
  let openFrom: EpochMillis = usable[0]!.time;

  for (let i = 0; i < usable.length; i++) {
    const point = usable[i]!;
    const phase = phaseAt(usable, i);

    if (openPhase == null) {
      openPhase = phase;
      openFrom = point.time;
      continue;
    }

    if (phase !== openPhase) {
      // Odcinek kończy się NA tym punkcie — zmiana fazy zaszła gdzieś między nim
      // a poprzednim, a bez lepszej wiedzy dzielimy je w miejscu pomiaru.
      if (point.time > openFrom) segments.push({ from: openFrom, to: point.time, phase: openPhase });
      openPhase = phase;
      openFrom = point.time;
    }
  }

  const last = usable[usable.length - 1]!;
  if (openPhase != null && last.time > openFrom) {
    segments.push({ from: openFrom, to: last.time, phase: openPhase });
  }

  return segments;
}

/**
 * Czasy faz pionowych w oknie `[since, until]`, ograniczone do odcinków W POWIETRZU.
 *
 * Przecięcie z `airborne` jest konieczne, nie kosmetyczne: ślad nagrywa się przy
 * pracującym silniku, więc zawiera też kołowanie — a wysokość GPS potrafi na ziemi
 * dryfować o kilkadziesiąt stóp i wyprodukować „wznoszenie" na płycie.
 */
export function phaseTimesInWindow(
  timeline: readonly PhaseSegment[],
  airborne: readonly Span[],
  since: EpochMillis,
  until: EpochMillis,
): PhaseTimes {
  const times: PhaseTimes = { climbMs: 0, cruiseMs: 0, descentMs: 0 };
  if (timeline.length === 0 || until <= since) return times;

  for (const phase of ['climb', 'cruise', 'descent'] as const) {
    const clipped: ClosedSpan[] = [];
    for (const segment of timeline) {
      if (segment.phase !== phase) continue;
      const from = Math.max(segment.from, since);
      const to = Math.min(segment.to, until);
      if (to > from) clipped.push({ from, to });
    }

    // Odcinki fazy przecinamy z czasem w powietrzu — `spanTimeInWindow` scala nakładki
    // i przycina do okna, więc wystarczy podać mu oba zbiory po kolei.
    let total = 0;
    for (const span of mergeSpans(clipped)) {
      total += spanTimeInWindow(airborne, span.from, span.to);
    }

    times[`${phase}Ms`] = total;
  }

  return times;
}

/**
 * Faza punktu `i` — z prędkości pionowej w oknie CENTROWANYM na nim.
 *
 * ══ DLACZEGO CENTROWANE, A NIE WSTECZ (poprawka z testu) ══
 * Kokpit liczy prędkość pionową z okna kończącego się „teraz", bo innego nie ma —
 * działa na strumieniu. Tutaj analizujemy NAGRANIE, więc przyszłość każdego punktu jest
 * dostępna, a okno wstecz miało konkretną wadę: pierwsze punkty lotu nie mają historii,
 * więc regresja zwracała `null` i początek wznoszenia lądował w `cruise`. Wychodziło to
 * jako „przelot zaraz po starcie" — czyli faza, której nie było, przypisana do momentu,
 * w którym samolot pali najwięcej.
 *
 * Okno centrowane daje też fazy przesunięte we WŁAŚCIWE miejsce: zmiana wykryta wstecz
 * jest z definicji spóźniona o pół okna, a przy budowaniu osi nie ma powodu tego znosić.
 */
function phaseAt(points: readonly (TrackPoint & { altitudeFt: number })[], i: number): VerticalPhase {
  const center = points[i]!.time;
  const half = (VS_WINDOW_SEC * SECOND_MS) / 2;

  const window: TimePoint[] = [];
  for (const point of points) {
    if (point.time < center - half) continue;
    if (point.time > center + half) break;
    window.push({ t: point.time / SECOND_MS, v: point.altitudeFt });
  }

  // `VS_MIN_SPAN_SEC` nie jest tu progiem: oś powstaje po fakcie, więc okno okrojone
  // na krańcach nagrania to fragment, o którym wiemy mniej, a nie sytuacja do
  // przemilczenia. Gdy regresja nie ma z czego liczyć, wynikiem jest `cruise` — ten sam
  // stan domyślny, co w kokpicie, i z tego samego powodu: brak wiedzy o zmianie
  // wysokości nie jest dowodem na wznoszenie.
  const slope = slopePerSecond(window, 0);
  if (slope == null) return 'cruise';

  const fpm = slope * FEET_PER_MINUTE;
  if (fpm >= VS_THRESHOLD_FPM) return 'climb';
  if (fpm <= -VS_THRESHOLD_FPM) return 'descent';
  return 'cruise';
}
