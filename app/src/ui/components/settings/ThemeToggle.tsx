/**
 * UZ Aero - ThemeToggle: jednotapowa zmiana jasności w pasku kokpitu (issue #82).
 *
 * Stoi tam, gdzie do issue #82 stała zębatka - i to nie jest przypadek: ustawienia
 * mają odtąd JEDNO wejście, na „Mój dzień" (zgłoszenie z urządzenia). Z kokpitu nie
 * prowadzi już żadna droga bokiem, co domyka regułę stanu modalnego (`CLAUDE.md`) -
 * ustawienia były jej ostatnim wyjątkiem.
 *
 * Zmiana jasności zostaje w kokpicie, bo jest odpowiedzią na SŁOŃCE, a nie na chęć
 * konfigurowania aplikacji: pilot potrzebuje jej dokładnie wtedy, gdy nie może zejść
 * z ekranu, na którym pracuje. Ta sama zmiana co w ustawieniach - rekord per pilot,
 * wysyłka pętlą okazji, zero czekania na sieć.
 *
 * Ikona pokazuje SKUTEK tapnięcia, nie stan bieżący - uzasadnienie w `themeTarget.ts`.
 */

import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { Icon } from '../foundation/Icon';
import { nextThemeName, themeToggleIcon, themeToggleLabel } from './themeTarget';

export interface ThemeToggleProps {
  style?: ViewStyle;
}

export function ThemeToggle({ style }: ThemeToggleProps) {
  const { theme, themeName, setTheme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={themeToggleLabel(themeName)}
      onPress={() => setTheme(nextThemeName(themeName))}
      // Rysunek ma 30 px, więc cel dotykowy dobija do progu rękawic naddatkiem -
      // dokładnie tak, jak robiła to zębatka, w której miejsce wchodzi.
      hitSlop={10}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: 7,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Icon name={themeToggleIcon(themeName)} size={16} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
