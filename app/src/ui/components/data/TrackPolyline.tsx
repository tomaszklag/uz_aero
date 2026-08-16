/**
 * UZ Aero — łamana rysowana layoutem RN (prymityw DS).
 *
 * Każdy odcinek to `<View>` o wysokości równej grubości kreski, obrócony o kąt odcinka —
 * ta sama technika co `CheckIcon`, z tego samego powodu: `react-native-svg` jest modułem
 * NATYWNYM, a dokładanie go do kompilacji wymusza przebudowę dev clienta u każdego, kto
 * klonuje repo. Ślad lotu po uproszczeniu (RDP) ma kilkadziesiąt wierzchołków, więc
 * kilkadziesiąt `<View>` — koszt bez znaczenia dla ekranu, który nie animuje.
 *
 * Odcinek pozycjonujemy ŚRODKIEM i obracamy wokół środka (domyślne zachowanie RN),
 * a nie lewym końcem z `transformOrigin`. Wynik geometryczny jest identyczny, ale nie
 * zależy od jednej właściwości stylu, której brak objawiłby się rozjechaną kreską —
 * czyli awarią wyglądającą jak zły ślad, a nie jak błąd rysowania.
 *
 * ══ CIĄGŁOŚĆ LINII (issue #47 pkt 1) ══
 * Punkty przechodzą najpierw przez `screenPath`, które scala kroki podpikselowe.
 * Ten komponent NIE MA prawa pomijać odcinków — pominięty odcinek to dziura, a dziura
 * co drugi punkt zamienia trasę w zbiór kropek. Cała historia tego błędu:
 * `screenPolyline.ts`.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { screenPath } from './screenPolyline';

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

  const path = screenPath(points);
  const segments: React.ReactNode[] = [];

  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!;
    const to = path[i]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    // Punkty dokładnie pokryte (ten sam piksel na wejściu) — `atan2(0,0)` byłoby zerem
    // bez znaczenia, a prostokąt zerowej długości i tak niewidoczny.
    if (length === 0) continue;

    segments.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          // Prostokąt stoi ŚRODKIEM na środku odcinka, więc obrót wokół środka
          // (domyślny w RN) trafia dokładnie w linię — bez `transformOrigin`.
          left: (from.x + to.x) / 2 - length / 2,
          top: (from.y + to.y) / 2 - width / 2,
          width: length,
          height: width,
          backgroundColor: color,
          borderRadius: width / 2,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
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
