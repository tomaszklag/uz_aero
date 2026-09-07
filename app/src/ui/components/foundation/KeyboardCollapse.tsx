/**
 * UZ Aero - KeyboardCollapse
 *
 * Płynnie zwija dekorację, gdy wysuwa się klawiatura (issue #54 pkt 4). Ekran kurczy
 * się o wysokość klawiatury (`Screen` + `useKeyboardHeight`), więc wyśrodkowana
 * kolumna logowania przestawała się mieścić i znak marki wjeżdżał pod status bar -
 * przycięty, bo górnej krawędzi nikt nie przewija. Zamiast przycinać, element oddaje
 * miejsce formularzowi: zwija się do zera (wysokość + przezroczystość) i wraca po
 * schowaniu klawiatury.
 *
 * Wysokość naturalną mierzy treść (`onLayout` na widoku, którego kontener nie ściska -
 * zwijana jest tylko rama z `overflow: hidden`), animacja bez `useNativeDriver`,
 * bo wysokość jest własnością układu, nie transformacji. Źródłem stanu klawiatury
 * jest wyłącznie `useKeyboardHeight` - reguły z `docs/architektura-kodu.md` §2,
 * żadnych własnych nasłuchów zdarzeń klawiatury.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

export interface KeyboardCollapseProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Czas zwijania - w rytmie krótkich przejść aplikacji (pasek ActionButton: 120 ms). */
const DURATION_MS = 220;

export function KeyboardCollapse({ children, style }: KeyboardCollapseProps) {
  const hidden = useKeyboardHeight() > 0;
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: hidden ? 0 : 1,
      duration: DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [hidden, progress]);

  return (
    <Animated.View
      style={[
        styles.clip,
        style,
        // Przed pierwszym pomiarem rama nie przybija wysokości - treść renderuje się
        // naturalnie i `onLayout` dopiero wtedy ma co zmierzyć.
        contentHeight != null && {
          height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] }),
        },
        { opacity: progress },
      ]}
    >
      <View onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
