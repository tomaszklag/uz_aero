/**
 * UZ Aero — PillButton (`.btn-add` z mockupu 08)
 *
 * Mała akcja do nagłówka: wypełniona pigułka z ikoną i napisem mono. Rozmiar celowo
 * mniejszy niż `ActionButton` — w nagłówku pełnowymiarowy przycisk konkurowałby
 * z tytułem, a to akcja poboczna, nie główna ścieżka ekranu.
 *
 * Wysokość trzyma 34 px + `hitSlop` dociąga cel dotykowy do progu 44 px.
 */

import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tone';

export interface PillButtonProps {
  label: string;
  icon?: IconName;
  tone?: Tone;
  onPress: () => void;
  style?: ViewStyle;
}

export function PillButton({ label, icon, tone = 'green', onPress, style }: PillButtonProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        {
          borderRadius: theme.radius.sm,
          backgroundColor: c.accent,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {icon != null && <Icon name={icon} size={12} color={theme.colors.bg} />}
      <AppText
        variant="mono"
        style={[styles.label, { fontFamily: theme.fontFamily.monoBold, color: theme.colors.bg }]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 10, letterSpacing: 1 },
});
