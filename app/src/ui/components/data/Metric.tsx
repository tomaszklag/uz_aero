/**
 * UZ Aero — Metric i MetricGrid
 *
 * Komórka parametru z mockupów (.param-cell / .metric): mała etykieta mono UPPERCASE
 * nad dużą wartością. Używana zarówno w siatce GPS w locie (GS, ALT, FOB, Flight Time),
 * jak i w licznikach dnia na ziemi.
 *
 * Etykieta ma rozmiar z tokenu `param_label` — po audycie kontrastu podniesiony, bo
 * przy 8 px nie przechodziła progu czytelności w żadnym motywie.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

export interface MetricProps {
  label: string;
  value: string;
  /** Jednostka obok wartości (KT, FT, L) — mniejsza, drugorzędna. */
  unit?: string;
  /** Ton wartości: paliwo = amber, czas lotu = green, reszta neutralna. */
  tone?: Tone;
  /** Wyróżnione tło (jak `.param-cell.amber-bg` w mockupach). */
  emphasis?: boolean;
  style?: ViewStyle;
}

export function Metric({ label, value, unit, tone = 'neutral', emphasis = false, style }: MetricProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const valueColor = tone === 'neutral' ? theme.colors.textPrimary : c.accent;

  return (
    <View
      style={[
        {
          flexGrow: 1,
          flexBasis: '30%',
          gap: 2,
          padding: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: emphasis ? c.border : theme.colors.border,
          backgroundColor: emphasis ? c.muted : theme.colors.surface,
        },
        style,
      ]}
    >
      <AppText variant="paramLabel" tone="muted">
        {label}
      </AppText>
      <View style={styles.valueRow}>
        <AppText variant="param" style={{ color: valueColor }}>
          {value}
        </AppText>
        {unit != null && (
          <AppText variant="label" tone="secondary">
            {unit}
          </AppText>
        )}
      </View>
    </View>
  );
}

/** Siatka metryk — zawija się sama, więc działa i dla 2, i dla 6 pozycji. */
export function MetricGrid({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return <View style={[styles.grid, { gap: theme.spacing.sm }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
