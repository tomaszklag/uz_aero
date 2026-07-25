/**
 * UZ Aero — StatusChip
 *
 * Uogólniony „pill" z mockupów: kropka + etykieta mono UPPERCASE w danym tonie.
 * Obsługuje wszystkie chipy poza wskaźnikiem łączności (ten ma własny `SyncChip`,
 * bo jest jedynym globalnym wskaźnikiem sieci i nie wolno go mnożyć):
 *   GROUND · SILNIK WYŁĄCZONY · RUNNING · PIC: KRZ od 07:10 · dane z cache · auto GPS
 *
 * `pulse` zapala kropkę na stałe (stan żywy) — animację dokładamy dopiero tam, gdzie
 * naprawdę pomaga; w kokpicie migotanie rozprasza.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export interface StatusChipProps {
  label: string;
  tone?: Tone;
  /** Kropka-wskaźnik po lewej (domyślnie tak). */
  dot?: boolean;
  /** Wypełnienie tłem tonu (domyślnie tak); false = sam kontur. */
  filled?: boolean;
  style?: ViewStyle;
}

export function StatusChip({
  label,
  tone = 'neutral',
  dot = true,
  filled = true,
  style,
}: StatusChipProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      accessibilityRole="text"
      style={[
        styles.chip,
        {
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.pill,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: filled ? c.muted : 'transparent',
        },
        style,
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
      <AppText variant="label" style={{ color: c.accent }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
