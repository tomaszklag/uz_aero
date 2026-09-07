/**
 * UZ Aero - łamana rysowana layoutem RN (prymityw DS).
 *
 * Każdy odcinek to `<View>` o wysokości równej grubości kreski, obrócony o kąt odcinka -
 * ta sama technika co `CheckIcon`, z tego samego powodu: `react-native-svg` jest modułem
 * NATYWNYM, a dokładanie go do kompilacji wymusza przebudowę dev clienta u każdego, kto
 * klonuje repo. Ślad lotu po uproszczeniu (RDP) ma kilkadziesiąt wierzchołków, więc
 * kilkadziesiąt `<View>` - koszt bez znaczenia dla ekranu, który nie animuje.
 *
 * ══ CIĄGŁOŚĆ LINII (issue #47 pkt 1 i druga tura przeglądu) ══
 * Cała geometria - łącznie z NADMIAREM na styku, bez którego łuk rozpada się w kropki,
 * a wierzchołek jest ścięty - siedzi w `screenPolyline.ts` i tam jest wyjaśniona.
 * Ten komponent wyłącznie ją rysuje i NIE MA prawa niczego pomijać: pominięty odcinek
 * to dziura, a dziura co drugi punkt zamienia trasę w zbiór kropek.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { dashPath, polylineSegments, screenPath } from './screenPolyline';

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
  /**
   * Kreska przerywana `[on, off]` w px łuku (issue #75 pkt 4 - kołowanie).
   * Geometria cięcia i jej reguły: `dashPath` w `screenPolyline.ts`.
   */
  dash?: readonly [number, number];
  style?: ViewStyle;
}

export function TrackPolyline({
  points,
  color,
  width = 2.5,
  opacity = 1,
  dash,
  style,
}: TrackPolylineProps) {
  if (points.length < 2) return null;

  const path = screenPath(points);
  const pieces = dash != null ? dashPath(path, dash[0], dash[1]) : [path];
  const segments = pieces.flatMap((piece) => polylineSegments(piece, width));

  return (
    <View pointerEvents="none" style={[{ position: 'absolute', inset: 0, opacity }, style]}>
      {segments.map((segment, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: segment.left,
            top: segment.top,
            width: segment.length,
            height: segment.thickness,
            backgroundColor: color,
            // Zaokrąglony koniec wystający dokładnie do wierzchołka JEST okrągłym
            // złączem - tym samym, które w SVG robi `stroke-linejoin: round`.
            borderRadius: segment.thickness / 2,
            transform: [{ rotate: `${segment.angleRad}rad` }],
          }}
        />
      ))}
    </View>
  );
}
