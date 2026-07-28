/**
 * UZ Aero — OptionInput (`.option-input` z mockupu 11)
 *
 * Wartość konfiguracyjna w „ubraniu" pola formularza: podniesiona powierzchnia,
 * obramowanie akcentem, mono. To NIE jest input — niczego się tu nie wpisuje;
 * wygląd pola mówi „to jest ustawienie", a brak kursora — „nie twoje".
 *
 * Ton: `green` = wartość obowiązuje (mockup 11), `amber` = wartość przyszła/oczekuje
 * (11a — arkusz jeszcze nie istnieje), `muted` = opcja nieaktywna.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';

export type OptionInputTone = 'green' | 'amber' | 'muted';

export interface OptionInputProps {
  value: string;
  tone?: OptionInputTone;
  style?: ViewStyle;
}

export function OptionInput({ value, tone = 'green', style }: OptionInputProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  const borderColor =
    tone === 'green' ? colors.greenBorder : tone === 'amber' ? colors.amberBorder : colors.border;

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.sm,
          opacity: tone === 'muted' ? 0.5 : 1,
        },
        style,
      ]}
    >
      <AppText
        variant="mono"
        style={[styles.value, { color: tone === 'muted' ? colors.textMuted : colors.textPrimary }]}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 7, paddingHorizontal: 10 },
  value: { fontSize: 11, letterSpacing: 0.5 },
});
