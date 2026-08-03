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
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface AppBarProps {
  /** Znak samolotu (np. „SP-AXA"). */
  aircraft?: string | null;
  /** Druga linia: trasa i operacja (np. „EPKK → EPWA · SKOKI"). */
  subtitle?: string | null;
  /** Prawa strona — zwykle `SyncChip`, ewentualnie akcje. */
  right?: React.ReactNode;
  /** Koło zębate po prawej (`.settings-btn` z mockupów kokpitu). */
  onSettings?: () => void;
  /** Kompaktowy wariant dla trybu w locie (mniej pionowego miejsca). */
  compact?: boolean;
  style?: ViewStyle;
}

export function AppBar({
  aircraft,
  subtitle,
  right,
  onSettings,
  compact = false,
  style,
}: AppBarProps) {
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
          // Druga linia niesie kody ICAO, a te wg `CLAUDE.md` należą do JetBrains Mono
          // — nie do Archivo. Mockup `.route-line`: mono 11 px / ls 1.
          <AppText variant="mono" tone="muted" style={styles.subtitle}>
            {subtitle}
          </AppText>
        )}
      </View>

      <View style={styles.right}>
        {right}
        {onSettings != null && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ustawienia"
            onPress={onSettings}
            hitSlop={10}
            style={({ pressed }) => [
              styles.settings,
              {
                borderRadius: 7,
                borderWidth: theme.borderWidth,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Icon name="settings" size={16} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>
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
  subtitle: { fontSize: 11, lineHeight: 15, letterSpacing: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  settings: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
});
