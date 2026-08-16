/**
 * UZ Aero — GESTY WYKRESÓW ŚLADU (issue #47 pkt 7 i 8).
 *
 * Jeden hook dla mapy i dla profilu, bo oba odpowiadają na te same dotknięcia:
 *  • **jeden palec** — kursor: pokazuje, co działo się w tej chwili, i podaje ją wyżej,
 *    żeby DRUGI wykres pokazał ten sam moment (sprzężenie),
 *  • **dwa palce** — przybliżenie i przesunięcie kadru (tylko tam, gdzie ma sens: mapa),
 *  • **dwuklik** — powrót do całości.
 *
 * ══ DLACZEGO `PanResponder`, A NIE `react-native-gesture-handler` ══
 * Projekt świadomie unika modułów NATYWNYCH (patrz `TrackPolyline`, `TrackMap`): każdy
 * dokłada przebudowę dev clienta u każdego, kto sklonuje repo. `PanResponder` jest
 * w rdzeniu RN i obsługuje wielodotyk przez `nativeEvent.touches` — do szczypty
 * i przeciągnięcia to wystarcza.
 *
 * ══ PODZIAŁ ODPOWIEDZIALNOŚCI ══
 * Ten plik zajmuje się WYŁĄCZNIE dotknięciami: ile palców, gdzie, jak daleko od
 * poprzedniej klatki. Co z tego wynika dla kadru, liczy `logic/mapViewport.ts` —
 * czysto i z testami, bo to tam mieszkają reguły, których palcem się nie sprawdzi.
 */

import { useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';

import type { Point2D } from '../components/data/TrackPolyline';
import {
  IDENTITY_VIEWPORT,
  panViewport,
  pinchViewport,
  type MapViewport,
  type ViewportSize,
} from '../screens/logic/mapViewport';

/** Maksymalna przerwa między tapnięciami uznana za dwuklik (ms). */
const DOUBLE_TAP_MS = 300;
/** I maksymalne rozjechanie palca między nimi (px) — inaczej to dwa różne tapnięcia. */
const DOUBLE_TAP_SLOP = 24;

export interface ChartGestureOptions {
  size: ViewportSize;
  /** Dotknięcie w układzie EKRANU wykresu; `null` = palec zszedł. */
  onScrub: (point: Point2D | null) => void;
  /** Mapa: tak. Profil: nie — tam osią jest czas i przybliżenie nie ma czego dodać. */
  zoomable?: boolean;
}

export interface ChartGesture {
  /** Do rozłożenia na kontenerze wykresu: `{...gesture.panHandlers}`. */
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  viewport: MapViewport;
  resetViewport: () => void;
}

export function useChartGesture({
  size,
  onScrub,
  zoomable = false,
}: ChartGestureOptions): ChartGesture {
  const [viewport, setViewport] = useState<MapViewport>(IDENTITY_VIEWPORT);

  // Refy, nie stan: te wartości zmieniają się w KAŻDEJ klatce gestu i przerysowanie
  // wykresu na każdą z nich byłoby jedynym, co telefon zdążyłby zrobić.
  const pinchDistance = useRef<number | null>(null);
  const lastTouch = useRef<Point2D | null>(null);
  const lastTapAt = useRef(0);
  const lastTapAtPoint = useRef<Point2D | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Wykres jest wewnątrz ekranu przewijanego w pionie: bez tego przeciągnięcie
        // po nim przewijałoby stronę zamiast prowadzić kursor.
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (event) => {
          const point = touchPoint(event, 0);
          if (point == null) return;

          if (zoomable && isDoubleTap(point, lastTapAt.current, lastTapAtPoint.current)) {
            setViewport(IDENTITY_VIEWPORT);
            lastTapAt.current = 0;
            lastTapAtPoint.current = null;
            return;
          }

          lastTapAt.current = Date.now();
          lastTapAtPoint.current = point;
          lastTouch.current = point;
          pinchDistance.current = null;
          onScrub(point);
        },

        onPanResponderMove: (event) => {
          const touches = event.nativeEvent.touches;

          if (zoomable && touches.length >= 2) {
            const a = touchPoint(event, 0);
            const b = touchPoint(event, 1);
            if (a == null || b == null) return;

            const distance = Math.hypot(b.x - a.x, b.y - a.y);
            const focus = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const previous = pinchDistance.current;
            pinchDistance.current = distance;

            // Pierwsza klatka dwoma palcami ustala tylko odniesienie — bez tego
            // skok z „brak dystansu" na „dystans" wywaliłby zoom w maksimum.
            if (previous == null || previous === 0) {
              lastTouch.current = focus;
              // Kursor znika: dwa palce to gest kadru, nie odczytu.
              onScrub(null);
              return;
            }

            setViewport((current) => {
              const zoomed = pinchViewport(current, focus, distance / previous, sizeRef.current);
              const from = lastTouch.current;
              // Przesunięcie ogniska między klatkami to PRZESUNIĘCIE kadru — dzięki
              // temu jeden gest robi obie rzeczy, tak jak w każdej mapie.
              return from == null
                ? zoomed
                : panViewport(zoomed, focus.x - from.x, focus.y - from.y, sizeRef.current);
            });

            lastTouch.current = focus;
            return;
          }

          const point = touchPoint(event, 0);
          if (point == null) return;
          pinchDistance.current = null;
          lastTouch.current = point;
          onScrub(point);
        },

        onPanResponderRelease: () => {
          pinchDistance.current = null;
          lastTouch.current = null;
          onScrub(null);
        },
        onPanResponderTerminate: () => {
          pinchDistance.current = null;
          lastTouch.current = null;
          onScrub(null);
        },
      }),
    [onScrub, zoomable],
  );

  return {
    panHandlers: responder.panHandlers,
    viewport,
    resetViewport: () => setViewport(IDENTITY_VIEWPORT),
  };
}

/**
 * Pozycja dotknięcia WZGLĘDEM wykresu.
 *
 * `locationX/locationY` z `touches[i]` liczą się od krawędzi elementu, który dotknięcie
 * przyjął — czyli od kontenera wykresu, bo to na nim wiszą te uchwyty.
 */
function touchPoint(event: GestureResponderEvent, index: number): Point2D | null {
  const touch = event.nativeEvent.touches[index];
  if (touch != null) return { x: touch.locationX, y: touch.locationY };
  if (index === 0) return { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
  return null;
}

function isDoubleTap(point: Point2D, lastAt: number, lastPoint: Point2D | null): boolean {
  if (lastPoint == null) return false;
  if (Date.now() - lastAt > DOUBLE_TAP_MS) return false;
  return Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) <= DOUBLE_TAP_SLOP;
}
