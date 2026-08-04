/**
 * UZ Aero — łamana rysowana layoutem RN (prymityw DS).
 *
 * Każdy odcinek to `<View>` o wysokości równej grubości kreski, obrócony o kąt odcinka —
 * ta sama technika co `CheckIcon`, z tego samego powodu: `react-native-svg` jest modułem
 * NATYWNYM, a dokładanie go do kompilacji wymusza przebudowę dev clienta u każdego, kto
 * klonuje repo. Ślad lotu po uproszczeniu (RDP) ma kilkadziesiąt wierzchołków, więc
 * kilkadziesiąt `<View>` — koszt bez znaczenia dla ekranu, który nie animuje.
 *
 * `transformOrigin: 'left center'` jest tu warunkiem poprawności: bez niego RN obraca
 * wokół środka i każdy odcinek odjeżdża o połowę swojej długości.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

export interface Point2D {
  x: number;
  y: number;
}

export interface TrackPolylineProps {
  points: readonly Point2D[];
  color: string;
  /** Grubość kreski (px). */
  width?: number;
  opacity?: number;
  style?: ViewStyle;
}

export function TrackPolyline({
  points,
  color,
  width = 2.5,
  opacity = 1,
  style,
}: TrackPolylineProps) {
  if (points.length < 2) return null;

  const segments: React.ReactNode[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    // Odcinek zerowej długości daje NaN w atan2 tylko przy obu zerach, ale i tak
    // nie ma czego rysować — pomijamy, zamiast produkować niewidoczny prostokąt.
    if (length < 0.5) continue;

    segments.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: from.x,
          // Kreska ma być WYŚRODKOWANA na trasie, nie zwisać pod nią.
          top: from.y - width / 2,
          width: length,
          height: width,
          backgroundColor: color,
          borderRadius: width / 2,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          transformOrigin: 'left center',
        }}
      />,
    );
  }

  return (
    <View pointerEvents="none" style={[{ position: 'absolute', inset: 0, opacity }, style]}>
      {segments}
    </View>
  );
}
