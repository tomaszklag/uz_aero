/**
 * UZ Aero — mapa śladu lotu (mockupy `14-slad.html`, `14a-slad-offline.html`).
 *
 * Kafelki to zwykłe `<Image>` ułożone w siatkę wyliczoną przez `tilesFor` — bez
 * biblioteki mapowej, bo ta jest modułem natywnym, a ekran jest retrospektywny
 * (pokazuje zamknięty lot, nie prowadzi nawigacji). Pełne uzasadnienie stoi
 * w `packages/domain/src/track/mercator.ts`.
 *
 * **Brak kafelków nie jest błędem.** Gdy sieci nie ma, `<Image>` po prostu się nie
 * ładuje, a pod spodem zostaje siatka współrzędnych — czyli wariant 14A rysuje się
 * sam, bez osobnej gałęzi kodu. To najważniejsza własność tego komponentu: ślad
 * pochodzi z telefonu i jest kompletny zawsze, tło bywa i to nikomu nie przeszkadza.
 */

import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import {
  boundsOf,
  fitBounds,
  scaleBar,
  tilesFor,
  toScreen,
  TILE_SIZE,
  type LatLon,
  type TrackVertex,
} from '../../../domain';
import { tileUrl, tileUrlTemplate, TILE_ATTRIBUTION } from '../../../infrastructure/api/tileUrl';
import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { TrackPolyline, type Point2D } from './TrackPolyline';

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
  /** Wyłącza pobieranie kafelków — do podglądu bez sieci i w testach. */
  tilesEnabled?: boolean;
}

export function TrackMap({ line, markers = [], width, height, tilesEnabled = true }: TrackMapProps) {
  const { theme } = useTheme();
  const template = tileUrlTemplate();

  const view = useMemo(() => {
    // Widok obejmuje ślad ORAZ znaczniki: lądowanie potrafi wypaść poza uproszczoną
    // linię o kilkadziesiąt metrów i bez tego wyjechałoby poza kadr.
    const positions: LatLon[] = [...line, ...markers.map((m) => m.position)];
    const bounds = boundsOf(positions);
    if (bounds == null) return null;
    return fitBounds(bounds, width, height, 30);
  }, [line, markers, width, height]);

  const screenPoints: Point2D[] = useMemo(
    () => (view == null ? [] : line.map((p) => toScreen(p, view))),
    [line, view],
  );

  const bar = useMemo(
    () => (view == null ? null : scaleBar(view, line[0]?.lat ?? 52, Math.min(90, width * 0.3))),
    [view, line, width],
  );

  return (
    <View style={[styles.frame, { width, height, backgroundColor: theme.colors.bgTint }]}>
      {/* ── siatka współrzędnych: podkład, który jest ZAWSZE ─────────────── */}
      <CoordinateGrid width={width} height={height} color={theme.colors.border} />

      {/* ── kafelki: warstwa, która bywa ─────────────────────────────────── */}
      {tilesEnabled &&
        view != null &&
        tilesFor(view).map((tile) => (
          <Image
            key={`${tile.z}/${tile.x}/${tile.y}`}
            source={{ uri: tileUrl(template, tile.x, tile.y, tile.z) }}
            style={{
              position: 'absolute',
              left: tile.left,
              top: tile.top,
              width: TILE_SIZE,
              height: TILE_SIZE,
            }}
            // Kafelek, który nie doszedł, zostaje przezroczysty — pod spodem jest siatka.
            onError={() => {}}
          />
        ))}

      {/* ── ślad ─────────────────────────────────────────────────────────── */}
      <TrackPolyline points={screenPoints} color={theme.colors.green} width={2.5} />

      {/* ── znaczniki ────────────────────────────────────────────────────── */}
      {view != null &&
        markers.map((marker) => {
          const p = toScreen(marker.position, view);
          return (
            <View key={marker.label} pointerEvents="none">
              {marker.ring === true && (
                <View
                  style={[
                    styles.ring,
                    { left: p.x - 10, top: p.y - 10, borderColor: marker.color },
                  ]}
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

      {/* ── podziałka i atrybucja ────────────────────────────────────────── */}
      {bar != null && (
        <View style={styles.scale}>
          <AppText variant="micro" tone="secondary">
            {bar.meters >= 1000 ? `${bar.meters / 1000} km` : `${bar.meters} m`}
          </AppText>
          <View style={[styles.scaleBar, { width: bar.pixels, borderColor: theme.colors.textSecondary }]} />
        </View>
      )}

      <View style={[styles.attrib, { backgroundColor: theme.colors.bg }]}>
        <AppText variant="micro" tone="muted">
          {TILE_ATTRIBUTION}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Siatka pod kafelkami — nie ozdoba, tylko gwarancja, że ślad ZAWSZE ma odniesienie.
 * To ona zamienia „mapa się nie wczytała" w czytelny wykres trasy (wariant 14A).
 */
function CoordinateGrid({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  const step = 60;
  const lines: React.ReactNode[] = [];

  for (let x = step; x < width; x += step) {
    lines.push(
      <View key={`v${x}`} style={{ position: 'absolute', left: x, top: 0, width: 1, height, backgroundColor: color }} />,
    );
  }
  for (let y = step; y < height; y += step) {
    lines.push(
      <View key={`h${y}`} style={{ position: 'absolute', left: 0, top: y, width, height: 1, backgroundColor: color }} />,
    );
  }
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{lines}</View>;
}

const styles = StyleSheet.create({
  frame: { position: 'relative', overflow: 'hidden' },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  ring: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 1, opacity: 0.45 },
  markerLabel: { position: 'absolute' },
  scale: { position: 'absolute', left: 8, bottom: 6, gap: 2 },
  scaleBar: { height: 4, borderWidth: 1, borderTopWidth: 0 },
  attrib: { position: 'absolute', right: 6, bottom: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, opacity: 0.85 },
});
