/**
 * UZ Aero — PinDots (`.pin-dots` z mockupu 00)
 *
 * Wskaźnik postępu wpisywania PIN-u: cztery kropki, wypełnione zielono. Zły PIN
 * barwi kropki czerwono i potrząsa rzędem — to jedyny komunikat odmowy (mockup nie
 * ma tekstu błędu; kolor + ruch mówią wszystko i nie zdradzają nic).
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

export interface PinDotsProps {
  /** Ile cyfr już wpisano (0–length). */
  filled: number;
  length?: number;
  /** Tryb odmowy — czerwone kropki + potrząśnięcie przy każdej zmianie na `true`. */
  error?: boolean;
  style?: ViewStyle;
}

export function PinDots({ filled, length = 4, error = false, style }: PinDotsProps) {
  const { theme } = useTheme();
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    shake.setValue(0);
    Animated.sequence(
      [10, -8, 6, -4, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true }),
      ),
    ).start();
  }, [error, shake]);

  const accent = error ? theme.colors.red : theme.colors.green;

  return (
    <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }, style]}>
      {Array.from({ length }, (_, i) => {
        const on = i < filled || error;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: on ? accent : theme.colors.borderStrong,
                backgroundColor: on ? accent : 'transparent',
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 18 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5 },
});
