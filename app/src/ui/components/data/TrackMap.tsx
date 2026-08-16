/**
 * UZ Aero — mapa śladu lotu (mockup `14-slad.html`).
 *
 * **Bez kafelków** (decyzja 2026-08-04). Ślad rysuje się na siatce współrzędnych,
 * a odniesienie w terenie dają LOTNISKA z katalogu (`packages/domain/src/airfields.ts`):
 * pas startowy z podpisem ICAO. Zysk jest podwójny — ekran przestał zależeć od sieci
 * w jakimkolwiek stopniu, a przy okazji zniknął problem dostawcy kafelków, jego klucza
 * i regulaminu.
 *
 * Rysunek nadal bez modułów natywnych: siatka i pasy to `<View>`, ślad to łamana
 * z obróconych prostokątów (`TrackPolyline`), jak ptaszek w `CheckIcon`.
 *
 * Podziałka pod mapą nie jest ozdobą: bez kafelków to jedyna rzecz, która mówi, czy
 * krąg ma dwa kilometry, czy dwadzieścia.
 */

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  airfieldsInView,
  boundsOf,
  fitBounds,
  scaleBar,
  toScreen,
  type Airfield,
  type LatLon,
  type TrackVertex,
} from '../../../domain';
import { useChartGesture } from '../../hooks/useChartGesture';
import { applyViewport, unapplyViewport } from '../../screens/logic/mapViewport';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { TrackPolyline, type Point2D } from './TrackPolyline';

/** Odstęp linii siatki (px) — gęściej robi się szum pod śladem. */
const GRID_STEP = 60;

export interface TrackMapMarker {
  position: LatLon;
  color: string;
  label: string;
  /** Pierścień wokół punktu — wyróżnia start spośród zwykłych znaczników. */
  ring?: boolean;
}

export interface TrackMapProps {
  line: readonly TrackVertex[];
  markers?: readonly TrackMapMarker[];
  width: number;
  height: number;
  /** ICAO z preflightu — to lotnisko pokazujemy zawsze, także spoza kadru. */
  departureIcao?: string | null;
  /** Chwila pod palcem — kursor sprzężony z profilem (issue #47 pkt 7). */
  cursorAt?: number | null;
  /** Palec na mapie wskazał chwilę (albo zszedł: `null`). */
  onCursorChange?: (at: number | null) => void;
}

export function TrackMap({
  line,
  markers = [],
  width,
  height,
  departureIcao = null,
  cursorAt = null,
  onCursorChange,
}: TrackMapProps) {
  const { theme } = useTheme();

  const frame = useMemo(() => {
    // Kadr obejmuje ślad ORAZ znaczniki: lądowanie potrafi wypaść poza uproszczoną
    // linię o kilkadziesiąt metrów i bez tego wyjechałoby poza ekran.
    const positions: LatLon[] = [...line, ...markers.map((m) => m.position)];
    const bounds = boundsOf(positions);
    if (bounds == null) return null;
    return { view: fitBounds(bounds, width, height, 30), bounds };
  }, [line, markers, width, height]);

  const airfields = useMemo<Airfield[]>(
    () => (frame == null ? [] : airfieldsInView(frame.bounds, { preferredIcao: departureIcao })),
    [frame, departureIcao],
  );

  /** Punkty trasy w kadrze 1:1 — do nich odnosi się przybliżenie i szukanie kursora. */
  const basePoints: Point2D[] = useMemo(
    () => (frame == null ? [] : line.map((p) => toScreen(p, frame.view))),
    [line, frame],
  );

  /**
   * Palec na mapie → CHWILA, nie miejsce.
   *
   * Mapa nie ma osi czasu, więc kursor stawia się na najbliższym WIERZCHOŁKU trasy
   * i to jego czas idzie na profil. Szukamy w układzie 1:1 (po zdjęciu przybliżenia),
   * bo tam odległości nie zależą od tego, jak mocno pilot przybliżył.
   */
  const gesture = useChartGesture({
    size: { width, height },
    zoomable: true,
    onScrub: useCallback(
      (point: Point2D | null) => {
        if (onCursorChange == null) return;
        if (point == null || basePoints.length === 0) {
          onCursorChange(null);
          return;
        }

        const inBase = unapplyViewport(point, viewportRef.current);
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < basePoints.length; i++) {
          const dx = basePoints[i]!.x - inBase.x;
          const dy = basePoints[i]!.y - inBase.y;
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
          }
        }
        onCursorChange(line[bestIndex]?.time ?? null);
      },
      [basePoints, line, onCursorChange],
    ),
  });

  // Kadr czytany w trakcie gestu, więc przez ref: `onScrub` powstaje raz na zmianę
  // punktów, a przybliżenie zmienia się w każdej klatce szczypty.
  const viewportRef = React.useRef(gesture.viewport);
  viewportRef.current = gesture.viewport;

  const screenPoints = useMemo(
    () => basePoints.map((p) => applyViewport(p, gesture.viewport)),
    [basePoints, gesture.viewport],
  );

  const project = useCallback(
    (position: LatLon): Point2D =>
      frame == null
        ? { x: 0, y: 0 }
        : applyViewport(toScreen(position, frame.view), gesture.viewport),
    [frame, gesture.viewport],
  );

  const bar = useMemo(() => {
    if (frame == null) return null;
    // Podziałka jest WSKAŹNIKIEM PRZYBLIŻENIA (mockup 14D): przy ×2,4 czyta „500 m"
    // zamiast „2 km". Liczymy ją więc na kadrze 1:1 dla proporcjonalnie krótszego
    // odcinka, a wynik rozciągamy z powrotem — dzięki temu liczba zostaje okrągła.
    const maxPx = Math.min(90, width * 0.3) / gesture.viewport.scale;
    const base = scaleBar(frame.view, line[0]?.lat ?? 52, maxPx);
    return { meters: base.meters, pixels: base.pixels * gesture.viewport.scale };
  }, [frame, line, width, gesture.viewport.scale]);

  const cursorPoint = useMemo(() => {
    if (cursorAt == null || frame == null || line.length === 0) return null;
    let best: TrackVertex | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const vertex of line) {
      const distance = Math.abs(vertex.time - cursorAt);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = vertex;
      }
    }
    return best == null ? null : project(best);
  }, [cursorAt, frame, line, project]);

  return (
    <View
      style={[styles.frame, { width, height, backgroundColor: theme.colors.bgTint }]}
      {...gesture.panHandlers}
    >
      <CoordinateGrid width={width} height={height} color={theme.colors.border} />

      {/* ── lotniska: pas i podpis, POD śladem ──────────────────────────── */}
      {frame != null &&
        airfields.map((airfield) => (
          <AirfieldMark
            key={airfield.icao}
            airfield={airfield}
            point={project(airfield)}
            metersPerPixel={bar != null && bar.pixels > 0 ? bar.meters / bar.pixels : null}
            surface={theme.colors.borderStrong}
            labelColor={theme.colors.textMuted}
          />
        ))}

      <TrackPolyline points={screenPoints} color={theme.colors.green} width={2.5} />

      {/* ── znaczniki startu i lądowania ─────────────────────────────────── */}
      {frame != null &&
        markers.map((marker) => {
          const p = project(marker.position);
          return (
            <View key={marker.label} pointerEvents="none">
              {marker.ring === true && (
                <View
                  style={[styles.ring, { left: p.x - 10, top: p.y - 10, borderColor: marker.color }]}
                />
              )}
              <View
                style={[styles.dot, { left: p.x - 5, top: p.y - 5, backgroundColor: marker.color }]}
              />
              <AppText
                variant="micro"
                style={[styles.markerLabel, { left: p.x + 9, top: p.y - 6, color: marker.color }]}
              >
                {marker.label}
              </AppText>
            </View>
          );
        })}

      {/* ── kursor sprzężony z profilem (issue #47 pkt 7) ─────────────────── */}
      {/* Biały, bo nie jest zdarzeniem rejestru: zieleń, czerwień i błękit są zajęte
          przez starty, lądowania i zrzuty, a wzięcie któregokolwiek kazałoby czytać
          kursor jako coś, co się wydarzyło. */}
      {cursorPoint != null && (
        <View pointerEvents="none">
          <View
            style={[
              styles.cursorRing,
              {
                left: cursorPoint.x - 9,
                top: cursorPoint.y - 9,
                borderColor: theme.colors.textPrimary,
              },
            ]}
          />
          <View
            style={[
              styles.cursorDot,
              {
                left: cursorPoint.x - 3.5,
                top: cursorPoint.y - 3.5,
                backgroundColor: theme.colors.textPrimary,
              },
            ]}
          />
        </View>
      )}

      {/* ── atrybucja źródeł katalogu ────────────────────────────────────── */}
      {/* Pasy lotnisk aeroklubowych pochodzą z OpenStreetMap (ODbL), a ta licencja
          wymaga podpisu przy publicznym użyciu danych. Stąd stała adnotacja przy
          samej mapie, a nie w odległym „o aplikacji". */}
      <AppText variant="micro" tone="muted" style={styles.attribution}>
        lotniska: OurAirports · © OpenStreetMap
      </AppText>

      {/* ── podziałka: bez kafelków jedyne odniesienie odległości ────────── */}
      {bar != null && (
        <View style={styles.scale}>
          <AppText variant="micro" tone="secondary">
            {bar.meters >= 1000 ? `${bar.meters / 1000} km` : `${bar.meters} m`}
          </AppText>
          <View
            style={[
              styles.scaleBar,
              { width: bar.pixels, borderColor: theme.colors.textSecondary },
            ]}
          />
        </View>
      )}
    </View>
  );
}

/**
 * Lotnisko: pas startowy w skali mapy plus kod ICAO.
 *
 * Pas rysujemy PROSTOKĄTEM obróconym o kurs progu — w tej skali to jedyny szczegół,
 * który daje się rozpoznać, a przy okazji mówi pilotowi, z której strony podchodził.
 * Gdy skala nie jest znana albo pas wyszedłby krótszy niż kilka pikseli, zostaje sam
 * znacznik: kreska nie do odczytania jest gorsza niż jej brak.
 */
function AirfieldMark({
  airfield,
  point,
  metersPerPixel,
  surface,
  labelColor,
}: {
  airfield: Airfield;
  point: Point2D;
  metersPerPixel: number | null;
  surface: string;
  labelColor: string;
}) {
  const runway = airfield.runway;
  const lengthPx =
    runway != null && metersPerPixel != null && metersPerPixel > 0
      ? runway.lengthM / metersPerPixel
      : 0;

  return (
    <View pointerEvents="none">
      {lengthPx >= 8 && runway != null ? (
        <View
          style={{
            position: 'absolute',
            left: point.x - lengthPx / 2,
            top: point.y - 1.5,
            width: lengthPx,
            height: 3,
            backgroundColor: surface,
            // Kurs geograficzny liczy się od północy zgodnie z ruchem wskazówek,
            // a obrót w układzie ekranu od osi X — stąd −90°.
            transform: [{ rotate: `${runway.headingDeg - 90}deg` }],
          }}
        />
      ) : (
        <View
          style={[styles.airfieldDot, { left: point.x - 3, top: point.y - 3, backgroundColor: surface }]}
        />
      )}
      <AppText
        variant="micro"
        style={[styles.airfieldLabel, { left: point.x + 7, top: point.y + 3, color: labelColor }]}
      >
        {airfield.icao}
      </AppText>
    </View>
  );
}

/** Siatka współrzędnych — podkład, który zastąpił kafelki. */
function CoordinateGrid({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  const lines: React.ReactNode[] = [];

  for (let x = GRID_STEP; x < width; x += GRID_STEP) {
    lines.push(
      <View
        key={`v${x}`}
        style={{ position: 'absolute', left: x, top: 0, width: 1, height, backgroundColor: color }}
      />,
    );
  }
  for (let y = GRID_STEP; y < height; y += GRID_STEP) {
    lines.push(
      <View
        key={`h${y}`}
        style={{ position: 'absolute', left: 0, top: y, width, height: 1, backgroundColor: color }}
      />,
    );
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {lines}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'relative', overflow: 'hidden' },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  ring: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    opacity: 0.45,
  },
  markerLabel: { position: 'absolute' },
  cursorRing: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 1, opacity: 0.55 },
  cursorDot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5 },
  airfieldDot: { position: 'absolute', width: 6, height: 6, borderRadius: 1 },
  airfieldLabel: { position: 'absolute', letterSpacing: 1 },
  scale: { position: 'absolute', left: 8, bottom: 6, gap: 2 },
  scaleBar: { height: 4, borderWidth: 1, borderTopWidth: 0 },
  attribution: { position: 'absolute', right: 8, bottom: 6 },
});
