/**
 * UZ Aero - CheckIcon (prymityw DS)
 *
 * Ptaszek „✓" rysowany dwiema krawędziami obróconego prostokąta - bez `react-native-svg`
 * i bez fontu ikon. DLACZEGO tak: obie te zależności to moduły natywne, a dokładanie
 * ich do kompilacji tylko po to, by narysować jedną kreskę, kosztowałoby przebudowę
 * dev clienta przy każdej instalacji. Ten kształt jest czystym layoutem RN.
 *
 * Geometria odwzorowuje ikonę z mockupów (`02-preflight.html`, polyline 20 6 → 9 17 → 4 12):
 * krótsze ramię ~0,42 wysokości, grubość ~0,18, obrót 45°. Przesunięcie `top`
 * kompensuje fakt, że po obrocie „tusz" leży poniżej środka ramki.
 *
 * Kolor jest zawsze podawany przez wywołującego (z tokenów motywu) - komponent nie zna
 * palety, więc nie ma tu ryzyka hardcoded hex.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

export interface CheckIconProps {
  /** Bok kwadratowej ramki ikony (px). Domyślnie 12 - tyle mieści się w kółku 20 px. */
  size?: number;
  /** Kolor kreski. Na wypełnionym akcencie użyj `theme.colors.bg` (kontrast w każdym motywie). */
  color: string;
  /** Grubość kreski; domyślnie proporcjonalna do rozmiaru, minimum 2 px. */
  thickness?: number;
  style?: ViewStyle;
}

export function CheckIcon({ size = 12, color, thickness, style }: CheckIconProps) {
  const stroke = thickness ?? Math.max(2, Math.round(size * 0.18));

  return (
    <View
      // Ikona jest dekoracją stanu - stan czyta czytnik ekranu z `accessibilityState`
      // elementu nadrzędnego, więc tutaj wyciszamy.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <View
        style={{
          width: size * 0.42,
          height: size * 0.78,
          borderRightWidth: stroke,
          borderBottomWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          top: -size * 0.15,
        }}
      />
    </View>
  );
}
