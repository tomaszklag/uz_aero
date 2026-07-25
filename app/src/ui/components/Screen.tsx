/**
 * UZ Aero — Screen
 *
 * Wrapper ekranu: tło z tokenu motywu, obszar bezpieczny (safe area) i padding.
 * Opcjonalnie przewijalny. Kolory wyłącznie z motywu.
 */

import React from 'react';
import { ScrollView, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

export interface ScreenProps extends ViewProps {
  /** Owija zawartość w ScrollView. */
  scroll?: boolean;
  /** Padding wewnętrzny (spacing.lg). Domyślnie true. */
  padded?: boolean;
  /** Krawędzie safe area. Domyślnie wszystkie. */
  edges?: readonly Edge[];
  /** Styl kontenera zawartości (dotyczy trybu scroll). */
  contentContainerStyle?: ViewStyle;
}

const DEFAULT_EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

export function Screen({
  scroll = false,
  padded = true,
  edges = DEFAULT_EDGES,
  style,
  contentContainerStyle,
  children,
  ...rest
}: ScreenProps) {
  const { theme } = useTheme();
  const bg: ViewStyle = { backgroundColor: theme.colors.bg };
  const pad: ViewStyle | null = padded ? { padding: theme.spacing.lg } : null;

  if (scroll) {
    return (
      <SafeAreaView style={[styles.flex, bg]} edges={edges}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[pad, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          {...rest}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, bg, pad, style]} edges={edges} {...rest}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
