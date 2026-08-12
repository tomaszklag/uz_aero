/**
 * UZ Aero — miniatura śladu (mockup `16-lot.html`, `.track-thumb`).
 *
 * Uproszczony zapis trasy na ekranie szczegółów lotu: SAMA linia i dwa końce. To jest
 * szkic kształtu — „zapis istnieje i tak z grubsza wyglądał" — a nie mapa do czytania.
 *
 * Czym różni się od `TrackMap` (14) i dlaczego to osobny komponent, a nie tryb tamtego:
 *  • **nie ma siatki, podziałki ani lotnisk.** W 150 px wysokości pas startowy schodzi
 *    do dwóch pikseli, a podziałka mówiłaby o skali rysunku, którego nikt nie mierzy.
 *  • **nie ma atrybucji** — i to jest konsekwencja powyższego, nie przeoczenie: podpis
 *    „© OpenStreetMap" jest wymogiem licencji dla PASÓW LOTNISK. Bez tych danych nie ma
 *    czego podpisywać, a podpis pod rysunkiem, który ich nie używa, byłby myleniem.
 *  • **nie ma znaczników z etykietami.** Godziny T/O i LDG stoją w nagłówku karty.
 *
 * Rysunek bez modułów natywnych: łamana z obróconych `<View>` (`TrackPolyline`), tak samo
 * jak pełna mapa.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { boundsOf, fitBounds, toScreen, type LatLon, type TrackVertex } from '../../../domain';
import { useTheme } from '../../theme';
import { TrackPolyline, type Point2D } from './TrackPolyline';

export interface TrackThumbnailProps {
  line: readonly TrackVertex[];
  width: number;
  height: number;
}

/** Margines kadru (px) — mniejszy niż na 14, bo i rysunek jest mniejszy. */
const PADDING = 18;

export function TrackThumbnail({ line, width, height }: TrackThumbnailProps) {
  const { theme } = useTheme();

  const view = useMemo(() => {
    const bounds = boundsOf(line as readonly LatLon[]);
    if (bounds == null) return null;
    return fitBounds(bounds, width, height, PADDING);
  }, [line, width, height]);

  const points: Point2D[] = useMemo(
    () => (view == null ? [] : line.map((p) => toScreen(p, view))),
    [line, view],
  );

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View
      style={[styles.frame, { width, height, backgroundColor: theme.colors.bgTint }]}
      pointerEvents="none"
    >
      <TrackPolyline points={points} color={theme.colors.green} width={2.5} />

      {/* Start z pierścieniem, lądowanie bez — ta sama para kolorów, co znaczniki na 14,
          żeby powiększenie nie zmieniało języka rysunku. */}
      {first != null && (
        <>
          <View
            style={[
              styles.ring,
              { left: first.x - 9, top: first.y - 9, borderColor: theme.colors.green },
            ]}
          />
          <View
            style={[
              styles.dot,
              { left: first.x - 5, top: first.y - 5, backgroundColor: theme.colors.green },
            ]}
          />
        </>
      )}
      {last != null && (
        <View
          style={[
            styles.dot,
            { left: last.x - 4.5, top: last.y - 4.5, backgroundColor: theme.colors.red },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'relative', overflow: 'hidden' },
  dot: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  ring: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    opacity: 0.4,
  },
});
