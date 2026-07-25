/**
 * UZ Aero — AppBar
 *
 * Górny pasek kontekstu, wspólny dla ekranów dnia lotnego (.app-bar / .compact-bar
 * w mockupach): po lewej samolot i trasa, po prawej wskaźnik łączności i akcje.
 *
 * Samolot jest wyróżniony kolorem, bo to jedyna informacja, która musi być czytelna
 * jednym spojrzeniem — pilot lata kilkoma maszynami i pomyłka kosztuje rozjazd danych.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';

export interface AppBarProps {
  /** Znak samolotu (np. „SP-AXA"). */
  aircraft?: string | null;
  /** Druga linia: trasa i operacja (np. „EPKK → EPWA · SKOKI"). */
  subtitle?: string | null;
  /** Prawa strona — zwykle `SyncChip`, ewentualnie akcje. */
  right?: React.ReactNode;
  /** Kompaktowy wariant dla trybu w locie (mniej pionowego miejsca). */
  compact?: boolean;
  style?: ViewStyle;
}

export function AppBar({ aircraft, subtitle, right, compact = false, style }: AppBarProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingHorizontal: theme.spacing.md,
          paddingVertical: compact ? theme.spacing.xs : theme.spacing.sm,
          borderBottomWidth: theme.borderWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: compact ? theme.colors.surface : 'transparent',
        },
        style,
      ]}
    >
      <View style={styles.left}>
        <AppText variant="mono" tone="green" style={styles.aircraft}>
          {aircraft ?? '—'}
        </AppText>
        {subtitle != null && (
          <AppText variant="label" tone="muted">
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: { flexShrink: 1, gap: 2 },
  aircraft: { letterSpacing: 1.5 },
});
