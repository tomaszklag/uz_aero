/**
 * UZ Aero - SKELETON: plamka trzymająca miejsce po danej, której jeszcze nie ma.
 *
 * Prymityw wzorca ładowania (`design/LOADERY.html`, issue #33). Zastępuje spinner
 * wszędzie tam, gdzie ekran czeka na odczyt: kręcące się kółko nie mówi, CO się pojawi,
 * i pozwala treści wskoczyć pod palec już trzymany nad ekranem. Plamka ma wymiary
 * docelowej wartości, więc gdy dane dojdą, nic się nie przesuwa.
 *
 * Wymiary podaje się WPROST, w pikselach tej wartości, którą plamka zastępuje -
 * nie ma tu domyślnego „jednego rozmiaru skeletonu". Inwentarz rozmiarów używanych
 * przez ekrany stoi na canvasie mockupu (micro 7 px, mono 11–12 px, display 22 px,
 * wiersz 44 px, przycisk 46 px).
 *
 * Kolor to `surfaceHover`, czyli środek zakresu, po którym w panelu webowym przesuwa się
 * gradient - jedyny odcień widoczny zarówno na `surface` (wnętrze karty), jak i na `bg`
 * (goła treść ekranu), w obu motywach.
 *
 * Dla czytnika ekranu plamka NIE ISTNIEJE: komunikat „Ładowanie" należy do bloku,
 * a nie do czternastu prostokątów (wzorzec, reguła 6). Blok nadaje go sam -
 * `SkeletonRows` albo ekran przez `accessibilityLabel` na kontenerze.
 */

import React from 'react';
import { Animated, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { useSkeletonPulse } from './skeletonPulse';

export interface SkeletonProps {
  /** Szerokość plamki; domyślnie cała dostępna. */
  width?: DimensionValue;
  /** Wysokość = wysokość linii tekstu albo elementu, który się pojawi. */
  height?: number;
  /** Zaokrąglenie; domyślnie 6 px jak w mockupie (przyciski i karty podają swoje). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 13, radius = 6, style }: SkeletonProps) {
  const { theme } = useTheme();
  const pulse = useSkeletonPulse();

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceHover,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}
